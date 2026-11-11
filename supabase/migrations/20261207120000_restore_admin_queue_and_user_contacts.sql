-- ---------------------------------------------------------------------------
-- Bringing production back in line with two earlier migrations
--
-- A schema comparison of production against a database built from these
-- migrations found three differences, nothing else:
--
--   ath_movil_review_queue()  missing from production. Created by
--                             20261103120000_ath_movil_accounts.sql and never
--                             dropped by a migration, so it was removed by
--                             hand. /admin/payments reads an error as an
--                             empty list, so admins were shown nothing to
--                             review while payments waited.
--
--   admin_list_users()        production has the first version of
--                             20261130120000_admin_users.sql, without the
--                             phone and emergency contact. The file was
--                             edited after production applied it, and
--                             `db push` never runs an applied file again.
--
--   profile_private comment   the same edit's wording.
--
-- Each is redefined here exactly as those migrations define it now. On a
-- database built from the migrations this changes nothing.
-- ---------------------------------------------------------------------------

-- ath_movil_review_queue(): as in 20261103120000_ath_movil_accounts.sql.
drop function if exists public.ath_movil_review_queue();

create function public.ath_movil_review_queue()
returns table (
  id uuid,
  event_name text,
  event_date date,
  first_name text,
  last_name text,
  email text,
  phone text,
  amount numeric,
  payment_reference text,
  payment_submitted_at timestamptz,
  account_label text,
  account_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'notAdmin' using errcode = 'P0001';
  end if;

  return query
    select r.id, e.name, e.event_date, r.first_name, r.last_name, r.email,
           r.phone, r.amount, r.payment_reference, r.payment_submitted_at,
           a.label, a.path
    from public.registrations r
    join public.events e on e.id = r.event_id
    left join public.ath_movil_accounts a on a.id = r.ath_movil_account_id
    where r.status = 'pending' and r.payment_submitted_at is not null
    order by r.payment_submitted_at;
end;
$$;

revoke execute on function public.ath_movil_review_queue() from public, anon;
grant execute on function public.ath_movil_review_queue() to authenticated;

-- ---------------------------------------------------------------------------

comment on table public.profile_private is
  'Contact and race-day data. Readable by its owner; platform admins get the phone and emergency contact through admin_list_users().';

-- admin_list_users(): as in 20261130120000_admin_users.sql. The returned
-- columns change on production, so the function is replaced, not redefined.
drop function if exists public.admin_list_users(text, integer, integer);

create function public.admin_list_users(
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
