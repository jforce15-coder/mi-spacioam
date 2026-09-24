// ============================================================
// Spacio AM — Contabilidad · Facturas y Long term
// ------------------------------------------------------------
// FACTURAS
//  • Recibidas: el mismo lote SAT de Gastos e inversiones (no se vuelve a
//    subir). La clasificación de allá se muestra aquí tal cual; aquí solo
//    se clasifican las que no se emparejaron.
//  • Emitidas: se sube el consulta.zip de emitidas y solo se clasifican.
// LONG TERM
//  • Depósitos de propiedades con contrato de estadía larga, uno por
//    propiedad. Se lee fecha y monto del comprobante; la propiedad se
//    sugiere y se recuerda por cuenta/depositante.
// ============================================================
const { useState: cfUseState, useEffect: cfUseEffect, useMemo: cfUseMemo, useRef: cfUseRef } = React;

const CF_CSS = `
.cf-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 18px; }
.cf-stats { display: flex; flex-wrap: wrap; gap: 8px; }
.cf-stat { display: inline-flex; align-items: baseline; gap: 7px; background: var(--beige-soft); border-radius: 999px; padding: 7px 13px; font-family: var(--sans); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-muted); }
.cf-stat b { font-size: 12.5px; letter-spacing: 0.02em; color: var(--ink); font-weight: 600; }
.cf-list { display: flex; flex-direction: column; border: 1px solid var(--ink-08); border-radius: 18px; background: var(--alabaster); }
.cf-row { display: grid; grid-template-columns: 88px minmax(0,1.4fr) 112px minmax(0,1.3fr) 34px; gap: 14px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--ink-08); }
.cf-row:first-child { border-top: none; }
.cf-row.head { font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-muted); padding-top: 13px; padding-bottom: 11px; background: var(--beige-soft); border-radius: 18px 18px 0 0; }
.cf-row.pend { background: var(--attention-tint, rgba(242,117,90,0.08)); }
.cf-date { font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.03em; color: var(--fg-muted); white-space: nowrap; }
.cf-who { min-width: 0; }
.cf-who b { display: block; font-family: var(--sans); font-size: 12.5px; font-weight: 600; letter-spacing: 0.01em; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cf-who span { display: block; font-family: var(--sans); font-size: 10.5px; letter-spacing: 0.03em; color: var(--fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.cf-amt { font-family: var(--sans); font-size: 12.5px; font-weight: 600; color: var(--ink); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cf-dest { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cf-dest .lbl { display: inline-flex; align-items: center; gap: 6px; font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.02em; color: var(--ink); min-width: 0; }
.cf-dest .lbl span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cf-dest .src { font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-muted); }
.cf-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.cf-sug { display: inline-flex; align-items: center; gap: 5px; font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-muted); }
.cf-chips { display: flex; flex-wrap: wrap; gap: 6px; flex-basis: 100%; order: 3; }
.cf-chip { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--warm-grey); background: var(--alabaster); border-radius: 999px; padding: 7px 12px; cursor: pointer; font-family: var(--sans); font-size: 10.5px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-muted); transition: border-color .18s var(--ease), background .18s var(--ease); }
.cf-chip:hover { border-color: var(--ink); color: var(--ink); }
.cf-chip b { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--ink); font-variant-numeric: tabular-nums; }
.cf-chip.on { background: var(--ink); border-color: var(--ink); color: var(--alabaster); }
.cf-chip.on b { color: var(--alabaster); }
.cf-auto { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid var(--ink-08); border-radius: 16px; background: var(--alabaster); }
.cf-auto-main { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 3px; }
.cf-auto-t { font-family: var(--sans); font-size: 12.5px; font-weight: 600; letter-spacing: 0.02em; color: var(--ink); }
.cf-auto-s { font-family: var(--sans); font-size: 11px; line-height: 1.55; letter-spacing: 0.03em; color: var(--fg-muted); text-wrap: pretty; }
.cf-grow { flex-basis: 100%; display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--ink-08); }
.cf-sug-btn { border: 1px solid var(--peach); background: var(--peach-12); border-radius: 999px; padding: 4px 6px 4px 9px; cursor: pointer; max-width: 100%; text-transform: none; letter-spacing: 0.02em; font-size: 10.5px; font-weight: 500; color: var(--ink); align-self: flex-start; }
.cf-sug-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cf-sug-btn .why { color: var(--fg-muted); flex-shrink: 0; }
.cf-sug-btn b { flex-shrink: 0; font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; background: var(--ink); color: var(--alabaster); border-radius: 999px; padding: 3px 8px; }
.cf-eye { width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--warm-grey); background: var(--alabaster); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: var(--fg-muted); }
.cf-eye:hover { border-color: var(--ink); color: var(--ink); }
.cf-more { width: 100%; border: none; border-top: 1px solid var(--ink-08); background: transparent; cursor: pointer; padding: 13px; font-family: var(--sans); font-size: 10.5px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-muted); border-radius: 0 0 18px 18px; }
.cf-more:hover { color: var(--ink); }
.cf-drop { position: relative; display: flex; gap: 14px; align-items: flex-start; border: 1.5px dashed var(--warm-grey); border-radius: 18px; padding: 18px; background: var(--beige-soft); cursor: pointer; margin-bottom: 18px; transition: border-color .18s var(--ease); }
.cf-drop:hover, .cf-drop.drag { border-color: var(--ink); }
.cf-drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.cf-drop-ic { width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; background: var(--alabaster); display: inline-flex; align-items: center; justify-content: center; }
.cf-drop-lbl { display: block; font-family: var(--sans); font-size: 12.5px; font-weight: 600; letter-spacing: 0.03em; color: var(--ink); }
.cf-drop-hint { display: block; font-family: var(--sans); font-size: 11px; line-height: 1.55; letter-spacing: 0.03em; color: var(--fg-muted); margin-top: 3px; text-wrap: pretty; }
.cf-msg { font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.03em; line-height: 1.5; color: var(--ink); margin: -6px 0 16px; }
.cf-btn { display: inline-flex; align-items: center; gap: 8px; border: none; cursor: pointer; border-radius: 999px; padding: 10px 18px; font-family: var(--sans); font-size: 10.5px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; transition: filter .18s var(--ease); }
.cf-btn:hover { filter: brightness(.94); }
.cf-btn:disabled { background: var(--divider, #D8D4CE); color: var(--fg-subtle, #938B8A); cursor: not-allowed; filter: none; }
.cf-btn.dark { background: var(--ink); color: var(--alabaster); }
.cf-btn.warm { background: var(--peach-12); color: var(--ink); border: 1px solid var(--peach); }
.cf-btn.ghost { background: transparent; color: var(--fg-muted); border: 1px solid var(--ink-08); }
.lt-grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 18px; }
@media (min-width: 820px) { .lt-grid { grid-template-columns: 1fr 1fr; } }
.lt-card { display: flex; gap: 14px; background: var(--alabaster); border: 1px solid var(--ink-08); border-radius: 16px; padding: 12px; }
.lt-thumb { width: 78px; height: 78px; flex-shrink: 0; border-radius: 12px; object-fit: cover; background: var(--beige-soft); display: flex; align-items: center; justify-content: center; }
.lt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.lt-row2 { display: flex; gap: 8px; align-items: center; }
.lt-in { width: 100%; box-sizing: border-box; font-family: var(--sans); font-size: 12px; color: var(--ink); padding: 7px 10px; background: var(--alabaster); border: 1px solid var(--warm-grey); border-radius: 9px; outline: none; }
.lt-in:focus { border-color: var(--ink); }
.lt-month { margin-bottom: 22px; }
.lt-month-h { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
.lt-month-h h4 { font-family: var(--serif); font-weight: 400; font-size: 20px; margin: 0; color: var(--ink); }
.lt-line { display: grid; grid-template-columns: minmax(0,1.3fr) 90px minmax(0,1fr) 110px 70px; gap: 12px; align-items: center; padding: 11px 16px; border-top: 1px solid var(--ink-08); font-family: var(--sans); font-size: 12px; color: var(--ink); }
.lt-line:first-child { border-top: none; }
.lt-line .m { color: var(--fg-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lt-line .n { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lt-act { display: flex; gap: 6px; justify-content: flex-end; }
@media (max-width: 779px) {
  .cf-row { grid-template-columns: 1fr auto; gap: 8px 12px; }
  .cf-row.head { display: none; }
  .cf-row .cf-date { grid-column: 1; grid-row: 1; }
  .cf-row .cf-amt { grid-column: 2; grid-row: 1; }
  .cf-row .cf-who { grid-column: 1 / -1; }
  .cf-row .cf-dest { grid-column: 1; }
  .cf-row .cf-eye { grid-column: 2; }
  .lt-line { grid-template-columns: 1fr auto; }
  .lt-line .m { grid-column: 1 / -1; }
}
`;
(function () { if (document.getElementById("cf-css")) return; const s = document.createElement("style"); s.id = "cf-css"; s.textContent = CF_CSS; document.head.appendChild(s); })();

