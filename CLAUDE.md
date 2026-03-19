# CLAUDE.md — Screenway Platform
## Master Specification für Claude Code

> Dieses Dokument ist die einzige Quelle der Wahrheit für die Screenway-Plattform.
> Vor jeder Implementierung vollständig lesen. Bei Widersprüchen gilt dieses Dokument.

---

## 1. Was ist Screenway?

Screenway ist eine modulare B2C Loyalty- und Gamification-Plattform für den deutschen Retail-Sektor (Spielhallen, Wettbüros, Gastronomie). Kunden sammeln Punkte durch Check-ins, Käufe und Loyalty-Scans, und können diese in Fast Games einsetzen oder gegen Prämien einlösen.

**Kernprinzip:** Screenway ist ein offenes Loyalty-OS. Drittanbieter können eigene Mini-Games und Loyalty-Karten über eine Game-SDK-API einbinden. Das Punktesystem (Wallet) ist das zentrale, modulübergreifende Element.

**MVP:** Web-basiert (Next.js). Native App kommt später.

---

## 2. Architekturprinzipien — NICHT verhandelbar

### 2.1 Modularer Aufbau

Jedes Feature ist ein eigenständiges Modul mit:
- Eigenem Datenbankschema (eigene Tables, eigene RLS-Policies)
- Eigenem Edge Function Endpunkt (`/mod-<name>/`)
- Eigenem Feature-Flag in `module_config`
- Eigenem REST-API-Vertrag (dokumentiert in Abschnitt 6)

**Regel:** Ein Modul kann auf `active = false` gesetzt werden. Dann:
- Gibt die Edge Function `503 module_disabled` zurück
- Kein DB-Zugriff findet statt
- Das Frontend blendet den entsprechenden Bereich aus

Module dürfen **nicht** direkt miteinander kommunizieren — nur über definierte API-Calls oder Shared Utilities.

### 2.2 DSGVO by Design — PFLICHT für alle Module

- Keine Verarbeitung personenbezogener Daten ohne dokumentierten Consent
- Minimaldatenprinzip: nur speichern, was für den Zweck notwendig ist
- Kein Klartext-IP — nur gehashte IPs (SHA-256)
- Jede Datenoperation auf `players`-Daten wird im `audit_log` erfasst
- Supabase Projekt muss in **Frankfurt (eu-central-1)** gehostet sein
- Jeder neue Table benötigt aktiviertes RLS + Policy

### 2.3 REST API Konventionen

Alle Endpunkte geben diesen Envelope zurück:

```json
// Erfolg
{
  "data": { ... },
  "meta": { "module": "mod_wallet", "v": "1.0" }
}

// Fehler
{
  "error": "insufficient_balance",
  "message": "Not enough points",
  "code": 400
}
```

HTTP-Statuscodes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 503 Module Disabled.

### 2.4 Technischer Stack

| Schicht | Technologie |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Datenbank | Supabase Postgres (Frankfurt), Row Level Security |
| Auth | Supabase Auth — Google OAuth, Apple OAuth, Phone OTP |
| Realtime | Supabase Realtime (Leaderboards) |
| Hosting | Vercel (Frontend), Supabase (Backend) |

---

## 3. Projektstruktur

