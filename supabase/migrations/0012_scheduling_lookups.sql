-- 0012: appointment_types + operatories -- the two scheduling lookups (2.2b)
--
-- Split from the generic lookups (0013) deliberately: nothing here references
-- lookup_categories and nothing there references these tables. A migration is
-- one transaction, so bundling them would let a typo in a seeded fee amount
-- withhold the two tables Phase 3 cannot start without. 0005 bundled providers
-- and patients because an FK genuinely tied them; that reason is absent here.
--
-- WHY A TABLE AND NOT A CONSTANT -------------------------------------------
-- PLAN.md:82 seeds nine appointment types "all clinic-editable". Duration and
-- buffers are the two numbers a clinic tunes most -- a hygienist who needs 60
-- minutes rather than 50 must not need a deploy -- and Phase 3's
-- get_available_slots reads them at query time.
--
-- UNITS. duration_units / pre_buffer_units / post_buffer_units are counts of
-- TEN-MINUTE increments (AGENTS.md, PLAN.md:49), never minutes. Minutes exist
-- in exactly one place in the whole system: the form validator
-- (tenMinuteUnits in src/lib/forms/validation.ts). Nothing else multiplies by 10.
--
-- HOW THE BUFFERS COMPOSE. No formula existed anywhere in the repo -- PLAN.md
-- names the columns and the EXCLUDE constraints but never says how one becomes
-- the other. This is it:
--
--   time_range = tstzrange(
--     starts_at - pre_buffer_units * interval '10 minutes',
--     starts_at + (duration_units + post_buffer_units) * interval '10 minutes',
--     '[)')
--
-- starts_at is the moment the PATIENT is seen. pre_buffer extends the block
-- BEFORE that (room set-up, anaesthetic onset); post_buffer extends it AFTER
-- they leave (turnover, disinfection). Patient-facing UI shows duration_units
-- alone; only the scheduler ever sees the buffered block.
--
-- '[)' is not optional. Two '[]' ranges sharing an endpoint OVERLAP, so a 09:00
-- appointment ending at 09:50 and a 09:50 appointment would collide against the
-- EXCLUDE constraints and back-to-back booking would be impossible.
--
-- TWO CONSEQUENCES FOR PHASE 3.2, recorded here because they constrain THAT
-- table's columns rather than this one's:
--
--   1. A stored generated column may reference only columns of its OWN row, so
--      appointments.time_range CANNOT read appointment_types. 3.2 must COPY
--      duration_units / pre_buffer_units / post_buffer_units onto the
--      appointment at booking time, under the same names, types and bounds as
--      here. That is also the correct behaviour rather than a workaround:
--      re-timing "Crown Prep" from 90 to 100 minutes must not silently move
--      appointments already booked -- which would at best fail an unrelated
--      UPDATE against the EXCLUDE constraint, and at worst move a patient's
--      slot with nobody told. The type is a TEMPLATE; the appointment records
--      what was actually agreed.
--   2. timestamptz + interval is STABLE, not IMMUTABLE, so the expression above
--      may be REJECTED in a `generated always as (...) stored` column. Verify
--      before writing 3.2:
--        select provolatile from pg_proc where proname = 'timestamptz_pl_interval';
--      If it is 's', either generate time_range from two plain timestamptz
--      columns maintained by a BEFORE trigger (tstzrange(ts, ts, text) IS
--      immutable), or wrap the arithmetic in an IMMUTABLE helper -- pure-time
--      interval addition on timestamptz is genuinely timezone-independent.
--      Nothing in 2.2b depends on which is chosen.
-- ---------------------------------------------------------------------------

