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
