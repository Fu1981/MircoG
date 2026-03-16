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
