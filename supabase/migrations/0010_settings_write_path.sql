-- 0010: clinic branding write path (Phase 2.2a)
--
-- Numbering: docs/PLAN.md:74 reserved 0008/0009/0010 for lookups/settings/
-- feedback. 0008 and 0009 were consumed by hotfixes (find_patient_duplicates
-- match_reason, log_read id defaults), so the ladder slid by two. PLAN.md is
-- corrected in this commit; PLAN.md:72 already states the file names here are
-- the truth.
--
-- private.settings has existed since 0001 with NO write path of any kind: the
-- whole `private` schema is revoked from anon/authenticated (0001:10), and the
-- only public door is the definer-rights clinic_branding view (0004), which is
-- read-only. Phase 1.1 changed the hue by hand in the SQL editor. This is the
-- migration that lets a superadmin do it from a form.
--
-- WHY NOT set_setting(key text, value jsonb) WITH AN ALLOW-LIST -------------
--   1. An allow-list inside a generic function is a list somebody must
--      remember to re-audit every time a key is added. Here THE ALLOW-LIST IS
--      THE SIGNATURE -- there is no key parameter, so there is nothing to
--      forget. That matters concretely: this table holds
--      `setup_superadmin_email`, which private.handle_new_user() (0002:35-41)
--      reads to promote a matching signup to SUPERADMIN. A generic setter is
--      one allow-list mistake away from being a role-escalation primitive
--      that leaves no trace anyone would think to read.
--   2. A generic setter cannot type-check values. brand_hue is an integer in
--      [0,359]; clinic_name is a non-empty string <= 80; logo_url must be
--      https. Expressing that generically means `case key when ...`, which is
--      this function with extra indirection.
--   3. Four keys, four calls, no transaction: PostgREST gives each rpc() its
--      own transaction, so a failure halfway leaves branding half-saved.
--   4. One audit row with a readable before/after beats four rows that each
--      say one key changed.
--
-- 2.2c therefore gets its own update_email_settings(...) with its own
-- signature. Per AGENTS.md decision #4 no SECRET goes in this table at all:
-- BREVO_API_KEY is a Cloudflare secret and the SMTP password a Supabase
-- secret. What lands here is provider choice / from-name / from-address.

-- ---------------------------------------------------------------------------
-- updated_at, by trigger rather than by hand in the RPC.
--
-- 0001 created the column and its default but attached no trigger, so every
-- future writer (2.2b seeds, 2.2c email settings, a hotfix run by hand) would
-- have to remember. profiles (0002) and user_preferences (0004) both do it
-- this way.
--
-- BEFORE UPDATE only, matching them: INSERT is covered by the column default,
-- and `insert ... on conflict do update` fires this on the conflict arm --
-- which is the path the RPC takes for the two keys 0004 seeded.
--
-- updated_by stays explicit in the RPC. A trigger stamping auth.uid() would
-- write NULL over a real value on a seed or service-role write.
-- ---------------------------------------------------------------------------
create trigger settings_updated_at
  before update on private.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- update_clinic_branding: the ONLY write path into private.settings.
