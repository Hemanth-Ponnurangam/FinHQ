import { initUI }                            from './ui/bottomSheets.js';
import { watchAuth, initGlobalListeners }    from './firebase.js';
import { initDashboard }                     from './features/dashboard.js';
import { showAuthScreen, hideAuthScreen,
         initHeaderUser, hideHeaderUser }    from './auth.js';

// ── Lazy module imports ───────────────────────────────────────────────────────
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
  family:    () => import('./features/family.js').then(m => m.initFamily),
};

const viewFetched = {};
const viewInited  = {};

// ── Dark mode ─────────────────────────────────────────────────────────────────
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
  family:    document.getElementById('familyView'),
};

async function loadViewHTML(viewName) {
  if (viewFetched[viewName]) return;
  const container = views[viewName];
  if (!container) return;
  try {
    const res  = await fetch(`views/${viewName}.html`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    container.innerHTML = await res.text();
    if (window.lucide) lucide.createIcons();
    viewFetched[viewName] = true;
  } catch (err) {
    console.error(`Failed to load view: ${viewName}`, err);
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
        <div class="w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <i data-lucide="wifi-off" class="w-7 h-7 text-red-400"></i></div>
        <p class="font-semibold text-forest-900 dark:text-white">Couldn't load this module</p>
        <p class="text-xs text-gray-400">Check your connection and try again.</p>
        <button id="retryViewBtn" class="px-5 py-2 bg-forest-900 text-white text-sm font-semibold rounded-xl">Retry</button>
      </div>`;
    if (window.lucide) lucide.createIcons();
    document.getElementById('retryViewBtn')?.addEventListener('click', () => {
      container.innerHTML = '';
      navigateTo(viewName);
    });
  }
}

async function initViewModule(viewName) {
  if (viewInited[viewName]) return;
  viewInited[viewName] = true;
  const loader = MODULE_LOADERS[viewName];
  if (!loader) return;
  try {
    const mod = await loader();
    if (viewName === 'wealth') { mod.initWealth(uiController); mod.initKiteImport(uiController); return; }
    const noUI = ['analytics', 'export', 'calendar', 'emi', 'family'];
    noUI.includes(viewName) ? mod() : mod(uiController);
  } catch (err) {
    console.error(`Failed to init module: ${viewName}`, err);
    viewInited[viewName] = false;
    const container = views[viewName];
    if (container && !container.querySelector('#moduleErrBanner')) {
      const banner = document.createElement('div');
      banner.id = 'moduleErrBanner';
      banner.className = 'mx-4 mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-center';
      banner.innerHTML = `<p class="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Module failed to load</p>
        <p class="text-xs text-red-400 mb-3">Check your connection or try refreshing.</p>
        <button class="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl"
          onclick="location.reload()">Refresh</button>`;
      container.prepend(banner);
      if (window.lucide) lucide.createIcons();
    }
  }
}

let uiController;
let _appReady = false;

async function navigateTo(viewName) {
  if (!_appReady) return;
  if (uiController) uiController.closeAll();
  if (viewName !== 'hub') {
    await loadViewHTML(viewName);
    await initViewModule(viewName);
  }
  Object.values(views).forEach(v => v?.classList.add('hidden'));
  views[viewName]?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Nav button wiring
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
document.getElementById('openFamilyBtn')?.addEventListener('click',    () => navigateTo('family'));

document.addEventListener('click', e => {
  if (e.target.closest('.backToHubBtn')) navigateTo('hub');
});

// ── Auth state machine ─────────────────────────────────────────────────────────
// onLogin fires on every page load when a session cookie exists, and on
// explicit sign-in.  onLogout fires on sign-out and when no session is found.
watchAuth({
  onLogin(user) {
    // First login in this browser session — start Firestore listeners under
    // the user's namespace, then reveal the app shell.
    if (!_appReady) {
      initGlobalListeners();   // opens users/{uid}/... Firestore streams
      uiController = initUI(); // bottom sheets (always in DOM)
      initDashboard();         // hub net-worth — subscribes to store
      if (window.lucide) lucide.createIcons();
      _appReady = true;
    }

    // Show the app, hide the auth screen
    document.getElementById('appShell')?.classList.remove('hidden');
    hideAuthScreen();
    initHeaderUser(user);        // show avatar + logout in header
    navigateTo('hub');
  },

  onLogout() {
    // Tear down the app: hide shell, reset all view-init flags,
    // clear per-view HTML so the next user gets fresh renders
    _appReady = false;
    document.getElementById('appShell')?.classList.add('hidden');
    hideHeaderUser();

    // Reset view state so re-login re-initialises everything cleanly
    Object.keys(viewFetched).forEach(k => { viewFetched[k] = false; });
    Object.keys(viewInited ).forEach(k => { viewInited[k]  = false; });
    Object.values(views).forEach(v => {
      if (v && v.id !== 'hubView') v.innerHTML = '';
    });

    showAuthScreen();
  },
});
