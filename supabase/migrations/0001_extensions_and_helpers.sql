-- 0001: extensions, private schema, shared helpers
-- (pg_cron + pg_net are enabled in the Phase 5 migration that first needs them)

create extension if not exists btree_gist;   -- GiST EXCLUDE constraints (anti-double-booking)
create extension if not exists pgcrypto;     -- gen_random_uuid, digest
create extension if not exists citext;       -- case-insensitive emails

-- Private schema: audit log, action tokens, secret settings. Never exposed via PostgREST.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Shared updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Role claim reader: single source of truth for RLS policies.
-- The claim is injected at token issuance by private.custom_access_token_hook (0002).
create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'user_role', 'anon');
$$;

-- Key/value settings. is_secret rows must only ever be read by service-role/definer code.
create table if not exists private.settings (
  key        text primary key,
  value      jsonb not null,
  is_secret  boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
