import { createServiceClient } from './supabase.ts'
import { corsHeaders } from './cors.ts'

export async function assertModuleActive(moduleKey: string): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('module_config')
    .select('active')
    .eq('module_key', moduleKey)
    .single()
  if (!data?.active) throw new Error(`module_disabled:${moduleKey}`)
}

export const moduleDisabledResponse = () =>
  new Response(
    JSON.stringify({
      error: 'module_disabled',
      message: 'This feature is currently unavailable',
      code: 503,
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  )
