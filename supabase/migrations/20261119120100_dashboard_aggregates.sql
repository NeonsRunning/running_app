-- ---------------------------------------------------------------------------
-- Organizer dashboard totals in SQL, and public counts for public events only
--
-- 1. The organizer dashboard read every paid registration of every one of the
--    organizer's events on each visit, and added them up in the browser's
--    server — fine at a few hundred, slow and heavy at tens of thousands.
--    Two functions now do the adding where the rows are, and return a few
--    dozen numbers:
--
--      organizer_dashboard_summary()  per-event sign-ups and revenue, sign-ups
--                                     and revenue per day since a date (the
--                                     app buckets those into its weekly and
--                                     monthly charts), and runners by age
--                                     group and gender on race day
--      event_signup_totals()          sign-ups and revenue for given events,
--                                     for the dashboard's event cards
--
--    Both run with the caller's rights, so row-level security decides what
--    they count, exactly as it did for the rows: an organizer's own events,
--    or every event for a platform admin. Revenue is what the organizer
--    keeps: the amount less the service fee and sales tax.
--
-- 2. `registration_counts()` runs with definer rights and took any event id,
--    so it answered with the paid sign-ups of drafts and removed events too.
--    It now counts published events only, which is all the public pages ask.
-- ---------------------------------------------------------------------------

create or replace function public.organizer_dashboard_summary(
  p_organizer_id uuid,
  -- Daily figures from this instant on: the start of the oldest chart bucket.
  p_since timestamptz,
  -- Race day for an undated event, when working out a runner's age.
  p_today date
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with regs as (
    select
      r.event_id,
      r.created_at,
      r.gender,
      extract(year from age(coalesce(e.event_date, p_today), r.birth_date))::integer as age,
      greatest(0, r.amount - r.service_fee - r.sales_tax) as net
    from public.registrations r
    join public.events e on e.id = r.event_id
    where e.organizer_id = p_organizer_id
      and r.status = 'confirmed'
  )
  select jsonb_build_object(
    'per_event', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id, 'registered', registered, 'revenue', revenue))
      from (
        select event_id, count(*) as registered, sum(net) as revenue
        from regs group by event_id
      ) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', day, 'registrations', registrations, 'revenue', revenue))
      from (
        select (created_at at time zone 'UTC')::date as day,
               count(*) as registrations, sum(net) as revenue
        from regs where created_at >= p_since
        group by 1
      ) x
    ), '[]'::jsonb),
    'demographics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'age_group', age_group, 'gender', gender, 'count', runners))
      from (
        select
          case
            when age < 20 then 'Under 20'
            when age < 30 then '20–29'
            when age < 40 then '30–39'
            when age < 50 then '40–49'
            else '50+'
          end as age_group,
          gender,
          count(*) as runners
        from regs
        group by 1, 2
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.organizer_dashboard_summary(uuid, timestamptz, date)
  from public, anon;
grant execute on function public.organizer_dashboard_summary(uuid, timestamptz, date)
  to authenticated;

create or replace function public.event_signup_totals(p_event_ids uuid[])
returns table (event_id uuid, registered bigint, revenue numeric)
language sql
stable
set search_path = ''
as $$
  select r.event_id, count(*), sum(greatest(0, r.amount - r.service_fee - r.sales_tax))
  from public.registrations r
  where r.event_id = any (p_event_ids)
    and r.status = 'confirmed'
  group by r.event_id;
$$;

revoke execute on function public.event_signup_totals(uuid[]) from public, anon;
grant execute on function public.event_signup_totals(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- registration_counts(): as before (20261024120000_counts_only_paid), for
-- published events only.
-- ---------------------------------------------------------------------------

create or replace function public.registration_counts(p_event_ids uuid[])
returns table (category_id uuid, registered bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.category_id, count(*)
  from public.registrations r
  join public.events e on e.id = r.event_id
  where r.event_id = any (p_event_ids)
    and e.status = 'published'
    and r.status = 'confirmed'
  group by r.category_id;
$$;
