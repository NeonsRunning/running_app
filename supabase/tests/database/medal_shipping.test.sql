-- One shipment per sign-up, kit and medal together, or a medal picked up: the
-- paid extra at sign-up, who has earned a medal, when the shipment may go, who
-- may hand it over, and the runner switching between the two.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns both races
--   2  organizer Omar — owns nothing here
--   3  runner Ana
--   4  runner Beto
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
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com');

update public.profiles set account_type = 'organizer'
where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

-- e1: a month out, open for sign-ups, mails medals, takes finish evidence.
-- e2: run three days ago, mails medals, takes no evidence.
insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city,
  accepts_results, mails_medals, offers_mail, shipping_price
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'medal-run-test', 'published', now(), 'Medal Run 5K', 'Road Race',
  current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
  true, true, true, 8
), (
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-8000-000000000001',
  'medal-run-past-test', 'published', now(), 'Past Medal Run', 'Road Race',
  current_date - 3, '18:00', current_date - 4, 'Paseo Caribe', 'San Juan',
  false, true, true, 8
);

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1',
   '5K', 5, 30, 50, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e2',
   '5K', 5, 30, 50, '18:00');

-- On e1, Beto kept the free medal mail of before; on e2, Ana and Beto chose
-- to pick up, and Ana gave no address.
insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, paid_at, medal_by_mail, mailing_address
) values (
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 1001,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199', 35.68,
  'stripe', 'pi_test_beto', now(), true, '1 Calle Sol, San Juan, PR 00901'
), (
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-8000-000000000003',
  'confirmed', 2001,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198', 35.68,
  'stripe', 'pi_test_ana', now(), false, null
), (
  '00000000-0000-4000-9000-0000000000b3',
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 2002,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199', 35.68,
  'stripe', 'pi_test_beto_2', now(), false, null
);

-- What Ana types at sign-up: whether she adds the mail, and the address.
create or replace function tests.ana_details(ships_by_mail boolean, address text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', 'Ana', 'last_name', 'Figueroa', 'email', 'ana@example.com',
    'phone', '787-555-0103', 'birth_date', '1992-03-03', 'gender', 'f',
    'emergency_contact_name', 'Luis Figueroa', 'emergency_contact_phone', '787-555-0198',
    'wants_photos', false, 'donation', 0,
    'ships_by_mail', ships_by_mail, 'mailing_address', address
  );
$$;

grant execute on function tests.ana_details(boolean, text) to authenticated;
-- End of fixtures.

select plan(31);

-- The mail extra takes an address.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details(true, '')) $$,
  'P0001',
  'mailingAddressInvalid',
  'the mail extra needs an address at sign-up'
);

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1', tests.ana_details(true, '9 Calle Luna, Ponce, PR 00730')) $$,
  'with an address, the sign-up goes through'
);

select is(
  (select mailing_address from public.registrations
   where event_id = '00000000-0000-4000-9000-0000000000e1'
     and runner_id = '00000000-0000-4000-8000-000000000003'),
  '9 Calle Luna, Ponce, PR 00730',
  'the address is the shipment''s'
);

select is(
  (select medal_by_mail from public.registrations
   where event_id = '00000000-0000-4000-9000-0000000000e1'
     and runner_id = '00000000-0000-4000-8000-000000000003'),
  true,
  'on a race that mails medals, the extra puts the medal in the shipment'
);

-- The medal alone is no longer a free way into the mail.
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.ana_details(false, '9 Calle Luna') || '{"medal_by_mail": true}') $$,
  'the sign-up goes through without the extra'
);

select is(
  (select medal_by_mail from public.registrations
   where event_id = '00000000-0000-4000-9000-0000000000e1'
     and runner_id = '00000000-0000-4000-8000-000000000003'),
  false,
  'a client asking for the medal alone does not get it mailed'
);

reset role;

-- Omar does not organize e1.
select tests.act_as('00000000-0000-4000-8000-000000000002');
set local role authenticated;

select throws_ok(
  $$ select public.mark_shipment_shipped('00000000-0000-4000-9000-0000000000b1', null) $$,
  'P0001',
  'notAllowed',
  'only the event''s organizer marks a shipment shipped'
);

reset role;

-- Olga: Beto has no accepted result yet on a race that takes evidence.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.mark_shipment_shipped('00000000-0000-4000-9000-0000000000b1', null) $$,
  'P0001',
  'notFinished',
  'a medal waits for the accepted result'
);

reset role;

insert into public.race_results (
  registration_id, event_id, category_id, runner_id, finish_seconds, evidence_path, status
) values (
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  1500,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f1.webp',
  'accepted'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select shipping_tracking from public.mark_shipment_shipped(
     '00000000-0000-4000-9000-0000000000b1', ' 9400 1000 ')),
  '9400 1000',
  'an accepted finisher''s shipment is marked shipped, tracking trimmed'
);

reset role;

update public.registrations set
  shipped_at = '2026-01-01T12:00:00Z',
  medal_shipped_at = '2026-01-01T12:00:00Z',
  shipping_email_sent_at = '2026-01-01T12:00:00Z'
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select shipped_at from public.mark_shipment_shipped(
     '00000000-0000-4000-9000-0000000000b1', 'NEW123')),
  '2026-01-01T12:00:00Z'::timestamptz,
  'marking again changes the tracking number, not when it shipped'
);

select isnt(
  (select shipping_email_sent_at from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  null::timestamptz,
  'marking again leaves the email claimed, so nothing is sent'
);

reset role;

-- Beto cannot change a medal that is on its way, nor touch Ana's.
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select public.set_medal_delivery('00000000-0000-4000-9000-0000000000b1', false, null) $$,
  'P0001',
  'alreadyShipped',
  'a shipped medal cannot switch to pickup'
);

