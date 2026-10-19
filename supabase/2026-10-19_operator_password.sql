-- SyncBreaker: operator name + password (play the same name from any browser)
-- Run once in the Supabase SQL Editor AFTER supabase/leaderboard.sql.
-- Safe to re-run.
--
-- Model
--   * Every browser is still an anonymous Supabase user (no e-mail).
--   * An operator profile (name + scores) can be linked to many browsers
--     through operator_links. The browser that created the profile owns it
--     implicitly (profiles.id = its auth uid).
--   * The password is stored only as a bcrypt hash in operator_secrets,
--     which no client role can read. All access goes through the
--     SECURITY DEFINER functions below.
--   * Wrong passwords are rate limited per operator (5 per 15 minutes).

create extension if not exists pgcrypto with schema extensions;

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

-- Scores and rank now follow the operator, not the browser.
create or replace function public.submit_endless_result(
    p_score bigint,
    p_wave integer,
    p_hit_count integer
)
returns table (accepted boolean, best_score bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_player uuid := public.current_operator_id();
    v_min_score numeric := 0;
    v_max_score numeric := 0;
    v_expected_wave integer;
    v_current_score bigint;
    v_full_groups numeric;
    v_remainder numeric;
begin
    if auth.uid() is null or v_player is null then
        raise exception 'Profile required';
    end if;
    if p_score <= 0 or p_score > 1000000000000 or p_hit_count < 1 or p_hit_count > 5000000 then
        raise exception 'Invalid score data';
    end if;

    v_expected_wave := (p_hit_count / 5) + 1;
    if p_wave <> v_expected_wave then
        raise exception 'Wave does not match hit count';
    end if;

    v_full_groups := p_hit_count / 5;
    v_remainder := mod(p_hit_count, 5);
    v_min_score := 50 * (
        5 * v_full_groups * (v_full_groups + 1) / 2
        + v_remainder * (v_full_groups + 1)
    );
    v_max_score := 100 * (
        25 * v_full_groups * (v_full_groups - 1) * (2 * v_full_groups - 1) / 6
        + 20 * v_full_groups * (v_full_groups - 1)
        + 15 * v_full_groups
        + (v_full_groups + 1) * (5 * v_full_groups * v_remainder + v_remainder * (v_remainder + 1) / 2)
    );
    if p_score < v_min_score or p_score > v_max_score then
        raise exception 'Score is outside the valid result range';
    end if;

    select s.best_score into v_current_score
    from public.endless_best_scores s
    where s.player_id = v_player
    for update;

    if v_current_score is not null and p_score <= v_current_score then
        return query select false, v_current_score;
        return;
    end if;

    insert into public.endless_best_scores (player_id, best_score, best_wave, hit_count, achieved_at, updated_at)
    values (v_player, p_score, p_wave, p_hit_count, now(), now())
    on conflict (player_id) do update set
        best_score = excluded.best_score,
        best_wave = excluded.best_wave,
        hit_count = excluded.hit_count,
        achieved_at = excluded.achieved_at,
        updated_at = excluded.updated_at;

    return query select true, p_score;
end;
$$;

create or replace function public.get_my_leaderboard_rank()
returns table (rank bigint, display_name varchar, best_score bigint, best_wave integer)
language sql
security definer
set search_path = public, pg_temp
as $$
    with mine as (
        select s.player_id, s.best_score, s.best_wave, s.achieved_at, p.display_name
        from public.endless_best_scores s
        join public.profiles p on p.id = s.player_id
        where s.player_id = public.current_operator_id()
    )
    select
        1 + count(other.player_id)::bigint as rank,
        mine.display_name,
        mine.best_score,
        mine.best_wave
    from mine
    left join public.endless_best_scores other
        on other.best_score > mine.best_score
        or (other.best_score = mine.best_score and other.achieved_at < mine.achieved_at)
    group by mine.display_name, mine.best_score, mine.best_wave;
$$;

-- The old password-less creator stays for clients that are mid-update, but it
-- refuses a browser that already plays as a linked operator.
create or replace function public.create_leaderboard_profile(p_display_name text)
returns table (id uuid, display_name varchar)
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
    if exists (select 1 from public.operator_links l where l.auth_uid = auth.uid()) then
        raise exception 'This browser already has an operator';
    end if;
    if char_length(v_name) not between 3 and 16 or v_name !~ '^[A-Za-z0-9_ -]+$' then
        raise exception 'Invalid display name';
    end if;

    insert into public.profiles (id, display_name)
    values (auth.uid(), v_name)
    on conflict on constraint profiles_pkey do nothing;

    return query
    select p.id, p.display_name
    from public.profiles p
    where p.id = auth.uid();
end;
$$;

-- New functions are executable by PUBLIC by default; lock them down first.
revoke all on function public.current_operator_id() from public, anon;
revoke all on function public._check_operator_password(text) from public, anon, authenticated;
revoke all on function public.get_my_operator() from public, anon;
revoke all on function public.create_operator(text, text) from public, anon;
revoke all on function public.set_operator_password(text, text) from public, anon;
revoke all on function public.sign_in_operator(text, text) from public, anon;
revoke all on function public.submit_endless_result(bigint, integer, integer) from public, anon;
revoke all on function public.get_my_leaderboard_rank() from public, anon;
revoke all on function public.create_leaderboard_profile(text) from public, anon;
grant execute on function public.current_operator_id() to authenticated;
grant execute on function public.get_my_operator() to authenticated;
grant execute on function public.create_operator(text, text) to authenticated;
grant execute on function public.set_operator_password(text, text) to authenticated;
grant execute on function public.sign_in_operator(text, text) to authenticated;
grant execute on function public.submit_endless_result(bigint, integer, integer) to authenticated;
grant execute on function public.get_my_leaderboard_rank() to authenticated;
grant execute on function public.create_leaderboard_profile(text) to authenticated;
