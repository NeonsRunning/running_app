-- Admins seeing the app's users: `admin_list_users()` and private profiles.
begin;
create extension if not exists pgtap with schema extensions;

-- People, by the last digit of their id:
--   3  runner Ana — private profile
--   4  runner Beto
--   5  admin Ada (in platform_admins)

create schema if not exists tests;

create or replace function tests.act_as(uid uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
$$;

grant usage on schema tests to authenticated;
grant execute on function tests.act_as(uuid) to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com'),
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com'),
  ('00000000-0000-4000-8000-000000000005', 'ada@example.com');

update public.profiles set full_name = 'Ana Rivera', is_public = false
where id = '00000000-0000-4000-8000-000000000003';

update public.profile_private set
  phone = '787-555-0000',
  emergency_contact_name = 'Luis Rivera',
  emergency_contact_phone = '787-555-0001'
where id = '00000000-0000-4000-8000-000000000003';

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000005');

select plan(14);

-- Private profiles ----------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select is(
  (select count(*)::int from public.profiles
    where id = '00000000-0000-4000-8000-000000000003'),
  0,
  'another runner still cannot read a private profile'
);

select throws_ok(
  $$ select * from public.admin_list_users() $$,
  'P0001', 'notAllowed',
  'a runner cannot list users'
);

reset role;
set local role anon;

select is(
  (select count(*)::int from public.profiles
    where id = '00000000-0000-4000-8000-000000000003'),
  0,
  'a visitor still cannot read a private profile'
);

select throws_ok(
  $$ select * from public.admin_list_users() $$,
  '42501', null,
  'a visitor cannot call the list at all'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select count(*)::int from public.profiles
    where id = '00000000-0000-4000-8000-000000000003'),
  1,
  'an admin reads a private profile'
);

select is(
  (select count(*)::int from public.profile_private
    where id = '00000000-0000-4000-8000-000000000003'),
  0,
  'an admin still cannot read a runner''s private details'
);

-- The list ------------------------------------------------------------------

select is(
  (select l.email from public.admin_list_users('ana@example') l),
  'ana@example.com',
  'the list carries the sign-in email and searches it'
);

select is(
  (select l.phone from public.admin_list_users('ana@example') l),
  '787-555-0000',
  'the list carries the phone'
);

select is(
  (select l.emergency_contact_name || ' ' || l.emergency_contact_phone
    from public.admin_list_users('ana@example') l),
  'Luis Rivera 787-555-0001',
  'the list carries the emergency contact'
);

select is(
  (select l.is_public from public.admin_list_users('Ana Rivera') l),
  false,
  'the list includes private profiles and says so'
);

select is(
  (select l.is_admin from public.admin_list_users('ada@example') l),
  true,
  'the list marks admins'
);

select is(
  (select count(*)::int from public.admin_list_users('100%')),
  0,
  'a wildcard is matched literally'
);

select is(
  (select count(*)::int from public.admin_list_users('@example.com', 2, 0)),
  2,
  'a page holds at most the limit'
);

select is(
  (select distinct l.total_count::int from public.admin_list_users('@example.com', 2, 0) l),
  3,
  'the total counts every match, not just the page'
);

reset role;
select * from finish();
rollback;
