import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Loader2, Sparkles, Plus, Trash2, ChevronDown, Tag } from 'lucide-react'
import { useLedgerStore } from '../../store/useLedgerStore.js'
import { predictCategory } from '../../api/ai.js'
import { v4 as uuidv4 } from 'uuid'
import SmsImportFlow from './SmsImportFlow.jsx'

const TABS = ['Quick Add', 'Split', 'SMS Import']
const TYPES = ['expense', 'income', 'transfer']

export default function AddTransactionModal() {
  const setActiveModal = useLedgerStore((s) => s.setActiveModal)
  const categories = useLedgerStore((s) => s.categories)
  const accounts = useLedgerStore((s) => s.accounts)
  const tags = useLedgerStore((s) => s.tags)
  const addTransaction = useLedgerStore((s) => s.addTransaction)
  const addTag = useLedgerStore((s) => s.addTag)
  const apiKey = useLedgerStore((s) => s.apiKey)

  const [tab, setTab] = useState(0)
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id || '')
  const [note, setNote] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [status, setStatus] = useState('cleared')
  const [errors, setErrors] = useState({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [saving, setSaving] = useState(false)

  // Split
  const [splitLines, setSplitLines] = useState([{ id: uuidv4(), category_id: '', amount: '' }])

  const debounceRef = useRef(null)

  const filteredCategories = categories.filter((c) =>
    type === 'transfer' ? c.type === 'transfer' : c.type === type
  )

  // AI categorization on title change
  useEffect(() => {
    if (!title || title.length < 3 || !apiKey) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setAiLoading(true)
      const result = await predictCategory(title, parseFloat(amount) || 0, categories, apiKey)
      setAiLoading(false)
      if (result) {
        setAiSuggestion(result)
        const match = categories.find((c) => c.name === result.category)
        if (match && !categoryId) setCategoryId(match.id)
      }
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [title])

  function validate() {
    const errs = {}
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!amt || amt <= 0) errs.amount = 'Enter a valid amount greater than 0'
    if (!title.trim()) errs.title = 'Title is required'
    if (!accountId) errs.account = 'Select an account'
    if (type === 'transfer' && !toAccountId) errs.toAccount = 'Select destination account'
    if (tab === 1) {
      const splitTotal = splitLines.reduce((s, l) => s + parseFloat(l.amount || 0), 0)
      if (Math.abs(splitTotal - amt) > 0.01) errs.split = `Split total ₹${splitTotal.toFixed(2)} ≠ ₹${amt.toFixed(2)}`
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function buildTransaction() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    const isExpense = type === 'expense'
    const isIncome = type === 'income'
    const isTransfer = type === 'transfer'
    const account = accounts.find(a => a.id === accountId)
    const toAccount = accounts.find(a => a.id === toAccountId)
    const category = categories.find(c => c.id === categoryId)

    let entries = []
    if (isExpense) {
      entries = [
        { id: uuidv4(), account_id: accountId, account_name: account?.name, direction: 'credit', amount: amt, currency: 'INR' },
        { id: uuidv4(), account_id: categoryId || 'cat', account_name: category?.name || 'Expense', direction: 'debit', amount: amt, currency: 'INR' },
      ]
    } else if (isIncome) {
      entries = [
        { id: uuidv4(), account_id: accountId, account_name: account?.name, direction: 'debit', amount: amt, currency: 'INR' },
        { id: uuidv4(), account_id: categoryId || 'income', account_name: category?.name || 'Income', direction: 'credit', amount: amt, currency: 'INR' },
      ]
    } else if (isTransfer) {
      entries = [
        { id: uuidv4(), account_id: accountId, account_name: account?.name, direction: 'credit', amount: amt, currency: 'INR' },
        { id: uuidv4(), account_id: toAccountId, account_name: toAccount?.name, direction: 'debit', amount: amt, currency: 'INR' },
      ]
    }

    // Split mode
    if (tab === 1) {
      entries = [
        { id: uuidv4(), account_id: accountId, account_name: account?.name, direction: 'credit', amount: amt, currency: 'INR' },
        ...splitLines.map((l) => {
          const c = categories.find(x => x.id === l.category_id)
          return { id: uuidv4(), account_id: l.category_id, account_name: c?.name || 'Split', direction: 'debit', amount: parseFloat(l.amount || 0), currency: 'INR' }
        }),
      ]
    }

    return {
      title: title.trim(),
      note: note.trim() || null,
      txn_date: date,
      txn_time: new Date().toTimeString().slice(0, 8),
      status,
      category_id: categoryId || null,
      account_id: accountId,
      source: 'manual',
      display_type: isTransfer ? 'transfer' : type,
      display_amount: isExpense ? -amt : amt,
      is_split: tab === 1,
      tags: selectedTags,
      entries,
    }
  }

  const handleSave = (andAnother = false) => {
    if (!validate()) return
    setSaving(true)
    addTransaction(buildTransaction())
    setSaving(false)
    if (andAnother) {
      setAmount(''); setTitle(''); setNote(''); setSelectedTags([]); setAiSuggestion(null)
    } else {
      setActiveModal(null)
    }
  }

  const addSplitLine = () => setSplitLines([...splitLines, { id: uuidv4(), category_id: '', amount: '' }])
  const removeSplitLine = (id) => setSplitLines(splitLines.filter(l => l.id !== id))
  const updateSplitLine = (id, field, value) => setSplitLines(splitLines.map(l => l.id === id ? { ...l, [field]: value } : l))

  const splitTotal = splitLines.reduce((s, l) => s + parseFloat(l.amount || 0), 0)
  const mainAmount = parseFloat(amount.replace(/,/g, '') || 0)
  const splitDiff = mainAmount - splitTotal

  const handleAddTag = (label) => {
    if (!label.trim()) return
    addTag(label.trim())
    if (!selectedTags.includes(label.trim())) setSelectedTags([...selectedTags, label.trim()])
    setTagInput('')
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in" onClick={() => setActiveModal(null)} />
      <div className="fixed bottom-0 left-0 right-0 md:inset-0 md:flex md:items-center md:justify-center z-50">
        <div className="bg-navy-800 border-t md:border border-[#1E2D4A] rounded-t-2xl md:rounded-2xl md:max-w-lg md:w-full w-full max-h-[92vh] md:max-h-[90vh] overflow-y-auto animate-slide-up md:animate-scale-in">
          {/* Handle */}
          <div className="md:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-700" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D4A]">
            <span className="font-display font-semibold text-slate-200">Add Transaction</span>
            <button onClick={() => setActiveModal(null)} className="w-8 h-8 rounded-lg hover:bg-navy-700 flex items-center justify-center text-slate-400">
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#1E2D4A] px-1">
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === i ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="px-5 py-5 space-y-4">
            {tab === 2 ? (
              <SmsImportFlow onClose={() => setActiveModal(null)} />
            ) : (
              <>
                {/* Type toggle */}
                <div className="flex bg-navy-900 rounded-xl p-1 gap-1">
                  {TYPES.map((t) => (
                    <button key={t} onClick={() => { setType(t); setCategoryId('') }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${type === t
                        ? t === 'income' ? 'bg-emerald-600 text-white'
                          : t === 'expense' ? 'bg-rose-600 text-white'
                          : 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'}`}>
                      {t}
                    </button>
                  ))}
                </div>

                {/* Amount */}
                <div>
                  <div className={`flex items-center gap-2 bg-navy-900 rounded-xl border ${errors.amount ? 'border-rose-500' : 'border-[#1E2D4A] focus-within:border-indigo-500'} px-4 py-3 transition-colors`}>
                    <span className="font-mono text-2xl text-slate-500">₹</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      aria-label="Amount"
                      aria-describedby={errors.amount ? 'amount-error' : undefined}
                      className="flex-1 bg-transparent font-mono text-2xl font-semibold text-slate-100 placeholder:text-slate-700 focus:outline-none"
                    />
                  </div>
                  {errors.amount && <p id="amount-error" className="text-rose-400 text-xs mt-1">{errors.amount}</p>}
                </div>

                {/* Date */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-navy-700 border border-[#1E2D4A] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>

                {/* Title + AI */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Merchant / Title</label>
                  <div className="relative">
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Swiggy, Rent, Salary"
                      aria-describedby={errors.title ? 'title-error' : undefined}
                      className={`w-full bg-navy-700 border ${errors.title ? 'border-rose-500' : 'border-[#1E2D4A] focus:border-indigo-500'} rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none pr-10`} />
                    {aiLoading && <Loader2 size={14} className="absolute right-3 top-3 text-indigo-400 animate-spin" />}
                    {!aiLoading && aiSuggestion && <Sparkles size={14} className="absolute right-3 top-3 text-indigo-400" />}
                  </div>
                  {errors.title && <p id="title-error" className="text-rose-400 text-xs mt-1">{errors.title}</p>}
                  {aiSuggestion && !aiLoading && (
                    <p className="text-xs text-indigo-400 mt-1 flex items-center gap-1">
                      <Sparkles size={10} /> AI suggests: <strong>{aiSuggestion.category}</strong> ({Math.round(aiSuggestion.confidence * 100)}% confidence)
                    </p>
                  )}
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Category</label>
                  <div className="relative">
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full bg-navy-700 border border-[#1E2D4A] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 appearance-none pr-8">
                      <option value="">— Uncategorised —</option>
                      {filteredCategories.filter(c => !c.parent_id).map((parent) => (
                        <optgroup key={parent.id} label={`${parent.icon} ${parent.name}`}>
                          <option value={parent.id}>{parent.icon} {parent.name}</option>
                          {filteredCategories.filter(c => c.parent_id === parent.id).map((child) => (
                            <option key={child.id} value={child.id}>　{child.icon} {child.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                {/* Account(s) */}
                {type !== 'transfer' ? (
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Account</label>
                    <div className="relative">
                      <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                        className="w-full bg-navy-700 border border-[#1E2D4A] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 appearance-none pr-8">
                        {accounts.filter(a => a.is_active).map((a) => (
                          <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                    </div>
                    {errors.account && <p className="text-rose-400 text-xs mt-1">{errors.account}</p>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">From</label>
                      <div className="relative">
                        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                          className="w-full bg-navy-700 border border-[#1E2D4A] rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 appearance-none pr-7">
                          {accounts.filter(a => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-3 text-slate-500 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">To</label>
                      <div className="relative">
                        <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}
                          className="w-full bg-navy-700 border border-[#1E2D4A] rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 appearance-none pr-7">
                          {accounts.filter(a => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-3 text-slate-500 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Status */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Status</label>
                  <div className="flex gap-2">
                    {['cleared', 'pending'].map((s) => (
                      <button key={s} onClick={() => setStatus(s)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${status === s ? 'bg-indigo-600 text-white' : 'bg-navy-700 text-slate-400 hover:bg-navy-600 border border-[#1E2D4A]'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Split Lines */}
                {tab === 1 && (
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Split Lines</label>
                    <div className="space-y-2">
                      {splitLines.map((line, i) => (
                        <div key={line.id} className="flex gap-2 items-center">
                          <div className="relative flex-1">
                            <select value={line.category_id} onChange={(e) => updateSplitLine(line.id, 'category_id', e.target.value)}
                              className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 appearance-none pr-6">
                              <option value="">Category</option>
                              {categories.filter(c => c.type === 'expense').map((c) => (
                                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="relative w-28">
                            <span className="absolute left-2.5 top-2 text-slate-500 text-sm">₹</span>
                            <input type="number" value={line.amount} onChange={(e) => updateSplitLine(line.id, 'amount', e.target.value)}
                              placeholder="0.00" className="w-full bg-navy-700 border border-[#1E2D4A] rounded-lg pl-6 pr-2 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                          </div>
                          {splitLines.length > 1 && (
                            <button onClick={() => removeSplitLine(line.id)} className="text-rose-400 hover:text-rose-300 p-1">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button onClick={addSplitLine} className="mt-2 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                      <Plus size={12} /> Add line
                    </button>
                    {mainAmount > 0 && (
                      <div className={`mt-2 text-xs font-mono ${Math.abs(splitDiff) < 0.01 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {Math.abs(splitDiff) < 0.01 ? '✓ Balanced' : `₹${Math.abs(splitDiff).toFixed(2)} ${splitDiff > 0 ? 'unallocated' : 'over-allocated'}`}
                      </div>
                    )}
                    {errors.split && <p className="text-rose-400 text-xs mt-1">{errors.split}</p>}
                  </div>
                )}

                {/* Note */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Note <span className="text-slate-600">(optional)</span></label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                    placeholder="Any additional notes…"
                    className="w-full bg-navy-700 border border-[#1E2D4A] rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none" />
                </div>

                {/* Tags */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Tags</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedTags.map((t) => (
                      <span key={t} onClick={() => setSelectedTags(selectedTags.filter(x => x !== t))}
                        className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/15 border border-indigo-500/30 rounded-full text-xs text-indigo-300 cursor-pointer hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-300 transition-colors">
                        <Tag size={9} />{t} ×
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(tagInput) } }}
                      placeholder="Type to add or create tag…"
                      className="flex-1 bg-navy-700 border border-[#1E2D4A] rounded-xl px-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.filter(t => !selectedTags.includes(t) && t.includes(tagInput)).slice(0, 8).map((t) => (
                      <button key={t} onClick={() => setSelectedTags([...selectedTags, t])}
                        className="px-2 py-0.5 bg-navy-700 border border-[#1E2D4A] rounded-full text-xs text-slate-400 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-300 transition-colors">
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 pb-1">
                  <button onClick={() => handleSave(false)} disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium transition-colors flex items-center justify-center gap-2">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save
                  </button>
                  <button onClick={() => handleSave(true)} disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-navy-700 hover:bg-navy-600 disabled:opacity-60 text-slate-300 font-medium transition-colors text-sm border border-[#1E2D4A]">
                    Save & Add Another
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
