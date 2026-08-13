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

### `private.settings` keys seeded so far
`setup_superadmin_email` (0002, self-deleting), `clinic_name`, `brand_hue` (0004).
`tagline` and `logo_url` are **writable but not seeded** — absent until first saved, which is
why the view leaves those two uncoalesced.

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
- Phase 2.2b: `/admin/lookups`. Phase 2.2c: `/admin/email`.

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
   audited with `action = 'settings_change'`.

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| Read/update own preferences | ✔ | ✔ | ✔ | ✔ |
| Read anyone else's preferences | — | — | — | — |
| Read `clinic_branding` | ✔ (also anon) | ✔ | ✔ | ✔ |
| **Edit branding** | — | — | — | **✔** |
| **Upload a clinic logo** | — | — | — | **✔** |
| Edit lookups | — | — | — | ✔ (Phase 2.2b) |
| Edit email settings | — | — | — | ✔ (Phase 2.2c) |

Proven live 39/39 before any UI existed: patient, staff, doctor and anon all get `forbidden`
from `update_clinic_branding`; hue 400, `http://` and `javascript:` logo URLs are rejected;
`clinic_branding` is unchanged after every rejection; only the four branding keys exist
afterwards (`setup_superadmin_email` is unreachable); and patient/staff cannot mint a signed
upload URL while superadmin can.

## Open Questions
- Move `theme`/`font_size` into the JWT via the access-token hook to remove the
  once-per-session read entirely? Elegant, but it means touching the verified Phase 0.2
  auth hook and a stale token would fight local changes for up to 15 minutes.
  **Deferred to Phase 2** — the current cost is already ~one read per session.
- `reduce_motion` is stored and honoured in CSS (`html[data-reduce-motion]`) but has no UI
  control yet; add it to AppearancePanel when the Phase 10 motivation toggles land.
