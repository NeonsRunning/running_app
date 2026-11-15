-- An admin deleting a result, whatever its status.
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

-- The race was run today (Puerto Rico date) and takes evidence. Beto's
-- finish was accepted; Ana's waits for review.
update public.events set
  event_date = (now() at time zone 'America/Puerto_Rico')::date,
  registration_closes = (now() at time zone 'America/Puerto_Rico')::date,
  accepts_results = true
where id = '00000000-0000-4000-9000-0000000000e1';

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

-- d1: the screenshot on Beto's result. d2: the one he sends afterwards.
-- d3: Ana's.
insert into storage.objects (bucket_id, name) values
  ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp'),
  ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp'),
  ('race-evidence', '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d3.webp');

insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, distance_run_km, evidence_path, status,
  submitted_at, reviewed_at, reviewed_by
) values (
  '00000000-0000-4000-9000-0000000000f1',
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  1800, 10.01,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp',
  'accepted', '2025-12-31 00:00:00+00', '2026-01-01 00:00:00+00',
  '00000000-0000-4000-8000-000000000001'
);

insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path, submitted_at
) values (
  '00000000-0000-4000-9000-0000000000f2',
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000003',
  1900,
  '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000d3.webp',
  '2026-01-02 00:00:00+00'
);

-- An earlier correction of Beto's result, to go with it.
insert into public.race_result_corrections (
  result_id, reason, old_finish_seconds, new_finish_seconds
) values ('00000000-0000-4000-9000-0000000000f1', 'Time misread', 1790, 1800);

update public.race_results set corrected_at = '2026-01-03 00:00:00+00'
where id = '00000000-0000-4000-9000-0000000000f1';

-- Deleting Beto's result, as the admin was last shown it, unless a test says.
create or replace function tests.delete_result(
  p_result uuid default '00000000-0000-4000-9000-0000000000f1',
  p_version timestamptz default '2026-01-03 00:00:00+00',
  p_reason text default 'Sent for the wrong race'
)
returns public.race_result_deletions
language sql
as $$
  select public.admin_delete_race_result(p_result, p_version, p_reason);
$$;

grant execute on function tests.delete_result(uuid, timestamptz, text) to authenticated;

select plan(19);

-- Admins only ----------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select tests.delete_result() $$,
  'P0001', 'notAllowed',
  'the event''s organizer cannot delete a result'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select tests.delete_result() $$,
  'P0001', 'notAllowed',
  'nor the runner whose result it is'
);

reset role;

-- What is refused -------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select throws_ok(
  $$ select tests.delete_result('00000000-0000-4000-9000-0000000000f9') $$,
  'P0001', 'resultMissing',
  'a result that does not exist is refused'
);

select throws_ok(
  $$ select tests.delete_result(p_version => '2026-01-01 00:00:00+00') $$,
  'P0001', 'resultChanged',
  'a version the admin was not shown is refused'
);

select throws_ok(
  $$ select tests.delete_result(p_version => null) $$,
  'P0001', 'resultChanged',
  'and so is no version at all'
);

select throws_ok(
  $$ select tests.delete_result(p_reason => '   ') $$,
  'P0001', 'reasonRequired',
  'a blank reason is refused'
);

-- The medal already went out on this result.
reset role;
update public.registrations set medal_shipped_at = now()
where id = '00000000-0000-4000-9000-0000000000b1';
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select throws_ok(
  $$ select tests.delete_result() $$,
  'P0001', 'deleteMedalDelivered',
  'an accepted result whose medal was shipped is not deleted'
);

reset role;
update public.registrations set medal_shipped_at = null
where id = '00000000-0000-4000-9000-0000000000b1';

select is(
  (select count(*)::int from public.race_results),
  2,
  'nothing refused deleted anything'
);

-- An accepted result ------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select row(d.deleted_by, d.reason, d.result_id, d.event_id, d.registration_id,
              d.runner_id, d.status::text, d.finish_seconds, d.distance_run_km,
              d.evidence_path, d.submitted_at, d.reviewed_at)::text
   from tests.delete_result(p_reason => '  Sent for the wrong race  ') d),
  row('00000000-0000-4000-8000-000000000005'::uuid, 'Sent for the wrong race'::text,
      '00000000-0000-4000-9000-0000000000f1'::uuid,
      '00000000-0000-4000-9000-0000000000e1'::uuid,
      '00000000-0000-4000-9000-0000000000b1'::uuid,
      '00000000-0000-4000-8000-000000000004'::uuid,
      'accepted'::text, 1800, 10.01::numeric(5, 2),
      '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d1.webp'::text,
      '2025-12-31 00:00:00+00'::timestamptz, '2026-01-01 00:00:00+00'::timestamptz)::text,
  'the deletion is logged with the result as it was, the admin and the trimmed reason'
);

select is(
  (select count(*)::int from public.race_result_deletions),
  1,
  'an admin reads the log'
);

reset role;

select is(
  (select array_agg(r.id) from public.race_results r),
  array['00000000-0000-4000-9000-0000000000f2'::uuid],
  'the result is gone, and no other'
);

select is(
  (select count(*)::int from public.race_result_corrections),
  0,
  'its corrections go with it'
);

select is(
  (select public.medal_earned(g, e, false)
   from public.registrations g
   join public.events e on e.id = g.event_id
   where g.id = '00000000-0000-4000-9000-0000000000b1'),
  false,
  'and so does the medal'
);

-- Beto, left without a result, sends a new one.
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select is(
  (select r.status::text from public.submit_race_result(
     '00000000-0000-4000-9000-0000000000e1', 3100,
     '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp'
   ) r),
  'pending',
  'the runner can send a new finish'
);

select is(
  (select count(*)::int from public.race_result_deletions),
  0,
  'and does not read the log'
);

reset role;

-- The other statuses -------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select d.status::text
   from tests.delete_result('00000000-0000-4000-9000-0000000000f2', '2026-01-02 00:00:00+00') d),
  'pending',
  'a submission waiting for review is deleted'
);

reset role;

-- Beto's new one is sent back.
update public.race_results set
  status = 'rejected', reviewed_at = '2026-01-05 00:00:00+00', review_note = 'Wrong date'
where registration_id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select d.status::text
   from tests.delete_result(
     (select r.id from public.race_results r
      where r.registration_id = '00000000-0000-4000-9000-0000000000b1'),
     '2026-01-05 00:00:00+00') d),
  'rejected',
  'one sent back is deleted'
);

reset role;

-- Then disqualified, with the medal out: only an accepted result holds a
-- medal back.
insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path, status, reviewed_at,
  disqualified_at, disqualification_reason
) values (
  '00000000-0000-4000-9000-0000000000f3',
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  1700,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp',
  'disqualified', '2026-01-06 00:00:00+00', now(), 'Cut the course'
);

update public.registrations set medal_picked_up_at = now()
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select d.status::text
   from tests.delete_result('00000000-0000-4000-9000-0000000000f3', '2026-01-06 00:00:00+00') d),
  'disqualified',
  'a disqualified one is deleted, even with its medal already out'
);

-- Beto was blocked by the disqualification; no longer.
reset role;
select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select is(
  (select r.status::text from public.submit_race_result(
     '00000000-0000-4000-9000-0000000000e1', 3100,
     '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000d2.webp'
   ) r),
  'pending',
  'and its runner can send evidence again'
);

reset role;

select * from finish();
rollback;
