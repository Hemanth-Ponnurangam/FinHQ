export function initEMI() {
  // ── Element refs ──────────────────────────────────────────────
  const sliderAmt    = document.getElementById('emiLoanAmt');
  const inputAmt     = document.getElementById('emiLoanAmtVal');
  const sliderRate   = document.getElementById('emiRate');
  const inputRate    = document.getElementById('emiRateVal');
  const sliderTenure = document.getElementById('emiTenure');
  const inputTenure  = document.getElementById('emiTenureVal');

  const dispMonthly  = document.getElementById('emiMonthly');
  const dispPrincipal = document.getElementById('emiPrincipalDisp');
  const dispTotalInt = document.getElementById('emiTotalInt');
  const dispTotalAmt = document.getElementById('emiTotalAmt');
  const dispPctP     = document.getElementById('emiPctPrincipal');
  const dispPctI     = document.getElementById('emiPctInterest');
  const barPrincipal = document.getElementById('emiBarPrincipal');
  const barInterest  = document.getElementById('emiBarInterest');

  const donutCanvas  = document.getElementById('emiDonut');
  const lineCanvas   = document.getElementById('emiLineChart');
  let donutChart     = null;
  let lineChart      = null;

  // ── Slider ↔ Input sync ───────────────────────────────────────
  function syncSliderToInput(slider, input) {
    slider?.addEventListener('input', () => { input.value = slider.value; calculate(); });
  }
  function syncInputToSlider(input, slider) {
    input?.addEventListener('input', () => {
      const val = Math.max(Number(input.min || slider.min), Math.min(Number(input.max || slider.max), Number(input.value)));
      slider.value = val;
      calculate();
    });
  }

  syncSliderToInput(sliderAmt,    inputAmt);
  syncSliderToInput(sliderRate,   inputRate);
  syncSliderToInput(sliderTenure, inputTenure);
  syncInputToSlider(inputAmt,    sliderAmt);
  syncInputToSlider(inputRate,   sliderRate);
  syncInputToSlider(inputTenure, sliderTenure);

  // ── Core Calculation ──────────────────────────────────────────
  function calcEMI(P, annualRate, months) {
    const r = (annualRate / 12) / 100;
    if (r === 0) return P / months;
    return P * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
  }

  // Build full amortisation schedule in one pass — O(n), not O(n²)
  function buildSchedule(P, r_monthly, emi) {
    const schedule = [];
    let balance = P;
    while (balance > 0.5 && schedule.length < 480) { // hard cap at 40 years
      const interestPmt   = balance * r_monthly;
      const principalPmt  = Math.min(emi - interestPmt, balance);
      balance            -= principalPmt;
      schedule.push({ principalPmt, interestPmt, balance: Math.max(0, balance) });
    }
    return schedule;
  }

  function calculate() {
    const P            = Math.max(100000, Number(inputAmt?.value)    || 2000000);
    const annualRate   = Math.max(0.1,   Number(inputRate?.value)   || 8.5);
    const tenureYears  = Math.max(1,     Number(inputTenure?.value) || 20);
    const months       = tenureYears * 12;
    const r_monthly    = (annualRate / 12) / 100;

    const emi          = calcEMI(P, annualRate, months);
    const totalPayable = emi * months;
    const totalInterest = totalPayable - P;

    // ── Update text stats ─────────────────────────────────────
    const fmt = n => '₹' + Math.round(n).toLocaleString('en-IN');
    if (dispMonthly)   dispMonthly.innerText   = fmt(emi);
    if (dispPrincipal) dispPrincipal.innerText = fmt(P);
    if (dispTotalInt)  dispTotalInt.innerText  = fmt(totalInterest);
    if (dispTotalAmt)  dispTotalAmt.innerText  = fmt(totalPayable);

    const pPct = ((P / totalPayable) * 100).toFixed(1);
    const iPct = (100 - Number(pPct)).toFixed(1);
    if (dispPctP) dispPctP.innerText = `${pPct}% Principal`;
    if (dispPctI) dispPctI.innerText = `${iPct}% Interest`;
    if (barPrincipal) barPrincipal.style.width = `${pPct}%`;
    if (barInterest)  barInterest.style.width  = `${iPct}%`;

    // ── Donut Chart ───────────────────────────────────────────
    if (donutCanvas) {
      if (donutChart) donutChart.destroy();
      donutChart = new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Principal', 'Interest'],
          datasets: [{
            data: [Math.round(P), Math.round(totalInterest)],
            backgroundColor: ['#E8EAF6', '#5C6BC0'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          cutout: '68%',
          plugins: { legend: { display: false }, tooltip: {
            callbacks: {
              label: ctx => ' ₹' + ctx.raw.toLocaleString('en-IN')
            }
          }},
          animation: { duration: 400 }
        }
      });
    }

    // ── Line Chart (amortisation breakdown per year) ──────────
    // For each year, take the FIRST monthly payment of that year.
    // Principal component (increasing) + Interest component (decreasing) + EMI (flat)
    if (lineCanvas) {
      const schedule  = buildSchedule(P, r_monthly, emi);
      const yearLabels   = [];
      const principalPts = [];
      const interestPts  = [];
      const emiLine      = [];

      for (let yr = 1; yr <= tenureYears; yr++) {
        const mIdx = (yr - 1) * 12; // first month of this year
        if (mIdx < schedule.length) {
          yearLabels.push(`${yr}Y`);
          principalPts.push(Math.round(schedule[mIdx].principalPmt));
          interestPts.push(Math.round(schedule[mIdx].interestPmt));
          emiLine.push(Math.round(emi));
        }
      }

      if (lineChart) lineChart.destroy();
      lineChart = new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels: yearLabels,
          datasets: [
            {
              label: 'EMI',
              data: emiLine,
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0
            },
            {
              label: 'Interest',
              data: interestPts,
              borderColor: '#f87171',
              backgroundColor: 'rgba(248,113,113,0.08)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 2,
              pointBackgroundColor: '#f87171'
            },
            {
              label: 'Principal',
              data: principalPts,
              borderColor: '#5C6BC0',
              backgroundColor: 'rgba(92,107,192,0.08)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 2,
              pointBackgroundColor: '#5C6BC0'
            }
          ]
        },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: { boxWidth: 12, font: { size: 10 }, padding: 12 }
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ₹${ctx.raw.toLocaleString('en-IN')}`
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: 'Tenure (Years)', font: { size: 10 }, color: '#9ca3af' },
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: { font: { size: 9 } }
            },
            y: {
              title: { display: true, text: 'Amount (₹)', font: { size: 10 }, color: '#9ca3af' },
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: {
                font: { size: 9 },
                callback: v => '₹' + (v >= 100000 ? (v/100000).toFixed(1) + 'L' : (v/1000).toFixed(0) + 'k')
              }
            }
          },
          animation: { duration: 300 }
        }
      });
    }
  }

  // Run on boot with defaults
  calculate();
}
