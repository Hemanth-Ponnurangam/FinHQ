import { initUI } from './ui/bottomSheets.js';
import { initLedger } from './features/ledger.js';
import { initWealth } from './features/wealth.js';
import { initDebt } from './features/debt.js';
import { initDashboard } from './features/dashboard.js';
import { initAnalytics } from './features/analytics.js';
import { initPlanner } from './features/planner.js'; // NEW

console.log("FinHQ v4: Planner Engine Booting...");

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

function navigateTo(viewName) {
  Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });
  if (views[viewName]) views[viewName].classList.remove('hidden');
}

document.getElementById('openLedgerBtn')?.addEventListener('click', () => navigateTo('ledger'));
document.getElementById('openWealthBtn')?.addEventListener('click', () => navigateTo('wealth'));
document.getElementById('openDebtBtn')?.addEventListener('click', () => navigateTo('debt'));
document.getElementById('openAnalyticsBtn')?.addEventListener('click', () => navigateTo('analytics'));
document.getElementById('openPlannerBtn')?.addEventListener('click', () => navigateTo('planner'));
document.getElementById('openSipBtn')?.addEventListener('click', () => navigateTo('sip'));
document.getElementById('openExportBtn')?.addEventListener('click', () => navigateTo('export'));

document.querySelectorAll('.backToHubBtn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo('hub'));
});

const uiController = initUI();
initLedger(uiController);
initWealth(uiController);
initDebt(uiController);
initDashboard();
initAnalytics();
initPlanner(uiController);
