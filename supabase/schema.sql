-- SyncBreaker: the whole database in one file (backup, 2026-10-27)
-- Rebuilds every table, view, function and permission the current game
-- uses, on a new Supabase project or after a loss. Safe to re-run; it
-- deletes nothing. Run it in the SQL Editor after enabling Anonymous
-- Sign-Ins (Authentication > Providers). Use a publishable key in the
-- browser, never a secret / service-role key.
--
-- Model
--   * Every browser is an anonymous Supabase user (no e-mail).
--   * An operator (unique name + password) is required to play. It can be
--     linked to many browsers (operator_links); the browser that created
--     it owns it (profiles.id = its auth uid).
--   * Passwords are bcrypt hashes in operator_secrets, which no client role
--     can read; wrong passwords are rate limited (5 per 15 minutes).
--   * One Endless leaderboard per game (endless_game_scores).
--   * The operator's progress is one JSON blob (operator_progress); the
--     client merges it with the browser's copy (js/ProgressSync.js).
-- All writes go through the SECURITY DEFINER functions below. The game
-- client stays the authority for gameplay: this is basic validation, not
-- full anti-cheat protection.
--
-- Left out on purpose (older clients only, no longer used): the single
-- Timing Bar list endless_best_scores, leaderboard_entries,
-- submit_endless_result, get_my_leaderboard_rank, create_leaderboard_profile.

create extension if not exists pgcrypto with schema extensions;

-- ── Operators ──

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name varchar(16) not null,
    created_at timestamptz not null default now(),
    constraint profiles_display_name_length check (char_length(display_name) between 3 and 16),
    constraint profiles_display_name_characters check (display_name ~ '^[A-Za-z0-9_ -]+$')
);

create unique index if not exists profiles_display_name_lower_key
    on public.profiles (lower(display_name));

alter table public.profiles enable row level security;

-- The leaderboard intentionally exposes only public operator names and scores.
drop policy if exists "authenticated users can read public profiles" on public.profiles;
create policy "authenticated users can read public profiles"
    on public.profiles for select to authenticated using (true);

create table if not exists public.operator_secrets (
    profile_id uuid primary key references public.profiles(id) on delete cascade,
    password_hash text not null,
    updated_at timestamptz not null default now()
);

