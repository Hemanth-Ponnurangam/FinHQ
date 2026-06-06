/**
 * analytics.js — FinHQ Analytics Module
 *
 * BUG FIXES applied in this version:
 *  1. Dark-mode: Chart.js colors were hardcoded light-mode values.
 *     → getChartTheme() reads <html>.classList for dark, applies correct tick/grid/legend colors.
 *     → MutationObserver on <html> re-renders all charts on every dark-mode toggle.
 *
 *  2. Pie / donut 8-color overflow: a 9th category silently reused the first color.
 *     → Expanded PALETTE to 16 distinct colors; colors cycle via `i % PALETTE.length`.
 *
 *  3. "All Time" cashflow bar silently capped at 12 months.
 *     → Removed the `.slice(-12)` guard entirely for allTime.
 *     → For filter periods the bar chart already uses the correct date-range filter.
 *
 *  4. MoM metric always used the calendar current/previous month regardless of filter.
 *     → MoM now compares the two most-recent months that have data inside the selected period.
 *     → The label also shows which month is being compared against (e.g. "+12.3% vs 2025-04").
 *
 * FEATURE GAPS addressed:
 *  A. Savings Rate Trend line added as a second dataset on the Liquid Cash chart
 *     (dashed amber line, right-axis %). Gives the most-requested KPI without new HTML.
 *
 *  B. Donut center totals: a custom Chart.js plugin draws the ₹ total inside each
 *     doughnut hole — no more "sum the legend" mental arithmetic.
 */

import { store } from '../store.js';

