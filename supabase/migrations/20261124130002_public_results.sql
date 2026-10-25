-- ---------------------------------------------------------------------------
-- Public results pages
--
-- /results and /events/[slug]/results were empty states, though accepted
-- results have existed since 20261108120000_race_results. Two functions now
-- feed them:
--
--   public_event_results(event)   one published event's accepted results,
--                                 with each runner's bib and place in their
--                                 category
--   public_result_events()        the published events that have any, with
--                                 how many finishers each lists
--
-- Privacy as `race_results` already has it: an accepted result is public
-- exactly when its runner's profile is ("Accepted results follow their
-- runner's profile"). Only runners with a public profile are listed, named
-- as their profile names them — never the name, email or anything else
-- typed into the sign-up, which stays the organizer's. Unlike the policy, a
-- private runner does not see their own row here: the board reads the same
-- for everyone, and their result is on their own profile.
--
-- Definer rights because the bib lives on the registration, which only its
-- runner and organizer can read. Places count the runners listed, so a
-- private runner leaves no gap that hints at them.
-- ---------------------------------------------------------------------------

create or replace function public.public_event_results(p_event_id uuid)
returns table (
  id uuid,
  runner_id uuid,
  runner_name text,
  bib integer,
  category_id uuid,
  category_position integer,
  distance public.race_distance,
  distance_km numeric,
  finish_seconds integer,
  place bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rr.id,
    rr.runner_id,
    p.full_name,
    rg.bib,
    ec.id,
    ec.position::integer,
    ec.distance,
    ec.distance_km,
    rr.finish_seconds,
    rank() over (partition by rr.category_id order by rr.finish_seconds)
  from public.race_results rr
  join public.events e on e.id = rr.event_id
  join public.event_categories ec on ec.id = rr.category_id
  join public.registrations rg on rg.id = rr.registration_id
  join public.profiles p on p.id = rr.runner_id
  where rr.event_id = p_event_id
    and e.status = 'published'
    and rr.status = 'accepted'
    and p.is_public;
$$;

revoke execute on function public.public_event_results(uuid) from public;
grant execute on function public.public_event_results(uuid) to anon, authenticated;

create or replace function public.public_result_events()
returns table (
  event_id uuid,
  slug text,
  name text,
  event_date date,
  anywhere boolean,
  city text,
  region text,
  finishers bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.name, e.event_date, e.anywhere, e.city, e.region, count(*)
  from public.race_results rr
  join public.events e on e.id = rr.event_id
  join public.profiles p on p.id = rr.runner_id
  where e.status = 'published'
    and rr.status = 'accepted'
    and p.is_public
  group by e.id;
$$;

revoke execute on function public.public_result_events() from public;
grant execute on function public.public_result_events() to anon, authenticated;
