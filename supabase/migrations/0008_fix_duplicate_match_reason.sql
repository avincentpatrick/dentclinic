-- 0008: find_patient_duplicates -- add the missing phone-only match_reason arm
--
-- 0005's reason CASE had four arms for five reachable match shapes. The WHERE
-- clause admits a row on ANY of email / phone_norm / (surname + dob), but the
-- reason CASE only named email, email+dob, and phone+dob before falling through
-- to 'Same surname and date of birth'. So a row matched on mobile number alone
-- -- phone equal, dob absent or different -- was labelled with a sentence that
-- is simply false, in front of a staff member deciding whether two records are
-- the same person. The whole point of this function is to inform that judgement;
-- a wrong reason is worse than no reason.
--
-- The rank arm has the same gap and is left alone: a phone-only hit scoring 3
-- ('possible') is correct -- shared mobile numbers are common in families. Only
-- the label was lying.
--
-- After the new arm, `else` is reachable only through the surname+dob branch of
-- the WHERE clause, so the last label is true by construction rather than by
-- coincidence.
--
-- create or replace preserves grants; the revoke/grant pair below is repeated so
-- the migration reads as a complete statement of the function's exposure.

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
        when v_phone is not null and p.phone_norm = v_phone
          then 'Same mobile number'
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
