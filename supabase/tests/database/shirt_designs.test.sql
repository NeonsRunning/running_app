-- Shirt designs: who sees them, how save_event() keeps them, and what
-- register_for_event() takes for a shirt on a race that shows its designs.
begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures, kept inline so the file runs on its own, by `supabase test db` or
-- pasted into any SQL client.
--
-- People, by the last digit of their id:
--   1  organizer Olga — owns both races
--   2  organizer Omar — owns nothing here
--   3  runner Ana
--   4  runner Beto
--
-- Races, both next month, both with a $22 shirt in M and L:
--   e1  "Shirts 10K" — published. Designs: d1 "Black tee" and d2 "Blue tee"
--       on offer, d3 "Old tee" withdrawn. Distance: c1 10K ($30)
--   e2  "Plain 10K" — published, no designs. Distance: c2 10K ($30)
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
  ('00000000-0000-4000-8000-000000000002', 'omar@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'ana@example.com'),
  ('00000000-0000-4000-8000-000000000004', 'beto@example.com');

update public.profiles set account_type = 'organizer'
where id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002'
);

insert into public.events (
  id, organizer_id, slug, status, published_at, name, type,
  event_date, start_time, registration_closes, venue, city,
  minimum_age, offers_shirt, shirt_sizes, shirt_price
) values
  (
    '00000000-0000-4000-9000-0000000000e1',
    '00000000-0000-4000-8000-000000000001',
    'shirts-10k-test', 'published', now(), 'Shirts 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    14, true, '{M,L}', 22
  ),
  (
    '00000000-0000-4000-9000-0000000000e2',
    '00000000-0000-4000-8000-000000000001',
    'plain-10k-test', 'published', now(), 'Plain 10K', 'Road Race',
    current_date + 30, '18:00', current_date + 25, 'Paseo Caribe', 'San Juan',
    14, true, '{M,L}', 22
  );

insert into public.event_categories (id, event_id, distance, distance_km, price, capacity, start_time)
values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1', '10K', 10, 30, 50, '18:00'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000e2', '10K', 10, 30, 50, '18:00');

-- Pictures in Olga's own folder, as the wizard uploads them.
insert into public.event_shirts (id, event_id, name, image_path, offered, position) values
  ('00000000-0000-4000-9000-0000000000d1', '00000000-0000-4000-9000-0000000000e1', 'Black tee',
   '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000001.webp', true, 0),
  ('00000000-0000-4000-9000-0000000000d2', '00000000-0000-4000-9000-0000000000e1', 'Blue tee',
   '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000002.webp', true, 1),
  ('00000000-0000-4000-9000-0000000000d3', '00000000-0000-4000-9000-0000000000e1', 'Old tee',
   '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000003.webp', false, 2);

-- What a runner types at sign-up, with `p_extra` laid over it. The address is
-- for the shirts, which are mailed; a sign-up without any drops it.
create or replace function tests.runner(p_name text, p_extra jsonb default '{}')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', p_name, 'last_name', 'Figueroa',
    'email', lower(p_name) || '@example.com',
    'phone', '787-555-0103', 'birth_date', '1992-03-03', 'gender', 'f',
    'emergency_contact_name', 'Luis Figueroa', 'emergency_contact_phone', '787-555-0198',
    'wants_photos', false, 'donation', 0,
    'mailing_address', '123 Calle Luna, San Juan, PR 00901'
  ) || p_extra;
$$;

-- An event's stored designs as save_event() takes them, in order.
create or replace function tests.designs(p_event uuid)
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id, 'name', s.name, 'image_path', s.image_path, 'offered', s.offered)
    order by s.position), '[]'::jsonb)
  from public.event_shirts s where s.event_id = p_event;
$$;

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

grant execute on function tests.runner(text, jsonb) to authenticated;
grant execute on function tests.designs(uuid) to authenticated;
grant execute on function tests.save_with(uuid, jsonb) to authenticated;
-- End of fixtures.

select plan(27);

-- Who reads and writes the table ----------------------------------------------

