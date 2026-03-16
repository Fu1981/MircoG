import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { user: null, error: 'no_token' }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return { user, error: error?.message ?? null }
}
