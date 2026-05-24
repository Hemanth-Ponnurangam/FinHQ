import { store } from '../store.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * BUG FIX 3: Parse a date string safely.
 * Bare YYYY-MM-DD strings are treated as UTC midnight by the spec, which in
 * IST (+5:30) lands the same calendar day but can silently mis-classify
 * transactions near month boundaries when compared with local-time `now`.
 * Parsing as local midnight avoids the offset entirely.
 */
function parseDate(str) {
  if (!str) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d); // local midnight — no UTC offset
  }
  return new Date(str);
}

/** Time-based contextual greeting (GAP 3) */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * GAP 2: Open the Add-Transaction sheet pre-set to "income".
 * Mirrors openSheet() from bottomSheets.js without needing the uiController reference.
 */
function openAddIncome() {
  document.dispatchEvent(new Event('resetTxnForm'));
  const txnTypeEl = document.getElementById('txnType');
  if (txnTypeEl) txnTypeEl.value = 'income';

  const sheet   = document.getElementById('txnFormSheet');
  const overlay = document.getElementById('bottomSheetOverlay');
  if (!sheet || !overlay) return;

  // Collapse every known sheet first (matches allSheets in bottomSheets.js)
  [
    'txnFormSheet','assetFormSheet','debtFormSheet','plannerFormSheet',
    'sipFormSheet','fuelFormSheet','confirmSheet','strategySheet',
    'amortizationSheet','addMenuSheet'
  ].forEach(id => document.getElementById(id)?.classList.add('translate-y-full'));

  sheet.classList.remove('hidden');
  overlay.classList.remove('hidden');
  setTimeout(() => {
    overlay.classList.remove('opacity-0');
    sheet.classList.remove('translate-y-full');
  }, 10);
}

/** GAP 1: Render a minimal SVG polyline sparkline into a container element. */
function renderSparkline(values, container) {
  if (!container || values.length < 2) return;
  const W = 120, H = 28;
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 2) - 1; // 1px padding top/bottom
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const trending = values[values.length - 1] >= values[values.length - 2];
  const stroke   = trending ? '#4ade80' : '#f87171'; // green-400 / red-400

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
         xmlns="http://www.w3.org/2000/svg" class="opacity-75">
      <polyline points="${pts}" fill="none" stroke="${stroke}"
                stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

// ── One-time DOM scaffolding ────────────────────────────────────────────────

/** Inject the greeting element above the hub sections. */
function ensureGreeting() {
  if (document.getElementById('hubGreeting')) return;
  const hubView = document.getElementById('hubView');
  if (!hubView) return;
  const el = document.createElement('p');
  el.id        = 'hubGreeting';
  el.className = 'text-sm font-semibold text-forest-500 dark:text-forest-400 px-1 -mb-4';
  hubView.prepend(el);
}

/** Inject the sparkline row inside the net-worth card, below nwBreakdown. */
function ensureSparkline() {
  if (document.getElementById('nwSparklineWrap')) return;
  // The net-worth card is the direct parent of nwBreakdown
  const breakdown = document.getElementById('nwBreakdown');
  if (!breakdown) return;
  const wrap = document.createElement('div');
  wrap.id        = 'nwSparklineWrap';
  wrap.className = 'mt-3 flex items-center gap-2 relative z-10';
  wrap.innerHTML = `
    <span class="text-[9px] text-forest-400 font-semibold tracking-widest uppercase whitespace-nowrap">6-mo</span>
    <div id="nwSparklineSvg"></div>`;
  breakdown.after(wrap);
}

