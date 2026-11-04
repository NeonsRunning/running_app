-- ---------------------------------------------------------------------------
-- Admins can see the app's users
--
-- Three things a platform admin could not do until now:
--
--   read a private profile   `/runners/[id]` answers 404 to everyone but the
--                            owner. A new select policy lets admins through,
--                            and the "Accepted results" policy on
--                            `race_results` follows, since it runs under this
--                            one.
--
--   list accounts            `/admin/users` needs the sign-in email, which is
--                            in `auth.users`, out of reach of the API. So the
--                            list comes from a function that checks the role.
--
--   reach a runner           the same list carries the phone and the emergency
--                            contact from `profile_private`.
--
-- `profile_private` keeps its owner-only policies: admins get those three
-- columns through the function and nothing else from the table. Birth dates,
-- gender, shirt sizes and addresses stay with their owner.
-- ---------------------------------------------------------------------------

-- Only `authenticated`: `is_platform_admin()` is not executable by anon, so a
-- policy naming anon would fail every visitor's read.
create policy "Platform admins read every profile"
  on public.profiles for select
  to authenticated
  using ((select public.is_platform_admin()));

comment on table public.profile_private is
  'Contact and race-day data. Readable by its owner; platform admins get the phone and emergency contact through admin_list_users().';

-- A page of accounts, newest first, optionally matching a name, handle, email,
-- city or club. `total_count` is the number of matches across all pages.
--
-- Errors:
--   notAllowed   the caller is not in `platform_admins`
create or replace function public.admin_list_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  handle text,
  full_name text,
  email text,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  account_type public.account_type,
  is_admin boolean,
  city text,
  club text,
  is_public boolean,
  avatar_path text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  total_count bigint
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
begin
  if not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  return query
  select
    p.id, p.handle, p.full_name, u.email::text,
    pp.phone, pp.emergency_contact_name, pp.emergency_contact_phone,
    p.account_type,
    exists (select 1 from public.platform_admins a where a.user_id = p.id),
    p.city, p.club, p.is_public, p.avatar_path, p.created_at,
    u.last_sign_in_at,
    count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profile_private pp on pp.id = p.id
  where p.full_name ilike pattern
    or p.handle ilike pattern
    or u.email ilike pattern
    or p.city ilike pattern
    or p.club ilike pattern
  order by p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
