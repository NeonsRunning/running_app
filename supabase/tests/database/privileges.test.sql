-- Who may call what, and write where: the whole list, in one place.
--
-- Supabase grants `anon` and `authenticated` EXECUTE on every new function
-- and everything on every new table. Each function meant for the server or
-- for cron, and each table written only by functions, stays private only
-- because a migration remembered to revoke — so the likeliest way to open a
-- hole is to add a function and forget. These tests name every function each
-- role may call: a new one fails them until it is put on a list on purpose.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- Trigger functions cannot be called through the API, whatever their grants.
select set_eq(
  $$ select distinct p.proname::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  array[
    'is_organizer',
    'platform_stats',
    'public_event_results',
    'public_result_events',
    'registration_counts',
    'removed_event_visible',
    'search_events',
    'slugify_handle'
  ],
  'a visitor may call only the public reads'
);

select set_eq(
  $$ select distinct p.proname::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  array[
    -- The public reads.
    'is_organizer',
    'platform_stats',
    'public_event_results',
    'public_result_events',
    'registration_counts',
    'removed_event_visible',
    'search_events',
    'slugify_handle',
    -- Each of these checks who is calling.
    'admin_list_events',
    'admin_list_payments',
    'admin_list_users',
    'admin_remove_event',
    'admin_restore_event',
    'ath_movil_review_queue',
    'can_review_ath_movil_payment',
    'cancel_account_deletion',
    'delete_event',
    'disqualify_race_result',
    'event_signup_totals',
    'is_platform_admin',
    'mark_medal_picked_up',
    'mark_shipment_shipped',
    'organizer_dashboard_summary',
    'own_storage_object_count',
    'record_race_result',
    'register_for_event',
    'reinstate_race_result',
    'remove_registration',
    'request_account_deletion',
    'return_registration_to_pending',
    'review_ath_movil_payment',
    'review_race_result',
    'save_event',
    'set_checked_in',
    'set_medal_delivery',
    'submit_ath_movil_payment',
    'submit_race_result'
  ],
  'a signed-in user may call those and the functions that check the caller, and nothing else'
);

-- Named as well, since these are the ones that move money or skip a limit.
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated')) as r(role)
    where n.nspname = 'public'
      and p.proname in (
        'confirm_registration_payment', 'cancel_unpaid_registration',
        'hit_rate_limit', 'call_cron_route', 'purge_abandoned_registrations',
        'purge_rate_limits', 'purge_sent_emails', 'can_manage_event',
        'medal_earned', 'next_handle', 'ath_reference_key', 'orphaned_evidence'
      )
      and has_function_privilege(r.role, p.oid, 'EXECUTE')
  ),
  'the server''s and cron''s functions are closed to both'
);

-- Tables ---------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.platform_admins', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.platform_admins', 'SELECT, INSERT, UPDATE, DELETE'),
  'nobody reads or writes the list of admins through the API'
);

select ok(
  not has_table_privilege('anon', 'public.email_outbox', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.email_outbox', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('anon', 'public.rate_limits', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.rate_limits', 'SELECT, INSERT, UPDATE, DELETE'),
  'nor the outbox or the rate-limit counters'
);

select ok(
  not has_table_privilege('authenticated', 'public.events', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.event_categories', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.registrations', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.race_results', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.event_moderation_log', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.account_deletion_requests', 'INSERT, UPDATE, DELETE'),
  'tables written only by functions take no direct writes'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'DELETE')
  and not has_table_privilege('authenticated', 'public.profile_private', 'DELETE')
  and not has_table_privilege('authenticated', 'public.ath_movil_accounts', 'DELETE'),
  'nobody deletes a profile, private details or an ATH Móvil account'
);

-- The insert grant was a way to ask whether a hidden profile holds a handle.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
  and not has_column_privilege('authenticated', 'public.profiles', 'handle', 'INSERT')
  and not has_table_privilege('anon', 'public.profiles', 'INSERT'),
  'profiles are created by the sign-up trigger only'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'account_type', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'handle', 'UPDATE'),
  'nobody changes their own account type or handle'
);

-- Registrations: every column but the two that name staff.
select ok(
  not has_column_privilege('authenticated', 'public.registrations', 'payment_reviewed_by', 'SELECT')
  and not has_column_privilege('authenticated', 'public.registrations', 'cancelled_by', 'SELECT'),
  'runners and organizers cannot see who reviewed a payment or cancelled a sign-up'
);

select is(
  (select count(*)
   from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'registrations'
     and c.column_name not in ('payment_reviewed_by', 'cancelled_by')
     and not has_column_privilege(
       'authenticated', 'public.registrations', c.column_name::text, 'SELECT')),
  0::bigint,
  'and can read every other column — a new one needs its own grant'
);

select ok(
  has_column_privilege('service_role', 'public.registrations', 'payment_reviewed_by', 'SELECT'),
  'the server still reads the whole row'
);

select * from finish();
rollback;
