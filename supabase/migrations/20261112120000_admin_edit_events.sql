-- ---------------------------------------------------------------------------
-- Admins editing any organizer's event
--
-- Until now an event was its organizer's alone: only they could open it in
-- the wizard, save it, or see its sign-ups and finish evidence. A platform
-- admin could review its payments and results and remove it, but not fix a
-- typo in its description or a wrong start time.
--
-- Platform admins — and only they — now read every event, drafts included,
-- and edit any that is not removed, categories and all, through the same
-- `save_event()` the organizer uses (it runs with the caller's rights, so
-- these policies are what let it through). They also read each event's
-- registrations, results and evidence, which the organizer's panels on the
-- event page show and the review functions already let them act on.
--
-- What stays the organizer's:
--
--   * creating events — `save_event()` inserts with the caller as organizer,
--     and the insert policy still requires an organizer's own row;
--   * deleting them — an admin removes instead (20261109120100), which keeps
--     the record and logs a reason;
--   * the event's owner — nothing here can move it to another account.
--
-- These policies sit beside the organizers' own. Postgres ORs permissive
-- policies, so nothing an organizer could do before changes.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Events and their categories
-- ---------------------------------------------------------------------------

create policy "Admins read every event"
  on public.events for select
  to authenticated
  using ((select public.is_platform_admin()));

-- A removed event is restored first, as for its organizer.
create policy "Admins edit any event"
  on public.events for update
  to authenticated
  using ((select public.is_platform_admin()) and status <> 'removed')
  with check ((select public.is_platform_admin()) and status <> 'removed');

-- An admin's edit must not hand the event to someone else. The organizer's
-- own policy already pins `organizer_id` to the caller; this pins it for
-- everyone.
create or replace function public.keep_event_organizer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organizer_id is distinct from old.organizer_id then
    raise exception 'organizerImmutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists events_keep_organizer on public.events;
create trigger events_keep_organizer
  before update of organizer_id on public.events
  for each row execute function public.keep_event_organizer();

create policy "Admins manage categories of any event"
  on public.event_categories for all
  to authenticated
  using (
    (select public.is_platform_admin()) and exists (
      select 1 from public.events e
      where e.id = event_id and e.status <> 'removed'
    )
  )
  with check (
    (select public.is_platform_admin()) and exists (
      select 1 from public.events e
      where e.id = event_id and e.status <> 'removed'
    )
  );

-- ---------------------------------------------------------------------------
-- What the organizer's panels read
-- ---------------------------------------------------------------------------

create policy "Admins read every registration"
  on public.registrations for select
  to authenticated
  using ((select public.is_platform_admin()));

create policy "Admins read every result"
  on public.race_results for select
  to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists "Admins read evidence" on storage.objects;
create policy "Admins read evidence"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'race-evidence'
    and (select public.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- Event images
--
-- An admin replacing a cover uploads to their own folder, as an organizer
-- does (the save action accepts a path there, or the one already on the
-- event). They may also clear the file it replaced, in the organizer's.
-- ---------------------------------------------------------------------------

drop policy if exists "Admins upload event images to their own folder" on storage.objects;
create policy "Admins upload event images to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_platform_admin())
  );

drop policy if exists "Admins delete event images" on storage.objects;
create policy "Admins delete event images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-images'
    and (select public.is_platform_admin())
  );
