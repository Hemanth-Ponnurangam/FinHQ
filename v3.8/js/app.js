import { initUI }               from './ui/bottomSheets.js';
import { initGlobalListeners }  from './firebase.js';
import { initDashboard }        from './features/dashboard.js';

// ── Lazy module imports (only resolved when first needed) ─────────────────────
const MODULE_LOADERS = {
  ledger:    () => import('./features/ledger.js').then(m => m.initLedger),
  wealth:    () => import('./features/wealth.js').then(m => ({ initWealth: m.initWealth, initKiteImport: m.initKiteImport })),
  debt:      () => import('./features/debt.js').then(m => m.initDebt),
  analytics: () => import('./features/analytics.js').then(m => m.initAnalytics),
  sip:       () => import('./features/sip.js').then(m => m.initSip),
  export:    () => import('./features/export.js').then(m => m.initExport),
  calendar:  () => import('./features/calendar.js').then(m => m.initCalendar),
  emi:       () => import('./features/emi.js').then(m => m.initEMI),
  vehicle:   () => import('./features/commute.js').then(m => m.initCommute),
  events:    () => import('./features/events.js').then(m => m.initEvents),
};

// Track what's been fetched and inited so we never double-load
const viewFetched = {};
const viewInited  = {};

console.log('FinHQ v7 booting…');

// ── Dark Mode Toggle ──────────────────────────────────────────────────────────
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

// ── Navigation ────────────────────────────────────────────────────────────────
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
  events:    document.getElementById('eventsView'),
};

// ── Fetch + inject view HTML (once per view) ──────────────────────────────────
async function loadViewHTML(viewName) {
  if (viewFetched[viewName]) return;
  const container = views[viewName];
  if (!container) return;

  try {
    const res  = await fetch(`views/${viewName}.html`);
    const html = await res.text();
    container.innerHTML = html;
    // Re-run Lucide on injected icons
    if (window.lucide) lucide.createIcons();
    viewFetched[viewName] = true;
  } catch (err) {
    console.error(`Failed to load view: ${viewName}`, err);
  }
}

// ── Init the JS module for a view (once per view) ────────────────────────────
async function initViewModule(viewName) {
  if (viewInited[viewName]) return;
  viewInited[viewName] = true; // mark before await to prevent double-init

  const loader = MODULE_LOADERS[viewName];
  if (!loader) return;

  try {
    const mod = await loader();

    // Wealth has two init functions; handle as a special case
    if (viewName === 'wealth') {
      mod.initWealth(uiController);
      mod.initKiteImport(uiController);
      return;
    }

    // Most modules take uiController; analytics, export, calendar, emi take none
    const noUI = ['analytics', 'export', 'calendar', 'emi'];
    if (noUI.includes(viewName)) {
      mod();
    } else {
      mod(uiController);
    }
  } catch (err) {
    console.error(`Failed to init module: ${viewName}`, err);
    viewInited[viewName] = false; // allow retry on next visit
  }
}

// ── Navigate: fetch HTML → init module → show view ───────────────────────────
let uiController;

async function navigateTo(viewName) {
  if (uiController) uiController.closeAll();

  // For non-hub views: load HTML first, then wire JS
  if (viewName !== 'hub') {
    await loadViewHTML(viewName);
    await initViewModule(viewName);
  }

  Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });
  if (views[viewName]) {
    views[viewName].classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ── Nav button wiring ─────────────────────────────────────────────────────────
document.getElementById('openLedgerBtn')?.addEventListener('click',    () => navigateTo('ledger'));
document.getElementById('openWealthBtn')?.addEventListener('click',    () => navigateTo('wealth'));
document.getElementById('openDebtBtn')?.addEventListener('click',      () => navigateTo('debt'));
document.getElementById('openAnalyticsBtn')?.addEventListener('click', () => navigateTo('analytics'));
document.getElementById('openSipBtn')?.addEventListener('click',       () => navigateTo('sip'));
document.getElementById('openExportBtn')?.addEventListener('click',    () => navigateTo('export'));
document.getElementById('openCalendarBtn')?.addEventListener('click',  () => navigateTo('calendar'));
document.getElementById('openEmiBtn')?.addEventListener('click',       () => navigateTo('emi'));
document.getElementById('openVehicleBtn')?.addEventListener('click',   () => navigateTo('vehicle'));
document.getElementById('openEventsBtn')?.addEventListener('click',    () => navigateTo('events'));

// backToHub buttons are injected via view HTML — delegate from document
document.addEventListener('click', e => {
  if (e.target.closest('.backToHubBtn')) navigateTo('hub');
});

// ── Boot Sequence ─────────────────────────────────────────────────────────────
initGlobalListeners();           // open Firestore listeners (priority-tiered)
uiController = initUI();         // bottom sheets (always in DOM)
initDashboard();                 // hub net-worth card — subscribes to store
