-- ---------------------------------------------------------------------------
-- $2.00 service fee and Puerto Rico sales tax
--
-- The service fee drops from $2.90 to $2.00, and every registration now pays
-- Puerto Rico's 11.5% sales tax (IVU) on everything but the donation:
-- category price, extras, service fee and shipping. The tax is rounded to the
-- cent. `registrationTotal()` in lib/events/pricing.ts repeats the arithmetic.
--
-- The fee and tax a registration paid are stored with it, so the organizer's
-- share stays right for sign-ups taken at the old $2.90 with no tax.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column if not exists service_fee numeric(8, 2) not null default 2.90,
  add column if not exists sales_tax numeric(8, 2) not null default 0;

alter table public.registrations alter column service_fee set default 2.00;


-- ---------------------------------------------------------------------------
-- register_for_event(): as before, with the new fee and the sales tax.
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
  address text := nullif(trim(coalesce(p_details ->> 'mailing_address', '')), '');
  fee numeric := 2.00;
  taxable numeric;
  tax numeric;
  total numeric;
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

  if ev.status <> 'published' then
    raise exception 'eventUnavailable' using errcode = 'P0001';
  end if;

  if current_date > ev.registration_closes
     or (ev.registration_opens is not null and current_date < ev.registration_opens)
  then
    raise exception 'registrationClosed' using errcode = 'P0001';
  end if;

  select * into own from public.registrations
  where event_id = ev.id and runner_id = uid;

  if own.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;

  if own.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
  end if;

  if (select count(*) from public.registrations r
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
  -- taxed at 11.5% (`SALES_TAX_RATE`); the donation is not.
  taxable := cat.price
    + case when size is not null then ev.shirt_price else 0 end
    + case when photos then ev.photo_price else 0 end
    + fee
    + case when mail then ev.shipping_price else 0 end;
  tax := round(taxable * 0.115, 2);
  total := taxable + tax + gift;

  if own.id is null then
    insert into public.registrations (
      event_id, category_id, runner_id, status, hold_expires_at,
      first_name, last_name, email, phone, birth_date, gender,
      emergency_contact_name, emergency_contact_phone, club,
      shirt_size, wants_photos, donation, ships_by_mail, mailing_address,
      service_fee, sales_tax, amount
    ) values (
      ev.id, cat.id, uid, 'pending', now() + interval '30 minutes',
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
      fee, tax, total
    )
    returning * into reg;
  else
    update public.registrations set
      category_id = cat.id,
      hold_expires_at = now() + interval '30 minutes',
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
      service_fee = fee,
      sales_tax = tax,
      amount = total
    where id = own.id
    returning * into reg;
  end if;

  return reg;
end;
$$;
