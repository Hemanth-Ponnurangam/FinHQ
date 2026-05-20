import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDebt(ui) {
  const form = document.getElementById('debtForm');
  const list = document.getElementById('debtList');
  const totalDisplay = document.getElementById('totalDebtDisplay');
  let currentEditId = null;
  const dataMap = new Map();

  document.addEventListener('resetDebtForm', () => {
    currentEditId = null;
    form.reset();
    document.getElementById('debtDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteDebtBtn').classList.add('hidden');
    document.getElementById('saveDebtBtn').innerText = 'Save Debt';
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        principal: Number(document.getElementById('debtPrincipal').value),
        name: document.getElementById('debtName').value,
        emi: Number(document.getElementById('debtEMI').value) || 0,
        date: new Date(document.getElementById('debtDate').value).toISOString(),
        timestamp: new Date(document.getElementById('debtDate').value).getTime()
      };

      try {
        if (currentEditId) {
          await updateDoc(doc(db, "debts", currentEditId), payload);
        } else {
          await addDoc(collection(db, "debts"), payload);
        }
        ui.closeAll();
      } catch (error) { console.error("Error saving debt:", error); }
    });

    document.getElementById('deleteDebtBtn')?.addEventListener('click', async () => {
      if (currentEditId && confirm("Delete this debt permanently?")) {
        await deleteDoc(doc(db, "debts", currentEditId));
        ui.closeAll();
      }
    });
  }

  if (list) {
    onSnapshot(query(collection(db, "debts"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = '';
      dataMap.clear();
      let localTotal = 0;

      if (snapshot.empty) list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No debts registered.</p>';

      snapshot.forEach((document) => {
        const debt = document.data();
        const id = document.id;
        dataMap.set(id, debt);
        localTotal += debt.principal;
        
        list.innerHTML += `
          <div data-id="${id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-red-50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98] transition-transform">
            <div>
              <p class="font-semibold text-forest-900 dark:text-white">${debt.name}</p>
              ${debt.emi > 0 ? `<p class="text-[10px] text-forest-400 font-semibold bg-forest-50 dark:bg-gray-700 px-2 py-0.5 rounded mt-1 inline-block">₹${debt.emi.toLocaleString('en-IN')}/mo</p>` : ''}
            </div>
            <div class="text-right">
              <p class="font-display font-semibold text-xl text-red-600">₹${debt.principal.toLocaleString('en-IN')}</p>
            </div>
          </div>
        `;
      });
      if(totalDisplay) totalDisplay.innerText = `₹${localTotal.toLocaleString('en-IN')}`;
    });

    list.addEventListener('click', (e) => {
      const card = e.target.closest('.edit-card');
      if (!card) return;
      const id = card.dataset.id;
      const debt = dataMap.get(id);
      currentEditId = id;

      document.getElementById('debtPrincipal').value = debt.principal;
      document.getElementById('debtName').value = debt.name;
      document.getElementById('debtDate').value = debt.date.split('T')[0];
      document.getElementById('debtEMI').value = debt.emi;

      document.getElementById('deleteDebtBtn').classList.remove('hidden');
      document.getElementById('saveDebtBtn').innerText = 'Update';
      
      ui.openSheet(ui.debtForm);
    });
  }
}
