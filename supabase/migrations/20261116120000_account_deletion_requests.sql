-- ---------------------------------------------------------------------------
-- Account deletion requests
--
-- "Delete account" in settings used to show a toast and do nothing. It now
-- files a request: a row here, which the settings page shows back to the
-- runner, and an email to the team, who carry it out by hand.
--
-- By hand, not by cascade, on purpose. Deleting the auth user would cascade
-- through `profiles` into `registrations` and `race_results`, and a paid
-- registration is the record of a payment that has to be kept (and of a
-- refund that may still be owed). The team decides per account what is
-- deleted and what is anonymised, as the privacy policy describes.
--
-- One request per account: asking again returns the first one. Written only
-- through `request_account_deletion()` and `cancel_account_deletion()`;
-- `team_notified_at` is set by the server with the service role once the
-- team's email has gone out, so a request whose email failed can be found and
-- sent again.
--
-- The runner can withdraw the request from settings for as long as it is on
-- file. The team removes the row once the account is dealt with; until then,
-- a cancellation emails the team so nobody carries it out.
-- ---------------------------------------------------------------------------

create table public.account_deletion_requests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  team_notified_at timestamptz
);

comment on table public.account_deletion_requests is
  'Runners who asked for their account to be deleted. Carried out by the team.';

-- The ones still waiting for the team's email.
create index account_deletion_requests_unnotified_idx
  on public.account_deletion_requests (requested_at)
  where team_notified_at is null;

alter table public.account_deletion_requests enable row level security;

create policy "Runners read their own deletion request"
  on public.account_deletion_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Admins read every deletion request"
  on public.account_deletion_requests for select
  to authenticated
  using ((select public.is_platform_admin()));

-- No insert, update or delete grants: the function below is the only writer.
grant select on public.account_deletion_requests to authenticated;

-- ---------------------------------------------------------------------------
-- request_account_deletion(): file the caller's request, or return the one
-- already on file. Errors:
--
--   sessionExpired  not signed in
-- ---------------------------------------------------------------------------

create or replace function public.request_account_deletion()
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  req public.account_deletion_requests;
begin
  if uid is null then
    raise exception 'sessionExpired' using errcode = 'P0001';
  end if;

  insert into public.account_deletion_requests (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select * into req from public.account_deletion_requests where user_id = uid;
  return req;
end;
$$;

revoke execute on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_account_deletion(): withdraw the caller's request. Returns the row
-- as it was, so the server knows whether the team had been told and has to
-- hear that it is off. Errors:
--
--   sessionExpired  not signed in
--   notRequested    no request on file (never made, or already withdrawn)
-- ---------------------------------------------------------------------------

create or replace function public.cancel_account_deletion()
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  req public.account_deletion_requests;
begin
  if uid is null then
    raise exception 'sessionExpired' using errcode = 'P0001';
  end if;

  delete from public.account_deletion_requests
  where user_id = uid
  returning * into req;

  if req.user_id is null then
    raise exception 'notRequested' using errcode = 'P0001';
  end if;

  return req;
end;
$$;

revoke execute on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;
