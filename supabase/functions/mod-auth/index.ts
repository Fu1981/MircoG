// mod-auth — Authentication Module
// POST /mod-auth/login    — Social Login initiieren
// POST /mod-auth/logout   — Session beenden
// POST /mod-auth/consent  — Consent speichern (nach erstem Login)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { writeAuditLog, hashIp } from '../_shared/dsgvo.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err } from '../_shared/response.ts'

const MODULE = 'mod_auth'
const CONSENT_VERSION = '2024-01'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // 1. Modul aktiv?
  try {
    await assertModuleActive(MODULE)
  } catch {
    return moduleDisabledResponse()
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(`/${MODULE}`, '')

  // POST /mod-auth/logout — kein Auth-Check nötig (JWT könnte bereits ungültig sein)
  if (path === '/logout' && req.method === 'POST') {
    return ok({ message: 'logged_out' }, MODULE)
  }

  // Alle weiteren Endpunkte benötigen Auth
  const { user, error: authError } = await getAuthenticatedUser(req)
  if (authError || !user) return err(401, 'unauthorized', 'Invalid or missing token')

  const supabase = createServiceClient()

  // Player laden
  const { data: player } = await supabase
    .from('players')
    .select('id, status')
    .eq('auth_user_id', user.id)
    .single()

  if (!player) return err(404, 'player_not_found', 'Player record missing')

  if (player.status === 'banned') {
    return err(403, 'account_banned', 'Your account has been banned')
  }

  // POST /mod-auth/consent — Consent nach erstem Login speichern
  if (path === '/consent' && req.method === 'POST') {
    let body: { purposes: Array<{ key: string; granted: boolean }> }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    if (!Array.isArray(body.purposes)) {
      return err(400, 'invalid_purposes', 'purposes must be an array')
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const ipHash = await hashIp(clientIp)
    const userAgent = req.headers.get('user-agent') ?? ''

    const consentRows = body.purposes.map((p) => ({
      player_id: player.id,
      purpose: p.key,
      granted: p.granted,
      ip_hash: ipHash,
      user_agent: userAgent,
      version: CONSENT_VERSION,
    }))

    const { error: insertError } = await supabase.from('consents').insert(consentRows)
    if (insertError) return err(500, 'consent_save_failed', 'Failed to save consent')

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'consent_change',
      resource: 'consents',
      metadata: { purposes: body.purposes, version: CONSENT_VERSION },
    })

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'login',
      resource: 'players',
      resource_id: player.id,
    })

    return ok({ consents_saved: consentRows.length }, MODULE)
  }

  return err(404, 'not_found', 'Endpoint not found')
})
