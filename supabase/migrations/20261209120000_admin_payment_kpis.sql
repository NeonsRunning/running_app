-- ---------------------------------------------------------------------------
-- Payment history: a date range, and the money in it
--
-- `/admin/payments/history` lists every payment. The team also needs to ask
-- "what came in last month?" — so the list takes a date range, and a second
-- function sums the same matches into the figures the page shows above it.
--
-- One private function, `admin_payment_matches()`, decides which payments
-- match a search, a method and a range, so the list and the figures can
-- never disagree about what they cover.
--
-- Dates are island dates: a range of 1–31 March runs from midnight on
-- 1 March to midnight on 1 April in Puerto Rico (UTC-4 all year).
--
-- Errors (both callable functions):
--   notAllowed   the caller is not in `platform_admins`
-- ---------------------------------------------------------------------------

-- Typed text is matched literally, wildcards and all.
create or replace function public.admin_payment_matches(
  p_query text,
  p_method public.payment_method,
  p_from date,
  p_to date
)
returns setof public.registrations
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.registrations r
  join public.events e on e.id = r.event_id
  cross join (
    select '%' || replace(replace(replace(
      btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ) q
  where r.paid_at is not null
    and (p_method is null or r.payment_method = p_method)
    and (p_from is null
         or r.paid_at >= (p_from::timestamp at time zone 'America/Puerto_Rico'))
    and (p_to is null
         or r.paid_at < ((p_to + 1)::timestamp at time zone 'America/Puerto_Rico'))
    and (
      btrim(coalesce(p_query, '')) = ''
      or (r.first_name || ' ' || r.last_name) ilike q.pattern
      or r.email ilike q.pattern
      or e.name ilike q.pattern
      or r.payment_reference ilike q.pattern
      or r.payment_intent_id ilike q.pattern
      or r.bib::text = btrim(p_query)
    )
$$;

-- Only the two functions below call it, as its owner.
revoke execute on function public.admin_payment_matches(
  text, public.payment_method, date, date
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_payments(): as in 20261208120000_admin_payment_history.sql, with
-- the date range. The arguments change, so the old one is dropped.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_list_payments(
  text, public.payment_method, text, boolean, integer, integer
);

create function public.admin_list_payments(
  p_query text default null,
  p_method public.payment_method default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'paid',
  p_desc boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  event_id uuid,
  event_name text,
  event_slug text,
  runner_id uuid,
  first_name text,
  last_name text,
  email text,
  bib integer,
  status public.registration_status,
  payment_method public.payment_method,
  amount numeric,
  amount_refunded numeric,
  refunded_at timestamptz,
  dispute_status text,
  payment_reference text,
  payment_intent_id text,
  paid_at timestamptz,
  total_count bigint,
  total_amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sort text := case when p_sort in ('paid', 'amount', 'runner', 'event')
                    then p_sort else 'paid' end;
  descending boolean := coalesce(p_desc, true);
begin
  if not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  return query
  select
    r.id, e.id, e.name, e.slug, r.runner_id,
    r.first_name, r.last_name, r.email, r.bib, r.status, r.payment_method,
    r.amount, r.amount_refunded, r.refunded_at, r.dispute_status,
    r.payment_reference, r.payment_intent_id, r.paid_at,
    count(*) over (),
    sum(r.amount) over ()
  from public.admin_payment_matches(p_query, p_method, p_from, p_to) r
  join public.events e on e.id = r.event_id
  order by
    case when sort = 'amount' and not descending then r.amount end asc,
    case when sort = 'amount' and descending then r.amount end desc,
    case when sort = 'runner' and not descending
         then lower(r.last_name || ' ' || r.first_name) end asc,
    case when sort = 'runner' and descending
         then lower(r.last_name || ' ' || r.first_name) end desc,
    case when sort = 'event' and not descending then lower(e.name) end asc,
    case when sort = 'event' and descending then lower(e.name) end desc,
    case when sort = 'paid' and not descending then r.paid_at end asc,
    -- Ties, and the 'paid' sort itself: newest first.
    r.paid_at desc,
    r.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_list_payments(
  text, public.payment_method, date, date, text, boolean, integer, integer
) from public, anon;
grant execute on function public.admin_list_payments(
  text, public.payment_method, date, date, text, boolean, integer, integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_payment_kpis(): the money in the payments that match, in one row.
--
--   gross             everything runners paid
--   refunded          given back through Stripe, in full or in part
--   disputes_lost     taken back by a chargeback the platform lost
--   net               gross − refunded − disputes_lost: what was kept
--   disputes_open     still being argued; counted in net until decided
--   service_fees      the platform's fee, sales_tax the IVU, donations the
--                     runners' gifts — each only on payments that were kept,
--                     not refunded in full and not lost to a chargeback
--   card_* / ath_*    gross and count by method
-- ---------------------------------------------------------------------------

create or replace function public.admin_payment_kpis(
  p_query text default null,
  p_method public.payment_method default null,
  p_from date default null,
  p_to date default null
)
returns table (
  payments bigint,
  gross numeric,
  refunded numeric,
  refunds bigint,
  disputes_lost numeric,
  disputes_open numeric,
  disputes_open_count bigint,
  net numeric,
  service_fees numeric,
  sales_tax numeric,
  donations numeric,
  card_gross numeric,
  card_count bigint,
  ath_gross numeric,
  ath_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  return query
  with m as (
    select
      r.*,
      r.dispute_status is not distinct from 'lost' as lost,
      r.dispute_status is not null
        and r.dispute_status not in ('won', 'lost', 'warning_closed') as open,
      r.amount_refunded < r.amount and r.dispute_status is distinct from 'lost' as kept
    from public.admin_payment_matches(p_query, p_method, p_from, p_to) r
  )
  select
    count(*),
    coalesce(sum(m.amount), 0),
    coalesce(sum(m.amount_refunded), 0),
    count(*) filter (where m.amount_refunded > 0),
    coalesce(sum(m.amount - m.amount_refunded) filter (where m.lost), 0),
    coalesce(sum(m.amount - m.amount_refunded) filter (where m.open), 0),
    count(*) filter (where m.open),
    coalesce(sum(m.amount - m.amount_refunded) filter (where not m.lost), 0),
    coalesce(sum(m.service_fee) filter (where m.kept), 0),
    coalesce(sum(m.sales_tax) filter (where m.kept), 0),
    coalesce(sum(m.donation) filter (where m.kept), 0),
    coalesce(sum(m.amount) filter (where m.payment_method = 'stripe'), 0),
    count(*) filter (where m.payment_method = 'stripe'),
    coalesce(sum(m.amount) filter (where m.payment_method = 'ath_movil'), 0),
    count(*) filter (where m.payment_method = 'ath_movil')
  from m;
end;
$$;

revoke execute on function public.admin_payment_kpis(
  text, public.payment_method, date, date
) from public, anon;
grant execute on function public.admin_payment_kpis(
  text, public.payment_method, date, date
) to authenticated;
