// mod-loyalty — Loyalty Module
// GET  /mod-loyalty/cards — Verfügbare Loyalty-Karten
// POST /mod-loyalty/scan  — QR-Scan einlösen

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { writeAuditLog } from '../_shared/dsgvo.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err } from '../_shared/response.ts'

const MODULE = 'mod_loyalty'

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

  // GET /mod-loyalty/cards
  if (path === '/cards' && req.method === 'GET') {
    const { data: cards } = await supabase
      .from('loyalty_cards')
      .select('id, name, partner_name, points_per_scan')
      .eq('active', true)
      .order('name')

    return ok({ cards: cards ?? [] }, MODULE)
  }

  // POST /mod-loyalty/scan — QR-Scan einlösen
  if (path === '/scan' && req.method === 'POST') {
    let body: { loyalty_card_id: string; qr_code: string }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    if (!body.loyalty_card_id) {
      return err(400, 'missing_card_id', 'loyalty_card_id is required')
    }

    const { data: card } = await supabase
      .from('loyalty_cards')
      .select('id, points_per_scan')
      .eq('id', body.loyalty_card_id)
      .eq('active', true)
      .single()

    if (!card) return err(404, 'card_not_found', 'Loyalty card not found or inactive')

    // Scan aufzeichnen
    const { error: scanError } = await supabase.from('player_loyalty_scans').insert({
      player_id: player.id,
      loyalty_card_id: card.id,
      points_earned: card.points_per_scan,
    })

    if (scanError) return err(500, 'scan_failed', 'Failed to record loyalty scan')

    // Punkte gutschreiben
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance, lifetime_earned')
      .eq('player_id', player.id)
      .single()

    if (wallet) {
      await supabase
        .from('wallets')
        .update({
          balance: wallet.balance + card.points_per_scan,
          lifetime_earned: wallet.lifetime_earned + card.points_per_scan,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.id)

      await supabase.from('wallet_transactions').insert({
        wallet_id: wallet.id,
        amount: card.points_per_scan,
        type: 'loyalty_scan',
        metadata: { loyalty_card_id: card.id },
      })
    }

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'update',
      resource: 'player_loyalty_scans',
      metadata: { loyalty_card_id: card.id, points_earned: card.points_per_scan },
    })

    return ok({ points_earned: card.points_per_scan }, MODULE)
  }

  return err(404, 'not_found', 'Endpoint not found')
})
