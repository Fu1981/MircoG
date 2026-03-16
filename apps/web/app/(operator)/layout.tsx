import Link from 'next/link'

const OP_NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/campaigns', label: 'Kampagnen' },
]

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#0a0a0f] border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-6">
          <span className="text-xl font-bold text-brand-400">Screenway Operator</span>
          <nav className="flex gap-4">
            {OP_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-white/60 hover:text-white text-sm font-medium transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">{children}</main>
    </div>
  )
}
