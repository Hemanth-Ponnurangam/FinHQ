import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { onSnapshot, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initLedger(ui) {
  const form = document.getElementById('ledgerForm');
  const list = document.getElementById('transactionList');
  const searchInput = document.getElementById('ledgerSearch');
  const monthFilter = document.getElementById('ledgerMonthFilter');
  
  let currentEditId = null;
  let allTransactions = []; // Local cache for filtering

  // Populate Month Filter Dropdown
  if (monthFilter) {
    for(let i=0; i<6; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      monthFilter.innerHTML += `<option value="${val}">${label}</option>`;
    }
  }

  function renderList() {
    if (!list) return;
    list.innerHTML = '';
    const searchTerm = searchInput.value.toLowerCase();
    const selectedMonth = monthFilter.value;

    const filtered = allTransactions.filter(txn => {
      const matchSearch = txn.title.toLowerCase().includes(searchTerm) || (txn.tags[0] && txn.tags[0].toLowerCase().includes(searchTerm));
      const matchMonth = selectedMonth === 'all' || txn.date.startsWith(selectedMonth);
      return matchSearch && matchMonth;
    });

    if (filtered.length === 0) return list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No results.</p>';

    filtered.forEach((txn) => {
      const isExpense = txn.type === 'expense';
      const dateString = new Date(txn.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      
      list.innerHTML += `
        <div data-id="${txn.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98]">
          <div>
            <p class="font-semibold text-forest-900 dark:text-white">${txn.title}</p>
            <p class="text-xs text-forest-400 mt-1">${dateString} ${txn.tags[0] ? `• ${txn.tags[0]}` : ''}</p>
          </div>
          <p class="font-display font-semibold text-xl ${isExpense ? 'text-red-500' : 'text-forest-500'}">
            ${isExpense ? '-' : '+'}₹${Math.abs(txn.amount).toLocaleString('en-IN')}
          </p>
        </div>
      `;
    });
  }

  searchInput?.addEventListener('input', renderList);
  monthFilter?.addEventListener('change', renderList);

  if (list) {
    // FIX 6: Pagination / Limit added to query to save reads
    const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(100));
    onSnapshot(q, (snapshot) => {
      allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderList();
    });

    list.addEventListener('click', (e) => {
      const card = e.target.closest('.edit-card');
      if (!card) return;
      const txn = allTransactions.find(t => t.id === card.dataset.id);
      currentEditId = txn.id;

      document.getElementById('txnAmount').value = txn.amount;
      document.getElementById('txnTitle').value = txn.title;
      document.getElementById('txnType').value = txn.type;
      document.getElementById('txnDate').value = txn.date.split('T')[0];
      document.getElementById('txnTag').value = txn.tags[0] || '';
      document.getElementById('deleteTxnBtn').classList.remove('hidden');
      document.getElementById('saveTxnBtn').innerText = 'Update';
      ui.openSheet(ui.txnForm);
    });
  }

  document.getElementById('deleteTxnBtn')?.addEventListener('click', () => {
    ui.showConfirm("Delete Transaction?", "This will permanently remove it from your ledger.", async () => {
      await deleteDoc(doc(db, "transactions", currentEditId));
      ui.closeAll();
    });
  });
}
