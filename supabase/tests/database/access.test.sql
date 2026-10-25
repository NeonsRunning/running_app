-- Access rules: sign-up, profiles, saved events, storage, account deletion,
-- and what the public search and stats let through.
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

-- This file's own: Neon Night takes results, and Olga has a draft and a
-- removed race on the same weekend, both of which must stay out of sight.
update public.events set accepts_results = true
where id = '00000000-0000-4000-9000-0000000000e1';

-- What a caller sees of profile_private: refused outright or filtered to
-- nothing both count as nothing, whichever the grants decide.
create or replace function tests.private_rows_visible()
returns integer
language plpgsql
as $$
begin
  return (select count(*)::int from public.profile_private);
exception when insufficient_privilege then
  return 0;
end;
$$;

grant execute on function tests.private_rows_visible() to anon;
grant usage on schema tests to anon;

create temp table stats_before as select * from public.platform_stats();

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city
) values
  ('00000000-0000-4000-9000-0000000000e2',
   '00000000-0000-4000-8000-000000000001',
   'secret-draft-test', 'draft', null, 'Secret Draft 5K', 'Road Race',
   current_date + 30, '07:00', current_date + 25, 'Parque Central', 'San Juan'),
  ('00000000-0000-4000-9000-0000000000e3',
   '00000000-0000-4000-8000-000000000001',
   'removed-race-test', 'removed', now(), 'Removed Race 5K', 'Road Race',
   current_date + 30, '07:00', current_date + 25, 'Parque Central', 'San Juan');

insert into public.event_categories (event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000e2', '5K', 5, 20, 100, '07:00'),
  ('00000000-0000-4000-9000-0000000000e3', '5K', 5, 20, 100, '07:00');

select plan(52);

-- ---------------------------------------------------------------------------
-- Sign-up
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.next_handle(text)', 'execute'),
  'visitors cannot probe handles through next_handle()'
);
select ok(
  not has_function_privilege('authenticated', 'public.next_handle(text)', 'execute'),
  'signed-in users cannot either'
);

-- Metadata the profile's checks would refuse: an 81+ character name and an
-- avatar that is not http(s). Sign-up has to survive both.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000006', 'long@example.com',
   jsonb_build_object('full_name', repeat('Ana ', 40), 'avatar_url', 'javascript:alert(1)')),
  ('00000000-0000-4000-8000-000000000007', 'pic@example.com',
   jsonb_build_object('name', 'Pia Torres', 'avatar_url', 'https://example.com/pia.png'));

select is(
  (select char_length(full_name) from public.profiles
   where id = '00000000-0000-4000-8000-000000000006'),
  79,
  'a name too long for the profile is cut to fit (and its trailing space trimmed)'
);
select is(
  (select avatar_url from public.profiles
   where id = '00000000-0000-4000-8000-000000000006'),
  null,
  'an avatar URL that is not http(s) is dropped'
);
select is(
  (select avatar_url from public.profiles
   where id = '00000000-0000-4000-8000-000000000007'),
  'https://example.com/pia.png',
  'an https avatar URL is kept'
);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ update public.profiles set account_type = 'organizer'
     where id = '00000000-0000-4000-8000-000000000003' $$,
  '42501',
  null,
  'a runner cannot make themselves an organizer'
);

select is(
  (select count(*)::int from public.profile_private
   where id = '00000000-0000-4000-8000-000000000003'),
  1,
  'a runner reads their own private details'
);
select is(
  (select count(*)::int from public.profile_private
   where id = '00000000-0000-4000-8000-000000000004'),
  0,
  'but not another runner''s'
);

update public.profile_private set phone = '787-555-0000'
where id = '00000000-0000-4000-8000-000000000004';

reset role;

