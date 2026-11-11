-- ---------------------------------------------------------------------------
-- Grants that match what the policies already say
--
-- Supabase grants `anon` and `authenticated` everything on a new table, and
-- row-level security is what holds them back. Several tables here were
-- protected by that alone — "RLS on, no policy" — with the grants underneath
-- still wide open: one careless policy on `platform_admins` and anyone could
-- make themselves an admin. Each change below removes a grant nothing uses,
-- so the policies are no longer the only thing in the way.
--
--   1. `platform_admins`: no access at all. Read only inside
--      `is_platform_admin()` and `admin_list_users()`, which run as owner.
--   2. Tables written only by functions lose their direct write grants:
--      `account_deletion_requests`, `event_moderation_log`, `race_results`;
--      and nobody deletes a profile, private details or an ATH Móvil
--      account through the API.
--   3. `profiles` insert. The sign-up trigger writes the row; no client does.
--      The grant was a way to ask whether a hidden profile holds a handle:
--      an insert with `on conflict (handle) do nothing` answers differently
--      for a taken handle than for a free one — what revoking
--      `next_handle()` (20261124170000) was meant to stop.
--   4. `registrations`: runners and organizers no longer read
--      `payment_reviewed_by` and `cancelled_by`, which name the admin or
--      organizer who acted. The same was done for `race_results` in
--      20261127120000. The grant is built from the table's columns, so it
--      covers every other column there is today; A COLUMN ADDED LATER NEEDS
--      ITS OWN `grant select (…) … to authenticated`, or clients cannot read
--      it. Functions that return a registration still return the whole row.
--   5. `event-images`: at most 1,000 files per organizer, like the caps on
--      avatars and evidence. A race uses three; the room is for years of
--      races and replaced covers.
-- ---------------------------------------------------------------------------

-- 1 ---------------------------------------------------------------------------

revoke all on public.platform_admins from anon, authenticated;

-- 2 ---------------------------------------------------------------------------

revoke all on public.account_deletion_requests, public.event_moderation_log
  from anon;
revoke insert, update, delete, truncate
  on public.account_deletion_requests, public.event_moderation_log, public.race_results
  from anon, authenticated;
revoke delete, truncate
  on public.profiles, public.profile_private, public.ath_movil_accounts
  from anon, authenticated;

-- 3 ---------------------------------------------------------------------------

revoke insert on public.profiles from anon, authenticated;

-- 4 ---------------------------------------------------------------------------

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'registrations'
    and column_name not in ('payment_reviewed_by', 'cancelled_by');

  revoke select on public.registrations from authenticated;
  execute format('grant select (%s) on public.registrations to authenticated', cols);
end;
$$;

-- 5 ---------------------------------------------------------------------------

drop policy if exists "Organizers upload event images to their own folder" on storage.objects;
create policy "Organizers upload event images to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_organizer())
    and (select public.own_storage_object_count('event-images')) < 1000
  );
