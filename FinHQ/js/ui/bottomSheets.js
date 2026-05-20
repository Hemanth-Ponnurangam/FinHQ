export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');
  const txnForm = document.getElementById('txnFormSheet');
  const assetForm = document.getElementById('assetFormSheet');
  const debtForm = document.getElementById('debtFormSheet');
  const confirmSheet = document.getElementById('confirmSheet'); // NEW
  
  const allSheets = [addMenu, txnForm, assetForm, debtForm, confirmSheet];
  let currentConfirmCallback = null;

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

  // CUSTOM CONFIRM MODAL
  function showConfirm(title, message, callback) {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
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
  overlay?.addEventListener('click', closeAll);

  return { closeAll, openSheet, showConfirm, txnForm, assetForm, debtForm };
}
