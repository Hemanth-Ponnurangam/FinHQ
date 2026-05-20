import { db, collection } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initAnalytics() {
  const expenseCtx = document.getElementById('expensePieChart');
  const incomeCtx = document.getElementById('incomePieChart');
  const cashflowCtx = document.getElementById('cashflowLineChart');
  const assetCtx = document.getElementById('assetDonutChart');
  const timeFilter = document.getElementById('analyticsTimeFilter');

  const momText = document.getElementById('momSpendChange');
  const topCatText = document.getElementById('topCategoriesText');

  let expenseChart = null; let incomeChart = null; 
  let cashflowChart = null; let assetChart = null;
  
  let allTransactions = []; let allAssets = [];

  function getStartDate() {
    const filter = timeFilter?.value || 'allTime';
    const d = new Date();
    if (filter === 'thisMonth') { d.setDate(1); d.setHours(0,0,0,0); } 
    else if (filter === 'last3Months') { d.setMonth(d.getMonth() - 3); d.setDate(1); d.setHours(0,0,0,0); } 
    else if (filter === 'thisYear') { d.setMonth(0, 1); d.setHours(0,0,0,0); } 
    else return new Date(0);
    return d;
  }

  function renderCharts() {
    const startDate = getStartDate();
    const expTotals = {}; const incTotals = {}; const monthlyCashflow = {};
    
    // Variables for MoM Math
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}`;
    let prevMonth = new Date(now); prevMonth.setMonth(now.getMonth() - 1);
    const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth()+1).padStart(2, '0')}`;

    allTransactions.forEach(txn => {
      const txnDate = txn.date ? new Date(txn.date) : new Date();
      const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth()+1).padStart(2, '0')}`;
      
      // Calculate Cashflow regardless of time filter
      if (!monthlyCashflow[monthKey]) monthlyCashflow[monthKey] = { in: 0, out: 0 };
      if (txn.type === 'income') monthlyCashflow[monthKey].in += (txn.amount || 0);
      if (txn.type === 'expense') monthlyCashflow[monthKey].out += (txn.amount || 0);

      // Populate Pie charts only if within Time Filter
      if (txnDate >= startDate) {
        const tag = (txn.tags && txn.tags[0]) ? txn.tags[0] : 'Uncategorized';
        if (txn.type === 'expense') expTotals[tag] = (expTotals[tag] || 0) + (txn.amount || 0);
        if (txn.type === 'income') incTotals[tag] = (incTotals[tag] || 0) + (txn.amount || 0);
      }
    });

    // --- NEW: MoM Spend Math ---
    if (momText) {
      const currSpend = monthlyCashflow[currentMonthKey]?.out || 0;
      const prevSpend = monthlyCashflow[prevMonthKey]?.out || 0;
      
      if (prevSpend === 0) {
        momText.innerText = `₹${currSpend.toLocaleString('en-IN')}`;
        momText.className = "font-semibold text-lg dark:text-white";
      } else {
        const percentChange = ((currSpend - prevSpend) / prevSpend) * 100;
        const isUp = percentChange > 0;
        momText.innerText = `${isUp ? '+' : ''}${percentChange.toFixed(1)}% vs prev`;
        momText.className = `font-semibold text-lg ${isUp ? 'text-red-500' : 'text-green-500'}`;
      }
    }

    // --- NEW: Top 3 Categories ---
    if (topCatText) {
      const top3 = Object.entries(expTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => entry[0]);
      topCatText.innerText = top3.length > 0 ? top3.join(', ') : "No expenses";
    }

    // Helper to toggle Empty States
    const toggleEmpty = (canvasId, emptyId, hasData) => {
      document.getElementById(canvasId)?.classList.toggle('hidden', !hasData);
      document.getElementById(emptyId)?.classList.toggle('hidden', hasData);
    };

    // Draw Expense Pie
    const hasExp = Object.keys(expTotals).length > 0;
    toggleEmpty('expensePieChart', 'expenseEmpty', hasExp);
    if (expenseCtx && hasExp) {
      if (expenseChart) expenseChart.destroy();
      expenseChart = new Chart(expenseCtx, {
        type: 'doughnut',
        data: { labels: Object.keys(expTotals), datasets: [{ data: Object.values(expTotals), borderWidth: 0, backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'] }] },
        options: { plugins: { legend: { position: 'right' } }, cutout: '65%' }
      });
    }

    // Draw Income Pie
    const hasInc = Object.keys(incTotals).length > 0;
    toggleEmpty('incomePieChart', 'incomeEmpty', hasInc);
    if (incomeCtx && hasInc) {
      if (incomeChart) incomeChart.destroy();
      incomeChart = new Chart(incomeCtx, {
        type: 'doughnut',
        data: { labels: Object.keys(incTotals), datasets: [{ data: Object.values(incTotals), borderWidth: 0, backgroundColor: ['#10b981', '#3b82f6', '#06b6d4', '#8b5cf6', '#64748b'] }] },
        options: { plugins: { legend: { position: 'right' } }, cutout: '65%' }
      });
    }

    // Draw Cashflow History Line (Respects Time Filter via filtering keys)
    let sortedMonths = Object.keys(monthlyCashflow).sort();
    
    // If a time filter is applied, only show the months within that boundary.
    // Otherwise, default to the last 6 months for readability.
    if (timeFilter?.value !== 'allTime') {
      const startKey = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2, '0')}`;
      sortedMonths = sortedMonths.filter(m => m >= startKey);
    } else {
      sortedMonths = sortedMonths.slice(-6); // Cap at 6 for All-Time to prevent crowding
    }

    const hasCashflow = sortedMonths.length > 0;
    toggleEmpty('cashflowLineChart', 'cashflowEmpty', hasCashflow);

    if (cashflowCtx && hasCashflow) {
      const netFlows = sortedMonths.map(m => monthlyCashflow[m].in - monthlyCashflow[m].out);
      if (cashflowChart) cashflowChart.destroy();
      cashflowChart = new Chart(cashflowCtx, {
        type: 'bar',
        data: { labels: sortedMonths, datasets: [{ label: 'Net Cashflow', data: netFlows, backgroundColor: netFlows.map(v => v >= 0 ? '#10b981' : '#ef4444'), borderRadius: 4 }] }
      });
    }

    // 2. Process Assets
    const assetTotals = {};
    allAssets.forEach(asset => {
      const qty = asset.qty || 1;
      const currentPrice = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);
      const cat = asset.category || 'Other';
      assetTotals[cat] = (assetTotals[cat] || 0) + (qty * currentPrice);
    });

    const hasAssets = Object.keys(assetTotals).length > 0;
    toggleEmpty('assetDonutChart', 'assetEmpty', hasAssets);

    if (assetCtx && hasAssets) {
      if (assetChart) assetChart.destroy();
      assetChart = new Chart(assetCtx, {
        type: 'doughnut',
        data: { labels: Object.keys(assetTotals), datasets: [{ data: Object.values(assetTotals), borderWidth: 0, backgroundColor: ['#C8963E', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'] }] },
        options: { plugins: { legend: { position: 'right' } }, cutout: '65%' }
      });
    }
  }

  timeFilter?.addEventListener('change', renderCharts);

  const handleDbError = (err) => console.error("Analytics Sync Error:", err);

  onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "asc")), (snapshot) => {
    allTransactions = snapshot.docs.map(doc => doc.data());
    renderCharts();
  }, handleDbError);

  onSnapshot(query(collection(db, "assets")), (snapshot) => {
    allAssets = snapshot.docs.map(doc => doc.data());
    renderCharts();
  }, handleDbError);
}
