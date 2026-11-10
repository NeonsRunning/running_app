-- ---------------------------------------------------------------------------
-- A record of the waiver
--
-- The waiver checkbox on the first step of sign-up was checked by the browser
-- and nowhere else: nothing reached the server, and nothing was kept. A
-- disputed sign-up had no record that the runner accepted it, which text, or
-- when.
--
-- `startRegistrationPaymentAction` now refuses a sign-up without it and
-- writes both columns on the registration, with the service role (runners
-- cannot write to this table), the first time the runner accepts it for that
-- sign-up. `waiver_version` is `WAIVER_VERSION` in lib/legal.ts: the date the
-- waiver's text last changed.
--
-- Null on sign-ups made before this migration, and on one made by calling
-- `register_for_event()` directly rather than through the site — which
-- records, truthfully, that no acceptance was given.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column waiver_accepted_at timestamptz,
  add column waiver_version text check (char_length(waiver_version) <= 40);

comment on column public.registrations.waiver_accepted_at is
  'When the runner accepted the waiver at sign-up. Null: no acceptance on record.';
comment on column public.registrations.waiver_version is
  'The waiver text accepted, as the date it last changed (WAIVER_VERSION in lib/legal.ts).';
