import { redirect } from 'next/navigation'

// Root: Weiterleitung zur Login-Seite
export default function RootPage() {
  redirect('/login')
}
