-- Verification for 0015_feedback_reports.sql -- run BEFORE any UI exists.
--
-- WHY THIS FILE IS COMMITTED, when 2.0's 21/21, 2.2a's 39/39 and 2.2b's 47/47
-- were not. Those suites were ad-hoc SQL typed into a session; only their
-- COUNTS survive, in PROGRESS.md. So nothing re-runs them, and "the RLS on
-- patients is still correct" rests on a number in a markdown file. The habit of
-- writing the verification before the UI is the single most valuable one this
-- project has -- it has caught a bug in every increment that used it -- and it
-- costs almost nothing to make it repeatable.
--
-- HOW TO RUN (needs SUPABASE_DB_URL from .env.local; psql only, no CLI):
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/verify/0015-feedback.sql
--
-- Every check RAISES on failure, so ON_ERROR_STOP=1 aborts at the first one.
-- The whole run is wrapped in a transaction that ends in ROLLBACK, so it leaves
-- the database exactly as it found it -- including private.audit_log, which is
-- append-only and must not accumulate rows from a test.
--
-- It asserts on the roles as they really are: it SET ROLE authenticated and
-- forges request.jwt.claims, because postgres is a superuser and BYPASSES RLS
-- entirely. A check that runs as postgres proves nothing about a policy.

\set ON_ERROR_STOP on
\timing off

-- ---------------------------------------------------------------------------
-- Helpers.
--
-- Created BEFORE `begin` on purpose. A temp function created inside the
-- transaction is dropped by the ROLLBACK at the end -- which would take the H
-- checks, the ones that PROVE the rollback worked, down with it.
--
-- Also created as the connecting role, before any SET ROLE.
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
 * Read private.audit_log.
 *
 * `security definer` because 0001 revoked schema `private` from
 * `authenticated`, and the checks below have to run AS authenticated to
 * exercise RLS at all. Without this the F section dies on "permission denied
 * for schema private" -- which is the revoke doing its job, not a bug.
 */
create or replace function pg_temp.audit_rows(p_entity_id uuid default null)
returns table (action text, actor_role text, actor_id uuid, before jsonb, after jsonb)
language sql
security definer
as $$
  select l.action, l.actor_role, l.actor_id, l.before, l.after
  from private.audit_log l
  where l.entity = 'feedback_reports'
    and (p_entity_id is null or l.entity_id = p_entity_id);
$$;

begin;

-- The actor ids, as transaction-scoped GUCs rather than psql variables.
--
-- psql does NOT interpolate a :'variable' inside a dollar-quoted block, and
-- almost every check below lives in one. A psql variable would therefore reach
-- the server as literal text -- a syntax error where you are lucky, and a
-- silently different query where you are not. Custom GUCs are read by
-- current_setting() at execution time, inside the block, by whichever role is
-- active. Hit while writing this file, which is exactly the kind of thing a
-- committed verification is for.
do $$ begin
  perform set_config('verify.patient_uid',
    (select id::text from public.profiles where role = 'patient'    and is_active limit 1), true);
  perform set_config('verify.staff_uid',
    (select id::text from public.profiles where role = 'staff'      and is_active limit 1), true);
  perform set_config('verify.superadmin_uid',
    (select id::text from public.profiles where role = 'superadmin' and is_active limit 1), true);
end $$;

do $$ begin
  perform pg_temp.expect('seed: three distinct profiles resolved',
    (select count(distinct id) from public.profiles
      where role in ('patient','staff','superadmin') and is_active) >= 3);
end $$;

