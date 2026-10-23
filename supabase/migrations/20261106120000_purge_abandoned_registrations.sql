-- ---------------------------------------------------------------------------
-- Clearing out abandoned checkouts
--
-- Starting to pay writes a *pending* registration that holds a spot for 30
-- minutes. A runner who walks away leaves that row behind: it stops counting
-- once the hold lapses, but it stays in the table for good. Every hour this
-- job deletes the ones nobody is coming back for.
--
-- A pending row is left alone while any money may still be on its way:
--
--   * An ATH Móvil payment the runner says they sent (`payment_submitted_at`
--     set) waits for review with its hold at 'infinity'. Never touched here.
--
--   * A Stripe payment opened for it (`payment_intent_id` set) may still be
--     clearing — a slow bank, 3-D Secure left open in another tab. The row is
--     kept for 7 days after its hold lapses. Should a payment land after
--     that anyway, `settlePayment()` finds no row and refunds it in full.
--
--   * An ATH Móvil payment that was rejected (`payment_rejected_at` set) is
--     what tells the runner, on the race page, that their payment was not
--     found. That notice stays up for the same 7 days.
--
-- Anything else — the runner never got as far as paying — goes an hour after
-- its hold lapses. Coming back later simply starts a fresh sign-up.
--
-- This replaces "pending rows are never deleted" from
-- 20261017120000_registration_payments.sql.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

create or replace function public.purge_abandoned_registrations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
  delete from public.registrations r
  where r.status = 'pending'
    and r.payment_submitted_at is null
    and r.hold_expires_at is not null
    and r.hold_expires_at < now() - case
      when r.payment_intent_id is not null or r.payment_rejected_at is not null
        then interval '7 days'
      else interval '1 hour'
    end;

  get diagnostics purged = row_count;
  return purged;
end;
$$;

comment on function public.purge_abandoned_registrations() is
  'Deletes pending registrations whose hold lapsed and that have no payment on its way. Run hourly by pg_cron.';

-- Only the scheduler runs it.
revoke execute on function public.purge_abandoned_registrations()
  from public, anon, authenticated;

-- What the job scans: pending rows with no ATH Móvil payment waiting.
create index if not exists registrations_abandoned_idx
  on public.registrations (hold_expires_at)
  where status = 'pending' and payment_submitted_at is null;

-- Scheduling by name replaces an existing job of the same name, so
-- re-running this migration does not stack copies.
select cron.schedule(
  'purge-abandoned-registrations',
  '17 * * * *',
  'select public.purge_abandoned_registrations()'
);
