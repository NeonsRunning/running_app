-- ---------------------------------------------------------------------------
-- Loose ends from the review fixes (20261124120000 to 20261124170002).
--
-- 1. search_events(): a sold-out race now files under 'full', the way
--    `registrationStatus()` in lib/events/availability.ts puts it, instead of
--    'almost-full'. Filtering for open or almost-full races no longer turns up
--    races nobody can sign up for.
-- 2. submit_race_result(): locks the sign-up, so a result cannot slip in
--    between an organizer's remove or return-to-pending and its commit. Lock
--    order matches the organizer functions (registration, then result).
-- 3. The organizer read policy on race_results asks for a current organizer,
--    as the one on registrations does since 20261124140000.
-- ---------------------------------------------------------------------------

create or replace function public.search_events(
  p_today date,
  p_query text default null,
  p_distances public.race_distance[] default null,
  p_types public.event_type[] default null,
  p_difficulties public.event_difficulty[] default null,
  p_statuses text[] default null,
  p_max_price numeric default null,
  p_until date default null,
  p_sort text default 'soonest',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (id uuid, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with listed as (
    select
      e.id,
      e.event_date,
      e.start_time,
      c.from_price,
      c.longest,
      coalesce(r.registered, 0) as registered,
      case
        when p_today > e.registration_closes then 'closed'
        when e.registration_opens is not null and p_today < e.registration_opens
          then 'opening-soon'
        -- Full at the event's cap, or once every category is.
        when (coalesce(e.capacity, c.capacity) > 0
              and coalesce(r.registered, 0) >= coalesce(e.capacity, c.capacity))
          or f.every_category_full
          then 'full'
        when coalesce(e.capacity, c.capacity) > 0
          and coalesce(r.registered, 0)::numeric / coalesce(e.capacity, c.capacity) >= 0.9
          then 'almost-full'
        else 'open'
      end as reg_status
    from public.events e
    cross join lateral (
      select
        sum(ec.capacity) as capacity,
        min(ec.price) as from_price,
        max(ec.distance_km) as longest,
        array_agg(ec.distance) as distances
      from public.event_categories ec
      where ec.event_id = e.id
    ) c
    left join lateral (
      select count(*) as registered
      from public.registrations rg
      where rg.event_id = e.id and rg.status = 'confirmed'
    ) r on true
    cross join lateral (
      select coalesce(bool_and(coalesce(cr.registered, 0) >= ec.capacity), false)
        as every_category_full
      from public.event_categories ec
      left join lateral (
        select count(*) as registered
        from public.registrations rg
        where rg.category_id = ec.id and rg.status = 'confirmed'
      ) cr on true
      where ec.event_id = e.id
    ) f
    where e.status = 'published'
      -- Listed until its last day has passed, not just its first.
      and e.last_day >= p_today
      and (
        coalesce(p_query, '') = ''
        or strpos(
          lower(concat_ws(' ', e.name, e.city, e.region, e.type::text, e.venue)),
          lower(p_query)
        ) > 0
      )
      and (p_distances is null or c.distances && p_distances)
      and (p_types is null or e.type = any (p_types))
      and (p_difficulties is null or e.difficulty = any (p_difficulties))
      and (p_max_price is null or c.from_price <= p_max_price)
      and (p_until is null or e.event_date <= p_until)
  )
  select l.id, count(*) over () as total
  from listed l
  where p_statuses is null or l.reg_status = any (p_statuses)
  order by
    case when p_sort in ('popular', 'recommended') then l.registered end desc nulls last,
    case when p_sort = 'price' then l.from_price end asc nulls last,
    case when p_sort = 'distance' then l.longest end desc nulls last,
    l.event_date,
    l.start_time nulls first,
    -- A total order, so consecutive pages never repeat or skip a race.
    l.id
  limit least(greatest(p_limit, 1), 24)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.search_events(
  date, text, public.race_distance[], public.event_type[],
  public.event_difficulty[], text[], numeric, date, text, integer, integer
) from public;
grant execute on function public.search_events(
  date, text, public.race_distance[], public.event_type[],
  public.event_difficulty[], text[], numeric, date, text, integer, integer
) to anon, authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.submit_race_result(
  p_event_id uuid,
  p_finish_seconds integer,
  p_evidence_path text
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ev public.events;
  reg public.registrations;
  res public.race_results;
begin
  select * into ev from public.events
  where id = p_event_id and status = 'published';

  if uid is null or ev.id is null or not ev.accepts_results then
    raise exception 'resultsClosed' using errcode = 'P0001';
  end if;

  if ev.event_date > (now() at time zone 'America/Puerto_Rico')::date then
    raise exception 'raceNotStarted' using errcode = 'P0001';
  end if;

  -- Locked, so a removal or return to pending in flight finishes first and
  -- this sees the sign-up as it then stands.
  select * into reg from public.registrations
  where event_id = p_event_id and runner_id = uid and status = 'confirmed'
  for update;

  if reg.id is null then
    raise exception 'notRegistered' using errcode = 'P0001';
  end if;

  select * into res from public.race_results
  where registration_id = reg.id
  for update;

  if res.status = 'accepted' then
    raise exception 'resultAlreadyAccepted' using errcode = 'P0001';
  end if;

  if res.status = 'disqualified' then
    raise exception 'resultDisqualified' using errcode = 'P0001';
  end if;

  insert into public.race_results (
    registration_id, event_id, category_id, runner_id,
    finish_seconds, evidence_path
  ) values (
    reg.id, ev.id, reg.category_id, uid,
    p_finish_seconds, p_evidence_path
  )
  on conflict (registration_id) do update set
    category_id = excluded.category_id,
    finish_seconds = excluded.finish_seconds,
    evidence_path = excluded.evidence_path,
    status = 'pending',
    review_note = null,
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null
  returning * into res;

  return res;
end;
$$;

revoke execute on function public.submit_race_result(uuid, integer, text) from public, anon;
grant execute on function public.submit_race_result(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------

drop policy if exists "Organizers read results for their events" on public.race_results;
create policy "Organizers read results for their events"
  on public.race_results for select
  to authenticated
  using (
    (select public.is_organizer())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = (select auth.uid())
    )
  );
