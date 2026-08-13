-- 0011: branding storage bucket (Phase 2.2a)
--
-- Separate file from 0010 so the storage policies can be reverted without
-- taking the settings write path with them. A migration is one transaction;
-- these two topics share none.
--
-- The first Supabase Storage bucket in the project. supabase/config.toml has
-- carried a commented-out [storage.buckets.images] template since the scaffold
-- and it was never used.
--
-- WHY NOT A URL TEXT FIELD. A clinic that has to host its own logo somewhere
-- and paste a link will paste a Google Drive share link, which is not an image
-- URL, and the branding screen would render a broken image with no way to tell
-- them why. Owning the bytes is the difference between "upload your logo" and
-- "obtain a permanent public direct-link URL to your logo".
--
-- SVG IS DELIBERATELY EXCLUDED from the MIME allow-list. An SVG in a PUBLIC
-- bucket executes script when opened directly at its storage-origin URL (it
-- does NOT inside <img src>, but the URL is public and shareable). The only
-- uploaders are superadmins -- exactly the population whose account compromise
-- is worst. PNG/JPEG/WebP cover every real clinic logo and are also what the
-- Phase 9 PWA manifest icons will need.
--
-- NO DELETE POLICY AND NO UPDATE POLICY, on purpose. Uploads are
-- content-addressed (a fresh uuid path per upload), so nothing is ever
-- overwritten and INSERT alone is the whole write surface. A superseded logo
-- simply stops being referenced. "Remove the logo" is an UPDATE of the
-- private.settings row to null, not a file delete -- which keeps the "no hard
-- DELETE grants" convention (AGENTS.md) intact without having to argue about
-- whether it extends to files.
--
-- ACCEPTED GAP, recorded rather than papered over: if an upload succeeds and
-- the superadmin never presses Save, an unreferenced object sits in the bucket
-- at an unguessable path costing ~1 MiB of the 1 GB free tier. Cleaning it up
-- would need a DELETE policy (withheld above), a "which objects are still
-- referenced" query and a cron job, for a handful of files a decade. Phase 5's
-- pg_cron can sweep branding objects older than 30 days that are not the
-- current logo_url if it ever matters.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read. The landing page and (Phase 9) the PWA manifest need the logo
-- with no session, exactly like clinic_branding itself. The bucket is public,
-- so the object URL already resolves without this policy -- it is here so the
-- Storage API path is consistent with the CDN path, rather than the two
-- disagreeing about who may read.
create policy "branding assets are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'branding');

-- Write: superadmin only, via the same jwt_role() claim RLS uses everywhere
-- else. This is also what makes createSignedUploadUrl() succeed or fail:
-- minting a signed upload URL requires INSERT permission on storage.objects
-- for the CALLER, so the mint itself is gated here and not only in the server
-- action that calls it.
create policy "superadmin uploads branding assets"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'branding' and public.jwt_role() = 'superadmin');
