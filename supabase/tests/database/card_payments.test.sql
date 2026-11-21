-- Organizers switching card payments off: what save_event() keeps, and the
-- event it refuses because runners would have no way to pay.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, kept inline so the file runs on its own, by `supabase test db` or
-- pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns every race here
--
-- ATH Móvil accounts:
--   a1  active
--   a2  retired
--
-- Races:
--   e1  "Card Or ATH 10K" — next month, takes ATH Móvil into a1
--   e2  "Card Only 10K" — next month, no ATH Móvil account
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

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.ath_movil_accounts (id, label, path, active) values
  ('00000000-0000-4000-9000-0000000000a1', 'NEONS RUNNING', '/NeonsRunningTest', true),
  ('00000000-0000-4000-9000-0000000000a2', 'Retired', '/NeonsRetiredTest', false);

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city, ath_movil_account_id
) values
  (
    '00000000-0000-4000-9000-0000000000e1',
    '00000000-0000-4000-8000-000000000001',
    'card-or-ath-test', 'published', now(), 'Card Or ATH 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 20, 'Paseo Caribe', 'San Juan',
    '00000000-0000-4000-9000-0000000000a1'
  ),
  (
    '00000000-0000-4000-9000-0000000000e2',
    '00000000-0000-4000-8000-000000000001',
    'card-only-test', 'published', now(), 'Card Only 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 20, 'Paseo Caribe', 'San Juan',
    null
  );

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1', '10K', 10, 30, 10, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e2', '10K', 10, 30, 10, '18:00');

-- Save an event as it stands, with `p_patch` laid over its columns.
create or replace function tests.save_with(p_id uuid, p_patch jsonb)
returns public.events
language sql
as $$
  select public.save_event(
    e.id, e.slug, to_jsonb(e) || p_patch,
    (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
  from public.events e where e.id = p_id;
$$;

grant execute on function tests.save_with(uuid, jsonb) to authenticated;
-- End of fixtures.

select plan(10);

select is(
  (select accepts_card_payments from public.events where id = '00000000-0000-4000-9000-0000000000e1'),
  true,
  'an event takes cards until someone says otherwise'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

-- Olga switches cards off on the race that takes ATH Móvil.
select lives_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e1',
       '{"accepts_card_payments": false}') $$,
  'an organizer switches cards off on a race with an ATH Móvil account'
);

reset role;
select is(
  (select accepts_card_payments from public.events where id = '00000000-0000-4000-9000-0000000000e1'),
  false,
  'save_event() keeps the choice'
);
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

-- With cards off, the account cannot go, nor be swapped for a retired one.
select throws_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e1',
       '{"accepts_card_payments": false, "ath_movil_account_id": null}') $$,
  'P0001',
  'paymentMethodRequired',
  'cards off and no ATH Móvil account is refused'
);

select throws_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e2',
       '{"accepts_card_payments": false}') $$,
  'P0001',
  'paymentMethodRequired',
  'so is switching cards off on a race that never took ATH Móvil'
);

select throws_ok(
  $$ select public.save_event(
       null, 'no-way-to-pay-test',
       to_jsonb(e) || '{"name": "No Way To Pay 10K", "status": "draft", "accepts_card_payments": false}',
       '[{"distance": "10K", "distance_km": 10, "price": 30, "capacity": 100}]'::jsonb)
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e2' $$,
  'P0001',
  'paymentMethodRequired',
  'and a new draft with neither'
);

-- The account on the race is retired while cards are off.
reset role;
update public.ath_movil_accounts set active = false
where id = '00000000-0000-4000-9000-0000000000a1';
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e1',
       '{"accepts_card_payments": false}') $$,
  'P0001',
  'paymentMethodRequired',
  'a retired account does not count as a way to pay'
);

select lives_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e1',
       '{"accepts_card_payments": true}') $$,
  'switching cards back on saves, retired account and all'
);

-- A save that leaves the flag out, as an older client would, keeps cards on.
select lives_ok(
  $$ select public.save_event(
       e.id, e.slug, to_jsonb(e) - 'accepts_card_payments',
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e2' $$,
  'an event saved without the flag goes through'
);

reset role;
select is(
  (select accepts_card_payments from public.events where id = '00000000-0000-4000-9000-0000000000e2'),
  true,
  'and still takes cards'
);

select * from finish();
rollback;
