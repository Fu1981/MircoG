import { apiGet, apiPost } from './client'

export interface WalletBalance {
  balance: number
  lifetime_earned: number
  lifetime_spent: number
  updated_at: string
}

export interface WalletTransaction {
  id: string
  wallet_id: string
  amount: number
  type: string
  ref_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface TransactionPage {
  transactions: WalletTransaction[]
  pagination: { page: number; limit: number; total: number }
}

export const walletApi = {
  getBalance: () => apiGet<WalletBalance>('/mod-wallet/balance'),

  getTransactions: (page = 1, limit = 20) =>
    apiGet<TransactionPage>(`/mod-wallet/transactions?page=${page}&limit=${limit}`),

  earn: (amount: number, type: string, metadata?: Record<string, unknown>) =>
    apiPost<{ credited: number; new_balance: number }>('/mod-wallet/earn', { amount, type, metadata }),

  spend: (amount: number, metadata?: Record<string, unknown>) =>
    apiPost<{ spent: number; new_balance: number }>('/mod-wallet/spend', { amount, metadata }),
}
