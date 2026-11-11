-- Admins seeing every payment: `admin_list_payments()`.
begin;
create extension if not exists pgtap with schema extensions;
-- People, by the last digit of their id:
--   1  organizer Olga — owns "History Run 10K"
--   3  runner Ana   — paid by card yesterday, $35.68
--   4  runner Beto  — paid by ATH Móvil two days ago, $50
--   6  runner Cara  — started signing up, never paid
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
  ('00000000-0000-4000-8000-000000000001', 'olga@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com'),
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com'),
  ('00000000-0000-4000-8000-000000000005', 'ada@example.com'),
  ('00000000-0000-4000-8000-000000000006', 'cara@example.com');

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000005');

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'history-run-test', 'published', now(), 'History Run 10K', 'Road Race',
  current_date, '18:00', current_date, 'Paseo Caribe', 'San Juan'
);

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values (
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-9000-0000000000e1',
  '10K', 10, 30, 10, '18:00'
);

insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, payment_reference, paid_at, hold_expires_at
) values (
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000003',
  'confirmed', 1001,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198', 35.68,
  'stripe', 'pi_test_ana', null, now() - interval '1 day', null
), (
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 1002,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199', 50,
  'ath_movil', null, 'ATH-REF-777', now() - interval '2 days', null
), (
  '00000000-0000-4000-9000-0000000000b3',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000006',
  'pending', null,
  'Cara', 'Ortiz', 'cara@example.com', '787-555-0106', '1995-07-07', 'f',
  'Juan Ortiz', '787-555-0197', 30,
  null, null, null, null, now() + interval '30 minutes'
);

select plan(12);

-- Who may list ---------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select * from public.admin_list_payments() $$,
  'P0001', 'notAllowed',
  'a runner cannot list payments'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select * from public.admin_list_payments() $$,
  'P0001', 'notAllowed',
  'an organizer cannot list payments'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.admin_list_payments() $$,
  '42501', null,
  'a visitor cannot call the function at all'
);

-- What an admin sees ---------------------------------------------------------

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select results_eq(
  $$ select first_name from public.admin_list_payments() $$,
  $$ values ('Ana'), ('Beto') $$,
  'only paid registrations, newest first; an unpaid sign-up is left out'
);

select is(
  (select (total_count, total_amount)::text from public.admin_list_payments() limit 1),
  '(2,85.68)',
  'the count and the sum cover every match'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(p_method => 'ath_movil') $$,
  $$ values ('Beto') $$,
  'the method filter keeps one payment method'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(p_query => 'ath-ref-777') $$,
  $$ values ('Beto') $$,
  'search finds an ATH Móvil reference, ignoring case'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(p_query => 'pi_test_ana') $$,
  $$ values ('Ana') $$,
  'search finds a Stripe PaymentIntent, underscores taken literally'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(p_query => '1002') $$,
  $$ values ('Beto') $$,
  'search finds a bib'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(p_sort => 'amount', p_desc => true) $$,
  $$ values ('Beto'), ('Ana') $$,
  'sorts by amount, largest first'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(p_sort => 'runner', p_desc => false) $$,
  $$ values ('Ana'), ('Beto') $$,
  'sorts by last name, A to Z'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(p_sort => 'nonsense', p_desc => false) $$,
  $$ values ('Beto'), ('Ana') $$,
  'an unknown sort falls back to the payment date'
);

select * from finish();
rollback;
