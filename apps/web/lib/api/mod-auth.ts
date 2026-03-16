import { apiPost } from './client'

interface ConsentEntry {
  key: string
  granted: boolean
}

interface ConsentSaveResult {
  consents_saved: number
}

export const authApi = {
  saveConsent: (purposes: ConsentEntry[]) =>
    apiPost<ConsentSaveResult>('/mod-auth/consent', { purposes }),

  logout: () => apiPost<{ message: string }>('/mod-auth/logout'),
}
