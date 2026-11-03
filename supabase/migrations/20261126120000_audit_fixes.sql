-- ---------------------------------------------------------------------------
-- Fixes from the November audit
--
-- 1. save_event()
--    a. Medals by mail were backfilled on every save of an event that mails
--       them, not only when the option was switched on: each save quietly
--       moved runners who chose to pick their medal up (kit by mail, medal at
--       the tent) to the mail queue, and the tent could no longer hand it to
--       them (`mailChosen`). Now only when `mails_medals` goes from off to on.
--    b. A new race date clears `reminder_email_sent_at`, so a postponed race
--       gets a reminder for the day it is actually run.
--    c. Image paths were checked for their shape only; the own-folder check
--       lived in the server action, and the function is callable directly.
--       New and changed paths must now be in the caller's folder. Error:
--       `imageInvalid`.
--
-- 2. review_race_result() takes the `submitted_at` of the version the
--    reviewer saw. A runner re-sending their result while it was on screen
--    made the reviewer accept a time they never saw. Error: `resultChanged`.
--    The three-argument version is dropped; the app passes the new one.
--
-- 3. confirm_registration_payment(): a sign-up deleted between its first read
--    and the event lock came back as an all-NULL row instead of an error.
--    Now `registrationMissing`, which refunds the payment.
--
-- 4. admin_restore_event(): runners refunded in full while the race was down
--    stayed confirmed, so a restore brought them back with bibs, spots and a
--    "the race is back" email. Restoring now cancels them, as an organizer's
--    removal would (a result already accepted or disqualified keeps its row).
--
-- 5. can_review_ath_movil_payment(): an account owner who was no longer an
--    organizer, or whose event was removed, could still approve payments.
--    Now the same conditions as `can_manage_event()`.
--
-- 6. Paid registrations are never deleted. `runner_id` cascades from the
--    profile, so deleting a runner's account in the dashboard took their
--    payments, refunds and disputes with it. Every path in the app deletes
--    only pending sign-ups, never one under ATH Móvil review; a trigger now
--    refuses the rest, whatever asks. Error: `paymentRecordKept`.
-- ---------------------------------------------------------------------------

-- 1 ---------------------------------------------------------------------------

