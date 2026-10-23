-- ---------------------------------------------------------------------------
-- Admins removing an event that has runners
--
-- An organizer can only delete an event nobody has paid for
-- (20261107120000_delete_event). Once runners have paid — and run, and had
-- their finishes accepted — the event cannot go: its registrations are the
-- record of the money, and its accepted results are on runners' profiles.
--
-- A platform admin can instead remove it. A removed event is kept whole but
-- hidden: it leaves the listing, search, the event page and the stats (all of
-- which read only 'published'), it takes no sign-ups or results (both require
-- 'published'), and its organizer can no longer edit or delete it. Runners
-- keep their accepted results, still named after the event.
--
-- Removal is refused while it would strand money:
--
--   * an ATH Móvil payment is waiting for review — someone has to look at it;
--   * runners have paid for an event that has not ended yet — that is a
--     cancellation, and owes them refunds.
--
-- Unpaid checkouts are cleared, as on delete. Every removal and restore is
-- written to `event_moderation_log`, which only admins can read: the reason
-- is not for the public, so it is not a column on the event.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The log
-- ---------------------------------------------------------------------------

create table public.event_moderation_log (
  id uuid primary key default gen_random_uuid(),
  -- Set null rather than cascade: the log outlives the event. The name and
  -- slug are copied so an entry still says what it was about.
  event_id uuid references public.events (id) on delete set null,
  event_name text not null,
  event_slug text not null,
  action text not null check (action in ('removed', 'restored')),
  reason text check (char_length(reason) <= 500),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index event_moderation_log_event_idx
  on public.event_moderation_log (event_id, created_at desc);

alter table public.event_moderation_log enable row level security;

-- Written only by the functions below.
create policy "Admins read the moderation log"
  on public.event_moderation_log for select
  to authenticated
  using ((select public.is_platform_admin()));

grant select on public.event_moderation_log to authenticated;

-- ---------------------------------------------------------------------------
-- Visibility
--
-- A removed event stays readable where something still points at it: to its
-- organizer (their dashboard), to admins, and to anyone when it has accepted
-- results (they are on runners' profiles) or to a runner with a result of
-- their own for it. The check reads `race_results`, whose policies read
-- `events`, so it runs with definer rights to keep the two from recursing.
-- ---------------------------------------------------------------------------

create or replace function public.removed_event_visible(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.race_results r
    where r.event_id = p_event_id
      and (r.status = 'accepted' or r.runner_id = (select auth.uid()))
  );
$$;

revoke execute on function public.removed_event_visible(uuid) from public;
grant execute on function public.removed_event_visible(uuid) to anon, authenticated;

drop policy "Published events are readable by anyone; drafts by their owner"
  on public.events;

create policy "Published events are readable by anyone; the rest by their owner"
  on public.events for select
  to anon, authenticated
  using (
    status = 'published'
    or (select auth.uid()) = organizer_id
    or (status = 'removed' and public.removed_event_visible(id))
  );

-- The organizer keeps reading a removed event, but no longer changes it.
drop policy "Organizers edit their own events" on public.events;

create policy "Organizers edit their own events"
  on public.events for update
  to authenticated
  using (
    (select auth.uid()) = organizer_id
    and (select public.is_organizer())
    and status <> 'removed'
  )
  with check ((select auth.uid()) = organizer_id and status <> 'removed');

drop policy "Organizers delete their own events" on public.events;

create policy "Organizers delete their own events"
  on public.events for delete
  to authenticated
  using (
    (select auth.uid()) = organizer_id
    and (select public.is_organizer())
    and status <> 'removed'
  );

drop policy "Organizers manage categories of their own events"
  on public.event_categories;

create policy "Organizers manage categories of their own events"
  on public.event_categories for all
  to authenticated
  using (
    (select public.is_organizer()) and exists (
      select 1 from public.events e
      where e.id = event_id
        and e.organizer_id = (select auth.uid())
        and e.status <> 'removed'
    )
  )
  with check (
    (select public.is_organizer()) and exists (
      select 1 from public.events e
      where e.id = event_id
        and e.organizer_id = (select auth.uid())
        and e.status <> 'removed'
    )
  );

-- ---------------------------------------------------------------------------
-- delete_event(): as before, but a removed event is not the organizer's to
-- delete any more. It answers as a missing one.
-- ---------------------------------------------------------------------------

create or replace function public.delete_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ev public.events;
begin
  select * into ev from public.events where id = p_event_id for update;

  if uid is null or ev.id is null or ev.organizer_id <> uid
     or ev.status = 'removed' then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id
      and (r.status = 'confirmed' or r.payment_submitted_at is not null)
  ) then
    raise exception 'eventHasRegistrations' using errcode = 'P0001';
  end if;

  delete from public.registrations
  where event_id = p_event_id and status = 'pending';

  delete from public.events where id = p_event_id returning * into ev;
  return ev;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_remove_event(): hide a published event. Errors:
--
--   notAllowed           not a platform admin
--   eventNotFound        no such published event (drafts are the organizer's)
--   alreadyRemoved       removed already
--   reasonRequired       no reason, or over 500 characters
--   paymentsUnderReview  an ATH Móvil payment waits for review
--   eventNotFinished     runners have paid and the event has not ended
-- ---------------------------------------------------------------------------

create or replace function public.admin_remove_event(
  p_event_id uuid,
  p_reason text
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  ev public.events;
begin
  if uid is null or not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception 'reasonRequired' using errcode = 'P0001';
  end if;

  -- The same lock sign-ups and reviews take.
  select * into ev from public.events where id = p_event_id for update;

  if ev.id is null or ev.status = 'draft' then
    raise exception 'eventNotFound' using errcode = 'P0001';
  end if;
  if ev.status = 'removed' then
    raise exception 'alreadyRemoved' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id
      and r.status = 'pending'
      and r.payment_submitted_at is not null
  ) then
    raise exception 'paymentsUnderReview' using errcode = 'P0001';
  end if;

  -- Ended means its last day is behind us in Puerto Rico.
  if ev.last_day >= (now() at time zone 'America/Puerto_Rico')::date
     and exists (
       select 1 from public.registrations r
       where r.event_id = p_event_id and r.status = 'confirmed'
     )
  then
    raise exception 'eventNotFinished' using errcode = 'P0001';
  end if;

  -- A Stripe payment that lands after its row is gone is refunded in full by
  -- `settlePayment()`, as on delete.
  delete from public.registrations
  where event_id = p_event_id and status = 'pending';

  update public.events set status = 'removed'
  where id = p_event_id
  returning * into ev;

  insert into public.event_moderation_log
    (event_id, event_name, event_slug, action, reason, actor_id)
  values (ev.id, ev.name, ev.slug, 'removed', v_reason, uid);

  return ev;
end;
$$;

revoke execute on function public.admin_remove_event(uuid, text) from public, anon;
grant execute on function public.admin_remove_event(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_restore_event(): put a removed event back as published. Errors:
--
--   notAllowed     not a platform admin
--   eventNotFound  no such removed event
-- ---------------------------------------------------------------------------

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

  insert into public.event_moderation_log
    (event_id, event_name, event_slug, action, actor_id)
  values (ev.id, ev.name, ev.slug, 'restored', uid);

  return ev;
end;
$$;

revoke execute on function public.admin_restore_event(uuid) from public, anon;
grant execute on function public.admin_restore_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_events(): what the admin page shows. Published or removed
-- events — drafts are nobody's business but their organizer's — matched by
-- name or slug, with what removal would weigh: paid runners, accepted
-- results, payments under review, and for a removed one, the last reason.
-- At most 50; the admin narrows with the search.
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_events(
  p_query text default null,
  p_removed boolean default false
)
returns table (
  id uuid,
  slug text,
  name text,
  status public.event_status,
  event_date date,
  last_day date,
  organizer_name text,
  paid_runners bigint,
  accepted_results bigint,
  payments_under_review bigint,
  removed_at timestamptz,
  removal_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Typed text is matched literally, wildcards and all.
  pattern text := '%' || replace(replace(replace(
    btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.is_platform_admin() then
    raise exception 'notAllowed' using errcode = 'P0001';
  end if;

  return query
  select
    e.id, e.slug, e.name, e.status, e.event_date, e.last_day,
    p.full_name,
    (select count(*) from public.registrations r
      where r.event_id = e.id and r.status = 'confirmed'),
    (select count(*) from public.race_results rr
      where rr.event_id = e.id and rr.status = 'accepted'),
    (select count(*) from public.registrations r
      where r.event_id = e.id and r.status = 'pending'
        and r.payment_submitted_at is not null),
    l.created_at,
    l.reason
  from public.events e
  left join public.profiles p on p.id = e.organizer_id
  left join lateral (
    select m.created_at, m.reason from public.event_moderation_log m
    where m.event_id = e.id and m.action = 'removed'
    order by m.created_at desc
    limit 1
  ) l on e.status = 'removed'
  where e.status = case when p_removed then 'removed' else 'published' end::public.event_status
    and (e.name ilike pattern or e.slug ilike pattern)
  order by
    case when p_removed then l.created_at end desc nulls last,
    e.event_date desc
  limit 50;
end;
$$;

revoke execute on function public.admin_list_events(text, boolean) from public, anon;
grant execute on function public.admin_list_events(text, boolean) to authenticated;
