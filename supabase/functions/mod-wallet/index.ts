// mod-wallet — Wallet Module
// GET  /mod-wallet/balance       — Aktueller Kontostand
// GET  /mod-wallet/transactions  — Transaktionshistorie (paginiert)
// POST /mod-wallet/earn          — Punkte gutschreiben [intern/operator only]
// POST /mod-wallet/spend         — Punkte einlösen (Prämien)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { writeAuditLog } from '../_shared/dsgvo.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err } from '../_shared/response.ts'

const MODULE = 'mod_wallet'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    await assertModuleActive(MODULE)
  } catch {
    return moduleDisabledResponse()
  }

  const { user, error: authError } = await getAuthenticatedUser(req)
  if (authError || !user) return err(401, 'unauthorized', 'Invalid or missing token')

  const supabase = createServiceClient()
  const url = new URL(req.url)
  const path = url.pathname.replace(`/${MODULE}`, '')

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!player) return err(404, 'player_not_found', 'Player record missing')

  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, balance, lifetime_earned, lifetime_spent, updated_at')
    .eq('player_id', player.id)
    .single()

  if (!wallet) return err(404, 'wallet_not_found', 'Wallet record missing')

  // GET /mod-wallet/balance
  if (path === '/balance' && req.method === 'GET') {
    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'read',
      resource: 'wallets',
      resource_id: wallet.id,
    })

    return ok(
      {
        balance: wallet.balance,
        lifetime_earned: wallet.lifetime_earned,
        lifetime_spent: wallet.lifetime_spent,
        updated_at: wallet.updated_at,
      },
      MODULE
    )
  }

  // GET /mod-wallet/transactions
  if (path === '/transactions' && req.method === 'GET') {
    const page = parseInt(url.searchParams.get('page') ?? '1', 10)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
    const offset = (page - 1) * limit

    const { data: transactions, count } = await supabase
      .from('wallet_transactions')
      .select('*', { count: 'exact' })
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'read',
      resource: 'wallet_transactions',
    })

    return ok(
      {
        transactions: transactions ?? [],
        pagination: { page, limit, total: count ?? 0 },
      },
      MODULE
    )
  }

  // POST /mod-wallet/earn — intern/operator only
  if (path === '/earn' && req.method === 'POST') {
    let body: { amount: number; type: string; ref_id?: string; metadata?: Record<string, unknown> }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    if (!body.amount || body.amount <= 0) {
      return err(400, 'invalid_amount', 'Amount must be a positive integer')
    }

    const validTypes = ['checkin', 'loyalty_scan', 'bonus', 'campaign']
    if (!validTypes.includes(body.type)) {
      return err(400, 'invalid_type', `Type must be one of: ${validTypes.join(', ')}`)
    }

    // Wallet-Balance erhöhen
    const { error: updateError } = await supabase.rpc('increment_wallet_balance', {
      p_wallet_id: wallet.id,
      p_amount: body.amount,
    })

    if (updateError) {
      // Fallback: manuelles Update
      const { error: manualError } = await supabase
        .from('wallets')
        .update({
          balance: wallet.balance + body.amount,
          lifetime_earned: wallet.lifetime_earned + body.amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.id)

      if (manualError) return err(500, 'earn_failed', 'Failed to credit points')
    }

    // Transaktion aufzeichnen
    await supabase.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      amount: body.amount,
      type: body.type,
      ref_id: body.ref_id ?? null,
      metadata: body.metadata ?? null,
    })

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'update',
      resource: 'wallets',
      resource_id: wallet.id,
      metadata: { operation: 'earn', amount: body.amount, type: body.type },
    })

    return ok({ credited: body.amount, new_balance: wallet.balance + body.amount }, MODULE)
  }

  // POST /mod-wallet/spend — Punkte einlösen
  if (path === '/spend' && req.method === 'POST') {
    let body: { amount: number; metadata?: Record<string, unknown> }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    if (!body.amount || body.amount <= 0) {
      return err(400, 'invalid_amount', 'Amount must be a positive integer')
    }

    if (wallet.balance < body.amount) {
      return err(400, 'insufficient_balance', 'Not enough points')
    }

    const newBalance = wallet.balance - body.amount

    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        balance: newBalance,
        lifetime_spent: wallet.lifetime_spent + body.amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.id)

    if (updateError) return err(500, 'spend_failed', 'Failed to deduct points')

    await supabase.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      amount: -body.amount,
      type: 'redeem',
      metadata: body.metadata ?? null,
    })

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'update',
      resource: 'wallets',
      resource_id: wallet.id,
      metadata: { operation: 'spend', amount: body.amount },
    })

    return ok({ spent: body.amount, new_balance: newBalance }, MODULE)
  }

  return err(404, 'not_found', 'Endpoint not found')
})
