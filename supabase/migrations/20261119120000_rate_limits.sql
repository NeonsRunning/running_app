-- ---------------------------------------------------------------------------
-- Rate limits
--
-- Server actions are public POST endpoints, and some of them cost something
-- each time: the contact form sends an email through the same Brevo account
-- as payment confirmations and refund notices (so a flood could use up the
-- quota those need), starting a checkout opens a Stripe PaymentIntent, a
-- deletion request emails the team. Nothing limited how often they could be
-- called.
--
-- `hit_rate_limit()` counts calls per key in fixed windows and says whether
-- this one is still within the limit. The server calls it with the service
-- role before doing the costly thing. Keys are hashed by the server before
-- they get here, so the table holds no IP addresses or email addresses.
--
-- Fixed windows let a burst straddle two windows (up to twice the limit in a
-- short stretch). That is fine for what this guards against: sustained abuse,
-- not precise quotas.
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  -- "<action>:<sha-256 of who>", e.g. "contact:ip:3f2a…".
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits integer not null default 1 check (hits > 0),
  primary key (key, window_start)
);

comment on table public.rate_limits is
  'Calls per hashed key per time window, for throttling costly server actions. Service role only.';

alter table public.rate_limits enable row level security;

-- No policies: only the service role, which bypasses row-level security.
revoke all on public.rate_limits from anon, authenticated;

-- Count one call against `p_key` in the current `p_window`, and say whether
-- it is within `p_limit`. Calls past the limit still count, so hammering a
-- closed window does not reopen it early.
create or replace function public.hit_rate_limit(
  p_key text,
  p_limit integer,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.rate_limits (key, window_start)
  values (p_key, date_bin(p_window, now(), timestamptz '2000-01-01'))
  on conflict (key, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into n;

  return n <= p_limit;
end;
$$;

revoke execute on function public.hit_rate_limit(text, integer, interval)
  from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, interval) to service_role;

-- Windows are at most a day long; anything older counts for nothing.
create or replace function public.purge_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke execute on function public.purge_rate_limits() from public, anon, authenticated;

select cron.schedule(
  'purge-rate-limits',
  '29 5 * * *',
  'select public.purge_rate_limits()'
);
