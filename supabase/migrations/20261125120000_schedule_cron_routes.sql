-- ---------------------------------------------------------------------------
-- Calling the app's cron routes from the database
--
-- `/api/cron/race-reminders` (hourly) and `/api/cron/email-outbox` (every 10
-- minutes) were scheduled in vercel.json, but Vercel's Hobby plan refuses any
-- cron that runs more than once a day. pg_cron calls them instead, through
-- pg_net, with the same `Authorization: Bearer $CRON_SECRET` header.
--
-- Where to call and with what secret differ per environment, so neither is
-- written here. Both are read from Vault on every run:
--
--   select vault.create_secret('https://your-site.example', 'cron_site_url');
--   select vault.create_secret('<the CRON_SECRET set on Vercel>', 'cron_secret');
--
-- Until both are set (a local database, say) the jobs do nothing.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.call_cron_route(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  site_url text;
  secret text;
begin
  select decrypted_secret into site_url
  from vault.decrypted_secrets where name = 'cron_site_url';
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'cron_secret';
  if site_url is null or secret is null then
    return null;
  end if;

  -- pg_net sends it in the background. The timeout matches the routes'
  -- `maxDuration`, so a long run is not cut off from this end.
  return net.http_get(
    url := rtrim(site_url, '/') || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 300000
  );
end;
$$;

comment on function public.call_cron_route(text) is
  'GETs one of the app''s /api/cron/* routes with the secret from Vault. Run by pg_cron.';

-- Only the scheduler runs it.
revoke execute on function public.call_cron_route(text)
  from public, anon, authenticated;

select cron.schedule(
  'race-reminders',
  '5 * * * *',
  $$select public.call_cron_route('/api/cron/race-reminders')$$
);

select cron.schedule(
  'email-outbox',
  '*/10 * * * *',
  $$select public.call_cron_route('/api/cron/email-outbox')$$
);
