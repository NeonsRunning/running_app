-- Admins seeing every payment: `admin_list_payments()` and `admin_payment_kpis()`.
begin;
create extension if not exists pgtap with schema extensions;
-- People, by the last digit of their id:
--   1  organizer Olga — owns "History Run 10K"
--   3  runner Ana   — paid by card yesterday, $35.68
--   4  runner Beto  — paid by ATH Móvil two days ago, $50
--   6  runner Cara  — started signing up, never paid
--   7  runner Dani  — added later: paid by card 40 days ago, $40, disputed
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
  ('00000000-0000-4000-8000-000000000006', 'cara@example.com'),
  ('00000000-0000-4000-8000-000000000007', 'dani@example.com');

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

select plan(24);

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

-- Dates ---------------------------------------------------------------------

select results_eq(
  $$ select first_name from public.admin_list_payments(
       p_from => (now() at time zone 'America/Puerto_Rico')::date - 1) $$,
  $$ values ('Ana') $$,
  'a range starting yesterday on the island leaves out older payments'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(
       p_to => (now() at time zone 'America/Puerto_Rico')::date - 2) $$,
  $$ values ('Beto') $$,
  'the last day of a range is included in full'
);

select throws_ok(
  $$ select * from public.admin_payment_matches(null, null, null, null) $$,
  '42501', null,
  'the shared filter is not callable from the API'
);

-- Figures -------------------------------------------------------------------

reset role;

update public.registrations set service_fee = 3, donation = 5
where id = '00000000-0000-4000-9000-0000000000b1';
update public.registrations set service_fee = 4, amount_refunded = 50, refunded_at = now()
where id = '00000000-0000-4000-9000-0000000000b2';

insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount, service_fee,
  payment_method, payment_intent_id, paid_at, disputed_at, dispute_status
) values (
  '00000000-0000-4000-9000-0000000000b4',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000007',
  'confirmed', 1003,
  'Dani', 'Soto', 'dani@example.com', '787-555-0107', '1988-08-08', 'x',
  'Eva Soto', '787-555-0196', 40, 2,
  'stripe', 'pi_test_dani', now() - interval '40 days', now(), 'needs_response'
);

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select * from public.admin_payment_kpis() $$,
  'P0001', 'notAllowed',
  'a runner cannot read the figures'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select (payments, gross, refunded, refunds) from public.admin_payment_kpis()),
  (3::bigint, 125.68::numeric, 50::numeric, 1::bigint),
  'count, gross and refunds cover every payment'
);

select is(
  (select net from public.admin_payment_kpis()),
  75.68::numeric,
  'net takes refunds off; an open dispute still counts'
);

select is(
  (select (disputes_open, disputes_open_count, disputes_lost) from public.admin_payment_kpis()),
  (40::numeric, 1::bigint, 0::numeric),
  'an open dispute is reported as open'
);

select is(
  (select (service_fees, donations) from public.admin_payment_kpis()),
  (5::numeric, 5::numeric),
  'fees and donations leave out a payment refunded in full'
);

select is(
  (select (card_gross, card_count, ath_gross, ath_count) from public.admin_payment_kpis()),
  (75.68::numeric, 2::bigint, 50::numeric, 1::bigint),
  'gross splits by method'
);

select is(
  (select (payments, gross) from public.admin_payment_kpis(
     p_method => 'stripe',
     p_from => (now() at time zone 'America/Puerto_Rico')::date - 7)),
  (1::bigint, 35.68::numeric),
  'the figures follow the method and the dates'
);

reset role;
update public.registrations set dispute_status = 'lost'
where id = '00000000-0000-4000-9000-0000000000b4';
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select (net, disputes_lost, disputes_open, service_fees) from public.admin_payment_kpis()),
  (35.68::numeric, 40::numeric, 0::numeric, 3::numeric),
  'a lost chargeback comes off net, and its fee with it'
);

select results_eq(
  $$ select first_name from public.admin_list_payments(p_query => 'dani') $$,
  $$ values ('Dani') $$,
  'the list still finds a payment lost to a chargeback'
);

select * from finish();
rollback;
