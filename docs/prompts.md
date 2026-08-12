# Ready-to-Copy Phase Prompts

Paste the prompt for the phase you're starting. Each assumes the previous phase's acceptance criteria pass. (Source: approved plan — `docs/PLAN.md`.)

## Phase 0 — Foundation & ops spine
```
Read AGENTS.md and PROGRESS.md. Start Phase 0: scaffold Next.js App Router + Tailwind v4 + shadcn with @opennextjs/cloudflare, connect Supabase, CI + deploy (this is the hosting risk gate — if Cloudflare deploy fails, stop and tell me). Then auth: email OTP/magic link with Brevo SMTP configured in the Supabase dashboard, user_role JWT claim via Custom Access Token Hook with is_active check, RLS baseline, soft-delete convention, append-only audit_log. Then nightly pg_dump GitHub Action + one verified restore drill. Acceptance: live URL, 4 role homes, deactivated user rejected, restore documented. Update PROGRESS.md + docs before finishing.
```

## Phase 1 — Design system core & app shell
```
Read AGENTS.md, PROGRESS.md, docs/design-system/00-principles.md. Start Phase 1: OKLCH token system (single --brand-hue × .dark, status/clinical semantic tokens, 4 font steps) persisted cookie+DB; app shell (role tab bars, desktop sidebar, IdleTimeoutGuard, cmdk skeleton); EmptyState/StatusChip/skeleton patterns; admin-gated /design-system gallery. Write docs 00–03 + component docs for everything built. Acceptance: SSR-correct theme first paint, axe pass, contrast CI both themes.
```

## Phase 2 — Patients, lookups, settings, email foundation
```
Read AGENTS.md, PROGRESS.md, docs/modules/02-clinic-settings.md + 03-patients.md + 16-feedback.md. Start Phase 2: patient registry with email+DOB duplicate warning; superadmin branding (name/logo/tagline/hue → clinic_branding view), lookups admin incl. appointment types with editable durations/buffers + operatories, email settings screen (Brevo API default, custom SMTP option, test send), SPF/DKIM/DMARC verification, feedback module. Acceptance: hue re-brands live, test email arrives, mail-tester ≥9/10, duplicate warning fires.
```

## Phase 3 — Scheduling engine
```
Read AGENTS.md, PROGRESS.md, docs/modules/04-scheduling-engine.md — every rule there is binding. Start Phase 3: availability editor + exceptions + blockouts; get_available_slots RPC (10-min grid, buffered conflict math, server-side validation floor, DST-safe); appointments with generated tstzrange + both EXCLUDE constraints + visit_status + acceptance_status; staff FullCalendar week view (dynamic import) with atomic drag-reschedule logged to appointment_events; staff walk-in booking; doctor accept/refer queue. Acceptance: CI concurrency test — one of two simultaneous bookings fails at the DB; DST-week slot test passes; reschedule preserves appointment id.
```

## Phase 4 — Patient booking & lifecycle
```
Read AGENTS.md, PROGRESS.md, docs/modules/05-booking.md + 06-appointments.md. Start Phase 4: mobile booking wizard (Service → Provider "First available" → DateStrip → grouped 44px SlotPicker chips → single-scroll confirm, sticky CTA), guest booking with dedupe → provisional record, Book-again card, "just taken" retry; lifecycle: cancel = broken + reason (never delete), cancellation-window request queue, confirmation email with tokenized no-login confirm/cancel/reschedule links + .ics. Acceptance: phone booking ≤3 screens ≤2s; emailed link confirms without login; cancelled appt in re-booking queue.
```

## Phase 5 — Reminders, recall, follow-ups, waitlist
```
Read AGENTS.md, PROGRESS.md, docs/modules/07-reminders.md + 08-recall.md + 09-waitlist.md. Start Phase 5: notification_queue + pg_cron/pg_net → /api/jobs/send → Brevo REST (7d/48h/24h, suppress-on-confirm with 24h re-template, reschedule upserts, send log, failed-sends admin queue); recall engine (auto-assign on completion, calculated+override due, Recall List + contact log, per-patient disable); follow-up pre-booking step on visit completion; waitlist capture + staff manual-fill screen. Acceptance: compressed-window test shows 3 touches stopping on confirm; completed prophy creates next recall; follow-up bookable in the completion flow.
```

## Phase 6 — Clinical records (structured core)
```
Read AGENTS.md, PROGRESS.md, docs/modules/10-clinical-records.md — immutability and audit rules are binding. Start Phase 6: versioned medical history + pre-visit form link, AllergyAlertBar (alerts staff-visible, bodies doctor-only), SOAP notes immutable-after-sign + addenda, procedures with tooth/surfaces, treatment plans + item progress, consents (version/witness/date rule), documents via Supabase Storage signed URLs, server-layer read-audit on every clinical read, patient export (PDF/JSON). Acceptance: signed note rejects edit accepts addendum; chart open writes a read audit row; full visit walkthrough passes.
```

## Phase 7 — Billing (full invoicing)
```
Read AGENTS.md, PROGRESS.md, docs/modules/11-billing.md. Start Phase 7: invoices (sequential numbers, items from procedures/fee lookups, discounts, issue/void), partial payments with methods, printable receipt, patient balance, AR views + unpaid>30d queue + payments report. Acceptance: visit → invoice → partial payment → balances consistent everywhere; receipt prints clean.
```

## Phase 8 — Dashboards, global search, announcements
```
Read AGENTS.md, PROGRESS.md, docs/modules/12-dashboards.md + 13-global-search.md. Start Phase 8: role dashboards (patient hero home; doctor Today timeline + pinned alerts-first NextPatientCard; staff QueueBoard; admin KPIs + utilization heatmap + exception queues with bulk actions); full role-scoped ⌘K + mobile sheet (server recents, zero-result log, contextual patient mode); announcements with marketing_opt_in + unsubscribe tokens. Acceptance: staff search never returns clinical notes; every exception queue drills to an actionable list; unsubscribe works without login.
```

## Phase 9 — PWA, hardening, compliance
```
Read AGENTS.md, PROGRESS.md, docs/modules/17-ops.md. Start Phase 9: Serwist PWA (manifest from branding, offline shell, PHI never cached, iOS install overlay), WCAG 2.2 AA sweep both themes × 4 font sizes, logged retention job, DPA checklist, second restore drill, mail-tester 10/10. Acceptance: installed PWA both platforms; axe + keyboard pass on booking.
```

## Phase 10 — Gamification & polish
```
Read AGENTS.md, PROGRESS.md, docs/modules/15-gamification.md — ownership over accomplishment, everything behind a toggle, degrade to plain status. Start Phase 10: CompletenessRing, CheckupCadenceTracker, TreatmentProgress, provider MilestoneBadges, optional StreakCard + kids BrushTimer. Acceptance: all toggles off leaves a fully usable app; reduced-motion respected; no confetti on medical events.
```
