import { LayoutDashboard, BookText, Wallet, Menu } from 'lucide-react'
import { useState } from 'react'

const nav = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Ledger', icon: BookText, active: false },
  { label: 'Accounts', icon: Wallet, active: false },
]

export default function Layout({ children }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-cream font-body text-forest-900 flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-forest-50">
        <div className="font-display text-2xl font-semibold tracking-tight">
          Fin<span className="text-gold">HQ</span>
        </div>
        <button onClick={() => setIsOpen(!isOpen)} className="text-forest-900">
          <Menu size={24} />
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`w-full md:w-60 shrink-0 border-r border-forest-50 bg-white flex-col py-8 px-4 gap-2 ${isOpen ? 'flex' : 'hidden md:flex'}`}>
        <div className="hidden md:block mb-10 px-4">
          <div className="font-display text-3xl font-semibold tracking-tight">
            Fin<span className="text-gold">HQ</span>
          </div>
          <p className="text-xs text-forest-400 mt-1">Lifelong Finance</p>
        </div>

        {nav.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              active ? 'bg-forest-50 text-forest-800' : 'text-forest-500 hover:bg-forest-50 hover:text-forest-800'
            }`}
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </button>
        ))}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 md:p-10">
        {children}
      </main>
    </div>
  )
}
