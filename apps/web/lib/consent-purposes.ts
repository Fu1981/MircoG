export const CONSENT_PURPOSES = [
  {
    key: 'essential',
    label: 'Notwendige Funktionen',
    description:
      'Login, Wallet, Spielbetrieb. Ohne diese Einwilligung kann Screenway nicht genutzt werden.',
    required: true,
  },
  {
    key: 'analytics',
    label: 'Nutzungsanalyse',
    description:
      'Anonymisierte Auswertung, wie Funktionen genutzt werden. Hilft uns, Screenway zu verbessern.',
    required: false,
  },
  {
    key: 'marketing',
    label: 'Personalisierte Angebote',
    description: 'Bonuspunkte-Aktionen und Angebote passend zu deiner Nutzung.',
    required: false,
  },
  {
    key: 'push_notifications',
    label: 'Push-Benachrichtigungen',
    description: 'Benachrichtigungen über neue Aktionen — jederzeit widerrufbar.',
    required: false,
  },
] as const

export type ConsentPurposeKey = (typeof CONSENT_PURPOSES)[number]['key']
