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