select ok(
  has_table_privilege('anon', 'public.event_shirts', 'SELECT')
  and has_table_privilege('authenticated', 'public.event_shirts', 'SELECT')
  and not has_table_privilege('anon', 'public.event_shirts', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.event_shirts', 'INSERT, UPDATE, DELETE'),
  'anyone reads the designs; nobody writes them through the API'
);

select ok(
  has_table_privilege('authenticated', 'public.registration_shirts', 'SELECT')
  and not has_table_privilege('anon', 'public.registration_shirts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.registration_shirts', 'INSERT, UPDATE, DELETE'),
  'runners and organizers can read which design a sign-up chose'
);

set local role anon;
select is(
  (select count(*) from public.event_shirts
   where event_id = '00000000-0000-4000-9000-0000000000e1'),
  3::bigint,
  'a visitor sees a published race''s designs'
);
reset role;

-- A draft's designs are hidden with it.
update public.events set status = 'draft', published_at = null
where id = '00000000-0000-4000-9000-0000000000e2';
insert into public.event_shirts (id, event_id, name, image_path) values
  ('00000000-0000-4000-9000-0000000000d9', '00000000-0000-4000-9000-0000000000e2', 'Draft tee',
   '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000009.webp');

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;
select is(
  (select count(*) from public.event_shirts
   where event_id = '00000000-0000-4000-9000-0000000000e2'),
  0::bigint,
  'a runner does not see a draft''s designs'
);
reset role;

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  (select count(*) from public.event_shirts
   where event_id = '00000000-0000-4000-9000-0000000000e2'),
  1::bigint,
  'its organizer does'
);
reset role;

delete from public.event_shirts where id = '00000000-0000-4000-9000-0000000000d9';
update public.events set status = 'published', published_at = now()
where id = '00000000-0000-4000-9000-0000000000e2';

-- register_for_event() ---------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000003');
set local role authenticated;

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.runner('Ana', '{"shirts": [{"size": "M"}]}')) $$,
  'P0001', 'shirtDesignUnavailable',
  'a shirt on a race that shows its designs needs one picked'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.runner('Ana', '{"shirts": [{"size": "M",
         "design_id": "00000000-0000-4000-9000-0000000000d3"}]}')) $$,
  'P0001', 'shirtDesignUnavailable',
  'a withdrawn design cannot be picked'
);

select throws_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.runner('Ana', '{"shirts": [{"size": "M",
         "design_id": "00000000-0000-4000-9000-0000000000d1"}]}')) $$,
  'P0001', 'shirtDesignUnavailable',
  'nor another race''s design'
);

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.runner('Ana', '{"shirts": [{"size": "M",
         "design_id": "00000000-0000-4000-9000-0000000000d1"}]}')) $$,
  'a design on offer is taken'
);

select is(
  (select s.design_id from public.registration_shirts s
   join public.registrations r on r.id = s.registration_id
   where r.runner_id = '00000000-0000-4000-8000-000000000003'
     and r.event_id = '00000000-0000-4000-9000-0000000000e1'),
  '00000000-0000-4000-9000-0000000000d1'::uuid,
  'and kept on the sign-up'
);

-- 30 + 22 + 6 to mail the shirt + 2.00 fee, no sales tax.
select is(
  (select amount from public.registrations
   where runner_id = '00000000-0000-4000-8000-000000000003'
     and event_id = '00000000-0000-4000-9000-0000000000e1'),
  60.00::numeric,
  'the design changes nothing about the price'
);

-- Going back and picking the other one updates the same sign-up.
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.runner('Ana', '{"shirts": [{"size": "L",
         "design_id": "00000000-0000-4000-9000-0000000000d2"}]}')) $$,
  'a held sign-up can change its design'
);

select is(
  (select s.design_id from public.registration_shirts s
   join public.registrations r on r.id = s.registration_id
   where r.runner_id = '00000000-0000-4000-8000-000000000003'
     and r.event_id = '00000000-0000-4000-9000-0000000000e1'),
  '00000000-0000-4000-9000-0000000000d2'::uuid,
  'to the one picked last'
);

select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c2',
       tests.runner('Ana', '{"shirts": [{"size": "M"}]}')) $$,
  'a race that shows no designs sells its shirt by size alone'
);

reset role;

select tests.act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;

-- Each shirt on an order has its own design.
select lives_ok(
  $$ select public.register_for_event(
       '00000000-0000-4000-9000-0000000000c1',
       tests.runner('Beto', '{"shirts": [
         {"size": "M", "design_id": "00000000-0000-4000-9000-0000000000d1"},
         {"size": "L", "design_id": "00000000-0000-4000-9000-0000000000d2"}]}')) $$,
  'two shirts, one of each design'
);

reset role;
select results_eq(
  $$ select s.position::integer, s.size::text, d.name
     from public.registration_shirts s
     join public.registrations r on r.id = s.registration_id
     join public.event_shirts d on d.id = s.design_id
     where r.runner_id = '00000000-0000-4000-8000-000000000004'
     order by s.position $$,
  $$ values (1, 'M', 'Black tee'), (2, 'L', 'Blue tee') $$,
  'each is kept with the design picked for it'
);
set local role authenticated;

