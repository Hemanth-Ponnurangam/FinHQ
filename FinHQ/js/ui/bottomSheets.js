export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');

  const txnForm            = document.getElementById('txnFormSheet');
  const assetForm          = document.getElementById('assetFormSheet');
  const debtForm           = document.getElementById('debtFormSheet');
  const sipForm            = document.getElementById('sipFormSheet');
  const fuelForm           = document.getElementById('fuelFormSheet');
  const serviceForm        = document.getElementById('serviceFormSheet');
  const confirmSheet       = document.getElementById('confirmSheet');
  const strategySheet      = document.getElementById('strategySheet');
  const amortizationSheet  = document.getElementById('amortizationSheet');
  const cumulatedAmortSheet = document.getElementById('cumulatedAmortSheet');
  const eventCreateSheet   = document.getElementById('eventCreateSheet');
  const eventQuickAddSheet = document.getElementById('eventQuickAddSheet');
  const txnReceiptSheet    = document.getElementById('txnReceiptSheet');

  const allSheets = [
    addMenu, txnForm, assetForm, debtForm, sipForm,
    confirmSheet, strategySheet, amortizationSheet, cumulatedAmortSheet,
    fuelForm, serviceForm, eventCreateSheet, eventQuickAddSheet, txnReceiptSheet,
  ].filter(Boolean);

  let currentConfirmCallback = null;

  // ── Core: hide everything immediately, no transitions, no timers ──────────
  function _hideAll() {
    if (overlay) {
      overlay.classList.add('hidden', 'opacity-0');
    }
    allSheets.forEach(s => {
      s.classList.add('hidden', 'translate-y-full');
    });
  }

  // ── openSheet: show overlay + target sheet, animate only translate ─────────
  function openSheet(sheetElement) {
    if (!sheetElement) return;

    // 1. Hide everything first — clean slate, no races
    _hideAll();

    // 2. Show overlay (opaque immediately — no fade-in that can be interrupted)
    if (overlay) {
      overlay.classList.remove('hidden', 'opacity-0');
    }

    // 3. Position the sheet off-screen but visible so transition can fire
    sheetElement.classList.remove('hidden');
    sheetElement.classList.add('translate-y-full');
    sheetElement.scrollTop = 0;

    // 4. Reading offsetHeight forces the browser to flush pending style changes
    //    and commit translate-y-full to the render tree BEFORE we remove it.
    //    This is the only cross-browser-reliable way to trigger a CSS transition
    //    on an element that just became un-hidden. rAF alone is not enough on
    //    mobile Safari / Android Chrome.
    // eslint-disable-next-line no-unused-expressions
    void sheetElement.offsetHeight;
    sheetElement.classList.remove('translate-y-full');
  }

  // ── closeAll: hide everything, dispatch event ─────────────────────────────
  function closeAll() {
    _hideAll();
    document.dispatchEvent(new Event('sheetClosed'));
  }

  // ── showConfirm ───────────────────────────────────────────────────────────
  function showConfirm(title, message, callback) {
    const t = document.getElementById('confirmTitle');
    const m = document.getElementById('confirmMessage');
    if (t) t.innerText = title;
    if (m) m.innerText = message;
    currentConfirmCallback = callback;
    openSheet(confirmSheet);
  }

  // ── Button bindings ───────────────────────────────────────────────────────
  document.getElementById('showTxnFormBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetTxnForm'));
    openSheet(txnForm);
  });
  document.getElementById('showAssetFormBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetAssetForm'));
    openSheet(assetForm);
  });
  document.getElementById('showDebtFormBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetDebtForm'));
    openSheet(debtForm);
  });
  document.getElementById('showSipFormBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetSipForm'));
    openSheet(sipForm);
  });
  document.getElementById('showFuelFormBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetFuelForm'));
    openSheet(fuelForm);
  });

  document.getElementById('cancelConfirmBtn')?.addEventListener('click', closeAll);
  document.getElementById('executeConfirmBtn')?.addEventListener('click', () => {
    if (currentConfirmCallback) currentConfirmCallback();
    closeAll();
  });

  document.getElementById('fabBtn')?.addEventListener('click', () => openSheet(addMenu));
  document.querySelectorAll('.closeSheetBtn').forEach(btn => btn.addEventListener('click', closeAll));
  document.querySelectorAll('.backToMenuBtn').forEach(btn => btn.addEventListener('click', () => openSheet(addMenu)));
  if (overlay) overlay.addEventListener('click', closeAll);

  return {
    closeAll,
    openSheet,
    showConfirm,
    txnForm,
    assetForm,
    debtForm,
    sipForm,
    strategySheet,
    amortizationSheet,
    cumulatedAmortSheet,
    fuelForm,
    serviceForm,
    eventCreateSheet,
    eventQuickAddSheet,
    txnReceiptSheet,
  };
}
