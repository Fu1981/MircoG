import { apiGet } from './client'

export interface LeaderboardEntry {
  rank: number | null
  score: number
  updated_at: string
  players: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
}

export interface LeaderboardResponse {
  period: string
  entries: LeaderboardEntry[]
}

export const leaderboardApi = {
  getOverall: (period = 'all_time', limit = 50) =>
    apiGet<LeaderboardResponse>(`/mod-leaderboard/overall?period=${period}&limit=${limit}`),

  getByGame: (gameId: string, period = 'all_time', limit = 50) =>
    apiGet<LeaderboardResponse & { game: { slug: string; name: string } }>(
      `/mod-leaderboard/${gameId}?period=${period}&limit=${limit}`
    ),

  getMe: () =>
    apiGet<{ player_id: string; entries: Array<LeaderboardEntry & { game_id: string | null }> }>(
      '/mod-leaderboard/me'
    ),
}
