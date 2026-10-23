-- ---------------------------------------------------------------------------
-- Saved events follow their event
--
-- `saved_events` was keyed by slug with no foreign key, because races also
-- lived as fixtures in `lib/data.ts` with no row in `events`. Those fixtures
-- are gone, so every save now names a real event, and deleting the event
-- should take its saves along instead of leaving them behind.
--
-- `events.slug` is unique and not null, so it can be the target. Slugs do not
-- change once picked, but `on update cascade` keeps saves attached if one
-- ever does.
-- ---------------------------------------------------------------------------

-- Saves left behind by events deleted before this migration.
delete from public.saved_events s
where not exists (
  select 1 from public.events e where e.slug = s.event_slug
);

alter table public.saved_events
  add constraint saved_events_event_slug_fkey
  foreign key (event_slug) references public.events (slug)
  on delete cascade
  on update cascade;

-- Deleting an event looks its saves up by slug.
create index saved_events_event_slug_idx
  on public.saved_events (event_slug);

comment on table public.saved_events is
  'One race a runner has saved, by slug. Removed with its event.';
