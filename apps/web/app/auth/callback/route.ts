import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
      },
    }
  )

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Prüfen ob Consent bereits vorhanden
  const { data: consent } = await supabase
    .from('consents')
    .select('id')
    .eq('player_id', user.id)
    .limit(1)

  const redirectTo = consent?.length ? '/home' : '/consent'
  return NextResponse.redirect(new URL(redirectTo, request.url))
}
