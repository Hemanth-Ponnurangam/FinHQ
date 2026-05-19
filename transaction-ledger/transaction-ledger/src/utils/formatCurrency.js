export function formatCurrency(amount, currency = 'INR', options = {}) {
  const abs = Math.abs(amount)
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    notation: options.compact ? 'compact' : 'standard',
  }).format(abs)

  if (options.showSign) {
    return amount < 0 ? `−${formatted}` : `+${formatted}`
  }
  return formatted
}

export function formatCompact(amount, currency = 'INR') {
  return formatCurrency(amount, currency, { compact: true })
}
