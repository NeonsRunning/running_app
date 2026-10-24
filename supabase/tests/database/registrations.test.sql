-- Registrations: who reads them, holds, and cancelling instead of deleting
-- (DATA-001, SEC-003).
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns "Neon Night 10K"
--   2  organizer Omar — owns nothing here
--   3  runner Ana
--   4  runner Beto
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
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com'),
  ('00000000-0000-4000-8000-000000000005', 'ada@example.com');

update public.profiles set account_type = 'organizer'
where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000005');

insert into public.ath_movil_accounts (id, label, path) values
  ('00000000-0000-4000-9000-0000000000a1', 'NEONS RUNNING', '/NeonsRunningTest');

-- A published race a month out, open for sign-ups, taking ATH Móvil.
insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city, ath_movil_account_id
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'neon-night-10k-test', 'published', now(), 'Neon Night 10K', 'Road Race',
  current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
  '00000000-0000-4000-9000-0000000000a1'
);

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values (
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-9000-0000000000e1',
  '10K', 10, 30, 2, '18:00'
);

-- A paid sign-up of Beto's, written as the database would after payment.
insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, paid_at
) values (
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 1001,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199', 35.68,
  'stripe', 'pi_test_beto', now()
);

-- What Ana types at sign-up.
create or replace function tests.ana_details()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', 'Ana', 'last_name', 'Figueroa', 'email', 'ana@example.com',
    'phone', '787-555-0103', 'birth_date', '1992-03-03', 'gender', 'f',
    'emergency_contact_name', 'Luis Figueroa', 'emergency_contact_phone', '787-555-0198',
    'wants_photos', false, 'donation', 0
  );
$$;

grant execute on function tests.ana_details() to authenticated;
-- End of fixtures.

select plan(12);

-- Ana, a runner.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (select count(*)::int from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000004'),
  0,
  'a runner cannot read another runner''s registration'
);

select throws_ok(
  $$ select public.confirm_registration_payment(
       '00000000-0000-4000-9000-0000000000b1', 'pi_fake', 3568) $$,
  '42501',
  null,
  'a runner cannot confirm a payment themselves'
);

select lives_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'a runner starts a sign-up'
);

select is(
  (select status::text from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  'pending',
  'the sign-up waits for payment'
);

-- The category holds 2: Beto's paid spot and Ana's hold. Nobody else fits.
reset role;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000006', 'cruz@example.com');
select tests.act_as('00000000-0000-4000-8000-000000000006');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'P0001',
  'soldOut',
  'a live hold keeps the last spot'
);

reset role;

-- A hold that ran to its 2-hour cap, 5 minutes ago, cannot restart yet.
update public.registrations set
  hold_started_at = now() - interval '2 hours 5 minutes',
  hold_expires_at = now() - interval '5 minutes'
where runner_id = '00000000-0000-4000-8000-000000000003';

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'P0001',
  'holdLimitReached',
  'a capped hold waits before starting again'
);

reset role;

-- Olga, the organizer, takes Beto off the race.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select status::text from public.remove_registration('00000000-0000-4000-9000-0000000000b1')),
  'cancelled',
  'removing a paid runner cancels the registration'
);

reset role;

select is(
  (select payment_intent_id from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  'pi_test_beto',
  'the cancelled row keeps its payment record'
);

-- The webhook reporting Beto's payment again must not bring it back.
select is(
  (select status::text from public.confirm_registration_payment(
     '00000000-0000-4000-9000-0000000000b1', 'pi_test_beto', 3568)),
  'cancelled',
  'a replayed payment leaves a cancelled registration cancelled'
);

-- Beto can sign up again, beside the cancelled row.
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'a removed runner can sign up again'
);

reset role;

select is(
  (select count(*)::int from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000004'),
  2,
  'the new sign-up sits beside the cancelled one'
);

-- An event someone paid for cannot be deleted by its organizer any more.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.delete_event('00000000-0000-4000-9000-0000000000e1') $$,
  'P0001',
  'eventHasRegistrations',
  'a cancelled (once paid) registration keeps the event'
);

reset role;

select * from finish();
rollback;
