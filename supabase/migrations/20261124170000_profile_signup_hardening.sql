-- ---------------------------------------------------------------------------
-- Sign-up hardening
--
-- Two fixes to 20260824120000_profiles.sql:
--
--   next_handle()      runs as the definer so it can see every handle, private
--                      profiles' included. Supabase grants execute on new
--                      functions to anon and authenticated by default, so
--                      `rpc('next_handle', { seed: 'ana-figueroa' })` told a
--                      stranger that a hidden profile holds that handle (the
--                      answer comes back as `ana-figueroa2`). Only
--                      handle_new_user() needs it, and it calls it as the
--                      definer, who keeps the right as owner.
--
--   handle_new_user()  copied the sign-up metadata straight into `profiles`,
--                      so a `full_name` over 80 characters or an `avatar_url`
--                      that is not http(s) broke a check constraint, and the
--                      runner got "Database error saving new user" with no
--                      account. The metadata is the sign-up form's or the
--                      OAuth provider's, neither of which we control, so it
--                      is cut to fit instead of trusted.
-- ---------------------------------------------------------------------------

revoke execute on function public.next_handle(text) from public, anon, authenticated;

-- As before, but the name is cut to the 80 characters `profiles.full_name`
-- allows, and an avatar URL that would fail `profiles_avatar_url_check` is
-- dropped (the app never renders it anyway: see 20261030120000).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  display_name text :=
    nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), '');
  seed text := coalesce(display_name, split_part(coalesce(new.email, ''), '@', 1));
  -- Cut, then trim again: the cut can land after a space. Never empty, since
  -- the first character of a trimmed, non-empty name is not a space.
  profile_name text :=
    trim(left(coalesce(display_name, nullif(seed, ''), 'Runner'), 80));
  avatar text := case
    when meta ->> 'avatar_url' ~ '^https?://' then meta ->> 'avatar_url'
  end;
begin
  for attempt in 1 .. 5 loop
    begin
      insert into public.profiles (id, handle, full_name, avatar_url)
      values (new.id, public.next_handle(seed), profile_name, avatar);
      exit;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;

  insert into public.profile_private (id) values (new.id);

  return new;
end;
$$;
