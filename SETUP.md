# Screenway / MircoG — Neu aufsetzen (Supabase-DB wiederherstellen)

Die Datenbank ist verloren, aber der komplette Bauplan liegt im Repo. In ~15 Minuten läuft alles wieder.

## 1. Neues Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) einloggen → **New Project**.
2. **Region: Frankfurt (eu-central-1)** wählen (DSGVO-Pflicht laut Projektvorgabe).
3. Datenbank-Passwort setzen und Projekt erstellen.

## 2. Datenbank-Schema einspielen

Der einfachste Weg — kein CLI nötig:

1. Im Supabase-Dashboard: **SQL Editor** → **New query**.
2. Den **kompletten Inhalt von [`supabase/setup.sql`](./supabase/setup.sql)** hineinkopieren.
3. **Run** klicken.

Das legt alle Tabellen, RLS-Policies, Trigger, Funktionen und die 4 Spiele
(Crash, Scratch, Mines, Stoppuhr) an. Enthält die Migrationen 001–009.

> Alternative per CLI: `supabase link --project-ref <ref>` und dann
> `supabase db push` (spielt die einzelnen Dateien in `supabase/migrations/` ein).

## 3. Auth-Provider einrichten

Dashboard → **Authentication → Providers**:
- **Google** (Client ID + Secret aus Google Cloud Console)
- **Apple** (optional)
- **Phone / OTP** (optional, braucht Twilio)

Dashboard → **Authentication → URL Configuration**:
- Site URL + Redirect URL auf deine App-URL setzen (z. B. `http://localhost:3000/auth/callback` für lokal).

## 4. Edge Functions deployen

Voraussetzung: [Supabase CLI](https://supabase.com/docs/guides/cli) installiert und `supabase login`.

```bash
supabase link --project-ref <dein-project-ref>

# Secrets für die Functions setzen
supabase secrets set SUPABASE_URL=https://<ref>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
supabase secrets set SUPABASE_ANON_KEY=<anon-key>
supabase secrets set ALLOWED_ORIGIN=http://localhost:3000

# Alle 8 Module deployen
for m in mod-auth mod-identity mod-wallet mod-games mod-leaderboard mod-loyalty mod-push mod-dsgvo; do
  supabase functions deploy "$m"
done
```

> Keys findest du unter Dashboard → **Project Settings → API**.
> `SUPABASE_SERVICE_ROLE_KEY` **niemals** ins Frontend — nur in die Functions.

## 5. Frontend konfigurieren & starten

```bash
cd apps/web
cp .env.example .env.local
```

In `.env.local` eintragen:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Dann:
```bash
npm install
npm run dev
```

App läuft auf http://localhost:3000.

## 6. Optionale Module aktivieren

Standardmäßig sind `mod_loyalty` und `mod_push` deaktiviert. Zum Aktivieren im SQL-Editor:

```sql
update public.module_config set active = true where module_key = 'mod_loyalty';
```

## Fertig

Registrieren → Consent → **Games → Stoppuhr** (und Crash / Scratch / Mines) sollten sofort spielbar sein.
Punkte zum Testen gutschreiben: entweder eine Loyalty-Karte anlegen und scannen, oder direkt in der
`wallets`-Tabelle den `balance` erhöhen.
