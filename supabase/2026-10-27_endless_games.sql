-- SyncBreaker: one Endless leaderboard per game
-- Run once in the Supabase SQL Editor AFTER supabase/leaderboard.sql and
-- supabase/2026-10-19_operator_password.sql. Safe to re-run.
--
-- The new Endless offers the endless version of games 1-9; each game keeps
-- its own top list. The old single list (public.endless_best_scores,
-- Timing Bar only) is copied once into the new table as game 'timingbar'.
-- Nothing old is dropped: clients from before this release keep working.
-- Release order: run this file first, then publish the site.

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

-- One-time carry-over of the old Timing Bar list (a re-run keeps newer scores).
insert into public.endless_game_scores (player_id, game, best_score, best_round, achieved_at, updated_at)
select s.player_id, 'timingbar', s.best_score, s.best_wave, s.achieved_at, s.updated_at
from public.endless_best_scores s
on conflict (player_id, game) do nothing;

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

revoke all on table public.endless_game_scores from anon, authenticated;
grant select on table public.endless_game_scores to authenticated;
grant select on public.endless_game_entries to authenticated;
-- New functions are executable by PUBLIC by default; lock them down first.
revoke all on function public.submit_endless_game_result(text, bigint, integer) from public, anon;
revoke all on function public.get_my_endless_game_rank(text) from public, anon;
grant execute on function public.submit_endless_game_result(text, bigint, integer) to authenticated;
grant execute on function public.get_my_endless_game_rank(text) to authenticated;
