-- Organizer guards: what an organizer reads of their sign-ups, what a demoted
-- organizer or a removed event still allows, and a sign-up put back to
-- pending.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns "Guarded Run 10K"
--   3  runner Ana   — walked away from a card checkout
--   4  runner Beto  — paid by ATH Móvil, checked in, finish under review
--   5  admin Ada (in platform_admins)
--   6  runner Cruz  — ATH Móvil payment waiting on review
--   7  runner Dani  — paid by ATH Móvil, kit mailed
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
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com'),
  ('00000000-0000-4000-8000-000000000005', 'ada@example.com'),
  ('00000000-0000-4000-8000-000000000006', 'cruz@example.com'),
  ('00000000-0000-4000-8000-000000000007', 'dani@example.com');

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000005');

insert into public.ath_movil_accounts (id, label, path) values
  ('00000000-0000-4000-9000-0000000000a1', 'NEONS RUNNING', '/NeonsRunningTest');

-- Run today, taking finish evidence and ATH Móvil.
insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city,
  ath_movil_account_id, accepts_results, offers_mail, shipping_price
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'guarded-run-test', 'published', now(), 'Guarded Run 10K', 'Road Race',
  current_date, '18:00', current_date, 'Paseo Caribe', 'San Juan',
  '00000000-0000-4000-9000-0000000000a1', true, true, 8
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
  payment_method, payment_intent_id, payment_reference,
  payment_submitted_at, hold_expires_at, paid_at, checked_in_at,
  ships_by_mail, mailing_address, shipped_at
) values (
  -- Beto: paid, checked in.
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 1001,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199', 35.68,
  'ath_movil', null, 'REF-BETO', now() - interval '2 days', null,
  now() - interval '1 day', now(),
  false, null, null
), (
  -- Ana: left the card checkout open.
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000003',
  'pending', null,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198', 35.68,
  'stripe', 'pi_test_ana', null, null, now() + interval '1 hour',
  null, null,
  true, 'Calle Luna 1, San Juan, PR 00901', null
), (
  -- Cruz: ATH Móvil receipt sent, not yet reviewed.
  '00000000-0000-4000-9000-0000000000b3',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000006',
  'pending', null,
  'Cruz', 'Ortiz', 'cruz@example.com', '787-555-0106', '1988-06-06', 'x',
  'Rosa Ortiz', '787-555-0196', 35.68,
  'ath_movil', null, 'REF-CRUZ', now(), 'infinity',
  null, null,
  false, null, null
), (
  -- Dani: paid, kit mailed.
  '00000000-0000-4000-9000-0000000000b4',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000007',
  'confirmed', 1002,
  'Dani', 'Vega', 'dani@example.com', '787-555-0107', '1995-07-07', 'f',
  'Ivan Vega', '787-555-0197', 43.68,
  'ath_movil', null, 'REF-DANI', now() - interval '3 days', null,
  now() - interval '2 days', null,
  true, 'Calle Sol 2, Ponce, PR 00730', now() - interval '1 day'
);

-- Beto's finish, waiting on review.
insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path
) values (
  '00000000-0000-4000-9000-0000000000f1',
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  2700,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f9.webp'
);
-- End of fixtures.

select plan(16);

-- What the organizer reads: paid sign-ups and payments to review, not an
-- abandoned checkout's personal details.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select count(*)::int from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b2'),
  0,
  'the organizer does not see an abandoned checkout'
);

select is(
  (select count(*)::int from public.registrations
   where id in ('00000000-0000-4000-9000-0000000000b1',
                '00000000-0000-4000-9000-0000000000b3',
                '00000000-0000-4000-9000-0000000000b4')),
  3,
  'but sees paid sign-ups and the ATH Móvil payment under review'
);

reset role;

-- An organizer no longer: the account was turned back into a runner's.
update public.profiles set account_type = 'runner'
where id = '00000000-0000-4000-8000-000000000001';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select count(*)::int from public.registrations),
  0,
  'a demoted organizer reads none of the event''s sign-ups'
);

select throws_ok(
  $$ select public.remove_registration('00000000-0000-4000-9000-0000000000b1') $$,
  'P0001', 'notAllowed',
  'a demoted organizer cannot remove a paid runner'
);

select throws_ok(
  $$ select public.review_race_result('00000000-0000-4000-9000-0000000000f1', true) $$,
  'P0001', 'notAllowed',
  'nor review a result'
);

select throws_ok(
  $$ select public.mark_kit_shipped('00000000-0000-4000-9000-0000000000b4', 'TRACK') $$,
  'P0001', 'notAllowed',
  'nor mark a kit shipped'
);

select throws_ok(
  $$ select public.delete_event('00000000-0000-4000-9000-0000000000e1') $$,
  'P0001', 'eventNotFound',
  'nor delete the event'
);

reset role;

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

-- Back to pending: not once the kit went out.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.return_registration_to_pending('00000000-0000-4000-9000-0000000000b4') $$,
  'P0001', 'alreadyDelivered',
  'a sign-up whose kit was mailed stays confirmed'
);

select is(
  (public.return_registration_to_pending('00000000-0000-4000-9000-0000000000b1')).status::text,
  'pending',
  'the organizer puts an ATH Móvil sign-up back to pending'
);

reset role;

select is(
  (select count(*)::int from public.race_results
   where registration_id = '00000000-0000-4000-9000-0000000000b1'),
  0,
  'its finish under review goes with the confirmation'
);

select is(
  (select checked_in_at from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  null,
  'and so does its check-in'
);

-- A result on a sign-up that is not paid cannot be reviewed or disqualified.
insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path, status, reviewed_at
) values (
  '00000000-0000-4000-9000-0000000000f2',
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  2700,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f8.webp',
  'pending', null
), (
  '00000000-0000-4000-9000-0000000000f3',
  '00000000-0000-4000-9000-0000000000b3',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000006',
  2900,
  '00000000-0000-4000-8000-000000000006/00000000-0000-4000-9000-0000000000f7.webp',
  'accepted', now()
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.review_race_result('00000000-0000-4000-9000-0000000000f2', true) $$,
  'P0001', 'registrationMissing',
  'a result on an unpaid sign-up cannot be accepted'
);

select throws_ok(
  $$ select public.disqualify_race_result('00000000-0000-4000-9000-0000000000f3', 'Drove') $$,
  'P0001', 'registrationMissing',
  'nor one disqualified'
);

reset role;

-- Taken down by an admin: no longer the organizer's to change.
update public.events set status = 'removed'
where id = '00000000-0000-4000-9000-0000000000e1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.remove_registration('00000000-0000-4000-9000-0000000000b4') $$,
  'P0001', 'notAllowed',
  'the organizer cannot remove a paid runner from a removed event'
);

select throws_ok(
  $$ select public.mark_kit_shipped('00000000-0000-4000-9000-0000000000b4', 'TRACK') $$,
  'P0001', 'notAllowed',
  'nor ship for it'
);

reset role;

-- The platform still can: refunds land with it.
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (public.remove_registration('00000000-0000-4000-9000-0000000000b4')).status::text,
  'cancelled',
  'an admin removes a runner from a removed event'
);

reset role;

select * from finish();
rollback;
