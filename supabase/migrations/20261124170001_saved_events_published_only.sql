-- ---------------------------------------------------------------------------
-- Saving only what can be seen
--
-- Foreign-key checks run past row-level security, so the key added in
-- 20261105120000_saved_events_cascade.sql turned `saved_events` into an
-- oracle: saving the slug of someone's unpublished draft (or of a removed
-- event) succeeded, while a slug nobody holds failed with 23503. Either way
-- the caller learned whether the slug exists.
--
-- The insert policy now asks for a published event itself. Row-level security
-- checks the new row before the foreign key ever looks, so a draft, a removed
-- event and a slug that names nothing all fail alike, with 42501. Spelling
-- out `status = 'published'` matters: the subquery runs under the events
-- policy, which would otherwise let an organizer save their own draft.
--
-- This is what `setEventSavedAction()` already checks before writing. Reading
-- and removing a save are untouched, so a race unpublished after it was saved
-- still lists, and can still be unsaved.
-- ---------------------------------------------------------------------------

drop policy if exists "Runners save events for themselves" on public.saved_events;
create policy "Runners save events for themselves"
  on public.saved_events for insert
  to authenticated
  with check (
    (select auth.uid()) = runner_id
    and exists (
      select 1 from public.events e
      where e.slug = event_slug and e.status = 'published'
    )
  );
