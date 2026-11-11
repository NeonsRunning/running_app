-- ---------------------------------------------------------------------------
-- A limit on an event's aid stations and schedule
--
-- Both are jsonb arrays checked only for being arrays, and the whole event
-- row is read into every listing card. The wizard's save action now caps
-- them (60 lines, 6,000 characters each); this is the same limit for a
-- direct `save_event()` call, with room for what the action turns the lines
-- into.
--
-- `not valid`: rows already there are not checked, so the migration cannot
-- fail on one; every insert and update from now on is.
-- ---------------------------------------------------------------------------

alter table public.events
  add constraint events_lists_size check (
    (jsonb_typeof(aid_stations) <> 'array'
      or (jsonb_array_length(aid_stations) <= 60
          and octet_length(aid_stations::text) <= 20000))
    and (jsonb_typeof(schedule) <> 'array'
      or (jsonb_array_length(schedule) <= 60
          and octet_length(schedule::text) <= 20000))
  ) not valid;
