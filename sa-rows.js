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
  function writeLocal(tab, o) { try { localStorage.setItem(PFX + tab, JSON.stringify(o)); } catch (e) {} }
  function emit(tab) { try { window.dispatchEvent(new CustomEvent("sa-rows", { detail: { tab: tab } })); } catch (e) {} }
  function backend(tab) { var d = window.SpacioData && window.SpacioData.rows; return (d && d[tab]) || []; }

  function list(tab) {
    var loc = readLocal(tab), out = {}, order = [];
    backend(tab).forEach(function (r) { var id = String(r.id || "").trim(); if (!id) return; if (!(id in out)) order.push(id); out[id] = r; });
    Object.keys(loc).forEach(function (id) { if (!(id in out)) order.push(id); out[id] = loc[id]; });
    return order.map(function (id) { return out[id]; }).filter(Boolean);
  }
  function get(tab, id) { return list(tab).find(function (r) { return String(r.id) === String(id); }) || null; }

  async function upsert(tab, rows) {
    rows = (rows || []).filter(function (r) { return r && r.id; });
    if (!rows.length) return { ok: true, n: 0 };
    var loc = readLocal(tab);
    rows.forEach(function (r) { r.savedAt = new Date().toISOString(); loc[r.id] = Object.assign({}, loc[r.id] || get(tab, r.id) || {}, r); });
    writeLocal(tab, loc); emit(tab);
    var W = window.SpacioWrite;
    if (!(W && W.enabled && W.enabled())) return { ok: true, local: true, n: rows.length };
    var res = await W.post("writeRows", { tab: tab, rows: rows });
    return res && res.ok ? Object.assign({ n: rows.length }, res) : Object.assign({ ok: false }, res || {});
  }
  async function remove(tab, ids) {
    var loc = readLocal(tab);
    (ids || []).forEach(function (id) { loc[id] = null; });
    writeLocal(tab, loc); emit(tab);
    var W = window.SpacioWrite;
    if (!(W && W.enabled && W.enabled())) return { ok: true, local: true };
    return await W.post("deleteRows", { tab: tab, ids: ids });
  }

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

  window.SaRows = { list: list, get: get, upsert: upsert, remove: remove, uploadToDrive: uploadToDrive, fileToBase64: fileToBase64, norm: norm, suggestProperty: suggestProperty };
})();
