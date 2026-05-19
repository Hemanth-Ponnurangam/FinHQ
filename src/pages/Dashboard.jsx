import { useStore } from '../store/useStore'

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export default function Dashboard() {
  const { accounts, transactions, getAccountBalance, categories } = useStore()

  const totalAssets = accounts
    .filter((a) => a.type !== 'credit_card' && a.isActive)
    .reduce((sum, a) => sum + getAccountBalance(a.id), 0)

  const thisMonth = new Date().getMonth()
  const thisYear  = new Date().getFullYear()

  const monthTxns = transactions.filter((t) => {
    const d = new Date(t.txnDate)
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear
  })

  const income  = monthTxns.filter((t) => t.type === 'income' ).reduce((s, t) => s + t.amount, 0)
  const expense = monthTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const recent = [...transactions]
    .sort((a, b) => new Date(b.txnDate) - new Date(a.txnDate))
    .slice(0, 6)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const accMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="font-display text-3xl font-semibold text-forest-900">Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Net Worth',      value: fmt(totalAssets), sub: 'across all accounts' },
          { label: 'Income (month)', value: fmt(income),      sub: 'this month' },
          { label: 'Spent (month)',  value: fmt(expense),     sub: 'this month' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-2xl shadow-card p-5">
            <p className="text-xs text-forest-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="font-display text-2xl font-semibold text-forest-900">{value}</p>
            <p className="text-xs text-forest-300 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Accounts */}
      <section>
        <h2 className="text-sm font-semibold text-forest-500 uppercase tracking-wider mb-3">Accounts</h2>
        <div className="grid grid-cols-3 gap-3">
          {accounts.filter((a) => a.isActive).map((acc) => (
            <div key={acc.id} className="bg-white rounded-xl shadow-card p-4 flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: acc.color }}
              />
              <div>
                <p className="text-sm font-medium text-forest-800">{acc.name}</p>
                <p className="text-xs text-forest-400">{fmt(getAccountBalance(acc.id))}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent transactions */}
      <section>
        <h2 className="text-sm font-semibold text-forest-500 uppercase tracking-wider mb-3">Recent Transactions</h2>
        <div className="bg-white rounded-2xl shadow-card divide-y divide-forest-50">
          {recent.map((txn) => {
            const cat = catMap[txn.categoryId]
            const isIncome = txn.type === 'income'
            return (
              <div key={txn.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: cat?.color ?? '#999' }}
                  />
                  <div>
                    <p className="text-sm font-medium text-forest-900">{txn.title}</p>
                    <p className="text-xs text-forest-300">{cat?.name} · {txn.txnDate}</p>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    isIncome ? 'text-forest-600' : txn.type === 'transfer' ? 'text-forest-400' : 'text-red-500'
                  }`}
                >
                  {isIncome ? '+' : txn.type === 'transfer' ? '↔' : '−'}{fmt(txn.amount)}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
