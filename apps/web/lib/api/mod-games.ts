import { apiGet, apiPost } from './client'

export interface Game {
  id: string
  slug: string
  name: string
  type: string
  cost_points: number
  config: Record<string, unknown>
}

export interface SessionStartResult {
  session_id: string
  game_slug: string
  bet_points: number
  metadata: Record<string, unknown>
}

export interface SessionEndResult {
  session_id: string
  result: 'win' | 'loss' | 'cashout'
  win_points: number
  crash_point?: number
}

export const gamesApi = {
  listGames: () => apiGet<{ games: Game[] }>('/mod-games/'),

  startSession: (game_id: string, bet_points?: number) =>
    apiPost<SessionStartResult>('/mod-games/session/start', { game_id, bet_points }),

  endSession: (
    sessionId: string,
    result: 'win' | 'loss' | 'cashout',
    options?: { cashout_multiplier?: number; safe_cells?: number }
  ) =>
    apiPost<SessionEndResult>(`/mod-games/session/${sessionId}/end`, { result, ...options }),

  registerDeveloper: (name: string, email: string, webhook_url?: string) =>
    apiPost<{ developer_id: string; api_key: string; status: string }>('/mod-games/developers', {
      name,
      email,
      webhook_url,
    }),
}
