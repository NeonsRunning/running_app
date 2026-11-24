-- Shirts on a sign-up: several per order, each mailed for the event's
-- shipping price per shirt. What register_for_event() takes and charges, what
-- it keeps in registration_shirts, who reads those, and how the order's
-- shipment carries them.
--
-- The price is computed twice: here, and in lib/events/pricing.ts for what
-- the form shows. This file and lib/events/pricing.test.ts price the same
-- two-shirt sign-up and expect the same $98.12.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, kept inline so the file runs on its own, by `supabase test db` or
-- pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns both races
--   2  organizer Omar — owns nothing here
--   3  runner Ana
--   4  runner Beto
--
-- Races, both next month, both with a $22 shirt in M and L:
--   e1  "Shirts 10K" — published. Designs: d1 "Black tee" and d2 "Blue tee"
--       on offer, d3 "Old tee" withdrawn. Distance: c1 10K ($30)
--   e2  "Plain 10K" — published, no designs. Distance: c2 10K ($30)
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
  ('00000000-0000-4000-8000-000000000002', 'omar@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com'),
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com');

update public.profiles set account_type = 'organizer'
where id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002'
);

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city,
  minimum_age, offers_shirt, shirt_sizes, shirt_price
) values
  (
    '00000000-0000-4000-9000-0000000000e1',
    '00000000-0000-4000-8000-000000000001',
    'shirts-10k-test', 'published', now(), 'Shirts 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    14, true, '{M,L}', 22
  ),
  (
    '00000000-0000-4000-9000-0000000000e2',
    '00000000-0000-4000-8000-000000000001',
    'plain-10k-test', 'published', now(), 'Plain 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    14, true, '{M,L}', 22
  );

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1', '10K', 10, 30, 50, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e2', '10K', 10, 30, 50, '18:00');

-- Pictures in Olga's own folder, as the wizard uploads them.
insert into public.event_shirts (id, event_id, name, image_path, offered, position) values
  ('00000000-0000-4000-9000-0000000000d1', '00000000-0000-4000-9000-0000000000e1', 'Black tee',
   '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000001.webp', true, 0),
  ('00000000-0000-4000-9000-0000000000d2', '00000000-0000-4000-9000-0000000000e1', 'Blue tee',
   '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000002.webp', true, 1),
  ('00000000-0000-4000-9000-0000000000d3', '00000000-0000-4000-9000-0000000000e1', 'Old tee',
   '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000003.webp', false, 2);

-- What a runner types at sign-up, with `p_extra` laid over it. The address is
-- for the shirts, which are mailed; a sign-up without any drops it.
create or replace function tests.runner(p_name text, p_extra jsonb default '{}')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', p_name, 'last_name', 'Figueroa',
    'email', lower(p_name) || '@example.com',
    'phone', '787-555-0103', 'birth_date', '1992-03-03', 'gender', 'f',
    'emergency_contact_name', 'Luis Figueroa', 'emergency_contact_phone', '787-555-0198',
    'wants_photos', false, 'donation', 0,
    'mailing_address', '123 Calle Luna, San Juan, PR 00901'
  ) || p_extra;
$$;

-- An event's stored designs as save_event() takes them, in order.
create or replace function tests.designs(p_event uuid)
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id, 'name', s.name, 'image_path', s.image_path, 'offered', s.offered)
    order by s.position), '[]'::jsonb)
  from public.event_shirts s where s.event_id = p_event;
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

grant execute on function tests.runner(text, jsonb) to authenticated;
grant execute on function tests.designs(uuid) to authenticated;
grant execute on function tests.save_with(uuid, jsonb) to authenticated;

-- A sign-up's id, by the last digit of the runner's id and the event's name.
create or replace function tests.reg(p_runner text, p_event text)
returns uuid
language sql
as $$
  select id from public.registrations
  where runner_id = ('00000000-0000-4000-8000-00000000000' || p_runner)::uuid
    and event_id = ('00000000-0000-4000-9000-0000000000' || p_event)::uuid
    and status <> 'cancelled';
$$;

grant execute on function tests.reg(text, text) to authenticated;

-- The plain race charges sales tax, so the shipping is seen to be taxed.
update public.events set charges_sales_tax = true
where id = '00000000-0000-4000-9000-0000000000e2';
-- End of fixtures.

select plan(28);

-- The price per shirt ----------------------------------------------------------

select is(
  (select shirt_shipping_price from public.events
   where id = '00000000-0000-4000-9000-0000000000e2'),
  6.00::numeric,
  'an event mails each shirt for $6 unless its organizer says otherwise'
);

-- What register_for_event() refuses --------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.runner('Ana', '{"shirts": [{"size": "M"}], "mailing_address": ""}')) $$,
  'P0001', 'mailingAddressInvalid',
  'shirts are mailed, so an order with one needs an address'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.runner('Ana', '{"shirts": [{"size": "XS"}]}')) $$,
  'P0001', 'shirtSizeUnavailable',
  'each shirt comes in a size the race offers'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.runner('Ana', '{"shirts": [{"size": "M"}, {"design_id": ""}]}')) $$,
  'P0001', 'shirtSizeUnavailable',
  'and none goes without one'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.runner('Ana', jsonb_build_object('shirts', (
         select jsonb_agg(jsonb_build_object('size', 'M')) from generate_series(1, 7))))) $$,
  'P0001', 'tooManyShirts',
  'seven shirts are one too many'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.runner('Ana', '{"shirts": [
         {"size": "M", "design_id": "00000000-0000-4000-9000-0000000000d1"},
         {"size": "L"}]}')) $$,
  'P0001', 'shirtDesignUnavailable',
  'on a race that shows its designs, every shirt needs one picked'
);

