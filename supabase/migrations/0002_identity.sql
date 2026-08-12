-- 0002: roles, profiles, signup trigger, custom access token hook, audit log spine

create type public.app_role as enum ('patient', 'doctor', 'staff', 'superadmin');

-- One profile per auth user. Staff/doctors are deactivated, never deleted (audit references).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null default 'patient',
  full_name  text,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signup trigger: every new auth user gets a profile (default role: patient).
-- First-superadmin bootstrap: if private.settings has 'setup_superadmin_email'
-- matching the new user's email, they become superadmin and the flag self-deletes.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := 'patient';
  v_setup_email text;
begin
  select value #>> '{}' into v_setup_email
  from private.settings where key = 'setup_superadmin_email';

  if v_setup_email is not null and lower(new.email) = lower(v_setup_email) then
    v_role := 'superadmin';
    delete from private.settings where key = 'setup_superadmin_email';
  end if;

  insert into public.profiles (id, role, full_name)
  values (new.id, v_role, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook: injects user_role into every JWT and blocks
-- deactivated users at token issuance. Reads profiles directly (always current,
-- no app_metadata mirroring to drift). Register under Auth > Hooks.
-- ---------------------------------------------------------------------------
create or replace function private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_claims jsonb;
begin
  select role, is_active into v_profile
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  if v_profile is null then
    -- profile row not created yet (mid-signup): default to patient
    v_claims := coalesce(event -> 'claims', '{}'::jsonb)
                || jsonb_build_object('user_role', 'patient');
  elsif not v_profile.is_active then
    raise exception 'account_deactivated';
  else
    v_claims := coalesce(event -> 'claims', '{}'::jsonb)
                || jsonb_build_object('user_role', v_profile.role::text);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;
revoke execute on function private.custom_access_token_hook(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit log spine: append-only. Write-audit via row triggers (attached to
-- clinical/PHI tables as they are created); read-audit via public.log_read()
-- called from the server layer. No UPDATE/DELETE for anyone.
-- ---------------------------------------------------------------------------
create table private.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_role  text,
  action      text not null check (action in
                ('read','create','update','delete','sign','export','login','settings_change')),
  entity      text not null,
  entity_id   uuid,
  patient_id  uuid,
  before      jsonb,
  after       jsonb
);

revoke all on private.audit_log from public, anon, authenticated;

-- Generic write-audit row trigger (attach per table in later migrations)
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.audit_log (actor_id, actor_role, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    public.jwt_role(),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Server-layer read audit (called from server actions / route handlers)
create or replace function public.log_read(p_entity text, p_entity_id uuid, p_patient_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_log (actor_id, actor_role, action, entity, entity_id, patient_id)
  values (auth.uid(), public.jwt_role(), 'read', p_entity, p_entity_id, p_patient_id);
$$;

grant execute on function public.log_read(text, uuid, uuid) to authenticated;

-- Audit writes on profiles from day one
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- RLS baseline
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "superadmin reads all profiles"
  on public.profiles for select
  using (public.jwt_role() = 'superadmin');

create policy "update own profile (not role/is_active)"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Note: role and is_active changes go through a superadmin server action using the
-- service role; a column-level trigger guard is added with the users-admin module.
