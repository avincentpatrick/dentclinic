# Module: Clinic Settings & Lookups

> Status: PARTIAL. Phase 1.1 shipped `user_preferences` and the `clinic_branding` view;
> **Phase 2.2a shipped the branding write path and its admin UI**. Lookups (2.2b) and email
> settings (2.2c) are still to come.

## Purpose
Holds everything a clinic configures about itself (branding, timezone, booking windows,
email provider, lookup lists) plus each user's personal display preferences. Phase 1.1
shipped only the two pieces the design system needs: the brand hue and per-user appearance.

## Data Owned

### `public.user_preferences` (Phase 1.1)
`user_id (= profiles.id)`, `theme` (`theme_pref`: light/dark/system),
`font_size` (`font_size_pref`: auto/standard/comfortable/large/xlarge),
`reduce_motion`, `gamification jsonb` (Phase 10 toggles), `created_at/updated_at`.

RLS own-row select/insert/update. **No DELETE policy and no DELETE grant** — "reset to
defaults" is an UPDATE. No row is auto-created at signup; writes are upserts, so
"no row" simply means "no DB preference yet".

**Two deliberate exceptions to the schema conventions in [00-overview.md](00-overview.md):**

1. **No `deleted_at`/`deleted_by`.** Soft delete exists to preserve facts referenced by
   audit/clinical/financial history, keep FKs valid, and power an Archive/Undo UI. This
   table satisfies none: no dependents, lifetime exactly equals its profile's, no archive
   affordance, and "reset" is semantically an UPDATE. Adding it would force every read to
   filter and would create an incoherent state ("this user's preferences are archived").
   The "no hard DELETE grants" half of the rule is kept via `revoke delete`.
2. **No audit trigger.** `private.audit_log` is append-only with 6+ year retention and is
   exempt from purge. A user toggling the theme six times would write six permanent rows
   with zero investigative value. The `settings_change` action code is for **clinic-wide**
   settings that affect other people; these affect only the actor. Revisit only if a
   column with compliance meaning is ever added here.

### `public.clinic_branding` view (Phase 1.1)
`clinic_name`, `tagline`, `logo_url`, `brand_hue` — projected from `private.settings` keys
of the same names, each `coalesce`d so a fresh install returns exactly one row.

`private` is revoked from `anon`/`authenticated`, so this definer-rights view is **the only
public door** into settings. It must therefore never `select *` — only these four
non-secret keys. Granted `select` to `anon, authenticated` because the public landing page
and (Phase 9) the PWA manifest need it **without a session**.

Read through [src/lib/branding.ts](../../src/lib/branding.ts) → `getBranding()`. **Rewritten in
2.2a**; the 5-minute module-level TTL memo it used to carry is gone and must not come back.

Three layers now, each earning its place:

1. React `cache()` — dedupes within one render pass (the root layout and `AppShell` both call it).
2. `unstable_cache` — persists **across requests and isolates**.
3. `updateTag(BRANDING_TAG)` in the save action — drops it, strongly consistently.

**Why the memo had to go.** A module variable lives in one isolate, `revalidatePath` knows
nothing about it, and Cloudflare runs many isolates — so a save in isolate A could not reach
isolate B, and the worst case was five minutes of stale hue with no way to shorten it. A short
memo in front of the new cache would shadow it and reintroduce exactly that in miniature.

**Three findings from 2.2a that constrain any future edit here:**

- **`unstable_cache` forbids `cookies()` inside a cache scope**, and `getBranding()` reached it
  through `@/lib/supabase/server`. Hence [src/lib/supabase/anon.ts](../../src/lib/supabase/anon.ts),
  a session-less client. That is very likely why the original implementation reached for a
  module memo in the first place. It is also simply correct: the view is granted to `anon`, and
  a cache entry shared by every visitor must not be produced with one visitor's JWT.
