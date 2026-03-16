// mod-identity — Identity Module
// GET    /mod-identity/me     — Eigenes Profil + Wallet-Kurzinfo
// PATCH  /mod-identity/me     — Display-Name, Avatar updaten
// DELETE /mod-identity/me     — Löschanfrage stellen (Art. 17)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { writeAuditLog } from '../_shared/dsgvo.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err } from '../_shared/response.ts'

const MODULE = 'mod_identity'

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
    .select('id, display_name, avatar_url, phone, status, created_at')
    .eq('auth_user_id', user.id)
    .single()

  if (!player) return err(404, 'player_not_found', 'Player record missing')

  // GET /mod-identity/me
  if (path === '/me' && req.method === 'GET') {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance, lifetime_earned, lifetime_spent')
      .eq('player_id', player.id)
      .single()

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'read',
      resource: 'players',
      resource_id: player.id,
    })

    return ok(
      {
        id: player.id,
        display_name: player.display_name,
        avatar_url: player.avatar_url,
        phone: player.phone,
        status: player.status,
        created_at: player.created_at,
        wallet: wallet ?? null,
      },
      MODULE
    )
  }

  // PATCH /mod-identity/me
  if (path === '/me' && req.method === 'PATCH') {
    let body: { display_name?: string; avatar_url?: string }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    const updates: Record<string, string> = {}
    if (typeof body.display_name === 'string') updates.display_name = body.display_name.trim()
    if (typeof body.avatar_url === 'string') updates.avatar_url = body.avatar_url.trim()

    if (Object.keys(updates).length === 0) {
      return err(400, 'no_fields', 'No updatable fields provided')
    }

    const { error: updateError } = await supabase
      .from('players')
      .update(updates)
      .eq('id', player.id)

    if (updateError) return err(500, 'update_failed', 'Failed to update profile')

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'update',
      resource: 'players',
      resource_id: player.id,
      metadata: { fields: Object.keys(updates) },
    })

    return ok({ updated: true }, MODULE)
  }

  // DELETE /mod-identity/me — Löschanfrage stellen (Art. 17 DSGVO)
  if (path === '/me' && req.method === 'DELETE') {
    let body: { reason?: string } = {}
    try {
      body = await req.json()
    } catch {
      // reason is optional
    }

    const { error: deleteReqError } = await supabase.from('deletion_requests').insert({
      player_id: player.id,
      reason: body.reason ?? null,
    })

    if (deleteReqError) return err(500, 'request_failed', 'Failed to create deletion request')

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'delete',
      resource: 'players',
      resource_id: player.id,
      metadata: { type: 'deletion_request' },
    })

    return ok({ deletion_requested: true }, MODULE)
  }

  return err(404, 'not_found', 'Endpoint not found')
})