```
screenway/
├── apps/
│   └── web/                            ← Next.js MVP
│       ├── app/
│       │   ├── (auth)/                 ← Login, Consent
│       │   │   ├── login/page.tsx
│       │   │   ├── consent/page.tsx
│       │   │   └── callback/route.ts
│       │   ├── (customer)/             ← Eingeloggte Kunden
│       │   │   ├── home/page.tsx
│       │   │   ├── wallet/page.tsx
│       │   │   ├── games/page.tsx
│       │   │   ├── leaderboard/page.tsx
│       │   │   └── account/page.tsx    ← Profil + DSGVO-Rechte
│       │   └── (operator)/             ← Betreiber-Dashboard
│       │       ├── dashboard/page.tsx
│       │       └── campaigns/page.tsx
│       ├── lib/
│       │   ├── supabase.ts             ← Supabase Client (singleton)
│       │   ├── api/                    ← API-Client pro Modul
│       │   │   ├── mod-auth.ts
│       │   │   ├── mod-wallet.ts
│       │   │   ├── mod-games.ts
│       │   │   └── ...
│       │   └── hooks/                  ← React Hooks
│       │       ├── useAuth.ts
│       │       ├── useWallet.ts
│       │       └── useModuleConfig.ts
│       └── components/
│           ├── games/
│           │   ├── CrashGame.tsx
│           │   ├── ScratchCard.tsx
│           │   └── MinesGame.tsx
│           └── wallet/
│               └── WalletCard.tsx
├── supabase/
│   ├── functions/
│   │   ├── _shared/                    ← GEMEINSAME MIDDLEWARE — immer zuerst laden
│   │   │   ├── auth.ts                 ← JWT-Validierung
│   │   │   ├── module-guard.ts         ← Feature-Flag-Check
│   │   │   ├── dsgvo.ts                ← Audit-Log + Consent-Check
│   │   │   ├── response.ts             ← Standard-Envelope
│   │   │   └── cors.ts
│   │   ├── mod-auth/index.ts
│   │   ├── mod-identity/index.ts
│   │   ├── mod-wallet/index.ts
│   │   ├── mod-games/index.ts
│   │   ├── mod-leaderboard/index.ts
│   │   ├── mod-loyalty/index.ts
│   │   ├── mod-push/index.ts
│   │   └── mod-dsgvo/index.ts
│   └── migrations/
│       ├── 001_core.sql                ← players, wallets, devices
│       ├── 002_module_config.sql       ← Feature-Flags
│       ├── 003_dsgvo.sql               ← consents, audit_log, deletion_requests
│       ├── 004_games.sql               ← developers, games, game_sessions
│       ├── 005_leaderboard.sql         ← leaderboard_entries
│       ├── 006_loyalty.sql             ← loyalty_cards, player_loyalty_scans
│       └── 007_push.sql               ← player_devices
└── CLAUDE.md                           ← DIESES DOKUMENT
```

---

## 4. Datenbank — Vollständiges Schema

### Migration 001 — Core

```sql
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
```

### Migration 002 — Module Config

```sql
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
```

### Migration 003 — DSGVO

```sql
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
```

### Migration 004 — Games

```sql
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
```

### Migration 005 — Leaderboard

```sql
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
```

### Migration 006 — Loyalty

```sql
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
```

### Migration 007 — Push Devices

```sql
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
```

---

## 5. Shared Middleware

Diese Dateien müssen in **jeder** Edge Function am Anfang geladen werden.

### `_shared/cors.ts`

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
```

### `_shared/response.ts`

```typescript
export const ok = (data: unknown, module: string) =>
  new Response(JSON.stringify({ data, meta: { module, v: '1.0' } }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

export const err = (code: number, error: string, message: string) =>
  new Response(JSON.stringify({ error, message, code }), {
    status: code,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
```

### `_shared/module-guard.ts`

```typescript
import { createServiceClient } from './supabase.ts'

export async function assertModuleActive(moduleKey: string): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('module_config')
    .select('active')
    .eq('module_key', moduleKey)
    .single()
  if (!data?.active) throw new Error(`module_disabled:${moduleKey}`)
}

export const moduleDisabledResponse = () =>
  new Response(
    JSON.stringify({ error: 'module_disabled', message: 'This feature is currently unavailable', code: 503 }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  )
```

### `_shared/auth.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { user: null, error: 'no_token' }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error: error?.message ?? null }
}
```

### `_shared/dsgvo.ts`

```typescript
import { createServiceClient } from './supabase.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: {
    player_id?: string
    actor_id?: string
    action: string
    resource: string
    resource_id?: string
    metadata?: Record<string, unknown>
  }
) {
  await supabase.from('audit_log').insert(entry)
}

export async function hasConsent(playerId: string, purpose: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('consents')
    .select('granted')
    .eq('player_id', playerId)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data?.granted === true
}

export function hashIp(ip: string): string {
  // SHA-256 via Web Crypto API (Deno)
  const encoder = new TextEncoder()
  return crypto.subtle.digest('SHA-256', encoder.encode(ip))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
    .toString()
}
```

### `_shared/supabase.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const createServiceClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
```

### Edge Function Template — für jedes neue Modul kopieren

```typescript
// supabase/functions/mod-EXAMPLE/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { writeAuditLog } from '../_shared/dsgvo.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err } from '../_shared/response.ts'

