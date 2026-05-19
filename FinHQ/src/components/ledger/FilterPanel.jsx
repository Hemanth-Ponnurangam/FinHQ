import React from 'react'
import { X, RotateCcw } from 'lucide-react'
import { useLedgerStore } from '../../store/useLedgerStore.js'

export default function FilterPanel() {
  const filterPanelOpen = useLedgerStore((s) => s.filterPanelOpen)
  const setFilterPanelOpen = useLedgerStore((s) => s.setFilterPanelOpen)
  const filters = useLedgerStore((s) => s.filters)
  const setFilter = useLedgerStore((s) => s.setFilter)
  const resetFilters = useLedgerStore((s) => s.resetFilters)
  const accounts = useLedgerStore((s) => s.accounts)
  const categories = useLedgerStore((s) => s.categories)

  if (!filterPanelOpen) return null

  const parentCategories = categories.filter((c) => !c.parent_id && c.type === 'expense')

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setFilterPanelOpen(false)} />
      <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-0 md:left-auto md:right-0 md:h-full md:w-[360px] z-50 animate-slide-up md:animate-slide-right">
        <div className="bg-navy-800 border-t md:border-t-0 md:border-l border-[#1E2D4A] rounded-t-2xl md:rounded-none overflow-y-auto max-h-[90vh] md:max-h-full">
          <div className="md:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-700" />
          </div>

          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D4A]">
            <span className="font-display font-semibold text-slate-200">Filters</span>
            <div className="flex items-center gap-2">
              <button onClick={resetFilters} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                <RotateCcw size={12} /> Reset
              </button>
              <button onClick={() => setFilterPanelOpen(false)} className="w-8 h-8 rounded-lg hover:bg-navy-700 flex items-center justify-center text-slate-400">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="px-5 py-5 space-y-6">
            {/* Date Range */}
            <Section label="Date Range">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">From</label>
                  <input type="date" value={filters.from_date} onChange={(e) => setFilter('from_date', e.target.value)}
                    className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">To</label>
                  <input type="date" value={filters.to_date} onChange={(e) => setFilter('to_date', e.target.value)}
                    className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                {['This month', 'Last month', 'Last 7 days'].map((label) => (
                  <button key={label} onClick={() => {
                    const now = new Date()
                    if (label === 'This month') {
                      setFilter('from_date', `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`)
                      setFilter('to_date', now.toISOString().split('T')[0])
                    } else if (label === 'Last month') {
                      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                      const lme = new Date(now.getFullYear(), now.getMonth(), 0)
                      setFilter('from_date', lm.toISOString().split('T')[0])
                      setFilter('to_date', lme.toISOString().split('T')[0])
                    } else {
                      const d = new Date(); d.setDate(d.getDate() - 7)
                      setFilter('from_date', d.toISOString().split('T')[0])
                      setFilter('to_date', now.toISOString().split('T')[0])
                    }
                  }}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-navy-700 hover:bg-indigo-500/20 hover:text-indigo-300 text-slate-400 transition-colors border border-[#1E2D4A]"
                  >{label}</button>
                ))}
              </div>
            </Section>

            {/* Type */}
            <Section label="Type">
              <div className="grid grid-cols-4 gap-1">
                {['all', 'income', 'expense', 'transfer'].map((t) => (
                  <button key={t} onClick={() => setFilter('type', t)}
                    className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${filters.type === t ? 'bg-indigo-600 text-white' : 'bg-navy-700 text-slate-400 hover:bg-navy-600'}`}
                  >{t}</button>
                ))}
              </div>
            </Section>

            {/* Status */}
            <Section label="Status">
              <div className="grid grid-cols-3 gap-1">
                {['all', 'cleared', 'pending'].map((s) => (
                  <button key={s} onClick={() => setFilter('status', s)}
                    className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${filters.status === s ? 'bg-indigo-600 text-white' : 'bg-navy-700 text-slate-400 hover:bg-navy-600'}`}
                  >{s}</button>
                ))}
              </div>
            </Section>

            {/* Accounts */}
            <Section label="Accounts">
              <div className="space-y-1">
                {accounts.filter(a => a.is_active).map((a) => {
                  const selected = filters.account_ids.includes(a.id)
                  return (
                    <button key={a.id} onClick={() => setFilter('account_ids', selected ? filters.account_ids.filter(x => x !== a.id) : [...filters.account_ids, a.id])}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${selected ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300' : 'bg-navy-700 text-slate-400 hover:bg-navy-600 border border-transparent'}`}
                    >
                      <span>{a.icon}</span><span className="truncate">{a.name}</span>
                      {selected && <span className="ml-auto text-indigo-400">✓</span>}
                    </button>
                  )
                })}
              </div>
            </Section>

            {/* Amount Range */}
            <Section label="Amount Range">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Min (₹)</label>
                  <input type="number" value={filters.min_amount} onChange={(e) => setFilter('min_amount', e.target.value)}
                    placeholder="0" className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Max (₹)</label>
                  <input type="number" value={filters.max_amount} onChange={(e) => setFilter('max_amount', e.target.value)}
                    placeholder="Any" className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
            </Section>
          </div>

          <div className="px-5 pb-6">
            <button onClick={() => setFilterPanelOpen(false)}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors">
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function Section({ label, children }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">{label}</div>
      {children}
    </div>
  )
}
