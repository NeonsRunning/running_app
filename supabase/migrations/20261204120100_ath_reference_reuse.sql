-- ---------------------------------------------------------------------------
-- One receipt, one sign-up — however the reference is typed
--
-- `submit_ath_movil_payment()` refuses a reference already used on another
-- sign-up paid into the same account, but compared them letter for letter
-- (case aside). "123456", "0123456", "123-456" and "123 456" all passed as
-- different, so one real receipt could back several sign-ups if the reviewer
-- did not notice.
--
-- References are now compared by `ath_reference_key()`: lower case, letters
-- and digits only, leading zeros dropped. One made of nothing else (all
-- punctuation, all zeros) is compared as typed.
--
-- The function below is its latest definition
-- (20261124120000_payment_hardening.sql) with that one comparison changed.
-- ---------------------------------------------------------------------------

create function public.ath_reference_key(p_reference text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(ltrim(regexp_replace(lower(p_reference), '[^a-z0-9]', '', 'g'), '0'), ''),
    lower(trim(p_reference))
  );
$$;

comment on function public.ath_reference_key(text) is
  'An ATH Móvil reference as it is compared for reuse: lower case, letters and digits only, no leading zeros.';

-- Used inside submit_ath_movil_payment() only.
revoke execute on function public.ath_reference_key(text) from public, anon, authenticated;

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
  today date := (now() at time zone 'America/Puerto_Rico')::date;
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

  if reg.status = 'cancelled' then
    raise exception 'registrationMissing' using errcode = 'P0001';
  end if;

  -- The account's row is locked as well, after the event's: references are
  -- unique per account, and other events may be paid into the same one.
  -- `no key update` is enough to queue the next submission behind this one
  -- without blocking writes that merely point at the account.
  perform 1 from public.ath_movil_accounts a
  where a.id = ev.ath_movil_account_id and a.active
  for no key update;
  if not found then
    raise exception 'athMovilUnavailable' using errcode = 'P0001';
  end if;

  if reg.status = 'confirmed' then
    raise exception 'alreadyRegistered' using errcode = 'P0001';
  end if;
  if reg.payment_submitted_at is not null then
    raise exception 'paymentUnderReview' using errcode = 'P0001';
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

  if reg.payment_rejections >= 3 then
    raise exception 'referenceLimitReached' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.id <> reg.id
      and r.ath_movil_account_id = ev.ath_movil_account_id
      and public.ath_reference_key(r.payment_reference) = public.ath_reference_key(ref)
  ) then
    raise exception 'referenceUsed' using errcode = 'P0001';
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
    -- Held until someone reviews it; see 2 above for why it has no end.
    hold_expires_at = 'infinity'
  where id = reg.id
  returning * into reg;

  return reg;
end;
$$;
