import { db, collection } from '../firebase.js';
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDashboard() {
  let liquidCash = 0;
  let currentMonthSpend = 0;
  let totalAssetValue = 0;
  let totalDebtValue = 0;

  function updateUI() {
    // THE ULTIMATE FORMULA
    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    
    // Formatting to handle negatives correctly
    const nwIsNeg = totalNetWorth < 0;
    const nwFormatted = Math.abs(totalNetWorth).toLocaleString('en-IN');
    
    document.getElementById('netWorthDisplay').innerText = nwIsNeg ? `-₹${nwFormatted}` : `₹${nwFormatted}`;
    document.getElementById('liquidCashDisplay').innerText = `₹${liquidCash.toLocaleString('en-IN')}`;
    document.getElementById('monthSpendDisplay').innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;
  }

  // 1. Listen to Transactions
  onSnapshot(collection(db, "transactions"), (snapshot) => {
    liquidCash = 0; currentMonthSpend = 0;
    const now = new Date();
    
    snapshot.forEach(doc => {
      const txn = doc.data();
      const date = new Date(txn.date);
      
      if (txn.type === 'income') liquidCash += txn.amount;
      if (txn.type === 'expense') {
        liquidCash -= txn.amount;
        if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
          currentMonthSpend += txn.amount;
        }
      }
    });
    updateUI();
  });

  // 2. Listen to Assets
  onSnapshot(collection(db, "assets"), (snapshot) => {
    totalAssetValue = 0;
    snapshot.forEach(doc => totalAssetValue += doc.data().currentValue);
    updateUI();
  });

  // 3. Listen to Debts (NEW)
  onSnapshot(collection(db, "debts"), (snapshot) => {
    totalDebtValue = 0;
    snapshot.forEach(doc => totalDebtValue += doc.data().principal);
    updateUI();
  });
}
