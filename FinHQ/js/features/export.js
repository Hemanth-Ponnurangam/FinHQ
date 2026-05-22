// FIX: export.js now uses the global store (no independent Firestore listener).
// Added: date-range filter, assets CSV export, debts CSV export.
import { store } from '../store.js';

export function initExport() {
  const exportCsvBtn   = document.getElementById('exportCsvFullBtn');
  const exportAssetsBtn = document.getElementById('exportAssetsBtn');
  const exportDebtsBtn  = document.getElementById('exportDebtsBtn');
  const exportPdfBtn   = document.getElementById('exportPdfBtn');

  // ── Helpers ───────────────────────────────────────────────────
  function getDateRange() {
    const fromVal = document.getElementById('exportDateFrom')?.value;
    const toVal   = document.getElementById('exportDateTo')?.value;
    const from    = fromVal ? new Date(fromVal) : null;
    const to      = toVal   ? new Date(toVal + 'T23:59:59') : null;
    return { from, to };
  }

  function filterByRange(txns) {
    const { from, to } = getDateRange();
    return txns.filter(t => {
      if (!t.date) return true;
      const d = new Date(t.date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ── Transactions CSV (with date-range filter) ─────────────────
  exportCsvBtn?.addEventListener('click', () => {
    if (!store.isLoaded) return alert('Data still loading. Please try again.');
    const txns = filterByRange([...store.transactions].sort((a,b) => (b.timestamp||0) - (a.timestamp||0)));
    if (txns.length === 0) return alert('No transactions found in the selected date range.');

    let csv = 'Date,Title,Type,Amount (₹),Tags,Label\n';
    txns.forEach(t => {
      const date   = t.date ? t.date.split('T')[0] : '';
      const title  = `"${(t.title||'').replace(/"/g,'""')}"`;
      const tags   = `"${(t.tags||[]).join('; ')}"`;
      const label  = `"${(t.label||'').replace(/"/g,'""')}"`;
      csv += `${date},${title},${t.type},${t.amount||0},${tags},${label}\n`;
    });

    const suffix = buildDateSuffix();
    downloadCSV(csv, `FinHQ_Transactions${suffix}.csv`);
  });

  // ── Assets CSV ─────────────────────────────────────────────────
  exportAssetsBtn?.addEventListener('click', () => {
    if (!store.isLoaded) return alert('Data still loading. Please try again.');
    if (store.assets.length === 0) return alert('No assets tracked yet.');

    let csv = 'Name,Category,Quantity,Buy Price (₹),Current Price (₹),Total Invested (₹),Current Value (₹),P&L (₹),P&L (%),Purchase Date\n';
    store.assets.forEach(a => {
      const qty          = a.qty || 1;
      const buyPrice     = a.buyPrice     !== undefined ? a.buyPrice     : 0;
      const currentPrice = a.currentPrice !== undefined ? a.currentPrice : buyPrice;
      const invested     = qty * buyPrice;
      const value        = qty * currentPrice;
      const pl           = value - invested;
      const plPct        = invested > 0 ? ((pl / invested) * 100).toFixed(2) : '0.00';
      const dateStr      = a.purchaseDate ? a.purchaseDate.split('T')[0] : '';
      const name         = `"${(a.name||'').replace(/"/g,'""')}"`;
      csv += `${name},${a.category||'Other'},${qty},${buyPrice},${currentPrice},${invested.toFixed(2)},${value.toFixed(2)},${pl.toFixed(2)},${plPct}%,${dateStr}\n`;
    });

    downloadCSV(csv, `FinHQ_Assets_${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ── Debts CSV ──────────────────────────────────────────────────
  exportDebtsBtn?.addEventListener('click', () => {
    if (!store.isLoaded) return alert('Data still loading. Please try again.');
    if (store.debts.length === 0) return alert('No debts tracked yet.');

    let csv = 'Loan Name,Principal (₹),Principal Repaid (₹),Outstanding (₹),Rate (% p.a.),Tenure (Months),EMI (₹),Start Date\n';
    store.debts.forEach(d => {
      const outstanding = (d.principal||0) - (d.paid||0);
      const name        = `"${(d.name||'').replace(/"/g,'""')}"`;
      const dateStr     = d.date ? d.date.split('T')[0] : '';
      csv += `${name},${d.principal||0},${d.paid||0},${outstanding},${d.rate||0},${d.tenure||0},${(d.emi||0).toFixed(2)},${dateStr}\n`;
    });

    downloadCSV(csv, `FinHQ_Debts_${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ── PDF Monthly Summary ─────────────────────────────────────────
  exportPdfBtn?.addEventListener('click', () => {
    if (typeof window.jspdf === 'undefined') return alert('PDF engine is loading. Please try again in a moment.');
    if (!store.isLoaded) return alert('Data still loading. Please try again.');

    const { from, to } = getDateRange();
    const now          = new Date();

    // Use date range if provided, otherwise fall back to current month
    let txns;
    let reportLabel;
    if (from || to) {
      txns        = filterByRange(store.transactions);
      const f     = from ? from.toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'}) : 'All';
      const t     = to   ? to.toLocaleDateString('en-IN',  {month:'short',day:'numeric',year:'numeric'}) : 'Now';
      reportLabel = `${f} — ${t}`;
    } else {
      txns = store.transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      reportLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }

    if (txns.length === 0) return alert('No transactions found for this period.');

    const { jsPDF }      = window.jspdf;
    const pdfdoc         = new jsPDF();
    let totalIncome = 0, totalExpense = 0;

    const tableData = [...txns]
      .sort((a,b) => (b.timestamp||0) - (a.timestamp||0))
      .map(t => {
        if (t.type === 'income')  totalIncome  += (t.amount || 0);
        else                      totalExpense += (t.amount || 0);
        const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-IN',{month:'short',day:'numeric'}) : '';
        return [dateStr, t.title||'Untitled', t.type.toUpperCase(), `Rs. ${(t.amount||0).toLocaleString('en-IN')}`];
      });

    pdfdoc.setFont('helvetica', 'bold');
    pdfdoc.setFontSize(22);
    pdfdoc.text('FinHQ Financial Report', 14, 22);

    pdfdoc.setFontSize(11);
    pdfdoc.setFont('helvetica', 'normal');
    pdfdoc.text(`Period: ${reportLabel}`, 14, 32);
    pdfdoc.text(`Total Income:  Rs. ${totalIncome.toLocaleString('en-IN')}`,  14, 42);
    pdfdoc.text(`Total Expense: Rs. ${totalExpense.toLocaleString('en-IN')}`, 14, 48);

    const net = totalIncome - totalExpense;
    pdfdoc.setFont('helvetica', 'bold');
    pdfdoc.text(`Net Cashflow:  Rs. ${net.toLocaleString('en-IN')}`, 14, 56);

    // Asset snapshot
    if (store.assets.length > 0) {
      let totalPortfolio = 0;
      store.assets.forEach(a => { totalPortfolio += (a.qty||1) * (a.currentPrice !== undefined ? a.currentPrice : (a.buyPrice||0)); });
      pdfdoc.setFont('helvetica', 'normal');
      pdfdoc.text(`Portfolio Value: Rs. ${totalPortfolio.toLocaleString('en-IN')}`, 14, 64);
    }

    pdfdoc.autoTable({
      startY:     72,
      head:       [['Date','Description','Type','Amount']],
      body:       tableData,
      theme:      'striped',
      headStyles: { fillColor: [13, 59, 42] },
      styles:     { font: 'helvetica', fontSize: 9 }
    });

    const fname = `FinHQ_Report_${reportLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    pdfdoc.save(fname);
  });

  function buildDateSuffix() {
    const { from, to } = getDateRange();
    if (!from && !to) return `_${new Date().toISOString().split('T')[0]}`;
    const f = from ? from.toISOString().split('T')[0] : 'start';
    const t = to   ? to.toISOString().split('T')[0]   : 'now';
    return `_${f}_to_${t}`;
  }
}
