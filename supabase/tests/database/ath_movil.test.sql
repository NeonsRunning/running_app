-- ATH Móvil: who may approve a payment (SEC-005), and reused references.
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

select plan(8);

-- Ana signs up and says she paid with ATH Móvil.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select lives_ok(
  $$ select public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details()) $$,
  'Ana starts a sign-up'
);

select lives_ok(
  $$ select public.submit_ath_movil_payment(r.id, 'REF-12345')
     from public.registrations r
     where r.runner_id = '00000000-0000-4000-8000-000000000003' $$,
  'Ana submits her ATH Móvil reference'
);

reset role;

-- Her registration's id, readable from any role. Lookups through row-level
-- security would hand a stranger null and pass for the wrong reason.
select set_config('tests.ana_reg', id::text, true)
from public.registrations
where runner_id = '00000000-0000-4000-8000-000000000003';

-- Olga organizes the race but does not hold the business account it went to.
select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  public.can_review_ath_movil_payment(current_setting('tests.ana_reg')::uuid),
  false,
  'the organizer cannot review a payment into an account they do not own'
);

select throws_ok(
  $$ select public.review_ath_movil_payment(
       current_setting('tests.ana_reg')::uuid, true) $$,
  'P0001',
  'notAllowed',
  'so approving it is refused'
);

reset role;

-- An admin makes Olga the account's owner.
update public.ath_movil_accounts set owner_id = '00000000-0000-4000-8000-000000000001'
where id = '00000000-0000-4000-9000-0000000000a1';

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select status::text from public.review_ath_movil_payment(
     current_setting('tests.ana_reg')::uuid, true)),
  'confirmed',
  'the organizer approves a payment into an account they own'
);

reset role;

-- Omar owns the account too now, but it is not his race.
update public.ath_movil_accounts set owner_id = '00000000-0000-4000-8000-000000000002'
where id = '00000000-0000-4000-9000-0000000000a1';
update public.registrations set
  status = 'pending', bib = null, paid_at = null, hold_expires_at = 'infinity'
where id = current_setting('tests.ana_reg')::uuid;

select tests.act_as('00000000-0000-4000-8000-000000000002');
set local role authenticated;

select is(
  public.can_review_ath_movil_payment(current_setting('tests.ana_reg')::uuid),
  false,
  'owning the account is not enough without organizing the race'
);

reset role;

-- Ada, a platform admin, reviews anything.
select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  public.can_review_ath_movil_payment(current_setting('tests.ana_reg')::uuid),
  true,
  'a platform admin may review any payment'
);

reset role;

-- Beto's paid sign-up is cancelled, and he starts again with Ana's receipt.
update public.registrations set status = 'cancelled', cancelled_at = now()
where id = '00000000-0000-4000-9000-0000000000b1';

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select throws_ok(
  $$ select public.submit_ath_movil_payment(
       (public.register_for_event('00000000-0000-4000-9000-0000000000c1', tests.ana_details())).id,
       'ref-12345') $$,
  'P0001',
  'referenceUsed',
  'a reference already used on another sign-up is refused, whatever its case'
);

reset role;

select * from finish();
rollback;