-- Two shirts -------------------------------------------------------------------

-- A $30 race, two $22 shirts and $6 to mail each, and the $2 fee. Taxable:
-- 30 + 2 × 22 + 2 × 6 + 2 = 88; tax 10.12.
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.runner('Ana', '{"shirts": [{"size": "M"}, {"size": "L"}]}')) $$,
  'a runner buys more than one shirt'
);

reset role;

select is(
  (select sales_tax from public.registrations where id = tests.reg('3', 'e2')),
  10.12::numeric,
  'each shirt''s shipping is taxed with the rest'
);

select is(
  (select amount from public.registrations where id = tests.reg('3', 'e2')),
  98.12::numeric,
  'the amount charged matches registrationTotal() for the same sign-up'
);

select results_eq(
  $$ select position::integer, size::text, design_id, price, shipping_price
     from public.registration_shirts
     where registration_id = tests.reg('3', 'e2') order by position $$,
  $$ values (1, 'M', null::uuid, 22.00::numeric, 6.00::numeric),
            (2, 'L', null::uuid, 22.00::numeric, 6.00::numeric) $$,
  'each shirt is kept with its size, what it cost and what its shipping did'
);

select is(
  (select row(shirts_by_mail, ships_by_mail, mailing_address)::text
   from public.registrations where id = tests.reg('3', 'e2')),
  '(t,f,"123 Calle Luna, San Juan, PR 00901")',
  'the shirts go by mail, to the order''s address, without the mail extra'
);

-- The same shirt twice is two shirts.
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.runner('Beto', '{"shirts": [
         {"size": "M", "design_id": "00000000-0000-4000-9000-0000000000d1"},
         {"size": "M", "design_id": "00000000-0000-4000-9000-0000000000d1"}]}')) $$,
  'the same shirt may be on an order twice'
);

-- Who reads them ---------------------------------------------------------------

select is(
  (select count(*) from public.registration_shirts),
  2::bigint,
  'a runner reads the shirts on their own sign-up, and nobody else''s'
);

reset role;

set local role anon;
select throws_ok(
  $$ select count(*) from public.registration_shirts $$,
  '42501', null,
  'a visitor reads none'
);
reset role;

-- An organizer sees a sign-up once it is paid, and its shirts with it.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  (select count(*) from public.registration_shirts),
  0::bigint,
  'the organizer does not see the shirts of a sign-up still unpaid'
);
reset role;

-- Going back -------------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

-- One shirt now: 30 + 22 + 6 + 2 = 60; tax 6.90.
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.runner('Ana', '{"shirts": [{"size": "L"}]}')) $$,
  'a held sign-up can change its shirts'
);

reset role;

select results_eq(
  $$ select position::integer, size::text from public.registration_shirts
     where registration_id = tests.reg('3', 'e2') order by position $$,
  $$ values (1, 'L') $$,
  'the shirts are whichever the last call named'
);

select is(
  (select amount from public.registrations where id = tests.reg('3', 'e2')),
  66.90::numeric,
  'and the order is priced again'
);

-- None at all: 30 + 2 = 32; tax 3.68.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2', tests.runner('Ana')) $$,
  'or drop them'
);
reset role;

select is(
  (select row(shirts_by_mail, mailing_address is null, amount)::text
   from public.registrations where id = tests.reg('3', 'e2')),
  '(f,t,35.68)',
  'without shirts nothing is mailed, and the address is not kept'
);

select is(
  (select count(*) from public.registration_shirts
   where registration_id = tests.reg('3', 'e2')),
  0::bigint,
  'and no shirt stays on the order'
);

-- The organizer's price ----------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e2', '{"shirt_shipping_price": 4.5}') $$,
  'the organizer sets what mailing a shirt costs'
);
reset role;

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;
select public.register_for_event(
  '00000000-0000-4000-9000-0000000000c2',
  tests.runner('Ana', '{"shirts": [{"size": "M"}, {"size": "M"}, {"size": "L"}]}'));
reset role;

-- 30 + 3 × 22 + 3 × 4.50 + 2 = 111.50; tax 12.82.
select is(
  (select amount from public.registrations where id = tests.reg('3', 'e2')),
  124.32::numeric,
  'and every shirt on an order pays it'
);

select is(
  (select sum(shipping_price) from public.registration_shirts
   where registration_id = tests.reg('3', 'e2')),
  13.50::numeric,
  'kept on each shirt'
);

-- The shipment -------------------------------------------------------------------

select public.confirm_registration_payment(tests.reg('3', 'e2'), 'pi_test_ana', 12432);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select count(*) from public.registration_shirts
   where registration_id = tests.reg('3', 'e2')),
  3::bigint,
  'paid, the order''s shirts are the organizer''s to read'
);

select lives_ok(
  $$ select public.mark_shipment_shipped(tests.reg('3', 'e2'), 'PR-ANA-1') $$,
  'an order with shirts has a shipment, mail extra or not'
);

reset role;

select ok(
  (select shipped_at is not null and shipping_tracking = 'PR-ANA-1'
   from public.registrations where id = tests.reg('3', 'e2')),
  'marked shipped, with its tracking number'
);

-- An order from before shirts were mailed: its shirt is handed over, so there
-- is nothing to ship.
update public.registrations set shirts_by_mail = false, shipped_at = null,
  shipping_tracking = null, mailing_address = null
where id = tests.reg('3', 'e2');

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$ select public.mark_shipment_shipped(tests.reg('3', 'e2')) $$,
  'P0001', 'notMailed',
  'shirts sold for pickup are not a shipment'
);
reset role;

select * from finish();
rollback;
