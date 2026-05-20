export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');
  const txnForm = document.getElementById('txnFormSheet');
  const assetForm = document.getElementById('assetFormSheet');
  const debtForm = document.getElementById('debtFormSheet');
  const confirmSheet = document.getElementById('confirmSheet'); 
  
  const allSheets = [addMenu, txnForm, assetForm, debtForm, confirmSheet];
  let currentConfirmCallback = null;

  function openSheet(sheetElement) {
    if (!sheetElement) return;
    allSheets.forEach(s => s.classList.add('translate-y-full'));
    sheetElement.classList.remove('hidden');
    overlay.classList.remove('hidden');
    setTimeout(() => {
      overlay.classList.remove('opacity-0');
      sheetElement.classList.remove('translate-y-full');
    }, 10);
  }

  function closeAll() {
    overlay.classList.add('opacity-0');
    allSheets.forEach(s => s.classList.add('translate-y-full'));
    setTimeout(() => {
      overlay.classList.add('hidden');
      allSheets.forEach(s => s.classList.add('hidden'));
    }, 300);
  }

  // --- RESTORED: Add Menu Button Bindings ---
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

  // Native Confirm Dialog Logic
  function showConfirm(title, message, callback) {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
    currentConfirmCallback = callback;
    openSheet(confirmSheet);
  }

  // Global UI Bindings
  document.getElementById('cancelConfirmBtn')?.addEventListener('click', closeAll);
  document.getElementById('executeConfirmBtn')?.addEventListener('click', () => {
    if (currentConfirmCallback) currentConfirmCallback();
    closeAll();
  });

  document.getElementById('fabBtn')?.addEventListener('click', () => openSheet(addMenu));
  document.querySelectorAll('.closeSheetBtn').forEach(btn => btn.addEventListener('click', closeAll));
  document.querySelectorAll('.backToMenuBtn').forEach(btn => btn.addEventListener('click', () => openSheet(addMenu)));
  overlay?.addEventListener('click', closeAll);

  return { closeAll, openSheet, showConfirm, txnForm, assetForm, debtForm };
}



