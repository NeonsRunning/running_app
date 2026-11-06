-- The November audit's fixes (20261126120000_audit_fixes): save_event()'s
-- medal backfill, reminder reset and image folders; a result re-sent during
-- its review; restoring a race whose runners were refunded; ATH Móvil review
-- by a demoted owner; and paid registrations kept from deletion.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, the same in every test file: kept inline so each file runs on
-- its own, by `supabase test db` or pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns "Audit Run 10K" and the removed "Storm Run 5K",
--      and the ATH Móvil account the first takes payments in
--   2  organizer Omar — owns nothing here
--   3  runner Ana   — paid for the Storm Run, not refunded
--   4  runner Beto  — paid for both; kit by mail, medal at the tent; refunded
--      for the Storm Run
--   5  admin Ada (in platform_admins)
--   6  runner Cruz  — ATH Móvil payment waiting on review
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
  ('00000000-0000-4000-8000-000000000005', 'ada@example.com'),
  ('00000000-0000-4000-8000-000000000006', 'cruz@example.com');

update public.profiles set account_type = 'organizer'
where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000005');

insert into public.ath_movil_accounts (id, label, path, owner_id) values (
  '00000000-0000-4000-9000-0000000000a1', 'Olga Runs', '/OlgaRunsTest',
  '00000000-0000-4000-8000-000000000001'
);

-- Ten days out, mailing kits and medals, with a cover in Olga's folder.
insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city,
  ath_movil_account_id, accepts_results, offers_mail, shipping_price,
  mails_medals, image_path
) values (
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-8000-000000000001',
  'audit-run-test', 'published', now(), 'Audit Run 10K', 'Road Race',
  current_date + 10, '18:00', current_date + 5, 'Paseo Caribe', 'San Juan',
  '00000000-0000-4000-9000-0000000000a1', true, true, 8,
  true,
  '00000000-0000-4000-8000-000000000001/00000000-0000-4000-9000-00000000c0e1.webp'
), (
  -- Taken down by an admin; its runners were owed their money back.
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-8000-000000000001',
  'storm-run-test', 'removed', now() - interval '5 days', 'Storm Run 5K', 'Road Race',
  current_date + 20, '07:00', current_date + 15, 'Parque Central', 'San Juan',
  null, false, false, default,
  false, null
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
  emergency_contact_name, emergency_contact_phone, amount, amount_refunded,
  payment_method, payment_intent_id, payment_reference, ath_movil_account_id,
  payment_submitted_at, hold_expires_at, paid_at,
  ships_by_mail, mailing_address, medal_by_mail,
  reminder_email_sent_at
) values (
  -- Beto at the Audit Run: kit by mail, medal at the tent, reminded already.
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 1001,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199', 38, 0,
  'stripe', 'pi_test_beto', null, null,
  null, null, now() - interval '1 day',
  true, 'Calle Sol 2, Ponce, PR 00730', false,
  now()
), (
  -- Cruz at the Audit Run: ATH Móvil reference sent, waiting on review.
  '00000000-0000-4000-9000-0000000000b2',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000006',
  'pending', null,
  'Cruz', 'Ortiz', 'cruz@example.com', '787-555-0106', '1988-06-06', 'x',
  'Rosa Ortiz', '787-555-0196', 30, 0,
  'ath_movil', null, 'REF-CRUZ', '00000000-0000-4000-9000-0000000000a1',
  now(), 'infinity', null,
  false, null, false,
  null
), (
  -- Beto at the Storm Run: refunded in full while it was down.
  '00000000-0000-4000-9000-0000000000b3',
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-8000-000000000004',
  'confirmed', 1001,
  'Beto', 'Rivera', 'beto@example.com', '787-555-0104', '1990-05-05', 'm',
  'Carla Rivera', '787-555-0199', 20, 20,
  'stripe', 'pi_test_beto_storm', null, null,
  null, null, now() - interval '10 days',
  false, null, false,
  null
), (
  -- Ana at the Storm Run: paid, not refunded.
  '00000000-0000-4000-9000-0000000000b4',
  '00000000-0000-4000-9000-0000000000e2',
  '00000000-0000-4000-9000-0000000000c2',
  '00000000-0000-4000-8000-000000000003',
  'confirmed', 1002,
  'Ana', 'Figueroa', 'ana@example.com', '787-555-0103', '1992-03-03', 'f',
  'Luis Figueroa', '787-555-0198', 20, 0,
  'stripe', 'pi_test_ana_storm', null, null,
  null, null, now() - interval '10 days',
  false, null, false,
  null
);

