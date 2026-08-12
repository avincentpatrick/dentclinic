# Module Map & Schema Conventions

The system is 17 modules (docs `01`–`17` in this folder). The full approved blueprint — data model, phases, acceptance criteria — is [`docs/PLAN.md`](../PLAN.md); this file is the orientation page.

## Module map

```
                         ┌─────────────────────────────────────────────┐
                         │ 02 Clinic Settings (branding, lookups, email)│
                         └───────────────┬─────────────────────────────┘
 01 Auth & Roles ──┐                     │ feeds durations/fees/labels everywhere
                   ▼                     ▼
 03 Patients ──► 04 Scheduling Engine ──► 06 Appointments ──► 10 Clinical Records ──► 11 Billing
                   ▲     (slots, chairs)      │  lifecycle          │ (SOAP, plans)        (invoices)
 05 Booking ───────┘                          ▼                     ▼
 (patient wizard)                07 Reminders & Comms      08 Recall / Recare ◄─ completing a visit
                                              │                     │
                                              ▼                     ▼
                                 09 Waitlist (fills broken slots)  follow-ups
 Cross-cutting: 12 Dashboards · 13 Global Search · 14 Audit & Security · 15 Gamification · 16 Feedback · 17 Ops
```

## Schema conventions (binding — see also AGENTS.md)

- Every domain table: `id uuid pk default gen_random_uuid()`, `created_at/updated_at timestamptz` (UTC), `deleted_at/deleted_by` soft delete. RLS always filters `deleted_at IS NULL`; unique constraints are partial (`WHERE deleted_at IS NULL`).
- Schemas: `public` = domain; `private` = `audit_log`, `action_tokens`, `settings` (never exposed via PostgREST).
- Enums: `app_role` (patient/doctor/staff/superadmin), `appt_status` (scheduled/complete/broken/unscheduled/planned/asap), `visit_status` (none/arrived/in_chair/done), `confirm_status`, `acceptance_status` (pending/accepted/referred).
- Durations are integer counts of **10-minute units**. Appointment conflict math uses the generated `time_range tstzrange` (buffers included); patient-facing UI shows bare duration.
- Migrations live in `supabase/migrations/` (numbered `0001…`), applied via Supabase MCP/CLI, committed with the code that uses them.
- Canonical table names: `docs/PLAN.md` § Data model. If a name here and there disagree, PLAN.md wins.
