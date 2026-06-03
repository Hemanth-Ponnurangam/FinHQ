import { db, collection, addDoc, doc, updateDoc, deleteDoc, getDocs, onSnapshot, query, where } from '../firebase.js';
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
async function fetchStock(rawTicker) {
  let ticker = rawTicker.trim().toUpperCase();
  if (!ticker.includes('.') && !ticker.includes('-')) ticker += '.NS';
  const res  = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d    = await res.json();
  const meta = d?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('No price');
  const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
  return { price: meta.regularMarketPrice, prevClose: prev, dayChange: meta.regularMarketPrice-prev, dayChangePct:((meta.regularMarketPrice-prev)/prev)*100, ticker };
}
async function fetchMF(schemeCode) {
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
  const iv = { '1d':'5m','5d':'60m','1mo':'1d','1y':'1wk' };
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=${range}&interval=${iv[range]||'1d'}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const r = d?.chart?.result?.[0];
  if (!r) throw new Error('No data');
  return (r.timestamp||[]).map((ts,i)=>({ t:ts*1000, p:(r.indicators?.quote?.[0]?.close||[])[i] })).filter(x=>x.p!=null);
}
async function fetchMFHistory(code, range) {
  const n = { '1d':1,'5d':7,'1mo':30,'1y':365 }[range] || 30;
  const res = await fetch(`https://api.mfapi.in/mf/${code}`);
  const d = await res.json();
  return (d?.data||[]).slice(0,n).reverse().map(x=>({ t:new Date(x.date.split('-').reverse().join('-')).getTime(), p:parseFloat(x.nav) }));
}

