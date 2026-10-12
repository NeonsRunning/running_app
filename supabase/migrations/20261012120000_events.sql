-- ---------------------------------------------------------------------------
-- Events
--
-- What an organizer publishes from /publish and a runner finds on /events.
-- An event is one row here plus one row per distance in `event_categories`.
--
-- The vocabulary enums below hold the same English strings as `lib/types.ts`
-- (`'Road Race'`, `'Half Marathon'`) rather than snake_case keys: the app
-- already treats those strings as canonical and translates them at render, so
-- storing them verbatim keeps the row and the fixture shapes interchangeable.
-- ---------------------------------------------------------------------------

create type public.event_type as enum (
  'Road Race', 'Trail', 'Track', 'Fun Run', 'Charity Run',
  'Virtual Race', 'Relay', 'Kids Race'
);

create type public.race_distance as enum (
  '1 Mile', '3K', '5K', '10K', 'Half Marathon', 'Marathon', 'Ultra'
);

create type public.event_difficulty as enum ('Easy', 'Moderate', 'Hard');

-- ---------------------------------------------------------------------------
-- Organizer role
--
-- `account_type` is granted by the team, directly in the database. Until now
-- the update policy on `profiles` let a runner flip it on their own row, which
-- would make every organizer-only check below decorative. Row-level security
-- cannot tell columns apart, so the fix is a column privilege: runners keep
-- write access to everything they edit from settings, and lose it on
-- `account_type`. The service role and the dashboard are unaffected.
-- ---------------------------------------------------------------------------

revoke insert, update on public.profiles from authenticated;

grant insert (id, handle, full_name, avatar_url, bio, city, club, is_public)
  on public.profiles to authenticated;

grant update (handle, full_name, avatar_url, bio, city, club, is_public)
  on public.profiles to authenticated;

-- Whether the caller is an organizer. Invoker rights are enough: the caller
-- can always read their own profile row, public or not.
create or replace function public.is_organizer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.account_type = 'organizer'
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),

  -- On delete restrict: an organizer account with races on the calendar has
  -- to have them handed over or removed before it can go.
  organizer_id uuid not null references public.profiles (id) on delete restrict,

  -- /events/neon-night-10k. Chosen by the server action from the name, never
  -- by the form, and shaped to match.
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),

  name text not null check (char_length(name) between 3 and 120),
  -- Paragraphs separated by blank lines, as typed.
  description text not null default '' check (char_length(description) <= 4000),
  type public.event_type not null,

  event_date date not null,
  start_time time not null,
  registration_opens date,
  registration_closes date not null,

  venue text not null check (char_length(venue) between 1 and 120),
  address text not null default '' check (char_length(address) <= 200),
  city text not null check (char_length(city) between 1 and 80),
  region text not null default 'Puerto Rico' check (char_length(region) <= 80),
  postal_code text check (char_length(postal_code) <= 12),
  country text not null default 'PR' check (country in ('PR', 'US', 'DO', 'other')),

  difficulty public.event_difficulty not null default 'Moderate',
  terrain text not null default '' check (char_length(terrain) <= 80),
  elevation_gain integer not null default 0 check (elevation_gain between 0 and 20000),
  cutoff text not null default '' check (char_length(cutoff) <= 20),

  -- Null means "the sum of the category caps".
  capacity integer check (capacity > 0),
  minimum_age smallint not null default 0 check (minimum_age between 0 and 99),
  maximum_age smallint check (maximum_age between 1 and 120),
  shirt_sizes public.shirt_size[] not null default '{}',

  -- Parsed from the wizard's one-per-line textareas by the server action:
  --   aid_stations  [{ "km": 3, "label": "...", "offers": ["Water"] }]
  --   schedule      [{ "time": "6:00 PM", "label": "..." }]
  aid_stations jsonb not null default '[]'
    check (jsonb_typeof(aid_stations) = 'array'),
  schedule jsonb not null default '[]'
    check (jsonb_typeof(schedule) = 'array'),

  parking text not null default '' check (char_length(parking) <= 1000),
  directions text not null default '' check (char_length(directions) <= 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (registration_closes <= event_date),
  check (registration_opens is null or registration_opens <= registration_closes),
  check (maximum_age is null or maximum_age >= minimum_age)
);

comment on table public.events is
  'Races published by organizers. Readable by anyone; written only by an organizer, for themselves.';

-- /events lists upcoming races in date order.
create index events_event_date_idx on public.events (event_date);
create index events_organizer_id_idx on public.events (organizer_id);

create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,

  distance public.race_distance not null,
  distance_km numeric(5, 2) not null check (distance_km > 0 and distance_km <= 500),
  price numeric(8, 2) not null check (price >= 0),
  capacity integer not null check (capacity > 0),
  start_time time not null,

  -- Display order, as entered in the wizard.
  position smallint not null default 0,

  created_at timestamptz not null default now(),

  unique (event_id, distance)
);

comment on table public.event_categories is
  'The distances an event offers, each with its own price, cap and start.';

create index event_categories_event_id_idx
  on public.event_categories (event_id, position);

create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Writes require both ownership and the organizer role, checked on every
-- statement: an account the team demotes keeps its published races visible,
-- but can no longer change them.
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_categories enable row level security;

create policy "Events are readable by anyone"
  on public.events for select
  to anon, authenticated
  using (true);

create policy "Organizers create events as themselves"
  on public.events for insert
  to authenticated
  with check ((select auth.uid()) = organizer_id and (select public.is_organizer()));

create policy "Organizers edit their own events"
  on public.events for update
  to authenticated
  using ((select auth.uid()) = organizer_id and (select public.is_organizer()))
  with check ((select auth.uid()) = organizer_id);

create policy "Organizers delete their own events"
  on public.events for delete
  to authenticated
  using ((select auth.uid()) = organizer_id and (select public.is_organizer()));

create policy "Categories are readable by anyone"
  on public.event_categories for select
  to anon, authenticated
  using (true);

-- One policy for every write: the parent event has to be the caller's, and
-- the caller still an organizer.
create policy "Organizers manage categories of their own events"
  on public.event_categories for all
  to authenticated
  using (
    (select public.is_organizer()) and exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = (select auth.uid())
    )
  )
  with check (
    (select public.is_organizer()) and exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = (select auth.uid())
    )
  );

grant select on public.events, public.event_categories to anon, authenticated;
grant insert, update, delete on public.events, public.event_categories to authenticated;
