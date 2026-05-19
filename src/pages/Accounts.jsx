import { useStore } from '../store/useStore'

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const TYPE_LABELS = {
  bank:        'Bank',
  cash:        'Cash',
  credit_card: 'Credit Card',
  investment:  'Investment',
  wallet:      'Wallet',
}

export default function Accounts() {
  const { accounts, getAccountBalance, updateAccount } = useStore()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="font-display text-3xl font-semibold text-forest-900">Accounts</h1>

      <div className="grid gap-4">
        {accounts.map((acc) => {
          const balance = getAccountBalance(acc.id)
          return (
            <div
              key={acc.id}
              className="bg-white rounded-2xl shadow-card p-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm"
                  style={{ backgroundColor: acc.color }}
                >
                  {acc.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-forest-900">{acc.name}</p>
                  <p className="text-xs text-forest-400">{TYPE_LABELS[acc.type] ?? acc.type} · {acc.currency}</p>
                </div>
              </div>

              <div className="text-right flex items-center gap-6">
                <div>
                  <p className="text-xs text-forest-400 mb-0.5">Balance</p>
                  <p className={`font-display text-xl font-semibold ${balance < 0 ? 'text-red-500' : 'text-forest-900'}`}>
                    {fmt(balance)}
                  </p>
                </div>

                <button
                  onClick={() => updateAccount(acc.id, { isActive: !acc.isActive })}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    acc.isActive
                      ? 'border-forest-100 text-forest-400 hover:border-red-200 hover:text-red-400'
                      : 'border-forest-200 text-forest-300 hover:border-forest-400 hover:text-forest-600'
                  }`}
                >
                  {acc.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
