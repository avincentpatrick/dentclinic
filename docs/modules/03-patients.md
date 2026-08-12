# Module: Patients

> Status: LIVE since Phase 2.1. Owns the clinic roster — the first PHI in the system —
> plus the duplicate check and the self-registration claim path.

## Purpose
One row per person the clinic treats, whether or not that person has a login. Everything
downstream (appointments, clinical notes, invoices, recalls) keys on `patients.id`, so this
table's identity rules are load-bearing: a person split across two rows is a person whose
allergy list is half missing.

## Data Owned

### `public.providers` (Phase 2.1)
`id`, `profile_id` (nullable), `display_name`, `title`, `is_hygiene`, `sort_order`, plus the
standard timestamps and soft-delete pair.

Created here, ahead of its own module (Phase 3 scheduling), because two Phase 2 columns
point at it — `patients.primary_provider_id` and `operatories.default_provider_id`. A `uuid`
with no FK would have been a dangling reference for an entire phase.

`profile_id` is nullable on purpose: a clinic records a provider before that person has a
login, or for a locum who never gets one. Identity and schedulable-resource are different
things and `profiles` owns the first.

**No `is_active` column.** Archived (`deleted_at`) covers "no longer at the clinic"; "away
this week" is a Phase 3 availability exception, not a provider property. Two overlapping
liveness concepts on one table is how a scheduler starts booking ghosts.

### `public.patients` (Phase 2.1)
Canonical columns from [PLAN.md](../PLAN.md) § Data model — `profile_id` (nullable),
`is_provisional`, `merged_into_id`, `primary_provider_id`, `recall_disabled`,
`marketing_opt_in` — plus demographics (`first_name`/`middle_name`/`last_name`, `email`
`citext`, `dob`, `phone`, `sex`, `address`, emergency contact), consent
(`consent_given_at`/`consent_version`), and the standard timestamps + soft delete.

Three columns are **generated or defaulted**, not app-supplied:

| Column | How | Why |
|---|---|---|
| `patient_number` | `'P' \|\| lpad(nextval(…), 5, '0')` | A front desk needs to name a record out loud without reading a patient's name across a waiting room. Not in PLAN's column list; added because backfilling stable numbers after rows exist is painful. Unique **without** a `deleted_at` predicate — numbers are never reused, not even by an archived record. |
| `full_name` | `first_name \|\| ' ' \|\| last_name`, stored | The roster sorts and searches on it; a stored column keeps that in one place instead of every query. |
| `phone_norm` | last 10 digits of `phone`, stored | So `+63 917 123 4567`, `0917-123-4567` and `9171234567` compare equal in the duplicate check. |

Check constraints: `patients_dob_sane`, `patients_not_merged_into_self`,
`patients_consent_versioned` (consent timestamp and version are set together or not at all).

### Functions
- `public.find_patient_duplicates(email, dob, last_name, phone, exclude)` — `security invoker`,
  staff-side roles only, returns at most 5 ranked matches.
- `public.claim_or_create_patient(…)` — `security definer`, the self-registration path.
- `public.update_own_patient(…)` — `security definer`, the `/profile` edit path.

## Screens (routes)
- `/patients` — roster (staff-side). `/patients/new`, `/patients/[id]`, `/patients/[id]/edit`.
- `/register` — patient self-registration, **post-login** ([ROUTE_RULES](../../src/lib/roles.ts)).
- `/profile` — the patient's own record, in the `(shared)` route group.

## Rules & Invariants

1. **The `(email, dob)` index is deliberately NOT unique** — a documented deviation from
   [PLAN.md](../PLAN.md) § Data model, which specifies `unique(email, dob)`. Three reasons:
   PLAN itself promises a *warning* and defers the merge queue while this table carries
   `merged_into_id` (both presuppose duplicates can exist and be reconciled later); siblings
   sharing one parent's email with the same date of birth are a real dental-clinic case, not
   a hypothetical; and a hard constraint converts a judgement call — "is this the same
   person?" — into an unrecoverable `23505` at the exact moment someone is standing at the
   desk. Staff can see the match and decide; the database cannot. The index still exists, and
   is what makes the check cheap.
2. **The duplicate check runs on submit, server-side — never on blur, never from the client.**
   A blur-triggered check needs an endpoint that answers "is this person a patient here?",
   which is a queryable index of the clinic's roster reachable with a stolen staff session and
   with no server-rendered page to audit against. It is also a safety feature, so it must not
   depend on JavaScript. And `dob` and `email` are independent fields, so blur fires with only
   one of them filled about half the time.