- **The cached function throws on failure, deliberately.** `unstable_cache` stores what the
  function *returns*, so returning the fallback on a transient DB blip would pin "DentClinic"
  and hue 195 into the cache for the whole window — the very bug the old memo avoided by not
  memoizing its error path. A rejected promise is not stored. Do not "simplify" it into a return.
- **`updateTag`, not `revalidateTag`.** In Next 16 `revalidateTag` takes a second argument and
  the recommended `"max"` profile is stale-while-revalidate — the next visitor would be served
  the *old* branding. `updateTag` expires immediately, so the next request waits for fresh data.
  That is the read-your-own-writes case, and it is the difference between meeting this
  increment's acceptance criterion and not.

**Why not `use cache`.** `unstable_cache` is marked in Next 16's docs as replaced by the
`use cache` directive — but that requires `cacheComponents: true`, which enables PPR by default,
switches navigation to React `<Activity>`, and **changes prefetching**. PROGRESS decision 8
rests on the current prefetch model, and re-deriving it is a phase of work, not a flag flip.
Next ships a maintained guide for this exact pre-Cache-Components model, so this is a supported
path. Revisit at Cache Components adoption (realistically Phase 9); migration is one function.

### `private.settings` write path (Phase 2.2a)

`public.update_clinic_branding(p_clinic_name, p_brand_hue, p_tagline, p_logo_url)` — migration
0010. `security definer`, `set search_path = ''`, superadmin-guarded via `public.jwt_role()`.
Before it, `private.settings` had **no write path of any kind**; Phase 1.1 changed the hue by
hand in the SQL editor.

**Why one RPC per settings group and not a generic `set_setting(key, value)`:** the allow-list
*is* the signature. There is no `key` parameter, so there is nothing to re-audit when a key is
added. That matters concretely — this table holds `setup_superadmin_email`, which
`private.handle_new_user()` reads to promote a matching signup to **superadmin**. A generic
setter is one allow-list mistake away from being a silent role-escalation primitive. It also
cannot type-check values, and four keys over four PostgREST calls is four transactions, so a
failure halfway leaves branding half-saved. 2.2c gets its own `update_email_settings(...)`.

Other decisions inside it:

- **Rejects an out-of-range hue rather than wrapping it.** `normalizeHue()` normalises on *read*
  because branding must never take the app down; a *write* that silently turned 400 into 40
  would hide the bug in whatever produced 400.
- **Replace, not patch.** The form always submits all four fields, so an absent value can only
  mean cleared. Clearing stores JSON `null` rather than deleting the row, so `updated_by` and
  `updated_at` survive. Note `to_jsonb(null::text)` is SQL NULL, not jsonb `'null'`, and `value`
  is `NOT NULL` — the naive version fails the first time somebody clears a tagline.
- **It is the first writer of `settings_change`** in the system; the CHECK constraint has
  allowed that action code since 0002 and nothing had used it. `entity` names the settings
  *group* (`clinic_branding`), not the table, because a key/value bag has no uuid row id to
  point at. The diff lives in `before`/`after`.
- `set_updated_at()` is attached to `private.settings` as a trigger rather than stamped in the
  RPC, so 2.2b and 2.2c writers cannot forget it. `updated_by` stays explicit — a trigger would
  write NULL over a real value on a seed or service-role write.

**Settings reads are not audited; settings writes are.** Configuration is not PHI, and
`private.audit_log` is append-only with 6+ year retention, so a row per settings page view
would be permanent noise. Same reasoning as the `user_preferences` audit exemption.

### Branding storage (Phase 2.2a)

Migration 0011 creates the public `branding` bucket: 1 MiB limit, PNG/JPEG/WebP only.

- **SVG is deliberately excluded.** An SVG in a public bucket executes script when opened
  directly at its storage-origin URL, and the only uploaders are superadmins — exactly the
  population whose compromise is worst.
- **No DELETE and no UPDATE policy.** Uploads are content-addressed with a fresh uuid path, so
  nothing is overwritten and INSERT is the whole write surface. "Remove the logo" is an UPDATE
  of the *setting* to null, not a file delete, which keeps the "no hard DELETE grants"
  convention intact without arguing about whether it extends to files.
