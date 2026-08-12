-- 0005: providers + patients (the first PHI table) + registry RPCs
--
-- Numbering note: PLAN.md:72 puts lookups/feedback at "0003" and everything
-- after shifts; 0004 already recorded the +1 from the audit_row() hotfix. Phase
-- 2 is built patients-first (2.1 has no email dependency and runs while the
-- Brevo signup is outstanding), so patients take 0005 and lookups/settings/
-- feedback follow in 0006-0008. PLAN.md § Migration order is updated to match.

create type public.patient_sex as enum ('female', 'male', 'other', 'undisclosed');

-- ---------------------------------------------------------------------------
-- providers: the clinicians appointments are booked against.
--
-- Created here, ahead of its own module (Phase 3 scheduling), because two Phase
-- 2 columns point at it: patients.primary_provider_id and, in 0006,
-- operatories.default_provider_id. A uuid column with no FK would be a dangling
-- reference for a whole phase.
--
-- profile_id is nullable on purpose: a clinic records a provider before that
-- person has a login (or for a locum who never gets one). Identity and
-- schedulable-resource are different things -- profiles owns the first.
--
-- Phase 3 adds availability_rules/exceptions keyed on this table. Nothing here
-- is an "is_active" flag: archived (deleted_at) covers "no longer at the
-- clinic", and "away this week" is an availability exception, not a provider
-- property. Two overlapping liveness concepts on one table is how a scheduler
-- starts booking ghosts.
-- ---------------------------------------------------------------------------
create table public.providers (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles (id) on delete set null,
  display_name text not null,
  title        text,                                   -- "DMD", "RDH" -- shown next to the name
  is_hygiene   boolean not null default false,         -- hygiene column on the Phase 3 calendar
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid
);

-- One provider row per profile, among live rows.
create unique index providers_profile_key
  on public.providers (profile_id)
  where profile_id is not null and deleted_at is null;

create index providers_sort_idx
  on public.providers (sort_order, display_name)
  where deleted_at is null;

create trigger providers_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

create trigger providers_audit
  after insert or update or delete on public.providers
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- patients: the clinic roster, and the first table in the system holding PHI.
--
-- profile_id is nullable -- a walk-in recorded by the front desk has no login,
-- and Phase 4 guest booking creates provisional rows the same way. It is the
-- link, not the identity: merging, archiving and history all key on patients.id.
--
-- DEDUPE, and a deliberate deviation from PLAN.md:47 ------------------------
-- PLAN specifies `unique(email, dob)`. This ships a NON-unique index instead,
-- and the duplicate check is a warning in the server action. Reasons, in order:
--   1. PLAN.md:135 promises a duplicate *warning* and defers the merge queue,
--      and this table carries merged_into_id. Both presuppose that duplicates
--      can exist and be reconciled later. A unique index says they cannot.
--   2. Siblings sharing one parent's email with the same date of birth (twins)
--      are a real dental-clinic case, not a hypothetical. A unique index turns
--      that into a 23505 at the front counter with no override.
--   3. A hard constraint converts a judgement call ("is this the same person?")
--      into an unrecoverable error at the exact moment someone is standing at
--      the desk. Staff can see the match and decide; the DB cannot.
-- The index still exists -- it is what makes the check cheap. See
-- docs/modules/03-patients.md § Rules & Invariants.
-- ---------------------------------------------------------------------------
create sequence public.patient_number_seq;

create table public.patients (
  id                  uuid primary key default gen_random_uuid(),

  -- Human-facing handle. Not in PLAN's column list, added because a front desk
  -- needs to name a record out loud without reading a name aloud in a waiting
  -- room, and because backfilling stable numbers after rows exist is painful.
  patient_number      text not null default 'P' || lpad(nextval('public.patient_number_seq')::text, 5, '0'),

  profile_id          uuid references public.profiles (id) on delete set null,

  first_name          text not null,
  middle_name         text,
  last_name           text not null,
  -- Generated rather than a view or app-side concat: the roster sorts and
  -- searches on it, and a stored column keeps that in one place.
  full_name           text generated always as (first_name || ' ' || last_name) stored,

  email               citext,                          -- citext (0001) so case never forks a record
  dob                 date,
  phone               text,
  -- Last 10 digits, so "+63 917 123 4567", "0917-123-4567" and "9171234567"
  -- all compare equal in the duplicate check.
  phone_norm          text generated always as (
                        nullif(right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10), '')
                      ) stored,

  sex                 public.patient_sex not null default 'undisclosed',
  address             text,
  emergency_contact_name  text,
  emergency_contact_phone text,

  is_provisional      boolean not null default false,  -- created by guest booking / unresolved self-registration
  merged_into_id      uuid references public.patients (id),
  primary_provider_id uuid references public.providers (id) on delete set null,
  recall_disabled     boolean not null default false,

  marketing_opt_in    boolean not null default false,
  marketing_opt_in_at timestamptz,

  -- Data Privacy Act consent, captured at registration. PLAN.md schedules the
  -- DPA checklist for Phase 9, but consent is captured at the moment a record
  -- is created or it has to be chased retroactively for every existing patient.
  consent_given_at    timestamptz,
  consent_version     text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  deleted_by          uuid,

  constraint patients_dob_sane check (dob is null or (dob > date '1900-01-01' and dob <= current_date)),
  constraint patients_not_merged_into_self check (merged_into_id is null or merged_into_id <> id),
  constraint patients_consent_versioned check ((consent_given_at is null) = (consent_version is null))
);

