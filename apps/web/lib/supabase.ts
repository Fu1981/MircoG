import { createBrowserClient } from '@supabase/ssr'

// Singleton Supabase Browser Client
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
