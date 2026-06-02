import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

// ── Price Cache (localStorage) ──────────────────────────────────────────────
const PRICE_KEY = 'finhq_prices_v2';
function getCache() { try { return JSON.parse(localStorage.getItem(PRICE_KEY)||'{}'); } catch { return {}; } }
function setCache(c) { localStorage.setItem(PRICE_KEY, JSON.stringify(c)); }

// ── Live Fetching ───────────────────────────────────────────────────────────
// Yahoo Finance blocks direct browser requests (no CORS headers).
// Route through a CORS proxy so the request comes from a server, not the browser.
const CORS_PROXY = 'https://corsproxy.io/?url=';

async function fetchStock(rawTicker) {
  // Auto-append .NS for Indian stocks (no exchange suffix and not crypto)
  let ticker = rawTicker.trim().toUpperCase();
  if (!ticker.includes('.') && !ticker.includes('-')) ticker += '.NS';
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`;
  const url = CORS_PROXY + encodeURIComponent(yahooUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const meta = d?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('No price');
  const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
  return {
    price: meta.regularMarketPrice,
    prevClose: prev,
    dayChange: meta.regularMarketPrice - prev,
    dayChangePct: ((meta.regularMarketPrice - prev) / prev) * 100,
    currency: meta.currency || 'INR',
    ticker,
  };
}

async function fetchMF(schemeCode) {
  const url = `https://api.mfapi.in/mf/${schemeCode}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const nav = parseFloat(d?.data?.[0]?.nav);
  if (isNaN(nav)) throw new Error('Bad NAV');
  const prev = parseFloat(d?.data?.[1]?.nav || nav);
  return {
    price: nav, prevClose: prev,
    dayChange: nav - prev, dayChangePct: ((nav - prev) / prev) * 100,
    fundHouse: d?.meta?.fund_house, schemeType: d?.meta?.scheme_type,
  };
}

async function fetchHistory(ticker, range) {
  let t = ticker.trim().toUpperCase();
  if (!t.includes('.') && !t.includes('-')) t += '.NS';
  const intervalMap = { '1d': '5m', '5d': '60m', '1mo': '1d', '1y': '1wk' };
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=${range}&interval=${intervalMap[range]||'1d'}`;
  const url = CORS_PROXY + encodeURIComponent(yahooUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const result = d?.chart?.result?.[0];
  if (!result) throw new Error('No data');
  const ts = result.timestamp || [];
  const prices = result.indicators?.quote?.[0]?.close || [];
  return ts.map((t,i) => ({ t: t*1000, p: prices[i] })).filter(x => x.p != null);
}

async function fetchMFHistory(schemeCode, range) {
  const url = `https://api.mfapi.in/mf/${schemeCode}`;
  const res = await fetch(url);
  const d   = await res.json();
  const all = (d?.data || []).slice(0, range === '1y' ? 365 : range === '1mo' ? 30 : range === '5d' ? 7 : 1);
  return all.reverse().map(x => ({
    t: new Date(x.date.split('-').reverse().join('-')).getTime(),
    p: parseFloat(x.nav),
  }));
}

