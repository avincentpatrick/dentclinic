-- 0015: feedback_reports -- bug reports and suggestions from anyone using the system (2.2d)
--
-- NUMBERED 0015, NOT 0016. docs/PLAN.md reserved 0015 for email settings (2.2c)
-- and 0016 for this table. 2.2c is deferred WHOLE (PROGRESS decision 24: no
-- free sending provider is reachable without a domain, and nothing was
-- started), so there is no half-applied migration holding the number. This is
-- the third time the ladder has slid; PLAN.md's own instruction is to take the
-- next free number from `ls supabase/migrations/` rather than from its list.
--
-- ---------------------------------------------------------------------------
-- RULE 1, AND IT IS THE ONE THAT MATTERS: `path` IS A ROUTE PATTERN FROM A
-- CLOSED SET, NOT A SANITISED STRING.
--
-- docs/modules/16-feedback.md calls this "the single most important rule in the
-- module", and the reason is worth restating in the schema rather than only in
-- prose: `path` is captured automatically, the superadmin reads every row, and
-- if it held real ids this table would quietly become a log of WHICH PATIENT
-- EACH STAFF MEMBER WAS LOOKING AT AND WHEN -- readable outside
-- private.audit_log, which exists to control exactly that, and outside its
-- retention and access rules.
--
-- Sanitising is not good enough, because a sanitiser is a function someone can
-- get wrong. Two independent layers instead:
--
--   1. src/lib/feedback/path.ts maps whatever the client submitted onto
--      ROUTE_PATTERNS and writes the PATTERN or nothing at all. A value that is
--      not already a member of that set never reaches the insert. Drift is
--      impossible because scripts/check-routes.mjs asserts ROUTE_PATTERNS
--      set-equals the AppRoutes union Next generates, in the fast `check` gate.
--
--   2. The CHECK below, because layer 1 protects the SERVER ACTION and a
--      signed-in user can POST to PostgREST directly. Every segment must be
--      either a bracketed placeholder or a short lowercase slug, which makes a
--      query string, a numeric patient number and a 36-character uuid
--      UNREPRESENTABLE rather than merely stripped.
--
-- Considered and rejected: making `path` a foreign key into a seeded table of
-- known routes, or an enum. Either is stronger still, and either would demand a
-- MIGRATION EVERY TIME A ROUTE IS ADDED -- a cost paid forever, on every future
-- phase, to close a gap the two layers above already close. Recorded so the
-- next person does not have to re-derive why.
--
-- ---------------------------------------------------------------------------
-- RULE 2: NO BLANKET WRITE-AUDIT TRIGGER. A NARROW TRANSITION TRIGGER INSTEAD.
--
-- Every other domain table in this repo carries `<table>_audit` ->
-- private.audit_row(), which writes to_jsonb(new) -- the WHOLE ROW. That is
-- correct for patients and appointment_types and wrong here, because `body` is
-- free text a human types, and humans paste patient names into free text no
-- matter what the placeholder says (rule 3 tries anyway). private.audit_log is
-- append-only, has 6+ year retention and is EXEMPT FROM PURGE, so mirroring the
-- body into it would make accidental PHI permanently unpurgeable -- created by
-- the very feature meant to make the system safer to use.
--
-- So: feedback_status_audit() below writes ONLY the status and soft-delete
-- transitions, as two-key jsonb objects, and never touches title, body or path.
-- There is deliberately NO feedback_reports_audit trigger. The exemption is
-- documented in docs/modules/00-overview.md alongside user_preferences.
--
-- It writes action 'update', not 'status_change'. private.audit_log's CHECK
-- (0002) allows read/create/update/delete/sign/export/login/settings_change,
-- and amending a shipped constraint to gain a SYNONYM for what an update
-- already is would be a schema change with no new information in it.
--
-- ---------------------------------------------------------------------------
-- NO app_version COLUMN, though 16-feedback.md's field list named one.
--
-- Nothing in this app threads a build id anywhere, so the column would ship
-- and stay null forever -- and "an unused column somebody later assumes is
-- maintained" is precisely the smell 2.2b caught itself producing, when 0013
-- seeded a `currency` key nothing could read and the first fix was a helper
-- that pretended to query and returned a constant. Better to have no column
-- than a column that lies by being empty. Add it when a build id exists to put
-- in it; the doc carries the trigger.
--
-- NO PARTIAL UNIQUE INDEX, unlike every other table here: nothing about a bug
-- report is unique. Two people reporting the same thing is signal, and the
-- `duplicate` status plus duplicate_of_id is how that is expressed.
-- ---------------------------------------------------------------------------

create type public.feedback_kind     as enum ('bug', 'idea', 'question', 'data_issue');
create type public.feedback_severity as enum ('blocker', 'major', 'minor', 'cosmetic');
create type public.feedback_status   as enum
  ('new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate');

