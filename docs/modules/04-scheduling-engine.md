# Module: Scheduling Engine

> Status: **PARTIAL — the data layer is live since Phase 3.1a** (migration 0016). The editors
> (`/availability`, `/admin/blockouts`, `/admin/clinic`) arrive in 3.1b; `appointments`, the two
> EXCLUDE constraints and the calendar arrive in 3.2. Written before the increment per
> AGENTS.md; deltas between the plan and what shipped are marked **AS BUILT** rather than
> quietly rewritten.

## Purpose

This module owns the answer to exactly one question: **when can this be booked?**

Everything downstream — the patient booking wizard (Phase 4), the staff calendar (3.2), the
waitlist (Phase 9), recall (Phase 8) — *asks* that question and never re-derives it.
`public.get_available_slots` is the single owner of the slot walk. There is deliberately no
second implementation in TypeScript, and there must never be one: a scheduler that disagrees
with itself is worse than one that is merely slow.

## Data Owned (tables + key columns)

Canonical names from `docs/PLAN.md` § Data model. `appointment_types` and `operatories` are
**read** here but owned by [`02-clinic-settings.md`](02-clinic-settings.md); `providers` is read
here and was created in 0005 ahead of this module because two Phase 2 columns needed a target.

### `public.availability_rules` (Phase 3.1a, migration 0016)

A provider's recurring weekly working window.

`id`, `provider_id → providers(id)`, `weekday smallint` (**0 = Sunday**, matching Postgres
`extract(dow from …)` — see rule 5), `start_time`/`end_time` as wall-clock `time`,
`operatory_id → operatories(id)` nullable (null = any chair), `effective_from date`,
`effective_to date` nullable (null = open-ended), `note`, plus the standard timestamps and
soft-delete pair.

**Times are stored as wall clock, not as instants, and that is the whole point.** "I work
09:00–17:00" must survive a change of clinic timezone, a DST transition, and a clinic that
relocates. An instant would freeze the rule to whatever offset was in force the day it was
typed.