const MODULE = 'mod_example'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // 1. Modul aktiv?
  try { await assertModuleActive(MODULE) }
  catch { return moduleDisabledResponse() }

  // 2. Auth
  const { user, error: authError } = await getAuthenticatedUser(req)
  if (authError || !user) return err(401, 'unauthorized', 'Invalid or missing token')

  const supabase = createServiceClient()
  const url = new URL(req.url)
  const path = url.pathname.replace(`/${MODULE}`, '')

  // 3. Player laden
  const { data: player } = await supabase
    .from('players').select('id').eq('auth_user_id', user.id).single()
  if (!player) return err(404, 'player_not_found', 'Player record missing')

  // 4. Routing
  if (path === '/example' && req.method === 'GET') {
    await writeAuditLog(supabase, { player_id: player.id, action: 'read', resource: 'example' })
    return ok({ message: 'hello' }, MODULE)
  }

  return err(404, 'not_found', 'Endpoint not found')
})
```

---

## 6. REST API — Vollständige Endpunktliste

```
Base URL: https://<project>.supabase.co/functions/v1
Alle Requests: Authorization: Bearer <jwt>
Alle Responses: { data, meta } oder { error, message, code }

MOD-AUTH
POST   /mod-auth/login              Social Login initiieren
POST   /mod-auth/logout             Session beenden
POST   /mod-auth/consent            Consent speichern (nach erstem Login)

MOD-IDENTITY
GET    /mod-identity/me             Eigenes Profil + Wallet-Kurzinfo
PATCH  /mod-identity/me             Display-Name, Avatar updaten
GET    /mod-identity/export         Datenexport starten (Art. 20)
DELETE /mod-identity/me             Löschanfrage stellen (Art. 17)

MOD-WALLET
GET    /mod-wallet/balance          Aktueller Kontostand
GET    /mod-wallet/transactions     Transaktionshistorie (paginiert)
POST   /mod-wallet/earn             Punkte gutschreiben [intern/operator only]
POST   /mod-wallet/spend            Punkte einlösen (Prämien)

MOD-GAMES
GET    /mod-games/                  Alle aktiven Spiele listen
POST   /mod-games/session/start     Spielrunde starten (bucht Einsatz)
POST   /mod-games/session/:id/end   Spielrunde beenden (bucht Gewinn)
POST   /mod-games/developers        Game-Entwickler registrieren

MOD-LEADERBOARD
GET    /mod-leaderboard/overall     Gesamtrangliste
GET    /mod-leaderboard/:game_id    Rangliste für ein Spiel
GET    /mod-leaderboard/:game_id?period=weekly  Wochenrangliste
GET    /mod-leaderboard/me          Eigene Position in allen Listen

MOD-LOYALTY
GET    /mod-loyalty/cards           Verfügbare Loyalty-Karten
POST   /mod-loyalty/scan            QR-Scan einlösen

MOD-PUSH
POST   /mod-push/subscribe          Push-Token registrieren
DELETE /mod-push/subscribe          Push-Token entfernen (Opt-out)
POST   /mod-push/send               Kampagne senden [operator only]

MOD-DSGVO
GET    /mod-dsgvo/consent           Aktuellen Einwilligungsstand lesen
POST   /mod-dsgvo/consent           Einwilligung erteilen oder widerrufen
POST   /mod-dsgvo/export            Datenexport anfordern (Art. 20)
POST   /mod-dsgvo/delete            Konto-Löschung beantragen (Art. 17)
```

---

## 7. Auth — Social Login Setup

### Supabase Dashboard Konfiguration

**Authentication → Providers:**
- Google: Client ID + Secret aus Google Cloud Console
- Apple: Services ID + Key aus Apple Developer Portal
- Phone: Twilio-Integration (SMS OTP)

**Authentication → URL Configuration:**
```
Site URL:       https://app.screenway.io
Redirect URLs:  https://app.screenway.io/auth/callback
```

### Frontend — Supabase Client

```typescript
// apps/web/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### Auth Context

