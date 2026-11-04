-- Events marked sold out by hand: what save_event() keeps, who
-- register_for_event() turns away, and where search_events() lists them.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, kept inline so the file runs on its own, by `supabase test db` or
-- pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns every race here
--   3  runner Ana
--
-- Races:
--   e1  "Coming Up 10K"  — next month, open
--   e2  "Long Ago 10K"   — a year ago, not marked: no longer listed
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
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com');

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city
) values
  (
    '00000000-0000-4000-9000-0000000000e1',
    '00000000-0000-4000-8000-000000000001',
    'coming-up-test', 'published', now(), 'Coming Up 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 20, 'Paseo Caribe', 'San Juan'
  ),
  (
    '00000000-0000-4000-9000-0000000000e2',
    '00000000-0000-4000-8000-000000000001',
    'long-ago-test', 'published', now(), 'Long Ago 10K', 'Road Race',
    current_date - 365, '18:00', current_date - 370, 'Paseo Caribe', 'San Juan'
  );

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1', '10K', 10, 30, 100, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e2', '10K', 10, 30, 100, '18:00');

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

-- 1 when the listing shows this race under these statuses, else 0.
create or replace function tests.listed_count(p_id uuid, p_statuses text[])
returns bigint
language sql
as $$
  select count(*) from public.search_events(current_date, p_statuses => p_statuses)
  where id = p_id;
$$;

grant execute on function tests.listed_count(uuid, text[]) to anon, authenticated;
-- End of fixtures.

select plan(13);

-- Olga lists a race she ran months ago, marked sold out.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.save_event(
       null, 'past-reference-test',
       to_jsonb(e) || jsonb_build_object(
         'name', 'Past Reference 10K',
         'event_date', current_date - 60,
         'registration_closes', current_date - 70,
         'sold_out', true
       ),
       '[{"distance": "10K", "distance_km": 10, "price": 30, "capacity": 500}]'::jsonb)
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'an organizer publishes a past race marked sold out'
);

select is(
  (select sold_out from public.events where slug = 'past-reference-test'),
  true,
  'save_event() keeps the mark on a new event'
);

select is(
  (select sold_out from public.events where id = '00000000-0000-4000-9000-0000000000e1'),
  false,
  'an event is not sold out until someone says so'
);

-- A second past race, more recent, to check the order.
select lives_ok(
  $$ select public.save_event(
       null, 'recent-reference-test',
       to_jsonb(e) || jsonb_build_object(
         'name', 'Recent Reference 10K',
         'event_date', current_date - 10,
         'registration_closes', current_date - 20,
         'sold_out', true
       ),
       '[{"distance": "10K", "distance_km": 10, "price": 30, "capacity": 500}]'::jsonb)
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'a second past race goes up'
);

-- The listing, as a visitor sees it.
reset role;
set local role anon;

select is(
  tests.listed_count((select id from public.events where slug = 'past-reference-test'), null),
  1::bigint,
  'a past race marked sold out stays listed'
);

select is(
  tests.listed_count('00000000-0000-4000-9000-0000000000e2', null),
  0::bigint,
  'a past race not marked is still dropped from the listing'
);

select is(
  tests.listed_count((select id from public.events where slug = 'past-reference-test'), array['full']),
  1::bigint,
  'it files under sold out, not closed'
);

select is(
  tests.listed_count((select id from public.events where slug = 'past-reference-test'), array['closed']),
  0::bigint,
  'even though its registration dates have passed'
);

select is(
  (select array_agg(e.slug order by s.n)
   from public.search_events(current_date) with ordinality s(id, total, n)
   join public.events e on e.id = s.id
   where e.slug in ('coming-up-test', 'past-reference-test', 'recent-reference-test')),
  array['coming-up-test', 'recent-reference-test', 'past-reference-test'],
  'upcoming races first, then past ones, newest first'
);

select is(
  (select count(*)::int
   from public.search_events(current_date, p_until => current_date + 60) s
   join public.events e on e.id = s.id
   where e.slug in ('past-reference-test', 'recent-reference-test')),
  0,
  'a "within N days" search is about what is coming up'
);

-- An open race marked sold out turns a runner away, and marking it back
-- lets them in.
reset role;
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select public.save_event(
  e.id, e.slug, to_jsonb(e) || '{"sold_out": true}',
  (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1';

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'P0001',
  'soldOut',
  'a race marked sold out refuses a sign-up with room to spare'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select public.save_event(
  e.id, e.slug, to_jsonb(e) || '{"sold_out": false}',
  (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1';

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'taking the mark off reopens sign-ups'
);

reset role;

-- The flag is written through save_event() only.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ update public.events set sold_out = true
     where id = '00000000-0000-4000-9000-0000000000e1' $$,
  '42501',
  null,
  'nobody writes the mark straight to the table'
);

reset role;

select * from finish();
rollback;
