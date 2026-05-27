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

// ── Active Event Banner on Hub (swipe carousel for multiple events) ─────────

function renderActiveEventBanner(state) {
  const banner = document.getElementById('activeEventBanner');
  if (!banner) return;

  const activeEvents = (state.events || []).filter(e => getEventStatus(e.startDate, e.endDate) === 'active');

  if (activeEvents.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');

  // Build one slide per active event
  const slides = activeEvents.map((activeEvent, idx) => {
    const spend  = getEventSpend(activeEvent.id, state.transactions);
    const budget = activeEvent.budget || 0;
    const pct    = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
    const left   = daysLeft(activeEvent.endDate);
    const type   = EVENT_TYPES[activeEvent.type] || EVENT_TYPES.other;
    const over   = budget > 0 && spend > budget;
    const barColor = over ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-forest-400';

    return `
      <div class="event-banner-slide flex-shrink-0 w-full" data-event-id="${activeEvent.id}" data-slide="${idx}">
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
            ${budget > 0
              ? `<p class="text-sm font-semibold ${over ? 'text-red-500' : 'text-forest-900 dark:text-white'}">₹${spend.toLocaleString('en-IN')} <span class="text-gray-400 font-normal text-[10px]">/ ₹${budget.toLocaleString('en-IN')}</span></p>`
              : `<p class="text-sm font-semibold text-forest-900 dark:text-white">₹${spend.toLocaleString('en-IN')} <span class="text-gray-400 font-normal text-[10px]">spent</span></p>`}
          </div>
        </div>
        ${budget > 0 ? `
        <div class="mt-3 bg-forest-100 dark:bg-gray-700 rounded-full h-1.5">
          <div class="h-1.5 rounded-full transition-all ${barColor}" style="width:${pct}%"></div>
        </div>` : ''}
        <button class="banner-quick-add-btn mt-3 w-full py-2 text-xs font-semibold bg-forest-900 dark:bg-forest-800 text-white rounded-xl hover:opacity-90 transition-opacity" data-event-id="${activeEvent.id}">
          + Quick Add Expense
        </button>
      </div>`;
  }).join('');

  // Dot indicators (only shown when >1 event)
  const dots = activeEvents.length > 1
    ? `<div class="flex justify-center gap-1.5 mt-3">
        ${activeEvents.map((_, i) =>
          `<button class="banner-dot w-1.5 h-1.5 rounded-full transition-all ${i === 0 ? 'bg-forest-700 dark:bg-forest-400 w-3' : 'bg-forest-200 dark:bg-gray-600'}" data-dot="${i}"></button>`
        ).join('')}
       </div>`
    : '';

  banner.innerHTML = `
    <div class="overflow-hidden">
      <div id="bannerTrack" class="flex transition-transform duration-300 ease-out" style="transform:translateX(0%)">${slides}</div>
    </div>
    ${dots}`;

  // ── Swipe & dot navigation ──────────────────────────────────────
  if (activeEvents.length > 1) {
    let current   = 0;
    const track   = banner.querySelector('#bannerTrack');
    const dotEls  = banner.querySelectorAll('.banner-dot');

    function goTo(idx) {
      current = (idx + activeEvents.length) % activeEvents.length;
      track.style.transform = `translateX(-${current * 100}%)`;
      dotEls.forEach((d, i) => {
        d.classList.toggle('bg-forest-700', i === current);
        d.classList.toggle('dark:bg-forest-400', i === current);
        d.classList.toggle('w-3', i === current);
        d.classList.toggle('bg-forest-200', i !== current);
        d.classList.toggle('dark:bg-gray-600', i !== current);
        d.classList.toggle('w-1.5', i !== current);
      });
    }

    // Dot clicks
    dotEls.forEach(d => d.addEventListener('click', () => goTo(Number(d.dataset.dot))));

    // Touch swipe
    let touchStartX = 0;
    banner.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    banner.addEventListener('touchend',   e => {
      const delta = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) > 40) goTo(delta < 0 ? current + 1 : current - 1);
    }, { passive: true });
  }

  // ── Quick-add buttons ───────────────────────────────────────────
  banner.querySelectorAll('.banner-quick-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const eventId = btn.dataset.eventId;
      const event   = activeEvents.find(e => e.id === eventId);
      if (event) openEventQuickAdd(event);
    });
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
  if (!sheet) return;

  // Reset form
  const amtEl   = document.getElementById('eqaAmount');
  const titleEl = document.getElementById('eqaTitle');
  const dateEl  = document.getElementById('eqaDate');
  const typeEl  = document.getElementById('eqaType');
  if (amtEl)   amtEl.value   = '';
  if (titleEl) titleEl.value = '';
  if (dateEl)  dateEl.value  = today();
  if (typeEl)  typeEl.value  = 'expense';

  // Reset party + tags
  const partyEl    = document.getElementById('eqaParty');
  const tagInputEl = document.getElementById('eqaTagInput');
  if (partyEl)    partyEl.value    = '';
  if (tagInputEl) tagInputEl.value = '';
  window._eqaTags = [];
  if (window._renderEqaTags) window._renderEqaTags();

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
  if (!sheet) return;

  // Reset
  const nameEl   = document.getElementById('eventName');
  const typeEl   = document.getElementById('eventType');
  const startEl  = document.getElementById('eventStartDate');
  const endEl    = document.getElementById('eventEndDate');
  const budgetEl = document.getElementById('eventBudget');
  const notesEl  = document.getElementById('eventNotes');
  const titleEl  = document.getElementById('eventCreateTitle');
  const deleteBtn = document.getElementById('deleteEventBtn');

  // Tags state for this sheet
  let eventTags = [];
  function renderEventTags() {
    const container = document.getElementById('eventTagChipsContainer');
    if (!container) return;
    container.innerHTML = eventTags.map((tag, i) => `
      <span class="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] uppercase font-semibold tracking-wider px-2 py-1 rounded-md flex items-center gap-1">
        ${tag} <button type="button" data-index="${i}" class="remove-evt-tag hover:text-red-500 ml-1">&times;</button>
      </span>
    `).join('');
  }
  const evtTagInput = document.getElementById('eventTagInput');
  if (evtTagInput) {
    // Replace listener by cloning (removes old listener)
    const fresh = evtTagInput.cloneNode(true);
    evtTagInput.parentNode.replaceChild(fresh, evtTagInput);
    fresh.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = fresh.value.trim().replace(/^,+|,+$/g, '');
        if (val && !eventTags.includes(val)) { eventTags.push(val); renderEventTags(); }
        fresh.value = '';
      }
    });
  }
  document.getElementById('eventTagChipsContainer')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-evt-tag')) {
      eventTags.splice(Number(e.target.dataset.index), 1);
      renderEventTags();
    }
  });

  if (event) {
    if (nameEl)   nameEl.value   = event.name   || '';
    if (typeEl)   typeEl.value   = event.type   || 'other';
    if (startEl)  startEl.value  = event.startDate || today();
    if (endEl)    endEl.value    = event.endDate   || today();
    if (budgetEl) budgetEl.value = event.budget    || '';
    if (notesEl)  notesEl.value  = event.notes     || '';
    if (titleEl)  titleEl.textContent = 'Edit Event';
    if (deleteBtn) deleteBtn.classList.remove('hidden');
    eventTags = event.tags ? [...event.tags] : [];
    const partyEl = document.getElementById('eventParty');
    if (partyEl) partyEl.value = event.party || '';
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
    eventTags = [];
    const partyEl = document.getElementById('eventParty');
    if (partyEl) partyEl.value = '';
    sheet._editId = null;
  }
  renderEventTags();

  // Store tags ref so submit handler can read it
  sheet._eventTags = eventTags;

  // FIX: Use central openSheet() instead of a local allSheets list.
  if (_ui?.openSheet) {
    _ui.openSheet(sheet);
  }
}

