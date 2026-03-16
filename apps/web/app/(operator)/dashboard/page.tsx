'use client'

export default function OperatorDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operator Dashboard</h1>
        <p className="text-white/50 mt-1">Übersicht deiner Standorte und Aktivitäten</p>
      </div>

      {/* Placeholder Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Aktive Spieler', value: '—', icon: '👥' },
          { label: 'Punkte ausgegeben', value: '—', icon: '💰' },
          { label: 'Spielsessions', value: '—', icon: '🎮' },
          { label: 'Loyalty Scans', value: '—', icon: '🔖' },
        ].map((stat) => (
          <div key={stat.label} className="card text-center">
            <div className="text-2xl mb-2">{stat.icon}</div>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-white/40 text-xs mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Operator-Bereich</h2>
        <p className="text-white/50 text-sm">
          Das Operator-Dashboard befindet sich in der Entwicklung. Vollständige Funktionen
          werden in Phase 6 implementiert (nach MVP).
        </p>
        <ul className="mt-3 space-y-2 text-white/40 text-sm">
          <li>✓ Loyalty-Karten verwalten</li>
          <li>✓ Push-Kampagnen erstellen</li>
          <li>✓ Spieler-Statistiken einsehen</li>
          <li>✓ Bonus-Punkte vergeben</li>
        </ul>
      </div>
    </div>
  )
}
