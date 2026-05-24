import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initDebt(ui) {
  const form         = document.getElementById('debtForm');
  const list         = document.getElementById('debtList');
  const totalDisplay = document.getElementById('totalDebtDisplay');
  let currentEditId  = null;
  let _activeDebt    = null; // tracks debt shown in amortization sheet

  // ── Core EMI Calculator ───────────────────────────────────────
  function calculateEMI(principal, annualRate, months) {
    if (!months || months <= 0) return 0;
    if (!annualRate || annualRate === 0) return principal / months;
    const r = (annualRate / 12) / 100;
    return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  }

  // Returns { months, totalInterest } to pay off a balance
  function calcPayoff(balance, rate, emi) {
    if (balance <= 0) return { months: 0, totalInterest: 0 };
    if (!rate || rate === 0) return { months: Math.ceil(balance / emi), totalInterest: 0 };
    let bal = balance;
    const r = (rate / 12) / 100;
    let totalInterest = 0;
    let months = 0;
    while (bal > 0.5 && months < 1200) {
      const interest = bal * r;
      totalInterest += interest;
      bal -= (emi - interest);
      months++;
    }
    return { months, totalInterest };
  }

  // ── Remaining tenure estimate from loan start date ────────────
  function remainingMonths(debt) {
    if (!debt.date) return Math.max(1, debt.tenure);
    const loanStart = new Date(debt.date);
    const now = new Date();
    const elapsed = (now.getFullYear() - loanStart.getFullYear()) * 12
                  + (now.getMonth() - loanStart.getMonth());
    return Math.max(1, debt.tenure - elapsed);
  }

  // ── Live EMI based on outstanding + remaining tenure ─────────
  function currentEMI(debt) {
    const outstanding = debt.principal - (debt.paid || 0);
    const remMonths   = remainingMonths(debt);
    return calculateEMI(outstanding, debt.rate || 0, remMonths);
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
  });

  // ── Form Submit ───────────────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const principal = Number(document.getElementById('debtPrincipal').value);
      const paid      = Number(document.getElementById('debtPaid').value)    || 0;
      const rate      = Number(document.getElementById('debtRate').value)    || 0;
      const tenure    = Number(document.getElementById('debtTenure').value)  || 1;

      if (principal <= 0 || tenure <= 0) return alert('Principal and Tenure must be greater than 0.');
      if (paid < 0 || paid > principal)  return alert('Amount repaid cannot exceed the original principal.');

      const payload = {
        principal, paid, rate, tenure,
        emi:               calculateEMI(principal, rate, tenure),
        name:              document.getElementById('debtName').value || 'Loan',
        date:              new Date(document.getElementById('debtDate').value || new Date()).toISOString(),
        loanType:          document.getElementById('debtType')?.value || '',
        foreclosurePct:    Number(document.getElementById('debtForeclose')?.value) || 0,
        timestamp:         Date.now()
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
    const avalancheDiv    = document.getElementById('avalancheList');
    const snowballDiv     = document.getElementById('snowballList');
    const savingsDiv      = document.getElementById('strategySavings');
    const savingsContent  = document.getElementById('strategySavingsContent');
    const debts           = store.debts;

    // BUG FIX: treat undefined/null rate as 0 so NaN comparisons don't occur
    const avalanche = [...debts].sort((a, b) => (b.rate || 0) - (a.rate || 0));
    const snowball  = [...debts].sort((a, b) =>
      (a.principal - (a.paid || 0)) - (b.principal - (b.paid || 0))
    );

    // ── Render ranked lists ──────────────────────────────────────
    const renderList = (arr, container, labelFn, colorClass) => {
      if (!container) return;
      container.innerHTML = arr.map((d, i) => `
        <div class="flex justify-between text-sm items-center p-2 ${i === 0 ? `bg-${colorClass}-50 dark:bg-${colorClass}-900/30 rounded-lg` : ''}">
          <span class="font-semibold dark:text-white">${i + 1}. ${d.name}${i === 0 ? ' 🎯' : ''}</span>
          <span class="text-red-500 font-bold">${labelFn(d)}</span>
        </div>`).join('');
    };

    renderList(avalanche, avalancheDiv,
      d => d.rate != null && d.rate !== '' ? `${d.rate}% p.a.` : 'No rate',
      'blue');
    renderList(snowball, snowballDiv,
      d => `₹${(d.principal - (d.paid || 0)).toLocaleString('en-IN')}`,
      'green');

    // ── Strategy savings vs. no-strategy ─────────────────────────
    // "No strategy" = pay each loan independently with its original EMI
    // "Avalanche"   = throw extra at highest-rate loan (no extra modelled — just compare total interest)
    let noStrategyInterest = 0;
    debts.forEach(d => {
      const outstanding = d.principal - (d.paid || 0);
      const remM        = remainingMonths(d);
      const emi         = calculateEMI(outstanding, d.rate || 0, remM);
      const { totalInterest } = calcPayoff(outstanding, d.rate || 0, emi);
      noStrategyInterest += totalInterest;
    });

    // Avalanche: same total interest (independent schedules), but months to first payoff shrinks
    // The key saving is in months to clear all debts — model sequentially
    let avalancheInterest = noStrategyInterest; // without extra cash, interest is same
    let snowballInterest  = noStrategyInterest;

    // Show months to pay off each debt (useful even without extra payments)
    const avalancheRows = avalanche.map(d => {
      const outstanding = d.principal - (d.paid || 0);
      const remM        = remainingMonths(d);
      const emi         = calculateEMI(outstanding, d.rate || 0, remM);
      const { months, totalInterest } = calcPayoff(outstanding, d.rate || 0, emi);
      return { name: d.name, months, totalInterest };
    });

    const totalMonths = Math.max(...avalancheRows.map(r => r.months), 0);

    if (savingsDiv && savingsContent && debts.length > 0) {
      savingsDiv.classList.remove('hidden');
      savingsContent.innerHTML = `
        <div class="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-xs">
          <p class="font-semibold dark:text-white mb-1">Payoff timeline per loan (Avalanche order):</p>
          ${avalancheRows.map(r => `
            <div class="flex justify-between py-0.5 text-gray-600 dark:text-gray-300">
              <span>${r.name}</span>
              <span>${r.months} mo · ₹${Math.round(r.totalInterest).toLocaleString('en-IN')} interest</span>
            </div>`).join('')}
          <div class="border-t dark:border-gray-600 mt-1 pt-1 flex justify-between font-semibold dark:text-white">
            <span>Total interest (all loans)</span>
            <span class="text-red-500">₹${Math.round(noStrategyInterest).toLocaleString('en-IN')}</span>
          </div>
        </div>`;
    } else if (savingsDiv) {
      savingsDiv.classList.add('hidden');
    }

    ui.openSheet(ui.strategySheet);
  });

  // ── Amortization Schedule ─────────────────────────────────────
  function showAmortization(debt) {
    _activeDebt = debt;
    const titleEl = document.getElementById('amortTitle');
    const tbody   = document.getElementById('amortTable');
    const simResult = document.getElementById('simResult');
    const extraInput = document.getElementById('extraPaymentInput');
    if (!titleEl || !tbody) return;

    if (simResult)   { simResult.classList.add('hidden'); simResult.innerHTML = ''; }
    if (extraInput)  extraInput.value = '';

    titleEl.innerText = `${debt.name} — Remaining Schedule`;
    _renderAmortTable(debt, 0);
    ui.openSheet(ui.amortizationSheet);
  }

  function _renderAmortTable(debt, extraLumpSum) {
    const tbody = document.getElementById('amortTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    const outstanding = (debt.principal - (debt.paid || 0)) - extraLumpSum;
    if (outstanding <= 0) {
      tbody.innerHTML = '<p class="text-center text-green-600 font-semibold py-6">🎉 Loan fully paid off!</p>';
      return;
    }

    let balance       = outstanding;
    const r           = (debt.rate || 0) / 12 / 100;
    const remM        = remainingMonths(debt);
    const emi         = calculateEMI(outstanding, debt.rate || 0, remM);
    let totalInterest = 0;
    let monthCount    = 0;

    // BUG FIX: align month labels to actual EMI payment dates derived from loan start date
    // Find the next upcoming payment date based on loan's start-date day-of-month
    const loanStart  = new Date(debt.date || new Date());
    const now        = new Date();
    let scheduleStart = new Date(now.getFullYear(), now.getMonth(), loanStart.getDate());
    if (scheduleStart <= now) scheduleStart.setMonth(scheduleStart.getMonth() + 1);

    while (balance > 0.5 && monthCount < remM + 2) {
      const interest    = balance * r;
      totalInterest    += interest;
      let principalPaid = emi - interest;

      if (principalPaid <= 0) principalPaid = balance / Math.max(remM, 1);
      if (principalPaid > balance) principalPaid = balance;
      balance -= principalPaid;

      const labelDate = new Date(scheduleStart);
      labelDate.setMonth(labelDate.getMonth() + monthCount);
      const monthLabel = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

      tbody.innerHTML += `
        <div class="grid grid-cols-3 text-sm border-b border-gray-50 dark:border-gray-700 py-2">
          <span class="text-gray-500 dark:text-gray-400 text-xs">${monthLabel}</span>
          <span class="text-center font-semibold text-forest-900 dark:text-white">₹${Math.round(principalPaid).toLocaleString('en-IN')}</span>
          <span class="text-right text-red-500">₹${Math.round(interest).toLocaleString('en-IN')}</span>
        </div>`;
      monthCount++;
    }

    tbody.innerHTML += `
      <div class="mt-4 p-3 bg-red-50 dark:bg-gray-700 rounded-xl flex justify-between text-sm">
        <span class="font-semibold dark:text-white">Total Future Interest:</span>
        <span class="font-bold text-red-600">₹${Math.round(totalInterest).toLocaleString('en-IN')}</span>
      </div>`;

    return { months: monthCount, totalInterest };
  }

  // ── Part-Payment Simulation ───────────────────────────────────
  document.getElementById('simulateExtraBtn')?.addEventListener('click', () => {
    if (!_activeDebt) return;
    const extra    = Number(document.getElementById('extraPaymentInput')?.value) || 0;
    const simDiv   = document.getElementById('simResult');
    if (!simDiv)   return;

    if (extra <= 0) { simDiv.classList.add('hidden'); return; }

    const outstanding = _activeDebt.principal - (_activeDebt.paid || 0);
    const remM        = remainingMonths(_activeDebt);
    const emi         = calculateEMI(outstanding, _activeDebt.rate || 0, remM);
    const basePayoff  = calcPayoff(outstanding, _activeDebt.rate || 0, emi);
    const simPayoff   = calcPayoff(outstanding - extra, _activeDebt.rate || 0, emi);

    const monthsSaved    = basePayoff.months - simPayoff.months;
    const interestSaved  = basePayoff.totalInterest - simPayoff.totalInterest;
    const foreclose      = _activeDebt.foreclosurePct
      ? ` · Foreclosure penalty: ₹${Math.round(extra * _activeDebt.foreclosurePct / 100).toLocaleString('en-IN')}`
      : '';

    simDiv.classList.remove('hidden');
    simDiv.innerHTML = `
      <div class="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-800 dark:text-green-300">
        <p class="font-semibold">Paying ₹${extra.toLocaleString('en-IN')} extra today:</p>
        <p>⏱ ${monthsSaved > 0 ? `${monthsSaved} months shorter` : 'No change in tenure'}</p>
        <p>💰 ₹${Math.round(Math.max(0, interestSaved)).toLocaleString('en-IN')} interest saved${foreclose}</p>
        <p class="text-[10px] text-gray-500 mt-1">Schedule below updated with part-payment applied.</p>
      </div>`;

    _renderAmortTable(_activeDebt, extra);
  });

  // ── Store Subscription ────────────────────────────────────────
  store.subscribe(state => {
    if (!state.isLoaded || !list) return;
    list.innerHTML = '';
    let localTotal = 0;

    if (state.debts.length === 0) {
      list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No debts registered.</p>';
      if (totalDisplay) totalDisplay.innerText = '₹0';
      return;
    }

    state.debts.forEach(debt => {
      const outstanding = debt.principal - (debt.paid || 0);
      // BUG FIX: use outstanding + remaining tenure for live EMI, not stale stored value
      const liveEMI   = currentEMI(debt);
      // BUG FIX: total outstanding is sum of (principal - paid) — already correct
      localTotal += outstanding;
      const progress  = Math.min(100, ((debt.paid || 0) / debt.principal) * 100).toFixed(0);
      const rateLabel = debt.rate
        ? `<span class="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-[9px] px-1.5 py-0.5 rounded ml-2">${debt.rate}% APR</span>`
        : '';
      const typeLabel = debt.loanType
        ? `<span class="bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 text-[9px] px-1.5 py-0.5 rounded ml-1">${debt.loanType}</span>`
        : '';

      // Check if EMI already logged this month
      const now = new Date();
      const alreadyLogged = debt.lastEmiLogged &&
        (() => { const d = new Date(debt.lastEmiLogged);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })();
      const logBtnStyle = alreadyLogged
        ? 'text-[10px] font-bold px-2 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600'
        : 'log-emi-btn text-[10px] font-bold px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 transition-colors';

      list.innerHTML += `
        <div data-id="${debt.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-red-50 dark:border-gray-700 flex flex-col gap-2 active:scale-[0.98]">
          <div class="flex justify-between items-center">
            <p class="font-semibold text-forest-900 dark:text-white flex items-center flex-wrap">${debt.name} ${rateLabel}${typeLabel}</p>
            <p class="font-display font-semibold text-xl text-red-600">₹${outstanding.toLocaleString('en-IN')}</p>
          </div>
          <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div class="bg-green-500 h-1.5 rounded-full" style="width: ${progress}%"></div>
          </div>
          <div class="flex justify-between items-center mt-1">
            <div class="text-[10px] text-gray-400">
              <p>EMI: ₹${Math.round(liveEMI).toLocaleString('en-IN')}/mo</p>
              <p>${progress}% of principal repaid</p>
            </div>
            <div class="flex gap-1">
              <button type="button" class="${logBtnStyle}" data-logbtn="${debt.id}">${alreadyLogged ? '✓ Logged' : 'Log EMI'}</button>
              <button type="button" class="amort-btn text-[10px] uppercase font-bold tracking-wider text-forest-500 hover:text-forest-700 bg-forest-50 dark:bg-gray-700 px-2 py-1 rounded-lg">Schedule</button>
            </div>
          </div>
        </div>`;
    });
    if (totalDisplay) totalDisplay.innerText = `₹${localTotal.toLocaleString('en-IN')}`;
  });

  // ── Click Delegation (edit + amortization + Log EMI) ─────────
  list?.addEventListener('click', async (e) => {
    const card = e.target.closest('.edit-card');
    if (!card) return;
    const debt = store.debts.find(d => d.id === card.dataset.id);
    if (!debt) return;

    // ── Amortization Schedule ────────────────────────────────────
    if (e.target.closest('.amort-btn')) { showAmortization(debt); return; }

    // ── Log EMI Payment ──────────────────────────────────────────
    if (e.target.closest('.log-emi-btn')) {
      const btn = e.target.closest('.log-emi-btn');
      const now = new Date();

      // Warn if already logged this month
      if (debt.lastEmiLogged) {
        const lastDate = new Date(debt.lastEmiLogged);
        if (lastDate.getMonth() === now.getMonth() && lastDate.getFullYear() === now.getFullYear()) {
          const proceed = confirm(
            `"${debt.name}" EMI was already logged on ${lastDate.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })} this month.\n\nLog again?`
          );
          if (!proceed) return;
        }
      }

      btn.innerText = 'Logging…';
      btn.disabled  = true;

      try {
        // Calculate principal vs interest split for this month
        const outstanding = debt.principal - (debt.paid || 0);
        const r           = (debt.rate || 0) / 12 / 100;
        const interestPortion   = Math.round(outstanding * r);
        const liveEmi           = currentEMI(debt);
        const principalPortion  = Math.max(0, Math.round(liveEmi - interestPortion));

        // Log full EMI as expense transaction
        await addDoc(collection(db, 'transactions'), {
          title:     `${debt.name} — EMI`,
          amount:    Math.round(liveEmi),
          type:      'expense',
          date:      now.toISOString(),
          timestamp: now.getTime(),
          tags:      [debt.loanType ? `${debt.loanType} Loan` : 'Loan'],
          label:     'EMI Payment'
        });

        // Increment paid by principal portion of this month's EMI
        const newPaid = Math.min(debt.principal, (debt.paid || 0) + principalPortion);
        await updateDoc(doc(db, 'debts', debt.id), {
          paid:         newPaid,
          lastEmiLogged: now.toISOString()
        });

        btn.innerText = '✓ Logged';
        btn.className = btn.className.replace('red', 'green').replace('log-emi-btn ', '');
      } catch (err) {
        console.error('Log EMI failed:', err);
        btn.innerText = 'Log EMI';
        btn.disabled  = false;
      }
      return;
    }

    // ── Edit ─────────────────────────────────────────────────────
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

    document.getElementById('deleteDebtBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveDebtBtn');
    if (saveBtn) saveBtn.innerText = 'Update';
    ui.openSheet(ui.debtForm);
  });
}
