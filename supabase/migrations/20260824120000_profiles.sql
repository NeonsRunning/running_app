-- ---------------------------------------------------------------------------
-- Profiles
--
-- `auth.users` is Supabase's table: we cannot add columns to it, and its rows
-- are only reachable through the auth API. Everything the app renders about a
-- person -- the name on a bib, the handle in a URL, whether the organizer
-- tools are switched on -- lives here instead, keyed one-to-one on the user id.
--
-- The split into two tables is a privacy boundary, not a normalisation
-- exercise. Row-level security filters rows, never columns, so a table a
-- stranger may read cannot also hold a phone number: any policy wide enough to
-- show the public profile would show the whole row. So:
--
--   public.profiles         what a visitor sees on /runners/[handle]
--   public.profile_private  contact and race-day data, readable only by its owner
-- ---------------------------------------------------------------------------

create type public.account_type as enum ('runner', 'organizer');
create type public.profile_gender as enum ('f', 'm', 'x');
create type public.shirt_size as enum ('XS', 'S', 'M', 'L', 'XL', 'XXL');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- The public identifier: /runners/ana-figueroa. Lowercase by constraint so
  -- one spelling maps to one profile without a case-insensitive index.
  handle text not null unique
    check (handle ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$'),

  full_name text not null check (char_length(full_name) between 1 and 80),

  -- Runner or organizer. Sign-up never sets this: the trigger below always
  -- writes 'runner', and the account is upgraded from settings afterwards.
  account_type public.account_type not null default 'runner',

  avatar_url text check (avatar_url ~ '^https?://'),
  bio text check (char_length(bio) <= 280),
  city text check (char_length(city) <= 80),
  club text check (char_length(club) <= 80),

  -- False hides the profile from everyone but its owner. Published results
  -- stay public regardless -- they are the record of a public race.
  is_public boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Public account data, one row per auth user. Created by handle_new_user().';

-- The organizer directory and the participant lists both filter on this.
create index profiles_account_type_idx on public.profiles (account_type);

create table public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,

  -- Age brackets are computed from this at registration time; the date itself
  -- never leaves the owner's own session.
  birth_date date check (birth_date > date '1900-01-01'),
  gender public.profile_gender,
  shirt_size public.shirt_size,

  phone text check (phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  emergency_contact_name text check (char_length(emergency_contact_name) <= 80),
  emergency_contact_phone text
    check (emergency_contact_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),

  -- Which language to write to this runner in. The UI locale comes from the
  -- URL; this is for email.
  locale text not null default 'es' check (locale in ('es', 'en')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profile_private is
  'Contact and race-day data. Never readable by anyone but its owner.';

-- ---------------------------------------------------------------------------
-- Handles
-- ---------------------------------------------------------------------------

-- Turn a display name into a handle-shaped string: ASCII, lowercase, at most
-- 24 characters, no leading or trailing separator.
--
-- NFD splits an accented letter into the letter plus a combining mark, so
-- dropping everything outside ASCII afterwards leaves "Muñoz" as "munoz"
-- rather than "muoz" or "mun-oz".
create or replace function public.slugify_handle(seed text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  slug text;
begin
  slug := regexp_replace(
    normalize(lower(coalesce(seed, '')), NFD), '[^\u0000-\u007f]', '', 'g');
  slug := regexp_replace(slug, '[^a-z0-9]+', '-', 'g');
  slug := regexp_replace(slug, '^-+|-+$', '', 'g');
  -- Truncate, then strip again: the cut can land on a separator.
  slug := regexp_replace(left(slug, 24), '-+$', '', 'g');

  if char_length(slug) = 0 then
    return 'runner';
  elsif char_length(slug) < 3 then
    return slug || '-runner';
  end if;

  return slug;
end;
$$;

-- The first free handle for a seed: `ana-figueroa`, then `ana-figueroa2`.
create or replace function public.next_handle(seed text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := public.slugify_handle(seed);
  candidate text := base;
  n int := 0;
begin
  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    n := n + 1;
    -- Truncate before appending so the result stays inside 30 characters.
    candidate := regexp_replace(left(base, 26), '-+$', '', 'g') || n::text;
    -- A pathological run of collisions gives up on the readable form.
    if n >= 50 then
      candidate := regexp_replace(left(base, 20), '-+$', '', 'g')
        || '-' || substr(md5(random()::text), 1, 6);
      exit;
    end if;
  end loop;

  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;

-- `(select auth.uid())` rather than a bare call: the planner evaluates the
-- subquery once per statement instead of once per row.

create policy "Public profiles are readable by anyone"
  on public.profiles for select
  to anon, authenticated
  using (is_public or (select auth.uid()) = id);

create policy "A runner inserts only their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- Includes account_type: switching on the organizer tools is self-serve, and
-- the row is the runner's own. What sign-up cannot do is *arrive* as an
-- organizer -- the trigger below decides that, not the form.
create policy "A runner edits only their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy. Profiles go away with the auth user, by cascade.

create policy "Private details are readable only by their owner"
  on public.profile_private for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "A runner inserts only their own details"
  on public.profile_private for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "A runner edits only their own details"
  on public.profile_private for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update on public.profile_private to authenticated;

-- ---------------------------------------------------------------------------
-- Keeping the tables in step with auth.users
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger profile_private_touch_updated_at
  before update on public.profile_private
  for each row execute function public.touch_updated_at();

-- Give every new user a profile.
--
-- Runs as the definer so it can write past row-level security, and reads the
-- name out of the metadata sign-up attached to the user (`full_name`) or that
-- Google returned (`name`). `account_type` is left at its default: a crafted
-- sign-up post cannot ask for the organizer tools.
--
-- A raise in here reaches the runner as "Database error saving new user", so
-- the one failure worth retrying -- two people claiming one handle in the same
-- instant -- is retried rather than propagated.
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
begin
  for attempt in 1 .. 5 loop
    begin
      insert into public.profiles (id, handle, full_name, avatar_url)
      values (
        new.id,
        public.next_handle(seed),
        coalesce(display_name, nullif(seed, ''), 'Runner'),
        meta ->> 'avatar_url'
      );
      exit;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;

  insert into public.profile_private (id) values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anyone who signed up before this migration.
do $$
declare
  u record;
  meta jsonb;
  display_name text;
  seed text;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
    order by au.created_at
  loop
    meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
    display_name :=
      nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), '');
    seed := coalesce(display_name, split_part(coalesce(u.email, ''), '@', 1));

    insert into public.profiles (id, handle, full_name, avatar_url)
    values (
      u.id,
      public.next_handle(seed),
      coalesce(display_name, nullif(seed, ''), 'Runner'),
      meta ->> 'avatar_url'
    );
  end loop;
end;
$$;

insert into public.profile_private (id)
select p.id from public.profiles p
on conflict (id) do nothing;
