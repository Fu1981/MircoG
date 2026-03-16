'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { gamesApi, type Game, type SessionStartResult } from '@/lib/api/mod-games'

interface CrashGameProps {
  game: Game
  onEnd: () => void
}

type GameState = 'idle' | 'running' | 'crashed' | 'cashedout' | 'starting'

export default function CrashGame({ game, onEnd }: CrashGameProps) {
  const [state, setState] = useState<GameState>('idle')
  const [multiplier, setMultiplier] = useState(1.0)
  const [session, setSession] = useState<SessionStartResult | null>(null)
  const [result, setResult] = useState<{ win: number; multiplier: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [betPoints, setBetPoints] = useState(game.cost_points)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopInterval()
  }, [stopInterval])

  const handleStart = async () => {
    setError(null)
    setResult(null)
    setMultiplier(1.0)
    setState('starting')

    try {
      const s = await gamesApi.startSession(game.id, betPoints)
      setSession(s)
      setState('running')
      startTimeRef.current = Date.now()

      // Multiplikator kontinuierlich erhöhen
      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000
        // Exponentielle Kurve: multiplier = e^(0.1 * t)
        const m = Math.pow(Math.E, 0.1 * elapsed)
        setMultiplier(Math.floor(m * 100) / 100)
      }, 50)
    } catch (e) {
      setState('idle')
      setError(e instanceof Error ? e.message : 'Fehler beim Starten')
    }
  }

  const handleCashout = async () => {
    if (!session || state !== 'running') return
    stopInterval()
    setState('cashedout')

    const finalMultiplier = multiplier
    try {
      const endResult = await gamesApi.endSession(session.session_id, 'cashout', {
        cashout_multiplier: finalMultiplier,
      })

      if (endResult.crash_point && finalMultiplier > endResult.crash_point) {
        setState('crashed')
        setResult({ win: 0, multiplier: endResult.crash_point })
      } else {
        setResult({ win: endResult.win_points, multiplier: finalMultiplier })
      }
    } catch {
      // Falls Cashout nach Crash
      setState('crashed')
      setResult({ win: 0, multiplier: finalMultiplier })
    }
  }

  const handleReset = () => {
    setState('idle')
    setMultiplier(1.0)
    setSession(null)
    setResult(null)
    setError(null)
    onEnd()
  }

  const multiplierColor =
    multiplier < 1.5
      ? 'text-green-400'
      : multiplier < 3
        ? 'text-yellow-400'
        : multiplier < 5
          ? 'text-orange-400'
          : 'text-red-400'

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold">📈 Crash</h2>
          <span className="text-white/40 text-sm">Einsatz: {betPoints} Punkte</span>
        </div>

        {/* Multiplier Display */}
        <div className="flex items-center justify-center h-48 rounded-xl bg-black/30 border border-white/10 mb-4">
          {state === 'idle' && (
            <div className="text-center text-white/40">
              <div className="text-5xl mb-2">📈</div>
              <p>Bereit zum Start</p>
            </div>
          )}
          {state === 'starting' && (
            <div className="text-white/60 text-xl animate-pulse">Startet...</div>
          )}
          {(state === 'running' || state === 'cashedout') && (
            <div className={`text-7xl font-bold transition-colors ${multiplierColor}`}>
              {multiplier.toFixed(2)}×
            </div>
          )}
          {state === 'crashed' && (
            <div className="text-center">
              <div className="text-6xl font-bold text-red-500">CRASH!</div>
              {result && (
                <div className="text-red-400 mt-2">bei {result.multiplier.toFixed(2)}×</div>
              )}
            </div>
          )}
          {state === 'cashedout' && result && (
            <div className="text-center">
              <div className="text-5xl font-bold text-green-400">+{result.win}</div>
              <div className="text-green-300 mt-1">Punkte gewonnen!</div>
            </div>
          )}
        </div>

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
          {state === 'running' && (
            <button
              onClick={handleCashout}
              className="btn-primary flex-1 bg-green-600 hover:bg-green-500 text-xl py-4"
            >
              💰 CASH OUT ({Math.floor(betPoints * multiplier)} Punkte)
            </button>
          )}
          {(state === 'crashed' || state === 'cashedout') && (
            <button onClick={handleReset} className="btn-secondary flex-1">
              Zurück zur Übersicht
            </button>
          )}
        </div>
      </div>

      {/* Rules */}
      <div className="card bg-white/3 text-sm text-white/40 space-y-1">
        <p>📋 <strong className="text-white/60">Regeln:</strong></p>
        <p>• Der Multiplikator steigt kontinuierlich an</p>
        <p>• Drücke &quot;Cash Out&quot; bevor der Kurs abstürzt</p>
        <p>• Gewinn = Einsatz × Multiplikator bei Cash Out</p>
        <p>• House Edge: ~5%</p>
      </div>
    </div>
  )
}
