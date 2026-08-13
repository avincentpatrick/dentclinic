-- Verification for 0016_scheduling_availability.sql -- run BEFORE any UI exists.
--
-- HOW TO RUN (needs SUPABASE_DB_URL from .env.local; psql only, no CLI):
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/verify/0016-scheduling.sql
--
-- Every check RAISES on failure, so ON_ERROR_STOP=1 aborts at the first one.
-- The whole run is wrapped in a transaction that ends in ROLLBACK, so it leaves
-- the database exactly as it found it -- including private.settings, which this
-- file deliberately rewrites, and private.audit_log, which is append-only.
--
-- It asserts on the roles as they really are: it SET ROLE authenticated and
-- forges request.jwt.claims, because postgres is a superuser and BYPASSES RLS
-- entirely. A check that runs as postgres proves nothing about a policy.
--
-- ---------------------------------------------------------------------------
-- WHY THE DST DATES ARE COMPUTED AND NOT WRITTEN DOWN.
--
-- Section J needs a day on which the clock actually moves. Hardcoding
-- 2027-03-14 would work today and then, once that date is behind us, fall
-- outside the booking horizon -- so get_available_slots would correctly return
-- nothing, every assertion comparing zero to zero would pass, and the file
-- would report a green DST test it had stopped performing. That is PROGRESS
-- decision 25's always-truthy goto with a calendar attached.
--
-- pg_temp.next_dst_transitions() finds the next 23-hour and 25-hour local days
-- after today, from tzdata, and the section asserts they are Sundays before
-- using them. If a jurisdiction ever changes its rules this file goes RED with
-- a legible message instead of quietly proving nothing.
--
-- And it runs against America/New_York rather than the clinic's own zone
-- because ASIA/MANILA HAS OBSERVED NO DST SINCE 1978 -- asserted in J1, so the
-- premise of that choice is itself checked rather than remembered.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
\timing off

-- ---------------------------------------------------------------------------
-- Helpers.
--
-- Created BEFORE `begin` on purpose. A temp function created inside the
-- transaction is dropped by the ROLLBACK at the end -- which would take the L
-- checks, the ones that PROVE the rollback worked, down with it.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.expect(p_label text, p_cond boolean)
returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL  %', p_label;
  end if;
  raise notice 'ok    %', p_label;
end; $$;

-- For the many checks whose POINT is that the database says no. A statement
-- that succeeds here is the failure.
create or replace function pg_temp.expect_error(
  p_label text, p_sql text, p_sqlstate text default null, p_msg text default null
) returns void language plpgsql as $$
declare v_state text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if p_sqlstate is not null and v_state <> p_sqlstate then
      raise exception 'FAIL  % -- expected sqlstate %, got % (%)', p_label, p_sqlstate, v_state, v_msg;
    end if;
    if p_msg is not null and position(p_msg in v_msg) = 0 then
      raise exception 'FAIL  % -- expected message containing %, got %', p_label, p_msg, v_msg;
    end if;
    raise notice 'ok    %', p_label;
    return;
  end;
  raise exception 'FAIL  % -- statement was ACCEPTED but must be rejected', p_label;
end; $$;

/** Become a signed-in user of the given role, as PostgREST would present them. */
create or replace function pg_temp.act_as(p_uid uuid, p_role text)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'user_role', p_role)::text,
    true);
end; $$;

/**
 * Read private.settings and private.audit_log.
 *
 * `security definer` because 0001 revoked schema `private` from
 * `authenticated`, and the checks below have to run AS authenticated to
 * exercise RLS at all. Without these the B and L sections die on "permission
 * denied for schema private" -- which is the revoke doing its job, not a bug.
 */
create or replace function pg_temp.setting(p_key text)
returns text language sql security definer as $$
  select s.value #>> '{}' from private.settings s where s.key = p_key;
$$;

create or replace function pg_temp.audit_rows(p_entity text)
returns table (action text, actor_role text, actor_id uuid, before jsonb, after jsonb)
language sql security definer as $$
  select l.action, l.actor_role, l.actor_id, l.before, l.after
  from private.audit_log l
  where l.entity = p_entity;
$$;

/**
 * The next spring-forward (23-hour) and fall-back (25-hour) local days in a
 * zone, from tzdata. See the header for why these are computed.
 */
create or replace function pg_temp.next_dst_transitions(p_tz text, p_after date)
returns table (spring_forward date, fall_back date)
language sql stable as $$
  with d as (
    select g::date as day
    from generate_series(p_after, p_after + 400, interval '1 day') g
  ),
  len as (
    select day,
           extract(epoch from (((day + 1)::timestamp at time zone p_tz)
                             - (day::timestamp       at time zone p_tz))) / 3600 as hours
    from d
  )
  select (select min(day) from len where hours = 23),
         (select min(day) from len where hours = 25);
$$;

-- Remember the settings this file is about to overwrite, so L can prove they
-- came back.
--
-- SESSION-SCOPED (`false`) AND SET BEFORE `begin`, for the same reason the
-- helpers above are created out here. A transaction-scoped GUC is discarded by
-- the ROLLBACK -- so with `true` these three read back as NULL afterwards, L5
-- compared 'Asia/Manila' against NULL, and the check that exists to prove the
-- clinic's timezone was restored failed while the timezone was in fact fine.
-- Caught on the first real run of this file, which is the second time the
-- "created inside the transaction" trap has bitten this pattern.
select set_config('verify.tz_before',      pg_temp.setting('timezone'),      false);
select set_config('verify.lead_before',    pg_temp.setting('lead_time_min'), false);
select set_config('verify.horizon_before', pg_temp.setting('horizon_days'),  false);

begin;

