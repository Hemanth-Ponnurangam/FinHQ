import { initUI } from './ui/bottomSheets.js';
import { initGlobalListeners } from './firebase.js';
import { initDashboard } from './features/dashboard.js';
import { initLedger } from './features/ledger.js';
import { initWealth } from './features/wealth.js';
import { initDebt } from './features/debt.js';
import { initAnalytics } from './features/analytics.js';
import { initPlanner } from './features/planner.js';
import { initSip } from './features/sip.js';
import { initExport } from './features/export.js';
import { initCommute } from './features/commute.js'; // NEW
import { initSandbox } from './features/sandbox.js'; // NEW

console.log("FinHQ v5: Global Store Engine Booting...");

const views = {
  hub: document.getElementById('hubView'),
  ledger: document.getElementById('ledgerView'),
  wealth: document.getElementById('wealthView'),
  debt: document.getElementById('debtView'),
  analytics: document.getElementById('analyticsView'),
  planner: document.getElementById('plannerView'),
  sip: document.getElementById('sipView'),
  export: document.getElementById('exportView'),
  vehicle: document.getElementById('vehicleView'),
  sandbox: document.getElementById('sandboxView')
};




function navigateTo(viewName) {
  Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });
  if (views[viewName]) {
    views[viewName].classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

document.getElementById('openLedgerBtn')?.addEventListener('click', () => navigateTo('ledger'));
document.getElementById('openWealthBtn')?.addEventListener('click', () => navigateTo('wealth'));
document.getElementById('openDebtBtn')?.addEventListener('click', () => navigateTo('debt'));
document.getElementById('openAnalyticsBtn')?.addEventListener('click', () => navigateTo('analytics'));
document.getElementById('openPlannerBtn')?.addEventListener('click', () => navigateTo('planner'));
document.getElementById('openSipBtn')?.addEventListener('click', () => navigateTo('sip'));
document.getElementById('openExportBtn')?.addEventListener('click', () => navigateTo('export'));
document.getElementById('openVehicleBtn')?.addEventListener('click', () => navigateTo('vehicle'));
document.getElementById('openSandboxBtn')?.addEventListener('click', () => navigateTo('sandbox'));

document.querySelectorAll('.backToHubBtn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo('hub'));
});

// Boot Sequence
initGlobalListeners(); // Pumps data into the store
const uiController = initUI();

// Features now subscribe to the store internally
initDashboard();
initLedger(uiController);
initWealth(uiController);
initDebt(uiController);
initAnalytics();
initPlanner(uiController);
initSip(uiController);
initExport();
initCommute(uiController);
initSandbox();