```typescript
// apps/web/lib/hooks/useAuth.ts
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const signInWithApple = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const signInWithPhone = async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) throw error
  }

  const verifyOtp = async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
    if (error) throw error
  }

  const signOut = () => supabase.auth.signOut()

  return { signInWithGoogle, signInWithApple, signInWithPhone, verifyOtp, signOut }
}
```

### Auth Callback Route

```typescript
// apps/web/app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(c => cookieStore.set(c)) } }
  )

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Neuer User → Consent-Screen. Bestehender → Home.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: consent } = await supabase
    .from('consents').select('id').eq('player_id', user?.id ?? '').limit(1)
  const redirectTo = consent?.length ? '/home' : '/consent'
  return NextResponse.redirect(new URL(redirectTo, request.url))
}
```

---

## 8. DSGVO — Consent Flow

### Consent-Zwecke (fest definiert)

```typescript
// apps/web/lib/consent-purposes.ts
export const CONSENT_PURPOSES = [
  {
    key: 'essential',
    label: 'Notwendige Funktionen',
    description: 'Login, Wallet, Spielbetrieb. Ohne diese Einwilligung kann Screenway nicht genutzt werden.',
    required: true,
  },
  {
    key: 'analytics',
    label: 'Nutzungsanalyse',
    description: 'Anonymisierte Auswertung, wie Funktionen genutzt werden. Hilft uns, Screenway zu verbessern.',
    required: false,
  },
  {
    key: 'marketing',
    label: 'Personalisierte Angebote',
    description: 'Bonuspunkte-Aktionen und Angebote passend zu deiner Nutzung.',
    required: false,
  },
  {
    key: 'push_notifications',
    label: 'Push-Benachrichtigungen',
    description: 'Benachrichtigungen über neue Aktionen — jederzeit widerrufbar.',
    required: false,
  },
] as const
```

### DSGVO-Compliance-Checkliste

| Artikel | Anforderung | Implementierung |
|---|---|---|
| Art. 6 | Rechtsgrundlage | Einwilligung via `consents`-Table |
| Art. 7 | Nachweispflicht | Versionierte Einträge, append-only, mit Timestamp + IP-Hash |
| Art. 13 | Informationspflicht | Consent-Screen vor erstem Login |
| Art. 17 | Recht auf Löschung | `POST /mod-dsgvo/delete` → `deletion_requests` |
| Art. 20 | Datenportabilität | `POST /mod-dsgvo/export` → JSON-Download |
| Art. 25 | Privacy by Design | Minimaldaten, RLS auf allen Tables, kein Klartext-IP |
| Art. 30 | Verarbeitungsverzeichnis | `audit_log` append-only, service_role only |
| Art. 32 | Datensicherheit | Supabase Frankfurt (EU), RLS, JWT, HTTPS only |

---

## 9. Games — Built-in Module

Drei Spiele sind als Built-in implementiert. Alle folgen demselben Session-Protokoll:

1. `POST /mod-games/session/start` — Einsatz (cost_points) wird vom Wallet abgezogen, Session mit `result='pending'` angelegt
2. Game-Logik läuft im Frontend (deterministisch, Server-verifizierbar)
3. `POST /mod-games/session/:id/end` — Ergebnis + gewonnene Punkte werden gesendet, Server verifiziert, Wallet wird gutgeschrieben

### Crash
- Multiplikator startet bei 1.00× und steigt kontinuierlich
- Zufälliger Crash-Punkt wird server-seitig beim Session-Start generiert und als Hash zurückgegeben
- Kunde drückt "Cash Out" — Multiplikator × Einsatz = Gewinn
- Crash-Zeitpunkt: exponentiell verteilt (house edge ca. 5%)

### Scratch Card
- 3 Felder, 6 mögliche Symbole
- 33% Gewinnwahrscheinlichkeit (3 gleiche Symbole)
- Gewinn: 4× Einsatz
- Server generiert Ergebnis beim Session-Start, Client deckt nur auf

### Mines
- 4×4 Gitter, 4 versteckte Minen
- Sichere Felder aufdecken: Gewinn steigt mit jedem Feld
- Formel: `gewinn = einsatz × (1 + sichere_felder × 0.5)`
- Jederzeit "Cash Out" möglich