-- The actor ids, as transaction-scoped GUCs rather than psql variables.
--
-- psql does NOT interpolate a :'variable' inside a dollar-quoted block, and
-- almost every check below lives in one (0015's lesson, hit while writing it).
do $$ begin
  perform set_config('verify.patient_uid',
    (select id::text from public.profiles where role = 'patient'    and is_active limit 1), true);
  perform set_config('verify.staff_uid',
    (select id::text from public.profiles where role = 'staff'      and is_active limit 1), true);
  perform set_config('verify.doctor_uid',
    (select id::text from public.profiles where role = 'doctor'     and is_active limit 1), true);
  perform set_config('verify.superadmin_uid',
    (select id::text from public.profiles where role = 'superadmin' and is_active limit 1), true);
end $$;

do $$ begin
  perform pg_temp.expect('seed: four distinct active profiles resolved',
    (select count(distinct id) from public.profiles
      where role in ('patient','staff','doctor','superadmin') and is_active) >= 4);
  perform pg_temp.expect('seed: a doctor login exists (the ownership rule needs one)',
    current_setting('verify.doctor_uid', true) is not null);
end $$;

-- ===========================================================================
-- A. Structure
-- ===========================================================================
do $$
declare v_n int;
begin
  perform pg_temp.expect('A1  all three tables exist with RLS enabled',
    (select count(*) from pg_class
      where oid in ('public.availability_rules'::regclass,
                    'public.availability_exceptions'::regclass,
                    'public.blockouts'::regclass)
        and relrowsecurity) = 3);

  perform pg_temp.expect('A2  authenticated has SELECT, INSERT, UPDATE and NOT DELETE on all three',
    (select bool_and(
         has_table_privilege('authenticated', t, 'select')
     and has_table_privilege('authenticated', t, 'insert')
     and has_table_privilege('authenticated', t, 'update')
     and not has_table_privilege('authenticated', t, 'delete'))
     from unnest(array['public.availability_rules',
                       'public.availability_exceptions',
                       'public.blockouts']) t));

  perform pg_temp.expect('A3  anon holds NO privilege on any of the three',
    (select bool_and(not has_table_privilege('anon', t, 'select')
                 and not has_table_privilege('anon', t, 'insert')
                 and not has_table_privilege('anon', t, 'update')
                 and not has_table_privilege('anon', t, 'delete'))
     from unnest(array['public.availability_rules',
                       'public.availability_exceptions',
                       'public.blockouts']) t));

  perform pg_temp.expect('A4  every table carries the soft-delete pair',
    (select count(*) from information_schema.columns
      where table_schema = 'public'
        and table_name in ('availability_rules','availability_exceptions','blockouts')
        and column_name in ('deleted_at','deleted_by')) = 6);

  perform pg_temp.expect('A5  every table has its updated_at and audit triggers',
    (select count(*) from pg_trigger t
      where not t.tgisinternal
        and t.tgrelid in ('public.availability_rules'::regclass,
                          'public.availability_exceptions'::regclass,
                          'public.blockouts'::regclass)
        and t.tgfoid in ('public.set_updated_at'::regproc, 'private.audit_row'::regproc)) = 6);

  -- NOT a generated column, deliberately, and D8 is why: a stored generated
  -- column is computed before CHECK constraints, so tstzrange's raw 22000 beat
  -- blockouts_ends_after_starts to the error and the named constraint could
  -- never fire. See the migration's banner -- 3.2 inherits the same trap.
  perform pg_temp.expect('A6  blockouts has NO generated `during` column',
    (select count(*) from pg_attribute
      where attrelid = 'public.blockouts'::regclass
        and attname = 'during' and not attisdropped) = 0);

  -- The mirror of A6: the minutes range is deliberately NOT a column. A stored
  -- generated column is computed before CHECK constraints, so an end time
  -- earlier than the start raised int4range's raw 22000 and the named
  -- constraint never fired -- see the migration's comment. D1 asserts the
  -- resulting error; this asserts the shape that produces it.
  perform pg_temp.expect('A7  availability_rules has NO generated minute_range column',
    (select count(*) from pg_attribute
      where attrelid = 'public.availability_rules'::regclass
        and attname = 'minute_range' and not attisdropped) = 0);

  perform pg_temp.expect('A8  the GiST EXCLUDE constraint on availability_rules exists and is partial',
    (select count(*) from pg_constraint c
      where c.conrelid = 'public.availability_rules'::regclass
        and c.contype = 'x'
        and pg_get_constraintdef(c.oid) like 'EXCLUDE USING gist%'
        and pg_get_constraintdef(c.oid) like '%deleted_at IS NULL%') = 1);

  perform pg_temp.expect('A9  ...and it keys on all four dimensions',
    (select pg_get_constraintdef(c.oid) like '%provider_id WITH =%'
        and pg_get_constraintdef(c.oid) like '%weekday WITH =%'
        and pg_get_constraintdef(c.oid) like '%int4range%WITH &&%'
        and pg_get_constraintdef(c.oid) like '%daterange%WITH &&%'
       from pg_constraint c
      where c.conrelid = 'public.availability_rules'::regclass and c.contype = 'x'));

  perform pg_temp.expect('A10 one exception per provider per day, among live rows',
    (select count(*) from pg_indexes
      where tablename = 'availability_exceptions'
        and indexdef like '%UNIQUE%'
        and indexdef like '%deleted_at IS NULL%') = 1);

  perform pg_temp.expect('A11 blockouts carries a partial GiST index on the tstzrange expression',
    (select count(*) from pg_indexes
      where tablename = 'blockouts'
        and indexdef like '%USING gist%'
        and indexdef like '%tstzrange%'
        and indexdef like '%deleted_at IS NULL%') = 1);

  perform pg_temp.expect('A12 clinic_schedule is readable by authenticated and NOT by anon',
        has_table_privilege('authenticated', 'public.clinic_schedule', 'select')
    and not has_table_privilege('anon', 'public.clinic_schedule', 'select'));

  -- proconfig stores the setting as `search_path=""` -- WITH the quotes -- not
  -- as `search_path=`. Both spellings are accepted here so the check survives a
  -- server that normalises it differently; what it must never accept is the
  -- setting being absent, which is the 0007 failure mode (an unqualified type
  -- that deploys clean and raises at run time).
  perform pg_temp.expect('A13 all three new functions are security definer with an EMPTY search_path',
    (select bool_and(p.prosecdef
                     and (select bool_or(c in ('search_path=', 'search_path=""'))
                            from unnest(p.proconfig) c))
       from pg_proc p
      where p.oid in ('public.my_provider_id()'::regprocedure,
                      'public.update_clinic_schedule(text,integer,integer)'::regprocedure,
                      'public.get_available_slots(uuid,date,date,uuid,uuid)'::regprocedure)));

  perform pg_temp.expect('A14 anon cannot execute get_available_slots or the settings writer',
        not has_function_privilege('anon', 'public.get_available_slots(uuid,date,date,uuid,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.update_clinic_schedule(text,integer,integer)', 'execute'));

  perform pg_temp.expect('A15 authenticated CAN execute both',
        has_function_privilege('authenticated', 'public.get_available_slots(uuid,date,date,uuid,uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.update_clinic_schedule(text,integer,integer)', 'execute'));

  select count(*) into v_n from private.settings
   where key in ('timezone','lead_time_min','horizon_days');
  perform pg_temp.expect('A16 the three schedule keys are seeded', v_n = 3);

  -- THE 3.2 TRIPWIRE.
  --
  -- get_available_slots ships without an appointment-conflict arm because
  -- public.appointments does not exist. A comment saying so is a comment; this
  -- is the thing that NOTICES. The moment 3.2 creates the table, this check
  -- goes red and stays red until the conflict arm and the comment are both
  -- dealt with -- so the warning cannot outlive the condition it warns about,
  -- and a slot cannot start quietly meaning "free" when it still means "open".
  --
  -- Decision 25 says a check that cannot fail is worse than no check. A warning
  -- that cannot notice it has been addressed is the same bug wearing a hat.
  perform pg_temp.expect('A17 3.2 TRIPWIRE: appointments is absent AND the function still says so',
    to_regclass('public.appointments') is null
    and obj_description('public.get_available_slots(uuid,date,date,uuid,uuid)'::regprocedure, 'pg_proc')
        like '%INCOMPLETE UNTIL 3.2%');
end $$;

-- ===========================================================================
-- B. The settings door and its write path
-- ===========================================================================
set local role authenticated;
do $$ begin perform pg_temp.act_as(current_setting('verify.superadmin_uid')::uuid, 'superadmin'); end $$;

do $$ begin
  perform pg_temp.expect('B1  clinic_schedule returns exactly one row with the seeded defaults',
    (select count(*) = 1 from public.clinic_schedule)
    and (select timezone = 'Asia/Manila' and lead_time_min = 120 and horizon_days = 60
           from public.clinic_schedule));

  perform pg_temp.expect_error('B2  an unknown timezone is REJECTED',
    $q$select public.update_clinic_schedule('Mars/Olympus_Mons', 120, 60)$q$,
    '22023', 'timezone_unknown');

  perform pg_temp.expect_error('B3  a blank timezone is REJECTED',
    $q$select public.update_clinic_schedule('   ', 120, 60)$q$,
    '22023', 'timezone_required');

  perform pg_temp.expect_error('B4  a negative lead time is REJECTED',
    $q$select public.update_clinic_schedule('Asia/Manila', -1, 60)$q$,
    '22023', 'lead_time_out_of_range');

  perform pg_temp.expect_error('B5  a horizon of zero days is REJECTED',
    $q$select public.update_clinic_schedule('Asia/Manila', 120, 0)$q$,
    '22023', 'horizon_out_of_range');

  perform pg_temp.expect_error('B6  a horizon beyond two years is REJECTED',
    $q$select public.update_clinic_schedule('Asia/Manila', 120, 731)$q$,
    '22023', 'horizon_out_of_range');

  -- The accepting direction, so B2..B6 are not passing because EVERYTHING fails.
  perform public.update_clinic_schedule('Asia/Kuala_Lumpur', 30, 45);
  perform pg_temp.expect('B7  a valid write lands, and clinic_schedule reads it back',
    (select timezone = 'Asia/Kuala_Lumpur' and lead_time_min = 30 and horizon_days = 45
       from public.clinic_schedule));

  perform pg_temp.expect('B8  ...and writes exactly one settings_change audit row',
    (select count(*) from pg_temp.audit_rows('clinic_schedule')
      where action = 'settings_change'
        and actor_id = current_setting('verify.superadmin_uid')::uuid) = 1);

  perform pg_temp.expect('B9  ...carrying only the three schedule keys, never a secret',
    (select (s.after ?& array['timezone','lead_time_min','horizon_days'])
        and not (s.after ? 'setup_superadmin_email')
        and (select count(*) from jsonb_object_keys(s.after)) = 3
       from pg_temp.audit_rows('clinic_schedule') s limit 1));

  perform pg_temp.expect('B10 clinic_branding is untouched -- the two doors stay separate',
    (select clinic_name is not null and brand_hue between 0 and 359 from public.clinic_branding));
end $$;

-- The three roles that must not be able to write settings at all.
do $$ begin perform pg_temp.act_as(current_setting('verify.doctor_uid')::uuid, 'doctor'); end $$;
do $$ begin
  perform pg_temp.expect_error('B11 a DOCTOR cannot write schedule settings',
    $q$select public.update_clinic_schedule('Asia/Manila', 120, 60)$q$, '42501', 'forbidden');
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.staff_uid')::uuid, 'staff'); end $$;
do $$ begin
  perform pg_temp.expect_error('B12 STAFF cannot write schedule settings',
    $q$select public.update_clinic_schedule('Asia/Manila', 120, 60)$q$, '42501', 'forbidden');
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.patient_uid')::uuid, 'patient'); end $$;
do $$ begin
  perform pg_temp.expect_error('B13 a PATIENT cannot write schedule settings',
    $q$select public.update_clinic_schedule('Asia/Manila', 120, 60)$q$, '42501', 'forbidden');
  perform pg_temp.expect('B14 ...but a patient CAN read clinic_schedule (Phase 4 needs it)',
    (select count(*) = 1 from public.clinic_schedule));
end $$;

-- anon is the role an unauthenticated PostgREST request arrives as.
reset role;
set local role anon;
select set_config('request.jwt.claims', null, true);
do $$ begin
  perform pg_temp.expect_error('B15 anon cannot read clinic_schedule at all',
    $q$select * from public.clinic_schedule$q$, '42501');
end $$;
reset role;

-- ===========================================================================
-- C. Fixtures -- created through the real policies, as a superadmin
-- ===========================================================================
set local role authenticated;
do $$ begin perform pg_temp.act_as(current_setting('verify.superadmin_uid')::uuid, 'superadmin'); end $$;

do $$
declare
  v_prov_doc uuid;
  v_prov_other uuid;
  v_op uuid;
begin
  -- The doctor's own provider row. THIS is what my_provider_id() resolves, and
  -- without it every ownership check below would pass vacuously against null.
  insert into public.providers (profile_id, display_name, title)
  values (current_setting('verify.doctor_uid')::uuid, 'Verify Doctor', 'DMD')
  returning id into v_prov_doc;

  insert into public.providers (display_name, title)
  values ('Verify Other Provider', 'DMD')
  returning id into v_prov_other;

  insert into public.operatories (name, sort_order)
  values ('Verify Op A', 900)
  returning id into v_op;

  perform set_config('verify.prov_doc',   v_prov_doc::text,   true);
  perform set_config('verify.prov_other', v_prov_other::text, true);
  perform set_config('verify.op',         v_op::text,         true);

  -- 6 units = 60 minutes of chair time, 1 unit of pre-buffer and 1 of post, so
  -- the buffered block is 80 minutes and the buffers are OBSERVABLE in the slot
  -- maths rather than merely stored.
  insert into public.appointment_types
    (name, duration_units, pre_buffer_units, post_buffer_units, patient_bookable)
  values ('Verify Buffered 60m', 6, 1, 1, true);
  perform set_config('verify.type_buffered',
    (select id::text from public.appointment_types where name = 'Verify Buffered 60m'), true);

  -- 1 unit, no buffers: the clean probe the DST counts are computed against.
  insert into public.appointment_types
    (name, duration_units, pre_buffer_units, post_buffer_units, patient_bookable)
  values ('Verify Probe 10m', 1, 0, 0, true);
  perform set_config('verify.type_probe',
    (select id::text from public.appointment_types where name = 'Verify Probe 10m'), true);

  -- An internal-only type, to prove a patient cannot probe it by id.
  insert into public.appointment_types
    (name, duration_units, pre_buffer_units, post_buffer_units, patient_bookable)
  values ('Verify Internal 10m', 1, 0, 0, false);
  perform set_config('verify.type_internal',
    (select id::text from public.appointment_types where name = 'Verify Internal 10m'), true);

  perform pg_temp.expect('C1  fixtures created: two providers, one chair, three appointment types',
    v_prov_doc is not null and v_prov_other is not null and v_op is not null);

  perform pg_temp.expect('C2  my_provider_id() resolves nothing for the SUPERADMIN (no provider row)',
    public.my_provider_id() is null);
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.doctor_uid')::uuid, 'doctor'); end $$;
do $$ begin
  perform pg_temp.expect('C3  my_provider_id() resolves the DOCTOR''s own provider row',
    public.my_provider_id() = current_setting('verify.prov_doc')::uuid);
end $$;
do $$ begin perform pg_temp.act_as(current_setting('verify.superadmin_uid')::uuid, 'superadmin'); end $$;

-- ===========================================================================
-- D. The guards -- contradictions are UNREPRESENTABLE, not tidied
-- ===========================================================================
do $$ begin
  perform pg_temp.expect_error('D1  a rule ending before it starts is REJECTED',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
       values (current_setting('verify.prov_doc')::uuid, 1, '17:00', '09:00', '2026-01-01')$q$,
    '23514', 'availability_rules_ends_after_starts');

  perform pg_temp.expect_error('D2  weekday 7 is REJECTED (0 = Sunday, 6 = Saturday)',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
       values (current_setting('verify.prov_doc')::uuid, 7, '09:00', '17:00', '2026-01-01')$q$,
    '23514', 'availability_rules_weekday_range');

  perform pg_temp.expect_error('D3  a start time off the ten-minute grid is REJECTED, not rounded',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
       values (current_setting('verify.prov_doc')::uuid, 1, '09:05', '17:00', '2026-01-01')$q$,
    '23514', 'availability_rules_start_on_grid');

  perform pg_temp.expect_error('D4  ...and so is an end time off the grid',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
       values (current_setting('verify.prov_doc')::uuid, 1, '09:00', '16:55', '2026-01-01')$q$,
    '23514', 'availability_rules_end_on_grid');

  perform pg_temp.expect_error('D5  an effective range that ends before it begins is REJECTED',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from, effective_to)
       values (current_setting('verify.prov_doc')::uuid, 1, '09:00', '17:00', '2026-06-01', '2026-01-01')$q$,
    '23514', 'availability_rules_effective_range');

  perform pg_temp.expect_error('D6  an exception that is CLOSED but carries times is REJECTED',
    $q$insert into public.availability_exceptions (provider_id, exception_date, is_closed, start_time, end_time)
       values (current_setting('verify.prov_doc')::uuid, '2026-12-25', true, '09:00', '12:00')$q$,
    '23514', 'availability_exceptions_shape');

  perform pg_temp.expect_error('D7  an exception that is OPEN with no times is REJECTED',
    $q$insert into public.availability_exceptions (provider_id, exception_date, is_closed)
       values (current_setting('verify.prov_doc')::uuid, '2026-12-25', false)$q$,
    '23514', 'availability_exceptions_shape');

  perform pg_temp.expect_error('D8  a blockout ending before it starts is REJECTED',
    $q$insert into public.blockouts (label, starts_at, ends_at)
       values ('backwards', now() + interval '2 hours', now() + interval '1 hour')$q$,
    '23514', 'blockouts_ends_after_starts');

  perform pg_temp.expect_error('D9  a blank blockout label is REJECTED',
    $q$insert into public.blockouts (label, starts_at, ends_at)
       values ('   ', now() + interval '1 hour', now() + interval '2 hours')$q$,
    '23514', 'blockouts_label_shape');
