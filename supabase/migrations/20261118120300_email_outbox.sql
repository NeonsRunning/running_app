-- ---------------------------------------------------------------------------
-- Email outbox
--
-- The emails that go to every runner of a race — its date or place changed,
-- it was cancelled, it was reinstated — were sent straight from `after()`,
-- once. A function cut short by its time limit, or Brevo down for a minute,
-- dropped the rest silently, and a cancellation notice is the one telling a
-- runner they are owed a refund.
--
-- They are now written here first, already rendered, and sent from here: right
-- away by the request that wrote them, and by `/api/cron/email-outbox` for
-- whatever that did not finish or failed. A send is claimed by bumping
-- `attempts` (an update guarded by the value read), so two senders never send
-- the same row; a failure is retried with backoff, and after 8 attempts the
-- row is left with its `last_error` for a person to look at.
--
-- Server only: the service role reads and writes it. Rows hold addresses and
-- names, so nobody else may.
-- ---------------------------------------------------------------------------

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  -- The `Email` handed to Brevo (lib/email/brevo.ts): to, replyTo, subject,
  -- html, text, tags.
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  -- The first tag, for finding a kind of email: "event-cancelled".
  tag text check (char_length(tag) <= 60),
  created_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text check (char_length(last_error) <= 1000)
);

comment on table public.email_outbox is
  'Emails waiting to be handed to Brevo, with retries. Written and sent by the server only.';

-- What the sender scans: unsent rows that are due.
create index email_outbox_due_idx
  on public.email_outbox (next_attempt_at)
  where sent_at is null;

alter table public.email_outbox enable row level security;

-- No policies: only the service role, which bypasses row-level security.
revoke all on public.email_outbox from anon, authenticated;

-- Sent rows are kept a month, for "did the email go out?", then cleared.
create or replace function public.purge_sent_emails()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
  delete from public.email_outbox
  where sent_at is not null and sent_at < now() - interval '30 days';
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke execute on function public.purge_sent_emails() from public, anon, authenticated;

select cron.schedule(
  'purge-sent-emails',
  '43 4 * * *',
  'select public.purge_sent_emails()'
);
