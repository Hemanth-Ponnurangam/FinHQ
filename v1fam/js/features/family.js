import { db, auth }       from '../firebase.js';
import { store }           from '../store.js';
import {
  doc, getDoc, setDoc, updateDoc,
  collection, getDocs, onSnapshot, query
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── XSS helper ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Currency formatter ────────────────────────────────────────────────────────
function fmt(n) {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

// ── Module state ──────────────────────────────────────────────────────────────
let _familyId   = null;   // Firestore families/{familyId} document ID
let _memberUnsub = null;  // active onSnapshot listener for members

// ── Family ID management ──────────────────────────────────────────────────────
// Each user has a 'profile' doc at users/{uid}/profile/main.
// It stores { familyId } if they belong to a family.
// The families/{familyId} collection stores one doc per member with their
// aggregated snapshot (not raw data — privacy is preserved).

async function getUserFamilyId() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid, 'profile', 'main'));
  return snap.exists() ? (snap.data().familyId || null) : null;
}

async function ensureFamilyId() {
  // If the user doesn't have a family yet, create one with their UID as the
  // family ID — simple, stable, and no collision risk for small family groups.
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  let fid = await getUserFamilyId();
  if (!fid) {
    fid = `fam_${uid}`;
    await setDoc(doc(db, 'users', uid, 'profile', 'main'), { familyId: fid }, { merge: true });
  }
  return fid;
}

