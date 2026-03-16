import Link from 'next/link'

const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: '🏠' },
  { href: '/wallet', label: 'Wallet', icon: '💰' },
  { href: '/games', label: 'Games', icon: '🎮' },
  { href: '/leaderboard', label: 'Rangliste', icon: '🏆' },
  { href: '/account', label: 'Konto', icon: '👤' },
]

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/home" className="text-xl font-bold text-brand-400">
            Screenway
          </Link>
          <Link href="/account" className="text-white/60 hover:text-white transition-colors">
            <span className="text-2xl">👤</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">{children}</main>

      {/* Bottom Navigation */}
      <nav className="sticky bottom-0 bg-[#0a0a0f]/90 backdrop-blur-md border-t border-white/10">
        <div className="max-w-2xl mx-auto px-2 flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center py-3 gap-1 text-white/50 hover:text-white transition-colors"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
