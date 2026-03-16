'use client'

import Link from 'next/link'
import { useWallet } from '@/lib/hooks/useWallet'
import WalletCard from '@/components/wallet/WalletCard'

export default function HomePage() {
  const { wallet, loading } = useWallet()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Willkommen zurück!</h1>
        <p className="text-white/50">Deine Übersicht auf einen Blick</p>
      </div>

      {/* Wallet Summary */}
      <WalletCard wallet={wallet} loading={loading} />

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Schnellzugriff</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/games"
            className="card hover:bg-white/10 transition-colors text-center"
          >
            <div className="text-3xl mb-2">🎮</div>
            <div className="font-semibold">Games spielen</div>
            <div className="text-white/40 text-sm mt-1">Punkte einsetzen</div>
          </Link>
          <Link
            href="/leaderboard"
            className="card hover:bg-white/10 transition-colors text-center"
          >
            <div className="text-3xl mb-2">🏆</div>
            <div className="font-semibold">Rangliste</div>
            <div className="text-white/40 text-sm mt-1">Platz vergleichen</div>
          </Link>
          <Link
            href="/wallet"
            className="card hover:bg-white/10 transition-colors text-center"
          >
            <div className="text-3xl mb-2">💳</div>
            <div className="font-semibold">Wallet</div>
            <div className="text-white/40 text-sm mt-1">Transaktionen</div>
          </Link>
          <Link
            href="/account"
            className="card hover:bg-white/10 transition-colors text-center"
          >
            <div className="text-3xl mb-2">⚙️</div>
            <div className="font-semibold">Einstellungen</div>
            <div className="text-white/40 text-sm mt-1">Profil & DSGVO</div>
          </Link>
        </div>
      </div>

      {/* Info Banner */}
      <div className="card bg-brand-600/10 border-brand-600/30">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <h3 className="font-semibold text-brand-300">Punkte sammeln</h3>
            <p className="text-white/50 text-sm mt-1">
              Scanne deine Loyalty-Karte beim nächsten Besuch und sammle automatisch Punkte.
              Mit Punkten kannst du Games spielen und Prämien einlösen.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
