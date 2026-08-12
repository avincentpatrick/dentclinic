# PROGRESS

Legend: ⬜ not started · 🔵 in progress · ✅ done · ⛔ blocked · 🔁 rework

## Snapshot

- **Current phase:** 1 — Design system core & app shell (1.1 ✅ · 1.2 ⬜)
- **Deployed URL:** https://dentclinic.dentclinic-appointment-and-recording-system.workers.dev
- **Supabase:** dentclinic `csslnpmjprfuzofomtda` (ap-southeast-1, dedicated account) — migrations 0001–0004 applied
- **Repo:** github.com/avincentpatrick/dentclinic (private)
- **Brand hue:** 195 (teal-cyan), live from `clinic_branding` — changing the DB row re-brands with no rebuild
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
- [x] 0.3 Backups + restore drill ✅ (one item ⛔ external)
  - [x] Nightly encrypted pg_dump workflow (session pooler; aws-0 host — db host is IPv6-only)
  - [x] **Restore drill PASS** (see 17-ops.md log): full wipe + restore into local stack; auth.users/identities/profiles/audit all intact; dump includes auth+storage schemas
  - [⛔] First real backup-workflow run — **blocked: GitHub Actions disabled by the account's billing state** ("recent account payments have failed or your spending limit needs to be increased"). USER ACTION: GitHub → Settings → Billing & plans (or make repo public). Must be fixed before real patient data exists.
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
- [ ] 1.2 Shell + components + gallery + a11y CI ⬜
  - Fail-closed `isAllowed()` + `/design-system` → superadmin; AppShell over three route-group layouts; BottomTabBar/AppSidebar/PageHeader; EmptyState/StatusChip/skeletons; cmdk (Navigate only); IdleTimeoutGuard; `/design-system` gallery; Playwright + axe
- Pitfalls closed: **P9 P10 P22 P23**

### Deferred from Phase 1 (decided, do not re-litigate)
`SearchSheet` + data-bearing search providers + `/api/search` → 8.2 · `InstallPrompt`/`OfflineBanner` → 9 (PWA-coupled; a trim from PLAN.md:101's shell list) · `DataTable`/`AppointmentCard`/`SoftDeleteMenu`/`PatientHeader` → 2/3/6 · `sonner` toasts → 2 · `deriveStatus()` implementation → 3 · draft-save behaviour → 6 · branding admin UI → 2.2 · booking concurrency test → 3.

## Phases 2–10

See `docs/PLAN.md` § Phases & increments. Checklists are added here when a phase starts.

## Session log (newest first)

- 2026-08-13: Phase 1.1 complete and deployed. OKLCH two-ladder token system driven by one DB-sourced `--brand-hue` (195 teal), 13 fixed-hue semantic tokens, 4 font steps with `auto` route resolution, cookie+DB preferences with once-per-session DB reconciliation, AppearancePanel/Menu + public `/settings/appearance`. Contrast gate green (37,440 comparisons). System theme needs **no blocking script** — resolved in CSS via a two-arm `dark:` variant, so it works with JS disabled. Three latent bugs fixed: self-referential `--font-sans` (Geist was never actually applying), middleware dropping rotated auth cookies on redirects, eslint linting build output. NEXT: Phase 1.2 — fail-closed route guard, app shell (BottomTabBar/AppSidebar/PageHeader/IdleTimeoutGuard/cmdk), EmptyState+StatusChip+skeletons, admin-gated `/design-system` gallery, Playwright+axe CI.
- 2026-08-12 (b): Phase 0 nearly complete. Supabase on dedicated account (PAT provided), Cloudflare deployed with user's API token, auth chain verified end-to-end on live URL, seed bug in audit trigger found+fixed (0003). Restore drill running against local stack. NEXT: finish drill, trigger backup workflow once, commit+push, then Phase 1 (tokens + app shell) via docs/prompts.md P1.
- 2026-08-12 (a): Plan approved after 3 research passes + design workflow + critiques. Phase 0 started: scaffolded Next.js, docs skeleton.
