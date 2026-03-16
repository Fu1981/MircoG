'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ModuleKey =
  | 'mod_auth'
  | 'mod_identity'
  | 'mod_wallet'
  | 'mod_games'
  | 'mod_leaderboard'
  | 'mod_loyalty'
  | 'mod_push'
  | 'mod_dsgvo'

type ModuleConfigMap = Partial<Record<ModuleKey, boolean>>

// Bekannte Module — werden als deaktiviert angezeigt wenn nicht geladen
const DEFAULT_CONFIG: ModuleConfigMap = {
  mod_auth: true,
  mod_identity: true,
  mod_wallet: true,
  mod_games: true,
  mod_leaderboard: true,
  mod_loyalty: false,
  mod_push: false,
  mod_dsgvo: true,
}

export function useModuleConfig() {
  const [config, setConfig] = useState<ModuleConfigMap>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // module_config ist nur via Service Role lesbar — wir verwenden Default-Werte im Frontend
    // und verlassen uns auf die Edge Functions für den echten Status
    setConfig(DEFAULT_CONFIG)
    setLoading(false)
  }, [])

  const isActive = (key: ModuleKey): boolean => config[key] ?? false

  return { config, loading, isActive }
}
