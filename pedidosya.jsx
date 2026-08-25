// ============================================================
// Spacio AM — Gastos e inversiones · módulo de carga (solo admin)
// Tres modos:
//   1) SAT        — sube el archivo del SAT, filtra facturas PedidosYa
//                   (productos + tarifa), el admin asigna propiedad + URL
//                   del pedido y se consolida en un solo monto.
//   2) Manual     — un gasto suelto o un gasto multipropiedad.
//   3) Depósitos  — sube imágenes de depósitos; OCR de fecha + monto.
// Todo se escribe sin duplicar (dedupe por nº de autorización / orderId).
// ============================================================
const { useState: pyUseState, useEffect: pyUseEffect, useMemo: pyUseMemo, useRef: pyUseRef, useCallback: pyUseCallback } = React;

// --- CSV mínimo para leer "insumos & gastos" (dedupe) ---
function pyaParseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const PYA_LOCAL_KEY = "sa-pya-imported";
function pyaLocalImported() { try { return new Set(JSON.parse(localStorage.getItem(PYA_LOCAL_KEY)) || []); } catch (e) { return new Set(); } }
function pyaLocalAdd(ids) { const s = pyaLocalImported(); ids.forEach(id => s.add(String(id))); localStorage.setItem(PYA_LOCAL_KEY, JSON.stringify([...s])); }

// Borrador de la conciliación SAT: sobrevive a recargas y cambios de pestaña.
// Guarda las facturas leídas (sin el XML crudo) + el estado de conciliación.
const PYA_SAT_DRAFT_KEY = "sa-pya-sat-draft";
const PYA_SAT_DRAFT_VER = 2;
function pyaSatDraftLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(PYA_SAT_DRAFT_KEY));
    if (!d || d.v !== PYA_SAT_DRAFT_VER || !Array.isArray(d.invoices)) return null;
    // descarta borradores de versiones viejas/corruptos (evita “undefined NaN”)
    const ok = d.invoices.every(x => x && x.id && typeof x.total === "number" && !isNaN(x.total) && x.emisor != null && x.day);
    return ok ? d : null;
  } catch (e) { return null; }
}

// normaliza fechas de la hoja a "yyyy-mm-dd" (acepta dd/mm/yyyy, yyyy-mm-dd y “1 Jul”)
function pyaNormFecha(v, yearHint) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  // “1 Jul” / “14 ago” / “1 de julio de 2026” — así guarda la hoja las fechas
  m = s.match(/^(\d{1,2})\s*(?:de\s+)?([A-Za-z\u00c0-\u00ff]{3,})\.?\s*(?:de\s+)?(\d{4})?$/);
  if (m) {
    const MM = { ene:1, jan:1, feb:2, mar:3, abr:4, apr:4, may:5, jun:6, jul:7, ago:8, aug:8, sep:9, set:9, oct:10, nov:11, dic:12, dec:12 };
    const mo = MM[m[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 3)];
    if (mo) {
      const y = m[3] ? parseInt(m[3], 10) : (yearHint || new Date().getFullYear());
      return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    }
  }
  return s;
}
// Año de una celda “Mes” tipo “Julio 2026”; null si no trae año.
function pyaYearOfMes(v) { const m = String(v || "").match(/(20\d{2})/); return m ? parseInt(m[1], 10) : null; }

// memoria local de depósitos ya guardados (firma archivo|tamaño) para no re-cargarlos
const PYA_DEP_KEY = "sa-pya-deposits";
function pyaDepSaved() { try { return new Set(JSON.parse(localStorage.getItem(PYA_DEP_KEY)) || []); } catch (e) { return new Set(); } }
function pyaDepAdd(sigs) { const s = pyaDepSaved(); sigs.forEach(x => s.add(String(x))); localStorage.setItem(PYA_DEP_KEY, JSON.stringify([...s])); }

// borrador de clasificación de depósitos: sobrevive a recargas y cambios de pestaña.
// Guardamos SOLO metadatos + una miniatura comprimida (no el archivo original).
const PYA_DEP_DRAFT_KEY = "sa-pya-dep-draft";
function pyaDepDraftLoad() { try { return JSON.parse(localStorage.getItem(PYA_DEP_DRAFT_KEY)) || []; } catch (e) { return []; } }
function pyaDepDraftSlim(deps) { return deps.map(d => ({ id: d.id, sig: d.sig, fileName: d.fileName, thumb: d.thumb || "", day: d.day, amount: d.amount, property_name: d.property_name, categoria: d.categoria, comentario: d.comentario, cuenta: d.cuenta, moneda: d.moneda })); }
function pyaDepDraftSave(deps) {
  try { localStorage.setItem(PYA_DEP_DRAFT_KEY, JSON.stringify(pyaDepDraftSlim(deps))); }
  catch (e) {
    // sin espacio (miniaturas): reintenta guardando solo los metadatos
    try { localStorage.setItem(PYA_DEP_DRAFT_KEY, JSON.stringify(pyaDepDraftSlim(deps).map(d => Object.assign({}, d, { thumb: "" })))); } catch (e2) {}
  }
}
// downscale de una imagen a un dataURL JPEG pequeño (persistible en localStorage)
function pyaThumb(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const max = 200, sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
      try { c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); } catch (e) {}
      URL.revokeObjectURL(url);
      let out = ""; try { out = c.toDataURL("image/jpeg", 0.6); } catch (e) {}
      res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(""); };
    img.src = url;
  });
}
// mes (1-12) a partir de una fecha yyyy-mm-dd o dd/mm/yyyy
function pyaMonthOf(day) { const s = String(day || ""); let m = s.match(/(\d{4})-(\d{1,2})/); if (m) return +m[2]; m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); return m ? +m[2] : ""; }

// carga perezosa de Tesseract.js (solo cuando se usan depósitos)
let _tessP = null;
function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (_tessP) return _tessP;
  _tessP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js";
    s.onload = () => res(window.Tesseract); s.onerror = rej;
    document.head.appendChild(s);
  });
  return _tessP;
}

// ============================================================
// Contenedor principal
// ============================================================
const PedidosYaImport = ({ lang }) => {
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const [mode, setMode] = pyUseState("sat");
  const [open, setOpen] = pyUseState(false); // minimizado por defecto; se abre con el botón
  const [imported, setImported] = pyUseState(() => pyaLocalImported());
  const [sheetExpenses, setSheetExpenses] = pyUseState([]);

  pyUseEffect(() => {
    if (!document.getElementById("pya-styles")) {
      const s = document.createElement("style"); s.id = "pya-styles"; s.textContent = window.PYA_STYLE; document.head.appendChild(s);
    }
  }, []);

  // lee "insumos & gastos" para conocer orderId / autorizaciones ya guardadas
  pyUseEffect(() => {
    const sid = window.SPACIO_SHEET_ID; if (!sid) return;
    const url = "https://docs.google.com/spreadsheets/d/" + sid + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent("insumos & gastos");
    fetch(url).then(r => r.text()).then(txt => {
      const parsed = pyaParseCSV(txt); if (!parsed.length) return;
      const head = parsed[0].map(h => h.trim().toLowerCase());
      const mesCol = head.indexOf("mes");
      const oidCol = head.findIndex(h => h === "orderid" || h === "order id");
      const apCol = head.findIndex(h => h === "authproductos");
      const atCol = head.findIndex(h => h === "authtarifa");
      const fCol = head.findIndex(h => h === "fecha de pedido");
      const vCol = head.findIndex(h => h === "valor");
      const cCol = head.findIndex(h => h === "comentario");
      const pCol = head.findIndex(h => h === "property_name");
      const catCol = head.findIndex(h => h === "categoria");
      const ids = new Set(), rows = [];
      for (let i = 1; i < parsed.length; i++) {
        const r = parsed[i];
        [oidCol, apCol, atCol].forEach(c => { if (c > -1 && r[c] && String(r[c]).trim()) ids.add(String(r[c]).trim()); });
        const hasAuth = (apCol > -1 && String(r[apCol] || "").trim()) || (atCol > -1 && String(r[atCol] || "").trim());
        const fecha = fCol > -1 ? pyaNormFecha(r[fCol], mesCol > -1 ? pyaYearOfMes(r[mesCol]) : null) : "";
        const valor = vCol > -1 ? (parseFloat(String(r[vCol]).replace(/[^0-9.\-]/g, "")) || 0) : 0;
        const cm = cCol > -1 ? String(r[cCol] || "") : "";
        const mm = cm.match(/\(compartido ÷(\d+)\)/);
        if (fecha && valor) rows.push({ fecha, valor, mult: mm ? parseInt(mm[1], 10) : 1, hasAuth: !!hasAuth, property_name: pCol > -1 ? String(r[pCol] || "").trim() : "", comentario: cm, orderId: oidCol > -1 ? String(r[oidCol] || "").trim() : "", category: catCol > -1 ? String(r[catCol] || "").trim() : "" });
      }
      setSheetExpenses(rows);
      if (ids.size) setImported(prev => { const n = new Set(prev); ids.forEach(x => n.add(x)); return n; });
    }).catch(() => {});
  }, []);

  const addImported = (ids) => { pyaLocalAdd(ids); setImported(prev => { const n = new Set(prev); ids.forEach(x => n.add(String(x))); return n; }); };

  const propOptions = pyUseMemo(() => {
    const names = [...new Set((window.SpacioData && window.SpacioData.propertyList || []).map(p => p.name).filter(Boolean))].sort();
    return names.map(n => ({ value: n, label: n }));
  }, []);

  const modes = [
    { k: "sat", label: tr("Facturas SAT", "SAT invoices"), icon: "file" },
    { k: "manual", label: tr("Gasto manual", "Manual expense"), icon: "coins" },
    { k: "deposit", label: tr("Depósitos", "Deposits"), icon: "wrench" },
    { k: "reportes", label: tr("Reportes", "Reports"), icon: "wrench" },
    { k: "manage", label: tr("Guardados", "Saved"), icon: "pencil" },
  ];

  return (
    <section className="pya-block">
      <div className="pya-card">
        <button className="pya-head" onClick={() => setOpen(o => !o)}
          style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", background: "var(--ink)", color: "var(--alabaster)", borderRadius: 999, fontFamily: "var(--sans)", fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase" }}>{tr("Administrador", "Administrator")}</span>
              <Sparkle size={13} color="var(--peach)" />
            </div>
            <h3 className="pya-head-title">{tr("Cargar gastos e insumos", "Load expenses & supplies")}</h3>
            {open && <p className="pya-head-sub">{tr("Sube el archivo del SAT para registrar las facturas de PedidosYa, agrega gastos manuales o carga depósitos bancarios. Nada se duplica.", "Upload the SAT file to register PedidosYa invoices, add manual expenses, or load bank deposits. Nothing is duplicated.")}</p>}
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, fontFamily: "var(--sans)", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-muted)" }}>
            {open ? tr("Minimizar", "Collapse") : tr("Abrir", "Open")}
            <Icon name="chevronRight" size={16} stroke="var(--ink)" style={{ transition: "transform var(--d-fast) var(--ease)", transform: open ? "rotate(90deg)" : "none" }} />
          </span>
        </button>

        {open && (
        <div className="pya-body">
          <div className="pya-modes">
            {modes.map(m => (
              <button key={m.k} className={"pya-mode" + (mode === m.k ? " on" : "")} onClick={() => setMode(m.k)}>
                <Icon name={m.icon} size={14} stroke="currentColor" />{m.label}
              </button>
            ))}
          </div>

          {/* Los tres paneles se mantienen montados: cambiar de pestaña ya no
              borra el trabajo en curso (issue 3). Solo se oculta el inactivo. */}
          <div style={{ display: mode === "sat" ? "block" : "none" }}>
            <PyaSatPanel lang={lang} imported={imported} addImported={addImported} propOptions={propOptions} sheetExpenses={sheetExpenses} />
          </div>
          <div style={{ display: mode === "manual" ? "block" : "none" }}>
            <PyaManualPanel lang={lang} addImported={addImported} propOptions={propOptions} sheetCats={[...new Set((sheetExpenses || []).map(e => e.category).filter(Boolean))]} />
          </div>
          <div style={{ display: mode === "deposit" ? "block" : "none" }}>
            <PyaDepositPanel lang={lang} propOptions={propOptions} />
            <PyaRetencionesPanel lang={lang} propOptions={propOptions} />
          </div>
          <div style={{ display: mode === "reportes" ? "block" : "none" }}>
            <PyaReportesPanel lang={lang} propOptions={propOptions} addImported={addImported} active={mode === "reportes"} />
          </div>
          <div style={{ display: mode === "manage" ? "block" : "none" }}>
            <PyaManagePanel lang={lang} propOptions={propOptions} active={mode === "manage"} />
          </div>
        </div>
        )}
      </div>
    </section>
  );
};