// ── Tax classification ──────────────────────────────────────────────────────
function taxLabel(purchaseDateStr, category) {
  if (!purchaseDateStr) return { label: '—', cls: 'bg-gray-100 text-gray-500' };
  const months = (Date.now() - new Date(purchaseDateStr)) / (1000*60*60*24*30);
  const isMFDebt = category?.toLowerCase().includes('mutual') || category === 'Fixed Deposit' || category === 'PPF/EPF';
  const threshold = isMFDebt ? 36 : 12;
  if (months >= threshold) {
    return { label: 'LTCG', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' };
  }
  return { label: 'STCG', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' };
}

function taxHint(purchaseDateStr, pl, category) {
  if (pl <= 0) return '';
  const { label } = taxLabel(purchaseDateStr, category);
  if (label === 'LTCG') {
    const taxable = Math.max(0, pl - 100000);
    const tax = category === 'Equity' ? taxable * 0.10 : taxable * 0.20;
    return `LTCG: ₹${Math.round(tax).toLocaleString('en-IN')} tax est. (${category==='Equity'?'10% above ₹1L':'20% with indexation'})`;
  }
  const rate = category === 'Equity' ? 0.15 : 0.30;
  return `STCG: ₹${Math.round(pl*rate).toLocaleString('en-IN')} tax est. (${category==='Equity'?'15%':'slab rate ~30%'})`;
}

// ── NSE market Friday 3:30 PM IST scheduler ────────────────────────────────
function scheduleAutoFetch(cb) {
  function msUntilNextFriday330() {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay(); // 0=Sun ... 5=Fri
    const daysUntilFriday = (5 - day + 7) % 7 || 7;
    const next = new Date(ist);
    next.setDate(ist.getDate() + daysUntilFriday);
    next.setHours(15, 30, 0, 0);
    if (daysUntilFriday === 0 && ist >= next) {
      next.setDate(next.getDate() + 7); // already past this Friday's close
    }
    return next - now;
  }
  const delay = msUntilNextFriday330();
  const nextDate = new Date(Date.now() + delay);
  setTimeout(() => { cb(); scheduleAutoFetch(cb); }, delay);
  return nextDate;
}

// ── Chart instance ──────────────────────────────────────────────────────────
let _chartInstance = null;
function renderChart(points, buyPrice, isDark) {
  const canvas = document.getElementById('assetPriceChart');
  if (!canvas) return;
  if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null; }
  const labels = points.map(p => new Date(p.t).toLocaleDateString('en-IN', { month:'short', day:'numeric' }));
  const data   = points.map(p => p.p);
  const first  = data[0] || 0;
  const last   = data[data.length-1] || 0;
  const up     = last >= first;
  const color  = up ? '#22c55e' : '#ef4444';
  _chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data, borderColor: color, borderWidth: 2,
        fill: true,
        backgroundColor: up ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        pointRadius: 0, tension: 0.3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `₹${ctx.parsed.y.toFixed(2)}`,
            title: ttl => ttl[0],
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
          ticks: { color: '#9ca3af', font: { size: 9 }, callback: v => '₹'+v.toLocaleString('en-IN') },
        },
      },
    },
  });
}

// ── Category colour map ─────────────────────────────────────────────────────
const catColors = {
  'Equity':       'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
  'Mutual Fund':  'text-violet-500 bg-violet-50 dark:bg-violet-900/20',
  'Gold':         'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
  'Real Estate':  'text-green-500 bg-green-50 dark:bg-green-900/20',
  'Fixed Deposit':'text-teal-500 bg-teal-50 dark:bg-teal-900/20',
  'Crypto':       'text-orange-500 bg-orange-50 dark:bg-orange-900/20',
  'PPF/EPF':      'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20',
  'Other':        'text-gray-500 bg-gray-50 dark:bg-gray-700/40',
};

