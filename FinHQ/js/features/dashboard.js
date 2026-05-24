import { store } from '../store.js';

export function initDashboard() {
  store.subscribe(state => {
    if (!state.isLoaded) return;

    let liquidCash        = 0;
    let currentMonthSpend = 0;
    let currentMonthIncome = 0;
    let totalAssetValue   = 0;
    let totalDebtValue    = 0;
    const now = new Date();

    // Transactions
    state.transactions.forEach(txn => {
      const amt = txn.amount || 0;
      const d   = txn.date ? new Date(txn.date) : new Date();
      const isCurrentMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (txn.type === 'income') {
        liquidCash += amt;
        if (isCurrentMonth) currentMonthIncome += amt;
      } else {
        liquidCash -= amt;
        if (isCurrentMonth) currentMonthSpend += amt;
      }
    });

    // Assets
    state.assets.forEach(asset => {
      const qty   = asset.qty || 1;
      const price = asset.currentPrice !== undefined ? asset.currentPrice : (asset.buyPrice || 0);
      totalAssetValue += qty * price;
    });

    // Debts
    state.debts.forEach(debt => {
      totalDebtValue += (debt.principal || 0) - (debt.paid || 0);
    });

    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    const nwIsNeg = totalNetWorth < 0;

    // Hide skeletons
    document.getElementById('nwSkeleton')?.classList.add('hidden');
    document.getElementById('savingsSkeleton')?.classList.add('hidden');
    document.getElementById('spendSkeleton')?.classList.add('hidden');

    // Net Worth + breakdown
    const nwDisplay = document.getElementById('netWorthDisplay');
    if (nwDisplay) {
      nwDisplay.classList.remove('hidden');
      nwDisplay.innerText = nwIsNeg
        ? `-₹${Math.abs(totalNetWorth).toLocaleString('en-IN')}`
        : `₹${totalNetWorth.toLocaleString('en-IN')}`;
    }

    // Breakdown row: Cash | Assets | Debt
    const nwBreakdown = document.getElementById('nwBreakdown');
    if (nwBreakdown) {
      nwBreakdown.classList.remove('hidden');
      const cashEl  = document.getElementById('nwCash');
      const assEl   = document.getElementById('nwAssets');
      const debtEl  = document.getElementById('nwDebt');
      if (cashEl)  cashEl.innerText  = `₹${liquidCash.toLocaleString('en-IN')}`;
      if (assEl)   assEl.innerText   = `₹${totalAssetValue.toLocaleString('en-IN')}`;
      if (debtEl)  debtEl.innerText  = `-₹${totalDebtValue.toLocaleString('en-IN')}`;
    }

    // Month Spend
    const spendDisplay = document.getElementById('monthSpendDisplay');
    if (spendDisplay) {
      spendDisplay.classList.remove('hidden');
      spendDisplay.innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;
    }

    // Savings Rate
    const savingsDisplay = document.getElementById('savingsRateDisplay');
    const warnEl         = document.getElementById('savingsRateWarning');
    if (savingsDisplay) {
      savingsDisplay.classList.remove('hidden');
      if (currentMonthIncome > 0) {
        const rate = ((currentMonthIncome - currentMonthSpend) / currentMonthIncome) * 100;
        savingsDisplay.innerText = `${rate.toFixed(1)}%`;
        savingsDisplay.className = `font-display text-2xl font-semibold ${rate >= 0 ? 'text-forest-900 dark:text-white' : 'text-red-500'}`;
        warnEl?.classList.add('hidden');
      } else {
        savingsDisplay.innerText = '—';
        savingsDisplay.className = 'font-display text-2xl font-semibold text-gray-400';
        warnEl?.classList.remove('hidden');
      }
    }

    // Module subtitles
    const lSum = document.getElementById('ledgerSummary');
    const wSum = document.getElementById('wealthSummary');
    const dSum = document.getElementById('debtSummary');
    if (lSum) { lSum.classList.remove('animate-pulse'); lSum.innerText = `${state.transactions.length} total txns`; }
    if (wSum) { wSum.classList.remove('animate-pulse'); wSum.innerText = `${state.assets.length} active assets`; }
    if (dSum) { dSum.classList.remove('animate-pulse'); dSum.innerText = `${state.debts.length} active loans`; }
  });
}