- **The bytes never touch the Worker.** `createLogoUploadUrl` mints a signed upload URL and the
  browser PUTs straight to Supabase. Next's `serverActions.bodySizeLimit` defaults to 1 MB, and
  raising it would raise it for every action in the app. Minting requires INSERT on
  `storage.objects`, so the bucket policy gates the mint itself.
- **Accepted gap:** an upload followed by no save leaves an unreferenced object at an
  unguessable path (~1 MiB of a 1 GB free tier). Cleaning it up needs a DELETE policy, a
  referenced-objects query and a cron, for a handful of files a decade. Phase 5's pg_cron can
  sweep it if it ever matters.

### `public.appointment_types` (Phase 2.2b, migration 0012)

`name`, `description`, **`duration_units`**, **`pre_buffer_units`**, **`post_buffer_units`**,
`patient_bookable`, `color` (`appointment_color` enum), `sort_order`, plus timestamps and the
soft-delete pair.

**Units are counts of 10 minutes, never minutes.** Minutes exist in exactly one place in the
whole system — the `tenMinuteUnits` validator — and nothing else multiplies or divides by 10.

**How the buffers compose.** No formula existed anywhere in the repo before 2.2b; PLAN.md names
the columns and the EXCLUDE constraints but never how one becomes the other. This is it:

```
time_range = tstzrange(
  starts_at - pre_buffer_units * interval '10 minutes',
  starts_at + (duration_units + post_buffer_units) * interval '10 minutes',
  '[)')
```

`starts_at` is when the *patient* is seen; pre extends the block before (set-up, anaesthetic
onset), post after (turnover, disinfection). **`'[)'` is not optional** — two `'[]'` ranges
sharing an endpoint overlap, so back-to-back booking would be impossible.

Two consequences that constrain **Phase 3.2** rather than this table:

1. **A stored generated column may reference only its own row**, so `appointments.time_range`
   can never read `appointment_types`. 3.2 must **copy** the three unit counts onto the
   appointment at booking. That is also correct behaviour, not a workaround: re-timing "Crown
   Prep" from 90 to 100 minutes must not move appointments already booked — at best that fails
   an unrelated UPDATE against the EXCLUDE constraint, at worst it moves a patient's slot with
   nobody told. The type is a *template*; the appointment records what was agreed.
2. **`timestamptz + interval` is STABLE, not IMMUTABLE**, so the expression above may simply be
   rejected in a `generated always as (…) stored` column. Verify with
   `select provolatile from pg_proc where proname = 'timestamptz_pl_interval';` before writing
   3.2. Nothing in 2.2b depends on the answer.

`color` stores **palette keys, not colours** — an enum, so the generated TypeScript hands the
form a union for free, and a hex from a form can never reach a style attribute. **No colour
tokens ship in 2.2b**: the admin UI shows the name as text (which is what a screen reader gets
either way), and the tokens land in 3.2 with the calendar that first renders them.

RLS **splits reads by role**, unlike `providers`: `patient_bookable` is a *rule*, not a filter,
so it lives in the policy and a forgotten `.eq()` in a Phase 4 query cannot leak a type the
clinic does not offer for self-booking.

### `public.operatories` (Phase 2.2b, migration 0012)

`name`, `sort_order`, `default_provider_id → providers(id)`, `is_hygiene`. Staff-side read only:
a patient picks a service, a provider and a time; which chair they sit in is the clinic's
business. `providers` shipped early in 0005 precisely so this FK had something to point at.

### `public.lookup_categories` / `public.lookup_values` (Phase 2.2b, migration 0013)

**Four categories, not PLAN.md:68's five.** `services` is omitted deliberately: a service a
patient books **is** an `appointment_type` — chair time with a duration, buffers, a colour and a
bookable flag. A second list called "services" would carry a name and nothing else, and the two
would drift the first time a clinic renamed one. Anything priced but not booked is a `fee` or a
`product` line. Recorded in the same register as 0005's deliberate deviation from
`unique(email, dob)`.

