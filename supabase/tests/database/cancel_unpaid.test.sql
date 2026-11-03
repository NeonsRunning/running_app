-- cancel_unpaid_registration(): a card payment taken back — refunded in
-- full or lost to a chargeback — cancels the sign-up it paid for.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns "Refund Run 10K"
--   3  runner Ana   — paid by card, result waiting on review; refunded
--   4  runner Beto  — paid by card, result accepted; disputed and lost
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
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com');

update public.profiles set account_type = 'organizer'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city, accepts_results
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'refund-run-test', 'published', now(), 'Refund Run 10K', 'Road Race',
  current_date, '18:00', current_date, 'Paseo Caribe', 'San Juan', true
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
  payment_method, payment_intent_id, paid_at
) values (
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000003',
  'confirmed', 1001,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198', 35.68,
  'stripe', 'pi_test_ana', now() - interval '1 day'
), (
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 1002,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199', 35.68,
  'stripe', 'pi_test_beto', now() - interval '1 day'
);

insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path, status, reviewed_at
) values (
  '00000000-0000-4000-9000-0000000000f1',
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000003',
  2700,
  '00000000-0000-4000-8000-000000000003/00000000-0000-4000-9000-0000000000f9.webp',
  'pending', null
), (
  '00000000-0000-4000-9000-0000000000f2',
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  2900,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f8.webp',
  'accepted', now()
);

select plan(7);

select ok(
  not has_function_privilege('authenticated', 'public.cancel_unpaid_registration(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cancel_unpaid_registration(text)', 'EXECUTE'),
  'only the webhook, with the service role, cancels a sign-up for a refund'
);

select is(
  (public.cancel_unpaid_registration('pi_test_ana')).status::text,
  'cancelled',
  'a sign-up whose payment was refunded in full is cancelled'
);

select is(
  (select count(*)::int from public.race_results
   where registration_id = '00000000-0000-4000-9000-0000000000b1'),
  0,
  'and its result still waiting on review goes with it'
);

select isnt(
  (select cancelled_at from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  null,
  'stamped as cancelled'
);

select is(
  (public.cancel_unpaid_registration('pi_test_ana')).id,
  null,
  'a second delivery changes nothing'
);

select is(
  (public.cancel_unpaid_registration('pi_test_beto')).id,
  null,
  'a runner whose result was accepted is left for a person to decide'
);

select is(
  (select status::text from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b2'),
  'confirmed',
  'and keeps their sign-up'
);

select * from finish();
rollback;
