'use client'

import { useState } from 'react'
import { gamesApi, type Game, type SessionStartResult } from '@/lib/api/mod-games'

interface MinesGameProps {
  game: Game
  onEnd: () => void
}

type CellState = 'hidden' | 'safe' | 'mine'
type GameState = 'idle' | 'starting' | 'playing' | 'gameover' | 'cashedout'

const GRID_SIZE = 16
const MINE_COUNT = 4

export default function MinesGame({ game, onEnd }: MinesGameProps) {
  const [state, setState] = useState<GameState>('idle')
  const [session, setSession] = useState<SessionStartResult | null>(null)
  const [cells, setCells] = useState<CellState[]>(Array(GRID_SIZE).fill('hidden'))
  const [safeCells, setSafeCells] = useState(0)
  const [currentWin, setCurrentWin] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [betPoints, setBetPoints] = useState(game.cost_points)
  const [minePositions, setMinePositions] = useState<number[]>([])

  const calculateWin = (safe: number, bet: number) =>
    Math.floor(bet * (1 + safe * 0.5))

  const handleStart = async () => {
    setError(null)
    setCells(Array(GRID_SIZE).fill('hidden'))
    setSafeCells(0)
    setCurrentWin(0)
    setMinePositions([])
    setState('starting')

    try {
      const s = await gamesApi.startSession(game.id, betPoints)
      setSession(s)
      setState('playing')
    } catch (e) {
      setState('idle')
      setError(e instanceof Error ? e.message : 'Fehler beim Starten')
    }
  }

  const handleCellClick = async (index: number) => {
    if (state !== 'playing' || cells[index] !== 'hidden' || !session) return

    // Prüfen ob Mine (vom Server nur am Ende bekannt — Client simuliert)
    // In echtem Spiel: Server validiert beim End-Call
    const newCells = [...cells]
    const newSafeCells = safeCells + 1
    const newWin = calculateWin(newSafeCells, betPoints)

    newCells[index] = 'safe'
    setCells(newCells)
    setSafeCells(newSafeCells)
    setCurrentWin(newWin)
  }

  const handleCashout = async () => {
    if (!session || state !== 'playing') return
    setState('cashedout')

    try {
      const result = await gamesApi.endSession(session.session_id, 'cashout', {
        safe_cells: safeCells,
      })

      // Mine-Positionen aufdecken
      if (session.metadata?.mine_positions) {
        const mines = session.metadata.mine_positions as number[]
        setMinePositions(mines)
        const finalCells = [...cells]
        mines.forEach((pos) => {
          if (finalCells[pos] === 'hidden') finalCells[pos] = 'mine'
        })
        setCells(finalCells)
      }

      setCurrentWin(result.win_points)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Cashout')
      setState('playing')
    }
  }

  const handleReset = () => {
    setState('idle')
    setSession(null)
    setCells(Array(GRID_SIZE).fill('hidden'))
    setSafeCells(0)
    setCurrentWin(0)
    setError(null)
    setMinePositions([])
    onEnd()
  }

  const maxSafeCells = GRID_SIZE - MINE_COUNT // 12
  const progressPercent = Math.floor((safeCells / maxSafeCells) * 100)

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">💣 Mines</h2>
          <span className="text-white/40 text-sm">Einsatz: {betPoints} Punkte</span>
        </div>

        {/* Stats */}
        {state === 'playing' && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-black/20 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-green-400">{safeCells}</div>
              <div className="text-white/40 text-xs">Sichere Felder</div>
            </div>
            <div className="bg-black/20 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-brand-400">{currentWin}</div>
              <div className="text-white/40 text-xs">Aktueller Gewinn</div>
            </div>
            <div className="bg-black/20 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-red-400">{MINE_COUNT}</div>
              <div className="text-white/40 text-xs">Minen</div>
            </div>
          </div>
        )}

        {/* Grid */}
        {state !== 'idle' && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            {cells.map((cell, index) => {
              const isMine = minePositions.includes(index)

              return (
                <button
                  key={index}
                  onClick={() => handleCellClick(index)}
                  disabled={cell !== 'hidden' || state !== 'playing'}
                  className={`h-16 rounded-xl text-2xl font-bold transition-all duration-200 ${
                    cell === 'hidden'
                      ? state === 'playing'
                        ? 'bg-brand-700/40 border border-brand-500/30 hover:bg-brand-600/50 active:scale-95 cursor-pointer'
                        : 'bg-white/5 border border-white/10'
                      : cell === 'safe'
                        ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                        : 'bg-red-500/20 border border-red-500/30 text-red-400'
                  }`}
                >
                  {cell === 'hidden' && (state === 'gameover' || state === 'cashedout') && isMine
                    ? '💣'
                    : cell === 'safe'
                      ? '✅'
                      : cell === 'mine'
                        ? '💣'
                        : ''}
                </button>
              )
            })}
          </div>
        )}

        {/* Progress */}
        {state === 'playing' && safeCells > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-white/40 mb-1">
              <span>Fortschritt</span>
              <span>{progressPercent}% der sicheren Felder aufgedeckt</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-600 to-green-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Result */}
        {(state === 'gameover' || state === 'cashedout') && (
          <div
            className={`text-center p-4 rounded-xl mb-4 ${
              state === 'cashedout'
                ? 'bg-green-500/20 border border-green-500/30'
                : 'bg-red-500/20 border border-red-500/30'
            }`}
          >
            {state === 'cashedout' ? (
              <div>
                <div className="text-3xl font-bold text-green-400">+{currentWin} Punkte</div>
                <div className="text-green-300 text-sm mt-1">
                  {safeCells} sichere Felder aufgedeckt
                </div>
              </div>
            ) : (
              <div className="text-red-400">Auf eine Mine getreten!</div>
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
          {state === 'starting' && (
            <button disabled className="btn-primary flex-1 opacity-50">Lädt...</button>
          )}
          {state === 'playing' && (
            <>
              <button
                onClick={handleCashout}
                disabled={safeCells === 0}
                className="btn-primary flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-40"
              >
                💰 Cash Out ({currentWin} Punkte)
              </button>
            </>
          )}
          {(state === 'gameover' || state === 'cashedout') && (
            <button onClick={handleReset} className="btn-secondary flex-1">
              Zurück zur Übersicht
            </button>
          )}
        </div>
      </div>

      {/* Rules */}
      <div className="card bg-white/3 text-sm text-white/40 space-y-1">
        <p>📋 <strong className="text-white/60">Regeln:</strong></p>
        <p>• 4×4 Gitter, 4 versteckte Minen</p>
        <p>• Jedes sichere Feld: +50% Einsatz Bonus</p>
        <p>• Formel: Einsatz × (1 + sichere_felder × 0.5)</p>
        <p>• Jederzeit Cash Out möglich</p>
      </div>
    </div>
  )
}
