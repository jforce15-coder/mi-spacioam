// ============================================================
// Spacio AM — Contabilidad · gastos operativos + otros ingresos (globales)
// ------------------------------------------------------------
// Movimientos que NO son por propiedad: gastos operativos de la
// empresa y otros ingresos manuales. Se guardan en localStorage
// de inmediato y se replican al backend (hoja "Gastos operativos")
// si la conexión de escritura está activa. Al cargar, se combinan
// los registros del backend (window.SpacioData.contaOpex) con los
// locales.
//
// Registro: { id, kind, ym, concepto, categoria, monto, currency, fileUrl, fileName, ts }
//   kind: "opex"  → gasto operativo (resta del ingreso bruto)
//         "otro"  → otro ingreso (suma al ingreso bruto)
//   monto: número en su propia moneda (currency: "GTQ" | "USD")
// ============================================================
(function () {
  "use strict";
  const LS_KEY = "sa-conta-opex";
  const RATE = (window.SpacioI18n && window.SpacioI18n.GTQ_RATE) || 7.46;

  function readLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; } }
  function writeLocal(arr) { try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) {} }

  // backend rows (cargados por sheets.js desde la hoja "Gastos operativos")
  function backendRows() { return (window.SpacioData && window.SpacioData.contaOpex) || []; }

  // combina backend + local; local con mismo id pisa al backend; tombstones ("__deleted__") ocultan
  function records() {
    const byId = {};
    backendRows().forEach(r => { if (r && r.id) byId[r.id] = r; });
    readLocal().forEach(r => {
      if (!r || !r.id) return;
      if (r.deleted) { delete byId[r.id]; return; }
      byId[r.id] = r;
    });
    return Object.values(byId).filter(Boolean).sort((a, b) => (a.ym < b.ym ? 1 : a.ym > b.ym ? -1 : (b.ts || 0) - (a.ts || 0)));
  }

  function forMonth(ym, kind) { return records().filter(r => r.ym === ym && (!kind || r.kind === kind)); }
  function forYear(year, kind) { return records().filter(r => r.ym && r.ym.slice(0, 4) === String(year) && (!kind || r.kind === kind)); }

  // monto convertido a USD base (para sumar con el resto del dashboard, que está en USD)
  function usdOf(r) { const v = +(r.monto || 0); return r.currency === "GTQ" ? v / RATE : v; }
  function totalUsd(list) { return list.reduce((a, r) => a + usdOf(r), 0); }

  function add(rec) {
    const r = Object.assign({
      id: "ox" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      kind: "opex", ym: "", concepto: "", categoria: "", monto: 0, currency: "GTQ",
      fileUrl: "", fileName: "", ts: Date.now(),
    }, rec);
    const arr = readLocal(); arr.push(r); writeLocal(arr);
    backendSave(r);
    return r;
  }

  function remove(id) {
    const arr = readLocal().filter(r => r.id !== id);
    // tombstone si el registro vive en el backend
    if (backendRows().some(r => r.id === id)) arr.push({ id, deleted: true, ts: Date.now() });
    writeLocal(arr);
    try {
      if (window.SpacioWrite && window.SpacioWrite.enabled && window.SpacioWrite.enabled()) {
        window.SpacioWrite.post("deleteContaOpex", { id }).catch(() => {});
      }
    } catch (e) {}
  }

  function backendSave(r) {
    try {
      if (window.SpacioWrite && window.SpacioWrite.enabled && window.SpacioWrite.enabled()) {
        window.SpacioWrite.post("writeContaOpex", {
          id: r.id, kind: r.kind, ym: r.ym, concepto: r.concepto, categoria: r.categoria || "",
          monto: r.monto, moneda: r.currency, url: r.fileUrl || "", archivo: r.fileName || "",
        }).catch(() => {});
      }
    } catch (e) {}
  }

  window.SpacioContaOpex = { records, forMonth, forYear, usdOf, totalUsd, add, remove, RATE };
})();
