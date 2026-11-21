-- Children's medals by mail: what the mail costs with children on the order,
-- an adult who is not racing choosing it, and when the children's medals
-- leave in the order's one shipment.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, kept inline so the file runs on its own, by `supabase test db` or
-- pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns the three races
--   3  runner Ana — runs e1 with two children
--   4  runner Beto — runs e2 with a child
--   6  runner Carla — signs up only children on e1
--   7  runner Dan — runs e3 with a child, and finishes early
--   8  runner Eva — runs e3 with a child, and never sends a result
--
-- Races, all a month out, all taking children at $10 and mailing at $12:
--   e1  "Family Medal 10K" — mails medals, $6 per child's medal, charges
--       sales tax, takes no results. Distances: c1 10K ($30), c2 5K ($15)
--   e2  "Kit Only 10K" — offers the mail, does not mail medals. c3 10K ($30)
--   e3  "Evidence 10K" — mails medals, $6 per child's medal, takes finish
--       evidence. c4 10K ($30)
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
  ('00000000-0000-4000-8000-000000000006', 'carla@example.com'),
  ('00000000-0000-4000-8000-000000000007', 'dan@example.com'),
  ('00000000-0000-4000-8000-000000000008', 'eva@example.com');

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city,
  minimum_age, allows_children, child_price, charges_sales_tax,
  offers_mail, shipping_price, mails_medals, child_shipping_price, accepts_results
) values
  (
    '00000000-0000-4000-9000-0000000000e1',
    '00000000-0000-4000-8000-000000000001',
    'family-medal-10k-test', 'published', now(), 'Family Medal 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    5, true, 10, true,
    true, 12, true, 6, false
  ),
  (
    '00000000-0000-4000-9000-0000000000e2',
    '00000000-0000-4000-8000-000000000001',
    'kit-only-10k-test', 'published', now(), 'Kit Only 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    5, true, 10, false,
    true, 12, false, 6, false
  ),
  (
    '00000000-0000-4000-9000-0000000000e3',
    '00000000-0000-4000-8000-000000000001',
    'evidence-10k-test', 'published', now(), 'Evidence 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    5, true, 10, false,
    true, 12, true, 6, true
  );

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1', '10K', 10, 30, 50, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e1', '5K', 5, 15, 50, '18:00'),
  ('00000000-0000-4000-9000-0000000000c3', '00000000-0000-4000-9000-0000000000e2', '10K', 10, 30, 50, '18:00'),
  ('00000000-0000-4000-9000-0000000000c4', '00000000-0000-4000-9000-0000000000e3', '10K', 10, 30, 50, '18:00');

-- What an adult types at sign-up, with the mail and an address.
create or replace function tests.adult(p_name text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', p_name, 'last_name', 'Figueroa',
    'email', lower(p_name) || '@example.com',
    'phone', '787-555-0103', 'birth_date', '1992-03-03', 'gender', 'f',
    'emergency_contact_name', 'Luis Figueroa', 'emergency_contact_phone', '787-555-0198',
    'wants_photos', false, 'donation', 0,
    'ships_by_mail', true, 'mailing_address', '1 Calle Sol, San Juan, PR 00901'
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

-- The live sign-up of a runner (the last digit of their id) on a race.
create or replace function tests.reg(p_runner text, p_event text)
returns uuid
language sql
security definer
as $$
  select id from public.registrations
  where runner_id = ('00000000-0000-4000-8000-00000000000' || p_runner)::uuid
    and event_id = ('00000000-0000-4000-9000-0000000000' || p_event)::uuid
    and status <> 'cancelled';
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

grant execute on function tests.adult(text) to authenticated;
grant execute on function tests.kid(text, integer, text) to authenticated;
grant execute on function tests.reg(text, text) to authenticated;
grant execute on function tests.save_with(uuid, jsonb) to authenticated;
-- End of fixtures.

select plan(39);

-- An adult who is not racing, and the mail --------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000006');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c3',
       tests.adult('Carla')
         || jsonb_build_object('racing', false,
              'children', jsonb_build_array(tests.kid('Sol', 12, 'c3')))) $$,
  'P0001', 'extrasChanged',
  'on a race that mails no medals, an adult who is not racing has nothing to mail'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.adult('Carla')
         || jsonb_build_object('racing', false, 'mailing_address', '',
              'children', jsonb_build_array(tests.kid('Sol', 12, 'c2')))) $$,
  'P0001', 'mailingAddressInvalid',
  'the children''s medals need an address too'
);