create table if not exists public.operator_links (
    auth_uid uuid primary key references auth.users(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    linked_at timestamptz not null default now()
);

create table if not exists public.operator_failed_logins (
    id bigserial primary key,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    attempted_at timestamptz not null default now()
);
create index if not exists operator_failed_logins_recent
    on public.operator_failed_logins (profile_id, attempted_at);

alter table public.operator_secrets enable row level security;
alter table public.operator_links enable row level security;
alter table public.operator_failed_logins enable row level security;
-- No policies on purpose: these tables are reachable only via the functions.
revoke all on table public.operator_secrets, public.operator_links, public.operator_failed_logins from anon, authenticated;

-- The operator profile this browser plays as (linked first, else owned).
create or replace function public.current_operator_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(
        (select l.profile_id from public.operator_links l where l.auth_uid = auth.uid()),
        (select p.id from public.profiles p where p.id = auth.uid())
    );
$$;

create or replace function public._check_operator_password(p_password text)
returns void
language plpgsql
immutable
set search_path = pg_temp
as $$
begin
    if p_password is null or char_length(p_password) < 8 or octet_length(p_password) > 72 then
        raise exception 'Password must be 8-72 characters';
    end if;
end;
$$;

-- Who am I? (profile + whether it is protected by a password)
create or replace function public.get_my_operator()
returns table (id uuid, display_name varchar, has_password boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.id, p.display_name, exists (select 1 from public.operator_secrets s where s.profile_id = p.id)
    from public.profiles p
    where p.id = public.current_operator_id();
$$;

-- New operator: unique name + password, owned by this browser.
create or replace function public.create_operator(p_display_name text, p_password text)
returns table (id uuid, display_name varchar, has_password boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_name text := btrim(p_display_name);
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if public.current_operator_id() is not null then
        raise exception 'This browser already has an operator';
    end if;
    if char_length(v_name) not between 3 and 16 or v_name !~ '^[A-Za-z0-9_ -]+$' then
        raise exception 'Invalid display name';
    end if;
    perform public._check_operator_password(p_password);

    insert into public.profiles (id, display_name) values (auth.uid(), v_name);
    insert into public.operator_secrets (profile_id, password_hash)
    values (auth.uid(), extensions.crypt(p_password, extensions.gen_salt('bf', 10)));

    return query select * from public.get_my_operator();
end;
$$;

-- Existing operator without a password (created before this migration):
-- protect it. Changing an existing password needs the current one.
create or replace function public.set_operator_password(p_password text, p_current_password text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_profile uuid := public.current_operator_id();
    v_hash text;
begin
    if v_profile is null then
        raise exception 'Profile required';
    end if;
    perform public._check_operator_password(p_password);

    select s.password_hash into v_hash from public.operator_secrets s where s.profile_id = v_profile;
    if v_hash is not null and (p_current_password is null
        or extensions.crypt(p_current_password, v_hash) <> v_hash) then
        raise exception 'Current password is incorrect';
    end if;

    insert into public.operator_secrets (profile_id, password_hash, updated_at)
    values (v_profile, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now())
    on conflict (profile_id) do update set
        password_hash = excluded.password_hash,
        updated_at = excluded.updated_at;
    return true;
end;
$$;

-- Another browser: prove the name with its password, then play as it.
-- A wrong name/password returns NO ROW instead of raising: raising would roll
-- back the failed-attempt record and silently disable the rate limit.
create or replace function public.sign_in_operator(p_display_name text, p_password text)
returns table (id uuid, display_name varchar, has_password boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_profile uuid;
    v_hash text;
    v_failures integer;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select p.id, s.password_hash into v_profile, v_hash
    from public.profiles p
    left join public.operator_secrets s on s.profile_id = p.id
    where lower(p.display_name) = lower(btrim(p_display_name));

    -- Same (empty) answer for "no such name", "no password set" and
    -- "wrong password".
    if v_profile is null or v_hash is null then
        return;
    end if;

    select count(*) into v_failures
    from public.operator_failed_logins f
    where f.profile_id = v_profile and f.attempted_at > now() - interval '15 minutes';
    if v_failures >= 5 then
        raise exception 'Too many attempts. Try again in 15 minutes';
    end if;

    if p_password is null or extensions.crypt(p_password, v_hash) <> v_hash then
        insert into public.operator_failed_logins (profile_id) values (v_profile);
        return;
    end if;

    delete from public.operator_failed_logins f
    where f.profile_id = v_profile and f.attempted_at < now() - interval '1 day';

    insert into public.operator_links (auth_uid, profile_id) values (auth.uid(), v_profile)
    on conflict (auth_uid) do update set profile_id = excluded.profile_id, linked_at = now();

    return query select * from public.get_my_operator();
end;
$$;

-- ── Endless: one leaderboard per game ──

create table if not exists public.endless_game_scores (
    player_id uuid not null references public.profiles(id) on delete cascade,
    game text not null,
    best_score bigint not null check (best_score > 0 and best_score <= 1000000000000),
    best_round integer not null check (best_round >= 1 and best_round <= 1000000),
    achieved_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (player_id, game),
    constraint endless_game_scores_game check (
        game in ('timingbar', 'stack', 'orbital', 'signal', 'route', 'cut', 'bomb', 'defrag', 'checksum')
    )
);

create index if not exists endless_game_scores_ranking
    on public.endless_game_scores (game, best_score desc, achieved_at);

alter table public.endless_game_scores enable row level security;

-- Public operator names and scores only, like the old list.
drop policy if exists "authenticated users can read endless game scores" on public.endless_game_scores;
create policy "authenticated users can read endless game scores"
    on public.endless_game_scores for select to authenticated using (true);

create or replace view public.endless_game_entries
with (security_invoker = true) as
select p.display_name, s.game, s.best_score, s.best_round, s.achieved_at
from public.endless_game_scores s
join public.profiles p on p.id = s.player_id;

-- A finished run of one game. Keeps the operator's best per game.
-- The bound below catches malformed values; it is not a full anti-cheat system.
create or replace function public.submit_endless_game_result(
    p_game text,
    p_score bigint,
    p_round integer
)
returns table (accepted boolean, best_score bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_player uuid := public.current_operator_id();
    v_current_score bigint;
begin
    if auth.uid() is null or v_player is null then
        raise exception 'Profile required';
    end if;
    if p_game is null or p_game not in ('timingbar', 'stack', 'orbital', 'signal', 'route', 'cut', 'bomb', 'defrag', 'checksum') then
        raise exception 'Unknown game';
    end if;
    if p_score is null or p_round is null
        or p_score <= 0 or p_score > 1000000000000 or p_round < 1 or p_round > 1000000 then
        raise exception 'Invalid score data';
    end if;
    if p_score > p_round::numeric * 1000000 then
        raise exception 'Score is outside the valid result range';
    end if;

    select s.best_score into v_current_score
    from public.endless_game_scores s
    where s.player_id = v_player and s.game = p_game
    for update;

    if v_current_score is not null and p_score <= v_current_score then
        return query select false, v_current_score;
        return;
    end if;

    insert into public.endless_game_scores (player_id, game, best_score, best_round, achieved_at, updated_at)
    values (v_player, p_game, p_score, p_round, now(), now())
    on conflict (player_id, game) do update set
        best_score = excluded.best_score,
        best_round = excluded.best_round,
        achieved_at = excluded.achieved_at,
        updated_at = excluded.updated_at;

    return query select true, p_score;
end;
$$;

-- The operator's place in one game's list (higher score first, then earlier).
create or replace function public.get_my_endless_game_rank(p_game text)
returns table (rank bigint, display_name varchar, best_score bigint, best_round integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    with mine as (
        select s.player_id, s.best_score, s.best_round, s.achieved_at, p.display_name
        from public.endless_game_scores s
        join public.profiles p on p.id = s.player_id
        where s.player_id = public.current_operator_id() and s.game = p_game
    )
    select
        1 + count(other.player_id)::bigint as rank,
        mine.display_name,
        mine.best_score,
        mine.best_round
    from mine
    left join public.endless_game_scores other
        on other.game = p_game
        and (other.best_score > mine.best_score
            or (other.best_score = mine.best_score and other.achieved_at < mine.achieved_at))
    group by mine.display_name, mine.best_score, mine.best_round;
$$;


-- ── The operator's progress ──

create table if not exists public.operator_progress (
    profile_id uuid primary key references public.profiles(id) on delete cascade,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    constraint operator_progress_size check (octet_length(data::text) <= 65536),
    constraint operator_progress_object check (jsonb_typeof(data) = 'object')
);

alter table public.operator_progress enable row level security;
-- No policies on purpose: reachable only through the functions below.
revoke all on table public.operator_progress from anon, authenticated;

-- The saved progress of the operator this browser plays as (no row: none yet).
create or replace function public.get_my_progress()
returns table (data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.data, p.updated_at
    from public.operator_progress p
    where p.profile_id = public.current_operator_id();
$$;

-- Replace the operator's saved progress (the client sends the merged copy).
create or replace function public.save_my_progress(p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_profile uuid := public.current_operator_id();
    v_now timestamptz := now();
begin
    if v_profile is null then
        raise exception 'Profile required';
    end if;
    if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 65536 then
        raise exception 'Invalid progress';
    end if;
    insert into public.operator_progress (profile_id, data, updated_at)
    values (v_profile, p_data, v_now)
    on conflict (profile_id) do update set data = excluded.data, updated_at = excluded.updated_at;
    return v_now;
end;
$$;

-- ── Permissions ──
-- New functions are executable by PUBLIC by default; lock them down first.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
revoke all on table public.endless_game_scores from anon, authenticated;
grant select on table public.endless_game_scores to authenticated;
grant select on public.endless_game_entries to authenticated;
revoke all on function public.current_operator_id() from public, anon;
revoke all on function public._check_operator_password(text) from public, anon, authenticated;
revoke all on function public.get_my_operator() from public, anon;
revoke all on function public.create_operator(text, text) from public, anon;
revoke all on function public.set_operator_password(text, text) from public, anon;
revoke all on function public.sign_in_operator(text, text) from public, anon;
revoke all on function public.submit_endless_game_result(text, bigint, integer) from public, anon;
revoke all on function public.get_my_endless_game_rank(text) from public, anon;
revoke all on function public.get_my_progress() from public, anon;
revoke all on function public.save_my_progress(jsonb) from public, anon;
grant execute on function public.current_operator_id() to authenticated;
grant execute on function public.get_my_operator() to authenticated;
grant execute on function public.create_operator(text, text) to authenticated;
grant execute on function public.set_operator_password(text, text) to authenticated;
grant execute on function public.sign_in_operator(text, text) to authenticated;
grant execute on function public.submit_endless_game_result(text, bigint, integer) to authenticated;
grant execute on function public.get_my_endless_game_rank(text) to authenticated;
grant execute on function public.get_my_progress() to authenticated;
grant execute on function public.save_my_progress(jsonb) to authenticated;
