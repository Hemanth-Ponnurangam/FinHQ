import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
// Quality 5 FIX: Removed 'limit' from the import and query so data matches dashboard accurately
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initLedger(ui) {
  const form = document.getElementById('ledgerForm');
  const list = document.getElementById('transactionList');
  const searchInput = document.getElementById('ledgerSearch');
  const monthFilter = document.getElementById('ledgerMonthFilter');
  
  let currentEditId = null;
  let allTransactions = []; 

  document.addEventListener('resetTxnForm', () => {
    currentEditId = null;
    form?.reset();
    const dateInput = document.getElementById('txnDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteTxnBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveTxnBtn');
    if (saveBtn) saveBtn.innerText = 'Save';
  });

  // UX 12 FIX: Extended Month Filter to 12 Months
  if (monthFilter) {
    for(let i = 0; i < 12; i++) {
      const d = new Date(); 
      d.setMonth(d.getMonth() - i);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      monthFilter.innerHTML += `<option value="${val}">${label}</option>`;
    }
  }

  function renderList() {
    if (!list) return;
    list.innerHTML = '';
    const searchTerm = searchInput?.value.toLowerCase() || "";
    const selectedMonth = monthFilter?.value || "all";

    const filtered = allTransactions.filter(txn => {
      const title = txn.title ? txn.title.toLowerCase() : '';
      const tag = (txn.tags && txn.tags[0]) ? txn.tags[0].toLowerCase() : '';
      const matchSearch = title.includes(searchTerm) || tag.includes(searchTerm);
      
      // Quality 7 FIX: Robust Date Object comparison instead of fragile string matching
      let matchMonth = true;
      if (selectedMonth !== 'all' && txn.date) {
        const txnDateObj = new Date(txn.date);
        const txnMonthKey = `${txnDateObj.getFullYear()}-${String(txnDateObj.getMonth() + 1).padStart(2, '0')}`;
        matchMonth = (txnMonthKey === selectedMonth);
      }
      
      return matchSearch && matchMonth;
    });

    if (filtered.length === 0) return list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No results.</p>';

    filtered.forEach((txn) => {
      const isExpense = txn.type === 'expense';
      const dateString = txn.date ? new Date(txn.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Unknown Date';
      const tagLabel = (txn.tags && txn.tags[0]) ? `• ${txn.tags[0]}` : '';
      const customLabel = txn.label ? `<span class="bg-gray-100 dark:bg-gray-700 text-[9px] px-1.5 py-0.5 rounded ml-2">${txn.label}</span>` : '';
      
      list.innerHTML += `
        <div data-id="${txn.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98]">
          <div>
            <p class="font-semibold text-forest-900 dark:text-white flex items-center line-clamp-1">${txn.title || 'Untitled'} ${customLabel}</p>
            <p class="text-xs text-forest-400 mt-1">${dateString} ${tagLabel}</p>
          </div>
          <p class="font-display font-semibold text-xl ${isExpense ? 'text-red-500' : 'text-forest-500'}">
            ${isExpense ? '-' : '+'}₹${Math.abs(txn.amount || 0).toLocaleString('en-IN')}
          </p>
        </div>
      `;
    });
  }

  searchInput?.addEventListener('input', renderList);
  monthFilter?.addEventListener('change', renderList);

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const rawAmount = Number(document.getElementById('txnAmount')?.value || 0);
      
      // UX 13 FIX: Strict Javascript Validation
      if (rawAmount <= 0) {
        alert("Please enter a valid amount greater than 0.");
        return;
      }

      const rawTag = document.getElementById('txnTag')?.value;
      const payload = {
        amount: rawAmount,
        title: document.getElementById('txnTitle')?.value || '',
        type: document.getElementById('txnType')?.value || 'expense',
        tags: rawTag ? [rawTag.trim()] : [],
        label: document.getElementById('txnLabel')?.value.trim() || null,
        date: new Date(document.getElementById('txnDate')?.value || new Date()).toISOString(),
        timestamp: new Date(document.getElementById('txnDate')?.value || new Date()).getTime()
      };

      try {
        const btn = document.getElementById('saveTxnBtn');
        if (btn) btn.innerText = 'Saving...';

        if (currentEditId) await updateDoc(doc(db, "transactions", currentEditId), payload);
        else await addDoc(collection(db, "transactions"), payload);
      } catch (err) {
        console.error("Error saving txn:", err);
      } finally {
        ui.closeAll();
      }
    });

    document.getElementById('deleteTxnBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Transaction?", "This will permanently remove it from your ledger.", async () => {
        try {
          await deleteDoc(doc(db, "transactions", currentEditId));
        } catch (err) {
          console.error(err);
        } finally {
          ui.closeAll(); // Ensure modal always closes
        }
      });
    });
  }

  if (list) {
    const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
      allTransactions = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderList();
    }, (err) => console.error("Ledger Sync Error:", err));

    list.addEventListener('click', (e) => {
      const card = e.target.closest('.edit-card');
      if (!card) return;
      const txn = allTransactions.find(t => t.id === card.dataset.id);
      if (!txn) return;
      
      currentEditId = txn.id;
      
      const elAmount = document.getElementById('txnAmount');
      const elTitle = document.getElementById('txnTitle');
      const elType = document.getElementById('txnType');
      const elDate = document.getElementById('txnDate');
      const elTag = document.getElementById('txnTag');
      const elLabel = document.getElementById('txnLabel');

      if(elAmount) elAmount.value = txn.amount || '';
      if(elTitle) elTitle.value = txn.title || '';
      if(elType) elType.value = txn.type || 'expense';
      if(elDate && txn.date) elDate.value = txn.date.split('T')[0];
      if(elTag) elTag.value = (txn.tags && txn.tags[0]) ? txn.tags[0] : '';
      if(elLabel) elLabel.value = txn.label || '';
      
      document.getElementById('deleteTxnBtn')?.classList.remove('hidden');
      const saveBtn = document.getElementById('saveTxnBtn');
      if(saveBtn) saveBtn.innerText = 'Update';
      
      ui.openSheet(ui.txnForm);
    });
  }
}
