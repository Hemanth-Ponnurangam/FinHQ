import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

export function initSip(ui) {
  const form         = document.getElementById('sipForm');
  const list         = document.getElementById('sipList');
  const totalDisplay = document.getElementById('totalSipDisplay');
  let currentEditId  = null;

  document.addEventListener('resetSipForm', () => {
    currentEditId = null;
    form?.reset();
    document.getElementById('deleteSipBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveSipBtn');
    if (saveBtn) saveBtn.innerText = 'Save Template';
  });

  if (form) {
    // Inline error helper — no more alert()
    function showErr(msg) {
      let el = form.querySelector('.sip-err');
      if (!el) {
        el = document.createElement('p');
        el.className = 'sip-err text-red-500 text-xs font-semibold mt-2 px-1';
        form.querySelector('#saveSipBtn')?.insertAdjacentElement('beforebegin', el);
      }
      el.textContent = msg;
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.textContent = ''; }, 4000);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name:        document.getElementById('sipName').value,
        amount:      Number(document.getElementById('sipAmount').value),
        type:        document.getElementById('sipType').value,
        billingDate: Number(document.getElementById('sipDate').value),
        timestamp:   Date.now(),
        _v:          1
      };
      if (!payload.name || payload.amount <= 0) return showErr('Name and amount are required.');
      try {
        if (currentEditId) await updateDoc(doc(db, 'recurring', currentEditId), payload);
        else               await addDoc(collection(db, 'recurring'), payload);
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteSipBtn')?.addEventListener('click', () => {
      ui.showConfirm('Delete Recurring Payment?', 'Remove this from your automator?', async () => {
        try { await deleteDoc(doc(db, 'recurring', currentEditId)); }
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // ── Store Subscription ────────────────────────────────────────
  store.subscribe(state => {
    if (!state.isLoaded || !list) return;
    list.innerHTML = '';
    let totalOutflow = 0;

    if (state.recurring.length === 0) {
      list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No automated payments set. Tap + to add one.</p>';
      if (totalDisplay) totalDisplay.innerText = '₹0';
      return;
    }

    const cards = [];
    state.recurring.forEach(sip => {
      totalOutflow += sip.amount;
      const isInv   = sip.type === 'Investment';
      const amtColor = isInv ? 'text-forest-500' : 'text-purple-600 dark:text-purple-400';

      const lastLoggedStr = sip.lastLogged
        ? `Last logged: ${new Date(sip.lastLogged).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : 'Not logged yet this month';

      const now = new Date();
      const alreadyLoggedThisMonth = sip.lastLogged &&
        (() => { const d = new Date(sip.lastLogged); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })();

      const logBtnStyle = alreadyLoggedThisMonth
        ? 'px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-[10px] font-bold'
        : 'log-now-btn px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-200 transition-colors text-[10px] font-bold';
      const logBtnText = alreadyLoggedThisMonth ? '✓ Logged' : 'Log Now';

      cards.push(`
        <div data-id="${sip.id}" class="edit-sip cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-purple-50 dark:border-gray-700 active:scale-[0.98] transition-transform">
          <div class="flex justify-between items-center mb-1">
            <span class="font-semibold text-forest-900 dark:text-white">${sip.name}</span>
            <span class="font-bold ${amtColor}">₹${sip.amount.toLocaleString('en-IN')}</span>
          </div>
          <div class="flex justify-between items-center text-[10px] text-gray-400 font-semibold mt-2">
            <div class="flex flex-col gap-0.5">
              <span class="uppercase">${sip.type} · Every ${sip.billingDate}th</span>
              <span>Annual: ₹${(sip.amount * 12).toLocaleString('en-IN')}</span>
              <span class="${alreadyLoggedThisMonth ? 'text-green-500' : ''}">${lastLoggedStr}</span>
            </div>
            <button type="button" class="${logBtnStyle}" data-logbtn="${sip.id}">${logBtnText}</button>
          </div>
        </div>`);
    });
    list.innerHTML = cards.join('');

    if (totalDisplay) totalDisplay.innerText = `₹${totalOutflow.toLocaleString('en-IN')}`;
  }, ['recurring']);

  // ── Click Delegation (edit + log now) ─────────────────────────
  list?.addEventListener('click', async (e) => {
    const card = e.target.closest('.edit-sip');
    if (!card) return;
    const sip = store.recurring.find(s => s.id === card.dataset.id);
    if (!sip) return;

    // ── Log Now ──────────────────────────────────────────────────
    if (e.target.closest('.log-now-btn')) {
      const btn = e.target.closest('.log-now-btn');

      // FIX: Warn if already logged this month — prevents accidental double-logging
      const now = new Date();
      if (sip.lastLogged) {
        const lastDate = new Date(sip.lastLogged);
        if (lastDate.getMonth() === now.getMonth() && lastDate.getFullYear() === now.getFullYear()) {
          const proceed = confirm(
            `"${sip.name}" was already logged on ${lastDate.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })} this month.\n\nLog again?`
          );
          if (!proceed) return;
        }
      }

      btn.innerText  = 'Logging…';
      btn.disabled   = true;

      try {
        await addDoc(collection(db, 'transactions'), {
          title:     sip.name,
          amount:    sip.amount,
          type:      'expense',   // Cash leaving liquid accounts
          date:      now.toISOString(),
          timestamp: now.getTime(),
          tags:      [sip.type === 'Investment' ? 'Investments' : sip.type],
          label:     'Auto-Logged'
        });

        // FIX: Persist last-logged timestamp so the warning can fire next time
        await updateDoc(doc(db, 'recurring', sip.id), { lastLogged: now.toISOString() });

        btn.innerText = '✓ Done';
        btn.className = btn.className.replace('purple', 'green');
      } catch (err) {
        console.error('Log failed:', err);
        btn.innerText = 'Log Now';
        btn.disabled  = false;
      }
      return;
    }

    // ── Edit ─────────────────────────────────────────────────────
    currentEditId = sip.id;
    document.getElementById('sipName').value   = sip.name;
    document.getElementById('sipAmount').value = sip.amount;
    document.getElementById('sipType').value   = sip.type;
    document.getElementById('sipDate').value   = sip.billingDate;

    document.getElementById('deleteSipBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveSipBtn');
    if (saveBtn) saveBtn.innerText = 'Update Template';
    ui.openSheet(document.getElementById('sipFormSheet'));
  });
}
