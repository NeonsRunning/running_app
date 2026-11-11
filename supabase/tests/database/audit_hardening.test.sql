-- The November audit's hardening (20261127120000_audit_hardening): column
-- grants, the evidence upload cap, and dashboards without removed races.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns "Hardened Run 10K" and the removed "Gone Run 5K"
--   3  runner Ana   — paid for the Gone Run
--   4  runner Beto  — paid for the Hardened Run, partly refunded
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
  'hardened-run-test', 'published', now(), 'Hardened Run 10K', 'Road Race',
  current_date, '18:00', current_date, 'Paseo Caribe', 'San Juan', true
), (
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-8000-000000000001',
  'gone-run-test', 'removed', now() - interval '5 days', 'Gone Run 5K', 'Road Race',
  current_date + 20, '07:00', current_date + 15, 'Parque Central', 'San Juan', false
);

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1',
   '10K', 10, 30, 10, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e2',
   '5K', 5, 20, 10, '07:00');

insert into public.registrations (
  id, event_id, category_id, runner_id, status, bib,
  first_name, last_name, email, phone, birth_date, gender,
  emergency_contact_name, emergency_contact_phone,
  amount, service_fee, sales_tax, amount_refunded,
  payment_method, payment_intent_id, paid_at
) values (
  -- Beto: $38 paid, $2 of it the service fee, $10 refunded.
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 1001,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199',
  38, 2, 0, 10,
  'stripe', 'pi_test_beto', now() - interval '1 day'
), (
  -- Ana: paid for the race an admin removed.
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-8000-000000000003',
  'confirmed', 1001,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198',
  22, 2, 0, 0,
  'stripe', 'pi_test_ana', now() - interval '1 day'
);

select plan(13);

-- 1. Column grants ------------------------------------------------------------

select ok(
  not has_column_privilege('anon', 'public.race_results', 'reviewed_by', 'SELECT')
  and not has_column_privilege('authenticated', 'public.race_results', 'reviewed_by', 'SELECT'),
  'nobody reads who accepted a result'
);

select ok(
  not has_column_privilege('anon', 'public.race_results', 'disqualified_by', 'SELECT')
  and not has_column_privilege('authenticated', 'public.race_results', 'disqualified_by', 'SELECT'),
  'nor who disqualified one'
);

select ok(
  not has_column_privilege('anon', 'public.race_results', 'evidence_path', 'SELECT')
  and not has_column_privilege('anon', 'public.race_results', 'registration_id', 'SELECT'),
  'visitors see neither the evidence path nor the registration'
);

select ok(
  has_column_privilege('anon', 'public.race_results', 'finish_seconds', 'SELECT')
  and has_column_privilege('authenticated', 'public.race_results', 'evidence_path', 'SELECT'),
  'what the public profile and the review queue read is still granted'
);

select ok(
  not has_column_privilege('anon', 'public.ath_movil_accounts', 'owner_id', 'SELECT')
  and has_column_privilege('anon', 'public.ath_movil_accounts', 'path', 'SELECT'),
  'visitors see an ATH Móvil account but not who holds it'
);

select ok(
  has_column_privilege('authenticated', 'public.ath_movil_accounts', 'owner_id', 'SELECT'),
  'signed-in reviewers still do'
);

-- 2. Evidence uploads ----------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-a000-000000000001.webp'),
       ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-a000-000000000002.webp') $$,
  'a runner with one result to claim uploads a file, and a retry'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-a000-000000000003.webp') $$,
  'and one more'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('race-evidence', '00000000-0000-4000-8000-000000000004/00000000-0000-4000-a000-000000000004.webp') $$,
  '42501',
  null,
  'but cannot keep filling the folder'
);

reset role;

-- 4. Dashboards ---------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  jsonb_array_length(
    public.organizer_dashboard_summary(
      '00000000-0000-4000-8000-000000000001', now() - interval '30 days', current_date
    ) -> 'per_event'
  ),
  1,
  'the organizer''s dashboard leaves out the race an admin removed'
);

select is(
  (public.organizer_dashboard_summary(
     '00000000-0000-4000-8000-000000000001', now() - interval '30 days', current_date
   ) -> 'per_event' -> 0 ->> 'revenue')::numeric,
  26::numeric,
  'and counts revenue net of the fee and the refund'
);

select is(
  (select revenue from public.event_signup_totals(
     array['00000000-0000-4000-9000-0000000000e1'::uuid])),
  26::numeric,
  'the event''s own card shows the same figure'
);

reset role;

select is(
  (select runners from public.platform_stats()),
  1::bigint,
  'the platform counts runners of races that were not removed'
);

select * from finish();
rollback;
