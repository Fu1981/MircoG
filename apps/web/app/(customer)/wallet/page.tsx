'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/hooks/useWallet'
import { walletApi, type WalletTransaction } from '@/lib/api/mod-wallet'
import WalletCard from '@/components/wallet/WalletCard'

const TX_TYPE_LABELS: Record<string, { label: string; emoji: string; positive: boolean }> = {
  checkin: { label: 'Check-in', emoji: '📍', positive: true },
  game_win: { label: 'Spielgewinn', emoji: '🎉', positive: true },
  game_loss: { label: 'Spieleinsatz', emoji: '🎮', positive: false },
  loyalty_scan: { label: 'Loyalty Scan', emoji: '🔖', positive: true },
  redeem: { label: 'Eingelöst', emoji: '🎁', positive: false },
  bonus: { label: 'Bonus', emoji: '⭐', positive: true },
  campaign: { label: 'Kampagne', emoji: '📢', positive: true },
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function WalletPage() {
  const { wallet, loading: walletLoading } = useWallet()
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const load = async () => {
      setTxLoading(true)
      try {
        const data = await walletApi.getTransactions(page, 20)
        setTransactions(data.transactions)
        setTotal(data.pagination.total)
      } finally {
        setTxLoading(false)
      }
    }
    load()
  }, [page])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wallet</h1>

      <WalletCard wallet={wallet} loading={walletLoading} />

      {/* Stats */}
      {wallet && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-400">+{wallet.lifetime_earned}</div>
            <div className="text-white/40 text-sm mt-1">Gesammelt (gesamt)</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-red-400">-{wallet.lifetime_spent}</div>
            <div className="text-white/40 text-sm mt-1">Ausgegeben (gesamt)</div>
          </div>
        </div>
      )}

      {/* Transactions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Transaktionen</h2>
        {txLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="card animate-pulse h-16 bg-white/5" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="card text-center text-white/40 py-10">
            Noch keine Transaktionen vorhanden.
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const meta = TX_TYPE_LABELS[tx.type] ?? { label: tx.type, emoji: '💫', positive: tx.amount > 0 }
              return (
                <div key={tx.id} className="card flex items-center gap-4">
                  <span className="text-2xl">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{meta.label}</div>
                    <div className="text-white/40 text-xs">{formatDate(tx.created_at)}</div>
                  </div>
                  <div
                    className={`font-bold text-lg ${
                      tx.amount > 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-30"
            >
              Zurück
            </button>
            <span className="flex items-center text-white/40 text-sm px-2">
              Seite {page} von {Math.ceil(total / 20)}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-30"
            >
              Weiter
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
