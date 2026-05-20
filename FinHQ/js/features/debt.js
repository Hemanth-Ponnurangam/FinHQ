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
      const paid = Number(document.getElementById('debtPaid').value) || 0;
      const emi = Number(document.getElementById('debtEMI').value) || 0;

      // UX 13 FIX: Strict Logic Validation for Liabilities
      if (principal <= 0) {
        alert("Total Principal must be greater than 0.");
        return;
      }
      if (paid < 0) {
        alert("Amount Paid cannot be negative.");
        return;
      }
      if (paid > principal) {
        alert("Amount Paid cannot exceed the Total Principal.");
        return;
      }

      const payload = {
        principal: principal,
        paid: paid,
        name: document.getElementById('debtName').value || 'Unnamed Loan',
        emi: emi,
        date: new Date(document.getElementById('debtDate').value || new Date()).toISOString(),
        timestamp: new Date(document.getElementById('debtDate').value || new Date()).getTime()
      };
      
      try {
        const btn = document.getElementById('saveDebtBtn');
        if (btn) btn.innerText = 'Saving...';

        if (currentEditId) await updateDoc(doc(db, "debts", currentEditId), payload);
        else await addDoc(collection(db, "debts"), payload);
      } catch (err) {
        console.error("Error saving debt:", err);
      } finally {
        ui.closeAll();
      }
    });

    document.getElementById('deleteDebtBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Loan?", "This removes the loan. Are you sure?", async () => {
        try {
          await deleteDoc(doc(db, "debts", currentEditId));
        } catch (err) {
          console.error(err);
        } finally {
          ui.closeAll(); // Bug 3 FIX: Modals will now gracefully dismiss after deletion!
        }
      });
    });
  }

  if (list) {
    const q = query(collection(db, "debts"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
      list.innerHTML = ''; dataMap.clear(); let localTotal = 0;

      if (snapshot.empty) {
        list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No debts registered.</p>';
        if (totalDisplay) totalDisplay.innerText = '₹0';
        return;
      }

      snapshot.forEach((docSnap) => {
        const debt = docSnap.data();
        const outstanding = debt.principal - (debt.paid || 0); 
        dataMap.set(docSnap.id, debt);
        localTotal += outstanding;
        
        const progress = Math.min(100, ((debt.paid || 0) / debt.principal) * 100).toFixed(0);

        list.innerHTML += `
          <div data-id="${docSnap.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-red-50 dark:border-gray-700 flex flex-col gap-2 active:scale-[0.98]">
            <div class="flex justify-between items-center">
              <p class="font-semibold text-forest-900 dark:text-white">${debt.name}</p>
              <p class="font-display font-semibold text-xl text-red-600">₹${outstanding.toLocaleString('en-IN')}</p>
            </div>
            <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div class="bg-green-500 h-1.5 rounded-full" style="width: ${progress}%"></div>
            </div>
            <div class="flex justify-between text-[10px] text-gray-400">
              <p>${debt.emi > 0 ? `EMI: ₹${debt.emi.toLocaleString('en-IN')}` : 'No EMI set'}</p>
              <p>${progress}% Paid Off</p>
            </div>
          </div>
        `;
      });
      if(totalDisplay) totalDisplay.innerText = `₹${localTotal.toLocaleString('en-IN')}`;
    }, (err) => console.error("Debt Sync Error:", err));

    list.addEventListener('click', (e) => {
      const card = e.target.closest('.edit-card');
      if (!card) return;
      const id = card.dataset.id;
      const debt = dataMap.get(id);
      if (!debt) return;

      currentEditId = id;

      document.getElementById('debtPrincipal').value = debt.principal;
      document.getElementById('debtPaid').value = debt.paid || 0;
      document.getElementById('debtName').value = debt.name || '';
      document.getElementById('debtEMI').value = debt.emi || '';
      
      // UX 11 FIX: Restore the date properly during editing
      const elDate = document.getElementById('debtDate');
      if (elDate && debt.date) {
        elDate.value = debt.date.split('T')[0];
      }

      document.getElementById('deleteDebtBtn')?.classList.remove('hidden');
      const saveBtn = document.getElementById('saveDebtBtn');
      if(saveBtn) saveBtn.innerText = 'Update';
      
      ui.openSheet(ui.debtForm);
    });
  }
}
