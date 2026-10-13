-- ---------------------------------------------------------------------------
-- Confirmation emails for paid registrations.
--
-- The page, the register page reload and the Stripe webhook can all confirm
-- the same payment. Whichever sets `confirmation_email_sent_at` first (an
-- update guarded by `is null`) sends the email through Brevo; the rest see it
-- set and stay quiet. A failed send clears it again so a later confirmation
-- can retry.
--
-- Written by the server with the service role only.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column confirmation_email_sent_at timestamptz;

comment on column public.registrations.confirmation_email_sent_at is
  'When the confirmation email was handed to Brevo. Null until then.';
