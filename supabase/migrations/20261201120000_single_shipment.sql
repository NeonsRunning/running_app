-- ---------------------------------------------------------------------------
-- One shipment per registration
--
-- The kit (20261114120000_kit_shipping.sql) and the medal
-- (20261121120000_medal_shipping.sql) were two parcels, each with its own
-- address, tracking number and email. They become one package with one of
-- each: `mailing_address`, `shipped_at`, `shipping_tracking` and
-- `shipping_email_sent_at` now describe the shipment.
--
-- What goes in it:
--   * `ships_by_mail`: the kit — the paid "send by mail" extra.
--   * `medal_by_mail`: the medal. At sign-up that follows the same extra on a
--     race with `mails_medals`, so the shipping fee covers both; a runner who
--     skips it picks up both. Mailing the medal alone at no cost is over for
--     new sign-ups; those who already chose it keep it.
--
-- When it goes (`mark_shipment_shipped()`):
--   * a shipment with a medal in it waits until the medal is earned, and the
--     kit travels with it;
--   * a kit with no medal to wait for can go at any time, and so can one whose
--     race ended without the runner earning theirs — a paid kit must not be
--     stuck behind a finish that never comes. Their medal stays due.
--
-- A shipment can therefore have left with the medal still due: that kit-first
-- case, and every sign-up whose kit went out before this migration. Marking it
-- again once the medal is earned sends the medal under a new tracking number,
-- and emails the runner again. `medal_shipped_at` says whether the medal left.
--
-- `medal_mailing_address`, `medal_tracking` and `medal_email_sent_at` are
-- retired: folded in below, no longer written, left in place so this can be
-- checked and undone. A later migration can drop them.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column kit_tracking_before_merge text;

comment on column public.registrations.kit_tracking_before_merge is
  'The kit''s tracking number where folding the medal in replaced it, or may yet. Kept for the record; nothing reads it.';
comment on column public.registrations.medal_mailing_address is
  'Retired by 20261201120000_single_shipment.sql: see mailing_address.';
comment on column public.registrations.medal_tracking is
  'Retired by 20261201120000_single_shipment.sql: see shipping_tracking.';
comment on column public.registrations.medal_email_sent_at is
  'Retired by 20261201120000_single_shipment.sql: see shipping_email_sent_at.';
comment on column public.registrations.mailing_address is
  'Where the runner''s shipment goes: their kit, their medal, or both.';
comment on column public.registrations.shipped_at is
  'When the organizer marked the shipment as shipped. Null until then.';
comment on column public.registrations.shipping_tracking is
  'The carrier''s tracking number for the shipment, if the organizer gave one.';
comment on column public.registrations.shipping_email_sent_at is
  'When the "shipment on its way" email was handed to Brevo. Null until then, and again when a medal due after its kit is marked shipped.';
comment on column public.registrations.medal_by_mail is
  'The finisher medal goes in the runner''s shipment rather than being picked up.';
comment on column public.registrations.medal_shipped_at is
  'When the finisher medal left in the runner''s shipment. Null until then.';

-- The kit's number first: the steps below, or a later marking, replace it.
update public.registrations set kit_tracking_before_merge = shipping_tracking
where ships_by_mail
  and shipped_at is not null
  and shipping_tracking is not null
  and (medal_by_mail or medal_shipped_at is not null);

-- The medal's address wins where the two differ: it is the one the runner
-- could keep correcting. A picked-up medal's address is not the shipment's.
update public.registrations set mailing_address = medal_mailing_address
where medal_mailing_address is not null
  and (medal_by_mail or medal_shipped_at is not null);

-- A medal already mailed becomes the shipment, or the latest word on it.
update public.registrations set
  shipped_at = greatest(shipped_at, medal_shipped_at),
  shipping_tracking = medal_tracking,
  shipping_email_sent_at = coalesce(shipping_email_sent_at, medal_email_sent_at)
where medal_shipped_at is not null;

alter table public.registrations
  drop constraint registrations_medal_mail_has_address,
  add constraint registrations_medal_mail_has_address
    check (not medal_by_mail or char_length(trim(mailing_address)) > 0);

drop function public.mark_kit_shipped(uuid, text);
drop function public.mark_medal_shipped(uuid, text);

