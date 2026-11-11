-- ---------------------------------------------------------------------------
-- One figure for revenue
--
-- The organizer dashboard adds up revenue twice: `organizer_dashboard_summary()`
-- for the headline and the charts, `event_signup_totals()` for each event's
-- card. The first takes refunds off; the second did not, so after a partial
-- refund the cards added up to more than the total above them.
--
-- Both now count a sign-up as what was paid, less what was refunded, the
-- service fee and the sales tax.
-- ---------------------------------------------------------------------------

create or replace function public.event_signup_totals(p_event_ids uuid[])
returns table (event_id uuid, registered bigint, revenue numeric)
language sql
stable
set search_path = ''
as $$
  select
    r.event_id,
    count(*),
    sum(greatest(0, r.amount - r.amount_refunded - r.service_fee - r.sales_tax))
  from public.registrations r
  where r.event_id = any (p_event_ids)
    and r.status = 'confirmed'
  group by r.event_id;
$$;