**Categories are seed-only, structurally rather than by convention**: no INSERT grant, no INSERT
policy, and a BEFORE UPDATE trigger pinning `key`, `value_kind` and `deleted_at`. The application
reads values *by category key*, so a renamed or archived category is not a configuration choice —
it is an empty picker in front of someone trying to cancel an appointment, three phases from
here, with no error anywhere. The clinic may rename the **label** (white-label), reorder, and
edit every value.

**Money is a first-class `amount numeric(12,2)`, never the generic text column.** A fee parsed
out of text — or held as a float — in a billing path is a defect, not a shortcut. Plus a stable
`code`, so a clinic renaming "GCash" to "G-Cash" does not split a year of payment totals across
two report rows, and Phase 6's `procedures.code` has a join key.

**Where this shape runs out — flagged, not solved.** A real fee schedule needs effective dates, a
code system, and often per-tooth or per-surface variation. This table has one amount and no
history. It survives v1 **only** because `invoice_items.unit_fee` is a *copied* value
(PLAN.md:62), so re-pricing never rewrites an issued invoice — the same denormalisation argument
as appointment durations. When Phase 7 needs more, `fee` graduates to its own table and the
category is retired. **Do not grow `lookup_values` sideways to meet it.** See
[11-billing.md](11-billing.md).

**No `is_active` on any of these tables.** It duplicates `deleted_at` and contradicts the
precedent set for `providers` in 0005: *"two overlapping liveness concepts on one table is how a
scheduler starts booking ghosts."* Archived **is** "no longer offered".

`is_system` rows (`no_show`, `other`) are renameable but **not** archivable — a same-row CHECK,
because Phase 4.2 derives the no-show metric from a specific reason code and every picker needs
an "Other". `is_default` was considered and cut: it needs a partial unique index, a definer RPC
to swap atomically and a form field, for something Phase 7 gets free by preselecting the first
row by `sort_order`.

### `private.settings` keys seeded so far
`setup_superadmin_email` (0002, self-deleting), `clinic_name`, `brand_hue` (0004),
`currency` (0013).
`tagline` and `logo_url` are **writable but not seeded** — absent until first saved, which is
why the view leaves those two uncoalesced.

**`currency` forced a small correction in 0014.** 0013 seeded the key because an amount with no
currency is not money — and then nothing could read it: `private` is revoked from
`authenticated`, and `clinic_branding` projected only the four branding keys, so the fees screen
had no way to say what "1500" meant. A seeded setting with no reader is the "unused column
somebody later assumes is maintained" smell, and a hardcoded `"PHP"` in the UI would have been
two sources of truth. 0014 adds it to the view instead: `clinic_branding` is already the
sanctioned public door for non-secret display settings, and the rule that matters — *never
`select *`, only named non-secret keys* — is kept. The view's name is now slightly narrower than
its contents; renaming it would touch every branding call site and the Phase 9 manifest for no
behavioural gain, so the name stays and this note is the record.

## Screens (routes)
- `/settings/appearance` — theme + text size ([page](../../src/app/settings/appearance/page.tsx)).
  **Public by design**: no PHI, and a guest partway through booking must be able to
  enlarge the text. Carries `roles: "public"` in `ROUTE_RULES`
  ([src/lib/roles.ts](../../src/lib/roles.ts)); longest-prefix-wins keeps it public under a
  future authenticated `/settings`.
- `AppearanceMenu` popover — mounted in `RoleHeader`, the landing page, and `/login`.
- **`/admin`** (2.2a) — the superadmin hub ([page](../../src/app/(admin)/admin/page.tsx),
  [AdminSectionGrid](../design-system/04-components/admin-hub.md)). `src/lib/shell/nav.ts` has
  linked here since Phase 1.2 from the sidebar, the More sheet and ⌘K, while the route did not
  exist — every superadmin who clicked "Clinic settings" got a 404 until 2.2a.
