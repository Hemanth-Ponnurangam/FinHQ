import { store } from '../store.js';

export function initCalendar() {
  // ── State ─────────────────────────────────────────────────────
  let currentView = 'monthly';    // 'weekly' | 'monthly' | 'annually' | 'fy'
  let anchorDate  = new Date();   // the "anchor" for navigation

  // ── Element refs ──────────────────────────────────────────────
  const content     = document.getElementById('calContent');
  const summaryBar  = document.getElementById('calSummaryBar');
  const periodLabel = document.getElementById('calPeriodLabel');
  const prevBtn     = document.getElementById('calPrev');
  const nextBtn     = document.getElementById('calNext');

  const tabs = {
    weekly:   document.getElementById('calTabWeekly'),
    monthly:  document.getElementById('calTabMonthly'),
    annually: document.getElementById('calTabAnnually'),
    fy:       document.getElementById('calTabFY')
  };

  // ── Tab selection ─────────────────────────────────────────────
  function setTab(view) {
    currentView = view;
    anchorDate  = new Date(); // reset to today on tab switch
    Object.entries(tabs).forEach(([v, btn]) => {
      if (!btn) return;
      const active = v === view;
      btn.classList.toggle('bg-white',     active);
      btn.classList.toggle('dark:bg-gray-600', active);
      btn.classList.toggle('shadow-sm',    active);
      btn.classList.toggle('text-forest-900', active);
      btn.classList.toggle('dark:text-white',  active);
      btn.classList.toggle('text-gray-500',    !active);
      btn.classList.toggle('dark:text-gray-400', !active);
    });
    render();
  }

  Object.entries(tabs).forEach(([v, btn]) => btn?.addEventListener('click', () => setTab(v)));

  // ── Navigation ────────────────────────────────────────────────
  prevBtn?.addEventListener('click', () => { navigate(-1); render(); });
  nextBtn?.addEventListener('click', () => { navigate( 1); render(); });

  function navigate(dir) {
    if (currentView === 'weekly') {
      anchorDate = new Date(anchorDate);
      anchorDate.setDate(anchorDate.getDate() + dir * 7);
    } else if (currentView === 'monthly') {
      anchorDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1);
    } else {
      // annually / fy — navigate by year
      anchorDate = new Date(anchorDate.getFullYear() + dir, anchorDate.getMonth(), 1);
    }
  }

  // ── Transaction lookup helpers ────────────────────────────────
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
      if (t.type === 'income')  income  += (t.amount || 0);
      else                      expense += (t.amount || 0);
    });
    return { income, expense, net: income - expense };
  }

  function fmt(n) { return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

  // ── Summary Bar ───────────────────────────────────────────────
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
        <p class="font-semibold ${netColor} text-sm">${net >= 0 ? '+' : '-'}${fmt(net)}</p>
      </div>`;
  }

  // ── Weekly View ───────────────────────────────────────────────
  function renderWeekly() {
    // Find Mon of anchor's week
    const dow        = anchorDate.getDay(); // 0=Sun
    const diffToMon  = (dow === 0) ? -6 : 1 - dow;
    const monday     = new Date(anchorDate);
    monday.setDate(monday.getDate() + diffToMon);

    const days     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const today    = new Date();
    const dayMaps  = [];
    let   totInc   = 0, totExp = 0;

    for (let i = 0; i < 7; i++) {
      const d    = new Date(monday);
      d.setDate(d.getDate() + i);
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
          <!-- Bar area -->
          <div class="flex-1 w-full flex items-end justify-center gap-0.5 h-20">
            ${income  > 0 ? `<div class="w-2.5 rounded-t-sm bg-green-400 transition-all" style="height:${pctInc.toFixed(0)}%"></div>` : '<div class="w-2.5"></div>'}
            ${expense > 0 ? `<div class="w-2.5 rounded-t-sm bg-red-400 transition-all"   style="height:${pctExp.toFixed(0)}%"></div>` : '<div class="w-2.5"></div>'}
          </div>
          ${hasData ? `<div class="text-center">
            ${income  > 0 ? `<p class="text-[8px] text-green-600 font-semibold leading-none">${fmt(income)}</p>` : ''}
            ${expense > 0 ? `<p class="text-[8px] text-red-500 font-semibold leading-none">${fmt(expense)}</p>` : ''}
          </div>` : `<p class="text-[8px] text-gray-300 dark:text-gray-600">—</p>`}
        </div>`;
    });

    html += `</div>
      <div class="flex items-center gap-4 mt-4 pt-3 border-t dark:border-gray-700 justify-center text-[10px] text-gray-400">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-green-400 inline-block"></span> Income</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-red-400 inline-block"></span> Expense</span>
      </div>
    </div>`;

    renderSummary(totInc, totExp, totInc - totExp);
    return html;
  }

  // ── Monthly View ──────────────────────────────────────────────
  function renderMonthly() {
    const year  = anchorDate.getFullYear();
    const month = anchorDate.getMonth();

    const from = new Date(year, month, 1, 0, 0, 0, 0);
    const to   = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const { income, expense, net } = sumTxns(txnsInRange(from, to));

    periodLabel.innerText = anchorDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Build txn map: day → {income, expense, txns[]}
    const txnMap = {};
    txnsInRange(from, to).forEach(t => {
      const day = new Date(t.date).getDate();
      if (!txnMap[day]) txnMap[day] = { income: 0, expense: 0, count: 0 };
      if (t.type === 'income') txnMap[day].income += (t.amount || 0);
      else                     txnMap[day].expense += (t.amount || 0);
      txnMap[day].count++;
    });

    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    // Convert to Mon-first: 0=Mon … 6=Sun
    const startOffset  = (firstDayOfWeek === 0) ? 6 : firstDayOfWeek - 1;
    const today        = new Date();

    const dayHeaders = ['M','T','W','T','F','S','S'];
    let html = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-card border border-forest-50/50 dark:border-gray-700 overflow-hidden">
        <div class="grid grid-cols-7 bg-forest-50 dark:bg-gray-700/50">
          ${dayHeaders.map(h => `<div class="text-center text-[10px] font-bold text-gray-400 py-2">${h}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 divide-x divide-y divide-gray-50 dark:divide-gray-700/50">`;

    // Empty cells
    for (let i = 0; i < startOffset; i++) html += `<div class="h-14"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const data    = txnMap[day] || null;
      const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
      const hasTxn  = data && data.count > 0;

      html += `<div class="h-14 p-1 flex flex-col ${isToday ? 'bg-teal-50/60 dark:bg-teal-900/20' : ''}">
        <span class="text-[10px] leading-none font-semibold ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'}">${day}</span>
        <div class="flex flex-col gap-px mt-auto">
          ${hasTxn && data.income  > 0 ? `<span class="text-[8px] text-green-600 font-bold leading-none truncate">+${fmt(data.income)}</span>`  : ''}
          ${hasTxn && data.expense > 0 ? `<span class="text-[8px] text-red-500 font-bold leading-none truncate">-${fmt(data.expense)}</span>` : ''}
          ${!hasTxn ? '' : ''}
        </div>
      </div>`;
    }

    html += `</div></div>`;
    renderSummary(income, expense, net);
    return html;
  }

  // ── Annual View (helper used by both annually + fy) ───────────
  function renderAnnualGrid(year, months) {
    // months = array of {label, month, year}
    const maxBar = { income: 1, expense: 1 };
    const monthData = months.map(({ label, month, year: y }) => {
      const from = new Date(y, month, 1, 0, 0, 0, 0);
      const to   = new Date(y, month + 1, 0, 23, 59, 59, 999);
      const { income, expense } = sumTxns(txnsInRange(from, to));
      maxBar.income  = Math.max(maxBar.income,  income);
      maxBar.expense = Math.max(maxBar.expense, expense);
      return { label, income, expense };
    });

    const now = new Date();
    let html = `<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-card border border-forest-50/50 dark:border-gray-700 overflow-hidden">
      <div class="divide-y divide-gray-50 dark:divide-gray-700/50">`;

    monthData.forEach(({ label, income, expense }) => {
      const net = income - expense;
      const pInc = maxBar.income  > 0 ? (income  / maxBar.income)  * 100 : 0;
      const pExp = maxBar.expense > 0 ? (expense / maxBar.expense) * 100 : 0;
      const netClr = net >= 0 ? 'text-green-600' : 'text-red-500';
      const hasData = income > 0 || expense > 0;

      html += `
        <div class="flex items-center gap-3 px-4 py-3">
          <span class="text-xs font-bold text-gray-400 w-8 flex-shrink-0">${label}</span>
          <div class="flex-1 space-y-1">
            <div class="flex items-center gap-1.5">
              <div class="h-1.5 rounded-full bg-green-400 transition-all" style="width:${pInc.toFixed(0)}%; min-width:${hasData && income > 0 ? '4' : '0'}px"></div>
              ${income > 0 ? `<span class="text-[9px] text-green-600 font-semibold">${fmt(income)}</span>` : ''}
            </div>
            <div class="flex items-center gap-1.5">
              <div class="h-1.5 rounded-full bg-red-400 transition-all" style="width:${pExp.toFixed(0)}%; min-width:${hasData && expense > 0 ? '4' : '0'}px"></div>
              ${expense > 0 ? `<span class="text-[9px] text-red-500 font-semibold">${fmt(expense)}</span>` : ''}
            </div>
          </div>
          <span class="text-[10px] font-bold ${hasData ? netClr : 'text-gray-200 dark:text-gray-700'} text-right w-14 flex-shrink-0">${hasData ? (net >= 0 ? '+' : '-') + fmt(net) : '—'}</span>
        </div>`;
    });

    html += `</div></div>`;
    return html;
  }

  // ── Annually View (Jan–Dec) ───────────────────────────────────
  function renderAnnually() {
    const year = anchorDate.getFullYear();
    periodLabel.innerText = `Year ${year}`;

    const months = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(year, i, 1).toLocaleDateString('en-IN', { month: 'short' }),
      month: i, year
    }));

    const from = new Date(year, 0,  1,  0,  0, 0, 0);
    const to   = new Date(year, 11, 31, 23, 59, 59, 999);
    const { income, expense, net } = sumTxns(txnsInRange(from, to));
    renderSummary(income, expense, net);
    return renderAnnualGrid(year, months);
  }

  // ── FY Annual View (Apr–Mar, Indian FY) ───────────────────────
  function renderFY() {
    const year = anchorDate.getFullYear();
    // Determine FY start: if current month >= April (3), FY is year/year+1; else (year-1)/year
    const fyStart  = anchorDate.getMonth() >= 3 ? year : year - 1;
    const fyEnd    = fyStart + 1;
    periodLabel.innerText = `FY ${fyStart}–${String(fyEnd).slice(2)}`;

    const months = [];
    for (let i = 3; i <= 14; i++) { // Apr(3) … Mar(14, wraps to next year)
      const m = i % 12;
      const y = m >= 3 ? fyStart : fyEnd;
      months.push({
        label: new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'short' }),
        month: m, year: y
      });
    }

    const from = new Date(fyStart,  3,  1,  0,  0, 0, 0);  // Apr 1
    const to   = new Date(fyEnd,    2, 31, 23, 59, 59, 999); // Mar 31
    const { income, expense, net } = sumTxns(txnsInRange(from, to));
    renderSummary(income, expense, net);
    return renderAnnualGrid(fyStart, months);
  }

  // ── Main Render Dispatcher ────────────────────────────────────
  function render() {
    if (!content || !store.isLoaded) return;
    let html = '';
    if      (currentView === 'weekly')   html = renderWeekly();
    else if (currentView === 'monthly')  html = renderMonthly();
    else if (currentView === 'annually') html = renderAnnually();
    else if (currentView === 'fy')       html = renderFY();
    content.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  // Re-render whenever store updates (new transactions added)
  store.subscribe(state => {
    if (!state.isLoaded) return;
    render();
  });
}
