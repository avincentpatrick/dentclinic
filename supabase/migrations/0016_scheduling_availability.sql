-- 0016: availability rules + exceptions + blockouts + get_available_slots (3.1a)
--
-- The scheduling engine's data layer. PLAN.md § Phase 3 splits the engine into
-- 3.1 (when CAN this be booked) and 3.2 (appointments, the two EXCLUDE
-- constraints, the calendar). This is 3.1's half, and it ships with no UI at
-- all -- supabase/verify/0016-scheduling.sql exercises every rule below before
-- a single component exists, which is the habit that has caught a real bug in
-- every increment since 2.0.
--
-- ---------------------------------------------------------------------------
-- THE VOLATILITY QUESTION 0012 PARKED IS NOW ANSWERED, BY MEASUREMENT.
--
-- 0012's header told Phase 3 to run this before writing appointments:
--
--   select provolatile from pg_proc where proname = 'timestamptz_pl_interval';
--
-- It is 's'. STABLE. So PLAN.md's `time_range tstzrange GENERATED` -- which
-- spells out `starts_at + duration_units * interval '10 minutes'` -- WILL BE
-- REJECTED OUTRIGHT in a stored generated column, and 3.2 must not try it.
-- Measured at the same time, because the answers differ and the difference is
-- what makes this migration possible at all:
--
--   timestamptz + interval                          STABLE     <- the blocker
--   tstzrange(timestamptz, timestamptz, text)       IMMUTABLE  <- blockouts.during
--   int4range(integer, integer, text)               IMMUTABLE  <- rules.minute_range
--   timezone(text, timestamp)                       IMMUTABLE  <- zone conversion
--
-- So a generated column may hold a RANGE BUILT FROM COLUMNS, just not a range
-- built from arithmetic on a timestamptz. Both generated columns below are of
-- the first kind. 3.2's options, in preference order, are recorded in
-- docs/modules/04-scheduling-engine.md rule 3.
--
-- ---------------------------------------------------------------------------
-- WHY WALL-CLOCK `time` AND NOT AN INSTANT.
--
-- "I work 09:00-17:00" must survive a DST transition, a change of the clinic's
-- timezone setting, and a clinic that relocates. An instant freezes the rule to
-- whatever offset was in force on the day somebody typed it. So
-- availability_rules and availability_exceptions store wall clock, and the
-- conversion to an instant happens once per day per window, inside
-- get_available_slots, against the timezone SETTING.
--
-- blockouts are the opposite and deliberately so: a blockout is a span of REAL
-- TIME ("the clinic is shut from Friday 18:00 until Monday 08:00"), so it
-- stores timestamptz. Changing the clinic timezone afterwards does not move
-- existing blockouts, which is the same reasoning that makes 3.2 copy unit
-- counts onto an appointment rather than reading them back from the type.
--
-- ---------------------------------------------------------------------------
-- THE SETTINGS ARE NOT OPTIONAL, AND NOT HARDCODABLE.
--
-- PLAN.md names `timezone`, `lead_time_min` and `horizon_days` in
-- private.settings and seeds them at 120 min / 60 days. They existed in prose
-- and in the /admin "Clinic details" card's description, and in NO migration.
--
-- They could not be hardcoded in get_available_slots, for a reason that is not
-- about tidiness: ASIA/MANILA HAS OBSERVED NO DST SINCE 1978 (measured: zero
-- non-24-hour days in 2027). PLAN's own acceptance criterion for 3.1 is
-- "correct slots across a DST test week", and against a hardcoded 'Asia/Manila'
-- that test cannot fail -- the same family as PROGRESS decision 25's
-- always-truthy goto and decision 31's write assertion by an actor who could
-- not write. Making the zone a setting is what makes the acceptance criterion
-- writable, so the verification points the clinic at America/New_York inside
-- its rolled-back transaction.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- public.my_provider_id(): the caller's own provider row.
--
-- The module's headline access rule is "a doctor edits only their own
-- availability", and the link is providers.profile_id = auth.uid(). That
-- expression appears in six policies below, so it is stated once here.
--
-- IN `public`, NOT `private`, and that is not a style choice. An RLS policy
-- predicate is evaluated as the QUERYING user, so the user needs EXECUTE on
-- anything it calls -- and 0001 revoked schema `private` from `authenticated`.
-- A private helper works fine in a TRIGGER (Postgres does not check EXECUTE
-- when firing one, which is why private.audit_row() is where it is) and fails
-- in a policy. jwt_role() is in public for the same reason.
--
-- `security definer` so the answer does not depend on providers' own RLS
-- staying permissive, and `stable` so it is evaluated once per statement rather
-- than once per row.
-- ---------------------------------------------------------------------------
create or replace function public.my_provider_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.providers p
  where p.profile_id = auth.uid()
    and p.deleted_at is null
  limit 1;
$$;

comment on function public.my_provider_id() is
  'The provider row belonging to the calling login, or null. The single expression behind every '
  '"a doctor edits only their own availability" policy. See docs/modules/04-scheduling-engine.md.';