- **`/admin/branding`** (2.2a) — [page](../../src/app/(admin)/admin/branding/page.tsx),
  [BrandingForm](../design-system/04-components/branding-form.md). Seeded from
  `getBrandingFresh()`, never the cached read: a form seeded from a shared cache entry writes
  stale values back over a colleague's save.
- **`/admin/lookups`** (2.2b) — a hub with child routes:
  `/appointment-types`, `/operatories`, and a dynamic `/[category]`, each with `/new` and
  `/[id]`. Four mechanical reasons for children rather than one page of sections: `SearchField`
  re-emits every *other* search param as a hidden input, so two lists on one page means typing in
  one box carries the other's cursor; `SearchField` takes a single `action` path; `DataTable`'s
  pagination patches only `page`, so two paginators fight over it; and a dynamic `[category]`
  means a category seeded in a future migration gets an admin screen with **no route work**.
  There is deliberately no separate detail page — a lookup row has six fields, no history and no
  read audit, so it would be a click for nothing.
- `/admin/email` — **deferred with 2.2c** (PROGRESS decision 24). The Admin hub already renders
  its card as non-clickable, so nothing links to a route that does not exist.

**No ROUTE_RULES change was needed for either page** — `{ prefix: "/admin", roles: ["superadmin"] }`
already covers everything beneath it, and `npm run check:routes` proves that rather than
assuming it. Non-superadmins are redirected to their own home by middleware, never 404'd, so
the route table stays non-enumerable.

## Rules & Invariants

1. **Cookies are the runtime source of truth**; the DB is the cross-device mirror.
   Cookies give SSR-correct first paint with no flash — the DB cannot, because reading it
   before first byte would put a cross-region round-trip on every request.
2. **DB wins on login, exactly once per browser session.** Middleware merges
   `user_preferences` into the cookies when `dc_prefsync` does not match the current user
   id, writing onto `request.cookies` so *this* render already uses them. `dc_prefsync` is
   a session cookie and is set even when no row exists, so users who never opened settings
   are not re-queried. Cost: one read per session per device, not per request.
3. Preference cookies (`dc_theme`, `dc_font`, `dc_prefsync`) are **`HttpOnly`** — the
   client never reads them; current values arrive as props and all writes go through the
   `savePreferences` server action. `SameSite=Lax`, not `Strict`, because patients arrive
   via tokenized email links and `Strict` would withhold the cookie on that entry.
4. `brand_hue` is **normalised into [0,360) on read** and **rejected out of range on write**.
   The pairing is deliberate, not redundant: the value is interpolated into an inline `style`
   attribute on `<html>`, so the read path must never fail; but a write that silently wrapped
   400 to 40 would hide the bug in whatever produced 400. `normalizeHue` now lives in
   [branding-schema.ts](../../src/lib/settings/branding-schema.ts) — the server-free half of
   the module, because `@/lib/branding` pulls `next/headers` transitively and so cannot be
   imported by a Client Component.
5. Branding must never take the app down — `getBranding()` swallows errors and returns
   documented fallbacks (`DentClinic`, hue 195).
6. Changing `brand_hue` re-brands the entire app **with no rebuild and no CSS
   regeneration**. Verified live 2026-08-12 (flipped to 25 and back by hand, no deploy) and
   again in 2.2a **from the admin form alone**.
7. **Every hue in 0–359 is already proven**, so the branding form warns about none of them.
   `scripts/check-contrast.mjs` sweeps all 360 hues × both themes × every declared pair on
   each `npm run check`, with a pessimistic luminance model. A "safe hues" list in the UI
   would be an unproven second opinion about something already proven.
8. **Clinic-wide settings are configuration, not PHI**: reads are unaudited, writes are
   audited with `action = 'settings_change'`. The same holds for lookups — **no `logRead` on any
   `/admin/lookups` screen**. `audit_row()` already captures every write with a before/after,
   and a read row per admin page view would be permanent noise in an append-only table with 6+
   year retention.