// ═══════════════════════════════════════════════════════════════════════════
export function initWealth(ui) {
  const form        = document.getElementById('assetForm');
  const list        = document.getElementById('assetList');
  const totalDisp   = document.getElementById('totalWealthDisplay');
  let currentEditId = null;
  let _activeAsset  = null;
  let _activeRange  = '1d';

  // ── Show/hide ticker vs schemeCode based on category ──────────────────
  document.getElementById('assetCategory')?.addEventListener('change', e => {
    const isMF = e.target.value === 'Mutual Fund';
    document.getElementById('assetTickerRow')?.classList.toggle('hidden', isMF);
    document.getElementById('assetSchemeRow')?.classList.toggle('hidden', !isMF);
  });

  // ── Form reset ─────────────────────────────────────────────────────────
  document.addEventListener('resetAssetForm', () => {
    currentEditId = null; form?.reset();
    if (document.getElementById('assetDate'))
      document.getElementById('assetDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteAssetBtn')?.classList.add('hidden');
    document.getElementById('assetTickerRow')?.classList.remove('hidden');
    document.getElementById('assetSchemeRow')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveAssetBtn');
    if (saveBtn) saveBtn.innerText = 'Save Asset';
  });

  // ── Form submit ────────────────────────────────────────────────────────
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const qty          = Number(document.getElementById('assetQty')?.value || 0);
    const buyPrice     = Number(document.getElementById('assetBuyPrice')?.value || 0);
    const currentPrice = Number(document.getElementById('assetCurrentPrice')?.value || 0);
    if (qty <= 0) return alert('Quantity must be > 0.');
    const rawDate = document.getElementById('assetDate')?.value;
    const payload = {
      name:         document.getElementById('assetName')?.value || 'Unnamed',
      category:     document.getElementById('assetCategory')?.value || 'Equity',
      qty, buyPrice, currentPrice,
      ticker:       document.getElementById('assetTicker')?.value.trim().toUpperCase() || '',
      schemeCode:   document.getElementById('assetSchemeCode')?.value.trim() || '',
      purchaseDate: rawDate ? new Date(rawDate).toISOString() : new Date().toISOString(),
      timestamp:    rawDate ? new Date(rawDate).getTime() : Date.now(),
    };
    try {
      const btn = document.getElementById('saveAssetBtn');
      if (btn) btn.innerText = 'Saving…';
      if (currentEditId) await updateDoc(doc(db,'assets',currentEditId), payload);
      else               await addDoc(collection(db,'assets'), payload);
    } catch (err) { console.error(err); }
    finally { ui.closeAll(); }
  });

  document.getElementById('deleteAssetBtn')?.addEventListener('click', () => {
    ui.showConfirm('Delete Investment?', 'This removes the asset permanently.', async () => {
      try { await deleteDoc(doc(db,'assets',currentEditId)); }
      catch (err) { console.error(err); }
      finally { ui.closeAll(); }
    });
  });

  // ── Edit from detail sheet ─────────────────────────────────────────────
  document.getElementById('editFromAssetDetailBtn')?.addEventListener('click', () => {
    if (!_activeAsset) return;
    const a = _activeAsset;
    document.dispatchEvent(new Event('resetAssetForm'));
    currentEditId = a.id;
    document.getElementById('assetName').value         = a.name || '';
    document.getElementById('assetCategory').value     = a.category || 'Equity';
    if (a.purchaseDate) document.getElementById('assetDate').value = a.purchaseDate.split('T')[0];
    document.getElementById('assetQty').value          = a.qty || 1;
    document.getElementById('assetBuyPrice').value     = a.buyPrice || 0;
    document.getElementById('assetCurrentPrice').value = a.currentPrice || 0;
    const isMF = a.category === 'Mutual Fund';
    document.getElementById('assetTickerRow')?.classList.toggle('hidden', isMF);
    document.getElementById('assetSchemeRow')?.classList.toggle('hidden', !isMF);
    if (a.ticker)     document.getElementById('assetTicker').value     = a.ticker;
    if (a.schemeCode) document.getElementById('assetSchemeCode').value = a.schemeCode;
    document.getElementById('deleteAssetBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveAssetBtn');
    if (saveBtn) saveBtn.innerText = 'Update';
    ui.openSheet(ui.assetForm);
  });

  // ── Chart range tabs ────────────────────────────────────────────────────
  document.querySelectorAll('.chart-range-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      _activeRange = btn.dataset.range;
      document.querySelectorAll('.chart-range-btn').forEach(b => {
        const a = b.dataset.range === _activeRange;
        b.className = `chart-range-btn flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
          a ? 'bg-white dark:bg-gray-600 text-forest-900 dark:text-white shadow-sm'
            : 'text-gray-400 dark:text-gray-500'
        }`;
      });
      if (_activeAsset) await loadChart(_activeAsset, _activeRange);
    });
  });

  async function loadChart(asset, range) {
    const wrap    = document.getElementById('assetChartWrap');
    const noData  = document.getElementById('assetChartNoData');
    const loading = document.getElementById('assetChartLoading');
    const isDark  = document.documentElement.classList.contains('dark');

    if (!asset.ticker && !asset.schemeCode) {
      noData?.classList.remove('hidden');
      loading?.classList.add('hidden');
      return;
    }
    noData?.classList.add('hidden');
    loading?.classList.remove('hidden');
    try {
      let points;
      if (asset.schemeCode) points = await fetchMFHistory(asset.schemeCode, range);
      else                   points = await fetchHistory(asset.ticker, range);
      loading?.classList.add('hidden');
      renderChart(points, asset.buyPrice, isDark);
    } catch {
      loading?.classList.add('hidden');
      noData?.classList.remove('hidden');
      document.getElementById('assetChartNoData').textContent = 'Chart data unavailable';
    }
  }

  // ── Price refresh ───────────────────────────────────────────────────────
  async function refreshAllPrices() {
    const refreshBtn = document.getElementById('wealthRefreshBtn');
    // After Lucide renders, the <i> becomes an <svg> — query both to be safe
    const icon = refreshBtn?.querySelector('[data-lucide="refresh-cw"]') || refreshBtn?.querySelector('svg');
    if (icon) icon.classList.add('animate-spin');
    const assets  = store.assets;
    const cache   = getCache();
    const now     = Date.now();
    const updates = [];
    let successCount = 0;
    let failCount    = 0;

    await Promise.allSettled(assets.map(async asset => {
      try {
        let result;
        if (asset.schemeCode) result = await fetchMF(asset.schemeCode);
        else if (asset.ticker) result = await fetchStock(asset.ticker);
        else return;

        cache[asset.id] = { ...result, fetchedAt: now };
        // Also update Firestore currentPrice so it persists
        updates.push(updateDoc(doc(db,'assets',asset.id), { currentPrice: result.price }));
        successCount++;
      } catch (err) {
        console.warn(`Price fetch failed for ${asset.name}:`, err.message);
        failCount++;
      }
    }));

    setCache(cache);
    await Promise.allSettled(updates);
    renderList(store.assets);
    if (icon) icon.classList.remove('animate-spin');

    // BUG 2 FIX: Show user-facing feedback so they know if refresh worked or failed
    const statusEl = document.getElementById('wealthLastUpdated');
    if (failCount > 0 && successCount === 0) {
      if (statusEl) statusEl.textContent = `⚠️ Refresh failed — check connection`;
    } else if (failCount > 0) {
      if (statusEl) statusEl.textContent = `Updated ${successCount} · ${failCount} failed`;
    } else {
      updateStatusBar(now);
    }
  }

  document.getElementById('wealthRefreshBtn')?.addEventListener('click', refreshAllPrices);

  // ── Status bar ──────────────────────────────────────────────────────────
  // BUG 3 FIX: Do NOT call scheduleAutoFetch() here — it was being called on
  // every renderList → updateStatusBar cycle, stacking duplicate timers.
  // The scheduler is called exactly once at the bottom of initWealth.
  function nextFriday330IST() {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay();
    const daysUntilFriday = (5 - day + 7) % 7 || 7;
    const next = new Date(ist);
    next.setDate(ist.getDate() + daysUntilFriday);
    next.setHours(15, 30, 0, 0);
    return next;
  }

  function updateStatusBar(lastFetchTs) {
    const lastEl = document.getElementById('wealthLastUpdated');
    const nextEl = document.getElementById('wealthNextFetch');
    if (lastFetchTs) {
      const d = new Date(lastFetchTs);
      if (lastEl) lastEl.textContent = `Updated ${d.toLocaleDateString('en-IN',{month:'short',day:'numeric'})} ${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`;
    }
    const nextFriday = nextFriday330IST();
    if (nextEl) nextEl.textContent = `Auto: Fri 3:30 PM (${nextFriday.toLocaleDateString('en-IN',{month:'short',day:'numeric'})})`;
  }

  // ── Open asset detail sheet ─────────────────────────────────────────────
  function openAssetDetail(asset) {
    _activeAsset  = asset;
    _activeRange  = '1d';

    const cache = getCache();
    const live  = cache[asset.id];
    const qty   = asset.qty || 1;
    const buy   = asset.buyPrice || 0;
    const price = live?.price ?? asset.currentPrice ?? buy;
    const curr  = qty * price;
    const inv   = qty * buy;
    const pl    = curr - inv;
    const plPct = inv > 0 ? (pl / inv) * 100 : 0;
    const isPos = pl >= 0;
    const tax   = taxLabel(asset.purchaseDate, asset.category);

    document.getElementById('assetDetailName').textContent   = asset.name;
    document.getElementById('assetDetailValue').textContent  = `₹${curr.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('assetDetailInvested').textContent = `₹${inv.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('assetDetailQty').textContent    = qty.toLocaleString('en-IN');
    document.getElementById('assetDetailAvg').textContent    = `₹${buy.toLocaleString('en-IN',{maximumFractionDigits:2})}`;

    const plEl = document.getElementById('assetDetailPL');
    if (plEl) { plEl.textContent = `${isPos?'+':'-'}₹${Math.abs(pl).toLocaleString('en-IN',{maximumFractionDigits:0})}`; plEl.className = `font-semibold text-sm ${isPos?'text-green-500':'text-red-500'}`; }

    const plPctEl = document.getElementById('assetDetailPLPct');
    if (plPctEl) plPctEl.textContent = `${isPos?'+':''}${plPct.toFixed(2)}% unrealised`;

    const taxBadge = document.getElementById('assetDetailTaxBadge');
    if (taxBadge) { taxBadge.textContent = tax.label; taxBadge.className = `inline-block text-[9px] font-bold px-2 py-0.5 rounded-full mb-1 ${tax.cls}`; }

    const dayEl = document.getElementById('assetDetailDayChange');
    if (live?.dayChange !== undefined && dayEl) {
      const dc = live.dayChange; const dcp = live.dayChangePct || 0;
      dayEl.textContent = `${dc>=0?'+':''}₹${Math.abs(dc).toFixed(2)} (${dcp.toFixed(2)}%)`;
      dayEl.className = `text-sm font-semibold ${dc>=0?'text-green-500':'text-red-500'}`;
    } else if (dayEl) { dayEl.textContent = '—'; dayEl.className = 'text-sm font-semibold text-gray-400'; }

    const liveEl = document.getElementById('assetDetailLivePrice');
    if (liveEl) liveEl.textContent = live ? `₹${price.toLocaleString('en-IN',{maximumFractionDigits:2})}` : `₹${(asset.currentPrice||0).toLocaleString('en-IN',{maximumFractionDigits:2})} (manual)`;

    const taxInfoEl = document.getElementById('assetDetailTaxInfo');
    if (taxInfoEl) taxInfoEl.textContent = taxHint(asset.purchaseDate, pl, asset.category) || '';

    // Reset chart range buttons
    document.querySelectorAll('.chart-range-btn').forEach(b => {
      const a = b.dataset.range === '1d';
      b.className = `chart-range-btn flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${a?'bg-white dark:bg-gray-600 text-forest-900 dark:text-white shadow-sm':'text-gray-400 dark:text-gray-500'}`;
    });

    ui.openSheet(ui.assetDetailSheet);
    loadChart(asset, '1d');
  }

  // ── Render list ─────────────────────────────────────────────────────────
  store.subscribe(state => {
    if (!state.isLoaded || !list) return;
    renderList(state.assets);
  });

  function renderList(assets) {
    list.innerHTML = '';
    if (!assets?.length) {
      list.innerHTML = '<p class="text-center text-forest-400 py-10 text-sm">No assets tracked.</p>';
      if (totalDisp) totalDisp.textContent = '₹0';
      return;
    }

    const cache = getCache();
    const processed = assets.map(a => {
      const live  = cache[a.id];
      const price = live?.price ?? a.currentPrice ?? 0;
      const qty   = a.qty || 1;
      const buy   = a.buyPrice ?? price;
      const curr  = qty * price;
      const inv   = qty * buy;
      const pl    = curr - inv;
      const plPct = inv > 0 ? (pl / inv) * 100 : 0;
      return { ...a, price, curr, inv, pl, plPct, live };
    });

    // Net worth calc
    const portfolioVal = processed.reduce((s, p) => s + p.curr, 0);
    const totalDebt    = (store.debts || []).reduce((s, d) => s + Math.max(0, d.principal-(d.paid||0)), 0);
    const netWorth     = portfolioVal - totalDebt;

    if (totalDisp) totalDisp.textContent = `₹${netWorth.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('wealthAssetsTotal').textContent = `₹${portfolioVal.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('wealthDebtTotal').textContent   = `₹${totalDebt.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('wealthPortfolioVal').textContent= `₹${portfolioVal.toLocaleString('en-IN',{maximumFractionDigits:0})}`;

    // Day P&L
    const totalDayPL = processed.reduce((s,p) => s + (p.live?.dayChange ? p.live.dayChange * (p.qty||1) : 0), 0);
    const dayPLEl = document.getElementById('wealthDayPL');
    if (dayPLEl && totalDayPL !== 0) {
      dayPLEl.textContent = `${totalDayPL>=0?'+':''}₹${Math.abs(totalDayPL).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
      dayPLEl.className   = `font-semibold ${totalDayPL>=0?'text-green-500':'text-red-500'}`;
    }

    // Group by category
    const groups = {};
    processed.forEach(p => { (groups[p.category||'Other'] ??= []).push(p); });

    Object.entries(groups).forEach(([cat, items]) => {
      const catTotal = items.reduce((s,i) => s+i.curr, 0);
      const catCls   = catColors[cat] || catColors['Other'];
      // Category header
      list.innerHTML += `
        <div class="flex items-center gap-2 mt-2 mb-1">
          <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${catCls}">${cat}</span>
          <span class="text-[11px] text-gray-400 font-semibold">₹${catTotal.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
        </div>`;

      items.forEach(p => {
        const isPos  = p.pl >= 0;
        const tax    = taxLabel(p.purchaseDate, p.category);
        const hasLive = !!p.live;
        const liveDot = hasLive
          ? '<span class="w-1.5 h-1.5 rounded-full bg-green-400 inline-block ml-1" title="Live price"></span>'
          : '<span class="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 inline-block ml-1" title="Manual price"></span>';
        const dayBadge = p.live?.dayChangePct !== undefined
          ? `<span class="text-[9px] font-semibold ${p.live.dayChangePct>=0?'text-green-500':'text-red-500'}">${p.live.dayChangePct>=0?'▲':'▼'}${Math.abs(p.live.dayChangePct).toFixed(2)}% today</span>`
          : '';

        list.innerHTML += `
          <div data-id="${p.id}" class="asset-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 active:scale-[0.98]">
            <div class="flex justify-between items-start">
              <div class="min-w-0 flex-1 mr-3">
                <p class="font-semibold text-forest-900 dark:text-white flex items-center">
                  <span class="truncate">${p.name}</span>${liveDot}
                  <span class="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${tax.cls}">${tax.label}</span>
                </p>
                <p class="text-[10px] text-gray-400 mt-0.5">${p.qty} units · Avg ₹${p.buyPrice?.toLocaleString('en-IN',{maximumFractionDigits:2})||0} · ${dayBadge}</p>
                <div class="mt-1.5 flex items-center gap-2">
                  <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
                    <div class="h-1 rounded-full ${isPos?'bg-green-400':'bg-red-400'}" style="width:${Math.min(100,Math.abs(p.plPct))}%"></div>
                  </div>
                  <span class="text-[9px] font-bold ${isPos?'text-green-500':'text-red-500'} flex-shrink-0">${isPos?'+':''}${p.plPct.toFixed(1)}%</span>
                </div>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="font-display font-bold text-lg dark:text-white tabular-nums">₹${p.curr.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
                <p class="text-[10px] font-semibold ${isPos?'text-green-500':'text-red-500'} mt-0.5">
                  ${isPos?'+':'-'}₹${Math.abs(p.pl).toLocaleString('en-IN',{maximumFractionDigits:0})}
                </p>
                <p class="text-[9px] text-gray-400">inv ₹${p.inv.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
              </div>
            </div>
          </div>`;
      });
    });

    // Status bar last fetch
    const allFetches = Object.values(getCache()).map(x => x.fetchedAt).filter(Boolean);
    if (allFetches.length) updateStatusBar(Math.max(...allFetches));
  }

  // ── Card click → detail sheet ───────────────────────────────────────────
  list?.addEventListener('click', e => {
    const card = e.target.closest('.asset-card');
    if (!card) return;
    const asset = store.assets.find(a => a.id === card.dataset.id);
    if (asset) openAssetDetail(asset);
  });

  // ── Sort dropdown ───────────────────────────────────────────────────────
  if (list && !document.getElementById('wealthSortSelect')) {
    list.insertAdjacentHTML('beforebegin', `
      <div class="flex justify-end mb-2">
        <select id="wealthSortSelect" class="bg-forest-50 dark:bg-gray-800 text-forest-900 dark:text-white text-xs font-semibold p-2 rounded-lg outline-none shadow-sm">
          <option value="valueDesc">Highest Value</option>
          <option value="plDesc">Highest P&L %</option>
          <option value="nameAsc">Name (A-Z)</option>
        </select>
      </div>`);
    document.getElementById('wealthSortSelect')?.addEventListener('change', () => renderList(store.assets));
  }

  // ── Local FAB ───────────────────────────────────────────────────────────
  document.getElementById('wealthFabBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetAssetForm'));
    ui.openSheet(ui.assetForm);
  });

  // ── Auto-scheduler (Friday 3:30 PM IST) ────────────────────────────────
  scheduleAutoFetch(() => refreshAllPrices());
  updateStatusBar(null);
}
