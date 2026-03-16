// mod-push — Push Notifications Module
// POST   /mod-push/subscribe — Push-Token registrieren
// DELETE /mod-push/subscribe — Push-Token entfernen (Opt-out)
// POST   /mod-push/send      — Kampagne senden [operator only]

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { writeAuditLog } from '../_shared/dsgvo.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err } from '../_shared/response.ts'

const MODULE = 'mod_push'

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

  // POST /mod-push/subscribe — Push-Token registrieren
  if (path === '/subscribe' && req.method === 'POST') {
    let body: { push_token: string; platform: 'web' | 'ios' | 'android' }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    if (!body.push_token) return err(400, 'missing_token', 'push_token is required')
    if (!['web', 'ios', 'android'].includes(body.platform)) {
      return err(400, 'invalid_platform', 'platform must be web, ios, or android')
    }

    const { error: upsertError } = await supabase.from('player_devices').upsert(
      {
        player_id: player.id,
        push_token: body.push_token,
        platform: body.platform,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'player_id,push_token' }
    )

    if (upsertError) return err(500, 'subscribe_failed', 'Failed to register device')

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'update',
      resource: 'player_devices',
      metadata: { platform: body.platform },
    })

    return ok({ subscribed: true }, MODULE)
  }

  // DELETE /mod-push/subscribe — Push-Token entfernen
  if (path === '/subscribe' && req.method === 'DELETE') {
    let body: { push_token: string }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    if (!body.push_token) return err(400, 'missing_token', 'push_token is required')

    const { error: deleteError } = await supabase
      .from('player_devices')
      .delete()
      .eq('player_id', player.id)
      .eq('push_token', body.push_token)

    if (deleteError) return err(500, 'unsubscribe_failed', 'Failed to remove device')

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'delete',
      resource: 'player_devices',
    })

    return ok({ unsubscribed: true }, MODULE)
  }

  // POST /mod-push/send — Kampagne senden [operator only]
  // In MVP: Platzhalter — echte Implementierung erfordert Operator-Rolle und Push-Provider
  if (path === '/send' && req.method === 'POST') {
    return err(501, 'not_implemented', 'Push campaign sending not yet implemented in MVP')
  }

  return err(404, 'not_found', 'Endpoint not found')
})
