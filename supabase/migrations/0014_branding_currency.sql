-- 0014: expose `currency` through clinic_branding (Phase 2.2b)
--
-- 0013 seeds a `currency` key into private.settings because an amount with no
-- currency is not money -- and then nothing could read it. `private` is revoked
-- from anon and authenticated, and clinic_branding projected only the four
-- branding keys, so the fees and products screens had no way to find out what
-- "1500" meant. A seeded setting with no reader is the "unused column somebody
-- will later assume is maintained" smell, and the alternative -- a hardcoded
-- "PHP" in the UI that must be kept in step by hand -- is two sources of truth.
--
-- WHY THE VIEW RATHER THAN A NEW RPC. clinic_branding is already the sanctioned
-- public door into private.settings: definer rights, an explicit key list,
-- granted to anon because the landing page and the Phase 9 manifest need it
-- without a session. Currency is non-secret display data of exactly that kind --
-- a price list is on the clinic's website -- so it belongs to the same door
-- rather than a second one. The rule the original comment states is "never
-- select *, only these non-secret keys", and that rule is kept.
--
-- The view's NAME is now slightly narrower than its contents. Renaming it would
-- touch every branding call site plus the Phase 9 manifest for no behavioural
-- gain, so the name stays and this comment is the record. If a third
-- non-branding key ever lands here, rename it then.
--
-- Coalesced to 'PHP' so a fresh install returns exactly one row even before the
-- 0013 seed, matching how clinic_name and brand_hue are handled.

create or replace view public.clinic_branding as
select
  coalesce((select value #>> '{}' from private.settings where key = 'clinic_name'), 'DentClinic') as clinic_name,
  (select value #>> '{}' from private.settings where key = 'tagline')  as tagline,
  (select value #>> '{}' from private.settings where key = 'logo_url') as logo_url,
  coalesce(
    (select (value #>> '{}')::numeric from private.settings where key = 'brand_hue'),
    195
  )::numeric as brand_hue,
  coalesce((select value #>> '{}' from private.settings where key = 'currency'), 'PHP') as currency;

-- `create or replace view` preserves grants, but assert them rather than
-- assuming: this view is the only public door and a silent grant loss would
-- take the landing page down for signed-out visitors.
grant select on public.clinic_branding to anon, authenticated;
