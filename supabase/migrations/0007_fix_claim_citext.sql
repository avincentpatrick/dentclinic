-- 0007: claim_or_create_patient -- remove the unqualified ::citext casts
--
-- Every security definer function in this codebase runs with `set search_path =
-- ''`, which makes EVERY identifier resolve against nothing -- including type
-- names. 0005 wrote `v_email::citext`, and citext lives in public, so the cast
-- raised `type "citext" does not exist` the first time a patient tried to
-- register. The function parsed and deployed fine; it could only fail at run
-- time, on the one path with no staff watching.
--
-- The casts were never needed. citext has an implicit cast from text, so
-- `p.email = v_email` (citext = text) and inserting text into a citext column
-- both work unqualified -- which is exactly why find_patient_duplicates, written
-- without casts, worked on the first try.
--
-- The lesson for later phases: `set search_path = ''` means schema-qualify
-- TYPES too, not just tables and functions. Prefer letting the implicit cast do
-- it; if you must be explicit, write public.citext.

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
  where p.email = v_email
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
    where p.email = v_email and p.deleted_at is null
  ) into v_taken;

  insert into public.patients
    (profile_id, first_name, middle_name, last_name, email, dob, phone, sex, address,
     emergency_contact_name, emergency_contact_phone, is_provisional,
     marketing_opt_in, marketing_opt_in_at, consent_given_at, consent_version)
  values
    (v_uid, v_first, nullif(btrim(coalesce(p_middle_name, '')), ''), v_last, v_email,
     p_dob, nullif(btrim(coalesce(p_phone, '')), ''), p_sex, nullif(btrim(coalesce(p_address, '')), ''),
     nullif(btrim(coalesce(p_emergency_name, '')), ''), nullif(btrim(coalesce(p_emergency_phone, '')), ''),
     v_taken, p_marketing_opt_in, case when p_marketing_opt_in then v_now end, v_now, p_consent_version)
  returning id into v_id;

  return v_id;
end;
$$;
