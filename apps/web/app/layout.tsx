import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Screenway — Loyalty & Games',
  description: 'Deine Loyalty-Plattform für Spielhallen, Wettbüros und Gastronomie.',
  keywords: ['loyalty', 'gamification', 'punkte', 'spielhalle'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-[#0a0a0f] text-white antialiased">
        {children}
      </body>
    </html>
  )
}
