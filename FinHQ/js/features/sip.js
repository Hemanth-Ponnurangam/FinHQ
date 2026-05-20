import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initSip(ui) {
  const form = document.getElementById('sipForm');
  const list = document.getElementById('sipList');
  const totalDisplay = document.getElementById('totalSipDisplay');
  const summaryText = document.getElementById('sipSummary');
  
  let currentEditId = null;
  const dataMap = new Map();

  document.addEventListener('resetSipForm', () => {
    currentEditId = null;
    form?.reset();
    document.getElementById('deleteSipBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveSipBtn');
    if (saveBtn) saveBtn.innerText = 'Save Template';
  });

  document.getElementById('addSipBtn')?.addEventListener('click', () => {
    document.getElementById('showSipFormBtn').click();
  });

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
      ui.showConfirm("Delete Recurring Payment?", "Remove this from your automator?", async () => {
        try { await deleteDoc(doc(db, "recurring", currentEditId)); } 
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  if (list) {
    const q = query(collection(db, "recurring"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
      list.innerHTML = ''; dataMap.clear();
      let totalOutflow = 0;

      if (snapshot.empty) {
        list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm col-span-full">No automated payments set.</p>';
        if (totalDisplay) totalDisplay.innerText = '₹0';
        if (summaryText) { summaryText.innerText = "Set up recurring"; summaryText.classList.remove('animate-pulse'); }
        return;
      }

      snapshot.forEach(docSnap => {
        const sip = docSnap.data();
        dataMap.set(docSnap.id, sip);
        totalOutflow += sip.amount;
        
        const isInvestment = sip.type === 'Investment';

        list.innerHTML += `
          <div data-id="${docSnap.id}" class="edit-sip cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-purple-50 dark:border-gray-700 active:scale-[0.98] transition-transform">
            <div class="flex justify-between items-center mb-1">
              <span class="font-semibold text-forest-900 dark:text-white">${sip.name}</span>
              <span class="font-bold ${isInvestment ? 'text-forest-500' : 'text-purple-600 dark:text-purple-400'}">₹${sip.amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="flex justify-between text-[10px] text-gray-400 uppercase font-semibold">
              <span>${sip.type}</span>
              <span>Renews on ${sip.billingDate}</span>
            </div>
          </div>
        `;
      });
      
      if (totalDisplay) totalDisplay.innerText = `₹${totalOutflow.toLocaleString('en-IN')}`;
      if (summaryText) {
         summaryText.innerText = `₹${totalOutflow.toLocaleString('en-IN')}/mo`;
         summaryText.classList.remove('animate-pulse');
      }
    });

    list.addEventListener('click', (e) => {
      const card = e.target.closest('.edit-sip');
      if (!card) return;
      const id = card.dataset.id;
      const sip = dataMap.get(id);
      
      currentEditId = id;
      document.getElementById('sipName').value = sip.name;
      document.getElementById('sipAmount').value = sip.amount;
      document.getElementById('sipType').value = sip.type;
      document.getElementById('sipDate').value = sip.billingDate;
      
      document.getElementById('deleteSipBtn').classList.remove('hidden');
      document.getElementById('saveSipBtn').innerText = 'Update Template';
      ui.openSheet(document.getElementById('sipFormSheet'));
    });
  }
}
