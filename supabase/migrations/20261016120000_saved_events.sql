-- ---------------------------------------------------------------------------
-- Saved events
--
-- The races a runner has hearted. Keyed by slug rather than `events.id`
-- because races still live in two places: the fixtures in `lib/data.ts`
-- have no row here to point at. Slugs are stable — the publish action picks
-- one once and keeps it through renames, and never hands out a fixture's —
-- so a slug names the same race for as long as it exists.
--
-- No foreign key, then: deleting an event leaves its saves behind. They
-- match nothing when the saved list renders, so they are harmless.
--
-- Private to the runner. Nobody else reads or writes these rows.
-- ---------------------------------------------------------------------------

create table public.saved_events (
  -- Cascade: deleting an account takes its saves along.
  runner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  event_slug text not null
    check (event_slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  created_at timestamptz not null default now(),

  primary key (runner_id, event_slug)
);

comment on table public.saved_events is
  'One race a runner has saved, by slug. Covers fixture and database events alike.';

alter table public.saved_events enable row level security;

create policy "Runners read their own saved events"
  on public.saved_events for select
  to authenticated
  using ((select auth.uid()) = runner_id);

create policy "Runners save events for themselves"
  on public.saved_events for insert
  to authenticated
  with check ((select auth.uid()) = runner_id);

create policy "Runners remove their own saved events"
  on public.saved_events for delete
  to authenticated
  using ((select auth.uid()) = runner_id);

-- No update: a save is there or it is not.
grant select, insert, delete on public.saved_events to authenticated;
