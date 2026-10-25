-- Payment hardening: the hold cap across lapses, rejected and shared ATH
-- Móvil references, and payments after registration closed.
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

-- Omar's race, paid into the same ATH Móvil account.
insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city, ath_movil_account_id
) values (
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-8000-000000000002',
  'harbor-5k-test', 'published', now(), 'Harbor 5K', 'Road Race',
  current_date + 30, '07:00', current_date + 25, 'Bahía Urbana', 'San Juan',
  '00000000-0000-4000-9000-0000000000a1'
);

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values (
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-9000-0000000000e2',
  '5K', 5, 20, 10, '07:00'
);

select plan(14);

-- Ana starts a sign-up.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'Ana starts a sign-up'
);

reset role;

select set_config('tests.ana_reg', id::text, true)
from public.registrations
where runner_id = '00000000-0000-4000-8000-000000000003';

-- Her hold began 1h55m ago and was left to lapse 5 minutes ago, just short
-- of its cap. Coming straight back must not start a fresh 2 hours.
update public.registrations set
  hold_started_at = now() - interval '1 hour 55 minutes',
  hold_expires_at = now() - interval '5 minutes'
where id = current_setting('tests.ana_reg')::uuid;

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'a hold restarted soon after it lapsed goes on'
);

reset role;

select is(
  (select hold_started_at from public.registrations
   where id = current_setting('tests.ana_reg')::uuid),
  now() - interval '1 hour 55 minutes',
  '... keeping its original start'
);

select is(
  (select hold_expires_at from public.registrations
   where id = current_setting('tests.ana_reg')::uuid),
  now() + interval '5 minutes',
  '... and ending at the 2-hour cap counted from there'
);

-- That hold ran out at its cap a minute ago.
update public.registrations set
  hold_started_at = now() - interval '2 hours 1 minute',
  hold_expires_at = now() - interval '1 minute'
where id = current_setting('tests.ana_reg')::uuid;

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'P0001',
  'holdLimitReached',
  'so it waits before another starts'
);

reset role;

-- 20 minutes later the spot has been open to others long enough.
update public.registrations set
  hold_started_at = now() - interval '2 hours 20 minutes',
  hold_expires_at = now() - interval '20 minutes'
where id = current_setting('tests.ana_reg')::uuid;

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (select hold_started_at
   from public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details())),
  now(),
  'after a real gap, a new hold starts afresh'
);

-- Ana sends an ATH Móvil reference, and Ada cannot find the payment.
select lives_ok(
  $$ select public.submit_ath_movil_payment(current_setting('tests.ana_reg')::uuid, 'REF-1') $$,
  'Ana submits a reference'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select payment_rejections::int from public.review_ath_movil_payment(
     current_setting('tests.ana_reg')::uuid, false)),
  1,
  'a rejection is counted'
);

reset role;

select is(
  (select hold_started_at from public.registrations
   where id = current_setting('tests.ana_reg')::uuid),
  null,
  '... and ends the card-hold history'
);

-- Beto signs up for Omar's race, paid into the same account, with the
-- reference already submitted for Ana's sign-up.
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select public.submit_ath_movil_payment(
       (public.register_for_event('00000000-0000-4000-9000-0000000000c2', tests.ana_details())).id,
       'ref-1') $$,
  'P0001',
  'referenceUsed',
  'a reference used on another event paid into the same account is refused'
);

reset role;

-- Two more rejections later, Ana's sign-up takes no more references.
update public.registrations set payment_rejections = 3
where id = current_setting('tests.ana_reg')::uuid;

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.submit_ath_movil_payment(current_setting('tests.ana_reg')::uuid, 'REF-4') $$,
  'P0001',
  'referenceLimitReached',
  'a sign-up with 3 rejected references takes no more'
);

reset role;

-- Registration closed yesterday, island time.
update public.registrations set payment_rejections = 0
where id = current_setting('tests.ana_reg')::uuid;
update public.events
set registration_closes = (now() at time zone 'America/Puerto_Rico')::date - 1
where id = '00000000-0000-4000-9000-0000000000e1';

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.submit_ath_movil_payment(current_setting('tests.ana_reg')::uuid, 'REF-5') $$,
  'P0001',
  'registrationClosed',
  'no ATH Móvil reference after registration closed'
);

reset role;

-- The webhook, as the service role would call it (superuser here).
select throws_ok(
  $$ select public.confirm_registration_payment(
       current_setting('tests.ana_reg')::uuid, 'pi_test_late',
       (select round(amount * 100)::bigint from public.registrations
        where id = current_setting('tests.ana_reg')::uuid)) $$,
  'P0001',
  'registrationClosed',
  'a card payment that clears after registration closed is refused, to be refunded'
);

select is(
  (select status::text from public.confirm_registration_payment(
     '00000000-0000-4000-9000-0000000000b1', 'pi_test_beto', 3568)),
  'confirmed',
  'a payment that already confirmed its sign-up is still returned'
);

select * from finish();
rollback;
