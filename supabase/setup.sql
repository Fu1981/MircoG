-- ============================================================
-- Screenway / MircoG — Komplettes DB-Setup (alle Migrationen)
-- Automatisch generiert aus supabase/migrations/*.sql
-- Einfach komplett in den Supabase SQL-Editor einfügen und ausführen.
-- Reihenfolge ist wichtig — nicht umsortieren.
-- ============================================================


-- ===== 001_core.sql =====
-- Migration 001 — Core
-- players, wallets, wallet_transactions

-- ENUMS
create type player_status as enum ('active', 'suspended', 'banned');
create type wallet_tx_type as enum (
  'checkin', 'game_win', 'game_loss',
  'loyalty_scan', 'redeem', 'bonus', 'campaign'
);

-- PLAYERS (Business-Identität, getrennt von auth.users)
create table public.players (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  display_name    text,
  avatar_url      text,
  phone           text,
  status          player_status not null default 'active',
  created_at      timestamptz not null default now()
);
alter table public.players enable row level security;

create policy "players: eigene Zeile lesen"
  on public.players for select using (auth.uid() = auth_user_id);

create policy "players: eigene Zeile updaten"
  on public.players for update using (auth.uid() = auth_user_id);

-- WALLETS
create table public.wallets (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid not null unique references public.players(id) on delete cascade,
  balance          int not null default 0 check (balance >= 0),
  lifetime_earned  int not null default 0,
  lifetime_spent   int not null default 0,
  updated_at       timestamptz not null default now()
);
alter table public.wallets enable row level security;

create policy "wallets: eigenes Wallet lesen"
  on public.wallets for select using (
    player_id in (select id from public.players where auth_user_id = auth.uid())
  );

-- WALLET TRANSACTIONS (append-only, nie updaten oder löschen)
create table public.wallet_transactions (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid not null references public.wallets(id) on delete cascade,
  amount      int not null,
  type        wallet_tx_type not null,
  ref_id      uuid,           -- optional: zeigt auf game_sessions.id o.ä.
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
alter table public.wallet_transactions enable row level security;

create policy "wallet_transactions: eigene lesen"
  on public.wallet_transactions for select using (
    wallet_id in (
      select w.id from public.wallets w
      join public.players p on p.id = w.player_id
      where p.auth_user_id = auth.uid()
    )
  );

-- AUTO-PROVISIONING TRIGGER
-- Erstellt automatisch players + wallets bei neuem auth.users Eintrag
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_player_id uuid;
begin
  insert into public.players (auth_user_id, display_name, avatar_url, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.phone
  )
  returning id into new_player_id;

  insert into public.wallets (player_id) values (new_player_id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ===== 002_module_config.sql =====
-- Migration 002 — Module Config
-- Feature-Flags für alle Module

create table public.module_config (
  module_key  text primary key,
  active      boolean not null default true,
  config      jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- Initiale Module-Konfiguration
insert into public.module_config (module_key, active) values
  ('mod_auth',        true),
  ('mod_identity',    true),
  ('mod_wallet',      true),
  ('mod_games',       true),
  ('mod_leaderboard', true),
  ('mod_loyalty',     false),
  ('mod_push',        false),
  ('mod_dsgvo',       true);

-- Nur Service Role darf module_config lesen (kein direkter Client-Zugriff)
alter table public.module_config enable row level security;

create policy "module_config: kein direkter Zugriff"
  on public.module_config for all using (false);


-- ===== 003_dsgvo.sql =====
-- Migration 003 — DSGVO
-- consents, audit_log, deletion_requests, export_requests

-- CONSENTS (versioniert, append-only)
create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  purpose     text not null,  -- 'essential'|'analytics'|'marketing'|'push_notifications'
  granted     boolean not null,
  ip_hash     text,           -- SHA-256 gehashte IP, kein Klartext
  user_agent  text,
  version     text not null,  -- Version der Datenschutzerklärung z.B. '2024-01'
  created_at  timestamptz not null default now()
);
-- Kein UNIQUE Constraint — wir wollen die History aller Consent-Änderungen
alter table public.consents enable row level security;

create policy "consents: eigene lesen"
  on public.consents for select using (
    player_id in (select id from public.players where auth_user_id = auth.uid())
  );

-- AUDIT LOG (append-only, kein UPDATE/DELETE erlaubt)
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid references public.players(id) on delete set null,
  actor_id     uuid,          -- wer hat die Aktion ausgelöst
  action       text not null, -- 'read'|'update'|'delete'|'export'|'login'|'consent_change'
  resource     text not null, -- Tabellenname z.B. 'players', 'wallets'
  resource_id  uuid,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);
alter table public.audit_log enable row level security;

-- Nur Service Role schreibt/liest — kein direkter Client-Zugriff
create policy "audit_log: kein direkter Zugriff"
  on public.audit_log for all using (false);

-- LÖSCHANFRAGEN (Art. 17 DSGVO)
create type deletion_status as enum ('pending', 'processing', 'completed', 'rejected');

create table public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id),
  reason       text,
  status       deletion_status not null default 'pending',
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.deletion_requests enable row level security;

create policy "deletion_requests: eigene lesen"
  on public.deletion_requests for select using (
    player_id in (select id from public.players where auth_user_id = auth.uid())
  );

-- EXPORT-REQUESTS (Art. 20 DSGVO — Datenportabilität)
create table public.export_requests (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id),
  status       text not null default 'pending', -- 'pending'|'ready'|'downloaded'
  download_url text,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.export_requests enable row level security;

create policy "export_requests: eigene lesen"
  on public.export_requests for select using (
    player_id in (select id from public.players where auth_user_id = auth.uid())
  );


-- ===== 004_games.sql =====
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


-- ===== 005_leaderboard.sql =====
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


-- ===== 006_loyalty.sql =====
-- Migration 006 — Loyalty
-- loyalty_cards, player_loyalty_scans

create table public.loyalty_cards (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  partner_name    text not null,
  points_per_scan int not null default 10,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
alter table public.loyalty_cards enable row level security;

create policy "loyalty_cards: alle lesen"
  on public.loyalty_cards for select using (active = true);

create table public.player_loyalty_scans (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players(id),
  loyalty_card_id uuid not null references public.loyalty_cards(id),
  points_earned   int not null,
  scanned_at      timestamptz not null default now()
);
alter table public.player_loyalty_scans enable row level security;

create policy "player_loyalty_scans: eigene lesen"
  on public.player_loyalty_scans for select using (
    player_id in (select id from public.players where auth_user_id = auth.uid())
  );


-- ===== 007_push.sql =====
-- Migration 007 — Push Devices
-- player_devices für Push-Benachrichtigungen

create table public.player_devices (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  push_token  text not null,
  platform    text not null check (platform in ('web', 'ios', 'android')),
  last_seen   timestamptz not null default now(),
  unique(player_id, push_token)
);
alter table public.player_devices enable row level security;

create policy "player_devices: eigene verwalten"
  on public.player_devices for all using (
    player_id in (select id from public.players where auth_user_id = auth.uid())
  );


-- ===== 008_stopwatch.sql =====
-- Migration 008 — Stopwatch Game
-- Skill-basiertes Spiel: Die Uhr läuft und zeigt die Zeit auf die Millisekunde genau.
-- Ziel: so nah wie möglich bei target_ms (10,000 s) stoppen.
-- Die Auszahlung ist vollständig backend-/DB-definiert (config.tiers) — der Client
-- meldet nur die gestoppte Zeit, die Punktevergabe berechnet mod-games server-seitig.

insert into public.games (slug, name, type, cost_points, config) values
  (
    'stopwatch',
    'Stoppuhr',
    'builtin',
    40,
    '{
      "target_ms": 10000,
      "tiers": [
        { "max_dev_ms": 0,   "multiplier": 10 },
        { "max_dev_ms": 10,  "multiplier": 5 },
        { "max_dev_ms": 50,  "multiplier": 2 },
        { "max_dev_ms": 150, "multiplier": 1 }
      ]
    }'::jsonb
  )
on conflict (slug) do update
  set name        = excluded.name,
      cost_points = excluded.cost_points,
      config      = excluded.config;


-- ===== 009_wallet_rpc.sql =====
-- Migration 009 — Wallet RPC
-- Atomare Punktegutschrift. Der mod-wallet-Code ruft diese Funktion in /earn auf
-- (bisher existierte sie nicht und lief nur über den nicht-atomaren Fallback).
-- Mit dieser Funktion sind gleichzeitige Gutschriften race-condition-sicher.

create or replace function public.increment_wallet_balance(
  p_wallet_id uuid,
  p_amount    int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallets
  set balance         = balance + p_amount,
      lifetime_earned = lifetime_earned + p_amount,
      updated_at      = now()
  where id = p_wallet_id;
end;
$$;