-- Beto's Audit Run finish, sent an hour ago and waiting on review.
insert into public.race_results (
  id, registration_id, event_id, category_id, runner_id,
  finish_seconds, evidence_path, submitted_at
) values (
  '00000000-0000-4000-9000-0000000000f1',
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  2700,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-9000-0000000000f9.webp',
  now() - interval '1 hour'
);

select plan(19);

-- 1. save_event() --------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.save_event(
       e.id, e.slug, to_jsonb(e) || '{"description": "Typo fixed."}',
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'the organizer saves an unrelated change'
);

reset role;

select is(
  (select medal_by_mail from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  false,
  'a runner who chose to pick their medal up keeps that choice'
);

select isnt(
  (select reminder_email_sent_at from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  null,
  'the same race day keeps its reminder sent'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.save_event(
       e.id, e.slug, to_jsonb(e) || '{"mails_medals": false}',
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'medals by mail switched off'
);

select lives_ok(
  $$ select public.save_event(
       e.id, e.slug, to_jsonb(e) || '{"mails_medals": true}',
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'and on again'
);

reset role;

select is(
  (select medal_by_mail from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  true,
  'switching it on still sends medals to the kit''s address'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select public.save_event(
       e.id, e.slug,
       to_jsonb(e) || jsonb_build_object('event_date', current_date + 11),
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'the race is postponed a day'
);

reset role;

select is(
  (select reminder_email_sent_at from public.registrations
   where id = '00000000-0000-4000-9000-0000000000b1'),
  null,
  'a new race day gets a reminder of its own'
);

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.save_event(
       e.id, e.slug,
       to_jsonb(e) || jsonb_build_object('route_image_path',
         '00000000-0000-4000-8000-000000000002/00000000-0000-4000-9000-00000000c0e2.webp'),
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'P0001', 'imageInvalid',
  'an organizer cannot point their listing at another organizer''s file'
);

select lives_ok(
  $$ select public.save_event(
       e.id, e.slug,
       to_jsonb(e) || jsonb_build_object('route_image_path',
         '00000000-0000-4000-8000-000000000001/00000000-0000-4000-9000-00000000c0e3.webp'),
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'but can use one of their own'
);

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select lives_ok(
  $$ select public.save_event(
       e.id, e.slug, to_jsonb(e) || '{"name": "Audit Run 10K (edited)"}',
       (select jsonb_agg(to_jsonb(c)) from public.event_categories c where c.event_id = e.id))
     from public.events e where e.id = '00000000-0000-4000-9000-0000000000e1' $$,
  'an admin''s edit keeps the organizer''s images as they are'
);

-- 2. review_race_result() --------------------------------------------------------

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ select public.review_race_result(
       '00000000-0000-4000-9000-0000000000f1', true, now()) $$,
  'P0001', 'resultChanged',
  'a result re-sent since the reviewer loaded it cannot be accepted unseen'
);

select lives_ok(
  $$ select public.review_race_result(
       '00000000-0000-4000-9000-0000000000f1', true, now() - interval '1 hour') $$,
  'the version the reviewer saw can be'
);

-- 4. admin_restore_event() --------------------------------------------------------

reset role;
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select lives_ok(
  $$ select public.admin_restore_event('00000000-0000-4000-9000-0000000000e2') $$,
  'an admin restores the removed race'
);

reset role;

select results_eq(
  $$ select id::text, status::text from public.registrations
     where event_id = '00000000-0000-4000-9000-0000000000e2' order by id $$,
  $$ values ('00000000-0000-4000-9000-0000000000b3', 'cancelled'),
            ('00000000-0000-4000-9000-0000000000b4', 'confirmed') $$,
  'the runner refunded in full is cancelled; the one still paid keeps their spot'
);

-- 6. Paid registrations are kept --------------------------------------------------

select throws_ok(
  $$ delete from public.registrations where id = '00000000-0000-4000-9000-0000000000b4' $$,
  'P0001', 'paymentRecordKept',
  'a paid registration cannot be deleted'
);

select throws_ok(
  $$ delete from auth.users where id = '00000000-0000-4000-8000-000000000003' $$,
  'P0001', 'paymentRecordKept',
  'nor taken away with its runner''s account'
);

-- 5. can_review_ath_movil_payment() -----------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select ok(
  public.can_review_ath_movil_payment('00000000-0000-4000-9000-0000000000b2'),
  'the organizer who owns the account reviews its payments'
);

reset role;
update public.profiles set account_type = 'runner'
where id = '00000000-0000-4000-8000-000000000001';
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select ok(
  not public.can_review_ath_movil_payment('00000000-0000-4000-9000-0000000000b2'),
  'and stops once they are no longer an organizer'
);

reset role;

select * from finish();
rollback;