select throws_ok(
  $$ select public.set_medal_delivery('00000000-0000-4000-9000-0000000000b2', true, '2 Calle Mar') $$,
  'P0001',
  'notAllowed',
  'a runner cannot change another runner''s medal'
);

reset role;

-- e2 is over and takes no evidence. Ana chose pickup, so nothing to mail.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.mark_shipment_shipped('00000000-0000-4000-9000-0000000000b2', null) $$,
  'P0001',
  'notMailed',
  'nothing of a runner who picks up is mailed'
);

reset role;

-- She did not pay for the mail, so she cannot switch to it for free.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.set_medal_delivery('00000000-0000-4000-9000-0000000000b2', true, '9 Calle Luna') $$,
  'P0001',
  'mailNotIncluded',
  'the mail is closed to a sign-up that did not pay for it'
);

reset role;

-- Paid for after all: now she can, and the kit waits for nothing on e2.
update public.registrations set
  ships_by_mail = true, mailing_address = '1 Calle Vieja'
where id = '00000000-0000-4000-9000-0000000000b2';

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (select mailing_address from public.set_medal_delivery(
     '00000000-0000-4000-9000-0000000000b2', true, '  9 Calle Luna, Ponce, PR 00730 ')),
  '9 Calle Luna, Ponce, PR 00730',
  'a runner with the mail corrects the shipment''s address'
);

select is(
  (select mailing_address from public.set_medal_delivery(
     '00000000-0000-4000-9000-0000000000b2', false, 'somewhere else')),
  '9 Calle Luna, Ponce, PR 00730',
  'choosing pickup leaves the kit''s address alone'
);

select is(
  (select medal_by_mail from public.set_medal_delivery(
     '00000000-0000-4000-9000-0000000000b2', true, '9 Calle Luna, Ponce, PR 00730')),
  true,
  'and a runner who paid can come back to the mail'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select isnt(
  (select medal_shipped_at from public.mark_shipment_shipped(
     '00000000-0000-4000-9000-0000000000b2', null)),
  null::timestamptz,
  'after race day, a race without evidence sends kit and medal as one'
);

select is(
  (select shipped_at = medal_shipped_at from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b2'),
  true,
  'they leave together'
);

-- Beto picks his up in person.
select isnt(
  (select medal_picked_up_at from public.mark_medal_picked_up(
     '00000000-0000-4000-9000-0000000000b3')),
  null::timestamptz,
  'the organizer records a pickup'
);

select throws_ok(
  $$ select public.mark_shipment_shipped('00000000-0000-4000-9000-0000000000b3', null) $$,
  'P0001',
  'notMailed',
  'a picked-up medal is not mailed too'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select public.set_medal_delivery('00000000-0000-4000-9000-0000000000b3', true, '2 Calle Mar') $$,
  'P0001',
  'pickedUp',
  'a picked-up medal cannot switch to the mail'
);

reset role;

-- A disqualified finish no longer earns a medal that has not shipped.
update public.race_results set
  status = 'disqualified', disqualified_at = now(), disqualification_reason = 'test'
where registration_id = '00000000-0000-4000-9000-0000000000b1';
update public.registrations set medal_shipped_at = null, shipped_at = null
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.mark_shipment_shipped('00000000-0000-4000-9000-0000000000b1', null) $$,
  'P0001',
  'notFinished',
  'a disqualified runner''s medal cannot ship'
);

reset role;

-- Their paid kit is another matter: it goes, without the forfeited medal.
update public.registrations set ships_by_mail = true
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select medal_shipped_at from public.mark_shipment_shipped(
     '00000000-0000-4000-9000-0000000000b1', null)),
  null::timestamptz,
  'a disqualified runner''s kit ships alone, before race day too'
);

reset role;

-- A kit and a medal still to be earned, the race a month out: both wait.
delete from public.race_results
where registration_id = '00000000-0000-4000-9000-0000000000b1';
update public.registrations set shipped_at = null, shipping_email_sent_at = null
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.mark_shipment_shipped('00000000-0000-4000-9000-0000000000b1', null) $$,
  'P0001',
  'notFinished',
  'the kit waits for the medal while the race can still be finished'
);

reset role;

-- The race ended with no finish: the paid kit is not held back for good.
update public.events set
  event_date = current_date - 3, registration_closes = current_date - 4
where id = '00000000-0000-4000-9000-0000000000e1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select medal_shipped_at from public.mark_shipment_shipped(
     '00000000-0000-4000-9000-0000000000b1', 'KIT1')),
  null::timestamptz,
  'once the race is over the kit goes ahead, the medal still due'
);

reset role;

-- As the email would claim it.
update public.registrations set shipping_email_sent_at = now()
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select shipping_tracking from public.mark_shipment_shipped(
     '00000000-0000-4000-9000-0000000000b1', 'KIT2')),
  'KIT2',
  'with the medal unearned, marking again only corrects the number'
);

select isnt(
  (select shipping_email_sent_at from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  null::timestamptz,
  'and sends nothing'
);

reset role;

insert into public.race_results (
  registration_id, event_id, category_id, runner_id, finish_seconds, evidence_path, status
) values (
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  1500,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f1.webp',
  'accepted'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select isnt(
  (select medal_shipped_at from public.mark_shipment_shipped(
     '00000000-0000-4000-9000-0000000000b1', 'MEDAL1')),
  null::timestamptz,
  'a medal earned later follows its kit'
);

select is(
  (select shipping_email_sent_at from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  null::timestamptz,
  'and the runner hears about it: the email is open again'
);

reset role;

select * from finish();
rollback;