export function initAnalytics() {
  // ── DOM refs ──────────────────────────────────────────────────────────────
  const expenseCtx  = document.getElementById('expensePieChart');
  const incomeCtx   = document.getElementById('incomePieChart');
  const cashflowCtx = document.getElementById('cashflowLineChart');
  const assetCtx    = document.getElementById('assetDonutChart');
  const nwCtx       = document.getElementById('nwHistoryChart');
  const timeFilter  = document.getElementById('analyticsTimeFilter');
  const momText     = document.getElementById('momSpendChange');
  const topCatText  = document.getElementById('topCategoriesText');

  let expenseChart  = null;
  let incomeChart   = null;
  let cashflowChart = null;
  let assetChart    = null;
  let nwChart       = null;

  // ── BUG FIX 2: expanded 16-slot palette — no more color reuse at slot 9 ──
  const PALETTE = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16',
    '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
    '#ec4899', '#64748b', '#14b8a6', '#a855f7',
    '#f43f5e', '#0ea5e9', '#22c55e', '#d97706',
  ];

  // ── BUG FIX 1: dark-mode aware theme helper ───────────────────────────────
  function getChartTheme() {
    const dark = document.documentElement.classList.contains('dark');
    return {
      tickColor  : dark ? '#9ca3af' : '#6b7280',
      gridColor  : dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      legendColor: dark ? '#e5e7eb' : '#374151',
      textColor  : dark ? '#f3f4f6' : '#1f2937',
    };
  }

  // ── GAP B: custom donut-center-total plugin ───────────────────────────────
  const centerTotalPlugin = {
    id: 'centerTotal',
    afterDraw(chart) {
      const opts = chart.config?.options?.plugins?.centerTotal;
      if (!opts?.display) return;
      const { ctx, chartArea: { top, right, bottom, left } } = chart;
      const cx    = (left + right) / 2;
      const cy    = (top  + bottom) / 2;
      const total = chart.data.datasets[0].data.reduce((s, v) => s + (v || 0), 0);
      const { textColor } = getChartTheme();
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = textColor;
      ctx.font         = `500 10px 'DM Sans', sans-serif`;
      ctx.fillText(opts.label || '', cx, cy - 9);
      ctx.font         = `bold 12px 'DM Sans', sans-serif`;
      ctx.fillText('₹' + Math.round(total).toLocaleString('en-IN'), cx, cy + 7);
      ctx.restore();
    },
  };

  // Register the plugin once globally
  if (!Chart.registry.plugins.get('centerTotal')) {
    Chart.register(centerTotalPlugin);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getStartDate() {
    const filter = timeFilter?.value || 'allTime';
    const d = new Date();
    if      (filter === 'thisMonth')    { d.setDate(1); d.setHours(0,0,0,0); }
    else if (filter === 'last3Months')  { d.setMonth(d.getMonth() - 3); d.setDate(1); d.setHours(0,0,0,0); }
    else if (filter === 'thisYear')     { d.setMonth(0, 1); d.setHours(0,0,0,0); }
    else return new Date(0);
    return d;
  }

  function parseTxnDate(dateStr) {
    if (!dateStr) return new Date();
    // Force local-midnight parsing (YYYY-MM-DD bare strings are UTC midnight
    // which, in IST +5:30, can land on the previous calendar day)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(dateStr);
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function renderCharts(state) {
    const theme     = getChartTheme();
    const filter    = timeFilter?.value || 'allTime';
    const startDate = getStartDate();

    const expTotals       = {};
    const incTotals       = {};
    const monthlyCashflow = {};
    const monthlyLiquid   = {};
    let   runningLiquid   = 0;

    // Sort oldest → newest for accurate cumulative running total
    const sortedTxns = [...state.transactions].sort(
      (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
    );

    sortedTxns.forEach(txn => {
      const d   = parseTxnDate(txn.date);
      const key = monthKey(d);
      const amt = txn.amount || 0;

      // Running liquid cash (all-time, no filter — needed for trend chart)
      if (txn.type === 'income')  runningLiquid += amt;
      if (txn.type === 'expense') runningLiquid -= amt;
      monthlyLiquid[key] = runningLiquid;

      // Monthly cashflow buckets (all-time — bar chart needs full history)
      if (!monthlyCashflow[key]) monthlyCashflow[key] = { in: 0, out: 0 };
      if (txn.type === 'income')  monthlyCashflow[key].in  += amt;
      if (txn.type === 'expense') monthlyCashflow[key].out += amt;

      // Pie charts — respect time filter
      if (d >= startDate) {
        const tag = txn.tags?.[0] || 'Uncategorized';
        if (txn.type === 'expense') expTotals[tag] = (expTotals[tag] || 0) + amt;
        if (txn.type === 'income')  incTotals[tag] = (incTotals[tag] || 0) + amt;
      }
    });

    // Asset allocation totals
    const assetTotals = {};
    state.assets.forEach(asset => {
      const qty   = asset.qty || 1;
      const price = asset.currentPrice !== undefined
        ? asset.currentPrice
        : (asset.currentValue || 0);
      const cat   = asset.category || 'Other';
      assetTotals[cat] = (assetTotals[cat] || 0) + qty * price;
    });

    // Canvas / empty-state toggle helper
    const toggleEmpty = (canvasId, emptyId, hasData) => {
      document.getElementById(canvasId)?.classList.toggle('hidden', !hasData);
      document.getElementById(emptyId)?.classList.toggle('hidden',  hasData);
    };

    // Shared scale options (dark-mode aware)
    function scaleOpts(yCallback) {
      return {
        x: {
          ticks: { color: theme.tickColor, font: { size: 10 } },
          grid:  { color: theme.gridColor },
        },
        y: {
          ticks: { color: theme.tickColor, font: { size: 10 }, callback: yCallback },
          grid:  { color: theme.gridColor },
        },
      };
    }
    const legendOpts = {
      display:  true,
      position: 'right',
      labels:   { boxWidth: 10, font: { size: 10 }, color: theme.legendColor },
    };

    // ── GAP A + 1. Liquid Cash Trend  +  Savings Rate line ───────────────────
    // Two datasets:
    //   • Solid green — cumulative liquid cash (left axis, ₹)
    //   • Dashed amber — monthly savings rate % (right axis, %)  ← new
    const sortedLiquidMonths = Object.keys(monthlyLiquid).sort();
    const liquidData         = sortedLiquidMonths.map(m => monthlyLiquid[m]);

    const savingsRateData = sortedLiquidMonths.map(m => {
      const cf = monthlyCashflow[m] || { in: 0, out: 0 };
      if (!cf.in) return null;
      return parseFloat((((cf.in - cf.out) / cf.in) * 100).toFixed(1));
    });

    toggleEmpty('nwHistoryChart', 'nwEmpty', liquidData.length > 0);
    if (nwCtx && liquidData.length > 0) {
      if (nwChart) nwChart.destroy();
      nwChart = new Chart(nwCtx, {
        data: {
          labels:   sortedLiquidMonths,
          datasets: [
            {
              type:            'line',
              label:           'Liquid Cash (₹)',
              data:            liquidData,
              borderColor:     '#3D9162',
              backgroundColor: 'rgba(61,145,98,0.08)',
              fill:            true,
              tension:         0.4,
              yAxisID:         'yLeft',
              pointRadius:     2,
            },
            {
              type:            'line',
              label:           'Savings Rate (%)',
              data:            savingsRateData,
              borderColor:     '#f59e0b',
              backgroundColor: 'transparent',
              borderDash:      [5, 4],
              tension:         0.4,
              yAxisID:         'yRight',
              pointRadius:     2,
              spanGaps:        true,
            },
          ],
        },
        options: {
          plugins: {
            legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: theme.legendColor } },
          },
          scales: {
            x: { display: false },
            yLeft: {
              ticks: { color: theme.tickColor, font: { size: 10 }, callback: v => '₹' + (v / 1000).toFixed(0) + 'k' },
              grid:  { color: theme.gridColor },
            },
            yRight: {
              position: 'right',
              ticks:    { color: '#f59e0b', font: { size: 10 }, callback: v => v + '%' },
              grid:     { display: false },
            },
          },
        },
      });
    }

    // ── BUG FIX 3: Cashflow Bar — no 12-month silent cap for allTime ─────────
    let barMonths = Object.keys(monthlyCashflow).sort();
    if (filter !== 'allTime') {
      const sk = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      barMonths = barMonths.filter(m => m >= sk);
    }
    // allTime: show ALL months — the old .slice(-12) is intentionally removed

    toggleEmpty('cashflowLineChart', 'cashflowEmpty', barMonths.length > 0);
    if (cashflowCtx && barMonths.length > 0) {
      const netFlows = barMonths.map(m => monthlyCashflow[m].in - monthlyCashflow[m].out);
      if (cashflowChart) cashflowChart.destroy();
      cashflowChart = new Chart(cashflowCtx, {
        type: 'bar',
        data: {
          labels:   barMonths,
          datasets: [{
            label:           'Net Cashflow',
            data:            netFlows,
            backgroundColor: netFlows.map(v => v >= 0 ? '#10b981' : '#ef4444'),
            borderRadius:    4,
          }],
        },
        options: {
          plugins: { legend: { display: false } },
          scales:  scaleOpts(v => '₹' + (v / 1000).toFixed(0) + 'k'),
        },
      });
    }

    // ── GAP B + BUG FIX 2: Expense Donut — 16 colors + center total ─────────
    const hasExp = Object.keys(expTotals).length > 0;
    toggleEmpty('expensePieChart', 'expenseEmpty', hasExp);
    if (expenseCtx && hasExp) {
      const labels = Object.keys(expTotals);
      if (expenseChart) expenseChart.destroy();
      expenseChart = new Chart(expenseCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data:            Object.values(expTotals),
            borderWidth:     0,
            backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          }],
        },
        options: {
          plugins: {
            legend:      legendOpts,
            centerTotal: { display: true, label: 'Expenses' },
          },
          cutout: '62%',
        },
      });
    }

    // ── Income Donut — same fixes ─────────────────────────────────────────────
    const hasInc = Object.keys(incTotals).length > 0;
    toggleEmpty('incomePieChart', 'incomeEmpty', hasInc);
    if (incomeCtx && hasInc) {
      const labels = Object.keys(incTotals);
      if (incomeChart) incomeChart.destroy();
      incomeChart = new Chart(incomeCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data:            Object.values(incTotals),
            borderWidth:     0,
            backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          }],
        },
        options: {
          plugins: {
            legend:      legendOpts,
            centerTotal: { display: true, label: 'Income' },
          },
          cutout: '62%',
        },
      });
    }

    // ── Asset Allocation Donut — same fixes ───────────────────────────────────
    const hasAssets = Object.keys(assetTotals).length > 0;
    toggleEmpty('assetDonutChart', 'assetEmpty', hasAssets);
    if (assetCtx && hasAssets) {
      const labels = Object.keys(assetTotals);
      if (assetChart) assetChart.destroy();
      assetChart = new Chart(assetCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data:            Object.values(assetTotals),
            borderWidth:     0,
            backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          }],
        },
        options: {
          plugins: {
            legend:      legendOpts,
            centerTotal: { display: true, label: 'Portfolio' },
          },
          cutout: '62%',
        },
      });
    }

    // ── BUG FIX 4: MoM uses the two most-recent months in the current period ──
    // Previously: always compared hardcoded currentMonthKey vs prevMonthKey.
    // Now: derives the comparison from whatever months are visible in the filter.
    if (momText) {
      const filterMonths = barMonths.length >= 2 ? barMonths : Object.keys(monthlyCashflow).sort();
      const visibleWithData = filterMonths.filter(
        m => (monthlyCashflow[m]?.in || 0) + (monthlyCashflow[m]?.out || 0) > 0
      );

      if (visibleWithData.length >= 2) {
        const latestM   = visibleWithData[visibleWithData.length - 1];
        const prevM     = visibleWithData[visibleWithData.length - 2];
        const currSpend = monthlyCashflow[latestM]?.out || 0;
        const prevSpend = monthlyCashflow[prevM]?.out   || 0;

        if (prevSpend === 0) {
          momText.innerText = `₹${currSpend.toLocaleString('en-IN')}`;
          momText.className = 'font-semibold text-lg dark:text-white';
        } else {
          const pct  = ((currSpend - prevSpend) / prevSpend) * 100;
          const isUp = pct > 0;
          // Show which month we're comparing against for clarity
          momText.innerText = `${isUp ? '+' : ''}${pct.toFixed(1)}% vs ${prevM}`;
          momText.className = `font-semibold text-base ${isUp ? 'text-red-500' : 'text-green-500'}`;
        }
      } else {
        momText.innerText = '—';
        momText.className = 'font-semibold text-lg dark:text-white';
      }
    }

    if (topCatText) {
      const top3 = Object.entries(expTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(e => e[0]);
      topCatText.innerText = top3.length > 0 ? top3.join(', ') : 'No expenses';
    }
  }

  // ── Time filter change → re-render immediately ────────────────────────────
  timeFilter?.addEventListener('change', () => {
    if (store.isLoaded) renderCharts(store);
  });

  // ── Store subscription (single, no independent Firestore listeners) ────────
  store.subscribe(state => {
    if (!state.isLoaded) return;
    renderCharts(state);
  }, ['transactions', 'assets']);

  // ── BUG FIX 1: Re-render on dark-mode toggle so chart colors update ────────
  const themeObserver = new MutationObserver(() => {
    if (store.isLoaded) renderCharts(store);
  });
  themeObserver.observe(document.documentElement, { attributeFilter: ['class'] });
}
