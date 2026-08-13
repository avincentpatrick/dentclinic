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
  **Wired in Phase 2.2b** ([src/app/actions/profile.ts](../../src/app/actions/profile.ts)). It was
  the last RPC in the repo with no caller, tracked as PROGRESS decision 10 from 2.1d.

Two later migrations touch this module:

- **0008** adds the missing phone-only arm to `find_patient_duplicates`'s `match_reason`.
  0005's `CASE` had four arms for five reachable match shapes, so a row matched on mobile
  number alone — phone equal, dob absent or different — fell through to
  `'Same surname and date of birth'`, which is simply false, shown to a staff member deciding
  whether two records are the same person. The `rank` arm has the same gap and is left alone:
  scoring a phone-only hit as `possible` is correct, since a shared household number is the
  archetype. Only the label was lying.
- **0009** gives `log_read`'s two id parameters `default null`, so a list read — which has no
  single row to point at — is expressible. It also makes the generated TypeScript render them
  optional rather than required, which is what keeps the call site cast-free.

## Screens (routes)
- `/patients` — roster (staff-side). `/patients/new`, `/patients/[id]`, `/patients/[id]/edit`.
- `/register` — patient self-registration, **post-login** ([ROUTE_RULES](../../src/lib/roles.ts)),
  in the `(patient)` route group and in `PATIENT_SURFACES` so `auto` resolves to comfortable.
- `/profile` — the signed-in person's own record, in the `(shared)` route group. **Built in 2.2b.**

  **Two sections, and that is what makes an ALL_ROLES route honest.** "Your account" — the
  verified email (read-only *text*, deliberately not a disabled `Field`: a greyed-out input
  invites "why can't I fix this", and the answer is that changing it belongs to the verified
  sign-in flow), the role, and the patient number if there is one. Then "Your details" — the
  form, when a `patients` row exists. The email comes from the JWT via `Actor.email`, which is
  free because `getActor()` already calls `getClaims()`.

  A patient with no row gets an `EmptyState` linking to `/register` — **not a redirect**, which
  would steal the back button and read as a loop. A staff-side login with no row is told exactly
  that, and the account section above still makes the page worth reaching, which is what
  justifies the nav entry.

  **The guard is `getActor()`, not `requirePatient()`.** `ROUTE_RULES` grants this route to
  ALL_ROLES, and `update_own_patient` is not role-restricted either — it keys on `auth.uid()` and
  no-ops to `no_patient_record`. A `requirePatient()` guard here would break `/profile` for the
  three roles the route table deliberately grants it to. "There is a session" genuinely is the
  whole check at that layer; the real allow-list is the RPC's parameter list.

  `no_patient_record` (P0002) **is** the existence check — there is no pre-flight query, which
  would be a TOCTOU race plus a round trip. It is reachable two ways: a staff-side user with no
  row replaying the action id (an ordinary error that leaks nothing), and a patient whose record
  was archived between load and submit (the real case, and the message says what to do).

  Reachable from the patient tab bar, and **since 2.2b from the Settings sidebar group for
  staff, doctor and superadmin** — increment 2.0 did explicit work (the `(shared)` group,
  `SHARED_SURFACES`, the `x-role` header) to make this route role-correct, and a route
  deliberately made correct with no way to reach it rots.

### The roster
Server Component, zero client JS apart from `SearchField`, `SoftDeleteMenu` and the toast
bridge. All list state travels in the URL (`q`, `sort`, `dir`, `page`, `archived`), so search,
sorting and pagination are links and a GET form and keep working with JavaScript off.

Three things in the query are load-bearing:

1. **`deleted_at` is filtered explicitly.** Staff hold two permissive SELECT policies (live
   rows, and the named Archive-view exception) and permissive policies OR together, so the
   practical grant is *every* row. The active/archived split is an application filter.
2. **`.order("id")` after the sort column.** Without a stable tiebreak, two rows that sort
   equal — two Maria Santoses, or any two null dobs — can appear on both pages or on neither.
3. **`q` is reduced to an allow-list, not escaped.** A roster search crosses three grammars at
   once: PostgREST's comma-and-paren filter list, SQL `LIKE` metacharacters (`%`, `_`, and `*`
   which PostgREST rewrites to `%`), and URL encoding. Keeping letters, numbers, spaces and
   `. ' - @` makes every one of those hazards unrepresentable. Without it, `Santos, Maria`
   produces a filter string PostgREST cannot parse — a 500 in front of a waiting patient — and
   a bare `%` matches the entire roster.

### The read audit
`public.log_read` had zero call sites before 2.1c. Now four: one row per roster render
(`entity='patients'`, both ids null — "who pulled up the roster, and when"), one per
`/patients/[id]` and `/patients/[id]/edit` render with `patient_id` set, and **since 2.2b one
per `/profile` render**. Logged **after** the row is confirmed readable, never before —
`log_read` is `security definer` and takes caller-supplied ids with no ownership check, so
logging first would record a read of a record RLS then refused to return. Failures are
swallowed: staff must never lose a chart because logging is broken.

