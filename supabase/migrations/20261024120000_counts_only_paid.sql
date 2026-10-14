-- ---------------------------------------------------------------------------
-- Public sign-up counts show paid runners only.
--
-- `registration_counts()` also counted pending registrations with a live
-- hold, so a runner who only reached the payment step showed up as a
-- participant before paying. Holds still reserve a spot: the capacity checks
-- inside `register_for_event()` and `confirm_registration_payment()` count
-- them on their own, so a race full of holds still refuses with `soldOut`.
-- ---------------------------------------------------------------------------

create or replace function public.registration_counts(p_event_ids uuid[])
returns table (category_id uuid, registered bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.category_id, count(*)
  from public.registrations r
  where r.event_id = any (p_event_ids)
    and r.status = 'confirmed'
  group by r.category_id;
$$;