-- ===========================================================================
-- A. Structure
-- ===========================================================================
do $$
declare v_count int;
begin
  perform pg_temp.expect('A1  table exists with RLS enabled',
    (select relrowsecurity from pg_class where oid = 'public.feedback_reports'::regclass));

  perform pg_temp.expect('A2  authenticated has SELECT, INSERT, UPDATE and NOT DELETE',
       has_table_privilege('authenticated', 'public.feedback_reports', 'select')
   and has_table_privilege('authenticated', 'public.feedback_reports', 'insert')
   and has_table_privilege('authenticated', 'public.feedback_reports', 'update')
   and not has_table_privilege('authenticated', 'public.feedback_reports', 'delete'));

  perform pg_temp.expect('A3  anon has no privilege at all',
    not (has_table_privilege('anon', 'public.feedback_reports', 'select')
      or has_table_privilege('anon', 'public.feedback_reports', 'insert')
      or has_table_privilege('anon', 'public.feedback_reports', 'update')
      or has_table_privilege('anon', 'public.feedback_reports', 'delete')));

  perform pg_temp.expect('A4  no DELETE policy exists',
    (select count(*) from pg_policies
      where tablename = 'feedback_reports' and cmd = 'DELETE') = 0);

  select count(*) into v_count from pg_policies where tablename = 'feedback_reports';
  perform pg_temp.expect('A5  exactly five policies (3 select, 1 insert, 1 update)', v_count = 5);

  -- RULE 2, asserted structurally: the blanket audit trigger every OTHER
  -- domain table carries must NOT be here. If someone "fixes" the missing
  -- trigger later, this is what tells them it was deliberate.
  perform pg_temp.expect('A6  NO blanket audit_row trigger (rule 2)',
    (select count(*) from pg_trigger t
      where t.tgrelid = 'public.feedback_reports'::regclass
        and not t.tgisinternal
        and t.tgfoid = 'private.audit_row'::regproc) = 0);

  perform pg_temp.expect('A7  narrow status/deleted_at audit trigger is present',
    (select count(*) from pg_trigger t
      where t.tgrelid = 'public.feedback_reports'::regclass
        and not t.tgisinternal
        and t.tgname = 'feedback_reports_status_audit') = 1);

  perform pg_temp.expect('A8  guard trigger fires BEFORE insert and update',
    (select count(*) from pg_trigger t
      where t.tgrelid = 'public.feedback_reports'::regclass
        and t.tgname = 'feedback_reports_guard'
        and (t.tgtype & 2) = 2) = 1);   -- bit 1 = BEFORE

  perform pg_temp.expect('A9  both partial indexes exist, filtered on deleted_at',
    (select count(*) from pg_indexes
      where tablename = 'feedback_reports'
        and indexdef like '%deleted_at IS NULL%') = 2);

  perform pg_temp.expect('A10 enum labels match the module doc exactly',
       (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.feedback_kind'::regtype)
         = array['bug','idea','question','data_issue']
   and (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.feedback_severity'::regtype)
         = array['blocker','major','minor','cosmetic']
   and (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.feedback_status'::regtype)
         = array['new','triaged','in_progress','resolved','wont_fix','duplicate']);

  perform pg_temp.expect('A11 table starts empty (nothing to disturb)',
    (select count(*) from public.feedback_reports) = 0);
end $$;

-- ===========================================================================
-- B. Rule 1 -- `path` cannot hold a real id, even from a direct PostgREST call
-- ===========================================================================
set local role authenticated;
do $$ begin perform pg_temp.act_as(current_setting('verify.staff_uid')::uuid, 'staff'); end $$;

do $$ begin
  -- THE assertion this whole module hangs on.
  perform pg_temp.expect_error('B1  a real uuid in the path is REJECTED',
    $q$insert into public.feedback_reports (title, body, path)
       values ('x', 'y', '/patients/3f2b8c1e-7a44-4d1b-9c2e-5f8a1b2c3d4e')$q$,
    '23514');

  perform pg_temp.expect_error('B2  a numeric id in the path is REJECTED',
    $q$insert into public.feedback_reports (title, body, path)
       values ('x', 'y', '/patients/100294')$q$, '23514');

  perform pg_temp.expect_error('B3  a query string is REJECTED',
    $q$insert into public.feedback_reports (title, body, path)
       values ('x', 'y', '/feedback?from=/patients/100294')$q$, '23514');

  perform pg_temp.expect_error('B4  a fragment is REJECTED',
    $q$insert into public.feedback_reports (title, body, path)
       values ('x', 'y', '/patients#100294')$q$, '23514');

  perform pg_temp.expect_error('B5  an uppercase segment is REJECTED',
    $q$insert into public.feedback_reports (title, body, path)
       values ('x', 'y', '/Patients')$q$, '23514');

  perform pg_temp.expect_error('B6  an over-long segment is REJECTED (uuid-length guard)',
    $q$insert into public.feedback_reports (title, body, path)
       values ('x', 'y', '/patients/abcdefghijklmnopqrstuvwxyz')$q$, '23514');
end $$;

-- The accepting direction, so B1..B6 are not passing because EVERYTHING fails.
insert into public.feedback_reports (title, body, path)
  values ('masked dynamic', 'b', '/patients/[id]');
insert into public.feedback_reports (title, body, path)
  values ('masked nested', 'b', '/admin/lookups/[category]/[id]');
insert into public.feedback_reports (title, body, path)
  values ('long static segment', 'b', '/admin/lookups/appointment-types');
insert into public.feedback_reports (title, body, path)
  values ('root', 'b', '/');
insert into public.feedback_reports (title, body, path)
  values ('unattributed', 'b', null);

do $$ begin
  perform pg_temp.expect('B7  masked patterns, the root and NULL are all ACCEPTED',
    (select count(*) from public.feedback_reports) = 5);
end $$;

-- ===========================================================================
-- C. The guard -- identity and triage state are not the client's to state
-- ===========================================================================
do $$
declare v_id uuid;
begin
  insert into public.feedback_reports
    (title, body, path, reporter_id, reporter_role, status, triage_note, resolved_at, resolved_by)
  values
    ('forged', 'b', '/home', current_setting('verify.superadmin_uid')::uuid, 'superadmin', 'resolved',
     'pre-triaged by me', now(), current_setting('verify.superadmin_uid')::uuid)
  returning id into v_id;

  perform pg_temp.expect('C1  forged reporter_id is overwritten with auth.uid()',
    (select reporter_id from public.feedback_reports where id = v_id) = current_setting('verify.staff_uid')::uuid);
  perform pg_temp.expect('C2  forged reporter_role is overwritten with the real claim',
    (select reporter_role from public.feedback_reports where id = v_id) = 'staff');
  perform pg_temp.expect('C3  a pre-triaged status is forced back to new',
    (select status from public.feedback_reports where id = v_id) = 'new');
  perform pg_temp.expect('C4  triage fields are nulled on insert',
    (select triage_note is null and resolved_at is null and resolved_by is null
       from public.feedback_reports where id = v_id));
end $$;

do $$ begin
  perform pg_temp.expect_error('C5  body longer than the documented cap is REJECTED',
    $q$insert into public.feedback_reports (title, body) values ('x', repeat('a', 4001))$q$,
    '23514');
  perform pg_temp.expect_error('C6  an empty title is REJECTED',
    $q$insert into public.feedback_reports (title, body) values ('   ', 'b')$q$, '23514');
  perform pg_temp.expect_error('C7  a malformed viewport is REJECTED',
    $q$insert into public.feedback_reports (title, body, viewport) values ('x','b','wide')$q$,
    '23514');
end $$;

-- ===========================================================================
-- D. RLS -- who can read and write what
-- ===========================================================================
do $$ begin perform pg_temp.act_as(current_setting('verify.patient_uid')::uuid, 'patient'); end $$;
insert into public.feedback_reports (title, body, path) values ('patient report', 'b', '/home');

do $$ begin
  perform pg_temp.expect('D1  a patient sees ONLY their own report',
    (select count(*) from public.feedback_reports) = 1);
  perform pg_temp.expect('D2  ...and it is theirs',
    (select reporter_id from public.feedback_reports) = current_setting('verify.patient_uid')::uuid);

  -- rule 6: the superadmin is the only updater. No policy grants a reporter
  -- UPDATE, so this is not an error -- it silently matches zero rows, which is
  -- exactly why it has to be asserted rather than assumed.
  update public.feedback_reports set severity = 'blocker';
  perform pg_temp.expect('D3  a patient CANNOT update even their own report',
    (select severity from public.feedback_reports) = 'minor');
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.staff_uid')::uuid, 'staff'); end $$;
do $$ begin
  perform pg_temp.expect('D4  staff see their own six and not the patient''s',
    (select count(*) from public.feedback_reports) = 6);
  update public.feedback_reports set status = 'triaged';
  perform pg_temp.expect('D5  staff CANNOT triage',
    (select count(*) from public.feedback_reports where status <> 'new') = 0);
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.superadmin_uid')::uuid, 'superadmin'); end $$;
do $$ begin
  perform pg_temp.expect('D6  the superadmin reads every live report',
    (select count(*) from public.feedback_reports) = 7);
end $$;

-- anon is the role an unauthenticated PostgREST request arrives as.
reset role;
set local role anon;
select set_config('request.jwt.claims', null, true);
do $$ begin
  perform pg_temp.expect_error('D7  anon cannot insert (rule 5)',
    $q$insert into public.feedback_reports (title, body) values ('spam','b')$q$, '42501');
  perform pg_temp.expect_error('D8  anon cannot read',
    $q$select count(*) from public.feedback_reports$q$, '42501');
end $$;
reset role;

-- ===========================================================================
-- E. Immutability -- a filed report is a fact (rule 6)
-- ===========================================================================
set local role authenticated;
do $$ begin perform pg_temp.act_as(current_setting('verify.superadmin_uid')::uuid, 'superadmin'); end $$;

do $$ begin
  perform pg_temp.expect_error('E1  the body cannot be edited after filing',
    $q$update public.feedback_reports set body = 'rewritten' where title = 'patient report'$q$,
    '42501', 'report_immutable');
  perform pg_temp.expect_error('E2  the title cannot be edited',
    $q$update public.feedback_reports set title = 'renamed' where title = 'patient report'$q$,
    '42501', 'report_immutable');
  perform pg_temp.expect_error('E3  the path cannot be rewritten to a real id',
    $q$update public.feedback_reports set path = '/patients/[id]' where title = 'root'$q$,
    '42501', 'report_immutable');
  perform pg_temp.expect_error('E4  the reporter cannot be reassigned',
    $q$update public.feedback_reports set reporter_id = current_setting('verify.staff_uid')::uuid
        where title = 'patient report'$q$,
    '42501', 'reporter_immutable');
  perform pg_temp.expect_error('E5  duplicate_of_id without the duplicate status is REJECTED',
    $q$update public.feedback_reports
         set duplicate_of_id = (select id from public.feedback_reports where title = 'root')
       where title = 'patient report'$q$,
    '22023', 'duplicate_needs_status');

  -- Sets the status TOO, so this reaches the CHECK constraint rather than
  -- stopping at the guard's duplicate_needs_status rule -- otherwise it would
  -- pass for the wrong reason and the self-reference check would be untested.
  --
  -- This check first lived in section C, where it PASSED while proving nothing:
  -- section C acts as staff, staff hold no UPDATE policy, so the statement
  -- matched zero rows and "succeeded" without ever reaching the constraint. A
  -- write assertion is only an assertion when the actor can write.
  perform pg_temp.expect_error('E6  a self-referencing duplicate is REJECTED',
    $q$update public.feedback_reports set status = 'duplicate', duplicate_of_id = id
        where title = 'root'$q$, '23514');
end $$;

-- ===========================================================================
-- F. Rule 2 -- the audit trail records transitions, and NEVER the body
-- ===========================================================================
do $$
declare
  v_id       uuid;
  v_before   bigint;
  v_rows     bigint;
begin
  select id into v_id from public.feedback_reports where title = 'patient report';
  select count(*) into v_before from pg_temp.audit_rows();

  perform pg_temp.expect('F1  filing wrote NO audit row (no blanket trigger)', v_before = 0);

  update public.feedback_reports set status = 'triaged' where id = v_id;

  select count(*) into v_rows from pg_temp.audit_rows(v_id);
  perform pg_temp.expect('F2  a status change writes EXACTLY ONE audit row', v_rows = 1);

  perform pg_temp.expect('F3  ...with action ''update'' and the superadmin as actor',
    (select action = 'update' and actor_role = 'superadmin' and actor_id = current_setting('verify.superadmin_uid')::uuid
       from pg_temp.audit_rows(v_id)));

  perform pg_temp.expect('F4  ...carrying ONLY the status keys, before and after',
    (select before = jsonb_build_object('status', 'new')
        and after  = jsonb_build_object('status', 'triaged')
       from pg_temp.audit_rows(v_id)));

  -- The rule stated as the thing it protects: no field a user TYPED is in the
  -- append-only, purge-exempt log. Asserted on the KEYS, not by substring
  -- search -- a substring test on short fixture text passes by accident.
  perform pg_temp.expect('F5  no audit row carries body, title, path or triage_note',
    (select count(*) from pg_temp.audit_rows()
      where before ?| array['body','title','path','triage_note','user_agent']
         or after  ?| array['body','title','path','triage_note','user_agent']) = 0);

  -- The other half of "narrow": a triage note is free text too, and editing one
  -- must leave no trace in a log that cannot be purged.
  update public.feedback_reports
     set triage_note = 'looked at it, seems real', severity = 'major'
   where id = v_id;
  select count(*) into v_rows from pg_temp.audit_rows(v_id);
  perform pg_temp.expect('F6  a triage-note and severity edit writes NO audit row', v_rows = 1);

  update public.feedback_reports set status = 'resolved' where id = v_id;
  perform pg_temp.expect('F7  resolving derives resolved_at and resolved_by',
    (select resolved_at is not null and resolved_by = current_setting('verify.superadmin_uid')::uuid
       from public.feedback_reports where id = v_id));

  update public.feedback_reports set status = 'in_progress' where id = v_id;
  perform pg_temp.expect('F8  re-opening clears them again',
    (select resolved_at is null and resolved_by is null
       from public.feedback_reports where id = v_id));

  update public.feedback_reports
     set deleted_at = now(), deleted_by = current_setting('verify.superadmin_uid')::uuid
   where id = v_id;
  perform pg_temp.expect('F9  archiving writes its own transition row',
    (select count(*) from pg_temp.audit_rows(v_id) where after ? 'deleted_at') = 1);
end $$;

-- ===========================================================================
-- G. Soft delete -- the Archive-view split
-- ===========================================================================
do $$ begin
  perform pg_temp.expect('G1  an archived report leaves the superadmin''s live list',
    (select count(*) from public.feedback_reports where deleted_at is null) = 6);
  perform pg_temp.expect('G2  ...and is reachable through the Archive-view policy',
    (select count(*) from public.feedback_reports where deleted_at is not null) = 1);
end $$;

do $$ begin perform pg_temp.act_as(current_setting('verify.patient_uid')::uuid, 'patient'); end $$;
do $$ begin
  perform pg_temp.expect('G3  the author cannot see their own archived report',
    (select count(*) from public.feedback_reports) = 0);
end $$;

reset role;

do $$ begin
  raise notice '';
  raise notice '  All checks passed. Rolling back -- the database is unchanged.';
  raise notice '';
end $$;

rollback;

-- Proof the rollback did what it says. Runs outside the transaction.
do $$ begin
  perform pg_temp.expect('H1  feedback_reports is empty again',
    (select count(*) from public.feedback_reports) = 0);
  perform pg_temp.expect('H2  audit_log has no feedback rows',
    (select count(*) from pg_temp.audit_rows()) = 0);
end $$;
