-- ---------------------------------------------------------------------------
-- Platform stats
--
-- The landing page's "platform at a glance" strip. Every figure counts rows a
-- visitor cannot read -- other runners' registrations, private profiles -- so,
-- like `registration_counts()`, this runs with definer rights and returns
-- totals and nothing else.
--
--   races       published events
--   runners     distinct runners with at least one registration
--   organizers  organizer accounts
--   clubs       distinct club names on profiles and registrations, compared
--               case- and whitespace-insensitively
-- ---------------------------------------------------------------------------

create or replace function public.platform_stats()
returns table (races bigint, runners bigint, organizers bigint, clubs bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.events where status = 'published'),
    (select count(distinct runner_id) from public.registrations),
    (select count(*) from public.profiles where account_type = 'organizer'),
    (select count(distinct name) from (
      select lower(regexp_replace(trim(club), '\s+', ' ', 'g')) as name
      from public.profiles where club is not null
      union
      select lower(regexp_replace(trim(club), '\s+', ' ', 'g'))
      from public.registrations where club is not null
    ) c where name <> '');
$$;

revoke execute on function public.platform_stats() from public;
grant execute on function public.platform_stats() to anon, authenticated;
