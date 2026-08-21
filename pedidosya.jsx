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

// normaliza fechas de la hoja a "yyyy-mm-dd" (acepta dd/mm/yyyy y yyyy-mm-dd)
function pyaNormFecha(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return s;
}

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
      const oidCol = head.findIndex(h => h === "orderid" || h === "order id");
      const apCol = head.findIndex(h => h === "authproductos");
      const atCol = head.findIndex(h => h === "authtarifa");
      const fCol = head.findIndex(h => h === "fecha de pedido");
      const vCol = head.findIndex(h => h === "valor");
      const cCol = head.findIndex(h => h === "comentario");
      const ids = new Set(), rows = [];
      for (let i = 1; i < parsed.length; i++) {
        const r = parsed[i];
        [oidCol, apCol, atCol].forEach(c => { if (c > -1 && r[c] && String(r[c]).trim()) ids.add(String(r[c]).trim()); });
        const hasAuth = (apCol > -1 && String(r[apCol] || "").trim()) || (atCol > -1 && String(r[atCol] || "").trim());
        const fecha = fCol > -1 ? pyaNormFecha(r[fCol]) : "";
        const valor = vCol > -1 ? (parseFloat(String(r[vCol]).replace(/[^0-9.\-]/g, "")) || 0) : 0;
        const cm = cCol > -1 ? String(r[cCol] || "") : "";
        const mm = cm.match(/\(compartido ÷(\d+)\)/);
        if (fecha && valor) rows.push({ fecha, valor, mult: mm ? parseInt(mm[1], 10) : 1, hasAuth: !!hasAuth });
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
    { k: "sat", label: tr("SAT · PedidosYa", "SAT · PedidosYa"), icon: "file" },
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
            <PyaManualPanel lang={lang} addImported={addImported} propOptions={propOptions} />
          </div>
          <div style={{ display: mode === "deposit" ? "block" : "none" }}>
            <PyaDepositPanel lang={lang} propOptions={propOptions} />
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

// ============================================================
// 1) Panel SAT
// ============================================================
function PyaSatPanel({ lang, imported, addImported, propOptions, sheetExpenses }) {
  const P = window.PedidosYa;
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const [invoices, setInvoices] = pyUseState(null);
  const [satStats, setSatStats] = pyUseState(null);
  const [warnings, setWarnings] = pyUseState([]);
  const [lines, setLines] = pyUseState([]);
  const [busy, setBusy] = pyUseState("");
  const [filter, setFilter] = pyUseState("all");
  const [box, setBox] = pyUseState(null);
  const [saveMsg, setSaveMsg] = pyUseState("");
  const [drag, setDrag] = pyUseState(false);
  const [showOther, setShowOther] = pyUseState(false); // incluir facturas de otras NITs
  const [query, setQuery] = pyUseState("");            // búsqueda por fecha / monto / emisor

  const catOptions = [
    { value: "insumos & gastos", label: tr("Insumos & gastos", "Supplies & expenses") },
    { value: "Reparaciones o inversión", label: tr("Mantenimiento e inversión", "Maintenance & investment") },
  ];
  const tagOptions = [
    { value: "", label: tr("— (es insumo)", "— (is a supply)") },
    { value: "Restaurante / comida", label: tr("Restaurante / comida", "Restaurant / food") },
    { value: "Compras ajenas a insumos", label: tr("Compras ajenas a insumos", "Non-supply purchase") },
    { value: "Gasto Spacio AM", label: tr("Gasto Spacio AM", "Spacio AM expense") },
  ];

  // re-empareja cuando cambian facturas, importados o el toggle de otras NITs
  pyUseEffect(() => {
    if (!invoices) return;
    setLines(prev => {
      const fresh = P.pairSATInvoices(invoices, imported, { includeOther: showOther });
      const byId = {}; prev.forEach(l => byId[l.id] = l);
      return fresh.map(l => { const old = byId[l.id]; return old ? Object.assign(l, { property_name: old.property_name, orderUrl: old.orderUrl, categoria: old.categoria, tag: old.tag, comentario: old.comentario, include: old.include }) : l; });
    });
  }, [invoices, imported, showOther]);

  const onSAT = async (files) => {
    if (!files || !files.length) return;
    setBusy("sat"); setWarnings([]);
    let allInv = [], allWarn = [], stat = { productos: 0, tarifa: 0, total: 0, otros: 0, otrosByNit: [] };
    for (const f of files) {
      const res = await P.parseSATFile(f);
      allInv = allInv.concat(res.invoices); allWarn = allWarn.concat(res.warnings);
      stat.productos += res.stats.productos; stat.tarifa += res.stats.tarifa; stat.total += res.stats.total; stat.otros += (res.stats.otros || 0);
      (res.stats.otrosByNit || []).forEach(n => stat.otrosByNit.push(n));
    }
    setInvoices(allInv); setSatStats(stat); setWarnings([...new Set(allWarn)]); setBusy("");
  };

  const setLine = (id, patch) => setLines(ls => ls.map(l => l.id === id ? Object.assign({}, l, patch) : l));
  const selectable = lines.filter(l => !l.alreadyImported);
  const selectedRows = selectable.filter(l => l.include && l.property_name);
  const missingProp = selectable.filter(l => l.include && !l.property_name).length;
  const allOn = selectable.length > 0 && selectable.every(l => l.include);
  const toggleAll = () => setLines(ls => ls.map(l => l.alreadyImported ? l : Object.assign({}, l, { include: !allOn })));

  const matchQuery = (l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [P.prettyDay(l.day, lang), String(l.consolidated), l.prod && l.prod.total, l.tar && l.tar.total, l.receptor, l.prod && l.prod.emisor, l.prod && l.prod.auth, l.tar && l.tar.auth]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.indexOf(q) > -1;
  };
  const visible = pyUseMemo(() => lines.filter(l => (filter === "all" ? true : filter === "imported" ? l.alreadyImported : !l.alreadyImported) && matchQuery(l)), [lines, filter, query, lang]);
  const counts = pyUseMemo(() => ({ all: lines.length, pending: lines.filter(l => !l.alreadyImported).length, imported: lines.filter(l => l.alreadyImported).length }), [lines]);

  const downloadTSV = () => {
    const header = ["Mes", "Fecha de pedido", "property_name", "valor", "categoria", "Comentario", "tag", "orderId", "orderUrl", "authProductos", "authTarifa"];
    const rows = selectedRows.map(l => P.toSheetRowFromLine(l));
    const lines2 = [header.join("\t")].concat(rows.map(o => header.map(h => o[h]).join("\t")));
    const blob = new Blob([lines2.join("\n")], { type: "text/tab-separated-values" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "insumos-sat.tsv"; a.click();
  };

  // vinculación automática: empareja por FECHA + MONTO las facturas del SAT con
  // los gastos ya guardados en la hoja que aún no tienen factura. Sin trabajo manual.
  const autoCand = pyUseMemo(() => {
    if (!sheetExpenses || !sheetExpenses.length) return [];
    const byF = {};
    sheetExpenses.forEach(x => { if (!x.hasAuth && x.fecha) (byF[x.fecha] = byF[x.fecha] || []).push(x); });
    return lines.filter(l => {
      if (!((l.prod && l.prod.auth) || (l.tar && l.tar.auth))) return false;
      const cands = byF[l.day] || [];
      return cands.some(x => Math.abs(x.valor - l.consolidated) < 0.025 || (x.mult > 1 && Math.abs(x.valor * x.mult - l.consolidated) < 0.06));
    });
  }, [lines, sheetExpenses]);
  const autoLink = async () => {
    if (!autoCand.length) return;
    if (!(window.SpacioWrite && window.SpacioWrite.enabled())) { setSaveMsg(tr("Conecta el backend (Setup → Conexión de escritura) para vincular las facturas.", "Connect the backend (Setup → Write connection) to link the invoices.")); return; }
    setBusy("fill"); setSaveMsg("");
    const links = autoCand.map(l => ({
      fecha: l.day, total: l.consolidated,
      orderId: (l.prod && l.prod.auth) || (l.tar && l.tar.auth) || "",
      orderUrl: l.orderUrl || "",
      authProductos: l.prod ? l.prod.auth : "",
      authTarifa: l.tar ? l.tar.auth : "",
    }));
    const res = await window.SpacioWrite.post("linkFacturas", { links });
    if (res && res.ok) {
      if (res.rows != null) setSaveMsg(tr("Listo · " + res.links + " factura(s) vinculada(s) automáticamente a " + res.rows + " gasto(s) guardado(s) por fecha y monto. El socio ya puede verlas en Gastos e inversiones.", "Done · " + res.links + " invoice(s) auto-linked to " + res.rows + " saved expense(s) by date and amount."));
      else setSaveMsg(tr("El Apps Script desplegado es una versión anterior: actualízalo desde la página “Copiar Apps Script” (nueva versión) y vuelve a intentar.", "The deployed Apps Script is an older version: update it from the “Copiar Apps Script” page (new version) and try again."));
    } else setSaveMsg(tr("No se pudo escribir: " + ((res && res.error) || "sin conexión") + ".", "Could not write: " + ((res && res.error) || "offline") + "."));
    setBusy("");
  };

  const save = async () => {
    if (!selectedRows.length) return;
    setBusy("save"); setSaveMsg("");
    const rows = selectedRows.map(l => P.toSheetRowFromLine(l));
    if (window.SpacioWrite && window.SpacioWrite.enabled()) {
      const res = await window.SpacioWrite.post("appendInsumos", { rows });
      if (res && res.ok) {
        addImported(selectedRows.map(l => l.id));
        setSaveMsg(tr("Listo · " + (res.added != null ? res.added : rows.length) + " filas escritas.", "Done · " + (res.added != null ? res.added : rows.length) + " rows written."));
      } else setSaveMsg(tr("No se pudo escribir: " + ((res && res.error) || "sin conexión") + ". Descarga el TSV.", "Could not write: " + ((res && res.error) || "offline") + ". Download the TSV."));
    } else {
      addImported(selectedRows.map(l => l.id)); downloadTSV();
      setSaveMsg(tr("Backend sin configurar (Setup → Conexión). Se descargó un TSV.", "Backend not configured (Setup → Connection). A TSV was downloaded."));
    }
    setBusy("");
  };

  const Badge = ({ l }) => l.alreadyImported
    ? <span className="pya-badge dupe"><Icon name="check" size={11} stroke="var(--alabaster)" />{tr("Ya importado", "Imported")}</span>
    : (l.prod && l.prod.kind === "otro") ? <span className="pya-badge revisar"><span className="dot" />{tr("Otra NIT", "Other NIT")}</span>
    : l.prod ? <span className="pya-badge matched"><span className="dot" />{tr("Productos", "Products")}</span>
    : <span className="pya-badge sin"><span className="dot" />{tr("Tarifa de servicio", "Service fee")}</span>;

  return (
    <React.Fragment>
      <label className={"pya-drop" + (drag ? " drag" : "")} style={{ marginTop: 18 }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onSAT(e.dataTransfer.files); }}>
        <input type="file" accept=".xls,.xlsx,.xml,.csv,.pdf" multiple onChange={e => onSAT(e.target.files)} />
        <span className="pya-drop-ic"><Icon name="file" size={20} stroke="var(--ink)" /></span>
        <span>
          <span className="pya-drop-lbl">{tr("Archivo del SAT (FEL · Consultar DTE)", "SAT file (FEL · Consultar DTE)")}</span>
          <span className="pya-drop-hint">{tr("Exporta tu emisión/recepción de DTE. Filtramos solo PedidosYa: productos (NIT 110411668) y tarifa de servicio (NIT 100446329). .xls / .xlsx / .xml / PDF", "Export your DTE issuance/reception. We keep only PedidosYa: products (NIT 110411668) and service fee (NIT 100446329). .xls / .xlsx / .xml / PDF")}</span>
          {busy === "sat" && <span className="pya-drop-done"><span className="sa-spin" style={{ width: 12, height: 12, border: "2px solid var(--warm-grey)", borderTopColor: "var(--peach)", borderRadius: "50%", display: "inline-block" }} /> {tr("Leyendo…", "Reading…")}</span>}
          {satStats && busy !== "sat" && <span className="pya-drop-done"><Icon name="check" size={13} stroke="#5B8A6B" /> {satStats.total} {tr("facturas PedidosYa", "PedidosYa invoices")} · {satStats.productos} {tr("prod", "prod")} · {satStats.tarifa} {tr("tarifa", "fee")}{satStats.otros ? " · " + satStats.otros + tr(" de otras NITs", " from other NITs") : ""}</span>}
        </span>
      </label>

      {satStats && satStats.otros > 0 && (
        <div className="pya-warn" style={{ alignItems: "flex-start" }}>
          <Icon name="info" size={16} stroke="var(--peach)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ margin: 0 }}>{tr("¿No encuentras la factura de un pedido? El Market de PedidosYa suele facturar los productos con la NIT de la tienda, no con la de Delivery Hero. Actívalas para asignarlas:", "Can't find an order's invoice? PedidosYa Market often bills products under the store's own NIT, not Delivery Hero's. Turn them on to assign them:")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {(satStats.otrosByNit || []).slice(0, 6).map((n, i) => (
                <span key={i} style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.02em", color: "var(--fg-muted)", background: "var(--alabaster)", border: "1px solid var(--warm-grey)", borderRadius: 8, padding: "4px 8px" }}>{(n.emisor || ("NIT " + n.nit)).slice(0, 28)} · {n.count}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="pya-warn"><Icon name="info" size={16} stroke="var(--peach)" style={{ flexShrink: 0, marginTop: 1 }} /><p>{warnings.join(" ")}</p></div>
      )}

      {lines.length > 0 && (
        <React.Fragment>
          <div className="pya-toolbar">
            <div className="pya-filters">
              {[{ k: "all", label: tr("Todas", "All"), n: counts.all }, { k: "pending", label: tr("Pendientes", "Pending"), n: counts.pending }, { k: "imported", label: tr("Importadas", "Imported"), n: counts.imported }].map(f => (
                <button key={f.k} className={"pya-fchip" + (filter === f.k ? " on" : "")} onClick={() => setFilter(f.k)}>{f.label} · {f.n}</button>
              ))}
            </div>
            <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.06em", color: "var(--fg-muted)" }}>
              {selectedRows.length} {tr("listas para guardar", "ready to save")}{missingProp > 0 ? " · " + missingProp + tr(" sin propiedad", " missing property") : ""}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "0 0 14px" }}>
            <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={15} stroke="var(--fg-muted)" /></span>
              <input className="pya-input" style={{ paddingLeft: 36 }} value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("Buscar por fecha o monto (ej. 31 May, 76.56, 78.56)", "Search by date or amount (e.g. 31 May, 76.56)")} />
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 9, cursor: "pointer", fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: "var(--ink)" }}>
              <PyaCheck on={showOther} onClick={() => setShowOther(v => !v)} />
              {tr("Incluir facturas de otras NITs", "Include other-NIT invoices")}{satStats && satStats.otros ? " (" + satStats.otros + ")" : ""}
            </label>
          </div>

          <div className="pya-scroll">
            <table className="pya-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}><PyaCheck on={allOn} onClick={toggleAll} /></th>
                  <th>{tr("Factura", "Invoice")}</th>
                  <th>{tr("Fecha", "Date")}</th>
                  <th style={{ textAlign: "right" }}>{tr("Gran Total", "Grand total")}</th>
                  <th style={{ minWidth: 180 }}>{tr("Propiedad", "Property")}</th>
                  <th style={{ minWidth: 190 }}>{tr("URL del pedido", "Order URL")}</th>
                  <th style={{ minWidth: 150 }}>{tr("Categoría", "Category")}</th>
                  <th style={{ minWidth: 170 }}>{tr("Comentario", "Comment")}</th>
                  <th>{tr("Ver", "View")}</th>
                  <th style={{ minWidth: 140 }}>Tag</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(l => (
                  <tr key={l.id} className={l.alreadyImported ? "imported" : ""}>
                    <td>{!l.alreadyImported && <PyaCheck on={l.include} onClick={() => setLine(l.id, { include: !l.include })} />}</td>
                    <td><Badge l={l} />{(l.prod && l.prod.kind === "otro" && l.prod.emisor) ? <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 9.5, letterSpacing: "0.02em", color: "var(--fg-muted)", marginTop: 3, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.prod.emisor}</span> : null}</td>
                    <td className="pya-num">{P.prettyDay(l.day, lang)}</td>
                    <td className="pya-num" style={{ textAlign: "right", fontWeight: 600 }}>{P.money(l.consolidated)}{(l.prod && l.tar) ? <span style={{ display: "block", fontWeight: 400, fontSize: 9.5, color: "var(--fg-muted)", marginTop: 2 }}>{tr("Prod", "Prod")} {P.money(l.prod.total)} · {tr("Tar", "Fee")} {P.money(l.tar.total)}</span> : null}</td>
                    <td><PyaMini value={l.property_name} options={propOptions} onChange={v => setLine(l.id, { property_name: v })} placeholder={tr("Asignar…", "Assign…")} search /></td>
                    <td><input className="pya-input" style={{ fontSize: 11.5, padding: "8px 10px" }} value={l.orderUrl} onChange={e => setLine(l.id, { orderUrl: e.target.value })} placeholder={tr("Pega el link del pedido", "Paste order link")} /></td>
                    <td><PyaMini value={l.categoria} options={catOptions} onChange={v => setLine(l.id, { categoria: v })} /></td>
                    <td><input className="pya-input" style={{ fontSize: 11.5, padding: "8px 10px" }} value={l.comentario} onChange={e => setLine(l.id, { comentario: e.target.value })} placeholder={tr("Comentario (col. F)", "Comment (col. F)")} /></td>
                    <td>
                      <button className="pya-link" onClick={() => setBox({
                        orderUrl: l.orderUrl, desc: l.receptor, day: l.day, amount: l.consolidated, vendor: l.receptor,
                        invoices: [l.prod, l.tar].filter(Boolean).map(inv => ({ kind: inv.kind, auth: inv.auth, nit: inv.nit, total: inv.total, receptor: inv.receptor })),
                      })}>
                        <Icon name="eye" size={13} stroke="currentColor" />{tr("Factura", "Invoice")}
                      </button>
                    </td>
                    <td><PyaMini value={l.tag} options={tagOptions} onChange={v => setLine(l.id, { tag: v })} placeholder={tr("— (es insumo)", "— (is a supply)")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pya-footer">
            <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: saveMsg ? "var(--ink)" : "var(--fg-muted)", maxWidth: 460, lineHeight: 1.5 }}>
              {saveMsg || tr("Cada factura va por separado. Asigna la propiedad y pega la MISMA URL del pedido en la factura de productos y en la de tarifa: así el propietario verá un solo monto y ambas facturas; tú las sigues viendo separadas.", "Each invoice is separate. Assign the property and paste the SAME order URL on the products invoice and on the service-fee invoice: the owner will see one amount and both invoices; you keep seeing them separate.")}
            </span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="pya-btn pya-btn-ghost" onClick={() => { if (window.confirm(tr("¿Borrar el archivo cargado y empezar de cero?", "Clear the loaded file and start over?"))) { setInvoices(null); setLines([]); setSatStats(null); setWarnings([]); setSaveMsg(""); } }} disabled={!lines.length}><Icon name="x" size={14} stroke="var(--fg-muted)" />{tr("Limpiar", "Clear")}</button>
              <button className="pya-btn pya-btn-ghost" onClick={downloadTSV} disabled={!selectedRows.length}><Icon name="arrowUpRight" size={14} stroke="var(--fg-muted)" />TSV</button>
              {autoCand.length > 0 && (
                <button className="pya-btn" onClick={autoLink} disabled={busy === "fill"} title={tr("Empareja automáticamente cada factura del SAT con el gasto guardado que coincide en fecha y monto, y le agrega su factura (no duplica nada).", "Automatically pairs each SAT invoice with the saved expense matching date and amount (nothing is duplicated).")}>
                  {busy === "fill" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid var(--warm-grey)", borderTopColor: "var(--ink)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="eye" size={14} stroke="var(--fg-muted)" />}
                  {tr("Vincular facturas automáticamente", "Auto-link invoices")} · {autoCand.length}
                </button>
              )}
              <button className="pya-btn pya-btn-dark" onClick={save} disabled={!selectedRows.length || busy === "save"}>
                {busy === "save" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.4)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="check" size={15} stroke="var(--alabaster)" />}
                {tr("Guardar en insumos & gastos", "Save to insumos & gastos")} {selectedRows.length ? "· " + selectedRows.length : ""}
              </button>
            </div>
          </div>
        </React.Fragment>
      )}

      {!lines.length && invoices && busy === "" && (
        <div className="pya-empty">{tr("No se encontraron facturas de PedidosYa en el archivo. Verifica que sea el export de FEL → Consultar DTE.", "No PedidosYa invoices found in the file. Make sure it's the FEL → Consultar DTE export.")}</div>
      )}

      {box && <InvoiceViewBox data={box} lang={lang} onClose={() => setBox(null)} />}
    </React.Fragment>
  );
}

// ============================================================
// 2) Panel gasto manual (suelto o multipropiedad)
// ============================================================
function PyaManualPanel({ lang, addImported, propOptions }) {
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

  const catOptions = [
    { value: "Reparaciones o inversión", label: tr("Mantenimiento e inversión", "Maintenance & investment") },
    { value: "insumos & gastos", label: tr("Insumos & gastos", "Supplies & expenses") },
  ];
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
// 4) Panel "Guardados": editar / eliminar / subir factura a gastos ya guardados
// ============================================================
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

Object.assign(window, { PedidosYaImport, PyaSatPanel, PyaManualPanel, PyaDepositPanel, PyaManagePanel, PyaReportesPanel, ReporteDetalleBox });
