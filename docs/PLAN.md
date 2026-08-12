# DentClinic — Appointment & Recording System: Implementation Plan

## Context

Greenfield project in `d:\dentclinic_appointment_and_recording_system` (empty directory). Goal: a modern, mobile-first, white-label appointment + patient-recording system for a dental clinic, hosted at $0, built solo with AI assistance. This plan was produced from three deep research passes (dental industry standards, free-tier stack verification, UI/UX) plus a multi-agent design + adversarial-critique workflow; all contradictions found by the critics are resolved below.

## Locked decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Stack | **Next.js (App Router) + Supabase** (Postgres, Auth, Storage) |
| Hosting | **Cloudflare Pages/Workers** via `@opennextjs/cloudflare` (free tier allows commercial use; Vercel Hobby does NOT). Supabase free tier is commercial-safe. |
| Mobile | **PWA** (Serwist), one codebase, installable |
| Scope | **One clinic per install**, white-label via superadmin settings |
| Roles | **Patient, Doctor, Staff (front desk), Superadmin** |
| Clinical depth v1 | **Structured core** (history, allergies/meds, SOAP, procedures per tooth/surface, treatment plans, consents, documents). Graphical odontogram + perio charting = post-v1 phase |
| Notifications | **Email only** (Brevo free 300/day). No SMS. |
| Billing | **Full invoicing** (numbered invoices, receipts, discounts, partial payments, AR reports) |

**Principles (binding):** frictionless, gamified (evidence-based, toggleable), global search (⌘K), user/workflow-centric, connected data, dashboard-driven, soft deletes everywhere, modern look, everything documented (MD per module + design-system library), phased increments with progress monitoring and ready-to-copy prompts.

---

## Architecture overview

```
Next.js App Router (Cloudflare Pages/Workers via @opennextjs/cloudflare)
  ├─ (patient) PWA: bottom tabs, booking wizard, records, 18px base font
  ├─ (staff)   shared shell doctor+staff: Today, Schedule (FullCalendar MIT), Patients, chart
  ├─ (admin)   superadmin: dashboard, settings, lookups, users, audit, feedback
  ├─ /book     PUBLIC guest booking (≤3 screens) · /a/[token] no-login confirm/cancel
  └─ /design-system  admin-gated live component gallery
Supabase (free): Postgres + RLS · Auth (email OTP/magic link) · Storage (documents) · pg_cron + pg_net
Email: pg_cron → pg_net → Next.js /api/jobs/send (secret header) → Brevo REST API over HTTPS
       (NO SMTP sockets — they're unreliable on Workers and blocked on Edge Functions port 587)
Backups: nightly pg_dump via GitHub Actions → encrypted storage (free tier has NO backups)
```

**Riskiest bet + fallback ladder:** `@opennextjs/cloudflare` (3MB compressed worker limit on free tier). Mitigate: dynamic-import FullCalendar/Recharts/TanStack. Ladder: trim bundles → Workers Paid $5/mo (10MB) → Vercel Pro $20/mo. **Gate: deploy the skeleton to Cloudflare in increment 0.1; if it fails, switch — don't debug for a week.**

---

## Data model (canonical names — these override any drift)

All tables: `id uuid pk`, `created_at/updated_at timestamptz` (UTC; clinic TZ `Asia/Manila` in settings), soft-delete `deleted_at/deleted_by` (RLS always filters `deleted_at IS NULL`; partial unique indexes `WHERE deleted_at IS NULL`; no DELETE grants). Schemas: `public` (domain), `private` (audit_log, action_tokens, settings secrets — not exposed via PostgREST).

**Identity:** `profiles` (role enum patient/doctor/staff/superadmin, is_active — deactivate never delete), `patients` (profile_id nullable = walk-in/guest, dedupe key unique(email,dob), is_provisional, merged_into_id, primary_provider_id, recall_disabled, **marketing_opt_in**), `providers`, `operatories` (sort_order, default_provider_id, is_hygiene).

