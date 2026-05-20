import { db, collection, addDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initLedger(ui) {
  const form = document.getElementById('ledgerForm');
  const list = document.getElementById('transactionList');

  // WRITE
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('txnAmount').value;
      const title = document.getElementById('txnTitle').value;
      const type = document.getElementById('txnType').value;
      const tag = document.getElementById('txnTag').value;

      try {
        await addDoc(collection(db, "transactions"), {
          amount: Number(amount), title: title, type: type,
          tags: tag ? [tag.trim()] : [], date: new Date().toISOString(), timestamp: Date.now()
        });
        form.reset(); ui.closeAll();
      } catch (error) { console.error("Error saving txn:", error); }
    });
  }

  // READ
  if (list) {
    onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = '';
      if (snapshot.empty) return list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No transactions yet.</p>';

      snapshot.forEach((doc) => {
        const txn = doc.data();
        const isExpense = txn.type === 'expense';
        const dateString = new Date(txn.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        
        list.innerHTML += `
          <div class="bg-white rounded-2xl p-4 shadow-card border border-forest-50/50 flex justify-between items-center">
            <div>
              <p class="font-semibold text-forest-900">${txn.title}</p>
              <p class="text-xs text-forest-400 mt-1">${dateString}</p>
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