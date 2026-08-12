-- 0004: user preferences (theme/font/motion/gamification) + public clinic_branding view
--
-- Numbering note: PLAN.md:72 assigned "0003" to settings/branding, but 0003 was
-- consumed by the audit_row() hotfix. Everything from there shifts by one.

create type public.theme_pref     as enum ('light', 'dark', 'system');
create type public.font_size_pref as enum ('auto', 'standard', 'comfortable', 'large', 'xlarge');

-- ---------------------------------------------------------------------------
-- user_preferences: config satellite of profiles. Cookies are the runtime
-- source (SSR-correct first paint); this table is the cross-device mirror,
-- reconciled once per browser session in middleware ("DB wins on login").
--
-- 'auto' font_size is the default and is what produces "patient routes default
-- to 112.5%": it resolves per-pathname at render. Any explicit value wins on
-- every route, for every role -- route defaults only fill an unset preference.
--
-- Two DELIBERATE exceptions to docs/modules/00-overview.md conventions:
--   1. No deleted_at/deleted_by. Soft delete protects records that other rows
--      reference. This has no dependents, its lifetime is exactly its profile's,
--      there is no "archive" affordance, and "reset" is semantically an UPDATE.
--      The "no hard DELETE grants" half of the rule is kept below.
--   2. No audit trigger. private.audit_log is append-only with 6+ year retention
--      and is exempt from purge; a theme toggle carries no compliance value and
--      would flood it. The 'settings_change' action is for clinic-wide settings
--      that affect other people -- these affect only the actor.
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  theme         public.theme_pref     not null default 'system',
  font_size     public.font_size_pref not null default 'auto',
  reduce_motion boolean not null default false,
  gamification  jsonb   not null default '{}'::jsonb,   -- Phase 10 toggles
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.user_preferences is
  'Config satellite of profiles. Deliberately exempt from the soft-delete convention '
  '(no dependents, no archive affordance, lifetime == profile, reset is an UPDATE) and '
  'deliberately not audited (display preferences carry no compliance value and would '
  'flood the append-only audit_log). See docs/modules/02-clinic-settings.md.';

create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

create policy "read own preferences"
  on public.user_preferences for select
  using (user_id = auth.uid());

create policy "insert own preferences"
  on public.user_preferences for insert
  with check (user_id = auth.uid());

create policy "update own preferences"
  on public.user_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No DELETE policy and no DELETE grant: "reset to defaults" is an UPDATE.
revoke all    on public.user_preferences from anon;
revoke delete on public.user_preferences from authenticated;
grant  select, insert, update on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- clinic_branding: the ONLY public door into private.settings.
--
-- private is revoked from anon/authenticated, and this view runs with definer
-- rights (Postgres default), so it can read through. It must therefore NEVER
-- select * -- only these four non-secret keys, each coalesced so a fresh
-- install still returns exactly one row.
--
-- Needed without a session by the public landing page and (Phase 9) the PWA
-- manifest. The superadmin editing UI lands in Phase 2.2.
-- ---------------------------------------------------------------------------
create view public.clinic_branding as
select
  coalesce((select value #>> '{}' from private.settings where key = 'clinic_name'), 'DentClinic') as clinic_name,
  (select value #>> '{}' from private.settings where key = 'tagline')  as tagline,
  (select value #>> '{}' from private.settings where key = 'logo_url') as logo_url,
  coalesce(
    (select (value #>> '{}')::numeric from private.settings where key = 'brand_hue'),
    195
  )::numeric as brand_hue;

grant select on public.clinic_branding to anon, authenticated;

-- Seed defaults. brand_hue 195 = teal-cyan; see docs/design-system/01-tokens.md
-- for why this hue is the tightest point in the sRGB gamut and what that costs.
insert into private.settings (key, value, is_secret)
values
  ('clinic_name', to_jsonb('DentClinic'::text), false),
  ('brand_hue',   to_jsonb(195::numeric),       false)
on conflict (key) do nothing;
