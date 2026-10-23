-- ---------------------------------------------------------------------------
-- Race results from finish evidence
--
-- An organizer can let runners report their own finish: after race day, a
-- runner with a paid sign-up uploads a screenshot of the run (Strava, Nike Run
-- Club, a watch app…) with their finish time. It waits in the organizer's
-- queue on the event page. Accepted, it becomes the runner's result: on their
-- profile's race history, with the event's medal under achievements.
-- Rejected, the runner sees the organizer's note and can send new evidence.
--
-- One row per registration, so one result per runner per event. Writes go
-- through `submit_race_result()` and `review_race_result()` only.
--
-- The screenshot lands in the private `race-evidence` bucket, in a folder
-- named for the runner. Only the runner and the event's organizer can read
-- it; the app shows it through short-lived signed URLs.
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists accepts_results boolean not null default false;

comment on column public.events.accepts_results is
  'Runners may submit finish evidence for the organizer to review.';

create type public.result_status as enum ('pending', 'accepted', 'rejected');

create table public.race_results (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique
    references public.registrations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  category_id uuid not null
    references public.event_categories (id) on delete cascade,
  runner_id uuid not null references public.profiles (id) on delete cascade,
  -- Under 7 days covers a multi-day ultra.
  finish_seconds integer not null
    check (finish_seconds > 0 and finish_seconds < 604800),
  evidence_path text not null
    check (
      evidence_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      and split_part(evidence_path, '/', 1) = runner_id::text
    ),
  status public.result_status not null default 'pending',
  -- The organizer's reason, shown to the runner on a rejection.
  review_note text check (char_length(review_note) <= 300),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index race_results_runner_idx on public.race_results (runner_id);
create index race_results_event_status_idx on public.race_results (event_id, status);

alter table public.race_results enable row level security;

create policy "Runners read their own results"
  on public.race_results for select
  to authenticated
  using ((select auth.uid()) = runner_id);

create policy "Organizers read results for their events"
  on public.race_results for select
  to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and e.organizer_id = (select auth.uid())
  ));

-- The subquery runs under the profiles policy, so a private runner's results
-- stay as hidden as their profile.
create policy "Accepted results follow their runner's profile"
  on public.race_results for select
  to anon, authenticated
  using (
    status = 'accepted'
    and exists (select 1 from public.profiles p where p.id = runner_id)
  );

grant select on public.race_results to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Evidence storage
-- ---------------------------------------------------------------------------