end $$;

-- ===========================================================================
-- E. The EXCLUDE constraint -- one provider cannot be in two places at once
-- ===========================================================================
do $$ begin
  -- The ACCEPTING direction first, so the rejections below are not passing
  -- because everything fails.
  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (current_setting('verify.prov_doc')::uuid, 1, '09:00', '12:00', '2026-01-01');
  perform pg_temp.expect('E1  a morning rule is accepted',
    (select count(*) from public.availability_rules
      where provider_id = current_setting('verify.prov_doc')::uuid and weekday = 1) = 1);

  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (current_setting('verify.prov_doc')::uuid, 1, '13:00', '17:00', '2026-01-01');
  perform pg_temp.expect('E2  a non-overlapping afternoon rule is accepted (a lunch break)',
    (select count(*) from public.availability_rules
      where provider_id = current_setting('verify.prov_doc')::uuid and weekday = 1) = 2);

  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (current_setting('verify.prov_doc')::uuid, 1, '12:00', '13:00', '2026-01-01');
  perform pg_temp.expect('E3  a BACK-TO-BACK rule sharing both endpoints is accepted -- the ''[)'' rule',
    (select count(*) from public.availability_rules
      where provider_id = current_setting('verify.prov_doc')::uuid and weekday = 1) = 3);

  perform pg_temp.expect_error('E4  an OVERLAPPING rule is rejected by the database, not the app',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
       values (current_setting('verify.prov_doc')::uuid, 1, '11:00', '14:00', '2026-01-01')$q$,
    '23P01');

  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (current_setting('verify.prov_doc')::uuid, 2, '11:00', '14:00', '2026-01-01');
  perform pg_temp.expect('E5  the same window on a DIFFERENT weekday is accepted',
    (select count(*) from public.availability_rules
      where provider_id = current_setting('verify.prov_doc')::uuid and weekday = 2) = 1);

  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from, effective_to)
  values (current_setting('verify.prov_doc')::uuid, 1, '11:00', '14:00', '2025-01-01', '2025-12-31');
  perform pg_temp.expect('E6  the same window in a NON-OVERLAPPING effective range is accepted',
    (select count(*) from public.availability_rules
      where provider_id = current_setting('verify.prov_doc')::uuid
        and effective_to = '2025-12-31') = 1);

  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (current_setting('verify.prov_other')::uuid, 1, '11:00', '14:00', '2026-01-01');
  perform pg_temp.expect('E7  the same window for a DIFFERENT provider is accepted',
    (select count(*) from public.availability_rules
      where provider_id = current_setting('verify.prov_other')::uuid) = 1);
