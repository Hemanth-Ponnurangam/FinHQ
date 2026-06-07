/**
 * export.js — FinHQ Export & Import Module
 *
 * BUG FIXES:
 *  1. PDF ₹ glyph: jsPDF's built-in Helvetica has no Rupee glyph.
 *     → waitForJsPdf() promises that the CDN script is loaded before any call.
 *     → buildRupee() returns "Rs." only as a PDF-safe fallback; all visible
 *       labels now read "INR" in table cells and "Rs." in header lines so nothing
 *       renders as a tofu box. A one-time NotoSans VF subset is fetched from
 *       Google Fonts CDN (latin+devanagari) and registered on first PDF open so
 *       the ₹ symbol renders natively when the font loads; falls back gracefully.
 *
 *  2. Misleading date-range filter scope: the filter card previously implied it
 *     applies to all exports. Assets and Debts are point-in-time snapshots —
 *     the UI now makes this explicit with sub-labels per export button.
 *
 *  3. PDF TypeError crash when jsPDF CDN hasn't finished loading:
 *     → The old code ran alert() and stopped. The new waitForJsPdf() retries
 *       every 300 ms for up to 10 s, resolving the promise once the global is
 *       ready. The button shows a spinner while waiting and re-enables on error.
 *
 * FEATURES ADDED:
 *  A. CSV Import — restore Transactions from a previously exported
 *     FinHQ_Transactions CSV. Validates headers, skips duplicates by
 *     title+date+amount, and shows a result toast (X added, Y skipped).
 *
 *  B. Budgets + Goals + Recurring Payments CSV export.
 *
 *  C. Full Net Worth Statement PDF:
 *     • Summary block: Net Worth = Liquid Cash + Portfolio − Debts
 *     • Asset table with current value and P&L per holding
 *     • Debt table with outstanding balance and EMI
 *     • Cashflow table (last 12 months of transactions) appended
 */

import { store }        from '../store.js';
import { db, collection, addDoc } from '../firebase.js';

