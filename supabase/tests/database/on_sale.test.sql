-- On-sale price: what save_event() accepts, what register_for_event() charges
-- while a sale runs and outside it, and what search_events() filters by.
--
-- The sale is priced twice, like the rest of a sign-up: here, by
-- active_sale_percent() and sale_price(), and in lib/events/pricing.ts for
-- what the pages show. This file and lib/events/pricing.test.ts price the
-- same sign-up on sale and expect the same $64.90.
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

-- A child who turned `p_years` today, so is that age on race day.
create or replace function tests.kid(p_name text, p_years integer)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', p_name, 'last_name', 'Figueroa',
    'birth_date', (current_date - make_interval(years => p_years))::date,
    'gender', 'f',
    'category_id', '00000000-0000-4000-9000-0000000000c1'
  );
$$;

-- Save an event as it stands, with `p_patch` laid over its columns.
create or replace function tests.save_with(p_id uuid, p_patch jsonb)
returns public.events
language sql
as $$
  select public.save_event(
    e.id, e.slug, to_jsonb(e) || p_patch,
    (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
  from public.events e where e.id = p_id;
$$;

-- Ana signs up with a shirt and one child.
create or replace function tests.ana_signs_up()
returns public.registrations
language sql
as $$
  select public.register_for_event(
    '00000000-0000-4000-9000-0000000000c1',
    tests.ana_details() || jsonb_build_object(
      'shirt_size', 'M',
      'children', jsonb_build_array(tests.kid('Lia', 10))
    )
  );
$$;

grant execute on function tests.kid(text, integer) to authenticated;
grant execute on function tests.save_with(uuid, jsonb) to authenticated;
grant execute on function tests.ana_signs_up() to authenticated;

-- A $30 race with room, a $22 shirt, children at $10.25 and sales tax.
update public.event_categories set capacity = 50
where id = '00000000-0000-4000-9000-0000000000c1';

update public.events set
  offers_shirt = true, shirt_sizes = '{M}', shirt_price = 22,
  allows_children = true, child_price = 10.25, minimum_age = 5,
  charges_sales_tax = true
where id = '00000000-0000-4000-9000-0000000000e1';
-- End of fixtures.

select plan(22);

-- The two rules ---------------------------------------------------------------

select is(
  public.active_sale_percent(false, 15, null, null, current_date), 0,
  'a sale that is switched off takes nothing off'
);
select is(
  public.active_sale_percent(true, 15, null, null, current_date), 15,
  'without dates it runs for as long as it is switched on'
);
select is(
  public.active_sale_percent(true, 15, current_date + 1, null, current_date), 0,
  'it has not started before its first day'
);
select is(
  public.active_sale_percent(true, 15, current_date, current_date, current_date), 15,
  'its first and last day are both part of it'
);
select is(
  public.active_sale_percent(true, 15, null, current_date - 1, current_date), 0,
  'and it is over the day after its last'
);
select is(
  public.sale_price(10.25, 10), 9.23::numeric,
  'a half cent rounds up (salePrice() in lib/events/pricing.ts)'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.sale_price(numeric, integer)', 'EXECUTE')
  and not has_function_privilege(
    'anon', 'public.active_sale_percent(boolean, integer, date, date, date)', 'EXECUTE'),
  'neither rule can be called through the API'
);

-- save_event() ----------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1', '{"on_sale": true, "sale_percent": 15}') $$,
  'P0001', 'eventNotFound',
  'a runner cannot put someone''s event on sale'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1', '{"on_sale": true, "sale_percent": 95}') $$,
  'P0001', 'salePercentInvalid',
  'more than 90% off is refused'
);

select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1', '{"on_sale": true, "sale_percent": 4}') $$,
  'P0001', 'salePercentInvalid',
  'and so is less than 5%'
);

select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1',
       jsonb_build_object(
         'on_sale', true, 'sale_percent', 15,
         'sale_starts', current_date + 3, 'sale_ends', current_date + 2)) $$,
  'P0001', 'saleEndsBeforeStart',
  'a sale cannot end before it starts'
);

select lives_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1',
       jsonb_build_object(
         'on_sale', true, 'sale_percent', 40,
         'sale_starts', current_date + 2, 'sale_ends', current_date + 3)) $$,
  'the organizer schedules a sale'
);

-- An admin has the same say over it.
select tests.act_as('00000000-0000-4000-8000-000000000005');

select lives_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1',
       '{"on_sale": true, "sale_percent": 15, "sale_starts": null, "sale_ends": null}') $$,
  'an admin puts the event on sale, with no dates'
);

reset role;

select is(
  (select row(on_sale, sale_percent, sale_starts, sale_ends)::text
   from public.events where id = '00000000-0000-4000-9000-0000000000e1'),
  '(t,15,,)',
  'the sale is stored as last saved'
);

-- register_for_event() --------------------------------------------------------

-- 15% off the $30 race is 25.50 and off the $10.25 child 8.71; the $22 shirt
-- and the $2 fee are not discounted. Taxable: 58.21; tax 6.69.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;
select tests.ana_signs_up();
reset role;

select is(
  (select amount from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  64.90::numeric,
  'on sale, the amount charged matches registrationTotal() for the same sign-up'
);

select is(
  (select sales_tax from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  6.69::numeric,
  'sales tax is charged on the discounted amount'
);

select is(
  (select sale_percent from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  15,
  'the order records the sale it was priced with'
);

select is(
  (select c.price from public.registration_children c
   join public.registrations r on r.id = c.registration_id
   where r.runner_id = '00000000-0000-4000-8000-000000000003'),
  8.71::numeric,
  'and each child what that child cost'
);

-- search_events() -------------------------------------------------------------

select ok(
  '00000000-0000-4000-9000-0000000000e1'::uuid in (
    select id from public.search_events(current_date, p_max_price => 26)),
  'the price filter goes by the sale price, 25.50'
);

-- The sale is moved to start in two days: nothing is on sale yet.
update public.events set sale_starts = current_date + 2
where id = '00000000-0000-4000-9000-0000000000e1';

select ok(
  '00000000-0000-4000-9000-0000000000e1'::uuid not in (
    select id from public.search_events(current_date, p_max_price => 26)),
  'and by the usual price, 30, before the sale starts'
);

-- Held again before the sale starts, the same sign-up is priced in full:
-- 30 + 10.25 + 22 + 2 = 64.25, and 7.39 of tax.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;
select tests.ana_signs_up();
reset role;

select is(
  (select amount from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  71.64::numeric,
  'a sign-up held again outside the sale is priced in full'
);

select is(
  (select sale_percent from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  0,
  'and records no sale'
);

select * from finish();
rollback;
