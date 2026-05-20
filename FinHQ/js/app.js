import { initUI } from './ui/bottomSheets.js';
import { initLedger } from './features/ledger.js';
import { initWealth } from './features/wealth.js';
import { initDashboard } from './features/dashboard.js';

console.log("FinHQ Modular Engine Booting...");

// 1. Navigation Routing
const views = {
  hub: document.getElementById('hubView'),
  ledger: document.getElementById('ledgerView'),
  wealth: document.getElementById('wealthView')
};

function navigateTo(viewName) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
}

document.getElementById('openLedgerBtn')?.addEventListener('click', () => navigateTo('ledger'));
document.getElementById('openWealthBtn')?.addEventListener('click', () => navigateTo('wealth'));
document.querySelectorAll('.backToHubBtn').forEach(btn => btn.addEventListener('click', () => navigateTo('hub')));

// 2. Boot Features
const uiController = initUI();
initLedger(uiController);
initWealth(uiController);
initDashboard();
