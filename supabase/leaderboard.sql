-- SyncBreaker Endless leaderboard
-- Run once in the Supabase SQL Editor, after enabling Anonymous Sign-Ins in
-- Authentication > Providers. Use a publishable key in the browser, never a
-- secret/service-role key.

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name varchar(16) not null,
    created_at timestamptz not null default now(),
    constraint profiles_display_name_length check (char_length(display_name) between 3 and 16),
    constraint profiles_display_name_characters check (display_name ~ '^[A-Za-z0-9_ -]+$')
);

create unique index if not exists profiles_display_name_lower_key
    on public.profiles (lower(display_name));

create table if not exists public.endless_best_scores (
    player_id uuid primary key references public.profiles(id) on delete cascade,
    best_score bigint not null check (best_score > 0 and best_score <= 1000000000000),
    best_wave integer not null check (best_wave >= 1 and best_wave <= 1000000),
    hit_count integer not null check (hit_count >= 1 and hit_count <= 5000000),
    achieved_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.endless_best_scores enable row level security;

-- The leaderboard intentionally exposes only public operator names and scores.
drop policy if exists "authenticated users can read public profiles" on public.profiles;
create policy "authenticated users can read public profiles"
    on public.profiles for select to authenticated using (true);

drop policy if exists "authenticated users can read public scores" on public.endless_best_scores;
create policy "authenticated users can read public scores"
    on public.endless_best_scores for select to authenticated using (true);

create or replace view public.leaderboard_entries
with (security_invoker = true) as
select p.display_name, s.best_score, s.best_wave, s.achieved_at
from public.endless_best_scores s
join public.profiles p on p.id = s.player_id;

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
    v_min_score numeric := 0;
    v_max_score numeric := 0;
    v_expected_wave integer;
    v_current_score bigint;
    v_full_groups numeric;
    v_remainder numeric;
begin
    if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
        raise exception 'Profile required';
    end if;
    if p_score <= 0 or p_score > 1000000000000 or p_hit_count < 1 or p_hit_count > 5000000 then
        raise exception 'Invalid score data';
    end if;

    v_expected_wave := (p_hit_count / 5) + 1;
    if p_wave <> v_expected_wave then
        raise exception 'Wave does not match hit count';
    end if;

    -- Each successful hit scores 50–100 times its current combo and wave.
    -- Calculate the range by five-hit waves, without iterating over a long run.
    -- This catches malformed values but is not a full anti-cheat system.
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
    where s.player_id = auth.uid()
    for update;

    if v_current_score is not null and p_score <= v_current_score then
        return query select false, v_current_score;
        return;
    end if;

    insert into public.endless_best_scores (player_id, best_score, best_wave, hit_count, achieved_at, updated_at)
    values (auth.uid(), p_score, p_wave, p_hit_count, now(), now())
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
        where s.player_id = auth.uid()
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

revoke all on table public.profiles, public.endless_best_scores from anon;
revoke all on table public.profiles, public.endless_best_scores from authenticated;
grant select on table public.profiles, public.endless_best_scores to authenticated;
grant select on public.leaderboard_entries to authenticated;
grant execute on function public.create_leaderboard_profile(text) to authenticated;
grant execute on function public.submit_endless_result(bigint, integer, integer) to authenticated;
grant execute on function public.get_my_leaderboard_rank() to authenticated;