function PyaDteBox({ inv, lang, onClose }) {
  const P = window.PedidosYa; const es = lang !== "en"; const tr = (a, b) => es ? a : b;
  if (!inv) return null;
  const sub = inv.items.reduce((s, x) => s + x.gravable, 0);
  const kindLbl = inv.kind === "productos" ? "PedidosYa Market" : inv.kind === "tarifa" ? tr("Tarifa de servicio PedidosYa", "PedidosYa service fee") : tr("Compra en tienda", "Store purchase");
  const dlXml = () => { if (!inv.raw) return; const b = new Blob([inv.raw], { type: "text/xml" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (inv.auth || "factura") + ".xml"; a.click(); };
  const eyebrow = { fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--fg-muted)" };
  const fl = { display: "inline-block", minWidth: 82, fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-muted)" };
  const th = { fontFamily: "var(--sans)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-muted)", fontWeight: 600, textAlign: "right", padding: "10px 8px", borderBottom: "1px solid var(--warm-grey)" };
  const td = { padding: "9px 8px", borderBottom: "1px solid var(--ink-08)", fontFamily: "var(--sans)", fontSize: 12, textAlign: "right", verticalAlign: "top", color: "var(--ink)" };
  return (
    <div className="pya-overlay" onClick={onClose}>
      <div className="pya-modal" style={{ maxWidth: 780 }} onClick={e => e.stopPropagation()}>
        <div className="pya-modal-head" style={{ alignItems: "flex-start" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flex: 1, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={eyebrow}>{tr("Factura electrónica · FEL", "Electronic invoice · FEL")}</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 24, color: "var(--ink)", marginTop: 6, lineHeight: 1.1 }}>{inv.emisor || "—"}</div>
              {inv.comercial ? <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginTop: 5 }}>{inv.comercial}{inv.establec ? " · Est. " + inv.establec : ""}</div> : null}
              <div style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--fg-muted)", marginTop: 3 }}>NIT {inv.nit}</div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 3, fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--ink)" }}>
                <div><span style={fl}>{tr("Factura", "Invoice")}</span> {tr("Serie", "Series")} {inv.serie || "—"} · No. {inv.autNum || "—"}</div>
                <div style={{ overflowWrap: "anywhere" }}><span style={fl}>{tr("Autorización", "Authorization")}</span> <code style={{ fontSize: 10.5 }}>{inv.auth}</code></div>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span style={{ display: "inline-block", fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, background: "var(--beige-soft)", borderRadius: 999, padding: "5px 12px", color: "var(--ink)" }}>{inv.tipo || "FACT"}</span>
              <div className="pya-num" style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: 27, color: "var(--ink)", marginTop: 10, lineHeight: 1 }}>{P.money(inv.total)} <small style={{ fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 600, color: "var(--fg-muted)" }}>{inv.moneda || "GTQ"}</small></div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--fg-muted)", marginTop: 7 }}>{tr("Emitida", "Issued")} {P.prettyDay(inv.day, lang)}</div>
            </div>
          </div>
          <button className="pya-modal-x" onClick={onClose}><Icon name="x" size={17} stroke="var(--ink)" /></button>
        </div>
        <div className="pya-modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: "4px 0 14px", borderBottom: "1px solid var(--ink-08)" }}>
            <div><div style={eyebrow}>{tr("Receptor", "Recipient")}</div><div style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: "var(--ink)", marginTop: 5 }}>{inv.receptor || "—"}</div><div style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2 }}>NIT {inv.nitReceptor || "—"}</div></div>
            <div><div style={eyebrow}>{tr("Clasificación", "Class")}</div><div style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: "var(--ink)", marginTop: 5 }}>{inv.kind === "productos" ? "Market" : inv.kind === "tarifa" ? tr("Tarifa", "Fee") : tr("Tienda", "Store")}</div><div style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2 }}>{kindLbl}</div></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4, minWidth: 560 }}>
              <thead><tr>
                <th style={Object.assign({}, th, { textAlign: "left" })}>#</th>
                <th style={Object.assign({}, th, { textAlign: "left" })}>{tr("Descripción", "Description")}</th>
                <th style={th}>{tr("Cant.", "Qty")}</th><th style={th}>{tr("P. unitario", "Unit price")}</th><th style={th}>{tr("Desc.", "Disc.")}</th><th style={th}>IVA</th><th style={th}>Total</th>
              </tr></thead>
              <tbody>
                {inv.items.map((x, i) => (
                  <tr key={i}>
                    <td style={Object.assign({}, td, { textAlign: "left", color: "var(--fg-muted)", fontSize: 11 })}>{x.linea || i + 1}</td>
                    <td style={Object.assign({}, td, { textAlign: "left", fontWeight: 500 })}>{x.desc}{x.unidad ? <span style={{ color: "var(--fg-muted)", fontSize: 11 }}> · {x.unidad}</span> : null}</td>
                    <td className="pya-num" style={td}>{x.cant || 1}</td>
                    <td className="pya-num" style={td}>{P.money(x.pu)}</td>
                    <td className="pya-num" style={Object.assign({}, td, x.descuento > 0 ? { color: "var(--peach-text, #B54D36)", fontWeight: 600 } : {})}>{x.descuento > 0 ? "−" + P.money(x.descuento) : "—"}</td>
                    <td className="pya-num" style={td}>{P.money(x.iva)}</td>
                    <td className="pya-num" style={td}>{P.money(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <div style={{ width: 250 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--ink)" }}><span>{tr("Gravable", "Taxable")}</span><span className="pya-num">{P.money(sub)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--ink)" }}><span>IVA (12%)</span><span className="pya-num">{P.money(inv.ivaTotal)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "2px solid var(--ink)", marginTop: 7, paddingTop: 10, fontFamily: "var(--serif)", fontWeight: 700, fontSize: 19, color: "var(--ink)" }}><span>Total</span><span className="pya-num">{P.money(inv.total)} <small style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, color: "var(--fg-muted)" }}>{inv.moneda || "GTQ"}</small></span></div>
            </div>
          </div>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--ink-08)", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--fg-muted)" }}>
              <div><span style={fl}>{tr("Certificado", "Certified")}</span> {inv.certificador || "—"} · {P.prettyDay(inv.certDate, lang)}</div>
              <div style={{ marginTop: 3, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 9.5, fontWeight: 600 }}>{tr("Reproducción interna · Spacio AM", "Internal reproduction · Spacio AM")}</div>
            </div>
            <img src="logo-stamp.png" alt="Spacio AM" style={{ width: 46, height: 46, display: "block" }} />
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 14 }}>
            {inv.raw ? <button className="pya-copy" onClick={dlXml}>{tr("Descargar XML original", "Download original XML")}</button> : null}
            <a className="pya-copy" style={{ textDecoration: "none" }} href="https://felpub.c.sat.gob.gt/verificador-web/publico/vistas/verificacionDte.jsf" target="_blank" rel="noopener">{tr("Verificar en SAT ↗", "Verify at SAT ↗")}</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 1) Panel Facturas SAT — auto-conciliación (consulta.zip de XML)