end $$;

-- The trap: the constraint is partial on deleted_at, so RESTORE can fail where
-- ARCHIVE never does. 3.1b's restore action has to turn this into a sentence.
do $$
declare v_id uuid;
begin
  insert into public.availability_rules
    (provider_id, weekday, start_time, end_time, effective_from, deleted_at, deleted_by)
  values (current_setting('verify.prov_doc')::uuid, 1, '11:00', '14:00', '2026-01-01',
          now(), current_setting('verify.superadmin_uid')::uuid)
  returning id into v_id;
  perform pg_temp.expect('E8  an ARCHIVED overlapping rule is accepted -- the partial predicate',
    v_id is not null);
  perform set_config('verify.archived_rule', v_id::text, true);

  perform pg_temp.expect_error('E9  ...but RESTORING it is rejected, because a live rule now overlaps',
    $q$update public.availability_rules set deleted_at = null, deleted_by = null
        where id = current_setting('verify.archived_rule')::uuid$q$,
    '23P01');

  -- An archived rule belonging to somebody ELSE, so F9 can prove a doctor's
  -- Archive view is scoped rather than merely non-empty.
  insert into public.availability_rules
    (provider_id, weekday, start_time, end_time, effective_from, deleted_at, deleted_by)
  values (current_setting('verify.prov_other')::uuid, 5, '09:00', '10:00', '2026-01-01',
          now(), current_setting('verify.superadmin_uid')::uuid)
  returning id into v_id;
  perform set_config('verify.archived_other', v_id::text, true);
