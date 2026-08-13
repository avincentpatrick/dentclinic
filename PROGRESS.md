# PROGRESS

Legend: ⬜ not started · 🔵 in progress · ✅ done · ⛔ blocked · 🔁 rework

## Snapshot

- **Current phase:** 3 — Scheduling engine (**3.1a ✅ data layer + verification** → next: **3.1b, the editors**)
  - Phase 2 closed: 2.0 ✅ · 2.1a–d ✅ · 2.2a ✅ · 2.2b ✅ · **2.2c ⛔ deferred** · 2.2d ✅ · 2.2e closed by the 2.2d log entry
- **Deployed URL:** https://dentclinic.dentclinic-appointment-and-recording-system.workers.dev
- **Supabase:** dentclinic `csslnpmjprfuzofomtda` (ap-southeast-1, dedicated account) — migrations **0001–0016** applied
- **Repo:** github.com/avincentpatrick/dentclinic — **PUBLIC since 2026-08-13** (to unblock Actions; see 17-ops.md for what that changed)
- **CI:** green end to end. Worker **1.31 MB** gzip (43.6% of 3 MB). 32 a11y tests + **42 authenticated-route tests** (`npm run test:authed`, opt-in), 32 routes. Committed DB verifications: `0015-feedback.sql` (54) and **`0016-scheduling.sql` (135)**, psql, re-runnable.
- **Brand hue:** 195 (teal-cyan), live from `clinic_branding` — now editable **from `/admin/branding`**, proven on the deployed URL
- **Deferred:** **2.2c email** — no free sending provider reachable and no domain (decisions 23–24). Phase 5 reminders depend on it; nothing before then does.
- **Blocked on user:** **Cloudflare API token needs `D1 Edit`** (gates the branding tag cache only — see 17-ops.md; the app is correct without it, just uncached). Re-checked 2026-08-14 with `npx wrangler d1 list`: still `Authentication error [code: 10000]`.
- **Last session:** 2026-08-14

## Phase 0 — Foundation & ops spine

- [x] 0.1 Scaffold + Cloudflare deploy gate ✅
  - [x] create-next-app (TS, Tailwind v4, App Router, src dir) + shadcn/ui (Radix, Nova)
  - [x] OpenNext build + **deployed to Workers** — gzip ~957 KB (limit 3 MB) → hosting bet CONFIRMED
  - [x] Docs skeleton (AGENTS.md, PROGRESS.md, PLAN.md, 17 module stubs, design-system, prompts)
  - [x] git + private GitHub repo + CI workflow + secrets/vars
- [x] 0.2 Auth + roles + soft-delete/audit spine ✅
  - [x] Migrations 0001–0003: extensions, private schema, profiles, signup trigger, access-token hook, append-only audit_log, RLS baseline
  - [x] Hook registered via Management API; site_url + redirect allow-list set
  - [x] `/login` (email OTP), `/auth/confirm` (magic link), middleware role gating, role homes `/home` `/today` `/dashboard`
  - [x] **Verified live:** 4 roles → correct `user_role` claim; deactivated user blocked (`account_deactivated`); audit_log has 5 creates + 4 updates; `/home` redirects to `/login` on deployed URL
- [x] 0.3 Backups + restore drill ✅ **(fully closed 2026-08-13)**
  - [x] Nightly encrypted pg_dump workflow (session pooler; aws-0 host — db host is IPv6-only)
  - [x] **Restore drill PASS** (see 17-ops.md log): full wipe + restore into local stack; auth.users/identities/profiles/audit all intact; dump includes auth+storage schemas
  - [x] **First real backup-workflow run SUCCEEDED** — run 31665117218, artifact `db-backup-…` 17,376 B, 30-day retention. Unblocked by making the repo public (free Actions minutes) rather than by fixing billing.
  - [x] Encryption hardened for the public repo: PBKDF2 **600,000** iterations (was the 10,000 default). Passphrase verified as 32 chars / ~191 bits. **Decision recorded in 17-ops.md** — public artifacts are acceptable *only* while that passphrase stays randomly generated.
- Pitfalls closed: **P9 P10 P22 P23**

## Phase 1 — Design system core & app shell

- [x] 1.1 Token system + preferences ✅
  - [x] Migration 0004: `user_preferences` (+ `theme_pref`/`font_size_pref` enums, own-row RLS, no DELETE grant) and the public `clinic_branding` view over `private.settings`
  - [x] OKLCH token layer: one `--brand-hue` × `.dark`, two ladders (`.dark` rewrites lightness + `--c-tint` only), 13 fixed-hue semantic tokens as solid/soft/on-soft triplets
  - [x] 4 font steps via bare `[data-font-size]` selector + the 5-valued `auto` preference (patient surfaces → 112.5%, explicit choice always wins)
  - [x] Cookie + DB persistence; "DB wins on login" reconciled once per browser session in middleware
  - [x] `AppearanceProvider` / `AppearancePanel` / `AppearanceMenu` + public `/settings/appearance`
  - [x] `scripts/check-contrast.mjs` — 52 pairs × 360 hues × 2 themes, gamut + `.dark`/system drift assertions, culori selftest
  - [x] **Verified live:** theme/font in the initial HTML (no script, works with JS off); `/book` auto→comfortable while explicit `standard` overrides it; hue flipped to 25 and back **by a DB update alone, no deploy**; `/home` still redirects signed-out (0.2 regression check)
  - Bugs fixed on the way: `--font-sans` was self-referential (app had been rendering in the browser default font, not Geist); middleware discarded rotated Supabase auth cookies on all three redirect paths; eslint was linting `.open-next/` build output
- [x] 1.2 Shell + components + gallery + a11y CI ✅
  - [x] **Fail-closed** `ROUTE_RULES`/`isAllowed()` (was `return true` — every future route was public by default) + `scripts/check-routes.mjs` so an unregistered route fails CI
  - [x] `AppShell` (server) over three route-group layouts; `(staff)` reads the real claim so doctors get Availability and front desk doesn't
  - [x] BottomTabBar (3 role variants, FAB, safe-area) + AppSidebar (256/56px rail, cookie state) + MoreSheet; **CSS-only responsive switch**, no JS breakpoint hook
  - [x] PageHeader · StatusChip/ClinicalChip (label+icon derived from the key, so a colour-only chip is unrepresentable) · EmptyState (3 registers) · UserChip + sibling skeleton behind Suspense
  - [x] IdleTimeoutGuard (15/30 min, wall-clock not timer-based, BroadcastChannel, no storage) + `flushDrafts` seam with zero registrants
  - [x] CommandK navigate-only, lazy-loaded, with `SECTION_ORDER`/`SearchProvider`/debounce seam for 8.2
  - [x] `/design-system` gallery + registry + `?matrix=all` (every specimen × 2 themes × 4 font steps) + `check:docs` two-way sync guard
  - [x] Playwright + axe: **24 tests green** (desktop + Pixel 7) — full matrix, 4 public routes, dark, xlarge, keyboard, 44px targets
  - [x] **Verified live:** `/design-system` 404s for anonymous (bypass unreachable in production, even with a forged header) and renders 10 sections / 97 panes / 48 dark panes for superadmin; all authed routes still redirect to `/login`
  - Bugs caught by the new gates: shadcn's `destructive` button was **4.21:1** (`text-destructive` on a 10% tint of itself) — axe found it, the palette sweep structurally could not; and nested `.dark` panes rendered **light** because custom properties resolve where they're declared, so the token block had to become `:root, .dark` — without that fix the matrix was silently testing light mode twice
  - Worker: **1.17 MB gzip** of the 3 MB limit (39%)
- Pitfalls closed: **P9 P10 P22 P23**

