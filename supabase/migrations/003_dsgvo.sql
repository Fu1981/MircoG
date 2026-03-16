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
