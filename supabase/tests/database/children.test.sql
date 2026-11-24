-- Children on an adult's sign-up: who may add them, what they cost, the
-- spots and bibs they take, and what the organizer can do with them.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, kept inline so the file runs on its own, by `supabase test db` or
-- pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns both races
--   3  runner Ana — signs up herself and two children
--   4  runner Beto — already paid for the 10K
--   5  admin Ada (in platform_admins) — reviews ATH Móvil payments
--   6  runner Carla — signs up only a child
--   7  runner Mia — 16 on race day
--
-- Races, both next month:
--   e1  "Family 10K" — takes children from age 5 at $10, charges sales tax,
--       offers a shirt. Distances: c1 10K ($30, 3 spots), c2 5K ($15, 2 spots)
--   e2  "Grown-ups 10K" — no children. Distance: c3 10K
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

grant usage on schema tests to anon, authenticated;
grant execute on function tests.act_as(uuid) to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'olga@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com'),
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com'),
  ('00000000-0000-4000-8000-000000000005', 'ada@example.com'),
  ('00000000-0000-4000-8000-000000000006', 'carla@example.com'),
  ('00000000-0000-4000-8000-000000000007', 'mia@example.com');

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000005');

insert into public.ath_movil_accounts (id, label, path, active) values
  ('00000000-0000-4000-9000-0000000000a1', 'NEONS RUNNING', '/NeonsRunningTest', true);

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city, ath_movil_account_id,
  minimum_age, allows_children, child_price, charges_sales_tax,
  offers_shirt, shirt_sizes, shirt_price
) values
  (
    '00000000-0000-4000-9000-0000000000e1',
    '00000000-0000-4000-8000-000000000001',
    'family-10k-test', 'published', now(), 'Family 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    '00000000-0000-4000-9000-0000000000a1',
    5, true, 10, true,
    true, '{M}', 22
  ),
  (
    '00000000-0000-4000-9000-0000000000e2',
    '00000000-0000-4000-8000-000000000001',
    'grown-ups-10k-test', 'published', now(), 'Grown-ups 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    null,
    14, false, 0, false,
    false, '{}', 0
  );

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1', '10K', 10, 30, 3, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e1', '5K', 5, 15, 2, '18:00'),
  ('00000000-0000-4000-9000-0000000000c3', '00000000-0000-4000-9000-0000000000e2', '10K', 10, 30, 10, '18:00');

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

-- What an adult types at sign-up.
create or replace function tests.adult(p_name text, p_birth date)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', p_name, 'last_name', 'Figueroa',
    'email', lower(p_name) || '@example.com',
    'phone', '787-555-0103', 'birth_date', p_birth, 'gender', 'f',
    'emergency_contact_name', 'Luis Figueroa', 'emergency_contact_phone', '787-555-0198',
    'wants_photos', false, 'donation', 0
  );
$$;

-- A child who turned `p_years` today, so is that age on race day.
create or replace function tests.kid(p_name text, p_years integer, p_category text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', p_name, 'last_name', 'Figueroa',
    'birth_date', (current_date - make_interval(years => p_years))::date,
    'gender', 'f',
    'category_id', '00000000-0000-4000-9000-0000000000' || p_category
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

create or replace function tests.spots(p_category text)
returns bigint
language sql
as $$
  select coalesce((
    select registered from public.registration_counts(array[
      '00000000-0000-4000-9000-0000000000e1'::uuid])
    where category_id = ('00000000-0000-4000-9000-0000000000' || p_category)::uuid
  ), 0);
$$;

grant execute on function tests.adult(text, date) to authenticated;
grant execute on function tests.kid(text, integer, text) to authenticated;
grant execute on function tests.save_with(uuid, jsonb) to authenticated;
grant execute on function tests.spots(text) to authenticated;
-- End of fixtures.

select plan(46);

-- What register_for_event() refuses -----------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c3',
       tests.adult('Ana', '1992-03-03')
         || jsonb_build_object('children', jsonb_build_array(tests.kid('Lia', 10, 'c3')))) $$,
  'P0001', 'childrenNotAllowed',
  'a race that does not take children refuses one'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Ana', '1992-03-03')
         || jsonb_build_object('children', jsonb_build_array(
              tests.kid('Lia', 10, 'c2'), tests.kid('Noa', 9, 'c2'),
              tests.kid('Eva', 8, 'c2'), tests.kid('Zoe', 7, 'c2')))) $$,
  'P0001', 'tooManyChildren',
  'four children are one too many'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Ana', '1992-03-03') || '{"racing": false}') $$,
  'P0001', 'childrenRequired',
  'an adult who is not racing brings at least one child'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Ana', '1992-03-03')
         || jsonb_build_object('children', jsonb_build_array(tests.kid('Lia', 18, 'c2')))) $$,
  'P0001', 'childAgeNotEligible',
  'someone 18 on race day is not a child'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Ana', '1992-03-03')
         || jsonb_build_object('children', jsonb_build_array(tests.kid('Lia', 3, 'c2')))) $$,
  'P0001', 'childAgeNotEligible',
  'nor is a child under the event''s minimum age let in'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Ana', '1992-03-03')
         || jsonb_build_object('children', jsonb_build_array(tests.kid('Lia', 10, 'c3')))) $$,
  'P0001', 'eventUnavailable',
  'a child runs a distance of the same race'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.adult('Ana', '1992-03-03')
         || jsonb_build_object('racing', false, 'shirts', '[{"size": "M"}]'::jsonb,
              'children', jsonb_build_array(tests.kid('Lia', 10, 'c2')))) $$,
  'P0001', 'extrasChanged',
  'an adult who is not racing buys no shirt'
);

