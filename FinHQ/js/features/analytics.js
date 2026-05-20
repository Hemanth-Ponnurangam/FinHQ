import { db, collection } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initAnalytics() {
  const expenseCtx = document.getElementById('expensePieChart');
  const incomeCtx = document.getElementById('incomePieChart');
  const cashflowCtx = document.getElementById('cashflowLineChart');
  const assetCtx = document.getElementById('assetDonutChart'); // Now matches HTML!
  const timeFilter = document.getElementById('analyticsTimeFilter');

  let expenseChart = null; 
  let incomeChart = null; 
  let cashflowChart = null;
  let assetChart = null;
  
  let allTransactions = []; 
  let allAssets = [];

  function getStartDate() {
    const filter = timeFilter?.value || 'allTime';
    const d = new Date();
    if (filter === 'thisMonth') {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
    } else if (filter === 'last3Months') {
      d.setMonth(d.getMonth() - 3);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
    } else if (filter === 'thisYear') {
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
    } else {
      return new Date(0); // All time
    }
    return d;
  }

  function renderCharts() {
    const startDate = getStartDate();

    // 1. Process Transactions (Cashflow, Income, Expenses)
    const expTotals = {}; 
    const incTotals = {}; 
    const monthlyCashflow = {};

    allTransactions.forEach(txn => {
      // Safe date parsing
      const txnDate = txn.date ? new Date(txn.date) : new Date();
      const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth()+1).padStart(2, '0')}`;
      
      // Always track Cashflow history regardless of time filter for the 6M trend
      if (!monthlyCashflow[monthKey]) monthlyCashflow[monthKey] = { in: 0, out: 0 };
      if (txn.type === 'income') monthlyCashflow[monthKey].in += (txn.amount || 0);
      if (txn.type === 'expense') monthlyCashflow[monthKey].out += (txn.amount || 0);

      // Filter Pie Charts strictly by the selected Time Boundary
      if (txnDate >= startDate) {
        const tag = (txn.tags && txn.tags[0]) ? txn.tags[0] : 'Uncategorized';
        if (txn.type === 'expense') expTotals[tag] = (expTotals[tag] || 0) + (txn.amount || 0);
        if (txn.type === 'income') incTotals[tag] = (incTotals[tag] || 0) + (txn.amount || 0);
      }
    });

    // Draw Expense Pie
    if (expenseCtx) {
      if (expenseChart) expenseChart.destroy();
      expenseChart = new Chart(expenseCtx, {
        type: 'doughnut',
        data: { labels: Object.keys(expTotals), datasets: [{ data: Object.values(expTotals), borderWidth: 0, backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'] }] },
        options: { plugins: { legend: { position: 'right' } }, cutout: '65%' }
      });
    }

    // Draw Income Pie
    if (incomeCtx) {
      if (incomeChart) incomeChart.destroy();
      incomeChart = new Chart(incomeCtx, {
        type: 'doughnut',
        data: { labels: Object.keys(incTotals), datasets: [{ data: Object.values(incTotals), borderWidth: 0, backgroundColor: ['#10b981', '#3b82f6', '#06b6d4', '#8b5cf6', '#64748b'] }] },
        options: { plugins: { legend: { position: 'right' } }, cutout: '65%' }
      });
    }

    // Draw Cashflow History Line (Last 6 Months)
    if (cashflowCtx) {
      const sortedMonths = Object.keys(monthlyCashflow).sort().slice(-6);
      const netFlows = sortedMonths.map(m => monthlyCashflow[m].in - monthlyCashflow[m].out);

      if (cashflowChart) cashflowChart.destroy();
      cashflowChart = new Chart(cashflowCtx, {
        type: 'bar',
        data: {
          labels: sortedMonths,
          datasets: [{ label: 'Net Cashflow', data: netFlows, backgroundColor: netFlows.map(v => v >= 0 ? '#10b981' : '#ef4444'), borderRadius: 4 }]
        }
      });
    }

    // 2. Process Assets (Donut Chart)
    if (assetCtx) {
      const assetTotals = {};
      allAssets.forEach(asset => {
        // Safe math fallback
        const qty = asset.qty || 1;
        const currentPrice = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);
        const val = qty * currentPrice;
        
        const cat = asset.category || 'Other';
        assetTotals[cat] = (assetTotals[cat] || 0) + val;
      });

      if (assetChart) assetChart.destroy();
      assetChart = new Chart(assetCtx, {
        type: 'doughnut',
        data: { labels: Object.keys(assetTotals), datasets: [{ data: Object.values(assetTotals), borderWidth: 0, backgroundColor: ['#C8963E', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'] }] },
        options: { plugins: { legend: { position: 'right' } }, cutout: '65%' }
      });
    }
  }

  // Bind the Time Filter Dropdown
  timeFilter?.addEventListener('change', renderCharts);

  // Centralized Error Handler
  const handleDbError = (err) => console.error("Analytics Sync Error:", err);

  // Listeners (Unlimited data for accurate all-time reporting)
  onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "asc")), (snapshot) => {
    allTransactions = snapshot.docs.map(doc => doc.data());
    renderCharts();
  }, handleDbError);

  onSnapshot(query(collection(db, "assets")), (snapshot) => {
    allAssets = snapshot.docs.map(doc => doc.data());
    renderCharts();
  }, handleDbError);
}
