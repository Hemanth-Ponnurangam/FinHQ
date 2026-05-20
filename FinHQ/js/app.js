import { initUI } from './ui/bottomSheets.js';
import { initLedger } from './features/ledger.js';
import { initWealth } from './features/wealth.js';
import { initDebt } from './features/debt.js';
import { initDashboard } from './features/dashboard.js';
import { initAnalytics } from './features/analytics.js';
import { initPlanner } from './features/planner.js';
import { initSip } from './features/sip.js';
import { initExport } from './features/export.js';

console.log("FinHQ v4: Full Engine Booting...");

// 1. Register all DOM Views
const views = {
  hub: document.getElementById('hubView'),
  ledger: document.getElementById('ledgerView'),
  wealth: document.getElementById('wealthView'),
  debt: document.getElementById('debtView'),
  analytics: document.getElementById('analyticsView'),
  planner: document.getElementById('plannerView'),
  sip: document.getElementById('sipView'),
  export: document.getElementById('exportView')
};

// 2. Navigation Logic
function navigateTo(viewName) {
  // Hide all views safely
  Object.values(views).forEach(v => { 
    if (v) v.classList.add('hidden'); 
  });
  
  // Show target view and reset scroll to top for mobile UX
  if (views[viewName]) {
    views[viewName].classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// 3. Bind Hub Menu Buttons
document.getElementById('openLedgerBtn')?.addEventListener('click', () => navigateTo('ledger'));
document.getElementById('openWealthBtn')?.addEventListener('click', () => navigateTo('wealth'));
document.getElementById('openDebtBtn')?.addEventListener('click', () => navigateTo('debt'));
document.getElementById('openAnalyticsBtn')?.addEventListener('click', () => navigateTo('analytics'));
document.getElementById('openPlannerBtn')?.addEventListener('click', () => navigateTo('planner'));
document.getElementById('openSipBtn')?.addEventListener('click', () => navigateTo('sip'));
document.getElementById('openExportBtn')?.addEventListener('click', () => navigateTo('export'));

// 4. Bind all "Back to Hub" Buttons dynamically
document.querySelectorAll('.backToHubBtn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo('hub'));
});

// 5. Boot Sequence
const uiController = initUI();
initLedger(uiController);
initWealth(uiController);
initDebt(uiController);
initDashboard();
initAnalytics();
initPlanner(uiController);
initSip(uiController);
initExport();
