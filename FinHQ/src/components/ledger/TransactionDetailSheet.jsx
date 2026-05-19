import React from 'react'
import { X, Copy, Ban, Trash2, Edit3, Tag, ChevronDown } from 'lucide-react'
import { useLedgerStore } from '../../store/useLedgerStore.js'
import { formatCurrency } from '../../utils/formatCurrency.js'
import { format, parseISO } from 'date-fns'

export default function TransactionDetailSheet() {
  const selectedTxnId = useLedgerStore((s) => s.selectedTxnId)
  const setSelectedTxnId = useLedgerStore((s) => s.setSelectedTxnId)
  const transactions = useLedgerStore((s) => s.transactions)
  const categories = useLedgerStore((s) => s.categories)
  const accounts = useLedgerStore((s) => s.accounts)
  const voidTransaction = useLedgerStore((s) => s.voidTransaction)
  const deleteTransaction = useLedgerStore((s) => s.deleteTransaction)
  const duplicateTransaction = useLedgerStore((s) => s.duplicateTransaction)

  const txn = transactions.find((t) => t.id === selectedTxnId)
  if (!selectedTxnId || !txn) return null

  const category = categories.find((c) => c.id === txn.category_id)
  const account = accounts.find((a) => a.id === txn.account_id)
  const isIncome = txn.display_type === 'income'
  const isExpense = txn.display_type === 'expense'
  const amountColor = isIncome ? 'text-emerald-400' : isExpense ? 'text-rose-400' : 'text-sky-400'

  const handleDelete = () => {
    if (confirm('Delete this transaction? This cannot be undone.')) {
      deleteTransaction(txn.id)
      setSelectedTxnId(null)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
        onClick={() => setSelectedTxnId(null)}
      />

      {/* Panel - bottom sheet on mobile, right panel on desktop */}
      <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-0 md:left-auto md:right-0 md:h-full md:w-[420px] z-50 animate-slide-up md:animate-slide-right">
        <div className="h-full bg-navy-800 border-t md:border-t-0 md:border-l border-[#1E2D4A] rounded-t-2xl md:rounded-none overflow-y-auto max-h-[90vh] md:max-h-full">
          {/* Handle (mobile) */}
          <div className="md:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-700" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D4A]">
            <span className="font-display font-semibold text-slate-200">Transaction Detail</span>
            <button onClick={() => setSelectedTxnId(null)} className="w-8 h-8 rounded-lg hover:bg-navy-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Amount hero */}
          <div className="px-5 py-6 text-center border-b border-[#1E2D4A]">
            <div className={`font-mono text-4xl font-bold mb-1 ${amountColor}`}>
              {isIncome ? '+' : isExpense ? '−' : '⇄'}{formatCurrency(Math.abs(txn.display_amount))}
            </div>
            <h2 className="text-slate-300 font-medium mt-2">{txn.title}</h2>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isIncome ? 'badge-income' : isExpense ? 'badge-expense' : 'badge-transfer'}`}>
                {txn.display_type}
              </span>
              {txn.status === 'pending' && <span className="badge-pending text-xs px-2.5 py-1 rounded-full font-medium">Pending</span>}
              {txn.status === 'void' && <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-700 text-slate-400">Void</span>}
            </div>
          </div>

          {/* Details */}
          <div className="px-5 py-4 space-y-4">
            <Row label="Date" value={format(parseISO(txn.txn_date), 'dd MMMM yyyy') + (txn.txn_time ? ' · ' + txn.txn_time.slice(0,5) : '')} />
            <Row
              label="Category"
              value={
                <span className="flex items-center gap-1.5">
                  {category ? <><span>{category.icon}</span><span>{category.name}</span></> : <span className="text-slate-500">Uncategorised</span>}
                </span>
              }
            />
            <Row label="Account" value={account?.name || '—'} />
            <Row label="Source" value={<span className="capitalize">{txn.source}</span>} />
            {txn.note && <Row label="Note" value={txn.note} />}

            {/* Tags */}
            {txn.tags?.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Tags</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {txn.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-300">
                      <Tag size={9} />{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Entries (double-entry view) */}
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider">Journal Entries</span>
              <div className="mt-2 card overflow-hidden">
                {txn.entries?.map((e, i) => (
                  <div key={e.id || i} className={`flex items-center justify-between px-3 py-2.5 text-sm ${i > 0 ? 'border-t border-[#1E2D4A]/60' : ''}`}>
                    <span className="text-slate-400 truncate">{e.account_name}</span>
                    <span className={`font-mono text-xs font-medium ml-3 flex-shrink-0 ${e.direction === 'debit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {e.direction === 'debit' ? 'DR' : 'CR'} {formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 pb-6 pt-2 grid grid-cols-2 gap-2">
            <button
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy-700 hover:bg-navy-600 text-slate-300 hover:text-white text-sm font-medium transition-colors"
              onClick={() => { duplicateTransaction(txn.id); setSelectedTxnId(null) }}
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium transition-colors"
              onClick={() => { voidTransaction(txn.id) }}
            >
              <Ban size={14} /> Void
            </button>
            <button
              className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-sm font-medium transition-colors"
              onClick={handleDelete}
            >
              <Trash2 size={14} /> Delete Transaction
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-500 uppercase tracking-wider flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-200 text-right">{value}</span>
    </div>
  )
}
