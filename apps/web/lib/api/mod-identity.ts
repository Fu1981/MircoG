import { apiGet, apiPatch, apiDelete } from './client'

export interface PlayerProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  phone: string | null
  status: 'active' | 'suspended' | 'banned'
  created_at: string
  wallet: {
    balance: number
    lifetime_earned: number
    lifetime_spent: number
  } | null
}

export const identityApi = {
  getMe: () => apiGet<PlayerProfile>('/mod-identity/me'),

  updateMe: (updates: { display_name?: string; avatar_url?: string }) =>
    apiPatch<{ updated: boolean }>('/mod-identity/me', updates),

  requestDeletion: (reason?: string) =>
    apiDelete<{ deletion_requested: boolean }>('/mod-identity/me', { reason }),
}