9. **Durations are entered in minutes and stored in units, and a non-multiple of 10 is
   REJECTED, never rounded.** Silently turning 45 into 50 leaves a clinic with a schedule five
   minutes wrong on every appointment of that type and nothing to tell them — the same reasoning
   that makes the duplicate-patient check a warning rather than a silent merge. The message names
   the two nearest valid values so the user does not have to do the arithmetic.
10. **No `loading.tsx` under `/admin/lookups`** — but for a *different* reason than `/patients`.
    That route's argument is the read audit, and it does not transfer, since lookups are not PHI
    and are not read-audited. The reason here is simply that a `loading.tsx` makes the route
    prefetchable, so hovering nine rows fires nine RSC requests, each running middleware and
    `getClaims()`, to render a list that comes back in one query. **Do not assume the audit
    argument applies here** — this note exists so the next reader does not.
11. **`params` must carry `q`, `sort`, `dir` and `archived`.** `DataTable`'s pagination patches
    only `page`, so anything missing from `lookupsParams()` is silently dropped the moment
    someone presses Next. It is the single most likely regression on these screens and has its
    own live verification step.

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| Read/update own preferences | ✔ | ✔ | ✔ | ✔ |
| Read anyone else's preferences | — | — | — | — |
| Read `clinic_branding` | ✔ (also anon) | ✔ | ✔ | ✔ |
| **Edit branding** | — | — | — | **✔** |
| **Upload a clinic logo** | — | — | — | **✔** |
| **Read appointment types** | ✔ (bookable only) | ✔ | ✔ | ✔ |
| **Read operatories** | — | ✔ | ✔ | ✔ |
| **Read lookup values** | ✔ | ✔ | ✔ | ✔ |
| **Edit any lookup** | — | — | — | **✔** |
| **Archive a lookup** | — | — | — | **✔** (not built-in rows) |
| Hard delete any lookup | — | — | — | — |
| Edit email settings | — | — | — | ✔ (Phase 2.2c) |

Proven live 39/39 before any UI existed: patient, staff, doctor and anon all get `forbidden`
from `update_clinic_branding`; hue 400, `http://` and `javascript:` logo URLs are rejected;
`clinic_branding` is unchanged after every rejection; only the four branding keys exist
afterwards (`setup_superadmin_email` is unreachable); and patient/staff cannot mint a signed
upload URL while superadmin can.

Lookups proven live 47/47 before any UI existed: a patient sees only the 5 bookable types and
zero operatories; staff see all 9 and both rooms but cannot write either; `delete` is ungranted
even for superadmin; a category cannot be archived or re-keyed but *can* be renamed; a built-in
value cannot be archived but can be renamed; a fee with no amount and a label with an amount are
both refused; a duplicate live name is rejected and the name frees up once archived; and
`numeric(12,2)` round-trips exactly at the top of its range.

## Open Questions
- **`providers` has no admin screen**, so `operatories.default_provider_id` cannot be set from
  the UI on a fresh install — the select is hidden rather than rendered empty. It arrives with
  the scheduling module. Same situation `03-patients.md` records for `primary_provider_id`.
- **Phase 4 guest booking needs a public door.** `/book` is anonymous and `anon` holds no grant
  on `appointment_types`, so guest booking will need a definer-rights `bookable_services` view
  granted to `anon`, exactly the way `clinic_branding` is the only public door into settings. Not
  built in 2.2b: an anon-readable view with no reader is surface for nothing.
- Move `theme`/`font_size` into the JWT via the access-token hook to remove the
  once-per-session read entirely? Elegant, but it means touching the verified Phase 0.2
  auth hook and a stale token would fight local changes for up to 15 minutes.
  **Deferred to Phase 2** — the current cost is already ~one read per session.
- `reduce_motion` is stored and honoured in CSS (`html[data-reduce-motion]`) but has no UI
  control yet; add it to AppearancePanel when the Phase 10 motivation toggles land.