-- Palette KEYS, not colours. The clinic picks a name; globals.css owns what it
-- resolves to, so a hex from a form can never reach a style attribute and
-- check:contrast can prove every pair (07-contributing.md: an unlisted token is
-- an unproven token). An enum rather than text + CHECK because the generated
-- TypeScript then hands the form a union for free -- the same shape patient_sex
-- and SEX_VALUES already use.
--
-- NO TOKENS SHIP IN 2.2b. The admin UI shows the colour's NAME as text, which is
-- what a screen reader gets either way; the tokens land in 3.2 with the calendar
-- that first renders them, and contrast-pairs.mjs gains their pairs then.
create type public.appointment_color as enum
  ('teal', 'indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'slate');

create table public.appointment_types (
  id                uuid primary key default gen_random_uuid(),

  name              text not null,                -- picker label and calendar block text
  description       text,                         -- optional patient-facing sentence

  -- Counts of 10-minute units. See the header.
  duration_units    integer not null,
  pre_buffer_units  integer not null default 0,
  post_buffer_units integer not null default 0,

  -- False for treatment a patient cannot self-diagnose. Enforced in the RLS
  -- policy, not merely in the query -- see the RLS block below.
  patient_bookable  boolean not null default true,

  color             public.appointment_color not null default 'teal',

  -- Not in PLAN.md:49's column list. Added because the Phase 4 booking wizard
  -- needs a clinic-chosen order: sorting by name opens it with "Child Prophy,
  -- Consultation, Crown Prep", which is not how a clinic thinks about its own
  -- services. providers and operatories both carry it for the same reason.
  sort_order        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        uuid,

  -- 1 unit = 10 minutes; 48 units = 8 hours. The upper bound catches the real
  -- slip -- typing 90 into a box whose value was already converted from minutes
  -- -- and keeps Phase 3's 10-minute grid walk bounded.
  constraint appointment_types_duration_sane check (duration_units between 1 and 48),
  -- 0-60 minutes each. A buffer consumes chair time INVISIBLY: it never appears
  -- on the patient's confirmation and never shows in the duration. A
  -- fat-fingered 60 UNITS would silently block ten hours per appointment.
  constraint appointment_types_pre_buffer_sane  check (pre_buffer_units  between 0 and 6),
  constraint appointment_types_post_buffer_sane check (post_buffer_units between 0 and 6)
);

comment on table public.appointment_types is
  'Bookable service catalogue. duration_units/pre_buffer_units/post_buffer_units are counts of '
  '10-minute increments, not minutes. Phase 3 COPIES them onto each appointment at booking time '
  '-- a stored generated column cannot read another table, and re-timing a type must not move '
  'appointments already booked. See docs/modules/02-clinic-settings.md.';

-- One live type per name. Archived rows keep their name so history reads
-- correctly, and do not block re-creating an equivalent live one.
create unique index appointment_types_name_key
  on public.appointment_types (lower(name))
  where deleted_at is null;

create index appointment_types_sort_idx
  on public.appointment_types (sort_order, name)
  where deleted_at is null;

-- The Phase 4 booking-wizard read path.
create index appointment_types_bookable_idx
  on public.appointment_types (sort_order, name)
  where patient_bookable and deleted_at is null;

create trigger appointment_types_updated_at
  before update on public.appointment_types
  for each row execute function public.set_updated_at();

-- Audited, unlike user_preferences: 00-overview.md's audit exemption covers
-- personal display preferences only. A duration change reshapes everyone's
-- schedule, so "who shortened Crown Prep, and when" is exactly what audit_log
-- is for.
create trigger appointment_types_audit
  after insert or update or delete on public.appointment_types
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- operatories: the chairs. PLAN.md:47 -- sort_order, default_provider_id,
-- is_hygiene.
--
-- Never patient-visible. A patient picks a service, a provider and a time;
-- which chair they sit in is the clinic's business and is resolved by the
-- scheduler. Hence a staff-side-only read policy, unlike appointment_types.
-- Phase 3's get_available_slots is security definer and reads regardless.
--
-- No capacity or equipment columns: PLAN's model resolves a chair from
-- default_provider_id and is_hygiene, and an unused column is one someone will
-- later assume is maintained.
-- ---------------------------------------------------------------------------
create table public.operatories (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,              -- "Op 1", "Hygiene 1"
  sort_order          integer not null default 0, -- left-to-right column order on the Phase 3 calendar
  -- 0005:17-18 promised this FK explicitly, and it is why providers shipped a
  -- phase early. `on delete set null` matches patients.primary_provider_id;
  -- there is no DELETE grant on providers, so it can only ever fire from a
  -- migration or the service role.
  default_provider_id uuid references public.providers (id) on delete set null,
  is_hygiene          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  deleted_by          uuid
);

comment on table public.operatories is
  'Treatment chairs. One Phase 3 EXCLUDE constraint keys on operatory_id, so archiving a chair '
  'must never cascade to its appointments -- the calendar stops offering the column, the history '
  'stays legible. See docs/modules/02-clinic-settings.md.';

create unique index operatories_name_key
  on public.operatories (lower(name))
  where deleted_at is null;

create index operatories_sort_idx
  on public.operatories (sort_order, name)
  where deleted_at is null;

create trigger operatories_updated_at
  before update on public.operatories
  for each row execute function public.set_updated_at();

create trigger operatories_audit
  after insert or update or delete on public.operatories
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- RLS
--
-- appointment_types splits its read by role rather than taking providers'
-- single "everyone signed in reads" policy, because patient_bookable is a RULE,
-- not a filter. A patient must not be able to select -- or even see -- a type
-- the clinic does not offer for self-booking. Putting it in the policy means a
-- forgotten .eq() in a Phase 4 query cannot leak one.
--
-- Both tables get the named archived-read exception (00-overview.md § Archive
-- view), narrowed to superadmin: /admin/lookups has an Archived filter and an
-- Undo, and without it `?archived=1` returns zero rows while Restore targets
-- nothing and still looks like it worked.
-- ---------------------------------------------------------------------------
alter table public.appointment_types enable row level security;

create policy "clinic reads appointment types"
  on public.appointment_types for select
  using (public.jwt_role() in ('staff', 'doctor', 'superadmin') and deleted_at is null);

create policy "patients read bookable appointment types"
  on public.appointment_types for select
  using (public.jwt_role() = 'patient' and patient_bookable and deleted_at is null);

create policy "superadmin reads archived appointment types (Archive view)"
  on public.appointment_types for select
  using (public.jwt_role() = 'superadmin' and deleted_at is not null);

create policy "superadmin writes appointment types"
  on public.appointment_types for insert
  with check (public.jwt_role() = 'superadmin');

-- No deleted_at filter in USING: archive and restore are both UPDATEs, and a
-- restore has to be able to target an archived row.
create policy "superadmin updates appointment types"
  on public.appointment_types for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

revoke all    on public.appointment_types from anon;
revoke delete on public.appointment_types from authenticated;
grant  select, insert, update on public.appointment_types to authenticated;

alter table public.operatories enable row level security;

create policy "clinic reads operatories"
  on public.operatories for select
  using (public.jwt_role() in ('staff', 'doctor', 'superadmin') and deleted_at is null);

create policy "superadmin reads archived operatories (Archive view)"
  on public.operatories for select
  using (public.jwt_role() = 'superadmin' and deleted_at is not null);

create policy "superadmin writes operatories"
  on public.operatories for insert
  with check (public.jwt_role() = 'superadmin');

create policy "superadmin updates operatories"
  on public.operatories for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

revoke all    on public.operatories from anon;
revoke delete on public.operatories from authenticated;
grant  select, insert, update on public.operatories to authenticated;

-- ---------------------------------------------------------------------------
-- Seeds -- PLAN.md:82, durations verbatim.
--
-- patient_bookable is NOT uniform, and PLAN does not specify it. Recall,
-- hygiene, exam, consultation and emergency are self-bookable; a filling, an
-- extraction, a crown prep and a molar root canal are not, because a patient
-- cannot self-diagnose them -- the front desk books treatment after an exam.
-- All of it is clinic-editable, which is what "all clinic-editable" asks for;
-- this is only the starting position.
--
-- sort_order groups the self-bookable types first, so the Phase 4 wizard opens
-- with what most patients actually want. PLAN's listing order is prose, not a
-- rank.
-- ---------------------------------------------------------------------------
insert into public.appointment_types
  (name, duration_units, pre_buffer_units, post_buffer_units, patient_bookable, color, sort_order)
values
  ('Adult Recall + Prophy', 5, 0, 0, true,  'teal',    10),  -- 50m
  ('Child Prophy',          3, 0, 0, true,  'sky',     20),  -- 30m
  ('New Patient Exam',      4, 0, 0, true,  'indigo',  30),  -- 40m
  ('Consultation',          2, 0, 0, true,  'violet',  40),  -- 20m
  ('Emergency',             3, 0, 1, true,  'rose',    50),  -- 30m + 10m post-buffer
  ('Simple Filling',        4, 0, 0, false, 'emerald', 60),  -- 40m
  ('Simple Extraction',     3, 0, 0, false, 'amber',   70),  -- 30m
  ('Crown Prep',            9, 0, 0, false, 'slate',   80),  -- 90m
  ('Root Canal Molar',      9, 0, 0, false, 'slate',   90);  -- 90m

-- PLAN.md:82: "2 operatories". One flagged hygiene, which is the standard
-- small-practice layout and what gives the Phase 3 calendar its hygiene column.
-- Both flags are clinic-editable.
insert into public.operatories (name, sort_order, is_hygiene) values
  ('Op 1', 10, false),
  ('Op 2', 20, true);

-- PHASE 4 SEAM, recorded and deliberately NOT built: /book is public and `anon`
-- holds no grant here, so guest booking will need a definer-rights
-- public.bookable_services view granted to anon -- exactly the way
-- clinic_branding is "the only public door" into settings. Shipping it now
-- would be anon-readable surface with no reader.
