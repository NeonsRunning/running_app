-- Race-day check-in: who may check a runner in, undoing it, and what a
-- removed sign-up does.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns the race
--   2  organizer Omar — owns nothing here
--   3  runner Ana
--   5  admin Ada (in platform_admins)
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

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'olga@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'omar@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com'),
  ('00000000-0000-4000-8000-000000000005', 'ada@example.com');

update public.profiles set account_type = 'organizer'
where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000005');

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'check-in-run-test', 'published', now(), 'Check-in Run 5K', 'Road Race',
  current_date, '18:00', current_date - 1, 'Paseo Caribe', 'San Juan'
);

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1',
   '5K', 5, 30, 50, '18:00');

insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, paid_at
) values (
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000003',
  'confirmed', 1001,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198', 35.68,
  'stripe', 'pi_test_ana', now()
);
-- End of fixtures.

select plan(9);

-- Ana cannot check herself in, and Omar does not organize the race.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.set_checked_in('00000000-0000-4000-9000-0000000000b1', true) $$,
  'P0001',
  'notAllowed',
  'a runner cannot check themselves in'
);

select throws_ok(
  $$ update public.registrations set checked_in_at = now()
     where id = '00000000-0000-4000-9000-0000000000b1' $$,
  '42501',
  null,
  'nor write the column directly'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000002');
set local role authenticated;

select throws_ok(
  $$ select public.set_checked_in('00000000-0000-4000-9000-0000000000b1', true) $$,
  'P0001',
  'notAllowed',
  'only the event''s organizer checks runners in'
);

reset role;

-- Olga checks Ana in; checking in again keeps the first time.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select isnt(
  (public.set_checked_in('00000000-0000-4000-9000-0000000000b1', true)).checked_in_at,
  null,
  'the organizer checks a runner in'
);

reset role;
update public.registrations set checked_in_at = now() - interval '1 hour'
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select ok(
  (public.set_checked_in('00000000-0000-4000-9000-0000000000b1', true)).checked_in_at
    < now() - interval '59 minutes',
  'checking in twice keeps the first time'
);

select is(
  (public.set_checked_in('00000000-0000-4000-9000-0000000000b1', false)).checked_in_at,
  null,
  'undo clears the check-in'
);

reset role;

-- A platform admin may too.
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select isnt(
  (public.set_checked_in('00000000-0000-4000-9000-0000000000b1', true)).checked_in_at,
  null,
  'a platform admin checks a runner in'
);

reset role;

-- A sign-up taken off the event cannot be checked in.
update public.registrations set status = 'cancelled', cancelled_at = now()
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.set_checked_in('00000000-0000-4000-9000-0000000000b1', true) $$,
  'P0001',
  'registrationMissing',
  'a removed sign-up cannot be checked in'
);

reset role;

-- No session at all.
select set_config('request.jwt.claims', '{}', true);

select throws_ok(
  $$ select public.set_checked_in('00000000-0000-4000-9000-0000000000b1', true) $$,
  'P0001',
  'notAllowed',
  'without a session nobody is checked in'
);

select * from finish();
rollback;