revoke execute on function public.my_provider_id() from public, anon;
grant  execute on function public.my_provider_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Clinic schedule settings.
--
-- Seeded with PLAN.md § Seeds' values: lead_time 120 min, horizon 60 days.
-- `on conflict do nothing` so re-running this migration against a database
-- where a superadmin has already changed them does not silently reset the
-- clinic's configuration to the defaults.
-- ---------------------------------------------------------------------------
insert into private.settings (key, value, is_secret)
values
  ('timezone',      to_jsonb('Asia/Manila'::text), false),
  ('lead_time_min', to_jsonb(120),                 false),
  ('horizon_days',  to_jsonb(60),                  false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- public.clinic_schedule: the read door.
--
-- A SECOND VIEW RATHER THAN THREE MORE COLUMNS ON clinic_branding, and 0014's
-- own header is why: "The view's NAME is now slightly narrower than its
-- contents ... If a third non-branding key ever lands here, rename it then."
-- Three schedule keys are well past that line, and renaming clinic_branding
-- would touch every branding call site plus the Phase 9 manifest for no
-- behavioural gain. The rule that actually matters -- never `select *`, only
-- named non-secret keys -- is kept in both views.
--
-- Coalesced so a fresh install returns exactly one row even before the seed
-- above, matching how clinic_name, brand_hue and currency are handled.
--
-- Granted to `authenticated` only. PHASE 4 SEAM, recorded and deliberately NOT
-- built: /book is public, and `anon` holds no grant here or on
-- appointment_types, so guest booking will need its own definer-rights door.
-- Same shape as the seam 0012 recorded for bookable services.
-- ---------------------------------------------------------------------------
create or replace view public.clinic_schedule as
select
  coalesce(
    (select value #>> '{}' from private.settings where key = 'timezone'),
    'Asia/Manila'
  ) as timezone,
  coalesce(
    (select (value #>> '{}')::integer from private.settings where key = 'lead_time_min'),
    120
  ) as lead_time_min,
  coalesce(
    (select (value #>> '{}')::integer from private.settings where key = 'horizon_days'),
    60
  ) as horizon_days;

-- THE REVOKE IS THE LOAD-BEARING LINE, NOT THE GRANT.
--
-- Measured on this project: Supabase sets default privileges granting ALL --
-- `arwdDxtm` -- on every new relation in `public` to anon, authenticated and
-- service_role (pg_default_acl, objtype 'r', which covers views). A view
-- created here is therefore anon-readable BEFORE any grant is written, so
-- "grant select to authenticated" would have been decoration on a door that was
-- already open, and the Phase 4 seam above would have been a seam in name only.
--
-- Proven rather than assumed: `create view public._probe as select 1;` inside a
-- rolled-back transaction reports has_table_privilege('anon', …, 'select') =
-- true. The verification asserts the closed state, which is what makes this a
-- check rather than a comment.
--
-- The write privileges go too. A view over private.settings with no INSTEAD OF
-- trigger cannot be written anyway, so they are inert -- but an inert grant
-- that says `authenticated=arwdDxtm` reads, to the next person, as a write path
-- that exists.
revoke all on public.clinic_schedule from anon, authenticated;
grant  select on public.clinic_schedule to authenticated;

-- ---------------------------------------------------------------------------
-- public.update_clinic_schedule: the write path.
--
-- THE ALLOW-LIST IS THE SIGNATURE. 0010 states the rule and the reason:
-- private.settings holds `setup_superadmin_email`, which handle_new_user()
-- reads to promote a matching signup to SUPERADMIN, so a generic
-- set_setting(key, value) is one allow-list mistake away from being a
-- role-escalation primitive that leaves no trace anyone would think to read.
-- With no key parameter there is nothing to forget.
--
-- REPLACE semantics, not patch, matching update_clinic_branding: the form
-- always submits all three fields, so this writes the schedule SET.
--
-- THE TIMEZONE IS VALIDATED AGAINST pg_timezone_names, not against a regex.
-- src/lib/forms/validation.ts will check it with Intl.DateTimeFormat, but V8's
-- tzdata and Postgres's are two databases that can disagree, and the one that
-- decides whether get_available_slots raises at query time -- on the booking
-- path, in front of a patient -- is this one.
-- ---------------------------------------------------------------------------
create or replace function public.update_clinic_schedule(
  p_timezone      text,
  p_lead_time_min integer,
  p_horizon_days  integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_tz     text := nullif(btrim(coalesce(p_timezone, '')), '');
  v_before jsonb;
  v_after  jsonb;
begin
  -- Middleware gates NAVIGATION. A Server Action is a POST of an action id to
  -- whatever path the browser is already on (AGENTS.md), so THIS is the gate.
  if public.jwt_role() <> 'superadmin' or v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_tz is null then
    raise exception 'timezone_required' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    raise exception 'timezone_unknown' using errcode = '22023';
  end if;

  -- Bounds duplicated from src/lib/settings/schedule-schema.ts. forms.md is
  -- explicit that client and server bounds must agree: when they drift the
  -- database rejects what the form accepted and the error has no field to
  -- attach to.
  --
  -- 0 lead time is legal and means "bookable right now" -- a walk-in clinic is
  -- a real configuration. The 7-day ceiling is a guard against a typo that
  -- would make the clinic unbookable rather than a policy.
  if p_lead_time_min is null or p_lead_time_min < 0 or p_lead_time_min > 10080 then
    raise exception 'lead_time_out_of_range' using errcode = '22023';
  end if;
  if p_horizon_days is null or p_horizon_days < 1 or p_horizon_days > 730 then
    raise exception 'horizon_out_of_range' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    into v_before
  from private.settings s
  where s.key in ('timezone', 'lead_time_min', 'horizon_days');

  insert into private.settings (key, value, is_secret, updated_by)
  values
    ('timezone',      to_jsonb(v_tz),           false, v_uid),
    ('lead_time_min', to_jsonb(p_lead_time_min), false, v_uid),
    ('horizon_days',  to_jsonb(p_horizon_days),  false, v_uid)
  on conflict (key) do update
    set value      = excluded.value,
        -- Non-secret by definition: clinic_schedule projects them without
        -- consulting the flag. Asserting it keeps the column honest.
        is_secret  = false,
        updated_by = excluded.updated_by;

  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    into v_after
  from private.settings s
  where s.key in ('timezone', 'lead_time_min', 'horizon_days');

  -- `entity` names the SETTINGS GROUP, not the table -- 0010's reasoning:
  -- settings is a key/value bag with a text key, so 'settings' plus a null
  -- entity_id would tell a future auditor nothing. The diff lives in
  -- before/after.
  insert into private.audit_log (actor_id, actor_role, action, entity, before, after)
  values (v_uid, public.jwt_role(), 'settings_change', 'clinic_schedule', v_before, v_after);
end;
$$;

comment on function public.update_clinic_schedule(text, integer, integer) is
  'Superadmin-only atomic write of the three non-secret scheduling keys in private.settings. '
  'The key allow-list is the signature: there is no key parameter, so no other row -- including '
  'setup_superadmin_email -- is reachable. The timezone is checked against pg_timezone_names, '
  'because that is the tzdata get_available_slots will actually use. '
  'Writes one private.audit_log row with action = settings_change. '
  'See docs/modules/04-scheduling-engine.md.';

revoke execute on function public.update_clinic_schedule(text, integer, integer) from public, anon;
grant  execute on function public.update_clinic_schedule(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- availability_rules: a provider's recurring weekly working window.
--
-- WEEKDAY IS 0 = SUNDAY, matching Postgres extract(dow from date). The stored
-- integer is a database vocabulary, so it is pinned to the thing the SQL below
-- actually compares against rather than to a locale -- a week that renumbers
-- itself would silently change what an existing row MEANS.
--
-- NO `default current_date` ON effective_from. The server is UTC and the clinic
-- is not, so "today" is a question only a caller that knows the clinic's zone
-- can answer -- 0006 is the precedent, where a UTC current_date in a CHECK
-- rejected same-day births throughout Manila office hours. The form supplies
-- it.
--
-- TIMES MUST LAND ON THE TEN-MINUTE GRID. Rejected rather than rounded, which
-- is PROGRESS decision 19 one level up: a rule starting 09:05 produces a whole
-- day of slots at :05 past, every one of them un-bookable against a 3.2
-- appointment grid that starts on the ten. It would store cleanly, pass every
-- other check, and quietly yield a schedule nobody could use.
-- ---------------------------------------------------------------------------
create table public.availability_rules (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references public.providers (id),
  weekday        smallint not null,
  start_time     time not null,
  end_time       time not null,

  -- null = any chair. A rule pinned to an operatory is how a hygienist gets
  -- their own column on the 3.2 calendar.
  operatory_id   uuid references public.operatories (id) on delete set null,

  effective_from date not null,
  effective_to   date,
  note           text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  deleted_by     uuid,

  constraint availability_rules_weekday_range
    check (weekday between 0 and 6),
  constraint availability_rules_ends_after_starts
    check (end_time > start_time),
  constraint availability_rules_start_on_grid
    check ((extract(epoch from start_time)::bigint % 600) = 0),
  constraint availability_rules_end_on_grid
    check ((extract(epoch from end_time)::bigint % 600) = 0),
  constraint availability_rules_effective_range
    check (effective_to is null or effective_to >= effective_from),
  constraint availability_rules_note_len
    check (note is null or length(note) <= 200),

  -- One provider cannot be in two places at once, and the database says so
  -- rather than the app. Keyed on all four dimensions because the same window
  -- on a different weekday, for a different provider, or in a non-overlapping
  -- effective range are all legitimate.
  --
  -- MINUTES SINCE MIDNIGHT, BECAUSE THERE IS NO `timerange`. The built-in range
  -- types are daterange, int4range, int8range, numrange, tsrange and tstzrange
  -- -- that is the entire list, measured -- so the natural spelling of this
  -- constraint does not exist. A rule's window is wall clock and must stay wall
  -- clock, which rules out tstzrange, and tsrange would need a fictional date.
  --
  -- INLINE RATHER THAN A GENERATED COLUMN, and this was a bug before it was a
  -- style choice. A stored generated column is computed BEFORE check
  -- constraints, so with `minute_range` as a column an end time earlier than
  -- the start raised int4range's own
  --   22000  range lower bound must be less than or equal to range upper bound
  -- and availability_rules_ends_after_starts never got to fire. That is a
  -- sentence no clinician should see and a code src/app/actions cannot map to a
  -- field. As an EXCLUDE element the expression is evaluated at index-insertion
  -- time, which is AFTER the CHECKs, so the named constraint wins and the app
  -- gets 23514 with a constraint name on it.
  --
  -- '[)' for the same reason it is mandatory on time_range (0012): two '[]'
  -- ranges sharing an endpoint OVERLAP, so a 09:00-12:00 rule and a 12:00-17:00
  -- rule would collide and a lunch break would be unrepresentable.
  --
  -- PARTIAL ON deleted_at, WHICH MAKES RESTORE FALLIBLE. Archiving a rule can
  -- always succeed; RESTORING one can raise 23P01 if a live rule has taken its
  -- place. That is correct -- the alternative is two live overlapping rules --
  -- but it is the first archive/restore pair in this repo where the restore
  -- direction can fail, and src/app/actions/availability.ts has to turn it into
  -- a sentence rather than letting an exclusion violation reach a doctor.
  constraint availability_rules_no_overlap exclude using gist (
    provider_id with =,
    weekday     with =,
    int4range((extract(epoch from start_time) / 60)::integer,
              (extract(epoch from end_time)   / 60)::integer, '[)') with &&,
    daterange(effective_from, effective_to, '[]') with &&
  ) where (deleted_at is null)
);

comment on table public.availability_rules is
  'A provider''s recurring weekly working window, stored as WALL-CLOCK time so that "I work '
  '09:00-17:00" survives a DST transition and a change of the clinic timezone setting. weekday '
  'is 0 = Sunday, matching extract(dow). Overlaps are impossible by GiST EXCLUDE, not by app '
  'check. See docs/modules/04-scheduling-engine.md.';

create index availability_rules_provider_idx
  on public.availability_rules (provider_id, weekday, start_time)
  where deleted_at is null;

create trigger availability_rules_updated_at
  before update on public.availability_rules
  for each row execute function public.set_updated_at();

create trigger availability_rules_audit
  after insert or update or delete on public.availability_rules
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- availability_exceptions: a single-date deviation.
--
-- 0005's header already named this table and its job, in these words: "'away
-- this week' is an availability exception, not a provider property. Two
-- overlapping liveness concepts on one table is how a scheduler starts booking
-- ghosts."
--
-- An exception REPLACES the day's rules for that provider rather than adding to
-- them -- see get_available_slots. That is what makes "in, but only until noon"
-- expressible without a second concept.
--
-- The CHECK makes both contradictions UNREPRESENTABLE rather than tidied:
-- closed-with-times, and open-without-them. Same shape as 0013's
-- lookup_values_guard -- the database rejects the contradiction instead of
-- guessing which half the author meant.
--
-- `reason` IS covered by the blanket audit trigger, unlike feedback_reports.body
-- (0015). The distinction is deliberate: that column invites 4000 characters of
-- free prose about a patient encounter into a log that is exempt from purge,
-- whereas this is a short label a clinician writes about their own absence,
-- capped at 120 characters, already visible to everyone who can see the
-- schedule. "Who changed my hours, and when" is exactly what the audit log is
-- for, and a schedule change with the reason stripped out would be the less
-- useful record.
-- ---------------------------------------------------------------------------
create table public.availability_exceptions (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references public.providers (id),
  exception_date date not null,
  is_closed      boolean not null default true,
  start_time     time,
  end_time       time,
  reason         text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  deleted_by     uuid,

  constraint availability_exceptions_shape check (
    (is_closed and start_time is null and end_time is null)
    or (not is_closed and start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint availability_exceptions_start_on_grid
    check (start_time is null or (extract(epoch from start_time)::bigint % 600) = 0),
  constraint availability_exceptions_end_on_grid
    check (end_time is null or (extract(epoch from end_time)::bigint % 600) = 0),
  constraint availability_exceptions_reason_len
    check (reason is null or length(reason) <= 120)
);

comment on table public.availability_exceptions is
  'A single-date deviation from a provider''s availability_rules: closed all day, or open for a '
  'replacement window. REPLACES the day''s rules rather than adding to them. `reason` is a short '
  'label visible to everyone who can see the schedule. '
  'See docs/modules/04-scheduling-engine.md.';

-- One exception per provider per day, among live rows. Two would make "which
-- one wins" a question the schema does not answer.
create unique index availability_exceptions_day_key
  on public.availability_exceptions (provider_id, exception_date)
  where deleted_at is null;

create index availability_exceptions_date_idx
  on public.availability_exceptions (exception_date, provider_id)
  where deleted_at is null;

create trigger availability_exceptions_updated_at
  before update on public.availability_exceptions
  for each row execute function public.set_updated_at();

create trigger availability_exceptions_audit
  after insert or update or delete on public.availability_exceptions
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- blockouts: named, coloured spans of real time removed from the schedule.
--
-- SCOPE COLUMNS ARE AN EXTENSION OF PLAN's LIST, recorded rather than smuggled.
-- PLAN.md § Data model specifies "named, colored, tstzrange, schedulable_over"
-- and no scope. Nullable provider_id and operatory_id are added because one
-- table then covers all three real cases -- "closed for Christmas" (both null),
-- "Dr. Cruz at a congress" (provider set), "Op 2 out for repair" (operatory
-- set) -- where the alternative was a multi-day absence becoming N
-- availability_exceptions rows and a chair out of service being unrepresentable
-- at all. AGENTS.md forbids inventing name VARIANTS of canonical tables; this
-- is the canonical table with two more columns.
--
-- NULL MEANS ALL, and the NULL logic in get_available_slots is worth reading
-- twice: a blockout scoped to Op 2 must NOT remove a slot from a provider whose
-- rule is chair-agnostic, because they can simply use another chair.
--
-- schedulable_over = true is a SOFT blockout: it shows on the calendar and
-- slots inside it are still offered. "Lunch, emergencies only" is the case.
-- Default false, because the safe reading of "block this out" is that it blocks.
--
-- ===========================================================================
-- THE RANGE IS AN EXPRESSION INDEX, NOT A GENERATED COLUMN -- AND 3.2 MUST
-- READ THIS BEFORE WRITING appointments.time_range.
--
-- `during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)'))
-- stored` is perfectly legal (tstzrange/3 is IMMUTABLE, measured above) and was
-- written that way first. It is wrong for a reason that has nothing to do with
-- legality: A STORED GENERATED COLUMN IS COMPUTED BEFORE CHECK CONSTRAINTS
-- ARE EVALUATED. So a blockout whose ends_at preceded its starts_at raised
-- tstzrange's own
--
--   22000  range lower bound must be less than or equal to range upper bound
--
-- and blockouts_ends_after_starts NEVER FIRED. The user-visible result is a
-- sentence about range bounds where a sentence about dates belonged, and the
-- app-visible result is a sqlstate with no constraint name for
-- src/app/actions to map to a field. Caught by D8 in
-- supabase/verify/0016-scheduling.sql, which is the fourth increment running
-- where writing the verification first found a defect.
--
-- As an EXPRESSION INDEX the range is built at index-insertion time, which is
-- AFTER ExecConstraints, so the named CHECK wins and the caller gets 23514.
-- The cost is that get_available_slots must spell the expression the same way
-- for the index to be used; it does, and this comment is the reason it must
-- keep doing so.
--
-- 3.2 INHERITS THIS. appointments.time_range is the same shape, and the same
-- trap is waiting: any CHECK on the endpoint columns will be unreachable behind
-- the generation error.
-- ===========================================================================
create table public.blockouts (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,
  color            public.appointment_color not null default 'slate',
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  schedulable_over boolean not null default false,

  provider_id      uuid references public.providers (id) on delete set null,
  operatory_id     uuid references public.operatories (id) on delete set null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid,

  constraint blockouts_label_shape
    check (length(btrim(label)) between 1 and 80),
  constraint blockouts_ends_after_starts
    check (ends_at > starts_at)
);

comment on table public.blockouts is
  'Named, coloured spans of REAL TIME removed from the schedule -- holidays, meetings, a chair '
  'out of service. provider_id/operatory_id are nullable and null means ALL. schedulable_over '
  'marks a soft blockout that is drawn but still bookable. Stored as timestamptz, not wall '
  'clock: changing the clinic timezone later must not move a holiday that already happened. '
  'See docs/modules/04-scheduling-engine.md.';

-- The lookup get_available_slots does on every call. The expression must match
-- the one in that function verbatim or the index is simply never used.
create index blockouts_during_idx
  on public.blockouts using gist (tstzrange(starts_at, ends_at, '[)'))
  where deleted_at is null;

create trigger blockouts_updated_at
  before update on public.blockouts
  for each row execute function public.set_updated_at();

create trigger blockouts_audit
  after insert or update or delete on public.blockouts
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- RLS.
--
-- The doctor rule is the module's headline and it appears in both directions:
-- a doctor reads the whole clinic's schedule (they need to see who else is in)
-- but WRITES only rows whose provider_id is their own. my_provider_id() above
-- is that expression, stated once.
--
-- Doctors also get an Archive-view policy for their OWN archived rows, which
-- is not decoration: without it a doctor can archive a rule and then cannot see
-- it to restore it, and the row is invisible in a way that reads as data loss.
-- ---------------------------------------------------------------------------
alter table public.availability_rules enable row level security;

create policy "clinic reads availability rules"
  on public.availability_rules for select
  using (public.jwt_role() in ('staff', 'doctor', 'superadmin') and deleted_at is null);

create policy "superadmin reads archived availability rules (Archive view)"
  on public.availability_rules for select
  using (public.jwt_role() = 'superadmin' and deleted_at is not null);

create policy "doctors read own archived availability rules (Archive view)"
  on public.availability_rules for select
  using (public.jwt_role() = 'doctor' and deleted_at is not null
         and provider_id = public.my_provider_id());

create policy "superadmin writes availability rules"
  on public.availability_rules for insert
  with check (public.jwt_role() = 'superadmin');

create policy "doctors write own availability rules"
  on public.availability_rules for insert
  with check (public.jwt_role() = 'doctor' and provider_id = public.my_provider_id());

-- No deleted_at filter in USING: archive and restore are both UPDATEs, and a
-- restore has to be able to target an archived row.
create policy "superadmin updates availability rules"
  on public.availability_rules for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

-- WITH CHECK repeats the ownership test on purpose: without it a doctor could
-- UPDATE their own rule and set provider_id to a colleague, which is the same
-- write the INSERT policy refuses.
create policy "doctors update own availability rules"
  on public.availability_rules for update
  using (public.jwt_role() = 'doctor' and provider_id = public.my_provider_id())
  with check (public.jwt_role() = 'doctor' and provider_id = public.my_provider_id());

revoke all    on public.availability_rules from anon;
revoke delete on public.availability_rules from authenticated;
grant  select, insert, update on public.availability_rules to authenticated;

alter table public.availability_exceptions enable row level security;

create policy "clinic reads availability exceptions"
  on public.availability_exceptions for select
  using (public.jwt_role() in ('staff', 'doctor', 'superadmin') and deleted_at is null);

-- Named "exceptions" rather than "availability exceptions": the fuller name is
-- 64 characters and Postgres truncates an identifier at 63, silently, with only
-- a NOTICE -- so the policy in the database would not have been the policy this
-- file claims to create, and a verification matching on the name would fail
-- against a migration that "succeeded".
create policy "superadmin reads archived exceptions (Archive view)"
  on public.availability_exceptions for select
  using (public.jwt_role() = 'superadmin' and deleted_at is not null);

create policy "doctors read own archived exceptions (Archive view)"
  on public.availability_exceptions for select
  using (public.jwt_role() = 'doctor' and deleted_at is not null
         and provider_id = public.my_provider_id());

create policy "superadmin writes availability exceptions"
  on public.availability_exceptions for insert
  with check (public.jwt_role() = 'superadmin');

create policy "doctors write own availability exceptions"
  on public.availability_exceptions for insert
  with check (public.jwt_role() = 'doctor' and provider_id = public.my_provider_id());

create policy "superadmin updates availability exceptions"
  on public.availability_exceptions for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

create policy "doctors update own availability exceptions"
  on public.availability_exceptions for update
  using (public.jwt_role() = 'doctor' and provider_id = public.my_provider_id())
  with check (public.jwt_role() = 'doctor' and provider_id = public.my_provider_id());

revoke all    on public.availability_exceptions from anon;
revoke delete on public.availability_exceptions from authenticated;
grant  select, insert, update on public.availability_exceptions to authenticated;

-- Blockouts are CLINIC POLICY, not a doctor's diary: superadmin writes, the
-- whole clinic reads. A doctor who needs a day off files an exception; a doctor
-- who could edit blockouts could close the clinic.
alter table public.blockouts enable row level security;

create policy "clinic reads blockouts"
  on public.blockouts for select
  using (public.jwt_role() in ('staff', 'doctor', 'superadmin') and deleted_at is null);

create policy "superadmin reads archived blockouts (Archive view)"
  on public.blockouts for select
  using (public.jwt_role() = 'superadmin' and deleted_at is not null);

create policy "superadmin writes blockouts"
  on public.blockouts for insert
  with check (public.jwt_role() = 'superadmin');

create policy "superadmin updates blockouts"
  on public.blockouts for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

revoke all    on public.blockouts from anon;
revoke delete on public.blockouts from authenticated;
grant  select, insert, update on public.blockouts to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_available_slots: THE ENGINE.
--
-- The single owner of the slot walk. Everything downstream -- the Phase 4
-- booking wizard, the 3.2 staff calendar, the Phase 9 waitlist -- ASKS this
-- question and never re-derives it. There is deliberately no second
-- implementation in TypeScript and there must never be one: a scheduler that
-- disagrees with itself is worse than one that is merely slow.
--
-- ===========================================================================
-- HOW DST SAFETY IS ACHIEVED, because the wrong version looks more natural.
--
-- CORRECT: convert each day's window to instants ONCE with `at time zone`, then
-- generate_series over the timestamptz with interval '10 minutes'. A ten-minute
-- step is an ABSOLUTE duration, so the series walks real elapsed time and the
-- transition takes care of itself.
--
-- WRONG: step in local wall clock and convert each candidate. Measured against
-- this database, for a 01:00-05:00 window on the 2027 US transition Sundays:
--
--            correct walk        naive walk
--   Mar 07   24 slots            24 candidates / 24 distinct instants
--   Mar 14   18 slots (23h day)  24 candidates / 18 DISTINCT INSTANTS  <-- bug
--   Nov 07   24 slots (25h day)  24 candidates / 24 distinct instants
--
-- Postgres maps a non-existent local time FORWARD, so 02:30 and 03:30 on
-- 2027-03-14 are THE SAME INSTANT. The naive walk offers six duplicate slots:
-- two offers, one chair, no constraint violated, and the appointment simply
-- gets double-sold.
--
-- FALL-BACK SEMANTICS, chosen rather than inherited: for an ambiguous local
-- time `at time zone` resolves to the SECOND occurrence (standard time), so a
-- window spanning the repeated hour yields the clinic's usual number of
-- wall-clock hours and the repeated hour is not offered twice. That is right
-- for a clinic -- it works its posted hours -- and the verification asserts it.
--
-- Real clinic hours never straddle 02:00, so 09:00-17:00 is unaffected by
-- either transition. The verification therefore uses a deliberately nocturnal
-- window, because it is the only way to make the transition observable at all.
-- ===========================================================================
--
-- ===========================================================================
-- THERE IS NO APPOINTMENT-CONFLICT ARM YET, AND THAT IS NOT AN OVERSIGHT.
--
-- public.appointments does not exist until 3.2, so this function cannot
-- subtract booked time. What it answers today is "when is this provider WORKING
-- and not blocked" -- exactly right for the 3.1b availability editors, and NOT
-- YET SAFE TO BOOK AGAINST.
--
-- Said out loud here, in the module doc and in PROGRESS because this repo has a
-- standing lesson about things that lie by being empty: 2.2b's `currency` key
-- that nothing could read, 2.2d's `app_version` column that would have stayed
-- null forever. A silently-incomplete scheduler is the same defect with worse
-- consequences.
--
-- 3.2's change is ONE `not exists` clause at the marker below, plus a
-- `create or replace`. The function is shaped so that is all it is.
-- ===========================================================================
--
-- `security definer` because it reads private.settings, which 0001 revoked from
-- authenticated. It is therefore responsible for its own authorisation: it
-- refuses anon outright, and refuses a patient asking about a type that is not
-- patient_bookable.
-- ---------------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_appointment_type_id uuid,
  p_from                date,
  p_to                  date,
  p_provider_id         uuid default null,
  p_operatory_id        uuid default null
)
returns table (
  slot_start   timestamptz,
  slot_end     timestamptz,
  provider_id  uuid,
  operatory_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role     text := public.jwt_role();
  v_tz       text;
  v_lead     integer;
  v_horizon  integer;
  v_dur      integer;
  v_pre      integer;
  v_post     integer;
  v_bookable boolean;
  v_floor    timestamptz;
  v_ceiling  timestamptz;
  v_from     date;
  v_to       date;
begin
  if v_role = 'anon' or auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_from is null or p_to is null then
    raise exception 'date_range_required' using errcode = '22023';
  end if;
  -- Bounds the work a single call can ask for. A patient picking dates cannot
  -- reach this; a loop with an off-by-one can.
  if p_to < p_from or (p_to - p_from) > 92 then
    raise exception 'date_range_invalid' using errcode = '22023';
  end if;

  select c.timezone, c.lead_time_min, c.horizon_days
    into v_tz, v_lead, v_horizon
  from public.clinic_schedule c;

  select t.duration_units, t.pre_buffer_units, t.post_buffer_units, t.patient_bookable
    into v_dur, v_pre, v_post, v_bookable
  from public.appointment_types t
  where t.id = p_appointment_type_id
    and t.deleted_at is null;

  if v_dur is null then
    raise exception 'unknown_appointment_type' using errcode = '23503';
  end if;

  -- A patient must not be able to probe the internal-only types by id.
  if v_role = 'patient' and not v_bookable then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- `integer * interval` is IMMUTABLE; it is `timestamptz + interval` that is
  -- only STABLE, which matters for a generated column and not here.
  v_floor   := now() + (v_lead    * interval '1 minute');
  v_ceiling := now() + (v_horizon * interval '1 day');

  -- Clamp the requested window to what the floor and ceiling can possibly
  -- contain, in the CLINIC's calendar rather than the server's. Without this a
  -- caller asking for 92 days walks every one of them to discard most.
  v_from := greatest(p_from, (v_floor   at time zone v_tz)::date);
  v_to   := least   (p_to,   (v_ceiling at time zone v_tz)::date);

  if v_to < v_from then
    return;
  end if;

  return query
  with days as (
    select d::date as day
    from generate_series(v_from, v_to, interval '1 day') d
  ),
  -- Rules for each day, EXCEPT where an exception exists for that provider and
  -- date -- an exception REPLACES the day rather than adding to it.
  rule_windows as (
    select
      r.provider_id,
      r.operatory_id,
      (d.day + r.start_time) at time zone v_tz as w_start,
      (d.day + r.end_time)   at time zone v_tz as w_end
    from days d
    join public.availability_rules r
      on r.deleted_at is null
     and r.weekday = extract(dow from d.day)::smallint
     and r.effective_from <= d.day
     and (r.effective_to is null or r.effective_to >= d.day)
    where (p_provider_id  is null or r.provider_id  = p_provider_id)
      and (p_operatory_id is null or r.operatory_id is null or r.operatory_id = p_operatory_id)
      and not exists (
        select 1
        from public.availability_exceptions e
        where e.deleted_at is null
          and e.provider_id = r.provider_id
          and e.exception_date = d.day
      )
  ),
  -- The other half of "replaces": an open exception contributes its own window.
  -- A closed one contributes nothing, which is how it empties the day.
  exception_windows as (
    select
      e.provider_id,
      null::uuid as operatory_id,
      (e.exception_date + e.start_time) at time zone v_tz as w_start,
      (e.exception_date + e.end_time)   at time zone v_tz as w_end
    from public.availability_exceptions e
    where e.deleted_at is null
      and not e.is_closed
      and e.exception_date between v_from and v_to
      and (p_provider_id is null or e.provider_id = p_provider_id)
  ),
  windows as (
    select * from rule_windows
    union all
    select * from exception_windows
  ),
  -- THE WALK. See the DST block above: the endpoints became instants once,
  -- above, and this steps through real elapsed time.
  --
  -- The bounds are where the buffers enter the conflict math. The buffered
  -- block is [start - pre, start + dur + post) and must fit ENTIRELY inside the
  -- window, so the first bookable start is pre-buffer after the window opens
  -- and the last is dur+post before it closes. generate_series returns zero
  -- rows when start > stop, so a window too short for the appointment simply
  -- yields nothing.
  candidates as (
    select
      w.provider_id,
      w.operatory_id,
      g as starts_at
    from windows w
    cross join lateral generate_series(
      w.w_start + (v_pre * interval '10 minutes'),
      w.w_end   - ((v_dur + v_post) * interval '10 minutes'),
      interval '10 minutes'
    ) g
  )
  select
    c.starts_at as slot_start,
    c.starts_at + (v_dur * interval '10 minutes') as slot_end,
    c.provider_id,
    c.operatory_id
  from candidates c
  where c.starts_at >= v_floor
    and c.starts_at <= v_ceiling
    and not exists (
      select 1
      from public.blockouts b
      where b.deleted_at is null
        and not b.schedulable_over
        -- Spelled exactly as blockouts_during_idx spells it, or the GiST index
        -- is not used. See that index's comment.
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(
              c.starts_at - (v_pre * interval '10 minutes'),
              c.starts_at + ((v_dur + v_post) * interval '10 minutes'),
              '[)')
        -- NULL MEANS ALL, and the null logic here is load-bearing. A blockout
        -- scoped to Op 2 must NOT remove a slot from a chair-agnostic rule
        -- (c.operatory_id is null), because that provider can use another
        -- chair: `b.operatory_id = null` is NULL, so the predicate is not true
        -- and the slot survives. Do not "fix" this by adding an
        -- `or c.operatory_id is null` arm -- that would block on every chair.
        and (b.provider_id  is null or b.provider_id  = c.provider_id)
        and (b.operatory_id is null or b.operatory_id = c.operatory_id)
    )
    -- ~~~ PHASE 3.2 GOES HERE ~~~
    -- and not exists (
    --   select 1 from public.appointments a
    --   where a.deleted_at is null
    --     and a.status = 'scheduled'
    --     and a.time_range && tstzrange(...the same buffered block...)
    --     and (a.provider_id = c.provider_id or a.operatory_id = c.operatory_id)
    -- )
  order by c.starts_at, c.provider_id;
end;
$$;

comment on function public.get_available_slots(uuid, date, date, uuid, uuid) is
  'Bookable ten-minute slots for an appointment type over a date range. Buffers are included in '
  'the fit test; blockouts with schedulable_over = false remove slots; an availability_exception '
  'REPLACES a day''s rules. DST-safe by converting each window to instants once and stepping in '
  'real elapsed time. INCOMPLETE UNTIL 3.2: appointments do not exist yet, so this does not '
  'subtract booked time and is not yet safe to book against. '
  'See docs/modules/04-scheduling-engine.md.';

revoke execute on function public.get_available_slots(uuid, date, date, uuid, uuid) from public, anon;
grant  execute on function public.get_available_slots(uuid, date, date, uuid, uuid) to authenticated;
