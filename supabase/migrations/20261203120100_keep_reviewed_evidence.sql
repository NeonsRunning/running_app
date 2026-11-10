-- ---------------------------------------------------------------------------
-- Evidence behind a reviewed result stays
--
-- "Runners delete their own evidence" (20261108120000_race_results.sql) let a
-- runner delete any file in their folder at any time — including the
-- screenshot behind a time the organizer had already accepted, or one they
-- were disqualified over. With no update policy the file could not be
-- changed in place, but deleted and uploaded again under the same name it
-- could: the published time, the medal and any later dispute then rest on a
-- picture nobody reviewed, or on none.
--
-- The delete now applies only to a file no accepted or disqualified result
-- points at. What the app itself deletes is unaffected: an upload the server
-- refused, and the file a new submission replaced, are both unreferenced by
-- then, and a result can only be re-sent while it is pending or rejected.
--
-- The subquery runs as the runner, who can read their own results and these
-- two columns (20261127120000_audit_hardening.sql).
-- ---------------------------------------------------------------------------

drop policy if exists "Runners delete their own evidence" on storage.objects;
create policy "Runners delete their own evidence"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'race-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1
      from public.race_results r
      where r.evidence_path = storage.objects.name
        and r.status in ('accepted', 'disqualified')
    )
  );