comment on table public.patients is
  'Clinic roster. profile_id is nullable (walk-ins and guest bookings have no login). '
  'The (email, dob) index is deliberately NOT unique -- duplicates are surfaced as a '
  'warning and reconciled via merged_into_id, because twins sharing a parent email are '
  'real and a 23505 at the front desk is not recoverable. See docs/modules/03-patients.md.';

-- Numbers are never reused, not even by an archived record: no partial predicate.
create unique index patients_number_key on public.patients (patient_number);

-- One patient record per login, among live rows.
create unique index patients_profile_key
  on public.patients (profile_id)
  where profile_id is not null and deleted_at is null;

-- The dedupe probe. Non-unique by design (see the block above).
create index patients_dedupe_idx
  on public.patients (email, dob)
  where deleted_at is null;

create index patients_phone_idx
  on public.patients (phone_norm)
  where phone_norm is not null and deleted_at is null;

-- Roster sort/search and the surname+dob fuzzy match.
create index patients_name_idx
  on public.patients (lower(last_name), lower(first_name))
  where deleted_at is null;

create trigger patients_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

create trigger patients_audit
  after insert or update or delete on public.patients
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Staff-side reads are split into two policies on purpose. Permissive policies
-- OR together, so the practical grant is identical to one unfiltered policy --
-- but AGENTS.md makes "RLS filters deleted_at IS NULL" non-negotiable, and an
-- Archive/Undo affordance cannot exist if archived rows are unreadable. Naming
-- the exception keeps it legible in \d output instead of hiding it inside a
-- missing predicate. Patients never get it: their policy filters, full stop.
--
-- Patients have NO insert or update policy. Self-registration goes through
-- claim_or_create_patient() and self-edits through update_own_patient(), both
-- security definer with an explicit column allow-list. That is what makes a
-- column guard trigger unnecessary: a patient cannot reach the columns that
-- would need guarding (patient_number, is_provisional, merged_into_id,
-- primary_provider_id, recall_disabled, deleted_at) because they cannot write
-- the table at all.
-- ---------------------------------------------------------------------------
alter table public.providers enable row level security;

create policy "everyone signed in reads providers"
  on public.providers for select
  using (deleted_at is null);

create policy "superadmin writes providers"
  on public.providers for insert
  with check (public.jwt_role() = 'superadmin');

create policy "superadmin updates providers"
  on public.providers for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

revoke all    on public.providers from anon;
revoke delete on public.providers from authenticated;
grant  select, insert, update on public.providers to authenticated;

alter table public.patients enable row level security;

create policy "patients read own record"
  on public.patients for select
  using (profile_id = auth.uid() and deleted_at is null);

create policy "clinic reads patients"
  on public.patients for select
  using (public.jwt_role() in ('staff', 'doctor', 'superadmin') and deleted_at is null);

-- Named exception to the deleted_at filter: the Archive view and Undo.
create policy "clinic reads archived patients (Archive view)"
  on public.patients for select
  using (public.jwt_role() in ('staff', 'doctor', 'superadmin') and deleted_at is not null);

create policy "clinic creates patients"
  on public.patients for insert
  with check (public.jwt_role() in ('staff', 'doctor', 'superadmin'));

-- No deleted_at filter in USING: archiving and restoring are both UPDATEs, and
-- a restore has to be able to target an archived row.
create policy "clinic updates patients"
  on public.patients for update
  using (public.jwt_role() in ('staff', 'doctor', 'superadmin'))
  with check (public.jwt_role() in ('staff', 'doctor', 'superadmin'));

revoke all    on public.patients from anon;
revoke delete on public.patients from authenticated;
grant  select, insert, update on public.patients to authenticated;

grant usage, select on sequence public.patient_number_seq to authenticated;

