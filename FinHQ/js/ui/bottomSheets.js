export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');
  
  // All active data entry forms
  const txnForm    = document.getElementById('txnFormSheet');
  const assetForm  = document.getElementById('assetFormSheet');
  const debtForm   = document.getElementById('debtFormSheet');
  const sipForm    = document.getElementById('sipFormSheet');
  const fuelForm   = document.getElementById('fuelFormSheet');
  const serviceForm = document.getElementById('serviceFormSheet');

  // Utility and advanced tool sheets
  const confirmSheet       = document.getElementById('confirmSheet');
  const strategySheet      = document.getElementById('strategySheet');
  const amortizationSheet  = document.getElementById('amortizationSheet');
  const cumulatedAmortSheet = document.getElementById('cumulatedAmortSheet');

  // FIX 2: Event sheets were missing — closeAll() couldn't dismiss them,
  // and openSheet() didn't push them off-screen before opening another sheet.
  // Adding them here makes the whole system consistent.
  const eventCreateSheet   = document.getElementById('eventCreateSheet');
  const eventQuickAddSheet = document.getElementById('eventQuickAddSheet');
  const txnReceiptSheet    = document.getElementById('txnReceiptSheet');

  // Register ALL sheets here so closeAll() and openSheet() work for every sheet.
  const allSheets = [
    addMenu,
    txnForm,
    assetForm,
    debtForm,
    sipForm,
    confirmSheet,
    strategySheet,
    amortizationSheet,
    cumulatedAmortSheet,
    fuelForm,
    serviceForm,
    eventCreateSheet,
    eventQuickAddSheet,
    txnReceiptSheet,
  ].filter(Boolean);

  let currentConfirmCallback = null;

  let closeTimer = null;

  function openSheet(sheetElement) {
    if (!sheetElement || !overlay) return;

    // Cancel any pending closeAll timeout so it can't re-hide this sheet
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

    // Slide every OTHER sheet off-screen. Do NOT touch sheetElement here —
    // adding translate-y-full to it and then removing it 10ms later races
    // with the CSS transition and can leave it stuck off-screen (blank overlay bug).
    allSheets.forEach(s => {
      if (s !== sheetElement) {
        s.classList.add('translate-y-full');
        s.classList.add('hidden');
      }
    });

    // Reset overlay opacity synchronously before un-hiding it, so we never
    // show a semi-transparent screen with nothing behind it.
    overlay.classList.add('opacity-0');
    overlay.classList.remove('hidden');

    // Ensure the sheet starts off-screen (in case it was left mid-animation)
    sheetElement.classList.add('translate-y-full');
    sheetElement.classList.remove('hidden');

    // Single rAF + minimal delay: guarantees the browser has committed the
    // translate-y-full paint before we begin the slide-up transition.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        sheetElement.classList.remove('translate-y-full');
        sheetElement.scrollTop = 0;
      });
    });
  }

  function closeAll() {
    if (!overlay) return;

    overlay.classList.add('opacity-0');
    allSheets.forEach(s => s.classList.add('translate-y-full'));

    closeTimer = setTimeout(() => {
      closeTimer = null;
      overlay.classList.add('hidden');
      allSheets.forEach(s => s.classList.add('hidden'));

      // FIX 3: Dispatch sheetClosed so modules (e.g. commute.js) can re-enable
      // UI controls that were disabled while a sheet was open.
      // Previously this event was never fired, causing the fuel/service log-type
      // toggle to stay permanently disabled after the first edit.
      document.dispatchEvent(new Event('sheetClosed'));
    }, 300);
  }

  // --- BIND ADD MENU BUTTONS ---

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

  // --- CUSTOM CONFIRM DIALOG ---
  function showConfirm(title, message, callback) {
    const t = document.getElementById('confirmTitle');
    const m = document.getElementById('confirmMessage');
    if (t) t.innerText = title;
    if (m) m.innerText = message;
    currentConfirmCallback = callback;
    openSheet(confirmSheet);
  }

  document.getElementById('cancelConfirmBtn')?.addEventListener('click', closeAll);
  document.getElementById('executeConfirmBtn')?.addEventListener('click', () => {
    if (currentConfirmCallback) currentConfirmCallback();
    closeAll();
  });

  // --- GLOBAL UI BINDINGS ---
  document.getElementById('fabBtn')?.addEventListener('click', () => openSheet(addMenu));
  document.querySelectorAll('.closeSheetBtn').forEach(btn => btn.addEventListener('click', closeAll));
  document.querySelectorAll('.backToMenuBtn').forEach(btn => btn.addEventListener('click', () => openSheet(addMenu)));
  overlay?.addEventListener('click', closeAll);

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
