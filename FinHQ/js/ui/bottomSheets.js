export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');

  const txnForm             = document.getElementById('txnFormSheet');
  const assetForm           = document.getElementById('assetFormSheet');
  const debtForm            = document.getElementById('debtFormSheet');
  const sipForm             = document.getElementById('sipFormSheet');
  const fuelForm            = document.getElementById('fuelFormSheet');
  const serviceForm         = document.getElementById('serviceFormSheet');
  const confirmSheet        = document.getElementById('confirmSheet');
  const strategySheet       = document.getElementById('strategySheet');
  const amortizationSheet   = document.getElementById('amortizationSheet');
  const cumulatedAmortSheet = document.getElementById('cumulatedAmortSheet');
  const eventCreateSheet    = document.getElementById('eventCreateSheet');
  const eventQuickAddSheet  = document.getElementById('eventQuickAddSheet');
  const txnReceiptSheet     = document.getElementById('txnReceiptSheet');

  const allSheets = [
    addMenu, txnForm, assetForm, debtForm, sipForm,
    confirmSheet, strategySheet, amortizationSheet, cumulatedAmortSheet,
    fuelForm, serviceForm, eventCreateSheet, eventQuickAddSheet, txnReceiptSheet,
  ].filter(Boolean);

  let currentConfirmCallback = null;

  function openSheet(sheetEl) {
    if (!sheetEl) return;

    // Hide ALL other sheets instantly
    allSheets.forEach(s => {
      if (s !== sheetEl) {
        s.style.display = 'none';
      }
    });

    // Show overlay instantly
    if (overlay) {
      overlay.style.display = 'block';
    }

    // Move sheet off-screen, make it visible, then slide up
    sheetEl.style.transition = 'none';
    sheetEl.style.transform  = 'translateY(100%)';
    sheetEl.style.display    = 'flex';
    sheetEl.style.flexDirection = 'column';
    sheetEl.scrollTop = 0;

    // Force layout then animate
    void sheetEl.offsetHeight;

    sheetEl.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
    sheetEl.style.transform  = 'translateY(0)';
  }

  function closeAll() {
    if (overlay) overlay.style.display = 'none';
    allSheets.forEach(s => {
      s.style.transition = 'none';
      s.style.transform  = 'translateY(100%)';
      s.style.display    = 'none';
    });
    document.dispatchEvent(new Event('sheetClosed'));
  }

  function showConfirm(title, message, callback) {
    const t = document.getElementById('confirmTitle');
    const m = document.getElementById('confirmMessage');
    if (t) t.innerText = title;
    if (m) m.innerText = message;
    currentConfirmCallback = callback;
    openSheet(confirmSheet);
  }

  // Button bindings
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

  // Close / back buttons — re-bind using inline styles too
  document.querySelectorAll('.closeSheetBtn').forEach(btn =>
    btn.addEventListener('click', closeAll)
  );
  document.querySelectorAll('.backToMenuBtn').forEach(btn =>
    btn.addEventListener('click', () => openSheet(addMenu))
  );

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