**AS BUILT — the minutes range is an inline EXCLUDE expression, not a generated column.** It was
written as `minute_range int4range generated always as (…) stored` first, and that is legal but
wrong: a stored generated column is computed *before* CHECK constraints, so a rule whose end
time preceded its start raised `int4range`'s own `22000 range lower bound must be less than or
equal to range upper bound` and `availability_rules_ends_after_starts` **never fired**. As an
EXCLUDE element the expression is evaluated at index-insertion time, which is after the CHECKs,
so the named constraint wins and the app gets a `23514` it can map to a field. See rule 6.

### `public.availability_exceptions` (Phase 3.1a, migration 0016)

A single-date deviation from the rules: *"away on the 3rd"*, or *"in, but only 09:00–12:00"*.

`id`, `provider_id → providers(id)`, `exception_date date`, `is_closed boolean`,
`start_time`/`end_time` nullable, `reason`, plus timestamps and soft delete.

A CHECK makes both invalid combinations **unrepresentable** rather than tidied up: closed with
times, and open without them. Same shape as `lookup_values_guard` in 0013 — the database
rejects the contradiction instead of guessing which half the author meant.

0005's header already anticipated this table in those words: *"'away this week' is an
availability exception, not a provider property."*

### `public.blockouts` (Phase 3.1a, migration 0016)

Named, coloured spans of time removed from the schedule. Holidays, staff meetings, a chair out
for repair.

`id`, `label`, `color appointment_color`, `starts_at`/`ends_at timestamptz`,
`schedulable_over boolean not null default false`, `provider_id` nullable, `operatory_id`
nullable, plus timestamps and soft delete.

**AS BUILT — there is no `during` column.** It shipped as a partial GiST index on the
expression `tstzrange(starts_at, ends_at, '[)')` for the same reason `minute_range` did, and
the failure was identical: as a generated column it beat `blockouts_ends_after_starts` to the
error. `get_available_slots` spells the expression the same way so the index is used — that
coupling is the price, and it is written down at both ends.

**The two nullable scope columns extend PLAN's column list** (which says only *"named, colored,
tstzrange, schedulable_over"*), and the reason is that one table then covers all three real
cases: *"closed for Christmas"* (both null), *"Dr. Cruz at a congress"* (provider set), *"Op 2
out for repair"* (operatory set). The alternative was a multi-day absence becoming N
`availability_exceptions` rows and a chair out of service being unrepresentable. This is an
extension of a canonical table, not a renamed variant, so it stays inside AGENTS.md's rule.

`schedulable_over = true` marks a *soft* blockout — visible on the calendar, but slots inside it
are still offered. "Lunch, emergencies only" is the case.

### `private.settings` keys + `public.clinic_schedule` (Phase 3.1a, migration 0016)

`timezone` (seeded `Asia/Manila`), `lead_time_min` (120), `horizon_days` (60). PLAN's seed
values.

These are read through **`public.clinic_schedule`**, a second definer-rights view beside
`clinic_branding`, and written through **`public.update_clinic_schedule(...)`**.

**Why a second view rather than widening `clinic_branding`.** 0014's own header says it:
*"The view's NAME is now slightly narrower than its contents … If a third non-branding key ever
lands here, rename it then."* Three schedule keys are well past that line, and renaming
`clinic_branding` would touch every branding call site and the Phase 9 manifest for no
behavioural gain. The rule that actually matters — *never `select *`, only named non-secret
keys* — is kept in both views.

**Why the RPC has no `key` parameter.** 0010's rule, restated because it is load-bearing:
**the allow-list IS the signature.** `private.settings` holds `setup_superadmin_email`, which
`handle_new_user()` reads to promote a signup to superadmin, so a generic
`set_setting(key, value)` is one allow-list mistake away from being a silent role-escalation
primitive.

### `public.get_available_slots(...)` (Phase 3.1a, migration 0016)

The engine. See rules 1–4.

## Screens (routes)

**None in 3.1a.** The data layer ships and is verified first; 3.1b builds:

- **`/availability`**, `/availability/new`, `/availability/[id]` — the weekly rules editor. In
  the `(staff)` route group, because that group reads the real claim, which is the whole reason
  it exists (`(admin)` hardcodes `role="superadmin"`). `ROUTE_RULES` already carries
  `{ prefix: "/availability", roles: ["doctor", "superadmin"] }` — no route-table change.
- **`/availability/exceptions`** + `/new` + `/[id]`.
- **`/admin/blockouts`** + `/new` + `/[id]` — superadmin. Blockouts are clinic policy, not a
  doctor's diary, so they sit behind `/admin` rather than under `/availability`. Recorded gap:
  front-desk staff are the people who actually know the clinic is shut on the 9th and they
  cannot reach `/admin`. The fix when it bites is a `/schedule/blockouts` route in 3.2 when the
  staff calendar exists — **not** moving blockouts under `/availability`, which would hand every
  doctor edit rights over clinic-wide closures.
- **`/admin/clinic`** — timezone, lead time, horizon. The `clinic` card in `ADMIN_SECTIONS` has
  read *"Arrives with the scheduling engine"* with no `href` since 2.2a; this is it.
- **The doctor sidebar's "Availability" item goes back** in the same commit as the page.
  `src/lib/shell/nav.ts` carries the instructions in a comment; `check:routes` asserts every nav
  href resolves, so page + nav + `ROUTE_PATTERNS` are one atomic commit.

## Rules & Invariants

### 1. Durations are counts of ten minutes, everywhere

`duration_units`, `pre_buffer_units`, `post_buffer_units` are counts of **ten-minute
increments**, never minutes (AGENTS.md, PLAN § Data model). Minutes exist in exactly one place
in the whole system — `tenMinuteUnits` in `src/lib/forms/validation.ts` — and **nothing else
multiplies or divides by 10.** Non-multiples are rejected, never rounded: a schedule silently
five minutes wrong per appointment is worse than a form error.

### 2. How buffers compose — the formula

Carried verbatim from `0012_scheduling_lookups.sql`'s header, because this is the module that
consumes it:

```
time_range = tstzrange(
  starts_at - pre_buffer_units * interval '10 minutes',
  starts_at + (duration_units + post_buffer_units) * interval '10 minutes',
  '[)')
