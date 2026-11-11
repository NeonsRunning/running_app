-- confirm_registration_payment(): each reason a card payment is refused —
-- and so refunded by the server — and what a confirmation writes.
-- (`registrationClosed` and the replay of a confirmed sign-up are in
-- payment_hardening.test.sql.)
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns "Neon Night 10K"
--   3  runner Ana
--   4  runner Beto — already paid for it
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
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com'),
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com');

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

-- A published race a month out, open for sign-ups, with two spots.
insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'neon-night-10k-test', 'published', now(), 'Neon Night 10K', 'Road Race',
  current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan'
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

-- Ana's amount in cents, as Stripe would report it paid.
create or replace function tests.ana_cents()
returns bigint
language sql
as $$
  select round(amount * 100)::bigint from public.registrations
  where runner_id = '00000000-0000-4000-8000-000000000003';
$$;
-- End of fixtures.

select plan(10);

select throws_ok(
  $$ select public.confirm_registration_payment(
       '00000000-0000-4000-9000-0000000000ff', 'pi_test_nobody', 3000) $$,
  'P0001',
  'registrationMissing',
  'a payment for a sign-up that is gone is refused'
);

-- Ana starts a sign-up: a pending row, its spot held.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;
select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details());
reset role;

select set_config('tests.ana_reg', id::text, true)
from public.registrations
where runner_id = '00000000-0000-4000-8000-000000000003';

-- Everything below is the webhook, as the service role calls it (superuser here).

select throws_ok(
  $$ select public.confirm_registration_payment(
       current_setting('tests.ana_reg')::uuid, 'pi_test_ana', tests.ana_cents() + 1) $$,
  'P0001',
  'amountMismatch',
  'a payment of a different amount from the sign-up''s is refused'
);

select is(
  (select status::text from public.registrations
   where id = current_setting('tests.ana_reg')::uuid),
  'pending',
  'and leaves the sign-up as it was'
);

-- The race is unpublished while the payment clears.
update public.events set status = 'draft'
where id = '00000000-0000-4000-9000-0000000000e1';

select throws_ok(
  $$ select public.confirm_registration_payment(
       current_setting('tests.ana_reg')::uuid, 'pi_test_ana', tests.ana_cents()) $$,
  'P0001',
  'eventUnavailable',
  'a payment for a race no longer published is refused'
);

update public.events set status = 'published'
where id = '00000000-0000-4000-9000-0000000000e1';

-- Ana also sent the money by ATH Móvil, which is waiting for review.
update public.registrations set payment_submitted_at = now()
where id = current_setting('tests.ana_reg')::uuid;

select throws_ok(
  $$ select public.confirm_registration_payment(
       current_setting('tests.ana_reg')::uuid, 'pi_test_ana', tests.ana_cents()) $$,
  'P0001',
  'paymentUnderReview',
  'a card payment for a sign-up under ATH Móvil review is refused'
);

update public.registrations set payment_submitted_at = null
where id = current_setting('tests.ana_reg')::uuid;

-- The hold lapsed, and the race filled meanwhile.
update public.registrations set hold_expires_at = now() - interval '1 minute'
where id = current_setting('tests.ana_reg')::uuid;
update public.event_categories set capacity = 1
where id = '00000000-0000-4000-9000-0000000000c1';

select throws_ok(
  $$ select public.confirm_registration_payment(
       current_setting('tests.ana_reg')::uuid, 'pi_test_ana', tests.ana_cents()) $$,
  'P0001',
  'soldOut',
  'a payment after the hold lapsed is refused when the spot has gone'
);

-- A lapsed hold with room still left confirms.
update public.event_categories set capacity = 2
where id = '00000000-0000-4000-9000-0000000000c1';

select is(
  (select status::text from public.confirm_registration_payment(
     current_setting('tests.ana_reg')::uuid, 'pi_test_ana', tests.ana_cents())),
  'confirmed',
  'and confirms when there is still room'
);

select is(
  (select bib from public.registrations
   where id = current_setting('tests.ana_reg')::uuid),
  1002,
  'the next bib is assigned'
);

select is(
  (select payment_method::text || ' ' || payment_intent_id from public.registrations
   where id = current_setting('tests.ana_reg')::uuid),
  'stripe pi_test_ana',
  'and the payment that confirmed it is recorded'
);

-- A second payment for the same sign-up: the row comes back as it is, still
-- naming the first, which is how the server knows to refund this one.
select is(
  (select payment_intent_id from public.confirm_registration_payment(
     current_setting('tests.ana_reg')::uuid, 'pi_test_second', tests.ana_cents())),
  'pi_test_ana',
  'a second payment does not replace the one that confirmed the sign-up'
);

select * from finish();
rollback;
