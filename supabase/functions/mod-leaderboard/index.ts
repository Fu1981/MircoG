// mod-leaderboard — Leaderboard Module
// GET /mod-leaderboard/overall          — Gesamtrangliste
// GET /mod-leaderboard/:game_id         — Rangliste für ein Spiel
// GET /mod-leaderboard/:game_id?period= — Periodenrangliste
// GET /mod-leaderboard/me               — Eigene Position

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { assertModuleActive, moduleDisabledResponse } from '../_shared/module-guard.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err } from '../_shared/response.ts'

const MODULE = 'mod_leaderboard'
const VALID_PERIODS = ['daily', 'weekly', 'monthly', 'all_time'] as const
type Period = (typeof VALID_PERIODS)[number]

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
  const period = (url.searchParams.get('period') ?? 'all_time') as Period
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100)

  if (!VALID_PERIODS.includes(period)) {
    return err(400, 'invalid_period', `Period must be one of: ${VALID_PERIODS.join(', ')}`)
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!player) return err(404, 'player_not_found', 'Player record missing')

  // GET /mod-leaderboard/overall
  if (path === '/overall' && req.method === 'GET') {
    const { data: entries } = await supabase
      .from('leaderboard_entries')
      .select('rank, score, updated_at, players(id, display_name, avatar_url)')
      .is('game_id', null)
      .eq('period', period)
      .order('score', { ascending: false })
      .limit(limit)

    return ok({ period, entries: entries ?? [] }, MODULE)
  }

  // GET /mod-leaderboard/me
  if (path === '/me' && req.method === 'GET') {
    const { data: entries } = await supabase
      .from('leaderboard_entries')
      .select('game_id, period, rank, score, updated_at, games(slug, name)')
      .eq('player_id', player.id)
      .order('score', { ascending: false })

    return ok({ player_id: player.id, entries: entries ?? [] }, MODULE)
  }

  // GET /mod-leaderboard/:game_id
  if (path.startsWith('/') && path.length > 1 && req.method === 'GET') {
    const gameId = path.slice(1)

    // UUID-Validierung
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(gameId)) {
      return err(400, 'invalid_game_id', 'game_id must be a valid UUID')
    }

    const { data: game } = await supabase
      .from('games')
      .select('id, slug, name')
      .eq('id', gameId)
      .single()

    if (!game) return err(404, 'game_not_found', 'Game not found')

    const { data: entries } = await supabase
      .from('leaderboard_entries')
      .select('rank, score, updated_at, players(id, display_name, avatar_url)')
      .eq('game_id', gameId)
      .eq('period', period)
      .order('score', { ascending: false })
      .limit(limit)

    return ok({ game, period, entries: entries ?? [] }, MODULE)
  }

  return err(404, 'not_found', 'Endpoint not found')
})
