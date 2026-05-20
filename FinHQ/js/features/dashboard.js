import { db, collection } from '../firebase.js';
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDashboard() {
  let liquidCash = 0; let currentMonthSpend = 0; let currentMonthIncome = 0;
  let totalAssetValue = 0; let totalDebtValue = 0;

  function updateUI() {
    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    const nwIsNeg = totalNetWorth < 0;
    
    let savingsRate = 0;
    if (currentMonthIncome > 0) {
      savingsRate = ((currentMonthIncome - currentMonthSpend) / currentMonthIncome) * 100;
      document.getElementById('savingsRateWarning')?.classList.add('hidden'); // Hide warning
    } else {
      document.getElementById('savingsRateWarning')?.classList.remove('hidden'); // Show warning (FIX 10)
    }

    const nwDisplay = document.getElementById('netWorthDisplay');
    const spendDisplay = document.getElementById('monthSpendDisplay');
    const savingsDisplay = document.getElementById('savingsRateDisplay');

    if(nwDisplay) nwDisplay.innerText = nwIsNeg ? `-₹${Math.abs(totalNetWorth).toLocaleString('en-IN')}` : `₹${totalNetWorth.toLocaleString('en-IN')}`;
    if(spendDisplay) spendDisplay.innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;
    if(savingsDisplay) {
      savingsDisplay.innerText = `${savingsRate.toFixed(1)}%`;
      savingsDisplay.className = `font-display text-2xl font-semibold ${savingsRate >= 0 ? 'text-forest-900 dark:text-white' : 'text-red-500'}`;
    }
  }

  onSnapshot(collection(db, "transactions"), (snapshot) => {
    liquidCash = 0; currentMonthSpend = 0; currentMonthIncome = 0;
    const now = new Date();
    
    snapshot.forEach(doc => {
      const txn = doc.data();
      const date = new Date(txn.date);
      const isCurrentMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      
      if (txn.type === 'income') { liquidCash += txn.amount; if (isCurrentMonth) currentMonthIncome += txn.amount; }
      if (txn.type === 'expense') { liquidCash -= txn.amount; if (isCurrentMonth) currentMonthSpend += txn.amount; }
    });
    updateUI();
  });

  onSnapshot(collection(db, "assets"), (snapshot) => {
    totalAssetValue = 0;
    snapshot.forEach(doc => totalAssetValue += (doc.data().qty * doc.data().currentPrice)); 
    updateUI();
  });

  onSnapshot(collection(db, "debts"), (snapshot) => {
    totalDebtValue = 0;
    // Uses true outstanding amount for net worth!
    snapshot.forEach(doc => totalDebtValue += (doc.data().principal - (doc.data().paid || 0)));
    updateUI();
  });
}
