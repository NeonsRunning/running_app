-- ---------------------------------------------------------------------------
-- An optional start time.
--
-- Not every race has a gun time. A virtual or multi-day race lets runners go
-- any time between `event_date` and `end_date`, and a one-day race may not
-- have announced its start yet. A null `events.start_time` means one of those;
-- the app tells them apart by whether there is an end date.
--
-- A category's `start_time` goes optional too: null means it starts with the
-- event, so a race with one gun time no longer repeats it per distance.
-- ---------------------------------------------------------------------------

alter table public.events drop constraint events_published_complete;

alter table public.events add constraint events_published_complete check (
  status = 'draft' or (
    type is not null
    and event_date is not null
    and registration_closes is not null
    and venue is not null
    and city is not null
    and published_at is not null
  )
);

alter table public.event_categories alter column start_time drop not null;

comment on column public.events.start_time is
  'Gun time. Null when runners start any time across the dates, or it is not announced yet.';
comment on column public.event_categories.start_time is
  'Start of this distance. Null when it starts with the event.';
