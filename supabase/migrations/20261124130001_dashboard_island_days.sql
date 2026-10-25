-- ---------------------------------------------------------------------------
-- organizer_dashboard_summary(): sign-ups by the island's day they were paid
--
-- The daily figures grouped `(created_at at time zone 'UTC')::date`: when
-- the checkout started, on UTC's calendar. A sign-up paid at 9 PM in San
-- Juan landed on the next day — the next week or month on the charts — and
-- an ATH Móvil payment confirmed days after the runner started it counted on
-- the day they started. They now count on the day they were paid
-- (`paid_at`), as the island's calendar has it. A row confirmed before
-- `paid_at` existed has none, so it falls back to `created_at`, as the
-- registrations list does.
--
-- `p_since` is compared with that same instant. The app now passes the
-- island's midnight that starts the oldest chart bucket.
--
-- Otherwise as before (20261119120100_dashboard_aggregates).
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
      coalesce(r.paid_at, r.created_at) as paid,
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
        select (paid at time zone 'America/Puerto_Rico')::date as day,
               count(*) as registrations, sum(net) as revenue
        from regs where paid >= p_since
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