reset role;

-- save_event() -----------------------------------------------------------------

select tests.act_as('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ select tests.save_with('00000000-0000-4000-9000-0000000000e1', '{"name": "Shirts 10K"}') $$,
  'a save that names no designs goes through'
);

select is(
  (select count(*) from public.event_shirts
   where event_id = '00000000-0000-4000-9000-0000000000e1'),
  3::bigint,
  'and leaves the stored ones alone'
);

-- Ana's sign-up holds d2: taking it off the list is refused.
select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1',
       jsonb_build_object('shirt_designs',
         tests.designs('00000000-0000-4000-9000-0000000000e1') - 1)) $$,
  'P0001', 'shirtDesignInUse',
  'a design a sign-up chose cannot be removed'
);

-- Withdrawn instead, renamed, and one nobody chose removed, a new one added.
select lives_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1',
       jsonb_build_object('shirt_designs', jsonb_build_array(
         jsonb_build_object(
           'id', '00000000-0000-4000-9000-0000000000d2', 'name', '  Navy tee  ',
           'image_path', '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000002.webp',
           'offered', false),
         jsonb_build_object(
           'id', '00000000-0000-4000-9000-0000000000d1', 'name', 'Black tee',
           'image_path', '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000001.webp',
           'offered', true),
         jsonb_build_object(
           'name', 'Green tee',
           'image_path', '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000004.webp')))) $$,
  'designs are updated, added and removed in one save'
);

select results_eq(
  $$ select name, offered, position from public.event_shirts
     where event_id = '00000000-0000-4000-9000-0000000000e1' order by position $$,
  $$ values ('Navy tee', false, 0), ('Black tee', true, 1), ('Green tee', true, 2) $$,
  'in the order sent, names trimmed, the unused one gone'
);

-- Read as the owner: an organizer does not see sign-ups still unpaid.
reset role;
select is(
  (select s.design_id from public.registration_shirts s
   join public.registrations r on r.id = s.registration_id
   where r.runner_id = '00000000-0000-4000-8000-000000000003'
     and r.event_id = '00000000-0000-4000-9000-0000000000e1'),
  '00000000-0000-4000-9000-0000000000d2'::uuid,
  'a withdrawn design stays on the sign-up that has it'
);
set local role authenticated;

select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1',
       jsonb_build_object('shirt_designs',
         tests.designs('00000000-0000-4000-9000-0000000000e1') || jsonb_build_array(
           jsonb_build_object('name', '',
             'image_path', '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000005.webp')))) $$,
  'P0001', 'shirtDesignIncomplete',
  'a design needs a name'
);

select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1',
       jsonb_build_object('shirt_designs',
         tests.designs('00000000-0000-4000-9000-0000000000e1') || jsonb_build_array(
           jsonb_build_object('name', 'No picture')))) $$,
  'P0001', 'shirtDesignIncomplete',
  'and a picture'
);

-- Someone else's file: a listing must not show, or later delete, it.
select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e1',
       jsonb_build_object('shirt_designs',
         tests.designs('00000000-0000-4000-9000-0000000000e1') || jsonb_build_array(
           jsonb_build_object('name', 'Borrowed',
             'image_path', '00000000-0000-4000-8000-000000000002/00000000-0000-4000-a000-000000000006.webp')))) $$,
  'P0001', 'imageInvalid',
  'a new picture must be in the caller''s own folder'
);

select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e2',
       jsonb_build_object('shirt_designs', (
         select jsonb_agg(jsonb_build_object(
           'name', 'Tee ' || n,
           'image_path', '00000000-0000-4000-8000-000000000001/00000000-0000-4000-b000-00000000000' || n || '.webp'))
         from generate_series(1, 7) n))) $$,
  'P0001', 'shirtDesignsTooMany',
  'seven designs are one too many'
);

-- A design of another event, sent by id, is not this event's to change.
select throws_ok(
  $$ select tests.save_with(
       '00000000-0000-4000-9000-0000000000e2',
       jsonb_build_object('shirt_designs', jsonb_build_array(
         jsonb_build_object(
           'id', '00000000-0000-4000-9000-0000000000d1', 'name', 'Taken over',
           'image_path', '00000000-0000-4000-8000-000000000001/00000000-0000-4000-a000-000000000001.webp')))) $$,
  'P0001', 'eventNotFound',
  'a save cannot reach into another event''s designs'
);

reset role;

select * from finish();
rollback;
