-- ============================================================
-- Screenway / MircoG — Teardown (alte DB leeren)
-- Entfernt ALLES, was die Migrationen 001–009 angelegt haben.
-- Danach kann supabase/setup.sql sauber neu durchlaufen.
--
-- ⚠️  ACHTUNG: löscht ALLE Daten in diesen Tabellen unwiderruflich.
-- Registrierte Auth-Nutzer (auth.users) bleiben erhalten — siehe unten.
-- ============================================================

-- Trigger auf auth.users zuerst entfernen (liegt außerhalb von public)
drop trigger if exists on_auth_user_created on auth.users;

-- Tabellen (cascade räumt Policies, FKs, Realtime-Publication mit weg)
drop table if exists public.player_devices        cascade;
drop table if exists public.player_loyalty_scans  cascade;
drop table if exists public.loyalty_cards         cascade;
drop table if exists public.leaderboard_entries   cascade;
drop table if exists public.game_sessions         cascade;
drop table if exists public.games                 cascade;
drop table if exists public.developers            cascade;
drop table if exists public.export_requests       cascade;
drop table if exists public.deletion_requests     cascade;
drop table if exists public.audit_log             cascade;
drop table if exists public.consents              cascade;
drop table if exists public.module_config         cascade;
drop table if exists public.wallet_transactions   cascade;
drop table if exists public.wallets               cascade;
drop table if exists public.players               cascade;

-- Funktionen
drop function if exists public.handle_new_user()               cascade;
drop function if exists public.update_leaderboard()            cascade;
drop function if exists public.refresh_leaderboard_ranks()     cascade;
drop function if exists public.increment_wallet_balance(uuid, int) cascade;

-- Enums / Typen
drop type if exists public.deletion_status cascade;
drop type if exists public.wallet_tx_type  cascade;
drop type if exists public.player_status   cascade;

-- ------------------------------------------------------------
-- OPTIONAL: auch alle registrierten Test-Nutzer löschen.
-- Nur einkommentieren, wenn du wirklich alle Accounts entfernen willst.
-- (Besser über Dashboard → Authentication → Users.)
-- ------------------------------------------------------------
-- delete from auth.users;
