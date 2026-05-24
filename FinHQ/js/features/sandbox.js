export function initSandbox() {
  const inputs    = ['sbxPrice', 'sbxRate', 'sbxTenure', 'sbxInvRate'];
  const outEmi    = document.getElementById('sbxEmiOut');
  const outInt    = document.getElementById('sbxIntOut');
  const outVerdict = document.getElementById('sbxVerdict');
  const outDiff   = document.getElementById('sbxDiffOut');

  function calculate() {
    const P            = Number(document.getElementById('sbxPrice').value)   || 0;
    const r_emi_annual = Number(document.getElementById('sbxRate').value)    || 0;
    const n            = Number(document.getElementById('sbxTenure').value)  || 1;
    const r_inv_annual = Number(document.getElementById('sbxInvRate').value) || 0;

    if (P <= 0 || n <= 0) return;

    // ── EMI Calculation ───────────────────────────────────────────
    const r_emi       = (r_emi_annual / 12) / 100;
    const emi         = r_emi === 0
      ? (P / n)
      : (P * r_emi * Math.pow(1 + r_emi, n)) / (Math.pow(1 + r_emi, n) - 1);
    const totalEmiPaid  = emi * n;
    const totalInterest = totalEmiPaid - P;   // Interest is a pure cost in the EMI path

    // ── Opportunity Cost (Future Value Comparison) ─────────────────
    const r_inv = (r_inv_annual / 12) / 100;

    // Scenario A — Pay Cash:
    //   You spend P today and save the EMI amount every month (since you owe no EMI).
    //   Future value of that monthly saving = SIP FV of EMI for n months.
    const fv_cash = r_inv > 0
      ? emi * ((Math.pow(1 + r_inv, n) - 1) / r_inv)
      : emi * n;

    // Scenario B — Take EMI:
    //   You keep P and invest it as a lump sum. You pay EMI from income.
    //   Future value of the lump sum investment.
    const fv_emi = P * Math.pow(1 + r_inv, n);

    // FIX: Subtract the total interest paid in Scenario B.
    // Previously this was missing, causing the calculator to show a "tie"
    // when EMI rate == investment rate — the correct answer is "pay cash"
    // because the interest represents real money lost regardless of investment gains.
    //
    //   Net wealth advantage of EMI path =
    //     (investment gains from keeping P) − (interest cost) − (SIP gains in cash path)
    const diff = fv_emi - totalInterest - fv_cash;

    // ── Update UI ─────────────────────────────────────────────────
    if (outEmi) outEmi.innerText = `₹${Math.round(emi).toLocaleString('en-IN')}`;
    if (outInt) outInt.innerText = `₹${Math.round(totalInterest).toLocaleString('en-IN')}`;
    if (outDiff) outDiff.innerText = `₹${Math.round(Math.abs(diff)).toLocaleString('en-IN')}`;

    if (!outVerdict) return;

    if (diff > 500) {
      outVerdict.innerText = "Take the EMI — invest the cash. Your investment growth outweighs the interest cost.";
      outVerdict.className = "text-lg font-semibold text-green-600 mb-6 bg-green-50 dark:bg-green-900/30 p-4 rounded-xl";
    } else if (diff < -500) {
      outVerdict.innerText = "Pay Cash. The EMI interest destroys more than you gain by investing.";
      outVerdict.className = "text-lg font-semibold text-red-600 mb-6 bg-red-50 dark:bg-red-900/30 p-4 rounded-xl";
    } else {
      outVerdict.innerText = "Too close to call — the difference is negligible. Prefer cash if liquidity allows.";
      outVerdict.className = "text-lg font-semibold text-gray-600 mb-6 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl";
    }
  }

  inputs.forEach(id => document.getElementById(id)?.addEventListener('input', calculate));
  calculate(); // Run on load with default values
}