3. **Self-registration takes no email address.** `claim_or_create_patient()` reads it from
   `auth.users` for `auth.uid()` and requires `email_confirmed_at`. That single decision is
   what makes the path un-probeable: with no attacker-supplied selector, the only row
   reachable is the one belonging to a mailbox Supabase Auth has proven the caller controls.
   A version taking an email would be an enumeration endpoint no matter how carefully its
   error messages were worded. **Do not add an email parameter.**
4. **Claiming fills blanks; it never overwrites a clinic-entered value.** A record the front
   desk created is claimed, not duplicated, the first time that person signs in. The
   exceptions are `marketing_opt_in` and consent, where the most recent expression of the
   patient's own wishes must win. A `dob` discrepancy is left for staff to reconcile — the
   audit trigger records before/after, so it is recoverable.
5. **Patients have no INSERT or UPDATE policy on the table.** All patient-originated writes go
   through the two definer RPCs, whose parameter lists *are* the column allow-list. This is
   why no column-guard trigger is needed: `patient_number`, `is_provisional`, `merged_into_id`,
   `primary_provider_id`, `recall_disabled`, `consent_*` and `deleted_at` are unreachable
   because a patient cannot write the table at all. `email` is deliberately absent from
   `update_own_patient` — it is the account identity and the claim key, so changing it belongs
   to Supabase Auth's verified email-change flow; letting it drift here would silently break
   rule 3.
6. **Staff-side reads are split into two policies**, one filtering `deleted_at is null` and one
   named `"clinic reads archived patients (Archive view)"`. Permissive policies OR together so
   the practical grant equals one unfiltered policy — but AGENTS.md makes "RLS filters
   `deleted_at IS NULL`" non-negotiable, and Archive/Undo cannot exist if archived rows are
   unreadable. Naming the exception keeps it visible in `\d` output instead of hiding it in a
   missing predicate. Patients never get it.
7. **UI says Archive, never Delete.** There is no DELETE policy and no DELETE grant.
8. Consent is captured at registration, not at Phase 9. `consent_version` is stamped alongside
   `consent_given_at` so a later change to the privacy notice is detectable per patient.
   Registration without a consent version raises `consent_required`.
9. **`set search_path = ''` means schema-qualify types too.** 0005 shipped `v_email::citext`
   inside a definer function; citext lives in `public`, so it raised
   `type "citext" does not exist` — at run time, on the one path with no staff watching.
   Fixed in 0007 by removing the casts (citext has an implicit cast from text, which is why
   `find_patient_duplicates`, written without casts, worked first time).

**Verified live 2026-08-13** against the deployed project, 21/21 assertions: generated
columns; same email+dob insertable (the twins case); `dob` sanity bounds; staff probe ranks
an email+dob hit as `certain`; **a patient calling the probe gets `forbidden`**; a patient
sees zero foreign rows and cannot INSERT directly (`42501`); self-registration claims the
walk-in row rather than duplicating it, links the profile, clears `is_provisional`, preserves
the clinic-entered name, records consent, and is idempotent on re-submit; registration without
consent is rejected; `update_own_patient` edits allow-listed fields and cannot touch
`patient_number`.

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| Read own patient record | ✔ | ✔ | ✔ | ✔ |
| Read the whole roster | — | ✔ | ✔ | ✔ |
| Read archived patients | — | ✔ | ✔ | ✔ |
| Create a patient (walk-in) | — | ✔ | ✔ | ✔ |
| Self-register / claim own record | ✔ (RPC) | — | — | — |
| Edit own demographics | ✔ (RPC, allow-list) | ✔ | ✔ | ✔ |
| Run the duplicate probe | — | ✔ | ✔ | ✔ |
| Archive / restore | — | ✔ | ✔ | ✔ |
| Hard delete | — | — | — | — |
| Read/write providers | read | read | read | ✔ |

## Open Questions
- **Merge queue** (`merged_into_id` is present but nothing writes it) — deferred to post-v1 per
  PLAN. Until then a confirmed duplicate is archived by hand, which loses the link. Revisit if
  the warning proves to fire often in real use.
- The roster search is `ilike` over a plain btree index. Fine at clinic scale with server-side
  pagination and `max_rows = 1000`; if it degrades, `pg_trgm` is the answer, not a client-side
  filter.
- Should a provisional row created by rule 3's "email already linked" branch appear in a
  dedicated staff review queue rather than only in the roster? Currently `is_provisional`
  is filterable but has no queue of its own — likely folded into the Phase 8 exception queues.
