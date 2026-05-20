import { db, collection } from '../firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function initExport() {
  const exportCsvBtn = document.getElementById('exportCsvFullBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  let allTxns = [];

  onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "desc")), (snapshot) => {
    allTxns = snapshot.docs.map(doc => doc.data());
  });

  // CSV EXPORT (Complete Ledger)
  exportCsvBtn?.addEventListener('click', () => {
    if (allTxns.length === 0) return alert("No transactions found.");
    
    let csv = "Date,Title,Type,Amount,Tags\n";
    allTxns.forEach(t => {
      const dateStr = t.date ? t.date.split('T')[0] : '';
      const tagsStr = t.tags ? t.tags.join('; ') : '';
      const title = `"${(t.title || '').replace(/"/g, '""')}"`;
      csv += `${dateStr},${title},${t.type},${t.amount},"${tagsStr}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `FinHQ_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  });

  // PDF EXPORT (Monthly Summary via jsPDF)
  exportPdfBtn?.addEventListener('click', () => {
    if (typeof window.jspdf === 'undefined') return alert("PDF Engine loading. Try again in a moment.");
    if (allTxns.length === 0) return alert("No transactions found.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const now = new Date();
    const currentMonthData = allTxns.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    let totalIncome = 0; let totalExpense = 0;
    const tableData = currentMonthData.map(t => {
      if (t.type === 'income') totalIncome += (t.amount || 0);
      else totalExpense += (t.amount || 0);
      
      const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-IN', {month:'short', day:'numeric'}) : '';
      const amtStr = `Rs. ${t.amount.toLocaleString('en-IN')}`;
      return [dateStr, t.title || 'Untitled', t.type.toUpperCase(), amtStr];
    });

    // Draw PDF Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("FinHQ Monthly Report", 14, 22);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Month: ${now.toLocaleDateString('en-IN', {month:'long', year:'numeric'})}`, 14, 32);
    
    doc.text(`Total Income: Rs. ${totalIncome.toLocaleString('en-IN')}`, 14, 42);
    doc.text(`Total Spend: Rs. ${totalExpense.toLocaleString('en-IN')}`, 14, 48);
    
    const netCashflow = totalIncome - totalExpense;
    doc.setFont("helvetica", "bold");
    doc.text(`Net Cashflow: Rs. ${netCashflow.toLocaleString('en-IN')}`, 14, 56);

    // Draw PDF Table
    if (tableData.length > 0) {
      doc.autoTable({
        startY: 65,
        head: [['Date', 'Description', 'Type', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [13, 59, 42] }, // Match FinHQ Forest Green
        styles: { font: 'helvetica', fontSize: 10 }
      });
    } else {
      doc.text("No transactions logged for this month.", 14, 70);
    }

    doc.save(`FinHQ_Report_${now.toLocaleDateString('en-IN', {month:'short', year:'numeric'})}.pdf`);
  });
}
