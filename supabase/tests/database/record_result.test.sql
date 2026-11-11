-- Recording a finish without evidence: who may, when, and over what.
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

-- Ana has a paid sign-up too, with evidence waiting for review.
insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, paid_at
) values (
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000003',
  'confirmed', 1002,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198', 35.68,
  'stripe', 'pi_test_ana', now()
);

insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path
) values (
  '00000000-0000-4000-9000-0000000000f2',
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000003',
  3000,
  '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000f8.webp'
);

select plan(14);

-- Not before the event takes results, nor before race day.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.record_race_result('00000000-0000-4000-9000-0000000000b1', 2700) $$,
  'P0001', 'resultsClosed',
  'nothing is recorded on an event that takes no results'
);

reset role;
update public.events set accepts_results = true
where id = '00000000-0000-4000-9000-0000000000e1';
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.record_race_result('00000000-0000-4000-9000-0000000000b1', 2700) $$,
  'P0001', 'raceNotStarted',
  'nothing is recorded before race day'
);

reset role;
-- Run today, by the Puerto Rico date.
update public.events set
  event_date = (now() at time zone 'America/Puerto_Rico')::date,
  registration_closes = (now() at time zone 'America/Puerto_Rico')::date
where id = '00000000-0000-4000-9000-0000000000e1';

-- Not by another organizer, nor the runner.
select tests.act_as('00000000-0000-4000-8000-000000000002');
set local role authenticated;

select throws_ok(
  $$ select public.record_race_result('00000000-0000-4000-9000-0000000000b1', 2700) $$,
  'P0001', 'notAllowed',
  'an organizer of another event cannot record a finish'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select public.record_race_result('00000000-0000-4000-9000-0000000000b1', 2700) $$,
  'P0001', 'notAllowed',
  'a runner cannot record their own finish'
);

reset role;

-- The event's organizer records Beto's finish.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.record_race_result('00000000-0000-4000-9000-0000000000b1', 0) $$,
  'P0001', 'timeInvalid',
  'a zero time is refused'
);

select throws_ok(
  $$ select public.record_race_result('00000000-0000-4000-9000-0000000000b1', 604800) $$,
  'P0001', 'timeInvalid',
  'a time of a week or more is refused'
);

select is(
  (select row(r.status::text, r.finish_seconds, r.evidence_path, r.reviewed_by)::text
   from public.record_race_result('00000000-0000-4000-9000-0000000000b1', 2700) r),
  row('accepted', 2700, null::text, '00000000-0000-4000-8000-000000000001'::uuid)::text,
  'the organizer records an accepted finish with no evidence'
);

select throws_ok(
  $$ select public.record_race_result('00000000-0000-4000-9000-0000000000b1', 2600) $$,
  'P0001', 'resultAlreadyAccepted',
  'an accepted finish is not recorded over'
);

-- Over Ana's pending evidence: it replaces the submission.
select is(
  (select row(r.id, r.status::text, r.finish_seconds, r.evidence_path)::text
   from public.record_race_result('00000000-0000-4000-9000-0000000000b2', 2950) r),
  row('00000000-0000-4000-9000-0000000000f2'::uuid, 'accepted', 2950, null::text)::text,
  'recording over pending evidence accepts the recorded time in its place'
);

reset role;

-- On the public leaderboard, like any accepted result.
select is(
  (select count(*)::int from public.public_event_results('00000000-0000-4000-9000-0000000000e1')),
  2,
  'both recorded finishes are on the leaderboard'
);

-- The runner cannot send evidence over it.
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select public.submit_race_result(
       '00000000-0000-4000-9000-0000000000e1', 2600,
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f7.webp'
     ) $$,
  'P0001', 'resultAlreadyAccepted',
  'the runner cannot replace a recorded finish'
);

reset role;

-- A recorded finish can still be disqualified.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (public.disqualify_race_result(
     (select id from public.race_results
      where registration_id = '00000000-0000-4000-9000-0000000000b1'),
     'Never crossed the line'
   )).status::text,
  'disqualified',
  'the organizer disqualifies a recorded finish'
);

reset role;

-- Only accepted or disqualified results may lack evidence.
select throws_ok(
  $$ update public.race_results set status = 'pending'
     where registration_id = '00000000-0000-4000-9000-0000000000b2' $$,
  '23514', null,
  'a result without evidence cannot wait for review'
);

select throws_ok(
  $$ update public.race_results set status = 'rejected'
     where registration_id = '00000000-0000-4000-9000-0000000000b2' $$,
  '23514', null,
  'nor be sent back'
);

select * from finish();
rollback;
