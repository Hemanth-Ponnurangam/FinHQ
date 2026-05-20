import { initUI } from './ui/bottomSheets.js';
import { initLedger } from './features/ledger.js';
import { initWealth } from './features/wealth.js';
import { initDebt } from './features/debt.js'; // <-- ADD THIS
import { initDashboard } from './features/dashboard.js';

console.log("FinHQ Modular Engine Booting...");

const views = {
  hub: document.getElementById('hubView'),
  ledger: document.getElementById('ledgerView'),
  wealth: document.getElementById('wealthView'),
  debt: document.getElementById('debtView') // <-- ADD THIS
};

function navigateTo(viewName) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
}

document.getElementById('openLedgerBtn')?.addEventListener('click', () => navigateTo('ledger'));
document.getElementById('openWealthBtn')?.addEventListener('click', () => navigateTo('wealth'));
document.getElementById('openDebtBtn')?.addEventListener('click', () => navigateTo('debt')); // <-- ADD THIS
document.querySelectorAll('.backToHubBtn').forEach(btn => btn.addEventListener('click', () => navigateTo('hub')));

const uiController = initUI();
initLedger(uiController);
initWealth(uiController);
initDebt(uiController); // <-- ADD THIS
initDashboard();
