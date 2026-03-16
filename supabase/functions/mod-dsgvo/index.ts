// mod-dsgvo — DSGVO Rights Module
// GET  /mod-dsgvo/consent — Aktuellen Einwilligungsstand lesen
// POST /mod-dsgvo/consent — Einwilligung erteilen oder widerrufen
// POST /mod-dsgvo/export  — Datenexport anfordern (Art. 20)
// POST /mod-dsgvo/delete  — Konto-Löschung beantragen (Art. 17)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { writeAuditLog, hashIp } from '../_shared/dsgvo.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err } from '../_shared/response.ts'

const MODULE = 'mod_dsgvo'
const CONSENT_VERSION = '2024-01'

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

  // GET /mod-dsgvo/consent — Aktuellen Einwilligungsstand lesen
  if (path === '/consent' && req.method === 'GET') {
    const { data: allConsents } = await supabase
      .from('consents')
      .select('purpose, granted, version, created_at')
      .eq('player_id', player.id)
      .order('created_at', { ascending: false })

    // Aktuellsten Consent pro Zweck ermitteln
    const latestByPurpose = new Map<string, { granted: boolean; version: string; created_at: string }>()
    for (const consent of allConsents ?? []) {
      if (!latestByPurpose.has(consent.purpose)) {
        latestByPurpose.set(consent.purpose, {
          granted: consent.granted,
          version: consent.version,
          created_at: consent.created_at,
        })
      }
    }

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'read',
      resource: 'consents',
    })

    return ok(
      {
        consents: Object.fromEntries(latestByPurpose),
        version: CONSENT_VERSION,
      },
      MODULE
    )
  }

  // POST /mod-dsgvo/consent — Einwilligung erteilen oder widerrufen
  if (path === '/consent' && req.method === 'POST') {
    let body: { purpose: string; granted: boolean }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    const validPurposes = ['essential', 'analytics', 'marketing', 'push_notifications']
    if (!validPurposes.includes(body.purpose)) {
      return err(400, 'invalid_purpose', `Purpose must be one of: ${validPurposes.join(', ')}`)
    }

    if (body.purpose === 'essential' && !body.granted) {
      return err(400, 'essential_required', 'Essential consent cannot be revoked')
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const ipHash = await hashIp(clientIp)
    const userAgent = req.headers.get('user-agent') ?? ''

    const { error: insertError } = await supabase.from('consents').insert({
      player_id: player.id,
      purpose: body.purpose,
      granted: body.granted,
      ip_hash: ipHash,
      user_agent: userAgent,
      version: CONSENT_VERSION,
    })

    if (insertError) return err(500, 'consent_failed', 'Failed to save consent')

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'consent_change',
      resource: 'consents',
      metadata: { purpose: body.purpose, granted: body.granted, version: CONSENT_VERSION },
    })

    return ok({ purpose: body.purpose, granted: body.granted }, MODULE)
  }

  // POST /mod-dsgvo/export — Datenexport anfordern (Art. 20)
  if (path === '/export' && req.method === 'POST') {
    // Prüfen ob bereits ein offener Export-Request vorliegt
    const { data: existing } = await supabase
      .from('export_requests')
      .select('id, status, created_at')
      .eq('player_id', player.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      return ok(
        { export_id: existing.id, status: existing.status, message: 'Export already in progress' },
        MODULE
      )
    }

    const { data: exportReq, error: exportError } = await supabase
      .from('export_requests')
      .insert({ player_id: player.id })
      .select('id')
      .single()

    if (exportError || !exportReq) {
      return err(500, 'export_failed', 'Failed to create export request')
    }

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'export',
      resource: 'players',
      resource_id: player.id,
      metadata: { export_request_id: exportReq.id },
    })

    return ok(
      {
        export_id: exportReq.id,
        status: 'pending',
        message: 'Export request created. You will be notified when ready.',
      },
      MODULE
    )
  }

  // POST /mod-dsgvo/delete — Konto-Löschung beantragen (Art. 17)
  if (path === '/delete' && req.method === 'POST') {
    let body: { reason?: string } = {}
    try {
      body = await req.json()
    } catch {
      // reason is optional
    }

    // Prüfen ob bereits ein offener Lösch-Request vorliegt
    const { data: existing } = await supabase
      .from('deletion_requests')
      .select('id, status, requested_at')
      .eq('player_id', player.id)
      .in('status', ['pending', 'processing'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      return ok(
        { request_id: existing.id, status: existing.status, message: 'Deletion request already pending' },
        MODULE
      )
    }

    const { data: deleteReq, error: deleteError } = await supabase
      .from('deletion_requests')
      .insert({ player_id: player.id, reason: body.reason ?? null })
      .select('id')
      .single()

    if (deleteError || !deleteReq) {
      return err(500, 'deletion_request_failed', 'Failed to create deletion request')
    }

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'delete',
      resource: 'players',
      resource_id: player.id,
      metadata: { type: 'deletion_request', request_id: deleteReq.id },
    })

    return ok(
      {
        request_id: deleteReq.id,
        status: 'pending',
        message: 'Deletion request submitted. Your account will be deleted within 30 days.',
      },
      MODULE
    )
  }

  return err(404, 'not_found', 'Endpoint not found')
})
