// ============================================================
// Spacio AM — Contabilidad · almacén (persistencia)
// ------------------------------------------------------------
// Guarda los movimientos clasificados por (mes, cuenta). Escribe
// en localStorage de inmediato (demo + cache offline) y, si el
// backend de escritura está conectado, replica al Sheet para que
// el contador lo vea desde cualquier dispositivo.
// ============================================================
(function () {
  "use strict";
  const PREFIX = "sa-conta-stmt-";          // + ym + "|" + accId
  const INDEX_KEY = "sa-conta-index";        // lista de "ym|accId" guardados

  function readIndex() { try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); } catch (e) { return []; } }
  function writeIndex(arr) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(arr)); } catch (e) {} }
  function key(ym, accId) { return ym + "|" + accId; }

  function getStatement(ym, accId) {
    try { const raw = localStorage.getItem(PREFIX + key(ym, accId)); if (raw) return JSON.parse(raw); } catch (e) {}
    // clasificación en vivo desde los Google Sheets mensuales (2026)
    const live = window.SpacioContaLive && window.SpacioContaLive.getStatement(ym, accId);
    if (live) return live;
    return backendStatement(ym, accId);
  }

  // ---- lectura del backend (tab "Contabilidad" cargada por sheets.js) ----
  function backendRows() { return (window.SpacioData && window.SpacioData.conta) || []; }
  function backendStatement(ym, accId) {
    const rs = backendRows().filter(r => r.ym === ym && r.account === accId);
    if (!rs.length) return null;
    // DEDUPE: versiones viejas del Apps Script acumulaban filas en vez de
    // reemplazarlas. Mismo movimiento (fecha|doc|desc|debe|haber|saldo) → se
    // queda la ÚLTIMA escritura, salvo que pierda un tag que otra sí tenía.
    const seen = {}; const uniq = [];
    rs.forEach(r => {
      const k = [r.date, r.doc, r.desc, r.debit, r.credit, r.saldo].join("|");
      if (seen[k] == null) { seen[k] = uniq.length; uniq.push(r); }
      else { const prev = uniq[seen[k]]; if (!(prev.tag && !r.tag)) uniq[seen[k]] = r; else if (!prev.factura && r.factura) prev.factura = r.factura; }
    });
    const pdfUrl = (uniq.find(r => r.pdfUrl) || {}).pdfUrl || "";
    return {
      ym, accId, currency: uniq[0].currency || "", fromBackend: true,
      pdf: pdfUrl ? { url: pdfUrl, name: "" } : null,
      rows: uniq.map(r => ({ date: r.date, doc: r.doc, desc: r.desc, debit: r.debit, credit: r.credit, saldo: r.saldo, tt: r.tt, tag: r.tag, category: r.category, factura: r.factura || "", source: r.tag ? "backend" : null, reviewed: !!r.tag })),
    };
  }
  function backendKeys() {
    const set = {}; backendRows().forEach(r => { set[r.ym + "|" + r.account] = 1; }); return Object.keys(set);
  }
  function allKeys() {
    const set = {}; readIndex().forEach(k => set[k] = 1); backendKeys().forEach(k => set[k] = 1);
    if (window.SpacioContaLive) window.SpacioContaLive.keys().forEach(k => set[k] = 1);
    return Object.keys(set);
  }

  function saveStatement(stmt) {
    // stmt: { ym, accId, currency, rows:[...], totals, pdf:{name,url}, savedAt }
    stmt.savedAt = Date.now();
    try { localStorage.setItem(PREFIX + key(stmt.ym, stmt.accId), JSON.stringify(stmt)); } catch (e) {}
    const idx = readIndex(); const k = key(stmt.ym, stmt.accId);
    if (idx.indexOf(k) < 0) { idx.push(k); writeIndex(idx); }
    // alimenta el diccionario de autoclasificación con lo confirmado
    if (window.SpacioConta) {
      window.SpacioConta.learnBulk(
        (stmt.rows || []).filter(r => r.tag && (r.source === "manual" || r.reviewed))
          .map(r => ({ memo: r.desc, tag: r.tag }))
      );
    }
    // backend best-effort
    backendSave(stmt);
    return stmt;
  }

  function backendSave(stmt) {
    try {
      if (window.SpacioWrite && window.SpacioWrite.enabled && window.SpacioWrite.enabled()) {
        window.SpacioWrite.post("writeConta", {
          ym: stmt.ym, account: stmt.accId, currency: stmt.currency,
          totals: stmt.totals || null, pdf: stmt.pdf || null,
          rows: (stmt.rows || []).map(r => ({
            date: r.date, doc: r.doc, desc: r.desc, debit: r.debit, credit: r.credit,
            saldo: r.saldo, tt: r.tt, tag: r.tag || "", categoria: r.category || "", factura: r.factura || "",
          })),
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // todos los movimientos de un mes (todas las cuentas o una)
  function rowsForMonth(ym, accId) {
    const out = [];
    listStatements().forEach(s => {
      if (s.ym !== ym) return;
      if (accId && accId !== "all" && s.accId !== accId) return;
      (s.rows || []).forEach(r => out.push(Object.assign({ _accId: s.accId, _currency: s.currency }, r)));
    });
    return out;
  }

  function listStatements() {
    return allKeys().map(k => { const [ym, accId] = k.split("|"); return getStatement(ym, accId); }).filter(Boolean);
  }
  function listMonths() {
    const set = {}; allKeys().forEach(k => { set[k.split("|")[0]] = 1; });
    return Object.keys(set).sort().reverse();
  }
  function statementsForMonth(ym) { return listStatements().filter(s => s.ym === ym); }

  function deleteStatement(ym, accId) {
    try { localStorage.removeItem(PREFIX + key(ym, accId)); } catch (e) {}
    writeIndex(readIndex().filter(k => k !== key(ym, accId)));
    // limpia también el backend (reescribe ese ym/cuenta sin filas)
    try {
      if (window.SpacioWrite && window.SpacioWrite.enabled && window.SpacioWrite.enabled()) {
        window.SpacioWrite.post("writeConta", { ym: ym, account: accId, currency: "", rows: [] }).catch(() => {});
      }
    } catch (e) {}
  }

  window.SpacioContaStore = {
    getStatement, saveStatement, rowsForMonth, listStatements, listMonths, statementsForMonth, deleteStatement,
  };
})();
