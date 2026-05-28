import { store } from '../store.js';

export function initCalendar() {
  // ── State ─────────────────────────────────────────────────────────────────
  let currentView = 'monthly';
  let anchorDate  = new Date();
  let fyStartYear = null;
  let selectedDay = null;

  // ── Element refs ──────────────────────────────────────────────────────────
  const content        = document.getElementById('calContent');
  const summaryBar     = document.getElementById('calSummaryBar');
  const periodLabel    = document.getElementById('calPeriodLabel');
  const prevBtn        = document.getElementById('calPrev');
  const nextBtn        = document.getElementById('calNext');
  const todayBtn       = document.getElementById('calTodayBtn');
  const dayDetail      = document.getElementById('calDayDetail');
  const dayDetailLbl   = document.getElementById('calDayDetailLabel');
  const dayDetailList  = document.getElementById('calDayDetailList');
  const dayDetailClose = document.getElementById('calDayDetailClose');

  const tabs = {
    weekly:   document.getElementById('calTabWeekly'),
    monthly:  document.getElementById('calTabMonthly'),
    annually: document.getElementById('calTabAnnually'),
    fy:       document.getElementById('calTabFY'),
  };

  // ── FY helpers ────────────────────────────────────────────────────────────
  function initFYStart() {
    const m = anchorDate.getMonth();
    fyStartYear = m >= 3 ? anchorDate.getFullYear() : anchorDate.getFullYear() - 1;
  }

  // ── Formatting helpers ────────────────────────────────────────────────────
  function fmt(n) {
    return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  function fmtShort(n) {
    const abs = Math.abs(n);
    if (abs >= 10_00_000) return '₹' + (abs / 10_00_000).toFixed(1) + 'cr';
    if (abs >= 1_00_000)  return '₹' + (abs / 1_00_000 ).toFixed(1) + 'L';
    if (abs >= 10_000)    return '₹' + (abs / 1_000    ).toFixed(0) + 'k';
    if (abs >= 1_000)     return '₹' + (abs / 1_000    ).toFixed(1) + 'k';
    return '₹' + abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  // ── Tab selection ─────────────────────────────────────────────────────────
  function setTab(view) {
    currentView = view;
    anchorDate  = new Date();
    selectedDay = null;
    if (view === 'fy') initFYStart();
    closeDayDetail();
    Object.entries(tabs).forEach(([v, btn]) => {
      if (!btn) return;
      const active = v === view;
      btn.classList.toggle('bg-white',           active);
      btn.classList.toggle('dark:bg-gray-600',   active);
      btn.classList.toggle('shadow-sm',          active);
      btn.classList.toggle('text-forest-900',    active);
      btn.classList.toggle('dark:text-white',    active);
      btn.classList.toggle('text-gray-500',     !active);
      btn.classList.toggle('dark:text-gray-400',!active);
    });
    render();
  }

  Object.entries(tabs).forEach(([v, btn]) => btn?.addEventListener('click', () => setTab(v)));

  // ── Navigation ────────────────────────────────────────────────────────────
  prevBtn?.addEventListener('click', () => { navigate(-1); selectedDay = null; closeDayDetail(); render(); });
  nextBtn?.addEventListener('click', () => { navigate( 1); selectedDay = null; closeDayDetail(); render(); });

  todayBtn?.addEventListener('click', () => {
    anchorDate  = new Date();
    selectedDay = null;
    if (currentView === 'fy') initFYStart();
    closeDayDetail();
    render();
  });

  function navigate(dir) {
    if      (currentView === 'weekly')   { anchorDate = new Date(anchorDate); anchorDate.setDate(anchorDate.getDate() + dir * 7); }
    else if (currentView === 'monthly')  { anchorDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1); }
    else if (currentView === 'annually') { anchorDate = new Date(anchorDate.getFullYear() + dir, anchorDate.getMonth(), 1); }
    else if (currentView === 'fy')       { if (fyStartYear === null) initFYStart(); fyStartYear += dir; }
  }

  // ── BUG FIX: UTC-safe date parser ─────────────────────────────────────────
  // Date-only strings like "2025-01-01" are parsed as UTC midnight by the spec.
  // In IST (UTC+5:30) that becomes 05:30 on Jan 1, which is correct — BUT
  // some environments (Safari, older WebKit) still parse them as local midnight.
  // Appending T00:00:00 forces LOCAL midnight parsing everywhere consistently,
  // so a Jan 1 transaction is never bucketed into Dec 31.
  function parseDate(dateStr) {
    if (!dateStr) return null;
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return new Date(dateStr + 'T00:00:00');
    }
    return new Date(dateStr);
  }

  function txnsInRange(from, to) {
    return store.transactions.filter(t => {
      if (!t.date) return false;
      const d = parseDate(t.date);
      return d >= from && d <= to;
    });
  }

  function sumTxns(txns) {
    let income = 0, expense = 0;
    txns.forEach(t => {
      if (t.type === 'income') income  += (t.amount || 0);
      else                     expense += (t.amount || 0);
    });
    return { income, expense, net: income - expense };
  }

  // ── Recurring/SIP markers ─────────────────────────────────────────────────
  // Returns a Map of dayOfMonth → [{name, amount, type}] for all recurring entries
  function getRecurringMap() {
    const map = new Map();
    (store.recurring || []).forEach(r => {
      const d = Number(r.billingDate);
      if (!d) return;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(r);
    });
    return map;
  }

  // ── Day drill-down ────────────────────────────────────────────────────────
  function closeDayDetail() {
    if (dayDetail) dayDetail.classList.add('hidden');
    selectedDay = null;
  }

  dayDetailClose?.addEventListener('click', closeDayDetail);

  function showDayDetail(date) {
    if (!dayDetail || !dayDetailLbl || !dayDetailList) return;
    selectedDay = date;

    const from = new Date(date); from.setHours(0, 0, 0, 0);
    const to   = new Date(date); to.setHours(23, 59, 59, 999);
    const txns = txnsInRange(from, to);
    const dayNum      = date.getDate();
    const recurringMap = getRecurringMap();
    const dueRecurring = recurringMap.get(dayNum) || [];

    dayDetailLbl.innerText = date.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    let html = '';
    if (txns.length === 0 && dueRecurring.length === 0) {
      html = `<p class="text-sm text-gray-400 text-center py-4">No transactions on this day.</p>`;
    } else {
      txns.forEach(t => {
        const isInc = t.type === 'income';
        html += `
          <div class="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
            <div class="flex-1 min-w-0 mr-3">
              <p class="text-sm font-medium dark:text-white truncate">${t.title || 'Transaction'}</p>
              ${(t.tags || []).length ? `<p class="text-[10px] text-gray-400">${t.tags.join(' · ')}</p>` : ''}
            </div>
            <p class="font-bold text-sm flex-shrink-0 ${isInc ? 'text-green-600' : 'text-red-500'}">
              ${isInc ? '+' : '−'}₹${(t.amount || 0).toLocaleString('en-IN')}
            </p>
          </div>`;
      });
      dueRecurring.forEach(r => {
        html += `
          <div class="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0 opacity-80">
            <div class="flex-1 min-w-0 mr-3">
              <p class="text-sm font-medium dark:text-white truncate">${r.name}</p>
              <p class="text-[10px] text-amber-500">🔄 Recurring · ${r.type || 'Auto'}</p>
            </div>
            <p class="font-bold text-sm flex-shrink-0 text-amber-600">₹${(r.amount || 0).toLocaleString('en-IN')}</p>
          </div>`;
      });
    }

    dayDetailList.innerHTML = html;
    dayDetail.classList.remove('hidden');
    setTimeout(() => dayDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  // ── Summary Bar ───────────────────────────────────────────────────────────
  function renderSummary(income, expense, net) {
    if (!summaryBar) return;
    const netColor = net >= 0 ? 'text-green-600' : 'text-red-500';
    summaryBar.innerHTML = `
      <div class="bg-green-50 dark:bg-gray-800 rounded-xl p-3 text-center border border-green-100 dark:border-gray-700">
        <p class="text-[9px] font-bold text-green-500 uppercase tracking-wider mb-1">Income</p>
        <p class="font-semibold text-green-600 text-sm">${fmt(income)}</p>
      </div>
      <div class="bg-red-50 dark:bg-gray-800 rounded-xl p-3 text-center border border-red-100 dark:border-gray-700">
        <p class="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-1">Expense</p>
        <p class="font-semibold text-red-500 text-sm">${fmt(expense)}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-xl p-3 text-center border border-forest-50 dark:border-gray-700">
        <p class="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Net</p>
        <p class="font-semibold ${netColor} text-sm">${net >= 0 ? '+' : '−'}${fmt(net)}</p>
      </div>`;
  }

  // ── BUG FIX: Weekly view — Sunday-start (Indian app convention) ───────────
  function renderWeekly() {
    // FIX: start week on Sunday. getDay() returns 0=Sun, so subtracting getDay()
    // days always lands on the most recent Sunday on or before anchorDate.
    const dow    = anchorDate.getDay();
    const sunday = new Date(anchorDate);
    sunday.setDate(sunday.getDate() - dow);

    const dayLabels  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const today      = new Date();
    const dayMaps    = [];
    const recurringMap = getRecurringMap();
    let totInc = 0, totExp = 0;

    for (let i = 0; i < 7; i++) {
      const d    = new Date(sunday); d.setDate(d.getDate() + i);
      const from = new Date(d); from.setHours(0, 0, 0, 0);
      const to   = new Date(d); to.setHours(23, 59, 59, 999);
      const { income, expense } = sumTxns(txnsInRange(from, to));
      totInc += income; totExp += expense;
      dayMaps.push({ d, income, expense });
    }

    const maxVal = Math.max(...dayMaps.map(m => Math.max(m.income, m.expense)), 1);
    const saturday = dayMaps[6].d;
    periodLabel.innerText = `${sunday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${saturday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    let html = `<div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700">
      <div class="grid grid-cols-7 gap-1">`;

    dayMaps.forEach(({ d, income, expense }, i) => {
      const isToday = d.toDateString() === today.toDateString();
      const pctInc  = (income  / maxVal) * 100;
      const pctExp  = (expense / maxVal) * 100;
      const hasData = income > 0 || expense > 0;
      const dayNum  = d.getDate();
      const recurringToday = recurringMap.get(dayNum) || [];
      const hasRecurring   = recurringToday.length > 0;

      html += `
        <div class="flex flex-col items-center gap-1">
          <span class="text-[9px] font-bold uppercase ${isToday ? 'text-teal-500' : 'text-gray-400'}">${dayLabels[i]}</span>
          <span class="text-[9px] font-semibold ${isToday ? 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 rounded-full w-5 h-5 flex items-center justify-center' : 'text-gray-500 dark:text-gray-400'}">${dayNum}</span>
          <div class="flex-1 w-full flex items-end justify-center gap-0.5 h-20">
            ${income  > 0 ? `<div class="w-2.5 rounded-t-sm bg-green-400" style="height:${pctInc.toFixed(0)}%"></div>` : '<div class="w-2.5"></div>'}
            ${expense > 0 ? `<div class="w-2.5 rounded-t-sm bg-red-400"   style="height:${pctExp.toFixed(0)}%"></div>` : '<div class="w-2.5"></div>'}
          </div>
          ${hasData ? `<div class="text-center">
            ${income  > 0 ? `<p class="text-[8px] text-green-600 font-semibold leading-none">${fmtShort(income)}</p>`  : ''}
            ${expense > 0 ? `<p class="text-[8px] text-red-500 font-semibold leading-none">${fmtShort(expense)}</p>` : ''}
          </div>` : `<p class="text-[8px] text-gray-300 dark:text-gray-600">—</p>`}
          ${hasRecurring ? `<div class="flex gap-0.5 flex-wrap justify-center" title="${recurringToday.map(r => r.name).join(', ')}">
            ${recurringToday.map(() => `<span class="w-1 h-1 rounded-full bg-amber-400 block"></span>`).join('')}
          </div>` : ''}
        </div>`;
    });

    html += `</div>
      <div class="flex items-center gap-4 mt-3 pt-3 border-t dark:border-gray-700 justify-center text-[10px] text-gray-400 flex-wrap gap-y-1">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-green-400 inline-block"></span> Income</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-red-400 inline-block"></span> Expense</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-400 inline-block"></span> Recurring due</span>
      </div>
    </div>`;

    html += renderWeeklyHeatmap(sunday);

    renderSummary(totInc, totExp, totInc - totExp);
    return html;
  }

  // ── BUG FIX: Heatmap also Sunday-start ───────────────────────────────────
  function renderWeeklyHeatmap(currentSunday) {
    // Build 7 weeks of 7 days each (Sun–Sat), newest week on the right.
    // Start 6 full weeks before the current Sunday → 49 cells total.
    const startDay = new Date(currentSunday);
    startDay.setDate(startDay.getDate() - 6 * 7); // 6 weeks back

    const cells = [];
    for (let d = 0; d < 49; d++) {
      const day  = new Date(startDay); day.setDate(day.getDate() + d);
      const from = new Date(day); from.setHours(0, 0, 0, 0);
      const to   = new Date(day); to.setHours(23, 59, 59, 999);
      const { income, expense } = sumTxns(txnsInRange(from, to));
      cells.push({ day, net: income - expense, total: income + expense });
    }

    const maxTotal = Math.max(...cells.map(c => c.total), 1);
    const today    = new Date();
    // Row labels: Sun at top (row 0) → Sat at bottom (row 6)
    const rowLabels = ['S','M','T','W','T','F','S'];

    let html = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 mt-3">
        <p class="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-3">7-Week Cashflow Heatmap</p>
        <div class="flex gap-1">
          <div class="flex flex-col gap-1 mr-1">
            ${rowLabels.map(n => `<div class="text-[8px] text-gray-400 font-bold h-5 flex items-center">${n}</div>`).join('')}
          </div>
          <div class="flex-1 grid gap-1" style="grid-template-columns: repeat(7, 1fr)">`;

    // Grid: 7 cols (weeks, oldest→newest) × 7 rows (Sun→Sat)
    // cells[weekIdx * 7 + dayOfWeek] where dayOfWeek 0=Sun
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row < 7; row++) {
        const cell      = cells[col * 7 + row];
        const intensity = cell.total > 0 ? Math.max(0.15, cell.total / maxTotal) : 0;
        const isToday   = cell.day.toDateString() === today.toDateString();
        const isFuture  = cell.day > today;
        let bg;
        if (isFuture || cell.total === 0) {
          bg = 'background-color:rgba(156,163,175,0.15)';
        } else if (cell.net >= 0) {
          bg = `background-color:rgba(34,197,94,${intensity.toFixed(2)})`;
        } else {
          bg = `background-color:rgba(239,68,68,${intensity.toFixed(2)})`;
        }
        const ring = isToday ? 'outline:2px solid #14b8a6;outline-offset:1px;' : '';
        html += `<div class="h-5 rounded-sm" style="${bg};${ring}" title="${cell.day.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}: ${cell.net >= 0 ? '+' : '−'}${fmt(Math.abs(cell.net))}"></div>`;
      }
    }

    html += `</div></div>
        <div class="flex items-center gap-2 mt-3 text-[9px] text-gray-400 flex-wrap">
          <span>Less</span>
          ${[0.15,0.35,0.55,0.75,1].map(a => `<div class="w-3 h-3 rounded-sm" style="background:rgba(34,197,94,${a})"></div>`).join('')}
          <span>More income</span>
          <span class="mx-1">·</span>
          ${[0.15,0.35,0.55,0.75,1].map(a => `<div class="w-3 h-3 rounded-sm" style="background:rgba(239,68,68,${a})"></div>`).join('')}
          <span>More expense</span>
        </div>
      </div>`;

    return html;
  }

  // ── BUG FIX: Monthly view — Sunday-start grid ─────────────────────────────
  function renderMonthly() {
    const year  = anchorDate.getFullYear();
    const month = anchorDate.getMonth();

    const from = new Date(year, month, 1, 0, 0, 0, 0);
    const to   = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const { income, expense, net } = sumTxns(txnsInRange(from, to));

    periodLabel.innerText = anchorDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const txnMap = {};
    txnsInRange(from, to).forEach(t => {
      const day = parseDate(t.date).getDate();
      if (!txnMap[day]) txnMap[day] = { income: 0, expense: 0, count: 0 };
      if (t.type === 'income') txnMap[day].income += (t.amount || 0);
      else                     txnMap[day].expense += (t.amount || 0);
      txnMap[day].count++;
    });

    const recurringMap   = getRecurringMap();
    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    // FIX: Sunday-start — getDay() returns 0 for Sunday, which means 0 blank
    // cells before the first, exactly right. Monday-start needed
    // "firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1" to remap; we don't.
    const startOffset    = new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon, …
    const today          = new Date();

    // FIX: Sunday-start day headers
    const dayHeaders = ['S','M','T','W','T','F','S'];

    let html = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-card border border-forest-50/50 dark:border-gray-700 overflow-hidden">
        <div class="grid grid-cols-7 bg-forest-50 dark:bg-gray-700/50">
          ${dayHeaders.map(h => `<div class="text-center text-[10px] font-bold text-gray-400 py-2">${h}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 divide-x divide-y divide-gray-50 dark:divide-gray-700/50">`;

    for (let i = 0; i < startOffset; i++) {
      html += `<div class="h-[68px]"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const data    = txnMap[day] || null;
      const hasTxn  = data && data.count > 0;
      const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
      // GAP FIX: show all recurring entries due on this day
      const recurringToday = recurringMap.get(day) || [];
      const hasRecurring   = recurringToday.length > 0;

      const isSelected = selectedDay &&
        selectedDay.getDate() === day &&
        selectedDay.getMonth() === month &&
        selectedDay.getFullYear() === year;

      html += `
        <div data-day="${day}" class="cal-day-cell h-[68px] p-1 flex flex-col cursor-pointer transition-colors
          ${isToday    ? 'bg-teal-50/60 dark:bg-teal-900/20'                     : ''}
          ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-300' : ''}
          hover:bg-gray-50 dark:hover:bg-gray-700/40">
          <div class="flex items-center justify-between">
            <span class="text-[10px] leading-none font-semibold ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'}">${day}</span>
            ${hasRecurring ? `<span class="flex gap-px">${recurringToday.map(() => `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"></span>`).join('')}</span>` : ''}
          </div>
          <div class="flex flex-col gap-px mt-auto">
            ${hasTxn && data.income  > 0 ? `<span class="text-[9px] text-green-600 font-bold leading-tight truncate">+${fmtShort(data.income)}</span>`  : ''}
            ${hasTxn && data.expense > 0 ? `<span class="text-[9px] text-red-500 font-bold leading-tight truncate">−${fmtShort(data.expense)}</span>` : ''}
          </div>
        </div>`;
    }

    html += `</div></div>`;

    // Legend
    html += `
      <div class="flex items-center gap-4 mt-2 px-1 text-[10px] text-gray-400">
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span> Recurring due</span>
      </div>`;

    renderSummary(income, expense, net);
    return html;
  }

  // ── GAP FIX: Annual grid with Y-axis scale reference ─────────────────────
  function renderAnnualGrid(displayYear, months) {
    let maxIncome = 1, maxExpense = 1;
    const monthData = months.map(({ label, month, year: y }) => {
      const from = new Date(y, month, 1, 0, 0, 0, 0);
      const to   = new Date(y, month + 1, 0, 23, 59, 59, 999);
      const { income, expense } = sumTxns(txnsInRange(from, to));
      maxIncome  = Math.max(maxIncome,  income);
      maxExpense = Math.max(maxExpense, expense);
      return { label, income, expense };
    });

    let html = `<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-card border border-forest-50/50 dark:border-gray-700 overflow-hidden">`;

    // GAP FIX: Y-axis scale header — shows max values so bar widths are interpretable
    if (maxIncome > 1 || maxExpense > 1) {
      html += `
        <div class="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-100 dark:border-gray-700">
          <span class="text-[9px] text-gray-400 w-8 flex-shrink-0">Scale</span>
          <div class="flex-1 space-y-0.5">
            ${maxIncome  > 1 ? `<p class="text-[9px] text-green-500 font-semibold">Income max: ${fmt(maxIncome)}</p>`   : ''}
            ${maxExpense > 1 ? `<p class="text-[9px] text-red-400  font-semibold">Expense max: ${fmt(maxExpense)}</p>` : ''}
          </div>
          <span class="text-[9px] text-gray-300 dark:text-gray-600 w-14 text-right">Net</span>
        </div>`;
    }

    html += `<div class="divide-y divide-gray-50 dark:divide-gray-700/50">`;

    monthData.forEach(({ label, income, expense }) => {
      const net    = income - expense;
      const pInc   = maxIncome  > 0 ? (income  / maxIncome)  * 100 : 0;
      const pExp   = maxExpense > 0 ? (expense / maxExpense) * 100 : 0;
      const netClr = net >= 0 ? 'text-green-600' : 'text-red-500';
      const hasData = income > 0 || expense > 0;

      html += `
        <div class="flex items-center gap-3 px-4 py-3">
          <span class="text-xs font-bold text-gray-400 w-8 flex-shrink-0">${label}</span>
          <div class="flex-1 space-y-1.5">
            <div class="relative">
              <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div class="h-2 rounded-full bg-green-400" style="width:${pInc.toFixed(0)}%"></div>
              </div>
              ${income > 0 ? `<span class="absolute right-0 top-0 -translate-y-full text-[9px] text-green-600 font-semibold leading-tight pb-0.5">${fmt(income)}</span>` : ''}
            </div>
            <div class="relative">
              <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div class="h-2 rounded-full bg-red-400" style="width:${pExp.toFixed(0)}%"></div>
              </div>
              ${expense > 0 ? `<span class="absolute right-0 top-0 -translate-y-full text-[9px] text-red-400 font-semibold leading-tight pb-0.5">${fmt(expense)}</span>` : ''}
            </div>
          </div>
          <span class="text-[10px] font-bold ${hasData ? netClr : 'text-gray-200 dark:text-gray-700'} text-right w-14 flex-shrink-0">
            ${hasData ? (net >= 0 ? '+' : '−') + fmt(net) : '—'}
          </span>
        </div>`;
    });

    html += `</div></div>`;
    return html;
  }

  // ── Annually view (Jan–Dec) ───────────────────────────────────────────────
  function renderAnnually() {
    const year = anchorDate.getFullYear();
    periodLabel.innerText = `Year ${year}`;
    const months = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(year, i, 1).toLocaleDateString('en-IN', { month: 'short' }),
      month: i, year,
    }));
    const from = new Date(year, 0,  1,  0,  0,  0, 0);
    const to   = new Date(year, 11, 31, 23, 59, 59, 999);
    const { income, expense, net } = sumTxns(txnsInRange(from, to));
    renderSummary(income, expense, net);
    return renderAnnualGrid(year, months);
  }

  // ── FY view (Apr–Mar, Indian FY) ──────────────────────────────────────────
  function renderFY() {
    if (fyStartYear === null) initFYStart();
    const fyEnd = fyStartYear + 1;
    periodLabel.innerText = `FY ${fyStartYear}–${String(fyEnd).slice(2)}`;
    const months = [];
    for (let i = 3; i <= 14; i++) {
      const m = i % 12;
      const y = m >= 3 ? fyStartYear : fyEnd;
      months.push({
        label: new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'short' }),
        month: m, year: y,
      });
    }
    const from = new Date(fyStartYear, 3,  1,  0,  0,  0, 0);
    const to   = new Date(fyEnd,       2, 31, 23, 59, 59, 999);
    const { income, expense, net } = sumTxns(txnsInRange(from, to));
    renderSummary(income, expense, net);
    return renderAnnualGrid(fyStartYear, months);
  }

  // ── Main render dispatcher ────────────────────────────────────────────────
  function render() {
    if (!content || !store.isLoaded) return;
    let html = '';
    if      (currentView === 'weekly')   html = renderWeekly();
    else if (currentView === 'monthly')  html = renderMonthly();
    else if (currentView === 'annually') html = renderAnnually();
    else if (currentView === 'fy')       html = renderFY();
    content.innerHTML = html;

    if (currentView === 'monthly') {
      content.querySelectorAll('.cal-day-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const day   = parseInt(cell.dataset.day, 10);
          const year  = anchorDate.getFullYear();
          const month = anchorDate.getMonth();
          const date  = new Date(year, month, day);
          if (selectedDay && selectedDay.toDateString() === date.toDateString()) {
            closeDayDetail();
            render();
          } else {
            showDayDetail(date);
            render();
          }
        });
      });
    }

    if (window.lucide) lucide.createIcons();
  }

  // Re-render on store change
  store.subscribe(state => {
    if (!state.isLoaded) return;
    render();
  });
}
