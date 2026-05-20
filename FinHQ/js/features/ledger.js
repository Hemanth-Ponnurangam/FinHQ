import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initLedger(ui) {
  const form = document.getElementById('ledgerForm');
  const list = document.getElementById('transactionList');
  const searchInput = document.getElementById('ledgerSearch');
  const monthFilter = document.getElementById('ledgerMonthFilter');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  
  let currentEditId = null;
  let allTransactions = []; 
  
  // NEW: Multi-tag State
  let currentTags = [];
  const tagInput = document.getElementById('txnTagInput');
  const tagContainer = document.getElementById('tagChipsContainer');

  // NEW: Split State
  let isSplitMode = false;
  const splitToggle = document.getElementById('splitToggle');
  const splitContainer = document.getElementById('splitContainer');
  const standardInputs = document.getElementById('standardTxnInputs');
  const splitRows = document.getElementById('splitRows');
  const addSplitBtn = document.getElementById('addSplitBtn');

  // --- MULTI-TAG LOGIC ---
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
      if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        renderTags();
      }
      tagInput.value = '';
    }
  });

  tagContainer?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-tag-btn')) {
      const idx = e.target.dataset.index;
      currentTags.splice(idx, 1);
      renderTags();
    }
  });

  // --- SPLIT TRANSACTION LOGIC ---
  function addSplitRow(amount = '', category = '') {
    const row = document.createElement('div');
    row.className = 'flex gap-2 split-row';
    row.innerHTML = `
      <input type="number" class="split-amt w-1/3 p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white outline-none text-sm" placeholder="₹ Amount" value="${amount}" required>
      <input type="text" class="split-cat flex-1 p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white outline-none text-sm" placeholder="Category" value="${category}" list="presetCategories" required>
      <button type="button" class="remove-split text-red-400 hover:text-red-600 px-2">&times;</button>
    `;
    row.querySelector('.remove-split').addEventListener('click', () => row.remove());
    splitRows.appendChild(row);
  }

  splitToggle?.addEventListener('change', (e) => {
    isSplitMode = e.target.checked;
    splitContainer.classList.toggle('hidden', !isSplitMode);
    standardInputs.classList.toggle('hidden', isSplitMode);
    if (isSplitMode && splitRows.children.length === 0) {
      addSplitRow(); addSplitRow(); // Add 2 default rows
    }
  });

  addSplitBtn?.addEventListener('click', () => addSplitRow());

  // --- CSV EXPORT LOGIC ---
  exportCsvBtn?.addEventListener('click', () => {
    if(allTransactions.length === 0) return alert("No data to export.");
    let csv = "Date,Title,Type,Amount,Tags,Label,Recurring\n";
    allTransactions.forEach(t => {
      const dateStr = t.date ? t.date.split('T')[0] : '';
      const tagsStr = t.tags ? t.tags.join('; ') : '';
      const title = `"${(t.title || '').replace(/"/g, '""')}"`;
      csv += `${dateStr},${title},${t.type},${t.amount},"${tagsStr}","${t.label || ''}",${t.isRecurring || false}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `finhq_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });


  // --- FORM RESET & SETUP ---
  document.addEventListener('resetTxnForm', () => {
    currentEditId = null;
    form?.reset();
    currentTags = []; renderTags();
    splitRows.innerHTML = '';
    splitToggle.checked = false;
    isSplitMode = false;
    splitContainer.classList.add('hidden');
    standardInputs.classList.remove('hidden');
    
    if (document.getElementById('txnDate')) document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteTxnBtn')?.classList.add('hidden');
    document.getElementById('duplicateTxnBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveTxnBtn');
    if (saveBtn) saveBtn.innerText = 'Save';
  });

  if (monthFilter) {
    for(let i = 0; i < 12; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      monthFilter.innerHTML += `<option value="${val}">${label}</option>`;
    }
  }

  function renderList() {
    if (!list) return;
    list.innerHTML = '';
    const searchTerm = searchInput?.value.toLowerCase() || "";
    const selectedMonth = monthFilter?.value || "all";

    const filtered = allTransactions.filter(txn => {
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

    filtered.forEach((txn) => {
      const isExpense = txn.type === 'expense';
      const dateString = txn.date ? new Date(txn.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Unknown Date';
      const primaryTag = (txn.tags && txn.tags[0]) ? `• ${txn.tags[0]}` : '';
      const customLabel = txn.label ? `<span class="bg-gray-100 dark:bg-gray-700 text-[9px] px-1.5 py-0.5 rounded ml-2">${txn.label}</span>` : '';
      const recurBadge = txn.isRecurring ? `<i data-lucide="repeat" class="w-3 h-3 inline text-forest-400 ml-1"></i>` : '';
      
      list.innerHTML += `
        <div data-id="${txn.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98]">
          <div>
            <p class="font-semibold text-forest-900 dark:text-white flex items-center line-clamp-1">${txn.title || 'Untitled'} ${recurBadge} ${customLabel}</p>
            <p class="text-xs text-forest-400 mt-1">${dateString} ${primaryTag} ${txn.tags?.length > 1 ? `+${txn.tags.length - 1}` : ''}</p>
          </div>
          <p class="font-display font-semibold text-xl ${isExpense ? 'text-red-500' : 'text-forest-500'}">
            ${isExpense ? '-' : '+'}₹${Math.abs(txn.amount || 0).toLocaleString('en-IN')}
          </p>
        </div>
      `;
    });
    if(window.lucide) lucide.createIcons();
  }

  searchInput?.addEventListener('input', renderList);
  monthFilter?.addEventListener('change', renderList);

  // --- DUPLICATE LOGIC ---
  document.getElementById('duplicateTxnBtn')?.addEventListener('click', () => {
    currentEditId = null; // Detach from existing record
    document.getElementById('txnDate').value = new Date().toISOString().split('T')[0]; // Reset to today
    document.getElementById('deleteTxnBtn').classList.add('hidden');
    document.getElementById('duplicateTxnBtn').classList.add('hidden');
    document.getElementById('saveTxnBtn').innerText = 'Save as New';
  });

  // --- SUBMIT LOGIC ---
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const rawAmount = Number(document.getElementById('txnAmount')?.value || 0);
      if (rawAmount <= 0) return alert("Please enter a valid amount.");

      const basePayload = {
        title: document.getElementById('txnTitle')?.value || '',
        type: document.getElementById('txnType')?.value || 'expense',
        date: new Date(document.getElementById('txnDate')?.value || new Date()).toISOString(),
        timestamp: new Date(document.getElementById('txnDate')?.value || new Date()).getTime(),
        isRecurring: document.getElementById('txnIsRecurring')?.checked || false
      };

      try {
        const btn = document.getElementById('saveTxnBtn');
        if (btn) btn.innerText = 'Saving...';

        if (isSplitMode && !currentEditId) {
          // SPLIT SAVE: Verify totals and generate multiple distinct docs for clean analytics
          let splitSum = 0;
          const rows = Array.from(splitRows.querySelectorAll('.split-row'));
          const splits = rows.map(r => {
             const amt = Number(r.querySelector('.split-amt').value);
             splitSum += amt;
             return { amount: amt, tag: r.querySelector('.split-cat').value.trim() };
          });

          if (splitSum !== rawAmount) {
             btn.innerText = 'Save';
             return alert(`Split total (₹${splitSum}) does not match Total Amount (₹${rawAmount}).`);
          }

          // Save each split as its own transaction referencing the parent title
          for (let i = 0; i < splits.length; i++) {
             await addDoc(collection(db, "transactions"), {
                ...basePayload,
                title: `${basePayload.title} (Split ${i+1})`,
                amount: splits[i].amount,
                tags: [splits[i].tag],
                label: "Split Transaction"
             });
          }
        } else {
          // STANDARD SAVE
          const payload = {
            ...basePayload,
            amount: rawAmount,
            tags: currentTags.length > 0 ? currentTags : (document.getElementById('txnTagInput')?.value ? [document.getElementById('txnTagInput').value] : []),
            label: document.getElementById('txnLabel')?.value.trim() || null
          };

          if (currentEditId) await updateDoc(doc(db, "transactions", currentEditId), payload);
          else await addDoc(collection(db, "transactions"), payload);
        }
      } catch (err) {
        console.error("Error saving txn:", err);
      } finally {
        ui.closeAll();
      }
    });

    document.getElementById('deleteTxnBtn')?.addEventListener('click', () => {
      ui.showConfirm("Delete Transaction?", "This will permanently remove it from your ledger.", async () => {
        try { await deleteDoc(doc(db, "transactions", currentEditId)); } 
        catch (err) { console.error(err); } 
        finally { ui.closeAll(); }
      });
    });
  }

  // --- EDIT POPULATION ---
  if (list) {
    const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
      allTransactions = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderList();
    }, (err) => console.error("Ledger Sync Error:", err));

    list.addEventListener('click', (e) => {
      const card = e.target.closest('.edit-card');
      if (!card) return;
      const txn = allTransactions.find(t => t.id === card.dataset.id);
      if (!txn) return;
      
      // Reset state for edit
      document.dispatchEvent(new Event('resetTxnForm')); 
      currentEditId = txn.id;
      
      const elAmount = document.getElementById('txnAmount');
      const elTitle = document.getElementById('txnTitle');
      const elType = document.getElementById('txnType');
      const elDate = document.getElementById('txnDate');
      const elLabel = document.getElementById('txnLabel');
      const elRecur = document.getElementById('txnIsRecurring');

      if(elAmount) elAmount.value = txn.amount || '';
      if(elTitle) elTitle.value = txn.title || '';
      if(elType) elType.value = txn.type || 'expense';
      if(elDate && txn.date) elDate.value = txn.date.split('T')[0];
      if(elLabel) elLabel.value = txn.label || '';
      if(elRecur) elRecur.checked = txn.isRecurring || false;
      
      currentTags = txn.tags ? [...txn.tags] : [];
      renderTags();

      // Disable splits on Edit to prevent complex data mutation bugs
      splitToggle.disabled = true;
      
      document.getElementById('deleteTxnBtn')?.classList.remove('hidden');
      document.getElementById('duplicateTxnBtn')?.classList.remove('hidden');
      const saveBtn = document.getElementById('saveTxnBtn');
      if(saveBtn) saveBtn.innerText = 'Update';
      
      ui.openSheet(ui.txnForm);
    });
  }
}
