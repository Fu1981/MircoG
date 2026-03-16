'use client'

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kampagnen</h1>
        <p className="text-white/50 mt-1">Push-Benachrichtigungen und Bonusaktionen</p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Kampagne erstellen</h2>
        <p className="text-white/50 text-sm">
          Push-Kampagnen können nach Aktivierung des mod_push-Moduls erstellt werden.
          Dieses Modul ist im MVP noch deaktiviert.
        </p>
        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <p className="text-yellow-300 text-sm">
            ⚠️ Modul mod_push ist derzeit deaktiviert. Kontaktiere deinen Administrator
            zur Aktivierung.
          </p>
        </div>
      </div>
    </div>
  )
}