// ── Snapshot: write this user's aggregated totals to the family document ──────
// Only aggregates are written — never raw transaction data.
// Other family members can read this snapshot to compute the family total.
async function pushMySnapshot(familyId) {
  const uid  = auth.currentUser?.uid;
  if (!uid || !familyId) return;

  const txns    = store.transactions || [];
  const assets  = store.assets       || [];
  const debts   = store.debts        || [];

  const liquid  = store.getLiquidCash(txns);
  const portVal = assets.reduce((s, a) => s + (a.qty ?? 1) * (a.currentPrice ?? a.buyPrice ?? 0), 0);
  const debtAmt = debts.reduce((s, d) => s + Math.max(0, (d.principal || 0) - (d.paid || 0)), 0);
  const netWorth = liquid + portVal - debtAmt;

  const name = auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown';

  await setDoc(
    doc(db, 'families', familyId, 'members', uid),
    { uid, name, liquid, portVal, debtAmt, netWorth, updatedAt: Date.now() },
    { merge: true }
  );
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderMembers(members) {
  const list = document.getElementById('familyMemberList');
  if (!list) return;

  let totalNW     = 0;
  let totalAssets = 0;
  let totalDebts  = 0;
  let totalLiquid = 0;

  members.forEach(m => {
    totalNW     += m.netWorth || 0;
    totalAssets += (m.portVal || 0);
    totalDebts  += (m.debtAmt || 0);
    totalLiquid += (m.liquid  || 0);
  });

  // Update aggregate cards
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const nwColor = totalNW >= 0 ? 'text-gold' : 'text-red-400';
  const nwEl = document.getElementById('familyTotalNW');
  if (nwEl) { nwEl.textContent = fmt(totalNW); nwEl.className = `font-display text-4xl font-semibold tracking-tight ${nwColor}`; }
  setEl('familyTotalAssets', fmt(totalAssets));
  setEl('familyTotalDebts',  fmt(totalDebts));
  setEl('familyTotalLiquid', fmt(totalLiquid));

  if (!members.length) {
    list.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-gray-600">
        <p class="text-sm text-gray-400">No members yet.</p>
        <p class="text-xs text-gray-300 mt-1">Invite family members using the button above.</p>
      </div>`;
    return;
  }

  const myUid = auth.currentUser?.uid;
  list.innerHTML = members.map(m => {
    const isMe  = m.uid === myUid;
    const nwCls = (m.netWorth || 0) >= 0 ? 'text-forest-700 dark:text-green-400' : 'text-red-500';
    const updated = m.updatedAt
      ? new Date(m.updatedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
      : '—';
    return `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-pink-50 dark:bg-gray-700 flex items-center justify-center">
              <span class="text-xs font-bold text-pink-500">${escHtml(m.name.charAt(0).toUpperCase())}</span>
            </div>
            <div>
              <p class="text-sm font-bold dark:text-white">${escHtml(m.name)}${isMe ? ' <span class="text-[9px] text-forest-400 font-normal">you</span>' : ''}</p>
              <p class="text-[9px] text-gray-400">Updated ${escHtml(updated)}</p>
            </div>
          </div>
          <p class="font-bold text-base ${nwCls}">${fmt(m.netWorth || 0)}</p>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-50 dark:border-gray-700">
          <div class="text-center">
            <p class="text-[9px] text-gray-400 uppercase tracking-wide">Liquid</p>
            <p class="text-xs font-semibold text-blue-500">${fmt(m.liquid || 0)}</p>
          </div>
          <div class="text-center">
            <p class="text-[9px] text-gray-400 uppercase tracking-wide">Portfolio</p>
            <p class="text-xs font-semibold text-forest-600 dark:text-green-400">${fmt(m.portVal || 0)}</p>
          </div>
          <div class="text-center">
            <p class="text-[9px] text-gray-400 uppercase tracking-wide">Debt</p>
            <p class="text-xs font-semibold text-red-400">${fmt(m.debtAmt || 0)}</p>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Invite / join panel ───────────────────────────────────────────────────────
function initInvitePanel(familyId) {
  const idDisplay = document.getElementById('familyIdDisplay');
  if (idDisplay) idDisplay.textContent = familyId;

  document.getElementById('familyCopyIdBtn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(familyId).catch(() => {});
    const btn = document.getElementById('familyCopyIdBtn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
  });

  document.getElementById('familyJoinBtn')?.addEventListener('click', async () => {
    const input  = document.getElementById('familyJoinInput');
    const errEl  = document.getElementById('familyJoinError');
    const joinId = input?.value.trim();
    if (!joinId) { if (errEl) { errEl.textContent = 'Please enter a Family ID.'; errEl.classList.remove('hidden'); } return; }

    // Validate: check the families/{joinId} collection exists
    const joinBtn = document.getElementById('familyJoinBtn');
    if (joinBtn) { joinBtn.disabled = true; joinBtn.textContent = 'Joining…'; }
    try {
      const uid  = auth.currentUser?.uid;
      const name = auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown';
      // Write this user into the target family
      await setDoc(doc(db, 'families', joinId, 'members', uid), {
        uid, name, liquid: 0, portVal: 0, debtAmt: 0, netWorth: 0, updatedAt: Date.now()
      });
      // Update our own profile to point to the new family
      await setDoc(doc(db, 'users', uid, 'profile', 'main'), { familyId: joinId }, { merge: true });
      // Re-init with the new family
      if (errEl) errEl.classList.add('hidden');
      if (idDisplay) idDisplay.textContent = joinId;
      _familyId = joinId;
      openMemberStream(joinId);
      pushMySnapshot(joinId);
    } catch (err) {
      console.error('Join failed:', err);
      if (errEl) { errEl.textContent = 'Could not join — check the ID and try again.'; errEl.classList.remove('hidden'); }
    } finally {
      if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = 'Join'; }
    }
  });
}

// ── Real-time member stream ───────────────────────────────────────────────────
function openMemberStream(familyId) {
  if (_memberUnsub) { _memberUnsub(); _memberUnsub = null; }
  const q = query(collection(db, 'families', familyId, 'members'));
  _memberUnsub = onSnapshot(q, snap => {
    renderMembers(snap.docs.map(d => d.data()));
  }, err => console.error('Family stream error:', err));
}

// ── Store subscription: re-push snapshot whenever store changes ───────────────
let _storeUnsub = null;

// ── Module init ───────────────────────────────────────────────────────────────
export function initFamily() {
  // Invite panel toggle
  document.getElementById('familyInviteBtn')?.addEventListener('click', () => {
    document.getElementById('familyInvitePanel')?.classList.toggle('hidden');
  });

  // Boot: resolve the user's family, open the live stream
  ensureFamilyId().then(familyId => {
    if (!familyId) return;
    _familyId = familyId;
    initInvitePanel(familyId);
    openMemberStream(familyId);

    // Push an initial snapshot using current store data
    if (store.isLoaded) pushMySnapshot(familyId);

    // Re-push whenever the store changes (transactions, assets, debts)
    if (_storeUnsub) _storeUnsub();
    _storeUnsub = store.subscribe(state => {
      if (state.isLoaded && _familyId) pushMySnapshot(_familyId);
    }, ['transactions', 'assets', 'debts']);
  }).catch(err => {
    console.error('Family init failed:', err);
    const list = document.getElementById('familyMemberList');
    if (list) list.innerHTML = `
      <div class="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 text-center text-xs text-red-500">
        Could not load family data. Check your connection.
      </div>`;
  });
}