```

`starts_at` is the moment the **patient is seen**. `pre_buffer` extends the block *before* that
(room set-up, anaesthetic onset); `post_buffer` extends it *after* they leave (turnover,
disinfection). Patient-facing UI shows `duration_units` alone; only the scheduler ever sees the
buffered block.

**`'[)'` is not optional.** Two `'[]'` ranges sharing an endpoint *overlap*, so a 09:00
appointment ending at 09:50 and a 09:50 appointment would collide against 3.2's EXCLUDE
constraints and back-to-back booking would be impossible.

`get_available_slots` applies this to the **candidate** rather than to a stored row: a slot is
offered only if the whole buffered block fits inside an availability window.

### 3. A stored generated column may reference only its own row — and the volatility question is now ANSWERED

0012 recorded two consequences for 3.2 and left the second one open. 3.1a closes it, measured
rather than assumed:

| Function | Volatility | Consequence |
|---|---|---|
| `timestamptz + interval` (`timestamptz_pl_interval`) | **STABLE** | PLAN's `time_range … GENERATED ALWAYS AS (…) STORED` **will be rejected outright** |
| `tstzrange(timestamptz, timestamptz, text)` | IMMUTABLE | a range built **from columns** is legal in a generated column or an index expression |
| `int4range(integer, integer, text)` | IMMUTABLE | same |
| `timezone(text, timestamp)` | IMMUTABLE | zone conversion with an **explicit zone name** is safe anywhere |

**And one more constraint that is not about volatility at all, learned the hard way in 0016 and
inherited by 3.2: a stored generated column is computed BEFORE check constraints.** So any
CHECK guarding the columns a range is generated *from* is unreachable — the range constructor's
own `22000` gets there first, carrying no constraint name for the app to map. Both ranges in
0016 are therefore index/EXCLUDE expressions rather than columns. `appointments.time_range` is
the same shape; 3.2 should assume the same trap.

So **3.2 cannot write PLAN's generated `time_range`.** Its two options, in preference order:
maintain two plain `timestamptz` columns from a BEFORE trigger and generate the range from
those (`tstzrange(ts, ts, text)` is immutable, as measured above), or wrap the arithmetic in an
IMMUTABLE helper — pure-time interval addition on a `timestamptz` genuinely is
timezone-independent, it is only *declared* STABLE because the general case is not.

And the first consequence stands unchanged: **3.2 must COPY `duration_units` /
`pre_buffer_units` / `post_buffer_units` onto each appointment row**, under the same names,
types and bounds. That is not a workaround, it is the correct semantics — re-timing "Crown Prep"
from 90 to 100 minutes must not silently move appointments already booked. **The type is a
TEMPLATE; the appointment records what was actually agreed.**

### 4. DST safety comes from walking INSTANTS, not wall-clock times

This is the rule the module's named acceptance criterion exists to prove, and it is the one an
implementer is most likely to get wrong, because the wrong version looks more natural.

**The correct walk:** convert the window's start and end to `timestamptz` **once**, with
`at time zone <clinic tz>`, then `generate_series(…, interval '10 minutes')` over the
`timestamptz`. A ten-minute step is an absolute duration, so the series walks real elapsed time
and the transition takes care of itself.

**The broken walk:** step in local wall-clock time and convert each candidate. Measured against
the real database, for a 01:00–05:00 window on the 2027 US transition Sundays:

| Sunday 2027 | Window | Correct walk | Naive walk |
|---|---|---|---|
| Mar 7 (ordinary) | 4 h | 24 slots | 24 |
| **Mar 14 (spring forward)** | **3 h** | **18 slots** | 24 candidates → **only 18 distinct instants** |
| Mar 21 (ordinary) | 4 h | 24 slots | 24 |
| Oct 31 (ordinary) | 4 h | 24 slots | 24 |
| **Nov 7 (fall back)** | 4 h | **24 slots** | 24 |

The naive walk produces **six duplicate slots** on spring-forward day, because Postgres maps a
non-existent local time forward: `02:30` and `03:30` on 2027-03-14 are *the same instant*. Two
different offers, one chair, no constraint violated — the booking would simply be double-sold.

**The chosen fall-back semantics, stated explicitly because `at time zone` picks for you:** for
an ambiguous local time, Postgres resolves to the **second** occurrence (standard time). A
01:00–05:00 window on fall-back night therefore yields the clinic's usual four wall-clock hours
and the repeated hour is *not* offered twice. That is the right answer for a clinic — it works
its posted hours — and it is asserted rather than inherited.

**Why the test window is nocturnal.** Real clinic hours never straddle 02:00, so a 09:00–17:00
rule is completely unaffected by either transition and would prove nothing. The verification
uses a deliberately unrealistic window because it is the only way to make the transition
observable.

**And Asia/Manila has observed no DST since 1978** — measured: zero non-24-hour days in 2027.
So the DST test *must* run against a DST-observing zone or it is an assertion that cannot fail,
the same family as decision 25's always-truthy `goto` and decision 31's write assertion by an
actor who could not write. The clinic timezone being a **setting** rather than a constant is
what makes the test writable at all; that is a second, independent reason it could not be
deferred out of 3.1.

### 5. Weekday is `0 = Sunday`, from `extract(dow)`

The stored integer is a database vocabulary. `WEEKDAYS` in the app layer is a frozen array whose
index matches, never `Intl` — a locale that renumbers the week would silently change what a
stored row *means*. Same class as mapping a status enum at the call site.

### 6. Overlapping rules are impossible — enforced by GiST, not by the app

There is **no built-in `timerange` type** (measured: `daterange`, `int4range`, `int8range`,
`numrange`, `tsrange`, `tstzrange`, and that is all). So the overlap constraint keys on an
`int4range` of minutes-since-midnight, inline:

```sql
exclude using gist (
  provider_id with =,
  weekday     with =,
  int4range((extract(epoch from start_time) / 60)::integer,
            (extract(epoch from end_time)   / 60)::integer, '[)') with &&,
  daterange(effective_from, effective_to, '[]') with &&
) where (deleted_at is null)
```

`btree_gist` has been installed since 0001 for exactly this. Verified behaviour: two
non-overlapping windows on one weekday are allowed; **back-to-back windows sharing an endpoint
are allowed** (the `'[)'` rule again, one level up); an overlapping window is rejected; the same
window on a different weekday, for a different provider, or in a non-overlapping effective range
is allowed.

**The trap, measured and worth knowing before 3.1b writes the UI:** the constraint is partial on
`deleted_at is null`, so *archiving is always allowed but **restoring can fail***. Restoring an
archived rule that overlaps a live one raises `23P01`. Archive/restore is a `SoftDeleteMenu`
action that has never been able to fail before, and the restore action must turn that into a
sentence rather than letting a raw exclusion violation reach the user.

### 7. The validation floor is server-side and there is no client copy

No slot in the past; none inside `now() + lead_time_min`; none beyond `now() + horizon_days`;
none outside an availability window; none overlapping a hard blockout. All of it inside the RPC.
The client renders what it is given — it never filters, and it never adds.

### 8. `get_available_slots` has NO appointment-conflict arm yet, and says so out loud

`appointments` does not exist until 3.2, so the function cannot subtract booked time. This is
recorded here, in the function's own comment, and in PROGRESS, because the repo has a standing
lesson about things that lie by being empty — 2.2b's `currency` key that nothing could read,
2.2d's `app_version` column that would have stayed null forever.

**3.2's change is one `not exists` clause and a `create or replace`.** The function is shaped so
that is all it is. Until then the answer it returns is "when is this provider *working* and not
blocked", which is exactly right for the 3.1b editors and **not yet safe to book against.**

### 9. The DB seam for appointment status (from `status-chip.md`, for 3.2)

`cancelled` and `no-show` are **both** `appt_status = 'broken'`, distinguished by reason code.
`in-chair` comes from `visit_status`, `confirmed` from `confirmation_status`.
`src/lib/status/derive.ts` owns the mapping and **still throws by design** — it is implemented in
3.2 against the real `appointments` shape rather than letting each call site guess.

The eight `appointment_color` enum values still have **no tokens and no contrast pairs**. 0012
deferred them to 3.2 with the calendar that first renders them, and 3.1 does not overturn that:
nothing here renders a calendar block, a colour swatch on its own would be colour-as-only-signal,
and `check:contrast` would prove the ratio while nothing proved the hue was right. The blockout
form shows the colour's **name** as text, exactly as appointment types have since 2.2b.

### 10. Time rules for the app layer (3.1b)

The `formatDob` lesson, generalised from dates to times — and the time case is the worse of the
two. A wrong birthday misleads one person; wrong opening hours make a *correct* scheduler look
broken, and the clinic believes the screen.

1. **Never** put a bare `date` or bare `time` through `new Date()` and a converting formatter.
   `new Date("1990-05-04")` is midnight UTC; `new Date("1970-01-01T09:00")` is 09:00 in the
   *server's* zone, which on Workers is UTC. Format from parts.
2. **Never** call `toLocale*` without an explicit `timeZone`. The Worker runs in UTC, so the
   omission renders UTC and nothing fails. Three feedback pages do this today; 3.1b fixes them.
3. **Never** do offset arithmetic. No `+8`, no `getTimezoneOffset()`, no `setHours`. Asia/Manila
   having no DST has made `+8` accidentally correct for two phases; the zone is a setting now.
4. **Never** compute the bookable slot set in TypeScript. Rule 4 lives in Postgres because
   `at time zone` has real tzdata behind it, this repo has no date library, and it must not gain
   one for this.

## Role Access Matrix

| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| Read availability rules / exceptions | — | ✅ | ✅ | ✅ |
| Create / edit / archive **own** rules + exceptions | — | — | ✅ | ✅ |
| Create / edit / archive **another provider's** | — | — | ❌ | ✅ |
| Read blockouts | — | ✅ | ✅ | ✅ |
| Create / edit / archive blockouts | — | — | — | ✅ |
| Read clinic schedule settings (`clinic_schedule`) | ✅ | ✅ | ✅ | ✅ |
| Write clinic schedule settings | — | — | — | ✅ |
| Call `get_available_slots` | ✅ bookable types only | ✅ | ✅ | ✅ |

A doctor's own-ness is `providers.profile_id = auth.uid()`, enforced in RLS **and** re-checked
in the server action — the action turns a silent zero-row update into a sentence. And the doctor
path must **ignore `?provider=` entirely** rather than validating it: a doctor who edits the
query string lands on their own hours, because a permission error is an existence oracle.

## Verification

`supabase/verify/0016-scheduling.sql` — written and run **before any UI existed**, committed and
re-runnable, ending in `ROLLBACK`:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/verify/0016-scheduling.sql
```

