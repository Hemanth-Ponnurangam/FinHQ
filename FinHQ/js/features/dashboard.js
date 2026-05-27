import { store } from '../store.js';

// ── Main export ─────────────────────────────────────────────────────────────
export function initDashboard() {
  store.subscribe(state => {
    if (!state.isLoaded) return;

    let liquidCash         = 0;
    let totalAssetValue    = 0;
    let totalDebtValue     = 0;
    // ── Transactions ───────────────────────────────────────────────
    state.transactions.forEach(txn => {
      const amt = txn.amount || 0;

      // BUG FIX 2: Investment-tagged expenses represent money that moved from
      // liquid cash into an asset already tracked in totalAssetValue.
      // Deducting them from liquidCash AND counting them in assets double-counts
      // that capital in the net-worth formula (liquidCash + assets - debts).
      const isInvestmentExpense =
        txn.type === 'expense' &&
        txn.tags?.some(t => t.toLowerCase() === 'investments');

      if (txn.type === 'income') {
        liquidCash += amt;
      } else if (isInvestmentExpense) {
        // Capital moved to an asset — excluded from liquidCash to prevent double-count.
      } else {
        liquidCash -= amt;
      }
    });

    // ── Assets ─────────────────────────────────────────────────────
    state.assets.forEach(asset => {
      const qty   = asset.qty || 1;
      const price = asset.currentPrice !== undefined
        ? asset.currentPrice
        : (asset.buyPrice || 0);
      totalAssetValue += qty * price;
    });

    // ── Debts ──────────────────────────────────────────────────────
    state.debts.forEach(debt => {
      totalDebtValue += (debt.principal || 0) - (debt.paid || 0);
    });

    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    const nwIsNeg       = totalNetWorth < 0;
    const cashIsNeg     = liquidCash < 0; // BUG FIX 1: track negative-cash state

    // ── Hide skeletons ─────────────────────────────────────────────
    document.getElementById('nwSkeleton')?.classList.add('hidden');

    // ── Net Worth ──────────────────────────────────────────────────
    const nwDisplay = document.getElementById('netWorthDisplay');
    if (nwDisplay) {
      nwDisplay.classList.remove('hidden');
      nwDisplay.innerText = nwIsNeg
        ? `-₹${Math.abs(totalNetWorth).toLocaleString('en-IN')}`
        : `₹${totalNetWorth.toLocaleString('en-IN')}`;
    }

    // ── Breakdown row: Cash | Assets | Debt ─────────────────────────
    const nwBreakdown = document.getElementById('nwBreakdown');
    if (nwBreakdown) {
      nwBreakdown.classList.remove('hidden');
      const cashEl = document.getElementById('nwCash');
      const assEl  = document.getElementById('nwAssets');
      const debtEl = document.getElementById('nwDebt');

      if (cashEl) {
        // BUG FIX 1: if liquid cash went negative, render it red with a warning glyph
        // so the user can't miss it on the hub card.
        const cashFormatted = cashIsNeg
          ? `-₹${Math.abs(liquidCash).toLocaleString('en-IN')}`
          : `₹${liquidCash.toLocaleString('en-IN')}`;

        if (cashIsNeg) {
          cashEl.innerHTML =
            `<span class="text-red-400 font-bold">${cashFormatted} ⚠</span>`;
        } else {
          cashEl.innerText = cashFormatted;
          cashEl.className = 'text-white font-semibold'; // reset to original
        }
      }

      if (assEl)  assEl.innerText  = `₹${totalAssetValue.toLocaleString('en-IN')}`;
      if (debtEl) debtEl.innerText = `-₹${totalDebtValue.toLocaleString('en-IN')}`;
    }

    // ── Module subtitles ───────────────────────────────────────────
    const lSum = document.getElementById('ledgerSummary');
    const wSum = document.getElementById('wealthSummary');
    const dSum = document.getElementById('debtSummary');
    if (lSum) { lSum.classList.remove('animate-pulse'); lSum.innerText = `${state.transactions.length} total txns`; }
    if (wSum) { wSum.classList.remove('animate-pulse'); wSum.innerText = `${state.assets.length} active assets`; }
    if (dSum) { dSum.classList.remove('animate-pulse'); dSum.innerText = `${state.debts.length} active loans`; }

  });
}