--
-- Postgres requires defaulted parameters last, so the signature order
-- (name, hue, tagline, logo) differs from the form's field order on purpose.
-- Callers pass named arguments, so nothing depends on it.
--
-- REPLACE semantics, not patch: this writes the branding SET. A null tagline
-- means "no tagline", not "leave the old one" -- the form always submits all
-- four fields, so absent can only mean cleared.
-- ---------------------------------------------------------------------------
create or replace function public.update_clinic_branding(
  p_clinic_name text,
  p_brand_hue   integer,
  p_tagline     text default null,
  p_logo_url    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := nullif(btrim(coalesce(p_clinic_name, '')), '');
  v_tagline text := nullif(btrim(coalesce(p_tagline, '')), '');
  v_logo    text := nullif(btrim(coalesce(p_logo_url, '')), '');
  v_before  jsonb;
  v_after   jsonb;
begin
  -- Middleware gates NAVIGATION. A Server Action is a POST of an action id to
  -- whatever path the browser is already on (AGENTS.md), so THIS is the gate.
  -- getSuperadminActor() in TypeScript exists to turn a denial into a sentence
  -- a person can read, not to be the boundary.
  if public.jwt_role() <> 'superadmin' or v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Bounds duplicated from src/lib/settings/branding-schema.ts. forms.md is
  -- explicit that client and server bounds must agree: when they drift, the DB
  -- rejects what the form accepted and the error has no field to attach to.
  if v_name is null then
    raise exception 'clinic_name_required' using errcode = '22023';
  end if;
  if length(v_name) > 80 then
    raise exception 'clinic_name_too_long' using errcode = '22001';
  end if;
  if v_tagline is not null and length(v_tagline) > 160 then
    raise exception 'tagline_too_long' using errcode = '22001';
  end if;
  if v_logo is not null and (length(v_logo) > 500 or v_logo !~ '^https://') then
    raise exception 'logo_url_invalid' using errcode = '22023';
  end if;

  -- REJECT, do not wrap. normalizeHue() normalises on READ because branding
  -- must never be able to take the app down; a WRITE that silently turns 400
  -- into 40 hides the bug in whatever produced 400.
  if p_brand_hue is null or p_brand_hue < 0 or p_brand_hue > 359 then
    raise exception 'brand_hue_out_of_range' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    into v_before
  from private.settings s
  where s.key in ('clinic_name', 'tagline', 'logo_url', 'brand_hue');

  -- to_jsonb(null::text) is SQL NULL, not jsonb 'null' -- and `value` is NOT
  -- NULL, so the naive version fails at runtime the first time somebody clears
  -- a tagline. Clearing stores JSON null (which the view's `value #>> '{}'`
  -- reads back as SQL NULL) rather than deleting the row, so "who cleared it,
  -- and when" survives in updated_by/updated_at.
  insert into private.settings (key, value, is_secret, updated_by)
  values
    ('clinic_name', to_jsonb(v_name),                             false, v_uid),
    ('tagline',     coalesce(to_jsonb(v_tagline), 'null'::jsonb), false, v_uid),
    ('logo_url',    coalesce(to_jsonb(v_logo),    'null'::jsonb), false, v_uid),
    ('brand_hue',   to_jsonb(p_brand_hue),                        false, v_uid)
  on conflict (key) do update
    set value      = excluded.value,
        -- These four are non-secret BY DEFINITION -- clinic_branding projects
        -- them to anon without consulting the flag. Asserting it here keeps
        -- the column honest rather than merely unread.
        is_secret  = false,
        updated_by = excluded.updated_by;
  -- updated_at: settings_updated_at above (UPDATE) / column default (INSERT).

  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    into v_after
  from private.settings s
  where s.key in ('clinic_name', 'tagline', 'logo_url', 'brand_hue');

  -- The FIRST writer of 'settings_change' in the system. The CHECK at
  -- 0002:105-106 has allowed the action code since day one and nothing has
  -- used it.
  --
  -- `entity` names the SETTINGS GROUP, not the table. private.audit_row() uses
  -- TG_TABLE_NAME because a row there has a uuid id to point at; settings is a
  -- key/value bag with a text key, so 'settings' plus a null entity_id would
  -- tell a future auditor nothing. The diff lives in before/after. 2.2c will
  -- write 'email_settings' into the same column for the same reason.
  insert into private.audit_log (actor_id, actor_role, action, entity, before, after)
  values (v_uid, public.jwt_role(), 'settings_change', 'clinic_branding', v_before, v_after);
end;
$$;

comment on function public.update_clinic_branding(text, integer, text, text) is
  'Superadmin-only atomic write of the four non-secret branding keys in private.settings. '
  'The key allow-list is the signature: there is no key parameter, so no other row -- '
  'including setup_superadmin_email or any future is_secret row -- is reachable. '
  'Writes one private.audit_log row with action = settings_change. '
  'See docs/modules/02-clinic-settings.md.';

revoke execute on function public.update_clinic_branding(text, integer, text, text) from public, anon;
grant  execute on function public.update_clinic_branding(text, integer, text, text) to authenticated;
