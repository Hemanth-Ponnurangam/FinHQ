import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDebt(ui) {
  const form = document.getElementById('debtForm');
  const list = document.getElementById('debtList');
  const totalDisplay = document.getElementById('totalDebtDisplay');
  let currentEditId = null;
  const dataMap = new Map();

  document.addEventListener('resetDebtForm', () => {
    currentEditId = null; form.reset();
    document.getElementById('deleteDebtBtn').classList.add('hidden');
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        principal: Number(document.getElementById('debtPrincipal').value),
        paid: Number(document.getElementById('debtPaid').value) || 0,
        name: document.getElementById('debtName').value,
        emi: Number(document.getElementById('debtEMI').value) || 0,
        date: new Date(document.getElementById('debtDate').value).toISOString(),
        timestamp: new Date(document.getElementById('debtDate').value).getTime()
      };
      
      if (currentEditId) await updateDoc(doc(db, "debts", currentEditId), payload);
      else await addDoc(collection(db, "debts"), payload);
      ui.closeAll();
    });

    document.getElementById('deleteDebtBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Loan?", "Are you sure?", async () => {
        await deleteDoc(doc(db, "debts", currentEditId));
      });
    });
  }

  if (list) {
    onSnapshot(query(collection(db, "debts"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = ''; dataMap.clear(); let localTotal = 0;

      snapshot.forEach((document) => {
        const debt = document.data();
        const outstanding = debt.principal - (debt.paid || 0); // FIX 4: Accurate Math
        dataMap.set(document.id, debt);
        localTotal += outstanding;
        
        const progress = Math.min(100, ((debt.paid || 0) / debt.principal) * 100).toFixed(0);

        list.innerHTML += `
          <div data-id="${document.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-red-50 dark:border-gray-700 flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <p class="font-semibold text-forest-900 dark:text-white">${debt.name}</p>
              <p class="font-display font-semibold text-xl text-red-600">₹${outstanding.toLocaleString('en-IN')}</p>
            </div>
            <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5"><div class="bg-green-500 h-1.5 rounded-full" style="width: ${progress}%"></div></div>
            <p class="text-[10px] text-gray-400 text-right">${progress}% Paid Off</p>
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
      document.getElementById('debtPaid').value = debt.paid || 0;
      document.getElementById('debtName').value = debt.name;
      document.getElementById('debtEMI').value = debt.emi;
      document.getElementById('deleteDebtBtn').classList.remove('hidden');
      ui.openSheet(ui.debtForm);
    });
  }
}