// FIX: Delegate to the central closeAll() so the sheetClosed event fires
// and ALL registered sheets (including serviceFormSheet, cumulatedAmortSheet)
// are properly dismissed. The old local list was always incomplete.
function closeAllSheets() {
  if (_ui?.closeAll) {
    _ui.closeAll();
  }
}
}

// ── Main Export ────────────────────────────────────────────────────────────

export function initEvents(ui) {
  // Store ui reference so module-level helpers can call openSheet / closeAll
  _ui = ui;

  // ── EQA (Event Quick-Add) Tags + Party ────────────────────────
  window._eqaTags = [];

  function renderEqaTags() {
    const container = document.getElementById('eqaTagChipsContainer');
    if (!container) return;
    container.innerHTML = (window._eqaTags || []).map((tag, i) => `
      <span class="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] uppercase font-semibold tracking-wider px-2 py-1 rounded-md flex items-center gap-1">
        ${tag} <button type="button" data-index="${i}" class="remove-eqa-tag hover:text-red-500 ml-1">&times;</button>
      </span>
    `).join('');
  }

  // Make renderEqaTags available in module scope for openEventQuickAdd
  window._renderEqaTags = renderEqaTags;

  document.getElementById('eqaTagInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().replace(/^,+|,+$/g, '');
      if (val && !(window._eqaTags || []).includes(val)) {
        window._eqaTags = [...(window._eqaTags || []), val];
        renderEqaTags();
      }
      e.target.value = '';
    }
  });

  document.getElementById('eqaTagChipsContainer')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-eqa-tag')) {
      (window._eqaTags || []).splice(Number(e.target.dataset.index), 1);
      renderEqaTags();
    }
  });

  // Dynamic party label for quick-add
  function updateEqaPartyLabel(type) {
    const lbl   = document.getElementById('eqaPartyLabel');
    const input = document.getElementById('eqaParty');
    if (!lbl || !input) return;
    if (type === 'income') {
      lbl.textContent   = 'Payer';
      input.placeholder = 'e.g. Client, Employer';
    } else {
      lbl.textContent   = 'Recipient';
      input.placeholder = 'e.g. Restaurant, Shop';
    }
  }
  document.getElementById('eqaType')?.addEventListener('change', (e) => updateEqaPartyLabel(e.target.value));

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

    // Flush any unconfirmed tag text
    const evtTagInputEl = document.getElementById('eventTagInput');
    if (evtTagInputEl?.value.trim()) {
      const pending = evtTagInputEl.value.trim().replace(/^,+|,+$/g, '');
      if (pending && !(sheet._eventTags || []).includes(pending)) {
        (sheet._eventTags = sheet._eventTags || []).push(pending);
      }
      evtTagInputEl.value = '';
    }

    const payload = {
      name:      document.getElementById('eventName')?.value.trim()   || 'Untitled',
      type:      document.getElementById('eventType')?.value          || 'other',
      startDate: document.getElementById('eventStartDate')?.value     || today(),
      endDate:   document.getElementById('eventEndDate')?.value       || today(),
      budget:    parseFloat(document.getElementById('eventBudget')?.value) || 0,
      notes:     document.getElementById('eventNotes')?.value.trim()  || '',
      tags:      sheet._eventTags || [],
      party:     (document.getElementById('eventParty')?.value || '').trim(),
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

    // Flush unconfirmed tag text
    const eqaTagInputEl = document.getElementById('eqaTagInput');
    if (eqaTagInputEl?.value.trim()) {
      const pending = eqaTagInputEl.value.trim().replace(/^,+|,+$/g, '');
      if (pending && !(window._eqaTags || []).includes(pending)) {
        window._eqaTags = [...(window._eqaTags || []), pending];
      }
      eqaTagInputEl.value = '';
    }

    const extraTags = (window._eqaTags || []).filter(t => t !== event.name);
    const allTags   = [event.name, ...extraTags];

    const payload = {
      amount,
      title:     document.getElementById('eqaTitle')?.value.trim() || event.name,
      type:      document.getElementById('eqaType')?.value || 'expense',
      date:      document.getElementById('eqaDate')?.value  || today(),
      tags:      allTags,
      party:     (document.getElementById('eqaParty')?.value || '').trim(),
      eventId:   event.id,
      label:     '',
      notes:     '',
      timestamp: serverTimestamp(),
    };

    const btn = document.getElementById('saveEqaBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await addDoc(collection(db, 'transactions'), payload);
      // Clear amount, title, party, extra tags for fast multi-entry; keep date & type
      const amtEl   = document.getElementById('eqaAmount');
      const titleEl = document.getElementById('eqaTitle');
      const partyEl = document.getElementById('eqaParty');
      if (amtEl)   amtEl.value   = '';
      if (titleEl) titleEl.value = '';
      if (partyEl) partyEl.value = '';
      window._eqaTags = [];
      if (window._renderEqaTags) window._renderEqaTags();
      amtEl?.focus();
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
