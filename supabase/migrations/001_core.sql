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
