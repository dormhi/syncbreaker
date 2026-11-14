-- SyncBreaker: remove what older clients used (2026-11-14, security review).
-- The current game never touches these; they were left behind and are still
-- reachable from any browser. Run ONCE in the Supabase SQL Editor, after
-- schema.sql. Stops without deleting anything if an old table still holds rows.
do $$
declare
    r record;
    v_rows bigint;
begin
    for r in
        select c.oid::regclass::text as rel, c.relkind
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('endless_best_scores', 'leaderboard_entries')
    loop
        if r.relkind in ('r', 'p') then
            execute format('select count(*) from %s', r.rel) into v_rows;
            if v_rows > 0 then
                raise exception '% still holds % rows: nothing was deleted', r.rel, v_rows;
            end if;
        end if;
    end loop;

    for r in
        select p.oid::regprocedure::text as fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('submit_endless_result', 'get_my_leaderboard_rank', 'create_leaderboard_profile')
    loop
        execute format('drop function %s', r.fn);
        raise notice 'dropped function %', r.fn;
    end loop;

    -- Views first (leaderboard_entries read endless_best_scores), then tables.
    for r in
        select c.oid::regclass::text as rel, c.relkind
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('endless_best_scores', 'leaderboard_entries')
        order by (c.relkind in ('r', 'p'))
    loop
        execute format('drop %s %s', case when r.relkind in ('v', 'm') then 'view' else 'table' end, r.rel);
        raise notice 'dropped %', r.rel;
    end loop;
end $$;
