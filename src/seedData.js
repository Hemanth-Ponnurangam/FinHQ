const pad = (n) => String(n).padStart(2, '0')
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const SEED_ACCOUNTS = [
  { id: 'acc-hdfc',   name: 'HDFC Savings',   type: 'bank',        currency: 'INR', openingBalance: 50000, openingDate: '2024-01-01', color: '#1B5E3B', isActive: true, sortOrder: 0 },
  { id: 'acc-cash',   name: 'Cash Wallet',     type: 'cash',        currency: 'INR', openingBalance: 2000,  openingDate: '2024-01-01', color: '#C8963E', isActive: true, sortOrder: 1 },
  { id: 'acc-sbi-cc', name: 'SBI Credit Card', type: 'credit_card', currency: 'INR', openingBalance: 0,     openingDate: '2024-01-01', color: '#7C3AED', isActive: true, sortOrder: 2 },
]

export const SEED_CATEGORIES = [
  // ── Income ───────────────────────────────────────────────────────────
  { id: 'cat-salary',       name: 'Salary',           type: 'income',   color: '#1B5E3B', parentId: null, isSystem: true },
  { id: 'cat-freelance',    name: 'Freelance',         type: 'income',   color: '#2D7A50', parentId: null, isSystem: true },
  { id: 'cat-investments',  name: 'Investments',       type: 'income',   color: '#3D9162', parentId: null, isSystem: true },
  { id: 'cat-bonus',        name: 'Bonus',             type: 'income',   color: '#52B788', parentId: null, isSystem: true },
  { id: 'cat-other-income', name: 'Other Income',      type: 'income',   color: '#74C69D', parentId: null, isSystem: true },

  // ── Expense parents ───────────────────────────────────────────────────
  { id: 'cat-food',      name: 'Food & Drinks',  type: 'expense', color: '#EA580C', parentId: null, isSystem: true },
  { id: 'cat-transport', name: 'Transport',       type: 'expense', color: '#2563EB', parentId: null, isSystem: true },
  { id: 'cat-home',      name: 'Home',            type: 'expense', color: '#7C3AED', parentId: null, isSystem: true },
  { id: 'cat-health',    name: 'Health',          type: 'expense', color: '#DC2626', parentId: null, isSystem: true },
  { id: 'cat-shopping',  name: 'Shopping',        type: 'expense', color: '#D97706', parentId: null, isSystem: true },
  { id: 'cat-entertain', name: 'Entertainment',   type: 'expense', color: '#DB2777', parentId: null, isSystem: true },
  { id: 'cat-finance',   name: 'Finance',         type: 'expense', color: '#4F46E5', parentId: null, isSystem: true },
  { id: 'cat-subs',      name: 'Subscriptions',   type: 'expense', color: '#0D9488', parentId: null, isSystem: true },
  { id: 'cat-other',     name: 'Other',           type: 'expense', color: '#6B7280', parentId: null, isSystem: true },

  // ── Expense children ──────────────────────────────────────────────────
  { id: 'cat-groceries', name: 'Groceries',        type: 'expense', color: '#EA580C', parentId: 'cat-food',      isSystem: true },
  { id: 'cat-dining',    name: 'Dining Out',        type: 'expense', color: '#EA580C', parentId: 'cat-food',      isSystem: true },
  { id: 'cat-delivery',  name: 'Food Delivery',     type: 'expense', color: '#EA580C', parentId: 'cat-food',      isSystem: true },
  { id: 'cat-coffee',    name: 'Coffee & Snacks',   type: 'expense', color: '#EA580C', parentId: 'cat-food',      isSystem: true },
  { id: 'cat-fuel',      name: 'Fuel',              type: 'expense', color: '#2563EB', parentId: 'cat-transport', isSystem: true },
  { id: 'cat-cab',       name: 'Auto / Cab',        type: 'expense', color: '#2563EB', parentId: 'cat-transport', isSystem: true },
  { id: 'cat-bus',       name: 'Public Transport',  type: 'expense', color: '#2563EB', parentId: 'cat-transport', isSystem: true },
  { id: 'cat-rent',      name: 'Rent',              type: 'expense', color: '#7C3AED', parentId: 'cat-home',      isSystem: true },
  { id: 'cat-electric',  name: 'Electricity',       type: 'expense', color: '#7C3AED', parentId: 'cat-home',      isSystem: true },
  { id: 'cat-internet',  name: 'Internet',          type: 'expense', color: '#7C3AED', parentId: 'cat-home',      isSystem: true },
  { id: 'cat-doctor',    name: 'Doctor / Clinic',   type: 'expense', color: '#DC2626', parentId: 'cat-health',    isSystem: true },
  { id: 'cat-medicines', name: 'Medicines',         type: 'expense', color: '#DC2626', parentId: 'cat-health',    isSystem: true },
  { id: 'cat-gym',       name: 'Gym & Fitness',     type: 'expense', color: '#DC2626', parentId: 'cat-health',    isSystem: true },

  // ── Transfer ──────────────────────────────────────────────────────────
  { id: 'cat-transfer', name: 'Transfer', type: 'transfer', color: '#6B7280', parentId: null, isSystem: true },
]

