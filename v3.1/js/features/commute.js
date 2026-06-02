import { db, collection, addDoc, doc, updateDoc, deleteDoc } from '../firebase.js';
import { store } from '../store.js';

// ── Fuel-type metadata ─────────────────────────────────────────────────────
const FUEL_META = {
  petrol:  { label: 'Petrol',  unit: 'L',   effUnit: 'km/L',   costUnit: '₹/L'   },
  diesel:  { label: 'Diesel',  unit: 'L',   effUnit: 'km/L',   costUnit: '₹/L'   },
  cng:     { label: 'CNG',     unit: 'kg',  effUnit: 'km/kg',  costUnit: '₹/kg'  },
  ev:      { label: 'EV',      unit: 'kWh', effUnit: 'km/kWh', costUnit: '₹/kWh' },
};
const fuelMeta = (type) => FUEL_META[type] || FUEL_META.petrol;

// ── Service-type metadata ──────────────────────────────────────────────────
const SERVICE_META = {
  oil:       { label: 'Oil Change',          icon: 'droplets'         },
  tyre:      { label: 'Tyre Rotation',       icon: 'circle-dot'       },
  insurance: { label: 'Insurance Renewal',   icon: 'shield-check'     },
  battery:   { label: 'Battery Service',     icon: 'battery-charging' },
  wash:      { label: 'Vehicle Wash/Detail', icon: 'sparkles'         },
  other:     { label: 'Other',               icon: 'wrench'           },
};

