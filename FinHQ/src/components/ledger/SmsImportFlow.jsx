import React, { useState } from 'react'
import { X, Smartphone, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useLedgerStore } from '../../store/useLedgerStore.js'
import { parseSmsText } from '../../api/ai.js'
import { v4 as uuidv4 } from 'uuid'
import { formatCurrency } from '../../utils/formatCurrency.js'

export default function SmsImportFlow({ onClose }) {
  const [smsText, setSmsText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const apiKey = useLedgerStore((s) => s.apiKey)
  const categories = useLedgerStore((s) => s.categories)
  const accounts = useLedgerStore((s) => s.accounts)
  const addTransaction = useLedgerStore((s) => s.addTransaction)

  const handleParse = async () => {
    if (!smsText.trim()) return
    if (!apiKey) { setError('Add your Anthropic API key in Settings to use AI parsing'); return }
    setLoading(true)
    setError('')
    const result = await parseSmsText(smsText, apiKey)
    setLoading(false)
    if (result) {
      setParsed(result)
    } else {
      setError('Could not parse the SMS. Please try manually editing fields.')
      setParsed({
        title: 'Unknown Transaction',
        amount: 0,
        direction: 'debit',
        account_hint: null,
        txn_date: new Date().toISOString().split('T')[0],
        predicted_category: 'Other Expenses',
      })
    }
  }

  const handleSave = () => {
    if (!parsed) return
    const cat = categories.find((c) => c.name === parsed.predicted_category)
    const acc = accounts[0]
    const isExpense = parsed.direction === 'debit'

    addTransaction({
      title: parsed.title,
      note: null,
      txn_date: parsed.txn_date || new Date().toISOString().split('T')[0],
      txn_time: null,
      status: 'cleared',
      category_id: cat?.id || null,
      account_id: acc?.id,
      source: 'sms',
      raw_source: smsText,
      display_type: isExpense ? 'expense' : 'income',
      display_amount: isExpense ? -Math.abs(parsed.amount) : Math.abs(parsed.amount),
      tags: [],
      entries: [
        { id: uuidv4(), account_id: acc?.id, account_name: acc?.name, direction: isExpense ? 'credit' : 'debit', amount: Math.abs(parsed.amount), currency: 'INR' },
        { id: uuidv4(), account_id: cat?.id || 'unknown', account_name: cat?.name || parsed.predicted_category, direction: isExpense ? 'debit' : 'credit', amount: Math.abs(parsed.amount), currency: 'INR' },
      ],
    })
    setSaved(true)
    setTimeout(() => onClose(), 1200)
  }

  return (
    <div className="space-y-4">
      {!saved ? (
        <>
          <p className="text-sm text-slate-400">Paste your bank SMS below and AI will extract the transaction details automatically.</p>

          <textarea
            value={smsText}
            onChange={(e) => { setSmsText(e.target.value); setParsed(null) }}
            placeholder="INR 1,240.00 debited from A/c XX4821 on 19-05-26 at D-Mart. Avl Bal: INR 84,320.00"
            rows={4}
            className="w-full bg-navy-700 border border-[#1E2D4A] rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono resize-none"
          />

          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{error}
            </div>
          )}

          {!parsed ? (
            <button onClick={handleParse} disabled={!smsText.trim() || loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Parsing with AI…</> : <><Smartphone size={16} /> Parse SMS</>}
            </button>
          ) : (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-400 mb-1">
                <CheckCircle size={14} /> Parsed successfully
              </div>
              <EditRow label="Merchant" value={parsed.title} onChange={(v) => setParsed({ ...parsed, title: v })} />
              <EditRow label="Amount (₹)" value={parsed.amount} type="number" onChange={(v) => setParsed({ ...parsed, amount: v })} />
              <div>
                <label className="text-xs text-slate-500 block mb-1">Direction</label>
                <select value={parsed.direction} onChange={(e) => setParsed({ ...parsed, direction: e.target.value })}
                  className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
                  <option value="debit">Debit (Expense)</option>
                  <option value="credit">Credit (Income)</option>
                </select>
              </div>
              <EditRow label="Date" value={parsed.txn_date} type="date" onChange={(v) => setParsed({ ...parsed, txn_date: v })} />
              <div>
                <label className="text-xs text-slate-500 block mb-1">Category</label>
                <select value={parsed.predicted_category} onChange={(e) => setParsed({ ...parsed, predicted_category: e.target.value })}
                  className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <button onClick={handleSave} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors mt-2">
                Save Transaction
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle size={28} className="text-emerald-400" />
          </div>
          <p className="text-slate-300 font-medium">Transaction saved!</p>
        </div>
      )}
    </div>
  )
}

function EditRow({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
    </div>
  )
}
