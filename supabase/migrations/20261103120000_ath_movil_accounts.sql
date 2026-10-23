-- ---------------------------------------------------------------------------
-- More than one ATH Móvil Business account
--
-- Until now every ATH Móvil payment went to the single account named in
-- NEXT_PUBLIC_ATH_MOVIL_PATH. Accounts are now rows: a platform admin adds
-- each business path and its QR code at /admin/payments/accounts, and an
-- organizer picks one per event in the publish wizard. An event without one
-- does not offer ATH Móvil.
--
-- The account is copied onto the registration when the runner submits their
-- reference, so a reviewer always knows which business app to look in, even
-- if the event later switches accounts.
--
-- Accounts are retired, never deleted: registrations keep pointing at them.
-- A retired account is no longer offered to runners or in the wizard.
--
-- To carry over the account from the old environment variables:
--
--   insert into public.ath_movil_accounts (label, path)
--   values ('NEONS RUNNING', '/NeonsRunning') returning id;
--   update public.events set ath_movil_account_id = '<that id>';
--   update public.registrations set ath_movil_account_id = '<that id>'
--   where payment_method = 'ath_movil';
--
-- then upload its QR code from the admin page.
-- ---------------------------------------------------------------------------

create table public.ath_movil_accounts (
  id uuid primary key default gen_random_uuid(),
  -- What organizers pick from: "NEONS RUNNING", "Club Corredores de Ponce".
  label text not null check (char_length(trim(label)) between 1 and 80),
  -- The business path runners search for in the app: "/NeonsRunning".
  path text not null unique check (path ~ '^/[A-Za-z0-9._-]{1,60}$'),
  -- Object path in the ath-movil-qr bucket: <uuid>.<png|jpg|webp>.
  qr_path text check (qr_path ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.ath_movil_accounts is
  'ATH Móvil Business accounts organizers can take payments into. Written by platform admins.';

alter table public.ath_movil_accounts enable row level security;

-- Everything here is printed on the payment step, so anyone may read it.
create policy "Anyone reads ATH Móvil accounts"
  on public.ath_movil_accounts for select
  to anon, authenticated
  using (true);

create policy "Admins add ATH Móvil accounts"
  on public.ath_movil_accounts for insert
  to authenticated
  with check ((select public.is_platform_admin()));

create policy "Admins edit ATH Móvil accounts"
  on public.ath_movil_accounts for update
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

grant select on public.ath_movil_accounts to anon, authenticated;
grant insert, update on public.ath_movil_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- QR codes: uploaded as-is from the admin page (a resized or lossy copy may
-- not scan). Public, like event images; only admins write.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ath-movil-qr', 'ath-movil-qr', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload ATH Móvil QR codes" on storage.objects;
create policy "Admins upload ATH Móvil QR codes"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ath-movil-qr' and (select public.is_platform_admin())
  );

drop policy if exists "Admins list ATH Móvil QR codes" on storage.objects;
create policy "Admins list ATH Móvil QR codes"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ath-movil-qr' and (select public.is_platform_admin())
  );

drop policy if exists "Admins delete ATH Móvil QR codes" on storage.objects;
create policy "Admins delete ATH Móvil QR codes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ath-movil-qr' and (select public.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.events
  add column ath_movil_account_id uuid
    references public.ath_movil_accounts (id) on delete restrict;

comment on column public.events.ath_movil_account_id is
  'The ATH Móvil Business account runners pay into. Null: ATH Móvil is not offered.';

alter table public.registrations
  add column ath_movil_account_id uuid
    references public.ath_movil_accounts (id) on delete restrict;

comment on column public.registrations.ath_movil_account_id is
  'The account the runner was told to pay, copied from the event on submission.';

-- ---------------------------------------------------------------------------
-- save_event(): as before, plus ath_movil_account_id. A retired account can
-- stay on an event that already had it (sign-ups just stop offering it), but
-- cannot be newly chosen.
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
      route_image_path, medal_image_path, ath_movil_account_id
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
      r.route_image_path, r.medal_image_path, r.ath_movil_account_id
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
      ath_movil_account_id = r.ath_movil_account_id
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

-- ---------------------------------------------------------------------------
-- submit_ath_movil_payment(): as before, but only into the event's account,
-- which it records on the registration. New error:
--
--   athMovilUnavailable  the event has no active ATH Móvil account
-- ---------------------------------------------------------------------------

create or replace function public.submit_ath_movil_payment(
  p_registration_id uuid,
  p_reference text
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  reg public.registrations;
  cat public.event_categories;
  ev public.events;
  ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if uid is null then
    raise exception 'sessionExpired' using errcode = 'P0001';
  end if;

  if ref is null or char_length(ref) > 40 then
    raise exception 'referenceInvalid' using errcode = 'P0001';
  end if;

  select * into reg from public.registrations
  where id = p_registration_id and runner_id = uid;
  if reg.id is null then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  select * into ev from public.events where id = reg.event_id for update;
  select * into reg from public.registrations where id = p_registration_id;

  if not exists (
    select 1 from public.ath_movil_accounts a
    where a.id = ev.ath_movil_account_id and a.active
  ) then
    raise exception 'athMovilUnavailable' using errcode = 'P0001';
  end if;

  if reg.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;
  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

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
    payment_method = 'ath_movil',
    payment_reference = ref,
    payment_submitted_at = now(),
    payment_rejected_at = null,
    ath_movil_account_id = ev.ath_movil_account_id,
    -- Held until an admin reviews it.
    hold_expires_at = 'infinity'
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- ath_movil_review_queue(): as before, plus the account each payment went to.
-- The return type changes, so the function is replaced rather than redefined.
-- ---------------------------------------------------------------------------

drop function public.ath_movil_review_queue();

create function public.ath_movil_review_queue()
returns table (
  id uuid,
  event_name text,
  event_date date,
  first_name text,
  last_name text,
  email text,
  phone text,
  amount numeric,
  payment_reference text,
  payment_submitted_at timestamptz,
  account_label text,
  account_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'notAdmin' using errcode = 'P0001';
  end if;

  return query
    select r.id, e.name, e.event_date, r.first_name, r.last_name, r.email,
           r.phone, r.amount, r.payment_reference, r.payment_submitted_at,
           a.label, a.path
    from public.registrations r
    join public.events e on e.id = r.event_id
    left join public.ath_movil_accounts a on a.id = r.ath_movil_account_id
    where r.status = 'pending' and r.payment_submitted_at is not null
    order by r.payment_submitted_at;
end;
$$;

revoke execute on function public.ath_movil_review_queue() from public, anon;
grant execute on function public.ath_movil_review_queue() to authenticated;
