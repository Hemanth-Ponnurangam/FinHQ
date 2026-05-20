import Layout from '../components/Layout'

// Static mock data to replicate the screenshot exactly
const mockCards = [
  { label: 'NET WORTH', value: '₹1,35,370', sub: 'across all accounts' },
  { label: 'INCOME (MONTH)', value: '₹90,000', sub: 'this month' },
  { label: 'SPENT (MONTH)', value: '₹7,729', sub: 'this month' },
]

const mockAccounts = [
  { name: 'HDFC Savings', balance: '₹1,31,400', color: '#1B5E3B' },
  { name: 'Cash Wallet', balance: '₹3,970', color: '#C8963E' },
  { name: 'SBI Credit Card', balance: '-₹1,099', color: '#7C3AED' },
]

const mockTransactions = [
  { title: 'Apollo Pharmacy', sub: 'Medicines · 2026-05-18', amount: '-₹850', color: '#DC2626', type: 'expense' },
  { title: 'Transfer to Cash', sub: 'Transfer · 2026-05-17', amount: '↔₹3,000', color: '#6B7280', type: 'transfer' },
  { title: 'Cult.fit Membership', sub: 'Gym & Fitness · 2026-05-15', amount: '-₹2,000', color: '#DC2626', type: 'expense' },
  { title: 'Electricity Bill', sub: 'Electricity · 2026-05-14', amount: '-₹1,200', color: '#7C3AED', type: 'expense' },
]

export default function Dashboard() {
  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-10">
        
        <h1 className="font-display text-4xl font-semibold text-forest-900">Dashboard</h1>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {mockCards.map((card, idx) => (
            <div key={idx} className="bg-white rounded-2xl shadow-card p-6">
              <p className="text-xs text-forest-400 font-semibold tracking-wider uppercase mb-2">{card.label}</p>
              <p className="font-display text-3xl font-semibold text-forest-900 mb-1">{card.value}</p>
              <p className="text-sm text-forest-300">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Accounts Section */}
        <section>
          <h2 className="text-sm font-semibold text-forest-500 uppercase tracking-wider mb-4">Accounts</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {mockAccounts.map((acc, idx) => (
              <div key={idx} className="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                <div>
                  <p className="text-base font-medium text-forest-900">{acc.name}</p>
                  <p className="text-sm text-forest-400 mt-0.5">{acc.balance}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Transactions Section */}
        <section>
          <h2 className="text-sm font-semibold text-forest-500 uppercase tracking-wider mb-4">Recent Transactions</h2>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="divide-y divide-forest-50">
              {mockTransactions.map((txn, idx) => (
                <div key={idx} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-4">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: txn.color }} />
                    <div>
                      <p className="text-base font-medium text-forest-900">{txn.title}</p>
                      <p className="text-sm text-forest-300 mt-0.5">{txn.sub}</p>
                    </div>
                  </div>
                  <span className={`text-base font-medium ${
                    txn.type === 'expense' ? 'text-red-500' : 'text-forest-400'
                  }`}>
                    {txn.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </Layout>
  )
}