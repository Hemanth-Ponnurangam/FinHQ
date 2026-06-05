import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

// ── XIRR — Newton-Raphson (~20 lines) ──────────────────────────────────────
function xirrCalc(cashflows, dates) {
  if (cashflows.length < 2 || cashflows.length !== dates.length) return null;
  const d0 = dates[0].getTime();
  let rate = 0.1;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0, dnpv = 0;
    for (let i = 0; i < cashflows.length; i++) {
      const t = (dates[i].getTime() - d0) / (365.25 * 86400000);
      const denom = Math.pow(1 + rate, t);
      npv  += cashflows[i] / denom;
      dnpv -= t * cashflows[i] / (denom * (1 + rate));
    }
    if (Math.abs(dnpv) < 1e-12) break;
    const next = rate - npv / dnpv;
    if (Math.abs(next - rate) < 1e-8) return next;
    rate = isFinite(next) ? next : rate * 1.5;
  }
  return null;
}

function formatXIRR(r) {
  if (r === null || !isFinite(r)) return null;
  return `${(r * 100).toFixed(1)}% p.a.`;
}

// ── Price Cache ──────────────────────────────────────────────────────────────
const PRICE_KEY = 'finhq_prices_v2';
function getCache() { try { return JSON.parse(localStorage.getItem(PRICE_KEY)||'{}'); } catch { return {}; } }
function setCache(c) { localStorage.setItem(PRICE_KEY, JSON.stringify(c)); }

// ── Tax helpers ──────────────────────────────────────────────────────────────
function ltcgThresholdDays(category) {
  return (category === 'Mutual Fund' || category === 'Fixed Deposit' || category === 'PPF/EPF') ? 1095 : 365;
}
function taxLabel(purchaseDateStr, category) {
  if (!purchaseDateStr) return { label:'—', cls:'bg-gray-100 text-gray-500', isLTCG: false };
  const days = (Date.now() - new Date(purchaseDateStr)) / 86400000;
  const threshold = ltcgThresholdDays(category);
  const isLTCG = days >= threshold;
  return isLTCG
    ? { label:'LTCG', cls:'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', isLTCG:true }
    : { label:'STCG', cls:'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', isLTCG:false };
}
function taxHint(purchaseDateStr, pl, category) {
  if (pl <= 0) return '';
  const { label, isLTCG } = taxLabel(purchaseDateStr, category);
  if (isLTCG) {
    const taxable = Math.max(0, pl - 100000);
    const rate    = category === 'Equity' ? 0.10 : 0.20;
    const tax     = taxable * rate;
    return `${label}: ₹${Math.round(tax).toLocaleString('en-IN')} est. tax (${category==='Equity'?'10% above ₹1L':'20% with indexation'})`;
  }
  const rate = category === 'Equity' ? 0.15 : 0.30;
  return `${label}: ₹${Math.round(pl*rate).toLocaleString('en-IN')} est. tax (${category==='Equity'?'15%':'~30% slab'})`;
}

// ── Holding period timeline ──────────────────────────────────────────────────
function holdingTimeline(purchaseDateStr, category) {
  if (!purchaseDateStr) return null;
  const daysHeld = Math.floor((Date.now() - new Date(purchaseDateStr)) / 86400000);
  const threshold = ltcgThresholdDays(category);
  const remaining = threshold - daysHeld;
  const pct       = Math.min(100, (daysHeld / threshold) * 100);
  const past      = daysHeld >= threshold;
  const color     = past ? '#22c55e' : pct > 75 ? '#f59e0b' : '#60a5fa';
  const badgeText = past ? 'LTCG ✓' : remaining <= 90 ? `⏱ ${remaining}d` : `${Math.round(pct)}%`;
  const badgeCls  = past ? 'bg-green-100 text-green-700' : remaining<=90 ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600';
  const label     = past
    ? `Day ${daysHeld} — LTCG threshold passed ✓`
    : `Day ${daysHeld} of ${threshold} — ${remaining} days to LTCG`;
  return { daysHeld, threshold, remaining, pct, past, color, badgeText, badgeCls, label };
}

// ── Live Fetching ─────────────────────────────────────────────────────────────
//
// Yahoo Finance blocks direct browser requests (no CORS headers).
// Strategy: try the direct URL first; if it throws a network/CORS error
// (TypeError: Failed to fetch), retry through corsproxy.io.
// This keeps latency low when direct works and self-heals when it doesn't.
//
const CORS_PROXY = 'https://corsproxy.io/?';

async function yFetch(url) {
  // 1. Try direct — works in some browsers / when Yahoo isn't blocking
  try {
    const res = await fetch(url);
    if (res.ok) return res;
    // 4xx from Yahoo (wrong ticker, rate-limited) — don't bother proxying
    if (res.status >= 400 && res.status < 500) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    // Only retry on network/CORS failures (TypeError), not on HTTP 4xx
    if (!(err instanceof TypeError)) throw err;
  }
  // 2. Fall back to CORS proxy
  const proxied = await fetch(CORS_PROXY + encodeURIComponent(url));
  if (!proxied.ok) throw new Error(`HTTP ${proxied.status}`);
  return proxied;
}

async function fetchStock(rawTicker) {
  let ticker = rawTicker.trim().toUpperCase();
  if (!ticker.includes('.') && !ticker.includes('-')) ticker += '.NS';
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`;
  const res  = await yFetch(url);
  const d    = await res.json();
  const meta = d?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('No price');
  const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
  return { price: meta.regularMarketPrice, prevClose: prev, dayChange: meta.regularMarketPrice-prev, dayChangePct:((meta.regularMarketPrice-prev)/prev)*100, ticker };
}
async function fetchMF(schemeCode) {
  // mfapi.in supports CORS natively — no proxy needed
  const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d   = await res.json();
  const nav = parseFloat(d?.data?.[0]?.nav);
  if (isNaN(nav)) throw new Error('Bad NAV');
  const prev = parseFloat(d?.data?.[1]?.nav || nav);
  return { price:nav, prevClose:prev, dayChange:nav-prev, dayChangePct:((nav-prev)/prev)*100, fundHouse:d?.meta?.fund_house };
}
async function fetchHistory(ticker, range) {
  let t = ticker.trim().toUpperCase();
  if (!t.includes('.') && !t.includes('-')) t += '.NS';
  const iv  = { '1d':'5m','5d':'60m','1mo':'1d','1y':'1wk' };
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=${range}&interval=${iv[range]||'1d'}`;
  const res = await yFetch(url);
  const d   = await res.json();
  const r   = d?.chart?.result?.[0];
  if (!r) throw new Error('No data');
  return (r.timestamp||[]).map((ts,i)=>({ t:ts*1000, p:(r.indicators?.quote?.[0]?.close||[])[i] })).filter(x=>x.p!=null);
}
async function fetchMFHistory(code, range) {
  const n = { '1d':1,'5d':7,'1mo':30,'1y':365 }[range] || 30;
  const res = await fetch(`https://api.mfapi.in/mf/${code}`);
  const d = await res.json();
  return (d?.data||[]).slice(0,n).reverse().map(x=>({ t:new Date(x.date.split('-').reverse().join('-')).getTime(), p:parseFloat(x.nav) }));
}

// ── Auto-scheduler (Friday 3:30 PM IST) — called ONCE at init ────────────
let _nextFetchDate = null;
let _autoScheduled = false;

