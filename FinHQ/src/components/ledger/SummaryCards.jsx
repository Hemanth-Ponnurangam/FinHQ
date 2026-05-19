import React from 'react'
import { TrendingUp, TrendingDown, Wallet, Hash } from 'lucide-react'
import { useLedgerStore } from '../../store/useLedgerStore.js'
import { formatCurrency, formatCompact } from '../../utils/formatCurrency.js'

function StatCard({ label, value, icon: Icon, color, subtext }) {
  return (
    <div className="card p-4 flex-shrink-0 min-w-[160px] flex-1">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={14} />
        </div>
      </div>
      <div className={`font-mono text-xl font-semibold ${color.includes('emerald') ? 'text-emerald-400' : color.includes('rose') ? 'text-rose-400' : color.includes('sky') ? 'text-sky-400' : 'text-slate-200'}`}>
        {typeof value === 'number' ? formatCompact(Math.abs(value)) : value}
      </div>
      {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
    </div>
  )
}

export default function SummaryCards() {
  const getSummary = useLedgerStore((s) => s.getSummary)
  const summary = getSummary()

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Income"
        value={summary.total_income}
        icon={TrendingUp}
        color="bg-emerald-500/10 text-emerald-400"
        subtext="This period"
      />
      <StatCard
        label="Expenses"
        value={summary.total_expense}
        icon={TrendingDown}
        color="bg-rose-500/10 text-rose-400"
        subtext="This period"
      />
      <StatCard
        label="Net Savings"
        value={summary.net}
        icon={Wallet}
        color={summary.net >= 0 ? 'bg-sky-500/10 text-sky-400' : 'bg-rose-500/10 text-rose-400'}
        subtext={summary.net >= 0 ? 'Positive balance' : 'Deficit'}
      />
      <StatCard
        label="Transactions"
        value={summary.txn_count.toString()}
        icon={Hash}
        color="bg-indigo-500/10 text-indigo-400"
        subtext="Total entries"
      />
    </div>
  )
}