**Why `/profile` is audited at all**, when it is someone reading their own record. The counter —
that a patient reading their own chart is not a disclosure event — is true under DPA reasoning
and still loses, because the deciding case is not the patient one. `/profile` is granted to
ALL_ROLES, so a staff, doctor or superadmin whose login is linked to a `patients` row reads a
real chart there; leaving it unaudited would be a hole in "who looked at this patient" reachable
by exactly the roles with the most access. `log_read`'s value is completeness, and a log with a
documented hole is one nobody can rely on in a dispute. Volume is trivially bounded — a handful
of views per person per year.

It uses `entity='patients'`, **not a new `'profile'` entity**: the row already carries
`actor_id`, so self-reads are separable with a query comparing it to the patient's `profile_id`.
A second entity string would split the log for no gain.

**Clinic configuration is not audited on read.** `/admin/lookups` writes are covered by
`audit_row()` with a before/after; a read row per admin page view would be permanent noise in an
append-only table with 6+ year retention. See [02-clinic-settings.md](02-clinic-settings.md).

**There is deliberately no `loading.tsx` under `/patients`.** Without Cache Components a
dynamic route is not prefetched *at all* unless it has a loading boundary; adding one would
make all 25 row links prefetchable and would rest the audit log's correctness on the
framework-internal promise that a prefetch never renders a page body.
`src/lib/audit/log-read.ts` additionally ignores requests carrying `next-router-prefetch`, so
the invariant is stated at the call site rather than inferred. An audit log containing reads
nobody performed is worse than none, because it is confidently wrong in a dispute.

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
9. **The duplicate probe cannot see archived rows.** `find_patient_duplicates` filters
   `deleted_at is null`, so re-creating a patient identical to one that was archived produces
   no warning. That is intentional — an archived record is one staff chose to remove from
   everyday view — but it means the Archived filter, not the warning, is where a "didn't we
   have them already?" question gets answered.
10. **`set search_path = ''` means schema-qualify types too.** 0005 shipped `v_email::citext`
   inside a definer function; citext lives in `public`, so it raised
   `type "citext" does not exist` — at run time, on the one path with no staff watching.
   Fixed in 0007 by removing the casts (citext has an implicit cast from text, which is why
   `find_patient_duplicates`, written without casts, worked first time).

**Verified live 2026-08-13 (2.1c + 2.1d)** — 30/30 assertions driven through a real browser
against the deployed Worker, not locally:

- **Roster** — search filters; a punctuated query (`Santos, Jr. (Sr.) 100%`) returns 200 and
  does *not* wildcard-match the roster; sortable headers set `aria-sort` on the `<th>`.
- **The duplicate warning fires** — "Maria Santos · P00011 — Same email address and date of
  birth · Almost certainly the same person", **with no row inserted** while it is showing, and
  with the ack on the proceed button (`input[type=hidden][name=ack]` count: 0).
- **Editing the email re-runs the check** — the ack changed `9d336850…` → `46a4d97b…` and the
  re-run surfaced a *different* match reason ("Same surname and date of birth"), proving the
  stale ack was rejected rather than honoured.
- **"Create a separate record" inserts the twin** — two live rows share one `(email, dob)`.
- **Phone-only reads "Same mobile number"** (0008). Before that migration this said "Same
  surname and date of birth".
- **Archive/restore** — `deleted_at` and `deleted_by` set and cleared together; archived rows
  appear only under `?archived=1` and never leak into the active roster; Restore works from the
  archived row itself, the WCAG 2.2.1 durable path that does not depend on the toast.
- **Self-registration claims the walk-in without revealing it** — registering with deliberately
  different details (`Mary`, dob 1991-01-01) produced **no new row**: P00011 gained the
  `profile_id`, cleared `is_provisional`, **kept the clinic-entered `Maria` and 1990-05-04**,
  filled the blank address from the patient's submission, and stamped consent. The success
  screen says only "You're registered". Re-submitting is idempotent.
- **Role isolation** — a patient hitting `/patients` lands on `/home`; calling the probe
  directly returns `forbidden`.
- **The read audit is real and not inflated by prefetch** — hovering every roster row link
  moved `private.audit_log` by **exactly 1** (the roster render), and opening one chart by
  exactly 1. This is the empirical check behind having no `loading.tsx` here.

**Verified live 2026-08-13 (2.1 data layer)** against the deployed project, 21/21 assertions: generated
columns; same email+dob insertable (the twins case); `dob` sanity bounds; staff probe ranks
an email+dob hit as `certain`; **a patient calling the probe gets `forbidden`**; a patient
sees zero foreign rows and cannot INSERT directly (`42501`); self-registration claims the
walk-in row rather than duplicating it, links the profile, clears `is_provisional`, preserves
the clinic-entered name, records consent, and is idempotent on re-submit; registration without
consent is rejected; `update_own_patient` edits allow-listed fields and cannot touch
`patient_number`.

**Verified live 2026-08-13 (2.2b, `/profile`)** on the deployed Worker: a patient loads their own
details, edits them, and the change persists across a reload; **an `email` input injected into
the form via devtools does not change `patients.email`**, because the RPC has no parameter for it;
a superadmin sees the account section and "no patient record" rather than an error; and opening
`/profile` once adds **exactly one** `read` row to `private.audit_log` while five `/admin/lookups`
page views add none.

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