function msUntilNextFriday330() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const day = ist.getDay();
  let daysTo = (5 - day + 7) % 7;
  if (daysTo === 0 && (ist.getHours() > 15 || (ist.getHours()===15 && ist.getMinutes()>=30))) daysTo = 7;
  const next = new Date(ist); next.setDate(ist.getDate()+daysTo); next.setHours(15,30,0,0);
  return { ms: next - now, date: next };
}
function scheduleAutoFetch(cb) {
  if (_autoScheduled) return;
  _autoScheduled = true;
  function _schedule() {
    const { ms, date } = msUntilNextFriday330();
    _nextFetchDate = date;
    setTimeout(() => { cb(); _autoScheduled = false; scheduleAutoFetch(cb); }, ms);
  }
  _schedule();
}

// ── Chart ─────────────────────────────────────────────────────────────────────
let _chart = null;
function renderChart(points, isDark) {
  const canvas = document.getElementById('assetPriceChart');
  if (!canvas) return;
  if (_chart) { _chart.destroy(); _chart = null; }
  const first = points[0]?.p||0, last = points[points.length-1]?.p||0;
  const up = last >= first;
  const color = up ? '#22c55e' : '#ef4444';
  _chart = new Chart(canvas, {
    type: 'line',
    data: { labels: points.map(p=>new Date(p.t).toLocaleDateString('en-IN',{month:'short',day:'numeric'})),
            datasets: [{ data: points.map(p=>p.p), borderColor:color, borderWidth:2, fill:true,
              backgroundColor: up?'rgba(34,197,94,0.08)':'rgba(239,68,68,0.08)', pointRadius:0, tension:0.3 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} },
      scales: { x:{display:false}, y:{ grid:{color:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'},
        ticks:{color:'#9ca3af',font:{size:9},callback:v=>'₹'+v.toLocaleString('en-IN')} } } },
  });
}

const catColors = {
  'Equity':'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
  'Mutual Fund':'text-violet-500 bg-violet-50 dark:bg-violet-900/20',
  'Gold':'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
  'Real Estate':'text-green-500 bg-green-50 dark:bg-green-900/20',
  'Fixed Deposit':'text-teal-500 bg-teal-50 dark:bg-teal-900/20',
  'Crypto':'text-orange-500 bg-orange-50 dark:bg-orange-900/20',
  'PPF/EPF':'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20',
  'Other':'text-gray-500 bg-gray-50 dark:bg-gray-700/40',
};

// ═════════════════════════════════════════════════════════════════════════════
export function initWealth(ui) {
  const form  = document.getElementById('assetForm');
  const list  = document.getElementById('assetList');
  const totEl = document.getElementById('totalWealthDisplay');
  let currentEditId = null;
  let _activeAsset  = null;
  let _activeRange  = '1d';

  // ── Auto-fetch price when ticker is typed ──────────────────────────────
  let _tickerDebounce = null;
  let _schemeDebounce = null;

  function setTickerStatus(state, msg) {
    const el = document.getElementById('tickerFetchStatus');
    if (!el) return;
    const icons = { loading: '⏳', ok: '✅', err: '❌', '': '' };
    el.textContent = (icons[state] || '') + (msg ? ' ' + msg : '');
  }

  async function autoFetchTicker(raw) {
    if (!raw?.trim()) {
      document.getElementById('tickerPriceFetched')?.classList.add('hidden');
      document.getElementById('assetCurrentPriceRow')?.classList.remove('hidden');
      setTickerStatus('', '');
      return;
    }
    setTickerStatus('loading', 'Fetching…');
    try {
      const result = await fetchStock(raw.trim());
      document.getElementById('tickerPriceValue').textContent   = `₹${result.price.toLocaleString('en-IN', {maximumFractionDigits:2})}`;
      const dc = result.dayChange;
      const dcEl = document.getElementById('tickerDayChange');
      dcEl.textContent = `${dc>=0?'+':''}₹${Math.abs(dc).toFixed(2)} (${(result.dayChangePct||0).toFixed(2)}%)`;
      dcEl.className = `text-[10px] font-semibold ${dc>=0?'text-green-500':'text-red-500'}`;
      document.getElementById('tickerAssetName').textContent = result.ticker || raw.toUpperCase();
      document.getElementById('tickerPriceFetched')?.classList.remove('hidden');
      document.getElementById('assetCurrentPriceRow')?.classList.add('hidden');
      // Write fetched price into hidden field so save payload gets it
      const cpEl = document.getElementById('assetCurrentPrice');
      if (cpEl) cpEl.value = result.price;
      // Auto-fill asset name if empty
      const nameEl = document.getElementById('assetName');
      if (nameEl && !nameEl.value) nameEl.value = result.ticker?.replace('.NS','') || raw.toUpperCase();
      setTickerStatus('ok', '');
    } catch (err) {
      document.getElementById('tickerPriceFetched')?.classList.add('hidden');
      document.getElementById('assetCurrentPriceRow')?.classList.remove('hidden');
      // Distinguish between wrong ticker vs network/CORS failure
      const isNetworkErr = err instanceof TypeError || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      if (isNetworkErr) {
        setTickerStatus('err', 'Network error — check connection');
      } else if (err.message?.includes('404') || err.message?.includes('No price') || err.message?.includes('HTTP 4')) {
        const tried = raw.trim().toUpperCase() + (raw.includes('.') ? '' : '.NS');
        setTickerStatus('err', `"${tried}" not found on NSE — check symbol`);
      } else {
        setTickerStatus('err', 'Not found — verify ticker symbol');
      }
    }
  }

  async function autoFetchScheme(code) {
    if (!code?.trim()) {
      document.getElementById('schemePriceFetched')?.classList.add('hidden');
      document.getElementById('assetCurrentPriceRow')?.classList.remove('hidden');
      document.getElementById('schemeFetchStatus').textContent = '';
      return;
    }
    const statusEl = document.getElementById('schemeFetchStatus');
    if (statusEl) statusEl.textContent = '⏳';
    try {
      const result = await fetchMF(code.trim());
      document.getElementById('schemePriceValue').textContent   = `₹${result.price.toFixed(4)}`;
      document.getElementById('schemeFundHouse').textContent    = result.fundHouse || '';
      document.getElementById('schemePriceFetched')?.classList.remove('hidden');
      document.getElementById('assetCurrentPriceRow')?.classList.add('hidden');
      const cpEl = document.getElementById('assetCurrentPrice');
      if (cpEl) cpEl.value = result.price;
      if (statusEl) statusEl.textContent = '✅';
    } catch {
      document.getElementById('schemePriceFetched')?.classList.add('hidden');
      document.getElementById('assetCurrentPriceRow')?.classList.remove('hidden');
      if (statusEl) statusEl.textContent = '❌ Not found';
    }
  }

  document.getElementById('assetTicker')?.addEventListener('input', e => {
    clearTimeout(_tickerDebounce);
    const val = e.target.value.trim();
    _tickerDebounce = setTimeout(() => autoFetchTicker(val), 700);
  });

  document.getElementById('assetSchemeCode')?.addEventListener('input', e => {
    clearTimeout(_schemeDebounce);
    const val = e.target.value.trim();
    _schemeDebounce = setTimeout(() => autoFetchScheme(val), 700);
  });

  // ── Category toggle (Ticker vs SchemeCode) ──────────────────────────────
  document.getElementById('assetCategory')?.addEventListener('change', e => {
    const isMF = e.target.value === 'Mutual Fund';
    document.getElementById('assetTickerRow')?.classList.toggle('hidden', isMF);
    document.getElementById('assetSchemeRow')?.classList.toggle('hidden', !isMF);
    // Reset fetch UI on category switch
    document.getElementById('tickerPriceFetched')?.classList.add('hidden');
    document.getElementById('schemePriceFetched')?.classList.add('hidden');
    document.getElementById('assetCurrentPriceRow')?.classList.remove('hidden');
  });

  // ── Form reset ──────────────────────────────────────────────────────────
  document.addEventListener('resetAssetForm', () => {
    currentEditId = null; form?.reset();
    if (document.getElementById('assetDate'))
      document.getElementById('assetDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteAssetBtn')?.classList.add('hidden');
    document.getElementById('assetTickerRow')?.classList.remove('hidden');
    document.getElementById('assetSchemeRow')?.classList.add('hidden');
    document.getElementById('tickerPriceFetched')?.classList.add('hidden');
    document.getElementById('schemePriceFetched')?.classList.add('hidden');
    document.getElementById('assetCurrentPriceRow')?.classList.remove('hidden');
    setTickerStatus('', '');
    const sb = document.getElementById('saveAssetBtn');
    if (sb) sb.innerText = 'Save Asset';
  });

  // ── Form submit ─────────────────────────────────────────────────────────
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const qty = Number(document.getElementById('assetQty')?.value||0);
    const buy = Number(document.getElementById('assetBuyPrice')?.value||0);
    const cur = Number(document.getElementById('assetCurrentPrice')?.value||0);
    if (qty <= 0) return alert('Quantity must be > 0.');
    const raw = document.getElementById('assetDate')?.value;
    const payload = {
      name:         document.getElementById('assetName')?.value||'Unnamed',
      category:     document.getElementById('assetCategory')?.value||'Equity',
      qty, buyPrice:buy, currentPrice:cur,
      ticker:       document.getElementById('assetTicker')?.value.trim().toUpperCase()||'',
      schemeCode:   document.getElementById('assetSchemeCode')?.value.trim()||'',
      purchaseDate: raw ? new Date(raw).toISOString() : new Date().toISOString(),
      timestamp:    raw ? new Date(raw).getTime() : Date.now(),
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

  // ── Edit from detail sheet ──────────────────────────────────────────────
  document.getElementById('editFromAssetDetailBtn')?.addEventListener('click', () => {
    const a = _activeAsset; if (!a) return;
    document.dispatchEvent(new Event('resetAssetForm'));
    currentEditId = a.id;
    document.getElementById('assetName').value         = a.name||'';
    document.getElementById('assetCategory').value     = a.category||'Equity';
    if (a.purchaseDate) document.getElementById('assetDate').value = a.purchaseDate.split('T')[0];
    document.getElementById('assetQty').value          = a.qty||1;
    document.getElementById('assetBuyPrice').value     = a.buyPrice||0;
    document.getElementById('assetCurrentPrice').value = a.currentPrice||0;
    const isMF = a.category === 'Mutual Fund';
    document.getElementById('assetTickerRow')?.classList.toggle('hidden', isMF);
    document.getElementById('assetSchemeRow')?.classList.toggle('hidden', !isMF);
    if (a.ticker)     { document.getElementById('assetTicker').value = a.ticker; autoFetchTicker(a.ticker); }
    if (a.schemeCode) { document.getElementById('assetSchemeCode').value = a.schemeCode; autoFetchScheme(a.schemeCode); }
    document.getElementById('deleteAssetBtn')?.classList.remove('hidden');
    const sb = document.getElementById('saveAssetBtn'); if (sb) sb.innerText = 'Update';
    ui.openSheet(ui.assetForm);
  });

  // ── Chart range tabs ────────────────────────────────────────────────────
  document.querySelectorAll('.chart-range-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      _activeRange = btn.dataset.range;
      document.querySelectorAll('.chart-range-btn').forEach(b => {
        const a = b.dataset.range === _activeRange;
        b.className = `chart-range-btn flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
          a ? 'bg-white dark:bg-gray-600 text-forest-900 dark:text-white shadow-sm' : 'text-gray-400 dark:text-gray-500'
        }`;
      });
      if (_activeAsset) await loadChart(_activeAsset, _activeRange);
    });
  });

  async function loadChart(asset, range) {
    const noData  = document.getElementById('assetChartNoData');
    const loading = document.getElementById('assetChartLoading');
    const isDark  = document.documentElement.classList.contains('dark');
    if (!asset.ticker && !asset.schemeCode) { noData?.classList.remove('hidden'); return; }
    noData?.classList.add('hidden'); loading?.classList.remove('hidden');
    try {
      const pts = asset.schemeCode ? await fetchMFHistory(asset.schemeCode, range) : await fetchHistory(asset.ticker, range);
      loading?.classList.add('hidden');
      renderChart(pts, isDark);
    } catch { loading?.classList.add('hidden'); noData?.classList.remove('hidden'); }
  }

  // ── Average Calculator ──────────────────────────────────────────────────
  document.getElementById('toggleAvgCalcBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('avgCalcPanel');
    const chev  = document.getElementById('avgCalcChevron');
    panel?.classList.toggle('hidden');
    if (chev) chev.textContent = panel?.classList.contains('hidden') ? '▼' : '▲';
  });

  function recalcAvg() {
    if (!_activeAsset) return;
    const addQty   = parseFloat(document.getElementById('avgCalcQty')?.value||'0');
    const addPrice = parseFloat(document.getElementById('avgCalcPrice')?.value||'0');
    if (!addQty || !addPrice) { document.getElementById('avgCalcResult')?.classList.add('hidden'); document.getElementById('avgCalcApplyBtn')?.classList.add('hidden'); return; }
    const origQty  = _activeAsset.qty   || 0;
    const origAvg  = _activeAsset.buyPrice || 0;
    const newQty   = origQty + addQty;
    const newInv   = (origQty * origAvg) + (addQty * addPrice);
    const newAvg   = newInv / newQty;
    const curPrice = getCache()[_activeAsset.id]?.price ?? _activeAsset.currentPrice ?? origAvg;
    const brkeven  = newAvg; // break-even = new avg (sell above this to profit)
    document.getElementById('avgCalcNewAvg').textContent     = `₹${newAvg.toFixed(2)}`;
    document.getElementById('avgCalcNewQty').textContent     = newQty.toLocaleString('en-IN');
    document.getElementById('avgCalcNewInv').textContent     = `₹${newInv.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('avgCalcBreakeven').textContent  = `₹${brkeven.toFixed(2)} (current ₹${curPrice.toFixed(2)})`;
    document.getElementById('avgCalcResult')?.classList.remove('hidden');
    document.getElementById('avgCalcApplyBtn')?.classList.remove('hidden');
    // Store for apply
    document.getElementById('avgCalcApplyBtn')._newAvg = newAvg;
    document.getElementById('avgCalcApplyBtn')._newQty = newQty;
    document.getElementById('avgCalcApplyBtn')._newInv = newInv;
  }

  document.getElementById('avgCalcQty')?.addEventListener('input', recalcAvg);
  document.getElementById('avgCalcPrice')?.addEventListener('input', recalcAvg);

  document.getElementById('avgCalcApplyBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('avgCalcApplyBtn');
    const newAvg = btn._newAvg; const newQty = btn._newQty;
    if (!_activeAsset || !newAvg) return;
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      await updateDoc(doc(db,'assets',_activeAsset.id), { buyPrice: newAvg, qty: newQty });
      _activeAsset.buyPrice = newAvg; _activeAsset.qty = newQty;
      btn.textContent = '✓ Applied'; setTimeout(() => { btn.textContent='Apply — Update Avg Cost in Firestore'; btn.disabled=false; }, 1500);
    } catch { btn.textContent='Failed — retry'; btn.disabled=false; }
  });

  // ── Mark as Sold ────────────────────────────────────────────────────────
  document.getElementById('toggleSellBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('sellPanel');
    const chev  = document.getElementById('sellChevron');
    panel?.classList.toggle('hidden');
    if (chev) chev.textContent = panel?.classList.contains('hidden') ? '▼' : '▲';
    // Default sell date to today
    const dateEl = document.getElementById('sellDate');
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
  });

  function recalcSell() {
    if (!_activeAsset) return;
    const sp  = parseFloat(document.getElementById('sellPrice')?.value||'0');
    if (!sp) { document.getElementById('sellSummary')?.classList.add('hidden'); return; }
    const qty = _activeAsset.qty || 0;
    const saleVal = sp * qty;
    const inv     = (_activeAsset.buyPrice||0) * qty;
    const rl      = saleVal - inv;
    const tax     = taxLabel(_activeAsset.purchaseDate, _activeAsset.category);
    const estTax  = rl > 0
      ? (tax.isLTCG
          ? Math.max(0, rl-100000) * (_activeAsset.category==='Equity'?0.10:0.20)
          : rl * (_activeAsset.category==='Equity'?0.15:0.30))
      : 0;
    document.getElementById('sellSummaryValue').textContent  = `₹${saleVal.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    const plEl = document.getElementById('sellSummaryPL');
    plEl.textContent = `${rl>=0?'+':'-'}₹${Math.abs(rl).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    plEl.className   = `font-bold ${rl>=0?'text-green-500':'text-red-500'}`;
    document.getElementById('sellSummaryTax').textContent    = tax.label;
    document.getElementById('sellSummaryEstTax').textContent = `₹${Math.round(estTax).toLocaleString('en-IN')}`;
    document.getElementById('sellSummary')?.classList.remove('hidden');
  }

  document.getElementById('sellPrice')?.addEventListener('input', recalcSell);

  document.getElementById('confirmSellBtn')?.addEventListener('click', async () => {
    const a  = _activeAsset; if (!a) return;
    const sp = parseFloat(document.getElementById('sellPrice')?.value||'0');
    const sd = document.getElementById('sellDate')?.value;
    if (!sp || sp <= 0) return alert('Enter a valid sell price.');
    const btn = document.getElementById('confirmSellBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      const qty     = a.qty || 0;
      const saleVal = sp * qty;
      const inv     = (a.buyPrice||0) * qty;
      const rl      = saleVal - inv;
      const tax     = taxLabel(a.purchaseDate, a.category);
      await addDoc(collection(db,'realisedGains'), {
        name: a.name, category: a.category, qty,
        buyPrice: a.buyPrice||0, sellPrice: sp,
        invested: inv, saleValue: saleVal, realisedPL: rl,
        taxType: tax.label, isLTCG: tax.isLTCG,
        purchaseDate: a.purchaseDate, sellDate: sd ? new Date(sd).toISOString() : new Date().toISOString(),
        timestamp: Date.now(), originalId: a.id,
      });
      await deleteDoc(doc(db,'assets',a.id));
      ui.closeAll();
    } catch (err) { console.error(err); btn.textContent='Failed — retry'; btn.disabled=false; }
  });

  // ── Realised Gains (driven by store.realisedGains via Firestore listener) ──
  function renderRealisedGains() {
    const gains  = store.realisedGains || [];
    const section = document.getElementById('realisedGainsSection');
    if (!gains.length) { section?.classList.add('hidden'); return; }
    section?.classList.remove('hidden');

    const total  = gains.reduce((s,r)=>s+(r.realisedPL||0),0);
    const stcg   = gains.filter(r=>!r.isLTCG).reduce((s,r)=>s+(r.realisedPL>0?r.realisedPL:0),0);
    const ltcg   = gains.filter(r=>r.isLTCG).reduce((s,r)=>s+(r.realisedPL>0?r.realisedPL:0),0);
    const taxEst = (stcg * 0.15) + (Math.max(0, ltcg - 100000) * 0.10);

    document.getElementById('realisedSummaryBadge').textContent = `${gains.length} sale${gains.length>1?'s':''} · ${total>=0?'+':''}₹${Math.abs(total).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('realisedTotal').textContent = `${total>=0?'+':''}₹${Math.abs(total).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('realisedSTCG').textContent  = `₹${stcg.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('realisedLTCG').textContent  = `₹${ltcg.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('realisedTaxEst').textContent = `Est. tax this FY: ₹${Math.round(taxEst).toLocaleString('en-IN')} (STCG 15% + LTCG 10% above ₹1L)`;

    const rl = document.getElementById('realisedList');
    if (rl) {
      rl.innerHTML = gains.map(r => {
        const isPos = (r.realisedPL||0) >= 0;
        const sd    = r.sellDate ? new Date(r.sellDate).toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'}) : '—';
        return `<div class="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-forest-50/50 dark:border-gray-700">
          <div class="flex justify-between items-center">
            <div><p class="font-semibold text-sm dark:text-white">${r.name||'—'}</p>
            <p class="text-[10px] text-gray-400">${r.qty||0} units · Sold ${sd} · <span class="${r.isLTCG?'text-green-500':'text-amber-500'}">${r.taxType||'—'}</span></p></div>
            <div class="text-right">
              <p class="font-bold text-sm ${isPos?'text-green-500':'text-red-500'}">${isPos?'+':''}₹${Math.abs(r.realisedPL||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
              <p class="text-[10px] text-gray-400">₹${(r.buyPrice||0).toFixed(2)} → ₹${(r.sellPrice||0).toFixed(2)}</p>
            </div>
          </div>
        </div>`;
      }).join('');
    }
  }

  document.getElementById('toggleRealisedBtn')?.addEventListener('click', () => {
    document.getElementById('realisedPanel')?.classList.toggle('hidden');
  });

  // ── Open asset detail sheet ──────────────────────────────────────────────
  function openAssetDetail(asset) {
    _activeAsset = asset;
    _activeRange = '1d';

    // Reset panels
    document.getElementById('avgCalcPanel')?.classList.add('hidden');
    document.getElementById('sellPanel')?.classList.add('hidden');
    document.getElementById('avgCalcChevron').textContent = '▼';
    document.getElementById('sellChevron').textContent    = '▼';
    document.getElementById('avgCalcResult')?.classList.add('hidden');
    document.getElementById('avgCalcApplyBtn')?.classList.add('hidden');
    document.getElementById('sellSummary')?.classList.add('hidden');
    const spEl = document.getElementById('sellPrice'); if (spEl) spEl.value='';
    const aqEl = document.getElementById('avgCalcQty'); if (aqEl) aqEl.value='';
    const apEl = document.getElementById('avgCalcPrice'); if (apEl) apEl.value='';

    const cache = getCache();
    const live  = cache[asset.id];
    const qty   = asset.qty || 1;
    const buy   = asset.buyPrice || 0;
    const price = live?.price ?? asset.currentPrice ?? buy;
    const curr  = qty * price;
    const inv   = qty * buy;
    const pl    = curr - inv;
    const plPct = inv > 0 ? (pl/inv)*100 : 0;
    const isPos = pl >= 0;
    const tax   = taxLabel(asset.purchaseDate, asset.category);

    // XIRR
    let xirrText = '—';
    if (asset.purchaseDate && inv > 0) {
      const r = xirrCalc([-inv, curr], [new Date(asset.purchaseDate), new Date()]);
      const f = formatXIRR(r);
      if (f) xirrText = `XIRR: ${f}`;
    }

    document.getElementById('assetDetailName').textContent      = asset.name;
    document.getElementById('assetDetailValue').textContent     = `₹${curr.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('assetDetailInvested').textContent  = `₹${inv.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('assetDetailQty').textContent       = qty.toLocaleString('en-IN');
    document.getElementById('assetDetailAvg').textContent       = `₹${buy.toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    document.getElementById('assetDetailBreakeven').textContent = `₹${buy.toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    document.getElementById('assetDetailXIRR').textContent      = xirrText;

    const plEl = document.getElementById('assetDetailPL');
    if (plEl) { plEl.textContent=`${isPos?'+':'-'}₹${Math.abs(pl).toLocaleString('en-IN',{maximumFractionDigits:0})}`; plEl.className=`font-semibold text-sm ${isPos?'text-green-500':'text-red-500'}`; }
    const plPEl = document.getElementById('assetDetailPLPct');
    if (plPEl) plPEl.textContent=`${isPos?'+':''}${plPct.toFixed(2)}% unrealised`;
    const taxBEl = document.getElementById('assetDetailTaxBadge');
    if (taxBEl) { taxBEl.textContent=tax.label; taxBEl.className=`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full mb-1 ${tax.cls}`; }

    const dayEl = document.getElementById('assetDetailDayChange');
    if (live?.dayChange!==undefined && dayEl) {
      dayEl.textContent=`${live.dayChange>=0?'+':''}₹${Math.abs(live.dayChange).toFixed(2)} (${(live.dayChangePct||0).toFixed(2)}%)`;
      dayEl.className=`text-sm font-semibold ${live.dayChange>=0?'text-green-500':'text-red-500'}`;
    } else if (dayEl) { dayEl.textContent='—'; dayEl.className='text-sm text-gray-400'; }
    const lpEl = document.getElementById('assetDetailLivePrice');
    if (lpEl) lpEl.textContent = live ? `₹${price.toLocaleString('en-IN',{maximumFractionDigits:2})}` : `₹${(asset.currentPrice||0).toLocaleString('en-IN',{maximumFractionDigits:2})} (manual)`;

    // Timeline
    const tl = holdingTimeline(asset.purchaseDate, asset.category);
    if (tl) {
      document.getElementById('assetTimelineBar').style.width = `${tl.pct}%`;
      document.getElementById('assetTimelineBar').style.background = tl.color;
      document.getElementById('assetTimelineBadge').textContent = tl.badgeText;
      document.getElementById('assetTimelineBadge').className   = `text-[9px] font-bold px-2 py-0.5 rounded-full ${tl.badgeCls}`;
      document.getElementById('assetTimelineLabel').textContent = tl.label;
    }

    // Tax info
    const tiEl = document.getElementById('assetDetailTaxInfo');
    if (tiEl) tiEl.textContent = taxHint(asset.purchaseDate, pl, asset.category)||'';

    // Chart range tabs reset
    document.querySelectorAll('.chart-range-btn').forEach(b=>{
      const a = b.dataset.range==='1d';
      b.className=`chart-range-btn flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${a?'bg-white dark:bg-gray-600 text-forest-900 dark:text-white shadow-sm':'text-gray-400 dark:text-gray-500'}`;
    });

    ui.openSheet(ui.assetDetailSheet);
    loadChart(asset, '1d');
  }

  // ── Price refresh ────────────────────────────────────────────────────────
  async function refreshAllPrices() {
    const btn = document.getElementById('wealthRefreshBtn');
    if (btn) btn.classList.add('animate-spin');
    const cache = getCache(); const now = Date.now(); const updates = [];
    await Promise.allSettled((store.assets||[]).map(async a => {
      try {
        const r = a.schemeCode ? await fetchMF(a.schemeCode) : a.ticker ? await fetchStock(a.ticker) : null;
        if (!r) return;
        cache[a.id] = { ...r, fetchedAt: now };
        updates.push(updateDoc(doc(db,'assets',a.id), { currentPrice: r.price }));
      } catch (err) { console.warn(`Price fail ${a.name}:`, err.message); }
    }));
    setCache(cache);
    await Promise.allSettled(updates);
    renderList(store.assets);
    updateStatusBar(now);
    if (btn) btn.classList.remove('animate-spin');
  }
  document.getElementById('wealthRefreshBtn')?.addEventListener('click', refreshAllPrices);

  // ── Status bar ───────────────────────────────────────────────────────────
  function updateStatusBar(lastTs) {
    const lEl = document.getElementById('wealthLastUpdated');
    const nEl = document.getElementById('wealthNextFetch');
    if (lastTs && lEl) {
      const d = new Date(lastTs);
      lEl.textContent = `Updated ${d.toLocaleDateString('en-IN',{month:'short',day:'numeric'})} ${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`;
    } else if (lEl) {
      lEl.textContent = 'Prices not fetched yet';
    }
    if (nEl && _nextFetchDate) {
      nEl.textContent = `Auto: Fri 3:30 PM (${_nextFetchDate.toLocaleDateString('en-IN',{month:'short',day:'numeric'})})`;
    }
  }

  // ── Render list ──────────────────────────────────────────────────────────
  store.subscribe(state => { if (state.isLoaded && list) renderList(state.assets); }, ['assets', 'debts']);

  function renderList(assets) {
    list.innerHTML = '';
    if (!assets?.length) {
      list.innerHTML='<p class="text-center text-forest-400 py-10 text-sm">No assets tracked.</p>';
      if(totEl) totEl.textContent='₹0'; return;
    }
    const cache = getCache();
    const processed = assets.map(a=>{
      const live  = cache[a.id];
      const price = live?.price ?? a.currentPrice ?? 0;
      const qty   = a.qty||1; const buy = a.buyPrice??price;
      const curr  = qty*price; const inv=qty*buy; const pl=curr-inv;
      const plPct = inv>0?(pl/inv)*100:0;
      return {...a, price, curr, inv, pl, plPct, live};
    });

    const portVal  = processed.reduce((s,p)=>s+p.curr,0);
    const totalDebt= (store.debts||[]).reduce((s,d)=>s+Math.max(0,d.principal-(d.paid||0)),0);
    if(totEl) totEl.textContent=`₹${(portVal-totalDebt).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('wealthAssetsTotal').textContent=`₹${portVal.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('wealthDebtTotal').textContent=`₹${totalDebt.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('wealthPortfolioVal').textContent=`₹${portVal.toLocaleString('en-IN',{maximumFractionDigits:0})}`;

    // Portfolio XIRR (aggregate cashflows)
    const allCFs=[]; const allDts=[];
    processed.forEach(p=>{ if(p.purchaseDate&&p.inv>0){ allCFs.push(-p.inv); allDts.push(new Date(p.purchaseDate)); } });
    if(allCFs.length){ allCFs.push(portVal); allDts.push(new Date()); }
    const portXIRR = allCFs.length>1 ? xirrCalc(allCFs,allDts) : null;
    const dayPLEl  = document.getElementById('wealthDayPL');
    const totDayPL = processed.reduce((s,p)=>s+(p.live?.dayChange?(p.live.dayChange*(p.qty||1)):0),0);
    if(dayPLEl&&totDayPL!==0){ dayPLEl.textContent=`${totDayPL>=0?'+':''}₹${Math.abs(totDayPL).toLocaleString('en-IN',{maximumFractionDigits:0})}`; dayPLEl.className=`font-semibold ${totDayPL>=0?'text-green-500':'text-red-500'}`; }
    // Show portfolio XIRR in status area
    const xirrPortEl = document.getElementById('wealthPortfolioVal')?.parentElement;
    if (portXIRR !== null && formatXIRR(portXIRR)) {
      let xirrSpan = document.getElementById('wealthPortXIRR');
      if (!xirrSpan) { xirrSpan = document.createElement('span'); xirrSpan.id='wealthPortXIRR'; xirrSpan.className='text-gray-400'; xirrPortEl?.appendChild(xirrSpan); }
      xirrSpan.textContent = ` · XIRR ${formatXIRR(portXIRR)}`;
    }

    // Group by category
    const groups={};
    processed.forEach(p=>{ (groups[p.category||'Other']??=[]).push(p); });
    Object.entries(groups).forEach(([cat,items])=>{
      const catTotal=items.reduce((s,i)=>s+i.curr,0);
      const catCls=catColors[cat]||catColors['Other'];
      list.innerHTML+=`<div class="flex items-center gap-2 mt-2 mb-1"><span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${catCls}">${cat}</span><span class="text-[11px] text-gray-400 font-semibold">₹${catTotal.toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>`;
      items.forEach(p=>{
        const isPos = p.pl>=0;
        const tax   = taxLabel(p.purchaseDate, p.category);
        const tl    = holdingTimeline(p.purchaseDate, p.category);
        const liveDot = p.live ? '🟢' : '⚪';
        const dayBadge = p.live?.dayChangePct!==undefined
          ? `<span class="text-[9px] ${p.live.dayChangePct>=0?'text-green-500':'text-red-500'}">${p.live.dayChangePct>=0?'▲':'▼'}${Math.abs(p.live.dayChangePct).toFixed(2)}%</span>` : '';
        // XIRR per card
        let cardXIRR='';
        if(p.purchaseDate&&p.inv>0){ const r=xirrCalc([-p.inv,p.curr],[new Date(p.purchaseDate),new Date()]); const f=formatXIRR(r); if(f) cardXIRR=`<span class="text-[9px] text-amber-500 font-bold">XIRR ${f}</span>`; }
        // Timeline badge on card
        const tlBadge = tl && !tl.past && tl.remaining<=90
          ? `<span class="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold">⏱${tl.remaining}d</span>` : '';
        list.innerHTML+=`
          <div data-id="${p.id}" class="asset-card cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 active:scale-[0.98]">
            <div class="flex justify-between items-start">
              <div class="min-w-0 flex-1 mr-3">
                <p class="font-semibold text-forest-900 dark:text-white flex items-center gap-1 flex-wrap">
                  <span class="truncate max-w-[140px]">${p.name}</span>
                  <span class="text-[8px]">${liveDot}</span>
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${tax.cls}">${tax.label}</span>
                  ${tlBadge}
                </p>
                <p class="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1.5">${p.qty} units · Avg ₹${(p.buyPrice||0).toFixed(2)} ${dayBadge}</p>
                <p class="text-[10px] mt-0.5">${cardXIRR}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="font-display font-bold text-lg dark:text-white tabular-nums">₹${p.curr.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
                <p class="text-[10px] font-semibold ${isPos?'text-green-500':'text-red-500'} mt-0.5">${isPos?'+':'-'}₹${Math.abs(p.pl).toLocaleString('en-IN',{maximumFractionDigits:0})} (${isPos?'+':''}${p.plPct.toFixed(1)}%)</p>
                <p class="text-[9px] text-gray-400">inv ₹${p.inv.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
              </div>
            </div>
          </div>`;
      });
    });

    const allTs = Object.values(cache).map(x=>x.fetchedAt).filter(Boolean);
    if(allTs.length) updateStatusBar(Math.max(...allTs));
  }

  // ── Card click ───────────────────────────────────────────────────────────
  list?.addEventListener('click', e=>{
    const card = e.target.closest('.asset-card'); if(!card) return;
    const asset = store.assets.find(a=>a.id===card.dataset.id);
    if(asset) openAssetDetail(asset);
  });

  // ── Sort dropdown ────────────────────────────────────────────────────────
  if(list && !document.getElementById('wealthSortSelect')){
    list.insertAdjacentHTML('beforebegin',`<div class="flex justify-end mb-2"><select id="wealthSortSelect" class="bg-forest-50 dark:bg-gray-800 text-forest-900 dark:text-white text-xs font-semibold p-2 rounded-lg outline-none shadow-sm"><option value="valueDesc">Highest Value</option><option value="plDesc">Highest P&L %</option><option value="nameAsc">Name A-Z</option></select></div>`);
    document.getElementById('wealthSortSelect')?.addEventListener('change',()=>renderList(store.assets));
  }

  // ── Store subscriber — handles both assets and realisedGains ─────────────
  store.subscribe(state => {
    if (!state.isLoaded || !list) return;
    renderList(state.assets);
    renderRealisedGains();
  }, ['assets', 'realisedGains', 'debts']);

  // ── FAB ─────────────────────────────────────────────────────────────────
  document.getElementById('wealthFabBtn')?.addEventListener('click',()=>{
    document.dispatchEvent(new Event('resetAssetForm')); ui.openSheet(ui.assetForm);
  });

  // ── Init — schedule auto-fetch ONCE, show status bar ─────────────────────
  scheduleAutoFetch(() => refreshAllPrices());
  setTimeout(() => updateStatusBar(null), 50); // give _nextFetchDate time to be set
  const cachedTs = Object.values(getCache()).map(x=>x.fetchedAt).filter(Boolean);
  if (cachedTs.length) updateStatusBar(Math.max(...cachedTs));
}

// ── Kite Tradebook Import ────────────────────────────────────────────────────
export function initKiteImport(ui) {
  // Gold ETF symbols — auto-categorise as 'Gold' instead of 'Equity'
  const GOLD_TICKERS = new Set(['GOLDBEES','GOLDIETF','SGOLD','AXISGOLD','GOLDETF','HDFCGOLD','BSLGOLDETF','KOTAKGOLD','NIFTYBEES']);

  function detectCategory(symbol) {
    return GOLD_TICKERS.has(symbol) ? 'Gold' : 'Equity';
  }

  let _allTrades = []; // accumulated across multiple uploaded files
  let _preview   = null; // { holdings, gains }
  let _activeTab = 'holdings'; // 'holdings' | 'gains'

  // ── Parse one file (XLSX or CSV) via SheetJS ──────────────────────────────
  async function parseFile(file) {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS library not loaded. Refresh the page and try again.');
    const buf = await file.arrayBuffer();
    const wb  = file.name.endsWith('.csv')
      ? XLSX.read(new TextDecoder().decode(buf), { type: 'string', cellDates: true })
      : XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });

    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

    // Find the data header row (contains 'Symbol' and 'Trade Type')
    let headerIdx = -1;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const norm = rows[i].map(c => String(c).toLowerCase().replace(/\s+/g, ''));
      if (norm.some(c => c === 'symbol') && norm.some(c => c.includes('tradetype'))) {
        headerIdx = i; break;
      }
    }
    if (headerIdx < 0) throw new Error(`No Kite tradebook header found in "${file.name}". Make sure you export from Kite → Console → Reports → Tradebook.`);

    const hdrs   = rows[headerIdx].map(c => String(c).toLowerCase().replace(/\s+/g, ''));
    const findCol = (...keys) => { for (const k of keys) { const i = hdrs.findIndex(h => h.includes(k)); if (i >= 0) return i; } return -1; };
    const symCol  = findCol('symbol');
    const dateCol = findCol('tradedate', 'date');
    const typeCol = findCol('tradetype', 'type');
    const qtyCol  = findCol('quantity', 'qty');
    const priceCol = findCol('price');

    if ([symCol, dateCol, typeCol, qtyCol, priceCol].some(c => c < 0))
      throw new Error(`Could not map columns in "${file.name}". Expected: Symbol, Trade Date, Trade Type, Quantity, Price.`);

    const trades = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row  = rows[i];
      const sym  = String(row[symCol]||'').trim().toUpperCase();
      if (!sym) continue;
      const qty  = parseFloat(String(row[qtyCol]||'').replace(/,/g,'')) || 0;
      const price = parseFloat(String(row[priceCol]||'').replace(/,/g,'')) || 0;
      const type = String(row[typeCol]||'').toLowerCase().trim();
      if (!qty || !price || !['buy','sell'].includes(type)) continue;
      const date = new Date(String(row[dateCol]||''));
      if (isNaN(date.getTime())) continue;
      trades.push({ symbol: sym, date, type, qty, price });
    }
    return trades;
  }

  // ── Aggregate trades → active holdings + realized gains ───────────────────
  function aggregateTrades(allTrades) {
    const bySymbol = {};
    allTrades.forEach(t => { (bySymbol[t.symbol] = bySymbol[t.symbol] || []).push(t); });

    const holdings = [], gains = [];

    for (const [symbol, trades] of Object.entries(bySymbol)) {
      trades.sort((a, b) => a.date - b.date);

      let runQty = 0, runCost = 0, avgPrice = 0, firstBuyDate = null;
      let totalSellQty = 0, totalSellRevenue = 0, totalCostSold = 0, lastSellDate = null;

      for (const t of trades) {
        if (t.type === 'buy') {
          if (!firstBuyDate || runQty <= 0) firstBuyDate = firstBuyDate || t.date;
          runCost  += t.qty * t.price;
          runQty   += t.qty;
          avgPrice  = runQty > 0 ? runCost / runQty : 0;
        } else {
          const costSold     = avgPrice * t.qty;
          totalCostSold     += costSold;
          totalSellRevenue  += t.qty * t.price;
          totalSellQty      += t.qty;
          runCost   -= costSold;
          runQty    -= t.qty;
          lastSellDate = t.date;
          if (runQty < 0.001) { runQty = 0; runCost = 0; }
        }
      }

      if (runQty > 0.001) {
        holdings.push({
          symbol, category: detectCategory(symbol),
          qty:         Math.round(runQty * 10000) / 10000,
          avgBuyPrice: Math.round(avgPrice * 100) / 100,
          purchaseDate: firstBuyDate,
        });
      }
      if (totalSellQty > 0.001) {
        const realisedPL   = totalSellRevenue - totalCostSold;
        const avgSell      = totalSellRevenue / totalSellQty;
        const avgCostSold  = totalCostSold    / totalSellQty;
        gains.push({
          symbol, category: detectCategory(symbol),
          qty:          Math.round(totalSellQty * 10000) / 10000,
          avgBuyPrice:  Math.round(avgCostSold * 100) / 100,
          avgSellPrice: Math.round(avgSell * 100) / 100,
          realisedPL:   Math.round(realisedPL * 100) / 100,
          purchaseDate: firstBuyDate,
          sellDate:     lastSellDate,
        });
      }
    }

    holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
    gains.sort((a, b) => b.realisedPL - a.realisedPL);
    return { holdings, gains };
  }

  // ── Render preview ────────────────────────────────────────────────────────
  function renderPreview({ holdings, gains }) {
    document.getElementById('kiteHoldingCount').textContent  = holdings.length;
    document.getElementById('kiteGainCount').textContent     = gains.length;
    document.getElementById('kiteTradeCount').textContent    = _allTrades.length;
    document.getElementById('kiteHoldingsBadge').textContent = `(${holdings.length})`;
    document.getElementById('kiteGainsBadge').textContent    = `(${gains.length})`;

    const hl = document.getElementById('kiteHoldingsList');
    hl.innerHTML = holdings.length
      ? holdings.map((h, i) => {
          const pd  = h.purchaseDate ? h.purchaseDate.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—';
          const inv = (h.qty * h.avgBuyPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 });
          const catCol = h.category === 'Gold' ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400';
          return `<label class="flex items-start gap-3 bg-forest-50 dark:bg-gray-700/50 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" class="kiteHoldingChk mt-0.5 accent-emerald-500 w-4 h-4 flex-shrink-0" data-idx="${i}" checked>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="font-semibold text-sm dark:text-white">${h.symbol}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400 tabular-nums">₹${inv}</span>
              </div>
              <div class="flex flex-wrap gap-x-2 mt-0.5 text-[10px]">
                <span class="${catCol} font-medium">${h.category}</span>
                <span class="text-gray-400">${h.qty} units · Avg ₹${h.avgBuyPrice}</span>
                <span class="text-gray-400">${pd}</span>
              </div>
            </div>
          </label>`;
        }).join('')
      : '<p class="text-center text-[12px] text-gray-400 py-6">No active holdings detected</p>';

    const gl = document.getElementById('kiteGainsList');
    gl.innerHTML = gains.length
      ? gains.map((g, i) => {
          const isPos = g.realisedPL >= 0;
          const sd  = g.sellDate ? g.sellDate.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—';
          const tax = taxLabel(g.purchaseDate?.toISOString?.(), g.category);
          const taxCol = tax.isLTCG ? 'text-green-500' : 'text-amber-500';
          return `<label class="flex items-start gap-3 bg-forest-50 dark:bg-gray-700/50 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" class="kiteGainChk mt-0.5 accent-emerald-500 w-4 h-4 flex-shrink-0" data-idx="${i}" checked>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="font-semibold text-sm dark:text-white">${g.symbol}</span>
                <span class="text-sm font-bold tabular-nums ${isPos ? 'text-green-500' : 'text-red-500'}">${isPos?'+':''}₹${Math.abs(g.realisedPL).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
              </div>
              <div class="flex flex-wrap gap-x-2 mt-0.5 text-[10px]">
                <span class="${taxCol} font-medium">${tax.label}</span>
                <span class="text-gray-400">${g.qty} units · ₹${g.avgBuyPrice}→₹${g.avgSellPrice}</span>
                <span class="text-gray-400">Sold ${sd}</span>
              </div>
            </div>
          </label>`;
        }).join('')
      : '<p class="text-center text-[12px] text-gray-400 py-6">No realized trades detected</p>';

    updateSelectionCount();
    document.getElementById('kiteUploadStep').classList.add('hidden');
    document.getElementById('kitePreviewStep').classList.remove('hidden');
    lucide?.createIcons?.();
  }

  function updateSelectionCount() {
    const hSel = document.querySelectorAll('.kiteHoldingChk:checked').length;
    const gSel = document.querySelectorAll('.kiteGainChk:checked').length;
    const el   = document.getElementById('kiteSelectionCount');
    if (el) el.textContent = `${hSel + gSel} selected (${hSel} holdings · ${gSel} gains)`;
  }

  // ── Batch Firestore import ────────────────────────────────────────────────
  async function doImport() {
    if (!_preview) return;
    const { holdings, gains } = _preview;

    const selH = [...document.querySelectorAll('.kiteHoldingChk:checked')].map(el => parseInt(el.dataset.idx));
    const selG = [...document.querySelectorAll('.kiteGainChk:checked')].map(el => parseInt(el.dataset.idx));
    if (!selH.length && !selG.length) { alert('Select at least one item to import.'); return; }

    const btn = document.getElementById('kiteConfirmBtn');
    btn.disabled = true;
    const total = selH.length + selG.length;
    let done = 0;
    const tick = () => { done++; btn.textContent = `Importing… ${done}/${total}`; };

    try {
      // ── Active holdings → assets collection ──
      for (const idx of selH) {
        const h = holdings[idx];
        await addDoc(collection(db, 'assets'), {
          name:         h.symbol,
          category:     h.category,
          ticker:       h.symbol,
          schemeCode:   '',
          qty:          h.qty,
          buyPrice:     h.avgBuyPrice,
          currentPrice: 0,
          purchaseDate: h.purchaseDate?.toISOString() || new Date().toISOString(),
          timestamp:    Date.now() + idx,
          importedFrom: 'kite',
        });
        tick();
      }

      // ── Realized gains → realisedGains collection ──
      for (const idx of selG) {
        const g   = gains[idx];
        const tax = taxLabel(g.purchaseDate?.toISOString?.(), g.category);
        await addDoc(collection(db, 'realisedGains'), {
          name:         g.symbol,
          category:     g.category,
          qty:          g.qty,
          buyPrice:     g.avgBuyPrice,
          sellPrice:    g.avgSellPrice,
          invested:     Math.round(g.qty * g.avgBuyPrice * 100) / 100,
          saleValue:    Math.round(g.qty * g.avgSellPrice * 100) / 100,
          realisedPL:   g.realisedPL,
          taxType:      tax.label,
          isLTCG:       tax.isLTCG,
          purchaseDate: g.purchaseDate?.toISOString?.() || '',
          sellDate:     g.sellDate?.toISOString?.() || '',
          timestamp:    g.sellDate?.getTime?.() || Date.now(),
          importedFrom: 'kite',
        });
        tick();
      }

      btn.textContent = `✅ ${total} records imported!`;
      setTimeout(() => { ui.closeAll(); resetImport(); }, 2000);
    } catch (err) {
      console.error('Kite import failed:', err);
      btn.disabled = false;
      btn.textContent = 'Import Failed — Retry';
      alert('Import error: ' + err.message);
    }
  }

  // ── Reset to upload step ──────────────────────────────────────────────────
  function resetImport() {
    _allTrades = []; _preview = null; _activeTab = 'holdings';
    const fi = document.getElementById('kiteFileInput'); if (fi) fi.value = '';
    const fl = document.getElementById('kiteFileList');
    if (fl) { fl.innerHTML = ''; fl.classList.add('hidden'); }
    const pm = document.getElementById('kiteParseMsg');
    if (pm) { pm.textContent = ''; pm.classList.add('hidden'); pm.className = 'text-center text-[12px] text-gray-400 hidden'; }
    document.getElementById('kiteUploadStep')?.classList.remove('hidden');
    document.getElementById('kitePreviewStep')?.classList.add('hidden');
    const btn = document.getElementById('kiteConfirmBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Import Selected'; }
    setActiveTab('holdings');
  }

  function setActiveTab(tab) {
    _activeTab = tab;
    const hl   = document.getElementById('kiteHoldingsList');
    const gl   = document.getElementById('kiteGainsList');
    const hBtn = document.getElementById('kiteHoldingsTabBtn');
    const gBtn = document.getElementById('kiteGainsTabBtn');
    const activeClass   = ['bg-white','dark:bg-gray-600','text-forest-900','dark:text-white','shadow-sm'];
    const inactiveClass = ['text-gray-400'];
    if (tab === 'holdings') {
      hl?.classList.remove('hidden'); gl?.classList.add('hidden');
      hBtn?.classList.add(...activeClass);    hBtn?.classList.remove(...inactiveClass);
      gBtn?.classList.remove(...activeClass); gBtn?.classList.add(...inactiveClass);
    } else {
      gl?.classList.remove('hidden'); hl?.classList.add('hidden');
      gBtn?.classList.add(...activeClass);    gBtn?.classList.remove(...inactiveClass);
      hBtn?.classList.remove(...activeClass); hBtn?.classList.add(...inactiveClass);
    }
  }

  // ── Handle file(s) ────────────────────────────────────────────────────────
  async function handleFiles(files) {
    const valid = [...files].filter(f => /\.(xlsx|csv)$/i.test(f.name));
    if (!valid.length) { alert('Please select a Kite Tradebook XLSX or CSV file.'); return; }

    const pm = document.getElementById('kiteParseMsg');
    const fl = document.getElementById('kiteFileList');
    pm.textContent = `Parsing ${valid.length} file${valid.length > 1 ? 's' : ''}…`;
    pm.className = 'text-center text-[12px] text-gray-400';
    pm.classList.remove('hidden');

    for (const file of valid) {
      try {
        const trades = await parseFile(file);
        _allTrades.push(...trades);
        fl.classList.remove('hidden');
        fl.insertAdjacentHTML('beforeend', `
          <div class="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl px-3 py-2 text-[11px]">
            <i data-lucide="file-check" class="w-3.5 h-3.5 flex-shrink-0"></i>
            <span class="flex-1 truncate font-medium">${file.name}</span>
            <span class="font-bold">${trades.length} trades</span>
          </div>`);
        lucide?.createIcons?.();
      } catch (err) {
        pm.textContent = `❌ ${err.message}`;
        pm.className = 'text-center text-[12px] text-red-500';
        return;
      }
    }

    pm.textContent = `✅ ${_allTrades.length} trades loaded — building preview…`;
    await new Promise(r => setTimeout(r, 300));
    _preview = aggregateTrades(_allTrades);
    renderPreview(_preview);
  }

  // ── Wire events ───────────────────────────────────────────────────────────
  const dropZone  = document.getElementById('kiteDropZone');
  const fileInput = document.getElementById('kiteFileInput');

  dropZone?.addEventListener('click', () => fileInput?.click());
  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('border-emerald-400','bg-emerald-50/50','dark:bg-emerald-900/10'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('border-emerald-400','bg-emerald-50/50','dark:bg-emerald-900/10'));
  dropZone?.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('border-emerald-400','bg-emerald-50/50','dark:bg-emerald-900/10');
    await handleFiles(e.dataTransfer.files);
  });
  fileInput?.addEventListener('change', async () => { if (fileInput.files.length) await handleFiles(fileInput.files); });

  document.getElementById('kiteHoldingsTabBtn')?.addEventListener('click', () => setActiveTab('holdings'));
  document.getElementById('kiteGainsTabBtn')?.addEventListener('click',    () => setActiveTab('gains'));
  document.getElementById('kiteResetBtn')?.addEventListener('click',       resetImport);
  document.getElementById('kiteConfirmBtn')?.addEventListener('click',     doImport);

  document.getElementById('kiteSelectAllBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.kiteHoldingChk,.kiteGainChk').forEach(el => { el.checked = true; });
    updateSelectionCount();
  });
  document.getElementById('kiteDeselectAllBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.kiteHoldingChk,.kiteGainChk').forEach(el => { el.checked = false; });
    updateSelectionCount();
  });
  document.getElementById('kiteHoldingsList')?.addEventListener('change', updateSelectionCount);
  document.getElementById('kiteGainsList')?.addEventListener('change', updateSelectionCount);

  document.getElementById('kiteImportBtn')?.addEventListener('click', () => {
    resetImport();
    ui.openSheet(document.getElementById('kiteImportSheet'));
  });
}