**135 checks, all green**, covering structure, the settings door and its RPC, RLS per role in
both directions, the guards, the EXCLUDE constraint, slot correctness against exact expected
counts, **a blockout removing slots (18 → 12) and a `schedulable_over` one removing none**,
exceptions, the validation floor, **the DST week in `America/New_York` with the `Asia/Manila`
regression arm**, and soft delete. Reaching the end is the pass signal; there is no tally, by
design.

**The DST dates are computed, not written down.** `pg_temp.next_dst_transitions()` finds the
next 23-hour and 25-hour local days from tzdata and asserts they are Sundays before using them.
A hardcoded `2027-03-14` would work now and then fall outside the booking horizon, at which
point the engine would correctly return nothing, every assertion would compare zero to zero,
and the file would report a green DST test it had stopped performing.

**Ten of these checks were negative-tested by failing first**, during the writing: A8, A12, A13,
D1, D8, G2, H1, I5, K1 and L5. Two more were negative-tested deliberately, because they are the
gates most likely to rot quietly — **A12** (grant `anon` SELECT back and it goes red) and
**A17**, the 3.2 tripwire (create `public.appointments` and it goes red).

**L5 is worth its own line.** It exists to prove section J's timezone flip was undone, and on the
first real run it failed while the timezone was in fact correct: the "before" values were stashed
in *transaction-scoped* GUCs, which the rollback discarded, so it compared `Asia/Manila` against
`NULL`. Same family as "create the helpers before `begin`" — a rollback takes more with it than
you meant.

## Open Questions

- **`providers` has no admin screen.** It shipped in 0005 because two FKs needed a target, and
  an availability rule *is* a provider's rule. On a fresh install nothing links a login to a
  provider row, so `/availability` would render an empty state for everyone. Either
  `/admin/lookups/providers` joins 3.1b, or the acceptance runbook carries a SQL step — which is
  the thing 2.2a's header argues against for `brand_hue`.
- **Front-desk staff cannot reach blockouts** (see Screens). Deliberate for 3.1; revisit with
  the staff calendar in 3.2.
- **"Copy Monday to the rest of the week"** — a genuinely good affordance that turns
  `createAvailabilityRule` into a bulk insert and makes the `23505`-to-field-error mapping
  inexpressible. Deferred, not forgotten.
- **`cancel_window_hours`** is in PLAN's settings list and is not seeded here — nothing reads it
  until Phase 4 cancellation. Add it with its reader, not before.
- **The unproven negative:** that front-desk staff do *not* see the Availability nav item and are
  bounced off `/availability`. Needs a fourth Playwright fixture role; `navLinks("staff")` is a
  pure function with no unit-test harness in this repo.