-- ---------------------------------------------------------------------------
-- mark_shipment_shipped(): mark a registration's shipment as shipped, or
-- update the tracking number of one already shipped. Errors:
--
--   notAllowed           not the event's organizer or a platform admin
--   registrationMissing  no such confirmed sign-up (removed meanwhile)
--   notMailed            nothing of this runner's goes by mail
--   medalsOff            only a medal to mail, on a race that stopped mailing them
--   pickedUp             only a medal to mail, and it was handed over in person
--   notFinished          the medal in it is not earned (see medal_earned)
--   addressMissing       no address to mail it to
--   trackingTooLong      over 100 characters
-- ---------------------------------------------------------------------------

create function public.mark_shipment_shipped(
  p_registration_id uuid,
  p_tracking text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (now() at time zone 'America/Puerto_Rico')::date;
  v_tracking text := nullif(btrim(coalesce(p_tracking, '')), '');
  reg public.registrations;
  ev public.events;
  kit_due boolean;
  medal_due boolean;
  earned boolean;
begin
  if uid is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations where id = p_registration_id;
  if reg.id is null then
    -- Same answer as a stranger's id, so ids cannot be probed.
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if not public.can_manage_event(ev) then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  -- What it is now, held until this is done: a runner switching to pickup, or
  -- a volunteer handing the medal over, meanwhile is seen.
  select * into reg from public.registrations where id = p_registration_id
  for update;

  if reg.id is null or reg.status <> 'confirmed' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  if char_length(v_tracking) > 100 then
    raise exception 'trackingTooLong' using errcode = 'P0001';
  end if;

  kit_due := reg.ships_by_mail and reg.shipped_at is null;
  -- A disqualified finish forfeits the medal, so nothing waits for it.
  medal_due := reg.medal_by_mail
    and ev.mails_medals
    and reg.medal_shipped_at is null
    and reg.medal_picked_up_at is null
    and not exists (
      select 1 from public.race_results rr
      where rr.registration_id = reg.id and rr.status = 'disqualified'
    );
  earned := medal_due and coalesce(public.medal_earned(reg, ev, false), false);

  if not kit_due and not earned then
    -- Nothing new to send. Gone already: only the tracking number changes.
    if reg.shipped_at is not null then
      update public.registrations set shipping_tracking = v_tracking
      where id = reg.id
      returning * into reg;
      return reg;
    end if;

    if medal_due then
      raise exception 'notFinished' using errcode = 'P0001';
    end if;
    if reg.medal_by_mail and not ev.mails_medals then
      raise exception 'medalsOff' using errcode = 'P0001';
    end if;
    if reg.medal_by_mail and reg.medal_picked_up_at is not null then
      raise exception 'pickedUp' using errcode = 'P0001';
    end if;
    -- Left: a medal forfeited by a disqualified finish.
    if reg.medal_by_mail then
      raise exception 'notFinished' using errcode = 'P0001';
    end if;
    raise exception 'notMailed' using errcode = 'P0001';
  end if;

  -- The kit waits for the medal while the race can still be finished.
  if kit_due and medal_due and not earned
     and coalesce(ev.last_day >= today, false)
  then
    raise exception 'notFinished' using errcode = 'P0001';
  end if;

  if reg.mailing_address is null then
    raise exception 'addressMissing' using errcode = 'P0001';
  end if;

  update public.registrations set
    shipped_at = coalesce(shipped_at, now()),
    medal_shipped_at = case when earned then now() else medal_shipped_at end,
    shipping_tracking = v_tracking,
    -- A medal following its kit is news, so the runner hears about it.
    shipping_email_sent_at = case when kit_due then shipping_email_sent_at end
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.mark_shipment_shipped(uuid, text) from public, anon;
grant execute on function public.mark_shipment_shipped(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_medal_delivery(): as before (20261124140000_organizer_guards), writing
-- the shipment's address, and no longer a free way into the mail: a runner
-- may choose it only if they paid for "send by mail" or their medal is
-- already going that way. Choosing pickup leaves the address alone, since a
-- kit may still be going there. Errors:
--
--   notAllowed       not the runner's confirmed sign-up
--   medalsOff        the race does not mail medals
--   alreadyShipped   the medal is on its way
--   pickedUp         the medal was handed over already
--   mailNotIncluded  mail chosen without "send by mail"
--   addressInvalid   mail chosen with a blank address, or over 300 characters
-- ---------------------------------------------------------------------------

create or replace function public.set_medal_delivery(
  p_registration_id uuid,
  p_by_mail boolean,
  p_address text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  reg public.registrations;
  ev public.events;
begin
  select * into reg from public.registrations
  where id = p_registration_id and runner_id = uid and status = 'confirmed'
  for update;
  if uid is null or reg.id is null then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id;
  if not ev.mails_medals then
    raise exception 'medalsOff' using errcode = 'P0001';
  end if;

  if reg.medal_shipped_at is not null then
    raise exception 'alreadyShipped' using errcode = 'P0001';
  end if;

  if reg.medal_picked_up_at is not null then
    raise exception 'pickedUp' using errcode = 'P0001';
  end if;

  if p_by_mail and not reg.ships_by_mail and not reg.medal_by_mail then
    raise exception 'mailNotIncluded' using errcode = 'P0001';
  end if;

  if (p_by_mail and v_address is null) or char_length(v_address) > 300 then
    raise exception 'addressInvalid' using errcode = 'P0001';
  end if;

  update public.registrations set
    medal_by_mail = coalesce(p_by_mail, false),
    mailing_address = case when p_by_mail then v_address else mailing_address end
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

revoke execute on function public.set_medal_delivery(uuid, boolean, text) from public, anon;
grant execute on function public.set_medal_delivery(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- save_event(): as before (20261129120000_event_sold_out). Medals by mail
-- switched on after sign-ups put the medal in the shipment of whoever paid
-- for the mail, at the address it already has.
-- ---------------------------------------------------------------------------

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
      accepts_results, mails_medals, sold_out
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
      coalesce(r.accepts_results, false), coalesce(r.mails_medals, false),
      coalesce(r.sold_out, false)
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
      mails_medals = coalesce(r.mails_medals, false),
      sold_out = coalesce(r.sold_out, false)
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

    -- Medals by mail switched on after sign-ups: whoever paid for the mail
    -- gets theirs in the shipment. Only when it is switched on — on every
    -- save it would also overwrite runners who chose to pick theirs up.
    if ev.mails_medals and not coalesce(prev.mails_medals, false) then
      update public.registrations rg set medal_by_mail = true
      where rg.event_id = ev.id
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

-- ---------------------------------------------------------------------------
-- register_for_event(): as before (20261129120000_event_sold_out). The medal
-- rides on the paid mail extra, so the client no longer chooses it.
-- ---------------------------------------------------------------------------

create or replace function public.register_for_event(
  p_category_id uuid,
  p_details jsonb
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (now() at time zone 'America/Puerto_Rico')::date;
  cat public.event_categories;
  ev public.events;
  reg public.registrations;
  own public.registrations;
  birth date;
  runner_age integer;
  size public.shirt_size;
  photos boolean := coalesce((p_details ->> 'wants_photos')::boolean, false);
  gift numeric := coalesce((p_details ->> 'donation')::numeric, 0);
  mail boolean := coalesce((p_details ->> 'ships_by_mail')::boolean, false);
  medal_mail boolean;
  address text := nullif(trim(coalesce(p_details ->> 'mailing_address', '')), '');
  fee numeric := 2.00;
  taxable numeric;
  tax numeric;
  total numeric;
  hold_start timestamptz;
begin
  if uid is null then
    raise exception 'sessionExpired' using errcode = 'P0001';
  end if;

  select * into cat from public.event_categories where id = p_category_id;
  if cat.id is null then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  -- One lock per event serializes its sign-ups and confirmations.
  select * into ev from public.events where id = cat.event_id for update;

  -- Again under the lock: a save that repriced or recapped this distance may
  -- have committed while this waited for it, and the spot is priced and
  -- counted against what stands now.
  select * into cat from public.event_categories where id = p_category_id;
  if cat.id is null then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if today > ev.registration_closes
     or (ev.registration_opens is not null and today < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  select * into own from public.registrations
  where event_id = ev.id and runner_id = uid and status <> 'cancelled';

  if own.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;

  if own.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  -- Where this hold starts. A live hold, or one that ended less than 15
  -- minutes ago, is the same hold and keeps its original start: letting it
  -- lapse just short of the cap and coming straight back does not start the
  -- 2 hours again. A gap of 15 minutes or more — the spot was open to others
  -- all that time — or no hold before, starts afresh.
  hold_start := case
    when own.hold_started_at is not null
         and own.hold_expires_at > now() - interval '15 minutes'
      then own.hold_started_at
    else now()
  end;

  -- A hold that has used its 2 hours waits out those 15 minutes, counted
  -- from when it ended, before another starts.
  if hold_start + interval '2 hours' <= now() then
    raise exception 'holdLimitReached' using errcode = 'P0001';
  end if;

  if ev.sold_out
     or (select count(*) from public.registrations r
      where r.category_id = cat.id and r.runner_id <> uid
        and (r.status = 'confirmed' or r.hold_expires_at > now()))
       >= cat.capacity
     or (ev.capacity is not null and
         (select count(*) from public.registrations r
          where r.event_id = ev.id and r.runner_id <> uid
            and (r.status = 'confirmed' or r.hold_expires_at > now()))
           >= ev.capacity)
  then
    raise exception 'soldOut' using errcode = 'P0001';
  end if;

  birth := (p_details ->> 'birth_date')::date;
  runner_age := extract(year from age(ev.event_date, birth))::integer;
  if runner_age < ev.minimum_age
     or (ev.maximum_age is not null and runner_age > ev.maximum_age)
  then
    raise exception 'ageNotEligible' using errcode = 'P0001';
  end if;

  size := nullif(p_details ->> 'shirt_size', '')::public.shirt_size;

  if (size is not null and not ev.offers_shirt)
     or (photos and not ev.offers_photos)
     or (gift > 0 and not ev.accepts_donations)
     or (mail and not ev.offers_mail)
  then
    raise exception 'extrasChanged' using errcode = 'P0001';
  end if;

  -- The medal rides in the shipment the runner paid for, on races that mail
  -- medals. Whoever skips the extra picks up both.
  medal_mail := mail and ev.mails_medals;

  if size is not null and not (size = any (ev.shirt_sizes)) then
    raise exception 'shirtSizeUnavailable' using errcode = 'P0001';
  end if;

  if gift < 0 or gift > 1000 then
    raise exception 'donationInvalid' using errcode = 'P0001';
  end if;

  if mail and (address is null or char_length(address) > 300) then
    raise exception 'mailingAddressInvalid' using errcode = 'P0001';
  end if;

  -- Category price, the event's extras, the $2.00 service fee
  -- (`SERVICE_FEE` in lib/events/pricing.ts) and shipping and handling are
  -- taxed at 11.5% (`SALES_TAX_RATE`); the donation is not. The shipping
  -- fee covers the whole shipment, medal included.
  taxable := cat.price
    + case when size is not null then ev.shirt_price else 0 end
    + case when photos then ev.photo_price else 0 end
    + fee
    + case when mail then ev.shipping_price else 0 end;
  tax := round(taxable * 0.115, 2);
  total := taxable + tax + gift;

  if own.id is null then
    insert into public.registrations (
      event_id, category_id, runner_id, status, hold_started_at, hold_expires_at,
      first_name, last_name, email, phone, birth_date, gender,
      emergency_contact_name, emergency_contact_phone, club,
      shirt_size, wants_photos, donation, ships_by_mail, mailing_address,
      medal_by_mail, service_fee, sales_tax, amount
    ) values (
      ev.id, cat.id, uid, 'pending', hold_start, hold_start + interval '30 minutes',
      trim(p_details ->> 'first_name'),
      trim(p_details ->> 'last_name'),
      trim(p_details ->> 'email'),
      trim(p_details ->> 'phone'),
      birth,
      (p_details ->> 'gender')::public.profile_gender,
      trim(p_details ->> 'emergency_contact_name'),
      trim(p_details ->> 'emergency_contact_phone'),
      nullif(trim(coalesce(p_details ->> 'club', '')), ''),
      size, photos, gift, mail, case when mail then address end,
      medal_mail,
      fee, tax, total
    )
    returning * into reg;
  else
    update public.registrations set
      category_id = cat.id,
      hold_started_at = hold_start,
      hold_expires_at = least(
        now() + interval '30 minutes',
        hold_start + interval '2 hours'
      ),
      first_name = trim(p_details ->> 'first_name'),
      last_name = trim(p_details ->> 'last_name'),
      email = trim(p_details ->> 'email'),
      phone = trim(p_details ->> 'phone'),
      birth_date = birth,
      gender = (p_details ->> 'gender')::public.profile_gender,
      emergency_contact_name = trim(p_details ->> 'emergency_contact_name'),
      emergency_contact_phone = trim(p_details ->> 'emergency_contact_phone'),
      club = nullif(trim(coalesce(p_details ->> 'club', '')), ''),
      shirt_size = size,
      wants_photos = photos,
      donation = gift,
      ships_by_mail = mail,
      mailing_address = case when mail then address end,
      medal_by_mail = medal_mail,
      service_fee = fee,
      sales_tax = tax,
      amount = total
    where id = own.id
    returning * into reg;
  end if;

  return reg;
end;
$$;