// ── Efficiency trend SVG chart ─────────────────────────────────────────────
function renderTrendChart(sortedLogs, container) {
  if (!container) return;

  // Build per-fill-up efficiency points (skip index 0 — no previous reading)
  const points = [];
  for (let i = 1; i < sortedLogs.length; i++) {
    const dist = sortedLogs[i].odo - sortedLogs[i - 1].odo;
    if (dist > 0 && sortedLogs[i].liters > 0) {
      points.push({
        eff:  dist / sortedLogs[i].liters,
        date: sortedLogs[i].date,
        type: sortedLogs[i].fuelType || 'petrol',
      });
    }
  }

  if (points.length < 2) {
    container.innerHTML = '';
    return;
  }

  const W = 320, H = 96, PAD = 18;
  const effs  = points.map(p => p.eff);
  const minE  = Math.min(...effs);
  const maxE  = Math.max(...effs);
  const range = maxE - minE || 1;
  const toX   = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY   = (e) => H - PAD - ((e - minE) / range) * (H - PAD * 2);

  const polyline = points.map((p, i) => `${toX(i).toFixed(1)},${toY(p.eff).toFixed(1)}`).join(' ');
  const area     = `${toX(0).toFixed(1)},${H - PAD} ` + polyline + ` ${toX(points.length - 1).toFixed(1)},${H - PAD}`;
  const meta     = fuelMeta(points[0].type);

  // Trend direction (compare first half avg vs second half avg)
  const mid      = Math.floor(effs.length / 2);
  const avgStart = effs.slice(0, mid).reduce((a, b) => a + b, 0) / (mid || 1);
  const avgEnd   = effs.slice(mid).reduce((a, b) => a + b, 0) / ((effs.length - mid) || 1);
  const delta    = avgEnd - avgStart;
  const pct      = Math.abs((delta / avgStart) * 100).toFixed(1);
  const trendHtml = Math.abs(delta) < 0.3
    ? `<p class="text-[11px] text-gray-400 mt-1">Efficiency is stable</p>`
    : delta > 0
      ? `<p class="text-[11px] text-green-500 mt-1">▲ Improved ${pct}% recently</p>`
      : `<p class="text-[11px] text-red-400 mt-1">▼ Declined ${pct}% — check engine?</p>`;

  container.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700">
      <p class="text-[10px] text-forest-400 font-semibold tracking-widest uppercase mb-3 flex items-center gap-2">
        <i data-lucide="trending-up" class="w-3.5 h-3.5"></i> Efficiency Trend
      </p>
      <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:96px" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#22c55e" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <polygon points="${area}" fill="url(#effGrad)"/>
        <polyline points="${polyline}" fill="none" stroke="#22c55e" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round"/>
        ${points.map((p, i) => `<circle cx="${toX(i).toFixed(1)}" cy="${toY(p.eff).toFixed(1)}" r="3" fill="#22c55e"/>`).join('')}
        <text x="${PAD}" y="${toY(minE) + 4}" font-size="8" fill="#9ca3af">${minE.toFixed(1)}</text>
        <text x="${PAD}" y="${toY(maxE) - 3}" font-size="8" fill="#9ca3af">${maxE.toFixed(1)}</text>
        <text x="${W / 2}" y="${H - 2}" font-size="8" fill="#9ca3af" text-anchor="middle">${meta.effUnit}</text>
      </svg>
      ${trendHtml}
    </div>`;

  if (window.lucide) lucide.createIcons();
}

// ── Service log renderer ───────────────────────────────────────────────────
function renderServiceLog(logs, container, onEdit) {
  if (!container) return;
  const sorted = [...logs].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    container.innerHTML = `<p class="text-center text-gray-400 py-6 text-xs">No service entries yet.</p>`;
    return;
  }

  container.innerHTML = sorted.map(log => {
    const meta    = SERVICE_META[log.type] || SERVICE_META.other;
    const dateStr = log.date ? new Date(log.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return `
      <div data-id="${log.id}" class="edit-service cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 flex items-center gap-3 active:scale-[0.98]">
        <div class="w-9 h-9 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <i data-lucide="${meta.icon}" class="w-4 h-4 text-amber-500"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm dark:text-white">${meta.label}${log.vehicle ? ` · <span class="font-normal text-gray-400">${log.vehicle}</span>` : ''}</p>
          <p class="text-xs text-gray-400 truncate">${dateStr}${log.notes ? ` · ${log.notes}` : ''}</p>
        </div>
        ${log.cost > 0 ? `<span class="font-bold text-sm text-amber-600 dark:text-amber-400 flex-shrink-0">₹${log.cost.toLocaleString('en-IN')}</span>` : ''}
      </div>`;
  }).join('');

  if (window.lucide) lucide.createIcons();

  container.querySelectorAll('.edit-service').forEach(card => {
    card.addEventListener('click', () => {
      const log = sorted.find(l => l.id === card.dataset.id);
      if (log && onEdit) onEdit(log);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
export function initCommute(ui) {
  const form        = document.getElementById('fuelForm');
  const list        = document.getElementById('fuelList');
  const serviceList = document.getElementById('serviceList');
  const displayEff  = document.getElementById('avgEfficiencyDisplay');
  const displayCost = document.getElementById('costPerKmDisplay');
  const trendWrap   = document.getElementById('efficiencyTrendChart');
  let currentEditId        = null;
  let currentServiceEditId = null;

  // ── Fuel type → dynamic unit label ──────────────────────────────────────
  function updateUnitLabels(type) {
    const meta = fuelMeta(type);
    const lbl  = document.getElementById('fuelLitersLabel');
    if (lbl) lbl.textContent = `Volume (${meta.unit})`;
  }
  document.getElementById('fuelType')?.addEventListener('change', e => updateUnitLabels(e.target.value));

  // ── Vehicle Setup Sheet ──────────────────────────────────────
  const VS_KEY = 'finhq_vehicle_v1';

  function loadVehicle() {
    try { return JSON.parse(localStorage.getItem(VS_KEY) || 'null'); } catch { return null; }
  }
  function saveVehicle(v) { localStorage.setItem(VS_KEY, JSON.stringify(v)); }

  const plateStyleMap = {
    private:    { bg: '#ffffff', text: '#000000' },
    commercial: { bg: '#FFFF00', text: '#000000' },
    ev:         { bg: '#00873D', text: '#ffffff' },
  };

  function renderVehicleCard() {
    const v = loadVehicle();
    const prompt  = document.getElementById('vehicleSetupPrompt');
    const details = document.getElementById('vehicleDetailsRow');
    if (!v) {
      prompt?.classList.remove('hidden');
      details?.classList.add('hidden');
      return;
    }
    prompt?.classList.add('hidden');
    details?.classList.remove('hidden');
    const nameEl = document.getElementById('vehicleNameDisplay');
    const subEl  = document.getElementById('vehicleSubDisplay');
    if (nameEl) nameEl.textContent = v.name || 'My Vehicle';
    if (subEl)  subEl.textContent  = [v.model, v.year, v.fuelType ? v.fuelType.toUpperCase() : ''].filter(Boolean).join(' · ');
    // Plate display
    const plateText  = document.getElementById('vehiclePlateText');
    const plateBody  = document.getElementById('vehiclePlateBody');
    const s = plateStyleMap[v.plateType || 'private'];
    if (plateText) plateText.textContent = v.plate || '—';
    if (plateBody) { plateBody.style.background = s.bg; plateBody.style.color = s.text; }
  }

  // VS plate type switcher
  let _vsPlateType = 'private';
  function applyVsPlateStyle(type) {
    _vsPlateType = type;
    const s = plateStyleMap[type] || plateStyleMap.private;
    const body  = document.getElementById('vsPlateBody');
    const input = document.getElementById('vsPlate');
    if (body)  { body.style.background = s.bg; }
    if (input) { input.style.color = s.text; }
    document.querySelectorAll('.vs-plate-type').forEach(btn => {
      const active = btn.dataset.vsplatetype === type;
      btn.className = `vs-plate-type${active ? ' active-plate' : ''} text-[9px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg border-2 transition-all ${
        active ? '' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500'
      }`;
    });
  }
  document.querySelectorAll('.vs-plate-type').forEach(btn =>
    btn.addEventListener('click', () => applyVsPlateStyle(btn.dataset.vsplatetype))
  );
  document.getElementById('vsFuelType')?.addEventListener('change', e => {
    if (e.target.value === 'ev') applyVsPlateStyle('ev');
    else if (_vsPlateType === 'ev') applyVsPlateStyle('private');
  });

  function openVehicleSetup() {
    const v = loadVehicle();
    document.getElementById('vsName').value     = v?.name  || '';
    document.getElementById('vsModel').value    = v?.model || '';
    document.getElementById('vsYear').value     = v?.year  || '';
    document.getElementById('vsPlate').value    = v?.plate || '';
    document.getElementById('vsFuelType').value = v?.fuelType || 'petrol';
    applyVsPlateStyle(v?.plateType || 'private');
    ui.openSheet(ui.vehicleSetupSheet);
  }

  document.getElementById('setupVehicleBtn')?.addEventListener('click', openVehicleSetup);
  document.getElementById('editVehicleBtn')?.addEventListener('click', openVehicleSetup);

  document.getElementById('vehicleSetupForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const v = {
      name:      document.getElementById('vsName')?.value.trim(),
      model:     document.getElementById('vsModel')?.value.trim(),
      year:      document.getElementById('vsYear')?.value,
      plate:     document.getElementById('vsPlate')?.value.trim().toUpperCase(),
      plateType: _vsPlateType,
      fuelType:  document.getElementById('vsFuelType')?.value,
    };
    saveVehicle(v);
    renderVehicleCard();
    // Pre-fill fuel type in fuel form
    const ft = document.getElementById('fuelType');
    if (ft && v.fuelType) { ft.value = v.fuelType; updateUnitLabels(v.fuelType); }
    ui.closeAll();
  });

  // Render card on load
  renderVehicleCard();

  // ── Number Plate type switcher (fuel form — kept for applyPlateStyle compat) ──
  const plateStyles = {
    private:    { bg: '#ffffff', text: '#000000' },
    commercial: { bg: '#FFFF00', text: '#000000' },
    ev:         { bg: '#00873D', text: '#ffffff' },
  };
  let _plateType = 'private';
  function applyPlateStyle(_type) { _plateType = _type; } // stub — plate no longer in fuel form

  // Auto-set fuel type from vehicle profile
  const savedVehicle = loadVehicle();
  if (savedVehicle?.fuelType) {
    const ft = document.getElementById('fuelType');
    if (ft) { ft.value = savedVehicle.fuelType; updateUnitLabels(savedVehicle.fuelType); }
  }

  // ── Fuel form reset ──────────────────────────────────────────────────────
  document.addEventListener('resetFuelForm', () => {
    currentEditId = null;
    form?.reset();
    const dateEl = document.getElementById('fuelDate');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteFuelBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveFuelBtn');
    if (saveBtn) saveBtn.innerText = 'Save Log';
    const autoLogBox = document.getElementById('fuelAutoLog');
    if (autoLogBox) autoLogBox.parentElement?.classList.remove('hidden');
    // Restore vehicle fuel type
    const sv = loadVehicle();
    const ftEl = document.getElementById('fuelType');
    if (ftEl && sv?.fuelType) { ftEl.value = sv.fuelType; updateUnitLabels(sv.fuelType); }
    else updateUnitLabels('petrol');
  });

  document.getElementById('addFuelBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetFuelForm'));
    ui.openSheet(ui.fuelForm);
  });

  // ── Fuel form submit ─────────────────────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const odo      = Number(document.getElementById('fuelOdo').value);
      const liters   = Number(document.getElementById('fuelLiters').value);
      const cost     = Number(document.getElementById('fuelCost').value);
      const dateStr  = document.getElementById('fuelDate').value;
      const autoLog  = document.getElementById('fuelAutoLog')?.checked;
      const fuelType = document.getElementById('fuelType')?.value || 'petrol';
      const vehicle  = document.getElementById('fuelVehicle')?.value.trim() || '';
      const meta     = fuelMeta(fuelType);

      if (odo <= 0 || liters <= 0 || cost <= 0) {
        return alert(`Odometer, ${meta.unit === 'kWh' ? 'energy' : 'volume'} and cost must all be greater than 0.`);
      }

      // BUG FIX: Enhanced odometer sequence validation.
      // Previous code only compared against maxOdo, missing mid-sequence inserts
      // and giving a misleading message for duplicates. Now we check three cases:
      //  1. Duplicate odo reading (matches an existing entry exactly)
      //  2. Before-the-start insert (would corrupt all deltas)
      //  3. Mid-sequence insert (changes the delta for the entry above it)
      // A new reading that is strictly greater than all existing readings is
      // the normal case and passes without any prompt.
      if (!currentEditId) {
        const sortedLogs = [...store.fuel].sort((a, b) => a.odo - b.odo);
        if (sortedLogs.length > 0) {
          const minOdo = sortedLogs[0].odo;
          const maxOdo = sortedLogs[sortedLogs.length - 1].odo;
          const isDupe = sortedLogs.some(l => l.odo === odo);

          if (isDupe) {
            const proceed = confirm(
              `⚠️ Duplicate Odometer\n\nA log already exists at ${odo.toLocaleString()} km.\n` +
              `Duplicate readings produce a zero-distance delta (∞ efficiency).\n\nContinue anyway?`
            );
            if (!proceed) return;
          } else if (odo < minOdo) {
            const proceed = confirm(
              `⚠️ Odometer Out of Range\n\nEntered: ${odo.toLocaleString()} km\n` +
              `Earliest log: ${minOdo.toLocaleString()} km\n\n` +
              `Inserting before all existing logs will corrupt every efficiency calculation.\n\nContinue anyway?`
            );
            if (!proceed) return;
          } else if (odo > minOdo && odo < maxOdo) {
            // Mid-sequence: locate the two surrounding entries
            const before = [...sortedLogs].reverse().find(l => l.odo < odo);
            const after  = sortedLogs.find(l => l.odo > odo);
            const proceed = confirm(
              `⚠️ Mid-Sequence Insert\n\nOdometer ${odo.toLocaleString()} km falls between existing logs:\n` +
              `  Before: ${before.odo.toLocaleString()} km\n` +
              `  After:  ${after.odo.toLocaleString()} km\n\n` +
              `The log at ${after.odo.toLocaleString()} km will have its efficiency delta recalculated.\n\nContinue anyway?`
            );
            if (!proceed) return;
          }
          // odo > maxOdo → normal tail-append, no warning needed
        }
      }

      const payload = {
        odo, liters, cost, fuelType, vehicle,
        plate:     document.getElementById('fuelPlate')?.value.trim().toUpperCase() || '',
        plateType: _plateType,
        date:      new Date(dateStr).toISOString(),
        timestamp: new Date(dateStr).getTime(),
      };

      try {
        const saveBtn = document.getElementById('saveFuelBtn');
        if (saveBtn) saveBtn.innerText = 'Saving…';

        if (currentEditId) {
          await updateDoc(doc(db, 'fuel', currentEditId), payload);
        } else {
          await addDoc(collection(db, 'fuel'), payload);
          if (autoLog) {
            await addDoc(collection(db, 'transactions'), {
              title:     `${meta.label} — ${liters}${meta.unit} @ ${odo.toLocaleString()} km`,
              amount:    cost,
              type:      'expense',
              date:      payload.date,
              timestamp: payload.timestamp,
              tags:      ['Transport'],
              label:     'Auto-Logged',
            });
          }
        }
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteFuelBtn')?.addEventListener('click', () => {
      ui.showConfirm('Delete Fuel Log?', 'This cannot be undone. Efficiency stats will recalculate.', async () => {
        try { await deleteDoc(doc(db, 'fuel', currentEditId)); }
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // ── Service form reset ───────────────────────────────────────────────────
  document.addEventListener('resetServiceForm', () => {
    currentServiceEditId = null;
    document.getElementById('serviceForm')?.reset();
    const dateEl = document.getElementById('serviceDate');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    document.getElementById('deleteServiceBtn')?.classList.add('hidden');
    const saveBtn = document.getElementById('saveServiceBtn');
    if (saveBtn) saveBtn.innerText = 'Save Entry';
  });

  document.getElementById('addServiceBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new Event('resetServiceForm'));
    ui.openSheet(ui.serviceForm);
  });

  // ── Service form submit ──────────────────────────────────────────────────
  const serviceForm = document.getElementById('serviceForm');
  if (serviceForm) {
    serviceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const type    = document.getElementById('serviceType').value;
      const dateStr = document.getElementById('serviceDate').value;
      const cost    = Number(document.getElementById('serviceCost').value) || 0;
      const notes   = document.getElementById('serviceNotes').value.trim();
      const vehicle = document.getElementById('serviceVehicle').value.trim();

      const payload = {
        type, cost, notes, vehicle,
        date:      new Date(dateStr).toISOString(),
        timestamp: new Date(dateStr).getTime(),
      };

      try {
        const saveBtn = document.getElementById('saveServiceBtn');
        if (saveBtn) saveBtn.innerText = 'Saving…';
        if (currentServiceEditId) {
          await updateDoc(doc(db, 'serviceLog', currentServiceEditId), payload);
        } else {
          await addDoc(collection(db, 'serviceLog'), payload);
        }
      } catch (err) { console.error(err); } finally { ui.closeAll(); }
    });

    document.getElementById('deleteServiceBtn')?.addEventListener('click', () => {
      ui.showConfirm('Delete Service Entry?', 'This cannot be undone.', async () => {
        try { await deleteDoc(doc(db, 'serviceLog', currentServiceEditId)); }
        catch (err) { console.error(err); } finally { ui.closeAll(); }
      });
    });
  }

  // ── Store subscription ───────────────────────────────────────────────────
  store.subscribe(state => {
    if (!state.isLoaded || !list) return;

    // Sort ascending by odometer for delta calculations
    const sortedLogs = [...state.fuel].sort((a, b) => a.odo - b.odo);
    list.innerHTML   = '';

    if (sortedLogs.length === 0) {
      list.innerHTML = `<p class="text-center text-forest-400 py-10 text-sm">No fuel logs. Add your first fill-up.</p>`;
      if (displayEff)  displayEff.innerHTML  = `0.0 <span class="text-sm text-gray-400">km/L</span>`;
      if (displayCost) displayCost.innerHTML = `₹0.00 <span class="text-sm text-gray-400">/km</span>`;
      renderTrendChart([], trendWrap);
      renderServiceLog(state.serviceLog || [], serviceList, onServiceEdit);
      return;
    }

    // BUG FIX: totalCost and totalLiters are only accumulated when i > 0
    // (i.e., when the log has a preceding entry to compute a valid distance delta).
    // The initial fill-up (i=0) is intentionally excluded from all running totals
    // because there is no distance it can be attributed to — it has no previous
    // odometer reading. Including its cost in totalCost while distance stays 0
    // would inflate the lifetime ₹/km average.
    let totalDist = 0, totalLiters = 0, totalCost = 0;
    // Use the most recent log's fuel type for display units
    const dominantMeta = fuelMeta(sortedLogs[sortedLogs.length - 1]?.fuelType || 'petrol');

    // Render newest-first (descending odo); math is done on ascending array above
    for (let i = sortedLogs.length - 1; i >= 0; i--) {
      const log     = sortedLogs[i];
      const logMeta = fuelMeta(log.fuelType || 'petrol');
      let distance = 0, eff = 0, costPerKm = 0;

      if (i > 0) {
        const prev = sortedLogs[i - 1];
        distance   = log.odo - prev.odo;
        if (distance > 0) {
          eff         = distance / log.liters;
          costPerKm   = log.cost / distance;
          totalDist   += distance;
          totalLiters += log.liters;
          totalCost   += log.cost;
        }
      }

      const pricePerUnit = log.liters > 0 ? (log.cost / log.liters).toFixed(2) : null;
      const dateStr = log.date
        ? new Date(log.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Unknown';

      const statsBadge = distance > 0
        ? `<span class="bg-forest-50 dark:bg-forest-900/30 text-forest-600 dark:text-forest-400 text-[10px] px-2 py-1 rounded-lg">
             ${eff.toFixed(1)} ${logMeta.effUnit} · ₹${costPerKm.toFixed(2)}/km
           </span>`
        : `<span class="bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] px-2 py-1 rounded-lg">Initial Reading</span>`;

      const typeBadge = log.fuelType && log.fuelType !== 'petrol'
        ? `<span class="bg-blue-50 dark:bg-blue-900/20 text-blue-500 text-[9px] px-1.5 py-0.5 rounded font-medium">${logMeta.label}</span>`
        : '';

      const plateColors = { private: 'bg-white border border-gray-300 text-gray-900', commercial: 'bg-yellow-300 text-gray-900', ev: 'bg-green-600 text-white' };
      const plateBadge = log.plate
        ? `<span class="font-mono font-black text-[9px] px-1.5 py-0.5 rounded ${plateColors[log.plateType || 'private'] || plateColors.private}">${log.plate}</span>`
        : '';

      list.innerHTML += `
        <div data-id="${log.id}" class="edit-fuel cursor-pointer bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card border border-forest-50/50 dark:border-gray-700 active:scale-[0.98]">
          <div class="flex justify-between items-center mb-2">
            <span class="font-semibold text-forest-900 dark:text-white flex items-center gap-2">
              <i data-lucide="gauge" class="w-4 h-4 text-gray-400"></i>
              ${log.odo.toLocaleString()} km ${typeBadge} ${plateBadge}
            </span>
            <span class="font-bold text-red-500">₹${log.cost.toLocaleString('en-IN')}</span>
          </div>
          <div class="flex justify-between items-center mt-1">
            <span class="text-xs text-gray-400">
              ${dateStr} · ${log.liters}${logMeta.unit}${pricePerUnit ? ` · ₹${pricePerUnit}/${logMeta.unit}` : ''}
              ${log.vehicle ? `<span class="ml-1 text-gray-300 dark:text-gray-600">|</span> ${log.vehicle}` : ''}
            </span>
            ${statsBadge}
          </div>
        </div>`;
    }

    if (window.lucide) lucide.createIcons();

    if (totalDist > 0) {
      const avgEff  = totalDist / totalLiters;
      const avgCost = totalCost / totalDist;
      if (displayEff)  displayEff.innerHTML  = `${avgEff.toFixed(1)} <span class="text-sm text-gray-400">${dominantMeta.effUnit}</span>`;
      if (displayCost) displayCost.innerHTML = `₹${avgCost.toFixed(2)} <span class="text-sm text-gray-400">/km</span>`;
    }

    renderTrendChart(sortedLogs, trendWrap);
    renderServiceLog(state.serviceLog || [], serviceList, onServiceEdit);
  });

  // ── Edit fuel log (click on card) ────────────────────────────────────────
  list?.addEventListener('click', (e) => {
    const card = e.target.closest('.edit-fuel');
    if (!card) return;
    const log = store.fuel.find(f => f.id === card.dataset.id);
    if (!log) return;

    currentEditId = log.id;
    document.getElementById('fuelOdo').value    = log.odo;
    document.getElementById('fuelLiters').value = log.liters;
    document.getElementById('fuelCost').value   = log.cost;
    if (log.date) document.getElementById('fuelDate').value = log.date.split('T')[0];

    const typeEl = document.getElementById('fuelType');
    if (typeEl) { typeEl.value = log.fuelType || 'petrol'; updateUnitLabels(typeEl.value); }
    const vehicleEl = document.getElementById('fuelVehicle');
    if (vehicleEl) vehicleEl.value = log.vehicle || '';
    // Plate
    const plateEl = document.getElementById('fuelPlate');
    if (plateEl) plateEl.value = log.plate || '';
    applyPlateStyle(log.plateType || (log.fuelType === 'ev' ? 'ev' : 'private'));

    const autoLogBox = document.getElementById('fuelAutoLog');
    if (autoLogBox) { autoLogBox.checked = false; autoLogBox.parentElement?.classList.add('hidden'); }

    document.getElementById('deleteFuelBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveFuelBtn');
    if (saveBtn) saveBtn.innerText = 'Update Log';
    ui.openSheet(ui.fuelForm);
  });

  // ── Edit service log entry ───────────────────────────────────────────────
  function onServiceEdit(log) {
    currentServiceEditId = log.id;
    document.getElementById('serviceType').value    = log.type    || 'oil';
    document.getElementById('serviceCost').value    = log.cost    || '';
    document.getElementById('serviceNotes').value   = log.notes   || '';
    document.getElementById('serviceVehicle').value = log.vehicle || '';
    if (log.date) document.getElementById('serviceDate').value = log.date.split('T')[0];

    document.getElementById('deleteServiceBtn')?.classList.remove('hidden');
    const saveBtn = document.getElementById('saveServiceBtn');
    if (saveBtn) saveBtn.innerText = 'Update Entry';
    ui.openSheet(ui.serviceForm);
  }
}
