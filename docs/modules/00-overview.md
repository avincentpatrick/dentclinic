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
- **Soft-delete exemption — config satellites.** A table that is 1:1 with an identity row, has no dependents, offers no archive affordance, and whose "reset" is semantically an UPDATE is exempt from `deleted_at/deleted_by`. It still gets **no DELETE grant**. So far: `user_preferences` (0004) — reasoning in [02-clinic-settings.md](02-clinic-settings.md). Domain, clinical, and financial tables are never exempt.
- **Archive-view exemption (since 2.1).** "RLS always filters `deleted_at IS NULL`" holds for
  every patient-facing policy without exception. Staff-side roles additionally get a second,
  explicitly named policy (`"clinic reads archived patients (Archive view)"`) permitting
  archived rows, because Archive/Undo cannot exist if archived rows are unreadable. Permissive
  policies OR together, so this is equivalent to one unfiltered policy — the split exists so
  the exception is legible in `\d` output rather than hidden inside a missing predicate. Any
  new table with an Archive affordance follows the same two-policy shape.
- **`security definer` + `set search_path = ''` means schema-qualify TYPES too**, not just
  tables and functions. An unqualified `::citext` parses and deploys, then fails at run time
  (0007). Prefer letting an implicit cast do the work.
- **Audit exemption.** Write-audit triggers go on domain/clinical/PHI tables. Personal display preferences are not audited: `private.audit_log` is append-only with 6+ year retention and exempt from purge, so auditing a theme toggle adds permanent rows with no investigative value. `settings_change` is for clinic-wide settings that affect other people.
- **Audit exemption — free-text tables get a NARROW transition trigger, never `audit_row()`.**
  So far: `feedback_reports` (0015). `audit_row()` writes `to_jsonb(new)` — the whole row — and
  a feedback report's `body` is text a human types, into which humans paste patient names no
  matter what the help text says. Because the log is append-only and **exempt from purge**,
  mirroring that body into it would make accidental PHI permanently unpurgeable, created by the
  very feature meant to make the system safer to report problems with. `feedback_status_audit`
  records `{status: old → new}` and `{deleted_at: old → new}` and nothing else; filing writes no
  row at all. Any future table whose columns include user-authored prose follows the same shape.
  Reasoning in [16-feedback.md](16-feedback.md) rule 2.
- Schemas: `public` = domain; `private` = `audit_log`, `action_tokens`, `settings` (never exposed via PostgREST).
- Enums: `app_role` (patient/doctor/staff/superadmin), `appt_status` (scheduled/complete/broken/unscheduled/planned/asap), `visit_status` (none/arrived/in_chair/done), `confirm_status`, `acceptance_status` (pending/accepted/referred).
- Durations are integer counts of **10-minute units**. Appointment conflict math uses the generated `time_range tstzrange` (buffers included); patient-facing UI shows bare duration.
- Migrations live in `supabase/migrations/` (numbered `0001…`), applied via Supabase MCP/CLI, committed with the code that uses them.
- Canonical table names: `docs/PLAN.md` § Data model. If a name here and there disagree, PLAN.md wins.
