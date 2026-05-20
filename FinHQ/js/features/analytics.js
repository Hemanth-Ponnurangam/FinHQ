import { db, collection } from '../firebase.js';
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initAnalytics() {
  const expenseCtx = document.getElementById('expensePieChart');
  const assetCtx = document.getElementById('assetDonutChart');

  if (!expenseCtx || !assetCtx) return;

  let expenseChart = null;
  let assetChart = null;

  // 1. Generate Expense Pie Chart (Grouped by Tag)
  onSnapshot(collection(db, "transactions"), (snapshot) => {
    const categoryTotals = {};
    
    snapshot.forEach(doc => {
      const txn = doc.data();
      if (txn.type === 'expense') {
        // Fallback to 'Uncategorized' if no tag is provided
        const tag = txn.tags && txn.tags.length > 0 ? txn.tags[0] : 'Uncategorized';
        categoryTotals[tag] = (categoryTotals[tag] || 0) + txn.amount;
      }
    });

    if (expenseChart) expenseChart.destroy(); // Clear old chart on live update
    
    expenseChart = new Chart(expenseCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(categoryTotals),
        datasets: [{
          data: Object.values(categoryTotals),
          backgroundColor: ['#3D9162', '#52B788', '#C8963E', '#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b'],
          borderWidth: 0 // Clean modern look
        }]
      },
      options: {
        responsive: true,
        plugins: { 
          legend: { position: 'right', labels: { color: '#9ca3af', font: { family: "'DM Sans', sans-serif" } } } 
        }
      }
    });
  });

  // 2. Generate Asset Allocation Donut Chart (Grouped by Category)
  onSnapshot(collection(db, "assets"), (snapshot) => {
    const assetTotals = {};
    
    snapshot.forEach(doc => {
      const asset = doc.data();
      const currentValue = asset.qty * asset.currentPrice;
      assetTotals[asset.category] = (assetTotals[asset.category] || 0) + currentValue;
    });

    if (assetChart) assetChart.destroy();
    
    assetChart = new Chart(assetCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(assetTotals),
        datasets: [{
          data: Object.values(assetTotals),
          backgroundColor: ['#0D3B2A', '#164D38', '#C8963E', '#f59e0b', '#10b981'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        cutout: '75%', // Makes it a thin, modern donut
        plugins: { 
          legend: { position: 'right', labels: { color: '#9ca3af', font: { family: "'DM Sans', sans-serif" } } } 
        }
      }
    });
  });
}
