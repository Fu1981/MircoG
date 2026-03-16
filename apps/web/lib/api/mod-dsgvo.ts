import { apiGet, apiPost } from './client'

export interface ConsentState {
  consents: Record<string, { granted: boolean; version: string; created_at: string }>
  version: string
}

export const dsgvoApi = {
  getConsent: () => apiGet<ConsentState>('/mod-dsgvo/consent'),

  updateConsent: (purpose: string, granted: boolean) =>
    apiPost<{ purpose: string; granted: boolean }>('/mod-dsgvo/consent', { purpose, granted }),

  requestExport: () =>
    apiPost<{ export_id: string; status: string; message: string }>('/mod-dsgvo/export'),

  requestDeletion: (reason?: string) =>
    apiPost<{ request_id: string; status: string; message: string }>('/mod-dsgvo/delete', { reason }),
}