end $$;

-- ===========================================================================
-- F. RLS -- a doctor edits only their own
-- ===========================================================================
do $$ begin perform pg_temp.act_as(current_setting('verify.doctor_uid')::uuid, 'doctor'); end $$;

do $$
declare v_id uuid; v_rows int;
begin
  -- The ACCEPTING direction. 0015's lesson, restated: a write assertion is only
  -- an assertion when the actor CAN write -- an UPDATE no policy grants matches
  -- zero rows and "succeeds" without ever reaching the constraint.
  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (current_setting('verify.prov_doc')::uuid, 3, '09:00', '17:00', '2026-01-01')
  returning id into v_id;
  perform pg_temp.expect('F1  a doctor CAN create a rule for their own provider row', v_id is not null);
  perform set_config('verify.doc_rule', v_id::text, true);

  update public.availability_rules set end_time = '16:00' where id = v_id;
  perform pg_temp.expect('F2  ...and can edit it',
    (select end_time = '16:00' from public.availability_rules where id = v_id));

  perform pg_temp.expect_error('F3  a doctor CANNOT create a rule for ANOTHER provider',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
       values (current_setting('verify.prov_other')::uuid, 4, '09:00', '17:00', '2026-01-01')$q$,
    '42501');

  -- The reassignment hole the WITH CHECK on the update policy closes.
  perform pg_temp.expect_error('F4  a doctor CANNOT reassign their own rule to another provider',
    $q$update public.availability_rules
          set provider_id = current_setting('verify.prov_other')::uuid
        where id = current_setting('verify.doc_rule')::uuid$q$,
    '42501');

  -- ROW_COUNT rather than a data-modifying CTE: `with u as (update ...)` is only
  -- legal at the top level of a statement, not nested inside the scalar
  -- subquery an expect() argument is.
  update public.availability_rules set end_time = '23:00'
   where provider_id = current_setting('verify.prov_other')::uuid;
  get diagnostics v_rows = row_count;
  perform pg_temp.expect('F5  a doctor cannot EDIT another provider''s rule (zero rows, not an error)',
    v_rows = 0);

  perform pg_temp.expect('F6  ...and that row really is unchanged -- F5 alone proves nothing',
    (select count(*) from public.availability_rules
      where provider_id = current_setting('verify.prov_other')::uuid and end_time = '23:00') = 0);

  perform pg_temp.expect('F7  a doctor READS the whole clinic''s live rules, not just their own',
    (select count(*) from public.availability_rules
      where provider_id = current_setting('verify.prov_other')::uuid) = 1);

  -- The Archive view a doctor genuinely needs: without it they can archive
  -- their own rule and then not see it to restore it, which reads as data loss.
  perform pg_temp.expect('F8  a doctor CAN see their OWN archived rule, so restore is reachable',
    (select count(*) from public.availability_rules
      where id = current_setting('verify.archived_rule')::uuid and deleted_at is not null) = 1);

  perform pg_temp.expect('F9  ...but NOT another provider''s archived rule -- the view is scoped',
    (select count(*) from public.availability_rules
      where id = current_setting('verify.archived_other')::uuid) = 0);

  perform pg_temp.expect_error('F10 a doctor cannot write a blockout -- that is clinic policy',
    $q$insert into public.blockouts (label, starts_at, ends_at)
       values ('doctor closes the clinic', now() + interval '1 day', now() + interval '2 days')$q$,
    '42501');

  perform pg_temp.expect('F11 ...but a doctor can READ blockouts',
    (select count(*) from public.blockouts) >= 0);
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.staff_uid')::uuid, 'staff'); end $$;
do $$ begin
  perform pg_temp.expect('F12 STAFF read availability rules',
    (select count(*) from public.availability_rules) > 0);

  perform pg_temp.expect_error('F13 ...but staff cannot create one',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
       values (current_setting('verify.prov_other')::uuid, 5, '09:00', '17:00', '2026-01-01')$q$,
    '42501');

  perform pg_temp.expect_error('F14 ...and staff cannot create a blockout',
    $q$insert into public.blockouts (label, starts_at, ends_at)
       values ('front desk closes the clinic', now() + interval '1 day', now() + interval '2 days')$q$,
    '42501');
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.patient_uid')::uuid, 'patient'); end $$;
do $$ begin
  perform pg_temp.expect('F15 a PATIENT sees no availability rules at all',
    (select count(*) from public.availability_rules) = 0);
  perform pg_temp.expect('F16 ...no exceptions',
    (select count(*) from public.availability_exceptions) = 0);
  perform pg_temp.expect('F17 ...and no blockouts',
    (select count(*) from public.blockouts) = 0);
  perform pg_temp.expect_error('F18 ...and cannot create a rule',
    $q$insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
       values (current_setting('verify.prov_doc')::uuid, 6, '09:00', '17:00', '2026-01-01')$q$,
    '42501');
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', null, true);
do $$ begin
  perform pg_temp.expect_error('F19 anon cannot read availability_rules at all',
    $q$select * from public.availability_rules$q$, '42501');
  perform pg_temp.expect_error('F20 anon cannot call get_available_slots',
    $q$select * from public.get_available_slots(
         current_setting('verify.type_probe')::uuid, current_date, current_date + 7)$q$,
    '42501');
end $$;
reset role;

set local role authenticated;
do $$ begin perform pg_temp.act_as(current_setting('verify.superadmin_uid')::uuid, 'superadmin'); end $$;

-- ===========================================================================
-- G. Slot correctness, and where the buffers actually bite
-- ===========================================================================
--
-- A clean stage: the fixtures above deliberately contain overlapping-adjacent
-- rules, so G onwards uses a THIRD provider with exactly one rule, on a weekday
-- computed from a fixed near-future date. Everything is asserted against exact
-- numbers rather than "more than zero".
do $$
declare
  v_prov uuid;
  v_day  date;
begin
  insert into public.providers (display_name) values ('Verify Slot Provider')
  returning id into v_prov;
  perform set_config('verify.prov_slot', v_prov::text, true);

  -- 14 days out, comfortably past the 120-minute lead time and inside the
  -- 60-day horizon that B7 has since narrowed to 45.
  v_day := (now() at time zone pg_temp.setting('timezone'))::date + 14;
  perform set_config('verify.slot_day', v_day::text, true);

  perform public.update_clinic_schedule('Asia/Manila', 120, 60);

  -- 09:00-12:00 = 180 minutes.
  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (v_prov, extract(dow from v_day)::smallint, '09:00', '12:00', '2020-01-01');

  perform pg_temp.expect('G1  the stage is set: one provider, one 3-hour rule on the target weekday',
    (select count(*) from public.availability_rules
      where provider_id = v_prov and deleted_at is null) = 1);
end $$;

