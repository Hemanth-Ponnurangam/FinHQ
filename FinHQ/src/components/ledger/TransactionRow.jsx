import React, { useState } from 'react'
import { Clock, Smartphone, RefreshCw, Copy, Ban, Trash2, Edit3 } from 'lucide-react'
import { useLedgerStore } from '../../store/useLedgerStore.js'
import { formatCurrency } from '../../utils/formatCurrency.js'

export default function TransactionRow({ txn }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const setSelectedTxnId = useLedgerStore((s) => s.setSelectedTxnId)
  const categories = useLedgerStore((s) => s.categories)
  const accounts = useLedgerStore((s) => s.accounts)
  const voidTransaction = useLedgerStore((s) => s.voidTransaction)
  const deleteTransaction = useLedgerStore((s) => s.deleteTransaction)
  const duplicateTransaction = useLedgerStore((s) => s.duplicateTransaction)

  const category = categories.find((c) => c.id === txn.category_id)
  const account = accounts.find((a) => a.id === txn.account_id)
  const isExpense = txn.display_type === 'expense'
  const isIncome = txn.display_type === 'income'
  const isVoid = txn.status === 'void'
  const isPending = txn.status === 'pending'

  const amountClass = isIncome ? 'text-emerald-400' : isExpense ? 'text-rose-400' : 'text-sky-400'
  const amountPrefix = isIncome ? '+' : isExpense ? '−' : '⇄'

  return (
    <div
      role="listitem"
      className={`group relative flex items-center gap-3 px-4 py-3 hover:bg-navy-700/50 transition-colors cursor-pointer rounded-lg ${isVoid ? 'opacity-40' : ''}`}
      onClick={() => setSelectedTxnId(txn.id)}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true) }}
    >
      {/* Category icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 font-display"
        style={{ background: (category?.color || '#374151') + '22', border: `1px solid ${(category?.color || '#374151')}33` }}
      >
        {category?.icon || '📦'}
      </div>

      {/* Middle: title + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-100 truncate">{txn.title}</span>
          {isPending && <Clock size={11} className="text-amber-400 flex-shrink-0" />}
          {txn.source === 'sms' && <Smartphone size={11} className="text-indigo-400 flex-shrink-0" />}
          {txn.source === 'import' && <RefreshCw size={11} className="text-sky-400 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 truncate">
          <span>{category?.name || 'Uncategorised'}</span>
          {account && <><span>·</span><span>{account.name}</span></>}
          {isPending && <span className="badge-pending px-1.5 py-0.5 rounded text-[10px]">Pending</span>}
          {isVoid && <span className="text-slate-600 text-[10px]">Void</span>}
        </div>
      </div>

      {/* Amount + time */}
      <div className="text-right flex-shrink-0">
        <div className={`font-mono text-sm font-semibold ${amountClass}`}>
          {amountPrefix}{formatCurrency(Math.abs(txn.display_amount))}
        </div>
        {txn.txn_time && (
          <div className="text-[11px] text-slate-600 mt-0.5">
            {txn.txn_time.slice(0, 5)}
          </div>
        )}
      </div>

      {/* Context menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
        >
          <div
            className="absolute bg-navy-700 border border-[#1E2D4A] rounded-xl shadow-2xl py-1 min-w-[160px] z-50 animate-scale-in"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-navy-600 hover:text-white transition-colors" onClick={() => { setSelectedTxnId(txn.id); setMenuOpen(false) }}>
              <Edit3 size={14} /> Edit
            </button>
            <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-navy-600 hover:text-white transition-colors" onClick={() => { duplicateTransaction(txn.id); setMenuOpen(false) }}>
              <Copy size={14} /> Duplicate
            </button>
            <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-amber-400 hover:bg-navy-600 transition-colors" onClick={() => { voidTransaction(txn.id); setMenuOpen(false) }}>
              <Ban size={14} /> Void
            </button>
            <div className="border-t border-[#1E2D4A] my-1" />
            <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors" onClick={() => { if (confirm('Delete this transaction?')) { deleteTransaction(txn.id); setMenuOpen(false) } }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
