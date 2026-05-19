import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SEED_ACCOUNTS, SEED_CATEGORIES, SEED_TRANSACTIONS } from '../seedData'

export const useStore = create(
  persist(
    (set, get) => ({
      accounts: SEED_ACCOUNTS,
      categories: SEED_CATEGORIES,
      transactions: SEED_TRANSACTIONS,

      // ── Accounts ──────────────────────────────────────────────────────
      addAccount: (account) =>
        set((s) => ({ accounts: [...s.accounts, account] })),

      updateAccount: (id, patch) =>
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      deleteAccount: (id) =>
        set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) })),

      // ── Transactions ──────────────────────────────────────────────────
      addTransaction: (txn) =>
        set((s) => ({ transactions: [txn, ...s.transactions] })),

      updateTransaction: (id, patch) =>
        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

      // ── Derived helpers ───────────────────────────────────────────────
      getAccountBalance: (accountId) => {
        const { accounts, transactions } = get()
        const account = accounts.find((a) => a.id === accountId)
        if (!account) return 0

        let balance = account.openingBalance
        for (const t of transactions) {
          if (t.type === 'income'   && t.toAccountId   === accountId) balance += t.amount
          if (t.type === 'expense'  && t.fromAccountId === accountId) balance -= t.amount
          if (t.type === 'transfer') {
            if (t.toAccountId   === accountId) balance += t.amount
            if (t.fromAccountId === accountId) balance -= t.amount
          }
        }
        return balance
      },
    }),
    { name: 'finhq-storage' }
  )
)
