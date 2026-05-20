import { db, collection } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initAnalytics() {
  const expenseCtx = document.getElementById('expensePieChart');
  const incomeCtx = document.getElementById('incomePieChart');
  const cashflowCtx = document.getElementById('cashflowLineChart');
  const assetCtx = document.getElementById('assetDonutChart');
  const nwCtx = document.getElementById('nwHistoryChart');
  
  const timeFilter = document.getElementById('analyticsTimeFilter');
  const momText = document.getElementById('momSpendChange');
  const topCatText = document.getElementById('topCategoriesText');

  let expenseChart = null; 
  let incomeChart = null; 
  let cashflowChart = null; 
  let assetChart = null;
  let nwChart = null;
  
  let allTransactions = []; 
  let allAssets = [];

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
    const monthlyNetWorth = {}; 
    
    let runningLiquidCash = 0; 

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}`;
    let prevMonth = new Date(now); prevMonth.setMonth(now.getMonth() - 1);
    const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth()+1).padStart(2, '0')}`;

    // Sort oldest to newest for accurate running totals
    const sortedTxns = [...allTransactions].sort((a,b) => a.timestamp - b.timestamp);

    sortedTxns.forEach(txn => {
      const txnDate = txn.date ? new Date(txn.date) : new Date();
      const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth()+1).padStart(2, '0')}`;
      
      // Running total of cash for Net Worth History
      if (txn.type === 'income') runningLiquidCash += (txn.amount || 0);
      if (txn.type === 'expense') runningLiquidCash -= (txn.amount || 0);
      monthlyNetWorth[monthKey] = runningLiquidCash;

      // Cashflow Math
      if (!monthlyCashflow[monthKey]) monthlyCashflow[monthKey] = { in: 0, out: 0 };
      if (txn.type === 'income') monthlyCashflow[monthKey].in += (txn.amount || 0);
      if (txn.type === 'expense') monthlyCashflow[monthKey].out += (txn.amount || 0);

      // Pie Chart Math (Respects Time Filter)
      if (txnDate >= startDate) {
        const tag = (txn.tags && txn.tags[0]) ? txn.tags[0] : 'Uncategorized';
        if (txn.type === 'expense') expTotals[tag] = (expTotals[tag] || 0) + (txn.amount || 0);
        if (txn.type === 'income') incTotals[tag] = (incTotals[tag] || 0) + (txn.amount || 0);
      }
    });

    // Asset Math
    const assetTotals = {};
    let totalAssetsNow = 0;
    allAssets.forEach(asset => {
      const qty = asset.qty || 1;
      const currentPrice = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);
      const val = qty * currentPrice;
      totalAssetsNow += val;
      const cat = asset.category || 'Other';
      assetTotals[cat] = (assetTotals[cat] || 0) + val;
    });

    // Helper to toggle Empty States
    const toggleEmpty = (canvasId, emptyId, hasData) => {
      document.getElementById(canvasId)?.classList.toggle('hidden', !hasData);
      document.getElementById(emptyId)?.classList.toggle('hidden', hasData);
    };

    // --- 1. Net Worth History Line Chart ---
    let sortedNwMonths = Object.keys(monthlyNetWorth).sort();
    const nwData = sortedNwMonths.map(m => monthlyNetWorth[m] + totalAssetsNow);
    
    toggleEmpty('nwHistoryChart', 'nwEmpty', nwData.length > 0);
    if (nwCtx && nwData.length > 0) {
      if (nwChart) nwChart.destroy();
      nwChart = new Chart(nwCtx, {
        type: 'line',
        data: { labels: sortedNwMonths, datasets: [{ label: 'Net Worth', data: nwData, borderColor: '#C8963E', backgroundColor: 'rgba(200, 150, 62, 0.1)', fill: true, tension: 0.4 }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { display: false } } }
      });
    }

    // --- 2. Cashflow Trend Bar Chart ---
    let sortedMonths = Object.keys(monthlyCashflow).sort();
    if (timeFilter?.value !== 'allTime') {
      const startKey = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2, '0')}`;
      sortedMonths = sortedMonths.filter(m => m >= startKey);
    } else {
      sortedMonths = sortedMonths.slice(-6); 
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

    // --- 3. Expense Donut Chart ---
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

    // --- 4. Income Donut Chart ---
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

    // --- 5. Asset Donut Chart ---
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

    // --- Text Summaries ---
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

    if (topCatText) {
      const top3 = Object.entries(expTotals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(entry => entry[0]);
      topCatText.innerText = top3.length > 0 ? top3.join(', ') : "No expenses";
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
