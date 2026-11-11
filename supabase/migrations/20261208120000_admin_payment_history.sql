-- ---------------------------------------------------------------------------
-- Every payment made on the site, for platform admins
--
-- `/admin/payments` is the ATH Móvil review queue: only what still waits. The
-- team also needs the history — every registration someone paid for, by card
-- or by ATH Móvil, including the ones since refunded, disputed or cancelled —
-- to answer a runner who asks "did my payment go through?".
--
-- A payment is a registration with `paid_at` set. Cancelling a sign-up keeps
-- it; sending a payment back to review clears it, since that money is not
-- confirmed any more.
--
-- `registrations` is not readable by `authenticated` at all, so the list comes
-- from a function that checks the role, like `admin_list_users()`.
--
-- Errors:
--   notAllowed   the caller is not in `platform_admins`
-- ---------------------------------------------------------------------------

create index if not exists registrations_paid_at_idx
  on public.registrations (paid_at desc)
  where paid_at is not null;

-- A page of payments. `p_query` matches the runner's name or email, the
-- event's name, the ATH Móvil reference, the Stripe PaymentIntent id or the
-- bib. `p_method` keeps one payment method. `p_sort` is one of 'paid',
-- 'amount', 'runner' or 'event' ('paid' for anything else). `total_count` and
-- `total_amount` cover every match across all pages.
create or replace function public.admin_list_payments(
  p_query text default null,
  p_method public.payment_method default null,
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
  -- Typed text is matched literally, wildcards and all.
  pattern text := '%' || replace(replace(replace(
    btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
  from public.registrations r
  join public.events e on e.id = r.event_id
  where r.paid_at is not null
    and (p_method is null or r.payment_method = p_method)
    and (
      (r.first_name || ' ' || r.last_name) ilike pattern
      or r.email ilike pattern
      or e.name ilike pattern
      or r.payment_reference ilike pattern
      or r.payment_intent_id ilike pattern
      or r.bib::text = btrim(coalesce(p_query, ''))
    )
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
  text, public.payment_method, text, boolean, integer, integer
) from public, anon;
grant execute on function public.admin_list_payments(
  text, public.payment_method, text, boolean, integer, integer
) to authenticated;
