-- ---------------------------------------------------------------------------
-- Hardening from the November audit, part two
--
-- 1. Column grants. Row-level security picks rows, not columns, and both
--    tables were granted whole:
--
--    race_results         every accepted result showed anyone `reviewed_by`
--                         and `disqualified_by` — the organizer or platform
--                         admin who acted, so the admins could be told apart
--                         and targeted. Nobody reads them through the API;
--                         they are granted to no one now. Visitors also stop
--                         seeing `registration_id` and `evidence_path`: the
--                         public profile reads neither.
--    ath_movil_accounts   visitors no longer see `owner_id`. Signed-in
--                         organizers and admins still read it: the payment
--                         review and the admin page ask who holds an account.
--
-- 2. Upload caps that hold under concurrency. The avatar cap counted per
--    statement, so uploads sent at once all saw room. Evidence had no cap.
--    `own_storage_object_count()` takes a lock per user and bucket before it
--    counts, so a second upload waits for the first and counts it. Evidence
--    allows two files more than the runner's results could ever claim.
--
-- 3. register_for_event() reads the distance again once it holds the event
--    lock. Read before, a save that lowered its price or cap while the
--    sign-up waited went unseen: the runner paid the old price, or the
--    distance filled past its new cap. Otherwise as before
--    (20261124120000_payment_hardening).
--
-- 4. organizer_dashboard_summary() leaves out races an admin removed, whose
--    runners are owed their money back, and counts revenue net of refunds.
--    platform_stats() counts runners of races that were not removed.
--    Otherwise as before (20261124130001_dashboard_island_days,
--    20261017120000_registration_payments).
-- ---------------------------------------------------------------------------

-- 1 ---------------------------------------------------------------------------

revoke select on public.race_results from anon, authenticated;
grant select (
  id, registration_id, event_id, category_id, runner_id, finish_seconds,
  evidence_path, status, review_note, submitted_at, reviewed_at,
  disqualified_at, disqualification_reason
) on public.race_results to authenticated;
grant select (
  id, event_id, category_id, runner_id, finish_seconds, status, review_note,
  submitted_at, reviewed_at, disqualified_at, disqualification_reason
) on public.race_results to anon;

revoke select on public.ath_movil_accounts from anon;
grant select (id, label, path, qr_path, active, created_at)
  on public.ath_movil_accounts to anon;

-- 2 ---------------------------------------------------------------------------

create or replace function public.own_storage_object_count(p_bucket text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n integer;
begin
  -- Held to the end of the upload's transaction: a concurrent upload to the
  -- same folder waits here, then counts this one.
  perform pg_advisory_xact_lock(hashtext('storage:' || p_bucket || ':' || uid::text));
  select count(*)::int into n
  from storage.objects o
  where o.bucket_id = p_bucket
    and (storage.foldername(o.name))[1] = uid::text;
  return n;
end;
$$;

revoke execute on function public.own_storage_object_count(text) from public, anon;
grant execute on function public.own_storage_object_count(text) to authenticated;

drop policy if exists "Runners upload evidence to their own folder" on storage.objects;
create policy "Runners upload evidence to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'race-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.registrations r
      join public.events e on e.id = r.event_id
      where r.runner_id = (select auth.uid())
        and r.status = 'confirmed'
        and e.accepts_results
    )
    -- One file per result it could claim, and two in flight.
    and (select public.own_storage_object_count('race-evidence')) < 2 + (
      select count(*)
      from public.registrations r
      join public.events e on e.id = r.event_id
      where r.runner_id = (select auth.uid())
        and r.status = 'confirmed'
        and e.accepts_results
    )
  );

drop policy if exists "Runners upload avatars to their own folder" on storage.objects;
create policy "Runners upload avatars to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.own_storage_object_count('avatars')) < 5
  );

drop function if exists public.avatar_file_count();

-- 3 ---------------------------------------------------------------------------

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
  medal_mail boolean := coalesce((p_details ->> 'medal_by_mail')::boolean, false);
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
     or (medal_mail and not ev.mails_medals)
  then
    raise exception 'extrasChanged' using errcode = 'P0001';
  end if;

  if size is not null and not (size = any (ev.shirt_sizes)) then
    raise exception 'shirtSizeUnavailable' using errcode = 'P0001';
  end if;

  if gift < 0 or gift > 1000 then
    raise exception 'donationInvalid' using errcode = 'P0001';
  end if;

  if (mail or medal_mail)
     and (address is null or char_length(address) > 300)
  then
    raise exception 'mailingAddressInvalid' using errcode = 'P0001';
  end if;

  -- Category price, the event's extras, the $2.00 service fee
  -- (`SERVICE_FEE` in lib/events/pricing.ts) and shipping and handling are
  -- taxed at 11.5% (`SALES_TAX_RATE`); the donation is not. A mailed medal
  -- is part of the entry, so it adds nothing.
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
      medal_by_mail, medal_mailing_address, service_fee, sales_tax, amount
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
      medal_mail, case when medal_mail then address end,
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
      medal_mailing_address = case when medal_mail then address end,
      service_fee = fee,
      sales_tax = tax,
      amount = total
    where id = own.id
    returning * into reg;
  end if;

  return reg;
end;
$$;

-- 4 ---------------------------------------------------------------------------

create or replace function public.organizer_dashboard_summary(
  p_organizer_id uuid,
  -- Daily figures from this instant on: the start of the oldest chart bucket.
  p_since timestamptz,
  -- Race day for an undated event, when working out a runner's age.
  p_today date
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with regs as (
    select
      r.event_id,
      coalesce(r.paid_at, r.created_at) as paid,
      r.gender,
      extract(year from age(coalesce(e.event_date, p_today), r.birth_date))::integer as age,
      greatest(0, r.amount - r.amount_refunded - r.service_fee - r.sales_tax) as net
    from public.registrations r
    join public.events e on e.id = r.event_id
    where e.organizer_id = p_organizer_id
      and e.status <> 'removed'
      and r.status = 'confirmed'
  )
  select jsonb_build_object(
    'per_event', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id, 'registered', registered, 'revenue', revenue))
      from (
        select event_id, count(*) as registered, sum(net) as revenue
        from regs group by event_id
      ) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', day, 'registrations', registrations, 'revenue', revenue))
      from (
        select (paid at time zone 'America/Puerto_Rico')::date as day,
               count(*) as registrations, sum(net) as revenue
        from regs where paid >= p_since
        group by 1
      ) x
    ), '[]'::jsonb),
    'demographics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'age_group', age_group, 'gender', gender, 'count', runners))
      from (
        select
          case
            when age < 20 then 'Under 20'
            when age < 30 then '20–29'
            when age < 40 then '30–39'
            when age < 50 then '40–49'
            else '50+'
          end as age_group,
          gender,
          count(*) as runners
        from regs
        group by 1, 2
      ) x
    ), '[]'::jsonb)
  );
$$;

create or replace function public.platform_stats()
returns table (races bigint, runners bigint, organizers bigint, clubs bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.events where status = 'published'),
    (select count(distinct r.runner_id) from public.registrations r
      join public.events e on e.id = r.event_id
      where r.status = 'confirmed' and e.status <> 'removed'),
    (select count(*) from public.profiles where account_type = 'organizer'),
    (select count(distinct name) from (
      select lower(regexp_replace(trim(club), '\s+', ' ', 'g')) as name
      from public.profiles where club is not null
      union
      select lower(regexp_replace(trim(club), '\s+', ' ', 'g'))
      from public.registrations where club is not null and status = 'confirmed'
    ) c where name <> '');
$$;