//    Sube el ZIP de XML del SAT → empareja los gastos "insumos & gastos"
//    (sin factura) por FECHA + MONTO: 1 factura, luego combos de 2 del
//    mismo día. La conciliación manual es solo para los sobrantes.
// ============================================================
function PyaSatPanel({ lang, imported, addImported, propOptions, sheetExpenses }) {
  const P = window.PedidosYa;
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const [invoices, setInvoices] = pyUseState(() => { const d = pyaSatDraftLoad(); return d && d.invoices ? d.invoices : null; });
  const [stats, setStats] = pyUseState(() => { const d = pyaSatDraftLoad(); return d && d.stats ? d.stats : null; });
  const [busy, setBusy] = pyUseState("");
  const [drag, setDrag] = pyUseState(false);
  const [msg, setMsg] = pyUseState("");
  const [box, setBox] = pyUseState(null);
  const [linked, setLinked] = pyUseState(() => { const d = pyaSatDraftLoad(); return new Set((d && d.linked) || []); });       // gastos ya conciliados (por _k)
  const [manualUsed, setManualUsed] = pyUseState(() => { const d = pyaSatDraftLoad(); return new Set((d && d.manualUsed) || []); }); // facturas usadas en manual
  const [hiddenInvs, setHiddenInvs] = pyUseState(() => { const d = pyaSatDraftLoad(); return new Set((d && d.hiddenInvs) || []); });   // facturas ocultadas (“no aplica / después”)
  const [hiddenExps, setHiddenExps] = pyUseState(() => { const d = pyaSatDraftLoad(); return new Set((d && d.hiddenExps) || []); });   // gastos ocultados

  // Persistir el borrador: el ZIP leído y la conciliación NO se pierden al cambiar
  // de pestaña ni al recargar (se necesita moverse entre pestañas al conciliar).
  pyUseEffect(() => {
    try {
      if (!invoices) { localStorage.removeItem(PYA_SAT_DRAFT_KEY); return; }
      const pack = (withItems) => JSON.stringify({
        v: PYA_SAT_DRAFT_VER,
        invoices: invoices.map(iv => { const c = Object.assign({}, iv); delete c.raw; if (!withItems) c.items = []; return c; }),
        stats, linked: [...linked], manualUsed: [...manualUsed], hiddenInvs: [...hiddenInvs], hiddenExps: [...hiddenExps],
      });
      try { localStorage.setItem(PYA_SAT_DRAFT_KEY, pack(true)); }
      catch (e) { localStorage.setItem(PYA_SAT_DRAFT_KEY, pack(false)); } // sin espacio: guarda sin líneas
    } catch (e) {}
  }, [invoices, stats, linked, manualUsed, hiddenInvs, hiddenExps]);
  const [activeExp, setActiveExp] = pyUseState(null);            // _k del gasto en conciliación manual
  const [sel, setSel] = pyUseState(() => new Set());             // facturas elegidas para el gasto activo

  const money = P.money;
  const [previewInv, setPreviewInv] = pyUseState(null);
  const [manualProp, setManualProp] = pyUseState("");
  const dDiff = (a, b) => { if (!a || !b) return 99; return Math.abs(Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000)); };
  // días de “later” DESPUÉS de “base” (negativo = antes). La factura solo puede
  // ser del mismo día del gasto o hasta 2 días después — nunca antes.
  const dAfter = (later, base) => { if (!later || !base) return 99; return Math.round((new Date(later + "T00:00:00Z") - new Date(base + "T00:00:00Z")) / 86400000); };
  const [manualMode, setManualMode] = pyUseState("gasto");
  // Solo se concilian gastos cuyo COMENTARIO (col. F) diga “insumos”.
  const targets = pyUseMemo(() => (sheetExpenses || []).filter(e => {
    if (e.hasAuth) return false;
    if (!/insumos/i.test(e.comentario || "")) return false;
    return true;
  }).map((e, i) => Object.assign({ _k: "e" + i }, e)), [sheetExpenses]);
  const conc = pyUseMemo(() => invoices ? P.autoConciliate(targets.filter(e => !hiddenExps.has(e._k)), invoices.filter(iv => !hiddenInvs.has(iv.id))) : null, [invoices, targets, hiddenExps, hiddenInvs]);

  const onFiles = async (files) => {
    if (!files || !files.length) return;
    setBusy("read"); setMsg("");
    const res = await P.parseDTEFiles([...files]);
    setInvoices(res.invoices); setStats(res.stats); setBusy("");
    if (!res.invoices.length) setMsg(tr("No se leyeron facturas. Sube el consulta.zip del SAT (o los XML sueltos).", "No invoices read. Upload the SAT consulta.zip (or the XML files)."));
  };

  const autoMatches = (conc ? conc.matches : []).filter(m => !linked.has(m.expense._k));
  const leftoverExps = (conc ? conc.unmatchedExpenses : []).filter(e => !linked.has(e._k) && !hiddenExps.has(e._k));
  const leftoverInvs = (conc ? conc.unmatchedInvoices : []).filter(inv => !manualUsed.has(inv.id) && !hiddenInvs.has(inv.id));
  const hiddenCount = hiddenInvs.size + hiddenExps.size;

  const backendReady = () => window.SpacioWrite && window.SpacioWrite.enabled && window.SpacioWrite.enabled();

  const wErr = (res) => { const err = (res && res.error) || tr("sin conexión", "offline"); return err === "unauthorized" ? tr("Token sin permiso para conciliar. Actualiza el Apps Script (permite linkFacturas al token de subida) o escribe el token de administrador en Setup → Conexión de escritura.", "Token not allowed. Update the Apps Script or set the admin token in Setup.") : tr("No se pudo escribir: " + err + ".", "Could not write: " + err + "."); };
  const linkAll = async () => {
    if (!autoMatches.length) return;
    if (!backendReady()) { setMsg(tr("Conecta el backend (Setup → Conexión de escritura) para conciliar.", "Connect the backend (Setup → Write connection) to conciliate.")); return; }
    setBusy("link"); setMsg("");
    const links = autoMatches.map(m => P.linkPayload(m.expense, m.invoices));
    const res = await window.SpacioWrite.post("linkFacturas", { links });
    if (res && res.ok) {
      setLinked(prev => { const n = new Set(prev); autoMatches.forEach(m => n.add(m.expense._k)); return n; });
      addImported(autoMatches.reduce((a, m) => a.concat(m.invoices.map(iv => iv.auth)), []));
      setMsg(tr("Listo · " + autoMatches.length + " gasto(s) conciliados automáticamente. El socio ya ve sus facturas en Gastos e inversiones.", "Done · " + autoMatches.length + " expense(s) auto-conciliated."));
    } else setMsg(wErr(res));
    setBusy("");
  };

  const activeExpObj = leftoverExps.find(e => e._k === activeExp) || null;
  const target = activeExpObj ? Math.round(activeExpObj.valor * (activeExpObj.mult > 1 ? activeExpObj.mult : 1) * 100) / 100 : 0;
  const selInvs = [...sel].map(id => leftoverInvs.find(x => x.id === id)).filter(Boolean);
  const selSum = Math.round(selInvs.reduce((s, iv) => s + iv.total, 0) * 100) / 100;
  const selClose = activeExpObj && Math.abs(selSum - target) <= 0.06;

  const openManual = (k) => { setActiveExp(k === activeExp ? null : k); setSel(new Set()); setPreviewInv(null); };
  const toggleSel = (id) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const linkExpInvs = async (expObj, invs) => {
    if (!expObj || !invs.length) return false;
    if (!backendReady()) { setMsg(tr("Conecta el backend para conciliar.", "Connect the backend to conciliate.")); return false; }
    setBusy("mlink"); setMsg("");
    const res = await window.SpacioWrite.post("linkFacturas", { links: [P.linkPayload(expObj, invs)] });
    let ok = false;
    if (res && res.ok) {
      ok = true;
      const ids = invs.map(iv => iv.id);
      setLinked(prev => { const n = new Set(prev); n.add(expObj._k); return n; });
      setManualUsed(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
      addImported(invs.map(iv => iv.auth));
      setMsg(tr("Gasto conciliado manualmente.", "Expense conciliated manually."));
    } else setMsg(wErr(res));
    setBusy("");
    return ok;
  };
  const doManual = async () => {
    if (await linkExpInvs(activeExpObj, selInvs)) { setSel(new Set()); setActiveExp(null); }
  };
  const linkConta = (inv, hit) => {
    const stmt = window.SpacioContaStore && window.SpacioContaStore.getStatement(hit.ym, hit.accId);
    if (!stmt || !stmt.rows[hit.idx]) return false;
    stmt.rows[hit.idx].factura = inv.auth;
    window.SpacioContaStore.saveStatement(stmt);
    setManualUsed(prev => { const n = new Set(prev); n.add(inv.id); return n; });
    addImported([inv.auth]);
    setMsg(tr("Factura vinculada al movimiento de contabilidad — gana el link “Ver” en Estados de cuenta.", "Invoice linked to the accounting line."));
    return true;
  };
  // Depósito de socio: doble conciliación — se marca contra el depósito y se
  // intenta vincular también el ABONO (Haber) correspondiente en contabilidad.
  const linkDep = (inv, dep) => {
    let contaOk = false;
    try {
      if (window.SpacioContaStore) {
        const ym = (inv.day || "").slice(0, 7);
        const dAft = (a, b) => Math.abs(Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000));
        outer: for (const k of [ym]) {
          for (const s of (window.SpacioContaStore.statementsForMonth(k) || [])) {
            if (s.currency !== "GTQ") continue;
            for (let i = 0; i < (s.rows || []).length; i++) {
              const r = s.rows[i];
              if (r.credit > 0 && !r.factura && r.date && dAft(r.date, inv.day) <= 2 && Math.abs(r.credit - inv.total) <= 0.06) {
                r.factura = inv.auth; window.SpacioContaStore.saveStatement(s); contaOk = true; break outer;
              }
            }
          }
        }
      }
    } catch (e) {}
    setManualUsed(prev => { const n = new Set(prev); n.add(inv.id); return n; });
    addImported([inv.auth]);
    setMsg(tr("Factura marcada como depósito de " + (dep.property_name || "socio") + ". " + (contaOk ? "Vinculada también al abono en contabilidad." : "No se encontró el abono exacto en contabilidad (revísalo cuando cargues el mes)."), "Invoice marked as partner deposit."));
    return true;
  };

  const kindLabel = (k) => k === "productos" ? tr("Market", "Market") : k === "tarifa" ? tr("Tarifa", "Fee") : tr("Tienda", "Store");
  const InvChip = ({ inv }) => (
    <button className="pya-link" onClick={() => setBox(inv)} title={inv.emisor}>
      <span className={"pya-badge " + (inv.kind === "productos" ? "matched" : inv.kind === "tarifa" ? "sin" : "revisar")} style={{ padding: "2px 7px" }}><span className="dot" />{kindLabel(inv.kind)}</span>
      {money(inv.total)}
    </button>
  );

  const doneCount = linked.size;
  const nMatchedInv = autoMatches.reduce((a, m) => a + m.invoices.length, 0);

  return (
    <React.Fragment>
      <label className={"pya-drop" + (drag ? " drag" : "")} style={{ marginTop: 18 }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}>
        <input type="file" accept=".zip,.xml" multiple onChange={e => onFiles(e.target.files)} />
        <span className="pya-drop-ic"><Icon name="file" size={20} stroke="var(--ink)" /></span>
        <span>
          <span className="pya-drop-lbl">{tr("Facturas del SAT (consulta.zip)", "SAT invoices (consulta.zip)")}</span>
          <span className="pya-drop-hint">{tr("En Agencia Virtual → Consultar DTE, descarga como XLS: baja un ZIP con un XML por factura (con todo el detalle). Suéltalo aquí. Nada se duplica.", "In Agencia Virtual → Consultar DTE, download as XLS: it gives a ZIP with one XML per invoice (full detail). Drop it here. Nothing is duplicated.")}</span>
          {busy === "read" && <span className="pya-drop-done"><span className="sa-spin" style={{ width: 12, height: 12, border: "2px solid var(--warm-grey)", borderTopColor: "var(--peach)", borderRadius: "50%", display: "inline-block" }} /> {tr("Leyendo…", "Reading…")}</span>}
          {stats && busy !== "read" && <span className="pya-drop-done"><Icon name="check" size={13} stroke="#5B8A6B" /> {stats.count} {tr("facturas leídas", "invoices read")}{stats.dup ? " · " + stats.dup + tr(" duplicadas omitidas", " duplicates skipped") : ""}</span>}
        </span>
      </label>

      {invoices && !targets.length && (
        <div className="pya-warn"><Icon name="info" size={16} stroke="var(--peach)" style={{ flexShrink: 0, marginTop: 1 }} /><p>{tr("No hay gastos “insumos & gastos” sin factura para conciliar en la hoja. Registra los gastos primero, o revisa que aún no tengan factura vinculada.", "No supply expenses without an invoice to conciliate. Register the expenses first, or check they aren't already linked.")}</p></div>
      )}

      {conc && targets.length > 0 && (
        <React.Fragment>
          <div className="pya-stats sticky">
            <div className="pya-stats-nums">
              <span className="pya-stat"><b>{autoMatches.length}</b><span>{tr("por conciliar (auto)", "to conciliate (auto)")}</span></span>
              <span className="pya-stat"><b>{nMatchedInv}</b><span>{tr("facturas emparejadas", "invoices paired")}</span></span>
              <span className="pya-stat"><b>{leftoverExps.length}</b><span>{tr("gastos sin factura", "expenses w/o invoice")}</span></span>
              <span className="pya-stat"><b>{leftoverInvs.length}</b><span>{tr("facturas sobrantes", "leftover invoices")}</span></span>
              {doneCount > 0 && <span className="pya-stat"><b>{doneCount}</b><span>{tr("conciliados", "conciliated")}</span></span>}
            </div>
            {autoMatches.length > 0 && (
              <button className="pya-btn pya-btn-dark" style={{ flexShrink: 0 }} onClick={linkAll} disabled={busy === "link"}>
                {busy === "link" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.4)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="check" size={15} stroke="var(--alabaster)" />}
                {tr("Conciliar automáticamente", "Auto-conciliate")} · {autoMatches.length}
              </button>
            )}
          </div>

          {/* --- auto matches --- */}
          {autoMatches.length > 0 && (
            <React.Fragment>
              <div className="pya-scroll" style={{ marginTop: 16 }}>
                <table className="pya-table" style={{ minWidth: 720 }}>
                  <thead><tr>
                    <th>{tr("Fecha", "Date")}</th>
                    <th>{tr("Gasto reportado", "Reported expense")}</th>
                    <th style={{ textAlign: "right" }}>{tr("Monto", "Amount")}</th>
                    <th style={{ minWidth: 240 }}>{tr("Factura(s) que lo forman", "Invoice(s) that make it up")}</th>
                  </tr></thead>
                  <tbody>
                    {autoMatches.map((m, i) => (
                      <tr key={m.expense._k + i}>
                        <td className="pya-num">{P.prettyDay(m.expense.fecha, lang)}</td>
                        <td>{m.expense.property_name || tr("(sin propiedad)", "(no property)")}{m.expense.comentario ? <span style={{ display: "block", fontSize: 10, color: "var(--fg-muted)", marginTop: 2, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.expense.comentario.replace(/\s*·?\s*\(compartido ÷\d+\)\s*$/, "")}</span> : null}</td>
                        <td className="pya-num" style={{ textAlign: "right", fontWeight: 600 }}>{money(m.expense.target)}{m.kind === "pair" ? <span style={{ display: "block", fontWeight: 400, fontSize: 9.5, color: "#5B8A6B", marginTop: 2 }}>{tr("2 facturas", "2 invoices")}</span> : null}</td>
                        <td><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{m.invoices.map((iv, j) => <InvChip key={j} inv={iv} />)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pya-footer">
                <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: msg ? "var(--ink)" : "var(--fg-muted)", maxWidth: 620, lineHeight: 1.5 }}>
                  {msg || tr("Cada gasto ya tiene propiedad y monto. Al conciliar, se le adjunta su factura por fecha y monto — sin reasignar nada. El botón de conciliar está fijo arriba.", "Each expense already has property and amount. Conciliating attaches its invoice by date and amount — no reassigning.")}
                </span>
              </div>
            </React.Fragment>
          )}

          {autoMatches.length === 0 && doneCount > 0 && leftoverExps.length === 0 && (
            <div className="pya-empty" style={{ color: "#4d7a5d" }}>{tr("Todo conciliado. No quedan gastos sin factura.", "All conciliated. No expenses without an invoice.")}</div>
          )}

          {/* --- manual: solo sobrantes --- */}
          {leftoverExps.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{tr("Conciliación manual · sobrantes", "Manual conciliation · leftovers")}</div>
                <div className="pya-mmode">
                  <button className={"pya-mmode-btn" + (manualMode === "gasto" ? " on" : "")} onClick={() => setManualMode("gasto")}>{tr("Por gasto", "By expense")}</button>
                  <button className={"pya-mmode-btn" + (manualMode === "factura" ? " on" : "")} onClick={() => setManualMode("factura")}>{tr("Por factura", "By invoice")}</button>
                </div>
                {manualMode === "gasto" && <select className="pya-select" style={{ maxWidth: 240 }} value={manualProp} onChange={e => setManualProp(e.target.value)}>
                  <option value="">{tr("Todos los apartamentos", "All apartments")}</option>
                  {[...new Set(leftoverExps.map(x => x.property_name).filter(Boolean))].sort().map(p => <option key={p} value={p}>{p}</option>)}
                </select>}
              </div>
              {manualMode === "gasto" && <React.Fragment>
              <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, lineHeight: 1.5, letterSpacing: "0.02em", color: "var(--fg-muted)", margin: "0 0 14px", maxWidth: 560, textWrap: "pretty" }}>
                {tr("Estos gastos no se pudieron emparejar solos (montos que no cuadran, combos de 3+ facturas, o fechas distintas). Elige el gasto y marca las facturas que lo forman.", "These expenses couldn't be matched automatically (amounts that don't add up, combos of 3+ invoices, or different dates). Pick the expense and check the invoices that make it up.")}
              </p>
              <div className="pya-saved">
                {leftoverExps.filter(e => !manualProp || e.property_name === manualProp).map(e => {
                  const open = activeExp === e._k;
                  const t = Math.round(e.valor * (e.mult > 1 ? e.mult : 1) * 100) / 100;
                  return (
                    <div className={"pya-saved-row" + (open ? " editing" : "")} key={e._k}>
                      <div className="pya-saved-main" style={{ cursor: "pointer" }} onClick={() => openManual(e._k)}>
                        <div className="pya-saved-top">
                          <span className="pya-saved-prop">{e.property_name || tr("(sin propiedad)", "(no property)")}</span>
                          <span className="pya-saved-amt">{money(t)}</span>
                        </div>
                        <div className="pya-saved-meta"><span>{P.prettyDay(e.fecha, lang)}</span>{e.comentario ? <span className="pya-saved-chip">{e.comentario.replace(/\s*·?\s*\(compartido ÷\d+\)\s*$/, "").slice(0, 40)}</span> : null}</div>
                      </div>
                      {!open && <div className="pya-saved-actions">
                        <button className="pya-icbtn" title={tr("Ocultar / no aplica", "Hide / not applicable")} onClick={() => setHiddenExps(prev => { const n = new Set(prev); n.add(e._k); return n; })}><Icon name="x" size={14} stroke="var(--fg-muted)" /></button>
                        <button className="pya-icbtn" title={tr("Conciliar", "Conciliate")} onClick={() => openManual(e._k)}><Icon name="chevronRight" size={15} stroke="var(--ink)" /></button>
                      </div>}
                      {open && (
                        <div style={{ width: "100%", marginTop: 14 }}>
                          <div style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.04em", color: "var(--fg-muted)", marginBottom: 10 }}>
                            {tr("Marca las facturas del", "Check invoices from")} {P.prettyDay(e.fecha, lang)} {tr("o hasta 2 días después que suman", "or up to 2 days later adding up to")} {money(t)}:
                          </div>
                          {(() => {
                            const near = leftoverInvs.filter(iv => { const d = dAfter(iv.day, e.fecha); return d >= 0 && d <= 2 && iv.total <= t + 0.06; }).sort((a, b) => dAfter(a.day, e.fecha) - dAfter(b.day, e.fecha) || (b.total - a.total));
                            const pv = previewInv ? near.find(x => x.id === previewInv) : null;
                            if (!near.length) return <div className="pya-empty" style={{ padding: "18px 12px" }}>{tr("No hay facturas sobrantes de esta fecha ni de los 2 días siguientes. Revisa la fecha del gasto o el archivo.", "No leftover invoices on this date or the next 2 days.")}</div>;
                            return (
                              <div className="pya-manual-split">
                                <div className="pya-manual-list">
                                  {near.map(iv => (
                                    <div key={iv.id} className={"pya-manual-inv" + (sel.has(iv.id) ? " on" : "") + (previewInv === iv.id ? " pv" : "")} onClick={() => setPreviewInv(iv.id)}>
                                      <PyaCheck on={sel.has(iv.id)} onClick={() => toggleSel(iv.id)} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iv.emisor}</div>
                                        <div style={{ fontFamily: "var(--sans)", fontSize: 10, color: "var(--fg-muted)", marginTop: 2 }}>{kindLabel(iv.kind)} · {P.prettyDay(iv.day, lang)}{dAfter(iv.day, e.fecha) > 0 ? " · +" + dAfter(iv.day, e.fecha) + "d" : ""}</div>
                                      </div>
                                      <span className="pya-num" style={{ fontWeight: 600, fontSize: 12.5 }}>{money(iv.total)}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="pya-manual-preview">
                                  {pv ? (
                                    <React.Fragment>
                                      <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--ink)", lineHeight: 1.15 }}>{pv.emisor}</div>
                                      <div style={{ fontFamily: "var(--sans)", fontSize: 10.5, color: "var(--fg-muted)", margin: "3px 0 10px" }}>{pv.comercial ? pv.comercial + " · " : ""}NIT {pv.nit} · {P.prettyDay(pv.day, lang)}</div>
                                      <div style={{ maxHeight: 190, overflowY: "auto", borderTop: "1px solid var(--ink-08)" }}>
                                        {pv.items.map((x, i) => (
                                          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--ink-08)", fontFamily: "var(--sans)", fontSize: 11.5 }}>
                                            <span style={{ flex: 1, color: "var(--ink)" }}>{x.cant > 1 ? x.cant + "× " : ""}{x.desc}</span>
                                            <span className="pya-num" style={{ color: "var(--fg-muted)" }}>{money(x.total)}</span>
                                          </div>
                                        ))}
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                                        <span>Total</span><span className="pya-num">{money(pv.total)}</span>
                                      </div>
                                      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                                        <button className="pya-btn pya-btn-ghost" style={{ padding: "8px 14px" }} onClick={() => toggleSel(pv.id)}>{sel.has(pv.id) ? tr("Quitar", "Remove") : tr("Agregar", "Add")}</button>
                                        <button className="pya-copy" onClick={() => setBox(pv)}><Icon name="eye" size={13} stroke="currentColor" />{tr("Factura completa", "Full invoice")}</button>
                                      </div>
                                    </React.Fragment>
                                  ) : (
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 160, textAlign: "center", color: "var(--fg-muted)", gap: 8 }}>
                                      <Icon name="file" size={22} stroke="var(--warm-grey)" />
                                      <span style={{ fontFamily: "var(--sans)", fontSize: 11.5 }}>{tr("Toca una factura para verla aquí", "Tap an invoice to preview it here")}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                          <div className="pya-footer" style={{ marginTop: 14 }}>
                            <span style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.03em", color: selClose ? "#3d6b52" : "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {selClose && <Icon name="check" size={15} stroke="#3d6b52" />}
                              {tr("Seleccionado", "Selected")}: {money(selSum)} / {money(t)}{selClose ? " · " + tr("cuadra exacto", "exact match") : (sel.size ? " · " + tr("faltan", "missing") + " " + money(Math.round((t - selSum) * 100) / 100) : "")}
                            </span>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="pya-btn pya-btn-ghost" onClick={() => openManual(e._k)}>{tr("Cancelar", "Cancel")}</button>
                              <button className="pya-btn pya-btn-dark" onClick={doManual} disabled={!sel.size || busy === "mlink"} title={selClose ? "" : tr("El monto no cuadra exacto; puedes conciliar igual.", "Amount is off; you can still conciliate.")}>
                                {busy === "mlink" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.4)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="check" size={15} stroke="var(--alabaster)" />}
                                {tr("Conciliar", "Conciliate")}{sel.size ? " · " + sel.size : ""}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </React.Fragment>}
              {manualMode === "factura" && <PyaFacturaFirst lang={lang} invoices={leftoverInvs} expenses={leftoverExps} busy={busy} onLinkExp={linkExpInvs} onLinkConta={linkConta} onLinkDep={linkDep} onView={setBox} onHideInv={(id) => setHiddenInvs(prev => { const n = new Set(prev); n.add(id); return n; })} />}
            </div>
          )}

          {/* --- 2.1: sobrantes vs contabilidad (estados de cuenta) --- */}
          {leftoverInvs.length > 0 && (
            <PyaContaRecon lang={lang} invoices={leftoverInvs} pendingExps={leftoverExps.length} onLinked={(ids) => { setManualUsed(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; }); }} onView={setBox} />
          )}

          {/* limpiar */}
          <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {hiddenCount > 0 && <button className="pya-btn pya-btn-ghost" onClick={() => { setHiddenInvs(new Set()); setHiddenExps(new Set()); }}>
              <Icon name="eye" size={14} stroke="var(--fg-muted)" />{tr("Mostrar ocultos", "Show hidden")} · {hiddenCount}
            </button>}
            <button className="pya-btn pya-btn-ghost" onClick={() => { if (window.confirm(tr("¿Quitar el archivo cargado?", "Clear the loaded file?"))) { setInvoices(null); setStats(null); setLinked(new Set()); setManualUsed(new Set()); setActiveExp(null); setSel(new Set()); setMsg(""); } }} disabled={!invoices}>
              <Icon name="x" size={14} stroke="var(--fg-muted)" />{tr("Limpiar", "Clear")}
            </button>
          </div>
        </React.Fragment>
      )}

      {box && <PyaDteBox inv={box} lang={lang} onClose={() => setBox(null)} />}
    </React.Fragment>
  );
}

// ============================================================
// 2) Panel gasto manual (suelto o multipropiedad)
// ============================================================
function PyaManualPanel({ lang, addImported, propOptions, sheetCats }) {
  const P = window.PedidosYa;
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = pyUseState(today);
  const [valor, setValor] = pyUseState("");
  const [categoria, setCategoria] = pyUseState("Reparaciones o inversión");
  const [comentario, setComentario] = pyUseState("");
  const [tag, setTag] = pyUseState("");
  const [scope, setScope] = pyUseState("one"); // one | many
  const [oneProp, setOneProp] = pyUseState("");
  const [manyProps, setManyProps] = pyUseState([]);
  const [split, setSplit] = pyUseState("each"); // each | divide
  const [busy, setBusy] = pyUseState(false);
  const [msg, setMsg] = pyUseState("");

  // Todas las categorías reales de la col. E de la hoja + las dos base.
  const baseCats = [
    { value: "Reparaciones o inversión", label: tr("Mantenimiento e inversión", "Maintenance & investment") },
    { value: "insumos & gastos", label: tr("Insumos & gastos", "Supplies & expenses") },
  ];
  const catOptions = baseCats.concat(
    [...new Set(sheetCats || [])].filter(c => !baseCats.some(b => b.value.toLowerCase() === String(c).toLowerCase())).sort().map(c => ({ value: c, label: c }))
  );
  const tagOptions = [
    { value: "", label: tr("— (sin etiqueta)", "— (no tag)") },
    { value: "Restaurante / comida", label: tr("Restaurante / comida", "Restaurant / food") },
    { value: "Compras ajenas a insumos", label: tr("Compras ajenas a insumos", "Non-supply purchase") },
    { value: "Gasto Spacio AM", label: tr("Gasto Spacio AM", "Spacio AM expense") },
  ];

  const props = scope === "one" ? (oneProp ? [oneProp] : []) : manyProps;
  const valorNum = P.numQ(valor);
  const canSave = valorNum > 0 && props.length > 0;
  const toggleMany = (name) => setManyProps(ps => ps.includes(name) ? ps.filter(x => x !== name) : ps.concat(name));

  const save = async () => {
    if (!canSave) return;
    setBusy(true); setMsg("");
    const rows = P.manualSheetRows({ day, valor: valorNum, categoria, comentario, tag }, props, scope === "many" && split === "divide");
    if (window.SpacioWrite && window.SpacioWrite.enabled()) {
      const res = await window.SpacioWrite.post("appendInsumos", { rows });
      if (res && res.ok) {
        addImported(rows.map(r => r.orderId));
        setMsg(tr("Listo · " + rows.length + " " + (rows.length === 1 ? "fila escrita" : "filas escritas") + ".", "Done · " + rows.length + " rows written."));
        setValor(""); setComentario(""); setManyProps([]); setOneProp("");
      } else setMsg(tr("No se pudo escribir: " + ((res && res.error) || "sin conexión") + ".", "Could not write: " + ((res && res.error) || "offline") + "."));
    } else {
      const header = ["Mes", "Fecha de pedido", "property_name", "valor", "categoria", "Comentario", "tag"];
      const lines2 = [header.join("\t")].concat(rows.map(o => header.map(h => o[h]).join("\t")));
      const blob = new Blob([lines2.join("\n")], { type: "text/tab-separated-values" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gasto-manual.tsv"; a.click();
      setMsg(tr("Backend sin configurar. Se descargó un TSV.", "Backend not configured. A TSV was downloaded."));
    }
    setBusy(false);
  };

  return (
    <div className="pya-form" style={{ marginTop: 20 }}>
      <div className="pya-form-grid">
        <div className="pya-field"><label>{tr("Fecha", "Date")}</label><PyaDate value={day} onChange={setDay} lang={lang} /></div>
        <div className="pya-field"><label>{tr("Monto (GTQ)", "Amount (GTQ)")}</label><input className="pya-input" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0.00" /></div>
        <div className="pya-field"><label>{tr("Categoría", "Category")}</label><PyaMini value={categoria} options={catOptions} onChange={setCategoria} /></div>
        <div className="pya-field"><label>Tag</label><PyaMini value={tag} options={tagOptions} onChange={setTag} placeholder={tr("— (sin etiqueta)", "— (no tag)")} /></div>
      </div>
      <div className="pya-field"><label>{tr("Comentario / descripción", "Comment / description")}</label><textarea className="pya-input" value={comentario} onChange={e => setComentario(e.target.value)} placeholder={tr("Ej. Compra de focos, plomería, mantenimiento…", "E.g. Light bulbs, plumbing, maintenance…")} /></div>

      <div className="pya-field">
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span>{tr("Aplica a", "Applies to")}</span>
          <span className="pya-segbtn">
            <button className={scope === "one" ? "on" : ""} onClick={() => setScope("one")}>{tr("Una propiedad", "One property")}</button>
            <button className={scope === "many" ? "on" : ""} onClick={() => setScope("many")}>{tr("Varias", "Several")}</button>
          </span>
        </label>
        {scope === "one"
          ? <PyaMini value={oneProp} options={propOptions} onChange={setOneProp} placeholder={tr("Selecciona la propiedad…", "Select the property…")} search />
          : (
            <React.Fragment>
              <div className="pya-propsel">
                {propOptions.map(o => (
                  <button key={o.value} className={"pya-pchip" + (manyProps.includes(o.value) ? " on" : "")} onClick={() => toggleMany(o.value)}>
                    {manyProps.includes(o.value) && <Icon name="check" size={12} stroke="var(--alabaster)" />}{o.label}
                  </button>
                ))}
              </div>
              {manyProps.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <span className="pya-segbtn">
                    <button className={split === "each" ? "on" : ""} onClick={() => setSplit("each")}>{tr("Mismo monto a cada una", "Same amount each")}</button>
                    <button className={split === "divide" ? "on" : ""} onClick={() => setSplit("divide")}>{tr("Dividir en partes iguales", "Split equally")}</button>
                  </span>
                  <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.04em", color: "var(--fg-muted)" }}>
                    {manyProps.length} {tr("propiedades", "properties")}{valorNum > 0 ? " · " + P.money(split === "divide" ? valorNum / manyProps.length : valorNum) + tr(" c/u", " each") : ""}
                  </span>
                </div>
              )}
            </React.Fragment>
          )}
      </div>

      <div className="pya-footer">
        <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: msg ? "var(--ink)" : "var(--fg-muted)", maxWidth: 440, lineHeight: 1.5 }}>
          {msg || tr("Categoría (col. E) = quién lo paga: 'insumos & gastos' y 'Mantenimiento e inversión' se le cobran al socio. El tag (col. G) es descriptivo, PERO 'Gasto Spacio AM', 'Compras ajenas a insumos' y 'Restaurante / comida' ocultan el gasto al socio. Monto en GTQ.", "Category (col. E) = who pays: 'insumos & gastos' and 'Maintenance & investment' are billed to the owner. The tag (col. G) is descriptive, BUT 'Spacio AM expense', 'Non-supply purchase' and 'Restaurant / food' hide the expense from the owner. Amount in GTQ.")}
        </span>
        <button className="pya-btn pya-btn-dark" onClick={save} disabled={!canSave || busy}>
          {busy ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.4)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="check" size={15} stroke="var(--alabaster)" />}
          {tr("Guardar gasto", "Save expense")}{props.length > 1 ? " · " + props.length : ""}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 3) Panel depósitos (OCR de imágenes)
// ============================================================
function PyaDepositPanel({ lang, propOptions }) {
  const P = window.PedidosYa;
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const depCatOptions = [
    { value: "Reparaciones o inversión", label: tr("Reparaciones o inversión", "Repairs or investment") },
    { value: "insumos & gastos", label: tr("insumos & gastos", "supplies & expenses") },
    { value: "Otro", label: tr("Otro", "Other") },
    { value: "Gasto Spacio AM", label: tr("Gasto Spacio AM", "Spacio AM expense") },
    { value: "Pago equipo de primera (EP)", label: tr("Pago equipo de primera (EP)", "First-team payment (EP)") },
    { value: "Otro ingreso", label: tr("Otro ingreso", "Other income") },
  ];
  const [deps, setDeps] = pyUseState(() => pyaDepDraftLoad());
  // persiste cada cambio de clasificación (no se pierde al recargar o cambiar de pestaña)
  pyUseEffect(() => { pyaDepDraftSave(deps); }, [deps]);
  const [busy, setBusy] = pyUseState("");
  const [progress, setProgress] = pyUseState(0);
  const [msg, setMsg] = pyUseState("");
  const [drag, setDrag] = pyUseState(false);
  const [zoom, setZoom] = pyUseState(null);
  const names = propOptions.map(o => o.value);

  const onImages = async (files) => {
    const imgs = [...files].filter(f => /image\//.test(f.type));
    if (!imgs.length) return;
    setBusy("ocr"); setMsg(""); setProgress(0);
    let T; try { T = await ensureTesseract(); } catch (e) { setMsg(tr("No se pudo cargar el lector OCR.", "Could not load the OCR reader.")); setBusy(""); return; }
    // dedupe por nombre+tamaño contra lo ya cargado en esta sesión y lo ya guardado (issue 6)
    const savedSigs = pyaDepSaved();
    const seen = new Set(deps.map(d => d.sig));
    let dupes = 0;
    for (let i = 0; i < imgs.length; i++) {
      const f = imgs[i];
      const sig = f.name + "|" + f.size;
      if (seen.has(sig) || savedSigs.has(sig)) { dupes++; setProgress(Math.round(((i + 1) / imgs.length) * 100)); continue; }
      seen.add(sig);
      const url = URL.createObjectURL(f);
      let text = "";
      try { const r = await T.recognize(url, "spa"); text = r.data.text || ""; } catch (e) { text = ""; }
      const info = P.extractDeposit(text, f.name);
      const guess = P.matchProperty(text + " " + f.name, names);
      let thumb = ""; try { thumb = await pyaThumb(f); } catch (e) {}
      const rec = { id: "d" + Date.now() + "-" + i, sig, url, thumb, fileName: f.name, day: info.day || "", amount: info.amount || "", property_name: guess || "", categoria: "insumos & gastos", comentario: info.comentario || "", cuenta: info.cuenta || "", moneda: info.moneda || "" };
      setProgress(Math.round(((i + 1) / imgs.length) * 100));
      setDeps(prev => prev.concat(rec));
    }
    if (dupes) setMsg(tr(dupes + " imagen(es) ya estaban cargadas y se omitieron.", dupes + " image(s) were already loaded and skipped."));
    setBusy("");
  };

  const setDep = (id, patch) => setDeps(ds => ds.map(d => d.id === id ? Object.assign({}, d, patch) : d));
  const removeDep = (id) => setDeps(ds => ds.filter(d => d.id !== id));
  const ready = deps.filter(d => P.numQ(d.amount) > 0 && d.property_name && d.day);

  const save = async () => {
    if (!ready.length) return;
    setBusy("save"); setMsg("");
    // cada registro clasificado se agrega como una FILA NUEVA en la hoja "insumos & gastos".
    const rows = ready.map(d => ({
      Mes: pyaMonthOf(d.day),
      "Fecha de pedido": d.day,
      property_name: d.property_name,
      valor: P.numQ(d.amount),
      categoria: d.categoria || "insumos & gastos",
      Comentario: d.comentario || (es ? "Depósito / gasto cargado" : "Uploaded deposit / expense"),
      orderId: "DEP-" + String(d.sig || d.id).replace(/[^A-Za-z0-9]+/g, "-"),
    }));
    if (window.SpacioWrite && window.SpacioWrite.enabled()) {
      const res = await window.SpacioWrite.post("appendInsumos", { rows });
      // actualiza moneda en SETUP para las que se detectó
      for (const d of ready) { if ((d.moneda === "USD" || d.moneda === "GTQ") && d.property_name) { try { await window.SpacioWrite.post("updateMoneda", { property_name: d.property_name, moneda: d.moneda }); } catch (e) {} } }
      if (res && res.ok) { pyaDepAdd(ready.map(d => d.sig)); setMsg(tr("Listo · " + (res.added != null ? res.added : rows.length) + " registro(s) guardados en “insumos & gastos”." + (res.skipped ? " " + res.skipped + " ya existían." : ""), "Done · " + (res.added != null ? res.added : rows.length) + " record(s) saved to “insumos & gastos”." + (res.skipped ? " " + res.skipped + " already existed." : ""))); setDeps(ds => ds.filter(d => !ready.includes(d))); }
      else setMsg(tr("No se pudo escribir: " + ((res && res.error) || "sin conexión") + ".", "Could not write: " + ((res && res.error) || "offline") + "."));
    } else {
      const header = ["Mes", "Fecha de pedido", "property_name", "valor", "categoria", "Comentario", "orderId"];
      const lines2 = [header.join("\t")].concat(rows.map(o => header.map(h => o[h]).join("\t")));
      const blob = new Blob([lines2.join("\n")], { type: "text/tab-separated-values" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "insumos-gastos.tsv"; a.click();
      setMsg(tr("Backend sin configurar. Se descargó un TSV.", "Backend not configured. A TSV was downloaded."));
    }
    setBusy("");
  };

  return (
    <React.Fragment>
      <label className={"pya-drop" + (drag ? " drag" : "")} style={{ marginTop: 20 }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onImages(e.dataTransfer.files); }}>
        <input type="file" accept="image/*" multiple onChange={e => onImages(e.target.files)} />
        <span className="pya-drop-ic"><Icon name="coins" size={20} stroke="var(--ink)" /></span>
        <span>
          <span className="pya-drop-lbl">{tr("Imágenes de depósitos (una o varias)", "Deposit images (one or many)")}</span>
          <span className="pya-drop-hint">{tr("Capturas de Banco Industrial u otro. Leemos fecha y monto automáticamente; deduce la propiedad si el edificio y apto aparecen en la imagen.", "Banco Industrial screenshots or others. We read date and amount automatically; the property is guessed if the building and unit appear in the image.")}</span>
          {busy === "ocr" && <span className="pya-drop-done"><span className="sa-spin" style={{ width: 12, height: 12, border: "2px solid var(--warm-grey)", borderTopColor: "var(--peach)", borderRadius: "50%", display: "inline-block" }} /> {tr("Leyendo imágenes…", "Reading images…")} {progress}%</span>}
        </span>
      </label>

      {deps.length > 0 && (
        <React.Fragment>
          <div className="pya-deps">
            {deps.map(d => (
              <div className="pya-dep" key={d.id}>
                <img className="pya-dep-thumb" src={d.thumb || d.url} alt="" onClick={() => setZoom(d.url || d.thumb)} />
                <div className="pya-dep-body">
                  <div className="pya-dep-row">
                    <div style={{ flex: 1 }}><PyaDate value={d.day} onChange={v => setDep(d.id, { day: v })} lang={lang} /></div>
                    <input className="pya-input" style={{ fontSize: 12, padding: "8px 9px", width: 96 }} inputMode="decimal" value={d.amount} onChange={e => setDep(d.id, { amount: e.target.value })} placeholder="Q 0.00" />
                  </div>
                  <PyaMini value={d.property_name} options={propOptions} onChange={v => setDep(d.id, { property_name: v })} placeholder={tr("Propiedad…", "Property…")} search />
                  <div className="pya-dep-row">
                    <div style={{ flex: 1 }}><PyaMini value={d.categoria} options={depCatOptions} onChange={v => setDep(d.id, { categoria: v })} placeholder={tr("Categoría…", "Category…")} /></div>
                  </div>
                  <input className="pya-input" style={{ fontSize: 12, padding: "8px 10px" }} value={d.comentario} onChange={e => setDep(d.id, { comentario: e.target.value })} placeholder={tr("Comentario (opcional)", "Comment (optional)")} />
                  <div className="pya-dep-row">
                    <span className="pya-dep-ocr">{d.property_name ? <React.Fragment><Icon name="check" size={11} stroke="#5B8A6B" />{tr("propiedad deducida", "property guessed")}</React.Fragment> : <React.Fragment><Icon name="info" size={11} stroke="var(--peach)" />{tr("asigna la propiedad", "assign property")}</React.Fragment>}</span>
                    <button className="pya-copy" style={{ marginLeft: "auto" }} onClick={() => removeDep(d.id)}><Icon name="x" size={12} stroke="currentColor" />{tr("quitar", "remove")}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pya-footer">
            <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: msg ? "var(--ink)" : "var(--fg-muted)", maxWidth: 440, lineHeight: 1.5 }}>
              {msg || tr("Verifica fecha, monto y propiedad de cada depósito antes de guardar. El OCR es una ayuda, no es perfecto.", "Check date, amount and property of each deposit before saving. OCR is a help, not perfect.")}
            </span>
            <button className="pya-btn pya-btn-dark" onClick={save} disabled={!ready.length || busy === "save"}>
              {busy === "save" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.4)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="check" size={15} stroke="var(--alabaster)" />}
              {tr("Guardar depósitos", "Save deposits")}{ready.length ? " · " + ready.length : ""}
            </button>
          </div>
        </React.Fragment>
      )}

      {zoom && (
        <div className="pya-overlay" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" style={{ maxWidth: "92vw", maxHeight: "90vh", borderRadius: 14, boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </React.Fragment>
  );
}

// ============================================================
// 1a) Conciliación manual POR FACTURA: eliges la factura sobrante, la ves,
//     y escoges destino — “Gastos e inversiones” (gastos insumos) o
//     “Contabilidad” (columna Debe). Candidatos: misma fecha o hasta 2 días
//     alrededor, montos similares; check verde si cuadra exacto.
// ============================================================
function PyaFacturaFirst({ lang, invoices, expenses, busy, onLinkExp, onLinkConta, onLinkDep, onView, onHideInv }) {
  const P = window.PedidosYa;
  const es = lang !== "en"; const tr = (a, b) => es ? a : b; const money = P.money;
  const dA = (later, base) => { if (!later || !base) return 99; return Math.round((new Date(later + "T00:00:00Z") - new Date(base + "T00:00:00Z")) / 86400000); };
  const [focus, setFocus] = pyUseState(null);
  const [target, setTarget] = pyUseState("gastos");
  const [pick, setPick] = pyUseState(null);
  const inv = invoices.find(x => x.id === focus) || null;

  const cands = pyUseMemo(() => {
    if (!inv) return [];
    if (target === "gastos") {
      return expenses.map(e => ({ key: "e" + e._k, exp: e, amount: Math.round(e.valor * (e.mult > 1 ? e.mult : 1) * 100) / 100, day: e.fecha, label: e.property_name || tr("(sin propiedad)", "(no property)"), sub: e.comentario ? e.comentario.replace(/\s*·?\s*\(compartido ÷\d+\)\s*$/, "").slice(0, 40) : "" }))
        .filter(c => { const d = dA(inv.day, c.day); return d >= 0 && d <= 2 && c.amount >= inv.total - 0.06; })
        .sort((a, b) => Math.abs(a.amount - inv.total) - Math.abs(b.amount - inv.total)).slice(0, 12);
    }
    if (target === "dep") {
      // Depósitos de socios: evalúa el monto en QUETZALES y en DÓLARES (× tipo de cambio)
      const rate = (window.SpacioI18n && window.SpacioI18n.GTQ_RATE) || 7.46;
      const deps = (window.SpacioData && window.SpacioData.depositos) || [];
      return deps.map((d, i) => {
        const day = pyaNormFecha(d.fecha || "");
        const qMatch = Math.abs(d.monto - inv.total) <= 0.06;
        const uMatch = Math.abs(d.monto * rate - inv.total) <= 1.0;
        return { key: "d" + i, dep: d, amount: qMatch || !uMatch ? d.monto : Math.round(d.monto * rate * 100) / 100, day, label: d.property_name || tr("(sin propiedad)", "(no property)"), sub: (uMatch && !qMatch ? "USD " + d.monto + " × " + rate : ""), qMatch, uMatch };
      })
        .filter(c => { const d = /^\d{4}-\d{2}-\d{2}$/.test(c.day) ? Math.abs(dA(inv.day, c.day)) : 0; return d <= 3 && (c.qMatch || c.uMatch || Math.abs(c.amount - inv.total) <= Math.max(inv.total * 0.25, 30)); })
        .sort((a, b) => Math.abs(a.amount - inv.total) - Math.abs(b.amount - inv.total)).slice(0, 12);
    }
    if (!window.SpacioContaStore) return [];
    const rows = [];
    const seenYm = {};
    const ym = (inv.day || "").slice(0, 7);
    [0, -1, 1].forEach(d => { const [y, m] = ym.split("-").map(Number); const t2 = new Date(Date.UTC(y, m - 1 + d, 1)); const k = t2.getUTCFullYear() + "-" + ("0" + (t2.getUTCMonth() + 1)).slice(-2); if (seenYm[k]) return; seenYm[k] = 1;
      (window.SpacioContaStore.statementsForMonth(k) || []).forEach(s => { if (s.currency !== "GTQ") return; (s.rows || []).forEach((r, idx) => { if (r.debit > 0 && !r.factura) rows.push({ ym: s.ym, accId: s.accId, idx, r }); }); });
    });
    return rows.map(h => ({ key: "c" + h.ym + "|" + h.accId + "|" + h.idx, hit: h, amount: h.r.debit, day: h.r.date, label: (window.SpacioConta && window.SpacioConta.accountById(h.accId) || { name: h.accId }).name, sub: (h.r.desc || "").slice(0, 44) }))
      .filter(c => { const d = dA(inv.day, c.day); return d >= -2 && d <= 2 && Math.abs(c.amount - inv.total) <= Math.max(inv.total * 0.5, 30); })
      .sort((a, b) => Math.abs(a.amount - inv.total) - Math.abs(b.amount - inv.total)).slice(0, 12);
  }, [inv && inv.id, target, expenses, invoices]);

  const picked = cands.find(c => c.key === pick) || null;
  const exact = picked && Math.abs(picked.amount - inv.total) <= 0.06;
  const confirm = async () => {
    if (!inv || !picked) return;
    let ok = false;
    if (target === "gastos") ok = await onLinkExp(picked.exp, [inv]);
    else if (target === "dep") ok = onLinkDep(inv, picked.dep);
    else ok = onLinkConta(inv, picked.hit);
    if (ok) { setFocus(null); setPick(null); }
  };

  return (
    <React.Fragment>
      <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, lineHeight: 1.5, letterSpacing: "0.02em", color: "var(--fg-muted)", margin: "0 0 14px", maxWidth: 560, textWrap: "pretty" }}>
        {tr("Elige la factura sobrante y escógele destino: un gasto de insumos, un movimiento de contabilidad o un depósito de socio con fecha y monto similares. Con ✕ ocultas lo que no aplica.", "Pick the leftover invoice and choose its destination: a supply expense, an accounting line, or a partner deposit with similar date and amount.")}
      </p>
      <div className="pya-manual-split">
        <div className="pya-manual-list">
          {invoices.slice().sort((a, b) => (a.day < b.day ? 1 : -1)).map(iv => (
            <div key={iv.id} className={"pya-manual-inv" + (focus === iv.id ? " pv" : "")} onClick={() => { setFocus(iv.id); setPick(null); }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iv.emisor}</div>
                <div style={{ fontFamily: "var(--sans)", fontSize: 10, color: "var(--fg-muted)", marginTop: 2 }}>{P.prettyDay(iv.day, lang)}</div>
              </div>
              <span className="pya-num" style={{ fontWeight: 600, fontSize: 12.5 }}>{money(iv.total)}</span>
              <button className="pya-copy" style={{ padding: 4 }} title={tr("Ver factura", "View invoice")} onClick={(ev) => { ev.stopPropagation(); onView(iv); }}><Icon name="eye" size={14} stroke="currentColor" /></button>
              <button className="pya-copy" style={{ padding: 4 }} title={tr("Ocultar / no aplica", "Hide / not applicable")} onClick={(ev) => { ev.stopPropagation(); if (focus === iv.id) setFocus(null); onHideInv(iv.id); }}><Icon name="x" size={14} stroke="currentColor" /></button>
            </div>
          ))}
        </div>
        <div className="pya-manual-preview">
          {inv ? (
            <React.Fragment>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--ink)", lineHeight: 1.15 }}>{inv.emisor}</div>
                <span className="pya-num" style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap" }}>{money(inv.total)}</span>
              </div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 10.5, color: "var(--fg-muted)", margin: "3px 0 8px" }}>NIT {inv.nit} · {P.prettyDay(inv.day, lang)} · <button className="pya-copy" style={{ display: "inline-flex", padding: 0, border: "none", background: "none" }} onClick={() => onView(inv)}><Icon name="eye" size={12} stroke="currentColor" />{tr("Factura completa", "Full invoice")}</button></div>
              <div className="pya-mmode" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                <button className={"pya-mmode-btn" + (target === "gastos" ? " on" : "")} onClick={() => { setTarget("gastos"); setPick(null); }}>{tr("Gastos e inversiones", "Expenses")}</button>
                <button className={"pya-mmode-btn" + (target === "conta" ? " on" : "")} onClick={() => { setTarget("conta"); setPick(null); }}>{tr("Contabilidad", "Accounting")}</button>
                <button className={"pya-mmode-btn" + (target === "dep" ? " on" : "")} onClick={() => { setTarget("dep"); setPick(null); }}>{tr("Depósitos", "Deposits")}</button>
              </div>
              {cands.length === 0
                ? <div className="pya-empty" style={{ padding: "16px 10px" }}>{target === "gastos" ? tr("Ningún gasto de insumos con fecha compatible (la factura debe ser del día del gasto o hasta 2 después) y monto suficiente.", "No compatible supply expense.") : target === "dep" ? tr("Ningún depósito con monto similar (se evalúa en quetzales y en dólares × tipo de cambio).", "No deposit with a similar amount.") : tr("Ningún movimiento Debe (GTQ, sin factura) con fecha y monto similares. Revisa que el mes esté cargado en Contabilidad.", "No similar accounting line.")}</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                    {cands.map(c => { const ex = Math.abs(c.amount - inv.total) <= 0.06; return (
                      <div key={c.key} className={"pya-manual-inv" + (pick === c.key ? " on pv" : "")} onClick={() => setPick(pick === c.key ? null : c.key)}>
                        <PyaCheck on={pick === c.key} onClick={() => setPick(pick === c.key ? null : c.key)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</div>
                          <div style={{ fontFamily: "var(--sans)", fontSize: 10, color: "var(--fg-muted)", marginTop: 2 }}>{P.prettyDay(c.day, lang)}{c.sub ? " · " + c.sub : ""}</div>
                        </div>
                        <span className="pya-num" style={{ fontWeight: 600, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 5, color: ex ? "#3d6b52" : "var(--ink)" }}>{ex && <Icon name="check" size={13} stroke="#3d6b52" />}{money(c.amount)}</span>
                      </div>
                    ); })}
                  </div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 10 }}>
                <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: exact ? "#3d6b52" : "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {picked ? (exact ? <React.Fragment><Icon name="check" size={14} stroke="#3d6b52" />{tr("Cuadra exacto", "Exact match")}</React.Fragment> : tr("Diferencia", "Difference") + " " + money(Math.round(Math.abs(picked.amount - inv.total) * 100) / 100)) : tr("Elige el destino", "Pick the destination")}
                </span>
                <button className="pya-btn pya-btn-dark" onClick={confirm} disabled={!picked || busy === "mlink"}>
                  {busy === "mlink" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.4)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="check" size={15} stroke="var(--alabaster)" />}
                  {tr("Conciliar", "Conciliate")}
                </button>
              </div>
            </React.Fragment>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 160, textAlign: "center", color: "var(--fg-muted)", gap: 8 }}>
              <Icon name="file" size={22} stroke="var(--warm-grey)" />
              <span style={{ fontFamily: "var(--sans)", fontSize: 11.5 }}>{tr("Toca una factura para empezar", "Tap an invoice to start")}</span>
            </div>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

// ============================================================
// 1b) Conciliación de facturas sobrantes contra CONTABILIDAD
//     (columna "Debe" de los estados de cuenta). Empareja por
//     fecha (±2 días) + monto exacto y escribe el nº de autorización
//     en la fila del movimiento (columna "factura" del Sheet).
// ============================================================
function PyaContaRecon({ lang, invoices, pendingExps, onLinked, onView }) {
  const P = window.PedidosYa;
  const es = lang !== "en"; const tr = (a, b) => es ? a : b;
  const money = P.money;
  const [busy, setBusy] = pyUseState(false);
  const [msg, setMsg] = pyUseState("");
  const [applied, setApplied] = pyUseState(() => new Set());
  const dDiff = (a, b) => { if (!a || !b) return 99; return Math.abs(Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000)); };

  const matches = pyUseMemo(() => {
    if (!window.SpacioContaStore) return [];
    const inv = invoices.filter(i => !applied.has(i.id));
    const yms = [...new Set(inv.map(i => (i.day || "").slice(0, 7)))].filter(Boolean);
    // filas Debe (GTQ) sin factura de los meses de las facturas ± mes vecino
    const rows = [];
    const seenYm = {};
    yms.forEach(ym => {
      [ym].concat([-1, 1].map(d => { const [y, m] = ym.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); return t.getUTCFullYear() + "-" + ("0" + (t.getUTCMonth() + 1)).slice(-2); })).forEach(k => {
        if (seenYm[k]) return; seenYm[k] = 1;
        (window.SpacioContaStore.statementsForMonth(k) || []).forEach(s => {
          if (s.currency !== "GTQ") return;
          (s.rows || []).forEach((r, idx) => { if (r.debit > 0 && !r.factura) rows.push({ ym: s.ym, accId: s.accId, idx, r }); });
        });
      });
    });
    const used = {};
    const out = [];
    inv.forEach(i => {
      // el movimiento (gasto) va antes: factura del mismo día o hasta 2 después
      const dAfterC = (later, base) => Math.round((new Date(later + "T00:00:00Z") - new Date(base + "T00:00:00Z")) / 86400000);
      const c = rows.filter(x => { if (used[x.ym + "|" + x.accId + "|" + x.idx]) return false; const d = dAfterC(i.day, x.r.date); return d >= 0 && d <= 2 && Math.abs(x.r.debit - i.total) <= 0.06; })
        .sort((a, b) => dDiff(a.r.date, i.day) - dDiff(b.r.date, i.day));
      if (c.length) { const hit = c[0]; used[hit.ym + "|" + hit.accId + "|" + hit.idx] = 1; out.push({ inv: i, hit }); }
    });
    return out;
  }, [invoices, applied]);

  const linkAll = () => {
    if (!matches.length) return;
    setBusy(true); setMsg("");
    let ok = 0;
    const ids = [];
    // agrupa por statement para guardar una sola vez cada uno
    const byStmt = {};
    matches.forEach(m => { const k = m.hit.ym + "|" + m.hit.accId; (byStmt[k] = byStmt[k] || []).push(m); });
    Object.keys(byStmt).forEach(k => {
      const [ym, accId] = k.split("|");
      const stmt = window.SpacioContaStore.getStatement(ym, accId);
      if (!stmt) return;
      byStmt[k].forEach(m => {
        const row = stmt.rows[m.hit.idx];
        if (row && Math.abs((row.debit || 0) - m.hit.r.debit) < 0.01) { row.factura = m.inv.auth; ok++; ids.push(m.inv.id); }
      });
      window.SpacioContaStore.saveStatement(stmt);
    });
    setApplied(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
    onLinked && onLinked(ids);
    setMsg(tr("Listo · " + ok + " factura(s) vinculadas a movimientos de contabilidad. Se ven en la columna Factura de Estados de cuenta.", "Done · " + ok + " invoice(s) linked to accounting lines."));
    setBusy(false);
  };

  const accName = (id) => { const a = window.SpacioConta && window.SpacioConta.accountById(id); return a ? a.name : id; };

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 6 }}>{tr("Facturas sobrantes · conciliar con contabilidad", "Leftover invoices · reconcile with accounting")}</div>
      <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, lineHeight: 1.5, letterSpacing: "0.02em", color: "var(--fg-muted)", margin: "0 0 12px", maxWidth: 560, textWrap: "pretty" }}>
        {pendingExps > 0
          ? tr("Aún quedan " + pendingExps + " gasto(s) de insumos sin conciliar — esos tienen prioridad. Las facturas que sobren al final se emparejan aquí contra la columna Debe de los estados de cuenta.", pendingExps + " supply expense(s) still pending — those come first.")
          : tr("Todos los insumos están conciliados. Estas facturas se emparejan contra la columna Debe de los estados de cuenta (±2 días, monto exacto).", "All supplies reconciled. These invoices pair against the Debit column of the bank statements.")}
      </p>
      {matches.length === 0
        ? <div className="pya-empty" style={{ padding: "16px 12px" }}>{tr("Ningún movimiento de contabilidad coincide todavía (Debe · GTQ · ±2 días · monto exacto). Revisa que el mes esté cargado en Contabilidad.", "No accounting line matches yet.")}</div>
        : (
          <React.Fragment>
            <div className="pya-saved">
              {matches.map((m, i) => (
                <div className="pya-saved-row" key={i}>
                  <div className="pya-saved-main">
                    <div className="pya-saved-top">
                      <span className="pya-saved-prop">{m.inv.emisor}</span>
                      <span className="pya-saved-amt pya-num">{money(m.inv.total)}</span>
                    </div>
                    <div className="pya-saved-meta">
                      <span>{P.prettyDay(m.inv.day, lang)}</span>
                      <span className="pya-saved-chip">{accName(m.hit.accId)} · {m.hit.r.date} · {tr("Debe", "Debit")} {money(m.hit.r.debit)}</span>
                      {m.hit.r.desc ? <span className="pya-saved-chip" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.hit.r.desc}</span> : null}
                    </div>
                  </div>
                  <div className="pya-saved-actions">
                    <button className="pya-icbtn" title={tr("Ver factura", "View invoice")} onClick={() => onView(m.inv)}><Icon name="eye" size={15} stroke="var(--ink)" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pya-footer">
              <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: msg ? "var(--ink)" : "var(--fg-muted)", maxWidth: 460, lineHeight: 1.5 }}>
                {msg || tr("Al vincular, el movimiento gana el link “Ver factura” en Estados de cuenta.", "Linking adds a “View invoice” link on the statement line.")}
              </span>
              <button className="pya-btn pya-btn-dark" onClick={linkAll} disabled={!matches.length || busy}>
                <Icon name="check" size={15} stroke="var(--alabaster)" />
                {tr("Vincular con contabilidad", "Link to accounting")} · {matches.length}
              </button>
            </div>
          </React.Fragment>
        )}
    </div>
  );
}

