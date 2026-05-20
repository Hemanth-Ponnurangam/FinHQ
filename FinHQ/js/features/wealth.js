import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initWealth(ui) {
  const form = document.getElementById('assetForm');
  const list = document.getElementById('assetList');
  const totalDisplay = document.getElementById('totalWealthDisplay');
  let currentEditId = null;
  const dataMap = new Map();

  document.addEventListener('resetAssetForm', () => {
    currentEditId = null;
    form.reset();
    document.getElementById('assetDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteAssetBtn').classList.add('hidden');
    document.getElementById('saveAssetBtn').innerText = 'Save Asset';
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('assetName').value,
        category: document.getElementById('assetCategory').value,
        qty: Number(document.getElementById('assetQty').value) || 1,
        buyPrice: Number(document.getElementById('assetBuyPrice').value) || 0,
        currentPrice: Number(document.getElementById('assetCurrentPrice').value) || 0,
        purchaseDate: new Date(document.getElementById('assetDate').value).toISOString(),
        timestamp: new Date(document.getElementById('assetDate').value).getTime()
      };

      try {
        if (currentEditId) {
          await updateDoc(doc(db, "assets", currentEditId), payload);
        } else {
          await addDoc(collection(db, "assets"), payload);
        }
        ui.closeAll();
      } catch (error) { console.error("Error saving asset:", error); }
    });

    document.getElementById('deleteAssetBtn')?.addEventListener('click', async () => {
      if (currentEditId && confirm("Delete this asset permanently?")) {
        await deleteDoc(doc(db, "assets", currentEditId));
        ui.closeAll();
      }
    });
  }

  if (list) {
    onSnapshot(query(collection(db, "assets"), orderBy("timestamp", "desc")), (snapshot) => {
      list.innerHTML = '';
      dataMap.clear();
      let globalPortfolioValue = 0;

      if (snapshot.empty) list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No assets tracked.</p>';

      snapshot.forEach((document) => {
        const asset = document.data();
        const id = document.id;
        dataMap.set(id, asset);
        
        const currentValue = asset.qty * asset.currentPrice;
        globalPortfolioValue += currentValue;
        
        const profitLoss = currentValue - (asset.qty * asset.buyPrice);
        const plPercent = (asset.qty * asset.buyPrice) > 0 ? ((profitLoss / (asset.qty * asset.buyPrice)) * 100).toFixed(1) : 0;
        const isPositive = profitLoss >= 0;

        list.innerHTML += `
          <div data-id="${id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98] transition-transform">
            <div>
              <p class="font-semibold text-forest-900 dark:text-white">${asset.name}</p>
              <p class="text-xs text-forest-400 mt-1 uppercase tracking-wider">${asset.category} • Qty: ${asset.qty}</p>
            </div>
            <div class="text-right">
              <p class="font-display font-semibold text-xl dark:text-white">₹${currentValue.toLocaleString('en-IN')}</p>
              <p class="text-[10px] font-semibold mt-0.5 ${isPositive ? 'text-green-500' : 'text-red-500'}">${isPositive ? '+' : ''}${plPercent}%</p>
            </div>
          </div>
        `;
      });
      if(totalDisplay) totalDisplay.innerText = `₹${globalPortfolioValue.toLocaleString('en-IN')}`;
    });

    list.addEventListener('click', (e) => {
      const card = e.target.closest('.edit-card');
      if (!card) return;
      const id = card.dataset.id;
      const asset = dataMap.get(id);
      currentEditId = id;

      document.getElementById('assetName').value = asset.name;
      document.getElementById('assetCategory').value = asset.category;
      document.getElementById('assetDate').value = asset.purchaseDate.split('T')[0];
      document.getElementById('assetQty').value = asset.qty;
      document.getElementById('assetBuyPrice').value = asset.buyPrice;
      document.getElementById('assetCurrentPrice').value = asset.currentPrice;

      document.getElementById('deleteAssetBtn').classList.remove('hidden');
      document.getElementById('saveAssetBtn').innerText = 'Update';
      
      ui.openSheet(ui.assetForm);
    });
  }
}