-- One child at $10, the $2 fee, and the event's $12 shipping for the first
-- child: 24, tax 2.76.
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.adult('Carla')
         || jsonb_build_object('racing', false,
              'children', jsonb_build_array(tests.kid('Sol', 12, 'c2')))) $$,
  'an adult who is not racing has a child''s medal mailed'
);

reset role;

select is(
  (select array[service_fee, sales_tax, amount] from public.registrations
   where id = tests.reg('6', 'e1')),
  array[2.00, 2.76, 26.76]::numeric[],
  'the first child is covered by the event''s shipping price'
);

select is(
  (select array_agg(shipping_price order by position) from public.registration_children
   where registration_id = tests.reg('6', 'e1')),
  array[12.00]::numeric[],
  'which that child carries'
);

-- Sent again before paying, now racing: the kit pays the $12 and the child
-- $6. 30 + 10 + 2 + 12 + 6 = 60, tax 6.90.
select tests.act_as('00000000-0000-4000-8000-000000000006');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Carla')
         || jsonb_build_object(
              'children', jsonb_build_array(tests.kid('Sol', 12, 'c2')))) $$,
  'an unpaid order is sent again with the adult racing'
);

reset role;

select is(
  (select array[r.amount, c.shipping_price]
   from public.registrations r
   join public.registration_children c on c.registration_id = r.id
   where r.id = tests.reg('6', 'e1') and r.ships_by_mail),
  array[66.90, 6.00]::numeric[],
  'and is priced again: the child''s medal rides in the adult''s shipment'
);

-- And once more, with only children: three of them. 30 + 2 + 12 + 6 + 6 = 56,
-- tax 6.44.
select tests.act_as('00000000-0000-4000-8000-000000000006');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.adult('Carla')
         || jsonb_build_object('racing', false,
              'children', jsonb_build_array(
                tests.kid('Sol', 12, 'c2'), tests.kid('Noa', 9, 'c2'),
                tests.kid('Eva', 7, 'c1')))) $$,
  'an adult who is not racing has three children''s medals mailed'
);

reset role;

select is(
  (select array[sales_tax, amount] from public.registrations
   where id = tests.reg('6', 'e1')),
  array[6.44, 62.44]::numeric[],
  'the second and third child pay the price per child'
);

select is(
  (select array_agg(shipping_price order by position) from public.registration_children
   where registration_id = tests.reg('6', 'e1')),
  array[12.00, 6.00, 6.00]::numeric[],
  'each child keeps what its medal cost to mail'
);

select is(
  (select array[ships_by_mail::text, medal_by_mail::text, mailing_address]
   from public.registrations where id = tests.reg('6', 'e1')),
  array['false', 'false', '1 Calle Sol, San Juan, PR 00901'],
  'the order has an address, and no kit or medal of the adult''s to mail'
);

-- An adult who runs --------------------------------------------------------------

-- $30 race, two children at $10, the fee, $12 shipping and $6 per child:
-- 30 + 20 + 2 + 12 + 12 = 76, tax 8.74.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.adult('Ana')
         || jsonb_build_object('children', jsonb_build_array(
              tests.kid('Lia', 10, 'c2'), tests.kid('Max', 8, 'c2')))) $$,
  'an adult who runs adds the mail with two children'
);

reset role;

select is(
  (select array[service_fee, sales_tax, amount] from public.registrations
   where id = tests.reg('3', 'e1')),
  array[2.00, 8.74, 84.74]::numeric[],
  'each child adds the shipping price per child, taxed'
);

