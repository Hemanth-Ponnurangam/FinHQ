import { db, collection } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDashboard() {
  // --- State ---
  let currentMonthSpend   = 0;
  let prevMonthSpend      = 0;
  let currentMonthIncome  = 0;
  let totalAssetValue     = 0;
  let totalDebtValue      = 0;
  let txnThisMonthCount   = 0;
  let totalAssetsCount    = 0;
  let totalDebtsCount     = 0;
  let upcomingSips        = [];   // [{ name, amount, billingDate }]
  let overBudgetCategories = [];  // [{ category, spent, limit }]

  // Net worth is assets - debts. Liquid cash is derived only from this month's
  // transactions as a delta indicator — not a lifetime accumulation.
  let netWorth = 0;

  // Debounce: batch rapid Firestore updates into a single rAF paint
  let updatePending = false;
  function scheduleUpdate() {
    if (!updatePending) {
      updatePending = true;
      requestAnimationFrame(updateUI);
    }
  }

  // --- Error State ---
  // If any listener errors, show an error banner and stop showing skeletons
  function handleDbError(err) {
    console.error('Firestore sync failed:', err);
    showErrorBanner();
  }

  function showErrorBanner() {
    const banner = document.getElementById('dashboardErrorBanner');
    if (banner) banner.classList.remove('hidden');
    // Hide all skeletons so they don't spin forever
    ['nwSkeleton', 'savingsSkeleton', 'spendSkeleton'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });
  }

  // --- Main UI Render ---
  function updateUI() {
    updatePending = false;

    const now = new Date();

    // ── Net Worth ──────────────────────────────────────────────────────────
    netWorth = totalAssetValue - totalDebtValue;
    const nwIsNeg = netWorth < 0;

    hideSkeleton('nwSkeleton', 'netWorthDisplay');
    const nwDisplay = document.getElementById('netWorthDisplay');
    if (nwDisplay) {
      nwDisplay.innerText = formatINR(netWorth, nwIsNeg);
      nwDisplay.className = `font-display text-3xl font-semibold ${nwIsNeg ? 'text-red-500' : 'text-forest-900 dark:text-white'}`;
    }

    // ── Current Month Spend + MoM Change ──────────────────────────────────
    hideSkeleton('spendSkeleton', 'monthSpendDisplay');
    const spendDisplay = document.getElementById('monthSpendDisplay');
    if (spendDisplay) spendDisplay.innerText = `₹${currentMonthSpend.toLocaleString('en-IN')}`;

    const momEl = document.getElementById('momSpendBadge');
    if (momEl) {
      if (prevMonthSpend > 0) {
        const pct = ((currentMonthSpend - prevMonthSpend) / prevMonthSpend) * 100;
        const isUp = pct > 0;
        momEl.innerText = `${isUp ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs last mo`;
        momEl.className = `text-[10px] font-semibold mt-0.5 ${isUp ? 'text-red-500' : 'text-green-500'}`;
        momEl.classList.remove('hidden');
      } else {
        momEl.classList.add('hidden');
      }
    }

    // ── Savings Rate ───────────────────────────────────────────────────────
    hideSkeleton('savingsSkeleton', 'savingsRateDisplay');
    const warningEl = document.getElementById('savingsRateWarning');
    const savingsDisplay = document.getElementById('savingsRateDisplay');

    let savingsRate = null;
    if (currentMonthIncome > 0) {
      savingsRate = ((currentMonthIncome - currentMonthSpend) / currentMonthIncome) * 100;
      if (warningEl) warningEl.classList.add('hidden');
    } else {
      // No income logged yet this month — show last month's data or placeholder
      if (warningEl) warningEl.classList.remove('hidden');
    }

    if (savingsDisplay) {
      savingsDisplay.innerText = savingsRate !== null ? `${savingsRate.toFixed(1)}%` : '—';
      savingsDisplay.className = `font-display text-2xl font-semibold ${
        savingsRate === null ? 'text-forest-400 dark:text-gray-400'
        : savingsRate >= 0   ? 'text-forest-900 dark:text-white'
                             : 'text-red-500'
      }`;
    }

    // ── Spending Velocity ──────────────────────────────────────────────────
    const velocityEl = document.getElementById('spendingVelocity');
    if (velocityEl) {
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (dayOfMonth > 0 && currentMonthSpend > 0) {
        const projected = Math.round((currentMonthSpend / dayOfMonth) * daysInMonth);
        velocityEl.innerText = `At this rate, ~₹${projected.toLocaleString('en-IN')} by month end`;
        velocityEl.classList.remove('hidden');
      } else {
        velocityEl.classList.add('hidden');
      }
    }

    // ── Module Card Summaries ──────────────────────────────────────────────
    const lSum = document.getElementById('ledgerSummary');
    const wSum = document.getElementById('wealthSummary');
    const dSum = document.getElementById('debtSummary');
    if (lSum) { lSum.classList.remove('animate-pulse'); lSum.innerText = `${txnThisMonthCount} entries this mo`; }
    if (wSum) { wSum.classList.remove('animate-pulse'); wSum.innerText = `${totalAssetsCount} active assets`; }
    if (dSum) { dSum.classList.remove('animate-pulse'); dSum.innerText = `${totalDebtsCount} active loans`; }

    // ── Today's Agenda ─────────────────────────────────────────────────────
    renderAgenda(now);
  }

  // ── Today's Agenda Panel ──────────────────────────────────────────────────
  // Shows SIPs/EMIs due today or in the next 3 days, and over-budget warnings.
  function renderAgenda(now) {
    const agendaEl = document.getElementById('todayAgenda');
    if (!agendaEl) return;

    const items = [];
    const todayDate = now.getDate();

    // Upcoming SIPs (billing date within next 3 days or already today)
    upcomingSips.forEach(sip => {
      const daysUntil = sip.billingDate - todayDate;
      if (daysUntil >= 0 && daysUntil <= 3) {
        const label = daysUntil === 0 ? 'Today' : `In ${daysUntil}d`;
        items.push(`<div class="flex justify-between text-sm">
          <span class="text-forest-800 dark:text-gray-200">📅 ${sip.name}</span>
          <span class="text-purple-600 font-semibold">₹${sip.amount.toLocaleString('en-IN')} <span class="text-[10px] text-gray-400">${label}</span></span>
        </div>`);
      }
    });

    // Over-budget warnings
    overBudgetCategories.forEach(b => {
      items.push(`<div class="flex justify-between text-sm">
        <span class="text-red-600 dark:text-red-400">🚨 ${b.category} over budget</span>
        <span class="text-red-500 font-semibold">+₹${(b.spent - b.limit).toLocaleString('en-IN')}</span>
      </div>`);
    });

    const wrapper = document.getElementById('todayAgendaWrapper');
    if (items.length === 0) {
      if (wrapper) wrapper.classList.add('hidden');
    } else {
      if (wrapper) wrapper.classList.remove('hidden');
      agendaEl.innerHTML = items.join('');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function hideSkeleton(skeletonId, displayId) {
    document.getElementById(skeletonId)?.classList.add('hidden');
    document.getElementById(displayId)?.classList.remove('hidden');
  }

  function formatINR(value, isNeg) {
    return isNeg
      ? `-₹${Math.abs(value).toLocaleString('en-IN')}`
      : `₹${value.toLocaleString('en-IN')}`;
  }

  // ── Firestore Listeners ───────────────────────────────────────────────────

  // 1. Transactions — current + previous month income/spend only (not lifetime)
  onSnapshot(collection(db, 'transactions'), (snapshot) => {
    currentMonthSpend  = 0;
    prevMonthSpend     = 0;
    currentMonthIncome = 0;
    txnThisMonthCount  = 0;

    const now = new Date();
    const curMonth  = now.getMonth();
    const curYear   = now.getFullYear();
    const prevDate  = new Date(now);
    prevDate.setMonth(curMonth - 1);
    const prevMonth = prevDate.getMonth();
    const prevYear  = prevDate.getFullYear();

    snapshot.forEach(doc => {
      const txn    = doc.data();
      const amount = txn.amount || 0;
      const date   = new Date(txn.date || new Date().toISOString());
      const m      = date.getMonth();
      const y      = date.getFullYear();

      const isCur  = m === curMonth  && y === curYear;
      const isPrev = m === prevMonth && y === prevYear;

      if (isCur) txnThisMonthCount++;
      if (txn.type === 'income'  && isCur)  currentMonthIncome += amount;
      if (txn.type === 'expense' && isCur)  currentMonthSpend  += amount;
      if (txn.type === 'expense' && isPrev) prevMonthSpend     += amount;
    });

    scheduleUpdate();
  }, handleDbError);

  // 2. Assets
  onSnapshot(collection(db, 'assets'), (snapshot) => {
    totalAssetValue  = 0;
    totalAssetsCount = snapshot.size;
    snapshot.forEach(doc => {
      const asset     = doc.data();
      const qty       = asset.qty || 1;
      const price     = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);
      totalAssetValue += qty * price;
    });
    scheduleUpdate();
  }, handleDbError);

  // 3. Debts
  onSnapshot(collection(db, 'debts'), (snapshot) => {
    totalDebtValue  = 0;
    totalDebtsCount = snapshot.size;
    snapshot.forEach(doc => {
      const debt      = doc.data();
      const principal = debt.principal || 0;
      const paid      = debt.paid || 0;
      totalDebtValue += Math.max(0, principal - paid);
    });
    scheduleUpdate();
  }, handleDbError);

  // 4. Recurring / SIPs — for the Today's Agenda panel
  onSnapshot(collection(db, 'recurring'), (snapshot) => {
    upcomingSips = [];
    snapshot.forEach(doc => {
      const sip = doc.data();
      if (sip.billingDate && sip.amount) {
        upcomingSips.push({ name: sip.name || 'Recurring', amount: sip.amount, billingDate: Number(sip.billingDate) });
      }
    });
    scheduleUpdate();
  }, handleDbError);

  // 5. Budgets — cross-reference with live expenses for over-budget alerts
  // We re-use the transaction data already loaded; this listener just keeps
  // the budget limits in sync so we can compare.
  let liveBudgets = [];
  let liveMonthExpensesByTag = {};

  function recomputeOverBudget() {
    overBudgetCategories = [];
    liveBudgets.forEach(b => {
      const cat    = (b.category || '').toLowerCase();
      const spent  = liveMonthExpensesByTag[cat] || 0;
      if (spent > b.limit) {
        overBudgetCategories.push({ category: b.category, spent, limit: b.limit });
      }
    });
  }

  onSnapshot(collection(db, 'budgets'), (snapshot) => {
    liveBudgets = snapshot.docs.map(d => d.data());
    recomputeOverBudget();
    scheduleUpdate();
  }, handleDbError);

  // Re-compute over-budget whenever transactions change (reuse the main listener
  // by adding a secondary pass here via a separate snapshot).
  onSnapshot(collection(db, 'transactions'), (snapshot) => {
    liveMonthExpensesByTag = {};
    const now = new Date();
    snapshot.forEach(doc => {
      const txn  = doc.data();
      const date = new Date(txn.date || new Date().toISOString());
      if (
        txn.type === 'expense' &&
        date.getMonth()    === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      ) {
        const tag = (txn.tags && txn.tags[0] ? txn.tags[0] : 'uncategorized').toLowerCase();
        liveMonthExpensesByTag[tag] = (liveMonthExpensesByTag[tag] || 0) + (txn.amount || 0);
      }
    });
    recomputeOverBudget();
    // No scheduleUpdate here — the main transactions listener above already fires
    // and will call scheduleUpdate. Avoids double render.
  }, () => {});  // silent error — main listener handles reporting
}