**Scheduling:** `appointment_types` (duration_units = count of **10-min increments**, pre/post_buffer_units, patient_bookable, color), `availability_rules` (per provider, weekday, times, operatory, effective range), `availability_exceptions`, `blockouts` (named, colored, tstzrange, schedulable_over), `appointments` (patient/provider/operatory/type, starts_at, **`time_range tstzrange` GENERATED including buffers**, status enum `scheduled/complete/broken/unscheduled/planned/asap`, **`visit_status` enum `none/arrived/in_chair/done`** (queue board; no_show = broken + reason code), confirmation_status, **acceptance_status `pending/accepted/referred`** (doctor accept/refer), cancelled_at/by/reason, rescheduled_from_start, booked_via), `appointment_events` (append-only lifecycle log).

**The two DB-enforced constraints (non-negotiable, pitfall P1):**
```sql
EXCLUDE USING gist (operatory_id WITH =, time_range WITH &&) WHERE (status = 'scheduled' AND deleted_at IS NULL)
EXCLUDE USING gist (provider_id  WITH =, time_range WITH &&) WHERE (status = 'scheduled' AND deleted_at IS NULL)
```
Hard-block overlaps everywhere in v1 (overlap-override machinery CUT). Cancel ≠ delete: status → broken/unscheduled (re-booking queue). Reschedule = atomic UPDATE preserving identity + upsert of reminder queue rows.

**Tokens:** `private.action_tokens` (sha256 token_hash only, purpose confirm/cancel/reschedule/previsit_form/unsubscribe, expires_at, used_at).

**Clinical:** `medical_history_versions` (jsonb data + allergies + medications + alerts, version, patient re-signs at recalls), `clinical_notes` (SOAP jsonb, draft→signed, **trigger blocks UPDATE when signed**), `note_addenda` (append-only), `procedures` (code, tooth, surfaces[] B/M/O/D/L, status planned/complete/existing/condition, fee, treatment_plan_item_id), `treatment_plans` + `treatment_plan_items`, `consents` (template_key+version, signed_at ≤ treatment date, witness), `documents` (Supabase Storage path; R2 later for x-rays).

**Billing (full invoicing):** `invoices` (sequential clinic-prefixed number, patient, status draft/issued/paid/void, totals), `invoice_items` (procedure link or fee-lookup line, qty, unit_fee, discount), `payments` (invoice_id, amount — partial allowed, method from lookups, recorded_by, received_at). Balance + AR = SQL views.

**Recall/waitlist:** `recall_types` (default_interval_days, prophy default auto-assigned), `patient_recalls` (**due_calculated AND due_override stored separately**, status, prebooked_appointment_id), `recall_contacts` (log), `waitlist_entries` (type, date range, day/time prefs, urgency), `waitlist_offers` (stretch).

**Comms:** `notification_queue` (kind: confirmation/reminder_7d/48h/24h/recall/followup/announcement..., scheduled_for, status pending/sending/sent/failed/suppressed, **unique(appointment_id, kind)** dedupe — reschedule upserts), `notification_sends` (immutable send log), `announcements` (superadmin promos/products/services; sends respect marketing_opt_in; **unsubscribe token per patient** — PH DPA requirement).

**Ops:** `private.settings` (clinic_name, **tagline**, logo, brand_hue, timezone, lead_time_min, horizon_days, cancel_window_hours, email provider config) + **public `clinic_branding` view** (name/logo/tagline/hue — needed by public landing + PWA manifest without a session), `lookup_categories`/`lookup_values` (services, products, fees, cancel reasons, payment methods), `user_preferences` (theme, font_size, gamification toggles), `search_recents` + `search_misses` (server-side, per user — never localStorage), `feedback_reports` (**all roles can insert own + read own; superadmin reads all**), `private.audit_log` (append-only, no UPDATE/DELETE grants, 6+yr retention, exempt from purge).

**Slot holds: DEFERRED from v1** (near-zero contention at clinic scale; EXCLUDE + friendly "just taken — pick another" toast suffices). If added later: no volatile predicate in the EXCLUDE (critique caught `WHERE expires_at > now()` is invalid SQL — cron-delete expired rows instead).

**Migration order** — the original numbering is superseded; the file names in `supabase/migrations/` are the truth. Actual, as applied:

`0001` extensions (btree_gist, pgcrypto, citext) + private schema + helpers → `0002` identity + signup trigger + Custom Access Token Hook + audit_log → `0003` audit_row() hotfix → `0004` user_preferences + clinic_branding view (1.1) → `0005` providers + patients + registry RPCs (2.1) → `0006` patients dob timezone hotfix → `0007` claim_or_create_patient citext hotfix → **next: `0008`** lookups/appointment_types/operatories, `0009` settings RPCs + branding storage, `0010` feedback.