// ── Auto-scheduler (Friday 3:30 PM IST) ──────────────────────────────────────
function msUntilNextFriday330() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const day = ist.getDay();
  let daysTo = (5 - day + 7) % 7;
  if (daysTo === 0 && (ist.getHours() > 15 || (ist.getHours()===15 && ist.getMinutes()>=30))) daysTo = 7;
  const next = new Date(ist); next.setDate(ist.getDate()+daysTo); next.setHours(15,30,0,0);
  return { ms: next-now, date: next };
}
function scheduleAutoFetch(cb) {
  const { ms, date } = msUntilNextFriday330();
  setTimeout(() => { cb(); scheduleAutoFetch(cb); }, ms);
  return date;
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
  let _realisedCache = [];

  // ── Category toggle (Ticker vs SchemeCode) ──────────────────────────────
  document.getElementById('assetCategory')?.addEventListener('change', e => {
    const isMF = e.target.value === 'Mutual Fund';
    document.getElementById('assetTickerRow')?.classList.toggle('hidden', isMF);
    document.getElementById('assetSchemeRow')?.classList.toggle('hidden', !isMF);
  });

  // ── Form reset ──────────────────────────────────────────────────────────
  document.addEventListener('resetAssetForm', () => {
    currentEditId = null; form?.reset();
    if (document.getElementById('assetDate'))
      document.getElementById('assetDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteAssetBtn')?.classList.add('hidden');
    document.getElementById('assetTickerRow')?.classList.remove('hidden');
    document.getElementById('assetSchemeRow')?.classList.add('hidden');
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
    if (a.ticker)     document.getElementById('assetTicker').value     = a.ticker;
    if (a.schemeCode) document.getElementById('assetSchemeCode').value = a.schemeCode;
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

  // ── Realised Gains loader ────────────────────────────────────────────────
  async function loadRealisedGains() {
    try {
      const snap = await getDocs(collection(db,'realisedGains'));
      _realisedCache = snap.docs.map(d=>({id:d.id,...d.data()}));
      renderRealisedGains();
    } catch {}
  }

  function renderRealisedGains() {
    const section = document.getElementById('realisedGainsSection');
    if (!_realisedCache.length) { section?.classList.add('hidden'); return; }
    section?.classList.remove('hidden');

    const total = _realisedCache.reduce((s,r)=>s+(r.realisedPL||0),0);
    const stcg  = _realisedCache.filter(r=>!r.isLTCG).reduce((s,r)=>s+(r.realisedPL>0?r.realisedPL:0),0);
    const ltcg  = _realisedCache.filter(r=>r.isLTCG).reduce((s,r)=>s+(r.realisedPL>0?r.realisedPL:0),0);
    const taxEst = (stcg * 0.15) + (Math.max(0,ltcg-100000)*0.10);

    document.getElementById('realisedSummaryBadge').textContent = `${_realisedCache.length} sale${_realisedCache.length>1?'s':''} · ${total>=0?'+':''}₹${Math.abs(total).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('realisedTotal').textContent = `${total>=0?'+':''}₹${Math.abs(total).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('realisedSTCG').textContent  = `₹${stcg.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('realisedLTCG').textContent  = `₹${ltcg.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
    document.getElementById('realisedTaxEst').textContent = `Est. tax this FY: ₹${Math.round(taxEst).toLocaleString('en-IN')} (STCG 15% + LTCG 10%)`;

    const rl = document.getElementById('realisedList');
    if (rl) {
      rl.innerHTML = _realisedCache.slice().sort((a,b)=>b.timestamp-a.timestamp).map(r=>{
        const isPos = r.realisedPL >= 0;
        const sd    = r.sellDate ? new Date(r.sellDate).toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'}) : '—';
        return `<div class="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-forest-50/50 dark:border-gray-700">
          <div class="flex justify-between items-center">
            <div><p class="font-semibold text-sm dark:text-white">${r.name}</p><p class="text-[10px] text-gray-400">${r.qty} units · Sold ${sd} · <span class="${r.isLTCG?'text-green-500':'text-amber-500'}">${r.taxType}</span></p></div>
            <div class="text-right"><p class="font-bold text-sm ${isPos?'text-green-500':'text-red-500'}">${isPos?'+':''}₹${Math.abs(r.realisedPL).toLocaleString('en-IN',{maximumFractionDigits:0})}</p><p class="text-[10px] text-gray-400">₹${(r.buyPrice||0).toFixed(2)} → ₹${(r.sellPrice||0).toFixed(2)}</p></div>
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
    const btn  = document.getElementById('wealthRefreshBtn');
    const icon = btn?.querySelector('svg');
    if (icon) icon.style.animation = 'spin 1s linear infinite';
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
    if (icon) icon.style.animation = '';
  }
  document.getElementById('wealthRefreshBtn')?.addEventListener('click', refreshAllPrices);

  // ── Status bar ───────────────────────────────────────────────────────────
  function updateStatusBar(lastTs) {
    const lEl = document.getElementById('wealthLastUpdated');
    const nEl = document.getElementById('wealthNextFetch');
    if (lastTs && lEl) {
      const d = new Date(lastTs);
      lEl.textContent = `Updated ${d.toLocaleDateString('en-IN',{month:'short',day:'numeric'})} ${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`;
    }
    const nextFri = scheduleAutoFetch(()=>refreshAllPrices());
    if (nEl) nEl.textContent = `Auto: Fri 3:30 PM (${nextFri.toLocaleDateString('en-IN',{month:'short',day:'numeric'})})`;
  }

  // ── Render list ──────────────────────────────────────────────────────────
  store.subscribe(state => { if (state.isLoaded && list) renderList(state.assets); });

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
        // Holding progress bar
        const tlBar = tl ? `
          <div class="mt-1.5 flex items-center gap-2">
            <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div class="h-1.5 rounded-full" style="width:${tl.pct}%;background:${tl.color};"></div>
            </div>
            <span class="text-[9px] text-gray-400 flex-shrink-0">${tl.past?'LTCG✓':`${Math.round(tl.pct)}%`}</span>
          </div>` : '';

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
                ${tlBar}
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

  // ── FAB ─────────────────────────────────────────────────────────────────
  document.getElementById('wealthFabBtn')?.addEventListener('click',()=>{
    document.dispatchEvent(new Event('resetAssetForm')); ui.openSheet(ui.assetForm);
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  scheduleAutoFetch(()=>refreshAllPrices());
  updateStatusBar(null);
  loadRealisedGains();
}