select is(
  (select phone from public.profile_private
   where id = '00000000-0000-4000-8000-000000000004'),
  null,
  'nor can they write another runner''s'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(
  tests.private_rows_visible(),
  0,
  'visitors read no private details at all'
);

reset role;

-- ---------------------------------------------------------------------------
-- Saved events
-- ---------------------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select lives_ok(
  $$ insert into public.saved_events (event_slug) values ('neon-night-10k-test') $$,
  'a runner saves a published race'
);

-- A draft, a removed race and a slug nobody holds all fail alike, so a save
-- cannot tell which slugs exist.
select throws_ok(
  $$ insert into public.saved_events (event_slug) values ('secret-draft-test') $$,
  '42501',
  null,
  'a draft cannot be saved'
);
select throws_ok(
  $$ insert into public.saved_events (event_slug) values ('removed-race-test') $$,
  '42501',
  null,
  'a removed race cannot be saved'
);
select throws_ok(
  $$ insert into public.saved_events (event_slug) values ('no-such-race-test') $$,
  '42501',
  null,
  'a slug that names nothing fails the same way'
);
select throws_ok(
  $$ insert into public.saved_events (runner_id, event_slug)
     values ('00000000-0000-4000-8000-000000000004', 'neon-night-10k-test') $$,
  '42501',
  null,
  'a runner cannot save for someone else'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$ insert into public.saved_events (event_slug) values ('secret-draft-test') $$,
  '42501',
  null,
  'not even its organizer saves a draft'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select is(
  (select count(*)::int from public.saved_events),
  0,
  'a runner does not see another runner''s saves'
);

delete from public.saved_events
where runner_id = '00000000-0000-4000-8000-000000000003';

reset role;

-- Unpublished after it was saved: still listed, still removable.
update public.events set status = 'draft', published_at = null
where id = '00000000-0000-4000-9000-0000000000e1';

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (select count(*)::int from public.saved_events),
  1,
  'a save survives its race being unpublished, and another runner could not delete it'
);

delete from public.saved_events where event_slug = 'neon-night-10k-test';

select is(
  (select count(*)::int from public.saved_events),
  0,
  'and can still be removed'
);

reset role;

update public.events set status = 'published', published_at = now()
where id = '00000000-0000-4000-9000-0000000000e1';

-- ---------------------------------------------------------------------------
-- Storage: race evidence (private)
-- ---------------------------------------------------------------------------

-- Ana has no paid sign-up.
select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'race-evidence',
       '00000000-0000-4000-8000-000000000003/00000000-0000-4000-a000-000000000001.webp') $$,
  '42501',
  null,
  'a runner without a paid sign-up cannot upload evidence'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'race-evidence',
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-a000-000000000002.webp') $$,
  'a runner with a paid sign-up uploads evidence to their own folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'race-evidence',
       '00000000-0000-4000-8000-000000000003/00000000-0000-4000-a000-000000000003.webp') $$,
  '42501',
  null,
  'but not to someone else''s'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'race-evidence'),
  1,
  'the runner reads their own evidence'
);

reset role;

-- Submitted: the organizer of the event may now read the file.
insert into public.race_results (
  registration_id, event_id, category_id, runner_id, finish_seconds, evidence_path
) values (
  '00000000-0000-4000-9000-0000000000b1',
  '00000000-0000-4000-9000-0000000000e1',
  '00000000-0000-4000-9000-0000000000c1',
  '00000000-0000-4000-8000-000000000004',
  3000,
  '00000000-0000-4000-8000-000000000004/00000000-0000-4000-a000-000000000002.webp'
);

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'race-evidence'),
  0,
  'another runner reads none of it'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'race-evidence'),
  1,
  'the event''s organizer reads evidence submitted to it'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000002');
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'race-evidence'),
  0,
  'another organizer reads none of it'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000005');
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'race-evidence'),
  1,
  'an admin reads all of it'
);

reset role;