create table public.feedback_reports (
  id              uuid primary key default gen_random_uuid(),

  reporter_id     uuid not null references public.profiles (id),
  -- A SNAPSHOT of the role at filing, not a join. A front-desk user promoted to
  -- superadmin next year must not retroactively turn their old report into a
  -- superadmin's report -- the whole value of "who was affected by this" is
  -- that it describes the person as they were when it bit them.
  reporter_role   public.app_role not null,

  kind            public.feedback_kind not null default 'bug',
  -- Reporter-set and superadmin-overridable (16-feedback.md): everyone thinks
  -- their own bug is a blocker, and taking the field away instead produces a
  -- queue with no signal at all.
  severity        public.feedback_severity not null default 'minor',

  title           text not null,
  body            text not null,

  -- Rule 1. Nullable on purpose: NULL means "could not be attributed to a known
  -- screen", which is honest, where a placeholder like '/unknown' would be a
  -- path that looks real and is not.
  path            text,
  -- Captured server-side from the request headers, never from a form field --
  -- there is no reason to let the client describe its own browser, and one
  -- fewer field is one fewer thing to validate.
  user_agent      text,
  -- Client-supplied, because only the browser knows it. Shape-checked below.
  viewport        text,

  status          public.feedback_status not null default 'new',
  triage_note     text,
  duplicate_of_id uuid references public.feedback_reports (id),
  resolved_at     timestamptz,
  resolved_by     uuid,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  deleted_by      uuid,

  constraint feedback_reports_title_shape
    check (length(btrim(title)) between 1 and 120),
  -- 4000 rather than unbounded: a report is a description, and the cap is what
  -- stops this table becoming a place to paste a whole chart. Bounds are
  -- duplicated in src/lib/feedback/schema.ts, and forms.md is explicit that
  -- they must agree -- when they drift the database rejects what the form
  -- accepted and the error has no field to attach to.
  constraint feedback_reports_body_shape
    check (length(btrim(body)) between 1 and 4000),

  -- RULE 1's backstop. Every segment is either `[placeholder]` or a lowercase
  -- slug of at most 25 characters. A uuid is 36 and a patient number starts
  -- with a digit, so neither can be spelled here at all; `?` and `#` are
  -- outside the character class entirely.
  constraint feedback_reports_path_masked
    check (path is null or path = '/'
           or path ~ '^(/(\[[a-z][a-z0-9_]*\]|[a-z][a-z0-9-]{0,24}))+$'),

  constraint feedback_reports_viewport_shape
    check (viewport is null or viewport ~ '^[0-9]{1,5}x[0-9]{1,5}$'),
  constraint feedback_reports_user_agent_len
    check (user_agent is null or length(user_agent) <= 400),
  constraint feedback_reports_triage_note_len
    check (triage_note is null or length(triage_note) <= 1000),

  -- Same-row, so a CHECK rather than a trigger (the 0013 rule).
  constraint feedback_reports_not_self_duplicate
    check (duplicate_of_id is null or duplicate_of_id <> id)
);

comment on table public.feedback_reports is
  'Bug reports and suggestions from any signed-in role. `path` holds a MASKED ROUTE PATTERN from a '
  'closed set, never a real id and never a query string -- without that this table becomes a log of '
  'which patient each staff member viewed, outside the audit trail that controls exactly that. '
  'Deliberately has NO blanket write-audit trigger: `body` is free text and private.audit_log is '
  'exempt from purge, so only status and soft-delete transitions are audited. '
  'See docs/modules/16-feedback.md.';

-- The triage queue's own ordering: new first, newest first.
create index feedback_reports_triage_idx
  on public.feedback_reports (status, created_at desc)
  where deleted_at is null;

-- "My reports" on /feedback.
create index feedback_reports_reporter_idx
  on public.feedback_reports (reporter_id, created_at desc)
  where deleted_at is null;

create trigger feedback_reports_updated_at
  before update on public.feedback_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Column guard.
