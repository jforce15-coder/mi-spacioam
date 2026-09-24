/* ============================================================
   Spacio AM — filas genéricas por pestaña (Facturas · Contratos · Long term)
   Lectura: SpacioData.rows[tab] (cargado por sheets.js) + cambios locales.
   Escritura: localStorage inmediato + Apps Script (writeRows / deleteRows).
   Cada fila se identifica por "id".
   ============================================================ */
(function () {
  "use strict";
  var PFX = "sa-rows-";
  function readLocal(tab) { try { return JSON.parse(localStorage.getItem(PFX + tab)) || {}; } catch (e) { return {}; } }
  function writeLocal(tab, o) {
    try { localStorage.setItem(PFX + tab, JSON.stringify(o)); return true; }
    catch (e) { // sin espacio: se guardan solo campos clave (la memoria de la sesión conserva todo)
      try { var s = {}; Object.keys(o).forEach(function (k) { var v = o[k]; s[k] = v === null ? null : { id: v.id, tipo: v.tipo, auth: v.auth, clasificacion: v.clasificacion, propiedad: v.propiedad, fuente: v.fuente, ref: v.ref, fecha: v.fecha, mes: v.mes, total: v.total, moneda: v.moneda, contraparte: v.contraparte, nit: v.nit, property_name: v.property_name, monto: v.monto, url: v.url, nombre: v.nombre, origen: v.origen, estado: v.estado }; }); localStorage.setItem(PFX + tab, JSON.stringify(s)); return true; } catch (e2) { return false; }
    }
  }
  function emit(tab) { try { window.dispatchEvent(new CustomEvent("sa-rows", { detail: { tab: tab } })); } catch (e) {} }
  function backend(tab) { var d = window.SpacioData && window.SpacioData.rows; return (d && d[tab]) || []; }

  // Cambios pendientes: solo el DELTA de cada fila (no la fila completa) para no
  // llenar localStorage. MEM mantiene lo confirmado por la hoja en esta sesión.
  var MEM = {};
  function mem(tab) { return (MEM[tab] = MEM[tab] || {}); }
  function list(tab) {
    var loc = readLocal(tab), m = mem(tab), out = {}, order = [];
    backend(tab).forEach(function (r) { var id = String(r.id || "").trim(); if (!id) return; if (!(id in out)) order.push(id); out[id] = r; });
    [m, loc].forEach(function (src) { Object.keys(src).forEach(function (id) {
      if (src[id] === null) { out[id] = null; return; }
      if (!(id in out)) order.push(id);
      out[id] = Object.assign({}, out[id] || {}, src[id]);
    }); });
    return order.map(function (id) { return out[id]; }).filter(Boolean);
  }
  function get(tab, id) { return list(tab).find(function (r) { return String(r.id) === String(id); }) || null; }

  var CHUNK = 100;
  async function upsert(tab, rows) {
    rows = (rows || []).filter(function (r) { return r && r.id; });
    if (!rows.length) return { ok: true, n: 0 };
    var now = new Date().toISOString();
    rows = rows.map(function (r) { return Object.assign({}, r, { savedAt: now }); });
    var loc = readLocal(tab), m = mem(tab);
    rows.forEach(function (r) { loc[r.id] = Object.assign({}, loc[r.id] || {}, r); m[r.id] = Object.assign({}, m[r.id] || {}, r); });
    writeLocal(tab, loc); emit(tab);
    var W = window.SpacioWrite;
    if (!(W && W.enabled && W.enabled())) return { ok: true, local: true, n: rows.length };
    var okN = 0, err = "";
    for (var k = 0; k < rows.length; k += CHUNK) {
      var part = rows.slice(k, k + CHUNK);
      var res = await W.post("writeRows", { tab: tab, rows: part });
      if (res && res.ok) {
        okN += part.length;
        var l2 = readLocal(tab); part.forEach(function (r) { delete l2[r.id]; }); writeLocal(tab, l2);
      } else { err = (res && res.error) || "sin conexión"; break; }
    }
    emit(tab);
    return okN === rows.length ? { ok: true, n: okN } : { ok: false, n: okN, pending: rows.length - okN, error: err };
  }
  async function remove(tab, ids) {
    var loc = readLocal(tab), m = mem(tab);
    (ids || []).forEach(function (id) { loc[id] = null; m[id] = null; });
    writeLocal(tab, loc); emit(tab);
    var W = window.SpacioWrite;
    if (!(W && W.enabled && W.enabled())) return { ok: true, local: true };
    var res = await W.post("deleteRows", { tab: tab, ids: ids });
    if (res && res.ok) { var l2 = readLocal(tab); (ids || []).forEach(function (id) { delete l2[id]; }); writeLocal(tab, l2); }
    return res;
  }
  // reintenta lo que quedó pendiente en este navegador
  async function flush(tab) {
    var loc = readLocal(tab), ups = [], dels = [];
    Object.keys(loc).forEach(function (id) { if (loc[id] === null) dels.push(id); else ups.push(Object.assign({ id: id }, loc[id])); });
    var a = ups.length ? await upsert(tab, ups) : { ok: true, n: 0 };
    if (dels.length) await remove(tab, dels);
    return a;
  }
  function pendingCount(tab) { return Object.keys(readLocal(tab)).length; }

  function fileToBase64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1] || ""); };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }
  // sube un archivo a Drive (acción uploadFile existente) y devuelve { ok, url, fileName }
  async function uploadToDrive(kind, file, meta) {
    var W = window.SpacioWrite;
    if (!(W && W.enabled && W.enabled())) return { ok: false, offline: true };
    var b64 = await fileToBase64(file);
    return await W.post("uploadFile", Object.assign({ kind: kind, scope: "property", multiple: true, fileName: file.name, mimeType: file.type || "application/pdf", dataBase64: b64 }, meta || {}));
  }

  // normaliza texto: minúsculas, sin acentos, solo letras/números/espacios
  function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  var STOP = { contrato: 1, contratos: 1, pdf: 1, firmado: 1, firmada: 1, spacio: 1, am: 1, de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, y: 1, co: 1, hosting: 1, cohosting: 1, apto: 1, apartamento: 1, casa: 1, final: 1, copia: 1, scan: 1, doc: 1, docx: 1, version: 1, v: 1 };
  // Sugerencia de propiedad a partir de un texto (nombre de archivo, nombre en EPI…).
  // Números (623, 1012) pesan más que palabras (Narama, Likin). Devuelve { name, score, sure }.
  function suggestProperty(text, props) {
    var t = norm(String(text || "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_\-]+/g, " "));
    if (!t) return null;
    var toks = t.split(" ").filter(function (w) { return w && !STOP[w]; });
    var nums = toks.filter(function (w) { return /^\d{2,5}$/.test(w); });
    var words = toks.filter(function (w) { return !/^\d+$/.test(w) && w.length >= 3; });
    var scored = (props || []).map(function (p) {
      var name = typeof p === "string" ? p : (p.name || "");
      var hay = norm(name + " " + (p.location || "") + " " + (p.edificio || ""));
      var hToks = hay.split(" "); var s = 0;
      nums.forEach(function (n) { if (hToks.indexOf(n) >= 0) s += 6; else if (hay.indexOf(n) >= 0) s += 2; });
      words.forEach(function (w) { if (hToks.indexOf(w) >= 0) s += 3; else if (hToks.some(function (h) { return h.length >= 4 && (h.indexOf(w) === 0 || w.indexOf(h) === 0); })) s += 2; });
      if (norm(name) && t.indexOf(norm(name)) >= 0) s += 4;
      return { name: name, score: s };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; });
    if (!scored.length) return null;
    var top = scored[0], second = scored[1];
    return { name: top.name, score: top.score, sure: top.score >= 5 && (!second || top.score > second.score) };
  }

  window.SaRows = { list: list, get: get, upsert: upsert, remove: remove, flush: flush, pendingCount: pendingCount, uploadToDrive: uploadToDrive, fileToBase64: fileToBase64, norm: norm, suggestProperty: suggestProperty };
})();