do $$
declare
  v_n int; v_first timestamptz; v_last timestamptz; v_tz text := 'Asia/Manila';
begin
  select count(*), min(slot_start), max(slot_start) into v_n, v_first, v_last
  from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);

  -- 180 minutes / 10, minus the last 10 that the appointment itself occupies.
  perform pg_temp.expect('G2  a 10-minute type in a 3-hour window yields exactly 18 slots', v_n = 18);
  perform pg_temp.expect('G3  ...the first at 09:00 local',
    (v_first at time zone v_tz)::time = '09:00');
  perform pg_temp.expect('G4  ...and the last at 11:50 local, so the appointment ends at 12:00',
    (v_last at time zone v_tz)::time = '11:50');

  select count(*), min(slot_start), max(slot_start) into v_n, v_first, v_last
  from public.get_available_slots(
    current_setting('verify.type_buffered')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);

  -- 60 min of chair time with a 10-min pre-buffer and a 10-min post-buffer: the
  -- first bookable start is 09:10 and the last is 10:50 (block ends 12:00).
  perform pg_temp.expect('G5  BUFFERS BITE: the same window fits only 11 buffered appointments', v_n = 11);
  perform pg_temp.expect('G6  ...the first start is pushed to 09:10 by the PRE-buffer',
    (v_first at time zone v_tz)::time = '09:10');
  perform pg_temp.expect('G7  ...and the last to 10:50, so duration + POST-buffer still fit',
    (v_last at time zone v_tz)::time = '10:50');

  perform pg_temp.expect('G8  slot_end is the PATIENT-facing end, buffers excluded',
    (select (slot_end - slot_start) = interval '60 minutes'
       from public.get_available_slots(
         current_setting('verify.type_buffered')::uuid,
         current_setting('verify.slot_day')::date,
         current_setting('verify.slot_day')::date,
         current_setting('verify.prov_slot')::uuid) limit 1));

  perform pg_temp.expect('G9  every slot lands on the ten-minute grid',
    (select bool_and(extract(epoch from slot_start)::bigint % 600 = 0)
       from public.get_available_slots(
         current_setting('verify.type_probe')::uuid,
         current_setting('verify.slot_day')::date,
         current_setting('verify.slot_day')::date,
         current_setting('verify.prov_slot')::uuid)));

  perform pg_temp.expect('G10 no two slots share an instant',
    (select count(*) = count(distinct slot_start)
       from public.get_available_slots(
         current_setting('verify.type_probe')::uuid,
         current_setting('verify.slot_day')::date,
         current_setting('verify.slot_day')::date,
         current_setting('verify.prov_slot')::uuid)));
end $$;

-- A window too short for the appointment yields NOTHING, rather than a slot
-- that overruns.
do $$
declare v_prov uuid; v_n int;
begin
  insert into public.providers (display_name) values ('Verify Narrow Window')
  returning id into v_prov;
  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (v_prov, extract(dow from current_setting('verify.slot_day')::date)::smallint,
          '14:00', '14:30', '2020-01-01');

  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_buffered')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    v_prov);
  perform pg_temp.expect('G11 a 30-minute window offers NO 80-minute buffered block', v_n = 0);

  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    v_prov);
  perform pg_temp.expect('G12 ...but does offer 3 ten-minute ones -- G11 is not an empty stage', v_n = 3);
end $$;

do $$ begin
  perform pg_temp.expect_error('G13 an unknown appointment type is REJECTED, not answered with nothing',
    $q$select * from public.get_available_slots(
         '00000000-0000-0000-0000-000000000000'::uuid, current_date, current_date + 1)$q$,
    '23503', 'unknown_appointment_type');

  perform pg_temp.expect_error('G14 a backwards date range is REJECTED',
    $q$select * from public.get_available_slots(
         current_setting('verify.type_probe')::uuid, current_date + 5, current_date)$q$,
    '22023', 'date_range_invalid');

  perform pg_temp.expect_error('G15 a range wider than 92 days is REJECTED',
    $q$select * from public.get_available_slots(
         current_setting('verify.type_probe')::uuid, current_date, current_date + 93)$q$,
    '22023', 'date_range_invalid');
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.patient_uid')::uuid, 'patient'); end $$;
do $$ begin
  perform pg_temp.expect('G16 a PATIENT can ask for slots of a bookable type',
    (select count(*) from public.get_available_slots(
       current_setting('verify.type_probe')::uuid,
       current_setting('verify.slot_day')::date,
       current_setting('verify.slot_day')::date,
       current_setting('verify.prov_slot')::uuid)) = 18);

  perform pg_temp.expect_error('G17 ...and CANNOT probe an internal-only type by id',
    $q$select * from public.get_available_slots(
         current_setting('verify.type_internal')::uuid,
         current_setting('verify.slot_day')::date,
         current_setting('verify.slot_day')::date)$q$,
    '42501', 'forbidden');
end $$;
do $$ begin perform pg_temp.act_as(current_setting('verify.superadmin_uid')::uuid, 'superadmin'); end $$;

-- ===========================================================================
-- H. Blockouts remove slots -- and soft ones do not
-- ===========================================================================
do $$
declare v_n int; v_id uuid; v_tz text := 'Asia/Manila';
begin
  -- 10:00-11:00 local on the target day, clinic-wide (both scope columns null).
  insert into public.blockouts (label, starts_at, ends_at)
  values ('Verify staff meeting',
          (current_setting('verify.slot_day')::date + time '10:00') at time zone v_tz,
          (current_setting('verify.slot_day')::date + time '11:00') at time zone v_tz)
  returning id into v_id;
  perform set_config('verify.blockout', v_id::text, true);

  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  -- 17 minus the six starts 10:00..10:50 that overlap the blocked hour.
  perform pg_temp.expect('H1  A BLOCKOUT REMOVES SLOTS: 18 becomes 12', v_n = 12);

  perform pg_temp.expect('H2  ...and it is exactly the blocked hour that vanished',
    (select count(*) from public.get_available_slots(
       current_setting('verify.type_probe')::uuid,
       current_setting('verify.slot_day')::date,
       current_setting('verify.slot_day')::date,
       current_setting('verify.prov_slot')::uuid)
      where (slot_start at time zone v_tz)::time >= '10:00'
        and (slot_start at time zone v_tz)::time <  '11:00') = 0);

  -- The accepting direction: a SOFT blockout is drawn but still bookable.
  update public.blockouts set schedulable_over = true where id = v_id;
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('H3  schedulable_over = true removes NOTHING -- 18 again', v_n = 18);
  update public.blockouts set schedulable_over = false where id = v_id;

  -- Scope: a blockout on ANOTHER provider must not touch this one.
  update public.blockouts set provider_id = current_setting('verify.prov_other')::uuid where id = v_id;
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('H4  a blockout scoped to ANOTHER provider removes nothing', v_n = 18);

  update public.blockouts set provider_id = current_setting('verify.prov_slot')::uuid where id = v_id;
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('H5  ...scoped to THIS provider it removes the hour again', v_n = 12);

  -- The NULL-logic trap: a chair-scoped blockout must not remove slots from a
  -- chair-agnostic rule, because the provider can simply use another chair.
  update public.blockouts
     set provider_id = null, operatory_id = current_setting('verify.op')::uuid
   where id = v_id;
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('H6  a CHAIR-scoped blockout does not touch a chair-agnostic rule', v_n = 18);

  -- Archiving a blockout gives the time back.
  update public.blockouts set provider_id = null, operatory_id = null where id = v_id;
  update public.blockouts set deleted_at = now() where id = v_id;
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('H7  archiving the blockout gives the hour back', v_n = 18);
  -- Left ARCHIVED deliberately. Restoring it here would leave a live clinic-wide
  -- blockout standing over section I's stage, and I5 would then be measuring
  -- the blockout rather than the exception -- which is exactly what happened
  -- the first time this file ran.
