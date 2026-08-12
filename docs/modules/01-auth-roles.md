# Module: Auth & Roles

> Status: LIVE since Phase 0.2. Owns login, roles, session gating, and the audit spine.

## Purpose
Email-only passwordless auth (OTP/magic link) for patients; invited accounts for staff/doctors/superadmin. One `user_role` JWT claim drives both middleware routing and RLS.

## Data Owned
- `public.profiles` — `id (= auth.users.id)`, `role app_role`, `full_name`, `phone`, `is_active`. Staff are **deactivated, never deleted**.
- `private.settings` key `setup_superadmin_email` — first-superadmin bootstrap; self-deletes on use.
- `private.audit_log` — append-only; write-audit trigger `private.audit_row()` (INSERT→`create`); server-layer read audit via `public.log_read(entity, entity_id, patient_id)`.
- Functions: `private.handle_new_user()` (signup trigger), `private.custom_access_token_hook(jsonb)` (registered in Auth → Hooks), `public.jwt_role()`.

## Screens (routes)
- `/login` — email → 6-digit OTP (client, [src/app/login/page.tsx](../../src/app/login/page.tsx))
- `/auth/confirm` — magic-link token_hash verification (route handler)
- Role homes: patient `/home` · staff+doctor `/today` · superadmin `/dashboard`
- Sign-out server action: [src/app/actions/auth.ts](../../src/app/actions/auth.ts)

## Rules & Invariants
1. Role lives in `profiles.role`; the hook injects it as `user_role` claim at token issuance — **never** read from `user_metadata`, never mirrored elsewhere.
2. `is_active = false` ⇒ hook raises `account_deactivated` ⇒ no token issued (verified 2026-08-12).
3. Self-signup always lands as `patient` (superadmin bootstrap excepted, one-time).
4. Middleware ([src/middleware.ts](../../src/middleware.ts)): unauthenticated → `/login`; wrong role → own home (never 404); logged-in on `/login` or `/` → own home. Path rules in [src/lib/roles.ts](../../src/lib/roles.ts).
4a. **`isAllowed()` is fail-closed** (since 1.2): an unregistered path is denied, never silently public. It previously ended in `return true`, which made every future route public by default. `scripts/check-routes.mjs` fails CI if a real route has no entry in `ROUTE_RULES`.
4b. **`/design-system` is gated by its own layout, not middleware** — it needs a runtime-readable env bypass for the axe run, and middleware's `process.env` is inlined at build time in the Edge runtime. Same authorisation check, safer bypass. See [06-accessibility.md](../design-system/06-accessibility.md).
4c. Middleware collects cookie writes and replays them onto **every** response. Before 1.2 it built a fresh `NextResponse.redirect()` on three paths and dropped rotated Supabase auth cookies whenever a token refresh coincided with a redirect.
5a. **`IdleTimeoutGuard` is the real session control**, not the JWT. supabase-js auto-refreshes tokens in the background regardless of user activity, so a tab left open never expires on its own. Staff/doctor/superadmin 15 min, patient 30 min; 60s warning with an extend action (WCAG 2.2 SC 2.2.1). Cross-tab via `BroadcastChannel` — no storage of any kind.
5. Role/`is_active` changes: superadmin server action with service role only (column guard trigger lands with the users-admin screen, Phase 2).
6. Every `profiles` write is audited; audit_log accepts actions: read/create/update/delete/sign/export/login/settings_change.

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| Read own profile | ✔ | ✔ | ✔ | ✔ |
| Read all profiles | — | — | — | ✔ |
| Update own profile (not role/is_active) | ✔ | ✔ | ✔ | ✔ |
| Change role / activate-deactivate | — | — | — | ✔ (service role action) |
| Read audit_log | — | — | — | ✔ (RPC, Phase 8) |

## Test users (Phase 0 seed — remove before real launch)
`test-{patient,doctor,staff,superadmin,deactivated}@example.com` / password `TestDent2026-Phase0` (password sign-in exists only for these; real patients are OTP-only).

## Open Questions
- MFA for superadmin (Supabase supports TOTP) — revisit Phase 9.