-- Private: a screenshot can show a home address on the map. WebP only, 5 MB
-- after conversion, as for event images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('race-evidence', 'race-evidence', false, 5242880, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Runners upload evidence to their own folder" on storage.objects;
create policy "Runners upload evidence to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'race-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The runner reads their own folder; an organizer reads exactly the files
-- submitted for their events. `objects.name` is spelled out: bare, `name`
-- would resolve to `events.name` inside the subquery.
drop policy if exists "Runners and organizers read evidence" on storage.objects;
create policy "Runners and organizers read evidence"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'race-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.race_results r
        join public.events e on e.id = r.event_id
        where r.evidence_path = storage.objects.name
          and e.organizer_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Runners delete their own evidence" on storage.objects;
create policy "Runners delete their own evidence"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'race-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- submit_race_result(): the runner sends, or re-sends, their finish.
--
-- Needs a paid sign-up on an event that takes results, from its first day
-- (Puerto Rico time). A pending submission is replaced; a rejected one goes
-- back to pending. Errors:
--
--   resultsClosed          the event does not take results
--   raceNotStarted         before the event's first day
--   notRegistered          no paid sign-up for this event
--   resultAlreadyAccepted  the organizer already accepted one
-- ---------------------------------------------------------------------------

create or replace function public.submit_race_result(
  p_event_id uuid,
  p_finish_seconds integer,
  p_evidence_path text
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ev public.events;
  reg public.registrations;
  res public.race_results;
begin
  select * into ev from public.events
  where id = p_event_id and status = 'published';

  if uid is null or ev.id is null or not ev.accepts_results then
    raise exception 'resultsClosed' using errcode = 'P0001';
  end if;

  if ev.event_date > (now() at time zone 'America/Puerto_Rico')::date then
    raise exception 'raceNotStarted' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations
  where event_id = p_event_id and runner_id = uid and status = 'confirmed';

  if reg.id is null then
    raise exception 'notRegistered' using errcode = 'P0001';
  end if;

  select * into res from public.race_results
  where registration_id = reg.id
  for update;

  if res.status = 'accepted' then
    raise exception 'resultAlreadyAccepted' using errcode = 'P0001';
  end if;

  insert into public.race_results (
    registration_id, event_id, category_id, runner_id,
    finish_seconds, evidence_path
  ) values (
    reg.id, ev.id, reg.category_id, uid,
    p_finish_seconds, p_evidence_path
  )
  on conflict (registration_id) do update set
    category_id = excluded.category_id,
    finish_seconds = excluded.finish_seconds,
    evidence_path = excluded.evidence_path,
    status = 'pending',
    review_note = null,
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null
  returning * into res;

  return res;
end;
$$;

revoke execute on function public.submit_race_result(uuid, integer, text) from public, anon;
grant execute on function public.submit_race_result(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- review_race_result(): the event's organizer, or a platform admin, accepts
-- or rejects a pending submission. Errors:
--
--   notAllowed     not the event's organizer or an admin
--   resultMissing  no such pending submission (already reviewed, or re-sent)
-- ---------------------------------------------------------------------------

create or replace function public.review_race_result(
  p_result_id uuid,
  p_accept boolean,
  p_note text default null
)
returns public.race_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  res public.race_results;
begin
  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status = 'pending'
  for update;

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  if uid is null or not (
    exists (
      select 1 from public.events e
      where e.id = res.event_id and e.organizer_id = uid
    )
    or public.is_platform_admin()
  ) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  update public.race_results set
    status = case when p_accept then 'accepted' else 'rejected' end::public.result_status,
    review_note = case when p_accept then null else nullif(btrim(p_note), '') end,
    reviewed_at = now(),
    reviewed_by = uid
  where id = res.id
  returning * into res;

  return res;
end;
$$;

revoke execute on function public.review_race_result(uuid, boolean, text) from public, anon;
grant execute on function public.review_race_result(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- save_event(): as before, plus accepts_results.
-- ---------------------------------------------------------------------------

create or replace function public.save_event(
  p_id uuid,
  p_slug text,
  p_event jsonb,
  p_categories jsonb
)
returns public.events
language plpgsql
set search_path = ''
as $$
declare
  r public.events := jsonb_populate_record(null::public.events, p_event);
  ev public.events;
  item record;
  kept uuid[];
begin
  if r.ath_movil_account_id is not null
     and not exists (
       select 1 from public.ath_movil_accounts a
       where a.id = r.ath_movil_account_id and a.active
     )
     and not exists (
       select 1 from public.events e
       where e.id = p_id and e.ath_movil_account_id = r.ath_movil_account_id
     )
  then
    raise exception 'athMovilAccountInvalid' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.events (
      organizer_id, slug, status, published_at,
      name, description, type, event_date, end_date, start_time,
      registration_opens, registration_closes,
      anywhere, venue, address, city, region, postal_code, country,
      difficulty, terrain, elevation_gain, cutoff,
      capacity, minimum_age, maximum_age, shirt_sizes,
      offers_shirt, shirt_price, offers_photos, photo_price,
      accepts_donations, donation_recipient, offers_mail, shipping_price,
      aid_stations, schedule, parking, directions, image_path,
      route_image_path, medal_image_path, ath_movil_account_id,
      accepts_results
    ) values (
      (select auth.uid()), p_slug, r.status,
      case when r.status = 'published' then now() end,
      r.name, r.description, r.type, r.event_date, r.end_date, r.start_time,
      r.registration_opens, r.registration_closes,
      r.anywhere, r.venue, r.address, r.city, r.region, r.postal_code, r.country,
      r.difficulty, r.terrain, r.elevation_gain, r.cutoff,
      r.capacity, r.minimum_age, r.maximum_age, r.shirt_sizes,
      r.offers_shirt, r.shirt_price, r.offers_photos, r.photo_price,
      r.accepts_donations, r.donation_recipient, r.offers_mail, r.shipping_price,
      r.aid_stations, r.schedule, r.parking, r.directions, r.image_path,
      r.route_image_path, r.medal_image_path, r.ath_movil_account_id,
      coalesce(r.accepts_results, false)
    )
    returning * into ev;
  else
    update public.events e set
      -- Publishing is one-way: a live listing may have runners signed up.
      status = case when e.status = 'published' then e.status else r.status end,
      published_at = coalesce(
        e.published_at,
        case when r.status = 'published' then now() end
      ),
      name = r.name,
      description = r.description,
      type = r.type,
      event_date = r.event_date,
      end_date = r.end_date,
      start_time = r.start_time,
      registration_opens = r.registration_opens,
      registration_closes = r.registration_closes,
      anywhere = r.anywhere,
      venue = r.venue,
      address = r.address,
      city = r.city,
      region = r.region,
      postal_code = r.postal_code,
      country = r.country,
      difficulty = r.difficulty,
      terrain = r.terrain,
      elevation_gain = r.elevation_gain,
      cutoff = r.cutoff,
      capacity = r.capacity,
      minimum_age = r.minimum_age,
      maximum_age = r.maximum_age,
      shirt_sizes = r.shirt_sizes,
      offers_shirt = r.offers_shirt,
      shirt_price = r.shirt_price,
      offers_photos = r.offers_photos,
      photo_price = r.photo_price,
      accepts_donations = r.accepts_donations,
      donation_recipient = r.donation_recipient,
      offers_mail = r.offers_mail,
      shipping_price = r.shipping_price,
      aid_stations = r.aid_stations,
      schedule = r.schedule,
      parking = r.parking,
      directions = r.directions,
      image_path = r.image_path,
      route_image_path = r.route_image_path,
      medal_image_path = r.medal_image_path,
      ath_movil_account_id = r.ath_movil_account_id,
      accepts_results = coalesce(r.accepts_results, false)
    where e.id = p_id
    returning * into ev;

    -- Missing, or not the caller's: the update policy hides both alike.
    if ev.id is null then
      raise exception 'eventNotFound' using errcode = 'P0001';
    end if;
  end if;

  kept := array(
    select (c ->> 'id')::uuid
    from jsonb_array_elements(p_categories) c
    where coalesce(c ->> 'id', '') <> ''
  );

  delete from public.event_categories ec
  where ec.event_id = ev.id and not (ec.id = any (kept));

  for item in
    select c.value as v, c.ordinality - 1 as pos
    from jsonb_array_elements(p_categories) with ordinality c
  loop
    if coalesce(item.v ->> 'id', '') <> '' then
      update public.event_categories ec set
        distance = (item.v ->> 'distance')::public.race_distance,
        distance_km = (item.v ->> 'distance_km')::numeric,
        price = (item.v ->> 'price')::numeric,
        capacity = (item.v ->> 'capacity')::integer,
        start_time = (item.v ->> 'start_time')::time,
        position = item.pos
      where ec.id = (item.v ->> 'id')::uuid and ec.event_id = ev.id;

      if not found then
        raise exception 'eventNotFound' using errcode = 'P0001';
      end if;
    else
      insert into public.event_categories (
        event_id, distance, distance_km, price, capacity, start_time, position
      ) values (
        ev.id,
        (item.v ->> 'distance')::public.race_distance,
        (item.v ->> 'distance_km')::numeric,
        (item.v ->> 'price')::numeric,
        (item.v ->> 'capacity')::integer,
        (item.v ->> 'start_time')::time,
        item.pos
      );
    end if;
  end loop;

  if ev.status = 'published' and not exists (
    select 1 from public.event_categories ec where ec.event_id = ev.id
  ) then
    raise exception 'categoriesRequired' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.event_categories ec
    where ec.event_id = ev.id
      and ec.capacity < (
        select count(*) from public.registrations rg where rg.category_id = ec.id
      )
  ) then
    raise exception 'capacityBelowRegistered' using errcode = 'P0001';
  end if;

  return ev;
end;
$$;