// ── Main export ─────────────────────────────────────────────────────────────
export function initDashboard() {
  ensureGreeting();
  ensureSparkline();

  // GAP 2: make the "Log income" warning tappable — opens Add Txn pre-set to income
  const warnEl = document.getElementById('savingsRateWarning');
  if (warnEl) {
    warnEl.style.cursor        = 'pointer';
    warnEl.title               = 'Tap to log income';
    warnEl.classList.add('underline', 'decoration-dotted');
    warnEl.addEventListener('click', openAddIncome);
  }

  store.subscribe(state => {
    if (!state.isLoaded) return;

    // ── GAP 3: Contextual greeting ─────────────────────────────────
    const greetEl = document.getElementById('hubGreeting');
    if (greetEl) greetEl.textContent = getGreeting();

    let liquidCash         = 0;
    let currentMonthSpend  = 0;
    let currentMonthIncome = 0;
    let totalAssetValue    = 0;
    let totalDebtValue     = 0;
    const now = new Date();

    // ── Transactions ───────────────────────────────────────────────
    state.transactions.forEach(txn => {
      const amt = txn.amount || 0;

      // BUG FIX 3: use local-midnight parsing for YYYY-MM-DD strings
      const d = parseDate(txn.date);
      const isCurrentMonth =
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

      // BUG FIX 2: Investment-tagged expenses represent money that moved from
      // liquid cash into an asset already tracked in totalAssetValue.
      // Deducting them from liquidCash AND counting them in assets double-counts
      // that capital in the net-worth formula (liquidCash + assets - debts).
      const isInvestmentExpense =
        txn.type === 'expense' &&
        txn.tags?.some(t => t.toLowerCase() === 'investments');

      if (txn.type === 'income') {
        liquidCash += amt;
        if (isCurrentMonth) currentMonthIncome += amt;
      } else if (isInvestmentExpense) {
        // Capital moved to an asset — excluded from liquidCash to prevent double-count,
        // but still included in this month's spend for savings-rate calculation.
        if (isCurrentMonth) currentMonthSpend += amt;
      } else {
        liquidCash -= amt;
        if (isCurrentMonth) currentMonthSpend += amt;
      }
    });

    // ── Assets ─────────────────────────────────────────────────────
    state.assets.forEach(asset => {
      const qty   = asset.qty || 1;
      const price = asset.currentPrice !== undefined
        ? asset.currentPrice
        : (asset.buyPrice || 0);
      totalAssetValue += qty * price;
    });

    // ── Debts ──────────────────────────────────────────────────────
    state.debts.forEach(debt => {
      totalDebtValue += (debt.principal || 0) - (debt.paid || 0);
    });

    const totalNetWorth = (liquidCash + totalAssetValue) - totalDebtValue;
    const nwIsNeg       = totalNetWorth < 0;
    const cashIsNeg     = liquidCash < 0; // BUG FIX 1: track negative-cash state

    // ── Hide skeletons ─────────────────────────────────────────────
    document.getElementById('nwSkeleton')?.classList.add('hidden');
    document.getElementById('savingsSkeleton')?.classList.add('hidden');
    document.getElementById('spendSkeleton')?.classList.add('hidden');

    // ── Net Worth ──────────────────────────────────────────────────
    const nwDisplay = document.getElementById('netWorthDisplay');
    if (nwDisplay) {
      nwDisplay.classList.remove('hidden');
      nwDisplay.innerText = nwIsNeg
        ? `-₹${Math.abs(totalNetWorth).toLocaleString('en-IN')}`
        : `₹${totalNetWorth.toLocaleString('en-IN')}`;
    }

    // ── Breakdown row: Cash | Assets | Debt ─────────────────────────
    const nwBreakdown = document.getElementById('nwBreakdown');
    if (nwBreakdown) {
      nwBreakdown.classList.remove('hidden');
      const cashEl = document.getElementById('nwCash');
      const assEl  = document.getElementById('nwAssets');
      const debtEl = document.getElementById('nwDebt');

      if (cashEl) {
        // BUG FIX 1: if liquid cash went negative, render it red with a warning glyph
        // so the user can't miss it on the hub card.
        const cashFormatted = cashIsNeg
          ? `-₹${Math.abs(liquidCash).toLocaleString('en-IN')}`
          : `₹${liquidCash.toLocaleString('en-IN')}`;

        if (cashIsNeg) {
          cashEl.innerHTML =
            `<span class="text-red-400 font-bold">${cashFormatted} ⚠</span>`;
        } else {
          cashEl.innerText = cashFormatted;
          cashEl.className = 'text-white font-semibold'; // reset to original
        }
      }

      if (assEl)  assEl.innerText  = `₹${totalAssetValue.toLocaleString('en-IN')}`;
      if (debtEl) debtEl.innerText = `-₹${totalDebtValue.toLocaleString('en-IN')}`;
    }

    // ── Month Spend ────────────────────────────────────────────────
    const spendDisplay = document.getElementById('monthSpendDisplay');
    if (spendDisplay) {
      spendDisplay.classList.remove('hidden');
      spendDisplay.innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;
    }

    // ── Savings Rate ───────────────────────────────────────────────
    const savingsDisplay = document.getElementById('savingsRateDisplay');
    const warnDisplay    = document.getElementById('savingsRateWarning');
    if (savingsDisplay) {
      savingsDisplay.classList.remove('hidden');
      if (currentMonthIncome > 0) {
        const rate = ((currentMonthIncome - currentMonthSpend) / currentMonthIncome) * 100;
        savingsDisplay.innerText  = `${rate.toFixed(1)}%`;
        savingsDisplay.className  =
          `font-display text-2xl font-semibold ${rate >= 0 ? 'text-forest-900 dark:text-white' : 'text-red-500'}`;
        warnDisplay?.classList.add('hidden');
      } else {
        savingsDisplay.innerText  = '—';
        savingsDisplay.className  = 'font-display text-2xl font-semibold text-gray-400';
        warnDisplay?.classList.remove('hidden');
      }
    }

    // ── Module subtitles ───────────────────────────────────────────
    const lSum = document.getElementById('ledgerSummary');
    const wSum = document.getElementById('wealthSummary');
    const dSum = document.getElementById('debtSummary');
    if (lSum) { lSum.classList.remove('animate-pulse'); lSum.innerText = `${state.transactions.length} total txns`; }
    if (wSum) { wSum.classList.remove('animate-pulse'); wSum.innerText = `${state.assets.length} active assets`; }
    if (dSum) { dSum.classList.remove('animate-pulse'); dSum.innerText = `${state.debts.length} active loans`; }

    // ── GAP 4: Over-budget alert dot on Planner module tile ────────
    const plannerBtn = document.getElementById('openPlannerBtn');
    if (plannerBtn && state.budgets.length > 0) {
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Aggregate this month's spend by category tag
      const spendMap = {};
      state.transactions.forEach(txn => {
        if (txn.type !== 'expense' || !txn.date) return;
        const d   = parseDate(txn.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key !== monthKey) return;
        const tag = txn.tags?.[0]?.toLowerCase() || 'uncategorized';
        spendMap[tag] = (spendMap[tag] || 0) + (txn.amount || 0);
      });

      const overCount = state.budgets.filter(b =>
        (spendMap[b.category.toLowerCase()] || 0) > b.limit
      ).length;

      // Remove stale badge first
      plannerBtn.querySelector('.budget-alert-dot')?.remove();

      if (overCount > 0) {
        plannerBtn.style.position = 'relative';
        const dot = document.createElement('span');
        dot.className   = 'budget-alert-dot absolute -top-1 -right-1 min-w-[1rem] h-4 px-0.5 ' +
                          'bg-red-500 text-white text-[8px] font-bold rounded-full ' +
                          'flex items-center justify-center pointer-events-none';
        dot.textContent = String(overCount);
        plannerBtn.appendChild(dot);
      }
    }

    // ── GAP 1: 6-month cash-flow sparkline ─────────────────────────
    // Plots cumulative liquid-cash (income − regular expenses) at the end of
    // each of the last 6 calendar months. Assets/debts are current-value only
    // and are not mixed in, keeping the trend line historically honest.
    const sparklineEl = document.getElementById('nwSparklineSvg');
    if (sparklineEl) {
      const monthPoints = [];

      for (let mOffset = 5; mOffset >= 0; mOffset--) {
        // Last millisecond of the target month
        const cutoff = new Date(now.getFullYear(), now.getMonth() - mOffset + 1, 0, 23, 59, 59, 999);
        let cash = 0;

        state.transactions.forEach(txn => {
          const d = parseDate(txn.date);
          if (d > cutoff) return;
          const amt = txn.amount || 0;
          const isInvExp =
            txn.type === 'expense' &&
            txn.tags?.some(t => t.toLowerCase() === 'investments');

          if (txn.type === 'income')  cash += amt;
          else if (!isInvExp)         cash -= amt;
        });

        monthPoints.push(cash);
      }

      renderSparkline(monthPoints, sparklineEl);
    }
  });
}
