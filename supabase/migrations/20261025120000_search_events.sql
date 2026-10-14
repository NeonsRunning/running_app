-- ---------------------------------------------------------------------------
-- Searching /events a page at a time.
--
-- /events used to load every upcoming race and filter on the client. It now
-- asks for 24 at a time as the runner scrolls, so the search, filters and
-- sort move here. `search_events()` returns one page of event ids in order,
-- each carrying the total the filters match; the caller then reads those
-- rows through the usual `events` select.
--
-- Registration status and popularity both depend on paid sign-ups, which
-- runners cannot read, hence security definer. Only published events and
-- counts ever leave the function. The status rules mirror
-- `registrationStatus()` in `lib/events/queries.ts`.
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