select tests.act_as('00000000-0000-4000-8000-000000000007');

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.adult('Mia', (current_date - interval '16 years')::date)
         || jsonb_build_object('children', jsonb_build_array(tests.kid('Lia', 10, 'c2')))) $$,
  'P0001', 'guardianUnderage',
  'a 16-year-old does not sign children up'
);

-- An adult and two children ---------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');

-- $30 race and two children at $10. Taxable: 30 + 20 + 2 (service fee, once)
-- = 52; tax 5.98. Both children in the 5K, which has 2 spots.
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Ana', '1992-03-03')
         || jsonb_build_object('children', jsonb_build_array(
              tests.kid('Lia', 10, 'c2'), tests.kid('Noa', 8, 'c2')))) $$,
  'an adult signs up with two children'
);

reset role;

select is(
  (select array[service_fee, sales_tax, amount] from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  array[2.00, 5.98, 57.98]::numeric[],
  'each child adds the child price, taxed; the service fee is charged once'
);

select is(
  (select array_agg(c.price order by c.position) from public.registration_children c
   join public.registrations r on r.id = c.registration_id
   where r.runner_id = '00000000-0000-4000-8000-000000000003'),
  array[10, 10]::numeric[],
  'each child keeps the price charged'
);

-- Ana goes back and changes the order: Lia runs the 10K instead.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Ana', '1992-03-03')
         || jsonb_build_object('children', jsonb_build_array(
              tests.kid('Lia', 10, 'c1'), tests.kid('Noa', 8, 'c2')))) $$,
  'an unpaid order is sent again with other children'
);

select is(
  (select array_agg(first_name || ' ' || category_id::text order by position)
   from public.registration_children),
  array[
    'Lia 00000000-0000-4000-9000-0000000000c1',
    'Noa 00000000-0000-4000-9000-0000000000c2'
  ],
  'which replace the ones sent before, and the adult reads them'
);

select tests.act_as('00000000-0000-4000-8000-000000000004');
select is(
  (select count(*) from public.registration_children), 0::bigint,
  'another runner reads nobody''s children'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
select is(
  (select count(*) from public.registration_children), 0::bigint,
  'nor does the organizer, before the order is paid'
);

select is(tests.spots('c1'), 1::bigint, 'an unpaid order is not counted as registered');

reset role;

-- Paid by card: 57.98.
select lives_ok(
  $$ select public.confirm_registration_payment(
       (select id from public.registrations
        where runner_id = '00000000-0000-4000-8000-000000000003'),
       'pi_test_ana', 5798) $$,
  'the card payment for the whole order confirms it'
);

select is(
  (select bib from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'),
  1002,
  'the adult takes the next bib'
);

select is(
  (select array_agg(bib order by position) from public.registration_children),
  array[1003, 1004],
  'and the children the ones after it, in order'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select count(*) from public.registration_children), 2::bigint,
  'the organizer reads the children of a paid order'
);

select is(tests.spots('c1'), 3::bigint, 'a child takes a spot in their distance');
select is(tests.spots('c2'), 1::bigint, 'whichever distance that is');

-- Only a child --------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000006');

-- The 10K has 3 spots: Beto, Ana and Lia.
select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Carla', '1985-07-07')
         || jsonb_build_object('racing', false,
              'children', jsonb_build_array(tests.kid('Sol', 12, 'c1')))) $$,
  'P0001', 'soldOut',
  'a child does not fit in a full distance'
);

-- Taxable: 10 + 2 = 12; tax 1.38.
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.adult('Carla', '1985-07-07')
         || jsonb_build_object('racing', false,
              'children', jsonb_build_array(tests.kid('Sol', 12, 'c2')))) $$,
  'an adult signs up only a child'
);

reset role;