select is(
  (select array_agg(medal_by_mail::text || ' ' || shipping_price order by position)
   from public.registration_children where registration_id = tests.reg('3', 'e1')),
  array['true 6.00', 'true 6.00'],
  'and has their medal in the mail'
);

-- On a race that mails kits and not medals: 30 + 10 + 2 + 12 = 54, no tax.
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c3',
       tests.adult('Beto')
         || jsonb_build_object('children', jsonb_build_array(tests.kid('Teo', 10, 'c3')))) $$,
  'an adult who runs adds the mail on a race that mails no medals'
);

reset role;

select is(
  (select array[r.amount, c.shipping_price]
   from public.registrations r
   join public.registration_children c on c.registration_id = r.id
   where r.id = tests.reg('4', 'e2') and not c.medal_by_mail),
  array[54.00, 0.00]::numeric[],
  'where a child adds nothing to the shipping, and has no medal in it'
);

-- Two more, on the race that takes results: 30 + 10 + 2 + 12 + 6 = 60 each.
select tests.act_as('00000000-0000-4000-8000-000000000007');
set local role authenticated;
select public.register_for_event(
  '00000000-0000-4000-9000-0000000000c4',
  tests.adult('Dan') || jsonb_build_object('children', jsonb_build_array(tests.kid('Ian', 10, 'c4'))));

select tests.act_as('00000000-0000-4000-8000-000000000008');
select public.register_for_event(
  '00000000-0000-4000-9000-0000000000c4',
  tests.adult('Eva') || jsonb_build_object('children', jsonb_build_array(tests.kid('Ivy', 10, 'c4'))));

reset role;

-- Everyone pays by card.
select lives_ok(
  $$ select public.confirm_registration_payment(tests.reg('6', 'e1'), 'pi_test_carla', 6244);
     select public.confirm_registration_payment(tests.reg('3', 'e1'), 'pi_test_ana', 8474);
     select public.confirm_registration_payment(tests.reg('4', 'e2'), 'pi_test_beto', 5400);
     select public.confirm_registration_payment(tests.reg('7', 'e3'), 'pi_test_dan', 6000);
     select public.confirm_registration_payment(tests.reg('8', 'e3'), 'pi_test_eva', 6000); $$,
  'the amounts charged confirm the orders'
);

-- The shipment, before the race is over -------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000006');
set local role authenticated;

select throws_ok(
  $$ select public.set_medal_delivery(tests.reg('6', 'e1'), true,
       '1 Calle Sol, San Juan, PR 00901') $$,
  'P0001', 'mailNotIncluded',
  'an adult who is not racing has no medal of their own to mail'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.mark_shipment_shipped(tests.reg('6', 'e1')) $$,
  'P0001', 'notFinished',
  'children''s medals wait for the race to be over'
);

select throws_ok(
  $$ select public.mark_shipment_shipped(tests.reg('3', 'e1')) $$,
  'P0001', 'notFinished',
  'and so does the kit they will ride with'
);

select throws_ok(
  $$ select public.mark_shipment_shipped(tests.reg('8', 'e3')) $$,
  'P0001', 'notFinished',
  'as it waits for the adult''s medal'
);

reset role;

-- Dan's finish is accepted, three weeks before the last day.
insert into public.race_results (
  registration_id, event_id, category_id, runner_id, finish_seconds, evidence_path, status
) values (
  tests.reg('7', 'e3'),
  '00000000-0000-4000-9000-0000000000e3',
  '00000000-0000-4000-9000-0000000000c4',
  '00000000-0000-4000-8000-000000000007',
  3300,
  '00000000-0000-4000-8000-000000000007/00000000-0000-4000-9000-0000000000f1.webp',
  'accepted'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.mark_shipment_shipped(tests.reg('7', 'e3'), 'PR-DAN-1') $$,
  'a shipment goes once the adult has earned their medal'
);

select is(
  (select array[r.shipped_at is not null, r.medal_shipped_at is not null,
                c.medal_shipped_at is not null]
   from public.registrations r
   join public.registration_children c on c.registration_id = r.id
   where r.id = tests.reg('7', 'e3')),
  array[true, true, true],
  'with the kit, the adult''s medal and the child''s'
);

