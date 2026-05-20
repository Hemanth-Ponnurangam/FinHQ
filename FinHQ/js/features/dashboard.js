import { db, collection } from '../firebase.js';
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDashboard() {
  let liquidCash = 0; let currentMonthSpend = 0; let currentMonthIncome = 0;
  let totalAssetValue = 0; let totalDebtValue = 0;
  
  // Track counts for the Hub Module summaries
  let txnThisMonthCount = 0; 
  let totalAssetsCount = 0;
  let totalDebtsCount = 0;

  // Quality 4 FIX: Debounce the UI updates so 3 rapid DB loads don't flicker the screen
  let updatePending = false;

  function scheduleUpdate() {
    if (!updatePending) {
      updatePending = true;
      requestAnimationFrame(updateUI);
    }
  }

  function updateUI() {
    updatePending = false;
    
    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    const nwIsNeg = totalNetWorth < 0;
    
    let savingsRate = 0;
    const warningEl = document.getElementById('savingsRateWarning');
    
    if (currentMonthIncome > 0) {
      savingsRate = ((currentMonthIncome - currentMonthSpend) / currentMonthIncome) * 100;
      if (warningEl) warningEl.classList.add('hidden');
    } else {
      if (warningEl) warningEl.classList.remove('hidden');
    }

    // --- UX 9 FIX: Hide Skeletons, Show Data ---
    document.getElementById('nwSkeleton')?.classList.add('hidden');
    document.getElementById('savingsSkeleton')?.classList.add('hidden');
    document.getElementById('spendSkeleton')?.classList.add('hidden');

    const nwDisplay = document.getElementById('netWorthDisplay');
    const spendDisplay = document.getElementById('monthSpendDisplay');
    const savingsDisplay = document.getElementById('savingsRateDisplay');

    if(nwDisplay) {
      nwDisplay.classList.remove('hidden');
      nwDisplay.innerText = nwIsNeg ? `-₹${Math.abs(totalNetWorth).toLocaleString('en-IN')}` : `₹${totalNetWorth.toLocaleString('en-IN')}`;
    }
    
    if(spendDisplay) {
      spendDisplay.classList.remove('hidden');
      spendDisplay.innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;
    }
    
    if(savingsDisplay) {
      savingsDisplay.classList.remove('hidden');
      savingsDisplay.innerText = `${savingsRate.toFixed(1)}%`;
      savingsDisplay.className = `font-display text-2xl font-semibold ${savingsRate >= 0 ? 'text-forest-900 dark:text-white' : 'text-red-500'}`;
    }

    // --- UX 10 FIX: Update Module Card Summaries ---
    const lSum = document.getElementById('ledgerSummary');
    const wSum = document.getElementById('wealthSummary');
    const dSum = document.getElementById('debtSummary');
    
    if(lSum) { lSum.classList.remove('animate-pulse'); lSum.innerText = `${txnThisMonthCount} entries this mo`; }
    if(wSum) { wSum.classList.remove('animate-pulse'); wSum.innerText = `${totalAssetsCount} active assets`; }
    if(dSum) { dSum.classList.remove('animate-pulse'); dSum.innerText = `${totalDebtsCount} active loans`; }
  }

  // Quality 8 FIX: Centralized Error Handler
  const handleDbError = (err) => console.error("Firestore sync failed:", err);

  // 1. Transactions
  onSnapshot(collection(db, "transactions"), (snapshot) => {
    liquidCash = 0; currentMonthSpend = 0; currentMonthIncome = 0; txnThisMonthCount = 0;
    const now = new Date();
    
    snapshot.forEach(doc => {
      const txn = doc.data();
      const amount = txn.amount || 0;
      const dateStr = txn.date || new Date().toISOString();
      const date = new Date(dateStr);
      
      const isCurrentMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      if (isCurrentMonth) txnThisMonthCount++;

      if (txn.type === 'income') { liquidCash += amount; if (isCurrentMonth) currentMonthIncome += amount; }
      if (txn.type === 'expense') { liquidCash -= amount; if (isCurrentMonth) currentMonthSpend += amount; }
    });
    scheduleUpdate();
  }, handleDbError);

  // 2. Assets
  onSnapshot(collection(db, "assets"), (snapshot) => {
    totalAssetValue = 0; totalAssetsCount = snapshot.size;
    snapshot.forEach(doc => {
      const asset = doc.data();
      const safeQty = asset.qty || 1;
      const safePrice = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);
      totalAssetValue += (safeQty * safePrice);
    }); 
    scheduleUpdate();
  }, handleDbError);

  // 3. Debts
  onSnapshot(collection(db, "debts"), (snapshot) => {
    totalDebtValue = 0; totalDebtsCount = snapshot.size;
    snapshot.forEach(doc => {
      const debt = doc.data();
      const principal = debt.principal || 0;
      const paid = debt.paid || 0;
      totalDebtValue += (principal - paid);
    });
    scheduleUpdate();
  }, handleDbError);
}