-- ---------------------------------------------------------------------------
-- Storage: avatars
-- ---------------------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     select 'avatars',
       '00000000-0000-4000-8000-000000000003/00000000-0000-4000-b000-00000000000' || n || '.webp'
     from generate_series(1, 4) n $$,
  'a runner uploads photos to their own folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'avatars',
       '00000000-0000-4000-8000-000000000004/00000000-0000-4000-b000-000000000009.webp') $$,
  '42501',
  null,
  'but not to someone else''s'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'avatars',
       '00000000-0000-4000-8000-000000000003/00000000-0000-4000-b000-000000000005.webp') $$,
  'a fifth file still fits'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'avatars',
       '00000000-0000-4000-8000-000000000003/00000000-0000-4000-b000-000000000006.webp') $$,
  '42501',
  null,
  'a sixth does not: the folder is not free storage'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  5,
  'a runner lists only their own folder'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  0,
  'another runner lists none of it'
);

-- Storage refuses any direct DELETE (storage.protect_delete), so the delete
-- policies are out of reach from SQL; what is checked is that nothing goes.
select throws_ok(
  $$ delete from storage.objects where bucket_id = 'avatars' $$,
  '42501', null, 'a direct delete is refused'
);

reset role;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  5,
  'nor deletes any of it'
);

-- ---------------------------------------------------------------------------
-- Storage: event images
-- ---------------------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'event-images',
       '00000000-0000-4000-8000-000000000001/00000000-0000-4000-c000-000000000001.webp') $$,
  'an organizer uploads to their own folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'event-images',
       '00000000-0000-4000-8000-000000000002/00000000-0000-4000-c000-000000000002.webp') $$,
  '42501',
  null,
  'but not to another organizer''s'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values (
       'event-images',
       '00000000-0000-4000-8000-000000000003/00000000-0000-4000-c000-000000000003.webp') $$,
  '42501',
  null,
  'a runner cannot upload event images, even to their own folder'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000002');
set local role authenticated;

select throws_ok(
  $$ delete from storage.objects where bucket_id = 'event-images' $$,
  '42501', null, 'a direct delete is refused'
);

reset role;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'event-images'),
  1,
  'another organizer cannot delete an organizer''s image'
);

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  $$ select public.request_account_deletion() $$,
  '42501',
  null,
  'a visitor cannot file a deletion request'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (public.request_account_deletion()).user_id,
  '00000000-0000-4000-8000-000000000003'::uuid,
  'a runner files a request for their own account'
);
select throws_ok(
  $$ insert into public.account_deletion_requests (user_id)
     values ('00000000-0000-4000-8000-000000000004') $$,
  '42501',
  null,
  'nobody writes the table directly'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

select is(
  (select count(*)::int from public.account_deletion_requests),
  0,
  'another runner does not see the request'
);
select throws_ok(
  $$ select public.cancel_account_deletion() $$,
  'P0001',
  'notRequested',
  'and cannot withdraw it: cancelling only ever touches the caller''s own'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (public.cancel_account_deletion()).user_id,
  '00000000-0000-4000-8000-000000000003'::uuid,
  'the runner withdraws their own request'
);

reset role;

select is(
  (select count(*)::int from public.account_deletion_requests),
  0,
  'and it is gone'
);

-- ---------------------------------------------------------------------------
-- Public search and stats
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select ok(
  '00000000-0000-4000-9000-0000000000e1'::uuid in (
    select id from public.search_events(current_date)),
  'search lists the published race'
);
select ok(
  '00000000-0000-4000-9000-0000000000e2'::uuid not in (
    select id from public.search_events(current_date)),
  'but not the draft'
);
select ok(
  '00000000-0000-4000-9000-0000000000e3'::uuid not in (
    select id from public.search_events(current_date)),
  'nor the removed race'
);
select ok(
  '00000000-0000-4000-9000-0000000000e2'::uuid not in (
    select id from public.search_events(current_date, p_query => 'secret')),
  'not even when searched for by name'
);

reset role;

select is(
  (select races from public.platform_stats()),
  (select races from stats_before),
  'drafts and removed races do not count as races'
);

select * from finish();
rollback;
