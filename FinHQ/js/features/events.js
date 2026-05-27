import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Module-level UI reference (set during initEvents) ──────────────────────
// Allows module-level helpers (openEventCreateSheet, openEventQuickAdd) to
// use the central openSheet() / _ui?.closeAll() without prop-drilling through every call.
let _ui = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDate(str) {
  if (!str) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(str);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateRange(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  const opts = { day: 'numeric', month: 'short' };
  if (start === end) return s.toLocaleDateString('en-IN', { ...opts, year: 'numeric' });
  if (s.getFullYear() === e.getFullYear())
    return `${s.toLocaleDateString('en-IN', opts)} – ${e.toLocaleDateString('en-IN', { ...opts, year: 'numeric' })}`;
  return `${s.toLocaleDateString('en-IN', { ...opts, year: 'numeric' })} – ${e.toLocaleDateString('en-IN', { ...opts, year: 'numeric' })}`;
}

function getEventStatus(startDate, endDate) {
  const now = new Date(); now.setHours(0,0,0,0);
  const s = parseDate(startDate);
  const e = parseDate(endDate);
  if (now < s) return 'upcoming';
  if (now > e) return 'past';
  return 'active';
}

function daysUntil(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const d = parseDate(dateStr);
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function daysLeft(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const d = parseDate(dateStr);
  d.setHours(23,59,59,999);
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

const EVENT_TYPES = {
  trip:      { emoji: '✈️', label: 'Trip',       color: 'sky' },
  wedding:   { emoji: '💍', label: 'Wedding',    color: 'pink' },
  birthday:  { emoji: '🎂', label: 'Birthday',   color: 'yellow' },
  festival:  { emoji: '🪔', label: 'Festival',   color: 'orange' },
  puja:      { emoji: '🙏', label: 'Puja/Pooja', color: 'amber' },
  reunion:   { emoji: '👨‍👩‍👧‍👦', label: 'Reunion',   color: 'teal' },
  other:     { emoji: '🎉', label: 'Other',      color: 'purple' },
};

// ── Event Spend Calculator ─────────────────────────────────────────────────

function getEventSpend(eventId, transactions) {
  return transactions
    .filter(t => t.eventId === eventId && t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
}

// ── Active Event Banner on Hub ─────────────────────────────────────────────

function renderActiveEventBanner(state) {
  const banner = document.getElementById('activeEventBanner');
  if (!banner) return;

  const activeEvent = (state.events || []).find(e => getEventStatus(e.startDate, e.endDate) === 'active');
  if (!activeEvent) {
    banner.classList.add('hidden');
    return;
  }

  const spend  = getEventSpend(activeEvent.id, state.transactions);
  const budget = activeEvent.budget || 0;
  const pct    = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
  const left   = daysLeft(activeEvent.endDate);
  const type   = EVENT_TYPES[activeEvent.type] || EVENT_TYPES.other;
  const over   = budget > 0 && spend > budget;
  const barColor = over ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-forest-400';

  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-2">
        <span class="text-2xl">${type.emoji}</span>
        <div>
          <p class="text-[10px] text-forest-400 font-semibold tracking-widest uppercase">Active Event</p>
          <p class="font-display text-base font-semibold text-forest-900 dark:text-white leading-tight">${activeEvent.name}</p>
        </div>
      </div>
      <div class="text-right">
        <p class="text-[10px] text-forest-400 uppercase font-semibold">${left === 1 ? 'Last day' : `${left}d left`}</p>
        ${budget > 0 ? `<p class="text-sm font-semibold ${over ? 'text-red-500' : 'text-forest-900 dark:text-white'}">₹${spend.toLocaleString('en-IN')} <span class="text-gray-400 font-normal text-[10px]">/ ₹${budget.toLocaleString('en-IN')}</span></p>` : `<p class="text-sm font-semibold text-forest-900 dark:text-white">₹${spend.toLocaleString('en-IN')} <span class="text-gray-400 font-normal text-[10px]">spent</span></p>`}
      </div>
    </div>
    ${budget > 0 ? `
    <div class="mt-3 bg-forest-100 dark:bg-gray-700 rounded-full h-1.5">
      <div class="h-1.5 rounded-full transition-all ${barColor}" style="width:${pct}%"></div>
    </div>` : ''}
    <button id="bannerQuickAddBtn" class="mt-3 w-full py-2 text-xs font-semibold bg-forest-900 dark:bg-forest-800 text-white rounded-xl hover:opacity-90 transition-opacity">
      + Quick Add Expense
    </button>
  `;

  document.getElementById('bannerQuickAddBtn')?.addEventListener('click', () => {
    openEventQuickAdd(activeEvent);
  });
}

// ── Open Quick-Add Transaction (event context) ────────────────────────────

function openEventQuickAdd(event) {
  // Pre-set the standard txnForm with event context
  document.dispatchEvent(new Event('resetTxnForm'));

  const tagLabel = document.getElementById('eventContextTag');
  if (tagLabel) {
    tagLabel.textContent = `${EVENT_TYPES[event.type]?.emoji || '🎉'} ${event.name}`;
    tagLabel.parentElement?.classList.remove('hidden');
  }

  // Store active event context
  window._activeEventContext = event;

  const sheet   = document.getElementById('eventQuickAddSheet');
  const overlay = document.getElementById('bottomSheetOverlay');
  if (!sheet || !overlay) return;

  // Reset form
  const amtEl   = document.getElementById('eqaAmount');
  const titleEl = document.getElementById('eqaTitle');
  const dateEl  = document.getElementById('eqaDate');
  const typeEl  = document.getElementById('eqaType');
  if (amtEl)   amtEl.value   = '';
  if (titleEl) titleEl.value = '';
  if (dateEl)  dateEl.value  = today();
  if (typeEl)  typeEl.value  = 'expense';

  // Update sheet header
  const headerEl = document.getElementById('eqaEventName');
  if (headerEl) {
    const type = EVENT_TYPES[event.type] || EVENT_TYPES.other;
    headerEl.textContent = `${type.emoji} ${event.name}`;
  }

  // FIX: Use the central openSheet() from uiController instead of maintaining
  // a local allSheets list that was always incomplete (missing serviceFormSheet,
  // cumulatedAmortSheet, eventQuickAddSheet).
  if (_ui?.openSheet) {
    _ui.openSheet(sheet);
    setTimeout(() => document.getElementById('eqaAmount')?.focus(), 50);
  } else {
    // Fallback for contexts where ui is not passed
    sheet.classList.remove('hidden');
    overlay.classList.remove('hidden');
    setTimeout(() => {
      overlay.classList.remove('opacity-0');
      sheet.classList.remove('translate-y-full');
      sheet.scrollTop = 0;
      document.getElementById('eqaAmount')?.focus();
    }, 10);
  }
}

// ── Render Events List ─────────────────────────────────────────────────────

function renderEventsList(state) {
  const container = document.getElementById('eventsList');
  if (!container) return;

  const events     = (state.events || []).slice().sort((a, b) => {
    return parseDate(a.startDate) - parseDate(b.startDate);
  });
  const active     = events.filter(e => getEventStatus(e.startDate, e.endDate) === 'active');
  const upcoming   = events.filter(e => getEventStatus(e.startDate, e.endDate) === 'upcoming');
  const past       = events.filter(e => getEventStatus(e.startDate, e.endDate) === 'past').reverse();

  if (events.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 text-gray-400">
        <p class="text-5xl mb-4">🗓️</p>
        <p class="font-semibold text-sm">No events yet</p>
        <p class="text-xs mt-1">Tap + to add a trip, wedding, festival&hellip;</p>
      </div>`;
    return;
  }

  function renderCard(event, status) {
    const type  = EVENT_TYPES[event.type] || EVENT_TYPES.other;
    const spend = getEventSpend(event.id, state.transactions);
    const budget = event.budget || 0;
    const pct   = budget > 0 ? Math.min((spend / budget) * 100, 100) : null;
    const over  = budget > 0 && spend > budget;
    const barColor = over ? 'bg-red-400' : (pct > 80 ? 'bg-amber-400' : 'bg-forest-400');

    let statusBadge = '';
    if (status === 'active') {
      const left = daysLeft(event.endDate);
      statusBadge = `<span class="text-[9px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-2 py-0.5 rounded-full">${left === 1 ? 'Last day!' : `${left}d left`}</span>`;
    } else if (status === 'upcoming') {
      const until = daysUntil(event.startDate);
      statusBadge = `<span class="text-[9px] font-semibold bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400 px-2 py-0.5 rounded-full">In ${until}d</span>`;
    } else {
      statusBadge = `<span class="text-[9px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 px-2 py-0.5 rounded-full">Done</span>`;
    }

    const txnCount = (state.transactions || []).filter(t => t.eventId === event.id).length;

    return `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 space-y-3" data-event-id="${event.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-2xl flex-shrink-0">${type.emoji}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-semibold text-sm text-forest-900 dark:text-white">${event.name}</p>
                ${statusBadge}
              </div>
              <p class="text-[10px] text-gray-400 mt-0.5">${formatDateRange(event.startDate, event.endDate)}</p>
            </div>
          </div>
          <button class="edit-event-btn flex-shrink-0 p-1.5 rounded-lg hover:bg-forest-50 dark:hover:bg-gray-700 text-gray-400" data-event-id="${event.id}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
        </div>

        <div class="flex items-center justify-between">
          <div>
            ${budget > 0
              ? `<p class="text-xs text-gray-400">Budget <span class="font-semibold text-forest-900 dark:text-white">₹${budget.toLocaleString('en-IN')}</span></p>`
              : `<p class="text-xs text-gray-400">No budget set</p>`
            }
            <p class="text-xs text-gray-400 mt-0.5">Spent <span class="font-semibold ${over ? 'text-red-500' : 'text-forest-900 dark:text-white'}">₹${spend.toLocaleString('en-IN')}</span> · ${txnCount} txn${txnCount !== 1 ? 's' : ''}</p>
          </div>
          ${status !== 'past' ? `
          <button class="quick-add-btn py-2 px-4 bg-forest-900 dark:bg-forest-700 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity" data-event-id="${event.id}">
            + Add
          </button>` : `
          <button class="view-txns-btn py-2 px-4 bg-forest-50 dark:bg-gray-700 text-forest-700 dark:text-gray-300 text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity" data-event-id="${event.id}">
            View
          </button>`}
        </div>

        ${pct !== null ? `
        <div class="bg-forest-50 dark:bg-gray-700 rounded-full h-1.5">
          <div class="h-1.5 rounded-full transition-all ${barColor}" style="width:${pct}%"></div>
        </div>` : ''}

        ${event.notes ? `<p class="text-[10px] text-gray-400 italic">${event.notes}</p>` : ''}
      </div>
    `;
  }

  let html = '';
  if (active.length > 0) {
    html += `<p class="text-[10px] text-forest-500 font-semibold tracking-widest uppercase px-1 mb-2">Happening Now</p>`;
    html += active.map(e => renderCard(e, 'active')).join('');
  }
  if (upcoming.length > 0) {
    html += `<p class="text-[10px] text-sky-500 font-semibold tracking-widest uppercase px-1 mt-5 mb-2">Upcoming</p>`;
    html += upcoming.map(e => renderCard(e, 'upcoming')).join('');
  }
  if (past.length > 0) {
    html += `<p class="text-[10px] text-gray-400 font-semibold tracking-widest uppercase px-1 mt-5 mb-2">Past Events</p>`;
    html += past.map(e => renderCard(e, 'past')).join('');
  }

  container.innerHTML = html;

  // Update summary count
  const summaryEl = document.getElementById('eventsSummary');
  if (summaryEl) {
    const liveCount = active.length + upcoming.length;
    summaryEl.innerText = liveCount > 0 ? `${liveCount} active` : `${past.length} past`;
    summaryEl.classList.remove('animate-pulse');
  }
}

// ── Open Event Create/Edit Sheet ──────────────────────────────────────────

function openEventCreateSheet(event = null) {
  const sheet   = document.getElementById('eventCreateSheet');
  const overlay = document.getElementById('bottomSheetOverlay');
  if (!sheet || !overlay) return;

  // Reset
  const nameEl   = document.getElementById('eventName');
  const typeEl   = document.getElementById('eventType');
  const startEl  = document.getElementById('eventStartDate');
  const endEl    = document.getElementById('eventEndDate');
  const budgetEl = document.getElementById('eventBudget');
  const notesEl  = document.getElementById('eventNotes');
  const titleEl  = document.getElementById('eventCreateTitle');
  const deleteBtn = document.getElementById('deleteEventBtn');

  if (event) {
    if (nameEl)   nameEl.value   = event.name   || '';
    if (typeEl)   typeEl.value   = event.type   || 'other';
    if (startEl)  startEl.value  = event.startDate || today();
    if (endEl)    endEl.value    = event.endDate   || today();
    if (budgetEl) budgetEl.value = event.budget    || '';
    if (notesEl)  notesEl.value  = event.notes     || '';
    if (titleEl)  titleEl.textContent = 'Edit Event';
    if (deleteBtn) deleteBtn.classList.remove('hidden');
    sheet._editId = event.id;
  } else {
    if (nameEl)   nameEl.value   = '';
    if (typeEl)   typeEl.value   = 'trip';
    if (startEl)  startEl.value  = today();
    if (endEl)    endEl.value    = today();
    if (budgetEl) budgetEl.value = '';
    if (notesEl)  notesEl.value  = '';
    if (titleEl)  titleEl.textContent = 'New Event';
    if (deleteBtn) deleteBtn.classList.add('hidden');
    sheet._editId = null;
  }

  // FIX: Use central openSheet() instead of a local allSheets list.
  if (_ui?.openSheet) {
    _ui.openSheet(sheet);
  } else {
    sheet.classList.remove('hidden');
    overlay?.classList.remove('hidden');
    setTimeout(() => {
      overlay?.classList.remove('opacity-0');
      sheet.classList.remove('translate-y-full');
      sheet.scrollTop = 0;
    }, 10);
  }
}

// FIX: Delegate to the central closeAll() so the sheetClosed event fires
// and ALL registered sheets (including serviceFormSheet, cumulatedAmortSheet)
// are properly dismissed. The old local list was always incomplete.
function closeAllSheets() {
  if (_ui?.closeAll) {
    _ui.closeAll();
  } else {
    // Fallback — should never be reached after _ui is set in initEvents
    document.getElementById('bottomSheetOverlay')?.classList.add('opacity-0', 'hidden');
  }
}

// ── Main Export ────────────────────────────────────────────────────────────

export function initEvents(ui) {
  // Store ui reference so module-level helpers can call openSheet / closeAll
  _ui = ui;

  // ── Subscriptions ──────────────────────────────────────────────
  store.subscribe(state => {
    if (!state.isLoaded) return;
    renderEventsList(state);
    renderActiveEventBanner(state);
  });

  // ── Create/Edit Form Submit ────────────────────────────────────
  const eventForm = document.getElementById('eventForm');
  eventForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sheet = document.getElementById('eventCreateSheet');

    const payload = {
      name:      document.getElementById('eventName')?.value.trim()   || 'Untitled',
      type:      document.getElementById('eventType')?.value          || 'other',
      startDate: document.getElementById('eventStartDate')?.value     || today(),
      endDate:   document.getElementById('eventEndDate')?.value       || today(),
      budget:    parseFloat(document.getElementById('eventBudget')?.value) || 0,
      notes:     document.getElementById('eventNotes')?.value.trim()  || '',
      timestamp: serverTimestamp(),
    };

    const btn = document.getElementById('saveEventBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      if (sheet?._editId) {
        await updateDoc(doc(db, 'events', sheet._editId), payload);
      } else {
        await addDoc(collection(db, 'events'), payload);
      }
      closeAllSheets();
    } catch (err) {
      console.error('Event save error:', err);
      alert('Could not save event. Please try again.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Event'; }
    }
  });

  // ── Delete Event ───────────────────────────────────────────────
  document.getElementById('deleteEventBtn')?.addEventListener('click', () => {
    const sheet = document.getElementById('eventCreateSheet');
    if (!sheet?._editId) return;
    const id = sheet._editId;
    if (!confirm('Delete this event? Linked transactions will remain in the ledger.')) return;
    deleteDoc(doc(db, 'events', id)).catch(err => console.error('Event delete error:', err));
    closeAllSheets();
  });

  // ── New Event Button ───────────────────────────────────────────
  document.getElementById('newEventBtn')?.addEventListener('click', () => openEventCreateSheet());

  // ── Events List Delegated Clicks ──────────────────────────────
  document.getElementById('eventsList')?.addEventListener('click', (e) => {
    const editBtn    = e.target.closest('.edit-event-btn');
    const quickAddBtn = e.target.closest('.quick-add-btn');
    const viewBtn    = e.target.closest('.view-txns-btn');

    if (editBtn) {
      const eventId = editBtn.dataset.eventId;
      const event   = store.events?.find(ev => ev.id === eventId);
      if (event) openEventCreateSheet(event);
    }
    if (quickAddBtn) {
      const eventId = quickAddBtn.dataset.eventId;
      const event   = store.events?.find(ev => ev.id === eventId);
      if (event) openEventQuickAdd(event);
    }
    if (viewBtn) {
      const eventId = viewBtn.dataset.eventId;
      const event   = store.events?.find(ev => ev.id === eventId);
      if (event) openEventQuickAdd(event); // open view (same panel, read-only past)
    }
  });

  // ── Quick-Add Transaction Form Submit ─────────────────────────
  const qaForm = document.getElementById('eventQuickAddForm');
  qaForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const event = window._activeEventContext;
    if (!event) return;

    const amount = parseFloat(document.getElementById('eqaAmount')?.value);
    if (!amount || amount <= 0) return;

    const payload = {
      amount,
      title:     document.getElementById('eqaTitle')?.value.trim() || event.name,
      type:      document.getElementById('eqaType')?.value || 'expense',
      date:      document.getElementById('eqaDate')?.value  || today(),
      tags:      [event.name],
      eventId:   event.id,
      label:     '',
      notes:     '',
      timestamp: serverTimestamp(),
    };

    const btn = document.getElementById('saveEqaBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await addDoc(collection(db, 'transactions'), payload);
      // Clear amount & title for fast multi-entry; keep date
      const amtEl   = document.getElementById('eqaAmount');
      const titleEl = document.getElementById('eqaTitle');
      if (amtEl)   amtEl.value   = '';
      if (titleEl) titleEl.value = '';
      amtEl?.focus();
      // Flash success
      btn.textContent = '✓ Saved';
      setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = 'Save & Add Another'; } }, 800);
    } catch (err) {
      console.error('Quick-add txn error:', err);
      alert('Could not save. Please try again.');
      if (btn) { btn.disabled = false; btn.textContent = 'Save & Add Another'; }
    }
  });

  // ── "Done" button on quick-add sheet ──────────────────────────
  document.getElementById('eqaDoneBtn')?.addEventListener('click', closeAllSheets);

  // ── Close sheet buttons on event sheets ───────────────────────
  document.querySelectorAll('.closeEventSheetBtn').forEach(btn => {
    btn.addEventListener('click', closeAllSheets);
  });
}
