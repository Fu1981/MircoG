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
