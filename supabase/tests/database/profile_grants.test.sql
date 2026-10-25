-- Profile column grants: a runner edits their settings, not their handle.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures kept inline, as in the other files, so this one runs on its own.
--
--   3  runner Ana
--
-- Acting as someone: `select tests.act_as('<id>')` then `set local role
-- authenticated`; `reset role` goes back to the superuser.

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

-- The sign-up trigger creates the profile row, handle included.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com', '{"full_name": "Ana Figueroa"}');

select plan(5);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'handle', 'UPDATE'),
  'runners cannot update a handle'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE'),
  'runners can still update their name'
);

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ update public.profiles set handle = 'club-corredores'
     where id = '00000000-0000-4000-8000-000000000003' $$,
  '42501',
  null,
  'so renaming their own handle through the Data API is refused'
);

select lives_ok(
  $$ update public.profiles set full_name = 'Ana F.'
     where id = '00000000-0000-4000-8000-000000000003' $$,
  'while the settings fields still save'
);

reset role;

select isnt(
  (select handle from public.profiles where id = '00000000-0000-4000-8000-000000000003'),
  'club-corredores',
  'and the handle is unchanged'
);

select * from finish();
rollback;
