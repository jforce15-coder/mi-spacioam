/* ============================================================
   Spacio AM · Importación de reportes de mantenimiento
   Trae de la hoja "Spacio AM DB" (área de reportes) únicamente los
   registros de categoría "Mantenimiento" desde el 1 de julio 2026.
   Carga inicial la primera vez; luego sincronización rutinaria semanal.
   Cada reporte queda PENDIENTE hasta que el administrador lo valide
   (conservar → se escribe en "insumos & gastos"; eliminar → se descarta).
   ============================================================ */
(function () {
  "use strict";

  var SHEET_ID = "1-SfKC-evkK24qfOrrvIrcDs6ckGAmRzSLS_IYB8cYZg";
  // Nombres de pestaña candidatos: se prueba en orden y se cae al primer
  // sheet del documento si ninguno responde.
  var TABS = ["reportes", "Reportes", "reporte", "DB", "registros", ""];
  var DESDE = "2026-07-01";          // carga inicial: nada anterior a esta fecha
  var CADA_MS = 7 * 24 * 60 * 60 * 1000; // rutina semanal
  var LS_STATE = "spacio_rep_state_v1";  // { lastSync, decided:{id:"ok"|"no"} }
  var LS_CACHE = "spacio_rep_cache_v1";  // { id: reporte } para "Ver detalle"

  function readLS(k, dflt) {
    try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v || dflt; } catch (e) { return dflt; }
  }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function state() { var s = readLS(LS_STATE, {}); if (!s.decided) s.decided = {}; return s; }
  function saveState(s) { writeLS(LS_STATE, s); }
  function cache() { return readLS(LS_CACHE, {}); }
  function saveCache(c) { writeLS(LS_CACHE, c); }

  // ---------- CSV ----------
  function parseCSV(text) {
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c !== "\r") cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function objectify(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return String(h || "").trim(); });
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (r.every(function (c) { return !c || !String(c).trim(); })) continue;
      var o = {};
      head.forEach(function (h, j) { if (h) o[h] = r[j] != null ? String(r[j]).trim() : ""; });
      out.push(o);
    }
    return out;
  }
  function csvURL(tab) {
    var u = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv";
    return tab ? u + "&sheet=" + encodeURIComponent(tab) : u;
  }

  // ---------- normalización ----------
  function normDate(v) {
    var s = String(v || "").trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[3]).padStart(2, "0");
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/yyyy
    if (m) return m[3] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0");
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return "";
  }
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
  function isMantenimiento(cat) { return /mantenimiento/i.test(String(cat || "")); }
  // fotos vienen como JSON array, objeto de urls, o url suelta
  function urls(v) {
    var s = String(v || "").trim();
    if (!s) return [];
    if (s[0] === "[" || s[0] === "{") {
      try {
        var j = JSON.parse(s), out = [];
        (function walk(x) {
          if (!x) return;
          if (typeof x === "string") { if (/^https?:/.test(x)) out.push(x); return; }
          if (Array.isArray(x)) { x.forEach(walk); return; }
          if (typeof x === "object") Object.keys(x).forEach(function (k) { walk(x[k]); });
        })(j);
        return out;
      } catch (e) { /* cae abajo */ }
    }
    return /^https?:/.test(s) ? [s] : [];
  }

  // Empareja el texto "propiedad" del reporte con una propiedad del dashboard.
  function matchProperty(propiedad) {
    var raw = String(propiedad || "").trim();
    if (!raw) return "";
    var list = (window.SpacioData && window.SpacioData.propertyList || []).map(function (p) { return p.name; }).filter(Boolean);
    if (!list.length) return raw;
    var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9áéíóúñ]/gi, ""); };
    var target = norm(raw);
    for (var i = 0; i < list.length; i++) if (norm(list[i]) === target) return list[i];
    // por número de apartamento + una palabra del nombre
    var numM = raw.match(/(\d{3,4})\s*$/);
    var best = "", bestScore = 0;
    list.forEach(function (name) {
      var score = 0;
      if (numM && new RegExp("\\b" + numM[1] + "\\b").test(name)) score += 5;
      String(name).toLowerCase().split(/[\s\-]+/).forEach(function (tok) {
        if (tok.length >= 4 && /[a-záéíóúñ]/i.test(tok) && target.indexOf(norm(tok)) > -1) score += tok.length;
      });
      if (score > bestScore) { bestScore = score; best = name; }
    });
    return bestScore >= 5 ? best : "";
  }

  function toReporte(r) {
    var fecha = normDate(r.fecha || r.createdAt);
    var id = String(r.id || (fecha + "-" + (r.propiedad || "") + "-" + (r.total || ""))).trim();
    return {
      id: id,
      fecha: fecha,
      propiedadRaw: String(r.propiedad || "").trim(),
      property_name: matchProperty(r.propiedad),
      categoria: String(r.categoria || "").trim(),
      tecnico: String(r.reportadoPor || "").trim(),
      descripcion: String(r.descripcion || "").trim(),
      comentarios: String(r.comentarios || "").trim(),
      total: num(r.total),
      pagado: /true|sí|si|1/i.test(String(r.paid || "")),
      pagadoPor: String(r.pagadoPor || "").trim(),
      fotoAntes: urls(r.fotoAntes),
      fotoDespues: urls(r.fotoDespues),
      factura: String(r.factura || "").trim(),
    };
  }

  // ---------- fetch ----------
  async function fetchAll() {
    var lastErr = null;
    for (var i = 0; i < TABS.length; i++) {
      try {
        var res = await fetch(csvURL(TABS[i]));
        if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
        var txt = await res.text();
        if (/^\s*</.test(txt)) { lastErr = new Error("sin acceso público"); continue; }
        var items = objectify(parseCSV(txt));
        // la pestaña correcta tiene las columnas esperadas
        if (items.length && ("categoria" in items[0]) && ("propiedad" in items[0])) return items;
        lastErr = new Error("columnas no coinciden");
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("No se pudo leer la hoja de reportes");
  }

  // Devuelve solo mantenimiento, desde DESDE, sin los ya decididos.
  async function sync() {
    var items = await fetchAll();
    var reps = items.map(toReporte).filter(function (r) {
      return r.id && isMantenimiento(r.categoria) && r.fecha && r.fecha >= DESDE;
    });
    var c = cache();
    reps.forEach(function (r) { c[r.id] = r; });
    saveCache(c);
    var s = state();
    s.lastSync = Date.now();
    saveState(s);
    return reps;
  }

  function pending(reps) {
    var d = state().decided || {};
    return (reps || []).filter(function (r) { return !d[r.id]; });
  }
  function decide(id, verdict) { var s = state(); s.decided[id] = verdict; saveState(s); }
  function undecide(id) { var s = state(); delete s.decided[id]; saveState(s); }
  function needsSync() {
    var s = state();
    return !s.lastSync || (Date.now() - s.lastSync) > CADA_MS;
  }
  function lastSync() { return state().lastSync || 0; }
  function get(id) { return cache()[id] || null; }
  function decidedCount() { return Object.keys(state().decided || {}).length; }

  // Fila para "insumos & gastos" al validar (conservar)
  function sheetRow(r) {
    var MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    var mm = r.fecha ? +r.fecha.slice(5, 7) : 0;
    return {
      Mes: mm ? MES[mm - 1] : "",
      "Fecha de pedido": r.fecha,
      property_name: r.property_name,
      valor: r.total,
      categoria: "Reparaciones o inversión",
      Comentario: (r.descripcion || "Mantenimiento") + " · [REP:" + r.id + "] Ver detalle",
      tag: "",
      orderId: "REP-" + String(r.id).replace(/[^A-Za-z0-9]+/g, "-"),
      orderUrl: "", authProductos: "", authTarifa: "",
    };
  }
  // extrae el id de reporte de un comentario guardado (para "Ver detalle")
  function refOf(comentario) {
    var m = String(comentario || "").match(/\[REP:([^\]]+)\]/);
    return m ? m[1] : "";
  }
  function cleanComment(comentario) {
    return String(comentario || "").replace(/\s*·?\s*\[REP:[^\]]+\]\s*Ver detalle/i, "").trim();
  }

  window.SpacioReportes = {
    SHEET_ID: SHEET_ID, DESDE: DESDE,
    sync: sync, pending: pending, decide: decide, undecide: undecide,
    needsSync: needsSync, lastSync: lastSync, get: get, decidedCount: decidedCount,
    sheetRow: sheetRow, refOf: refOf, cleanComment: cleanComment,
  };
})();
