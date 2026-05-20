import { initUI } from './ui/bottomSheets.js';
import { initLedger } from './features/ledger.js';
import { initWealth } from './features/wealth.js';
import { initDebt } from './features/debt.js';
import { initDashboard } from './features/dashboard.js';
import { initAnalytics } from './features/analytics.js'; // NEW!

console.log("FinHQ v3: Institutional Engine Booting...");

// ==========================================
// 1. SCREEN ROUTING
// ==========================================
const views = {
  hub: document.getElementById('hubView'),
  ledger: document.getElementById('ledgerView'),
  wealth: document.getElementById('wealthView'),
  debt: document.getElementById('debtView'),
  analytics: document.getElementById('analyticsView') // NEW!
};

function navigateTo(viewName) {
  Object.values(views).forEach(v => {
    if (v) v.classList.add('hidden');
  });
  if (views[viewName]) views[viewName].classList.remove('hidden');
}

// Bind Hub Buttons
document.getElementById('openLedgerBtn')?.addEventListener('click', () => navigateTo('ledger'));
document.getElementById('openWealthBtn')?.addEventListener('click', () => navigateTo('wealth'));
document.getElementById('openDebtBtn')?.addEventListener('click', () => navigateTo('debt'));
document.getElementById('openAnalyticsBtn')?.addEventListener('click', () => navigateTo('analytics')); // NEW!

// Bind all Back Buttons dynamically
document.querySelectorAll('.backToHubBtn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo('hub'));
});

// ==========================================
// 2. BOOT SEQUENCE
// ==========================================
const uiController = initUI();
initLedger(uiController);
initWealth(uiController);
initDebt(uiController);
initDashboard();
initAnalytics(); // Fire up the Chart.js engine!