create or replace function public.save_event(
  p_id uuid,
  p_slug text,
  p_event jsonb,
  p_categories jsonb
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.events := jsonb_populate_record(null::public.events, p_event);
  ev public.events;
  -- The event as it was, before this save; null when creating one.
  prev public.events;
  item record;
  kept uuid[];
begin
  if uid is null then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;

  if r.status is null or r.status not in ('draft', 'published') then
    raise exception 'statusInvalid' using errcode = 'P0001';
  end if;

  if p_id is null and not public.is_organizer() then
    raise exception 'notOrganizer' using errcode = 'P0001';
  end if;

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

  -- Read before the update, which the checks after it compare against.
  -- Unlocked: the update below takes the row lock, and a stranger's id only
  -- ever ends in `eventNotFound` there.
  if p_id is not null then
    select * into prev from public.events where id = p_id;
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
      accepts_results, mails_medals
    ) values (
      uid, p_slug, r.status,
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
      coalesce(r.accepts_results, false), coalesce(r.mails_medals, false)
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
      accepts_results = coalesce(r.accepts_results, false),
      mails_medals = coalesce(r.mails_medals, false)
    where e.id = p_id
      -- What the update policies checked before this ran with definer
      -- rights: a removed event is the platform's, and only its organizer
      -- (still an organizer) or an admin edits the rest.
      and e.status <> 'removed'
      and (
        (e.organizer_id = uid and public.is_organizer())
        or public.is_platform_admin()
      )
    returning * into ev;

    -- Missing, removed, or not the caller's: all answer alike, so ids cannot
    -- be probed.
    if ev.id is null then
      raise exception 'eventNotFound' using errcode = 'P0001';
    end if;

    -- Medals by mail switched on after sign-ups: a mailed kit's address is
    -- where the runner already said to send things. Only when it is switched
    -- on — on every save it also overwrote runners who chose to pick theirs
    -- up (whose medal address is null by that choice).
    if ev.mails_medals and not coalesce(prev.mails_medals, false) then
      update public.registrations rg set
        medal_by_mail = true,
        medal_mailing_address = rg.mailing_address
      where rg.event_id = ev.id
        and rg.medal_mailing_address is null
        and rg.medal_shipped_at is null
        and rg.medal_picked_up_at is null
        and rg.ships_by_mail
        and rg.mailing_address is not null;
    end if;

    -- A new race day needs its own reminder: the one already sent was for
    -- the old date.
    if ev.event_date is distinct from prev.event_date then
      update public.registrations rg set reminder_email_sent_at = null
      where rg.event_id = ev.id and rg.reminder_email_sent_at is not null;
    end if;
  end if;

  -- Images are uploaded into the uploader's own folder, `<uid>/<file>.webp`.
  -- A new path must be in the caller's: otherwise a listing could show, and
  -- a later replacement delete, another organizer's file. The paths already
  -- on the event stay acceptable as they are — an admin's edit keeps the
  -- organizer's files. Checked after the update so a stranger's id still
  -- answers `eventNotFound`; raising here undoes it.
  if (ev.image_path is distinct from prev.image_path
        and split_part(ev.image_path, '/', 1) <> uid::text)
     or (ev.route_image_path is distinct from prev.route_image_path
        and split_part(ev.route_image_path, '/', 1) <> uid::text)
     or (ev.medal_image_path is distinct from prev.medal_image_path
        and split_part(ev.medal_image_path, '/', 1) <> uid::text)
  then
    raise exception 'imageInvalid' using errcode = 'P0001';
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
      -- What runners signed up for keeps its distance; see the header.
      if exists (
        select 1 from public.event_categories ec
        where ec.id = (item.v ->> 'id')::uuid
          and ec.event_id = ev.id
          and (
            ec.distance is distinct from (item.v ->> 'distance')::public.race_distance
            or ec.distance_km is distinct from (item.v ->> 'distance_km')::numeric
          )
          and exists (
            select 1 from public.registrations rg where rg.category_id = ec.id
          )
      ) then
        raise exception 'categoryDistanceLocked' using errcode = 'P0001';
      end if;

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
        select count(*) from public.registrations rg
        where rg.category_id = ec.id
          and (rg.status = 'confirmed' or rg.hold_expires_at > now())
      )
  ) then
    raise exception 'capacityBelowRegistered' using errcode = 'P0001';
  end if;

  -- The event's own cap, counted as `register_for_event()` counts it.
  if ev.capacity is not null and ev.capacity < (
    select count(*) from public.registrations rg
    where rg.event_id = ev.id
      and (rg.status = 'confirmed' or rg.hold_expires_at > now())
  ) then
    raise exception 'eventCapacityBelowRegistered' using errcode = 'P0001';
  end if;

  return ev;
end;
$$;

