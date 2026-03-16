'use client'

import { useEffect, useState } from 'react'
import { gamesApi, type Game } from '@/lib/api/mod-games'
import { useWallet } from '@/lib/hooks/useWallet'
import CrashGame from '@/components/games/CrashGame'
import ScratchCard from '@/components/games/ScratchCard'
import MinesGame from '@/components/games/MinesGame'

const GAME_EMOJI: Record<string, string> = {
  crash: '📈',
  scratch: '🎟️',
  mines: '💣',
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const { wallet, refresh: refreshWallet } = useWallet()

  useEffect(() => {
    gamesApi.listGames().then((data) => {
      setGames(data.games)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleGameEnd = () => {
    setSelectedGame(null)
    refreshWallet()
  }

  if (selectedGame) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedGame(null)}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          ← Zurück zur Spielübersicht
        </button>

        {selectedGame.slug === 'crash' && (
          <CrashGame game={selectedGame} onEnd={handleGameEnd} />
        )}
        {selectedGame.slug === 'scratch' && (
          <ScratchCard game={selectedGame} onEnd={handleGameEnd} />
        )}
        {selectedGame.slug === 'mines' && (
          <MinesGame game={selectedGame} onEnd={handleGameEnd} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Games</h1>
        {wallet && (
          <p className="text-white/50 mt-1">
            Dein Kontostand: <span className="text-brand-400 font-bold">{wallet.balance} Punkte</span>
          </p>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse h-28 bg-white/5" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="card text-center text-white/40 py-10">
          Keine Spiele verfügbar.
        </div>
      ) : (
        <div className="grid gap-4">
          {games.map((game) => {
            const canAfford = (wallet?.balance ?? 0) >= game.cost_points
            return (
              <div key={game.id} className="card">
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{GAME_EMOJI[game.slug] ?? '🎮'}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg">{game.name}</h3>
                    <p className="text-white/40 text-sm">Einsatz: {game.cost_points} Punkte</p>
                  </div>
                  <button
                    onClick={() => setSelectedGame(game)}
                    disabled={!canAfford}
                    className={`btn-primary text-sm py-2 px-4 ${!canAfford ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {canAfford ? 'Spielen' : 'Zu wenig Punkte'}
                  </button>
                </div>

                {/* Game description */}
                <div className="mt-3 pt-3 border-t border-white/10 text-sm text-white/40">
                  {game.slug === 'crash' && 'Steige rechtzeitig aus, bevor der Kurs abstürzt!'}
                  {game.slug === 'scratch' && '3 gleiche Symbole = 4× Einsatz Gewinn!'}
                  {game.slug === 'mines' && 'Decke sichere Felder auf — jedes bringt mehr Gewinn!'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {wallet && wallet.balance < 30 && (
        <div className="card bg-yellow-500/10 border-yellow-500/20">
          <p className="text-yellow-300 text-sm">
            ⚠️ Dein Kontostand ist niedrig. Scanne deine Loyalty-Karte beim nächsten Besuch,
            um Punkte zu sammeln.
          </p>
        </div>
      )}
    </div>
  )
}
