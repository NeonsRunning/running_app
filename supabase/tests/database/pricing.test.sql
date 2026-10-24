-- Pricing: register_for_event() must charge what the sign-up form showed.
--
-- The price is computed twice: in register_for_event() (the amount charged)
-- and in lib/events/pricing.ts (the total the form shows). This file and
-- lib/events/pricing.test.ts price the same sign-up and expect the same
-- total; change the fee or the tax rate in one place and the other test
-- fails until both agree.
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

select plan(3);

-- Every extra on: $30 race, $22 shirt, $12 photos, $8 shipping, and a $10
-- donation (not taxed). Taxable: 30 + 22 + 12 + 2 (service fee) + 8 = 74.
update public.events set
  offers_shirt = true, shirt_sizes = '{M}', shirt_price = 22,
  offers_photos = true, photo_price = 12,
  accepts_donations = true, donation_recipient = 'Fundación Corre PR',
  offers_mail = true, shipping_price = 8
where id = '00000000-0000-4000-9000-0000000000e1';

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select public.register_for_event(
  '00000000-0000-4000-9000-0000000000c1',
  tests.ana_details() || jsonb_build_object(
    'shirt_size', 'M', 'wants_photos', true, 'donation', 10,
    'ships_by_mail', true, 'mailing_address', '123 Calle Luna, San Juan, PR 00901'
  )
);

reset role;

select is(
  (select service_fee from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  2.00::numeric,
  'the service fee is $2.00 (SERVICE_FEE in lib/events/pricing.ts)'
);

select is(
  (select sales_tax from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  8.51::numeric,
  'sales tax is 11.5% of 74, rounded to the cent (SALES_TAX_RATE)'
);

select is(
  (select amount from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  92.51::numeric,
  'the amount charged matches registrationTotal() for the same sign-up'
);

select * from finish();
rollback;
