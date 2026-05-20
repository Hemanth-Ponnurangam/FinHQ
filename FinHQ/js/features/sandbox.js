export function initSandbox() {
  const inputs = ['sbxPrice', 'sbxRate', 'sbxTenure', 'sbxInvRate'];
  const outEmi = document.getElementById('sbxEmiOut');
  const outInt = document.getElementById('sbxIntOut');
  const outVerdict = document.getElementById('sbxVerdict');
  const outDiff = document.getElementById('sbxDiffOut');

  function calculate() {
    const P = Number(document.getElementById('sbxPrice').value) || 0;
    const r_emi_annual = Number(document.getElementById('sbxRate').value) || 0;
    const n = Number(document.getElementById('sbxTenure').value) || 1;
    const r_inv_annual = Number(document.getElementById('sbxInvRate').value) || 0;

    if (P <= 0 || n <= 0) return;

    // EMI Calculation
    const r_emi = (r_emi_annual / 12) / 100;
    const emi = r_emi === 0 ? (P / n) : (P * r_emi * Math.pow(1 + r_emi, n)) / (Math.pow(1 + r_emi, n) - 1);
    const totalEmiPaid = emi * n;
    const totalInterest = totalEmiPaid - P;

    // Opportunity Cost (Future Value Math)
    const r_inv = (r_inv_annual / 12) / 100;
    
    // Scenario A: Pay Cash. You lose P today. You invest the 'EMI' amount every month.
    let fv_cash = 0;
    if (r_inv > 0) fv_cash = emi * ((Math.pow(1 + r_inv, n) - 1) / r_inv);
    else fv_cash = emi * n;

    // Scenario B: Take EMI. You keep P today and invest it. You pay EMI out of monthly cashflow.
    const fv_emi = P * Math.pow(1 + r_inv, n);

    // Difference
    const diff = fv_emi - fv_cash;

    // Update UI
    outEmi.innerText = `₹${Math.round(emi).toLocaleString('en-IN')}`;
    outInt.innerText = `₹${Math.round(totalInterest).toLocaleString('en-IN')}`;
    outDiff.innerText = `₹${Math.round(Math.abs(diff)).toLocaleString('en-IN')}`;

    if (diff > 0) {
      outVerdict.innerText = "Take the EMI and invest the cash.";
      outVerdict.className = "text-lg font-semibold text-green-600 mb-6 bg-green-50 dark:bg-green-900/30 p-4 rounded-xl";
    } else if (diff < 0) {
      outVerdict.innerText = "Pay Cash. The EMI interest destroys your returns.";
      outVerdict.className = "text-lg font-semibold text-red-600 mb-6 bg-red-50 dark:bg-red-900/30 p-4 rounded-xl";
    } else {
      outVerdict.innerText = "It's a mathematical tie.";
      outVerdict.className = "text-lg font-semibold text-gray-600 mb-6 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl";
    }
  }

  // Bind calculation to input changes
  inputs.forEach(id => {
    document.getElementById(id)?.addEventListener('input', calculate);
  });

  // Initial calculation
  calculate();
}
