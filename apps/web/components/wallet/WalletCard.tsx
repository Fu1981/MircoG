'use client'

import type { WalletBalance } from '@/lib/api/mod-wallet'

interface WalletCardProps {
  wallet: WalletBalance | null
  loading?: boolean
}

export default function WalletCard({ wallet, loading = false }: WalletCardProps) {
  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-8 bg-white/10 rounded-lg w-32 mb-2" />
        <div className="h-12 bg-white/10 rounded-lg w-48" />
      </div>
    )
  }

  if (!wallet) {
    return (
      <div className="card text-center text-white/40 py-8">
        Wallet-Daten konnten nicht geladen werden.
      </div>
    )
  }

  return (
    <div className="card bg-gradient-to-br from-brand-600/20 to-purple-800/20 border-brand-500/30">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/50 text-sm font-medium uppercase tracking-wider mb-1">
            Dein Kontostand
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{wallet.balance.toLocaleString('de-DE')}</span>
            <span className="text-brand-400 font-semibold">Punkte</span>
          </div>
        </div>
        <div className="text-4xl">💰</div>
      </div>

      <div className="flex gap-6 mt-4 pt-4 border-t border-white/10">
        <div>
          <div className="text-green-400 font-semibold text-sm">
            +{wallet.lifetime_earned.toLocaleString('de-DE')}
          </div>
          <div className="text-white/40 text-xs">Gesammelt</div>
        </div>
        <div>
          <div className="text-red-400 font-semibold text-sm">
            -{wallet.lifetime_spent.toLocaleString('de-DE')}
          </div>
          <div className="text-white/40 text-xs">Ausgegeben</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-white/40 text-xs">
            {new Date(wallet.updated_at).toLocaleDateString('de-DE')}
          </div>
          <div className="text-white/20 text-xs">Letzte Aktivität</div>
        </div>
      </div>
    </div>
  )
}