select is(
  (select array[racing::text, coalesce(category_id::text, 'none'), amount::text]
   from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000006'),
  array['false', 'none', '13.38'],
  'the adult has no distance and pays the child price, the fee and the tax'
);

-- Paid by ATH Móvil, approved by an admin: the account is the platform's.
select tests.act_as('00000000-0000-4000-8000-000000000006');
set local role authenticated;

select lives_ok(
  $$ select public.submit_ath_movil_payment(
       (select id from public.registrations
        where runner_id = '00000000-0000-4000-8000-000000000006'),
       'CARLA-1') $$,
  'the adult sends an ATH Móvil reference for the order'
);

select tests.act_as('00000000-0000-4000-8000-000000000005');

select lives_ok(
  $$ select public.review_ath_movil_payment(
       (select id from public.registrations
        where runner_id = '00000000-0000-4000-8000-000000000006'),
       true) $$,
  'and an admin approves it'
);

reset role;

select is(
  (select array[r.status::text, coalesce(r.bib::text, 'none'), c.bib::text]
   from public.registrations r
   join public.registration_children c on c.registration_id = r.id
   where r.runner_id = '00000000-0000-4000-8000-000000000006'),
  array['confirmed', 'none', '1005'],
  'the child gets the bib; the adult, who is not racing, gets none'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

-- Beto, Ana, Lia, Noa and Sol; not Carla.
select is(
  (select registered from public.event_signup_totals(array[
     '00000000-0000-4000-9000-0000000000e1'::uuid])),
  5::bigint,
  'the organizer''s count is of those running'
);

-- Check-in --------------------------------------------------------------------

select throws_ok(
  $$ select public.set_checked_in(
       (select id from public.registrations
        where runner_id = '00000000-0000-4000-8000-000000000006'),
       true) $$,
  'P0001', 'registrationMissing',
  'an adult who is not racing is not checked in'
);

select lives_ok(
  $$ select public.set_child_checked_in(
       (select id from public.registration_children where first_name = 'Sol'), true) $$,
  'the organizer checks a child in'
);

select isnt(
  (select checked_in_at from public.registration_children where first_name = 'Sol'),
  null,
  'which is recorded on the child'
);

select tests.act_as('00000000-0000-4000-8000-000000000004');

select throws_ok(
  $$ select public.set_child_checked_in(
       (select id from public.registration_children where first_name = 'Sol'), true) $$,
  'P0001', 'registrationMissing',
  'a runner cannot check in a child they cannot even read'
);

-- Taking a child off an order -------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.remove_registration_child(
       (select id from public.registration_children where first_name = 'Sol')) $$,
  'P0001', 'lastChild',
  'the only child of an adult who is not racing goes with the whole order'
);

select lives_ok(
  $$ select public.remove_registration_child(
       (select id from public.registration_children where first_name = 'Lia')) $$,
  'the organizer takes one child off a paid order'
);

select is(tests.spots('c1'), 2::bigint, 'which opens the spot');

select throws_ok(
  $$ select public.remove_registration_child(
       (select id from public.registration_children where first_name = 'Lia')) $$,
  'P0001', 'registrationMissing',
  'a child is taken off once'
);

-- Back to pending, and paid again ---------------------------------------------

select lives_ok(
  $$ select public.return_registration_to_pending(
       (select id from public.registrations
        where runner_id = '00000000-0000-4000-8000-000000000006')) $$,
  'an ATH Móvil order is returned to pending'
);

reset role;

select is(
  (select array[coalesce(bib::text, 'none'), coalesce(checked_in_at::text, 'none')]
   from public.registration_children where first_name = 'Sol'),
  array['none', 'none'],
  'and the child loses the bib and the check-in'
);

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select public.review_ath_movil_payment(
  (select id from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000006'),
  true);

select tests.act_as('00000000-0000-4000-8000-000000000001');

-- The whole order goes: Ana, and Noa with her (Lia was already off it).
select lives_ok(
  $$ select public.remove_registration(
       (select id from public.registrations
        where runner_id = '00000000-0000-4000-8000-000000000003')) $$,
  'the organizer removes an adult with children'
);

select is(
  array[tests.spots('c1'), tests.spots('c2')],
  array[1, 1]::bigint[],
  'and the children''s spots open with the adult''s'
);

-- Medals -------------------------------------------------------------------------

-- Race day has come, on a race that hands out medals and takes no results.
reset role;
update public.events set
  event_date = current_date - 1, registration_closes = current_date - 2,
  mails_medals = true
where id = '00000000-0000-4000-9000-0000000000e1';
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.mark_medal_picked_up('00000000-0000-4000-9000-0000000000b1') $$,
  'a runner''s medal is handed over on race day'
);

select throws_ok(
  $$ select public.mark_medal_picked_up(
       (select id from public.registrations
        where runner_id = '00000000-0000-4000-8000-000000000006')) $$,
  'P0001', 'notFinished',
  'an adult who signed up only children earned none'
);

-- The organizer's switch --------------------------------------------------------

select throws_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e2',
       '{"allows_children": true, "minimum_age": 18}') $$,
  'P0001', 'childrenAgeInvalid',
  'a race for adults only cannot take children'
);

select lives_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e2',
       '{"allows_children": true, "child_price": 12.5, "minimum_age": 8}') $$,
  'a race that lets in under-18s can'
);

reset role;

select is(
  (select array[allows_children::text, child_price::text] from public.events
   where id = '00000000-0000-4000-9000-0000000000e2'),
  array['true', '12.50'],
  'save_event() keeps the switch and the price'
);

select * from finish();
rollback;
