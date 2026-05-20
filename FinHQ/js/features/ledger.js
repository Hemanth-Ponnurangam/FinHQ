import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initLedger(ui) {
  const form = document.getElementById('ledgerForm');
  const list = document.getElementById('transactionList');
  let currentEditId = null;
  const dataMap = new Map(); // Cache to hold data for quick editing

  // Listen for the "Add New" button click to clear old edit data
  document.addEventListener('resetTxnForm', () => {
    currentEditId = null;
    form.reset();
    document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteTxnBtn').classList.add('hidden');
    document.getElementById('saveTxnBtn').innerText = 'Save';
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        amount: Number(document.getElementById('txnAmount').value),
        title: document.getElementById('txnTitle').value,
        type: document.getElementById('txnType').value,
        tags: document.getElementById('txnTag').value ? [document.getElementById('txnTag').value.trim()] : [],
        label: document.getElementById('txnLabel').value.trim() || null,
        date: new Date(document.getElementById('txnDate').value).toISOString(),
        timestamp: new Date(document.getElementById('txnDate').value).getTime()
      };

      try {
        if (currentEditId) {
          await updateDoc(doc(db, "transactions", currentEditId), payload);
        } else {
          await addDoc(collection(db, "transactions"), payload);
        }
        ui.closeAll();
      } catch (error) { console.error("Error saving txn:", error); }
    });

    // Delete Logic
    document.getElementById('deleteTxnBtn')?.addEventListener('click', async () => {
      if (currentEditId && confirm("Delete this transaction permanently?")) {
        await deleteDoc(doc(db, "transactions", currentEditId));
        ui.closeAll();
      }
    });
  }

  if (list) {
    onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = '';
      dataMap.clear(); // Clear cache on sync
      if (snapshot.empty) return list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No transactions yet.</p>';

      snapshot.forEach((document) => {
        const txn = document.data();
        const id = document.id;
        dataMap.set(id, txn); // Save to cache
        
        const isExpense = txn.type === 'expense';
        const dateString = new Date(txn.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        const labelBadge = txn.label ? `<span class="bg-gray-100 dark:bg-gray-700 text-[9px] px-1.5 py-0.5 rounded ml-2">${txn.label}</span>` : '';
        
        // Added 'cursor-pointer' and 'data-id' to enable clicking
        list.innerHTML += `
          <div data-id="${id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98] transition-transform">
            <div>
              <p class="font-semibold text-forest-900 dark:text-white flex items-center">${txn.title} ${labelBadge}</p>
              <p class="text-xs text-forest-400 mt-1">${dateString} ${txn.tags[0] ? `• ${txn.tags[0]}` : ''}</p>
            </div>
            <p class="font-display font-semibold text-xl ${isExpense ? 'text-red-500' : 'text-forest-500'}">
              ${isExpense ? '-' : '+'}₹${Math.abs(txn.amount).toLocaleString('en-IN')}
            </p>
          </div>
        `;
      });
      if(window.lucide) lucide.createIcons();
    });

    // Event Delegation: Listen for clicks on the list to open Edit mode
    list.addEventListener('click', (e) => {
      const card = e.target.closest('.edit-card');
      if (!card) return;
      
      const id = card.dataset.id;
      const txn = dataMap.get(id);
      currentEditId = id;

      // Populate Form
      document.getElementById('txnAmount').value = txn.amount;
      document.getElementById('txnTitle').value = txn.title;
      document.getElementById('txnType').value = txn.type;
      document.getElementById('txnDate').value = txn.date.split('T')[0];
      document.getElementById('txnTag').value = txn.tags[0] || '';
      document.getElementById('txnLabel').value = txn.label || '';

      // Update UI for editing
      document.getElementById('deleteTxnBtn').classList.remove('hidden');
      document.getElementById('saveTxnBtn').innerText = 'Update';
      
      ui.openSheet(ui.txnForm);
    });
  }
}