export const SEED_TRANSACTIONS = [
  { id: 'txn-01', title: 'Monthly Salary',      note: 'May — TechCorp',    txnDate: daysAgo(18), status: 'cleared', categoryId: 'cat-salary',    type: 'income',   amount: 75000, fromAccountId: null,         toAccountId: 'acc-hdfc',  source: 'manual', createdAt: new Date(Date.now() - 18*86400000).toISOString() },
  { id: 'txn-02', title: 'D-Mart Groceries',    note: 'Weekly shopping',   txnDate: daysAgo(15), status: 'cleared', categoryId: 'cat-groceries', type: 'expense',  amount: 2400,  fromAccountId: 'acc-hdfc',   toAccountId: null,        source: 'manual', createdAt: new Date(Date.now() - 15*86400000).toISOString() },
  { id: 'txn-03', title: 'Swiggy',              note: null,                txnDate: daysAgo(13), status: 'cleared', categoryId: 'cat-delivery',  type: 'expense',  amount: 450,   fromAccountId: 'acc-sbi-cc', toAccountId: null,        source: 'manual', createdAt: new Date(Date.now() - 13*86400000).toISOString() },
  { id: 'txn-04', title: 'Ola Cab',             note: 'Office commute',    txnDate: daysAgo(11), status: 'cleared', categoryId: 'cat-cab',       type: 'expense',  amount: 180,   fromAccountId: 'acc-cash',   toAccountId: null,        source: 'manual', createdAt: new Date(Date.now() - 11*86400000).toISOString() },
  { id: 'txn-05', title: 'Netflix',             note: null,                txnDate: daysAgo(9),  status: 'cleared', categoryId: 'cat-subs',      type: 'expense',  amount: 649,   fromAccountId: 'acc-sbi-cc', toAccountId: null,        source: 'manual', createdAt: new Date(Date.now() -  9*86400000).toISOString() },
  { id: 'txn-06', title: 'Freelance Project',   note: 'UI design client',  txnDate: daysAgo(7),  status: 'cleared', categoryId: 'cat-freelance', type: 'income',   amount: 15000, fromAccountId: null,         toAccountId: 'acc-hdfc',  source: 'manual', createdAt: new Date(Date.now() -  7*86400000).toISOString() },
  { id: 'txn-07', title: 'Electricity Bill',    note: null,                txnDate: daysAgo(5),  status: 'cleared', categoryId: 'cat-electric',  type: 'expense',  amount: 1200,  fromAccountId: 'acc-hdfc',   toAccountId: null,        source: 'manual', createdAt: new Date(Date.now() -  5*86400000).toISOString() },
  { id: 'txn-08', title: 'Cult.fit Membership', note: 'Monthly gym',       txnDate: daysAgo(4),  status: 'cleared', categoryId: 'cat-gym',       type: 'expense',  amount: 2000,  fromAccountId: 'acc-hdfc',   toAccountId: null,        source: 'manual', createdAt: new Date(Date.now() -  4*86400000).toISOString() },
  { id: 'txn-09', title: 'Transfer to Cash',    note: 'Weekend cash',      txnDate: daysAgo(2),  status: 'cleared', categoryId: 'cat-transfer',  type: 'transfer', amount: 3000,  fromAccountId: 'acc-hdfc',   toAccountId: 'acc-cash',  source: 'manual', createdAt: new Date(Date.now() -  2*86400000).toISOString() },
  { id: 'txn-10', title: 'Apollo Pharmacy',     note: null,                txnDate: daysAgo(1),  status: 'cleared', categoryId: 'cat-medicines', type: 'expense',  amount: 850,   fromAccountId: 'acc-cash',   toAccountId: null,        source: 'manual', createdAt: new Date(Date.now() -  1*86400000).toISOString() },
]
