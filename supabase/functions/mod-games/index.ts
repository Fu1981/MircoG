// mod-games — Games Module
// GET  /mod-games/               — Alle aktiven Spiele listen
// POST /mod-games/session/start  — Spielrunde starten (bucht Einsatz)
// POST /mod-games/session/:id/end — Spielrunde beenden (bucht Gewinn)
// POST /mod-games/developers     — Game-Entwickler registrieren

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { writeAuditLog } from '../_shared/dsgvo.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, created, err } from '../_shared/response.ts'

const MODULE = 'mod_games'

// Crash: Exponentialverteilung für Crash-Punkt (house edge ~5%)
function generateCrashPoint(): number {
  const houseEdge = 0.05
  const r = Math.random()
  if (r < houseEdge) return 1.0
  return Math.floor((1 / (1 - r)) * 100) / 100
}

// Scratch Card: 3 Symbole aus 6, 33% Gewinnchance
function generateScratchResult(): { symbols: number[]; won: boolean } {
  const symbols = [
    Math.floor(Math.random() * 6),
    Math.floor(Math.random() * 6),
    Math.floor(Math.random() * 6),
  ]
  const won = symbols[0] === symbols[1] && symbols[1] === symbols[2]
  return { symbols, won }
}

// Mines: 4×4 Gitter, 4 Minen platzieren
function generateMinePositions(): number[] {
  const positions = Array.from({ length: 16 }, (_, i) => i)
  // Fisher-Yates shuffle
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[positions[i], positions[j]] = [positions[j], positions[i]]
  }
  return positions.slice(0, 4)
}

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

  // GET /mod-games/ — Alle aktiven Spiele
  if (path === '/' && req.method === 'GET') {
    const { data: games } = await supabase
      .from('games')
      .select('id, slug, name, type, cost_points, config')
      .eq('active', true)
      .order('name')

    return ok({ games: games ?? [] }, MODULE)
  }

  // POST /mod-games/session/start — Spielrunde starten
  if (path === '/session/start' && req.method === 'POST') {
    let body: { game_id: string; bet_points?: number }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    if (!body.game_id) return err(400, 'missing_game_id', 'game_id is required')

    const { data: game } = await supabase
      .from('games')
      .select('id, slug, cost_points, config')
      .eq('id', body.game_id)
      .eq('active', true)
      .single()

    if (!game) return err(404, 'game_not_found', 'Game not found or inactive')

    const betPoints = body.bet_points ?? game.cost_points
    if (betPoints < game.cost_points) {
      return err(400, 'bet_too_low', `Minimum bet is ${game.cost_points} points`)
    }

    // Wallet prüfen
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance, lifetime_spent')
      .eq('player_id', player.id)
      .single()

    if (!wallet) return err(404, 'wallet_not_found', 'Wallet record missing')
    if (wallet.balance < betPoints) return err(400, 'insufficient_balance', 'Not enough points')

    // Einsatz abbuchen
    const { error: debitError } = await supabase
      .from('wallets')
      .update({
        balance: wallet.balance - betPoints,
        lifetime_spent: wallet.lifetime_spent + betPoints,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.id)

    if (debitError) return err(500, 'debit_failed', 'Failed to debit bet points')

    await supabase.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      amount: -betPoints,
      type: 'game_loss', // wird ggf. bei Gewinn korrigiert
      metadata: { game_id: game.id, game_slug: game.slug },
    })

    // Spielergebnis server-seitig generieren
    let serverMetadata: Record<string, unknown> = {}

    if (game.slug === 'crash') {
      const crashPoint = generateCrashPoint()
      serverMetadata = { crash_point: crashPoint }
    } else if (game.slug === 'scratch') {
      const result = generateScratchResult()
      serverMetadata = { symbols: result.symbols, won: result.won }
    } else if (game.slug === 'mines') {
      const minePositions = generateMinePositions()
      serverMetadata = { mine_positions: minePositions }
    } else if (game.slug === 'stopwatch') {
      const cfg = game.config as { target_ms?: number }
      serverMetadata = { target_ms: cfg.target_ms ?? 10000 }
    }

    // Session anlegen
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .insert({
        player_id: player.id,
        game_id: game.id,
        bet_points: betPoints,
        win_points: 0,
        result: 'pending',
        metadata: serverMetadata,
      })
      .select('id')
      .single()

    if (sessionError || !session) return err(500, 'session_failed', 'Failed to create game session')

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'update',
      resource: 'game_sessions',
      resource_id: session.id,
      metadata: { operation: 'start', game_slug: game.slug, bet: betPoints },
    })

    // Für Crash: crash_point als Hash zurückgeben (Client sieht echten Wert erst nach Cashout)
    const clientMetadata: Record<string, unknown> = {}
    if (game.slug === 'crash') {
      clientMetadata.crash_point_hash = btoa(String(serverMetadata.crash_point))
    }

    return created(
      {
        session_id: session.id,
        game_slug: game.slug,
        bet_points: betPoints,
        metadata: clientMetadata,
      },
      MODULE
    )
  }

  // POST /mod-games/session/:id/end — Spielrunde beenden
  const sessionEndMatch = path.match(/^\/session\/([^/]+)\/end$/)
  if (sessionEndMatch && req.method === 'POST') {
    const sessionId = sessionEndMatch[1]

    let body: {
      result: 'win' | 'loss' | 'cashout'
      cashout_multiplier?: number
      safe_cells?: number
      stopped_ms?: number
    }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    const validResults = ['win', 'loss', 'cashout']
    if (!validResults.includes(body.result)) {
      return err(400, 'invalid_result', `Result must be one of: ${validResults.join(', ')}`)
    }

    const { data: session } = await supabase
      .from('game_sessions')
      .select('id, player_id, game_id, bet_points, result, metadata, created_at')
      .eq('id', sessionId)
      .eq('player_id', player.id)
      .single()

    if (!session) return err(404, 'session_not_found', 'Game session not found')
    if (session.result !== 'pending') return err(400, 'session_ended', 'Session already completed')

    const { data: game } = await supabase
      .from('games')
      .select('slug, config')
      .eq('id', session.game_id)
      .single()

    if (!game) return err(404, 'game_not_found', 'Game not found')

    // Gewinn berechnen
    let winPoints = 0
    let finalResult: 'win' | 'loss' | 'cashout' = body.result
    const serverMeta = (session.metadata ?? {}) as Record<string, unknown>

    if (body.result === 'win' || body.result === 'cashout') {
      if (game.slug === 'crash') {
        if (!body.cashout_multiplier || body.cashout_multiplier <= 1) {
          return err(400, 'invalid_multiplier', 'cashout_multiplier must be > 1')
        }
        const crashPoint = serverMeta.crash_point as number
        if (body.cashout_multiplier > crashPoint) {
          return err(400, 'crash_exceeded', 'Cashout multiplier exceeds crash point — you lost')
        }
        winPoints = Math.floor(session.bet_points * body.cashout_multiplier)
      } else if (game.slug === 'scratch') {
        if (serverMeta.won) {
          const config = game.config as { win_multiplier?: number }
          winPoints = session.bet_points * (config.win_multiplier ?? 4)
        }
      } else if (game.slug === 'mines') {
        const safeCells = body.safe_cells ?? 0
        if (safeCells < 0) return err(400, 'invalid_safe_cells', 'safe_cells must be >= 0')
        winPoints = Math.floor(session.bet_points * (1 + safeCells * 0.5))
      } else if (game.slug === 'stopwatch') {
        // Skill-Spiel: Client meldet die gestoppte Zeit, Server bestimmt die Auszahlung.
        if (typeof body.stopped_ms !== 'number' || body.stopped_ms < 0) {
          return err(400, 'invalid_stopped_ms', 'stopped_ms must be a non-negative number')
        }
        const cfg = game.config as {
          target_ms?: number
          tiers?: Array<{ max_dev_ms: number; multiplier: number }>
        }
        const targetMs = cfg.target_ms ?? 10000

        // Anti-Cheat: gemeldete Zeit darf die real vergangene Session-Zeit nicht übersteigen.
        const serverElapsed = Date.now() - new Date(session.created_at as string).getTime()
        if (body.stopped_ms > serverElapsed + 1500) {
          return err(400, 'implausible_time', 'Reported stop time exceeds elapsed session time')
        }

        const deviation = Math.abs(body.stopped_ms - targetMs)
        const tier = [...(cfg.tiers ?? [])]
          .sort((a, b) => a.max_dev_ms - b.max_dev_ms)
          .find((t) => deviation <= t.max_dev_ms)
        const multiplier = tier?.multiplier ?? 0

        winPoints = Math.floor(session.bet_points * multiplier)
        finalResult = winPoints > 0 ? 'win' : 'loss'
        serverMeta.stopped_ms = body.stopped_ms
        serverMeta.deviation_ms = deviation
        serverMeta.target_ms = targetMs
        serverMeta.multiplier = multiplier
      }
    }

    // Session abschließen
    const { error: updateError } = await supabase
      .from('game_sessions')
      .update({
        result: finalResult,
        win_points: winPoints,
        metadata: { ...serverMeta, client_result: body.result },
      })
      .eq('id', sessionId)

    if (updateError) return err(500, 'session_update_failed', 'Failed to end game session')

    // Gewinn gutschreiben
    if (winPoints > 0) {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, balance, lifetime_earned')
        .eq('player_id', player.id)
        .single()

      if (wallet) {
        await supabase
          .from('wallets')
          .update({
            balance: wallet.balance + winPoints,
            lifetime_earned: wallet.lifetime_earned + winPoints,
            updated_at: new Date().toISOString(),
          })
          .eq('id', wallet.id)

        await supabase.from('wallet_transactions').insert({
          wallet_id: wallet.id,
          amount: winPoints,
          type: 'game_win',
          ref_id: sessionId,
          metadata: { game_slug: game.slug },
        })
      }
    }

    await writeAuditLog(supabase, {
      player_id: player.id,
      actor_id: player.id,
      action: 'update',
      resource: 'game_sessions',
      resource_id: sessionId,
      metadata: { operation: 'end', result: body.result, win_points: winPoints },
    })

    return ok(
      {
        session_id: sessionId,
        result: finalResult,
        win_points: winPoints,
        ...(game.slug === 'crash' ? { crash_point: serverMeta.crash_point } : {}),
        ...(game.slug === 'stopwatch'
          ? {
              stopped_ms: serverMeta.stopped_ms,
              deviation_ms: serverMeta.deviation_ms,
              target_ms: serverMeta.target_ms,
              multiplier: serverMeta.multiplier,
            }
          : {}),
      },
      MODULE
    )
  }

  // POST /mod-games/developers — Game-Entwickler registrieren
  if (path === '/developers' && req.method === 'POST') {
    let body: { name: string; email: string; webhook_url?: string }
    try {
      body = await req.json()
    } catch {
      return err(400, 'invalid_body', 'Request body must be valid JSON')
    }

    if (!body.name || !body.email) {
      return err(400, 'missing_fields', 'name and email are required')
    }

    const { data: developer, error: devError } = await supabase
      .from('developers')
      .insert({
        name: body.name,
        email: body.email,
        webhook_url: body.webhook_url ?? null,
        active: false,
      })
      .select('id, api_key')
      .single()

    if (devError) {
      if (devError.code === '23505') {
        return err(409, 'email_exists', 'A developer with this email already exists')
      }
      return err(500, 'registration_failed', 'Failed to register developer')
    }

    return created(
      {
        developer_id: developer.id,
        api_key: developer.api_key,
        status: 'pending_review',
      },
      MODULE
    )
  }

  return err(404, 'not_found', 'Endpoint not found')
})
