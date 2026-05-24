import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initCommute(ui) {
  const form        = document.getElementById('fuelForm');
  const list        = document.getElementById('fuelList');
  const displayEff  = document.getElementById('avgEfficiencyDisplay');
  const displayCost = document.getElementById('costPerKmDisplay');
  let currentEditId = null;

  document.addEventListener('resetFuelForm', () => {
    currentEditId = null;
    form?.reset();
    const dateEl = document.getElementById('fuelDate');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteFuelBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveFuelBtn');
    if (saveBtn) saveBtn.innerText = 'Save Log';
    // Re-show auto-log checkbox for new entries
    const autoLogBox = document.getElementById('fuelAutoLog');
    if (autoLogBox) autoLogBox.parentElement?.classList.remove('hidden');
  });

  document.getElementById('addFuelBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetFuelForm'));
    ui.openSheet(ui.fuelForm);
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const odo      = Number(document.getElementById('fuelOdo').value);
      const liters   = Number(document.getElementById('fuelLiters').value);
      const cost     = Number(document.getElementById('fuelCost').value);
      const dateStr  = document.getElementById('fuelDate').value;
      const autoLog  = document.getElementById('fuelAutoLog')?.checked;

      if (odo <= 0 || liters <= 0 || cost <= 0) return alert('Odometer, liters and cost must all be greater than 0.');

      // FIX: Odometer sequence validation — warn if odo is not higher than last log.
      // An out-of-sequence reading corrupts distance-delta calculations for all adjacent logs.
      if (!currentEditId) {
        const sortedLogs = [...store.fuel].sort((a, b) => a.odo - b.odo);
        const maxOdo = sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1].odo : 0;
        if (maxOdo > 0 && odo <= maxOdo) {
          const proceed = confirm(
            `⚠️ Odometer Warning\n\nEntered: ${odo.toLocaleString()} km\nLast log: ${maxOdo.toLocaleString()} km\n\nThe new reading is not higher than your last entry. This will corrupt fuel efficiency calculations.\n\nContinue anyway?`
          );
          if (!proceed) return;
        }
      }

      const payload = {
        odo, liters, cost,
        date:      new Date(dateStr).toISOString(),
        timestamp: new Date(dateStr).getTime()
      };

      try {
        const saveBtn = document.getElementById('saveFuelBtn');
        if (saveBtn) saveBtn.innerText = 'Saving…';

        if (currentEditId) {
          await updateDoc(doc(db, 'fuel', currentEditId), payload);
        } else {
          await addDoc(collection(db, 'fuel'), payload);
          if (autoLog) {
            await addDoc(collection(db, 'transactions'), {
              title:     `Fuel — ${liters}L @ ${odo.toLocaleString()} km`,
              amount:    cost,
              type:      'expense',
              date:      payload.date,
              timestamp: payload.timestamp,
              tags:      ['Transport'],
              label:     'Auto-Logged'
            });
          }
        }
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteFuelBtn')?.addEventListener('click', () => {
      ui.showConfirm('Delete Fuel Log?', 'This cannot be undone. Efficiency stats will recalculate.', async () => {
        try { await deleteDoc(doc(db, 'fuel', currentEditId)); }
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // ── Store Subscription ────────────────────────────────────────
  store.subscribe(state => {
    if (!state.isLoaded || !list) return;

    // Sort by odometer ascending for delta calculations
    const sortedLogs = [...state.fuel].sort((a, b) => a.odo - b.odo);
    list.innerHTML   = '';

    if (sortedLogs.length === 0) {
      list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No fuel logs. Add your first fill-up.</p>';
      if (displayEff)  displayEff.innerHTML  = '0.0 <span class="text-sm text-gray-400">km/L</span>';
      if (displayCost) displayCost.innerHTML = '₹0.00 <span class="text-sm text-gray-400">/km</span>';
      return;
    }

    let totalDist = 0, totalLiters = 0, totalCost = 0;

    // Render newest first; math depends on ascending order
    for (let i = sortedLogs.length - 1; i >= 0; i--) {
      const log      = sortedLogs[i];
      let distance   = 0, eff = 0, costPerKm = 0;

      if (i > 0) {
        const prev = sortedLogs[i - 1];
        distance   = log.odo - prev.odo;
        if (distance > 0) {
          eff        = distance / log.liters;
          costPerKm  = log.cost / distance;
          totalDist   += distance;
          totalLiters += log.liters;
          totalCost   += log.cost;
        }
      }

      const dateStr  = log.date ? new Date(log.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
      const statsBadge = distance > 0
        ? `<span class="bg-forest-50 dark:bg-forest-900/30 text-forest-600 dark:text-forest-400 text-[10px] px-2 py-1 rounded-lg">${eff.toFixed(1)} km/L · ₹${costPerKm.toFixed(2)}/km</span>`
        : `<span class="bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] px-2 py-1 rounded-lg">Initial Reading</span>`;

      list.innerHTML += `
        <div data-id="${log.id}" class="edit-fuel cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 active:scale-[0.98]">
          <div class="flex justify-between items-center mb-2">
            <span class="font-semibold text-forest-900 dark:text-white flex items-center gap-2">
              <i data-lucide="gauge" class="w-4 h-4 text-gray-400"></i> ${log.odo.toLocaleString()} km
            </span>
            <span class="font-bold text-red-500">₹${log.cost.toLocaleString('en-IN')}</span>
          </div>
          <div class="flex justify-between items-center mt-1">
            <span class="text-xs text-gray-400">${dateStr} · ${log.liters}L</span>
            ${statsBadge}
          </div>
        </div>`;
    }

    if (window.lucide) lucide.createIcons();

    if (totalDist > 0) {
      const avgEff  = totalDist / totalLiters;
      const avgCost = totalCost  / totalDist;
      if (displayEff)  displayEff.innerHTML  = `${avgEff.toFixed(1)} <span class="text-sm text-gray-400">km/L</span>`;
      if (displayCost) displayCost.innerHTML = `₹${avgCost.toFixed(2)} <span class="text-sm text-gray-400">/km</span>`;
    }
  });

  // ── Edit Population ────────────────────────────────────────────
  list?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-fuel');
    if (!card) return;
    const log = store.fuel.find(f => f.id === card.dataset.id);
    if (!log) return;

    currentEditId = log.id;
    document.getElementById('fuelOdo').value    = log.odo;
    document.getElementById('fuelLiters').value = log.liters;
    document.getElementById('fuelCost').value   = log.cost;
    if (log.date) document.getElementById('fuelDate').value = log.date.split('T')[0];

    // Hide auto-log on edit to prevent duplicate ledger entries
    const autoLogBox = document.getElementById('fuelAutoLog');
    if (autoLogBox) { autoLogBox.checked = false; autoLogBox.parentElement?.classList.add('hidden'); }

    document.getElementById('deleteFuelBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveFuelBtn');
    if (saveBtn) saveBtn.innerText = 'Update Log';
    ui.openSheet(ui.fuelForm);
  });
}
