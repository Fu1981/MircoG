'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { identityApi, type PlayerProfile } from '@/lib/api/mod-identity'
import { dsgvoApi, type ConsentState } from '@/lib/api/mod-dsgvo'
import { CONSENT_PURPOSES } from '@/lib/consent-purposes'

export default function AccountPage() {
  const router = useRouter()
  const { signOut } = useAuth()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [consents, setConsents] = useState<ConsentState | null>(null)
  const [loading, setLoading] = useState(true)
  const [editName, setEditName] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    Promise.all([identityApi.getMe(), dsgvoApi.getConsent()])
      .then(([p, c]) => {
        setProfile(p)
        setNewName(p.display_name ?? '')
        setConsents(c)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSaveName = async () => {
    setSaving(true)
    try {
      await identityApi.updateMe({ display_name: newName })
      setProfile((prev) => prev ? { ...prev, display_name: newName } : prev)
      setEditName(false)
      setMessage({ type: 'success', text: 'Name aktualisiert.' })
    } catch {
      setMessage({ type: 'error', text: 'Fehler beim Speichern.' })
    } finally {
      setSaving(false)
    }
  }

  const handleConsentToggle = async (purpose: string, currentGranted: boolean, required: boolean) => {
    if (required) return
    try {
      await dsgvoApi.updateConsent(purpose, !currentGranted)
      setConsents((prev) =>
        prev
          ? {
              ...prev,
              consents: {
                ...prev.consents,
                [purpose]: { ...prev.consents[purpose], granted: !currentGranted },
              },
            }
          : prev
      )
    } catch {
      setMessage({ type: 'error', text: 'Einwilligung konnte nicht geändert werden.' })
    }
  }

  const handleExportRequest = async () => {
    try {
      const result = await dsgvoApi.requestExport()
      setMessage({ type: 'success', text: result.message })
    } catch {
      setMessage({ type: 'error', text: 'Datenexport konnte nicht angefragt werden.' })
    }
  }

  const handleDeleteRequest = async () => {
    const confirmed = window.confirm(
      'Möchtest du wirklich eine Löschanfrage stellen? Dein Konto wird innerhalb von 30 Tagen gelöscht.'
    )
    if (!confirmed) return
    try {
      const result = await dsgvoApi.requestDeletion()
      setMessage({ type: 'success', text: result.message })
    } catch {
      setMessage({ type: 'error', text: 'Löschanfrage konnte nicht gestellt werden.' })
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card animate-pulse h-20 bg-white/5" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mein Konto</h1>

      {/* Status Message */}
      {message && (
        <div
          className={`card ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-red-500/10 border-red-500/20'
          }`}
        >
          <p className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>
            {message.text}
          </p>
        </div>
      )}

      {/* Profile Section */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-lg">Profil</h2>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-600/30 flex items-center justify-center text-2xl flex-shrink-0">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              '👤'
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input flex-1 py-2 text-sm"
                  placeholder="Dein Anzeigename"
                />
                <button onClick={handleSaveName} disabled={saving} className="btn-primary py-2 px-3 text-sm">
                  {saving ? '...' : '✓'}
                </button>
                <button onClick={() => setEditName(false)} className="btn-secondary py-2 px-3 text-sm">
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{profile?.display_name ?? 'Kein Name'}</span>
                <button
                  onClick={() => setEditName(true)}
                  className="text-brand-400 hover:text-brand-300 text-sm"
                >
                  ✏️
                </button>
              </div>
            )}
            <div className="text-white/40 text-xs mt-1">
              Mitglied seit {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('de-DE') : '—'}
            </div>
          </div>
        </div>
      </section>

      {/* Datenschutz-Einstellungen */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-lg">Datenschutz-Einstellungen</h2>
        <p className="text-white/40 text-sm">
          Gemäß DSGVO Art. 7 kannst du deine Einwilligungen jederzeit widerrufen.
        </p>

        <div className="space-y-3">
          {CONSENT_PURPOSES.map((purpose) => {
            const currentConsent = consents?.consents[purpose.key]
            const granted = currentConsent?.granted ?? (purpose.required ? true : false)

            return (
              <div
                key={purpose.key}
                className={`flex items-center gap-4 py-2 ${!purpose.required ? 'cursor-pointer' : ''}`}
                onClick={() => handleConsentToggle(purpose.key, granted, purpose.required)}
              >
                <div
                  className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    granted ? 'bg-brand-600' : 'bg-white/20'
                  } ${purpose.required ? 'opacity-60' : ''}`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      granted ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{purpose.label}</div>
                  {purpose.required && (
                    <div className="text-xs text-white/30">Notwendig — nicht deaktivierbar</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* DSGVO-Rechte */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-lg">Deine DSGVO-Rechte</h2>

        <button onClick={handleExportRequest} className="btn-secondary w-full text-left flex items-center gap-3">
          <span className="text-xl">📦</span>
          <div>
            <div className="font-medium">Daten exportieren (Art. 20)</div>
            <div className="text-white/40 text-xs">JSON-Download aller deiner Daten</div>
          </div>
        </button>

        <button
          onClick={handleDeleteRequest}
          className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors text-left"
        >
          <span className="text-xl">🗑️</span>
          <div>
            <div className="font-medium text-red-400">Konto löschen (Art. 17)</div>
            <div className="text-white/40 text-xs">Löschanfrage stellen — 30 Tage Frist</div>
          </div>
        </button>
      </section>

      {/* Sign Out */}
      <button onClick={handleSignOut} className="btn-secondary w-full">
        Abmelden
      </button>
    </div>
  )
}
