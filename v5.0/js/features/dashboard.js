import { store } from '../store.js';

// ── Memoized liquid cash — recomputed only when transactions array changes ────
let _lastTxns       = null;
let _cachedLiquidCash = 0;

function getLiquidCash(transactions) {
  if (transactions === _lastTxns) return _cachedLiquidCash; // same reference → skip

  _cachedLiquidCash = transactions.reduce((cash, txn) => {
    const amt = txn.amount || 0;
    const isInvestmentExpense =
      txn.type === 'expense' &&
      txn.tags?.some(t => t.toLowerCase() === 'investments');
    if (txn.type === 'income')        return cash + amt;
    if (!isInvestmentExpense)         return cash - amt;
    return cash;
  }, 0);

  _lastTxns = transactions;
  return _cachedLiquidCash;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function initDashboard() {
  // Only re-run when transactions, assets, or debts change.
  // Fuel logs, serviceLog, events etc. no longer trigger this.
  store.subscribe(state => {
    if (!state.isLoaded) return;

    const liquidCash = getLiquidCash(state.transactions);

    // ── Assets ───────────────────────────────────────────────────────
    let totalAssetValue = 0;
    state.assets.forEach(asset => {
      const qty   = asset.qty || 1;
      const price = asset.currentPrice !== undefined
        ? asset.currentPrice
        : (asset.buyPrice || 0);
      totalAssetValue += qty * price;
    });

    // ── Debts ────────────────────────────────────────────────────────
    let totalDebtValue = 0;
    state.debts.forEach(debt => {
      totalDebtValue += (debt.principal || 0) - (debt.paid || 0);
    });

    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    const nwIsNeg       = totalNetWorth < 0;
    const cashIsNeg     = liquidCash < 0;

    // ── Hide skeleton ────────────────────────────────────────────────
    document.getElementById('nwSkeleton')?.classList.add('hidden');

    // ── Net Worth ────────────────────────────────────────────────────
    const nwDisplay = document.getElementById('netWorthDisplay');
    if (nwDisplay) {
      nwDisplay.classList.remove('hidden');
      nwDisplay.innerText = nwIsNeg
        ? `-₹${Math.abs(totalNetWorth).toLocaleString('en-IN')}`
        : `₹${totalNetWorth.toLocaleString('en-IN')}`;
    }

    // ── Breakdown row: Cash | Assets | Debt ──────────────────────────
    const nwBreakdown = document.getElementById('nwBreakdown');
    if (nwBreakdown) {
      nwBreakdown.classList.remove('hidden');
      const cashEl = document.getElementById('nwCash');
      const assEl  = document.getElementById('nwAssets');
      const debtEl = document.getElementById('nwDebt');

      if (cashEl) {
        const cashFormatted = cashIsNeg
          ? `-₹${Math.abs(liquidCash).toLocaleString('en-IN')}`
          : `₹${liquidCash.toLocaleString('en-IN')}`;
        if (cashIsNeg) {
          cashEl.innerHTML = `<span class="text-red-400 font-bold">${cashFormatted} ⚠</span>`;
        } else {
          cashEl.innerText = cashFormatted;
          cashEl.className = 'text-white font-semibold';
        }
      }

      if (assEl)  assEl.innerText  = `₹${totalAssetValue.toLocaleString('en-IN')}`;
      if (debtEl) debtEl.innerText = `-₹${totalDebtValue.toLocaleString('en-IN')}`;
    }

  }, ['transactions', 'assets', 'debts']); // ← only these three trigger a re-render
}
