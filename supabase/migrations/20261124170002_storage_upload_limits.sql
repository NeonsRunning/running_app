-- ---------------------------------------------------------------------------
-- Who may upload, and how much
--
-- The upload policies on `race-evidence` (20261108120000_race_results.sql)
-- and `avatars` (20261030120000_profile_avatars.sql) checked only the folder,
-- so any signed-in account could fill its folder with 5 MB and 2 MB files
-- without limit -- free storage on our bill, and in the private evidence
-- bucket, files nobody would ever review.
--
--   race-evidence  The path is `<runner id>/<uuid>.webp`: it names no
--                  registration, so the upload asks for any paid sign-up on
--                  an event that takes results. `submit_race_result()` still
--                  checks the specific one when the path is claimed.
--
--   avatars        A runner has one photo. `setAvatarAction()` deletes the
--                  one it replaces and `ProfilePhoto` deletes an upload the
--                  save refused, so a folder holds one file, two in the
--                  instant of a swap. Five leaves room for a failed cleanup
--                  or two without letting the folder grow.
--
-- `event-images` needs nothing new: uploads there already require an
-- organizer (or an admin) writing to their own folder, and an organizer keeps
-- a cover, a route map and a medal image for every event, so no fixed count
-- fits.
--
-- The evidence subquery runs under row-level security, which is what it
-- needs: a runner reads their own registrations and published events. The
-- avatar count cannot sit in the policy itself: a policy on storage.objects
-- that reads storage.objects is refused as infinite recursion, for every
-- upload to every bucket. `avatar_file_count()` counts from behind security
-- definer, only ever the caller's own folder.
-- ---------------------------------------------------------------------------

create or replace function public.avatar_file_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from storage.objects o
  where o.bucket_id = 'avatars'
    and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;

revoke execute on function public.avatar_file_count() from public, anon;
grant execute on function public.avatar_file_count() to authenticated;

drop policy if exists "Runners upload evidence to their own folder" on storage.objects;
create policy "Runners upload evidence to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'race-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.registrations r
      join public.events e on e.id = r.event_id
      where r.runner_id = (select auth.uid())
        and r.status = 'confirmed'
        and e.accepts_results
    )
  );

drop policy if exists "Runners upload avatars to their own folder" on storage.objects;
create policy "Runners upload avatars to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.avatar_file_count()) < 5
  );
