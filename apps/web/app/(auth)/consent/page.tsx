'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CONSENT_PURPOSES } from '@/lib/consent-purposes'
import { authApi } from '@/lib/api/mod-auth'

export default function ConsentPage() {
  const router = useRouter()
  const [consents, setConsents] = useState<Record<string, boolean>>({
    essential: true, // immer true, nicht änderbar
    analytics: false,
    marketing: false,
    push_notifications: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = (key: string, required: boolean) => {
    if (required) return // Essential kann nicht deaktiviert werden
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const purposes = Object.entries(consents).map(([key, granted]) => ({ key, granted }))
      await authApi.saveConsent(purposes)
      router.push('/home')
    } catch {
      setError('Einwilligungen konnten nicht gespeichert werden. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Datenschutz-Einstellungen</h1>
          <p className="text-white/60">
            Bitte wähle, welche Datenverarbeitungen du erlaubst. Du kannst diese Einstellungen
            jederzeit in deinem Konto ändern.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {CONSENT_PURPOSES.map((purpose) => (
            <div
              key={purpose.key}
              className={`card flex items-start gap-4 cursor-pointer transition-colors ${
                purpose.required ? 'opacity-90' : 'hover:bg-white/10'
              }`}
              onClick={() => handleToggle(purpose.key, purpose.required)}
            >
              <div className="mt-0.5 flex-shrink-0">
                <div
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                    consents[purpose.key]
                      ? 'bg-brand-600 border-brand-600'
                      : 'border-white/30 bg-transparent'
                  } ${purpose.required ? 'opacity-70' : ''}`}
                >
                  {consents[purpose.key] && (
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{purpose.label}</h3>
                  {purpose.required && (
                    <span className="text-xs bg-brand-600/30 text-brand-300 px-2 py-0.5 rounded-full">
                      Pflicht
                    </span>
                  )}
                </div>
                <p className="text-white/50 text-sm leading-relaxed">{purpose.description}</p>
              </div>
            </div>
          ))}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Speichere...' : 'Einwilligungen speichern & fortfahren'}
          </button>

          <p className="text-white/30 text-xs text-center">
            Datenschutzerklärung Version 2024-01. Deine Einwilligungen werden DSGVO-konform
            gespeichert und können jederzeit widerrufen werden.
          </p>
        </form>
      </div>
    </main>
  )
}
