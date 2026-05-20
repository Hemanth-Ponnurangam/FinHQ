import { db, collection, addDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initWealth(ui) {
  const form = document.getElementById('assetForm');
  const list = document.getElementById('assetList');
  const totalDisplay = document.getElementById('totalWealthDisplay');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('assetName').value;
      const category = document.getElementById('assetCategory').value;
      const date = document.getElementById('assetDate').value;
      const qty = Number(document.getElementById('assetQty').value) || 1;
      const buyPrice = Number(document.getElementById('assetBuyPrice').value) || 0;
      const currentPrice = Number(document.getElementById('assetCurrentPrice').value) || buyPrice;

      try {
        await addDoc(collection(db, "assets"), {
          name, category, qty, buyPrice, currentPrice,
          purchaseDate: new Date(date).toISOString(),
          timestamp: new Date(date).getTime()
        });
        form.reset(); 
        document.getElementById('assetDate').value = new Date().toISOString().split('T')[0];
        ui.closeAll();
      } catch (error) { console.error("Error saving asset:", error); }
    });
  }

  if (list) {
    onSnapshot(query(collection(db, "assets"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = '';
      let globalPortfolioValue = 0;

      if (snapshot.empty) list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No assets tracked.</p>';

      snapshot.forEach((doc) => {
        const asset = doc.data();
        const totalInvested = asset.qty * asset.buyPrice;
        const currentValue = asset.qty * asset.currentPrice;
        globalPortfolioValue += currentValue;
        
        const profitLoss = currentValue - totalInvested;
        const plPercent = totalInvested > 0 ? ((profitLoss / totalInvested) * 100).toFixed(1) : 0;
        const isPositive = profitLoss >= 0;

        list.innerHTML += `
          <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center">
            <div>
              <p class="font-semibold text-forest-900 dark:text-white">${asset.name}</p>
              <p class="text-xs text-forest-400 mt-1 uppercase tracking-wider">${asset.category} • Qty: ${asset.qty}</p>
            </div>
            <div class="text-right">
              <p class="font-display font-semibold text-xl dark:text-white">₹${currentValue.toLocaleString('en-IN')}</p>
              <p class="text-[10px] font-semibold mt-0.5 ${isPositive ? 'text-green-500' : 'text-red-500'}">
                ${isPositive ? '+' : ''}${plPercent}% (₹${Math.abs(profitLoss).toLocaleString('en-IN')})
              </p>
            </div>
          </div>
        `;
      });
      
      if(totalDisplay) totalDisplay.innerText = `₹${globalPortfolioValue.toLocaleString('en-IN')}`;
    });
  }
}