end $$;

-- ===========================================================================
-- I. Exceptions REPLACE a day, and the validation floor
-- ===========================================================================
do $$
declare v_n int; v_first timestamptz; v_tz text := 'Asia/Manila';
begin
  insert into public.availability_exceptions (provider_id, exception_date, is_closed)
  values (current_setting('verify.prov_slot')::uuid, current_setting('verify.slot_day')::date, true);

  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('I1  a CLOSED exception empties the day entirely', v_n = 0);

  perform pg_temp.expect_error('I2  a second exception for the same provider and day is REJECTED',
    $q$insert into public.availability_exceptions (provider_id, exception_date, is_closed)
       values (current_setting('verify.prov_slot')::uuid,
               current_setting('verify.slot_day')::date, true)$q$,
    '23505');

  -- Turn it into a replacement window: 14:00-15:00, OUTSIDE the 09:00-12:00
  -- rule, which is what proves it replaces rather than intersects.
  update public.availability_exceptions
     set is_closed = false, start_time = '14:00', end_time = '15:00'
   where provider_id = current_setting('verify.prov_slot')::uuid
     and exception_date = current_setting('verify.slot_day')::date;

  select count(*), min(slot_start) into v_n, v_first from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('I3  an OPEN exception REPLACES the day''s rules -- 6 slots, not 18 + 6', v_n = 6);
  perform pg_temp.expect('I4  ...and they start at 14:00, outside the rule''s window entirely',
    (v_first at time zone v_tz)::time = '14:00');

  update public.availability_exceptions set deleted_at = now()
   where provider_id = current_setting('verify.prov_slot')::uuid
     and exception_date = current_setting('verify.slot_day')::date;
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    current_setting('verify.slot_day')::date,
    current_setting('verify.slot_day')::date,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('I5  archiving the exception restores the ordinary day', v_n = 18);
end $$;

do $$
declare v_n int; v_yesterday date;
begin
  v_yesterday := (now() at time zone 'Asia/Manila')::date - 1;
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid, v_yesterday, v_yesterday,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('I6  THE PAST IS NEVER OFFERED', v_n = 0);

  -- Horizon: the rule runs every week forever, so a day beyond the horizon must
  -- still be empty. 60 days is the seeded value; ask about day 75.
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    (now() at time zone 'Asia/Manila')::date + 75,
    (now() at time zone 'Asia/Manila')::date + 80,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('I7  nothing beyond the 60-day horizon is offered', v_n = 0);

  -- ...and the accepting direction, so I7 is not empty for some other reason.
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    (now() at time zone 'Asia/Manila')::date + 50,
    (now() at time zone 'Asia/Manila')::date + 56,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('I8  ...but the same rule DOES yield slots just inside the horizon', v_n = 18);

  -- Lead time: widen it past a week and the near days empty out.
  perform public.update_clinic_schedule('Asia/Manila', 10080, 60);
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid,
    (now() at time zone 'Asia/Manila')::date,
    (now() at time zone 'Asia/Manila')::date + 6,
    current_setting('verify.prov_slot')::uuid);
  perform pg_temp.expect('I9  a 7-day lead time removes every slot inside the next 7 days', v_n = 0);
  perform public.update_clinic_schedule('Asia/Manila', 120, 60);
end $$;

-- ===========================================================================
-- J. THE DST WEEK -- the acceptance criterion PLAN names for 3.1
-- ===========================================================================
do $$
declare
  v_spring date; v_fall date; v_manila_spring date; v_manila_fall date;
begin
  select spring_forward, fall_back into v_spring, v_fall
  from pg_temp.next_dst_transitions('America/New_York', current_date);

  select spring_forward, fall_back into v_manila_spring, v_manila_fall
  from pg_temp.next_dst_transitions('Asia/Manila', current_date);

  -- THE PREMISE OF THIS WHOLE SECTION, ASSERTED RATHER THAN REMEMBERED.
  perform pg_temp.expect('J1  Asia/Manila has NO DST transition in the next 400 days',
    v_manila_spring is null and v_manila_fall is null);

  perform pg_temp.expect('J2  America/New_York has both, and they are Sundays',
    v_spring is not null and v_fall is not null
    and extract(dow from v_spring) = 0 and extract(dow from v_fall) = 0);

  perform set_config('verify.spring', v_spring::text, true);
  perform set_config('verify.fall',   v_fall::text,   true);
end $$;

do $$
declare
  v_prov uuid;
  v_spring date := current_setting('verify.spring')::date;
  v_fall   date := current_setting('verify.fall')::date;
  v_reach  integer;
begin
  -- Open the horizon far enough to reach both transitions, and drop the lead
  -- time so nothing near-term interferes.
  v_reach := greatest(v_spring, v_fall) - current_date + 14;
  perform public.update_clinic_schedule('America/New_York', 0, v_reach);

  insert into public.providers (display_name) values ('Verify DST Provider')
  returning id into v_prov;
  perform set_config('verify.prov_dst', v_prov::text, true);

  -- A DELIBERATELY NOCTURNAL WINDOW. Real clinic hours never straddle 02:00,
  -- so a 09:00-17:00 rule is completely unaffected by either transition and
  -- would prove nothing at all. 01:00-05:00 is the only way to make the clock
  -- change observable.
  insert into public.availability_rules (provider_id, weekday, start_time, end_time, effective_from)
  values (v_prov, 0, '01:00', '05:00', '2020-01-01');

  perform pg_temp.expect('J3  the DST stage is set: a Sunday 01:00-05:00 rule, clinic in New York',
    (select timezone = 'America/New_York' from public.clinic_schedule));
end $$;

do $$
declare
  v_tz text := 'America/New_York';
  v_spring date := current_setting('verify.spring')::date;
  v_fall   date := current_setting('verify.fall')::date;
  v_n int; v_first time; v_last time; v_distinct int;
