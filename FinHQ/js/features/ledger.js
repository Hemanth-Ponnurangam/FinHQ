import { db, collection, addDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initLedger(ui) {
  const form = document.getElementById('ledgerForm');
  const list = document.getElementById('transactionList');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('txnAmount').value;
      const title = document.getElementById('txnTitle').value;
      const type = document.getElementById('txnType').value;
      const tag = document.getElementById('txnTag').value;
      const label = document.getElementById('txnLabel').value;
      const customDate = document.getElementById('txnDate').value;

      try {
        await addDoc(collection(db, "transactions"), {
          amount: Number(amount), 
          title: title, 
          type: type,
          tags: tag ? [tag.trim()] : [], 
          label: label.trim() || null,
          date: new Date(customDate).toISOString(), // Uses user-selected date
          timestamp: new Date(customDate).getTime()
        });
        form.reset(); 
        document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];
        ui.closeAll();
      } catch (error) { console.error("Error saving txn:", error); }
    });
  }

  if (list) {
    onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = '';
      if (snapshot.empty) return list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No transactions yet.</p>';

      snapshot.forEach((doc) => {
        const txn = doc.data();
        const isExpense = txn.type === 'expense';
        const dateString = new Date(txn.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        const labelBadge = txn.label ? `<span class="bg-gray-100 dark:bg-gray-700 text-[9px] px-1.5 py-0.5 rounded ml-2">${txn.label}</span>` : '';
        
        list.innerHTML += `
          <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center">
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
  }
}
