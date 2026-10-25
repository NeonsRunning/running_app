-- save_event()'s locked distances and event cap, the dashboard's island
-- days, and the public results functions.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga â€” owns "Neon Night 10K"
--   2  organizer Omar â€” owns nothing here; holds a spot as a runner
--   3  runner Ana â€” private profile
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

update public.profiles set is_public = false
where id = '00000000-0000-4000-8000-000000000003';

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000005');

-- A published race a month out, open for sign-ups.
insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'neon-night-10k-test', 'published', now(), 'Neon Night 10K', 'Road Race',
  current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan'
);

-- A 10K with runners in it, and a 5K nobody has signed up for.
insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time, position)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1',
   '10K', 10, 30, 5, '18:00', 0),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e1',
   '5K', 5, 25, 5, '18:30', 1);

-- Beto and Ana paid; Beto paid at 11:30 PM on the island, which is the next
-- day in UTC, a week after he started the checkout. Omar holds a spot.
insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, paid_at, created_at, hold_expires_at
) values
  ('00000000-0000-4000-9000-0000000000b1',
   '00000000-0000-4000-9000-0000000000e1',
   '00000000-0000-4000-9000-0000000000c1',
   '00000000-0000-4000-8000-000000000004',
   'confirmed', 1001,
   'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
   'Carla Rivera', '787-555-0199', 35.68,
   'stripe', 'pi_test_beto', '2026-03-01 23:30:00-04', '2026-02-22 10:00:00-04', null),
  ('00000000-0000-4000-9000-0000000000b2',
   '00000000-0000-4000-9000-0000000000e1',
   '00000000-0000-4000-9000-0000000000c1',
   '00000000-0000-4000-8000-000000000003',
   'confirmed', 1002,
   'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
   'Luis Figueroa', '787-555-0198', 35.68,
   'stripe', 'pi_test_ana', now(), now(), null),
  ('00000000-0000-4000-9000-0000000000b3',
   '00000000-0000-4000-9000-0000000000e1',
   '00000000-0000-4000-9000-0000000000c1',
   '00000000-0000-4000-8000-000000000002',
   'pending', null,
   'Omar', 'Ortiz', 'omar@example.com', '787-555-0102', '1985-02-02', 'm',
   'Olga Ortiz', '787-555-0197', 35.68,
   null, null, null, now(), now() + interval '30 minutes');

-- Both finished; Ana was faster, but her profile is private.
insert into public.race_results (
  registration_id, event_id, category_id, runner_id, finish_seconds, evidence_path, status
) values
  ('00000000-0000-4000-9000-0000000000b1',
   '00000000-0000-4000-9000-0000000000e1',
   '00000000-0000-4000-9000-0000000000c1',
   '00000000-0000-4000-8000-000000000004',
   2700,
   '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f1.webp',
   'accepted'),
  ('00000000-0000-4000-9000-0000000000b2',
   '00000000-0000-4000-9000-0000000000e1',
   '00000000-0000-4000-9000-0000000000c1',
   '00000000-0000-4000-8000-000000000003',
   2400,
   '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000f2.webp',
   'accepted');

-- The event's categories as save_event() takes them, with `p_patch`
-- applied to the one at `p_distance`.
create or replace function tests.categories_with(p_distance text, p_patch jsonb)
returns jsonb
language sql
as $$
  select jsonb_agg(
    case when c.distance::text = p_distance then to_jsonb(c) || p_patch else to_jsonb(c) end
    order by c.position
  )
  from public.event_categories c
  where c.event_id = '00000000-0000-4000-9000-0000000000e1';
$$;

grant execute on function tests.categories_with(text, jsonb) to authenticated;
-- End of fixtures.

select plan(12);

-- Olga, the organizer of Neon Night 10K.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

/* Locked distances --------------------------------------------------------- */

select throws_ok(
  $$ select public.save_event(e.id, e.slug, to_jsonb(e),
       tests.categories_with('10K', '{"distance_km": 10.5}'))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'P0001',
  'categoryDistanceLocked',
  'a category with runners keeps its kilometres'
);

select throws_ok(
  $$ select public.save_event(e.id, e.slug, to_jsonb(e),
       tests.categories_with('10K', '{"distance": "Half Marathon", "distance_km": 21.1}'))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'P0001',
  'categoryDistanceLocked',
  'a category with runners keeps its distance'
);

select lives_ok(
  $$ select public.save_event(e.id, e.slug, to_jsonb(e),
       tests.categories_with('10K', '{"price": 32, "distance_km": 10.00}'))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'its price still changes, and the same distance written differently is no change'
);

select lives_ok(
  $$ select public.save_event(e.id, e.slug, to_jsonb(e),
       tests.categories_with('5K', '{"distance": "3K", "distance_km": 3}'))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'a category nobody signed up for changes distance'
);

/* The event's cap ------------------------------------------------------------ */

select throws_ok(
  $$ select public.save_event(e.id, e.slug, to_jsonb(e) || '{"capacity": 2}',
       tests.categories_with('10K', '{}'))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'P0001',
  'eventCapacityBelowRegistered',
  'the event cap cannot go below two paid runners and a live hold'
);

select lives_ok(
  $$ select public.save_event(e.id, e.slug, to_jsonb(e) || '{"capacity": 3}',
       tests.categories_with('10K', '{}'))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'the event cap can meet them exactly'
);

/* Dashboard days ------------------------------------------------------------- */

select is(
  (select count(*)::integer
   from jsonb_array_elements(
     public.organizer_dashboard_summary(
       '00000000-0000-4000-8000-000000000001', '2026-01-01 00:00:00-04', current_date
     ) -> 'daily'
   ) d
   where d ->> 'day' = '2026-03-01'),
  1,
  'a sign-up counts on the island day it was paid'
);

select is(
  (select count(*)::integer
   from jsonb_array_elements(
     public.organizer_dashboard_summary(
       '00000000-0000-4000-8000-000000000001', '2026-01-01 00:00:00-04', current_date
     ) -> 'daily'
   ) d
   where d ->> 'day' in ('2026-03-02', '2026-02-22')),
  0,
  'not on the UTC day, nor the day the checkout started'
);

reset role;

/* Public results ------------------------------------------------------------- */

set local role anon;

select is(
  (select count(*)::integer
   from public.public_event_results('00000000-0000-4000-9000-0000000000e1')),
  1,
  'anyone reads the accepted results of runners with a public profile only'
);

select is(
  (select row(runner_id, bib, place)::text
   from public.public_event_results('00000000-0000-4000-9000-0000000000e1')),
  row('00000000-0000-4000-8000-000000000004'::uuid, 1001, 1::bigint)::text,
  'with the bib, and a place that leaves no gap for a private runner'
);

select is(
  (select finishers::integer from public.public_result_events()
   where event_id = '00000000-0000-4000-9000-0000000000e1'),
  1,
  'the results index counts the finishers it can list'
);

reset role;

update public.events set status = 'removed'
where id = '00000000-0000-4000-9000-0000000000e1';

set local role anon;

select is(
  (select count(*)::integer
   from public.public_event_results('00000000-0000-4000-9000-0000000000e1')),
  0,
  'a removed event lists no results'
);

reset role;

select * from finish();
rollback;
