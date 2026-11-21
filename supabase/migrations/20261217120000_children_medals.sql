-- ---------------------------------------------------------------------------
-- No medal for an adult who did not run
--
-- An adult who signed up only children (`registrations.racing` false, see
-- 20261216120000_children.sql) holds a confirmed sign-up but ran nothing. On
-- a race that takes no results, `medal_earned()` goes by the race day alone,
-- so it counted them as a finisher: their medal could be marked as handed
-- over. It now asks that the sign-up is a racing one.
--
-- The function is its latest definition (20261122120000_medal_pickup.sql)
-- with that one condition added.
-- ---------------------------------------------------------------------------

create or replace function public.medal_earned(
  reg public.registrations,
  ev public.events,
  p_handout boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select reg.status = 'confirmed' and reg.racing and (
    case
      when ev.accepts_results then exists (
        select 1 from public.race_results rr
        where rr.registration_id = reg.id and rr.status = 'accepted'
      )
      when p_handout then
        ev.event_date <= (now() at time zone 'America/Puerto_Rico')::date
      else ev.last_day < (now() at time zone 'America/Puerto_Rico')::date
    end
  );
$$;