reset role;

-- The shipment, after the last day -------------------------------------------------

update public.events
set event_date = current_date - 3, registration_closes = current_date - 4
where id in ('00000000-0000-4000-9000-0000000000e1', '00000000-0000-4000-9000-0000000000e3');

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

-- Noa is taken off Carla's order before it is mailed.
select lives_ok(
  $$ select public.remove_registration_child(
       (select id from public.registration_children
        where registration_id = tests.reg('6', 'e1') and first_name = 'Noa')) $$,
  'the organizer takes a child off an order that mails medals'
);

select lives_ok(
  $$ select public.mark_shipment_shipped(tests.reg('6', 'e1')) $$,
  'an order of only children ships once the race is over'
);

select is(
  (select array_agg((medal_shipped_at is not null) order by position)
   from public.registration_children where registration_id = tests.reg('6', 'e1')),
  array[true, false, true],
  'with the medals of the children still on it'
);

select is(
  (select array[shipped_at is not null, medal_shipped_at is not null, ships_by_mail]
   from public.registrations where id = tests.reg('6', 'e1')),
  array[true, false, false],
  'the order is marked as shipped, with no kit or medal of the adult''s'
);

select lives_ok(
  $$ select public.mark_shipment_shipped(tests.reg('6', 'e1'), 'PR-CARLA-1') $$,
  'marking it again'
);

select is(
  (select shipping_tracking from public.registrations where id = tests.reg('6', 'e1')),
  'PR-CARLA-1',
  'only writes the tracking number'
);

-- Eva never sent a result: her kit stops waiting, and her child's medal goes
-- with it.
select lives_ok(
  $$ select public.mark_shipment_shipped(tests.reg('8', 'e3')) $$,
  'a kit goes after the last day without the adult''s medal'
);

select is(
  (select array[r.shipped_at is not null, r.medal_shipped_at is not null,
                c.medal_shipped_at is not null]
   from public.registrations r
   join public.registration_children c on c.registration_id = r.id
   where r.id = tests.reg('8', 'e3')),
  array[true, false, true],
  'and carries the child''s'
);

reset role;

-- The race stops mailing medals: Ana's own is no longer in the shipment.
update public.events set mails_medals = false
where id = '00000000-0000-4000-9000-0000000000e1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.mark_shipment_shipped(tests.reg('3', 'e1')) $$,
  'a shipment goes on a race that stopped mailing medals'
);

select is(
  (select r.medal_shipped_at is null
     and (select bool_and(c.medal_shipped_at is not null)
          from public.registration_children c where c.registration_id = r.id)
   from public.registrations r where r.id = tests.reg('3', 'e1')),
  true,
  'with the children''s medals, which were paid for'
);

-- The organizer's settings -----------------------------------------------------------

select lives_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e2',
       '{"mails_medals": true}') $$,
  'medals by mail are switched on after sign-ups'
);

select is(
  (select array[r.medal_by_mail, c.medal_by_mail]
   from public.registrations r
   join public.registration_children c on c.registration_id = r.id
   where r.id = tests.reg('4', 'e2')),
  array[true, false],
  'the runner who paid for the mail gets theirs in it; the child, who was charged nothing, does not'
);

select is(
  (select child_shipping_price from tests.save_with(
     '00000000-0000-4000-9000-0000000000e2', '{"child_shipping_price": 4.5}')),
  4.50,
  'the organizer sets the shipping price per child'
);

select is(
  (select child_shipping_price from tests.save_with(
     '00000000-0000-4000-9000-0000000000e2', '{"child_shipping_price": null}')),
  6.00,
  'which is $6 when none is given'
);

select throws_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e2',
       '{"child_shipping_price": 1000.01}') $$,
  '23514', null,
  'and at most $1000'
);

select ok(
  (select count(*) = 3 from public.registration_children
   where registration_id = tests.reg('6', 'e1')
     and medal_by_mail and shipping_price > 0),
  'the organizer reads what is mailed for each child'
);

reset role;

select * from finish();
rollback;
