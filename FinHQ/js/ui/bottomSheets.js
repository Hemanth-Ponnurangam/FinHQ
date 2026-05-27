export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');
  
  // All active data entry forms
  const txnForm     = document.getElementById('txnFormSheet');
  const assetForm   = document.getElementById('assetFormSheet');
  const debtForm    = document.getElementById('debtFormSheet');
  const sipForm     = document.getElementById('sipFormSheet');
  const fuelForm    = document.getElementById('fuelFormSheet');
  const serviceForm = document.getElementById('serviceFormSheet');

  // Utility and advanced tool sheets
  const confirmSheet        = document.getElementById('confirmSheet');
  const strategySheet       = document.getElementById('strategySheet');
  const amortizationSheet   = document.getElementById('amortizationSheet');
  const cumulatedAmortSheet = document.getElementById('cumulatedAmortSheet');
  
  // Event sheets
  const eventCreateSheet    = document.getElementById('eventCreateSheet');
  const eventQuickAddSheet  = document.getElementById('eventQuickAddSheet');
  const txnReceiptSheet     = document.getElementById('txnReceiptSheet');

  // Register ALL sheets here
  const allSheets = [
    addMenu, txnForm, assetForm, debtForm, sipForm, confirmSheet,
    strategySheet, amortizationSheet, cumulatedAmortSheet, fuelForm,
    serviceForm, eventCreateSheet, eventQuickAddSheet, txnReceiptSheet,
  ].filter(Boolean);

  let currentConfirmCallback = null;
  let closeTimeout = null;

  function openSheet(sheetElement) {
    if (!sheetElement || !overlay) return;

    // 1. Cancel pending close operations
    if (closeTimeout) clearTimeout(closeTimeout);

    // 2. Hide all other sheets to prevent overlap
    allSheets.forEach(s => {
      if (s !== sheetElement) {
        s.classList.add('translate-y-full', 'hidden');
      }
    });

    // 3. Prepare target sheet and overlay
    sheetElement.classList.remove('hidden');
    overlay.classList.remove('hidden');

    // Reset starting position explicitly
    sheetElement.classList.add('translate-y-full');

    // 4. Force rigorous DOM reflow
    void sheetElement.offsetWidth;
    void overlay.offsetWidth;

    // 5. Trigger the animation cleanly in the next frame
    requestAnimationFrame(() => {
      overlay.classList.remove('opacity-0');
      sheetElement.classList.remove('translate-y-full');
      sheetElement.scrollTop = 0;
    });
  }

  function closeAll() {
    if (!overlay) return;

    overlay.classList.add('opacity-0');
    allSheets.forEach(s => s.classList.add('translate-y-full'));

    if (closeTimeout) clearTimeout(closeTimeout);

    closeTimeout = setTimeout(() => {
      overlay.classList.add('hidden');
      allSheets.forEach(s => s.classList.add('hidden'));
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
  
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeAll();
  });

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