revoke execute on function public.save_event(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_event(uuid, text, jsonb, jsonb) to authenticated;

-- 2 ---------------------------------------------------------------------------

drop function if exists public.review_race_result(uuid, boolean, text);

create or replace function public.review_race_result(
  p_result_id uuid,
  p_accept boolean,
  p_submitted_at timestamptz,
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
  reg public.registrations;
  ev public.events;
begin
  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status = 'pending';

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = res.event_id;
  if uid is null or not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- Sign-up first, then result: the order removals take them in.
  select * into reg from public.registrations
  where id = res.registration_id
  for update;

  select r.* into res from public.race_results r
  where r.id = p_result_id and r.status = 'pending'
  for update;

  if res.id is null then
    raise exception 'resultMissing' using errcode = 'P0001';
  end if;

  -- The runner re-sent it since the reviewer loaded it: what they are
  -- accepting is not what they saw.
  if res.submitted_at is distinct from p_submitted_at then
    raise exception 'resultChanged' using errcode = 'P0001';
  end if;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
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

revoke execute on function public.review_race_result(uuid, boolean, timestamptz, text)
  from public, anon;
grant execute on function public.review_race_result(uuid, boolean, timestamptz, text)
  to authenticated;

-- 3 ---------------------------------------------------------------------------

create or replace function public.confirm_registration_payment(
  p_registration_id uuid,
  p_payment_intent_id text,
  p_amount_cents bigint
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Puerto_Rico')::date;
  reg public.registrations;
  cat public.event_categories;
  ev public.events;
begin
  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id for update;
  -- Re-read under the lock: another confirmation may have just landed.
  select * into reg from public.registrations where id = p_registration_id;

  -- Deleted meanwhile, with its event or as an abandoned checkout. Without
  -- this every check below compares NULLs, raises nothing, and an empty row
  -- comes back as if confirmed.
  if ev.id is null or reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if reg.status in ('confirmed', 'cancelled') then
    return reg;
  end if;

  -- The same checks `register_for_event()` makes.
  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if today > ev.registration_closes
     or (ev.registration_opens is not null and today < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  if round(reg.amount * 100) <> p_amount_cents then
    raise exception 'amountMismatch' using errcode = 'P0001';
  end if;

  -- A live hold already reserved the spot. An expired one has to find room.
  if reg.hold_expires_at is null or reg.hold_expires_at <= now() then
    select * into cat from public.event_categories where id = reg.category_id;
    if (select count(*) from public.registrations r
        where r.category_id = cat.id and r.id <> reg.id
          and (r.status = 'confirmed' or r.hold_expires_at > now()))
         >= cat.capacity
       or (ev.capacity is not null and
           (select count(*) from public.registrations r
            where r.event_id = ev.id and r.id <> reg.id
              and (r.status = 'confirmed' or r.hold_expires_at > now()))
             >= ev.capacity)
    then
      raise exception 'soldOut' using errcode = 'P0001';
    end if;
  end if;

  update public.registrations set
    status = 'confirmed',
    bib = (select coalesce(max(bib), 1000) + 1
           from public.registrations where event_id = reg.event_id),
    payment_method = 'stripe',
    payment_intent_id = p_payment_intent_id,
    paid_at = now(),
    hold_expires_at = null
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

-- 4 ---------------------------------------------------------------------------

create or replace function public.admin_restore_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ev public.events;
begin
  if uid is null or not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  update public.events set status = 'published'
  where id = p_event_id and status = 'removed'
  returning * into ev;

  if ev.id is null then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;

  -- Refunded in full while the race was down: they are owed nothing and
  -- hold nothing. Cancelled as `remove_registration()` cancels, results and
  -- all, unless a result was already accepted or disqualified.
  with cancelled as (
    update public.registrations rg set
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = uid,
      hold_expires_at = null
    where rg.event_id = ev.id
      and rg.status = 'confirmed'
      and rg.amount > 0
      and rg.amount_refunded >= rg.amount
      and not exists (
        select 1 from public.race_results r
        where r.registration_id = rg.id and r.status in ('accepted', 'disqualified')
      )
    returning rg.id
  )
  delete from public.race_results r
  using cancelled c
  where r.registration_id = c.id;

  insert into public.event_moderation_log
    (event_id, event_name, event_slug, action, actor_id)
  values (ev.id, ev.name, ev.slug, 'restored', uid);

  return ev;
end;
$$;

-- 5 ---------------------------------------------------------------------------

create or replace function public.can_review_ath_movil_payment(p_registration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    join public.ath_movil_accounts a on a.id = r.ath_movil_account_id
    where r.id = p_registration_id
      and e.organizer_id = (select auth.uid())
      and a.owner_id = (select auth.uid())
      and public.is_organizer()
      and e.status <> 'removed'
  );
$$;

-- 6 ---------------------------------------------------------------------------

create or replace function public.keep_payment_records()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending' or old.payment_submitted_at is not null then
    raise exception 'paymentRecordKept' using errcode = 'P0001',
      detail = 'Registration ' || old.id || ' is ' || old.status::text
        || '; cancel it rather than delete it.';
  end if;
  return old;
end;
$$;

revoke execute on function public.keep_payment_records() from public, anon, authenticated;

drop trigger if exists keep_payment_records on public.registrations;
create trigger keep_payment_records
  before delete on public.registrations
  for each row execute function public.keep_payment_records();
