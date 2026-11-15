-- An admin moving an accepted result to the runner who ran it.
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

-- The race was run today (Puerto Rico date) and takes evidence. Ana signed
-- up for the 5K, Beto for the 10K. Ana ran, but sent her finish signed in as
-- Beto, and it was accepted: the result is on his sign-up. She has since
-- sent the same run from her own account, which waits for review.
update public.events set
  event_date = (now() at time zone 'America/Puerto_Rico')::date,
  registration_closes = (now() at time zone 'America/Puerto_Rico')::date,
  accepts_results = true
where id = '00000000-0000-4000-9000-0000000000e1';

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values (
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-9000-0000000000e1',
  '5K', 5, 20, 2, '18:00'
);

insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, paid_at
) values (
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-8000-000000000003',
  'confirmed', 1002,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198', 24.50,
  'stripe', 'pi_test_ana', now()
);

-- d1: the screenshot on Beto's result. d2: the one Beto sends afterwards.
-- d3: the app's copy of d1 in Ana's folder. d4: what Ana sent herself.
insert into storage.objects (bucket_id, name) values
  ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp'),
  ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp'),
  ('race-evidence', '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d3.webp'),
  ('race-evidence', '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d4.webp');

insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path, status, reviewed_at, reviewed_by
) values (
  '00000000-0000-4000-9000-0000000000f1',
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  1800,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp',
  'accepted', '2026-01-01 00:00:00+00', '00000000-0000-4000-8000-000000000001'
);

insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path
) values (
  '00000000-0000-4000-9000-0000000000f2',
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-8000-000000000003',
  1800,
  '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d4.webp'
);

-- Moving Beto's result; to Ana's sign-up, with the copy, unless a test says.
create or replace function tests.move(
  p_to uuid default '00000000-0000-4000-9000-0000000000b2',
  p_path text default '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d3.webp',
  p_version timestamptz default '2026-01-01 00:00:00+00'
)
returns public.race_result_corrections
language sql
as $$
  select public.admin_correct_race_result(
    '00000000-0000-4000-9000-0000000000f1', p_version,
    1800, null, p_path, false, 'Sent from a friend''s account', p_to
  );
$$;

grant execute on function tests.move(uuid, text, timestamptz) to authenticated;

select plan(24);

-- Admins only ----------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select tests.move() $$,
  'P0001', 'notAllowed',
  'the event''s organizer cannot move a result'
);

select throws_ok(
  $$ select * from public.admin_result_move_targets('00000000-0000-4000-9000-0000000000f1') $$,
  'P0001', 'notAllowed',
  'nor look up who it could move to'
);

reset role;

-- Who it can move to -----------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select array_agg(row(t.registration_id, t.runner_id, t.runner_name, t.bib,
                        t.distance, t.same_category)::text)
   from public.admin_result_move_targets('00000000-0000-4000-9000-0000000000f1') t),
  array[row('00000000-0000-4000-9000-0000000000b2'::uuid,
            '00000000-0000-4000-8000-000000000003'::uuid,
            'Ana Figueroa'::text, 1002, '5K'::public.race_distance, false)::text],
  'the event''s other paid runners, with whether the distance is the same'
);

select is(
  (select count(*)::int
   from public.admin_result_move_targets('00000000-0000-4000-9000-0000000000f1', 'na fig')),
  1,
  'found by part of the full name'
);

select is(
  (select count(*)::int
   from public.admin_result_move_targets('00000000-0000-4000-9000-0000000000f1', '1002')),
  1,
  'or by bib'
);

select is(
  (select count(*)::int
   from public.admin_result_move_targets('00000000-0000-4000-9000-0000000000f1', '%')),
  0,
  'typed wildcards are matched literally'
);

-- What is refused -------------------------------------------------------------

select throws_ok(
  $$ select tests.move('00000000-0000-4000-9000-0000000000b9') $$,
  'P0001', 'moveInvalid',
  'a sign-up that does not exist is refused'
);