Then, unchanged in content but renumbered from here: scheduling + EXCLUDE constraints + action_tokens → clinical → recall/waitlist → notifications/announcements → billing → RLS top-ups → functions (get_available_slots, book_appointment, cancel, reschedule, accept_or_refer, recalc_recalls, enqueue_due_work) → cron → seeds.

RLS and audit are **not** deferred to late migrations as originally drafted: every table ships with its policies, grants and triggers in the same migration that creates it, because a table that exists for even one migration without RLS is a table someone can read.

Phase 2 is built patients-first — 2.1 has no email dependency, so it proceeds while the Brevo signup is outstanding — which is why patients precede lookups here.

**Seeds:** appointment_types w/ research durations (Adult Recall+Prophy 50m, Child Prophy 30m, New Patient Exam 40m, Simple Filling 40m, Crown Prep 90m, Root Canal Molar 90m, Simple Extraction 30m, Emergency 30m + post-buffer 10m, Consultation 20m — all clinic-editable), recall_types (Prophy 180d default, Perio 90d), lookups (cancel reasons, payment methods cash/GCash/card, starter services/fees), 2 operatories, settings (lead_time 120min, horizon 60d, cancel_window 24h). First superadmin seeded by `SETUP_SUPERADMIN_EMAIL` env match, flag self-disables.

---

## Authorization model (flattened — critique-driven)

