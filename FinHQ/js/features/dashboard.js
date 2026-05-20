import { db, collection } from '../firebase.js';
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDashboard() {
  let liquidCash = 0; 
  let currentMonthSpend = 0; 
  let currentMonthIncome = 0;
  let totalAssetValue = 0; 
  let totalDebtValue = 0;

  function updateUI() {
    // 1. Calculate True Net Worth
    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    const nwIsNeg = totalNetWorth < 0;
    
    // 2. Calculate Savings Rate & Handle Warning
    let savingsRate = 0;
    const warningEl = document.getElementById('savingsRateWarning');
    
    if (currentMonthIncome > 0) {
      savingsRate = ((currentMonthIncome - currentMonthSpend) / currentMonthIncome) * 100;
      if (warningEl) warningEl.classList.add('hidden'); // Hide warning if income exists
    } else {
      if (warningEl) warningEl.classList.remove('hidden'); // Show warning if no income
    }

    // 3. Update the DOM
    const nwDisplay = document.getElementById('netWorthDisplay');
    const spendDisplay = document.getElementById('monthSpendDisplay');
    const savingsDisplay = document.getElementById('savingsRateDisplay');

    if(nwDisplay) {
      nwDisplay.innerText = nwIsNeg 
        ? `-₹${Math.abs(totalNetWorth).toLocaleString('en-IN')}` 
        : `₹${totalNetWorth.toLocaleString('en-IN')}`;
    }
    
    if(spendDisplay) {
      spendDisplay.innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;
    }
    
    if(savingsDisplay) {
      savingsDisplay.innerText = `${savingsRate.toFixed(1)}%`;
      savingsDisplay.className = `font-display text-2xl font-semibold ${savingsRate >= 0 ? 'text-forest-900 dark:text-white' : 'text-red-500'}`;
    }
  }

  // ==========================================
  // 1. TRANSACTIONS (Cash & Burn Rate)
  // ==========================================
  onSnapshot(collection(db, "transactions"), (snapshot) => {
    liquidCash = 0; 
    currentMonthSpend = 0; 
    currentMonthIncome = 0;
    
    const now = new Date();
    
    snapshot.forEach(doc => {
      const txn = doc.data();
      const amount = txn.amount || 0;
      const dateStr = txn.date || new Date().toISOString(); // Fallback for missing dates
      const date = new Date(dateStr);
      
      const isCurrentMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      
      if (txn.type === 'income') { 
        liquidCash += amount; 
        if (isCurrentMonth) currentMonthIncome += amount; 
      }
      if (txn.type === 'expense') { 
        liquidCash -= amount; 
        if (isCurrentMonth) currentMonthSpend += amount; 
      }
    });
    updateUI();
  });

  // ==========================================
  // 2. ASSETS (Wealth Portfolio)
  // ==========================================
  onSnapshot(collection(db, "assets"), (snapshot) => {
    totalAssetValue = 0;
    snapshot.forEach(doc => {
      const asset = doc.data();
      
      // SAFE MATH: Fallback to 1 for qty, and check for old currentValue field
      const safeQty = asset.qty || 1;
      const safePrice = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);
      
      totalAssetValue += (safeQty * safePrice);
    }); 
    updateUI();
  });

  // ==========================================
  // 3. DEBTS (Liabilities & Loans)
  // ==========================================
  onSnapshot(collection(db, "debts"), (snapshot) => {
    totalDebtValue = 0;
    snapshot.forEach(doc => {
      const debt = doc.data();
      
      // SAFE MATH: Subtract what has been paid off from the principal
      const principal = debt.principal || 0;
      const paid = debt.paid || 0;
      
      totalDebtValue += (principal - paid);
    });
    updateUI();
  });
}