---

## 10. Leaderboard — Realtime

Leaderboard wird bei jeder abgeschlossenen `game_session` aktualisiert via Postgres Trigger:

```sql
create or replace function update_leaderboard() returns trigger language plpgsql as $$
begin
  if NEW.result in ('win', 'cashout') then
    insert into public.leaderboard_entries (player_id, game_id, period, score)
    values (NEW.player_id, NEW.game_id, 'all_time', NEW.win_points)
    on conflict (player_id, game_id, period)
    do update set score = leaderboard_entries.score + NEW.win_points, updated_at = now();

    -- Overall Leaderboard (game_id = NULL)
    insert into public.leaderboard_entries (player_id, game_id, period, score)
    values (NEW.player_id, null, 'all_time', NEW.win_points)
    on conflict (player_id, game_id, period)
    do update set score = leaderboard_entries.score + NEW.win_points, updated_at = now();
  end if;
  return NEW;
end;
$$;

create trigger on_game_session_completed
  after update on public.game_sessions
  for each row when (NEW.result != 'pending' and OLD.result = 'pending')
  execute procedure update_leaderboard();
```

---

## 11. Umgebungsvariablen

### `.env.local` (Next.js Frontend)

```
NEXT_PUBLIC_SUPABASE_URL=https://zvlbunssipacmmirygas.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Supabase Edge Functions Secrets

```bash
supabase secrets set SUPABASE_URL=https://zvlbunssipacmmirygas.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
supabase secrets set SUPABASE_ANON_KEY=eyJ...
supabase secrets set ALLOWED_ORIGIN=https://app.screenway.io
```

**WICHTIG:** `SUPABASE_SERVICE_ROLE_KEY` niemals im Frontend verwenden. Nur in Edge Functions (Server-seitig).

---

## 12. Implementierungsreihenfolge (MVP)

```
Phase 1 — Fundament
  [x] Supabase Projekt anlegen (Frankfurt)
  [x] Migrations 001–007 ausführen
  [x] _shared/ Middleware implementieren
  [x] mod-auth Edge Function
  [x] Auth Callback Route (Next.js)
  [x] Consent-Screen

Phase 2 — Core
  [x] mod-identity Edge Function
  [x] mod-wallet Edge Function (earn/spend/balance)
  [x] Wallet UI (Kontostand, Transaktionsliste)

Phase 3 — Games
  [x] mod-games Edge Function (session start/end)
  [x] Crash Game UI
  [x] Scratch Card UI
  [x] Mines Game UI

Phase 4 — Leaderboard
  [x] mod-leaderboard Edge Function
  [x] Leaderboard Trigger (Postgres)
  [x] Realtime-Subscription im Frontend

Phase 5 — DSGVO-Rechte
  [x] mod-dsgvo Edge Function (export, delete, consent)
  [x] Account-Seite mit Datenschutz-Bereich

Phase 6 — Erweiterung (nach MVP)
  [ ] mod-loyalty
  [ ] mod-push
  [ ] Game SDK für Drittanbieter
  [ ] Native App (Expo)
```

---

## 13. Coding Rules für Claude Code

1. **Vor jeder neuen Datei:** Prüfen, ob ein passendes Modul bereits existiert. Nichts doppelt implementieren.
2. **Vor jedem neuen DB-Table:** RLS aktivieren + mindestens eine Policy anlegen. Kein Table ohne RLS.
3. **Vor jedem API-Endpunkt:** `assertModuleActive()` + `getAuthenticatedUser()` als erstes ausführen.
4. **Bei jedem Datenzugriff auf player-Daten:** `writeAuditLog()` aufrufen.
5. **Keine direkten DB-Calls im Frontend** — immer über Edge Functions.
6. **TypeScript strict mode** — keine `any` Types.
7. **Fehler immer mit `err()` aus `_shared/response.ts`** — kein freies `new Response(JSON.stringify(...))`.
8. **Umgebungsvariablen nie hardcoden** — immer `Deno.env.get()` bzw. `process.env`.

---

*Dieses Dokument wird mit jeder implementierten Phase aktualisiert.*
*Stand: Phases 1–5 vollständig implementiert*
