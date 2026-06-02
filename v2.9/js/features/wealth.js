import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initWealth(ui) {
  const form = document.getElementById('assetForm');
  const list = document.getElementById('assetList');
  const totalDisplay = document.getElementById('totalWealthDisplay');
  let currentEditId = null;

  // Dynamically inject a sort dropdown without needing to touch index.html
  if (list && !document.getElementById('wealthSortSelect')) {
    const sortHtml = `<div class="flex justify-end mb-3 col-span-full"><select id="wealthSortSelect" class="bg-forest-50 dark:bg-gray-800 text-forest-900 dark:text-white text-xs font-semibold p-2 rounded-lg outline-none shadow-sm"><option value="valueDesc">Highest Value</option><option value="plDesc">Highest P&L %</option><option value="nameAsc">Name (A-Z)</option></select></div>`;
    list.insertAdjacentHTML('beforebegin', sortHtml);
  }

  document.addEventListener('resetAssetForm', () => {
    currentEditId = null; form?.reset();
    if(document.getElementById('assetDate')) document.getElementById('assetDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteAssetBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveAssetBtn');
    if (saveBtn) saveBtn.innerText = 'Save Asset';
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qty = Number(document.getElementById('assetQty')?.value || 0);
      const buyPrice = Number(document.getElementById('assetBuyPrice')?.value || 0);
      const currentPrice = Number(document.getElementById('assetCurrentPrice')?.value || 0);

      if (qty <= 0) return alert("Quantity must be > 0.");
      if (buyPrice < 0 || currentPrice < 0) return alert("Prices cannot be negative.");

      const rawDate = document.getElementById('assetDate')?.value;
      const safeDate = rawDate ? new Date(rawDate) : new Date();

      const payload = {
        name: document.getElementById('assetName')?.value || 'Unnamed',
        category: document.getElementById('assetCategory')?.value || 'Equity',
        qty, buyPrice, currentPrice,
        purchaseDate: safeDate.toISOString(),
        timestamp: safeDate.getTime()
      };

      try {
        const btn = document.getElementById('saveAssetBtn');
        if (btn) btn.innerText = 'Saving...';
        if (currentEditId) await updateDoc(doc(db, "assets", currentEditId), payload);
        else await addDoc(collection(db, "assets"), payload);
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteAssetBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Investment?", "This removes the asset permanently.", async () => {
        try { await deleteDoc(doc(db, "assets", currentEditId)); } 
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // Subscribe to Global Store
  store.subscribe(state => {
    if (!state.isLoaded || !list) return;
    renderList(state.assets);
  });

  function renderList(assets) {
    list.innerHTML = '';
    let globalPortfolioValue = 0;

    if (assets.length === 0) {
      list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm col-span-full">No assets tracked.</p>';
      if (totalDisplay) totalDisplay.innerText = '₹0';
      return;
    }

    // Process math safely for all assets
    const processed = assets.map(asset => {
      const qty = asset.qty || 1;
      const currentPrice = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);
      const buyPrice = asset.buyPrice !== undefined ? asset.buyPrice : currentPrice;
      const currentValue = qty * currentPrice;
      const totalInvested = qty * buyPrice;
      const profitLoss = currentValue - totalInvested;
      // QA Fix: Gracefully handle 0 buyPrice division
      const plPercent = totalInvested > 0 ? ((profitLoss / totalInvested) * 100) : (profitLoss > 0 ? 100 : 0);
      return { ...asset, qty, currentPrice, buyPrice, currentValue, totalInvested, profitLoss, plPercent };
    });

    // Sorting Logic
    const sortMode = document.getElementById('wealthSortSelect')?.value || 'valueDesc';
    if (sortMode === 'valueDesc') processed.sort((a,b) => b.currentValue - a.currentValue);
    else if (sortMode === 'plDesc') processed.sort((a,b) => b.plPercent - a.plPercent);
    else if (sortMode === 'nameAsc') processed.sort((a,b) => (a.name||'').localeCompare(b.name||''));

    processed.forEach(p => {
      globalPortfolioValue += p.currentValue;
      const isPos = p.profitLoss >= 0;
      const dateStr = p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString('en-IN', {month:'short', year:'numeric'}) : 'Unknown';

      list.innerHTML += `
        <div data-id="${p.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98]">
          <div>
            <p class="font-semibold text-forest-900 dark:text-white line-clamp-1">${p.name}</p>
            <p class="text-[10px] text-forest-400 mt-1 uppercase tracking-wider">${p.category} • Qty: ${p.qty}</p>
            <p class="text-[10px] text-gray-400 mt-0.5">Since: ${dateStr}</p>
          </div>
          <div class="text-right">
            <p class="font-display font-semibold text-xl dark:text-white">₹${p.currentValue.toLocaleString('en-IN')}</p>
            <p class="text-[10px] font-semibold mt-0.5 ${isPos ? 'text-green-500' : 'text-red-500'}">
              ${isPos ? '+' : ''}${p.plPercent.toFixed(1)}% (₹${Math.abs(p.profitLoss).toLocaleString('en-IN')})
            </p>
          </div>
        </div>
      `;
    });
    if(totalDisplay) totalDisplay.innerText = `₹${globalPortfolioValue.toLocaleString('en-IN')}`;
  }

  document.getElementById('wealthSortSelect')?.addEventListener('change', () => renderList(store.assets));

  list?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-card');
    if (!card) return;
    const asset = store.assets.find(a => a.id === card.dataset.id);
    if (!asset) return; 
    
    currentEditId = asset.id;
    document.getElementById('assetName').value = asset.name || '';
    document.getElementById('assetCategory').value = asset.category || 'Equity';
    if(asset.purchaseDate) document.getElementById('assetDate').value = asset.purchaseDate.split('T')[0];
    document.getElementById('assetQty').value = asset.qty || 1;
    document.getElementById('assetBuyPrice').value = asset.buyPrice !== undefined ? asset.buyPrice : (asset.currentValue || 0);
    document.getElementById('assetCurrentPrice').value = asset.currentPrice !== undefined ? asset.currentPrice : (asset.currentValue || 0);

    document.getElementById('deleteAssetBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveAssetBtn');
    if(saveBtn) saveBtn.innerText = 'Update';
    ui.openSheet(ui.assetForm);
  });

  // ── Local FAB ─────────────────────────────────────────────────
  document.getElementById('wealthFabBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetAssetForm'));
    ui.openSheet(ui.assetForm);
  });
}
