import React, { useState } from 'react'
import { Plus, Search, SlidersHorizontal, X, Wallet, ChevronDown } from 'lucide-react'
import { useLedgerStore } from '../../store/useLedgerStore.js'
import SummaryCards from './SummaryCards.jsx'
import TransactionList from './TransactionList.jsx'
import TransactionDetailSheet from './TransactionDetailSheet.jsx'
import AddTransactionModal from './AddTransactionModal.jsx'
import FilterPanel from './FilterPanel.jsx'
import { format } from 'date-fns'

const TYPE_PILLS = [
  { label: 'All', value: 'all' },
  { label: 'Income', value: 'income' },
  { label: 'Expense', value: 'expense' },
  { label: 'Transfer', value: 'transfer' },
]

const DATE_PILLS = [
  { label: 'This month', key: 'this_month' },
  { label: 'Last month', key: 'last_month' },
  { label: 'Last 7 days', key: 'last_7' },
]

function getDateRange(key) {
  const now = new Date()
  if (key === 'this_month') {
    return {
      from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`,
      to: now.toISOString().split('T')[0],
    }
  }
  if (key === 'last_month') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lme = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: lm.toISOString().split('T')[0], to: lme.toISOString().split('T')[0] }
  }
  if (key === 'last_7') {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return { from: d.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }
  }
  return { from: '', to: '' }
}

export default function LedgerPage() {
  const setActiveModal = useLedgerStore((s) => s.setActiveModal)
  const activeModal = useLedgerStore((s) => s.activeModal)
  const filters = useLedgerStore((s) => s.filters)
  const setFilter = useLedgerStore((s) => s.setFilter)
  const resetFilters = useLedgerStore((s) => s.resetFilters)
  const setFilterPanelOpen = useLedgerStore((s) => s.setFilterPanelOpen)
  const apiKey = useLedgerStore((s) => s.apiKey)
  const setApiKey = useLedgerStore((s) => s.setApiKey)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [activeDatePill, setActiveDatePill] = useState(null)
  const [apiKeyDraft, setApiKeyDraft] = useState(apiKey)

  const hasActiveFilters = filters.type !== 'all' || filters.status !== 'all' ||
    filters.from_date || filters.to_date || filters.account_ids.length > 0 ||
    filters.category_ids.length > 0 || filters.q || filters.min_amount || filters.max_amount

  const handleDatePill = (key) => {
    if (activeDatePill === key) {
      setActiveDatePill(null)
      setFilter('from_date', ''); setFilter('to_date', '')
    } else {
      setActiveDatePill(key)
      const { from, to } = getDateRange(key)
      setFilter('from_date', from); setFilter('to_date', to)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Top nav */}
      <header className="sticky top-0 z-30 glass border-b border-[#1E2D4A]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Wallet size={16} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="font-display font-bold text-slate-100 text-sm leading-none">Transaction Ledger</h1>
              <p className="text-[11px] text-slate-500 mt-0.5">{format(new Date(), 'MMMM yyyy')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-[#1E2D4A] rounded-lg hover:border-indigo-500/40 transition-colors"
              title="Set Anthropic API key for AI features"
            >
              {apiKey ? '⚡ AI On' : '⚡ AI Off'}
            </button>
            <button
              onClick={() => setActiveModal('add')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white text-sm font-medium transition-colors"
              aria-label="Add transaction"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>
        </div>

        {/* API Key input */}
        {showApiKeyInput && (
          <div className="border-t border-[#1E2D4A] px-4 py-3 bg-navy-800/90">
            <div className="max-w-4xl mx-auto flex gap-2 items-center">
              <span className="text-xs text-slate-400 flex-shrink-0">Anthropic API Key</span>
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                placeholder="sk-ant-…"
                className="flex-1 bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button onClick={() => { setApiKey(apiKeyDraft); setShowApiKeyInput(false) }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-medium transition-colors">
                Save
              </button>
              <p className="text-xs text-slate-500 hidden md:block">Used for AI categorisation in browser — not stored on any server.</p>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Summary Cards */}
        <SummaryCards />

        {/* Search + Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="Search by merchant, amount, note…"
              className="w-full bg-navy-700 border border-[#1E2D4A] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
            {filters.q && (
              <button onClick={() => setFilter('q', '')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setFilterPanelOpen(true)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${hasActiveFilters ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400' : 'bg-navy-700 border-[#1E2D4A] text-slate-400 hover:border-indigo-500/40 hover:text-indigo-400'}`}
            aria-label="Open filters"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {TYPE_PILLS.map((p) => (
            <button key={p.value} onClick={() => setFilter('type', p.value)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${filters.type === p.value
                ? p.value === 'income' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                : p.value === 'expense' ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40'
                : p.value === 'transfer' ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40'
                : 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                : 'bg-navy-700 text-slate-400 border border-[#1E2D4A] hover:bg-navy-600'}`}>
              {p.label}
            </button>
          ))}
          <div className="w-px bg-[#1E2D4A] flex-shrink-0 mx-1" />
          {DATE_PILLS.map((p) => (
            <button key={p.key} onClick={() => handleDatePill(p.key)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${activeDatePill === p.key
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                : 'bg-navy-700 text-slate-400 border border-[#1E2D4A] hover:bg-navy-600'}`}>
              {p.label}
            </button>
          ))}
          {hasActiveFilters && (
            <button onClick={() => { resetFilters(); setActiveDatePill(null) }}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors">
              <X size={10} /> Clear
            </button>
          )}
        </div>

        {/* Transaction List */}
        <TransactionList />
      </main>

      {/* Modals & Sheets */}
      {activeModal === 'add' && <AddTransactionModal />}
      <TransactionDetailSheet />
      <FilterPanel />
    </div>
  )
}
