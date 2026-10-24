-- Finisher medals by mail or picked up: the address at sign-up, who has
-- earned one, who may hand it over, and the runner switching between the two.
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
  accepts_results, mails_medals
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'medal-run-test', 'published', now(), 'Medal Run 5K', 'Road Race',
  current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
  true, true
), (
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-8000-000000000001',
  'medal-run-past-test', 'published', now(), 'Past Medal Run', 'Road Race',
  current_date - 3, '18:00', current_date - 4, 'Paseo Caribe', 'San Juan',
  false, true
);

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1',
   '5K', 5, 30, 50, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e2',
   '5K', 5, 30, 50, '18:00');

-- On e1, Beto chose the mail; on e2, Ana and Beto chose to pick up, and
-- Ana gave no address.
insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, paid_at, medal_by_mail, medal_mailing_address
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

-- What Ana types at sign-up: how she wants her medal, and the address.
create or replace function tests.ana_details(medal_by_mail boolean, address text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', 'Ana', 'last_name', 'Figueroa', 'email', 'ana@example.com',
    'phone', '787-555-0103', 'birth_date', '1992-03-03', 'gender', 'f',
    'emergency_contact_name', 'Luis Figueroa', 'emergency_contact_phone', '787-555-0198',
    'wants_photos', false, 'donation', 0,
    'medal_by_mail', medal_by_mail, 'mailing_address', address
  );
$$;

grant execute on function tests.ana_details(boolean, text) to authenticated;
-- End of fixtures.

select plan(17);

-- Asking for the medal by mail takes an address.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details(true, '')) $$,
  'P0001',
  'mailingAddressInvalid',
  'a medal by mail needs an address at sign-up'
);

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1', tests.ana_details(true, '9 Calle Luna, Ponce, PR 00730')) $$,
  'with an address, the sign-up goes through'
);

select is(
  (select medal_mailing_address from public.registrations
   where event_id = '00000000-0000-4000-9000-0000000000e1'
     and runner_id = '00000000-0000-4000-8000-000000000003'),
  '9 Calle Luna, Ponce, PR 00730',
  'the address is kept as the medal''s'
);

select is(
  (select mailing_address from public.registrations
   where event_id = '00000000-0000-4000-9000-0000000000e1'
     and runner_id = '00000000-0000-4000-8000-000000000003'),
  null::text,
  'without mailing the kit, it is not the kit''s'
);

reset role;

-- Omar does not organize e1.
select tests.act_as('00000000-0000-4000-8000-000000000002');
set local role authenticated;

select throws_ok(
  $$ select public.mark_medal_shipped('00000000-0000-4000-9000-0000000000b1', null) $$,
  'P0001',
  'notAllowed',
  'only the event''s organizer marks a medal shipped'
);

reset role;

-- Olga: Beto has no accepted result yet on a race that takes evidence.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.mark_medal_shipped('00000000-0000-4000-9000-0000000000b1', null) $$,
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
  (select medal_tracking from public.mark_medal_shipped(
     '00000000-0000-4000-9000-0000000000b1', ' 9400 1000 ')),
  '9400 1000',
  'an accepted finisher''s medal is marked shipped, tracking trimmed'
);

reset role;

update public.registrations set medal_shipped_at = '2026-01-01T12:00:00Z'
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select medal_shipped_at from public.mark_medal_shipped(
     '00000000-0000-4000-9000-0000000000b1', 'NEW123')),
  '2026-01-01T12:00:00Z'::timestamptz,
  'marking again changes the tracking number, not when it shipped'
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
  $$ select public.mark_medal_shipped('00000000-0000-4000-9000-0000000000b2', null) $$,
  'P0001',
  'pickupChosen',
  'a medal the runner picks up is not mailed'
);

reset role;

-- She switches to the mail from her profile.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (select medal_mailing_address from public.set_medal_delivery(
     '00000000-0000-4000-9000-0000000000b2', true, '  9 Calle Luna, Ponce, PR 00730 ')),
  '9 Calle Luna, Ponce, PR 00730',
  'the runner switches to the mail, with an address'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select isnt(
  (select medal_shipped_at from public.mark_medal_shipped(
     '00000000-0000-4000-9000-0000000000b2', null)),
  null::timestamptz,
  'after race day, a race without evidence mails every finisher who asked'
);

-- Beto picks his up in person.
select isnt(
  (select medal_picked_up_at from public.mark_medal_picked_up(
     '00000000-0000-4000-9000-0000000000b3')),
  null::timestamptz,
  'the organizer records a pickup'
);

select throws_ok(
  $$ select public.mark_medal_shipped('00000000-0000-4000-9000-0000000000b3', null) $$,
  'P0001',
  'pickedUp',
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
update public.registrations set medal_shipped_at = null
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.mark_medal_shipped('00000000-0000-4000-9000-0000000000b1', null) $$,
  'P0001',
  'notFinished',
  'a disqualified runner''s medal cannot ship'
);

reset role;

select * from finish();
rollback;
