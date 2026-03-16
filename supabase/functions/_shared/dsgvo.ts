import { createServiceClient } from './supabase.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: {
    player_id?: string
    actor_id?: string
    action: string
    resource: string
    resource_id?: string
    metadata?: Record<string, unknown>
  }
) {
  await supabase.from('audit_log').insert(entry)
}

export async function hasConsent(playerId: string, purpose: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('consents')
    .select('granted')
    .eq('player_id', playerId)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data?.granted === true
}

export async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(ip))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
