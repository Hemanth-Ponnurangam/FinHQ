import { useState } from 'react'
import { useStore } from '../store/useStore'

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export default function Ledger() {
  const { transactions, categories, accounts, deleteTransaction } = useStore()
  const [filter, setFilter] = useState('all')

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const accMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  const filtered = [...transactions]
    .filter((t) => filter === 'all' || t.type === filter)
    .sort((a, b) => new Date(b.txnDate) - new Date(a.txnDate))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-forest-900">Ledger</h1>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-forest-50 p-1 rounded-lg text-sm">
          {['all', 'income', 'expense', 'transfer'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md capitalize transition-colors ${
                filter === f ? 'bg-white shadow-card text-forest-900' : 'text-forest-400 hover:text-forest-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-forest-400 uppercase tracking-wider border-b border-forest-50">
              <th className="text-left px-5 py-3">Date</th>
              <th className="text-left px-5 py-3">Title</th>
              <th className="text-left px-5 py-3">Category</th>
              <th className="text-left px-5 py-3">Account</th>
              <th className="text-right px-5 py-3">Amount</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-forest-50">
            {filtered.map((txn) => {
              const cat = catMap[txn.categoryId]
              const acc = accMap[txn.fromAccountId ?? txn.toAccountId]
              const isIncome = txn.type === 'income'
              return (
                <tr key={txn.id} className="hover:bg-forest-50/50 transition-colors">
                  <td className="px-5 py-3 text-forest-400 whitespace-nowrap">{txn.txnDate}</td>
                  <td className="px-5 py-3 font-medium text-forest-900">{txn.title}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat?.color ?? '#999' }} />
                      {cat?.name ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-forest-500">{acc?.name ?? '—'}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${
                    isIncome ? 'text-forest-600' : txn.type === 'transfer' ? 'text-forest-400' : 'text-red-500'
                  }`}>
                    {isIncome ? '+' : txn.type === 'transfer' ? '↔ ' : '−'}{fmt(txn.amount)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => deleteTransaction(txn.id)}
                      className="text-forest-200 hover:text-red-400 transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-forest-300">
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