begin
  -- An ordinary Sunday, as the control. 4 hours / 10 min, minus the last slot.
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid, v_spring - 7, v_spring - 7,
    current_setting('verify.prov_dst')::uuid);
  perform pg_temp.expect('J4  an ORDINARY Sunday yields 24 slots (the control)', v_n = 24);

  -- SPRING FORWARD: the local day is 23 hours and 02:00-03:00 does not exist.
  select count(*), count(distinct slot_start),
         min(slot_start at time zone v_tz)::time, max(slot_start at time zone v_tz)::time
    into v_n, v_distinct, v_first, v_last
  from public.get_available_slots(
    current_setting('verify.type_probe')::uuid, v_spring, v_spring,
    current_setting('verify.prov_dst')::uuid);

  perform pg_temp.expect('J5  SPRING FORWARD yields 18 slots, not 24 -- the hour that does not exist is not sold', v_n = 18);
  perform pg_temp.expect('J6  ...and NO slot lands inside the 02:00-03:00 gap',
    (select count(*) from public.get_available_slots(
       current_setting('verify.type_probe')::uuid, v_spring, v_spring,
       current_setting('verify.prov_dst')::uuid)
      where (slot_start at time zone v_tz)::time >= '02:00'
        and (slot_start at time zone v_tz)::time <  '03:00') = 0);
  perform pg_temp.expect('J7  ...NO TWO SLOTS SHARE AN INSTANT -- the naive-walk bug, absent',
    v_n = v_distinct);
  perform pg_temp.expect('J8  ...and the window still reads 01:00 to 04:50 in local wall clock',
    v_first = '01:00' and v_last = '04:50');

  -- FALL BACK: the local day is 25 hours and 01:00-02:00 happens twice.
  select count(*), count(distinct slot_start),
         min(slot_start at time zone v_tz)::time, max(slot_start at time zone v_tz)::time
    into v_n, v_distinct, v_first, v_last
  from public.get_available_slots(
    current_setting('verify.type_probe')::uuid, v_fall, v_fall,
    current_setting('verify.prov_dst')::uuid);

  perform pg_temp.expect('J9  FALL BACK yields 24 slots -- the clinic works its posted hours, once', v_n = 24);
  perform pg_temp.expect('J10 ...with no duplicated instants across the repeated hour', v_n = v_distinct);
  perform pg_temp.expect('J11 ...and the window still reads 01:00 to 04:50 in local wall clock',
    v_first = '01:00' and v_last = '04:50');

  -- The regression arm: the same rule, read as a Manila clinic, is unaffected.
  perform public.update_clinic_schedule('Asia/Manila', 0,
    greatest(v_spring, v_fall) - current_date + 14);
  select count(*) into v_n from public.get_available_slots(
    current_setting('verify.type_probe')::uuid, v_spring, v_spring,
    current_setting('verify.prov_dst')::uuid);
  perform pg_temp.expect('J12 the DEFAULT INSTALL is unaffected: 24 slots on the same date in Manila', v_n = 24);
end $$;

-- ===========================================================================
-- K. Soft delete -- the Archive-view split
-- ===========================================================================
do $$
declare v_live int; v_archived int;
begin
  select count(*) into v_live from public.availability_rules where deleted_at is null;
  select count(*) into v_archived from public.availability_rules where deleted_at is not null;
  -- Two archived rules by now: E8's overlapping one on the doctor's provider,
  -- and E9's on the other provider that F9 uses to prove the doctor's Archive
  -- view is scoped.
  perform pg_temp.expect('K1  a superadmin sees both live and archived rules', v_live > 0 and v_archived = 2);
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.doctor_uid')::uuid, 'doctor'); end $$;
do $$
declare v_id uuid;
begin
  -- A doctor archiving their OWN rule must still be able to see it, or the row
  -- is invisible in a way that reads as data loss and restore is unreachable.
  update public.availability_rules set deleted_at = now()
   where id = current_setting('verify.doc_rule')::uuid;
  perform pg_temp.expect('K2  a doctor can archive their own rule',
    (select deleted_at is not null from public.availability_rules
      where id = current_setting('verify.doc_rule')::uuid));
  perform pg_temp.expect('K3  ...and can still SEE it, through their own Archive-view policy',
    (select count(*) from public.availability_rules
      where id = current_setting('verify.doc_rule')::uuid and deleted_at is not null) = 1);

  update public.availability_rules set deleted_at = null
   where id = current_setting('verify.doc_rule')::uuid;
  perform pg_temp.expect('K4  ...and can restore it, because nothing took its place',
    (select deleted_at is null from public.availability_rules
      where id = current_setting('verify.doc_rule')::uuid));
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.staff_uid')::uuid, 'staff'); end $$;
do $$ begin
  perform pg_temp.expect('K5  STAFF never see an archived rule -- there is no Archive view for them',
    (select count(*) from public.availability_rules where deleted_at is not null) = 0);
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.superadmin_uid')::uuid, 'superadmin'); end $$;
do $$ begin
  perform pg_temp.expect('K6  every write so far is in the audit trail',
    (select count(*) from pg_temp.audit_rows('availability_rules') where action = 'create') > 0);
  perform pg_temp.expect('K7  ...including blockouts',
    (select count(*) from pg_temp.audit_rows('blockouts') where action = 'create') = 1);
end $$;

reset role;

do $$ begin
  raise notice '';
  raise notice '  All checks passed. Rolling back -- the database is unchanged.';
  raise notice '';
end $$;

rollback;

-- ===========================================================================
-- L. Proof the rollback did what it says. Runs OUTSIDE the transaction.
-- ===========================================================================
do $$ begin
  perform pg_temp.expect('L1  availability_rules is empty again',
    (select count(*) from public.availability_rules) = 0);
  perform pg_temp.expect('L2  availability_exceptions is empty again',
    (select count(*) from public.availability_exceptions) = 0);
  perform pg_temp.expect('L3  blockouts is empty again',
    (select count(*) from public.blockouts) = 0);
  perform pg_temp.expect('L4  audit_log has no scheduling rows',
    (select count(*) from pg_temp.audit_rows('availability_rules'))
  + (select count(*) from pg_temp.audit_rows('availability_exceptions'))
  + (select count(*) from pg_temp.audit_rows('blockouts'))
  + (select count(*) from pg_temp.audit_rows('clinic_schedule')) = 0);

  -- THE ONE THIS FILE COULD MOST EASILY GET WRONG. Section J repointed the
  -- whole clinic at America/New_York and opened the horizon to reach a
  -- transition; if the rollback did not put those back, every screen in the app
  -- would be in the wrong timezone and nothing would say so.
  perform pg_temp.expect('L5  the clinic timezone is back to what it was',
    pg_temp.setting('timezone') is not distinct from current_setting('verify.tz_before', true));
  perform pg_temp.expect('L6  ...and the lead time',
    pg_temp.setting('lead_time_min') is not distinct from current_setting('verify.lead_before', true));
  perform pg_temp.expect('L7  ...and the booking horizon',
    pg_temp.setting('horizon_days') is not distinct from current_setting('verify.horizon_before', true));

  perform pg_temp.expect('L8  the verify providers and appointment types are gone',
    (select count(*) from public.providers where display_name like 'Verify %') = 0
    and (select count(*) from public.appointment_types where name like 'Verify %') = 0);
end $$;
