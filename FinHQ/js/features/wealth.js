import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { onSnapshot, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initWealth(ui) {
  const form = document.getElementById('assetForm');
  const list = document.getElementById('assetList');
  const totalDisplay = document.getElementById('totalWealthDisplay');
  let currentEditId = null;
  const dataMap = new Map();

  document.addEventListener('resetAssetForm', () => {
    currentEditId = null;
    form?.reset();
    const dateInput = document.getElementById('assetDate');
    if(dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteAssetBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveAssetBtn');
    if(saveBtn) saveBtn.innerText = 'Save Asset';
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('assetName')?.value || 'Unnamed Asset',
        category: document.getElementById('assetCategory')?.value || 'Equity',
        qty: Number(document.getElementById('assetQty')?.value || 1),
        buyPrice: Number(document.getElementById('assetBuyPrice')?.value || 0),
        currentPrice: Number(document.getElementById('assetCurrentPrice')?.value || 0),
        purchaseDate: new Date(document.getElementById('assetDate')?.value || new Date()).toISOString(),
        timestamp: new Date(document.getElementById('assetDate')?.value || new Date()).getTime()
      };

      if (currentEditId) await updateDoc(doc(db, "assets", currentEditId), payload);
      else await addDoc(collection(db, "assets"), payload);
      ui.closeAll();
    });

    document.getElementById('deleteAssetBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Investment?", "This will remove the asset from your portfolio permanently.", async () => {
        await deleteDoc(doc(db, "assets", currentEditId));
        ui.closeAll();
      });
    });
  }

  if (list) {
    const q = query(collection(db, "assets"), orderBy("timestamp", "desc"), limit(100));
    
    onSnapshot(q, (snapshot) => {
      list.innerHTML = '';
      dataMap.clear();
      let globalPortfolioValue = 0;

      if (snapshot.empty) {
        list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No assets tracked.</p>';
        if(totalDisplay) totalDisplay.innerText = '₹0';
        return;
      }

      snapshot.forEach((docSnap) => {
        const asset = docSnap.data();
        const id = docSnap.id;
        dataMap.set(id, asset);
        
        // SAFE FALLBACKS FOR OLDER DATA
        const qty = asset.qty || 1;
        const currentPrice = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);
        const buyPrice = asset.buyPrice !== undefined ? asset.buyPrice : currentPrice;

        const currentValue = qty * currentPrice;
        globalPortfolioValue += currentValue;
        
        const totalInvested = qty * buyPrice;
        const profitLoss = currentValue - totalInvested;
        const plPercent = totalInvested > 0 ? ((profitLoss / totalInvested) * 100).toFixed(1) : 0;
        const isPositive = profitLoss >= 0;

        list.innerHTML += `
          <div data-id="${id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98] transition-transform">
            <div>
              <p class="font-semibold text-forest-900 dark:text-white">${asset.name || 'Unnamed'}</p>
              <p class="text-xs text-forest-400 mt-1 uppercase tracking-wider">${asset.category || 'Asset'} • Qty: ${qty}</p>
            </div>
            <div class="text-right">
              <p class="font-display font-semibold text-xl dark:text-white">₹${currentValue.toLocaleString('en-IN')}</p>
              <p class="text-[10px] font-semibold mt-0.5 ${isPositive ? 'text-green-500' : 'text-red-500'}">
                ${isPositive ? '+' : ''}${plPercent}%
              </p>
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
      if (!asset) return; 
      
      currentEditId = id;

      // SAFE FORM POPULATION FOR OLDER DATA
      const elName = document.getElementById('assetName');
      const elCat = document.getElementById('assetCategory');
      const elDate = document.getElementById('assetDate');
      const elQty = document.getElementById('assetQty');
      const elBuy = document.getElementById('assetBuyPrice');
      const elCur = document.getElementById('assetCurrentPrice');

      if(elName) elName.value = asset.name || '';
      if(elCat) elCat.value = asset.category || 'Fixed';
      
      // If the old asset lacks a date, default to today instead of crashing
      if(elDate) {
        elDate.value = asset.purchaseDate ? asset.purchaseDate.split('T')[0] : new Date().toISOString().split('T')[0];
      }

      if(elQty) elQty.value = asset.qty || 1;

      // Map the old 'currentValue' to the new fields if needed
      const oldVal = asset.currentValue || 0;
      if(elBuy) elBuy.value = asset.buyPrice !== undefined ? asset.buyPrice : oldVal;
      if(elCur) elCur.value = asset.currentPrice !== undefined ? asset.currentPrice : oldVal;

      document.getElementById('deleteAssetBtn')?.classList.remove('hidden');
      const saveBtn = document.getElementById('saveAssetBtn');
      if(saveBtn) saveBtn.innerText = 'Update';
      
      ui.openSheet(ui.assetForm);
    });
  }
}
