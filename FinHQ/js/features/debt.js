import { db, collection, addDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initDebt(ui) {
  const form = document.getElementById('debtForm');
  const list = document.getElementById('debtList');
  const totalDisplay = document.getElementById('totalDebtDisplay');

  // WRITE
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const principal = document.getElementById('debtPrincipal').value;
      const name = document.getElementById('debtName').value;
      const emi = document.getElementById('debtEMI').value;
      const interestRate = document.getElementById('debtInterest').value;

      try {
        await addDoc(collection(db, "debts"), {
          principal: Number(principal), name: name, 
          emi: Number(emi) || 0, interestRate: Number(interestRate) || 0, 
          timestamp: Date.now()
        });
        form.reset(); ui.closeAll();
      } catch (error) { console.error("Error saving debt:", error); }
    });
  }

  // READ
  if (list) {
    onSnapshot(query(collection(db, "debts"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = '';
      let localTotal = 0;

      if (snapshot.empty) list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No debts registered yet. Nice!</p>';

      snapshot.forEach((doc) => {
        const debt = doc.data();
        localTotal += debt.principal;
        
        list.innerHTML += `
          <div class="bg-white rounded-2xl p-4 shadow-card border border-red-50 flex justify-between items-center">
            <div>
              <p class="font-semibold text-forest-900">${debt.name}</p>
              <div class="flex gap-2 mt-1">
                ${debt.interestRate > 0 ? `<p class="text-[10px] text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded">${debt.interestRate}% APR</p>` : ''}
                ${debt.emi > 0 ? `<p class="text-[10px] text-forest-400 font-semibold bg-forest-50 px-2 py-0.5 rounded">₹${debt.emi.toLocaleString('en-IN')}/mo</p>` : ''}
              </div>
            </div>
            <div class="text-right">
              <p class="font-display font-semibold text-xl text-red-600">₹${debt.principal.toLocaleString('en-IN')}</p>
            </div>
          </div>
        `;
      });
      
      if(totalDisplay) totalDisplay.innerText = `₹${localTotal.toLocaleString('en-IN')}`;
    });
  }
}
