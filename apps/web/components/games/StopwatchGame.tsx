'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { gamesApi, type Game } from '@/lib/api/mod-games'

interface StopwatchGameProps {
  game: Game
  onEnd: () => void
}

type GameState = 'idle' | 'starting' | 'ready' | 'running' | 'done'

interface StopResult {
  stopped_ms: number
  deviation_ms: number
  win_points: number
  multiplier: number
}

// Ziel wird server-seitig bestätigt; hier nur für die Anzeige.
const TARGET_MS = (game: Game) => ((game.config?.target_ms as number) ?? 10000)

export default function StopwatchGame({ game, onEnd }: StopwatchGameProps) {
  const targetMs = TARGET_MS(game)

  const [state, setState] = useState<GameState>('idle')
  const [elapsed, setElapsed] = useState(0) // ms
  const [betPoints, setBetPoints] = useState(game.cost_points)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StopResult | null>(null)

  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  useEffect(() => () => stopRaf(), [stopRaf])

  const tick = useCallback(() => {
    setElapsed(performance.now() - startRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Schritt 1: Einsatz buchen (Session starten)
  const handleBuyIn = async () => {
    setError(null)
    setResult(null)
    setElapsed(0)
    setState('starting')
    try {
      const s = await gamesApi.startSession(game.id, betPoints)
      setSessionId(s.session_id)
      setState('ready')
    } catch (e) {
      setState('idle')
      setError(e instanceof Error ? e.message : 'Fehler beim Starten')
    }
  }

  // Schritt 2: Uhr starten
  const handleStartClock = () => {
    startRef.current = performance.now()
    setElapsed(0)
    setState('running')
    rafRef.current = requestAnimationFrame(tick)
  }

  // Schritt 3: Uhr stoppen → Server berechnet Auszahlung
  const handleStop = async () => {
    if (state !== 'running' || !sessionId) return
    stopRaf()
    const stopped = performance.now() - startRef.current
    setElapsed(stopped)
    setState('done')

    try {
      const res = await gamesApi.endSession(sessionId, 'win', {
        stopped_ms: Math.round(stopped),
      })
      setResult({
        stopped_ms: res.stopped_ms ?? Math.round(stopped),
        deviation_ms: res.deviation_ms ?? Math.abs(Math.round(stopped) - targetMs),
        win_points: res.win_points,
        multiplier: res.multiplier ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Stoppen')
    }
  }

  const handleReset = () => {
    stopRaf()
    setState('idle')
    setSessionId(null)
    setResult(null)
    setElapsed(0)
    setError(null)
    onEnd()
  }

  // Sekunden mit 3 Nachkommastellen (Millisekunden-genau)
  const fmt = (ms: number) => (ms / 1000).toFixed(3)

  // Farbe der laufenden Anzeige je nach Nähe zum Ziel
  const dev = Math.abs(elapsed - targetMs)
  const liveColor =
    state !== 'running'
      ? 'text-white'
      : dev <= 50
        ? 'text-green-400'
        : dev <= 150
          ? 'text-yellow-400'
          : 'text-white'

  const won = (result?.win_points ?? 0) > 0

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold">⏱️ Stoppuhr</h2>
          <span className="text-white/40 text-sm">Einsatz: {betPoints} Punkte</span>
        </div>

        <p className="text-center text-white/50 text-sm mb-2">
          Stoppe die Uhr so nah wie möglich bei{' '}
          <span className="text-brand-400 font-bold">{fmt(targetMs)} s</span>
        </p>

        {/* Zeit-Anzeige */}
        <div className="flex items-center justify-center h-48 rounded-xl bg-black/30 border border-white/10 mb-4">
          {state === 'idle' && (
            <div className="text-center text-white/40">
              <div className="text-5xl mb-2">⏱️</div>
              <p>Bereit zum Start</p>
            </div>
          )}
          {state === 'starting' && (
            <div className="text-white/60 text-xl animate-pulse">Startet...</div>
          )}
          {(state === 'ready' || state === 'running' || state === 'done') && (
            <div className="text-center">
              <div className={`text-6xl md:text-7xl font-bold font-mono tabular-nums transition-colors ${liveColor}`}>
                {fmt(elapsed)}
              </div>
              <div className="text-white/40 text-sm mt-2">Sekunden</div>
            </div>
          )}
        </div>

        {/* Ergebnis */}
        {state === 'done' && result && (
          <div
            className={`text-center mb-4 p-4 rounded-xl border ${
              won
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}
          >
            <div className={`text-3xl font-bold ${won ? 'text-green-400' : 'text-red-400'}`}>
              {won ? `+${result.win_points} Punkte` : 'Daneben!'}
            </div>
            <div className="text-white/60 text-sm mt-2">
              Gestoppt bei <strong>{fmt(result.stopped_ms)} s</strong> — Abweichung{' '}
              <strong>{result.deviation_ms} ms</strong>
              {won && <> · Faktor {result.multiplier}×</>}
            </div>
          </div>
        )}

        {/* Einsatz-Eingabe */}
        {state === 'idle' && (
          <div className="mb-4">
            <label className="block text-sm text-white/60 mb-2">
              Einsatz (min. {game.cost_points})
            </label>
            <input
              type="number"
              value={betPoints}
              onChange={(e) =>
                setBetPoints(Math.max(game.cost_points, parseInt(e.target.value) || game.cost_points))
              }
              min={game.cost_points}
              className="input"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Aktionen */}
        <div className="flex gap-3">
          {state === 'idle' && (
            <button onClick={handleBuyIn} className="btn-primary flex-1">
              Spielen ({betPoints} Punkte)
            </button>
          )}
          {state === 'ready' && (
            <button
              onClick={handleStartClock}
              className="btn-primary flex-1 bg-green-600 hover:bg-green-500 text-xl py-4"
            >
              ▶ Uhr starten
            </button>
          )}
          {state === 'running' && (
            <button
              onClick={handleStop}
              className="btn-primary flex-1 bg-red-600 hover:bg-red-500 text-xl py-4"
            >
              ⏹ STOPP
            </button>
          )}
          {state === 'done' && (
            <button onClick={handleReset} className="btn-secondary flex-1">
              Zurück zur Übersicht
            </button>
          )}
        </div>
      </div>

      {/* Regeln */}
      <div className="card bg-white/3 text-sm text-white/40 space-y-1">
        <p>📋 <strong className="text-white/60">Regeln:</strong></p>
        <p>• Stoppe die Uhr genau bei {fmt(targetMs)} s (Anzeige millisekundengenau)</p>
        <p>• Exakt getroffen: 10× Einsatz</p>
        <p>• Abweichung ≤ 10 ms: 5× · ≤ 50 ms: 2× · ≤ 150 ms: Einsatz zurück</p>
        <p>• Größere Abweichung: Einsatz verloren</p>
      </div>
    </div>
  )
}
