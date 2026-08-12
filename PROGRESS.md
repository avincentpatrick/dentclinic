# PROGRESS

Legend: ⬜ not started · 🔵 in progress · ✅ done · ⛔ blocked · 🔁 rework

## Snapshot

- **Current phase:** 0 — Foundation & ops spine (0.1 ✅ · 0.2 ✅ · 0.3 🔵)
- **Deployed URL:** https://dentclinic.dentclinic-appointment-and-recording-system.workers.dev
- **Supabase:** dentclinic `csslnpmjprfuzofomtda` (ap-southeast-1, dedicated account) — migrations 0001–0003 applied
- **Repo:** github.com/avincentpatrick/dentclinic (private)
- **Last session:** 2026-08-12

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
- [ ] 0.3 Backups + restore drill 🔵
  - [x] Nightly encrypted pg_dump workflow (session pooler; aws-0 host — db host is IPv6-only)
  - [x] Local dump test OK (schema 102,763 B + data 20,912 B)
  - [ ] Restore drill into local Supabase stack (in progress; cloud scratch blocked — free-project limit counts per-user across orgs)
  - [ ] One manual run of the backup workflow
- Pitfalls closed: **P9 P10 P23** (+P22 rails) | pending this phase: P22 (drill proof)

## Phases 1–10

See `docs/PLAN.md` § Phases & increments. Checklists are added here when a phase starts.

## Session log (newest first)

- 2026-08-12 (b): Phase 0 nearly complete. Supabase on dedicated account (PAT provided), Cloudflare deployed with user's API token, auth chain verified end-to-end on live URL, seed bug in audit trigger found+fixed (0003). Restore drill running against local stack. NEXT: finish drill, trigger backup workflow once, commit+push, then Phase 1 (tokens + app shell) via docs/prompts.md P1.
- 2026-08-12 (a): Plan approved after 3 research passes + design workflow + critiques. Phase 0 started: scaffolded Next.js, docs skeleton.
