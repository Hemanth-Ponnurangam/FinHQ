import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initPlanner(ui) {
  const plannerSheet = document.getElementById('plannerFormSheet');
  const tabBudget = document.getElementById('tabBudget');
  const tabGoal = document.getElementById('tabGoal');
  const formBudget = document.getElementById('budgetForm');
  const formGoal = document.getElementById('goalForm');
  const listBudget = document.getElementById('budgetList');
  const listGoal = document.getElementById('goalList');
  
  let currentBudgetEditId = null; let currentGoalEditId = null;

  function switchTab(isBudget) {
    if (isBudget) {
      tabBudget.classList.add('bg-white', 'dark:bg-gray-600', 'shadow-sm', 'text-forest-900', 'dark:text-white');
      tabBudget.classList.remove('text-gray-500', 'dark:text-gray-400');
      tabGoal.classList.remove('bg-white', 'dark:bg-gray-600', 'shadow-sm', 'text-forest-900', 'dark:text-white');
      tabGoal.classList.add('text-gray-500', 'dark:text-gray-400');
      formBudget.classList.remove('hidden'); formGoal.classList.add('hidden');
    } else {
      tabGoal.classList.add('bg-white', 'dark:bg-gray-600', 'shadow-sm', 'text-forest-900', 'dark:text-white');
      tabGoal.classList.remove('text-gray-500', 'dark:text-gray-400');
      tabBudget.classList.remove('bg-white', 'dark:bg-gray-600', 'shadow-sm', 'text-forest-900', 'dark:text-white');
      tabBudget.classList.add('text-gray-500', 'dark:text-gray-400');
      formGoal.classList.remove('hidden'); formBudget.classList.add('hidden');
    }
  }

  tabBudget?.addEventListener('click', () => switchTab(true));
  tabGoal?.addEventListener('click', () => switchTab(false));

  document.getElementById('showPlannerFormBtn')?.addEventListener('click', () => {
    currentBudgetEditId = null; currentGoalEditId = null;
    formBudget?.reset(); formGoal?.reset();
    document.getElementById('deleteBudgetBtn')?.classList.add('hidden');
    document.getElementById('deleteGoalBtn')?.classList.add('hidden');
    switchTab(true);
    ui.openSheet(plannerSheet);
  });
  
  document.getElementById('addPlannerItemBtn')?.addEventListener('click', () => document.getElementById('showPlannerFormBtn').click());

  if (formBudget) {
    formBudget.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        category: document.getElementById('budgetCategory').value,
        limit: Number(document.getElementById('budgetLimit').value),
        timestamp: Date.now()
      };
      try {
        if (currentBudgetEditId) await updateDoc(doc(db, "budgets", currentBudgetEditId), payload);
        else await addDoc(collection(db, "budgets"), payload);
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteBudgetBtn')?.addEventListener('click', () => {
      ui.showConfirm("Remove Budget?", "Stop tracking this limit?", async () => {
        try { await deleteDoc(doc(db, "budgets", currentBudgetEditId)); } 
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  if (formGoal) {
    formGoal.addEventListener('submit', async (e) => {
      e.preventDefault();
      const target = Number(document.getElementById('goalTarget').value);
      const saved = Number(document.getElementById('goalSaved').value) || 0;
      if (saved > target) return alert("Saved amount cannot exceed target.");
      
      const payload = {
        name: document.getElementById('goalName').value,
        target, saved,
        targetDate: document.getElementById('goalDate').value || null,
        timestamp: Date.now()
      };
      try {
        if (currentGoalEditId) await updateDoc(doc(db, "goals", currentGoalEditId), payload);
        else await addDoc(collection(db, "goals"), payload);
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteGoalBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Goal?", "Remove this target?", async () => {
        try { await deleteDoc(doc(db, "goals", currentGoalEditId)); } 
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  store.subscribe(state => {
    if (!state.isLoaded) return;

    // 1. Calculate Live Budgets with Case-Insensitive Matching
    if (listBudget) {
      const liveExpenses = {};
      const now = new Date();
      state.transactions.forEach(txn => {
        if (txn.type === 'expense' && txn.date) {
          const d = new Date(txn.date);
          if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
            const tag = (txn.tags && txn.tags[0]) ? txn.tags[0].toLowerCase() : 'uncategorized';
            liveExpenses[tag] = (liveExpenses[tag] || 0) + txn.amount;
          }
        }
      });

      listBudget.innerHTML = '';
      if (state.budgets.length === 0) {
        listBudget.innerHTML = '<p class="text-xs text-gray-400 py-2 text-center">No budgets set.</p>';
      } else {
        state.budgets.forEach((budget) => {
          const catKey = budget.category.toLowerCase();
          const spent = liveExpenses[catKey] || 0;
          const progress = Math.min(100, (spent / budget.limit) * 100).toFixed(0);
          const isOver = spent > budget.limit;
          const barColor = isOver ? 'bg-red-500' : (progress > 80 ? 'bg-orange-500' : 'bg-teal-500');

          listBudget.innerHTML += `
            <div data-id="${budget.id}" class="edit-budget cursor-pointer active:scale-[0.98] transition-transform">
              <div class="flex justify-between items-center text-sm mb-1">
                <span class="font-semibold dark:text-white">${budget.category}</span>
                <span class="${isOver ? 'text-red-500 font-bold' : 'text-gray-500 dark:text-gray-400'}">₹${spent.toLocaleString('en-IN')} / ₹${budget.limit.toLocaleString('en-IN')}</span>
              </div>
              <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div class="${barColor} h-2 rounded-full transition-all" style="width: ${progress}%"></div>
              </div>
              ${isOver ? `<p class="text-[10px] text-red-500 mt-1">Over limit by ₹${(spent - budget.limit).toLocaleString('en-IN')}</p>` : ''}
            </div>
          `;
        });
      }
    }

    // 2. Render Goals with QA Required Monthly Math
    if (listGoal) {
      listGoal.innerHTML = '';
      if (state.goals.length === 0) {
        listGoal.innerHTML = '<p class="text-xs text-gray-400 py-2 text-center">No goals set.</p>';
      } else {
        const now = new Date();
        state.goals.forEach(goal => {
          const progress = Math.min(100, ((goal.saved || 0) / goal.target) * 100).toFixed(0);
          
          let dateStr = 'No deadline';
          let reqText = '';
          
          if (goal.targetDate) {
            const targetDate = new Date(goal.targetDate);
            dateStr = targetDate.toLocaleDateString('en-IN', {month:'short', year:'numeric'});
            
            const monthsLeft = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
            const remaining = goal.target - (goal.saved || 0);
            
            if (remaining <= 0) reqText = "Goal Reached! 🎉";
            else if (monthsLeft <= 0) reqText = "Deadline Passed";
            else reqText = `Need ₹${Math.ceil(remaining / monthsLeft).toLocaleString('en-IN')}/mo`;
          }

          listGoal.innerHTML += `
            <div data-id="${goal.id}" class="edit-goal cursor-pointer bg-purple-50 dark:bg-gray-700/50 p-3 rounded-xl active:scale-[0.98] transition-transform">
              <div class="flex justify-between items-center mb-2">
                <span class="font-semibold text-purple-900 dark:text-purple-300">${goal.name}</span>
                <span class="font-bold text-purple-600 dark:text-purple-400">₹${(goal.saved || 0).toLocaleString('en-IN')}</span>
              </div>
              <div class="w-full bg-purple-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden mb-1">
                <div class="bg-purple-500 h-1.5 rounded-full" style="width: ${progress}%"></div>
              </div>
              <div class="flex justify-between text-[10px] text-purple-500/70 dark:text-purple-300/70 font-semibold mt-1">
                <span>${dateStr}</span>
                <span>${reqText}</span>
              </div>
            </div>
          `;
        });
      }
    }
  });

  // Edit Bindings
  listBudget?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-budget');
    if (!card) return;
    const budget = store.budgets.find(b => b.id === card.dataset.id);
    if(!budget) return;
    currentBudgetEditId = budget.id;
    document.getElementById('budgetCategory').value = budget.category;
    document.getElementById('budgetLimit').value = budget.limit;
    document.getElementById('deleteBudgetBtn').classList.remove('hidden');
    document.getElementById('saveBudgetBtn').innerText = 'Update';
    switchTab(true);
    ui.openSheet(plannerSheet);
  });

  listGoal?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-goal');
    if (!card) return;
    const goal = store.goals.find(g => g.id === card.dataset.id);
    if(!goal) return;
    currentGoalEditId = goal.id;
    document.getElementById('goalName').value = goal.name;
    document.getElementById('goalTarget').value = goal.target;
    document.getElementById('goalSaved').value = goal.saved || 0;
    if (goal.targetDate) document.getElementById('goalDate').value = goal.targetDate;
    document.getElementById('deleteGoalBtn').classList.remove('hidden');
    document.getElementById('saveGoalBtn').innerText = 'Update';
    switchTab(false);
    ui.openSheet(plannerSheet);
  });
}
