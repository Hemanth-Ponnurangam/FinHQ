import { store } from '../store.js';

export function initDashboard() {
  store.subscribe(state => {
    // 1. Wait until Firestore has pushed the initial data payload
    if (!state.isLoaded) return;
    
    let liquidCash = 0; 
    let currentMonthSpend = 0; 
    let currentMonthIncome = 0;
    let totalAssetValue = 0; 
    let totalDebtValue = 0;
    
    const now = new Date();
    
    // 2. Transactions Math (Cashflow & Liquidity)
    state.transactions.forEach(txn => {
      const amt = txn.amount || 0;
      const d = txn.date ? new Date(txn.date) : new Date();
      const isCurrentMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      
      if (txn.type === 'income') { 
        liquidCash += amt; 
        if (isCurrentMonth) currentMonthIncome += amt; 
      } else { 
        liquidCash -= amt; 
        if (isCurrentMonth) currentMonthSpend += amt; 
      }
    });

    // 3. Assets Math (Wealth)
    state.assets.forEach(asset => {
      const qty = asset.qty || 1;
      const price = asset.currentPrice !== undefined ? asset.currentPrice : (asset.buyPrice || 0);
      totalAssetValue += (qty * price);
    });

    // 4. Debt Math (Liabilities)
    state.debts.forEach(debt => {
      const principal = debt.principal || 0;
      const paid = debt.paid || 0;
      totalDebtValue += (principal - paid);
    });

    // 5. Net Worth Calculation
    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    const nwIsNeg = totalNetWorth < 0;

    // --- DOM UPDATES ---

    // Hide Skeleton Loaders
    document.getElementById('nwSkeleton')?.classList.add('hidden');
    document.getElementById('savingsSkeleton')?.classList.add('hidden');
    document.getElementById('spendSkeleton')?.classList.add('hidden');

    const nwDisplay = document.getElementById('netWorthDisplay');
    const spendDisplay = document.getElementById('monthSpendDisplay');
    const savingsDisplay = document.getElementById('savingsRateDisplay');
    const warnEl = document.getElementById('savingsRateWarning');

    // Update Net Worth
    if (nwDisplay) {
      nwDisplay.classList.remove('hidden');
      nwDisplay.innerText = nwIsNeg 
        ? `-₹${Math.abs(totalNetWorth).toLocaleString('en-IN')}` 
        : `₹${totalNetWorth.toLocaleString('en-IN')}`;
    }
    
    // Update Monthly Spend
    if (spendDisplay) {
      spendDisplay.classList.remove('hidden');
      spendDisplay.innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;
    }
    
    // Update Savings Rate (With QA Fallback Logic)
    if (savingsDisplay) {
      savingsDisplay.classList.remove('hidden');
      
      if (currentMonthIncome > 0) {
        const rate = ((currentMonthIncome - currentMonthSpend) / currentMonthIncome) * 100;
        savingsDisplay.innerText = `${rate.toFixed(1)}%`;
        savingsDisplay.className = `font-display text-2xl font-semibold ${rate >= 0 ? 'text-forest-900 dark:text-white' : 'text-red-500'}`;
        warnEl?.classList.add('hidden');
      } else {
        // Safe fallback if no income logged this month yet
        savingsDisplay.innerText = '—';
        savingsDisplay.className = `font-display text-2xl font-semibold text-gray-400`;
        warnEl?.classList.remove('hidden');
      }
    }

    // Update Hub Module Dynamic Subtitles
    const lSum = document.getElementById('ledgerSummary');
    const wSum = document.getElementById('wealthSummary');
    const dSum = document.getElementById('debtSummary');
    
    if (lSum) { 
      lSum.classList.remove('animate-pulse'); 
      lSum.innerText = `${state.transactions.length} total txns`; 
    }
    if (wSum) { 
      wSum.classList.remove('animate-pulse'); 
      wSum.innerText = `${state.assets.length} active assets`; 
    }
    if (dSum) { 
      dSum.classList.remove('animate-pulse'); 
      dSum.innerText = `${state.debts.length} active loans`; 
    }
  });
}
