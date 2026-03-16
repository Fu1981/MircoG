'use client'

import { useEffect, useState, useCallback } from 'react'
import { walletApi } from '@/lib/api/mod-wallet'

interface WalletBalance {
  balance: number
  lifetime_earned: number
  lifetime_spent: number
  updated_at: string
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await walletApi.getBalance()
      setWallet(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wallet')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { wallet, loading, error, refresh }
}
