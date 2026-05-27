export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');
  
  const txnForm    = document.getElementById('txnFormSheet');
  const assetForm  = document.getElementById('assetFormSheet');
  const debtForm   = document.getElementById('debtFormSheet');
  const sipForm    = document.getElementById('sipFormSheet');
  const fuelForm   = document.getElementById('fuelFormSheet');
  const serviceForm = document.getElementById('serviceFormSheet');

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
  let _closeTimer = null;

  function openSheet(sheetElement) {
    if (!sheetElement || !overlay) return;

    // Cancel any pending closeAll timer — prevents it re-hiding this sheet
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }

    allSheets.forEach(s => s.classList.add('translate-y-full'));

    sheetElement.classList.remove('hidden');
    overlay.classList.remove('hidden');

    setTimeout(() => {
      overlay.classList.remove('opacity-0');
      sheetElement.classList.remove('translate-y-full');
      sheetElement.scrollTop = 0;
    }, 10);
  }

  function closeAll() {
    if (!overlay) return;

    overlay.classList.add('opacity-0');
    allSheets.forEach(s => s.classList.add('translate-y-full'));

    _closeTimer = setTimeout(() => {
      _closeTimer = null;
      overlay.classList.add('hidden');
      allSheets.forEach(s => s.classList.add('hidden'));
      document.dispatchEvent(new Event('sheetClosed'));
    }, 300);
  }

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

  document.getElementById('fabBtn')?.addEventListener('click', () => openSheet(addMenu));
  document.querySelectorAll('.closeSheetBtn').forEach(btn => btn.addEventListener('click', closeAll));
  document.querySelectorAll('.backToMenuBtn').forEach(btn => btn.addEventListener('click', () => openSheet(addMenu)));
  overlay?.addEventListener('click', closeAll);

  return {
    closeAll, openSheet, showConfirm,
    txnForm, assetForm, debtForm, sipForm,
    strategySheet, amortizationSheet, cumulatedAmortSheet,
    fuelForm, serviceForm, eventCreateSheet, eventQuickAddSheet, txnReceiptSheet,
  };
}
