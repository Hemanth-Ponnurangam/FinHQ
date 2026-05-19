import { v4 as uuidv4 } from 'uuid'

export const SYSTEM_ACCOUNTS = [
  { id: 'acc-hdfc', name: 'HDFC Savings', type: 'bank', currency: 'INR', opening_bal: 50000, color: '#6366F1', icon: '🏦', is_active: true },
  { id: 'acc-icici', name: 'ICICI Credit Card', type: 'credit_card', currency: 'INR', opening_bal: 0, color: '#F43F5E', icon: '💳', is_active: true },
  { id: 'acc-cash', name: 'Cash Wallet', type: 'cash', currency: 'INR', opening_bal: 5000, color: '#10B981', icon: '💵', is_active: true },
  { id: 'acc-zerodha', name: 'Zerodha', type: 'investment', currency: 'INR', opening_bal: 0, color: '#F59E0B', icon: '📈', is_active: true },
]

export const SYSTEM_CATEGORIES = [
  // Income
  { id: 'cat-salary', name: 'Salary', type: 'income', icon: '💼', color: '#10B981', parent_id: null },
  { id: 'cat-freelance', name: 'Freelance Income', type: 'income', icon: '💻', color: '#10B981', parent_id: null },
  { id: 'cat-investment-return', name: 'Investment Returns', type: 'income', icon: '📈', color: '#10B981', parent_id: null },
  { id: 'cat-gifts-received', name: 'Gifts Received', type: 'income', icon: '🎁', color: '#10B981', parent_id: null },
  { id: 'cat-refund', name: 'Refunds', type: 'income', icon: '↩️', color: '#10B981', parent_id: null },
  { id: 'cat-other-income', name: 'Other Income', type: 'income', icon: '💰', color: '#10B981', parent_id: null },

  // Expense - Food
  { id: 'cat-food', name: 'Food & Drinks', type: 'expense', icon: '🍽️', color: '#F97316', parent_id: null },
  { id: 'cat-groceries', name: 'Groceries', type: 'expense', icon: '🛒', color: '#F97316', parent_id: 'cat-food' },
  { id: 'cat-dining', name: 'Dining Out', type: 'expense', icon: '🍜', color: '#F97316', parent_id: 'cat-food' },
  { id: 'cat-coffee', name: 'Coffee & Snacks', type: 'expense', icon: '☕', color: '#F97316', parent_id: 'cat-food' },

  // Expense - Transport
  { id: 'cat-transport', name: 'Transport', type: 'expense', icon: '🚗', color: '#3B82F6', parent_id: null },
  { id: 'cat-fuel', name: 'Fuel', type: 'expense', icon: '⛽', color: '#3B82F6', parent_id: 'cat-transport' },
  { id: 'cat-cab', name: 'Auto/Cab', type: 'expense', icon: '🚕', color: '#3B82F6', parent_id: 'cat-transport' },
  { id: 'cat-public', name: 'Public Transport', type: 'expense', icon: '🚌', color: '#3B82F6', parent_id: 'cat-transport' },

  // Expense - Home
  { id: 'cat-home', name: 'Home', type: 'expense', icon: '🏠', color: '#8B5CF6', parent_id: null },
  { id: 'cat-rent', name: 'Rent', type: 'expense', icon: '🏠', color: '#8B5CF6', parent_id: 'cat-home' },
  { id: 'cat-electricity', name: 'Electricity', type: 'expense', icon: '⚡', color: '#8B5CF6', parent_id: 'cat-home' },
  { id: 'cat-internet', name: 'Internet', type: 'expense', icon: '📶', color: '#8B5CF6', parent_id: 'cat-home' },

  // Expense - Health
  { id: 'cat-health', name: 'Health', type: 'expense', icon: '🏥', color: '#EF4444', parent_id: null },
  { id: 'cat-doctor', name: 'Doctor/Clinic', type: 'expense', icon: '👨‍⚕️', color: '#EF4444', parent_id: 'cat-health' },
  { id: 'cat-medicines', name: 'Medicines', type: 'expense', icon: '💊', color: '#EF4444', parent_id: 'cat-health' },
  { id: 'cat-gym', name: 'Gym', type: 'expense', icon: '🏋️', color: '#EF4444', parent_id: 'cat-health' },

  // Expense - Shopping
  { id: 'cat-shopping', name: 'Shopping', type: 'expense', icon: '🛍️', color: '#EC4899', parent_id: null },
  { id: 'cat-clothing', name: 'Clothing', type: 'expense', icon: '👕', color: '#EC4899', parent_id: 'cat-shopping' },
  { id: 'cat-electronics', name: 'Electronics', type: 'expense', icon: '📱', color: '#EC4899', parent_id: 'cat-shopping' },

  // Expense - Entertainment
  { id: 'cat-entertainment', name: 'Entertainment', type: 'expense', icon: '🎬', color: '#F59E0B', parent_id: null },
  { id: 'cat-movies', name: 'Movies & Events', type: 'expense', icon: '🎥', color: '#F59E0B', parent_id: 'cat-entertainment' },
  { id: 'cat-streaming', name: 'Streaming', type: 'expense', icon: '📺', color: '#F59E0B', parent_id: 'cat-entertainment' },
  { id: 'cat-games', name: 'Games', type: 'expense', icon: '🎮', color: '#F59E0B', parent_id: 'cat-entertainment' },

  // Expense - Finance
  { id: 'cat-finance', name: 'Finance', type: 'expense', icon: '💹', color: '#06B6D4', parent_id: null },
  { id: 'cat-sip', name: 'Investment SIP', type: 'expense', icon: '📊', color: '#06B6D4', parent_id: 'cat-finance' },
  { id: 'cat-insurance', name: 'Insurance Premium', type: 'expense', icon: '🛡️', color: '#06B6D4', parent_id: 'cat-finance' },

  // Expense - Subscriptions
  { id: 'cat-subscriptions', name: 'Subscriptions', type: 'expense', icon: '📱', color: '#A78BFA', parent_id: null },

  // Expense - Other
  { id: 'cat-other', name: 'Other Expenses', type: 'expense', icon: '📦', color: '#6B7280', parent_id: null },

  // Transfer
  { id: 'cat-internal-transfer', name: 'Internal Transfer', type: 'transfer', icon: '↔️', color: '#38BDF8', parent_id: null },
  { id: 'cat-loan-repayment', name: 'Loan Repayment', type: 'transfer', icon: '🔄', color: '#38BDF8', parent_id: null },
]

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export const SEED_TRANSACTIONS = [
  {
    id: 'txn-1',
    title: 'Salary - May 2026',
    note: 'Monthly salary credited',
    txn_date: daysAgo(1),
    txn_time: '09:00:00',
    status: 'cleared',
    category_id: 'cat-salary',
    account_id: 'acc-hdfc',
    source: 'manual',
    display_type: 'income',
    display_amount: 120000,
    tags: ['salary', 'income'],
    entries: [
      { id: 'e1', account_id: 'acc-hdfc', account_name: 'HDFC Savings', direction: 'debit', amount: 120000, currency: 'INR' },
      { id: 'e2', account_id: 'cat-salary', account_name: 'Salary', direction: 'credit', amount: 120000, currency: 'INR' },
    ],
  },
  {
    id: 'txn-2',
    title: 'D-Mart Groceries',
    note: 'Weekly grocery run',
    txn_date: daysAgo(1),
    txn_time: '11:30:00',
    status: 'cleared',
    category_id: 'cat-groceries',
    account_id: 'acc-hdfc',
    source: 'sms',
    display_type: 'expense',
    display_amount: -3240,
    tags: ['groceries'],
    entries: [
      { id: 'e3', account_id: 'acc-hdfc', account_name: 'HDFC Savings', direction: 'credit', amount: 3240, currency: 'INR' },
      { id: 'e4', account_id: 'cat-groceries', account_name: 'Groceries', direction: 'debit', amount: 3240, currency: 'INR' },
    ],
  },
  {
    id: 'txn-3',
    title: 'Swiggy Dinner',
    note: null,
    txn_date: daysAgo(2),
    txn_time: '20:15:00',
    status: 'cleared',
    category_id: 'cat-dining',
    account_id: 'acc-icici',
    source: 'sms',
    display_type: 'expense',
    display_amount: -678,
    tags: [],
    entries: [
      { id: 'e5', account_id: 'acc-icici', account_name: 'ICICI Credit Card', direction: 'credit', amount: 678, currency: 'INR' },
      { id: 'e6', account_id: 'cat-dining', account_name: 'Dining Out', direction: 'debit', amount: 678, currency: 'INR' },
    ],
  },
  {
    id: 'txn-4',
    title: 'Zerodha Transfer',
    note: 'Monthly investment',
    txn_date: daysAgo(2),
    txn_time: '10:00:00',
    status: 'cleared',
    category_id: 'cat-internal-transfer',
    account_id: 'acc-hdfc',
    source: 'manual',
    display_type: 'transfer',
    display_amount: 10000,
    tags: ['investment'],
    entries: [
      { id: 'e7', account_id: 'acc-hdfc', account_name: 'HDFC Savings', direction: 'credit', amount: 10000, currency: 'INR' },
      { id: 'e8', account_id: 'acc-zerodha', account_name: 'Zerodha', direction: 'debit', amount: 10000, currency: 'INR' },
    ],
  },
  {
    id: 'txn-5',
    title: 'Apartment Rent',
    note: 'May 2026 rent',
    txn_date: daysAgo(3),
    txn_time: null,
    status: 'cleared',
    category_id: 'cat-rent',
    account_id: 'acc-hdfc',
    source: 'manual',
    display_type: 'expense',
    display_amount: -25000,
    tags: ['rent', 'home'],
    entries: [
      { id: 'e9', account_id: 'acc-hdfc', account_name: 'HDFC Savings', direction: 'credit', amount: 25000, currency: 'INR' },
      { id: 'e10', account_id: 'cat-rent', account_name: 'Rent', direction: 'debit', amount: 25000, currency: 'INR' },
    ],
  },
  {
    id: 'txn-6',
    title: 'Netflix Subscription',
    note: null,
    txn_date: daysAgo(3),
    txn_time: '08:00:00',
    status: 'cleared',
    category_id: 'cat-streaming',
    account_id: 'acc-icici',
    source: 'manual',
    display_type: 'expense',
    display_amount: -649,
    tags: ['subscriptions'],
    entries: [
      { id: 'e11', account_id: 'acc-icici', account_name: 'ICICI Credit Card', direction: 'credit', amount: 649, currency: 'INR' },
      { id: 'e12', account_id: 'cat-streaming', account_name: 'Streaming', direction: 'debit', amount: 649, currency: 'INR' },
    ],
  },
  {
    id: 'txn-7',
    title: 'Ola Cab to Airport',
    note: 'Business travel',
    txn_date: daysAgo(4),
    txn_time: '05:30:00',
    status: 'cleared',
    category_id: 'cat-cab',
    account_id: 'acc-cash',
    source: 'manual',
    display_type: 'expense',
    display_amount: -850,
    tags: ['travel'],
    entries: [
      { id: 'e13', account_id: 'acc-cash', account_name: 'Cash Wallet', direction: 'credit', amount: 850, currency: 'INR' },
      { id: 'e14', account_id: 'cat-cab', account_name: 'Auto/Cab', direction: 'debit', amount: 850, currency: 'INR' },
    ],
  },
  {
    id: 'txn-8',
    title: 'BESCOM Electricity Bill',
    note: 'April billing',
    txn_date: daysAgo(5),
    txn_time: null,
    status: 'pending',
    category_id: 'cat-electricity',
    account_id: 'acc-hdfc',
    source: 'manual',
    display_type: 'expense',
    display_amount: -1890,
    tags: [],
    entries: [
      { id: 'e15', account_id: 'acc-hdfc', account_name: 'HDFC Savings', direction: 'credit', amount: 1890, currency: 'INR' },
      { id: 'e16', account_id: 'cat-electricity', account_name: 'Electricity', direction: 'debit', amount: 1890, currency: 'INR' },
    ],
  },
  {
    id: 'txn-9',
    title: 'Freelance Project — Webflow',
    note: 'Client: TechCorp India',
    txn_date: daysAgo(6),
    txn_time: '14:00:00',
    status: 'cleared',
    category_id: 'cat-freelance',
    account_id: 'acc-hdfc',
    source: 'manual',
    display_type: 'income',
    display_amount: 45000,
    tags: ['freelance', 'income'],
    entries: [
      { id: 'e17', account_id: 'acc-hdfc', account_name: 'HDFC Savings', direction: 'debit', amount: 45000, currency: 'INR' },
      { id: 'e18', account_id: 'cat-freelance', account_name: 'Freelance Income', direction: 'credit', amount: 45000, currency: 'INR' },
    ],
  },
  {
    id: 'txn-10',
    title: 'Gym Membership',
    note: 'Cult.fit annual plan',
    txn_date: daysAgo(7),
    txn_time: '09:00:00',
    status: 'cleared',
    category_id: 'cat-gym',
    account_id: 'acc-icici',
    source: 'manual',
    display_type: 'expense',
    display_amount: -2499,
    tags: ['health', 'fitness'],
    entries: [
      { id: 'e19', account_id: 'acc-icici', account_name: 'ICICI Credit Card', direction: 'credit', amount: 2499, currency: 'INR' },
      { id: 'e20', account_id: 'cat-gym', account_name: 'Gym', direction: 'debit', amount: 2499, currency: 'INR' },
    ],
  },
]
