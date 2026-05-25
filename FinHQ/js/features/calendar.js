import { store } from '../store.js';

export function initCalendar() {
  // ── State ─────────────────────────────────────────────────────────────────
  let currentView  = 'monthly';
  let anchorDate   = new Date();
  let fyStartYear  = null;   // BUG FIX: own state, not recomputed from anchorDate.getMonth()
  let selectedDay  = null;   // GAP: day drill-down

  // ── Element refs ──────────────────────────────────────────────────────────
  const content      = document.getElementById('calContent');
  const summaryBar   = document.getElementById('calSummaryBar');
  const periodLabel  = document.getElementById('calPeriodLabel');
  const prevBtn      = document.getElementById('calPrev');
  const nextBtn      = document.getElementById('calNext');
  const todayBtn     = document.getElementById('calTodayBtn');    // GAP: Today button
  const dayDetail    = document.getElementById('calDayDetail');   // GAP: drill-down panel
  const dayDetailLbl = document.getElementById('calDayDetailLabel');
  const dayDetailList= document.getElementById('calDayDetailList');
  const dayDetailClose = document.getElementById('calDayDetailClose');

  const tabs = {
    weekly:   document.getElementById('calTabWeekly'),
    monthly:  document.getElementById('calTabMonthly'),
    annually: document.getElementById('calTabAnnually'),
    fy:       document.getElementById('calTabFY'),
  };

  // ── FY helpers ────────────────────────────────────────────────────────────
  // BUG FIX: fyStart is stored explicitly so navigate() can increment it
  // directly. The old code re-derived fyStart from anchorDate.getMonth() on
  // every render, which meant the boundary month influenced which FY was shown
  // after each navigation step — causing a 1-year drift when the anchor month
  // was in Q4 (Jan–Mar) of the FY.
  function initFYStart() {
    const m = anchorDate.getMonth();
    fyStartYear = m >= 3 ? anchorDate.getFullYear() : anchorDate.getFullYear() - 1;
  }

  // ── Formatting helpers ────────────────────────────────────────────────────
  function fmt(n) {
    return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  // BUG FIX: abbreviated formatter for tight cells — prevents 8px text overflow
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
      btn.classList.toggle('bg-white',          active);
      btn.classList.toggle('dark:bg-gray-600',  active);
      btn.classList.toggle('shadow-sm',         active);
      btn.classList.toggle('text-forest-900',   active);
      btn.classList.toggle('dark:text-white',   active);
      btn.classList.toggle('text-gray-500',    !active);
      btn.classList.toggle('dark:text-gray-400',!active);
    });
    render();
  }

  Object.entries(tabs).forEach(([v, btn]) => btn?.addEventListener('click', () => setTab(v)));

  // ── Navigation ────────────────────────────────────────────────────────────
  prevBtn?.addEventListener('click', () => { navigate(-1); selectedDay = null; closeDayDetail(); render(); });
  nextBtn?.addEventListener('click', () => { navigate( 1); selectedDay = null; closeDayDetail(); render(); });

  // GAP: "Today" / jump-to-current-period button
  todayBtn?.addEventListener('click', () => {
    anchorDate  = new Date();
    selectedDay = null;
    if (currentView === 'fy') initFYStart();
    closeDayDetail();
    render();
  });

  function navigate(dir) {
    if (currentView === 'weekly') {
      anchorDate = new Date(anchorDate);
      anchorDate.setDate(anchorDate.getDate() + dir * 7);
    } else if (currentView === 'monthly') {
      anchorDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1);
    } else if (currentView === 'annually') {
      anchorDate = new Date(anchorDate.getFullYear() + dir, anchorDate.getMonth(), 1);
    } else if (currentView === 'fy') {
      // BUG FIX: Directly increment the stored fyStartYear instead of mutating
      // anchorDate. The old code did anchorDate.getFullYear() + dir which is
      // correct for a calendar year (Jan–Dec) but the FY start year must be
      // managed independently — the anchor month has no meaning for FY mode
      // once we have navigated away from the current month.
      if (fyStartYear === null) initFYStart();
      fyStartYear += dir;
    }
  }

  // ── Transaction helpers ───────────────────────────────────────────────────
  function txnsInRange(from, to) {
    return store.transactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
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

  // GAP: Recurring/SIP markers — build a Set of days-of-month that have dues
  function getRecurringDays() {
    const days = new Set();
    (store.recurring || []).forEach(r => {
      if (r.billingDate) days.add(Number(r.billingDate));
    });
    return days;
  }

  // ── Day drill-down ────────────────────────────────────────────────────────
  // GAP: Tapping a day in monthly view drills down to that day's transactions.
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

    // Also show recurring payments due today
    const dayNum = date.getDate();
    const dueRecurring = (store.recurring || []).filter(r => Number(r.billingDate) === dayNum);

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
          <div class="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0 opacity-70">
            <div class="flex-1 min-w-0 mr-3">
              <p class="text-sm font-medium dark:text-white truncate">${r.name}</p>
              <p class="text-[10px] text-amber-500">Recurring · ${r.type || 'SIP'}</p>
            </div>
            <p class="font-bold text-sm flex-shrink-0 text-amber-600">₹${(r.amount || 0).toLocaleString('en-IN')}</p>
          </div>`;
      });
    }

    dayDetailList.innerHTML = html;
    dayDetail.classList.remove('hidden');
    // Scroll to detail panel
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

  // ── Weekly view + heatmap ─────────────────────────────────────────────────
  function renderWeekly() {
    const dow       = anchorDate.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const monday    = new Date(anchorDate);
    monday.setDate(monday.getDate() + diffToMon);

    const days    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const today   = new Date();
    const dayMaps = [];
    let totInc = 0, totExp = 0;

    for (let i = 0; i < 7; i++) {
      const d    = new Date(monday); d.setDate(d.getDate() + i);
      const from = new Date(d); from.setHours(0, 0, 0, 0);
      const to   = new Date(d); to.setHours(23, 59, 59, 999);
      const { income, expense } = sumTxns(txnsInRange(from, to));
      totInc += income; totExp += expense;
      dayMaps.push({ d, income, expense });
    }

    const maxVal = Math.max(...dayMaps.map(m => Math.max(m.income, m.expense)), 1);
    periodLabel.innerText = `${monday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${dayMaps[6].d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    let html = `<div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700">
      <div class="grid grid-cols-7 gap-1">`;

    dayMaps.forEach(({ d, income, expense }, i) => {
      const isToday = d.toDateString() === today.toDateString();
      const pctInc  = (income  / maxVal) * 100;
      const pctExp  = (expense / maxVal) * 100;
      const hasData = income > 0 || expense > 0;

      html += `
        <div class="flex flex-col items-center gap-1">
          <span class="text-[9px] font-bold uppercase ${isToday ? 'text-teal-500' : 'text-gray-400'}">${days[i]}</span>
          <span class="text-[9px] font-semibold ${isToday ? 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 rounded-full w-5 h-5 flex items-center justify-center' : 'text-gray-500 dark:text-gray-400'}">${d.getDate()}</span>
          <div class="flex-1 w-full flex items-end justify-center gap-0.5 h-20">
            ${income  > 0 ? `<div class="w-2.5 rounded-t-sm bg-green-400" style="height:${pctInc.toFixed(0)}%"></div>` : '<div class="w-2.5"></div>'}
            ${expense > 0 ? `<div class="w-2.5 rounded-t-sm bg-red-400"   style="height:${pctExp.toFixed(0)}%"></div>` : '<div class="w-2.5"></div>'}
          </div>
          ${hasData ? `<div class="text-center">
            ${income  > 0 ? `<p class="text-[8px] text-green-600 font-semibold leading-none">${fmtShort(income)}</p>`  : ''}
            ${expense > 0 ? `<p class="text-[8px] text-red-500 font-semibold leading-none">${fmtShort(expense)}</p>` : ''}
          </div>` : `<p class="text-[8px] text-gray-300 dark:text-gray-600">—</p>`}
        </div>`;
    });

    html += `</div>
      <div class="flex items-center gap-4 mt-4 pt-3 border-t dark:border-gray-700 justify-center text-[10px] text-gray-400">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-green-400 inline-block"></span> Income</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-red-400 inline-block"></span> Expense</span>
      </div>
    </div>`;

    // GAP: Weekly cashflow heatmap — 7-week contribution grid (GitHub-style).
    // Each cell's color intensity is proportional to |net cashflow| on that day.
    // Green = net income day, red = net expense day, muted = zero.
    html += renderWeeklyHeatmap(monday);

    renderSummary(totInc, totExp, totInc - totExp);
    return html;
  }

  function renderWeeklyHeatmap(currentMonday) {
    // Build 7 weeks ending on the Sunday of the current anchor week
    const sunday = new Date(currentMonday); sunday.setDate(sunday.getDate() + 6);
    const weeks  = [];
    let dayPtr   = new Date(sunday);
    dayPtr.setDate(dayPtr.getDate() - 7 * 6); // go back 6 more weeks → 7 total

    // Collect all 49 days
    const cells = [];
    for (let d = 0; d < 49; d++) {
      const day  = new Date(dayPtr); day.setDate(day.getDate() + d);
      const from = new Date(day); from.setHours(0, 0, 0, 0);
      const to   = new Date(day); to.setHours(23, 59, 59, 999);
      const { income, expense } = sumTxns(txnsInRange(from, to));
      cells.push({ day, net: income - expense, total: income + expense });
    }

    const maxTotal = Math.max(...cells.map(c => c.total), 1);
    const today    = new Date();
    const dayNames = ['M','T','W','T','F','S','S'];

    let html = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 mt-3">
        <p class="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-3">7-Week Cashflow Heatmap</p>
        <div class="flex gap-1">
          <div class="flex flex-col gap-1 mr-1">
            ${dayNames.map(n => `<div class="text-[8px] text-gray-400 font-bold h-5 flex items-center">${n}</div>`).join('')}
          </div>
          <div class="flex-1 grid gap-1" style="grid-template-columns: repeat(7, 1fr)">`;

    // Arrange as 7 rows (Mon–Sun) × 7 cols (weeks)
    // cells[i] is ordered Mon→Sun, Week1→Week7
    // We need to render col-by-col: for each of 7 weeks, render 7 days
    for (let col = 0; col < 7; col++) {    // col = week
      for (let row = 0; row < 7; row++) { // row = day of week
        const cell = cells[col * 7 + row];
        const intensity = cell.total > 0 ? Math.max(0.15, cell.total / maxTotal) : 0;
        const isToday   = cell.day.toDateString() === today.toDateString();
        const isFuture  = cell.day > today;
        let bg;
        if (isFuture || cell.total === 0) {
          bg = 'background-color: rgb(243 244 246)'; // gray-100
        } else if (cell.net >= 0) {
          bg = `background-color: rgba(34,197,94,${intensity.toFixed(2)})`; // green
        } else {
          bg = `background-color: rgba(239,68,68,${intensity.toFixed(2)})`;  // red
        }
        const ring = isToday ? 'outline: 2px solid #14b8a6; outline-offset: 1px;' : '';
        html += `<div class="h-5 rounded-sm" style="${bg}; ${ring}" title="${cell.day.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}: ${cell.net >= 0 ? '+' : '−'}${fmt(Math.abs(cell.net))}"></div>`;
      }
    }

    html += `</div></div>
        <div class="flex items-center gap-3 mt-3 text-[9px] text-gray-400">
          <span>Less</span>
          <div class="flex gap-0.5">
            ${[0.1,0.3,0.5,0.75,1].map(a => `<div class="w-3 h-3 rounded-sm" style="background:rgba(34,197,94,${a})"></div>`).join('')}
          </div>
          <span>More income</span>
          <span class="ml-2">|</span>
          ${[0.1,0.3,0.5,0.75,1].map(a => `<div class="w-3 h-3 rounded-sm" style="background:rgba(239,68,68,${a})"></div>`).join('')}
          <span>More expense</span>
        </div>
      </div>`;

    return html;
  }

  // ── Monthly view ──────────────────────────────────────────────────────────
  function renderMonthly() {
    const year  = anchorDate.getFullYear();
    const month = anchorDate.getMonth();

    const from = new Date(year, month, 1, 0, 0, 0, 0);
    const to   = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const { income, expense, net } = sumTxns(txnsInRange(from, to));

    periodLabel.innerText = anchorDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Build per-day txn map
    const txnMap = {};
    txnsInRange(from, to).forEach(t => {
      const day = new Date(t.date).getDate();
      if (!txnMap[day]) txnMap[day] = { income: 0, expense: 0, count: 0 };
      if (t.type === 'income') txnMap[day].income += (t.amount || 0);
      else                     txnMap[day].expense += (t.amount || 0);
      txnMap[day].count++;
    });

    // GAP: recurring due-day markers
    const recurringDays = getRecurringDays();

    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const startOffset    = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    const today          = new Date();

    const dayHeaders = ['M','T','W','T','F','S','S'];
    let html = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-card border border-forest-50/50 dark:border-gray-700 overflow-hidden">
        <div class="grid grid-cols-7 bg-forest-50 dark:bg-gray-700/50">
          ${dayHeaders.map(h => `<div class="text-center text-[10px] font-bold text-gray-400 py-2">${h}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 divide-x divide-y divide-gray-50 dark:divide-gray-700/50">`;

    for (let i = 0; i < startOffset; i++) {
      // BUG FIX: cells are now h-[68px] instead of h-14 (56px).
      // At 375px wide, 7 cols = ~49px each. At 68px tall there's enough room
      // for the date number + two lines of fmtShort() text without overflow.
      html += `<div class="h-[68px]"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const data    = txnMap[day] || null;
      const hasTxn  = data && data.count > 0;
      const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
      // GAP: recurring marker — show amber dot if a SIP/recurring is due today
      const hasRecurring = recurringDays.has(day);

      // GAP: highlight selected day
      const isSelected = selectedDay &&
        selectedDay.getDate() === day &&
        selectedDay.getMonth() === month &&
        selectedDay.getFullYear() === year;

      html += `
        <div data-day="${day}" class="cal-day-cell h-[68px] p-1 flex flex-col cursor-pointer transition-colors
          ${isToday    ? 'bg-teal-50/60 dark:bg-teal-900/20' : ''}
          ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-300' : ''}
          hover:bg-gray-50 dark:hover:bg-gray-700/40">
          <div class="flex items-center justify-between">
            <span class="text-[10px] leading-none font-semibold ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'}">${day}</span>
            ${hasRecurring ? `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Recurring payment due"></span>` : ''}
          </div>
          <div class="flex flex-col gap-px mt-auto">
            ${hasTxn && data.income  > 0 ? `<span class="text-[9px] text-green-600 font-bold leading-tight truncate">+${fmtShort(data.income)}</span>`  : ''}
            ${hasTxn && data.expense > 0 ? `<span class="text-[9px] text-red-500 font-bold leading-tight truncate">−${fmtShort(data.expense)}</span>` : ''}
          </div>
        </div>`;
    }

    html += `</div></div>`;
    renderSummary(income, expense, net);
    return html;
  }

  // ── Annual grid helper (shared by annually + fy) ──────────────────────────
  function renderAnnualGrid(displayYear, months) {
    const maxBar = { income: 1, expense: 1 };
    const monthData = months.map(({ label, month, year: y }) => {
      const from = new Date(y, month, 1, 0, 0, 0, 0);
      const to   = new Date(y, month + 1, 0, 23, 59, 59, 999);
      const { income, expense } = sumTxns(txnsInRange(from, to));
      maxBar.income  = Math.max(maxBar.income,  income);
      maxBar.expense = Math.max(maxBar.expense, expense);
      return { label, income, expense };
    });

    let html = `<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-card border border-forest-50/50 dark:border-gray-700 overflow-hidden">
      <div class="divide-y divide-gray-50 dark:divide-gray-700/50">`;

    monthData.forEach(({ label, income, expense }) => {
      const net     = income - expense;
      const pInc    = maxBar.income  > 0 ? (income  / maxBar.income)  * 100 : 0;
      const pExp    = maxBar.expense > 0 ? (expense / maxBar.expense) * 100 : 0;
      const netClr  = net >= 0 ? 'text-green-600' : 'text-red-500';
      const hasData = income > 0 || expense > 0;

      html += `
        <div class="flex items-center gap-3 px-4 py-3">
          <span class="text-xs font-bold text-gray-400 w-8 flex-shrink-0">${label}</span>
          <div class="flex-1 space-y-1">
            <div class="flex items-center gap-1.5">
              <div class="h-1.5 rounded-full bg-green-400" style="width:${pInc.toFixed(0)}%; min-width:${hasData && income > 0 ? '4' : '0'}px"></div>
              ${income > 0 ? `<span class="text-[9px] text-green-600 font-semibold">${fmt(income)}</span>` : ''}
            </div>
            <div class="flex items-center gap-1.5">
              <div class="h-1.5 rounded-full bg-red-400" style="width:${pExp.toFixed(0)}%; min-width:${hasData && expense > 0 ? '4' : '0'}px"></div>
              ${expense > 0 ? `<span class="text-[9px] text-red-500 font-semibold">${fmt(expense)}</span>` : ''}
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

  // ── FY view (Apr–Mar, Indian FY) ─────────────────────────────────────────
  function renderFY() {
    // BUG FIX: use stored fyStartYear, not anchorDate.getMonth()-derived value.
    if (fyStartYear === null) initFYStart();
    const fyEnd = fyStartYear + 1;
    periodLabel.innerText = `FY ${fyStartYear}–${String(fyEnd).slice(2)}`;

    // Build Apr(fyStartYear) … Mar(fyEnd)
    const months = [];
    for (let i = 3; i <= 14; i++) {
      const m = i % 12;
      const y = m >= 3 ? fyStartYear : fyEnd;
      months.push({
        label: new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'short' }),
        month: m, year: y,
      });
    }

    const from = new Date(fyStartYear, 3,  1,  0,  0,  0, 0);   // Apr 1
    const to   = new Date(fyEnd,       2, 31, 23, 59, 59, 999);  // Mar 31
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

    // GAP: wire up monthly day-cell click → drill-down
    if (currentView === 'monthly') {
      content.querySelectorAll('.cal-day-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const day   = parseInt(cell.dataset.day, 10);
          const year  = anchorDate.getFullYear();
          const month = anchorDate.getMonth();
          const date  = new Date(year, month, day);
          if (selectedDay && selectedDay.toDateString() === date.toDateString()) {
            closeDayDetail();
            render(); // re-render to clear selection highlight
          } else {
            showDayDetail(date);
            render(); // re-render to show selection highlight
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