const CF_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const CF_MES_L = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function cfDay(d) { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + " " + CF_MES[+m[2] - 1] + " " + m[1] : (d || "—"); }
function cfYmLabel(ym) { const m = String(ym || "").match(/^(\d{4})-(\d{2})/); return m ? CF_MES_L[+m[2] - 1] + " " + m[1] : ym; }
function cfMoney(v, cur) { return (cur === "USD" ? "$ " : "Q ") + (Math.round((+v || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function cfUseRowsTick() { const [, set] = cfUseState(0); cfUseEffect(() => { const h = () => set(x => x + 1); window.addEventListener("sa-rows", h); return () => window.removeEventListener("sa-rows", h); }, []); }
function cfPropOptions() {
  const names = [...new Set(((window.SpacioData && window.SpacioData.propertyList) || []).map(p => p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  return names.map(n => ({ value: n, label: n }));
}
function cfCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ---------- Clasificación de facturas EMITIDAS ----------
const CF_EMIT_BASE = [
  { value: "Diseño de interiores y mobiliario", sub: "Proyecto", kw: "diseno interiorismo mueble mobiliario remodelacion proyecto decoracion" },
  { value: "Hospedaje (huésped)", sub: "Estadía", kw: "hospedaje estadia noche noches alojamiento huesped reserva renta" },
  { value: "Mantenimiento y limpieza", sub: "Servicio", kw: "mantenimiento limpieza reparacion servicio lavanderia" },
  { value: "Otro", sub: "", kw: "otro varios" },
];
const CF_EMIT_CUSTOM_KEY = "sa-fact-emit-cats";
function cfEmitCats() {
  let custom = []; try { custom = JSON.parse(localStorage.getItem(CF_EMIT_CUSTOM_KEY)) || []; } catch (e) {}
  const used = window.SaRows.list("Facturas").filter(r => r.tipo === "emitida").map(r => r.clasificacion).filter(Boolean);
  const set = new Set(CF_EMIT_BASE.map(c => c.value));
  const extra = [...new Set(custom.concat(used))].filter(v => !set.has(v));
  return CF_EMIT_BASE.map(c => ({ value: c.value, label: c.value, sub: c.sub, kw: c.kw })).concat(extra.map(v => ({ value: v, label: v, sub: "Agregada" })));
}
function cfAddEmitCat(v) { let a = []; try { a = JSON.parse(localStorage.getItem(CF_EMIT_CUSTOM_KEY)) || []; } catch (e) {} if (a.indexOf(v) < 0) { a.push(v); try { localStorage.setItem(CF_EMIT_CUSTOM_KEY, JSON.stringify(a)); } catch (e) {} } }
// sugiere por las descripciones de las líneas
function cfSuggestEmit(inv) {
  const t = window.SaRows.norm((inv.items || []).map(i => i.desc).join(" ") + " " + (inv.desc || ""));
  if (!t) return "";
  if (/hosped|estadi|noche|aloja|huesped|reserva|airbnb|booking/.test(t)) return "Hospedaje (huésped)";
  if (/limpiez|manten|reparac|lavander/.test(t)) return "Mantenimiento y limpieza";
  if (/disen|interior|mueble|mobiliar|remodel|decorac|proyecto|carpinter/.test(t)) return "Diseño de interiores y mobiliario";
  return "";
}
const CF_EMIT_DRAFT = "sa-fact-emit-draft";
function cfEmitDraftLoad() { try { return JSON.parse(localStorage.getItem(CF_EMIT_DRAFT)) || []; } catch (e) { return []; } }
function cfEmitDraftSave(invs) {
  const slim = (withItems) => JSON.stringify(invs.map(i => { const c = Object.assign({}, i); delete c.raw; if (!withItems) c.items = (c.items || []).slice(0, 1); return c; }));
  try { localStorage.setItem(CF_EMIT_DRAFT, slim(true)); } catch (e) { try { localStorage.setItem(CF_EMIT_DRAFT, slim(false)); } catch (e2) {} }
}

// ---------- factura SAT ⇄ fila de la pestaña "Facturas" ----------
// Así las recibidas se ven en cualquier dispositivo, no solo en el navegador
// donde se subió el ZIP. La clasificación no se toca al sincronizar.
function cfInvToRow(inv, tipo) {
  let lineas = ""; try { lineas = JSON.stringify((inv.items || []).slice(0, 40).map(i => ({ c: i.cant, d: i.desc, p: i.pu, t: i.total }))); if (lineas.length > 40000) lineas = ""; } catch (e) {}
  const emit = tipo === "emitida";
  return {
    id: (emit ? "E-" : "R-") + inv.auth, tipo, auth: inv.auth, fecha: inv.day || "", mes: String(inv.day || "").slice(0, 7),
    nit: emit ? (inv.nitReceptor || "") : (inv.nit || ""), contraparte: emit ? (inv.receptor || "") : (inv.emisor || inv.comercial || ""),
    descripcion: ((inv.items || [])[0] || {}).desc || "", total: inv.total || 0, moneda: inv.moneda || "GTQ",
    origen: emit ? "SAT emitidas" : "SAT recibidas", serie: inv.serie || "", numero: inv.autNum || "", iva: inv.ivaTotal || 0,
    receptor: inv.receptor || "", nitReceptor: inv.nitReceptor || "", emisor: inv.emisor || "", nitEmisor: inv.nit || "",
    comercial: inv.comercial || "", direccion: [inv.dir, inv.municipio, inv.depto].filter(Boolean).join(", "), lineas,
  };
}
function cfRowToInv(r) {
  let items = []; try { items = (JSON.parse(r.lineas || "[]") || []).map((x, i) => ({ linea: i + 1, cant: +x.c || 0, desc: x.d || "", pu: +x.p || 0, total: +x.t || 0 })); } catch (e) {}
  if (!items.length && r.descripcion) items = [{ linea: 1, cant: 1, desc: r.descripcion, pu: +r.total || 0, total: +r.total || 0 }];
  items.forEach(x => { if (x.gravable == null) { x.gravable = Math.round((x.total / 1.12) * 100) / 100; x.iva = Math.round((x.total - x.gravable) * 100) / 100; } });
  const ivaItems = Math.round(items.reduce((s, x) => s + (+x.iva || 0), 0) * 100) / 100;
  return { id: r.auth, auth: r.auth, day: r.fecha, total: +r.total || 0, moneda: r.moneda || "GTQ", items, ivaTotal: +r.iva || ivaItems,
    emisor: r.emisor || (r.tipo === "recibida" ? r.contraparte : "") || "", nit: r.nitEmisor || (r.tipo === "recibida" ? r.nit : "") || "", comercial: r.comercial || "",
    receptor: r.receptor || (r.tipo === "emitida" ? r.contraparte : "") || "", nitReceptor: r.nitReceptor || (r.tipo === "emitida" ? r.nit : "") || "",
    serie: r.serie || "", autNum: r.numero || "", dir: r.direccion || "", _fromSaved: true };
}
// sube a la hoja las facturas que aún no están (en lotes); devuelve cuántas nuevas
async function cfSyncInvoices(invs, tipo) {
  if (!window.SaRows || !invs || !invs.length) return 0;
  const have = new Set(window.SaRows.list("Facturas").map(r => r.id));
  const pref = tipo === "emitida" ? "E-" : "R-";
  const rows = invs.filter(i => i && i.auth && !have.has(pref + i.auth)).map(i => cfInvToRow(i, tipo));
  for (let k = 0; k < rows.length; k += 150) await window.SaRows.upsert("Facturas", rows.slice(k, k + 150));
  return rows.length;
}
window.cfSyncReceived = (invs) => cfSyncInvoices(invs, "recibida");
window.cfRowToInv = cfRowToInv;
// factura guardada en la hoja (pestaña Facturas) por número de autorización
window.saInvoiceFromRows = function (auth) {
  if (!auth || !window.SaRows) return null;
  const r = window.SaRows.list("Facturas").find(x => x.auth === auth && x.tipo !== "emitida");
  return r ? cfRowToInv(r) : null;
};

// ---------- estado de las RECIBIDAS (lo que se decidió en Gastos e inversiones) ----------
function cfReceivedIndex(sheetAuths) {
  const conta = {};
  try {
    (window.SpacioContaStore ? window.SpacioContaStore.listStatements() : []).forEach(s => (s.rows || []).forEach(r => {
      if (r.factura) String(r.factura).split(/[,\s]+/).filter(Boolean).forEach(a => { conta[a] = { tag: r.tag || "", date: r.date, accId: s.accId }; });
    }));
  } catch (e) {}
  let local = new Set(); try { local = new Set(JSON.parse(localStorage.getItem("sa-pya-imported")) || []); } catch (e) {}
  return { conta, local, sheet: sheetAuths || {} };
}
function cfReceivedStatus(inv, idx, draft, saved) {
  if (inv._exp && !idx.sheet[inv.auth]) return { k: "gastos", src: "Gastos e inversiones", label: [inv.property_name, inv.categoria].filter(Boolean).join(" · ") || "Gasto de insumos", locked: true };
  if (idx.sheet[inv.auth]) { const s = idx.sheet[inv.auth]; return { k: "gastos", src: "Gastos e inversiones", label: [s.property_name, s.categoria].filter(Boolean).join(" · ") || "Gasto de insumos", locked: true }; }
  if (idx.conta[inv.auth]) return { k: "conta", src: "Contabilidad", label: idx.conta[inv.auth].tag || "Movimiento de banco vinculado", locked: true };
  if (idx.local.has(inv.auth)) return { k: "conc", src: "Conciliada", label: "Gasto o depósito vinculado", locked: true };
  if (draft && (draft.hiddenInvs || []).indexOf(inv.id) >= 0) return { k: "na", src: "Gastos e inversiones", label: "Marcada como no aplica", locked: true };
  if (saved && saved.clasificacion) return { k: "here", src: cfSrcLabel(saved), label: saved.clasificacion + (saved.propiedad && saved.clasificacion === CF_MOB ? " · " + saved.propiedad : ""), fuente: saved.fuente || "", locked: false };
  return { k: "pend", src: "", label: "", locked: false };
}
// ---------- facturas ya cargadas en meses anteriores (registro "Archivos cargados") ----------
// Son los PDF/fotos de factura que se subieron por propiedad o por socio. Se listan
// junto a las del SAT para poder clasificarlas; la que está ligada a un gasto
// (orderId) conserva la clasificación de Gastos e inversiones.
function cfHash(s) { let h = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function cfArchiveInvoices() {
  const D = window.SpacioData || {};
  let files = (D.filesAll || D.files || []).slice();
  try { if (window.SpacioFiles && window.SpacioFiles.records) files = files.concat(window.SpacioFiles.records()); } catch (e) {}
  const seen = {};
  return files.filter(f => /factura/i.test(f.tipo || "") && (f.url || f.archivo)).map(f => {
    const id = "A-" + cfHash(f.url || [f.scope, f.owner, f.property_name, f.ym, f.archivo].join("|"));
    if (seen[id]) return null; seen[id] = 1;
    const ymv = /^\d{4}-\d{2}/.test(f.ym || "") ? f.ym.slice(0, 7) : "";
    const cd = String(f.cargado || "").match(/^(\d{4}-\d{2}-\d{2})/);
    const who = f.scope === "owner" ? (f.owner || "Socio") : (f.property_name || "Sin propiedad");
    return { _rid: id, _arch: true, id, auth: "", day: ymv ? ymv + "-01" : (cd ? cd[1] : ""), total: null, moneda: "GTQ",
      emisor: who, comercial: "", nit: "", items: [{ desc: f.archivo || "Factura cargada" }], url: f.url, orderId: f.orderId || "",
      property_name: f.property_name || "", owner: f.owner || "", scope: f.scope, ym: ymv, archivo: f.archivo || "" };
  }).filter(Boolean);
}
// Gastos de "insumos & gastos" con factura SAT vinculada (authProductos / authTarifa):
// aparecen aunque el lote SAT no esté en este navegador ni en la hoja.
function cfExpenseInvoices() {
  const out = [], seen = {};
  ((window.SpacioData && window.SpacioData.propertyList) || []).forEach(p => (p.expenses || []).forEach(e => {
    const auths = [e.authProductos, e.authTarifa].filter(Boolean).join(",").split(/[,\s]+/).filter(Boolean);
    auths.forEach((a, i) => {
      if (seen[a]) return; seen[a] = 1;
      const day = e.y != null && e.m != null ? e.y + "-" + String(e.m + 1).padStart(2, "0") + "-" + String(e.day || 1).padStart(2, "0") : "";
      // combo (2 autorizaciones): el total del gasto va en la primera; la segunda se muestra ligada
      out.push({ _rid: "R-" + a, _exp: true, _combo: auths.length > 1 ? auths : null, id: a, auth: a, day, total: i === 0 ? (+e.amountGTQ || 0) : null, moneda: "GTQ",
        emisor: e.desc || e.category || "Gasto", comercial: "", nit: "", items: [], property_name: p.name, categoria: e.category || "", orderUrl: e.orderUrl || "" });
    });
  }));
  return out;
}
function cfArchiveStatus(inv, saved, gastoByOrder) {
  if (saved && saved.clasificacion) return { k: "here", src: cfSrcLabel(saved), label: saved.clasificacion + (saved.propiedad && saved.clasificacion === CF_MOB ? " · " + saved.propiedad : ""), fuente: saved.fuente || "", locked: false };
  if (inv.orderId) { const g = gastoByOrder[inv.orderId]; return { k: "gastos", src: "Gastos e inversiones", label: [inv.property_name || (g && g.property_name), (g && g.categoria) || "Gasto"].filter(Boolean).join(" · "), locked: true }; }
  return { k: "pend", src: "", label: "", locked: false };
}

// ============================================================
// RECIBIDAS — cuatro destinos
//  1) Gastos e inversiones: emparejadas allá (insumos / mantenimiento). Solo lectura.
//  2) Estados de cuenta: mismo monto y misma fecha que un débito ya clasificado;
//     se trae el tag que se le puso al movimiento.
//  3) Mobiliario: match con la ejecución de Grow (10_FACTURAS + asignaciones);
//     se clasifica por propiedad + "Compra de mobiliario".
//  4) Otras facturas: clasificación manual.
// ============================================================
const CF_MOB = "Compra de mobiliario";
const CF_BANK_DAYS = 3;
const CF_MES_N = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, jan: 1, apr: 4, aug: 8, dec: 12 };
function cfISO(d, ymHint) {
  const s = String(d || "").trim(); if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/); if (m && ymHint) return ymHint.slice(0, 4) + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  m = s.match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\.?\s*(\d{4})?/i); if (m && CF_MES_N[m[2].toLowerCase()]) return (m[3] || (ymHint || "").slice(0, 4)) + "-" + String(CF_MES_N[m[2].toLowerCase()]).padStart(2, "0") + "-" + m[1].padStart(2, "0");
  return "";
}
function cfDays(a, b) { const x = Date.parse(a + "T00:00:00Z"), y = Date.parse(b + "T00:00:00Z"); return isNaN(x) || isNaN(y) ? 999 : Math.round((y - x) / 86400000); }
function cfBankDebits() {
  const out = [], seen = {};
  const push = (r, ym, acc, cur) => {
    const amt = +r.debit || 0; if (amt <= 0) return;
    const day = cfISO(r.date, ym); if (!day) return;
    const key = [acc, ym, day, r.doc || "", r.desc || "", amt].join("|"); if (seen[key]) return; seen[key] = 1;
    out.push({ key, day, amt, cur: String(cur || "GTQ").toUpperCase().indexOf("USD") >= 0 ? "USD" : "GTQ", tag: r.tag || "", cat: r.category || r.categoria || "", desc: r.desc || "", acc, factura: r.factura || "" });
  };
  try { (window.SpacioContaStore ? window.SpacioContaStore.listStatements() : []).forEach(st => (st.rows || []).forEach(r => push(r, st.ym, st.accId, st.currency))); } catch (e) {}
  ((window.SpacioData && window.SpacioData.conta) || []).forEach(r => push(r, r.ym, r.account, r.currency));
  return out;
}
const CF_GROW_KEY = "sa-grow-sheet";
function cfGrowId() { return (localStorage.getItem(CF_GROW_KEY) || "").trim(); }
async function cfGrowLoad(sid) {
  const tab = async (n) => { const r = await fetch("https://docs.google.com/spreadsheets/d/" + sid + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(n)); const t = await r.text(); if (/<html/i.test(t.slice(0, 200))) throw new Error("La hoja de Grow no es pública (Compartir → cualquier persona con el enlace)."); const rows = cfCSV(t); const h = (rows[0] || []).map(x => x.trim()); return rows.slice(1).filter(r => r.some(c => c && c.trim())).map(r => { const o = {}; h.forEach((k, i) => { o[k] = (r[i] || "").trim(); }); return o; }); };
  const [facts, asig, proys] = await Promise.all([tab("10_FACTURAS"), tab("11_FACTURA_ASIGNACIONES").catch(() => []), tab("01_PROYECTOS").catch(() => [])]);
  const pBy = {}; proys.forEach(p => { pBy[p.proyecto_id] = p; });
  const aBy = {}; asig.forEach(a => { (aBy[a.factura_id] = aBy[a.factura_id] || []).push(a); });
  const props = ((window.SpacioData && window.SpacioData.propertyList) || []).map(p => ({ name: p.name }));
  const propOf = (pid) => { const p = pBy[pid]; if (!p) return ""; const s = window.SaRows.suggestProperty([p.nombre, p.edificio, p.apartamento].filter(Boolean).join(" "), props); return s ? s.name : (p.nombre || ""); };
  return facts.map(f => {
    const as = aBy[f.factura_id] || [];
    const pids = as.length ? as.map(a => a.proyecto_id) : (f.proyecto_id ? [f.proyecto_id] : []);
    return { id: f.factura_id, numero: String(f.numero_factura || "").replace(/\s+/g, ""), day: cfISO(f.fecha), monto: parseFloat(String(f.monto || "").replace(/[^0-9.\-]/g, "")) || 0,
      proveedor: f.proveedor || "", desc: f.descripcion || "", url: f.archivo_url || "", props: [...new Set(pids.map(propOf).filter(Boolean))], proyectos: pids };
  }).filter(f => f.numero || f.monto);
}
function cfSuggestReceived(pending, bank, grow) {
  const out = {}, usedBank = {}, usedGrow = {};
  const num = (inv) => [inv.autNum, inv.numero, inv.auth, (inv.serie || "") + (inv.autNum || "")].filter(Boolean).map(x => String(x).replace(/\s+/g, "").toUpperCase());
  if ((grow || []).length) pending.forEach(inv => {
    if (inv._arch || !(inv.total > 0)) return;
    const ns = num(inv);
    let g = grow.find(f => !usedGrow[f.id] && f.numero && ns.indexOf(f.numero.toUpperCase()) >= 0);
    if (!g) g = grow.find(f => !usedGrow[f.id] && Math.abs(f.monto - inv.total) < 0.01 && f.day && Math.abs(cfDays(inv.day, f.day)) <= 1);
    if (g) { usedGrow[g.id] = 1; out[inv._rid] = { clas: CF_MOB, prop: g.props[0] || "", fuente: "grow", ref: g.id, why: "Grow · " + (g.proveedor || g.id) + (g.props.length > 1 ? " · " + g.props.length + " propiedades" : "") }; }
  });
  const cands = [];
  pending.forEach(inv => {
    if (out[inv._rid] || inv._arch || !(inv.total > 0) || !inv.day) return;
    bank.forEach(b => {
      if (!b.tag || b.cur !== (inv.moneda || "GTQ") || Math.abs(b.amt - inv.total) >= 0.01) return;
      const d = cfDays(inv.day, b.day); if (d < 0 || d > CF_BANK_DAYS) return;
      cands.push({ inv, b, d });
    });
  });
  cands.sort((a, b) => a.d - b.d).forEach(c => {
    if (out[c.inv._rid] || usedBank[c.b.key]) return;
    usedBank[c.b.key] = 1;
    out[c.inv._rid] = { clas: c.b.tag, prop: "", fuente: "estado-cuenta", ref: c.b.key, why: "Estado de cuenta · " + cfDay(c.b.day) + (c.d ? " (+" + c.d + " d)" : "") + (c.b.desc ? " · " + c.b.desc.slice(0, 36) : "") };
  });
  return out;
}
const CF_BUCKET = { gastos: "Gastos e inversiones", banco: "Estados de cuenta", grow: "Mobiliario", otras: "Otras facturas", pend: "Sin clasificar" };
function cfSrcLabel(sv) { return sv.fuente === "estado-cuenta" ? "Estado de cuenta" : sv.fuente === "grow" ? "Mobiliario · Grow" : sv.clasificacion === CF_MOB ? "Mobiliario" : "Clasificada aquí"; }
function cfBucket(st) { if (st.k === "gastos" || st.k === "conc" || st.k === "na") return "gastos"; if (st.k === "conta") return "banco"; if (st.k === "here") return st.fuente === "estado-cuenta" ? "banco" : (st.fuente === "grow" || st.fuente === "mobiliario" || /^Compra de mobiliario/.test(st.label)) ? "grow" : "otras"; return st.k === "pend" ? "pend" : "otras"; }
const CF_DOT = { gastos: "#3d6b52", conta: "#3B6691", conc: "#3d6b52", na: "var(--warm-grey)", here: "var(--ink)", pend: "var(--attention, #F2755A)" };

// ============================================================
function ContaFacturasSection({ lang }) {
  const es = lang !== "en"; const tr = (a, b) => (es ? a : b);
  cfUseRowsTick();
  const [kind, setKind] = cfUseState("recibidas");
  const [ym, setYm] = cfUseState("all");
  const [status, setStatus] = cfUseState("all");
  const [limit, setLimit] = cfUseState(150);
  const [box, setBox] = cfUseState(null);
  const [expBox, setExpBox] = cfUseState(null);
  const [msg, setMsg] = cfUseState("");
  const [busy, setBusy] = cfUseState(false);
  const [drag, setDrag] = cfUseState(false);
  const [emitidas, setEmitidas] = cfUseState(() => cfEmitDraftLoad());
  const [sheetAuths, setSheetAuths] = cfUseState({});
  const [gastoByOrder, setGastoByOrder] = cfUseState({});
  const [origin, setOrigin] = cfUseState("all");
  const [bucket, setBucket] = cfUseState("all");
  const [grow, setGrow] = cfUseState(null);
  const [growMsg, setGrowMsg] = cfUseState("");
  const [growId, setGrowId] = cfUseState(() => cfGrowId());
  const [growOpen, setGrowOpen] = cfUseState(false);
  const loadGrow = async (sid) => {
    sid = String(sid || "").trim().replace(/^.*\/d\/([^/]+).*$/, "$1");
    if (!sid) { setGrow(null); setGrowMsg(""); return; }
    try { localStorage.setItem(CF_GROW_KEY, sid); } catch (e) {}
    setGrowMsg(tr("Leyendo Grow…", "Reading Grow…"));
    try { const g = await cfGrowLoad(sid); setGrow(g); setGrowMsg(g.length ? tr(g.length + " factura(s) de ejecución en Grow.", g.length + " Grow invoices.") : tr("Grow conectado, pero aún no tiene facturas de ejecución cargadas.", "Grow connected, no execution invoices yet.")); }
    catch (e) { setGrow(null); setGrowMsg(e.message || tr("No se pudo leer Grow.", "Could not read Grow.")); }
  };
  cfUseEffect(() => { if (growId) loadGrow(growId); }, []);
  const [catsTick, setCatsTick] = cfUseState(0);

  // gastos de "insumos & gastos" que ya traen factura (authProductos / authTarifa)
  cfUseEffect(() => {
    const sid = window.SPACIO_SHEET_ID; if (!sid) return;
    fetch("https://docs.google.com/spreadsheets/d/" + sid + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent("insumos & gastos")).then(r => r.text()).then(txt => {
      const rows = cfCSV(txt); if (!rows.length) return;
      const h = rows[0].map(x => x.trim().toLowerCase());
      const ap = h.indexOf("authproductos"), at = h.indexOf("authtarifa"), pn = h.indexOf("property_name"), ca = h.indexOf("categoria"), oi = h.indexOf("orderid");
      const out = {}, byOrder = {};
      if (oi > -1) rows.slice(1).forEach(r => { const o = (r[oi] || "").trim(); if (o) byOrder[o] = { property_name: pn > -1 ? r[pn] : "", categoria: ca > -1 ? r[ca] : "" }; });
      setGastoByOrder(byOrder);
      rows.slice(1).forEach(r => [ap, at].forEach(c => { if (c > -1 && r[c] && r[c].trim()) String(r[c]).split(/[,\s]+/).filter(Boolean).forEach(a => { out[a] = { property_name: pn > -1 ? r[pn] : "", categoria: ca > -1 ? r[ca] : "" }; }); }));
      setSheetAuths(out);
    }).catch(() => {});
  }, []);
  cfUseEffect(() => { cfEmitDraftSave(emitidas); }, [emitidas]);
  cfUseEffect(() => { const d = window.pyaSatDraft && window.pyaSatDraft(); if (d && d.invoices && d.invoices.length) cfSyncInvoices(d.invoices, "recibida"); }, []);

  const saved = window.SaRows.list("Facturas");
  const savedBy = {}; saved.forEach(r => { savedBy[r.id] = r; });
  const draft = window.pyaSatDraft ? window.pyaSatDraft() : null;

  // RECIBIDAS: lote SAT de Gastos e inversiones + las guardadas (por si el borrador se limpió)
  const recibidas = cfUseMemo(() => {
    const map = {};
    ((draft && draft.invoices) || []).forEach(i => { map["R-" + i.auth] = i; });
    saved.filter(r => r.tipo === "recibida" && r.auth).forEach(r => { if (!map[r.id]) map[r.id] = cfRowToInv(r); });
    // gastos con factura: completan (sin pisar) lo que ya viene del lote SAT
    cfExpenseInvoices().forEach(e => { if (!map[e._rid]) map[e._rid] = e; else if (!map[e._rid].property_name) map[e._rid] = Object.assign({}, map[e._rid], { property_name: e.property_name, categoria: e.categoria }); });
    const sat = Object.keys(map).map(k => Object.assign({ _rid: k }, map[k]));
    return sat.concat(cfArchiveInvoices());
  }, [draft && draft.invoices && draft.invoices.length, saved.length, ((window.SpacioData && (window.SpacioData.filesAll || window.SpacioData.files)) || []).length]);
  const idx = cfUseMemo(() => {
    const all = Object.assign({}, sheetAuths);
    cfExpenseInvoices().forEach(e => { if (!all[e.auth]) all[e.auth] = { property_name: e.property_name, categoria: e.categoria }; });
    return cfReceivedIndex(all);
  }, [sheetAuths, saved.length]);

  const tagOptions = cfUseMemo(() => {
    const C = window.SpacioConta; if (!C) return [];
    const out = [{ value: CF_MOB, label: CF_MOB, group: "Mobiliario", sub: "Por propiedad", kw: "mueble mobiliario grow proyecto diseno" }];
    Object.keys(C.TAGS_BY_CATEGORY).forEach(cat => C.TAGS_BY_CATEGORY[cat].forEach(tg => { if (tg !== CF_MOB) out.push({ value: tg, label: tg, group: cat }); }));
    return out;
  }, []);
  const emitOptions = cfUseMemo(() => cfEmitCats(), [catsTick, saved.length]);
  const propOptions = cfUseMemo(() => cfPropOptions(), []);

  // lista unificada según pestaña
  const emitAll = (() => { const m = {}; saved.filter(r => r.tipo === "emitida" && r.auth).forEach(r => { m[r.id] = Object.assign({ _rid: r.id }, cfRowToInv(r)); }); emitidas.forEach(i => { m["E-" + i.auth] = Object.assign({ _rid: "E-" + i.auth }, i); }); return Object.values(m); })();
  const nArch = recibidas.filter(i => i._arch).length, nSat = recibidas.length - nArch;
  const recPool = origin === "sat" ? recibidas.filter(i => !i._arch) : origin === "arch" ? recibidas.filter(i => i._arch) : recibidas;
  const items = (kind === "recibidas" ? recPool : emitAll).map(inv => {
    const sv = savedBy[inv._rid];
    let st;
    if (kind === "recibidas") st = inv._arch ? cfArchiveStatus(inv, sv, gastoByOrder) : cfReceivedStatus(inv, idx, draft, sv);
    else st = sv && sv.clasificacion ? { k: "here", src: "Clasificada", label: sv.clasificacion } : { k: "pend", src: "", label: "", sug: cfSuggestEmit(inv) };
    return { inv, sv, st };
  });
  const bank = cfUseMemo(() => cfBankDebits(), [saved.length, ((window.SpacioData && window.SpacioData.conta) || []).length]);
  if (kind === "recibidas") {
    const sugs = cfSuggestReceived(items.filter(x => x.st.k === "pend").map(x => x.inv), bank, grow || []);
    items.forEach(x => { if (x.st.k === "pend" && sugs[x.inv._rid]) x.st.rs = sugs[x.inv._rid]; x.b = cfBucket(x.st); });
  }
  items.sort((a, b) => String(b.inv.day || "").localeCompare(String(a.inv.day || "")));

  const months = [...new Set(items.map(x => String(x.inv.day || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  const inMonth = items.filter(x => ym === "all" || String(x.inv.day || "").slice(0, 7) === ym);
  const pend = inMonth.filter(x => x.st.k === "pend");
  const bCount = {}; inMonth.forEach(x => { bCount[x.b] = (bCount[x.b] || 0) + 1; });
  const shown = kind === "recibidas"
    ? inMonth.filter(x => bucket === "all" || x.b === bucket)
    : inMonth.filter(x => status === "all" || (status === "pend" ? x.st.k === "pend" : x.st.k !== "pend"));
  const sum = (arr) => arr.reduce((s, x) => s + (+x.inv.total || 0), 0);

  const rowFor = (x, clas, extra) => ({
    id: x.inv._rid, tipo: kind === "recibidas" ? "recibida" : "emitida", auth: x.inv.auth, fecha: x.inv.day || "", mes: String(x.inv.day || "").slice(0, 7),
    nit: kind === "recibidas" ? (x.inv.nit || "") : (x.inv.nitReceptor || ""), contraparte: kind === "recibidas" ? (x.inv.emisor || "") : (x.inv.receptor || ""),
    descripcion: ((x.inv.items || [])[0] || {}).desc || "", total: x.inv.total || 0, moneda: x.inv.moneda || "GTQ",
    clasificacion: clas, propiedad: (x.sv && x.sv.propiedad) || x.inv.property_name || "", origen: x.inv._arch ? "Archivo cargado" : kind === "recibidas" ? "SAT recibidas" : "SAT emitidas",
    ...(x.inv._arch ? { url: x.inv.url || "", archivo: x.inv.archivo || "", contraparte: x.inv.emisor || "", total: "" } : {}),
    ...(extra || {}),
  });
  const save = async (rows, okText) => {
    setBusy(true);
    const res = await window.SaRows.upsert("Facturas", rows);
    setMsg(res.ok ? (okText || tr("Guardado.", "Saved.")) + (res.local ? tr(" (solo en este navegador — conecta la escritura en Setup)", " (this browser only)") : "") : tr("No se pudo guardar en la hoja: " + (res.error || "sin conexión") + ". Quedó en este navegador.", "Could not save: " + (res.error || "offline") + "."));
    setBusy(false);
  };
  const classify = (x, v, isNew) => {
    if (kind === "emitidas" && isNew) { cfAddEmitCat(v); setCatsTick(t => t + 1); }
    if (!v) { window.SaRows.remove("Facturas", [x.inv._rid]); return; }
    const extra = kind === "recibidas" ? { fuente: v === CF_MOB ? "mobiliario" : "manual", ref: "" } : null;
    save([rowFor(x, v, extra)], tr("Factura clasificada como “" + v + "”.", "Classified as “" + v + "”."));
  };
  const rsRow = (x) => rowFor(x, x.st.rs.clas, { fuente: x.st.rs.fuente, ref: x.st.rs.ref, propiedad: x.st.rs.prop || "" });
  const applyRs = (x) => save([rsRow(x)], tr("Clasificada con " + (x.st.rs.fuente === "grow" ? "Grow" : "el estado de cuenta") + ".", "Classified."));
  const withRs = inMonth.filter(x => x.st.rs);
  const applyAllRs = () => save(withRs.map(rsRow), tr(withRs.length + " factura(s) clasificadas automáticamente.", withRs.length + " auto-classified."));
  const setProp = (x, v) => save([rowFor(x, (x.sv && x.sv.clasificacion) || "", { propiedad: v, fuente: (x.sv && x.sv.fuente) || "", ref: (x.sv && x.sv.ref) || "" })]);
  const withSug = pend.filter(x => x.st.sug);
  const acceptSuggested = () => save(withSug.map(x => rowFor(x, x.st.sug)), tr(withSug.length + " factura(s) clasificadas con la sugerencia.", withSug.length + " invoice(s) classified."));

  const onEmitFiles = async (files) => {
    if (!files || !files.length || !window.PedidosYa) return;
    setBusy(true); setMsg("");
    const res = await window.PedidosYa.parseDTEFiles([...files]);
    const map = {}; emitidas.forEach(i => { map[i.auth] = i; });
    let nuevas = 0; (res.invoices || []).forEach(i => { if (!map[i.auth]) nuevas++; const c = Object.assign({}, i); delete c.raw; map[i.auth] = c; });
    setEmitidas(Object.values(map));
    await cfSyncInvoices(res.invoices || [], "emitida");
    setMsg(res.invoices && res.invoices.length ? tr(res.invoices.length + " factura(s) leídas · " + nuevas + " nuevas.", res.invoices.length + " invoice(s) read · " + nuevas + " new.") : tr("No se leyeron facturas. Sube el consulta.zip de emitidas del SAT (o los XML).", "No invoices read."));
    setBusy(false); setStatus("all");
  };

  const onRecFiles = async (files) => {
    if (!files || !files.length || !window.PedidosYa) return;
    setBusy(true); setMsg("");
    const res = await window.PedidosYa.parseDTEFiles([...files]);
    const n = await cfSyncInvoices(res.invoices || [], "recibida");
    setMsg(res.invoices && res.invoices.length ? tr(res.invoices.length + " factura(s) leídas · " + n + " nuevas. Las que ya emparejaste en Gastos e inversiones aparecen con su clasificación.", res.invoices.length + " read · " + n + " new.") : tr("No se leyeron facturas. Sube el consulta.zip de recibidas del SAT (o los XML).", "No invoices read."));
    setBusy(false); setStatus("all");
  };
  const view = (x) => {
    if (x.inv._arch) { if (x.inv.url) window.open(x.inv.url, "_blank", "noopener"); return; }
    const full = (kind === "recibidas" && window.pyaSatInvoiceByAuth && window.pyaSatInvoiceByAuth(x.inv.auth)) || (x.inv._exp ? null : x.inv);
    if (!full && x.inv._exp && window.InvoiceViewBox) {
      const c = x.inv._combo || [x.inv.auth];
      const exp = x.inv._combo ? recibidas.find(r => r._exp && r.auth === c[0]) : x.inv;
      setExpBox({ authProductos: c[0], authTarifa: c[1] || "", desc: x.inv.emisor, vendor: x.inv.emisor, day: x.inv.day, amountGTQ: (exp && exp.total) || 0 });
      return;
    }
    setBox(full);
  };

  return (
    <div>
      <SectionHead eyebrow={tr("Contabilidad", "Accounting")} title={tr("Facturas", "Invoices")}
        sub={kind === "recibidas"
          ? tr("Las mismas facturas del lote SAT de Gastos e inversiones, con la clasificación que les diste allá. Aquí solo clasificas las que no se emparejaron.", "The same SAT batch from Expenses, with the classification given there. Here you only classify the unmatched ones.")
          : tr("Sube el consulta.zip de facturas emitidas y clasifica cada una. Te sugerimos la clasificación por el detalle de la factura.", "Upload the issued-invoices consulta.zip and classify each one.")}
        right={<Segmented size="sm" value={kind} onChange={v => { setKind(v); setBucket("all"); setOrigin("all"); setStatus("all"); setYm("all"); setMsg(""); setLimit(150); }}
          options={[{ value: "recibidas", label: tr("Recibidas", "Received") }, { value: "emitidas", label: tr("Emitidas", "Issued") }]} />} />

      {kind === "emitidas" && (
        <label className={"cf-drop" + (drag ? " drag" : "")} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); onEmitFiles(e.dataTransfer.files); }}>
          <input type="file" accept=".zip,.xml" multiple onChange={e => { onEmitFiles(e.target.files); e.target.value = ""; }} />
          <span className="cf-drop-ic"><Icon name="upload" size={19} stroke="var(--ink)" /></span>
          <span>
            <span className="cf-drop-lbl">{tr("Facturas emitidas · consulta.zip del SAT", "Issued invoices · SAT consulta.zip")}</span>
            <span className="cf-drop-hint">{busy ? tr("Leyendo facturas…", "Reading invoices…") : tr("Agencia Virtual → Consultar DTE → Emitidos → descargar XML. Puedes subir varios meses; no se duplican.", "Virtual Agency → DTE → Issued → download XML. Several months allowed; no duplicates.")}</span>
          </span>
        </label>
      )}
      {kind === "recibidas" && (
        <label className={"cf-drop" + (drag ? " drag" : "")} style={recibidas.length ? { padding: "12px 16px", alignItems: "center" } : null} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); onRecFiles(e.dataTransfer.files); }}>
          <input type="file" accept=".zip,.xml" multiple onChange={e => { onRecFiles(e.target.files); e.target.value = ""; }} />
          <span className="cf-drop-ic" style={recibidas.length ? { width: 32, height: 32 } : null}><Icon name="upload" size={recibidas.length ? 15 : 19} stroke="var(--ink)" /></span>
          <span>
            <span className="cf-drop-lbl">{recibidas.length ? tr("Agregar facturas recibidas (consulta.zip)", "Add received invoices (consulta.zip)") : tr("Facturas recibidas · consulta.zip del SAT", "Received invoices · SAT consulta.zip")}</span>
            {!recibidas.length && <span className="cf-drop-hint">{busy ? tr("Leyendo facturas…", "Reading invoices…") : tr("Es el mismo ZIP de Gastos e inversiones → Facturas SAT. Las facturas quedan guardadas en la hoja y se ven desde cualquier dispositivo; las que ya emparejaste aparecen con su clasificación.", "Same ZIP as Expenses → SAT invoices. Saved to the sheet, visible from any device.")}</span>}
          </span>
        </label>
      )}

      {items.length > 0 && (
        <div className="cf-bar">
          <Select value={ym} onChange={v => { setYm(v); setLimit(150); }} icon="calendar" minWidth={170}
            options={[{ value: "all", label: tr("Todos los meses", "All months") }].concat(months.map(m => ({ value: m, label: cfYmLabel(m) })))} />
          {kind === "recibidas" && nArch > 0 && (
            <Segmented size="sm" value={origin} onChange={v => { setOrigin(v); setLimit(150); }}
              options={[{ value: "all", label: tr("Todas", "All") }, { value: "sat", label: "SAT · " + nSat }, { value: "arch", label: tr("Ya cargadas", "Uploaded") + " · " + nArch }]} />
          )}
          {kind === "recibidas" ? (
            <div className="cf-chips" role="tablist">
              {[{ value: "all", label: tr("Todas", "All"), n: inMonth.length }].concat(["pend", "gastos", "banco", "grow", "otras"].map(k => ({ value: k, label: CF_BUCKET[k], n: bCount[k] || 0 }))).map(o => (
                <button key={o.value} type="button" role="tab" aria-selected={bucket === o.value} className={"cf-chip" + (bucket === o.value ? " on" : "")} onClick={() => { setBucket(o.value); setLimit(150); }}>
                  {o.value !== "all" && <span className="cf-dot" style={{ background: o.value === "pend" ? "var(--attention, #F2755A)" : o.value === "gastos" ? "#3d6b52" : o.value === "banco" ? "#3B6691" : o.value === "grow" ? "var(--peach)" : "var(--fg-muted)" }}></span>}
                  {o.label}<b>{o.n}</b>
                </button>
              ))}
            </div>
          ) : <Segmented size="sm" value={status} onChange={v => { setStatus(v); setLimit(150); }}
            options={[{ value: "all", label: tr("Todas", "All") + " · " + inMonth.length }, { value: "pend", label: tr("Por clasificar", "To classify") + " · " + pend.length }, { value: "done", label: tr("Clasificadas", "Classified") + " · " + (inMonth.length - pend.length) }]} />}
          <div className="cf-stats" style={{ marginLeft: "auto" }}>
            <span className="cf-stat">{tr("Total", "Total")} <b>{cfMoney(sum(inMonth))}</b></span>
            <span className="cf-stat">{tr("Pendiente", "Pending")} <b>{cfMoney(sum(pend))}</b></span>
          </div>
        </div>
      )}
      {kind === "recibidas" && items.length > 0 && (
        <div className="cf-auto">
          <div className="cf-auto-main">
            <span className="cf-auto-t">{withRs.length ? tr(withRs.length + " coincidencia(s) listas para clasificar", withRs.length + " match(es) ready") : tr("Sin coincidencias nuevas", "No new matches")}</span>
            <span className="cf-auto-s">{tr("Mismo monto y misma fecha que un gasto ya clasificado en los estados de cuenta (hasta " + CF_BANK_DAYS + " días después), o factura de ejecución en Grow.", "Same amount and date as a classified bank debit, or a Grow execution invoice.")}</span>
          </div>
          <button className="cf-btn warm" onClick={applyAllRs} disabled={busy || !withRs.length}><Icon name="sparkles" size={14} stroke="var(--ink)" />{tr("Aplicar", "Apply")}{withRs.length ? " · " + withRs.length : ""}</button>
          <button className="cf-btn ghost" onClick={() => setGrowOpen(o => !o)}><Icon name="link" size={13} stroke="currentColor" />Grow{grow ? " · " + grow.length : ""}</button>
          {growOpen && (
            <div className="cf-grow">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="lt-in" style={{ flex: 1, minWidth: 220 }} value={growId} onChange={e => setGrowId(e.target.value)} placeholder={tr("ID o enlace de la hoja “Spacio AM · Gestión” de Grow", "Grow sheet ID or link")} />
                <button className="cf-btn dark" onClick={() => loadGrow(growId)}>{tr("Conectar", "Connect")}</button>
              </div>
              <span className="cf-auto-s">{growMsg || tr("Se leen 10_FACTURAS y 11_FACTURA_ASIGNACIONES. Cada factura se empareja por número, o por monto y fecha, y hereda la propiedad del proyecto. Mientras Grow no tenga los proyectos anteriores, clasifica el mobiliario a mano con “" + CF_MOB + "”.", "Reads 10_FACTURAS and 11_FACTURA_ASIGNACIONES.")}</span>
            </div>
          )}
        </div>
      )}
      {kind === "emitidas" && withSug.length > 0 && status !== "done" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <button className="cf-btn warm" onClick={acceptSuggested} disabled={busy}><Icon name="sparkles" size={14} stroke="var(--ink)" />{tr("Aceptar sugerencias", "Accept suggestions")} · {withSug.length}</button>
          <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: "var(--fg-muted)" }}>{tr("Revisa antes: la sugerencia sale del detalle de cada factura.", "Review first: suggestions come from each invoice's lines.")}</span>
        </div>
      )}
      {msg && <p className="cf-msg">{msg}</p>}

      {shown.length > 0 ? (
        <div className="cf-list">
          <div className="cf-row head"><span>{tr("Fecha", "Date")}</span><span>{kind === "recibidas" ? tr("Emisor", "Issuer") : tr("Cliente", "Client")}</span><span style={{ textAlign: "right" }}>{tr("Monto", "Amount")}</span><span>{tr("Clasificación", "Classification")}</span><span></span></div>
          {shown.slice(0, limit).map(x => {
            const who = kind === "recibidas" ? (x.inv.emisor || x.inv.comercial) : x.inv.receptor;
            const desc = ((x.inv.items || [])[0] || {}).desc || "";
            const editable = !x.st.locked;
            return (
              <div key={x.inv._rid} className={"cf-row" + (x.st.k === "pend" ? " pend" : "")}>
                <span className="cf-date">{x.inv._arch ? (x.inv.ym ? cfYmLabel(x.inv.ym).replace(/^(\w{3})\w*/, "$1").toLowerCase() : "—") : cfDay(x.inv.day)}</span>
                <span className="cf-who"><b title={who}>{who || "—"}</b><span title={desc}>{x.inv._arch ? (x.inv.ym ? cfYmLabel(x.inv.ym) + " · " : "") + desc : (desc || (x.inv.nit ? "NIT " + x.inv.nit : ""))}</span></span>
                <span className="cf-amt">{x.inv._exp && x.inv.total == null ? <span style={{ fontWeight: 400, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{tr("En combo", "Combined")}</span> : x.inv._arch ? <span style={{ fontWeight: 400, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{x.inv.scope === "owner" ? tr("Socio", "Owner") : tr("Archivo", "File")}</span> : cfMoney(x.inv.total, x.inv.moneda)}</span>
                <div className="cf-dest">
                  {editable ? (
                    <React.Fragment>
                      <SaCombo size="sm" pending value={(x.sv && x.sv.clasificacion) || ""} onChange={(v, isNew) => classify(x, v, isNew)}
                        options={kind === "recibidas" ? tagOptions : emitOptions} clearable allowCreate={kind === "emitidas"} createLabel={tr("Agregar", "Add")}
                        recentKey={kind === "recibidas" ? "sa-combo-tags" : "sa-combo-emit"} placeholder={x.st.sug ? x.st.sug : x.st.rs ? x.st.rs.clas : tr("Escribe para clasificar…", "Type to classify…")} />
                      {x.st.rs && (
                        <button className="cf-sug cf-sug-btn" onClick={() => applyRs(x)} title={x.st.rs.why}>
                          <Icon name="sparkles" size={11} stroke="var(--peach)" /><span>{x.st.rs.clas}{x.st.rs.prop ? " · " + x.st.rs.prop : ""}</span><span className="why">{x.st.rs.fuente === "grow" ? "Grow" : tr("Estado de cuenta", "Bank")}</span><b>{tr("Aplicar", "Apply")}</b>
                        </button>
                      )}
                      {x.st.k === "here" && kind === "recibidas" && x.sv && x.sv.clasificacion === CF_MOB && (
                        <SaCombo size="sm" pending value={x.sv.propiedad || ""} onChange={v => setProp(x, v)} options={propOptions} recentKey="sa-combo-props" placeholder={tr("Propiedad del mobiliario…", "Property…")} />
                      )}
                      {x.st.k === "pend" && x.st.sug && <span className="cf-sug"><Icon name="sparkles" size={11} stroke="var(--peach)" />{tr("Sugerida", "Suggested")}: {x.st.sug}</span>}
                      {x.st.k === "here" && kind === "emitidas" && /hosped|manten/i.test(x.sv.clasificacion) && (
                        <SaCombo size="sm" value={x.sv.propiedad || ""} onChange={v => setProp(x, v)} options={propOptions} clearable recentKey="sa-combo-props" placeholder={tr("Propiedad (opcional)", "Property (optional)")} />
                      )}
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <span className="src">{x.st.src}</span>
                      <span className="lbl"><span className="cf-dot" style={{ background: CF_DOT[x.st.k] }}></span><span title={x.st.label}>{x.st.label}</span></span>
                    </React.Fragment>
                  )}
                </div>
                <button className="cf-eye" title={tr("Ver factura", "View invoice")} onClick={() => view(x)} disabled={x.inv._arch && !x.inv.url} style={x.inv._arch && !x.inv.url ? { opacity: .4, cursor: "default" } : null}><Icon name="eye" size={15} stroke="currentColor" /></button>
              </div>
            );
          })}
          {shown.length > limit && <button className="cf-more" onClick={() => setLimit(shown.length)}>{tr("Ver las " + (shown.length - limit) + " restantes", "Show remaining " + (shown.length - limit))}</button>}
        </div>
      ) : items.length > 0 ? (
        <div className="cf-list"><div style={{ padding: "30px 22px", textAlign: "center", fontFamily: "var(--sans)", fontSize: 12.5, letterSpacing: "0.03em", color: "var(--fg-muted)" }}>
          {status === "pend" ? tr("Todo clasificado en este mes.", "Everything classified this month.") : tr("Nada que mostrar con estos filtros.", "Nothing to show.")}
        </div></div>
      ) : null}

      {box && window.PyaDteBox && <PyaDteBox inv={box} lang={lang} onClose={() => setBox(null)} />}
      {expBox && window.InvoiceViewBox && <InvoiceViewBox data={expBox} lang={lang} onClose={() => setExpBox(null)} />}
    </div>
  );
}

// ============================================================
// LONG TERM — depósitos de estadía larga
// ============================================================
const LT_MAP_KEY = "sa-lt-map";   // { cuenta|depositante normalizado : property_name }
const LT_DRAFT_KEY = "sa-lt-draft";
function ltMap() { try { return JSON.parse(localStorage.getItem(LT_MAP_KEY)) || {}; } catch (e) { return {}; } }
function ltRemember(d) { const m = ltMap(); [d.cuenta, d.depositante].filter(Boolean).forEach(k => { m[window.SaRows.norm(k)] = d.property_name; }); try { localStorage.setItem(LT_MAP_KEY, JSON.stringify(m)); } catch (e) {} }
async function ltPdfText(file) {
  if (!window.pdfjsLib) return "";
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let t = ""; for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) { const pg = await pdf.getPage(p); const c = await pg.getTextContent(); t += c.items.map(i => i.str).join(" ") + "\n"; }
  return t;
}

function ContaLongTermSection({ lang }) {
  const es = lang !== "en"; const tr = (a, b) => (es ? a : b);
  cfUseRowsTick();
  const P = window.PedidosYa;
  const [deps, setDeps] = cfUseState(() => { try { return JSON.parse(localStorage.getItem(LT_DRAFT_KEY)) || []; } catch (e) { return []; } });
  const files = cfUseRef({});
  const [busy, setBusy] = cfUseState("");
  const [prog, setProg] = cfUseState(0);
  const [msg, setMsg] = cfUseState("");
  const [drag, setDrag] = cfUseState(false);
  const [zoom, setZoom] = cfUseState(null);
  const propOptions = cfUseMemo(() => cfPropOptions(), []);
  cfUseEffect(() => { try { localStorage.setItem(LT_DRAFT_KEY, JSON.stringify(deps.map(d => Object.assign({}, d, { url: "" })))); } catch (e) { try { localStorage.setItem(LT_DRAFT_KEY, JSON.stringify(deps.map(d => Object.assign({}, d, { url: "", thumb: "" })))); } catch (e2) {} } }, [deps]);

  const saved = window.SaRows.list("Long term").slice().sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));

  const onFiles = async (list) => {
    const arr = [...(list || [])].filter(f => /image\/|pdf/.test(f.type));
    if (!arr.length) return;
    setBusy("read"); setMsg(""); setProg(0);
    const sigs = new Set(deps.map(d => d.sig).concat(saved.map(r => r.sig).filter(Boolean)));
    const names = propOptions.map(o => o.value);
    const mem = ltMap();
    let T = null, dup = 0;
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i]; const sig = f.name + "|" + f.size;
      if (sigs.has(sig)) { dup++; continue; } sigs.add(sig);
      let text = "";
      try {
        if (/pdf/.test(f.type)) text = await ltPdfText(f);
        else { if (!T) T = window.pyaEnsureTesseract ? await window.pyaEnsureTesseract() : null; if (T) { const r = await T.recognize(URL.createObjectURL(f), "spa"); text = r.data.text || ""; } }
      } catch (e) {}
      const info = P && P.extractDeposit ? P.extractDeposit(text, f.name) : {};
      const dm = String(text).match(/(?:deposit(?:ante|ado por)|nombre|remitente|ordenante)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ .]{4,40})/i);
      const depositante = dm ? dm[1].trim() : "";
      let prop = (info.cuenta && mem[window.SaRows.norm(info.cuenta)]) || (depositante && mem[window.SaRows.norm(depositante)]) || "";
      let how = prop ? "memoria" : "";
      if (!prop && P && P.matchProperty) { prop = P.matchProperty(text + " " + f.name, names) || ""; if (prop) how = "texto"; }
      if (!prop) { const s = window.SaRows.suggestProperty(f.name, propOptions.map(o => ({ name: o.value }))); if (s && s.sure) { prop = s.name; how = "archivo"; } }
      let thumb = ""; try { if (window.pyaThumb && /image\//.test(f.type)) thumb = await window.pyaThumb(f); } catch (e) {}
      const id = "lt" + Date.now() + "-" + i;
      files.current[id] = f;
      setDeps(prev => prev.concat({ id, sig, fileName: f.name, pdf: /pdf/.test(f.type), thumb, url: /image\//.test(f.type) ? URL.createObjectURL(f) : "", fecha: info.day || "", monto: info.amount || "", moneda: info.moneda === "USD" ? "USD" : "GTQ", cuenta: info.cuenta || "", depositante, property_name: prop, how, comentario: "" }));
      setProg(Math.round(((i + 1) / arr.length) * 100));
    }
    if (dup) setMsg(tr(dup + " archivo(s) ya estaban cargados y se omitieron.", dup + " file(s) skipped."));
    setBusy("");
  };
  const setDep = (id, patch) => setDeps(ds => ds.map(d => d.id === id ? Object.assign({}, d, patch) : d));
  const ready = deps.filter(d => (+String(d.monto).replace(/[^0-9.]/g, "") > 0) && d.property_name && d.fecha);

  const save = async () => {
    if (!ready.length) return;
    setBusy("save"); setMsg("");
    const rows = []; let up = 0, noFile = 0;
    for (const d of ready) {
      let url = "", archivo = "";
      const f = files.current[d.id];
      if (f) { const r = await window.SaRows.uploadToDrive("longterm", f, { property_name: d.property_name, mes: String(d.fecha).slice(0, 7) }); if (r && r.ok) { url = r.url; archivo = r.fileName; up++; } }
      else noFile++;
      ltRemember(d);
      rows.push({ id: d.id, sig: d.sig, fecha: d.fecha, mes: String(d.fecha).slice(0, 7), property_name: d.property_name, monto: +String(d.monto).replace(/[^0-9.]/g, "") || 0, moneda: d.moneda, cuenta: d.cuenta, depositante: d.depositante, comentario: d.comentario, url, archivo });
    }
    const res = await window.SaRows.upsert("Long term", rows);
    setDeps(ds => ds.filter(d => ready.indexOf(d) < 0));
    ready.forEach(d => { delete files.current[d.id]; });
    setMsg(res.ok ? tr("Listo · " + rows.length + " depósito(s) guardados" + (up ? ", " + up + " comprobante(s) en Drive" : "") + "." + (noFile ? " " + noFile + " sin archivo (se recargó la página antes de guardar)." : "") + (res.local ? " Solo en este navegador: conecta la escritura en Setup." : ""), "Done · " + rows.length + " saved.") : tr("No se pudo escribir en la hoja: " + (res.error || "sin conexión") + ".", "Could not write."));
    setBusy("");
  };

  // agrupado por mes → propiedad
  const byMonth = {}; saved.forEach(r => { const k = r.mes || String(r.fecha || "").slice(0, 7) || "—"; (byMonth[k] = byMonth[k] || []).push(r); });
  const monthKeys = Object.keys(byMonth).sort().reverse();
  const totalsBy = (rs) => { const o = {}; rs.forEach(r => { o[r.moneda || "GTQ"] = (o[r.moneda || "GTQ"] || 0) + (+r.monto || 0); }); return Object.keys(o).map(c => cfMoney(o[c], c)).join(" · "); };

  return (
    <div>
      <SectionHead eyebrow={tr("Contabilidad", "Accounting")} title={tr("Long term", "Long term")}
        sub={tr("Depósitos de las propiedades con contrato de estadía larga. Leemos fecha y monto del comprobante; tú confirmas la propiedad y la recordamos para el próximo mes.", "Deposits from long-stay properties. We read date and amount; you confirm the property and we remember it.")} />

      <label className={"cf-drop" + (drag ? " drag" : "")} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}>
        <input type="file" accept="image/*,application/pdf" multiple onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
        <span className="cf-drop-ic"><Icon name="coins" size={19} stroke="var(--ink)" /></span>
        <span>
          <span className="cf-drop-lbl">{tr("Comprobantes de depósito (imagen o PDF)", "Deposit receipts (image or PDF)")}</span>
          <span className="cf-drop-hint">{busy === "read" ? tr("Leyendo comprobantes… " + prog + "%", "Reading… " + prog + "%") : tr("Sube uno o varios. Cada depósito se clasifica según la propiedad.", "Upload one or many. Each deposit is classified by property.")}</span>
        </span>
      </label>
      {msg && <p className="cf-msg">{msg}</p>}

      {deps.length > 0 && (
        <React.Fragment>
          <div className="lt-grid">
            {deps.map(d => (
              <div className="lt-card" key={d.id}>
                {d.thumb || d.url ? <img className="lt-thumb" src={d.url || d.thumb} alt="" onClick={() => d.url && setZoom(d.url)} style={{ cursor: d.url ? "zoom-in" : "default" }} />
                  : <span className="lt-thumb"><Icon name="file" size={22} stroke="var(--fg-muted)" /></span>}
                <div className="lt-body">
                  <div className="lt-row2">
                    <div style={{ flex: 1, minWidth: 0 }}>{window.PyaDate ? <PyaDate value={d.fecha} onChange={v => setDep(d.id, { fecha: v })} lang={lang} /> : <input className="lt-in" type="date" value={d.fecha} onChange={e => setDep(d.id, { fecha: e.target.value })} />}</div>
                    <input className="lt-in" style={{ width: 100 }} inputMode="decimal" value={d.monto} onChange={e => setDep(d.id, { monto: e.target.value })} placeholder="0.00" />
                    <Segmented size="sm" value={d.moneda} onChange={v => setDep(d.id, { moneda: v })} options={[{ value: "GTQ", label: "Q" }, { value: "USD", label: "$" }]} />
                  </div>
                  <SaCombo size="sm" pending value={d.property_name} onChange={v => setDep(d.id, { property_name: v, how: v ? "manual" : "" })} options={propOptions} recentKey="sa-combo-lt" placeholder={tr("Escribe la propiedad…", "Type the property…")} />
                  <input className="lt-in" value={d.comentario} onChange={e => setDep(d.id, { comentario: e.target.value })} placeholder={tr("Comentario (opcional)", "Comment (optional)")} />
                  <div className="lt-row2" style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.04em", color: "var(--fg-muted)" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {d.how === "memoria" ? tr("Propiedad recordada", "Remembered") : d.how === "texto" ? tr("Propiedad leída del comprobante", "Read from receipt") : d.how === "archivo" ? tr("Sugerida por el nombre del archivo", "Suggested by file name") : d.fileName}
                    </span>
                    <button className="pya-copy" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--sans)", fontSize: 10.5 }} onClick={() => setDeps(ds => ds.filter(x => x.id !== d.id))}><Icon name="x" size={12} stroke="currentColor" />{tr("quitar", "remove")}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 34, paddingTop: 14, borderTop: "1px solid var(--warm-grey)" }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: "var(--fg-muted)", maxWidth: 460, lineHeight: 1.5 }}>{tr("Revisa fecha, monto y propiedad antes de guardar. La lectura automática ayuda, pero no es perfecta.", "Check date, amount and property before saving.")}</span>
            <button className="cf-btn dark" onClick={save} disabled={!ready.length || busy === "save"}><Icon name="check" size={14} stroke="currentColor" />{busy === "save" ? tr("Guardando…", "Saving…") : tr("Guardar depósitos", "Save deposits") + (ready.length ? " · " + ready.length : "")}</button>
          </div>
        </React.Fragment>
      )}

      {monthKeys.length === 0 && !deps.length && (
        <div className="cf-list"><div style={{ padding: "30px 22px", textAlign: "center", fontFamily: "var(--sans)", fontSize: 12.5, letterSpacing: "0.03em", color: "var(--fg-muted)" }}>{tr("Aún no hay depósitos de long term. Sube el primero arriba.", "No long-term deposits yet.")}</div></div>
      )}
      {monthKeys.map(k => (
        <div key={k} className="lt-month">
          <div className="lt-month-h"><h4>{cfYmLabel(k)}</h4><span className="cf-stat">{byMonth[k].length} · <b>{totalsBy(byMonth[k])}</b></span></div>
          <div className="cf-list">
            {byMonth[k].map(r => (
              <div className="lt-line" key={r.id}>
                <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.property_name}</span>
                <span className="m">{cfDay(r.fecha)}</span>
                <span className="m">{[r.depositante, r.comentario].filter(Boolean).join(" · ") || (r.cuenta ? tr("Cuenta ", "Account ") + r.cuenta : "")}</span>
                <span className="n">{cfMoney(r.monto, r.moneda)}</span>
                <span className="lt-act">
                  {r.url && <a className="cf-eye" href={r.url} target="_blank" rel="noreferrer" title={tr("Ver comprobante", "View receipt")}><Icon name="eye" size={15} stroke="currentColor" /></a>}
                  <button className="cf-eye" title={tr("Eliminar", "Delete")} onClick={() => { if (window.confirm(tr("¿Eliminar este depósito?", "Delete this deposit?"))) window.SaRows.remove("Long term", [r.id]); }}><Icon name="trash" size={14} stroke="currentColor" /></button>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {zoom && (
        <div onClick={() => setZoom(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(62,63,63,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <img src={zoom} alt="" style={{ maxWidth: "92vw", maxHeight: "90vh", borderRadius: 14, boxShadow: "var(--shadow-lg)" }} />
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ContaFacturasSection, ContaLongTermSection });
