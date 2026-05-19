import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { SYSTEM_ACCOUNTS, SYSTEM_CATEGORIES, SEED_TRANSACTIONS } from '../utils/mockData.js'

const STORAGE_KEY = 'txn_ledger_data'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      transactions: state.transactions,
      accounts: state.accounts,
      tags: state.tags,
    }))
  } catch {}
}

const stored = loadFromStorage()

const defaultFilters = {
  from_date: '',
  to_date: '',
  type: 'all',
  account_ids: [],
  category_ids: [],
  tag_ids: [],
  status: 'all',
  q: '',
  min_amount: '',
  max_amount: '',
}

export const useLedgerStore = create((set, get) => ({
  // Data
  transactions: stored?.transactions ?? SEED_TRANSACTIONS,
  accounts: stored?.accounts ?? SYSTEM_ACCOUNTS,
  categories: SYSTEM_CATEGORIES,
  tags: stored?.tags ?? ['salary', 'income', 'groceries', 'investment', 'rent', 'home', 'travel', 'health', 'fitness', 'freelance', 'subscriptions'],

  // UI State
  filters: defaultFilters,
  activeModal: null,   // 'add' | 'import' | null
  selectedTxnId: null,
  filterPanelOpen: false,
  apiKey: localStorage.getItem('anthropic_api_key') || '',

  // ── Filters ──────────────────────────────────────────────────────────
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters }),

  // ── Modal ─────────────────────────────────────────────────────────────
  setActiveModal: (m) => set({ activeModal: m }),
  setSelectedTxnId: (id) => set({ selectedTxnId: id }),
  setFilterPanelOpen: (v) => set({ filterPanelOpen: v }),

  // ── API Key ───────────────────────────────────────────────────────────
  setApiKey: (key) => {
    localStorage.setItem('anthropic_api_key', key)
    set({ apiKey: key })
  },

  // ── Computed: Filtered Transactions ──────────────────────────────────
  getFilteredTransactions: () => {
    const { transactions, filters } = get()
    return transactions
      .filter((t) => {
        if (filters.type !== 'all' && t.display_type !== filters.type) return false
        if (filters.status !== 'all' && t.status !== filters.status) return false
        if (filters.from_date && t.txn_date < filters.from_date) return false
        if (filters.to_date && t.txn_date > filters.to_date) return false
        if (filters.account_ids.length > 0 && !filters.account_ids.includes(t.account_id)) return false
        if (filters.category_ids.length > 0 && !filters.category_ids.includes(t.category_id)) return false
        if (filters.q) {
          const q = filters.q.toLowerCase()
          if (!t.title.toLowerCase().includes(q) && !(t.note || '').toLowerCase().includes(q)) return false
        }
        if (filters.min_amount && Math.abs(t.display_amount) < parseFloat(filters.min_amount)) return false
        if (filters.max_amount && Math.abs(t.display_amount) > parseFloat(filters.max_amount)) return false
        return true
      })
      .sort((a, b) => {
        if (b.txn_date !== a.txn_date) return b.txn_date.localeCompare(a.txn_date)
        return (b.txn_time || '').localeCompare(a.txn_time || '')
      })
  },

  // ── Summary Stats ─────────────────────────────────────────────────────
  getSummary: () => {
    const txns = get().getFilteredTransactions()
    const total_income = txns
      .filter((t) => t.display_type === 'income' && t.status !== 'void')
      .reduce((s, t) => s + t.display_amount, 0)
    const total_expense = txns
      .filter((t) => t.display_type === 'expense' && t.status !== 'void')
      .reduce((s, t) => s + Math.abs(t.display_amount), 0)
    return {
      total_income,
      total_expense,
      net: total_income - total_expense,
      txn_count: txns.length,
    }
  },

  // ── CRUD ──────────────────────────────────────────────────────────────
  addTransaction: (txnData) => {
    const newTxn = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      ...txnData,
    }
    set((s) => {
      const next = { ...s, transactions: [newTxn, ...s.transactions] }
      saveToStorage(next)
      return next
    })
    return newTxn
  },

  updateTransaction: (id, updates) => {
    set((s) => {
      const next = {
        ...s,
        transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }
      saveToStorage(next)
      return next
    })
  },

  deleteTransaction: (id) => {
    set((s) => {
      const next = { ...s, transactions: s.transactions.filter((t) => t.id !== id) }
      saveToStorage(next)
      return next
    })
  },

  voidTransaction: (id) => {
    set((s) => {
      const next = {
        ...s,
        transactions: s.transactions.map((t) => (t.id === id ? { ...t, status: 'void' } : t)),
      }
      saveToStorage(next)
      return next
    })
  },

  duplicateTransaction: (id) => {
    const txn = get().transactions.find((t) => t.id === id)
    if (!txn) return
    const { raw_source, ...rest } = txn
    get().addTransaction({
      ...rest,
      id: uuidv4(),
      txn_date: new Date().toISOString().split('T')[0],
      source: 'manual',
    })
  },

  addTag: (label) => {
    set((s) => {
      if (s.tags.includes(label)) return s
      const next = { ...s, tags: [...s.tags, label] }
      saveToStorage(next)
      return next
    })
  },

  addAccount: (account) => {
    const newAcc = { id: uuidv4(), is_active: true, currency: 'INR', opening_bal: 0, ...account }
    set((s) => {
      const next = { ...s, accounts: [...s.accounts, newAcc] }
      saveToStorage(next)
      return next
    })
  },

  getAccountBalance: (accountId) => {
    const { transactions, accounts } = get()
    const account = accounts.find((a) => a.id === accountId)
    if (!account) return 0
    let balance = parseFloat(account.opening_bal)
    transactions
      .filter((t) => t.status === 'cleared' || t.status === 'reconciled')
      .forEach((t) => {
        t.entries?.forEach((e) => {
          if (e.account_id === accountId) {
            if (e.direction === 'debit') balance += parseFloat(e.amount)
            else balance -= parseFloat(e.amount)
          }
        })
      })
    return balance
  },
}))
