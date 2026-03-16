'use client'

import { useState } from 'react'
import { gamesApi, type Game, type SessionStartResult } from '@/lib/api/mod-games'

interface ScratchCardProps {
  game: Game
  onEnd: () => void
}

const SYMBOLS = ['⭐', '💎', '🍀', '🎯', '🔥', '💰']

type CardState = 'idle' | 'starting' | 'scratching' | 'revealed'

export default function ScratchCard({ game, onEnd }: ScratchCardProps) {
  const [state, setState] = useState<CardState>('idle')
  const [session, setSession] = useState<SessionStartResult | null>(null)
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false])
  const [symbols, setSymbols] = useState<string[]>(['?', '?', '?'])
  const [won, setWon] = useState<boolean | null>(null)
  const [winPoints, setWinPoints] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [betPoints, setBetPoints] = useState(game.cost_points)

  const handleStart = async () => {
    setError(null)
    setRevealed([false, false, false])
    setSymbols(['?', '?', '?'])
    setWon(null)
    setWinPoints(0)
    setState('starting')

    try {
      const s = await gamesApi.startSession(game.id, betPoints)
      setSession(s)
      setState('scratching')
    } catch (e) {
      setState('idle')
      setError(e instanceof Error ? e.message : 'Fehler beim Starten')
    }
  }

  const handleReveal = (index: number) => {
    if (state !== 'scratching' || revealed[index] || !session) return

    const newRevealed = [...revealed]
    newRevealed[index] = true
    setRevealed(newRevealed)

    // Symbol aus Server-Metadata laden (werden nach vollständiger Aufdeckung gezeigt)
    // Zeige vorübergehend ein zufälliges Symbol
    const newSymbols = [...symbols]
    newSymbols[index] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
    setSymbols(newSymbols)

    // Wenn alle aufgedeckt: Session beenden
    if (newRevealed.every(Boolean)) {
      finishGame(newRevealedArr => newRevealedArr)
    }
  }

  const finishGame = async (_: (prev: boolean[]) => boolean[]) => {
    if (!session) return
    setState('revealed')

    try {
      const result = await gamesApi.endSession(session.session_id, 'win')
      setWinPoints(result.win_points)
      setWon(result.win_points > 0)

      // Echte Symbole vom Server setzen
      if (session.metadata?.symbols) {
        const serverSymbols = (session.metadata.symbols as number[]).map((i) => SYMBOLS[i] ?? '⭐')
        setSymbols(serverSymbols)
      }
    } catch {
      setWon(false)
    }
  }

  const handleRevealAll = () => {
    if (state !== 'scratching' || !session) return
    setRevealed([true, true, true])

    if (session.metadata?.symbols) {
      const serverSymbols = (session.metadata.symbols as number[]).map((i) => SYMBOLS[i] ?? '⭐')
      setSymbols(serverSymbols)
    }

    setState('revealed')

    gamesApi
      .endSession(session.session_id, 'win')
      .then((result) => {
        setWinPoints(result.win_points)
        setWon(result.win_points > 0)
      })
      .catch(() => setWon(false))
  }

  const handleReset = () => {
    setState('idle')
    setSession(null)
    setRevealed([false, false, false])
    setSymbols(['?', '?', '?'])
    setWon(null)
    setWinPoints(0)
    setError(null)
    onEnd()
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">🎟️ Scratch Card</h2>
          <span className="text-white/40 text-sm">Einsatz: {betPoints} Punkte</span>
        </div>

        {/* Card Display */}
        <div className="bg-gradient-to-br from-brand-700/30 to-purple-800/30 rounded-2xl p-6 mb-4 border border-brand-500/20">
          {state === 'idle' ? (
            <div className="flex justify-center items-center h-32 text-white/30">
              <div className="text-center">
                <div className="text-5xl mb-2">🎟️</div>
                <p>Tippe auf &quot;Spielen&quot; um zu beginnen</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-center text-white/50 text-sm mb-4">
                {state === 'scratching' ? 'Tippe auf die Felder zum Aufdecken!' : ''}
                {state === 'revealed' && won && '🎉 Gewonnen!'}
                {state === 'revealed' && !won && 'Leider nicht gewonnen.'}
              </p>
              <div className="flex gap-4 justify-center">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    onClick={() => handleReveal(i)}
                    disabled={revealed[i] || state !== 'scratching'}
                    className={`w-24 h-24 rounded-xl text-4xl font-bold transition-all duration-300 flex items-center justify-center border-2 ${
                      revealed[i]
                        ? won && state === 'revealed'
                          ? 'bg-green-500/20 border-green-500/50 text-green-400'
                          : 'bg-white/10 border-white/20'
                        : 'bg-brand-600/30 border-brand-500/40 hover:bg-brand-600/50 active:scale-95 cursor-pointer'
                    }`}
                  >
                    {revealed[i] ? symbols[i] : '❓'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Result */}
        {state === 'revealed' && (
          <div
            className={`text-center p-4 rounded-xl mb-4 ${
              won
                ? 'bg-green-500/20 border border-green-500/30'
                : 'bg-white/5 border border-white/10'
            }`}
          >
            {won ? (
              <div>
                <div className="text-3xl font-bold text-green-400">+{winPoints} Punkte</div>
                <div className="text-green-300 text-sm mt-1">Glückwunsch!</div>
              </div>
            ) : (
              <div className="text-white/40">Diesmal kein Gewinn. Versuch es nochmal!</div>
            )}
          </div>
        )}

        {/* Bet Input */}
        {state === 'idle' && (
          <div className="mb-4">
            <label className="block text-sm text-white/60 mb-2">Einsatz (min. {game.cost_points})</label>
            <input
              type="number"
              value={betPoints}
              onChange={(e) => setBetPoints(Math.max(game.cost_points, parseInt(e.target.value) || game.cost_points))}
              min={game.cost_points}
              className="input"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          {state === 'idle' && (
            <button onClick={handleStart} className="btn-primary flex-1">
              Spielen ({betPoints} Punkte)
            </button>
          )}
          {state === 'scratching' && (
            <button onClick={handleRevealAll} className="btn-secondary flex-1">
              Alle aufdecken
            </button>
          )}
          {state === 'revealed' && (
            <button onClick={handleReset} className="btn-secondary flex-1">
              Zurück zur Übersicht
            </button>
          )}
          {state === 'starting' && (
            <button disabled className="btn-primary flex-1 opacity-50">
              Lädt...
            </button>
          )}
        </div>
      </div>

      {/* Rules */}
      <div className="card bg-white/3 text-sm text-white/40 space-y-1">
        <p>📋 <strong className="text-white/60">Regeln:</strong></p>
        <p>• 3 Felder, 6 mögliche Symbole</p>
        <p>• 3 gleiche Symbole = 4× Einsatz Gewinn</p>
        <p>• Gewinnwahrscheinlichkeit: ~33%</p>
      </div>
    </div>
  )
}
