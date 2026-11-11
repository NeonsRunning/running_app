-- The distance a runner's app recorded: sent with the result, read for pace.
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

-- Beto's race is today and takes results.
update public.events set
  accepts_results = true,
  event_date = (now() at time zone 'America/Puerto_Rico')::date,
  registration_closes = (now() at time zone 'America/Puerto_Rico')::date
where id = '00000000-0000-4000-9000-0000000000e1';

-- Public, so the results page lists him.
update public.profiles set is_public = true
where id = '00000000-0000-4000-8000-000000000004';

select plan(7);

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select public.submit_race_result(
       '00000000-0000-4000-9000-0000000000e1', 3573,
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f1.webp',
       0
     ) $$,
  'P0001', 'distanceInvalid',
  'a distance of nothing is refused'
);

select throws_ok(
  $$ select public.submit_race_result(
       '00000000-0000-4000-9000-0000000000e1', 3573,
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f1.webp',
       501
     ) $$,
  'P0001', 'distanceInvalid',
  'nor one past 500 km'
);

select is(
  (select r.distance_run_km from public.submit_race_result(
     '00000000-0000-4000-9000-0000000000e1', 3573,
     '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f1.webp',
     10.014
   ) r),
  10.01::numeric,
  'the distance is kept, to hundredths'
);

select is(
  (select r.distance_run_km from public.submit_race_result(
     '00000000-0000-4000-9000-0000000000e1', 3573,
     '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f2.webp'
   ) r),
  null,
  'sent again with three arguments, as before, it has none'
);

select lives_ok(
  $$ select public.submit_race_result(
       '00000000-0000-4000-9000-0000000000e1', 3573,
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f3.webp',
       10.01
     ) $$,
  'and sent once more, with it'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;
select public.review_race_result(
  (select id from public.race_results
   where registration_id = '00000000-0000-4000-9000-0000000000b1'),
  true,
  (select submitted_at from public.race_results
   where registration_id = '00000000-0000-4000-9000-0000000000b1')
);

reset role;
set local role anon;

select is(
  (select distance_run_km from public.race_results
   where runner_id = '00000000-0000-4000-8000-000000000004'),
  10.01::numeric,
  'a visitor reads it on the accepted result'
);

select is(
  (select distance_run_km
   from public.public_event_results('00000000-0000-4000-9000-0000000000e1')),
  10.01::numeric,
  'and on the results page'
);

reset role;
select * from finish();
rollback;
