-- Organizers hiding the spots left: what save_event() keeps, and how
-- search_events() files a nearly full race with them hidden.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, kept inline so the file runs on its own, by `supabase test db` or
-- pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns every race here
--   runners 100–108, who fill nine of the ten spots on e1
--
-- Races:
--   e1  "Nearly Full 10K" — next month, ten spots, nine taken
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
  ('00000000-0000-4000-8000-000000000001', 'olga@example.com');

insert into auth.users (id, email)
select
  format('00000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('runner%s@example.com', n)
from generate_series(100, 108) n;

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'nearly-full-test', 'published', now(), 'Nearly Full 10K', 'Road Race',
  current_date + 30, '18:00', current_date + 20, 'Paseo Caribe', 'San Juan'
);

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1', '10K', 10, 30, 10, '18:00');

insert into public.registrations (
  event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone, amount,
  payment_method, payment_intent_id, paid_at
)
select
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  format('00000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'confirmed', 1000 + n,
  'Runner', n::text, format('runner%s@example.com', n), '787-555-0100',
  '1990-01-01', 'm', 'Contact', '787-555-0199', 35,
  'stripe', format('pi_test_spots_%s', n), now()
from generate_series(100, 108) n;

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

select plan(9);

select is(
  (select show_spots_left from public.events where id = '00000000-0000-4000-9000-0000000000e1'),
  true,
  'an event shows its spots left until someone says otherwise'
);

-- The listing, as a visitor sees it, spots shown.
set local role anon;

select is(
  tests.listed_count('00000000-0000-4000-9000-0000000000e1', array['almost-full']),
  1::bigint,
  'nine of ten spots taken files under almost full'
);

-- Olga hides the spots left.
reset role;
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.save_event(
       e.id, e.slug, to_jsonb(e) || '{"show_spots_left": false}',
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'an organizer hides the spots left'
);

select is(
  (select show_spots_left from public.events where id = '00000000-0000-4000-9000-0000000000e1'),
  false,
  'save_event() keeps the choice'
);

reset role;
set local role anon;

select is(
  tests.listed_count('00000000-0000-4000-9000-0000000000e1', array['almost-full']),
  0::bigint,
  'with the spots hidden it no longer files under almost full'
);

select is(
  tests.listed_count('00000000-0000-4000-9000-0000000000e1', array['open']),
  1::bigint,
  'it files under open instead'
);

-- A save that leaves the flag out, as an older client would, keeps the
-- default rather than hiding anything.
reset role;
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.save_event(
       null, 'no-flag-test',
       (to_jsonb(e) - 'show_spots_left') || '{"name": "No Flag 10K"}',
       '[{"distance": "10K", "distance_km": 10, "price": 30, "capacity": 100}]'::jsonb)
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'a new event saved without the flag goes up'
);

select is(
  (select show_spots_left from public.events where slug = 'no-flag-test'),
  true,
  'and shows its spots left'
);

reset role;

-- The flag is written through save_event() only.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ update public.events set show_spots_left = true
     where id = '00000000-0000-4000-9000-0000000000e1' $$,
  '42501',
  null,
  'nobody writes the flag straight to the table'
);

reset role;

select * from finish();
rollback;
