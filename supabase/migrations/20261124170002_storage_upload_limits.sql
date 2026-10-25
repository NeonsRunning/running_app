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
-- The subqueries run under row-level security, which is what they need: a
-- runner reads their own registrations, published events, and their own
-- avatar folder. The count reads storage.objects again, so its rows are
-- aliased `o`: bare, `name` there would be ambiguous to a reader, if not to
-- Postgres.
-- ---------------------------------------------------------------------------

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
    and (
      select count(*)
      from storage.objects o
      where o.bucket_id = 'avatars'
        and (storage.foldername(o.name))[1] = (select auth.uid())::text
    ) < 5
  );
