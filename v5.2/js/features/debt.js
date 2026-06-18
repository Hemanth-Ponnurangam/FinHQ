import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

// ── XSS helper ────────────────────────────────────────────────────────────
// FIX (security/critical): debt.name, debt.loanType are user-entered strings
// injected directly into innerHTML. Escape them before interpolation.
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Active store-subscriber handles — collected here so they can be
// unsubscribed before a re-init pass (e.g. after an error) to prevent
// stacking duplicate callbacks on the store.
let _unsubs = [];

export function initDebt(ui) {
  // Unsubscribe any callbacks from a previous init pass before re-registering.
  // Prevents duplicate renders if viewInited is reset after an error.
  _unsubs.forEach(fn => fn()); _unsubs = [];

  const form         = document.getElementById('debtForm');
  const list         = document.getElementById('debtList');
  const totalDisplay = document.getElementById('totalDebtDisplay');
  const formTitle    = document.getElementById('debtFormTitle');
  let currentEditId  = null;
  let _activeDebt    = null;

  // ── Loan Type Logic ───────────────────────────────────────────
  // loanMode: 'standard' | 'moratorium' | 'bullet'
  // rateMode: 'fixed' | 'flexible'

  // ── Core EMI Calculator ───────────────────────────────────────
  function calculateEMI(principal, annualRate, months) {
    if (!months || months <= 0) return 0;
    if (!annualRate || annualRate === 0) return principal / months;
    const r = (annualRate / 12) / 100;
    return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  }

  function calcPayoff(balance, rate, emi) {
    if (balance <= 0) return { months: 0, totalInterest: 0 };
    if (!rate || rate === 0) {
      if (!emi || emi <= 0) return { months: Infinity, totalInterest: NaN };
      return { months: Math.ceil(balance / emi), totalInterest: 0 };
    }
    // Guard: if EMI is zero (loan still in moratorium period) the balance grows
    // every iteration instead of shrinking — the loop runs 1200 months and returns
    // a meaningless result.  Return sentinel values so callers can display a
    // "Moratorium active" label rather than a nonsensical payoff figure.
    if (!emi || emi <= 0) return { months: Infinity, totalInterest: NaN };
    const r = (rate / 12) / 100;
    let bal = balance, totalInterest = 0, months = 0;
    while (bal > 0.5 && months < 1200) {
      const interest = bal * r;
      totalInterest += interest;
      bal -= (emi - interest);
      months++;
    }
    return { months, totalInterest };
  }

  function remainingMonths(debt) {
    if (!debt.date) return Math.max(1, debt.tenure);
    const loanStart = new Date(debt.date);
    const now = new Date();
    const elapsed = (now.getFullYear() - loanStart.getFullYear()) * 12
                  + (now.getMonth() - loanStart.getMonth());
    return Math.max(1, debt.tenure - elapsed);
  }

  function currentEMI(debt) {
    // Moratorium: if still in moratorium period, EMI = 0
    if (debt.loanMode === 'moratorium') {
      const morMonths = debt.moratoriumMonths || 0;
      const elapsed   = debt.tenure - remainingMonths(debt);
      if (elapsed < morMonths) return 0;
      const repayMonths = debt.tenure - morMonths;
      // Principal has grown by accumulated interest during moratorium
      const r = (debt.rate || 0) / 12 / 100;
      const grownPrincipal = debt.principal * Math.pow(1 + r, morMonths);
      const outstanding = grownPrincipal - (debt.paid || 0);
      return calculateEMI(outstanding, debt.rate || 0, Math.max(1, repayMonths));
    }
    // Bullet: monthly interest only, then full principal at end
    if (debt.loanMode === 'bullet') {
      const r = (debt.rate || 0) / 12 / 100;
      const outstanding = debt.principal - (debt.paid || 0);
      return outstanding * r; // interest-only monthly payment
    }
    // Standard (with flexible rates handled by current rate)
    // If user set a custom monthly target, return that instead
    if (debt.customEmi && debt.customEmi > 0) return debt.customEmi;
    const outstanding = debt.principal - (debt.paid || 0);
    const remMonths   = remainingMonths(debt);
    const rate = _currentRate(debt);
    return calculateEMI(outstanding, rate, remMonths);
  }

  // Get effective current rate (flexible: use rateSchedule if present)
  function _currentRate(debt) {
    if (debt.rateMode !== 'flexible' || !debt.rateSchedule?.length) return debt.rate || 0;
    const elapsed = debt.tenure - remainingMonths(debt);
    // Find last applicable rate segment
    let rate = debt.rate || 0;
    for (const seg of debt.rateSchedule) {
      if (elapsed >= seg.fromMonth) rate = seg.rate;
    }
    return rate;
  }

  // ── Cumulated Amortization Across All Loans ───────────────────
  function buildCumulatedSchedule(debts) {
    // For each debt build month-by-month cash flows, then merge by calendar month
    const monthMap = {}; // key: "MMM YYYY" -> { principal, interest, balance }

    debts.forEach(debt => {
      const outstanding = debt.principal - (debt.paid || 0);
      if (outstanding <= 0) return;

      const loanStart   = new Date(debt.date || new Date());
      const now         = new Date();
      let schedStart    = new Date(now.getFullYear(), now.getMonth(), loanStart.getDate());
      if (schedStart <= now) schedStart.setMonth(schedStart.getMonth() + 1);

      if (debt.loanMode === 'moratorium') {
        _buildMoratoriumSchedule(debt, schedStart, monthMap);
      } else if (debt.loanMode === 'bullet') {
        _buildBulletSchedule(debt, schedStart, monthMap);
      } else {
        _buildStandardSchedule(debt, outstanding, schedStart, monthMap);
      }
    });

    return monthMap;
  }

  function _buildStandardSchedule(debt, outstanding, schedStart, monthMap) {
    const rateSchedule = (debt.rateMode === 'flexible' && debt.rateSchedule?.length)
      ? debt.rateSchedule : null;
    let balance    = outstanding;
    const remM     = remainingMonths(debt);
    const elapsed0 = debt.tenure - remM;
    let rate       = debt.rate || 0;
    // EMI is computed once for fixed-rate loans.  For flexible-rate loans it is
    // recomputed each time a new rate segment takes effect — this matches how
    // Indian banks actually behave (rate change → new EMI, not extended tenure).
    // Using the original rate's EMI for all future segments caused projections to
    // diverge from reality for home/auto loans with floating rates.
    let emi        = calculateEMI(outstanding, rate, remM);
    let prevRate   = rate; // tracks which rate the current emi was computed for
    let mc = 0;
    while (balance > 0.5 && mc < remM + 2) {
      // Flexible rate lookup
      if (rateSchedule) {
        const absMonth = elapsed0 + mc;
        for (const seg of rateSchedule) {
          if (absMonth >= seg.fromMonth) rate = seg.rate;
        }
        // Recalculate EMI if the rate segment changed
        if (rate !== prevRate) {
          const monthsLeft = remM - mc;
          if (monthsLeft > 0) emi = calculateEMI(balance, rate, monthsLeft);
          prevRate = rate;
        }
      }
      const r = rate / 12 / 100;
      const interest = balance * r;
      let principalPaid = emi - interest;
      if (principalPaid <= 0) principalPaid = balance / Math.max(remM, 1);
      if (principalPaid > balance) principalPaid = balance;
      balance -= principalPaid;

      const labelDate = new Date(schedStart);
      labelDate.setMonth(labelDate.getMonth() + mc);
      const key = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      if (!monthMap[key]) monthMap[key] = { principal: 0, interest: 0, balance: 0, date: labelDate };
      monthMap[key].principal += principalPaid;
      monthMap[key].interest  += interest;
      monthMap[key].balance   += balance;
      mc++;
    }
  }

  function _buildMoratoriumSchedule(debt, schedStart, monthMap) {
    const morMonths   = debt.moratoriumMonths || 0;
    const r = (debt.rate || 0) / 12 / 100;
    // FIX (debt/high): start from outstanding (principal - paid), not the full
    // principal. Starting from full principal means the moratorium phase compounds
    // interest on already-repaid amounts, making the schedule inconsistent with
    // what the repayment phase starts with.
    let balance = Math.max(0, debt.principal - (debt.paid || 0));
    let mc = 0;

    // Moratorium phase: interest-only piles on
    for (let i = 0; i < morMonths; i++) {
      const interest = balance * r;
      balance += interest; // interest capitalizes
      const labelDate = new Date(schedStart);
      labelDate.setMonth(labelDate.getMonth() + mc);
      const key = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      if (!monthMap[key]) monthMap[key] = { principal: 0, interest: 0, balance: 0, date: labelDate };
      monthMap[key].interest += interest;
      monthMap[key].balance  += balance;
      mc++;
    }

    // After moratorium: repay grown principal
    const repayMonths = debt.tenure - morMonths;
    // balance now already reflects the outstanding amount (paid was subtracted at the top),
    // so grownPrincipal is simply the compounded balance — no second deduction of paid.
    const grownPrincipal = balance;
    if (grownPrincipal <= 0) return;
    const emi = calculateEMI(grownPrincipal, debt.rate || 0, Math.max(1, repayMonths));
    let repayBal = grownPrincipal;
    for (let i = 0; i < repayMonths && repayBal > 0.5; i++) {
      const interest = repayBal * r;
      let principalPaid = emi - interest;
      if (principalPaid <= 0) principalPaid = repayBal / Math.max(repayMonths, 1);
      if (principalPaid > repayBal) principalPaid = repayBal;
      repayBal -= principalPaid;
      const labelDate = new Date(schedStart);
      labelDate.setMonth(labelDate.getMonth() + mc);
      const key = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      if (!monthMap[key]) monthMap[key] = { principal: 0, interest: 0, balance: 0, date: labelDate };
      monthMap[key].principal += principalPaid;
      monthMap[key].interest  += interest;
      monthMap[key].balance   += repayBal;
      mc++;
    }
  }

  function _buildBulletSchedule(debt, schedStart, monthMap) {
    const r = (debt.rate || 0) / 12 / 100;
    const outstanding = debt.principal - (debt.paid || 0);
    const interestOnly = outstanding * r;
    const remM = remainingMonths(debt);

    for (let i = 0; i < remM - 1; i++) {
      const labelDate = new Date(schedStart);
      labelDate.setMonth(labelDate.getMonth() + i);
      const key = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      if (!monthMap[key]) monthMap[key] = { principal: 0, interest: 0, balance: 0, date: labelDate };
      monthMap[key].interest += interestOnly;
      monthMap[key].balance  += outstanding;
    }
    // Final month: repay full principal + last interest
    const finalDate = new Date(schedStart);
    finalDate.setMonth(finalDate.getMonth() + remM - 1);
    const finalKey = finalDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    if (!monthMap[finalKey]) monthMap[finalKey] = { principal: 0, interest: 0, balance: 0, date: finalDate };
    monthMap[finalKey].principal += outstanding;
    monthMap[finalKey].interest  += interestOnly;
    monthMap[finalKey].balance   += 0;
  }

  // ── Cascading Payoff Simulation ───────────────────────────────
  // ── Simulation helpers ────────────────────────────────────────────────────
  // Shared loan-state builder for all three cascade simulators.
  // isBullet + maturityMonth were missing from v3.5 — bullet loans have
  // minEMI = outstanding*r (interest only), so payment-interest = 0 every month
  // and their balance never fell below 0.5, causing the while-loop to exhaust
  // all 600 months without the bullet loan ever paying off.
  function _buildLoanStates(debts, sortFn) {
    const arr = debts.map(d => ({
      name:          d.name,
      balance:       Math.max(0, d.principal - (d.paid || 0)),
      rate:          _currentRate(d),
      minEMI:        currentEMI(d),
      isBullet:      d.loanMode === 'bullet',
      maturityMonth: d.loanMode === 'bullet' ? Math.max(1, remainingMonths(d)) : Infinity,
    })).filter(l => l.balance > 0.5 && l.minEMI > 0);
    return sortFn ? arr.sort(sortFn) : arr;
  }

  // One month of the cascading loop — shared by all three simulators.
  // Bullet loans accrue interest and pay off as a balloon at maturity.
  // freeBudget and targetIdx only apply to non-bullet loans.
  function _stepCascade(loans, month) {
    let totalInterest = 0;
    const freeBudget = loans.filter(l => l.balance <= 0.5).reduce((s, l) => s + l.minEMI, 0);
    // Only non-bullet loans can receive accelerated (cascaded) payments
    const targetIdx  = loans.findIndex(l => l.balance > 0.5 && !l.isBullet);
    loans.forEach((l, i) => {
      if (l.balance <= 0.5) return;
      const interest = l.balance * (l.rate / 12 / 100);
      totalInterest += interest;
      if (l.isBullet) {
        // Interest accrues (already counted above); principal repaid in full at maturity.
        if (month >= l.maturityMonth) l.balance = 0;
        return;
      }
      const payment = l.minEMI + (i === targetIdx ? freeBudget : 0);
      l.balance = Math.max(0, l.balance - Math.min(l.balance, Math.max(0, payment - interest)));
    });
    return totalInterest;
  }

  function simulateCascading(debts, sortFn) {
    const loans = _buildLoanStates(debts, sortFn);
    if (!loans.length) return { months: 0, totalInterest: 0 };
    let month = 0, totalInterest = 0;
    while (month < 600 && loans.some(l => l.balance > 0.5)) {
      month++;
      totalInterest += _stepCascade(loans, month);
    }
    return { months: month, totalInterest };
  }

  function simulateLumpSum(debts, sortFn, lumpSum) {
    const loans = _buildLoanStates(debts, sortFn);
    if (!loans.length) return { months: 0, totalInterest: 0 };
    // Apply lump sum only to non-bullet loans — bullet principal is not prepayable
    let remaining = lumpSum;
    for (const l of loans) {
      if (remaining <= 0 || l.isBullet) continue;
      const applied = Math.min(l.balance, remaining);
      l.balance -= applied; remaining -= applied;
    }
    let month = 0, totalInterest = 0;
    while (month < 600 && loans.some(l => l.balance > 0.5)) {
      month++;
      totalInterest += _stepCascade(loans, month);
    }
    return { months: month, totalInterest };
  }

  function simulateLumpSumEvenSplit(debts, lumpSum) {
    const loans = _buildLoanStates(debts, null);
    if (!loans.length) return { months: 0, totalInterest: 0 };
    // Distribute proportionally across non-bullet loans only
    const eligible = loans.filter(l => !l.isBullet);
    const total    = eligible.reduce((s, l) => s + l.balance, 0);
    if (total > 0) eligible.forEach(l => { l.balance = Math.max(0, l.balance - (l.balance / total) * lumpSum); });
    loans.sort((a, b) => b.rate - a.rate);
    let month = 0, totalInterest = 0;
    while (month < 600 && loans.some(l => l.balance > 0.5)) {
      month++;
      totalInterest += _stepCascade(loans, month);
    }
    return { months: month, totalInterest };
  }

  // ── Global Part-Payment Simulator (per-loan comparison) ───────
  function globalPartPaymentSimulator() {
    const debts = store.debts.filter(d => (d.principal - (d.paid || 0)) > 0.5);
    if (!debts.length) return '<p class="text-gray-400 text-xs text-center py-4">No active loans to simulate.</p>';

    const fmtINR = n => `₹${Math.round(Math.max(0, n)).toLocaleString('en-IN')}`;

    // Baseline: each loan's current interest & tenure with no part-payment
    const baseline = debts.map(d => {
      const outstanding = d.principal - (d.paid || 0);
      const rate        = _currentRate(d);
      const emi         = currentEMI(d);
      const { months, totalInterest } = calcPayoff(outstanding, rate, emi);
      return { id: d.id, name: d.name, outstanding, rate, emi, months, totalInterest, mode: d.loanMode || 'standard' };
    });

    // Exclude moratorium loans (totalInterest = NaN) from the aggregate totals
    // so one moratorium loan doesn't corrupt the entire strategy display.
    const activeBaseline   = baseline.filter(r => isFinite(r.months));
    const totalInterest    = activeBaseline.reduce((s, r) => s + r.totalInterest, 0);
    const totalOutstanding = baseline.reduce((s, r) => s + r.outstanding, 0);

    return `
      <div class="space-y-3 text-xs">
        <!-- Input row -->
        <div class="flex gap-2 items-center">
          <input type="number" id="globalPartPayInput"
            class="flex-1 p-3 rounded-xl bg-white dark:bg-gray-700 dark:text-white text-sm outline-none border-2 border-blue-200 dark:border-blue-700 font-semibold"
            placeholder="Enter lump-sum amount (₹)">
          <button type="button" id="globalPartPayBtn"
            class="px-4 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold whitespace-nowrap">
            Compare →
          </button>
        </div>

        <!-- Totals bar (always visible) -->
        <div class="grid grid-cols-2 gap-2">
          <div class="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
            <p class="text-[9px] text-red-400 uppercase font-semibold">Total Outstanding</p>
            <p class="font-bold text-red-600 dark:text-red-400 text-sm">${fmtINR(totalOutstanding)}</p>
          </div>
          <div class="p-2.5 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-center">
            <p class="text-[9px] text-orange-400 uppercase font-semibold">Future Interest (Total)</p>
            <p class="font-bold text-orange-600 dark:text-orange-400 text-sm">${fmtINR(totalInterest)}</p>
          </div>
        </div>

        <!-- Results injected here -->
        <div id="globalPartPayResult" class="hidden space-y-2"></div>
      </div>`;
  }

  // ── Per-Loan Comparison Engine ─────────────────────────────────
  function _runPerLoanComparison(lumpSum) {
    const debts   = store.debts.filter(d => (d.principal - (d.paid || 0)) > 0.5);
    if (!debts.length) return null;
    const fmtINR  = n  => `₹${Math.round(Math.max(0, n)).toLocaleString('en-IN')}`;
    const fmtDiff = n  => n > 0 ? `<span class="text-green-600 font-bold">−${fmtINR(n)}</span>` : `<span class="text-gray-400">—</span>`;
    const fmtMo   = mo => mo > 0 ? `<span class="text-green-600 font-bold">−${mo} mo</span>` : `<span class="text-gray-400">—</span>`;

    // Build per-loan baseline + simulation
    const rows = debts.map(d => {
      const outstanding = d.principal - (d.paid || 0);
      const rate        = _currentRate(d);
      const emi         = currentEMI(d);
      const mode        = d.loanMode || 'standard';

      const base = calcPayoff(outstanding, rate, emi);

      // Clamp lump-sum to outstanding so we don't go negative
      const applied       = Math.min(lumpSum, outstanding);
      const newOutstanding = outstanding - applied;
      const sim           = newOutstanding <= 0
        ? { months: 0, totalInterest: 0 }
        : calcPayoff(newOutstanding, rate, emi);

      const interestSaved = base.totalInterest - sim.totalInterest;
      const monthsSaved   = base.months - sim.months;
      const paidOff       = newOutstanding <= 0;

      // How much of the lump sum is "wasted" here (exceeds balance)
      const waste = Math.max(0, lumpSum - outstanding);

      return {
        name: d.name, mode, rate, outstanding,
        baseTenure: base.months, baseInterest: base.totalInterest,
        simTenure:  sim.months,  simInterest:  sim.totalInterest,
        interestSaved, monthsSaved, paidOff, waste,
        emi: Math.round(emi)
      };
    });

    // Sort by interest saved descending → best loan to prepay is first
    const sorted = [...rows].sort((a, b) => b.interestSaved - a.interestSaved);
    const bestIdx = sorted.findIndex(r => !r.paidOff && r.interestSaved > 0);

    const totalBaseInterest = rows.reduce((s, r) => s + r.baseInterest, 0);
    const totalSimInterest  = rows.reduce((s, r) => s + r.simInterest,  0);
    const totalInterestSaved = totalBaseInterest - totalSimInterest;

    // Build table rows
    const tableRows = sorted.map((r, i) => {
      const modeBadge = r.mode === 'moratorium'
        ? '<span class="text-[8px] bg-orange-100 text-orange-500 px-1 rounded">Mor</span>'
        : r.mode === 'bullet'
        ? '<span class="text-[8px] bg-purple-100 text-purple-500 px-1 rounded">Blt</span>'
        : '';
      const bestBadge = i === bestIdx && !r.paidOff
        ? '<span class="text-[8px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold ml-1">Best</span>' : '';
      const paidBadge = r.paidOff
        ? '<span class="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold ml-1">Fully Paid!</span>' : '';

      return `
        <tr class="${i === bestIdx && !r.paidOff ? 'bg-green-50 dark:bg-green-900/20' : 'bg-white dark:bg-gray-800'} border-b dark:border-gray-700">
          <td class="py-2.5 px-2 align-top">
            <p class="font-semibold dark:text-white text-[11px] leading-tight">${r.name}${modeBadge}${bestBadge}${paidBadge}</p>
            <p class="text-[9px] text-gray-400">${r.rate}% · EMI ${fmtINR(r.emi)}</p>
            <p class="text-[9px] text-red-400">Bal: ${fmtINR(r.outstanding)}</p>
          </td>
          <td class="py-2.5 px-2 text-center align-top">
            <p class="text-[10px] text-gray-500 line-through">${r.baseTenure} mo</p>
            <p class="text-[11px] font-semibold dark:text-white">${r.paidOff ? '0 mo' : r.simTenure + ' mo'}</p>
            <div class="text-[10px]">${fmtMo(r.monthsSaved)}</div>
          </td>
          <td class="py-2.5 px-2 text-right align-top">
            <p class="text-[10px] text-gray-500 line-through">${fmtINR(r.baseInterest)}</p>
            <p class="text-[11px] font-semibold dark:text-white">${r.paidOff ? '₹0' : fmtINR(r.simInterest)}</p>
            <div class="text-[10px]">${fmtDiff(r.interestSaved)}</div>
          </td>
        </tr>`;
    }).join('');

    return { tableRows, totalBaseInterest, totalSimInterest, totalInterestSaved, sorted, bestIdx, fmtINR };
  }

  // ── Form Reset ────────────────────────────────────────────────
  document.addEventListener('resetDebtForm', () => {
    currentEditId = null;
    form?.reset();
    const dateInput = document.getElementById('debtDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteDebtBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveDebtBtn');
    if (saveBtn) saveBtn.innerText = 'Save Debt';
    if (formTitle) formTitle.innerText = 'Add Loan';
    _toggleLoanModeFields('standard');
    _toggleRateModeFields('fixed');
    document.getElementById('rateScheduleContainer')?.classList.add('hidden');
    document.getElementById('rateSegments').innerHTML = '';
  });

  // ── Dynamic form: show/hide moratorium & bullet fields ────────
  function _toggleLoanModeFields(mode) {
    const morEl    = document.getElementById('moratoriumFields');
    const bulletEl = document.getElementById('bulletFields');
    const emiEl    = document.getElementById('paidField');
    if (morEl)    morEl.classList.toggle('hidden', mode !== 'moratorium');
    if (bulletEl) bulletEl.classList.toggle('hidden', mode !== 'bullet');
    if (emiEl)    emiEl.classList.toggle('hidden', mode === 'bullet');
  }

  function _toggleRateModeFields(mode) {
    const flexEl = document.getElementById('rateScheduleContainer');
    if (flexEl) flexEl.classList.toggle('hidden', mode !== 'flexible');
  }

  document.getElementById('debtLoanMode')?.addEventListener('change', e => {
    _toggleLoanModeFields(e.target.value);
  });

  document.getElementById('debtRateMode')?.addEventListener('change', e => {
    _toggleRateModeFields(e.target.value);
  });

  document.getElementById('addRateSegmentBtn')?.addEventListener('click', () => {
    const container = document.getElementById('rateSegments');
    const idx = container.children.length;
    const seg = document.createElement('div');
    seg.className = 'flex gap-2 items-center rate-segment';
    seg.innerHTML = `
      <div class="flex-1">
        <label class="text-[9px] text-gray-400 uppercase">From Month</label>
        <input type="number" class="seg-month w-full p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white text-sm outline-none mt-0.5" placeholder="e.g. 13" min="1">
      </div>
      <div class="flex-1">
        <label class="text-[9px] text-gray-400 uppercase">Rate % p.a.</label>
        <input type="number" step="0.01" class="seg-rate w-full p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white text-sm outline-none mt-0.5" placeholder="e.g. 9.5">
      </div>
      <button type="button" class="remove-seg mt-4 text-red-400 hover:text-red-600 text-lg font-bold">×</button>`;
    seg.querySelector('.remove-seg').addEventListener('click', () => seg.remove());
    container.appendChild(seg);
  });

  // ── Local + Button ────────────────────────────────────────────
  document.getElementById('addDebtLocalBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetDebtForm'));
    ui.openSheet(ui.debtForm);
  });

  // ── Form Submit ───────────────────────────────────────────────
  if (form) {
    function showErr(msg) {
      let el = form.querySelector('.debt-err');
      if (!el) {
        el = document.createElement('p');
        el.className = 'debt-err text-red-500 text-xs font-semibold mt-1 px-1';
        form.querySelector('#saveDebtBtn')?.insertAdjacentElement('beforebegin', el);
      }
      el.textContent = msg;
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.textContent = ''; }, 4000);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const principal = Number(document.getElementById('debtPrincipal').value);
      const paid      = Number(document.getElementById('debtPaid').value)    || 0;
      const rate      = Number(document.getElementById('debtRate').value)    || 0;
      const tenure    = Number(document.getElementById('debtTenure').value)  || 1;
      const loanMode  = document.getElementById('debtLoanMode')?.value || 'standard';
      const rateMode  = document.getElementById('debtRateMode')?.value || 'fixed';

      if (principal <= 0 || tenure <= 0) return showErr('Principal and Tenure must be greater than 0.');
      if (loanMode === 'standard' && (paid < 0 || paid > principal))
        return showErr('Amount repaid cannot exceed the original principal.');

      // FIX (debt/high): moratorium >= tenure makes repayMonths = 0 → calculateEMI
      // divides by 0 → returns Infinity/NaN which poisons the entire amortisation table.
      const moratoriumMonths = loanMode === 'moratorium'
        ? Number(document.getElementById('debtMoratoriumMonths')?.value) || 0 : 0;
      if (loanMode === 'moratorium' && moratoriumMonths >= tenure) {
        return showErr('Moratorium period must be shorter than the total tenure.');
      }

      // Collect rate schedule for flexible mode
      let rateSchedule = [];
      if (rateMode === 'flexible') {
        document.querySelectorAll('.rate-segment').forEach(seg => {
          const fromMonth = Number(seg.querySelector('.seg-month').value) || 1;
          const segRate   = Number(seg.querySelector('.seg-rate').value) || 0;
          rateSchedule.push({ fromMonth, rate: segRate });
        });
        rateSchedule.sort((a, b) => a.fromMonth - b.fromMonth);
      }

      const payload = {
        principal, paid, rate, tenure,
        loanMode,
        rateMode,
        rateSchedule,
        moratoriumMonths,
        emi:            calculateEMI(principal, rate, tenure),
        name:           document.getElementById('debtName').value || 'Loan',
        date:           new Date(document.getElementById('debtDate').value || new Date()).toISOString(),
        loanType:       document.getElementById('debtType')?.value || '',
        foreclosurePct: Number(document.getElementById('debtForeclose')?.value) || 0,
        timestamp:      Date.now(),
        _v:             1
      };

      try {
        if (currentEditId) await updateDoc(doc(db, 'debts', currentEditId), payload);
        else               await addDoc(collection(db, 'debts'), payload);
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteDebtBtn')?.addEventListener('click', () => {
      ui.showConfirm('Delete Loan?', 'This removes the loan record permanently.', async () => {
        try { await deleteDoc(doc(db, 'debts', currentEditId)); }
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // ── Strategy Sheet ────────────────────────────────────────────
  document.getElementById('openStrategyBtn')?.addEventListener('click', () => {
    const avalancheDiv   = document.getElementById('avalancheList');
    const snowballDiv    = document.getElementById('snowballList');
    const savingsDiv     = document.getElementById('strategySavings');
    const savingsContent = document.getElementById('strategySavingsContent');
    const debts          = store.debts;

    const avalanche = [...debts].sort((a, b) => (_currentRate(b) || 0) - (_currentRate(a) || 0));
    const snowball  = [...debts].sort((a, b) =>
      (a.principal - (a.paid || 0)) - (b.principal - (b.paid || 0)));

    const renderList = (arr, container, labelFn, colorClass) => {
      if (!container) return;
      container.innerHTML = arr.map((d, i) => `
        <div class="flex justify-between text-sm items-center p-2 ${i === 0 ? `bg-${colorClass}-50 dark:bg-${colorClass}-900/30 rounded-lg` : ''}">
          <span class="font-semibold dark:text-white">${i + 1}. ${d.name}${i === 0 ? ' 🎯' : ''}
            ${d.loanMode === 'moratorium' ? '<span class="text-[9px] text-orange-400 ml-1">Moratorium</span>' : ''}
            ${d.loanMode === 'bullet' ? '<span class="text-[9px] text-purple-400 ml-1">Bullet</span>' : ''}
            ${d.rateMode === 'flexible' ? '<span class="text-[9px] text-teal-400 ml-1">Flex Rate</span>' : ''}
          </span>
          <span class="text-red-500 font-bold">${labelFn(d)}</span>
        </div>`).join('');
    };

    renderList(avalanche, avalancheDiv,
      d => `${_currentRate(d)}% p.a.`, 'blue');
    renderList(snowball, snowballDiv,
      d => `₹${(d.principal - (d.paid || 0)).toLocaleString('en-IN')}`, 'green');

    if (savingsDiv && savingsContent && debts.length > 0) {
      let noStrategyInterest = 0;
      debts.forEach(d => {
        const outstanding = d.principal - (d.paid || 0);
        if (outstanding <= 0) return;
        const remM = remainingMonths(d);
        const emi  = currentEMI(d);
        const rate = _currentRate(d);
        const { totalInterest } = calcPayoff(outstanding, rate, emi);
        noStrategyInterest += totalInterest;
      });

      const avalancheResult = simulateCascading(debts, (a, b) => (_currentRate(b) || 0) - (_currentRate(a) || 0));
      const snowballResult  = simulateCascading(debts,
        (a, b) => (a.principal - (a.paid || 0)) - (b.principal - (b.paid || 0)));

      const fmtINR  = n => `₹${Math.round(Math.max(0, n)).toLocaleString('en-IN')}`;
      const fmtSave = saved => saved > 0
        ? `<span class="text-green-600 font-semibold">${fmtINR(saved)} saved</span>`
        : `<span class="text-gray-400">No additional savings</span>`;

      const avalancheRows = avalanche.map(d => {
        const outstanding = d.principal - (d.paid || 0);
        if (outstanding <= 0) return null;
        const emi  = currentEMI(d);
        const rate = _currentRate(d);
        const { months, totalInterest } = calcPayoff(outstanding, rate, emi);
        return { name: d.name, months, totalInterest };
      }).filter(Boolean);

      savingsDiv.classList.remove('hidden');
      savingsContent.innerHTML = `
        <div class="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-xs space-y-1">
          <p class="font-semibold dark:text-white mb-1">Per-loan timeline (independent):</p>
          ${avalancheRows.map(r => `
            <div class="flex justify-between py-0.5 text-gray-600 dark:text-gray-300">
              <span>${r.name}</span>
              <span>${!isFinite(r.months)
                ? '<span class="text-amber-500 font-semibold">Moratorium active</span>'
                : `${r.months} mo · ${fmtINR(r.totalInterest)} interest`
              }</span>
            </div>`).join('')}
          <div class="border-t dark:border-gray-600 mt-1 pt-1 flex justify-between font-semibold dark:text-white">
            <span>No-strategy total interest</span>
            <span class="text-red-500">${fmtINR(noStrategyInterest)}</span>
          </div>
        </div>
        <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs space-y-1">
          <p class="font-semibold text-blue-700 dark:text-blue-300 mb-1">⚡ Avalanche (cascade freed EMIs to highest rate)</p>
          <div class="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Total months</span><span class="font-semibold dark:text-white">${avalancheResult.months} mo</span>
          </div>
          <div class="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Total interest</span><span class="font-semibold dark:text-white">${fmtINR(avalancheResult.totalInterest)}</span>
          </div>
          <div class="flex justify-between border-t dark:border-blue-800 pt-1 mt-1">
            <span class="font-semibold dark:text-white">Interest saved</span>
            ${fmtSave(noStrategyInterest - avalancheResult.totalInterest)}
          </div>
        </div>
        <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs space-y-1">
          <p class="font-semibold text-green-700 dark:text-green-300 mb-1">❄️ Snowball (cascade freed EMIs to smallest balance)</p>
          <div class="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Total months</span><span class="font-semibold dark:text-white">${snowballResult.months} mo</span>
          </div>
          <div class="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Total interest</span><span class="font-semibold dark:text-white">${fmtINR(snowballResult.totalInterest)}</span>
          </div>
          <div class="flex justify-between border-t dark:border-green-800 pt-1 mt-1">
            <span class="font-semibold dark:text-white">Interest saved</span>
            ${fmtSave(noStrategyInterest - snowballResult.totalInterest)}
          </div>
        </div>`;
    } else if (savingsDiv) {
      savingsDiv.classList.add('hidden');
    }

    // Render Global Part-Payment Simulator in Strategy sheet
    const partPayContainer = document.getElementById('globalPartPayContainer');
    if (partPayContainer) {
      partPayContainer.innerHTML = globalPartPaymentSimulator();

      document.getElementById('globalPartPayBtn')?.addEventListener('click', () => {
        const lumpSum   = Number(document.getElementById('globalPartPayInput')?.value) || 0;
        const resultDiv = document.getElementById('globalPartPayResult');
        if (!resultDiv) return;
        if (lumpSum <= 0) { resultDiv.classList.add('hidden'); return; }

        const comp = _runPerLoanComparison(lumpSum);
        if (!comp) { resultDiv.classList.add('hidden'); return; }

        const { tableRows, totalBaseInterest, totalSimInterest, totalInterestSaved, sorted, bestIdx, fmtINR } = comp;
        const bestLoan = bestIdx >= 0 ? sorted[bestIdx] : null;

        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
          <!-- Recommendation banner -->
          ${bestLoan ? `
          <div class="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800">
            <p class="text-[10px] text-green-600 dark:text-green-400 font-bold uppercase tracking-wide mb-0.5">💡 Best loan to prepay</p>
            <p class="font-bold text-green-800 dark:text-green-200 text-sm">${bestLoan.name}</p>
            <p class="text-[11px] text-green-700 dark:text-green-300 mt-0.5">
              Saves <span class="font-bold">${fmtINR(bestLoan.interestSaved)}</span> in interest
              · Frees up <span class="font-bold">${bestLoan.monthsSaved} months</span> sooner
            </p>
          </div>` : ''}

          <!-- Per-loan comparison table -->
          <div class="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <table class="w-full text-xs border-collapse">
              <thead>
                <tr class="bg-gray-100 dark:bg-gray-700">
                  <th class="py-2 px-2 text-left text-[10px] text-gray-500 dark:text-gray-300 font-semibold uppercase">Loan</th>
                  <th class="py-2 px-2 text-center text-[10px] text-gray-500 dark:text-gray-300 font-semibold uppercase">Tenure</th>
                  <th class="py-2 px-2 text-right text-[10px] text-gray-500 dark:text-gray-300 font-semibold uppercase">Interest</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>

          <!-- Portfolio total -->
          <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl space-y-1.5">
            <p class="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">📊 Portfolio Impact (if you prepay each individually)</p>
            <div class="flex justify-between text-[11px]">
              <span class="text-gray-500 dark:text-gray-400">Total interest (before)</span>
              <span class="line-through text-gray-400">${fmtINR(totalBaseInterest)}</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="text-gray-500 dark:text-gray-400">Total interest (after)</span>
              <span class="font-semibold dark:text-white">${fmtINR(totalSimInterest)}</span>
            </div>
            <div class="flex justify-between text-sm font-bold border-t dark:border-blue-800 pt-1.5 mt-0.5">
              <span class="dark:text-white">Max interest you can save</span>
              <span class="text-green-600">${fmtINR(totalInterestSaved)}</span>
            </div>
            <p class="text-[9px] text-gray-400 mt-1">↑ This is the best-case total if ${fmtINR(lumpSum)} is applied to each loan independently. Ranked by interest saved ↓</p>
          </div>`;
      });
    }

    // Reset old global what-if
    const globalResult = document.getElementById('globalWhatIfResult');
    const globalInput  = document.getElementById('globalLumpSumInput');
    if (globalResult) { globalResult.classList.add('hidden'); globalResult.innerHTML = ''; }
    if (globalInput)  globalInput.value = '';

    ui.openSheet(ui.strategySheet);
  });

  // ── Old Global What-If Lump Sum Handler (kept for backward compat) ─
  document.getElementById('globalWhatIfBtn')?.addEventListener('click', () => {
    const lumpSum  = Number(document.getElementById('globalLumpSumInput')?.value) || 0;
    const resultDiv = document.getElementById('globalWhatIfResult');
    if (!resultDiv) return;
    if (lumpSum <= 0) { resultDiv.classList.add('hidden'); return; }
    const debts = store.debts.filter(d => (d.principal - (d.paid || 0)) > 0.5);
    if (!debts.length) { resultDiv.classList.add('hidden'); return; }
    const fmtINR = n => `₹${Math.round(Math.max(0, n)).toLocaleString('en-IN')}`;
    const baseLine    = simulateCascading(debts, (a, b) => (_currentRate(b) || 0) - (_currentRate(a) || 0));
    const avalancheLS = simulateLumpSum(debts, (a, b) => (_currentRate(b) || 0) - (_currentRate(a) || 0), lumpSum);
    const snowballLS  = simulateLumpSum(debts, (a, b) => (a.principal - (a.paid || 0)) - (b.principal - (b.paid || 0)), lumpSum);
    const evenSplitLS = simulateLumpSumEvenSplit(debts, lumpSum);
    const results = [
      { label: '⚡ Avalanche',  colorCls: 'blue',   data: avalancheLS },
      { label: '❄️ Snowball',   colorCls: 'green',  data: snowballLS  },
      { label: '⚖️ Even Split', colorCls: 'purple', data: evenSplitLS }
    ].map(r => ({ ...r, interestSaved: baseLine.totalInterest - r.data.totalInterest, monthsSaved: baseLine.months - r.data.months }));
    const bestIdx = results.reduce((best, r, i) => r.interestSaved > results[best].interestSaved ? i : best, 0);
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
      <div class="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-[10px] text-orange-700 dark:text-orange-300 mb-2">
        Baseline: ${baseLine.months} months · ${fmtINR(baseLine.totalInterest)} total interest
      </div>
      ${results.map((r, i) => `
        <div class="p-3 bg-${r.colorCls}-50 dark:bg-${r.colorCls}-900/20 rounded-lg text-xs space-y-1 ${i === bestIdx ? 'ring-2 ring-' + r.colorCls + '-400' : ''}">
          <p class="font-semibold text-${r.colorCls}-700 dark:text-${r.colorCls}-300">${r.label}${i === bestIdx ? ' 🏆' : ''}</p>
          <div class="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Months to debt-free</span>
            <span class="font-semibold dark:text-white">${r.data.months} mo ${r.monthsSaved > 0 ? `<span class="text-green-500">(−${r.monthsSaved})</span>` : ''}</span>
          </div>
          <div class="flex justify-between border-t dark:border-gray-600 pt-1 font-semibold">
            <span class="dark:text-white">Interest saved</span>
            ${r.interestSaved > 0 ? `<span class="text-green-600">${fmtINR(r.interestSaved)}</span>` : `<span class="text-gray-400">—</span>`}
          </div>
        </div>`).join('')}`;
  });

  // ── Amortization Schedule ─────────────────────────────────────
  function showAmortization(debt) {
    _activeDebt = debt;
    const titleEl    = document.getElementById('amortTitle');
    const simResult  = document.getElementById('simResult');
    const extraInput = document.getElementById('extraPaymentInput');
    const modeTag    = document.getElementById('amortModeTag');
    if (!titleEl) return;

    if (simResult)  { simResult.classList.add('hidden'); simResult.innerHTML = ''; }
    if (extraInput) extraInput.value = '';

    titleEl.innerText = `${debt.name} — Schedule`;

    // Show loan mode badge
    if (modeTag) {
      const modeLabels = { moratorium: '📚 Moratorium', bullet: '🏅 Bullet/Gold', standard: '' };
      const rateLabel  = debt.rateMode === 'flexible' ? '📈 Flexible Rate' : '';
      modeTag.innerText = [modeLabels[debt.loanMode || 'standard'], rateLabel].filter(Boolean).join(' · ');
      modeTag.classList.toggle('hidden', !(debt.loanMode !== 'standard' || debt.rateMode === 'flexible'));
    }

    _renderAmortTable(debt, 0);
    ui.openSheet(ui.amortizationSheet);
  }

  function _renderAmortTable(debt, extraLumpSum) {
    const tbody = document.getElementById('amortTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    const loanMode = debt.loanMode || 'standard';

    if (loanMode === 'moratorium') {
      _renderMoratoriumTable(debt, tbody, extraLumpSum);
    } else if (loanMode === 'bullet') {
      _renderBulletTable(debt, tbody);
    } else {
      _renderStandardTable(debt, tbody, extraLumpSum);
    }
  }

  function _renderStandardTable(debt, tbody, extraLumpSum) {
    const outstanding = (debt.principal - (debt.paid || 0)) - extraLumpSum;
    if (outstanding <= 0) {
      tbody.innerHTML = '<p class="text-center text-green-600 font-semibold py-6">🎉 Loan fully paid off!</p>';
      return;
    }

    const rateSchedule = (debt.rateMode === 'flexible' && debt.rateSchedule?.length)
      ? [...debt.rateSchedule].sort((a, b) => a.fromMonth - b.fromMonth) : null;

    let balance    = outstanding;
    let rate       = debt.rate || 0;
    const remM     = remainingMonths(debt);
    const elapsed0 = debt.tenure - remM;
    const emi      = calculateEMI(outstanding, rate, remM);
    let totalInterest = 0, mc = 0;

    const loanStart  = new Date(debt.date || new Date());
    const now        = new Date();
    let schedStart   = new Date(now.getFullYear(), now.getMonth(), loanStart.getDate());
    if (schedStart <= now) schedStart.setMonth(schedStart.getMonth() + 1);

    const rows = [];
    while (balance > 0.5 && mc < remM + 2) {
      // Flexible rate
      if (rateSchedule) {
        const absMonth = elapsed0 + mc;
        for (const seg of rateSchedule) if (absMonth >= seg.fromMonth) rate = seg.rate;
      }
      const r = rate / 12 / 100;
      const interest = balance * r;
      totalInterest += interest;
      let principalPaid = emi - interest;
      if (principalPaid <= 0) principalPaid = balance / Math.max(remM, 1);
      if (principalPaid > balance) principalPaid = balance;
      balance -= principalPaid;

      const labelDate = new Date(schedStart);
      labelDate.setMonth(labelDate.getMonth() + mc);
      const monthLabel = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

      rows.push(`
        <div class="grid grid-cols-4 text-sm border-b border-gray-50 dark:border-gray-700 py-2 items-center">
          <span class="text-gray-500 dark:text-gray-400 text-xs">${monthLabel}</span>
          <span class="text-center font-semibold text-forest-900 dark:text-white text-xs">₹${Math.round(principalPaid).toLocaleString('en-IN')}</span>
          <span class="text-center text-red-500 text-xs">₹${Math.round(interest).toLocaleString('en-IN')}</span>
          <span class="text-right text-gray-500 dark:text-gray-400 text-xs">₹${Math.round(balance).toLocaleString('en-IN')}${rateSchedule ? `<br><span class="text-teal-500 text-[9px]">${rate}%</span>` : ''}</span>
        </div>`);
      mc++;
    }

    rows.push(`<div class="mt-4 p-3 bg-red-50 dark:bg-gray-700 rounded-xl flex justify-between text-sm">
      <span class="font-semibold dark:text-white">Total Future Interest:</span>
      <span class="font-bold text-red-600">₹${Math.round(totalInterest).toLocaleString('en-IN')}</span>
    </div>`);
    tbody.innerHTML = rows.join('');
  }

  function _renderMoratoriumTable(debt, tbody, extraLumpSum) {
    const morMonths   = debt.moratoriumMonths || 0;
    const r           = (debt.rate || 0) / 12 / 100;
    const loanStart   = new Date(debt.date || new Date());
    const now         = new Date();
    let schedStart    = new Date(now.getFullYear(), now.getMonth(), loanStart.getDate());
    if (schedStart <= now) schedStart.setMonth(schedStart.getMonth() + 1);

    // FIX: _buildMoratoriumSchedule (used by the Combined Schedule view) starts
    // moratorium compounding from (principal - paid) to avoid double-counting
    // already-repaid amounts.  This table previously started from full principal,
    // causing it to show larger interest accrual and a different grownPrincipal
    // than the Combined Schedule view for the exact same loan.  Now symmetric.
    let balance       = Math.max(0, (debt.principal || 0) - (debt.paid || 0));
    let moratoriumInterest = 0; // tracked separately for the footer
    let totalInterest = 0;
    let mc = 0;

    const rows = [];

    // Phase 1: moratorium (interest capitalizes on the un-paid balance)
    rows.push(`<div class="text-[10px] font-bold text-orange-600 uppercase tracking-widest py-2 border-b dark:border-gray-600">📚 Moratorium Phase — Interest Accruing</div>`);
    for (let i = 0; i < morMonths; i++) {
      const interest = balance * r;
      moratoriumInterest += interest;
      totalInterest      += interest;
      balance            += interest;
      const labelDate = new Date(schedStart);
      labelDate.setMonth(labelDate.getMonth() + mc);
      const monthLabel = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      rows.push(`
        <div class="grid grid-cols-4 text-xs border-b border-orange-50 dark:border-gray-700 py-1.5 bg-orange-50/30 dark:bg-orange-900/10">
          <span class="text-gray-500 dark:text-gray-400">${monthLabel}</span>
          <span class="text-center text-orange-400">—</span>
          <span class="text-center text-orange-500">₹${Math.round(interest).toLocaleString('en-IN')}</span>
          <span class="text-right text-gray-500 dark:text-gray-400">₹${Math.round(balance).toLocaleString('en-IN')}</span>
        </div>`);
      mc++;
    }

    // Phase 2: repayment — grown principal after moratorium, minus any lump-sum
    const repayMonths    = debt.tenure - morMonths;
    const grownPrincipal = balance - extraLumpSum;
    if (grownPrincipal <= 0) {
      tbody.innerHTML = rows.join('') + '<p class="text-center text-green-600 font-semibold py-4">🎉 Fully paid off!</p>';
      return;
    }
    const emi = calculateEMI(grownPrincipal, debt.rate || 0, Math.max(1, repayMonths));
    let repayBal = grownPrincipal;
    rows.push(`<div class="text-[10px] font-bold text-green-600 uppercase tracking-widest py-2 border-b dark:border-gray-600 mt-2">✅ Repayment Phase — EMI ₹${Math.round(emi).toLocaleString('en-IN')}/mo</div>`);

    for (let i = 0; i < repayMonths && repayBal > 0.5; i++) {
      const interest = repayBal * r;
      totalInterest += interest;
      let principalPaid = emi - interest;
      if (principalPaid <= 0) principalPaid = repayBal / Math.max(repayMonths, 1);
      if (principalPaid > repayBal) principalPaid = repayBal;
      repayBal -= principalPaid;
      const labelDate = new Date(schedStart);
      labelDate.setMonth(labelDate.getMonth() + mc);
      const monthLabel = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      rows.push(`
        <div class="grid grid-cols-4 text-xs border-b border-gray-50 dark:border-gray-700 py-1.5">
          <span class="text-gray-500 dark:text-gray-400">${monthLabel}</span>
          <span class="text-center font-semibold text-forest-900 dark:text-white">₹${Math.round(principalPaid).toLocaleString('en-IN')}</span>
          <span class="text-center text-red-500">₹${Math.round(interest).toLocaleString('en-IN')}</span>
          <span class="text-right text-gray-500 dark:text-gray-400">₹${Math.round(repayBal).toLocaleString('en-IN')}</span>
        </div>`);
      mc++;
    }

    // FIX: footer previously used (principal * r * morMonths) — simple-interest
    // approximation that doesn't match the compounding shown row-by-row above.
    // Now uses moratoriumInterest accumulated in the Phase-1 loop — exact match.
    rows.push(`<div class="mt-4 p-3 bg-orange-50 dark:bg-gray-700 rounded-xl">
      <div class="flex justify-between text-sm"><span class="font-semibold dark:text-white">Interest during Moratorium:</span><span class="text-orange-500 font-bold">₹${Math.round(moratoriumInterest).toLocaleString('en-IN')}</span></div>
      <div class="flex justify-between text-sm mt-1"><span class="font-semibold dark:text-white">Total Future Interest:</span><span class="text-red-600 font-bold">₹${Math.round(totalInterest).toLocaleString('en-IN')}</span></div>
    </div>`);
    tbody.innerHTML = rows.join('');
  }

  function _renderBulletTable(debt, tbody) {
    const r = (debt.rate || 0) / 12 / 100;
    const outstanding   = debt.principal - (debt.paid || 0);
    const interestOnly  = outstanding * r;
    const remM          = remainingMonths(debt);
    const loanStart     = new Date(debt.date || new Date());
    const now           = new Date();
    let schedStart      = new Date(now.getFullYear(), now.getMonth(), loanStart.getDate());
    if (schedStart <= now) schedStart.setMonth(schedStart.getMonth() + 1);
    let totalInterest   = 0;

    const rows = [];
    rows.push(`<div class="text-[10px] font-bold text-purple-600 uppercase tracking-widest py-2 border-b dark:border-gray-600">🏅 Bullet/Gold Loan — Interest Only Until Maturity</div>`);

    for (let i = 0; i < remM; i++) {
      const isLast = i === remM - 1;
      const labelDate = new Date(schedStart);
      labelDate.setMonth(labelDate.getMonth() + i);
      const monthLabel = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      totalInterest += interestOnly;
      rows.push(`
        <div class="grid grid-cols-4 text-xs border-b border-gray-50 dark:border-gray-700 py-1.5 ${isLast ? 'bg-purple-50 dark:bg-purple-900/20 font-semibold' : ''}">
          <span class="text-gray-500 dark:text-gray-400">${monthLabel}</span>
          <span class="text-center text-purple-600 dark:text-purple-400">${isLast ? `₹${outstanding.toLocaleString('en-IN')}` : '—'}</span>
          <span class="text-center text-red-500">₹${Math.round(interestOnly).toLocaleString('en-IN')}</span>
          <span class="text-right text-gray-500 dark:text-gray-400">${isLast ? '₹0' : `₹${outstanding.toLocaleString('en-IN')}`}</span>
        </div>`);
    }

    rows.push(`<div class="mt-4 p-3 bg-purple-50 dark:bg-gray-700 rounded-xl space-y-1">
      <div class="flex justify-between text-sm"><span class="font-semibold dark:text-white">Monthly Interest:</span><span class="text-purple-600 font-bold">₹${Math.round(interestOnly).toLocaleString('en-IN')}</span></div>
      <div class="flex justify-between text-sm"><span class="font-semibold dark:text-white">Final Bullet Payment:</span><span class="text-purple-600 font-bold">₹${Math.round(outstanding + interestOnly).toLocaleString('en-IN')}</span></div>
      <div class="flex justify-between text-sm"><span class="font-semibold dark:text-white">Total Interest:</span><span class="text-red-600 font-bold">₹${Math.round(totalInterest).toLocaleString('en-IN')}</span></div>
    </div>`);
    tbody.innerHTML = rows.join('');
  }

  // ── Cumulated Amortization Sheet ──────────────────────────────
  document.getElementById('openCumulatedAmortBtn')?.addEventListener('click', () => {
    const debts = store.debts;
    const titleEl = document.getElementById('cumulatedAmortTitle');
    const tableEl = document.getElementById('cumulatedAmortTable');
    if (!tableEl) return;

    if (titleEl) titleEl.innerText = 'All Loans — Combined Schedule';
    tableEl.innerHTML = '';

    if (!debts.length) {
      tableEl.innerHTML = '<p class="text-center text-gray-400 py-8">No loans to show.</p>';
      ui.openSheet(ui.cumulatedAmortSheet);
      return;
    }

    const fmtINR = n => `₹${Math.round(n).toLocaleString('en-IN')}`;
    const monthMap = buildCumulatedSchedule(debts);
    const sorted   = Object.entries(monthMap).sort((a, b) => a[1].date - b[1].date);

    let cumPrincipal = 0, cumInterest = 0;

    const rows = [];
    sorted.forEach(([key, val]) => {
      cumPrincipal += val.principal;
      cumInterest  += val.interest;
      rows.push(`
        <div class="grid grid-cols-4 text-xs border-b border-gray-50 dark:border-gray-700 py-2">
          <span class="text-gray-500 dark:text-gray-400">${key}</span>
          <span class="text-center font-semibold text-forest-900 dark:text-white">${fmtINR(val.principal)}</span>
          <span class="text-center text-red-500">${fmtINR(val.interest)}</span>
          <span class="text-right text-gray-500 dark:text-gray-400">${fmtINR(val.principal + val.interest)}</span>
        </div>`);
    });

    rows.push(`
      <div class="mt-4 p-3 bg-blue-50 dark:bg-gray-700 rounded-xl space-y-1">
        <div class="flex justify-between text-sm font-semibold dark:text-white">
          <span>Total Principal Repaid:</span><span class="text-green-600">${fmtINR(cumPrincipal)}</span>
        </div>
        <div class="flex justify-between text-sm font-semibold dark:text-white">
          <span>Total Interest Paid:</span><span class="text-red-600">${fmtINR(cumInterest)}</span>
        </div>
        <div class="flex justify-between text-sm font-bold dark:text-white border-t dark:border-gray-600 pt-1 mt-1">
          <span>Grand Total Outflow:</span><span class="text-blue-600">${fmtINR(cumPrincipal + cumInterest)}</span>
        </div>
      </div>`);
    tableEl.innerHTML = rows.join('');

    ui.openSheet(ui.cumulatedAmortSheet);
  });

  // ── Part-Payment Simulation (per loan) ───────────────────────
  document.getElementById('simulateExtraBtn')?.addEventListener('click', () => {
    if (!_activeDebt) return;
    const extra  = Number(document.getElementById('extraPaymentInput')?.value) || 0;
    const simDiv = document.getElementById('simResult');
    if (!simDiv) return;
    if (extra <= 0) { simDiv.classList.add('hidden'); return; }

    const loanMode    = _activeDebt.loanMode || 'standard';
    const outstanding = _activeDebt.principal - (_activeDebt.paid || 0);
    const remM        = remainingMonths(_activeDebt);
    const rate        = _currentRate(_activeDebt);
    const emi         = calculateEMI(outstanding, rate, remM);
    const basePayoff  = calcPayoff(outstanding, rate, emi);
    const simPayoff   = calcPayoff(outstanding - extra, rate, emi);

    const monthsSaved   = basePayoff.months - simPayoff.months;
    const interestSaved = basePayoff.totalInterest - simPayoff.totalInterest;
    const foreclose     = _activeDebt.foreclosurePct
      ? ` · Foreclosure penalty: ₹${Math.round(extra * _activeDebt.foreclosurePct / 100).toLocaleString('en-IN')}` : '';

    let modeNote = '';
    if (loanMode === 'moratorium') modeNote = '<p class="text-orange-500">Note: Moratorium loan — savings applied to repayment phase.</p>';
    if (loanMode === 'bullet')     modeNote = '<p class="text-purple-500">Note: Bullet loan — part payment reduces final bullet amount.</p>';

    simDiv.classList.remove('hidden');
    simDiv.innerHTML = `
      <div class="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-800 dark:text-green-300">
        <p class="font-semibold">Paying ₹${extra.toLocaleString('en-IN')} extra today:</p>
        <p>⏱ ${monthsSaved > 0 ? `${monthsSaved} months shorter` : 'No change in tenure'}</p>
        <p>💰 ₹${Math.round(Math.max(0, interestSaved)).toLocaleString('en-IN')} interest saved${foreclose}</p>
        ${modeNote}
      </div>`;
    _renderAmortTable(_activeDebt, extra);
  });

  // ── Store Subscription ────────────────────────────────────────
  _unsubs.push(store.subscribe(state => {
    if (!state.isLoaded || !list) return;
    list.innerHTML = '';
    let localTotal = 0;

    if (state.debts.length === 0) {
      list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No debts registered. Tap + to add your first loan.</p>';
      if (totalDisplay) totalDisplay.innerText = '₹0';
      return;
    }

    const cards = [];
    state.debts.forEach(debt => {
      const outstanding = debt.principal - (debt.paid || 0);
      const liveEMI     = currentEMI(debt);
      const loanMode    = debt.loanMode || 'standard';
      const rateMode    = debt.rateMode || 'fixed';
      localTotal       += outstanding;
      const progress    = Math.min(100, ((debt.paid || 0) / debt.principal) * 100).toFixed(0);
      const effectiveRate = _currentRate(debt);

      const rateLabel = effectiveRate
        ? `<span class="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-[9px] px-1.5 py-0.5 rounded ml-2">${effectiveRate}% APR${rateMode === 'flexible' ? ' 📈' : ''}</span>`
        : '';
      const typeLabel = debt.loanType
        ? `<span class="bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 text-[9px] px-1.5 py-0.5 rounded ml-1">${escHtml(debt.loanType)}</span>` : '';
      const modeLabel = loanMode !== 'standard'
        ? `<span class="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 text-[9px] px-1.5 py-0.5 rounded ml-1">${loanMode === 'moratorium' ? '📚 Moratorium' : '🏅 Bullet'}</span>` : '';

      const customEmiLabel = debt.customEmi
        ? `<span class="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 text-[9px] px-1.5 py-0.5 rounded ml-1">⚡ ₹${Math.round(debt.customEmi).toLocaleString('en-IN')}/mo</span>`
        : '';

      const now = new Date();
      const alreadyLogged = debt.lastEmiLogged &&
        (() => { const d = new Date(debt.lastEmiLogged);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })();
      const logBtnStyle = alreadyLogged
        ? 'text-[10px] font-bold px-2 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600'
        : 'log-emi-btn text-[10px] font-bold px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 transition-colors';

      const emiLabel = loanMode === 'moratorium' && liveEMI === 0
        ? '<p class="text-orange-500">Moratorium active</p>'
        : `<p>EMI: ₹${Math.round(liveEMI).toLocaleString('en-IN')}/mo${loanMode === 'bullet' ? ' (interest only)' : ''}${debt.customEmi ? ' <span class="text-amber-500">(custom)</span>' : ''}</p>`;

      cards.push(`
        <div data-id="${debt.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-red-50 dark:border-gray-700 flex flex-col gap-2 active:scale-[0.98]">
          <div class="flex justify-between items-center">
            <p class="font-semibold text-forest-900 dark:text-white flex items-center flex-wrap">${escHtml(debt.name)} ${rateLabel}${typeLabel}${modeLabel}${customEmiLabel}</p>
            <p class="font-display font-semibold text-xl text-red-600">₹${outstanding.toLocaleString('en-IN')}</p>
          </div>
          <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div class="bg-green-500 h-1.5 rounded-full" style="width: ${progress}%"></div>
          </div>
          <div class="flex justify-between items-center mt-1">
            <div class="text-[10px] text-gray-400">
              ${emiLabel}
              <p>${progress}% of principal repaid</p>
            </div>
            <div class="flex gap-1">
              <button type="button" class="${logBtnStyle}" data-logbtn="${debt.id}">${alreadyLogged ? '✓ Paid' : 'Pay'}</button>
              <button type="button" class="amort-btn text-[10px] uppercase font-bold tracking-wider text-forest-500 hover:text-forest-700 bg-forest-50 dark:bg-gray-700 px-2 py-1 rounded-lg">Schedule</button>
            </div>
          </div>
        </div>`);
    });
    list.innerHTML = cards.join('');
    if (totalDisplay) totalDisplay.innerText = `₹${localTotal.toLocaleString('en-IN')}`;
  }, ['debts']));

  // ── Debt Detail Sheet ─────────────────────────────────────────
  let currentDetailDebtId = null;

  function openDebtDetail(debt) {
    currentDetailDebtId = debt.id;

    const outstanding = Math.max(0, debt.principal - (debt.paid || 0));
    const progress    = debt.principal > 0 ? Math.min(100, Math.round(((debt.paid || 0) / debt.principal) * 100)) : 0;
    const liveEMI     = currentEMI(debt);
    const { months }  = calcPayoff(outstanding, _currentRate(debt), liveEMI);

    // Accent colour by loan type
    const typeColors  = { home: '#ef4444', car: '#f97316', personal: '#8b5cf6', education: '#3b82f6', business: '#10b981' };
    const accentColor = typeColors[debt.loanType] || '#ef4444';
    const accentBar   = document.getElementById('debtAccentBar');
    if (accentBar) accentBar.style.background = accentColor;

    // Type label
    const typeNames   = { home: 'Home Loan', car: 'Car Loan', personal: 'Personal Loan', education: 'Education Loan', business: 'Business Loan' };
    const typeEl      = document.getElementById('debtDetailTypeLabel');
    if (typeEl) typeEl.textContent = typeNames[debt.loanType] || 'Loan';

    // Outstanding
    const outEl = document.getElementById('debtDetailOutstanding');
    if (outEl) outEl.textContent = `₹${outstanding.toLocaleString('en-IN')}`;

    // Progress
    document.getElementById('debtDetailProgress').textContent    = `${progress}%`;
    document.getElementById('debtDetailProgressBar').style.width = `${progress}%`;
    document.getElementById('debtDetailPaid').textContent        = (debt.paid || 0).toLocaleString('en-IN');
    document.getElementById('debtDetailPrincipal').textContent   = (debt.principal || 0).toLocaleString('en-IN');

    // Detail rows
    document.getElementById('debtDetailName').textContent = debt.name || '—';
    document.getElementById('debtDetailRate').textContent = debt.rate ? `${debt.rate}% p.a.` : '—';
    document.getElementById('debtDetailTenure').textContent = debt.tenure ? `${debt.tenure} months` : '—';

    const rawDate = debt.date ? (debt.date.includes('T') ? debt.date : debt.date + 'T00:00:00') : null;
    document.getElementById('debtDetailDate').textContent = rawDate
      ? new Date(rawDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

    const emiEl = document.getElementById('debtDetailEMI');
    if (emiEl) {
      emiEl.textContent = (debt.loanMode === 'moratorium' && liveEMI === 0)
        ? 'Moratorium active'
        : `₹${Math.round(liveEMI).toLocaleString('en-IN')}/mo`;
    }

    const payoffEl = document.getElementById('debtDetailPayoff');
    if (payoffEl) {
      if (!isFinite(months)) payoffEl.textContent = 'Moratorium active';
      else payoffEl.textContent = months > 0 ? `${months} months` : 'Paid off';
    }

    // Foreclosure
    const foreRow = document.getElementById('debtDetailForeRow');
    const foreEl  = document.getElementById('debtDetailFore');
    if (debt.foreclosurePct && foreRow && foreEl) {
      foreEl.textContent = `${debt.foreclosurePct}% penalty`;
      foreRow.classList.remove('hidden');
    } else { foreRow?.classList.add('hidden'); }

    // Mode badges
    document.getElementById('debtDetailMoraBadge')?.classList.toggle('hidden', debt.loanMode !== 'moratorium');
    document.getElementById('debtDetailBulletBadge')?.classList.toggle('hidden', debt.loanMode !== 'bullet');
    document.getElementById('debtDetailFlexBadge')?.classList.toggle('hidden', debt.rateMode !== 'flexible');

    ui.openSheet(ui.debtDetailSheet);
  }

  // Edit pencil inside detail sheet
  document.getElementById('editFromDebtDetailBtn')?.addEventListener('click', () => {
    const debt = store.debts.find(d => d.id === currentDetailDebtId);
    if (!debt) return;
    _prefillDebtForm(debt);
    ui.openSheet(ui.debtForm);
  });

  // ── Payment Sheet ─────────────────────────────────────────────
  let _payType = 'emi'; // 'emi' | 'extra' | 'part'

  const payTypeDescs = {
    emi:   'Logs the scheduled EMI against this loan and updates the repaid balance.',
    extra: 'Pay more than the EMI this month — the extra amount chips away at the principal directly. Optionally save this as your monthly target.',
    part:  'A lump-sum payment straight to the principal — reduces balance and recalculates future EMIs.',
  };
  const payTypeBtnColor = {
    emi:   'bg-red-600 text-white',
    extra: 'bg-orange-500 text-white',
    part:  'bg-violet-600 text-white',
  };
  const payConfirmColor = {
    emi:   'bg-red-600 hover:bg-red-700',
    extra: 'bg-orange-500 hover:bg-orange-600',
    part:  'bg-violet-600 hover:bg-violet-700',
  };

  function openPaySheet(debt) {
    currentDetailDebtId = debt.id;
    const liveEMI     = currentEMI(debt);
    const outstanding = Math.max(0, debt.principal - (debt.paid || 0));

    document.getElementById('debtPayLoanName').textContent = debt.name || 'Loan';
    document.getElementById('debtPayEMIHint').textContent  = `Scheduled EMI: ₹${Math.round(liveEMI).toLocaleString('en-IN')}/mo${debt.customEmi ? ' (custom)' : ''}`;
    document.getElementById('debtPayBalHint').textContent  = `Outstanding: ₹${outstanding.toLocaleString('en-IN')}`;

    // Default date to today
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    document.getElementById('debtPayDate').value = todayStr;

    // Reset to EMI mode
    _setPayType('emi', liveEMI);

    ui.openSheet(ui.debtPaySheet);
  }

  function _setPayType(type, liveEMI) {
    _payType = type;
    const debt = store.debts.find(d => d.id === currentDetailDebtId);
    if (!debt) return;
    const emi         = liveEMI ?? currentEMI(debt);
    const outstanding = Math.max(0, debt.principal - (debt.paid || 0));

    // Style buttons
    document.querySelectorAll('.pay-type-btn').forEach(btn => {
      const isActive = btn.dataset.paytype === type;
      btn.className = `pay-type-btn flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wide transition-colors ${
        isActive ? payTypeBtnColor[type] : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
      }`;
    });

    // Description
    document.getElementById('debtPayTypeDesc').textContent = payTypeDescs[type];

    // Confirm button colour
    const confirmBtn = document.getElementById('debtPayConfirmBtn');
    if (confirmBtn) confirmBtn.className = `w-full py-4 text-white rounded-2xl font-bold text-sm transition-colors ${payConfirmColor[type]}`;

    // Pre-fill amount and hint
    const amtInput = document.getElementById('debtPayAmount');
    const amtHint  = document.getElementById('debtPayAmountHint');
    const customRow = document.getElementById('debtPayCustomEMIRow');

    if (type === 'emi') {
      if (amtInput) amtInput.value = Math.round(emi);
      if (amtHint)  amtHint.textContent = `Scheduled EMI = ₹${Math.round(emi).toLocaleString('en-IN')}`;
      customRow?.classList.add('hidden');
    } else if (type === 'extra') {
      if (amtInput) amtInput.value = debt.customEmi ? Math.round(debt.customEmi) : Math.round(emi);
      if (amtHint)  amtHint.textContent = `Enter your preferred monthly amount (EMI = ₹${Math.round(emi).toLocaleString('en-IN')})`;
      customRow?.classList.remove('hidden');
      _updateCustomAmtLabel();
    } else { // part
      if (amtInput) amtInput.value = '';
      if (amtHint)  amtHint.textContent = `Outstanding: ₹${outstanding.toLocaleString('en-IN')}`;
      customRow?.classList.add('hidden');
    }
  }

  function _updateCustomAmtLabel() {
    const val = document.getElementById('debtPayAmount')?.value;
    const el  = document.getElementById('debtSaveCustomAmt');
    if (el) el.textContent = val ? Number(val).toLocaleString('en-IN') : '0';
  }

  document.getElementById('debtPayAmount')?.addEventListener('input', () => {
    if (_payType === 'extra') _updateCustomAmtLabel();
  });

  document.querySelectorAll('.pay-type-btn').forEach(btn => {
    btn.addEventListener('click', () => _setPayType(btn.dataset.paytype));
  });

  // Confirm payment
  document.getElementById('debtPayConfirmBtn')?.addEventListener('click', async () => {
    const debt = store.debts.find(d => d.id === currentDetailDebtId);
    if (!debt) return;

    const amt  = parseFloat(document.getElementById('debtPayAmount')?.value);
    if (!amt || amt <= 0) {
      const inp = document.getElementById('debtPayAmount');
      if (inp) { inp.classList.add('border-red-400'); inp.placeholder='Enter a valid amount'; setTimeout(()=>inp.classList.remove('border-red-400'), 3000); }
      return;
    }
    const dateVal = document.getElementById('debtPayDate')?.value;
    const now     = dateVal ? new Date(dateVal + 'T00:00:00') : new Date();

    const confirmBtn = document.getElementById('debtPayConfirmBtn');
    if (confirmBtn) { confirmBtn.textContent = 'Saving…'; confirmBtn.disabled = true; }

    try {
      const liveEMI         = currentEMI(debt);
      const outstanding     = Math.max(0, debt.principal - (debt.paid || 0));
      const rate            = _currentRate(debt);
      const r               = rate / 12 / 100;
      const interestPortion = Math.round(outstanding * r);

      let principalReduction = 0;
      let txnTitle           = '';
      let txnTags            = [debt.loanType ? `${debt.loanType} Loan` : 'Loan'];

      if (_payType === 'emi') {
        principalReduction = Math.max(0, Math.round(amt - interestPortion));
        txnTitle = `${debt.name} — EMI`;
        txnTags.push('EMI');
      } else if (_payType === 'extra') {
        // FIX (debt/medium): if user enters ≤ liveEMI in the "Extra" tab, treat it
        // as a plain EMI so the ledger title doesn't show a misleading "₹0 extra".
        if (amt <= liveEMI) {
          principalReduction = Math.max(0, Math.round(amt - interestPortion));
          txnTitle = `${debt.name} — EMI`;
          txnTags.push('EMI');
        } else {
          // Split: first liveEMI covers interest+principal, rest is extra principal
          const extraAboveEMI = Math.round(amt - liveEMI);
          principalReduction  = Math.max(0, Math.round(liveEMI - interestPortion)) + extraAboveEMI;
          txnTitle = `${debt.name} — Payment (₹${Math.round(liveEMI).toLocaleString('en-IN')} EMI + ₹${extraAboveEMI.toLocaleString('en-IN')} extra)`;
          txnTags.push('Extra Payment');
        }

        // Save custom EMI override if checked
        if (document.getElementById('debtSaveCustomEMI')?.checked) {
          await updateDoc(doc(db, 'debts', debt.id), { customEmi: amt });
        }
      } else { // part
        // FIX (debt/high): clamp part payment to the outstanding balance so the
        // ledger entry matches what actually applies to the loan. Without this,
        // e.g. a ₹10L entry on a ₹50k-outstanding loan writes ₹10L to the ledger
        // but only clears ₹50k from the debt — permanently corrupting net worth.
        if (amt > outstanding) {
          if (confirmBtn) { confirmBtn.textContent = 'Confirm Payment'; confirmBtn.disabled = false; }
          const inp = document.getElementById('debtPayAmount');
          if (inp) { inp.classList.add('border-red-400'); inp.placeholder = `Max ₹${outstanding.toLocaleString('en-IN')}`; setTimeout(() => inp.classList.remove('border-red-400'), 3000); }
          return;
        }
        principalReduction = Math.round(amt); // full amount goes to principal
        txnTitle = `${debt.name} — Part Payment`;
        txnTags.push('Part Payment');
      }

      // Clamp ledger write to the actual clamped amount (never > outstanding for part)
      const ledgerAmt = _payType === 'part' ? Math.min(Math.round(amt), outstanding) : Math.round(amt);

      // Log as expense transaction
      await addDoc(collection(db, 'transactions'), {
        title: txnTitle, amount: ledgerAmt, type: 'expense',
        date:  now.toISOString(), timestamp: now.getTime(),
        tags:  txnTags, label: _payType === 'part' ? 'Part Payment' : 'EMI Payment',
      });

      // Update paid balance
      const newPaid = Math.min(debt.principal, (debt.paid || 0) + principalReduction);
      await updateDoc(doc(db, 'debts', debt.id), {
        paid:          newPaid,
        lastEmiLogged: now.toISOString(),
      });

      // Success: close the sheet.  This is intentionally inside try, not finally,
      // so a Firestore error in the catch branch doesn't immediately hide the
      // "⚠ Save failed — retry" message before the user can read it.
      ui.closeAll();
    } catch (err) {
      console.error('Payment failed:', err);
      // Re-enable button with a visible error label.  No finally reset here —
      // the old code had `finally { confirmBtn.textContent = 'Confirm Payment' }`
      // which ran immediately after catch and overwrote the error text in ~0 ms.
      if (confirmBtn) { confirmBtn.textContent = '⚠ Save failed — retry'; confirmBtn.disabled = false; }
    }
  });

  // Log EMI quick action → open pay sheet in EMI mode
  document.getElementById('debtDetailLogEMIBtn')?.addEventListener('click', () => {
    const debt = store.debts.find(d => d.id === currentDetailDebtId);
    if (debt) openPaySheet(debt);
  });

  // Custom Payment quick action
  document.getElementById('debtDetailPayBtn')?.addEventListener('click', () => {
    const debt = store.debts.find(d => d.id === currentDetailDebtId);
    if (!debt) return;
    openPaySheet(debt);
    // Default to 'extra' tab
    setTimeout(() => _setPayType('extra'), 50);
  });

  // Schedule quick action
  document.getElementById('debtDetailScheduleBtn')?.addEventListener('click', () => {
    const debt = store.debts.find(d => d.id === currentDetailDebtId);
    if (debt) showAmortization(debt);
  });

  // Shared prefill helper (used by detail edit + card edit path)
  function _prefillDebtForm(debt) {
    currentEditId = debt.id;
    document.getElementById('debtPrincipal').value = debt.principal;
    document.getElementById('debtPaid').value      = debt.paid || 0;
    document.getElementById('debtName').value      = debt.name  || '';
    document.getElementById('debtRate').value      = debt.rate  || '';
    document.getElementById('debtTenure').value    = debt.tenure || '';
    const typeEl = document.getElementById('debtType');
    if (typeEl) typeEl.value = debt.loanType || '';
    const forecloseEl = document.getElementById('debtForeclose');
    if (forecloseEl) forecloseEl.value = debt.foreclosurePct || '';
    if (document.getElementById('debtDate') && debt.date)
      document.getElementById('debtDate').value = debt.date.split('T')[0];
    const loanModeEl = document.getElementById('debtLoanMode');
    if (loanModeEl) { loanModeEl.value = debt.loanMode || 'standard'; _toggleLoanModeFields(debt.loanMode || 'standard'); }
    const rateModeEl = document.getElementById('debtRateMode');
    if (rateModeEl) { rateModeEl.value = debt.rateMode || 'fixed'; _toggleRateModeFields(debt.rateMode || 'fixed'); }
    const morEl = document.getElementById('debtMoratoriumMonths');
    if (morEl) morEl.value = debt.moratoriumMonths || '';
    const segContainer = document.getElementById('rateSegments');
    if (segContainer) {
      segContainer.innerHTML = '';
      (debt.rateSchedule || []).forEach(seg => {
        const div = document.createElement('div');
        div.className = 'flex gap-2 items-center rate-segment';
        div.innerHTML = `
          <div class="flex-1"><label class="text-[9px] text-gray-400 uppercase">From Month</label>
            <input type="number" class="seg-month w-full p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white text-sm outline-none mt-0.5" value="${seg.fromMonth}">
          </div>
          <div class="flex-1"><label class="text-[9px] text-gray-400 uppercase">Rate % p.a.</label>
            <input type="number" step="0.01" class="seg-rate w-full p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white text-sm outline-none mt-0.5" value="${seg.rate}">
          </div>
          <button type="button" class="remove-seg mt-4 text-red-400 hover:text-red-600 text-lg font-bold">×</button>`;
        div.querySelector('.remove-seg').addEventListener('click', () => div.remove());
        segContainer.appendChild(div);
      });
    }
    document.getElementById('deleteDebtBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveDebtBtn');
    if (saveBtn) saveBtn.innerText = 'Update';
    if (formTitle) formTitle.innerText = 'Edit Loan';
  }

  // ── Click Delegation ──────────────────────────────────────────
  list?.addEventListener('click', async (e) => {
    const card = e.target.closest('.edit-card');
    if (!card) return;
    const debt = store.debts.find(d => d.id === card.dataset.id);
    if (!debt) return;

    if (e.target.closest('.amort-btn')) { showAmortization(debt); return; }

    if (e.target.closest('.log-emi-btn')) {
      openPaySheet(debt);
      return;
    }

    // Tap card → open detail sheet
    openDebtDetail(debt);
  });
}
