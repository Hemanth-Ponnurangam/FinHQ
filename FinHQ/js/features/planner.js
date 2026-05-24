import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initPlanner(ui) {
  const plannerSheet   = document.getElementById('plannerFormSheet');
  const tabBudget      = document.getElementById('tabBudget');
  const tabGoal        = document.getElementById('tabGoal');
  const formBudget     = document.getElementById('budgetForm');
  const formGoal       = document.getElementById('goalForm');
  const listBudget     = document.getElementById('budgetList');
  const listGoal       = document.getElementById('goalList');
  let currentBudgetEditId = null;
  let currentGoalEditId   = null;

  // ── Tab Switcher (inside the form sheet) ──────────────────────
  function switchTab(isBudget) {
    if (!tabBudget || !tabGoal) return;
    if (isBudget) {
      tabBudget.classList.add('bg-white','dark:bg-gray-600','shadow-sm','text-forest-900','dark:text-white');
      tabBudget.classList.remove('text-gray-500','dark:text-gray-400');
      tabGoal.classList.remove('bg-white','dark:bg-gray-600','shadow-sm','text-forest-900','dark:text-white');
      tabGoal.classList.add('text-gray-500','dark:text-gray-400');
      formBudget?.classList.remove('hidden');
      formGoal?.classList.add('hidden');
    } else {
      tabGoal.classList.add('bg-white','dark:bg-gray-600','shadow-sm','text-forest-900','dark:text-white');
      tabGoal.classList.remove('text-gray-500','dark:text-gray-400');
      tabBudget.classList.remove('bg-white','dark:bg-gray-600','shadow-sm','text-forest-900','dark:text-white');
      tabBudget.classList.add('text-gray-500','dark:text-gray-400');
      formGoal?.classList.remove('hidden');
      formBudget?.classList.add('hidden');
    }
  }

  tabBudget?.addEventListener('click', () => switchTab(true));
  tabGoal?.addEventListener('click',   () => switchTab(false));

  document.getElementById('showPlannerFormBtn')?.addEventListener('click', () => {
    currentBudgetEditId = null;
    currentGoalEditId   = null;
    formBudget?.reset();
    formGoal?.reset();
    document.getElementById('deleteBudgetBtn')?.classList.add('hidden');
    document.getElementById('deleteGoalBtn')?.classList.add('hidden');
    const bBtn = document.getElementById('saveBudgetBtn');
    const gBtn = document.getElementById('saveGoalBtn');
    if (bBtn) bBtn.innerText = 'Save Budget';
    if (gBtn) gBtn.innerText = 'Save Goal';
    switchTab(true);
    ui.openSheet(plannerSheet);
  });

  // ── Budget Form ───────────────────────────────────────────────
  if (formBudget) {
    formBudget.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        category:  document.getElementById('budgetCategory').value,
        limit:     Number(document.getElementById('budgetLimit').value),
        timestamp: Date.now()
      };
      if (!payload.category || payload.limit <= 0) return alert('Category and a positive limit are required.');
      try {
        if (currentBudgetEditId) await updateDoc(doc(db, 'budgets', currentBudgetEditId), payload);
        else                     await addDoc(collection(db, 'budgets'), payload);
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });
    document.getElementById('deleteBudgetBtn')?.addEventListener('click', () => {
      ui.showConfirm('Remove Budget?', 'Stop tracking this spending limit?', async () => {
        try { await deleteDoc(doc(db, 'budgets', currentBudgetEditId)); }
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // ── Goal Form ─────────────────────────────────────────────────
  if (formGoal) {
    formGoal.addEventListener('submit', async (e) => {
      e.preventDefault();
      const target = Number(document.getElementById('goalTarget').value);
      const saved  = Number(document.getElementById('goalSaved').value) || 0;
      if (saved > target) return alert('Amount saved cannot exceed the target.');
      const payload = {
        name:       document.getElementById('goalName').value,
        target, saved,
        targetDate: document.getElementById('goalDate').value || null,
        timestamp:  Date.now()
      };
      try {
        if (currentGoalEditId) await updateDoc(doc(db, 'goals', currentGoalEditId), payload);
        else                   await addDoc(collection(db, 'goals'), payload);
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });
    document.getElementById('deleteGoalBtn')?.addEventListener('click', () => {
      ui.showConfirm('Delete Goal?', 'Remove this savings target?', async () => {
        try { await deleteDoc(doc(db, 'goals', currentGoalEditId)); }
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // ── Store Subscription ────────────────────────────────────────
  store.subscribe(state => {
    if (!state.isLoaded) return;
    renderBudgets(state);
    renderGoals(state);
  });

  // ── Budget Render — with 3-month history ─────────────────────
  function renderBudgets(state) {
    if (!listBudget) return;
    const now = new Date();

    // Build monthly spend maps for current + last 3 months
    const monthMaps = {};
    for (let i = 0; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthMaps[key] = {};
    }

    state.transactions.forEach(txn => {
      if (txn.type !== 'expense' || !txn.date) return;
      const d   = new Date(txn.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!monthMaps[key]) return;
      const tag = txn.tags?.[0]?.toLowerCase() || 'uncategorized';
      monthMaps[key][tag] = (monthMaps[key][tag] || 0) + (txn.amount || 0);
    });

    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    listBudget.innerHTML = '';
    if (state.budgets.length === 0) {
      listBudget.innerHTML = '<p class="text-xs text-gray-400 py-2 text-center">No budgets set. Tap + to add one.</p>';
      return;
    }

    state.budgets.forEach(budget => {
      const catKey   = budget.category.toLowerCase();
      const spent    = monthMaps[currentMonthKey]?.[catKey] || 0;
      const progress = Math.min(100, (spent / budget.limit) * 100).toFixed(0);
      const isOver   = spent > budget.limit;
      const barColor = isOver ? 'bg-red-500' : (progress > 80 ? 'bg-orange-500' : 'bg-teal-500');

      // FIX: Budget history — last 3 months spending per category
      const historyMonths = Object.keys(monthMaps)
        .filter(k => k !== currentMonthKey)
        .sort()
        .reverse()
        .slice(0, 3);

      const historyHtml = historyMonths.map(k => {
        const d = new Date(k + '-01');
        const label = d.toLocaleDateString('en-IN', { month: 'short' });
        const s = monthMaps[k]?.[catKey] || 0;
        const overHist = s > budget.limit;
        return `<span class="inline-flex flex-col items-center">
          <span class="text-[9px] text-gray-400">${label}</span>
          <span class="text-[10px] font-semibold ${overHist ? 'text-red-400' : 'text-gray-500 dark:text-gray-400'}">₹${s.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
        </span>`;
      }).join('');

      listBudget.innerHTML += `
        <div data-id="${budget.id}" class="edit-budget cursor-pointer active:scale-[0.98] transition-transform space-y-1.5">
          <div class="flex justify-between items-center text-sm">
            <span class="font-semibold dark:text-white">${budget.category}</span>
            <span class="${isOver ? 'text-red-500 font-bold' : 'text-gray-500 dark:text-gray-400'}">₹${spent.toLocaleString('en-IN')} / ₹${budget.limit.toLocaleString('en-IN')}</span>
          </div>
          <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div class="${barColor} h-2 rounded-full transition-all" style="width: ${progress}%"></div>
          </div>
          ${isOver ? `<p class="text-[10px] text-red-500">Over by ₹${(spent-budget.limit).toLocaleString('en-IN')}</p>` : ''}
          ${historyHtml ? `<div class="flex gap-4 pt-1 border-t border-gray-50 dark:border-gray-700/50 mt-1">${historyHtml}</div>` : ''}
        </div>`;
    });
  }

  // ── Goals Render ──────────────────────────────────────────────
  function renderGoals(state) {
    if (!listGoal) return;
    listGoal.innerHTML = '';
    const now = new Date();

    if (state.goals.length === 0) {
      listGoal.innerHTML = '<p class="text-xs text-gray-400 py-2 text-center">No goals set. Tap + to add one.</p>';
      return;
    }

    state.goals.forEach(goal => {
      const progress = Math.min(100, ((goal.saved||0) / goal.target) * 100).toFixed(0);
      let dateStr = 'No deadline';
      let reqText = '';

      if (goal.targetDate) {
        const targetDate = new Date(goal.targetDate);
        dateStr = targetDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        const monthsLeft = (targetDate.getFullYear() - now.getFullYear()) * 12
                         + (targetDate.getMonth() - now.getMonth());
        const remaining  = goal.target - (goal.saved || 0);
        if (remaining <= 0)    reqText = 'Goal Reached! 🎉';
        else if (monthsLeft <= 0) reqText = 'Deadline Passed';
        else reqText = `Need ₹${Math.ceil(remaining / monthsLeft).toLocaleString('en-IN')}/mo`;
      }

      listGoal.innerHTML += `
        <div data-id="${goal.id}" class="edit-goal cursor-pointer bg-purple-50 dark:bg-gray-700/50 p-4 rounded-xl active:scale-[0.98] transition-transform">
          <div class="flex justify-between items-center mb-2">
            <span class="font-semibold text-purple-900 dark:text-purple-300">${goal.name}</span>
            <div class="text-right">
              <span class="font-bold text-purple-600 dark:text-purple-400">₹${(goal.saved||0).toLocaleString('en-IN')}</span>
              <span class="text-[10px] text-gray-400 ml-1">/ ₹${goal.target.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div class="w-full bg-purple-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden mb-2">
            <div class="bg-purple-500 h-1.5 rounded-full" style="width: ${progress}%"></div>
          </div>
          <div class="flex justify-between text-[10px] text-purple-500/70 dark:text-purple-300/70 font-semibold">
            <span>${dateStr}</span>
            <span>${reqText}</span>
          </div>
        </div>`;
    });
  }

  // ── Edit Bindings ─────────────────────────────────────────────
  listBudget?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-budget');
    if (!card) return;
    const budget = store.budgets.find(b => b.id === card.dataset.id);
    if (!budget) return;
    currentBudgetEditId = budget.id;
    if (document.getElementById('budgetCategory')) document.getElementById('budgetCategory').value = budget.category;
    if (document.getElementById('budgetLimit'))    document.getElementById('budgetLimit').value    = budget.limit;
    document.getElementById('deleteBudgetBtn')?.classList.remove('hidden');
    const btn = document.getElementById('saveBudgetBtn');
    if (btn) btn.innerText = 'Update Budget';
    switchTab(true);
    ui.openSheet(plannerSheet);
  });

  listGoal?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-goal');
    if (!card) return;
    const goal = store.goals.find(g => g.id === card.dataset.id);
    if (!goal) return;
    currentGoalEditId = goal.id;
    if (document.getElementById('goalName'))   document.getElementById('goalName').value   = goal.name;
    if (document.getElementById('goalTarget')) document.getElementById('goalTarget').value = goal.target;
    if (document.getElementById('goalSaved'))  document.getElementById('goalSaved').value  = goal.saved || 0;
    if (goal.targetDate && document.getElementById('goalDate'))
      document.getElementById('goalDate').value = goal.targetDate;
    document.getElementById('deleteGoalBtn')?.classList.remove('hidden');
    const btn = document.getElementById('saveGoalBtn');
    if (btn) btn.innerText = 'Update Goal';
    switchTab(false);
    ui.openSheet(plannerSheet);
  });
}
