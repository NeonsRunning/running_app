-- ---------------------------------------------------------------------------
-- Profile photos.
--
-- Same pipeline as event covers (20261020120000_event_image.sql): the browser
-- converts the runner's photo (iPhone HEIC included) to a small square WebP
-- and uploads it straight into the public `avatars` bucket, under a folder
-- named for their own user id. A server action then saves the object path on
-- the profile. Null means no photo: the page shows the runner's initials.
--
-- `avatar_url` stays as it was — whatever an OAuth provider handed over at
-- sign-up. The app never renders it: a runner can write any https URL into
-- it, and a profile page should not load images from wherever they point.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists avatar_path text;

-- The folder has to be the row's own id, so a profile can only ever point at
-- a file its owner uploaded.
alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check
  check (
    avatar_path is null
    or (
      avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      and split_part(avatar_path, '/', 1) = id::text
    )
  );

comment on column public.profiles.avatar_path is
  'Object path in the avatars bucket: <user id>/<uuid>.webp. Null for no photo.';

-- Runners write everything else on their row through column grants
-- (20261012120000_events.sql); the photo joins them.
grant update (avatar_path) on public.profiles to authenticated;

-- Public: the photo shows on profile pages anyone can read. WebP only, 2 MB
-- after conversion (a 512 px avatar is typically well under 100 KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Every signed-in runner may write to their own folder, and only there.
-- Reads need no policy: a public bucket serves its objects by URL.
drop policy if exists "Runners upload avatars to their own folder" on storage.objects;
create policy "Runners upload avatars to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Runners list their own avatars" on storage.objects;
create policy "Runners list their own avatars"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Runners delete their own avatars" on storage.objects;
create policy "Runners delete their own avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
