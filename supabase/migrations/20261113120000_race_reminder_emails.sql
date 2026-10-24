-- ---------------------------------------------------------------------------
-- Race reminder emails
--
-- The day before a race, every confirmed runner gets a reminder with their
-- bib, start time and place. `/api/cron/race-reminders` sends them: run it
-- once a day (see README). Whichever run sets `reminder_email_sent_at` first
-- (an update guarded by `is null`) sends; a failed send clears it again so
-- the next run retries.
--
-- Written by the server with the service role only.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column reminder_email_sent_at timestamptz;

comment on column public.registrations.reminder_email_sent_at is
  'When the race reminder email was handed to Brevo. Null until then.';
