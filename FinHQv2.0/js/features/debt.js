import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initDebt(ui) {
  const form         = document.getElementById('debtForm');
  const list         = document.getElementById('debtList');
  const totalDisplay = document.getElementById('totalDebtDisplay');
  let currentEditId  = null;

  function calculateEMI(principal, annualRate, months) {
    if (annualRate === 0) return principal / months;
    const r = (annualRate / 12) / 100;
    return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  }

  document.addEventListener('resetDebtForm', () => {
    currentEditId = null;
    form?.reset();
    const dateInput = document.getElementById('debtDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteDebtBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveDebtBtn');
    if (saveBtn) saveBtn.innerText = 'Save Debt';
  });

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
        emi:  calculateEMI(principal, rate, tenure),
        name: document.getElementById('debtName').value || 'Loan',
        date: new Date(document.getElementById('debtDate').value || new Date()).toISOString(),
        timestamp: Date.now()
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
    const avalancheDiv = document.getElementById('avalancheList');
    const snowballDiv  = document.getElementById('snowballList');
    const debts        = store.debts;

    const avalanche = [...debts].sort((a, b) => b.rate - a.rate);
    if (avalancheDiv) {
      avalancheDiv.innerHTML = avalanche.map((d, i) => `
        <div class="flex justify-between text-sm items-center p-2 ${i===0 ? 'bg-blue-50 dark:bg-blue-900/30 rounded-lg' : ''}">
          <span class="font-semibold dark:text-white">${i+1}. ${d.name}${i===0 ? ' 🎯' : ''}</span>
          <span class="text-red-500 font-bold">${d.rate}% p.a.</span>
        </div>`).join('');
    }

    const snowball = [...debts].sort((a, b) => (a.principal-(a.paid||0)) - (b.principal-(b.paid||0)));
    if (snowballDiv) {
      snowballDiv.innerHTML = snowball.map((d, i) => `
        <div class="flex justify-between text-sm items-center p-2 ${i===0 ? 'bg-green-50 dark:bg-green-900/30 rounded-lg' : ''}">
          <span class="font-semibold dark:text-white">${i+1}. ${d.name}${i===0 ? ' 🎯' : ''}</span>
          <span class="text-red-500 font-bold">₹${(d.principal-(d.paid||0)).toLocaleString('en-IN')}</span>
        </div>`).join('');
    }

    ui.openSheet(ui.strategySheet);
  });

  // ── Amortization Schedule ─────────────────────────────────────
  // FIX: Month labels now show calendar month+year (e.g. "Jun 2025") instead of
  //      opaque M1, M2… — makes it clear which real month each payment falls in.
  function showAmortization(debt) {
    const titleEl = document.getElementById('amortTitle');
    const tbody   = document.getElementById('amortTable');
    if (!titleEl || !tbody) return;

    titleEl.innerText = `${debt.name} — Remaining Schedule`;
    tbody.innerHTML   = '';

    const outstanding = debt.principal - (debt.paid || 0);
    let balance       = outstanding;
    const r           = (debt.rate / 12) / 100;
    const emi         = debt.emi || calculateEMI(debt.principal, debt.rate, debt.tenure);
    let totalInterest = 0;
    const maxMonths   = debt.tenure + 2; // safety bound

    // FIX: Calendar month labels — start from today going forward
    const scheduleStart = new Date();

    for (let month = 1; balance > 0.5 && month <= maxMonths; month++) {
      const interest = balance * r;
      totalInterest += interest;
      let principalPaid = emi - interest;

      if (principalPaid <= 0) principalPaid = balance / Math.max(debt.tenure, 1);
      if (principalPaid > balance) principalPaid = balance;
      balance -= principalPaid;

      // FIX: Show "Jun 2025" style label instead of "M6"
      const labelDate = new Date(scheduleStart);
      labelDate.setMonth(labelDate.getMonth() + month - 1);
      const monthLabel = labelDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

      tbody.innerHTML += `
        <div class="grid grid-cols-3 text-sm border-b border-gray-50 dark:border-gray-700 py-2">
          <span class="text-gray-500 dark:text-gray-400 text-xs">${monthLabel}</span>
          <span class="text-center font-semibold text-forest-900 dark:text-white">₹${Math.round(principalPaid).toLocaleString('en-IN')}</span>
          <span class="text-right text-red-500">₹${Math.round(interest).toLocaleString('en-IN')}</span>
        </div>`;
    }

    tbody.innerHTML += `
      <div class="mt-4 p-3 bg-red-50 dark:bg-gray-700 rounded-xl flex justify-between text-sm">
        <span class="font-semibold dark:text-white">Total Future Interest:</span>
        <span class="font-bold text-red-600">₹${Math.round(totalInterest).toLocaleString('en-IN')}</span>
      </div>`;
    ui.openSheet(ui.amortizationSheet);
  }

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
      localTotal += outstanding;
      const progress  = Math.min(100, ((debt.paid || 0) / debt.principal) * 100).toFixed(0);
      const rateLabel = debt.rate
        ? `<span class="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-[9px] px-1.5 py-0.5 rounded ml-2">${debt.rate}% APR</span>`
        : '';

      list.innerHTML += `
        <div data-id="${debt.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-red-50 dark:border-gray-700 flex flex-col gap-2 active:scale-[0.98]">
          <div class="flex justify-between items-center">
            <p class="font-semibold text-forest-900 dark:text-white flex items-center">${debt.name} ${rateLabel}</p>
            <p class="font-display font-semibold text-xl text-red-600">₹${outstanding.toLocaleString('en-IN')}</p>
          </div>
          <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div class="bg-green-500 h-1.5 rounded-full" style="width: ${progress}%"></div>
          </div>
          <div class="flex justify-between items-center mt-1">
            <div class="text-[10px] text-gray-400">
              <p>EMI: ₹${Math.round(debt.emi||0).toLocaleString('en-IN')}/mo</p>
              <p>${progress}% of principal repaid</p>
            </div>
            <button type="button" class="amort-btn text-[10px] uppercase font-bold tracking-wider text-forest-500 hover:text-forest-700 bg-forest-50 dark:bg-gray-700 px-2 py-1 rounded-lg">Schedule</button>
          </div>
        </div>`;
    });
    if (totalDisplay) totalDisplay.innerText = `₹${localTotal.toLocaleString('en-IN')}`;
  });

  // ── Click Delegation (edit + amortization) ────────────────────
  list?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-card');
    if (!card) return;
    const debt = store.debts.find(d => d.id === card.dataset.id);
    if (!debt) return;

    if (e.target.closest('.amort-btn')) { showAmortization(debt); return; }

    currentEditId = debt.id;
    document.getElementById('debtPrincipal').value = debt.principal;
    document.getElementById('debtPaid').value      = debt.paid || 0;
    document.getElementById('debtName').value      = debt.name  || '';
    document.getElementById('debtRate').value      = debt.rate  || '';
    document.getElementById('debtTenure').value    = debt.tenure || '';
    if (document.getElementById('debtDate') && debt.date)
      document.getElementById('debtDate').value = debt.date.split('T')[0];

    document.getElementById('deleteDebtBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveDebtBtn');
    if (saveBtn) saveBtn.innerText = 'Update';
    ui.openSheet(ui.debtForm);
  });
}
