-- ---------------------------------------------------------------------------
-- Email preferences
--
-- The notification switches in settings were local state that reset on
-- reload. Three of them now stand for emails the platform really sends, and
-- are kept here, on the owner-only half of the profile (the runner writes
-- them through the existing grants on `profile_private`):
--
--   email_reminders  the race reminder, the day before (lib/email/race-reminder.ts)
--   email_results    an organizer accepting or sending back a finish time
--                    the runner submitted (lib/email/result-reviewed.ts)
--   email_updates    a race's date, start time or place changing
--                    (lib/email/event-updated.ts)
--
-- Everything else stays mandatory: confirmations, payments and refunds,
-- removals from a race, cancellations, kit shipping. Those are about money
-- or a spot the runner holds.
--
-- All on by default, as the emails went out to everyone until now.
-- ---------------------------------------------------------------------------

alter table public.profile_private
  add column if not exists email_reminders boolean not null default true,
  add column if not exists email_results boolean not null default true,
  add column if not exists email_updates boolean not null default true;

comment on column public.profile_private.email_reminders is
  'Send the race reminder the day before each race.';
comment on column public.profile_private.email_results is
  'Email when an organizer reviews a finish time the runner submitted.';
comment on column public.profile_private.email_updates is
  'Email when a race the runner entered changes its date, start time or place.';

-- A reminder skipped because the runner switched reminders off is marked too,
-- so the daily run stops picking it up.
comment on column public.registrations.reminder_email_sent_at is
  'When the race reminder email was handed to Brevo, or skipped because the runner switched reminders off. Null until then.';
