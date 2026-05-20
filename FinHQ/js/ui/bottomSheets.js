export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');
  const txnForm = document.getElementById('txnFormSheet');
  const assetForm = document.getElementById('assetFormSheet');
  const debtForm = document.getElementById('debtFormSheet');
  
  const allSheets = [addMenu, txnForm, assetForm, debtForm];

  // Make openSheet public
  function openSheet(sheetElement) {
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

  document.getElementById('fabBtn')?.addEventListener('click', () => openSheet(addMenu));
  
  // Custom Triggers: When opening an "Add" sheet, broadcast an event to reset the form data
  document.getElementById('showTxnFormBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetTxnForm')); openSheet(txnForm);
  });
  document.getElementById('showAssetFormBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetAssetForm')); openSheet(assetForm);
  });
  document.getElementById('showDebtFormBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetDebtForm')); openSheet(debtForm);
  });
  
  document.querySelectorAll('.closeSheetBtn').forEach(btn => btn.addEventListener('click', closeAll));
  document.querySelectorAll('.backToMenuBtn').forEach(btn => btn.addEventListener('click', () => openSheet(addMenu)));
  overlay?.addEventListener('click', closeAll);

  // Return the specific forms so feature files can command them to open
  return { closeAll, openSheet, txnForm, assetForm, debtForm };
}
