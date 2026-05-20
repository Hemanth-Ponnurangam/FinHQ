import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initLedger(ui) {
  const form = document.getElementById('ledgerForm');
  const list = document.getElementById('transactionList');
  const searchInput = document.getElementById('ledgerSearch');
  const monthFilter = document.getElementById('ledgerMonthFilter');
  
  let currentEditId = null;
  let currentTags = [];
  let isSplitMode = false;
  
  // We subscribe to the store instead of directly to Firebase
  store.subscribe(() => renderList());

  // --- MULTI-TAG UI ---
  const tagInput = document.getElementById('txnTagInput');
  const tagContainer = document.getElementById('tagChipsContainer');

  function renderTags() {
    if (!tagContainer) return;
    tagContainer.innerHTML = currentTags.map((tag, i) => `
      <span class="bg-forest-100 dark:bg-gray-600 text-forest-900 dark:text-white text-[10px] uppercase font-semibold tracking-wider px-2 py-1 rounded-md flex items-center gap-1">
        ${tag} <button type="button" data-index="${i}" class="remove-tag-btn hover:text-red-500 ml-1">&times;</button>
      </span>
    `).join('');
  }

  tagInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.value.trim().replace(/,/g, '');
      if (val && !currentTags.includes(val)) { currentTags.push(val); renderTags(); }
      tagInput.value = '';
    }
  });
  tagContainer?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-tag-btn')) {
      currentTags.splice(e.target.dataset.index, 1); renderTags();
    }
  });

  // --- SPLIT UI ---
  const splitToggle = document.getElementById('splitToggle');
  const splitContainer = document.getElementById('splitContainer');
  const splitRows = document.getElementById('splitRows');
  
  function addSplitRow(amount = '', category = '') {
    const row = document.createElement('div');
    row.className = 'flex gap-2 split-row';
    row.innerHTML = `<input type="number" class="split-amt w-1/3 p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white outline-none text-sm" placeholder="₹ Amt" value="${amount}" required><input type="text" class="split-cat flex-1 p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white outline-none text-sm" placeholder="Category" value="${category}" list="presetCategories" required><button type="button" class="remove-split text-red-400 hover:text-red-600 px-2">&times;</button>`;
    row.querySelector('.remove-split').addEventListener('click', () => row.remove());
    splitRows.appendChild(row);
  }

  splitToggle?.addEventListener('change', (e) => {
    isSplitMode = e.target.checked;
    splitContainer.classList.toggle('hidden', !isSplitMode);
    document.getElementById('standardTxnInputs').classList.toggle('hidden', isSplitMode);
    if (isSplitMode && splitRows.children.length === 0) { addSplitRow(); addSplitRow(); }
  });
  document.getElementById('addSplitBtn')?.addEventListener('click', () => addSplitRow());

  // --- FORM RESET ---
  document.addEventListener('resetTxnForm', () => {
    currentEditId = null; form?.reset(); currentTags = []; renderTags();
    splitRows.innerHTML = ''; splitToggle.checked = false; isSplitMode = false;
    splitToggle.disabled = false; // Re-enable if disabled from edit
    splitContainer.classList.add('hidden');
    document.getElementById('standardTxnInputs').classList.remove('hidden');
    
    if (document.getElementById('txnDate')) document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteTxnBtn')?.classList.add('hidden');
    document.getElementById('duplicateTxnBtn')?.classList.add('hidden');
    document.getElementById('saveTxnBtn').innerText = 'Save';
  });

  // --- RENDERING & FILTERING ---
  // Expanded Date Filter
  if (monthFilter && monthFilter.children.length === 1) {
    for(let i = 0; i < 24; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      monthFilter.innerHTML += `<option value="${val}">${label}</option>`;
    }
  }

  // Debounced search to prevent DOM thrashing
  let searchTimeout;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderList, 150);
  });
  monthFilter?.addEventListener('change', renderList);

  function renderList() {
    if (!list || !store.isLoaded) return;
    list.innerHTML = '';
    const searchTerm = searchInput?.value.toLowerCase() || "";
    const selectedMonth = monthFilter?.value || "all";

    const filtered = store.transactions.filter(txn => {
      const title = txn.title ? txn.title.toLowerCase() : '';
      const tagStr = txn.tags ? txn.tags.join(' ').toLowerCase() : '';
      const matchSearch = title.includes(searchTerm) || tagStr.includes(searchTerm);
      
      let matchMonth = true;
      if (selectedMonth !== 'all' && txn.date) {
        const txnDateObj = new Date(txn.date);
        const txnMonthKey = `${txnDateObj.getFullYear()}-${String(txnDateObj.getMonth() + 1).padStart(2, '0')}`;
        matchMonth = (txnMonthKey === selectedMonth);
      }
      return matchSearch && matchMonth;
    });

    if (filtered.length === 0) return list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No results.</p>';

    // Show filtered total
    let filteredTotal = filtered.reduce((sum, t) => sum + (t.type === 'expense' ? -Math.abs(t.amount) : Math.abs(t.amount)), 0);
    list.innerHTML = `<p class="text-xs text-forest-500 font-semibold mb-2">Filtered Net: ₹${filteredTotal.toLocaleString('en-IN')}</p>`;

    filtered.forEach((txn) => {
      const isExpense = txn.type === 'expense';
      const dateString = txn.date ? new Date(txn.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Unknown';
      const primaryTag = (txn.tags && txn.tags[0]) ? `• ${txn.tags[0]}` : '';
      const customLabel = txn.label ? `<span class="bg-gray-100 dark:bg-gray-700 text-[9px] px-1.5 py-0.5 rounded ml-2">${txn.label}</span>` : '';
      const splitBadge = txn.splitGroupId ? `<span class="bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-[9px] px-1.5 py-0.5 rounded ml-2"><i data-lucide="layers" class="w-3 h-3 inline"></i> Split</span>` : '';
      
      list.innerHTML += `
        <div data-id="${txn.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98]">
          <div>
            <p class="font-semibold text-forest-900 dark:text-white flex items-center line-clamp-1">${txn.title || 'Untitled'} ${customLabel} ${splitBadge}</p>
            <p class="text-xs text-forest-400 mt-1">${dateString} ${primaryTag}</p>
          </div>
          <p class="font-display font-semibold text-xl ${isExpense ? 'text-red-500' : 'text-forest-500'}">
            ${isExpense ? '-' : '+'}₹${Math.abs(txn.amount || 0).toLocaleString('en-IN')}
          </p>
        </div>
      `;
    });
    if(window.lucide) lucide.createIcons();
  }

  // --- FORM SUBMISSION ---
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawAmount = Number(document.getElementById('txnAmount').value);
      if (rawAmount <= 0) return alert("Amount must be > 0.");

      const basePayload = {
        title: document.getElementById('txnTitle').value || '',
        type: document.getElementById('txnType').value || 'expense',
        date: new Date(document.getElementById('txnDate').value).toISOString(),
        timestamp: new Date(document.getElementById('txnDate').value).getTime(),
        isRecurring: document.getElementById('txnIsRecurring')?.checked || false
      };

      try {
        const btn = document.getElementById('saveTxnBtn');
        if (btn) btn.innerText = 'Saving...';

        if (isSplitMode && !currentEditId) {
          // SPLIT SAVE: Add splitGroupId to link them
          const splitGroupId = `split_${Date.now()}`;
          let splitSum = 0;
          const rows = Array.from(splitRows.querySelectorAll('.split-row'));
          const splits = rows.map(r => {
             const amt = Number(r.querySelector('.split-amt').value);
             splitSum += amt;
             return { amount: amt, tag: r.querySelector('.split-cat').value.trim() };
          });

          if (splitSum !== rawAmount) {
             btn.innerText = 'Save'; return alert(`Split total (₹${splitSum}) must equal Total (₹${rawAmount}).`);
          }

          for (let i = 0; i < splits.length; i++) {
             await addDoc(collection(db, "transactions"), {
                ...basePayload, title: `${basePayload.title} (Split ${i+1})`,
                amount: splits[i].amount, tags: [splits[i].tag], label: "Split", splitGroupId
             });
          }
        } else {
          // STANDARD SAVE
          const fallbackTag = document.getElementById('txnTagInput')?.value;
          const finalTags = currentTags.length > 0 ? currentTags : (fallbackTag ? [fallbackTag] : []);
          
          const payload = {
            ...basePayload, amount: rawAmount, tags: finalTags,
            label: document.getElementById('txnLabel')?.value.trim() || null
          };

          if (currentEditId) await updateDoc(doc(db, "transactions", currentEditId), payload);
          else await addDoc(collection(db, "transactions"), payload);
        }
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    // --- SAFE DELETE ---
    document.getElementById('deleteTxnBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Transaction?", "This will permanently remove it.", async () => {
        try { await deleteDoc(doc(db, "transactions", currentEditId)); } 
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // --- EDIT POPULATION ---
  list?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-card');
    if (!card) return;
    const txn = store.transactions.find(t => t.id === card.dataset.id);
    if (!txn) return;
    
    document.dispatchEvent(new Event('resetTxnForm')); 
    currentEditId = txn.id;
    
    document.getElementById('txnAmount').value = txn.amount || '';
    document.getElementById('txnTitle').value = txn.title || '';
    document.getElementById('txnType').value = txn.type || 'expense';
    if(txn.date) document.getElementById('txnDate').value = txn.date.split('T')[0];
    document.getElementById('txnLabel').value = txn.label || '';
    if(document.getElementById('txnIsRecurring')) document.getElementById('txnIsRecurring').checked = txn.isRecurring || false;
    
    currentTags = txn.tags ? [...txn.tags] : [];
    renderTags();

    // Disable split mode when editing an existing transaction to prevent corruption
    splitToggle.disabled = true;
    
    document.getElementById('deleteTxnBtn').classList.remove('hidden');
    document.getElementById('saveTxnBtn').innerText = 'Update';
    ui.openSheet(ui.txnForm);
  });
}
