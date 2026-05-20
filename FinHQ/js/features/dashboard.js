import { db, collection } from '../firebase.js';
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDashboard() {
  let liquidCash = 0;
  let currentMonthSpend = 0;
  let totalAssetValue = 0;

  function updateUI() {
    const totalNetWorth = liquidCash + totalAssetValue;
    
    document.getElementById('netWorthDisplay').innerText = `₹${totalNetWorth.toLocaleString('en-IN')}`;
    document.getElementById('liquidCashDisplay').innerText = `₹${liquidCash.toLocaleString('en-IN')}`;
    document.getElementById('monthSpendDisplay').innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;
  }

  // Listen to Transactions
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

  // Listen to Assets
  onSnapshot(collection(db, "assets"), (snapshot) => {
    totalAssetValue = 0;
    snapshot.forEach(doc => totalAssetValue += doc.data().currentValue);
    updateUI();
  });
}