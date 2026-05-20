import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initSip(ui) {
  const form = document.getElementById('sipForm');
  const list = document.getElementById('sipList');
  const totalDisplay = document.getElementById('totalSipDisplay');
  let currentEditId = null;

  document.addEventListener('resetSipForm', () => {
    currentEditId = null; form?.reset();
    document.getElementById('deleteSipBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveSipBtn');
    if (saveBtn) saveBtn.innerText = 'Save Template';
  });

  document.getElementById('addSipBtn')?.addEventListener('click', () => document.getElementById('showSipFormBtn').click());

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('sipName').value,
        amount: Number(document.getElementById('sipAmount').value),
        type: document.getElementById('sipType').value,
        billingDate: Number(document.getElementById('sipDate').value),
        timestamp: Date.now()
      };

      try {
        if (currentEditId) await updateDoc(doc(db, "recurring", currentEditId), payload);
        else await addDoc(collection(db, "recurring"), payload);
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteSipBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Recurring?", "Remove this from your automator?", async () => {
        try { await deleteDoc(doc(db, "recurring", currentEditId)); } 
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  store.subscribe(state => {
    if (!state.isLoaded || !list) return;
    list.innerHTML = ''; let totalOutflow = 0;

    if (state.recurring.length === 0) {
      list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm col-span-full">No automated payments set.</p>';
      if (totalDisplay) totalDisplay.innerText = '₹0';
      return;
    }

    state.recurring.forEach(sip => {
      totalOutflow += sip.amount;
      const isInv = sip.type === 'Investment';

      list.innerHTML += `
        <div data-id="${sip.id}" class="edit-sip cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-purple-50 dark:border-gray-700 active:scale-[0.98] transition-transform">
          <div class="flex justify-between items-center mb-1">
            <span class="font-semibold text-forest-900 dark:text-white">${sip.name}</span>
            <span class="font-bold ${isInv ? 'text-forest-500' : 'text-purple-600 dark:text-purple-400'}">₹${sip.amount.toLocaleString('en-IN')}</span>
          </div>
          <div class="flex justify-between items-center text-[10px] text-gray-400 uppercase font-semibold mt-2">
            <div class="flex flex-col gap-0.5">
               <span>${sip.type} • Every ${sip.billingDate}th</span>
               <span>Annual: ₹${(sip.amount * 12).toLocaleString('en-IN')}</span>
            </div>
            <button type="button" class="log-now-btn px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-200 transition-colors">Log Now</button>
          </div>
        </div>
      `;
    });
    if (totalDisplay) totalDisplay.innerText = `₹${totalOutflow.toLocaleString('en-IN')}`;
  });

  list?.addEventListener('click', async (e) => {
    const card = e.target.closest('.edit-sip');
    if (!card) return;
    const sip = store.recurring.find(s => s.id === card.dataset.id);
    if (!sip) return;
    
    // QA Fix: Actionable "Log Now" Injection
    if (e.target.closest('.log-now-btn')) {
      const btn = e.target.closest('.log-now-btn');
      btn.innerText = "Logging..."; btn.disabled = true;
      try {
        await addDoc(collection(db, 'transactions'), {
          title: sip.name,
          amount: sip.amount,
          type: 'expense', // Both bills and SIPs represent cash leaving liquid accounts
          date: new Date().toISOString(),
          timestamp: Date.now(),
          tags: [sip.type === 'Investment' ? 'Investments' : 'Bills'],
          label: 'Auto-Logged'
        });
        alert(`${sip.name} added to Ledger successfully!`);
      } catch (err) {
        console.error("Failed to log:", err);
      } finally {
        btn.innerText = "Log Now"; btn.disabled = false;
      }
      return;
    }

    currentEditId = sip.id;
    document.getElementById('sipName').value = sip.name;
    document.getElementById('sipAmount').value = sip.amount;
    document.getElementById('sipType').value = sip.type;
    document.getElementById('sipDate').value = sip.billingDate;
    
    document.getElementById('deleteSipBtn').classList.remove('hidden');
    document.getElementById('saveSipBtn').innerText = 'Update Template';
    ui.openSheet(document.getElementById('sipFormSheet'));
  });
}