//    Sube todas las constancias; se extrae nombre + monto + fecha del PDF.
//    El emparejamiento nombre→apartamento se RECUERDA (localStorage) mes a mes.
//    Nombres con varias constancias en el lote = siempre manual (socios con
//    varias propiedades y la misma razón social).
// ============================================================
const PYA_RET_MAP_KEY = "sa-pya-ret-map";   // { NOMBRE: property_name }
const PYA_RET_DONE_KEY = "sa-pya-ret-done"; // constancias ya guardadas
function pyaRetMap() { try { return JSON.parse(localStorage.getItem(PYA_RET_MAP_KEY)) || {}; } catch (e) { return {}; } }
function pyaRetDone() { try { return new Set(JSON.parse(localStorage.getItem(PYA_RET_DONE_KEY)) || []); } catch (e) { return new Set(); } }

async function pyaParseRetencion(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const tc = await page.getTextContent();
  const items = tc.items.map(x => String(x.str || "").trim()).filter(Boolean);
  const all = items.join(" | ");
  const out = { fileName: file.name, name: "", amount: 0, ym: "", constancia: "", nit: "" };
  // nombre: el texto en MAYÚSCULAS tras el encabezado "Nombre, razón..."
  const hi = items.findIndex(s => /raz[oó]n o denominaci[oó]n social/i.test(s));
  if (hi > -1) { for (let i = hi + 1; i < Math.min(hi + 6, items.length); i++) { const s = items[i]; if (/^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s,.'-]{5,}$/.test(s) && !/CONSTANCIA|AGENTE|RETENEDOR|SUSCRITO/i.test(s)) { out.name = s.replace(/\s+/g, " ").trim(); break; } if (/^\d{6,10}$/.test(s)) out.nit = s; } }
  if (!out.name) { const m = file.name.match(/^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s,.'-]+?)\s*\d/i); if (m) out.name = m[1].replace(/\s+/g, " ").trim().toUpperCase(); }
  // monto: el Q tras "TOTAL"
  const ti = all.search(/TOTAL/i);
  const tail = ti > -1 ? all.slice(ti) : all;
  const mm = tail.match(/Q?\s*([\d,]+\.\d{2})/);
  if (mm) out.amount = parseFloat(mm[1].replace(/,/g, "")) || 0;
  // fecha: tras "Año" vienen dd mm yyyy
  const ai = items.findIndex(s => /^A[ñn]o$/i.test(s));
  if (ai > -1) { const nums = items.slice(ai + 1, ai + 8).filter(s => /^\d{1,4}$/.test(s)); if (nums.length >= 3) { const y = nums.find(n => n.length === 4); const rest = nums.filter(n => n !== y); if (y && rest.length >= 2) out.ym = y + "-" + ("0" + rest[1]).slice(-2); } }
  if (!out.ym) { const dm = all.match(/(\d{2})\s*\|?\s*(\d{2})\s*\|?\s*(\d{4})/); if (dm) out.ym = dm[3] + "-" + dm[2]; }
  // número de constancia
  const ci = items.findIndex(s => /N[úu]mero de\s*Constancia/i.test(s.replace(/\s+/g, " ")) || /Constancia$/i.test(s));
  const cNum = (ci > -1 ? items.slice(ci, ci + 4) : items).find(s => /^\d{9,}$/.test(s));
  if (cNum) out.constancia = cNum;
  if (!out.constancia) { const fm = file.name.match(/(\d{9,})/); out.constancia = fm ? fm[1] : (file.name + "|" + out.amount); }
  return out;
}

function PyaRetencionesPanel({ lang, propOptions }) {
  const es = lang !== "en"; const tr = (a, b) => es ? a : b;
  const money = (v) => "Q " + (Math.round((v || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [rows, setRows] = pyUseState([]);
  const [busy, setBusy] = pyUseState("");
  const [drag, setDrag] = pyUseState(false);
  const [msg, setMsg] = pyUseState("");

  const onFiles = async (files) => {
    const pdfs = [...files].filter(f => /\.pdf$/i.test(f.name || ""));
    if (!pdfs.length) return;
    setBusy("read"); setMsg("");
    const map = pyaRetMap(), done = pyaRetDone();
    const parsed = [];
    for (const f of pdfs) { try { const r = await pyaParseRetencion(f); r.file = f; parsed.push(r); } catch (e) {} }
    // nombres repetidos en el lote → siempre manual
    const counts = {};
    parsed.forEach(r => { counts[r.name] = (counts[r.name] || 0) + 1; });
    setRows(prev => {
      const seen = new Set(prev.map(x => x.constancia));
      const add = parsed.filter(r => !seen.has(r.constancia)).map((r, i) => ({
        id: "r" + Date.now() + "-" + i, file: r.file, fileName: r.fileName, name: r.name, amount: r.amount, ym: r.ym, constancia: r.constancia,
        dup: counts[r.name] > 1, saved: done.has(r.constancia),
        prop: (counts[r.name] > 1 ? "" : (map[r.name] || "")),
      }));
      return prev.concat(add);
    });
    setBusy("");
  };

  const setProp = (id, v) => setRows(prev => prev.map(r => r.id === id ? Object.assign({}, r, { prop: v }) : r));
  const ready = rows.filter(r => !r.saved && r.prop && r.ym);
  const save = async () => {
    if (!ready.length || !window.SpacioFiles) return;
    setBusy("save"); setMsg("");
    let ok = 0, fail = 0;
    const map = pyaRetMap(), done = pyaRetDone();
    for (const r of ready) {
      try {
        const rec = await window.SpacioFiles.upload({ kind: "retencion", scope: "property", property_name: r.prop, ym: r.ym, file: r.file, multiple: true, monto: r.amount });
        if (rec && !rec.failed) { ok++; done.add(r.constancia); if (!r.dup) map[r.name] = r.prop; setRows(prev => prev.map(x => x.id === r.id ? Object.assign({}, x, { saved: true }) : x)); }
        else fail++;
      } catch (e) { fail++; }
    }
    localStorage.setItem(PYA_RET_MAP_KEY, JSON.stringify(map));
    localStorage.setItem(PYA_RET_DONE_KEY, JSON.stringify([...done]));
    setMsg(tr("Listo · " + ok + " retención(es) guardadas en Drive" + (fail ? " · " + fail + " fallaron" : "") + ". El emparejamiento queda recordado para los próximos meses.", "Done · " + ok + " withholding(s) saved" + (fail ? " · " + fail + " failed" : "") + "."));
    setBusy("");
  };

  return (
    <div style={{ marginTop: 30, paddingTop: 22, borderTop: "1px solid var(--ink-08)" }}>
      <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 6 }}>{tr("Retenciones ISR · constancias SAT-1911", "ISR withholdings · SAT-1911")}</div>
      <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, lineHeight: 1.5, letterSpacing: "0.02em", color: "var(--fg-muted)", margin: "0 0 12px", maxWidth: 560, textWrap: "pretty" }}>
        {tr("Sube todas las constancias en PDF. Se lee el nombre del contribuyente y el emparejamiento con su apartamento se recuerda mes a mes. Los nombres con varias constancias (socios con varias propiedades) se emparejan a mano — te ayuda el monto.", "Upload all the PDF certificates. The taxpayer name is read and its apartment pairing is remembered month to month.")}
      </p>
      <label className={"pya-drop" + (drag ? " drag" : "")}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}>
        <input type="file" accept=".pdf" multiple onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
        <span className="pya-drop-ic"><Icon name="file" size={20} stroke="var(--ink)" /></span>
        <span>
          <span className="pya-drop-lbl">{tr("Constancias de retención (PDF)", "Withholding certificates (PDF)")}</span>
          <span className="pya-drop-hint">{tr("Puedes soltar varias a la vez. Nada se duplica.", "Drop several at once. Nothing is duplicated.")}</span>
          {busy === "read" && <span className="pya-drop-done">{tr("Leyendo PDFs…", "Reading PDFs…")}</span>}
        </span>
      </label>
      {rows.length > 0 && (
        <React.Fragment>
          <div className="pya-saved" style={{ marginTop: 14 }}>
            {rows.map(r => (
              <div className="pya-saved-row" key={r.id} style={r.saved ? { opacity: 0.55 } : null}>
                <div className="pya-saved-main">
                  <div className="pya-saved-top">
                    <span className="pya-saved-prop">{r.name || tr("(nombre no legible)", "(unreadable name)")}</span>
                    <span className="pya-saved-amt pya-num">{money(r.amount)}</span>
                  </div>
                  <div className="pya-saved-meta">
                    <span>{r.ym || tr("(sin fecha)", "(no date)")}</span>
                    <span className="pya-saved-chip">{tr("Constancia", "Cert.")} {r.constancia}</span>
                    {r.dup && !r.saved && <span className="pya-saved-chip" style={{ background: "var(--peach-tint, #fdeee9)", color: "var(--peach-text, #B54D36)" }}>{tr("Varias con este nombre · empareja a mano", "Several with this name · pair manually")}</span>}
                    {r.saved && <span className="pya-saved-chip" style={{ color: "#3d6b52" }}>{tr("Guardada", "Saved")}</span>}
                  </div>
                </div>
                {!r.saved && (
                  <div className="pya-saved-actions" style={{ minWidth: 210 }}>
                    <select className="pya-select" value={r.prop} onChange={e => setProp(r.id, e.target.value)}>
                      <option value="">{tr("Apartamento…", "Apartment…")}</option>
                      {propOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="pya-footer">
            <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: msg ? "var(--ink)" : "var(--fg-muted)", maxWidth: 460, lineHeight: 1.5 }}>
              {msg || tr("Se guardan en Drive → Constancias de retención → carpeta del apartamento.", "Saved to Drive → Withholding certificates → apartment folder.")}
            </span>
            <button className="pya-btn pya-btn-dark" onClick={save} disabled={!ready.length || busy === "save"}>
              {busy === "save" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.4)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="check" size={15} stroke="var(--alabaster)" />}
              {tr("Guardar retenciones", "Save withholdings")}{ready.length ? " · " + ready.length : ""}
            </button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function PyaManagePanel({ lang, propOptions, active }) {
  const P = window.PedidosYa;
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const [rows, setRows] = pyUseState(null);
  const [busy, setBusy] = pyUseState("");
  const [msg, setMsg] = pyUseState("");
  const [editId, setEditId] = pyUseState(null);
  const [draft, setDraft] = pyUseState({});
  const [box, setBox] = pyUseState(null);
  const [q, setQ] = pyUseState("");

  const catOptions = [
    { value: "insumos & gastos", label: tr("insumos & gastos", "supplies & expenses") },
    { value: "Mantenimiento e inversión", label: tr("Mantenimiento e inversión", "Maintenance & investment") },
    { value: "Reparaciones o inversión", label: tr("Reparaciones o inversión", "Repairs or investment") },
  ];
  const tagOptions = [
    { value: "", label: tr("— sin tag", "— no tag") },
    { value: "Compras ajenas a insumos", label: tr("Compras ajenas a insumos", "Non-supply purchase") },
    { value: "Restaurante / comida", label: tr("Restaurante / comida", "Restaurant / food") },
    { value: "Gasto Spacio AM", label: tr("Gasto Spacio AM", "Spacio AM expense") },
  ];

  const load = pyUseCallback(() => {
    const sid = window.SPACIO_SHEET_ID; if (!sid) { setRows([]); return; }
    setBusy("load"); setMsg("");
    const url = "https://docs.google.com/spreadsheets/d/" + sid + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent("insumos & gastos") + "&_=" + Date.now();
    fetch(url).then(r => r.text()).then(txt => {
      const parsed = pyaParseCSV(txt);
      if (!parsed.length) { setRows([]); setBusy(""); return; }
      const head = parsed[0].map(h => h.trim().toLowerCase());
      const col = (name) => head.indexOf(name);
      const ci = { mes: col("mes"), fecha: col("fecha de pedido"), prop: col("property_name"), valor: col("valor"), cat: col("categoria"), com: col("comentario"), tag: col("tag"), oid: col("orderid"), url: col("orderurl"), ap: col("authproductos"), at: col("authtarifa") };
      const out = [];
      for (let i = 1; i < parsed.length; i++) {
        const r = parsed[i]; const g = (c) => (c > -1 ? (r[c] || "").trim() : "");
        const oid = g(ci.oid); if (!oid && !g(ci.prop)) continue;
        out.push({ orderId: oid, mes: g(ci.mes), fecha: g(ci.fecha), property_name: g(ci.prop), valor: g(ci.valor), categoria: g(ci.cat), comentario: g(ci.com), tag: g(ci.tag), orderUrl: g(ci.url), authProductos: g(ci.ap), authTarifa: g(ci.at) });
      }
      out.reverse(); // más recientes primero
      setRows(out); setBusy("");
    }).catch(() => { setRows([]); setBusy(""); setMsg(tr("No se pudo leer la hoja.", "Could not read the sheet.")); });
  }, []);

  pyUseEffect(() => { if (active && rows === null) load(); }, [active]);

  const startEdit = (r) => { setEditId(r.orderId || r.fecha + r.property_name); setDraft(Object.assign({}, r)); };
  const cancelEdit = () => { setEditId(null); setDraft({}); };
  const saveEdit = async () => {
    if (!window.SpacioWrite || !window.SpacioWrite.enabled()) { setMsg(tr("Conecta el backend (Setup → Conexión de escritura) para editar.", "Connect the backend (Setup → Write connection) to edit.")); return; }
    if (!draft.orderId) { setMsg(tr("Esta fila no tiene orderId; no se puede editar de forma segura.", "This row has no orderId; can't edit safely.")); return; }
    setBusy("save");
    const res = await window.SpacioWrite.post("updateInsumo", { orderId: draft.orderId, property_name: draft.property_name, valor: P.numQ(draft.valor), categoria: draft.categoria, Comentario: draft.comentario, tag: draft.tag, orderUrl: draft.orderUrl });
    setBusy("");
    if (res && res.ok) { setRows(rs => rs.map(x => x.orderId === draft.orderId ? Object.assign({}, x, draft) : x)); cancelEdit(); setMsg(tr("Cambios guardados.", "Changes saved.")); }
    else setMsg(tr("No se pudo guardar: " + ((res && res.error) || "sin conexión"), "Could not save: " + ((res && res.error) || "offline")));
  };
  const del = async (r) => {
    if (!window.SpacioWrite || !window.SpacioWrite.enabled()) { setMsg(tr("Conecta el backend para eliminar.", "Connect the backend to delete.")); return; }
    if (!r.orderId) { setMsg(tr("Esta fila no tiene orderId; elimínala manualmente en la hoja.", "This row has no orderId; delete it manually in the sheet.")); return; }
    if (!window.confirm(tr("¿Eliminar este gasto de la hoja? No se puede deshacer.", "Delete this expense from the sheet? This can't be undone."))) return;
    setBusy("del-" + r.orderId);
    const res = await window.SpacioWrite.post("deleteInsumo", { orderId: r.orderId });
    setBusy("");
    if (res && res.ok) { setRows(rs => rs.filter(x => x.orderId !== r.orderId)); setMsg(tr("Gasto eliminado.", "Expense deleted.")); }
    else setMsg(tr("No se pudo eliminar: " + ((res && res.error) || "sin conexión"), "Could not delete: " + ((res && res.error) || "offline")));
  };
  const ymOfRow = (r) => {
    const s = (r.fecha || "").trim();
    let m = s.match(/(\d{4})-(\d{1,2})/); if (m) return m[1] + "-" + String(+m[2]).padStart(2, "0");
    m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); if (m) return m[3] + "-" + String(+m[2]).padStart(2, "0");
    return "";
  };
  const uploadFactura = async (r, file) => {
    if (!window.SpacioFiles) return;
    setBusy("up-" + r.orderId);
    await window.SpacioFiles.upload({ kind: "soporte", scope: "property", property_name: r.property_name, ym: ymOfRow(r) || (r.mes || ""), file, orderId: r.orderId || "", multiple: true });
    setBusy(""); setMsg(tr("Factura adjuntada al gasto. El socio ya puede verla en Gastos e inversiones.", "Invoice attached to the expense. The owner can now see it under Expenses."));
  };

  const visible = (rows || []).filter(r => {
    const s = q.trim().toLowerCase(); if (!s) return true;
    return [r.property_name, r.fecha, r.valor, r.categoria, r.tag, r.comentario].filter(Boolean).join(" ").toLowerCase().indexOf(s) > -1;
  });

  // limpieza one-shot: quita el sufijo "· (aplicado a N)" de comentarios ya guardados
  const APLICADO_RE = /\s*[·\-–—]?\s*\(aplicado a \d+\)\s*$/i;
  const dirty = (rows || []).filter(r => r.orderId && APLICADO_RE.test(r.comentario || ""));
  const cleanAplicado = async () => {
    if (!window.SpacioWrite || !window.SpacioWrite.enabled()) { setMsg(tr("Conecta el backend (Setup → Conexión de escritura) para limpiar los comentarios.", "Connect the backend (Setup → Write connection) to clean the comments.")); return; }
    if (!window.confirm(tr("¿Quitar “(aplicado a N)” de " + dirty.length + " comentarios guardados? No se puede deshacer.", "Remove “(applied to N)” from " + dirty.length + " saved comments? This can't be undone."))) return;
    setBusy("clean");
    let n = 0;
    for (const r of dirty) {
      const clean = (r.comentario || "").replace(APLICADO_RE, "").trim();
      const res = await window.SpacioWrite.post("updateInsumo", { orderId: r.orderId, Comentario: clean });
      if (res && res.ok) { n++; setRows(rs => rs.map(x => x.orderId === r.orderId ? Object.assign({}, x, { comentario: clean }) : x)); }
    }
    setBusy(""); setMsg(tr(n + " comentario(s) limpiado(s) en la hoja.", n + " comment(s) cleaned in the sheet."));
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={15} stroke="var(--fg-muted)" /></span>
          <input className="pya-input" style={{ paddingLeft: 36 }} value={q} onChange={e => setQ(e.target.value)} placeholder={tr("Buscar propiedad, fecha, monto…", "Search property, date, amount…")} />
        </div>
        <button className="pya-btn pya-btn-ghost" onClick={load} disabled={busy === "load"}>
          {busy === "load" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid var(--warm-grey)", borderTopColor: "var(--ink)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="arrowUpRight" size={14} stroke="var(--fg-muted)" />}
          {tr("Actualizar", "Refresh")}
        </button>
        {dirty.length > 0 && (
          <button className="pya-btn pya-btn-ghost" onClick={cleanAplicado} disabled={busy === "clean"} title={tr("Quita el sufijo “(aplicado a N)” del comentario de los gastos ya guardados", "Removes the “(applied to N)” suffix from saved expense comments")}>
            {busy === "clean" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid var(--warm-grey)", borderTopColor: "var(--ink)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="pencil" size={14} stroke="var(--fg-muted)" />}
            {tr("Limpiar “(aplicado a…)” · " + dirty.length, "Clean “(applied to…)” · " + dirty.length)}
          </button>
        )}
      </div>

      {rows === null
        ? <div className="pya-empty">{tr("Cargando gastos guardados…", "Loading saved expenses…")}</div>
        : visible.length === 0
        ? <div className="pya-empty">{q ? tr("Sin resultados.", "No results.") : tr("Aún no hay gastos guardados en la hoja.", "No saved expenses in the sheet yet.")}</div>
        : (
          <div className="pya-saved">
            {visible.map((r, i) => {
              const id = r.orderId || (r.fecha + r.property_name);
              const editing = editId === id;
              return (
                <div className={"pya-saved-row" + (editing ? " editing" : "")} key={id + i}>
                  {editing ? (
                    <div className="pya-saved-edit">
                      <div className="pya-saved-edit-grid">
                        <div className="pya-field"><label>{tr("Propiedad", "Property")}</label><PyaMini value={draft.property_name} options={propOptions} onChange={v => setDraft(d => Object.assign({}, d, { property_name: v }))} search /></div>
                        <div className="pya-field"><label>{tr("Monto (GTQ)", "Amount (GTQ)")}</label><input className="pya-input" value={draft.valor} onChange={e => setDraft(d => Object.assign({}, d, { valor: e.target.value }))} inputMode="decimal" /></div>
                        <div className="pya-field"><label>{tr("Categoría", "Category")}</label><PyaMini value={draft.categoria} options={catOptions} onChange={v => setDraft(d => Object.assign({}, d, { categoria: v }))} /></div>
                        <div className="pya-field"><label>Tag</label><PyaMini value={draft.tag} options={tagOptions} onChange={v => setDraft(d => Object.assign({}, d, { tag: v }))} /></div>
                      </div>
                      <div className="pya-field"><label>{tr("Comentario", "Comment")}</label><input className="pya-input" value={draft.comentario} onChange={e => setDraft(d => Object.assign({}, d, { comentario: e.target.value }))} /></div>
                      <div className="pya-field"><label>{tr("URL del pedido", "Order URL")}</label><input className="pya-input" value={draft.orderUrl} onChange={e => setDraft(d => Object.assign({}, d, { orderUrl: e.target.value }))} placeholder="https://…" /></div>
                      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                        <button className="pya-btn pya-btn-dark" onClick={saveEdit} disabled={busy === "save"}>{busy === "save" ? "…" : <React.Fragment><Icon name="check" size={14} stroke="var(--alabaster)" />{tr("Guardar", "Save")}</React.Fragment>}</button>
                        <button className="pya-btn pya-btn-ghost" onClick={cancelEdit}>{tr("Cancelar", "Cancel")}</button>
                      </div>
                    </div>
                  ) : (
                    <React.Fragment>
                      <div className="pya-saved-main">
                        <div className="pya-saved-top">
                          <span className="pya-saved-prop">{r.property_name || tr("(sin propiedad)", "(no property)")}</span>
                          <span className="pya-saved-amt">{r.valor ? "Q " + r.valor : ""}</span>
                        </div>
                        <div className="pya-saved-meta">
                          <span>{r.fecha || r.mes}</span>
                          {r.categoria && <span className="pya-saved-chip">{r.categoria}</span>}
                          {r.tag && <span className="pya-saved-chip warn">{r.tag}</span>}
                        </div>
                        {r.comentario && <div className="pya-saved-com">{r.comentario}</div>}
                      </div>
                      <div className="pya-saved-actions">
                        {(r.authProductos || r.authTarifa || r.orderUrl) && (
                          <button className="pya-icbtn" title={tr("Ver factura", "View invoice")} onClick={() => setBox({ orderUrl: r.orderUrl, vendor: r.property_name, desc: r.comentario, day: ymOfRow(r), invoices: [r.authProductos && { kind: "productos", auth: r.authProductos }, r.authTarifa && { kind: "tarifa", auth: r.authTarifa }].filter(Boolean) })}><Icon name="eye" size={15} stroke="var(--ink)" /></button>
                        )}
                        <label className="pya-icbtn" title={tr("Subir factura", "Upload invoice")} style={{ cursor: "pointer" }}>
                          {busy === "up-" + r.orderId ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid var(--warm-grey)", borderTopColor: "var(--ink)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="upload" size={15} stroke="var(--ink)" />}
                          <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) uploadFactura(r, f); e.target.value = ""; }} />
                        </label>
                        <button className="pya-icbtn" title={tr("Editar", "Edit")} onClick={() => startEdit(r)}><Icon name="pencil" size={15} stroke="var(--ink)" /></button>
                        <button className="pya-icbtn danger" title={tr("Eliminar", "Delete")} onClick={() => del(r)} disabled={busy === "del-" + r.orderId}><Icon name="trash" size={15} stroke="var(--peach)" /></button>
                      </div>
                    </React.Fragment>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {msg && <div style={{ marginTop: 14, fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.03em", color: "var(--ink)" }}>{msg}</div>}
      {box && <InvoiceViewBox data={box} lang={lang} onClose={() => setBox(null)} />}
    </div>
  );
}

// ==================================================
// 5) Panel Reportes de mantenimiento (importación + validación)
// ==================================================
function ReporteDetalleBox({ rep, lang, onClose }) {
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  if (!rep) return null;
  const Field = ({ label, children }) => (
    <div style={{ background: "var(--beige-soft)", borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ fontFamily: "var(--sans)", fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.35 }}>{children}</div>
    </div>
  );
  const fotos = (rep.fotoDespues || []).concat(rep.fotoAntes || []);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(62,63,63,0.4)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--alabaster)", borderRadius: 24, maxWidth: 560, width: "100%", maxHeight: "86vh", overflow: "auto", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "22px 24px 16px", borderBottom: "1px solid var(--warm-grey)", position: "sticky", top: 0, background: "var(--alabaster)", zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{tr("Detalle del trabajo", "Job detail")}</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 21, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>{rep.propiedadRaw || rep.property_name}</div>
          </div>
          <button onClick={onClose} className="sa-file-btn" style={{ padding: "8px 16px", fontSize: 11, background: "var(--ink)", color: "var(--alabaster)", border: "none" }}>{tr("Cerrar", "Close")}</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 10 }}>{tr("Resumen ejecutivo", "Executive summary")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label={tr("Técnico", "Technician")}>{rep.tecnico || "—"}</Field>
              <Field label={tr("Fecha", "Date")}>{rep.fecha || "—"}</Field>
              <Field label="Total">{"Q" + Number(rep.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Field>
              <Field label={tr("Pago", "Payment")}>{rep.pagado ? "✓ " + tr("Pagado", "Paid") : tr("Pendiente", "Pending")}{rep.pagadoPor ? " · " + rep.pagadoPor : ""}</Field>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 8 }}>{tr("Categoría", "Category")}</div>
            <span style={{ display: "inline-block", padding: "6px 14px", borderRadius: 999, background: "var(--peach-12)", color: "var(--ink)", fontFamily: "var(--sans)", fontSize: 12, fontWeight: 600 }}>{rep.categoria || "Mantenimiento"}</span>
          </div>
          <div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 8 }}>{tr("Trabajo realizado", "Work performed")}</div>
            <div style={{ background: "var(--beige-soft)", borderRadius: 14, padding: "14px 16px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink)", whiteSpace: "pre-wrap", textWrap: "pretty" }}>{rep.descripcion || "—"}</div>
            {rep.comentarios && <div style={{ marginTop: 8, fontFamily: "var(--sans)", fontSize: 12, lineHeight: 1.6, color: "var(--fg-muted)" }}>{rep.comentarios}</div>}
          </div>
          {fotos.length > 0 && (
            <div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--attention-text)", marginBottom: 10 }}>{tr("Fotos", "Photos")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
                {fotos.slice(0, 12).map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" style={{ display: "block", aspectRatio: "4/3", borderRadius: 12, overflow: "hidden", border: "1px solid var(--warm-grey)" }}>
                    <img src={u} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </a>
                ))}
              </div>
            </div>
          )}
          {rep.factura && (
            <div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 8 }}>{tr("Factura adjunta", "Attached invoice")}</div>
              {/^https?:/.test(rep.factura)
                ? <a className="sa-file-btn ghost" href={rep.factura} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{tr("Ver factura", "View invoice")}</a>
                : <span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)" }}>{rep.factura}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PyaReportesPanel({ lang, propOptions, addImported, active }) {
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const R = window.SpacioReportes;
  const [reps, setReps] = pyUseState([]);
  const [busy, setBusy] = pyUseState("");
  const [msg, setMsg] = pyUseState("");
  const [box, setBox] = pyUseState(null);
  const [tick, setTick] = pyUseState(0);
  const [props, setProps] = pyUseState({}); // override manual de propiedad por id

  const run = async (manual) => {
    if (!R) return;
    setBusy("sync"); setMsg("");
    try {
      const all = await R.sync();
      setReps(all);
      setMsg(tr("Sincronizado · " + all.length + " reporte(s) de mantenimiento desde el 1 de julio 2026.", "Synced · " + all.length + " maintenance report(s) since July 1, 2026."));
    } catch (e) {
      setMsg(tr("No se pudo leer la hoja de reportes: " + (e && e.message ? e.message : "error") + ". Verifica que esté compartida como “cualquiera con el enlace”.", "Could not read the reports sheet: " + (e && e.message ? e.message : "error") + ". Make sure it is shared as “anyone with the link”."));
    }
    setBusy("");
  };

  // carga inicial la primera vez; después, rutina semanal automática
  pyUseEffect(() => { if (active && R && R.needsSync()) run(false); }, [active]);

  const pending = R ? R.pending(reps) : [];
  const propOf = (r) => (props[r.id] !== undefined ? props[r.id] : r.property_name);
  const ready = pending.filter(r => propOf(r) && r.total > 0);

  const keep = async (r) => {
    const name = propOf(r);
    if (!name) { setMsg(tr("Asigna una propiedad antes de conservar el gasto.", "Assign a property before keeping the expense.")); return; }
    setBusy("k-" + r.id); setMsg("");
    const row = R.sheetRow(Object.assign({}, r, { property_name: name }));
    if (window.SpacioWrite && window.SpacioWrite.enabled()) {
      const res = await window.SpacioWrite.post("appendInsumos", { rows: [row] });
      if (!(res && res.ok)) { setMsg(tr("No se pudo guardar: " + ((res && res.error) || "sin conexión") + ".", "Could not save: " + ((res && res.error) || "offline") + ".")); setBusy(""); return; }
      if (addImported) addImported([row.orderId]);
    }
    R.decide(r.id, "ok"); setBusy(""); setTick(t => t + 1);
    setMsg(tr("Gasto conservado y agregado a " + name + ".", "Expense kept and added to " + name + "."));
  };
  const drop = (r) => {
    if (!window.confirm(tr("¿Eliminar este reporte? No se agregará como gasto.", "Delete this report? It will not be added as an expense."))) return;
    R.decide(r.id, "no"); setTick(t => t + 1);
  };
  const keepAll = async () => {
    for (const r of ready) { await keep(r); }
  };

  if (!R) return <p className="pya-note">{tr("Módulo de reportes no disponible.", "Reports module unavailable.")}</p>;
  const last = R.lastSync();

  return (
    <div>
      <p className="pya-note" style={{ marginTop: 0 }}>
        {tr("Se importan automáticamente los reportes de categoría Mantenimiento desde el 1 de julio 2026. La sincronización es semanal; valida cada gasto para conservarlo o eliminarlo.",
          "Maintenance reports since July 1, 2026 are imported automatically. Sync runs weekly; validate each expense to keep or delete it.")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "14px 0 18px" }}>
        <button className="sa-file-btn" onClick={() => run(true)} disabled={busy === "sync"} style={{ fontSize: 12 }}>
          {busy === "sync" ? tr("Sincronizando…", "Syncing…") : tr("Sincronizar ahora", "Sync now")}
        </button>
        {ready.length > 1 && (
          <button className="sa-file-btn ghost" onClick={keepAll} disabled={!!busy} style={{ fontSize: 12 }}>
            {tr("Conservar los " + ready.length + " listos", "Keep all " + ready.length + " ready")}
          </button>
        )}
        <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
          {last ? tr("Última sincronización: ", "Last sync: ") + new Date(last).toLocaleString(es ? "es-GT" : "en-US") : tr("Sin sincronizar todavía", "Not synced yet")}
          {" · " + pending.length + " " + tr("por validar", "to validate")}
        </span>
      </div>
      {msg && <p className="pya-note" style={{ color: "var(--ink)" }}>{msg}</p>}

      {!pending.length && !busy && (
        <p className="pya-note">{tr("No hay reportes de mantenimiento pendientes de validar.", "No maintenance reports pending validation.")}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {pending.map(r => {
          const name = propOf(r);
          return (
            <div key={r.id} style={{ border: "1px solid var(--warm-grey)", borderRadius: 18, padding: 16, background: "var(--alabaster)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>{r.descripcion || tr("Mantenimiento", "Maintenance")}</div>
                  <div style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--fg-muted)", marginTop: 4, letterSpacing: "0.04em" }}>
                    {r.fecha}{r.tecnico ? " · " + r.tecnico : ""}{r.propiedadRaw ? " · " + r.propiedadRaw : ""}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--sans)", fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>{"Q" + Number(r.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select value={name || ""} onChange={(e) => setProps(p => Object.assign({}, p, { [r.id]: e.target.value }))}
                  style={{ flex: "1 1 200px", minWidth: 180, padding: "9px 12px", borderRadius: 12, border: "1px solid " + (name ? "var(--warm-grey)" : "var(--peach)"), background: "var(--alabaster)", fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--ink)" }}>
                  <option value="">{tr("— asigna la propiedad —", "— assign the property —")}</option>
                  {(propOptions || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className="sa-file-btn ghost" onClick={() => setBox(r)} style={{ fontSize: 11.5 }}>{tr("Ver detalle", "View detail")}</button>
                <button className="sa-file-btn" onClick={() => keep(r)} disabled={!name || busy === "k-" + r.id} style={{ fontSize: 11.5 }}>
                  {busy === "k-" + r.id ? tr("Guardando…", "Saving…") : tr("Conservar", "Keep")}
                </button>
                <button className="sa-file-btn ghost" onClick={() => drop(r)} style={{ fontSize: 11.5, color: "#9B5B4E", borderColor: "#D9BAB2" }}>{tr("Eliminar", "Delete")}</button>
              </div>
            </div>
          );
        })}
      </div>
      {box && <ReporteDetalleBox rep={box} lang={lang} onClose={() => setBox(null)} />}
    </div>
  );
}

Object.assign(window, { PedidosYaImport, PyaSatPanel, PyaManualPanel, PyaDepositPanel, PyaManagePanel, PyaReportesPanel, ReporteDetalleBox, PyaDteBox, PyaRetencionesPanel });
// factura del ZIP cargado, por número de autorización (para Contabilidad)
window.pyaSatInvoiceByAuth = function (auth) {
  const d = pyaSatDraftLoad();
  return (d && d.invoices || []).find(i => i.auth === auth) || null;
};
