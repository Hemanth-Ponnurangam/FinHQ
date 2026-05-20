import { db, collection, addDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initWealth(ui) {
  const form = document.getElementById('assetForm');
  const list = document.getElementById('assetList');
  const totalDisplay = document.getElementById('totalWealthDisplay');

  // WRITE
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = document.getElementById('assetValue').value;
      const name = document.getElementById('assetName').value;
      const category = document.getElementById('assetCategory').value;
      const yieldRate = document.getElementById('assetYield').value;

      try {
        await addDoc(collection(db, "assets"), {
          currentValue: Number(value), name: name, category: category,
          yieldRate: Number(yieldRate) || 0, timestamp: Date.now()
        });
        form.reset(); ui.closeAll();
      } catch (error) { console.error("Error saving asset:", error); }
    });
  }

  // READ
  if (list) {
    onSnapshot(query(collection(db, "assets"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = '';
      let localTotal = 0;

      if (snapshot.empty) list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No assets registered yet.</p>';

      snapshot.forEach((doc) => {
        const asset = doc.data();
        localTotal += asset.currentValue;
        
        list.innerHTML += `
          <div class="bg-white rounded-2xl p-4 shadow-card border border-forest-50/50 flex justify-between items-center">
            <div>
              <p class="font-semibold text-forest-900">${asset.name}</p>
              <p class="text-xs text-forest-400 mt-1 uppercase tracking-wider">${asset.category}</p>
            </div>
            <div class="text-right">
              <p class="font-display font-semibold text-xl text-forest-900">₹${asset.currentValue.toLocaleString('en-IN')}</p>
              ${asset.yieldRate > 0 ? `<p class="text-[10px] text-green-500 font-semibold mt-0.5">+${asset.yieldRate}% Yield</p>` : ''}
            </div>
          </div>
        `;
      });
      
      if(totalDisplay) totalDisplay.innerText = `₹${localTotal.toLocaleString('en-IN')}`;
    });
  }
}