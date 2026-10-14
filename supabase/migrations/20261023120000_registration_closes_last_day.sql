-- ---------------------------------------------------------------------------
-- Registration closes by the race's last day.
--
-- A multi-day or virtual race can take sign-ups until its end date, so
-- `registration_closes` is bounded by coalesce(end_date, event_date) rather
-- than `event_date`. The old check was unnamed; it is found by its definition.
-- ---------------------------------------------------------------------------

do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) = 'CHECK ((registration_closes <= event_date))';
  if c is not null then
    execute format('alter table public.events drop constraint %I', c);
  end if;
end;
$$;

alter table public.events add constraint events_closes_by_last_day
  check (registration_closes <= coalesce(end_date, event_date));