- Role stored in `profiles.role`, mirrored to `app_metadata` (NEVER user_metadata), injected as **`user_role` JWT claim** by Custom Access Token Hook. **This claim is the single source for middleware AND RLS** (`jwt_role()` helper). Hook also checks `is_active` — deactivated users get no token.
- **RLS kept simple:** patients = own-rows policies; staff/doctor/superadmin = role checks. Nuanced rules (staff must not read clinical note bodies; doctors edit only their own availability) enforced in **server actions** where they're testable — plus RLS still denies staff SELECT on `clinical_notes`/`medical_history_versions`. **Allergy/medical ALERTS are safety info: visible to staff via a narrow field** (alerts jsonb), note bodies are not.
- **Read-audit in the server layer** (not RPC-only-access): every clinical read in a server component/action calls `log_read()` → `private.audit_log` (action, entity, patient_id, actor, role). Writes audited by row triggers with before/after. `/admin/audit` reads via a superadmin-only RPC (private schema isn't in PostgREST).
- Sessions: JWT expiry 15 min + refresh rotation; `IdleTimeoutGuard` (staff 15 min, patient 30) warn-then-logout with draft save — ships with the shell (Phase 1, not Phase 6). Break-glass: CUT (3–5 users; audit log covers it).
- Patient auth = email OTP/magic link only (no passwords). Doctors/staff created by superadmin invite; self-signup always lands as patient.

## Email architecture (critique-driven — no SMTP sockets)

- **One send path:** pg_cron (`*/5`) flips due `notification_queue` rows → `pg_net` POST to `https://<app>/api/jobs/send` (shared-secret header) → route pulls pending rows, renders template, calls **Brevo REST API over HTTPS**, writes `notification_sends`, marks sent/failed (3 retries, backoff).
- **Auth emails (magic links): configure Brevo SMTP in the Supabase dashboard on DAY 0** (built-in mailer = 2/hr, dev-blocking). Send Email Hook unification = post-v1.
- Superadmin email-settings screen (user requirement): provider choice — **Brevo API key (default)** or Custom SMTP (routed via a Supabase Edge Function, port normalized to 465) — plus from-name/address and a **Send test email** button.
- Reminders: **7d → 48h → 24h**; after confirm, remaining "please confirm" touches suppressed, 24h re-templated to "see you tomorrow". Never send for cancelled (structural dedupe + status checks). Every email: date/time in subject, **.ics attached**, tokenized one-click confirm/cancel links (no login).
- **SPF/DKIM/DMARC verified in Phase 2** (when email starts), not at launch — reminders in spam = the system silently failing.

## Frontend structure

Route tree (summary — full tree in module docs): `middleware.ts` (session refresh + `user_role` gate; wrong role → own home, never 404), route groups `(auth) (patient) (staff) (admin)` + public `/book/*`, `/a/[token]`, `/design-system`, `api/slots`, `api/search`, `api/ics/[id]`, `api/jobs/send`. Mutations = server actions (`actions/booking.ts, clinical.ts, patients.ts, availability.ts, preferences.ts, admin.ts, billing.ts`). One `(staff)` group serves doctor+staff (90% shared shell; per-page role variants); doctor-only: `/availability`.

**Tokens (globals.css):** shadcn OKLCH base where every color references **`--brand-hue`** (single number from DB, injected as inline style on `<html>` — rebrand with zero CSS rebuild) × `.dark` class (lightness flip only) = two-axis theming. Clinic-domain semantic tokens: `--status-scheduled/confirmed/in-chair/completed/no-show/cancelled`, `--clinical-healthy/watch/urgent`, `--success/warning/info` (+foreground pairs). Font scaling: `html[data-font-size]` steps 100/112.5/125/137.5% — everything rem; patient routes default 112.5% (18px, health-literacy guidance). Preferences: cookies (SSR-correct first paint, no flash) + `user_preferences` mirror (cross-device; DB wins on login); three-way Light/Dark/System.

**Component inventory (each ships with a skeleton sibling where applicable and a doc in `/docs/design-system/04-components/`):**
- shell: AppSidebar (256/56px/sheet, cookie state), BottomTabBar (role variants: patient `Home·Appointments·[+Book FAB]·Records·Profile`; staff `Today·Schedule·Patients·Search·More`), PageHeader, IdleTimeoutGuard, InstallPrompt (iOS A2HS overlay), OfflineBanner
- booking: ServicePicker, ProviderPicker ("First available" default), DateStrip (horizontal 7–14 days, availability dots — no modal calendar), SlotPicker (Morning/Afternoon/Evening chips, ≥44px, disabled-visible, accessible names "10:30 AM, available, 45 minute cleaning"), BookingSummary (sticky CTA), BookAgainCard, NextAvailableJump, CancellationDialog
- clinical: SoapNoteEditor (+AddendumThread), AllergyAlertBar (pinned in chart layout), MedicalHistoryForm (multi-step, autosave), TreatmentPlanBoard ("3 of 5 visits"), ConsentSigner, ToothSurfaceSelector, DocumentUploader
- shared: AppointmentCard, StatusChip (chip+label+icon — never color-only), EmptyState (3 registers), DataTable (TanStack), SoftDeleteMenu (archive+undo, never "delete"), PatientHeader
- dashboard: KpiCard (number+▲▼delta+sparkline+drill), UtilizationHeatmap, ExceptionQueue, TodayTimeline (now-line), NextPatientCard, DayStatsStrip, GapFillSuggestion, QueueBoard, RecallListTable, WaitlistTable
- billing: InvoiceEditor, InvoiceItemRow, PaymentDialog, ReceiptPrint (print CSS), BalanceCard
- search: CommandK (Recent→Actions→Patients→Appointments→Navigate→Records→Help; role-scoped server API, 200ms debounce; contextual patient mode), SearchSheet (mobile full-screen)
- gamification: CompletenessRing, CheckupCadenceTracker, TreatmentProgress, MilestoneBadge, StreakCard + BrushTimer (optional toggles) — all degrade to plain status when off
- theme: AppearancePanel, ThemeScript

**PWA (Serwist):** manifest generated from `clinic_branding`; precache shell; **NetworkOnly for `/api/*`, `(staff)`, `(admin)`, and `(patient)/records/*`** — never cache PHI; offline = shell + sanitized next-appointment stub + `/offline` page; iOS instruction overlay (no beforeinstallprompt on iOS); push deferred post-v1.

## Documentation set (first-class deliverables)

- `/docs/modules/00-overview.md` (ERD + module map + schema conventions) + **17 module docs** `01-auth-roles … 17-ops` (per delivery design: Purpose · Data Owned · Screens · Rules & Invariants · Role Access Matrix · Open Questions). Written as stubs in Phase 0, filled **before each module's first increment**, updated in the same commit as any change.
- `/docs/design-system/`: `00-principles, 01-tokens, 02-typography, 03-spacing, 04-components/*.md` (fixed template: Anatomy → Variants → Props → States → A11y → Do/Don't → Example → link to live gallery), `05-patterns/` (booking-flow, empty-states, skeletons, soft-delete, navigation, search, gamification, forms-autosave), `06-accessibility, 07-contributing`. Component docs written **when the component is built**, not all upfront.
- `/design-system` live route: every component × variant × theme × font size, admin-gated.
- `CLAUDE.md` (Phase 0): working agreements — session rituals, docs-with-code rule, **"whenever waiting on a background task, tell the user explicitly they can relax / what's pending"**, end every session with a ready-to-copy next prompt, soft-delete/audit conventions, canonical table names.
- `PROGRESS.md` (see below).

## Phases & increments

Every increment ends **deployed to Cloudflare and demoable on a phone**. Pitfall codes P1–P26 from the research are ticked in PROGRESS.md as they're neutralized.

**Phase 0 — Foundation & ops spine**
0.1 Scaffold Next.js + Tailwind v4 + shadcn + `@opennextjs/cloudflare`; Supabase project; CI (lint/typecheck/build/deploy); repo docs skeleton (all module doc stubs), CLAUDE.md, PROGRESS.md. *Accepts: live Cloudflare URL. This is the hosting-risk gate.*
0.2 Auth: email OTP/magic link (Brevo SMTP in Supabase dashboard DAY 0), roles via Custom Access Token Hook (`user_role` claim + is_active check), RLS baseline, soft-delete convention, append-only `private.audit_log`. *Accepts: 4 seeded users land on 4 role homes; deactivated user rejected; a write appears in audit_log.* [P9 P10 P23]
0.3 Nightly pg_dump GitHub Action + **one executed restore drill** documented in 17-ops.md. [P22]

**Phase 1 — Design system core & app shell**
1.1 Token system (brand-hue × dark, font steps, semantic status/clinical tokens), cookie+DB preference persistence, AppearancePanel. *Accepts: theme/font survive reload, SSR-correct first paint.*
1.2 Shell: BottomTabBar + AppSidebar + PageHeader, EmptyState, StatusChip, skeleton pattern, cmdk skeleton (Navigate only), **IdleTimeoutGuard**, `/design-system` route; docs 00–03 + built components' docs. *Accepts: /design-system shows all × both themes × 4 font sizes; axe pass; contrast ≥4.5:1 in CI.* [P24 P25 groundwork]

**Phase 2 — Patients, lookups, settings, email foundation**
2.1 Patient registry: staff walk-in form, self-registration, **email+DOB duplicate warning** (full merge queue deferred), patient roster DataTable. [P13 P14]
2.2 Superadmin: branding (name/logo/**tagline**/brand-hue live preview → public `clinic_branding`), lookups admin (services/products/fees/cancel-reasons/payment-methods + appointment types with editable durations/buffers + operatories), email settings screen (Brevo API default / custom SMTP option + test send), **SPF/DKIM/DMARC verified now**, feedback module (all roles report bugs; superadmin triages). *Accepts: hue change re-brands app; test email arrives; mail-tester ≥9/10.* [P6 P7 groundwork, P19]

**Phase 3 — Scheduling engine (the core)**
3.1 Doctor availability editor + exceptions + blockouts; `get_available_slots` RPC (10-min grid, buffers in conflict math, validation floor: no past/closed/lead-time/horizon — server-side only). *Accepts: correct slots across a DST test week; blockout removes slots.* [P2 P6 P7 P8]
3.2 Appointments + **EXCLUDE constraints** + visit_status; staff FullCalendar week view (per-provider filter, dynamic import); staff booking (walk-in, any provider); drag-reschedule = atomic move logged to appointment_events; provider resolution priority; **doctor accept/refer queue** (acceptance_status + reassignment logged). *Accepts: concurrent double-book — exactly one succeeds AT THE DB (test in CI); reschedule preserves id; referred appointment shows new provider + event trail.* [P1 P4]

**Phase 4 — Patient booking & lifecycle (first patient-visible release)**
4.1 Booking wizard: Service → Provider (skippable) → DateStrip → SlotPicker → single-scroll confirm (sticky CTA); guest booking + dedupe → provisional record; Book-again card; conflict at insert → friendly "just taken" retry (slot holds deferred). *Accepts: phone booking ≤3 screens, ≤2s load, no optimistic UI on the booking write.* [P5 via EXCLUDE+retry]
4.2 Lifecycle: cancel → broken/unscheduled + reason + who (never delete); cancellation-window "request cancellation" staff queue; confirmation email with tokenized no-login confirm/cancel/reschedule + .ics, date/time in subject. *Accepts: emailed link confirms without login; cancelled appt lands in re-booking queue.* [P3 P17 P18]

**Phase 5 — Reminders, recall, follow-ups, waitlist**
5.1 Reminder pipeline: notification_queue + pg_cron/pg_net → `/api/jobs/send` → Brevo REST; 7d/48h/24h; suppress-on-confirm (24h → "see you tomorrow"); reschedule upserts queue rows; full send log; admin failed-sends queue. *Accepts: compressed-window test shows 3 touches, stops on confirm, log complete.* [P15 P16]
5.2 Recall engine: auto-assign prophy on completion, due = last + interval, calculated + override separate, per-patient disable, Recall List + contact log; **follow-up: "book next visit" step in the complete-visit flow** (top-practice pre-booking) + `followup` notification kind. [P20]
5.3 Waitlist: entry capture ("no slot fits? join waitlist") + staff waitlist screen with manual fill from cancellations. Auto-offer tokens = stretch. [P21]

**Phase 6 — Clinical records (structured core)**
6.1 Versioned medical history (pre-visit form link, re-sign at recall), allergies/meds → **AllergyAlertBar** (alerts visible to staff; bodies doctor-only). *Accepts: edit creates new version; allergy shows on appointment + chart.*
6.2 SOAP notes (draft → signed → **immutable, trigger-enforced**; addenda), procedures (code/tooth/surfaces/status/fee), treatment plans + items + progress, consents (version, witness, date ≤ treatment), documents (Supabase Storage, role-checked signed URLs), **server-layer read-audit on all clinical reads**, per-patient export (PDF/JSON) including storage objects. *Accepts: signed note rejects edit, accepts addendum; chart open logs a read; full visit walkthrough (book → arrive → chart → note → complete → recall auto-created).* [P11 P12 P26 groundwork]

**Phase 7 — Billing (full invoicing)**
7.1 Invoices from completed procedures/fee lookups: sequential numbering, line items, discounts, issue/void; PaymentDialog (partial payments, methods); printable receipt (print CSS); patient balance view. 7.2 AR: outstanding balances view, unpaid >30d exception queue, payments report. *Accepts: visit → invoice → partial payment → balance correct everywhere; receipt prints clean.*

**Phase 8 — Dashboards, global search, announcements**
8.1 Dashboards: patient home (hero next-appointment, action-needed strip, quick actions), doctor **Today** (timeline + now-line, pinned NextPatientCard alerts-first, DayStatsStrip, gap→waitlist), staff QueueBoard (arrived/in-chair/done), admin KPIs (today's appointments, no-show rate, chair utilization, recall compliance, outstanding AR) + UtilizationHeatmap + exception queues (unconfirmed / pending-acceptance / failed reminders / overdue recalls / unpaid >30d) with bulk actions.
8.2 Full ⌘K + mobile SearchSheet (role-scoped server API — staff results exclude clinical notes; server-side recents; zero-result logging; contextual patient mode). **Announcements**: superadmin compose/send (products/services/promos) honoring marketing_opt_in + unsubscribe tokens. *Accepts: staff search never returns clinical notes; unsubscribe link works without login.*

**Phase 9 — PWA, hardening, compliance**
Serwist + manifest-from-branding + offline shell (PHI never cached) + iOS install overlay; WCAG 2.2 AA sweep (both themes × 4 font sizes, focus-not-obscured, redundant-entry, reduced-motion); retention/purge policy job (logged, deliberate; 10yr/minors-to-25); DPA checklist in 17-ops.md (DPO, privacy notice, consent, 72h breach plan); second restore drill; mail-tester 10/10. *Accepts: installed PWA on iOS + Android; axe + keyboard pass on booking flow.*

**Phase 10 — Gamification & polish (last, on top of working flows)**
CompletenessRing (day-1 win), CheckupCadenceTracker (recall compliance), TreatmentProgress, provider-endorsed MilestoneBadges; StreakCard + kids BrushTimer as optional toggles; every element behind Settings → Motivation toggle, degrades to plain status, no confetti on medical events, reduced-motion respected. *Accepts: all toggles off = fully usable app.*

**Post-v1 roadmap (explicitly deferred):** graphical odontogram (SVG, Universal+FDI) + perio charting (6-site grid, longitudinal), slot holds w/ countdown, waitlist auto-offers, patient merge queue, Send Email Hook unification, R2 for x-rays, push notifications, prescriptions, Reserve-with-Google. **Cut:** break-glass, overlap-override machinery, SMS, multi-tenant.

## Progress monitoring & working agreements

`PROGRESS.md` at repo root: Snapshot (current phase/increment, deployed URL, last session) + per-phase checklists (⬜🔵✅⛔) with pitfalls-closed line + session log (newest first, each entry ends with explicit `NEXT:`).
**Session-start ritual:** read PROGRESS.md snapshot → read the increment's module doc(s) → re-verify previous increment's acceptance criteria still pass → work.
**Session-end ritual:** update statuses/snapshot, append session-log line with `NEXT:`, update touched module docs, commit, deploy if green, **give the user a ready-to-copy prompt for the next session**.
**Waiting rule (user-mandated):** whenever work pauses on a background task, tell the user in one clear line that they're waiting on X and need to do nothing.

## Ready-to-copy phase prompts

Stored in `/docs/prompts.md` at Phase 0; pattern (one per phase, ready now):

- **P0:** `Read CLAUDE.md and PROGRESS.md. Start Phase 0: scaffold Next.js App Router + Tailwind v4 + shadcn with @opennextjs/cloudflare, connect Supabase, CI + deploy (this is the hosting risk gate — if Cloudflare deploy fails, stop and tell me). Then auth: email OTP/magic link with Brevo SMTP configured in the Supabase dashboard, user_role JWT claim via Custom Access Token Hook with is_active check, RLS baseline, soft-delete convention, append-only audit_log. Then nightly pg_dump GitHub Action + one verified restore drill. Acceptance: live URL, 4 role homes, deactivated user rejected, restore documented. Update PROGRESS.md + docs before finishing.`
- **P1:** `Read CLAUDE.md, PROGRESS.md, /docs/design-system/00-principles.md. Start Phase 1: OKLCH token system (single --brand-hue × .dark, status/clinical semantic tokens, 4 font steps) persisted cookie+DB; app shell (role tab bars, desktop sidebar, IdleTimeoutGuard, cmdk skeleton); EmptyState/StatusChip/skeleton patterns; admin-gated /design-system gallery. Write docs 00–03 + component docs for everything built. Acceptance: SSR-correct theme first paint, axe pass, contrast CI both themes.`
- **P2:** `Read CLAUDE.md, PROGRESS.md, modules 02+03+16. Start Phase 2: patient registry with email+DOB duplicate warning; superadmin branding (name/logo/tagline/hue → clinic_branding view), lookups admin incl. appointment types with editable durations/buffers + operatories, email settings screen (Brevo API default, custom SMTP option, test send), SPF/DKIM/DMARC verification, feedback module. Acceptance: hue re-brands live, test email arrives, mail-tester ≥9/10, duplicate warning fires.`
- **P3:** `Read CLAUDE.md, PROGRESS.md, module 04 — every rule is binding. Start Phase 3: availability editor + exceptions + blockouts; get_available_slots RPC (10-min grid, buffered conflict math, server-side validation floor, DST-safe); appointments with generated tstzrange + both EXCLUDE constraints + visit_status + acceptance_status; staff FullCalendar week view (dynamic import) with atomic drag-reschedule logged to appointment_events; staff walk-in booking; doctor accept/refer queue. Acceptance: CI concurrency test — one of two simultaneous bookings fails at the DB; DST-week slot test passes; reschedule preserves appointment id.`
- **P4:** `Read CLAUDE.md, PROGRESS.md, modules 05+06. Start Phase 4: mobile booking wizard (Service → Provider "First available" → DateStrip → grouped 44px SlotPicker chips → single-scroll confirm, sticky CTA), guest booking with dedupe → provisional record, Book-again card, "just taken" retry; lifecycle: cancel = broken + reason (never delete), cancellation-window request queue, confirmation email with tokenized no-login confirm/cancel/reschedule links + .ics. Acceptance: phone booking ≤3 screens ≤2s; emailed link confirms without login; cancelled appt in re-booking queue.`
- **P5:** `Read CLAUDE.md, PROGRESS.md, modules 07+08+09. Start Phase 5: notification_queue + pg_cron/pg_net → /api/jobs/send → Brevo REST (7d/48h/24h, suppress-on-confirm with 24h re-template, reschedule upserts, send log, failed-sends admin queue); recall engine (auto-assign on completion, calculated+override due, Recall List + contact log, per-patient disable); follow-up pre-booking step on visit completion; waitlist capture + staff manual-fill screen. Acceptance: compressed-window test shows 3 touches stopping on confirm; completed prophy creates next recall; follow-up bookable in the completion flow.`
- **P6:** `Read CLAUDE.md, PROGRESS.md, module 10 — immutability and audit rules are binding. Start Phase 6: versioned medical history + pre-visit form link, AllergyAlertBar (alerts staff-visible, bodies doctor-only), SOAP notes immutable-after-sign + addenda, procedures with tooth/surfaces, treatment plans + item progress, consents (version/witness/date rule), documents via Supabase Storage signed URLs, server-layer read-audit on every clinical read, patient export (PDF/JSON). Acceptance: signed note rejects edit accepts addendum; chart open writes a read audit row; full visit walkthrough passes.`
- **P7:** `Read CLAUDE.md, PROGRESS.md, module 11. Start Phase 7: invoices (sequential numbers, items from procedures/fee lookups, discounts, issue/void), partial payments with methods, printable receipt, patient balance, AR views + unpaid>30d queue + payments report. Acceptance: visit → invoice → partial payment → balances consistent everywhere; receipt prints clean.`
- **P8:** `Read CLAUDE.md, PROGRESS.md, modules 12+13. Start Phase 8: role dashboards (patient hero home; doctor Today timeline + pinned alerts-first NextPatientCard; staff QueueBoard; admin KPIs + utilization heatmap + exception queues with bulk actions); full role-scoped ⌘K + mobile sheet (server recents, zero-result log, contextual patient mode); announcements with marketing_opt_in + unsubscribe tokens. Acceptance: staff search never returns clinical notes; every exception queue drills to an actionable list; unsubscribe works without login.`
- **P9:** `Read CLAUDE.md, PROGRESS.md, module 17. Start Phase 9: Serwist PWA (manifest from branding, offline shell, PHI never cached, iOS install overlay), WCAG 2.2 AA sweep both themes × 4 font sizes, logged retention job, DPA checklist, second restore drill, mail-tester 10/10. Acceptance: installed PWA both platforms; axe + keyboard pass on booking.`
- **P10:** `Read CLAUDE.md, PROGRESS.md, module 15 — ownership over accomplishment, everything behind a toggle, degrade to plain status. Start Phase 10: CompletenessRing, CheckupCadenceTracker, TreatmentProgress, provider MilestoneBadges, optional StreakCard + kids BrushTimer. Acceptance: all toggles off leaves a fully usable app; reduced-motion respected; no confetti on medical events.`

## Verification

- **Per increment:** acceptance criteria demonstrated on the deployed Cloudflare URL; mobile check at 375px + one real phone; axe clean on new routes; both themes at 4 font sizes on changed screens; docs + PROGRESS.md updated.
- **Standing CI:** lint, typecheck, build, contrast check on /design-system, and from Phase 3 the **booking concurrency test** (two simultaneous inserts → exactly one succeeds).
- **Phase gates:** P0 restore drill · P2 mail-tester ≥9 · P3 concurrency + DST tests · P5 send-log audit · P6 immutability + read-audit proof · P9 second restore drill + 10/10 mail-tester.
- **End-to-end demo script** (module 17): register patient → book on phone → confirm via email link → staff check-in → doctor charts + signs note → invoice + partial payment → recall auto-created → reminder fires → export record.

## Costs & risks

$0 at launch (Cloudflare free + Supabase free + Brevo free 300/day + GitHub Actions). Cost ladder if limits bite: Workers Paid $5/mo (bundle size) → Supabase Pro $25/mo (backups/PITR, no idle-pause) → Brevo paid (>300 emails/day). Risks: OpenNext-on-Cloudflare (gated at 0.1), Supabase 7-day idle pause on staging (UptimeRobot ping), no free-tier backups (0.3 mitigates), email deliverability (Phase 2 gate), PH Data Privacy Act paperwork (17-ops.md checklist — non-engineering).
