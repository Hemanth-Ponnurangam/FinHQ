export function initUI() {
  const overlay = document.getElementById('bottomSheetOverlay');
  const addMenu = document.getElementById('addMenuSheet');
  
  // All active data entry forms
  const txnForm = document.getElementById('txnFormSheet');
  const assetForm = document.getElementById('assetFormSheet');
  const debtForm = document.getElementById('debtFormSheet');
  const sipForm = document.getElementById('sipFormSheet');
  const fuelForm = document.getElementById('fuelFormSheet');
  const serviceForm = document.getElementById('serviceFormSheet');
  // Utility and advanced tool sheets
  const confirmSheet = document.getElementById('confirmSheet'); 
  const strategySheet = document.getElementById('strategySheet'); 
  const amortizationSheet = document.getElementById('amortizationSheet'); 
  const cumulatedAmortSheet = document.getElementById('cumulatedAmortSheet'); 
  
  // Register ALL sheets here so closeAll() can dismiss them safely
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
    serviceForm
  ].filter(Boolean);
  
  let currentConfirmCallback = null;

  function openSheet(sheetElement) {
    if (!sheetElement || !overlay) return;
    
    // Hide all sheets first
    allSheets.forEach(s => s.classList.add('translate-y-full'));
    
    // Show requested sheet and overlay
    sheetElement.classList.remove('hidden');
    overlay.classList.remove('hidden');
    
    // Slight delay to allow CSS transitions to trigger smoothly
    setTimeout(() => {
      overlay.classList.remove('opacity-0');
      sheetElement.classList.remove('translate-y-full');
      sheetElement.scrollTop = 0; // always start at top of form
    }, 10);
  }

  function closeAll() {
    if (!overlay) return;
    
    overlay.classList.add('opacity-0');
    allSheets.forEach(s => s.classList.add('translate-y-full'));
    
    setTimeout(() => {
      overlay.classList.add('hidden');
      allSheets.forEach(s => s.classList.add('hidden'));
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

  // Confirm sheet action bindings
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

  // Expose elements and functions so feature files can control them
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
    serviceForm
  };
}
