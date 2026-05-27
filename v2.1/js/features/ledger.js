import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

// ── Image Compression (BUG 5) ──────────────────────────────────────────────
// Firestore document limit is 1 MB. A 500 KB image base64-encodes to ~667 KB,
// which combined with split metadata and tags can silently break addDoc.
// This compresses to JPEG and scales down until safely under 300 KB base64.
function compressImage(dataURL) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_DIM = 800;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      // Target: ≤300 KB base64 (~225 KB raw) — well within 1 MB Firestore doc limit
      const TARGET_BYTES = 300 * 1024;
      let quality = 0.82;
      let result  = canvas.toDataURL('image/jpeg', quality);
      while (result.length > TARGET_BYTES && quality > 0.25) {
        quality -= 0.08;
        result   = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.src = dataURL;
  });
}

export function initLedger(ui) {
  const form        = document.getElementById('ledgerForm');
  const list        = document.getElementById('transactionList');
  const searchInput = document.getElementById('ledgerSearch');
  const monthFilter = document.getElementById('ledgerMonthFilter');

  let currentEditId  = null;
  let currentTags    = [];
  let isSplitMode    = false;
  let currentReceipt = null; // base64 string

  // Sort state
  let sortKey = 'date';
  let sortDir = -1; // -1 = desc, 1 = asc

  // Bulk state
  let bulkMode     = false;
  let selectedIds  = new Set();

  store.subscribe(() => renderList());

  // GAP 3: populate datalist with unique tags from existing transactions so users
  // don't have to remember their own tag names.
  store.subscribe(state => {
    if (!state.isLoaded) return;
    const datalist = document.getElementById('presetCategories');
    if (!datalist) return;
    const existingUserTags = new Set(
      state.transactions.flatMap(t => t.tags || []).map(t => t.trim()).filter(Boolean)
    );
    // Preserve built-in static options; add user tags that aren't already present
    const builtInValues = new Set(
      Array.from(datalist.options).map(o => o.value.toLowerCase())
    );
    existingUserTags.forEach(tag => {
      if (!builtInValues.has(tag.toLowerCase())) {
        const opt = document.createElement('option');
        opt.value = tag;
        datalist.appendChild(opt);
        builtInValues.add(tag.toLowerCase()); // prevent duplicates on re-run
      }
    });
  });

  // ── Multi-Tag UI ───────────────────────────────────────────────
  const tagInput     = document.getElementById('txnTagInput');
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
      // BUG FIX: strip only leading/trailing commas from the typed value, not all commas mid-string
      const val = tagInput.value.trim().replace(/^,+|,+$/g, '');
      if (val && !currentTags.includes(val)) { currentTags.push(val); renderTags(); }
      tagInput.value = '';
    }
  });

  tagContainer?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-tag-btn')) {
      currentTags.splice(Number(e.target.dataset.index), 1);
      renderTags();
    }
  });

  // ── Receipt Photo ──────────────────────────────────────────────
  const receiptInput   = document.getElementById('txnReceiptInput');
  const receiptPreview = document.getElementById('receiptPreview');
  const receiptName    = document.getElementById('receiptFileName');

  receiptInput?.addEventListener('change', () => {
    const file = receiptInput.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert('Receipt image must be under 500 KB. Please compress or crop it first.');
      receiptInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      currentReceipt = await compressImage(ev.target.result); // BUG 5: compress before storing
      if (receiptPreview) { receiptPreview.src = currentReceipt; receiptPreview.classList.remove('hidden'); }
      if (receiptName)    receiptName.textContent = file.name;
    };
    reader.readAsDataURL(file);
  });

  // ── Split UI ───────────────────────────────────────────────────
  const splitToggle    = document.getElementById('splitToggle');
  const splitContainer = document.getElementById('splitContainer');
  const splitRows      = document.getElementById('splitRows');

  function addSplitRow(amount = '', category = '') {
    const row = document.createElement('div');
    row.className = 'flex gap-2 split-row';
    row.innerHTML = `<input type="number" class="split-amt w-1/3 p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white outline-none text-sm" placeholder="₹ Amt" value="${amount}">
      <input type="text" class="split-cat flex-1 p-2 rounded-lg bg-forest-50 dark:bg-gray-700 dark:text-white outline-none text-sm" placeholder="Category" value="${category}" list="presetCategories">
      <button type="button" class="remove-split text-red-400 hover:text-red-600 px-2">&times;</button>`;
    row.querySelector('.remove-split').addEventListener('click', () => row.remove());
    splitRows?.appendChild(row);
  }

  splitToggle?.addEventListener('change', (e) => {
    isSplitMode = e.target.checked;
    splitContainer?.classList.toggle('hidden', !isSplitMode);
    document.getElementById('standardTxnInputs')?.classList.toggle('hidden', isSplitMode);
    if (isSplitMode && splitRows && splitRows.children.length === 0) {
      addSplitRow(); addSplitRow();
    }
  });
  document.getElementById('addSplitBtn')?.addEventListener('click', () => addSplitRow());

  // ── Recipient / Payer label swaps with type ────────────────────
  function updatePartyLabel(type) {
    const lbl = document.getElementById('txnPartyLabel');
    const inp = document.getElementById('txnParty');
    if (!lbl || !inp) return;
    if (type === 'income') {
      lbl.textContent    = 'Payer / Source';
      inp.placeholder    = 'e.g. Employer, Client';
    } else {
      lbl.textContent    = 'Recipient';
      inp.placeholder    = 'e.g. Amazon, Swiggy';
    }
  }
  document.getElementById('txnType')?.addEventListener('change', e => updatePartyLabel(e.target.value));

  // ── Sort Controls ──────────────────────────────────────────────
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (key === sortKey) {
        sortDir *= -1;
      } else {
        sortKey = key;
        sortDir = key === 'date' ? -1 : 1;
      }
      document.querySelectorAll('.sort-btn').forEach(b => {
        const isActive = b.dataset.sort === sortKey;
        b.className = isActive
          ? 'sort-btn active-sort text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-forest-900 text-white rounded-full whitespace-nowrap'
          : 'sort-btn text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-forest-50 dark:bg-gray-700 text-forest-700 dark:text-gray-300 rounded-full whitespace-nowrap';
        if (isActive) {
          b.textContent = key === 'date'
            ? (sortDir === -1 ? 'Date ↓' : 'Date ↑')
            : key === 'amount'
              ? (sortDir === -1 ? 'Amount ↓' : 'Amount ↑')
              : 'Category';
        }
      });
      renderList();
    });
  });

  // ── Bulk Mode ──────────────────────────────────────────────────
  document.getElementById('bulkToggleBtn')?.addEventListener('click', () => {
    bulkMode = !bulkMode;
    selectedIds.clear();
    const btn = document.getElementById('bulkToggleBtn');
    if (btn) btn.textContent = bulkMode ? 'Done' : 'Select';
    document.getElementById('bulkActionBar')?.classList.toggle('hidden', !bulkMode);
    document.getElementById('bulkRetagPanel')?.classList.add('hidden'); // always hide on toggle
    renderList();
  });

  document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    ui.showConfirm(
      `Delete ${selectedIds.size} transaction${selectedIds.size > 1 ? 's' : ''}?`,
      'This cannot be undone.',
      async () => {
        for (const id of selectedIds) {
          try { await deleteDoc(doc(db, 'transactions', id)); } catch (err) { console.error(err); }
        }
        selectedIds.clear();
        bulkMode = false;
        document.getElementById('bulkToggleBtn').textContent = 'Select';
        document.getElementById('bulkActionBar')?.classList.add('hidden');
        renderList();
      }
    );
  });

  document.getElementById('bulkRetagBtn')?.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    // BUG 4: Replace prompt() (blocked on mobile) with the app's sheet UI pattern
    const panel = document.getElementById('bulkRetagPanel');
    if (panel) panel.classList.toggle('hidden');
    const inp = document.getElementById('bulkRetagInput');
    if (inp) { inp.value = ''; inp.focus(); }
  });

  document.getElementById('bulkRetagConfirmBtn')?.addEventListener('click', async () => {
    const inp = document.getElementById('bulkRetagInput');
    const tag = (inp?.value || '').trim();
    if (!tag) return;
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      const txn = store.transactions.find(t => t.id === id);
      if (!txn) continue;
      const updatedTags = [...new Set([...(txn.tags || []), tag])];
      try { await updateDoc(doc(db, 'transactions', id), { tags: updatedTags }); }
      catch (err) { console.error(err); }
    }
    selectedIds.clear();
    bulkMode = false;
    document.getElementById('bulkToggleBtn').textContent = 'Select';
    document.getElementById('bulkActionBar')?.classList.add('hidden');
    document.getElementById('bulkRetagPanel')?.classList.add('hidden');
  });

  // ── Form Reset ────────────────────────────────────────────────
  document.addEventListener('resetTxnForm', () => {
    currentEditId  = null;
    currentReceipt = null;
    form?.reset();
    currentTags = [];
    renderTags();
    if (splitRows) splitRows.innerHTML = '';
    // BUG FIX: splitToggle re-enabled on reset so edits can toggle splits
    if (splitToggle) { splitToggle.checked = false; splitToggle.disabled = false; }
    document.getElementById('splitChildNotice')?.classList.add('hidden');
    isSplitMode = false;
    splitContainer?.classList.add('hidden');
    document.getElementById('standardTxnInputs')?.classList.remove('hidden');
    // BUG FIX: Date timezone — use local date, not UTC
    const dateEl = document.getElementById('txnDate');
    if (dateEl) {
      const today = new Date();
      dateEl.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
    if (receiptPreview) { receiptPreview.src = ''; receiptPreview.classList.add('hidden'); }
    if (receiptName)    receiptName.textContent = 'No file';
    document.getElementById('deleteTxnBtn')?.classList.add('hidden');
    document.getElementById('duplicateTxnBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveTxnBtn');
    if (saveBtn) saveBtn.innerText = 'Save';
    // Reset event selector
    const evtSel = document.getElementById('txnEventId');
    if (evtSel) evtSel.value = '';
    // Reset party field + label
    const partyEl    = document.getElementById('txnParty');
    const partyLabel = document.getElementById('txnPartyLabel');
    if (partyEl)    partyEl.value       = '';
    if (partyLabel) partyLabel.textContent = 'Recipient';
  });

  // ── Populate Event selector from store ──────────────────────────
  store.subscribe(state => {
    if (!state.isLoaded) return;
    const sel = document.getElementById('txnEventId');
    if (!sel) return;
    const currentVal = sel.value;
    // Keep the blank option, rebuild the rest
    sel.innerHTML = '<option value="">— No Event —</option>';
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const events = (state.events || []).slice().sort((a, b) => {
      const sa = new Date(a.startDate); const sb = new Date(b.startDate);
      return sa - sb;
    });
    const active   = events.filter(e => { const s = new Date(e.startDate); const en = new Date(e.endDate); return now >= s && now <= en; });
    const upcoming = events.filter(e => new Date(e.startDate) > now);
    const past     = events.filter(e => new Date(e.endDate) < now);
    function addGroup(label, list) {
      if (!list.length) return;
      const grp = document.createElement('optgroup');
      grp.label = label;
      list.forEach(ev => {
        const opt = document.createElement('option');
        opt.value = ev.id;
        opt.textContent = ev.name;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    }
    addGroup('Happening Now', active);
    addGroup('Upcoming', upcoming);
    addGroup('Past', past);
    // Restore previously selected value if still present
    if (currentVal) sel.value = currentVal;
  });

  // ── Month Filter Population ───────────────────────────────────
  if (monthFilter && monthFilter.children.length <= 1) {
    for (let i = 0; i < 24; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const val   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      monthFilter.innerHTML += `<option value="${val}">${label}</option>`;
    }
  }

  let searchTimeout;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderList, 150);
  });
  monthFilter?.addEventListener('change', renderList);

  // ── Amount-Range Search Parser ────────────────────────────────
  // Supports: ">5000", "<500", "500-2000", or plain text
  function parseSearch(raw) {
    const s = (raw || '').trim();
    const gt = s.match(/^>(\d+(\.\d+)?)$/);
    const lt = s.match(/^<(\d+(\.\d+)?)$/);
    const rng = s.match(/^(\d+(\.\d+)?)-(\d+(\.\d+)?)$/);
    if (gt)  return { type: 'gt',  value: parseFloat(gt[1]) };
    if (lt)  return { type: 'lt',  value: parseFloat(lt[1]) };
    if (rng) return { type: 'rng', min: parseFloat(rng[1]), max: parseFloat(rng[3]) };
    return   { type: 'text', value: s.toLowerCase() };
  }

  function matchesSearch(txn, parsed) {
    if (!parsed.value && parsed.type === 'text') return true;
    const amt = Math.abs(txn.amount || 0);
    if (parsed.type === 'gt')  return amt > parsed.value;
    if (parsed.type === 'lt')  return amt < parsed.value;
    if (parsed.type === 'rng') return amt >= parsed.min && amt <= parsed.max;
    // text: match title or any tag
    const title  = (txn.title || '').toLowerCase();
    const tagStr = (txn.tags  || []).join(' ').toLowerCase();
    return title.includes(parsed.value) || tagStr.includes(parsed.value);
  }

  // ── Render List ───────────────────────────────────────────────
  function renderList() {
    if (!list || !store.isLoaded) return;
    list.innerHTML = '';
    const parsed        = parseSearch(searchInput?.value);
    const selectedMonth = monthFilter?.value || 'all';

    let filtered = store.transactions.filter(txn => {
      if (!matchesSearch(txn, parsed)) return false;
      if (selectedMonth !== 'all' && txn.date) {
        // BUG FIX: parse date as local timezone by appending T00:00:00
        const dateStr = txn.date.includes('T') ? txn.date : txn.date + 'T00:00:00';
        const d = new Date(dateStr);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (key !== selectedMonth) return false;
      }
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortKey === 'date') {
        return sortDir * ((new Date(b.date || 0)) - (new Date(a.date || 0)));
      }
      if (sortKey === 'amount') {
        return sortDir * (Math.abs(a.amount || 0) - Math.abs(b.amount || 0));
      }
      if (sortKey === 'category') {
        return sortDir * ((a.tags?.[0] || '').localeCompare(b.tags?.[0] || ''));
      }
      return 0;
    });

    if (filtered.length === 0) {
      list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No results found.</p>';
      return;
    }

    const filteredNet = filtered.reduce((sum, t) =>
      sum + (t.type === 'expense' ? -Math.abs(t.amount||0) : Math.abs(t.amount||0)), 0);

    list.innerHTML = `<p class="text-xs text-forest-500 font-semibold mb-2">Filtered Net: <span class="${filteredNet>=0?'text-green-600':'text-red-500'}">₹${filteredNet.toLocaleString('en-IN')}</span></p>`;

    filtered.forEach(txn => {
      const isExpense  = txn.type === 'expense';
      // BUG FIX: force local timezone when parsing date-only strings
      const rawDate    = txn.date ? (txn.date.includes('T') ? txn.date : txn.date + 'T00:00:00') : null;
      const dateString = rawDate
        ? new Date(rawDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
        : 'Unknown';

      // Resolve linked event (if any)
      const linkedEvent = txn.eventId ? (store.events || []).find(e => e.id === txn.eventId) : null;

      // Event capsule — shown in the date/tag row, distinct from regular tags
      const eventCapsule = linkedEvent
        ? `<span class="inline-flex items-center gap-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ml-0.5">🎉 ${linkedEvent.name}</span>`
        : '';

      // Tag badges — exclude the event name to avoid double-display
      const displayTags = (txn.tags || []).filter(t => !linkedEvent || t !== linkedEvent.name);
      const tagBadges = displayTags.map(tag =>
        `<span class="bg-forest-100 dark:bg-gray-700 text-forest-700 dark:text-gray-300 text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase">${tag}</span>`
      ).join('');

      const splitBadge = txn.splitGroupId
        ? `<span class="bg-teal-50 dark:bg-teal-900/30 text-teal-600 text-[9px] px-1.5 py-0.5 rounded ml-1">Split</span>`
        : '';
      const recurBadge = txn.isRecurring
        ? `<span class="bg-purple-50 dark:bg-purple-900/30 text-purple-500 text-[9px] px-1.5 py-0.5 rounded ml-1">↻</span>`
        : '';
      const receiptIcon = txn.receipt
        ? `<span class="text-[9px] text-gray-400 ml-1">📎</span>`
        : '';

      const isSelected   = selectedIds.has(txn.id);
      const checkboxHtml = bulkMode
        ? `<div class="w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center mr-1 ${isSelected ? 'bg-forest-900 border-forest-900' : 'border-gray-300 dark:border-gray-500'}">
             ${isSelected ? '<span class="text-white text-[10px] font-bold">✓</span>' : ''}
           </div>`
        : '';

      list.innerHTML += `
        <div data-id="${txn.id}" class="edit-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex justify-between items-center active:scale-[0.98] ${isSelected ? 'ring-2 ring-forest-900 dark:ring-forest-400' : ''}">
          ${checkboxHtml}
          <div class="flex-1 min-w-0 mr-3">
            <p class="font-semibold text-forest-900 dark:text-white flex items-center flex-wrap line-clamp-1">${txn.title || 'Untitled'}${splitBadge}${recurBadge}${receiptIcon}</p>
            <div class="flex items-center gap-1 mt-1 flex-wrap">
              <span class="text-xs text-forest-400">${dateString}</span>
              ${tagBadges}
              ${eventCapsule}
            </div>
          </div>
          <p class="font-display font-semibold text-xl flex-shrink-0 ${isExpense ? 'text-red-500' : 'text-forest-500'}">
            ${isExpense ? '-' : '+'}₹${Math.abs(txn.amount||0).toLocaleString('en-IN')}
          </p>
        </div>`;
    });
  }

  // ── Form Submit ───────────────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawAmount = Number(document.getElementById('txnAmount').value);
      if (rawAmount <= 0) return alert('Amount must be greater than 0.');

      // BUG FIX: append T00:00:00 to force local timezone interpretation
      const txnDateRaw  = document.getElementById('txnDate').value;
      const txnDate     = txnDateRaw; // stored as-is; parsed everywhere with T00:00:00 suffix
      const txnTitle    = (document.getElementById('txnTitle').value || '').trim();

      // BUG FIX: flush any text sitting in tagInput that user forgot to press Enter on
      if (tagInput?.value.trim()) {
        const pending = tagInput.value.trim().replace(/^,+|,+$/g, '');
        if (pending && !currentTags.includes(pending)) currentTags.push(pending);
        tagInput.value = '';
        renderTags();
      }

      // Duplicate detection — same title + date + amount (within ₹1)
      if (!currentEditId && !isSplitMode) {
        const dupes = store.transactions.filter(t =>
          t.date && t.date.split('T')[0] === txnDateRaw &&
          (t.title || '').toLowerCase().trim() === txnTitle.toLowerCase() &&
          Math.abs((t.amount || 0) - rawAmount) < 1
        );
        if (dupes.length > 0) {
          const proceed = confirm(`Possible duplicate: "${txnTitle}" ₹${rawAmount} on ${txnDateRaw} already exists.\n\nSave anyway?`);
          if (!proceed) return;
        }
      }

      const basePayload = {
        title:       txnTitle,
        type:        document.getElementById('txnType').value || 'expense',
        date:        txnDate + 'T00:00:00', // local noon to avoid UTC date flip
        timestamp:   new Date(txnDate + 'T00:00:00').getTime(),
        isRecurring: document.getElementById('txnIsRecurring')?.checked || false,
        party:       document.getElementById('txnParty')?.value.trim() || '',
        ...(currentReceipt ? { receipt: currentReceipt } : {})
      };

      try {
        const btn = document.getElementById('saveTxnBtn');
        if (btn) btn.innerText = 'Saving…';

        if (isSplitMode && !currentEditId) {
          const splitGroupId = `split_${Date.now()}`;
          let splitSum = 0;
          const rows   = Array.from(splitRows.querySelectorAll('.split-row'));
          const splits = rows.map(r => {
            const amt = Number(r.querySelector('.split-amt').value);
            splitSum += amt;
            return { amount: amt, tag: r.querySelector('.split-cat').value.trim() };
          });
          // BUG FIX: use tolerance instead of strict === to handle floating-point
          if (Math.abs(splitSum - rawAmount) > 0.5) {
            if (btn) btn.innerText = 'Save';
            return alert(`Split total (₹${splitSum.toFixed(2)}) must equal total amount (₹${rawAmount}).`);
          }
          for (let i = 0; i < splits.length; i++) {
            await addDoc(collection(db, 'transactions'), {
              ...basePayload,
              title:        `${basePayload.title} (Split ${i+1})`,
              amount:       splits[i].amount,
              tags:         [splits[i].tag],
              label:        'Split',
              splitGroupId
            });
          }
        } else {
          const finalTags = currentTags;

          // If an event is selected, inject its name as a tag automatically
          const selectedEventId   = document.getElementById('txnEventId')?.value || null;
          const selectedEventName = selectedEventId
            ? (store.events || []).find(ev => ev.id === selectedEventId)?.name
            : null;
          const tagsWithEvent = selectedEventName && !finalTags.includes(selectedEventName)
            ? [...finalTags, selectedEventName]
            : finalTags;

          const payload = {
            ...basePayload,
            amount:  rawAmount,
            tags:    tagsWithEvent,
            eventId: selectedEventId || null,
          };
          if (currentEditId) await updateDoc(doc(db, 'transactions', currentEditId), payload);
          else               await addDoc(collection(db, 'transactions'), payload);
        }

        // GAP FIX: auto-generate a chain of future entries for recurring transactions.
        // BUG 2: previously only one next-month entry was created; now generates 12 months.
        // BUG 1: payload had `label` set twice — kept only the annotated version.
        if (basePayload.isRecurring && !currentEditId && !isSplitMode) {
          const RECUR_MONTHS = 12;
          const recurEventId = document.getElementById('txnEventId')?.value || null;
          for (let m = 1; m <= RECUR_MONTHS; m++) {
            const futureDate = new Date(txnDate + 'T00:00:00');
            futureDate.setMonth(futureDate.getMonth() + m);
            const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth()+1).padStart(2,'0')}-${String(futureDate.getDate()).padStart(2,'0')}`;
            await addDoc(collection(db, 'transactions'), {
              ...basePayload,
              amount:      rawAmount,
              tags:        currentTags,
              eventId:     recurEventId,
              date:        futureDateStr + 'T00:00:00',
              timestamp:   new Date(futureDateStr + 'T00:00:00').getTime(),
              isRecurring: true
            });
          }
        }

      } catch (err) {
        console.error(err);
      } finally {
        ui.closeAll();
      }
    });

    // Delete
    document.getElementById('deleteTxnBtn')?.addEventListener('click', () => {
      ui.showConfirm('Delete Transaction?', 'This will permanently remove this entry.', async () => {
        try { await deleteDoc(doc(db, 'transactions', currentEditId)); }
        catch (err) { console.error(err); }
        finally { ui.closeAll(); }
      });
    });

    // Duplicate — pre-fills form as a new entry (no id copy)
    document.getElementById('duplicateTxnBtn')?.addEventListener('click', () => {
      const amount      = document.getElementById('txnAmount')?.value;
      const title       = document.getElementById('txnTitle')?.value;
      const type        = document.getElementById('txnType')?.value;
      const eventId     = document.getElementById('txnEventId')?.value;
      const party       = document.getElementById('txnParty')?.value;
      const savedTags   = [...currentTags];

      document.dispatchEvent(new Event('resetTxnForm'));

      document.getElementById('txnAmount').value = amount;
      document.getElementById('txnTitle').value  = title;
      document.getElementById('txnType').value   = type;
      if (party && document.getElementById('txnParty')) document.getElementById('txnParty').value = party;
      updatePartyLabel(type);
      // Set today's date (local)
      const now = new Date();
      document.getElementById('txnDate').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      if (eventId && document.getElementById('txnEventId')) document.getElementById('txnEventId').value = eventId;
      currentTags = savedTags;
      renderTags();
    });
  }

  // ── Receipt Sheet ─────────────────────────────────────────────
  let currentReceiptTxnId = null;

  function openReceiptSheet(txn) {
    const isExpense = txn.type === 'expense';

    // Accent bar colour
    const accentBar = document.getElementById('receiptAccentBar');
    if (accentBar) accentBar.style.background = isExpense ? '#ef4444' : '#22c55e';

    // Type + amount
    const typeEl = document.getElementById('receiptTypeLabel');
    const amtEl  = document.getElementById('receiptAmountDisplay');
    if (typeEl) typeEl.textContent = isExpense ? 'EXPENSE' : 'INCOME';
    if (amtEl) {
      amtEl.textContent  = `${isExpense ? '-' : '+'}₹${Math.abs(txn.amount || 0).toLocaleString('en-IN')}`;
      amtEl.className    = `font-display text-5xl font-bold tabular-nums ${isExpense ? 'text-red-500' : 'text-forest-500'}`;
    }

    // Title
    const titleEl = document.getElementById('receiptTitleDisplay');
    if (titleEl) titleEl.textContent = txn.title || 'Untitled';

    // Date
    const rawDate   = txn.date ? (txn.date.includes('T') ? txn.date : txn.date + 'T00:00:00') : null;
    const dateEl    = document.getElementById('receiptDateDisplay');
    if (dateEl) dateEl.textContent = rawDate
      ? new Date(rawDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

    // Party (Recipient / Payer)
    const partyRow    = document.getElementById('receiptPartyRow');
    const partyLblEl  = document.getElementById('receiptPartyLabel');
    const partyDisp   = document.getElementById('receiptPartyDisplay');
    if (txn.party && partyRow && partyDisp) {
      if (partyLblEl) partyLblEl.textContent = txn.type === 'income' ? 'Payer / Source' : 'Recipient';
      partyDisp.textContent = txn.party;
      partyRow.classList.remove('hidden');
    } else {
      partyRow?.classList.add('hidden');
    }

    // Event
    const linkedEvent  = txn.eventId ? (store.events || []).find(e => e.id === txn.eventId) : null;
    const eventRow     = document.getElementById('receiptEventRow');
    const eventEl      = document.getElementById('receiptEventDisplay');
    if (linkedEvent && eventRow && eventEl) {
      eventEl.textContent = '🎉 ' + linkedEvent.name;
      eventRow.classList.remove('hidden');
    } else {
      eventRow?.classList.add('hidden');
    }

    // Tags (exclude event name)
    const displayTags   = (txn.tags || []).filter(t => !linkedEvent || t !== linkedEvent.name);
    const tagsRow       = document.getElementById('receiptTagsRow');
    const tagsContainer = document.getElementById('receiptTagsDisplay');
    if (tagsContainer) {
      tagsContainer.innerHTML = displayTags.map(t =>
        `<span class="bg-forest-100 dark:bg-gray-700 text-forest-700 dark:text-gray-300 text-[9px] px-2 py-0.5 rounded font-semibold uppercase">${t}</span>`
      ).join('');
    }
    tagsRow?.classList.toggle('hidden', displayTags.length === 0);

    // Status badges
    document.getElementById('receiptRecurringBadge')?.classList.toggle('hidden', !txn.isRecurring);
    document.getElementById('receiptSplitBadge')?.classList.toggle('hidden', !txn.splitGroupId);

    // Receipt photo
    const photoBlock = document.getElementById('receiptPhotoBlock');
    const photoImg   = document.getElementById('receiptPhotoImg');
    if (txn.receipt && photoBlock && photoImg) {
      photoImg.src = txn.receipt;
      photoBlock.classList.remove('hidden');
    } else {
      photoBlock?.classList.add('hidden');
    }

    currentReceiptTxnId = txn.id;
    if (ui.txnReceiptSheet) ui.openSheet(ui.txnReceiptSheet);
  }

  // Edit button inside receipt sheet → open edit form
  document.getElementById('editFromReceiptBtn')?.addEventListener('click', () => {
    const txn = store.transactions.find(t => t.id === currentReceiptTxnId);
    if (!txn) return;
    document.dispatchEvent(new Event('resetTxnForm'));
    currentEditId = txn.id;
    document.getElementById('txnAmount').value = txn.amount || '';
    document.getElementById('txnTitle').value  = txn.title  || '';
    document.getElementById('txnType').value   = txn.type   || 'expense';
    if (txn.date) document.getElementById('txnDate').value = txn.date.split('T')[0];
    if (document.getElementById('txnEventId')) document.getElementById('txnEventId').value = txn.eventId || '';
    if (document.getElementById('txnIsRecurring')) document.getElementById('txnIsRecurring').checked = txn.isRecurring || false;
    // Party
    if (document.getElementById('txnParty')) document.getElementById('txnParty').value = txn.party || '';
    updatePartyLabel(txn.type || 'expense');
    if (txn.receipt && receiptPreview) {
      receiptPreview.src = txn.receipt;
      receiptPreview.classList.remove('hidden');
      if (receiptName) receiptName.textContent = 'Saved receipt';
      currentReceipt = txn.receipt;
    }
    currentTags = txn.tags ? [...txn.tags] : [];
    renderTags();
    if (splitToggle) {
      if (txn.splitGroupId) {
        splitToggle.disabled = true;
        let splitNotice = document.getElementById('splitChildNotice');
        if (!splitNotice) {
          splitNotice = document.createElement('p');
          splitNotice.id = 'splitChildNotice';
          splitNotice.className = 'text-[10px] text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 rounded-lg px-3 py-2';
          splitToggle.closest('label')?.parentElement?.after(splitNotice);
        }
        splitNotice.textContent = 'Split entry — you can edit title, amount, tags and date.';
        splitNotice.classList.remove('hidden');
      } else {
        splitToggle.disabled = false;
        document.getElementById('splitChildNotice')?.classList.add('hidden');
      }
    }
    document.getElementById('deleteTxnBtn')?.classList.remove('hidden');
    document.getElementById('duplicateTxnBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveTxnBtn');
    if (saveBtn) saveBtn.innerText = 'Update';
    ui.openSheet(ui.txnForm);
  });

  // ── Local Ledger FAB ──────────────────────────────────────────
  document.getElementById('ledgerFabBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetTxnForm'));
    ui.openSheet(ui.txnForm);
  });

  // ── Click Delegation (receipt view + bulk select) ─────────────
  list?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-card');
    if (!card) return;
    const txn = store.transactions.find(t => t.id === card.dataset.id);
    if (!txn) return;

    // Bulk mode: toggle selection
    if (bulkMode) {
      if (selectedIds.has(txn.id)) selectedIds.delete(txn.id);
      else                         selectedIds.add(txn.id);
      const countEl = document.getElementById('bulkCount');
      if (countEl) countEl.textContent = `${selectedIds.size} selected`;
      renderList();
      return;
    }

    // Normal mode: open receipt view
    openReceiptSheet(txn);
  });
}
