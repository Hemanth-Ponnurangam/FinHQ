export function validateEntries(entries) {
  if (!entries || entries.length < 2) {
    throw new Error('Every transaction needs at least 2 entries')
  }
  const totalDebit = entries
    .filter((e) => e.direction === 'debit')
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const totalCredit = entries
    .filter((e) => e.direction === 'credit')
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Entries do not balance: debit=${totalDebit}, credit=${totalCredit}`)
  }
  return true
}

export function buildExpenseEntries(amount, fromAccountId, categoryAccountId) {
  return [
    { account_id: fromAccountId, direction: 'credit', amount, currency: 'INR', base_amount: amount },
    { account_id: categoryAccountId || 'cat', direction: 'debit', amount, currency: 'INR', base_amount: amount },
  ]
}

export function buildIncomeEntries(amount, toAccountId) {
  return [
    { account_id: toAccountId, direction: 'debit', amount, currency: 'INR', base_amount: amount },
    { account_id: 'income-source', direction: 'credit', amount, currency: 'INR', base_amount: amount },
  ]
}

export function buildTransferEntries(amount, fromAccountId, toAccountId) {
  return [
    { account_id: fromAccountId, direction: 'credit', amount, currency: 'INR', base_amount: amount },
    { account_id: toAccountId, direction: 'debit', amount, currency: 'INR', base_amount: amount },
  ]
}
