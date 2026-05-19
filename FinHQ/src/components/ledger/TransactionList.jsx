import React from 'react'
import { useLedgerStore } from '../../store/useLedgerStore.js'
import TransactionRow from './TransactionRow.jsx'
import { formatCurrency } from '../../utils/formatCurrency.js'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { SearchX } from 'lucide-react'

function groupByDate(transactions) {
  const groups = {}
  transactions.forEach((t) => {
    if (!groups[t.txn_date]) groups[t.txn_date] = []
    groups[t.txn_date].push(t)
  })
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
}

function formatDateLabel(dateStr) {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'dd MMM, EEE')
}

function DayNet({ txns }) {
  const net = txns.reduce((s, t) => {
    if (t.status === 'void') return s
    return s + t.display_amount
  }, 0)
  return (
    <span className={`text-xs font-mono font-medium ${net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
      {net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(net))}
    </span>
  )
}

export default function TransactionList() {
  const getFilteredTransactions = useLedgerStore((s) => s.getFilteredTransactions)
  const txns = getFilteredTransactions()
  const groups = groupByDate(txns)

  if (txns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-navy-700 flex items-center justify-center mb-4">
          <SearchX size={24} className="text-slate-500" />
        </div>
        <p className="text-slate-400 font-medium">No transactions match</p>
        <p className="text-slate-600 text-sm mt-1">Try clearing filters or add a new transaction</p>
      </div>
    )
  }

  return (
    <div role="list" className="space-y-1">
      {groups.map(([date, dayTxns]) => (
        <div key={date} className="mb-2">
          <div className="flex items-center justify-between px-2 py-2 mb-1">
            <span className="text-xs font-display font-semibold text-slate-400 uppercase tracking-wider">
              {formatDateLabel(date)}
            </span>
            <DayNet txns={dayTxns} />
          </div>
          <div className="card overflow-hidden">
            {dayTxns.map((txn, i) => (
              <React.Fragment key={txn.id}>
                {i > 0 && <div className="border-t border-[#1E2D4A]/60 mx-4" />}
                <TransactionRow txn={txn} />
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
