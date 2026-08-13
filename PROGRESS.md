# PROGRESS

Legend: ⬜ not started · 🔵 in progress · ✅ done · ⛔ blocked · 🔁 rework

## Snapshot

- **Current phase:** 2 — Patients, lookups, settings, email (2.0 ✅ · 2.1a ✅ · 2.1b ✅ · 2.1c ✅ · 2.1d ✅ → next: 2.2a admin hub + branding)
- **Deployed URL:** https://dentclinic.dentclinic-appointment-and-recording-system.workers.dev
- **Supabase:** dentclinic `csslnpmjprfuzofomtda` (ap-southeast-1, dedicated account) — migrations **0001–0009** applied
- **Repo:** github.com/avincentpatrick/dentclinic — **PUBLIC since 2026-08-13** (to unblock Actions; see 17-ops.md for what that changed)
- **CI:** green end to end. Worker **1.27 MB** gzip (42% of 3 MB). 30 a11y tests.
- **Brand hue:** 195 (teal-cyan), live from `clinic_branding` — changing the DB row re-brands with no rebuild
- **Blocked on user:** Brevo account (gates 2.2c email settings + test send)
- **Last session:** 2026-08-13

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
- [ ] 2.2a Admin hub + branding · 2.2b lookups · 2.2c email + DNS panel · 2.2d feedback · 2.2e close

### Decisions this phase (do not re-litigate)

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

## Session log (newest first)

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