### Deferred from Phase 1 (decided, do not re-litigate)
`SearchSheet` + data-bearing search providers + `/api/search` → 8.2 · `InstallPrompt`/`OfflineBanner` → 9 (PWA-coupled; a trim from PLAN.md:101's shell list) · `DataTable`/`AppointmentCard`/`SoftDeleteMenu`/`PatientHeader` → 2/3/6 · `sonner` toasts → 2 · `deriveStatus()` implementation → 3 · draft-save behaviour → 6 · branding admin UI → 2.2 · booking concurrency test → 3.

## Phase 2 — Patients, lookups, settings, email foundation

- [x] 2.0 Gate hardening + data layer ✅
  - [x] `check-routes.mjs` read only `AppRoutes`, never `AppRouteHandlerRoutes` — and middleware does NOT exclude `/api`, so a new route handler would 302 to `/login` in production **with CI green**. Phase 5's pg_net-driven `/api/jobs/send` would have hit exactly this. Proven against a synthetic uncovered handler.
  - [x] `/profile` lived under `(patient)` (layout hardcodes `role="patient"`) while ROUTE_RULES grants it to ALL_ROLES → superadmins got patient tabs. New `(shared)` group reads the claim. It also sat in `PATIENT_SURFACES`, enlarging text for every non-patient on `auto` → now `SHARED_SURFACES` + an `x-role` header that is **presentation input only**.
  - [x] CI fixed end to end: Node 24 on both workflows (npm major mismatch), `@emnapi` overrides, and a **Linux-generated lock** — npm resolves platform binaries only for the host, so the Windows lock had 1 `@next/swc` variant where ubuntu needs 8. `npm run lock:refresh` regenerates in `node:24-bookworm` and asserts the result is not pruned.
  - [x] `ci.yml` ran typecheck **before** build, but `LayoutProps`/`PageProps` are generated globals → fails on any cold runner. `typecheck` now runs `next typegen` first (~2s), which also emits `routes.d.ts`, so route coverage moved into the fast `check` gate.
  - [x] Migrations **0005–0007**: `providers`, `patients` (first PHI table), `find_patient_duplicates`, `claim_or_create_patient`, `update_own_patient`. **Verified 21/21 live.**
  - [x] Docs: `03-patients.md`, `16-feedback.md` filled; PLAN.md migration order corrected to reality.
- [x] 2.1a Form foundation ✅ — `ActionState` 5-state union, hand-rolled validation, `Field` / `SubmitButton` / `InlineAlert` + docs + gallery
- [x] 2.1b List primitives ✅ — `DataTable` (+skeleton), `SearchField`, `SoftDeleteMenu` + docs + gallery
- [x] 2.1c Patient roster page + `actions/patients.ts` + sonner ✅
  - [x] `/patients` roster wired to Supabase — server-side `q`/`sort`/`dir`/`page`/`archived` in searchParams, zero client JS beyond SearchField/SoftDeleteMenu/the toast bridge
  - [x] `actions/patients.ts` — create/update/archive/restore, every one re-checking the role in-action; first `revalidatePath` in the repo
  - [x] `RecordChip` (archived/provisional) as a third vocabulary beside StatusChip/ClinicalChip
  - [x] sonner + `Toaster` in AppShell + `ToastOnMount` searchParam handshake; Undo also reachable from the archived row (WCAG 2.2.1)
  - [x] Read audit live: `log_read` had zero call sites, now one per roster render and one per detail/edit view
- [x] 2.1d Patient create / detail / edit + `DuplicateWarning` + `/register` ✅
  - [x] `/patients/new`, `/patients/[id]`, `/patients/[id]/edit` on a shared `PatientForm`
  - [x] `DuplicateWarning` — staff and self shapes, both proven in the gallery
  - [x] `/register` — two steps, one write, `claim_or_create_patient`; added to ROUTE_RULES (patient-only) and PATIENT_SURFACES
  - [x] Migrations **0008** (phone-only `match_reason`) and **0009** (`log_read` id defaults)
  - [x] Generated `database.types.ts` threaded through both clients + middleware
- [x] 2.2a Admin hub + branding ✅
  - [x] Migrations **0010** (`update_clinic_branding` + `private.settings` updated_at trigger) and **0011** (`branding` storage bucket + `storage.objects` policies) — `private.settings` had **no write path of any kind** before this; Phase 1.1 changed the hue by hand in the SQL editor
  - [x] **Verified 39/39 before any UI existed** — patient/staff/doctor/anon all get `forbidden`; hue 400, `http://` and `javascript:` logo URLs rejected; `clinic_branding` unchanged after every rejection; only the four branding keys reachable; patient/staff cannot mint a signed upload URL
  - [x] `/admin` hub — the sidebar, More sheet and ⌘K have linked here since Phase 1.2 to a route that **404'd**. `AdminSectionGrid` makes an unbuilt section unrepresentable as a link
  - [x] `/admin/branding` + `BrandingForm` + `actions/settings.ts`; `getSuperadminActor()`; `httpsUrl` validator; `Field` gains a `file` variant
  - [x] Logo upload **straight to Supabase Storage** via `createSignedUploadUrl` — bytes never touch the Worker, so Next's 1 MB action body limit is bypassed rather than raised. Proven live: the PUT goes to `*.supabase.co`, not the Worker
  - [x] `branding.ts` rewritten onto `unstable_cache` + `updateTag`; the 5-minute module memo is gone. Logo now renders on the landing page and in the sidebar; `metadata` became `generateMetadata` so a rename reaches the browser tab
  - [x] Gallery **`layouts` group** (30 → 32 a11y tests) — admin screens now have axe coverage; the false "since Phase 2" claim in `06-accessibility.md` corrected
  - [x] **Acceptance demonstrated on the deployed URL, 18/18 + 12/12**: name and hue changed *from the form alone*, seen by a signed-out visitor in a fresh context — including with **JavaScript disabled**
- [x] 2.2b Lookups + `/profile` ✅
  - [x] Migrations **0012** (`appointment_types` + `operatories`, with the buffer→`time_range` formula written down for the first time) and **0013** (`lookup_categories` + `lookup_values`, **four** categories — `services` dropped), plus **0014** exposing `currency` through `clinic_branding`
  - [x] **Verified 47/47 before any UI existed** — per-role RLS, every guard, both partial uniques, `numeric(12,2)` exactness, and the database left at its seeded state
  - [x] `/admin/lookups` hub + `/appointment-types`, `/operatories` and a dynamic `/[category]`, each with `/new` and `/[id]` — **11 new routes, zero ROUTE_RULES changes**
  - [x] `src/lib/list/query.ts` extracted from `patients/query.ts` (with re-exports, so no `/patients` call site changed) + `src/lib/forms/return-to.ts`; new `tenMinuteUnits` and `money` validators; `Field` gains `step`
  - [x] **`/profile` wired to `update_own_patient`** — closing decision 10, the last RPC with no call site — plus a Settings sidebar entry for staff/doctor/superadmin
  - [x] Three more `layouts` gallery entries (lookups list, lookups form, profile); 32 a11y tests still green
  - [x] **Live acceptance 49/49** on the deployed URL, including the `params` trap, the 10-minute rejection, archive/restore, built-in rows, currency formatting, and an injected `email` field failing to change `patients.email`
- [ ] ⛔ **2.2c email + DNS panel — DEFERRED** (see decision 24). Not started; no partial work to unpick.
- [x] 2.2d feedback + the authenticated-route fixture ✅
  - [x] **The auth fixture 2.2b's six 500s argued for** — service-role `generateLink` replayed at `/auth/confirm`, so the APP mints the session and nothing forges a cookie. Superadmin + patient storage states, one real id resolved per dynamic route, **42 checks**: HTTP 200 off the response object, exactly one non-empty `<h1>`, axe, and the denial direction (patient → `/home`, superadmin → `/dashboard`)
  - [x] **Every new assertion negative-tested before being trusted** — bogus route (404 caught by the status check), inverted denial, emptied storageState, and *the decision-22 render-prop bug deliberately reintroduced*: build green, fixture red with `Functions cannot be passed directly to Client Components` → 500
  - [x] **2.2b re-verified through it**: all 11 lookups routes + `/admin` + `/admin/branding` + `/profile` render 200 with a heading and pass axe
  - [x] Migration **0015** `feedback_reports` + 3 enums + a BEFORE guard + a **narrow** status/`deleted_at` audit trigger + RLS. **Verified 54/54 before any UI existed**, and this time the verification is **committed** (`supabase/verify/0015-feedback.sql`)
  - [x] `/feedback` (all roles, in `(shared)`), `/admin/feedback` + `/admin/feedback/[id]` triage; `FeedbackStatusChip`/`FeedbackSeverityChip` reusing already-swept tokens; two `layouts` gallery entries
  - [x] `check:routes` extended to **nav.ts hrefs** and to the `ROUTE_PATTERNS`↔`AppRoutes` set-equality; all four arms negative-tested. It found `/availability` linked from the doctor sidebar with no page behind it — live, and the same bug as `/admin` in 2.2a
  - [x] **Live acceptance 27/27 on the deployed URL** — filed from a real patient chart, stored as `/patients/[id]`, triaged new → in_progress, exactly one audit row carrying only the status keys, no email anywhere
- [x] 2.2e close ✅ — closed by the 2026-08-14 (a) session-log entry; no separate increment

### Decisions in Phase 2 (do not re-litigate)

1. **`unique(email, dob)` → a NON-unique index.** Deviates from PLAN.md:47. `merged_into_id` and the deferred merge queue both presuppose duplicates can exist; twins sharing a parent's email are real; and a 23505 at the front desk is unrecoverable. The warning is server-side instead.
2. **`DataTable` is not TanStack.** Server-side sort/filter/page removes its row models entirely; it would cost ~14 KB in *both* bundles and force a Client Component. The roster ships **zero client JS**.
3. **`useActionState` forms require JavaScript.** Measured on a production build with a plain-action control on the same page: plain emits `$ACTION_ID_*` and works; `useActionState` emits `$ACTION_REF_n`, a client-resolved reference → `Failed to find Server Action`. Writes need JS; **reads do not** (roster/search/sort/pagination are links). The duplicate check cannot be evaded by disabling JS — without JS there is no submit.
4. **Secrets live in platform secret stores**, never Postgres. `BREVO_API_KEY` via `wrangler secret put` read as `process.env`; SMTP password via `supabase secrets set`. A DB-stored key would ride in every nightly backup artifact — which is now public.
5. **Repo is public.** Schema/RLS being visible does not weaken RLS. Consequences handled: test credentials rotated, backup KDF hardened.
6. **a11y matrix is chunked by `?group=`.** Past ~16 components the single matrix page exceeded what axe can analyse in one pass.
7. **The duplicate ack rides on the proceed button's `name`/`value`, not a hidden input.** `forms.md` specified a hidden input and that would have disarmed the check: a hidden input is submitted by *every* button, so the primary "Create patient" would have carried the ack and skipped the re-check. A submit button's name/value reaches FormData only when that button submitted, so the primary now carries none and always re-checks. Doc corrected.
8. **No `loading.tsx` under `/patients`.** Without Cache Components a dynamic route is not prefetched *at all* unless it has a loading boundary. Adding one would make 25 row links prefetchable and would rest the read-audit's correctness on a framework-internal promise that a prefetch never renders a page body. Streaming happens inside `page.tsx` via Suspense instead, and `log-read.ts` ignores `next-router-prefetch` as belt-and-braces.
9. **Build and test parallelism scale with free memory, not core count.** `experimental.memoryBasedWorkersCount` in next.config.ts and a memory-derived `workers` in playwright.config.ts. See the session log.
10. **`/profile` is deferred**, so `update_own_patient` still has no call site. Scheduled with 2.2, not forgotten.
    **CLOSED in 2.2b** — `/profile` ships with `src/app/actions/profile.ts` as the call site. Amended rather than deleted: this list is "do not re-litigate", and deleting an entry loses the trail of why it was open.
11. **One RPC per settings group, never a generic `set_setting(key, value)`.** The allow-list *is* the signature: with no `key` parameter there is nothing to re-audit when a key is added. This matters concretely — `private.settings` holds `setup_superadmin_email`, which `handle_new_user()` reads to promote a signup to **superadmin**, so a generic setter is one allow-list mistake away from being a silent role-escalation primitive. It also cannot type-check values, and four keys over four PostgREST calls is four transactions. 2.2c gets its own `update_email_settings(...)`.
12. **`updateTag`, not `revalidateTag`.** Next 16 made `revalidateTag` take a second argument, and the recommended `"max"` profile is stale-while-revalidate — the next visitor would be served the *old* branding. `updateTag` expires immediately so the next request waits for fresh data. That difference is the acceptance criterion.
13. **`cacheComponents` stays off.** `unstable_cache` is deprecated in favour of `use cache`, which requires that flag — but it enables PPR, switches navigation to `<Activity>`, and **changes prefetching**, which is what decision 8 rests on. It would also break the build immediately: under Cache Components, uncached dynamic access must sit inside `<Suspense>`, and the root layout calls `cookies()` and `headers()` at its top. Next ships a maintained guide for the pre-Cache-Components model, so this is a supported path, not a holdout. Revisit at Phase 9; migration is one function.
14. **KV and D1 are both-or-neither.** OpenNext defaults both cache overrides to `"dummy"`, so with neither wired `unstable_cache` never persists and branding is read per request — slower but always correct. Wiring KV *alone* would persist entries with nothing able to invalidate them, turning a 5-minute staleness window into a 1-hour one. The KV **tag** cache is disqualified by its own source comment (experimental, up to 60s to reflect a write) — worse than what it would replace.
15. **The logo is a real Storage upload, not a URL field**, and the bytes never pass through the Worker. SVG is excluded from the MIME allow-list because it executes script at its public storage URL and the only uploaders are superadmins. The bucket has **no DELETE and no UPDATE policy**: uploads are content-addressed, and "remove the logo" is an UPDATE of the setting to null.
16. **Four lookup categories, not PLAN's five — `services` is `appointment_types`.** A second list called "services" would hold a name and nothing else, and the two would drift the first time a clinic renamed one. Anything priced but not booked is a `fee` or `product` line.
17. **Money is `numeric(12,2)`, never the generic text column**, and the `fee` category is knowingly incomplete — no effective dates, no per-surface variation. It survives v1 only because `invoice_items.unit_fee` is copied, so re-pricing never rewrites an issued invoice. When Phase 7 needs more, `fee` graduates to its own table; `11-billing.md` carries the clause.
18. **Categories are seed-only structurally** — no INSERT grant, no INSERT policy, and a trigger pinning `key`/`value_kind`/`deleted_at`. The app reads values *by category key*, so an archived category is an empty picker three phases later, not a setting.
19. **Durations: minutes in, units stored, non-multiples REJECTED not rounded.** A schedule silently five minutes wrong per appointment is worse than a form error. One converter in the whole system.
20. **`/profile`'s guard is `getActor()`, not `requirePatient()`.** The route is granted to ALL_ROLES and the RPC keys on `auth.uid()`; a patient-only guard would break it for the three roles the route table deliberately grants it to.
21. **`/profile` IS read-audited, `/admin/lookups` is not.** The deciding case for the former is staff-side: a superadmin whose login is linked to a patients row reads a real chart there. Configuration is not PHI.
22. **A render prop cannot cross the Server→Client boundary.** Only Server Actions may be passed as function props. `LookupForm`'s `fields` render prop 500'd every create and edit route until thin client wrappers were added, and **no gate caught it** — typecheck, lint and axe all passed, because no authenticated route is exercised by the suite. That is the strongest argument yet for the auth fixture tracked in `06-accessibility.md`.
23. **No custom domain during development — the project stays at $0.** `workers.dev` cannot hold DNS records, so SPF/DKIM/DMARC cannot be configured and DMARC alignment cannot pass. A free subdomain is **not** an acceptable substitute — those providers either allow a single TXT record (enough for an ACME challenge, not for three), require slow manual approval and forbid commercial use, or are abandoned free TLDs that mail providers filter on sight, which would make deliverability *worse* than having no domain at all. **Trigger to revisit: before any real patient receives an email.** ~$10/yr, and it is the only cost in the entire stack — Workers, KV, D1, Supabase and Actions are all free tier.
24. **2.2c (email) is DEFERRED WHOLE, and the phase proceeds without it.** Brevo's signup would not yield its free plan in practice, and decision 23 rules out the domain that every alternative's free tier wants before it will send to arbitrary recipients. Rather than build a send path that cannot be demonstrated end to end, the increment is skipped entirely — **nothing was started, so there is no half-built surface to unpick.** This supersedes the earlier expectation that 2.2c would ship with only `mail-tester ≥9/10` outstanding.

    What this does **not** block, which is why deferring is cheap: **2.2d feedback is email-free by design.** `16-feedback.md` rule 4 is explicit — *"Filing never sends email, and must never be able to"* — because filing a bug report must not fail at exactly the moment email is broken. The superadmin gets a `status='new'` count badge instead, and a pull notification cannot fail.

    What it **does** block: Phase 5's reminder pipeline (pg_cron → pg_net → `/api/jobs/send` → Brevo), and Supabase Auth's own mail stays on the built-in mailer's ~2/hr limit until a provider exists. **Trigger to revisit: before Phase 5, or as soon as a domain exists** — the two unblock together, since a verified domain is what most providers' free tiers actually want.

25. **`check:routes` now also asserts every `ADMIN_SECTIONS` href resolves to a real route.** 2.2b shipped `/admin/lookups` working but **unlinked** — the hub still described it as "Arrives in Phase 2.2b" with no href, so the only way in was typing the URL. `AdminSectionGrid` makes an *unbuilt* section unrepresentable as a link, but nothing checked the other direction. **The acceptance assertion that should have caught it was `(await page.goto(…)) && true` — always truthy, incapable of failing.** A check that cannot fail is worse than no check, because it reads as coverage in the results. The new gate was negative-tested (pointed at a bogus route, confirmed exit 1) before being trusted, and the hub link is now verified by clicking it on the deployed site rather than by asserting a truthy value.

26. **The auth fixture replays a magic link; it does not forge cookies.** `06-accessibility.md`
    had called this "fragile and slow" since 2.2a on the assumption it needed hand-forged
    chunked `sb-*-auth-token` cookies. It does not: `/auth/confirm` is already a public route
    handler that calls `verifyOtp` on a `token_hash`, so a service-role `generateLink` replayed
    at it makes **the app** mint its own session — cookie chunking, middleware pass and all.
    Nothing in the fixture knows how Supabase stores a session, which is what stops it breaking
    when that changes. `type: "magiclink"` over `invite`/`signup` on purpose: it FAILS for an
    unknown address instead of silently creating a user.

    **It is opt-in and says so out loud.** Nothing in the test path loads `.env.local`, so
    `SUPABASE_SERVICE_ROLE_KEY` is absent by default, the projects are not registered, and
    `npm run verify` stays offline and unchanged. `playwright.config.ts` prints a line whenever
    it omits them — decision 25's lesson is that a gate which quietly does not run is worse
    than no gate, because its absence reads as a pass. **Not in CI**: the repo is public, and a
    service-role key in Actions secrets is a bigger change than the coverage is worth. It goes
    into the session-end ritual in AGENTS.md instead.

    One local-only trap, measured not guessed: on the standalone server a **route handler's**
    `NextResponse.redirect` serialises absolute with host `localhost`, while middleware's
    serialises relative. With `baseURL` at `127.0.0.1` that hop crosses an ORIGIN, so the
    session cookie is set correctly and then simply not sent — indistinguishable from a
    rejected token. Production is unaffected (Workers hands Next an absolute URL with the real
    host), which is why magic-link login has always worked live.

27. **`feedback_reports.path` stores a route PATTERN from a closed set — it is not sanitised.**
    A sanitiser is a function that can be wrong; miss an encoding and a uuid survives, and the
    table becomes a log of which patient each staff member viewed, readable outside the audit
    trail that exists to control exactly that. `maskPath` maps the input onto `ROUTE_PATTERNS`
    and returns a member of it or `null`: the id is not stripped, **the string is discarded and
    replaced by the pattern it matched**. `check:routes` asserts that list set-equals Next's
    `AppRoutes`, both directions, and a CHECK constraint says it again in the database for the
    PostgREST-direct case — every segment must be a bracketed placeholder or a ≤25-character
    lowercase slug, so a uuid and a numeric patient number are *unrepresentable*. Rejected: a
    seeded route table or an enum, either of which would need a migration per new route,
    forever, to close a gap two layers already close.

28. **The narrow audit trigger writes action `'update'`, not a new `status_change` code.**
    `private.audit_log`'s CHECK (0002) allows eight actions and none of them is that. Amending
    a shipped constraint to gain a synonym for what an update already is would be a schema
    change carrying no new information. `after update of status, deleted_at` **plus** an
    `is distinct from` guard, because `update of` fires when a column is merely mentioned.

29. **No `app_version` column, though `16-feedback.md` listed one.** Nothing threads a build id
    anywhere, so it would ship and stay null forever — the same smell 2.2b caught itself
    producing when 0013 seeded a `currency` key nothing could read and the first fix was a
    helper that pretended to query and returned a constant. Better no column than one that lies
    by being empty. Same reasoning killed the **`FeedbackDialog`**: the nav link already carries
    `?from=<pathname>`, which was the dialog's only real justification, so it is polish rather
    than capability. Both recorded in the module doc rather than silently dropped.

30. **`check:routes` now also covers `nav.ts` hrefs — and found a live 404 on its first run.**
    Decision 25 added the dangling-link check for `ADMIN_SECTIONS`, but the bug it was written
    about happened in `nav.ts`: "Clinic settings" linked to `/admin` for two whole phases before
    the page existed. Pointing the same check at `nav.ts` immediately found **`/availability`**,
    linked from the doctor sidebar with no page behind it. Removed until Phase 3 builds it,
    with a comment saying where to put it back. `phase: 3` is an annotation and annotations do
    not stop a link being clickable.

31. **The verification script is committed this time.** 2.0's 21/21, 2.2a's 39/39 and 2.2b's
    47/47 were ad-hoc SQL typed into a session — only the counts survive, in this file, so
    nothing re-runs them. `supabase/verify/0015-feedback.sql` is 54 checks in a transaction that
    ends in `ROLLBACK`. Writing it caught its own defect and that is the point worth keeping:
    the self-duplicate check first sat in the staff section, where it **passed while proving
    nothing** — staff hold no UPDATE policy, so the statement matched zero rows and "succeeded"
    without ever reaching the constraint. **A write assertion is only an assertion when the
    actor can write.** The same family as decision 25's always-truthy `goto`.

## Phase 3 — Scheduling engine

- [x] 3.1a Data layer + committed verification ✅
  - [x] Migration **0016** — `availability_rules`, `availability_exceptions`, `blockouts`, the
        three schedule settings (`timezone`/`lead_time_min`/`horizon_days`) behind a new
        `public.clinic_schedule` view + `update_clinic_schedule` RPC, `public.my_provider_id()`,
        and **`public.get_available_slots`**
  - [x] **`supabase/verify/0016-scheduling.sql` — 135/135 green**, written and run before any UI
        exists, committed and re-runnable, ending in `ROLLBACK`
  - [x] **Both named acceptance criteria demonstrated inside it**: the DST week (§ J, 12 checks)
        and a blockout removing slots (§ H, 18 → 12)
  - [x] `docs/modules/04-scheduling-engine.md` filled from stub, per AGENTS.md
  - [x] `npm run db:types` regenerated in the same commit
  - [x] Deployed (version `ef8323b2`) and **live-regression checked**: the four public routes 200,
        all five authenticated routes 307 to `/login` signed out, branding still resolves hue 195
        from the database. **3.1a has no UI, so its acceptance is demonstrated in psql against the
        live project rather than on the deployed URL** — that is what the committed verification
        is for, and 3.1b is where the deployed-URL acceptance returns.
- [ ] 3.1b The editors — `/availability` (+ `/new`, `/[id]`, `/exceptions/*`), `/admin/blockouts/*`,
      `/admin/clinic`; the `nav.ts` Availability restoration; `ROUTE_PATTERNS` 32 → 42;
      `src/lib/clinic/time.ts`; `clockTime()`/`timezoneName()` validators; `Field` `type="time"`;
      the **`layouts` gallery-group split**; authed-suite additions + the doctor fixture role
- [ ] 3.2 Appointments + both EXCLUDE constraints + visit_status + FullCalendar + accept/refer

### Decisions in Phase 3 (do not re-litigate)

32. **A DST test written against the clinic's own timezone is an assertion that cannot fail.**
    Asia/Manila has observed no DST since 1978 — measured, zero non-24-hour days in a 400-day
    sweep, and asserted as check J1 rather than remembered. PLAN's named acceptance criterion for
    3.1 is "correct slots across a DST test week", so the verification points the clinic at
    **America/New_York** inside its rolled-back transaction and keeps a Manila arm as the
    regression guard for the default install. Same family as decision 25's always-truthy `goto`
    and decision 31's write assertion by an actor who could not write.

    **This is also why the timezone had to become a setting in 3.1a rather than 3.1b.** A
    hardcoded `'Asia/Manila'` in `get_available_slots` makes the acceptance criterion literally
    unwritable. The three keys PLAN names — `timezone`, `lead_time_min`, `horizon_days` — existed
    in prose and in the `/admin` "Clinic details" card's description, and in **no migration**.

33. **The DST dates are COMPUTED from tzdata, not written down.** `pg_temp.next_dst_transitions()`
    finds the next 23-hour and 25-hour local days and the section asserts they are Sundays before
    using them. A hardcoded `2027-03-14` works until that date passes, at which point it falls
    outside the booking horizon, the engine correctly returns nothing, every assertion compares
    zero to zero, and the file reports a green DST test it has stopped performing. Derivation is
    strictly stronger: it proves the zone genuinely transitions instead of assuming the US rule.

34. **The slot walk steps INSTANTS, never wall-clock times.** Convert each day's window to
    `timestamptz` once with `at time zone`, then `generate_series(…, interval '10 minutes')`. The
    natural-looking alternative — step in local minutes and convert each candidate — is broken,
    measured: on a spring-forward Sunday it produces **24 candidates but only 18 distinct
    instants**, because Postgres maps a non-existent local time forward and 02:30 and 03:30 are
    *the same instant*. Six duplicate slots, two offers for one chair, no constraint violated,
    and the appointment simply double-sold.

    **Fall-back semantics are wall-clock and chosen, not inherited:** `at time zone` resolves an
    ambiguous local time to the second (standard-time) occurrence, so the repeated hour is
    offered once and the clinic works its posted hours. Asserted, so that "fixing" it into
    elapsed-time semantics fails the file.

35. **A stored generated column is computed BEFORE check constraints — so both ranges are
    expressions, not columns.** `blockouts.during` and `availability_rules.minute_range` were both
    written as generated columns first. Legal (`tstzrange`/`int4range` over columns are IMMUTABLE
    — measured), and both wrong: an end earlier than its start raised the range constructor's own
    `22000 range lower bound must be less than or equal to range upper bound`, and the named CHECK
    **never fired**. That is a sentence no clinician should see and a sqlstate carrying no
    constraint name for `src/app/actions` to map to a field. As an EXCLUDE element / index
    expression the range is built at index-insertion time, after `ExecConstraints`, so the named
    `23514` wins. Caught by checks D1 and D8. **3.2 inherits the trap** — `appointments.time_range`
    is the same shape.

    Settled at the same time, closing the question 0012 parked: **`timestamptz + interval` is
    STABLE**, so PLAN's `time_range … GENERATED` will be rejected outright and 3.2 must build the
    range from two plain `timestamptz` columns.

36. **`get_available_slots` ships WITHOUT an appointment-conflict arm, and a tripwire enforces
    saying so.** `appointments` is 3.2, so a slot today means "the clinic is open", not "this time
    is free". Check **A17** asserts `public.appointments` does not exist **and** that the
    function's comment still says `INCOMPLETE UNTIL 3.2` — so the file goes red the moment 3.2
    creates the table, and the warning cannot outlive the condition it warns about. Decision 25
    says a check that cannot fail is worse than no check; a warning that cannot notice it has been
    addressed is the same bug wearing a hat. Negative-tested by creating a stub `appointments`
    table in a rolled-back transaction and confirming A17 goes red.

37. **Supabase default-grants ALL on every new relation in `public` to `anon`, views included.**
    Measured on this project (`pg_default_acl`, objtype `r`), and demonstrated: a bare
    `create view public._probe as select 1;` arrives with
    `has_table_privilege('anon', …, 'select') = true`. So on a new public view **the revoke is the
    load-bearing line and the grant is decoration**. `clinic_schedule` therefore does
    `revoke all … from anon, authenticated;` before granting `select` to `authenticated`, and is
    deliberately not opened to `anon` — Phase 4 opens it and `get_available_slots` together,
    because either alone is half a door. Check A12, negative-tested by granting `anon` SELECT back
    and confirming it goes red.

38. **Blockouts carry nullable `provider_id` and `operatory_id`, where NULL means all.** An
    extension of PLAN's column list ("named, colored, tstzrange, schedulable_over"), not a renamed
    variant, so it stays inside AGENTS.md's rule. One table then covers "closed for Christmas"
    (both null), "Dr. Cruz at a congress" and "Op 2 out for repair"; without them a multi-day
    absence becomes N exception rows and a chair out of service is unrepresentable. The NULL logic
    in the engine is load-bearing and commented at the call site: a chair-scoped blockout must
    **not** remove slots from a chair-agnostic rule, because that provider can use another chair.

39. **The overlap EXCLUDE makes RESTORE fallible, which no archive/restore pair in this repo has
    been before.** The constraint is partial on `deleted_at is null`, so archiving a rule always
    succeeds but restoring one can raise `23P01` if a live rule has taken its place (check E9).
    That is correct — the alternative is two live overlapping rules — but 3.1b's restore action
    must turn it into a sentence rather than letting an exclusion violation reach a doctor.

40. **The Playwright worker floor drops from 2 to 1, and the second worker was buying six
    seconds.** `playwright.config.ts` has scaled workers by free memory since 2.1d (decision 9)
    with a floor of 2, and that floor silently assumes ~3 GB free. On a box with **1.19 GB** it
    orders two Chromium instances the OS cannot supply, and the run dies with exactly the
    `worker process exited unexpectedly (code=3221226505)` + `Target crashed` signature the
    config's own comment describes — four failures that read as an a11y regression while nothing
    in `src/` had changed. Measured back to back on the same build:

    | workers | free memory | result |
    |---|---|---|
    | 2 | 1.19 GB | **4 failed, 28 passed** (OOM) |
    | 1 | 1.19 GB | **32 passed, 2.0m** |
    | 2 | more headroom (earlier the same session) | 32 passed, 1.9m |

    So parallelism here is worth **six seconds** and costs a false failure whenever the machine is
    busy. The floor existed to keep the value off zero — `1` does that — and was never a claim
    that two browsers always fit. Same lesson the config already carries one line up: *a gate that
    fails on memory pressure is a gate that gets ignored*, and the 2026-08-13 note about
    attributing an intermittent native crash to a component after a single sample.

## Session log (newest first)

- 2026-08-14 (b): **Phase 3.1a — the scheduling engine's data layer, and a DST test that can
  actually fail.** Migration 0016 plus `supabase/verify/0016-scheduling.sql`, **135/135 green**,
  written and run before a single component exists. No UI at all: both of PLAN's named acceptance
  criteria for 3.1 are data-layer facts, so they are demonstrated *inside* the verification —
  § J is the DST week, § H is a blockout taking 18 slots down to 12.
  The increment turned on something worth stating plainly: **PLAN's DST acceptance criterion was
  unwritable as specified.** Asia/Manila has observed no DST since 1978 — measured, zero
  non-24-hour days in a 400-day sweep — so a "DST test week" in the clinic's own zone compares
  zero to zero and reports green. That is decision 25's always-truthy `goto` with a calendar
  attached. The fix has two halves: the verification points the clinic at **America/New_York**
  inside its rolled-back transaction (with a Manila arm proving the default install is
  unaffected), and **the timezone had to become a real setting in 3.1a rather than 3.1b**,
  because a hardcoded `'Asia/Manila'` in `get_available_slots` makes the test impossible to
  write. `timezone`, `lead_time_min` and `horizon_days` existed in PLAN's prose and in the
  `/admin` "Clinic details" card, and in **no migration**; they ship here behind a second
  definer-rights view, `clinic_schedule`, because 0014's own header said to open a new door
  rather than widen `clinic_branding` when a third non-branding key arrived. The dates are
  **computed from tzdata**, not written down — a hardcoded 2027-03-14 works until it doesn't,
  and then fails open.
  **The engine's one real design decision is that the slot walk steps instants, not wall-clock
  times**, and the naive version is not hypothetical: measured, a spring-forward Sunday yields
  **24 candidates but only 18 distinct instants**, because Postgres maps a non-existent local
  time forward and 02:30 and 03:30 are the same moment. Six duplicate offers for one chair, no
  constraint violated. Converting each window's endpoints once and stepping `interval '10
  minutes'` over `timestamptz` is DST-correct by construction and needs no filter.
  **Writing the verification first paid for itself four times.** It caught that a stored
  generated column is computed *before* CHECK constraints — so `blockouts.during` and
  `minute_range` were both raising `22000 range lower bound must be less than or equal to range
  upper bound` while the named constraints never fired, giving a clinician a sentence about range
  bounds and the app a sqlstate with no field to attach to. Both became index/EXCLUDE expressions.
  It caught that **Supabase default-grants ALL on every new relation in `public` to `anon`,
  views included** — proven with a bare `create view … as select 1` — so `clinic_schedule` was
  anon-readable before any grant was written and the revoke, not the grant, is the load-bearing
  line. It caught six wrong slot counts. And **check L5 failed while the thing it checks was
  fine**: the "before" settings were stashed in transaction-scoped GUCs that the rollback
  discarded, so it compared `Asia/Manila` against `NULL` — the same family as 0015's
  "create the helpers before `begin`".
  Ten checks were negative-tested by failing first during the writing; two more were
  negative-tested deliberately, because they are the ones most likely to rot quietly: **A12**
  (grant `anon` SELECT back → red) and **A17, the 3.2 tripwire**, which asserts
  `public.appointments` does not exist *and* that `get_available_slots`' comment still says
  `INCOMPLETE UNTIL 3.2`. Creating a stub `appointments` table turns it red, which is the point:
  the function ships without an appointment-conflict arm, a slot today means "the clinic is open"
  and not "this time is free", and the warning cannot outlive the condition it warns about.
  Also settled, closing the question 0012 parked for Phase 3: **`timestamptz + interval` is
  STABLE**, so PLAN's `time_range … GENERATED` will be rejected outright and 3.2 must build the
  range from two plain `timestamptz` columns.
  **Two process failures on the gate itself, both already recorded in this repo and both repeated
  anyway.** The first `npm run verify` was piped through `tail`, which **masked the exit code** —
  it reported success while the OpenNext build had died with `pageAlloc: out of memory`. And the
  a11y suite then failed four tests with `code=3221226505` / `Target crashed`, which reads as an
  a11y regression and was the OS refusing to start a second browser on a box with 1.19 GB free.
  Proven rather than assumed by re-running the same build single-worker: **32 passed**. The
  worker floor drops from 2 to 1 (decision 40) — measured, the second worker was worth six
  seconds. NEXT: **3.1b — the editors.** `/availability` (+ `/new`, `/[id]`, `/exceptions/*`),
  `/admin/blockouts/*` and `/admin/clinic`; restore the `nav.ts` Availability item **in the same
  commit as the page and the `ROUTE_PATTERNS` entry**, because `check:routes` asserts all three
  against each other; extract `src/lib/clinic/time.ts` out of `patients/format.ts` (the third
  caller, and `CLINIC_TZ`'s "settings-driven from 2.2b" comment has been false for two phases);
  add `clockTime()`/`timezoneName()` validators and `Field`'s `type="time"`; **split the
  `layouts` gallery group** — it is at seven compositions and took 35.7s on Pixel 7 this run
  against a 90s ceiling the spec's own comment says not to raise again; and add the authed-suite
  routes plus a **doctor** fixture role, since the `(staff)` layout's doctor branch has existed
  since 1.2 and no test has ever rendered it. **Open scope question for 3.1b:** `providers` has
  had no admin screen since 0005, so on a fresh install nothing links a login to a provider row
  and `/availability` renders an empty state for everyone — either `/admin/lookups/providers`
  joins 3.1b (~250 lines copied from operatories) or the acceptance runbook carries a SQL step.
- 2026-08-14 (a): **Phase 2.2d — the gate that was missing, and then the module.** Built in that
  order deliberately: 2.2b shipped six 500ing routes and an unlinked hub past a fully green
  `npm run verify`, so the first thing this session produced was the authenticated-route
  fixture `06-accessibility.md` has carried as "the tracked next step" since 2.2a — and the
  second thing it did was re-verify 2.2b with it.
  The fixture turned out easier than that doc assumed, and the assumption is worth correcting
  because it is what deferred this for two increments: it does **not** need hand-forged chunked
  auth cookies. `/auth/confirm` already verifies a `token_hash`, so a service-role
  `generateLink` replayed at it makes the app mint its own session. 42 checks — every
  authenticated route including the dynamic ones, asserting HTTP 200 off the response object,
  exactly one non-empty `<h1>` (a 500 renders none, which is precisely how the 2.2b class
  escapes), axe, and the denial direction. **Every assertion was negative-tested before being
  trusted**, including reintroducing the decision-22 render-prop bug: the build stayed green
  and the fixture went red with `Functions cannot be passed directly to Client Components`.
  That is the whole argument for the thing, demonstrated rather than asserted.
  Pointing `check:routes` at `nav.ts` — the file where the original `/admin` 404 lived, and
  which decision 25's gate never covered — found **`/availability` linked from the doctor
  sidebar with no page behind it**, live. `phase: 3` is an annotation; annotations do not stop
  a link being clickable.
  **Rule 1 of the feedback module is built as a closed-set mapping, not as sanitisation.**
  `maskPath` returns a member of `ROUTE_PATTERNS` or null, so an id is not stripped from the
  path — the path is discarded and replaced by the pattern it matched — and `check:routes`
  asserts that list set-equals Next's own route union in both directions. A CHECK constraint
  repeats it in the database for anyone POSTing straight to PostgREST, shaped so that a uuid
  and a numeric patient number are unrepresentable rather than merely rejected. Rule 2's narrow
  trigger writes `'update'` rather than inventing an action code, and records only
  `{status: …}` / `{deleted_at: …}`; **filing writes no audit row at all**.
  The data layer was verified **54/54 before any UI existed** — the fourth increment in a row
  where that was the cheapest part of the work — and this time the script is **committed**, so
  it can be re-run. Writing it caught its own defect, which is the lesson worth keeping: the
  self-duplicate check first sat in the staff section, where it passed while proving nothing,
  because staff hold no UPDATE policy and the statement matched zero rows. A write assertion is
  only an assertion when the actor can write. Same family as decision 25.
  Two things were **dropped rather than shipped hollow**: `app_version`, because nothing threads
  a build id and the column would have been permanently null (the `currency` lesson from 2.2b),
  and the `FeedbackDialog`, because the nav link already carries `?from=<pathname>` and that was
  the dialog's only real justification. Both recorded in the module doc as AS BUILT deltas.
  Also generalised `ToastOnMount`, which imported `restorePatientById` directly and was
  therefore silently patients-only; it now takes a bound Server Action. `LookupForm` moved to
  `shared/RecordForm` with a re-export, the same shape `list/query.ts` used in 2.2b. The
  `layouts` axe group outgrew Playwright's 30s default at seven compositions — decision 6
  happening one level down — so that test gets 90s and a note that the next addition should
  split the group rather than raise the number again.
  Worker 1.28 → **1.31 MB**. 32 a11y + 42 authed green; **live acceptance 27/27** on the
  deployed URL: filed from a real patient chart, stored as `/patients/[id]`, triaged
  new → in_progress, exactly one audit row carrying only the status keys, **no email anywhere**.
  Corrected two stale docs found on the way: `06-accessibility.md` still said Actions was
  blocked by billing (fixed 2026-08-13 by going public), and `00-overview.md` did not carry the
  audit exemption `16-feedback.md` already claimed was recorded there. NEXT: **2.2e is closed by
  this entry — Phase 3.1**, doctor availability + exceptions + blockouts and
  `get_available_slots` (10-minute grid, buffers in the conflict math, DST-safe). Before writing
  `appointments`, check `provolatile` for `timestamptz + interval`: PLAN's "GENERATED
  time_range" may be rejected outright, and 2.2b recorded that a stored generated column may
  only reference its own row, so 3.2 must COPY the unit counts onto each appointment. Put
  "Availability" back in the doctor sidebar when 3.1 builds the page.
- 2026-08-13 (f): **Phase 2.2b — lookups, and the last RPC finally gets a caller.** Four migrations: `appointment_types` + `operatories` (0012), the generic `lookup_categories`/`lookup_values` (0013), and a small correction (0014). The data layer was verified **47/47 before a single component existed**, which is now the third increment in a row where writing the verification first was the cheapest part of the work.
  Two things got written down that the repo had been carrying implicitly. First, **how buffers compose into `time_range`** — PLAN names the columns and the EXCLUDE constraints but never how one becomes the other, and `'[)'` versus `'[]'` is the difference between back-to-back booking working and being impossible. Second, and more consequential for Phase 3: **a stored generated column may only reference its own row**, so `appointments.time_range` can never read `appointment_types`. 3.2 must copy the unit counts onto each appointment — which is also the correct semantics, because re-timing "Crown Prep" must not move next Tuesday's bookings. Also recorded, unresolved on purpose: `timestamptz + interval` is STABLE, not IMMUTABLE, so PLAN's "GENERATED time_range" may simply be rejected. Nothing in 2.2b depends on the answer; Phase 3 must check `provolatile` before writing it.
  **`services` was dropped from PLAN's five lookup categories**, with the owner's agreement: a service a patient books *is* an `appointment_type`, and a second list holding only a name drifts the first time a clinic renames one. **Fees stayed** in the generic table, but with a first-class `numeric(12,2)` amount, a stable `code`, and a written graduation clause in `11-billing.md` — the shape is knowingly incomplete (no effective dates, no per-surface pricing) and survives only because `invoice_items.unit_fee` is copied.
  A small honesty problem surfaced mid-build and is worth recording because the first fix was the wrong one. 0013 seeded a `currency` key that **nothing could read** — `private` is revoked from `authenticated` — and the first draft "solved" it with a helper that pretended to query and returned a constant. That is the "unused column somebody later assumes is maintained" smell with a function wrapped round it. 0014 puts `currency` in the `clinic_branding` view instead: it is already the sanctioned public door for non-secret display settings, and the rule that matters — never `select *`, only named keys — is kept.
  **The live acceptance earned its keep three times.** It caught a naive plural rendering "8 entrys" on the hub. It caught a bug no gate could: `LookupForm` took a **render prop**, and a plain function cannot cross the Server→Client boundary — only Server Actions can — so **all six create and edit routes returned 500** while typecheck, lint, `check:routes` and 32 axe tests were green. Thin client wrappers fixed it. And it produced one false alarm worth remembering: Playwright's `fill()` on a React uncontrolled `<textarea>` **prepends** instead of replacing, so a save appeared to store a concatenated address. Select-all + type stores exactly what was typed; the product was correct all along. Noted in `06-accessibility.md`, because the symptom is indistinguishable from a real defect.
  `/profile` closes decision 10 — `update_own_patient` was the last RPC in the repo with no call site. It ships as two sections, which is what makes an ALL_ROLES route honest: the account summary always renders, so a staff login with no patient row sees something useful rather than "no record". Its guard is `getActor()`, not `requirePatient()`, because a patient-only guard would break the route for the three roles ROUTE_RULES deliberately grants it to. It **is** read-audited, and the deciding argument is the staff-side case rather than the patient one. Proven live: an `email` input injected via devtools does not change `patients.email`, because the RPC has no parameter for it.
  Eleven new routes, **zero `ROUTE_RULES` changes** — `{ prefix: "/admin" }` covers all of them and `check:routes` proves it. Worker 1.23 → 1.28 MB. **49/49 live acceptance.** NEXT: 2.2c — email settings + Brevo + SPF/DKIM/DMARC panel (still blocked on the Brevo account), then 2.2d feedback and 2.2e close. Two carried items: add **D1 Edit** to the Cloudflare API token so the branding tag cache can be wired (17-ops.md has the commands), and the authenticated-route test fixture, whose absence let six 500s reach a deploy.
- 2026-08-13 (e): **Phase 2.2a — the admin hub, branding, and a logo that is actually a file.** `/admin` exists. It is worth saying plainly that it did not before: `nav.ts` has linked to it from the sidebar, the More sheet and ⌘K **since Phase 1.2**, so every superadmin who clicked "Clinic settings" for two phases got a 404. `AdminSectionGrid` now makes that class of bug unrepresentable — a section without an `href` cannot render as a link, so an unbuilt screen can never be linked to.
  The increment's real work was the write path. `private.settings` has existed since 0001 with **no way to write it** — Phase 1.1 changed the hue by hand in the SQL editor — and the question was what shape that write should take. A generic `set_setting(key, value)` with an allow-list was rejected for a specific reason: this table holds `setup_superadmin_email`, which `handle_new_user()` reads to promote a matching signup to superadmin, so a generic setter is one allow-list mistake away from being a role-escalation primitive that leaves no trace anyone would think to read. **The allow-list is the signature instead** — no `key` parameter, nothing to forget. It also writes the first `settings_change` audit row in the system; the CHECK constraint has allowed that action code since 0002 and nothing had used it.
  Writing the verification before the UI paid off again, as it did in 2.0: **39/39 green before a single component existed**, including that hue 400, `http://` and `javascript:` logo URLs are all rejected, that `clinic_branding` is unchanged after every rejection, and that only the four branding keys are reachable afterwards. Two of those checks initially "passed" against an empty array, because `private` is deliberately not in PostgREST's exposed schemas and even the service-role key reads nothing there — a vacuous pass is worse than a failure, so those assertions moved to the Management API and one now asserts non-emptiness first.
  Three things about Next 16 had to be established rather than assumed, and all three changed the design. **`unstable_cache` forbids `cookies()` inside a cache scope**, which is almost certainly why the original author reached for a module-level memo — hence a new session-less Supabase client, which is the correct client for a value shared by every visitor anyway. **The cached function has to throw on failure**, because `unstable_cache` stores what you return, so returning the fallback on a transient blip would pin "DentClinic"/195 into the cache for an hour — the exact bug the old memo avoided by not memoizing its error path. And **`revalidateTag` is the wrong call now**: its recommended `"max"` profile is stale-while-revalidate, which would serve the *old* branding to the first visitor after a save. `updateTag` expires immediately. That one-word difference is the acceptance criterion.
  The plan's top-listed risk landed exactly as written: **the Cloudflare token has no D1 permission**, so the tag cache could not be created. That turned out to be survivable rather than blocking, because OpenNext defaults both cache overrides to `"dummy"` — with neither wired, branding is simply read per request: slower, always correct, acceptance still met. The trap recorded for whoever adds the scope is that KV **alone** is the one combination worse than doing nothing, since it would persist entries with nothing able to invalidate them. The KV tag cache is not the answer either; its own source says it can take 60s to reflect a write, which is worse than the memo it would replace.
  One defect was found only by running the thing on the deployed URL: **an uploaded logo could never be removed.** The hidden input carrying the URL is React-controlled, and no control emptied it — while the doc I had just written claimed removal was "an UPDATE of the setting to null". The doc described a feature that did not exist. Fixed, redeployed, re-verified. Live acceptance is 18/18 + 12/12: name and hue change from the form alone and are seen by a signed-out visitor in a fresh context **with JavaScript disabled**, the logo PUTs to `*.supabase.co` and demonstrably not through the Worker, SVG and >1 MB uploads are refused, and `/patients`, `/design-system` and the signed-out redirects all still behave. Worker went **down** to 1.23 MB. NEXT: 2.2b — `appointment_types` + `operatories` (0012) and `lookup_categories` + `lookup_values` (0013, four categories — `services` is `appointment_types`), `/admin/lookups`, `/profile` + `update_own_patient`, and the `layouts` gallery entries for both.
- 2026-08-13 (d): **Phase 2.1c + 2.1d — the roster, the forms, the duplicate warning, self-registration.** `/patients` is live against Supabase with server-side search, sort, pagination and an Archived filter, all in the URL and all working with JavaScript off; `/patients/new`, `/patients/[id]` and `/patients/[id]/edit` share one `PatientForm`; `/register` completes the claim path in two steps and one write.
  Three defects were found by writing the thing rather than by reasoning about it. **The duplicate ack could not be a hidden input** — `forms.md` specified one, and it would have disarmed the check it exists to enforce, because a hidden input is submitted by *every* button in the form, so the primary "Create patient" would have carried the ack and skipped the re-check. It rides on the proceed button's `name`/`value` instead, which a browser sends only for the button that actually submitted; the primary now carries none and therefore always re-checks. **`find_patient_duplicates` had four reason arms for five reachable match shapes** (0008): a phone-only match was labelled "Same surname and date of birth", a sentence that is simply false, shown to someone deciding whether two records are the same person. And **typing the Supabase client immediately caught a latent looseness** in `savePreferences`, which had been building its upsert payload with `theme?: string` rather than the enum.
  The prefetch/audit interaction went the opposite way to first instinct and is worth not re-deriving: without Cache Components a dynamic route is not prefetched **at all** unless it has a `loading.tsx`, so *adding* one would have made 25 row links prefetchable and rested the read audit's correctness on a framework-internal promise. There is deliberately no `loading.tsx` under `/patients`; streaming happens inside `page.tsx`, and `log-read.ts` ignores `next-router-prefetch` as belt-and-braces. `log_read` went from zero call sites to two, and 0009 gave its id parameters defaults so a *list* read — which has no row to point at — is expressible and type-clean.
  Two "flaky" things turned out to be one thing: **build and test parallelism were scaling with core count and ignoring memory.** 18 Next build workers and 11 Chromium instances on a 22-core box with ~2 GB free, both dying with Windows abort `3221226505`. The build reports it per worker at a 26 MB heap, which reads like a Next bug; the test run fails all 30 tests at once, which reads like an a11y regression. Both now scale with free memory — and capping the test run made it *faster*, 48 s crashing at 11 workers to 19 s green at 2, because the thrashing was the slow part. This is the same crash PROGRESS's last entry recorded misattributing to a component after one passing sample.
  One honest gap, recorded rather than papered over: **DuplicateWarning's self shape has no live call site.** That is the design working — `claim_or_create_patient` takes no email, so a patient has no selector to probe with and `/register` renders no warning at all — but it means the mode is proven only in the gallery until Phase 4 guest booking needs it. `/profile` stayed out of scope, so `update_own_patient` still has no caller. NEXT: 2.2a — admin hub + branding (name/logo/tagline/hue over the existing `clinic_branding` view), then 2.2b lookups, 2.2c email + DNS panel (still blocked on the Brevo account), 2.2d feedback, 2.2e close. Pick up `/profile` + `update_own_patient` alongside 2.2.
- 2026-08-13 (c): **Phase 2.0–2.1b.** The patients data layer is live and verified 21/21 against the real project — including that a patient calling the duplicate probe gets `forbidden`, sees zero foreign rows, and cannot INSERT directly. Writing that verification *before* the UI caught two bugs that would otherwise have surfaced in front of a patient: a `dob` CHECK using UTC `current_date` that rejects same-day births throughout Manila office hours (0006), and an unqualified `::citext` inside a `search_path = ''` definer function which deployed clean and failed only at runtime on registration (0007). Lesson recorded in 00-overview: `search_path = ''` means schema-qualify **types** too.
  Most of the session went to the toolchain, and it was worth it: making the repo public unblocked Actions, and the first honest CI run exposed three latent defects — a route-coverage gate blind to route handlers (Phase 5's `/api/jobs/send` would have 302'd to `/login` with CI green), typecheck ordered before the build that generates the types it needs, and a platform-pruned lock. All fixed, with `npm run lock:refresh` so the lock problem cannot silently return.
  Going public also had consequences to absorb: a **superadmin password was published** in `01-auth-roles.md` — rotated, since deleting the line fixes nothing when git history is permanent — and backup artifacts became world-readable, so PBKDF2 went from 10,000 to 600,000 iterations and the owner decided (recorded, with its dependencies) to accept public ciphertext behind a ~191-bit passphrase. **The nightly backup then ran successfully for the first time**, closing 0.3.
  One architectural question was settled with evidence rather than assumption: `useActionState` forms do not work without JavaScript. A plain-action control form on the same page proved the harness sound. Six docs that claimed otherwise were corrected rather than left overstating the guarantee.
  Missteps worth not repeating: masking exit codes behind `tail` twice, bind-mounting the repo for a container `npm ci` that overwrote host binaries, and attributing an intermittent native build crash to a component after a single passing sample. NEXT: 2.1c — `/patients` roster wired to Supabase (server-side q/sort/page/archived), `actions/patients.ts` with in-action role checks, sonner mount; then 2.1d forms + duplicate warning. **Deploy to Workers and re-verify on the live URL before 2.2** — nothing this session has been demonstrated there yet.
- 2026-08-13 (b): **Phase 1 complete and deployed.** 1.2 shipped the app shell (route-group layouts over a server AppShell, bottom tabs + sidebar via a CSS-only switch, MoreSheet), StatusChip/EmptyState/PageHeader/UserChip+skeleton, IdleTimeoutGuard, navigate-only ⌘K, and the admin-gated `/design-system` gallery with a `?matrix=all` view. First test tooling in the repo: Playwright + axe (24 green) plus route-coverage, docs-sync and worker-size guards, all reachable via `npm run verify` offline. Two real bugs the gates caught: shadcn's destructive button at 4.21:1, and nested `.dark` panes rendering light (custom properties resolve where declared — the token block needed `:root, .dark`), which meant the matrix had been testing light mode twice. Also fixed the fail-open `isAllowed()`. NEXT: Phase 2 — patient registry with email+DOB duplicate warning; superadmin branding (name/logo/tagline/hue → the `clinic_branding` view already exists) + lookups admin + email settings with Brevo API and SPF/DKIM/DMARC verification; feedback module. Use the P2 prompt in `docs/prompts.md`.
- 2026-08-13 (a): Phase 1.1 complete and deployed. OKLCH two-ladder token system driven by one DB-sourced `--brand-hue` (195 teal), 13 fixed-hue semantic tokens, 4 font steps with `auto` route resolution, cookie+DB preferences with once-per-session DB reconciliation, AppearancePanel/Menu + public `/settings/appearance`. Contrast gate green (37,440 comparisons). System theme needs **no blocking script** — resolved in CSS via a two-arm `dark:` variant, so it works with JS disabled. Three latent bugs fixed: self-referential `--font-sans` (Geist was never actually applying), middleware dropping rotated auth cookies on redirects, eslint linting build output. NEXT: Phase 1.2 — fail-closed route guard, app shell (BottomTabBar/AppSidebar/PageHeader/IdleTimeoutGuard/cmdk), EmptyState+StatusChip+skeletons, admin-gated `/design-system` gallery, Playwright+axe CI.
- 2026-08-12 (b): Phase 0 nearly complete. Supabase on dedicated account (PAT provided), Cloudflare deployed with user's API token, auth chain verified end-to-end on live URL, seed bug in audit trigger found+fixed (0003). Restore drill running against local stack. NEXT: finish drill, trigger backup workflow once, commit+push, then Phase 1 (tokens + app shell) via docs/prompts.md P1.
- 2026-08-12 (a): Plan approved after 3 research passes + design workflow + critiques. Phase 0 started: scaffolded Next.js, docs skeleton.
