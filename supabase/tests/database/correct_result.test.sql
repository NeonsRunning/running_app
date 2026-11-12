-- An admin correcting a reviewed result: who may, what changes, what is kept.
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

-- Beto's finish, sent with a screenshot and waiting for review. Two files
-- in his folder (the one sent, and one an admin uploads later), one in Ana's.
update public.events set accepts_results = true
where id = '00000000-0000-4000-9000-0000000000e1';

insert into storage.objects (bucket_id, name) values
  ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp'),
  ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp'),
  ('race-evidence', '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d3.webp');

insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path
) values (
  '00000000-0000-4000-9000-0000000000f1',
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  3000,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp'
);

-- A correction of Beto's result; only what a test varies is passed.
create or replace function tests.correct(
  p_seconds integer,
  p_km numeric default null,
  p_path text default null,
  p_remove boolean default false,
  p_reason text default 'Wrong screenshot accepted',
  p_version timestamptz default '2026-01-01 00:00:00+00'
)
returns public.race_result_corrections
language sql
as $$
  select public.admin_correct_race_result(
    '00000000-0000-4000-9000-0000000000f1', p_version,
    p_seconds, p_km, p_path, p_remove, p_reason
  );
$$;

grant execute on function tests.correct(integer, numeric, text, boolean, text, timestamptz)
  to authenticated;

select plan(22);

-- Only accepted or disqualified results, only admins -------------------------

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select throws_ok(
  $$ select tests.correct(2900) $$,
  'P0001', 'resultMissing',
  'a result waiting for review is not corrected'
);

reset role;
update public.race_results set
  status = 'accepted',
  reviewed_at = '2026-01-01 00:00:00+00',
  reviewed_by = '00000000-0000-4000-8000-000000000001'
where id = '00000000-0000-4000-9000-0000000000f1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select tests.correct(2900) $$,
  'P0001', 'notAllowed',
  'the event''s organizer cannot correct a result'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select tests.correct(2900) $$,
  'P0001', 'notAllowed',
  'the runner cannot correct their own result'
);

reset role;

-- What is refused -------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select throws_ok(
  $$ select tests.correct(2900, p_version => '2025-12-31 00:00:00+00') $$,
  'P0001', 'resultChanged',
  'a correction of a version the admin was not shown is refused'
);

select throws_ok(
  $$ select tests.correct(0) $$,
  'P0001', 'timeInvalid',
  'a zero time is refused'
);

select throws_ok(
  $$ select tests.correct(2900, 600) $$,
  'P0001', 'distanceInvalid',
  'a distance over 500 km is refused'
);

select throws_ok(
  $$ select tests.correct(2900, p_reason => '   ') $$,
  'P0001', 'reasonRequired',
  'a blank reason is refused'
);

select throws_ok(
  $$ select tests.correct(3000) $$,
  'P0001', 'nothingChanged',
  'a correction that changes nothing is refused'
);

select throws_ok(
  $$ select tests.correct(3000, p_path => '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d3.webp') $$,
  'P0001', 'evidenceInvalid',
  'a screenshot from another runner''s folder is refused'
);

select throws_ok(
  $$ select tests.correct(3000, p_path => '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d9.webp') $$,
  'P0001', 'evidenceInvalid',
  'a screenshot that was never uploaded is refused'
);

-- Time and distance -----------------------------------------------------------

select is(
  (select row(c.old_finish_seconds, c.new_finish_seconds, c.old_distance_run_km,
              c.new_distance_run_km, c.old_evidence_path = c.new_evidence_path,
              c.corrected_by, c.reason)::text
   from tests.correct(2900, 10.014) c),
  row(3000, 2900, null::numeric(5, 2), 10.01::numeric(5, 2), true,
      '00000000-0000-4000-8000-000000000005'::uuid, 'Wrong screenshot accepted')::text,
  'the correction records old and new values, who made it and why'
);

reset role;

select is(
  (select row(r.status::text, r.finish_seconds, r.distance_run_km,
              r.corrected_by, r.evidence_removed_at)::text
   from public.race_results r where r.id = '00000000-0000-4000-9000-0000000000f1'),
  row('accepted', 2900, 10.01::numeric(5, 2),
      '00000000-0000-4000-8000-000000000005'::uuid, null::timestamptz)::text,
  'the result takes the corrected time and distance and stays accepted'
);

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select throws_ok(
  $$ select tests.correct(2800) $$,
  'P0001', 'resultChanged',
  'the version before the correction is stale now'
);

-- An empty distance goes back to the category's. The transaction's now() is
-- the corrected_at of every correction in it, so it is the version too.
select is(
  (tests.correct(2900, null, p_version => now())).new_distance_run_km,
  null,
  'clearing the distance leaves pace to the category''s distance'
);

-- The screenshot --------------------------------------------------------------

select is(
  (tests.correct(2900, p_remove => true, p_version => now())).old_evidence_path,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp',
  'removing the screenshot logs the path it had'
);

reset role;

select is(
  (select row(r.evidence_path, r.evidence_removed_at is not null)::text
   from public.race_results r where r.id = '00000000-0000-4000-9000-0000000000f1'),
  row(null::text, true)::text,
  'a removed screenshot leaves the result marked as such, not as recorded'
);

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (tests.correct(
     2900,
     p_path => '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp',
     p_version => now()
   )).new_evidence_path,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp',
  'an uploaded file replaces the screenshot'
);

reset role;

select is(
  (select row(r.evidence_path, r.evidence_removed_at)::text
   from public.race_results r where r.id = '00000000-0000-4000-9000-0000000000f1'),
  row('00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp',
      null::timestamptz)::text,
  'with a new screenshot the result is no longer marked as removed'
);

-- A disqualified result can be corrected too, and stays disqualified.
update public.race_results set
  status = 'disqualified',
  disqualified_at = now(),
  disqualification_reason = 'Cut the course'
where id = '00000000-0000-4000-9000-0000000000f1';

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select r.status::text
   from tests.correct(3100, p_version => now()) c
   join public.race_results r on r.id = c.result_id),
  'disqualified',
  'a disqualified result is corrected and stays disqualified'
);

-- The log ---------------------------------------------------------------------

select is(
  (select count(*)::int from public.race_result_corrections),
  5,
  'an admin reads every correction'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select is(
  (select count(*)::int from public.race_result_corrections),
  0,
  'the runner does not read the log'
);

select throws_ok(
  $$ insert into public.race_result_corrections (
       result_id, reason, old_finish_seconds, new_finish_seconds
     ) values ('00000000-0000-4000-9000-0000000000f1', 'x', 1, 1) $$,
  '42501', null,
  'nobody writes the log directly'
);

reset role;

select * from finish();
rollback;
