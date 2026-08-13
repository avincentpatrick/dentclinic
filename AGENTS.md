# DentClinic — Working Agreements

Mobile-first dental clinic appointment + recording system. One clinic per install (white-label). Solo dev + AI. $0 hosting target.
Full blueprint: `docs/PLAN.md` (canonical copy of the approved plan). Progress: `PROGRESS.md`. Phase prompts: `docs/prompts.md`.

## Stack (locked)

- Next.js App Router + TypeScript + Tailwind v4 + shadcn/ui, deployed to **Cloudflare Workers** via `@opennextjs/cloudflare` (Vercel Hobby forbids commercial use — do not deploy there).
- Supabase (Postgres 17, Auth email OTP/magic link, Storage) — **separate dedicated account** (not the user's main account).
- Email: **Brevo REST API over HTTPS** is the default and the only path from the Worker — Cloudflare Workers cannot open SMTP sockets at all. The clinic's optional custom-SMTP path runs in a **Supabase Edge Function on port 465** (Deno blocks 25 and 587); that Edge Function is the single sanctioned SMTP socket in the system. Reminder pipeline: pg_cron → pg_net → `/api/jobs/send` (shared-secret header) → Brevo.
- PWA via Serwist. FullCalendar (MIT) for staff/doctor calendar — always `next/dynamic` import (3MB worker limit).

## Non-negotiable conventions

- **Soft delete everywhere:** `deleted_at/deleted_by` on every domain table; RLS filters `deleted_at IS NULL`; partial unique indexes `WHERE deleted_at IS NULL`; UI says "Archive", never "Delete". No hard DELETE grants.
- **Double-booking is DB-enforced:** GiST EXCLUDE constraints on `appointments` (operatory + provider) over generated `time_range tstzrange` (includes buffers). Never app-layer-only checks.
- **Cancel ≠ delete** (status → broken/unscheduled), **reschedule = atomic UPDATE** preserving the row id.
- **Clinical notes immutable after signing** (trigger-enforced); changes = addendum rows. Audit every clinical **read and write** to `private.audit_log` (append-only).
- **Roles:** `user_role` JWT claim via Custom Access Token Hook (from `profiles.role` + `is_active` check) is THE source for middleware AND RLS. Never `user_metadata`.
- **Every privileged server action re-checks the role in-action.** Middleware gates *navigation*; a Server Action is a POST of an action id to whatever path the user is already on, so a staff user sitting on `/today` can invoke a superadmin action's id. Middleware never sees it as an `/admin` request. Check the claim inside the action (or let a `security definer` RPC do it) — never rely on "this action is only imported by an admin page".
- **`x-pathname` / `x-role` request headers are presentation input only.** Middleware builds them from `request.headers`, which a client controls, so it always set-or-deletes them. Nothing may ever authorize on them.
- All times UTC in DB; clinic TZ (`Asia/Manila`) from settings; durations = counts of 10-minute units.
- Everything sized in rem; tokens in `globals.css` reference `--brand-hue`; never color-only status (chip + label + icon).
- Never cache PHI in the service worker; recents/search state server-side, never localStorage.
- **No working credential in a tracked file, ever** — not in docs, not in tests, not "temporarily". Repo visibility is one click and git history is permanent; the repo went public on 2026-08-13 with a superadmin test password in `01-auth-roles.md`, and deleting the line would have fixed nothing. Secrets live in `.env.local`, Cloudflare secrets, or Supabase secrets, and are referenced by name.
- Canonical table names live in `docs/PLAN.md` § Data model — do not invent variants.

## Documentation rules

- Each module has one doc in `docs/modules/` — fill it **before** the module's first increment; update it in the **same commit** as any change to the module.
- Each custom component gets `docs/design-system/04-components/<name>.md` (template: Anatomy → Variants → Props → States → A11y → Do/Don't → Example) **when built**, plus an entry in the `/design-system` live gallery.

## Session rituals

- **Start:** read `PROGRESS.md` Snapshot → read the current increment's module doc(s) → re-verify the previous increment's acceptance criteria → work.
- **End:** update `PROGRESS.md` (statuses, Snapshot, session-log line ending with `NEXT:`), update touched docs, commit, deploy if green, and **hand the user a ready-to-copy prompt for the next session**.
- **Waiting rule:** whenever work pauses on a background task, tell the user in one clear line what is running and that they need to do nothing.
- Report failures plainly (failing tests = show output); never mark an increment done without its acceptance criteria demonstrated on the deployed URL.
