import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BookText, Wallet } from 'lucide-react'

const nav = [
  { to: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ledger',   label: 'Ledger',    icon: BookText },
  { to: '/accounts', label: 'Accounts',  icon: Wallet },
]

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-cream">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-forest-100 bg-white flex flex-col py-6 px-4 gap-1">
        <div className="mb-8 px-2">
          <span className="font-display text-2xl font-semibold text-forest-900 tracking-tight">
            Fin<span className="text-gold">HQ</span>
          </span>
          <p className="text-xs text-forest-400 mt-0.5 font-body">Lifelong Finance</p>
        </div>

        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-forest-50 text-forest-800'
                  : 'text-forest-500 hover:bg-forest-50 hover:text-forest-800'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  )
}
