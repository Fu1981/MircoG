'use client'

import { useEffect, useState } from 'react'
import { leaderboardApi, type LeaderboardResponse } from '@/lib/api/mod-leaderboard'
import { supabase } from '@/lib/supabase'

type Period = 'daily' | 'weekly' | 'monthly' | 'all_time'

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Heute',
  weekly: 'Diese Woche',
  monthly: 'Dieser Monat',
  all_time: 'Gesamt',
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('all_time')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    leaderboardApi
      .getOverall(period)
      .then(setData)
      .finally(() => setLoading(false))
  }, [period])

  // Realtime-Subscription
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leaderboard_entries' },
        () => {
          leaderboardApi.getOverall(period).then(setData)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [period])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rangliste</h1>
        <p className="text-white/40 text-sm mt-1">Aktualisiert in Echtzeit</p>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              period === p
                ? 'bg-brand-600 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="card animate-pulse h-16 bg-white/5" />
          ))}
        </div>
      ) : !data || data.entries.length === 0 ? (
        <div className="card text-center text-white/40 py-10">
          Noch keine Einträge für diesen Zeitraum.
        </div>
      ) : (
        <div className="space-y-2">
          {data.entries.map((entry, index) => {
            const rank = index + 1
            const isMe = entry.players?.id === currentUserId

            return (
              <div
                key={index}
                className={`card flex items-center gap-4 ${
                  isMe ? 'border-brand-500/50 bg-brand-500/10' : ''
                }`}
              >
                {/* Rank */}
                <div className="w-10 text-center font-bold">
                  {rank === 1 && <span className="text-2xl">🥇</span>}
                  {rank === 2 && <span className="text-2xl">🥈</span>}
                  {rank === 3 && <span className="text-2xl">🥉</span>}
                  {rank > 3 && <span className="text-white/40">#{rank}</span>}
                </div>

                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-brand-600/30 flex items-center justify-center text-lg flex-shrink-0">
                  {entry.players?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.players.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    '👤'
                  )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {entry.players?.display_name ?? 'Anonym'}
                    {isMe && <span className="text-brand-400 text-xs ml-2">(Du)</span>}
                  </div>
                </div>

                {/* Score */}
                <div className="font-bold text-brand-400">{entry.score.toLocaleString('de-DE')}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
