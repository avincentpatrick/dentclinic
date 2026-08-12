# PROGRESS

Legend: ⬜ not started · 🔵 in progress · ✅ done · ⛔ blocked · 🔁 rework

## Snapshot

- **Current phase:** 0 — Foundation & ops spine
- **Current increment:** 0.1 (scaffold + deploy gate)
- **Deployed URL:** — (not yet deployed)
- **Supabase:** ⛔ waiting on dedicated account (user creating a separate account so existing projects stay untouched)
- **Last session:** 2026-08-12

## Phase 0 — Foundation & ops spine

- [ ] 0.1 Scaffold + Cloudflare deploy gate 🔵
  - [x] create-next-app (TS, Tailwind v4, App Router, src dir)
  - [ ] @opennextjs/cloudflare build passes locally (bundle-size gate)
  - [ ] shadcn/ui initialized
  - [x] Docs skeleton (AGENTS.md, PROGRESS.md, docs/)
  - [ ] git + GitHub repo + CI (lint/typecheck/build)
  - [ ] Deployed to Cloudflare (needs Cloudflare auth)
- [ ] 0.2 Auth + roles + soft-delete/audit spine ⬜ (migrations written locally; apply when Supabase ready)
- [ ] 0.3 Nightly pg_dump backup + restore drill ⬜
- Pitfalls closed this phase: — | pending: P9 P10 P22 P23

## Phases 1–10

See `docs/PLAN.md` § Phases & increments. Checklists are added here when a phase starts.

## Session log (newest first)

- 2026-08-12: Plan approved after 3 research passes + design workflow + critiques. Phase 0 started: scaffolded Next.js, docs skeleton, Supabase blocked on new-account decision (user wants separate account). NEXT: finish Cloudflare build gate + CI, write migrations 0001–0002 locally, build auth UI skeleton.