--
-- Same reasoning as lookup_values_guard (0013): every signed-in user holds a
-- direct INSERT grant and the superadmin holds UPDATE, so "the server action
-- sets these fields" stops the app and nothing else.
--
-- On INSERT this OVERWRITES rather than validates. reporter_id, reporter_role
-- and status are not the client's to state -- a report filed as somebody else,
-- or filed pre-triaged as 'resolved', is not a validation failure to report
-- back, it is a value that must simply be impossible.
--
-- On UPDATE it pins what makes a filed report a FACT (16-feedback.md rule 6).
-- There is no comment table in Phase 2, so an editable body would let a report
-- be rewritten under a triage note that answered the original.
-- ---------------------------------------------------------------------------
create or replace function private.feedback_reports_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := public.jwt_role();
begin
  if TG_OP = 'INSERT' then
    if v_uid is null or v_role = 'anon' then
      raise exception 'not_authenticated' using errcode = '28000';
    end if;

    new.reporter_id     := v_uid;
    -- Schema-qualified cast: `set search_path = ''` means qualify TYPES too,
    -- which is the whole lesson of 0007 -- an unqualified ::app_role deploys
    -- clean and fails at run time, in front of whoever is reporting the bug.
    new.reporter_role   := v_role::public.app_role;
    new.status          := 'new';
    new.triage_note     := null;
    new.duplicate_of_id := null;
    new.resolved_at     := null;
    new.resolved_by     := null;
    new.deleted_at      := null;
    new.deleted_by      := null;
    return new;
  end if;

  if new.reporter_id is distinct from old.reporter_id
     or new.reporter_role is distinct from old.reporter_role then
    raise exception 'reporter_immutable' using errcode = '42501';
  end if;

  if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.kind is distinct from old.kind
     or new.path is distinct from old.path
     or new.user_agent is distinct from old.user_agent
     or new.viewport is distinct from old.viewport then
    raise exception 'report_immutable' using errcode = '42501';
  end if;

  -- Derived, never accepted: a resolved_at the client could set would be a
  -- timestamp that disagrees with the audit row written microseconds later.
  if new.status in ('resolved', 'wont_fix') and old.status not in ('resolved', 'wont_fix') then
    new.resolved_at := now();
    new.resolved_by := v_uid;
  elsif new.status not in ('resolved', 'wont_fix') then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;

  -- A duplicate_of pointer with any other status is a row whose two halves
  -- disagree about what it means.
  if new.duplicate_of_id is not null and new.status <> 'duplicate' then
    raise exception 'duplicate_needs_status' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger feedback_reports_guard
  before insert or update on public.feedback_reports
  for each row execute function private.feedback_reports_guard();

-- ---------------------------------------------------------------------------
-- The narrow transition audit -- rule 2. Read the header before widening this.
--
-- `after update of status, deleted_at` narrows WHEN it fires; the `is distinct
-- from` guards narrow whether it WRITES, because `update of` fires when a
-- column is merely mentioned in the UPDATE statement, not only when its value
-- changes. Both are needed: a triage-note-only save must leave no trace here.
-- ---------------------------------------------------------------------------
create or replace function private.feedback_status_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into private.audit_log
      (actor_id, actor_role, action, entity, entity_id, before, after)
    values (
      auth.uid(), public.jwt_role(), 'update', 'feedback_reports', new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    insert into private.audit_log
      (actor_id, actor_role, action, entity, entity_id, before, after)
    values (
      auth.uid(), public.jwt_role(), 'update', 'feedback_reports', new.id,
      jsonb_build_object('deleted_at', old.deleted_at),
      jsonb_build_object('deleted_at', new.deleted_at)
    );
  end if;

  return null; -- AFTER trigger: the return value is discarded.
end;
$$;

create trigger feedback_reports_status_audit
  after update of status, deleted_at on public.feedback_reports
  for each row execute function private.feedback_status_audit();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Authors read their own; the superadmin reads everything, including archived
-- (the named Archive-view exception from 00-overview.md, split out so it is
-- legible in \d rather than hidden inside a missing predicate).
--
-- ONLY the superadmin updates -- 16-feedback.md rule 6. A reporter who could
-- edit after triage would be answering a question the triage note already
-- answered, and there is no comment table in Phase 2 to hold the conversation
-- instead.
--
-- The insert policy checks jwt_role() rather than only auth.uid() so the rule
-- reads as what it is (rule 5: authenticated roles only; a public insert
-- endpoint with no captcha and no rate limiting is an abuse vector on a free
-- tier). The guard trigger enforces the same thing again, one layer down.
-- ---------------------------------------------------------------------------
alter table public.feedback_reports enable row level security;

create policy "authors read own reports"
  on public.feedback_reports for select
  using (reporter_id = auth.uid() and deleted_at is null);

create policy "superadmin reads all reports"
  on public.feedback_reports for select
  using (public.jwt_role() = 'superadmin' and deleted_at is null);

create policy "superadmin reads archived reports (Archive view)"
  on public.feedback_reports for select
  using (public.jwt_role() = 'superadmin' and deleted_at is not null);

create policy "signed-in users file reports"
  on public.feedback_reports for insert
  with check (reporter_id = auth.uid() and public.jwt_role() <> 'anon');

-- No deleted_at filter in USING: archive and restore are both UPDATEs, and a
-- restore has to be able to target an archived row.
create policy "superadmin triages reports"
  on public.feedback_reports for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

revoke all    on public.feedback_reports from anon;
revoke delete on public.feedback_reports from authenticated;
grant  select, insert, update on public.feedback_reports to authenticated;
