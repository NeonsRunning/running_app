-- ---------------------------------------------------------------------------
-- Profile mailing address
--
-- Where a runner's medal goes when they pick "send by mail" at registration.
-- Kept on profile_private, the owner-only half, and copied into the
-- registration's `mailing_address` as text when they sign up — so editing it
-- later never moves a kit that is already on its way.
--
-- A US postal address (Puerto Rico included). Either all of the required
-- parts are there or none are: half an address is not somewhere to mail to.
-- ---------------------------------------------------------------------------

alter table public.profile_private
  add column if not exists address_line1 text
    check (char_length(address_line1) <= 100),
  add column if not exists address_line2 text
    check (char_length(address_line2) <= 100),
  add column if not exists address_city text
    check (char_length(address_city) <= 80),
  add column if not exists address_state text
    check (address_state ~ '^[A-Z]{2}$'),
  add column if not exists address_postal_code text
    check (address_postal_code ~ '^[0-9]{5}(-[0-9]{4})?$');

alter table public.profile_private
  drop constraint if exists profile_private_address_complete;
alter table public.profile_private
  add constraint profile_private_address_complete check (
    (address_line1 is null and address_line2 is null and address_city is null
      and address_state is null and address_postal_code is null)
    or (address_line1 is not null and address_city is not null
      and address_state is not null and address_postal_code is not null)
  );

comment on column public.profile_private.address_line1 is
  'Mailing address, street line. Prefills the registration''s mailing_address.';