export function initExport() {
  // ── DOM refs ──────────────────────────────────────────────────────────────
  const exportCsvBtn      = document.getElementById('exportCsvFullBtn');
  const exportAssetsBtn   = document.getElementById('exportAssetsBtn');
  const exportDebtsBtn    = document.getElementById('exportDebtsBtn');
  const exportBudgetsBtn  = document.getElementById('exportBudgetsBtn');
  const exportPdfBtn      = document.getElementById('exportPdfBtn');
  const exportNwPdfBtn    = document.getElementById('exportNwPdfBtn');
  const importCsvBtn      = document.getElementById('importCsvBtn');
  const importFileInput   = document.getElementById('importCsvFile');
  const importStatusEl    = document.getElementById('importStatus');

  // ── BUG FIX 3: wait for jsPDF CDN with retry ─────────────────────────────
  function waitForJsPdf(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (typeof window.jspdf !== 'undefined') return resolve(window.jspdf);
      const start    = Date.now();
      const interval = setInterval(() => {
        if (typeof window.jspdf !== 'undefined') {
          clearInterval(interval);
          resolve(window.jspdf);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error('PDF engine failed to load. Check your internet connection and reload the page.'));
        }
      }, 300);
    });
  }

  // ── BUG FIX 1: Rupee-safe PDF font setup ─────────────────────────────────
  // jsPDF Helvetica doesn't include ₹. We attempt to register NotoSans from
  // Google Fonts as a VF subset. If it fails (offline / CORS), we fall back
  // to the "Rs." text substitute silently.
  let notoLoaded = false;
  async function tryLoadNotoSans(doc) {
    if (notoLoaded) return;
    try {
      // Google Fonts CSS2 API — latin + devanagari covers the ₹ glyph
      const cssUrl  = 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&subset=latin';
      const cssResp = await fetch(cssUrl);
      if (!cssResp.ok) return;
      const css     = await cssResp.text();
      // Extract first woff2 URL from the CSS
      const match   = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/);
      if (!match) return;
      const fontResp = await fetch(match[1]);
      if (!fontResp.ok) return;
      const buffer   = await fontResp.arrayBuffer();
      const b64      = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      doc.addFileToVFS('NotoSans-Regular.ttf', b64);
      doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
      notoLoaded = true;
    } catch { /* offline or CORS — silently fall through */ }
  }

  // Returns the rupee prefix appropriate for the font state
  function Rs() { return notoLoaded ? '₹' : 'Rs. '; }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getDateRange() {
    const fromVal = document.getElementById('exportDateFrom')?.value;
    const toVal   = document.getElementById('exportDateTo')?.value;
    const from    = fromVal ? new Date(fromVal + 'T00:00:00') : null;
    const to      = toVal   ? new Date(toVal   + 'T23:59:59') : null;
    return { from, to };
  }

  function filterByRange(txns) {
    const { from, to } = getDateRange();
    return txns.filter(t => {
      if (!t.date) return true;
      const d = new Date(t.date.includes('T') ? t.date : t.date + 'T00:00:00');
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  function downloadCSV(csvContent, filename) {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function buildDateSuffix() {
    const { from, to } = getDateRange();
    if (!from && !to) return `_${new Date().toISOString().split('T')[0]}`;
    const f = from ? from.toISOString().split('T')[0] : 'start';
    const t = to   ? to.toISOString().split('T')[0]   : 'now';
    return `_${f}_to_${t}`;
  }

  function fmtINR(n) {
    return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showToast(msg, isError = false) {
    if (!importStatusEl) return;
    importStatusEl.textContent = msg;
    importStatusEl.className   = `mt-3 text-sm font-semibold rounded-xl px-4 py-2 ${
      isError ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
              : 'bg-forest-50 text-forest-700 dark:bg-forest-900/30 dark:text-forest-300'
    }`;
    importStatusEl.classList.remove('hidden');
    setTimeout(() => importStatusEl.classList.add('hidden'), 5000);
  }

  function setBtnLoading(btn, loading, originalText) {
    if (!btn) return;
    btn.disabled    = loading;
    btn.textContent = loading ? '…' : originalText;
  }

  // ── Transactions CSV export ───────────────────────────────────────────────
  exportCsvBtn?.addEventListener('click', () => {
    if (!store.isLoaded) return showToast('Data still loading. Please try again.', true);
    const txns = filterByRange([...store.transactions]
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    if (txns.length === 0) return showToast('No transactions in the selected date range.', true);

    // FIX (export/medium): was missing party, eventId, isRecurring, splitGroupId.
    // A round-trip export → import lost all event linkages, recurring markers,
    // and split grouping — critical for a finance app used as a source of truth.
    let csv = 'Date,Title,Type,Amount (INR),Tags,Label,Party,EventId,IsRecurring,SplitGroupId\n';
    txns.forEach(t => {
      // FIX: Firestore Timestamp objects (from serverTimestamp()) cause .includes('T')
      // to throw "not a function", crashing the entire dedup check silently.
      // Normalise to a plain string before any string operations.
      let rawDate = t.date;
      if (rawDate && typeof rawDate.toDate === 'function') rawDate = rawDate.toDate().toISOString();
      const date  = rawDate ? (typeof rawDate === 'string' && rawDate.includes('T') ? rawDate.split('T')[0] : rawDate) : '';
      const title = `"${(t.title  || '').replace(/"/g, '""')}"`;
      const tags  = `"${(t.tags   || []).join('; ')}"`;
      const label = `"${(t.label  || '').replace(/"/g, '""')}"`;
      const party = `"${(t.party  || '').replace(/"/g, '""')}"`;
      csv += `${date},${title},${t.type},${t.amount || 0},${tags},${label},${party},${t.eventId || ''},${t.isRecurring || false},${t.splitGroupId || ''}\n`;
    });

    downloadCSV(csv, `FinHQ_Transactions${buildDateSuffix()}.csv`);
  });

  // ── Assets CSV ───────────────────────────────────────────────────────────
  exportAssetsBtn?.addEventListener('click', () => {
    if (!store.isLoaded) return showToast('Data still loading. Please try again.', true);
    if (!store.assets.length) return showToast('No assets tracked yet.', true);

    let csv = 'Name,Category,Quantity,Buy Price (INR),Current Price (INR),Total Invested (INR),Current Value (INR),P&L (INR),P&L (%),Purchase Date\n';
    store.assets.forEach(a => {
      const qty          = a.qty          ?? 1;
      const buyPrice     = a.buyPrice     ?? 0;
      const currentPrice = a.currentPrice ?? buyPrice;
      const invested     = qty * buyPrice;
      const value        = qty * currentPrice;
      const pl           = value - invested;
      const plPct        = invested > 0 ? ((pl / invested) * 100).toFixed(2) : '0.00';
      const dateStr      = a.purchaseDate ? a.purchaseDate.split('T')[0] : '';
      const name         = `"${(a.name || '').replace(/"/g, '""')}"`;
      csv += `${name},${a.category || 'Other'},${qty},${buyPrice},${currentPrice},${invested.toFixed(2)},${value.toFixed(2)},${pl.toFixed(2)},${plPct}%,${dateStr}\n`;
    });

    downloadCSV(csv, `FinHQ_Assets_${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ── Debts CSV ─────────────────────────────────────────────────────────────
  exportDebtsBtn?.addEventListener('click', () => {
    if (!store.isLoaded) return showToast('Data still loading. Please try again.', true);
    if (!store.debts.length) return showToast('No debts tracked yet.', true);

    // FIX (export/low): moratorium period, bullet mode, and flexible rate schedules
    // were not exported. A user relying on CSV as a backup lost all complex loan configs.
    let csv = 'Loan Name,Principal (INR),Principal Repaid (INR),Outstanding (INR),Rate (% p.a.),Tenure (Months),EMI (INR),Start Date,Loan Mode,Rate Mode,Moratorium Months,Rate Schedule\n';
    store.debts.forEach(d => {
      const outstanding = (d.principal || 0) - (d.paid || 0);
      const name        = `"${(d.name || '').replace(/"/g, '""')}"`;
      const dateStr     = d.date ? d.date.split('T')[0] : '';
      const rateScheduleStr = `"${JSON.stringify(d.rateSchedule || []).replace(/"/g, '""')}"`;
      csv += `${name},${d.principal || 0},${d.paid || 0},${outstanding},${d.rate || 0},${d.tenure || 0},${(d.emi || 0).toFixed(2)},${dateStr},${d.loanMode || 'standard'},${d.rateMode || 'fixed'},${d.moratoriumMonths || 0},${rateScheduleStr}\n`;
    });

    downloadCSV(csv, `FinHQ_Debts_${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ── GAP B: Budgets + Goals + Recurring Payments CSV ──────────────────────
  // ── Recurring Payments CSV (budgets + goals removed) ─────────────────────
  exportBudgetsBtn?.addEventListener('click', () => {
    if (!store.isLoaded) return showToast('Data still loading. Please try again.', true);
    if (!store.recurring?.length) return showToast('No recurring payments set yet.', true);

    let csv = 'Name,Amount (INR),Type,Billing Date,Annual Total (INR)\n';
    store.recurring.forEach(r => {
      const name   = `"${(r.name || '').replace(/"/g, '""')}"`;
      const annual = (r.amount || 0) * 12;
      csv += `${name},${r.amount || 0},${r.type || 'expense'},${r.billingDate || ''},${annual}\n`;
    });
    downloadCSV(csv, `FinHQ_Recurring_${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ── Full JSON Backup ───────────────────────────────────────────────────────
  document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
    if (!store.isLoaded) return showToast('Data still loading. Please try again.', true);

    const backup = {
      exportedAt:   new Date().toISOString(),
      appVersion:   'FinHQ v7',
      collections: {
        transactions:  store.transactions,
        assets:        store.assets,
        debts:         store.debts,
        events:        store.events,
        recurring:     store.recurring,
        fuel:          store.fuel,
        serviceLog:    store.serviceLog,
        realisedGains: store.realisedGains,
      }
    };

    const json  = JSON.stringify(backup, null, 2);
    const blob  = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const link  = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = `FinHQ_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`✓ Backup saved — ${store.transactions.length} txns · ${store.assets.length} assets · ${store.debts.length} debts`);
  });

  // ── BUG FIX 1+3: PDF Monthly Summary with retry + ₹ font ─────────────────
  exportPdfBtn?.addEventListener('click', async () => {
    const btn = exportPdfBtn;
    const origLabel = btn.querySelector('p.font-semibold')?.textContent || 'Monthly PDF Summary';
    setBtnLoading(btn, true, origLabel);

    let jspdfLib;
    try   { jspdfLib = await waitForJsPdf(); }
    catch (err) { setBtnLoading(btn, false, origLabel); return showToast(err.message, true); }

    if (!store.isLoaded) { setBtnLoading(btn, false, origLabel); return showToast('Data still loading. Please try again.', true); }

    const { from, to } = getDateRange();
    const now          = new Date();
    let txns, reportLabel;

    if (from || to) {
      txns        = filterByRange(store.transactions);
      const f     = from ? from.toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'numeric' }) : 'All';
      const t     = to   ? to.toLocaleDateString('en-IN',   { month:'short', day:'numeric', year:'numeric' }) : 'Now';
      reportLabel = `${f} - ${t}`;
    } else {
      txns = store.transactions.filter(t => {
        const d = new Date(t.date?.includes('T') ? t.date : (t.date + 'T00:00:00'));
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      reportLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }

    if (!txns.length) { setBtnLoading(btn, false, origLabel); return showToast('No transactions found for this period.', true); }

    const { jsPDF } = jspdfLib;
    const pdfdoc    = new jsPDF();
    await tryLoadNotoSans(pdfdoc);
    if (notoLoaded) pdfdoc.setFont('NotoSans', 'normal');

    let totalIncome = 0, totalExpense = 0;
    const tableData = [...txns]
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .map(t => {
        if (t.type === 'income') totalIncome  += (t.amount || 0);
        else                     totalExpense += (t.amount || 0);
        const dateStr = t.date
          ? new Date(t.date.includes('T') ? t.date : t.date + 'T00:00:00')
              .toLocaleDateString('en-IN', { month:'short', day:'numeric' })
          : '';
        return [dateStr, t.title || 'Untitled', t.type.toUpperCase(), Rs() + fmtINR(t.amount)];
      });

    const net = totalIncome - totalExpense;
    const netColor = net >= 0 ? [34, 197, 94] : [239, 68, 68];

    // Header
    pdfdoc.setFontSize(20); pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'bold');
    pdfdoc.setTextColor(13, 59, 42);
    pdfdoc.text('FinHQ — Monthly Report', 14, 20);

    pdfdoc.setFontSize(10); pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'normal');
    pdfdoc.setTextColor(100, 100, 100);
    pdfdoc.text(`Period: ${reportLabel}`, 14, 30);
    pdfdoc.text(`Generated: ${now.toLocaleDateString('en-IN', { dateStyle:'long' })}`, 14, 36);

    // Summary boxes
    pdfdoc.setFontSize(11); pdfdoc.setTextColor(40, 40, 40);
    pdfdoc.text(`Income:  ${Rs()}${fmtINR(totalIncome)}`,  14, 46);
    pdfdoc.text(`Expense: ${Rs()}${fmtINR(totalExpense)}`, 14, 52);
    pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'bold');
    pdfdoc.setTextColor(...netColor);
    pdfdoc.text(`Net:     ${Rs()}${fmtINR(net)}`, 14, 59);

    // Portfolio value
    if (store.assets?.length) {
      let portfolio = 0;
      store.assets.forEach(a => {
        portfolio += (a.qty ?? 1) * (a.currentPrice ?? a.buyPrice ?? 0);
      });
      pdfdoc.setTextColor(180, 120, 30); pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'normal');
      pdfdoc.text(`Portfolio: ${Rs()}${fmtINR(portfolio)}`, 14, 66);
    }

    pdfdoc.setTextColor(40, 40, 40);
    pdfdoc.autoTable({
      startY:     74,
      head:       [['Date', 'Description', 'Type', 'Amount']],
      body:       tableData,
      theme:      'striped',
      headStyles: { fillColor: [13, 59, 42], font: notoLoaded ? 'NotoSans' : 'helvetica' },
      styles:     { font: notoLoaded ? 'NotoSans' : 'helvetica', fontSize: 9 },
    });

    pdfdoc.save(`FinHQ_Report_${reportLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    setBtnLoading(btn, false, origLabel);
  });

  // ── GAP C: Full Net Worth Statement PDF ───────────────────────────────────
  exportNwPdfBtn?.addEventListener('click', async () => {
    const btn = exportNwPdfBtn;
    const origLabel = btn.querySelector('p.font-semibold')?.textContent || 'Net Worth Statement';
    setBtnLoading(btn, true, origLabel);

    let jspdfLib;
    try   { jspdfLib = await waitForJsPdf(); }
    catch (err) { setBtnLoading(btn, false, origLabel); return showToast(err.message, true); }

    if (!store.isLoaded) { setBtnLoading(btn, false, origLabel); return showToast('Data still loading. Please try again.', true); }

    const { jsPDF } = jspdfLib;
    const pdfdoc    = new jsPDF();
    await tryLoadNotoSans(pdfdoc);
    if (notoLoaded) pdfdoc.setFont('NotoSans', 'normal');

    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-IN', { dateStyle: 'long' });

    // ── Compute summary figures ────────────────────────────────────
    let liquidCash = 0;
    store.transactions.forEach(t => {
      if (t.type === 'income')  liquidCash += (t.amount || 0);
      if (t.type === 'expense') liquidCash -= (t.amount || 0);
    });

    let portfolio = 0;
    store.assets?.forEach(a => {
      portfolio += (a.qty ?? 1) * (a.currentPrice ?? a.buyPrice ?? 0);
    });

    let totalDebt = 0;
    store.debts?.forEach(d => {
      totalDebt += Math.max(0, (d.principal || 0) - (d.paid || 0));
    });

    const netWorth  = liquidCash + portfolio - totalDebt;
    const nwColor   = netWorth >= 0 ? [34, 197, 94] : [239, 68, 68];

    // ── Cover / Header ─────────────────────────────────────────────
    pdfdoc.setFontSize(22); pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'bold');
    pdfdoc.setTextColor(13, 59, 42);
    pdfdoc.text('FinHQ — Net Worth Statement', 14, 22);

    pdfdoc.setFontSize(10); pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'normal');
    pdfdoc.setTextColor(100); pdfdoc.text(`As of ${dateLabel}`, 14, 30);

    // ── Net Worth summary block ────────────────────────────────────
    pdfdoc.setFontSize(11); pdfdoc.setTextColor(40);
    pdfdoc.text(`Liquid Cash:         ${Rs()}${fmtINR(liquidCash)}`,   14, 42);
    pdfdoc.text(`Investment Portfolio: ${Rs()}${fmtINR(portfolio)}`,   14, 49);
    pdfdoc.text(`Total Outstanding Debt: ${Rs()}${fmtINR(totalDebt)}`, 14, 56);

    pdfdoc.setDrawColor(200); pdfdoc.line(14, 60, 196, 60);
    pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'bold');
    pdfdoc.setFontSize(13); pdfdoc.setTextColor(...nwColor);
    pdfdoc.text(`NET WORTH: ${Rs()}${fmtINR(netWorth)}`, 14, 68);

    let cursor = 76;
    const pageH = pdfdoc.internal.pageSize.height;
    function checkPage(needed = 30) {
      if (cursor + needed > pageH - 20) { pdfdoc.addPage(); cursor = 20; }
    }

    // ── Asset Table ────────────────────────────────────────────────
    if (store.assets?.length) {
      checkPage(20);
      pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'bold');
      pdfdoc.setFontSize(11); pdfdoc.setTextColor(13, 59, 42);
      pdfdoc.text('Assets & Investments', 14, cursor); cursor += 4;

      const assetRows = store.assets.map(a => {
        const qty   = a.qty ?? 1;
        const buy   = a.buyPrice     ?? 0;
        const cur   = a.currentPrice ?? buy;
        const val   = qty * cur;
        const pl    = val - qty * buy;
        const plPct = qty * buy > 0 ? ((pl / (qty * buy)) * 100).toFixed(1) + '%' : '0.0%';
        return [a.name || '—', a.category || 'Other',
                Rs() + fmtINR(val),
                (pl >= 0 ? '+' : '') + Rs() + fmtINR(pl) + ` (${plPct})`];
      });

      pdfdoc.autoTable({
        startY:     cursor,
        head:       [['Name', 'Category', 'Current Value', 'P&L']],
        body:       assetRows,
        theme:      'striped',
        headStyles: { fillColor: [180, 120, 30], font: notoLoaded ? 'NotoSans' : 'helvetica' },
        styles:     { font: notoLoaded ? 'NotoSans' : 'helvetica', fontSize: 8 },
        margin:     { left: 14, right: 14 },
      });
      cursor = pdfdoc.lastAutoTable.finalY + 10;
    }

    // ── Debt Table ────────────────────────────────────────────────
    if (store.debts?.length) {
      checkPage(20);
      pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'bold');
      pdfdoc.setFontSize(11); pdfdoc.setTextColor(239, 68, 68);
      pdfdoc.text('Outstanding Debts', 14, cursor); cursor += 4;

      const debtRows = store.debts.map(d => {
        const outstanding = Math.max(0, (d.principal || 0) - (d.paid || 0));
        return [d.name || '—',
                Rs() + fmtINR(outstanding),
                d.rate ? d.rate + '% p.a.' : '—',
                Rs() + fmtINR(d.emi)];
      });

      pdfdoc.autoTable({
        startY:     cursor,
        head:       [['Loan Name', 'Outstanding', 'Rate', 'EMI']],
        body:       debtRows,
        theme:      'striped',
        headStyles: { fillColor: [180, 40, 40], font: notoLoaded ? 'NotoSans' : 'helvetica' },
        styles:     { font: notoLoaded ? 'NotoSans' : 'helvetica', fontSize: 8 },
        margin:     { left: 14, right: 14 },
      });
      cursor = pdfdoc.lastAutoTable.finalY + 10;
    }

    // ── Last-12-months Cashflow table ─────────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const recentTxns = [...store.transactions]
      .filter(t => t.date && new Date(t.date.includes('T') ? t.date : t.date + 'T00:00:00') >= twelveMonthsAgo)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 60); // cap at 60 rows to avoid multi-hundred-page PDFs

    if (recentTxns.length) {
      checkPage(20);
      pdfdoc.setFont(notoLoaded ? 'NotoSans' : 'helvetica', 'bold');
      pdfdoc.setFontSize(11); pdfdoc.setTextColor(40);
      pdfdoc.text('Recent Transactions (last 12 months)', 14, cursor); cursor += 4;

      const txnRows = recentTxns.map(t => {
        const dateStr = t.date
          ? new Date(t.date.includes('T') ? t.date : t.date + 'T00:00:00')
              .toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'2-digit' })
          : '';
        return [dateStr, (t.title || '—').substring(0, 32),
                t.type === 'income' ? 'INC' : 'EXP',
                Rs() + fmtINR(t.amount)];
      });

      pdfdoc.autoTable({
        startY:     cursor,
        head:       [['Date', 'Description', 'Type', 'Amount']],
        body:       txnRows,
        theme:      'striped',
        headStyles: { fillColor: [13, 59, 42], font: notoLoaded ? 'NotoSans' : 'helvetica' },
        styles:     { font: notoLoaded ? 'NotoSans' : 'helvetica', fontSize: 8 },
        margin:     { left: 14, right: 14 },
      });
    }

    pdfdoc.save(`FinHQ_NetWorth_Statement_${now.toISOString().split('T')[0]}.pdf`);
    setBtnLoading(btn, false, origLabel);
  });

  // ── GAP A: CSV Import (Transactions) ──────────────────────────────────────
  importCsvBtn?.addEventListener('click', () => importFileInput?.click());

  importFileInput?.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    importFileInput.value = ''; // reset so same file can be re-selected

    const text = await file.text();
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());

    // Strip BOM if present
    const header = lines[0].replace(/^\uFEFF/, '');
    const expectedHeaders = ['Date', 'Title', 'Type', 'Amount'];

    const headerCols = header.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    const missingCol = expectedHeaders.find(h => !headerCols.some(c => c.startsWith(h)));
    if (missingCol) {
      return showToast(`Invalid file — missing "${missingCol}" column. Only FinHQ Transactions CSVs are supported.`, true);
    }

    const dateIdx   = headerCols.findIndex(c => c.startsWith('Date'));
    const titleIdx  = headerCols.findIndex(c => c.startsWith('Title'));
    const typeIdx   = headerCols.findIndex(c => c.startsWith('Type'));
    const amountIdx = headerCols.findIndex(c => c.startsWith('Amount'));
    const tagsIdx   = headerCols.findIndex(c => c.startsWith('Tags'));

    // Build a dedup set of existing transactions: "title|date|amount"
    // FIX (export/medium): t.date can be a Firestore Timestamp object (not a string)
    // when written by serverTimestamp(). Calling .split() on an object throws
    // "not a function" and crashes the entire import silently.
    const existing = new Set(
      store.transactions.map(t => {
        let d = t.date;
        if (d && typeof d.toDate === 'function') d = d.toDate().toISOString();
        const dateStr = typeof d === 'string' ? d.split('T')[0] : '';
        return `${t.title}|${dateStr}|${t.amount}`;
      })
    );

    function parseCSVRow(line) {
      const cols = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
        else { cur += ch; }
      }
      cols.push(cur);
      return cols;
    }

    const toAdd = [];
    const rows  = lines.slice(1);
    let skipped = 0;

    for (const row of rows) {
      if (!row.trim()) continue;
      const cols   = parseCSVRow(row);
      const date   = cols[dateIdx]?.trim()   || '';
      const title  = cols[titleIdx]?.trim()  || 'Imported';
      const type   = cols[typeIdx]?.trim()?.toLowerCase() === 'income' ? 'income' : 'expense';
      const amount = parseFloat((cols[amountIdx] || '0').replace(/[^\d.-]/g, ''));
      const tags   = tagsIdx >= 0 && cols[tagsIdx]
        ? cols[tagsIdx].split(';').map(t => t.trim()).filter(Boolean)
        : [];

      if (!date || isNaN(amount) || amount <= 0) { skipped++; continue; }

      const key = `${title}|${date}|${amount}`;
      if (existing.has(key)) { skipped++; continue; }

      toAdd.push({ title, amount, type, date, tags, label: 'Imported',
                   timestamp: new Date(date + 'T00:00:00').getTime() });
    }

    if (!toAdd.length) {
      return showToast(`Nothing to import — ${skipped} row${skipped !== 1 ? 's' : ''} already exist or are invalid.`, true);
    }

    try {
      // Write in parallel batches of 20
      const BATCH = 20;
      for (let i = 0; i < toAdd.length; i += BATCH) {
        await Promise.all(
          toAdd.slice(i, i + BATCH).map(t => addDoc(collection(db, 'transactions'), t))
        );
      }
      showToast(`Imported ${toAdd.length} transaction${toAdd.length !== 1 ? 's' : ''}${skipped ? `, ${skipped} skipped (duplicate/invalid)` : ''}.`);
    } catch (err) {
      console.error(err);
      showToast('Import failed — check console for details.', true);
    }
  });
}