select throws_ok(
  $$ select tests.move('00000000-0000-4000-9000-0000000000b1',
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp') $$,
  'P0001', 'moveInvalid',
  'a result is not moved to the sign-up it is on'
);

select throws_ok(
  $$ select tests.move(p_path => null) $$,
  'P0001', 'evidenceInvalid',
  'the screenshot cannot stay in the folder of the runner it leaves'
);

select throws_ok(
  $$ select tests.move(p_path =>
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp') $$,
  'P0001', 'evidenceInvalid',
  'nor be replaced by a file in that folder'
);

select throws_ok(
  $$ select tests.move(p_version => '2025-12-31 00:00:00+00') $$,
  'P0001', 'resultChanged',
  'a move of a version the admin was not shown is refused'
);

-- The medal already went out on this result.
reset role;
update public.registrations set medal_picked_up_at = now()
where id = '00000000-0000-4000-9000-0000000000b1';
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select throws_ok(
  $$ select tests.move() $$,
  'P0001', 'moveMedalDelivered',
  'a result whose medal was picked up is not moved'
);

select throws_ok(
  $$ select * from public.admin_result_move_targets('00000000-0000-4000-9000-0000000000f1') $$,
  'P0001', 'moveMedalDelivered',
  'and the lookup says so before any search'
);

reset role;
update public.registrations set medal_picked_up_at = null
where id = '00000000-0000-4000-9000-0000000000b1';

-- Ana's own finish was accepted meanwhile.
update public.race_results set status = 'accepted', reviewed_at = now()
where id = '00000000-0000-4000-9000-0000000000f2';
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select throws_ok(
  $$ select tests.move() $$,
  'P0001', 'moveTargetHasResult',
  'a runner with an accepted result does not take another'
);

select is(
  (select count(*)::int
   from public.admin_result_move_targets('00000000-0000-4000-9000-0000000000f1')),
  0,
  'and is not offered'
);

reset role;
update public.race_results set status = 'pending', reviewed_at = null
where id = '00000000-0000-4000-9000-0000000000f2';

-- The move ---------------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select row(c.old_runner_id, c.new_runner_id, c.old_evidence_path, c.new_evidence_path,
              c.old_finish_seconds, c.new_finish_seconds, c.reason)::text
   from tests.move() c),
  row('00000000-0000-4000-8000-000000000004'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid,
      '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp'::text,
      '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d3.webp'::text,
      1800, 1800, 'Sent from a friend''s account'::text)::text,
  'a move alone is a correction, logged with both runners and both files'
);

reset role;

select is(
  (select row(r.registration_id, r.runner_id, r.category_id, r.status::text,
              r.evidence_path, r.corrected_by)::text
   from public.race_results r where r.id = '00000000-0000-4000-9000-0000000000f1'),
  row('00000000-0000-4000-9000-0000000000b2'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid,
      '00000000-0000-4000-9000-0000000000c2'::uuid, 'accepted'::text,
      '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d3.webp'::text,
      '00000000-0000-4000-8000-000000000005'::uuid)::text,
  'the result is on the other runner''s sign-up, in their category, still accepted'
);

select is(
  (select array_agg(r.id) from public.race_results r
   where r.event_id = '00000000-0000-4000-9000-0000000000e1'),
  array['00000000-0000-4000-9000-0000000000f1'::uuid],
  'what the other runner had waiting is replaced, and the first runner has no result'
);

select is(
  (select array_agg(public.medal_earned(g, e, false) order by g.bib)
   from public.registrations g
   join public.events e on e.id = g.event_id
   where g.event_id = '00000000-0000-4000-9000-0000000000e1'),
  array[false, true],
  'the medal follows the result'
);

-- Beto, left without a result, sends his own.
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select is(
  (select r.status::text from public.submit_race_result(
     '00000000-0000-4000-9000-0000000000e1', 3100,
     '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp'
   ) r),
  'pending',
  'the runner it was taken from can send their own finish'
);

select is(
  (select count(*)::int from public.race_result_corrections),
  0,
  'and does not read the log'
);

reset role;

-- Afterwards -------------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

-- The transaction's now() is the corrected_at of the move, so the version.
select throws_ok(
  $$ select tests.move() $$,
  'P0001', 'resultChanged',
  'the version before the move is stale now'
);

select is(
  (select c.old_runner_id from public.admin_correct_race_result(
     '00000000-0000-4000-9000-0000000000f1', now(), 1750, 5.02, null, false,
     'Time misread'
   ) c),
  null,
  'a correction that moves nothing names no runners'
);

reset role;
update public.race_results set
  status = 'disqualified',
  disqualified_at = now(),
  disqualification_reason = 'Cut the course'
where id = '00000000-0000-4000-9000-0000000000f1';
-- Beto's sign-up is free again for the result to go back to.
delete from public.race_results where id <> '00000000-0000-4000-9000-0000000000f1';

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select throws_ok(
  $$ select tests.move('00000000-0000-4000-9000-0000000000b1',
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp',
       now()) $$,
  'P0001', 'moveDisqualified',
  'a disqualified result is not moved'
);

reset role;

select * from finish();
rollback;
