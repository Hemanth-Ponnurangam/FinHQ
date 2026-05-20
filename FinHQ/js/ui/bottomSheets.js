export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');
  const txnForm = document.getElementById('txnFormSheet');
  const assetForm = document.getElementById('assetFormSheet');
  
  const allSheets = [addMenu, txnForm, assetForm];

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

  // Bindings
  document.getElementById('fabBtn')?.addEventListener('click', () => openSheet(addMenu));
  document.getElementById('showTxnFormBtn')?.addEventListener('click', () => openSheet(txnForm));
  document.getElementById('showAssetFormBtn')?.addEventListener('click', () => openSheet(assetForm));
  
  document.querySelectorAll('.closeSheetBtn').forEach(btn => btn.addEventListener('click', closeAll));
  document.querySelectorAll('.backToMenuBtn').forEach(btn => btn.addEventListener('click', () => openSheet(addMenu)));
  overlay?.addEventListener('click', closeAll);

  return { closeAll };
}