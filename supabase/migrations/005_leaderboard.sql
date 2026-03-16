-- Migration 005 — Leaderboard
-- leaderboard_entries + Realtime + Postgres Trigger

create table public.leaderboard_entries (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players(id) on delete cascade,
  game_id    uuid references public.games(id) on delete cascade, -- NULL = Overall
  period     text not null default 'all_time', -- 'daily'|'weekly'|'monthly'|'all_time'
  rank       int,
  score      int not null default 0,
  updated_at timestamptz not null default now(),
  unique(player_id, game_id, period)
);
alter table public.leaderboard_entries enable row level security;

create policy "leaderboard_entries: alle lesen"
  on public.leaderboard_entries for select using (true);

-- Supabase Realtime für Leaderboard aktivieren
alter publication supabase_realtime add table public.leaderboard_entries;

-- Postgres Trigger: Leaderboard bei abgeschlossener Game Session aktualisieren
create or replace function public.update_leaderboard()
returns trigger language plpgsql as $$
begin
  if NEW.result in ('win', 'cashout') then
    -- Spiel-spezifischer Leaderboard-Eintrag
    insert into public.leaderboard_entries (player_id, game_id, period, score)
    values (NEW.player_id, NEW.game_id, 'all_time', NEW.win_points)
    on conflict (player_id, game_id, period)
    do update set
      score = leaderboard_entries.score + NEW.win_points,
      updated_at = now();

    -- Overall Leaderboard (game_id = NULL)
    insert into public.leaderboard_entries (player_id, game_id, period, score)
    values (NEW.player_id, null, 'all_time', NEW.win_points)
    on conflict (player_id, game_id, period)
    do update set
      score = leaderboard_entries.score + NEW.win_points,
      updated_at = now();
  end if;
  return NEW;
end;
$$;

create trigger on_game_session_completed
  after update on public.game_sessions
  for each row when (NEW.result != 'pending' and OLD.result = 'pending')
  execute procedure public.update_leaderboard();

-- Rank-Aktualisierungs-Funktion (periodisch oder on-demand aufrufen)
create or replace function public.refresh_leaderboard_ranks()
returns void language plpgsql as $$
begin
  update public.leaderboard_entries le
  set rank = ranked.rank
  from (
    select
      id,
      row_number() over (
        partition by game_id, period
        order by score desc
      ) as rank
    from public.leaderboard_entries
  ) ranked
  where le.id = ranked.id;
end;
$$;
