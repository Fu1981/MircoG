-- Migration 004 — Games
-- developers, games, game_sessions

-- DEVELOPERS (Drittanbieter, die Games onboarden)
create table public.developers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  api_key     text not null unique default encode(gen_random_bytes(32), 'hex'),
  webhook_url text,
  active      boolean not null default false, -- manuell aktiviert nach Prüfung
  created_at  timestamptz not null default now()
);
alter table public.developers enable row level security;

create policy "developers: kein direkter Zugriff"
  on public.developers for all using (false);

-- GAMES
create table public.games (
  id           uuid primary key default gen_random_uuid(),
  developer_id uuid references public.developers(id) on delete set null,
  slug         text not null unique,  -- z.B. 'crash', 'scratch', 'mines'
  name         text not null,
  type         text not null check (type in ('builtin', 'third_party', 'loyalty_card')),
  cost_points  int not null default 50 check (cost_points > 0),
  config       jsonb not null default '{}',  -- spielspezifische Konfiguration
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.games enable row level security;

create policy "games: alle lesen"
  on public.games for select using (active = true);

-- Seed Built-in Games
insert into public.games (slug, name, type, cost_points, config) values
  ('crash',   'Crash',      'builtin', 50, '{"house_edge": 0.05}'),
  ('scratch',  'Scratch Card', 'builtin', 30, '{"symbols": 6, "win_probability": 0.33, "win_multiplier": 4}'),
  ('mines',    'Mines',      'builtin', 40, '{"grid_size": 16, "mine_count": 4, "safe_multiplier": 0.5}');

-- GAME SESSIONS
create table public.game_sessions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id),
  game_id     uuid not null references public.games(id),
  bet_points  int not null,
  win_points  int not null default 0,
  result      text not null check (result in ('win', 'loss', 'cashout', 'pending')),
  metadata    jsonb,  -- spielspezifische Ergebnisdaten
  created_at  timestamptz not null default now()
);
alter table public.game_sessions enable row level security;

create policy "game_sessions: eigene lesen"
  on public.game_sessions for select using (
    player_id in (select id from public.players where auth_user_id = auth.uid())
  );
