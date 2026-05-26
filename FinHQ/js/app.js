import { initUI } from './ui/bottomSheets.js';
import { initGlobalListeners } from './firebase.js';
import { initDashboard } from './features/dashboard.js';
import { initLedger } from './features/ledger.js';
import { initWealth } from './features/wealth.js';
import { initDebt } from './features/debt.js';
import { initAnalytics } from './features/analytics.js';
import { initSip } from './features/sip.js';
import { initExport } from './features/export.js';
import { initCommute } from './features/commute.js';
import { initCalendar } from './features/calendar.js';
import { initEMI } from './features/emi.js';

console.log("FinHQ v6: Calendar Build Booting…");

// ── Dark Mode Toggle ──────────────────────────────────────────────
const darkToggle = document.getElementById('darkModeToggle');
const moonIcon   = document.getElementById('moonIcon');
const sunIcon    = document.getElementById('sunIcon');

function applyDark(isDark) {
  if (isDark) {
    document.documentElement.classList.replace('light', 'dark');
    moonIcon?.classList.add('opacity-0');
    sunIcon?.classList.remove('opacity-0');
  } else {
    document.documentElement.classList.replace('dark', 'light');
    moonIcon?.classList.remove('opacity-0');
    sunIcon?.classList.add('opacity-0');
  }
}

applyDark(localStorage.getItem('darkMode') === 'true');

darkToggle?.addEventListener('click', () => {
  const isDark = document.documentElement.classList.contains('dark');
  applyDark(!isDark);
  localStorage.setItem('darkMode', String(!isDark));
});

// ── Navigation ────────────────────────────────────────────────────
const views = {
  hub:       document.getElementById('hubView'),
  ledger:    document.getElementById('ledgerView'),
  wealth:    document.getElementById('wealthView'),
  debt:      document.getElementById('debtView'),
  analytics: document.getElementById('analyticsView'),
  sip:       document.getElementById('sipView'),
  export:    document.getElementById('exportView'),
  calendar:  document.getElementById('calendarView'),
  emi:       document.getElementById('emiView'),
  vehicle:   document.getElementById('vehicleView'),
};

function navigateTo(viewName) {
  Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });
  if (views[viewName]) {
    views[viewName].classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

document.getElementById('openLedgerBtn')?.addEventListener('click',    () => navigateTo('ledger'));
document.getElementById('openWealthBtn')?.addEventListener('click',    () => navigateTo('wealth'));
document.getElementById('openDebtBtn')?.addEventListener('click',      () => navigateTo('debt'));
document.getElementById('openAnalyticsBtn')?.addEventListener('click', () => navigateTo('analytics'));
document.getElementById('openSipBtn')?.addEventListener('click',       () => navigateTo('sip'));
document.getElementById('openExportBtn')?.addEventListener('click',    () => navigateTo('export'));
document.getElementById('openCalendarBtn')?.addEventListener('click',  () => navigateTo('calendar'));
document.getElementById('openEmiBtn')?.addEventListener('click',       () => navigateTo('emi'));
document.getElementById('openVehicleBtn')?.addEventListener('click',   () => navigateTo('vehicle'));

document.querySelectorAll('.backToHubBtn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo('hub'));
});

// ── Boot Sequence ────────────────────────────────────────────────
initGlobalListeners();
const uiController = initUI();

initDashboard();
initLedger(uiController);
initWealth(uiController);
initDebt(uiController);
initAnalytics();
initSip(uiController);
initExport();
initCommute(uiController);
initCalendar();
initEMI();
