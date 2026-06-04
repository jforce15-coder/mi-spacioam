/* ============================================================
   Spacio AM — Owner Dashboard · Aggregation (real-data shape)
   Occupancy is summed honestly: nights / available — never clamped,
   so a long reservation crossing months can read above 100%.
   ============================================================ */
(function () {
  "use strict";

  const MONEY = ["ingresoBruto", "ingresoNeto", "fee", "insumos", "reparaciones", "gastos", "otrosDescuentos", "ivaTotal", "ivaSocios", "hostFee", "cleaningFee", "otrosIngresos", "otrosIngresos2", "retencion", "deposito", "costoOportunidad"];
  const COUNT = ["nochesReservadas", "estadias", "huespedes", "nochesBloqueadas", "available", "totalDays"];

  function aggregate(slice) {
    const present = slice.filter(m => m.present);
    const o = { months: slice };
    MONEY.concat(COUNT).forEach(k => { o[k] = present.reduce((a, m) => a + (m[k] || 0), 0); });
    o.ocupacionAjustada = o.available ? o.nochesReservadas / o.available : 0;
    o.ocupacionTotal = o.totalDays ? o.nochesReservadas / o.totalDays : 0;
    // ADR from the sheet's "Precio Prom" (authoritative), nights-weighted
    const adrW = present.reduce((a, m) => a + (m.adr || 0) * (m.nochesReservadas || 0), 0);
    o.adr = o.nochesReservadas ? adrW / o.nochesReservadas : (present.length ? present.reduce((a, m) => a + (m.adr || 0), 0) / present.length : 0);
    o.leadTime = present.length ? present.reduce((a, m) => a + (m.leadTime || 0), 0) / present.length : 0;
    o.estadiaProm = o.estadias ? o.nochesReservadas / o.estadias : 0;
    o.presentCount = present.length;
    return o;
  }

  // combine several properties into one synthetic monthly series (aligned by index)
  function combineMonths(props) {
    const n = props[0].months.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const ms = props.map(p => p.months[i]);
      const present = ms.filter(m => m.present);
      const ref = ms[0];
      const o = { y: ref.y, m: ref.m, label: ref.label, present: present.length > 0 };
      MONEY.concat(COUNT).forEach(k => { o[k] = ms.reduce((a, m) => a + (m[k] || 0), 0); });
      o.ocupacionAjustada = o.available ? o.nochesReservadas / o.available : 0;
      o.ocupacionTotal = o.totalDays ? o.nochesReservadas / o.totalDays : 0;
      const adrW = ms.reduce((a, m) => a + (m.adr || 0) * (m.nochesReservadas || 0), 0);
      o.adr = o.nochesReservadas ? adrW / o.nochesReservadas : (present.length ? present.reduce((a, m) => a + (m.adr || 0), 0) / present.length : 0);
      o.leadTime = present.length ? present.reduce((a, m) => a + (m.leadTime || 0), 0) / present.length : 0;
      o.estadiaProm = o.estadias ? o.nochesReservadas / o.estadias : 0;
      out.push(o);
    }
    return out;
  }

  const PERIOD_LEN = { current: 1, prev: 1, m3: 3, m6: 6, m12: 12 };

  // slice anchored to the GLOBAL calendar axis (months[] always spans all monthKeys).
  // Reference end = last CLOSED month (strictly before the current calendar month),
  // so "último mes" means e.g. May 2026 in June 2026 — NOT each property's last movement.
  function periodData(months, period) {
    const n = months.length;
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth(); // current (open) month
    let refEnd = -1;
    for (let i = 0; i < n; i++) {
      const mm = months[i];
      if (mm.y < curY || (mm.y === curY && mm.m < curM)) refEnd = i; // last closed month
    }
    if (refEnd < 0) refEnd = n - 1; // fallback if all data is in the future

    let idxs = [], prevIdxs = [], len = PERIOD_LEN[period] || 1;
    const ym = (typeof period === "string" && period.indexOf("ym:") === 0) ? period.slice(3).split("-").map(Number) : null;
    if (ym) {
      len = 1;
      let pos = months.findIndex(mm => mm.y === ym[0] && mm.m === ym[1]);
      if (pos < 0) pos = refEnd;
      idxs = [pos];
      prevIdxs = pos > 0 ? [pos - 1] : [];
    } else {
      let endPos = refEnd;
      if (period === "prev") endPos = refEnd - 1;
      if (endPos < 0) endPos = 0;
      const startPos = Math.max(0, endPos - len + 1);
      for (let i = startPos; i <= endPos; i++) idxs.push(i);
      const prevEnd = startPos - 1, prevStart = prevEnd - len + 1;
      if (prevEnd >= 0) for (let i = Math.max(0, prevStart); i <= prevEnd; i++) prevIdxs.push(i);
    }
    const slice = idxs.map(i => months[i]).filter(Boolean);
    const prevSlice = prevIdxs.map(i => months[i]).filter(Boolean);

    const cur = aggregate(slice.length ? slice : [months[refEnd]].filter(Boolean));
    const prev = prevSlice.length ? aggregate(prevSlice) : null;
    const presentIdx = months.map((m, i) => m.present ? i : -1).filter(i => i >= 0);
    const presentMonths = presentIdx.map(i => months[i]);
    const hist = aggregate(presentMonths);
    hist.months = presentMonths;
    hist.avgNeto = presentMonths.length ? presentMonths.reduce((a, m) => a + m.ingresoNeto, 0) / presentMonths.length : 0;
    hist.avgOcc = presentMonths.length ? presentMonths.reduce((a, m) => a + m.ocupacionAjustada, 0) / presentMonths.length : 0;
    hist.avgAdr = presentMonths.length ? presentMonths.reduce((a, m) => a + m.adr, 0) / presentMonths.length : 0;
    const endMonth = slice.length ? slice[slice.length - 1] : (months[refEnd] || null);
    return { cur, prev, hist, slice, prevSlice, len, label: endMonth ? endMonth.label : { es: "", en: "" } };
  }

  function delta(cur, prev, key) {
    if (!prev || !prev[key]) return null;
    return ((cur[key] - prev[key]) / Math.abs(prev[key])) * 100;
  }

  function collectRows(props, slice, field) {
    const keys = new Set(slice.map(m => m.y + "-" + m.m));
    let rows = [];
    props.forEach(p => { rows = rows.concat((p[field] || []).map(r => Object.assign({ _prop: p.name }, r))); });
    return rows.filter(r => r.m == null || keys.has(r.y + "-" + r.m));
  }

  // reservations for a single property + month, ascending by check-in
  function resForMonth(property, y, m) {
    return (property.reservations || [])
      .filter(r => r.y === y && r.m === m)
      .sort((a, b) => (a._sort - b._sort) || (a.nights - b.nights));
  }

  // year-over-year series by calendar month (Jan..Dec); one line per year present
  function yoyByMonth(months, key) {
    const years = [...new Set(months.filter(m => m.present).map(m => m.y))].sort();
    const series = years.map(yr => {
      const values = new Array(12).fill(null);
      months.forEach(m => { if (m.present && m.y === yr) values[m.m] = m[key]; });
      return { year: yr, values };
    });
    return { years, series };
  }

  // evolution: chronological series of one metric, with an optional comparison line
  // mode: "year" → same calendar month previous year; "month" → previous month's value
  function evoSeries(months, key, mode) {
    const present = months.filter(m => m.present);
    const labels = present.map(m => m.label);
    const primary = present.map(m => m[key]);
    let compare = present.map(() => null);
    let overlap = false;
    if (mode === "month") {
      compare = present.map((m, i) => i > 0 ? present[i - 1][key] : null);
      overlap = present.length > 1;
    } else { // year
      const byYM = {};
      present.forEach(m => { byYM[m.y + "-" + m.m] = m[key]; });
      compare = present.map(m => {
        const v = byYM[(m.y - 1) + "-" + m.m];
        if (v != null) overlap = true;
        return v != null ? v : null;
      });
    }
    return { labels, primary, compare, overlap, present };
  }

  window.SpacioAgg = { aggregate, combineMonths, periodData, delta, collectRows, resForMonth, yoyByMonth, evoSeries, PERIOD_LEN };
})();