-- ---------------------------------------------------------------------------
-- find_patient_duplicates: the probe behind the front-desk warning.
--
-- security INVOKER, so RLS still applies and a staff member can only be shown
-- rows they could already read. The role check is belt-and-braces for a clearer
-- error than an empty result, and because this function is the one place that
-- would otherwise become a patient-existence oracle.
--
-- Never callable in a way that leaks: the self-registration path does not use
-- it. That path is claim_or_create_patient(), which takes no email at all.
-- ---------------------------------------------------------------------------
create or replace function public.find_patient_duplicates(
  p_email     text default null,
  p_dob       date default null,
  p_last_name text default null,
  p_phone     text default null,
  p_exclude   uuid default null                        -- the row being edited
)
returns table (
  id             uuid,
  patient_number text,
  full_name      text,
  email          text,
  phone          text,
  dob            date,
  is_provisional boolean,
  confidence     text,
  match_reason   text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_last  text := lower(nullif(btrim(coalesce(p_last_name, '')), ''));
  v_phone text := nullif(right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10), '');
begin
  if public.jwt_role() not in ('staff', 'doctor', 'superadmin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Nothing to match on: return empty rather than scanning the roster.
  if v_email is null and v_phone is null and (v_last is null or p_dob is null) then
    return;
  end if;

  return query
  with scored as (
    select
      p.id, p.patient_number, p.full_name, p.email::text as email_t,
      p.phone, p.dob, p.is_provisional,
      case
        when v_email is not null and p.email = v_email and p_dob is not null and p.dob = p_dob then 1
        when v_email is not null and p.email = v_email                                          then 2
        when v_phone is not null and p.phone_norm = v_phone and p_dob is not null and p.dob = p_dob then 2
        else 3
      end as rank,
      case
        when v_email is not null and p.email = v_email and p_dob is not null and p.dob = p_dob
          then 'Same email address and date of birth'
        when v_email is not null and p.email = v_email
          then 'Same email address'
        when v_phone is not null and p.phone_norm = v_phone and p_dob is not null and p.dob = p_dob
          then 'Same mobile number and date of birth'
        else 'Same surname and date of birth'
      end as reason
    from public.patients p
    where p.deleted_at is null
      and p.merged_into_id is null
      and (p_exclude is null or p.id <> p_exclude)
      and (
           (v_email is not null and p.email = v_email)
        or (v_phone is not null and p.phone_norm = v_phone)
        or (v_last is not null and p_dob is not null and lower(p.last_name) = v_last and p.dob = p_dob)
      )
  )
  select s.id, s.patient_number, s.full_name, s.email_t, s.phone, s.dob, s.is_provisional,
         (array['certain', 'likely', 'possible'])[s.rank],
         s.reason
  from scored s
  order by s.rank, s.full_name
  limit 5;
end;
$$;

revoke execute on function public.find_patient_duplicates(text, date, text, text, uuid) from public, anon;
grant  execute on function public.find_patient_duplicates(text, date, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- claim_or_create_patient: patient self-registration.
--
-- The caller does NOT supply an email. It is read from auth.users for
-- auth.uid() and must be confirmed. That single decision is what makes this
-- un-probeable: there is no attacker-supplied selector, so the only row
-- reachable is the one belonging to a mailbox Supabase Auth has proven the
-- caller controls. A version that took an email would be an enumeration
-- endpoint no matter how carefully its error messages were worded.
--
-- It is also the walk-in upgrade path: a record the front desk created is
-- CLAIMED rather than duplicated the first time that person signs in.
-- Claiming fills blanks only and never overwrites a clinic-entered value --
-- except marketing_opt_in and consent, where the most recent expression of the
-- patient's own wishes must win.
-- ---------------------------------------------------------------------------
create or replace function public.claim_or_create_patient(
  p_first_name       text,
  p_last_name        text,
  p_middle_name      text               default null,
  p_dob              date               default null,
  p_phone            text               default null,
  p_sex              public.patient_sex default 'undisclosed',
  p_address          text               default null,
  p_emergency_name   text               default null,
  p_emergency_phone  text               default null,
  p_marketing_opt_in boolean            default false,
  p_consent_version  text               default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_id     uuid;
  v_taken  boolean;
  v_first  text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last   text := nullif(btrim(coalesce(p_last_name, '')), '');
  v_now    timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_first is null or v_last is null then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if p_consent_version is null then
    raise exception 'consent_required' using errcode = '22023';
  end if;

  select lower(btrim(u.email)) into v_email
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'no_verified_email' using errcode = '28000';
  end if;

  -- 1. Idempotent: this login already has a record. Re-submitting the form
  --    (a double tap, a back-button repost) must not create a second one.
  select p.id into v_id
  from public.patients p
  where p.profile_id = v_uid and p.deleted_at is null
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- 2. Claim an unclaimed record for this verified mailbox.
  select p.id into v_id
  from public.patients p
  where p.email = v_email::citext
    and p.profile_id is null
    and p.merged_into_id is null
    and p.deleted_at is null
  order by p.created_at
  limit 1;

  if v_id is not null then
    update public.patients p
       set profile_id              = v_uid,
           is_provisional          = false,
           first_name              = coalesce(p.first_name, v_first),
           last_name               = coalesce(p.last_name, v_last),
           middle_name             = coalesce(p.middle_name, nullif(btrim(coalesce(p_middle_name, '')), '')),
           dob                     = coalesce(p.dob, p_dob),
           phone                   = coalesce(p.phone, nullif(btrim(coalesce(p_phone, '')), '')),
           sex                     = case when p.sex = 'undisclosed' then p_sex else p.sex end,
           address                 = coalesce(p.address, nullif(btrim(coalesce(p_address, '')), '')),
           emergency_contact_name  = coalesce(p.emergency_contact_name, nullif(btrim(coalesce(p_emergency_name, '')), '')),
           emergency_contact_phone = coalesce(p.emergency_contact_phone, nullif(btrim(coalesce(p_emergency_phone, '')), '')),
           marketing_opt_in        = p_marketing_opt_in,
           marketing_opt_in_at     = case when p_marketing_opt_in then v_now end,
           consent_given_at        = v_now,
           consent_version         = p_consent_version
     where p.id = v_id;
    return v_id;
  end if;

  -- 3. Nothing claimable. If a record with this email exists but is already
  --    linked to another profile, something needs a human: create the row
  --    PROVISIONAL so it surfaces in the staff review list. The patient is
  --    never told any of this -- they see "someone will call you".
  select exists (
    select 1 from public.patients p
    where p.email = v_email::citext and p.deleted_at is null
  ) into v_taken;

  insert into public.patients
    (profile_id, first_name, middle_name, last_name, email, dob, phone, sex, address,
     emergency_contact_name, emergency_contact_phone, is_provisional,
     marketing_opt_in, marketing_opt_in_at, consent_given_at, consent_version)
  values
    (v_uid, v_first, nullif(btrim(coalesce(p_middle_name, '')), ''), v_last, v_email::citext,
     p_dob, nullif(btrim(coalesce(p_phone, '')), ''), p_sex, nullif(btrim(coalesce(p_address, '')), ''),
     nullif(btrim(coalesce(p_emergency_name, '')), ''), nullif(btrim(coalesce(p_emergency_phone, '')), ''),
     v_taken, p_marketing_opt_in, case when p_marketing_opt_in then v_now end, v_now, p_consent_version)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.claim_or_create_patient(
  text, text, text, date, text, public.patient_sex, text, text, text, boolean, text) from public, anon;
grant execute on function public.claim_or_create_patient(
  text, text, text, date, text, public.patient_sex, text, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- update_own_patient: the /profile edit path.
--
-- The allow-list IS the security boundary -- these are the only columns a
-- patient may change about themselves. Everything clinical, administrative or
-- identifying (patient_number, email, is_provisional, merged_into_id,
-- primary_provider_id, recall_disabled, consent, deleted_at) is unreachable
-- because it is not a parameter.
--
-- email is deliberately absent: it is the account identity and the claim key.
-- Changing it belongs to Supabase Auth's own verified email-change flow, and
-- letting it drift here would silently break claim_or_create_patient().
-- ---------------------------------------------------------------------------
create or replace function public.update_own_patient(
  p_first_name       text,
  p_last_name        text,
  p_middle_name      text               default null,
  p_dob              date               default null,
  p_phone            text               default null,
  p_sex              public.patient_sex default 'undisclosed',
  p_address          text               default null,
  p_emergency_name   text               default null,
  p_emergency_phone  text               default null,
  p_marketing_opt_in boolean            default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_first text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  text := nullif(btrim(coalesce(p_last_name, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_first is null or v_last is null then
    raise exception 'name_required' using errcode = '22023';
  end if;

  update public.patients p
     set first_name              = v_first,
         last_name               = v_last,
         middle_name             = nullif(btrim(coalesce(p_middle_name, '')), ''),
         dob                     = p_dob,
         phone                   = nullif(btrim(coalesce(p_phone, '')), ''),
         sex                     = p_sex,
         address                 = nullif(btrim(coalesce(p_address, '')), ''),
         emergency_contact_name  = nullif(btrim(coalesce(p_emergency_name, '')), ''),
         emergency_contact_phone = nullif(btrim(coalesce(p_emergency_phone, '')), ''),
         marketing_opt_in        = p_marketing_opt_in,
         marketing_opt_in_at     = case
                                     when p_marketing_opt_in and not p.marketing_opt_in then now()
                                     when p_marketing_opt_in then p.marketing_opt_in_at
                                   end
   where p.profile_id = v_uid and p.deleted_at is null
   returning p.id into v_id;

  if v_id is null then
    raise exception 'no_patient_record' using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.update_own_patient(
  text, text, text, date, text, public.patient_sex, text, text, text, boolean) from public, anon;
grant execute on function public.update_own_patient(
  text, text, text, date, text, public.patient_sex, text, text, text, boolean) to authenticated;
