// ============================================================
// Spacio AM — Depósitos a socios · Constancias de retención en lote
// Lee cada PDF (SAT-1911): contribuyente, NIT, fecha de emisión, renta
// imponible y retención. Clasifica por propiedad (nombre del socio + monto)
// y por mes (la constancia de septiembre suele ser del reporte de agosto —
// se valida contra la retención calculada de cada mes).
// ============================================================
const RB_MAP_KEY = "sa-pya-ret-map"; // { NOMBRE CONTRIBUYENTE: property_name } compartido con PedidosYa
function rbMap() { try { return JSON.parse(localStorage.getItem(RB_MAP_KEY)) || {}; } catch (e) { return {}; } }
function rbRemember(name, prop) { if (!name || !prop) return; const m = rbMap(); m[name] = prop; try { localStorage.setItem(RB_MAP_KEY, JSON.stringify(m)); } catch (e) {} }
const rbPad = (n) => String(n).padStart(2, "0");
const rbShift = (ym, d) => { const [y, m] = ym.split("-").map(Number); const t = new Date(y, m - 1 + d, 1); return t.getFullYear() + "-" + rbPad(t.getMonth() + 1); };
const rbStrip = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const RB_STOP = { DE: 1, DEL: 1, LA: 1, LAS: 1, LOS: 1, Y: 1, SA: 1, S: 1, A: 1, SOCIEDAD: 1, ANONIMA: 1 };
const rbTokens = (s) => rbStrip(s).split(/[^A-Z0-9]+/).filter(w => w.length >= 3 && !RB_STOP[w]);
const rbMoney = (v) => "Q " + (Math.round((v || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function rbParsePdf(file) {
  const out = { name: "", nit: "", amount: 0, base: 0, ym: "", fecha: "", constancia: "" };
  if (!window.pdfjsLib) return out;
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const items = (await page.getTextContent()).items.map(x => String(x.str || "").trim()).filter(Boolean);
  const all = items.join(" | ");
  const hi = items.findIndex(s => /raz[oó]n o denominaci[oó]n social/i.test(s));
  if (hi > -1) for (let i = hi + 1; i < Math.min(hi + 7, items.length); i++) {
    const s = items[i];
    if (/^\d{6,10}[\dK]?$/i.test(s) && !out.nit) { out.nit = s; continue; }
    if (/^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s,.'&-]{5,}$/.test(s) && !/CONSTANCIA|AGENTE|RETENEDOR|SUSCRITO|FECHA/i.test(s)) { out.name = s.replace(/\s+/g, " ").trim(); break; }
  }
  const money = [...all.matchAll(/Q\s*([\d,]+\.\d{2})/g)].map(m => parseFloat(m[1].replace(/,/g, "")) || 0);
  const ti = all.search(/\|\s*TOTAL\s*\|/i);
  const tm = (ti > -1 ? all.slice(ti) : "").match(/Q\s*([\d,]+\.\d{2})/);
  out.amount = tm ? parseFloat(tm[1].replace(/,/g, "")) : (money.length ? Math.min(...money) : 0);
  out.base = money.find(v => out.amount && Math.abs(v * 0.05 - out.amount) < Math.max(1, out.amount * 0.02)) || (money.length ? Math.max(...money) : 0);
  const ai = items.findIndex(s => /^A[ñn]o$/i.test(s));
  if (ai > -1) { const nums = items.slice(ai + 1, ai + 8).filter(s => /^\d{1,4}$/.test(s)); const y = nums.find(n => n.length === 4); const rest = nums.filter(n => n !== y); if (y && rest.length >= 2) { out.ym = y + "-" + rbPad(+rest[1]); out.fecha = y + "-" + rbPad(+rest[1]) + "-" + rbPad(+rest[0]); } }
  if (!out.ym) { const dm = all.match(/(\d{1,2})\s*\|\s*(\d{1,2})\s*\|\s*(20\d{2})/); if (dm) { out.ym = dm[3] + "-" + rbPad(+dm[2]); out.fecha = out.ym + "-" + rbPad(+dm[1]); } }
  const ci = items.findIndex(s => /Constancia$/i.test(s));
  out.constancia = ((ci > -1 ? items.slice(ci, ci + 4) : items).find(s => /^\d{10,}$/.test(s))) || "";
  return out;
}

// retención esperada (GTQ) de cada propiedad por mes "YYYY-MM"
function rbExpected() {
  const rate = (window.SpacioI18n && SpacioI18n.GTQ_RATE) || 7.75;
  const out = {};
  (SpacioData.propertyList || []).forEach(p => (p.months || []).forEach(mo => {
    const ym = mo.y + "-" + rbPad(mo.m + 1);
    const usd = mo.retencion != null ? mo.retencion : (p.flagRetencion ? ((mo.ingresoNeto || 0) / 1.12) * 0.05 : 0);
    if (usd > 0.005) (out[p.name] = out[p.name] || {})[ym] = usd * rate;
  }));
  return out;
}

// elige propiedad (o socio) + mes del reporte
function rbClassify(r, ctx) {
  const { exp, owners, props, map } = ctx;
  const emit = r.ym;
  const months = emit ? [rbShift(emit, -1), emit, rbShift(emit, -2)] : [];
  const pdfTok = rbTokens(r.name);
  const nameScore = (o) => { const ot = rbTokens(o.name); if (!ot.length || !pdfTok.length) return 0; return ot.filter(w => pdfTok.indexOf(w) >= 0).length / ot.length; };
  const ownerOf = (pn) => { const p = props.find(x => x.name === pn); return p ? owners.find(o => o.props.indexOf(p.id) >= 0) : null; };
  const ownerScores = owners.map(o => ({ o, s: nameScore(o) })).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s);
  const nameOwner = ownerScores[0] && (!ownerScores[1] || ownerScores[1].s < ownerScores[0].s) ? ownerScores[0].o : null;
  const remembered = map[r.name] || "";
  const amtFit = (v) => { if (!r.amount || !v) return 0; const d = Math.abs(v - r.amount) / r.amount; return d <= 0.01 ? 2 : d <= 0.04 ? 1 : 0; };
  const cands = [];
  Object.keys(exp).forEach(pn => months.forEach((ym, mi) => {
    const v = exp[pn][ym]; const a = amtFit(v); if (!a) return;
    const o = ownerOf(pn);
    const byName = remembered === pn || (nameOwner && o && o.code === nameOwner.code);
    cands.push({ scope: "property", prop: pn, owner: o ? (o.name || o.code) : "", ym, expected: v, a, byName, mi });
  }));
  // a nivel socio: una sola constancia por la suma de todas sus propiedades
  if (nameOwner && months.length) months.forEach((ym, mi) => {
    const pns = props.filter(p => nameOwner.props.indexOf(p.id) >= 0).map(p => p.name);
    if (pns.length < 2) return;
    const sum = pns.reduce((s, pn) => s + ((exp[pn] || {})[ym] || 0), 0);
    const a = amtFit(sum); if (a) cands.push({ scope: "owner", prop: "", owner: nameOwner.name || nameOwner.code, ym, expected: sum, a, byName: true, mi });
  });
  cands.sort((x, y) => ((y.byName ? 3 : 0) + y.a * 2 - y.mi * 0.5) - ((x.byName ? 3 : 0) + x.a * 2 - x.mi * 0.5));
  const best = cands[0];
  if (best) return Object.assign({}, best, { how: best.byName ? "both" : "amount", conf: best.byName && best.a === 2 ? "alta" : "media" });
  // sin monto: solo por nombre (una propiedad del socio) o recordado
  const ym = months[0] || "";
  if (remembered) { const o = ownerOf(remembered); return { scope: "property", prop: remembered, owner: o ? (o.name || o.code) : "", ym, expected: (exp[remembered] || {})[ym] || 0, how: "name", conf: "media" }; }
  if (nameOwner) {
    const pns = props.filter(p => nameOwner.props.indexOf(p.id) >= 0).map(p => p.name);
    return pns.length === 1
      ? { scope: "property", prop: pns[0], owner: nameOwner.name || nameOwner.code, ym, expected: (exp[pns[0]] || {})[ym] || 0, how: "name", conf: "media" }
      : { scope: "owner", prop: "", owner: nameOwner.name || nameOwner.code, ym, expected: 0, how: "name", conf: "baja" };
  }
  return { scope: "property", prop: "", owner: "", ym, expected: 0, how: "none", conf: "baja" };
}

function RetencionBatchUpload({ lang, ym: curYm }) {
  const SF = window.SpacioFiles;
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const [items, setItems] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [prog, setProg] = React.useState(null);
  const [drag, setDrag] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  if (!SF) return null;
  const props = SpacioData.propertyList || [];
  const owners = SpacioData.owners || [];
  const propNames = props.map(p => p.name).sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }));
  const ownerNames = [...new Set(owners.map(o => o.name || o.code))].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "es"));
  const monthLabel = (ym) => { const m = String(ym || "").match(/^(\d{4})-(\d{2})$/); if (!m) return "—"; const s = SpacioI18n.monthLong(lang, +m[2] - 1); return s.charAt(0).toUpperCase() + s.slice(1) + " " + m[1]; };
  const monthOpts = (() => { const now = new Date(), out = []; for (let i = 0; i < 18; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(d.getFullYear() + "-" + rbPad(d.getMonth() + 1)); } return out; })();

  const onFiles = async (fileList) => {
    const files = [...(fileList || [])].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) || /^image\//.test(f.type));
    if (!files.length) return;
    setBusy("read"); setMsg(""); setProg({ i: 0, n: files.length });
    const ctx = { exp: rbExpected(), owners, props, map: rbMap() };
    const seen = new Set(items.map(x => x.constancia).filter(Boolean));
    const add = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      let r = { name: "", nit: "", amount: 0, base: 0, ym: "", fecha: "", constancia: "" };
      if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) { try { r = await rbParsePdf(f); } catch (e) {} }
      setProg({ i: i + 1, n: files.length });
      if (r.constancia && seen.has(r.constancia)) continue;
      if (r.constancia) seen.add(r.constancia);
      const c = rbClassify(r, ctx);
      add.push(Object.assign({ id: "rt" + Date.now() + "-" + i, file: f, fileName: f.name, read: !!(r.name || r.amount), status: "ready" }, r, { emitYm: r.ym }, c));
    }
    setItems(prev => prev.concat(add));
    setProg(null); setBusy("");
  };
  const setItem = (id, patch) => setItems(its => its.map(d => d.id === id ? Object.assign({}, d, patch) : d));
  const recompute = (d, patch) => {
    const n = Object.assign({}, d, patch, { how: "manual", conf: "manual" });
    const exp = rbExpected();
    if (n.scope === "owner") {
      const o = owners.find(x => (x.name || x.code) === n.owner);
      n.expected = o ? props.filter(p => o.props.indexOf(p.id) >= 0).reduce((s, p) => s + ((exp[p.name] || {})[n.ym] || 0), 0) : 0;
    } else n.expected = (exp[n.prop] || {})[n.ym] || 0;
    return n;
  };
  const edit = (id, patch) => setItems(its => its.map(d => d.id === id ? recompute(d, patch) : d));
  const target = (d) => d.scope === "owner" ? d.owner : d.prop;
  const ready = items.filter(d => d.status !== "done" && target(d) && d.ym);

  const saveAll = async () => {
    if (!ready.length) return;
    setBusy("save"); setMsg("");
    let ok = 0, failed = 0;
    for (const d of ready) {
      setItem(d.id, { status: "uploading" });
      const res = await SF.upload(d.scope === "owner"
        ? { kind: "retencion", scope: "owner", owner: d.owner, ym: d.ym, file: d.file, monto: d.amount || "", fecha: d.fecha || "" }
        : { kind: "retencion", scope: "property", property_name: d.prop, owner: d.owner, ym: d.ym, file: d.file, monto: d.amount || "", fecha: d.fecha || "" });
      if (res && res.ok !== false) { ok++; setItem(d.id, { status: "done" }); if (d.scope === "property") rbRemember(d.name, d.prop); }
      else { failed++; setItem(d.id, { status: "error" }); }
    }
    setItems(its => its.filter(d => d.status !== "done"));
    setBusy("");
    setMsg(tr(ok + " constancia(s) guardada(s)" + (failed ? " · " + failed + " con error (revisa la conexión)" : "") + ".", ok + " certificate(s) saved" + (failed ? " · " + failed + " failed (check connection)" : "") + "."));
  };

  const HOW = {
    both: tr("nombre y monto coinciden", "name and amount match"),
    amount: tr("por monto — confirma la propiedad", "by amount — confirm property"),
    name: tr("por nombre — el monto no coincide con ningún mes", "by name — amount matches no month"),
    none: tr("sin coincidencia — asígnala tú", "no match — assign it yourself"),
    manual: tr("elegido por ti", "you chose it"),
  };
  const dotColor = (d) => d.conf === "alta" || d.how === "manual" ? "#5B8A6B" : d.conf === "media" ? "var(--peach)" : "var(--warm-grey)";
  const selSt = (warn) => ({ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--ink)", background: "var(--beige-soft)", border: "1px solid " + (warn ? "var(--peach)" : "var(--warm-grey)"), borderRadius: 10, padding: "7px 8px", minWidth: 0, width: "100%" });
  const lbl = { fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-muted)" };

  return (
    <div style={{ marginBottom: 24 }}>
      <label className="sa-dep-drop" style={{ borderColor: drag ? "var(--ink)" : "var(--warm-grey)" }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}>
        <input type="file" accept="application/pdf,.pdf,image/*" multiple style={{ display: "none" }} onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
        <span className="sa-dep-drop-ic"><Icon name="file" size={18} stroke="var(--ink)" /></span>
        <span>
          <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.04em", color: "var(--ink)" }}>{tr("Subir constancias de retención en lote", "Batch-upload withholding certificates")}</span>
          <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.03em", color: "var(--fg-muted)", marginTop: 3, maxWidth: 480, lineHeight: 1.5, textWrap: "pretty" }}>{tr("Arrastra los PDF de la SAT. Leemos contribuyente, fecha y monto, y los ubicamos por propiedad y mes: la constancia de un mes suele corresponder al reporte del mes anterior, y lo validamos contra la retención calculada.", "Drop the SAT PDFs. We read taxpayer, date and amount, and file them by property and month: a certificate usually belongs to the previous month's report, and we check it against the calculated withholding.")}</span>
          {prog && <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 7, fontFamily: "var(--sans)", fontSize: 11, color: "var(--fg-muted)" }}><span className="sa-spin" style={{ width: 12, height: 12, border: "2px solid var(--warm-grey)", borderTopColor: "var(--peach)", borderRadius: "50%", display: "inline-block" }}></span>{tr("Leyendo " + prog.i + " de " + prog.n + "…", "Reading " + prog.i + " of " + prog.n + "…")}</span>}
        </span>
      </label>

      {items.length > 0 && (
        <React.Fragment>
          <div className="sa-dep-grid">
            {items.map(d => {
              const diff = d.expected && d.amount ? d.amount - d.expected : null;
              return (
                <div className="sa-dep-card" key={d.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: "var(--beige-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="file" size={16} stroke="var(--ink)" /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 12, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.name || d.fileName}>{d.name || d.fileName}</span>
                      <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.03em", color: "var(--fg-muted)", marginTop: 2 }}>
                        {d.read ? [d.nit && ("NIT " + d.nit), d.fecha && depFecha(d.fecha, lang), d.constancia && ("Nº " + d.constancia)].filter(Boolean).join(" · ") : tr("No pudimos leer el archivo — complétalo a mano", "Couldn't read the file — fill it in by hand")}
                      </span>
                    </span>
                    <span style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{d.amount ? rbMoney(d.amount) : "—"}</span>
                      {d.base > 0 && <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 10, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{tr("base ", "base ") + rbMoney(d.base)}</span>}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) minmax(0,140px)", gap: 8, alignItems: "end" }}>
                    <div className="pya-segbtn">
                      <button className={d.scope !== "owner" ? "on" : ""} onClick={() => edit(d.id, { scope: "property" })}>{tr("Propiedad", "Property")}</button>
                      <button className={d.scope === "owner" ? "on" : ""} onClick={() => edit(d.id, { scope: "owner" })}>{tr("Socio", "Owner")}</button>
                    </div>
                    {d.scope === "owner"
                      ? <select style={selSt(!d.owner)} value={d.owner || ""} onChange={e => edit(d.id, { owner: e.target.value })}>
                          <option value="">{tr("— asignar socio —", "— assign owner —")}</option>
                          {ownerNames.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      : <select style={selSt(!d.prop)} value={d.prop || ""} onChange={e => edit(d.id, { prop: e.target.value })}>
                          <option value="">{tr("— asignar propiedad —", "— assign property —")}</option>
                          {propNames.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>}
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <span style={lbl}>{tr("Reporte de", "Report of")}</span>
                      <select style={selSt(!d.ym)} value={d.ym || ""} onChange={e => edit(d.id, { ym: e.target.value })}>
                        {!d.ym && <option value="">—</option>}
                        {d.ym && monthOpts.indexOf(d.ym) < 0 && <option value={d.ym}>{monthLabel(d.ym)}</option>}
                        {monthOpts.map(o => <option key={o} value={o}>{monthLabel(o)}</option>)}
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {d.status === "uploading"
                      ? <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}><span className="sa-spin" style={{ width: 11, height: 11, border: "2px solid var(--warm-grey)", borderTopColor: "var(--peach)", borderRadius: "50%", display: "inline-block" }}></span>{tr("subiendo…", "uploading…")}</span>
                      : d.status === "error"
                      ? <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, color: "var(--attention-text)", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="alert" size={12} stroke="var(--peach)" />{tr("error — reintenta", "error — retry")}</span>
                      : <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.03em", color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(d), flexShrink: 0 }}></span>{HOW[d.how] || ""}
                        </span>}
                    {d.expected > 0 && <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, color: diff != null && Math.abs(diff) > Math.max(1, d.amount * 0.04) ? "var(--attention-text)" : "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {tr("esperado ", "expected ") + rbMoney(d.expected) + (diff != null ? " · " + (diff >= 0 ? "+" : "−") + rbMoney(Math.abs(diff)).replace("Q ", "Q ") : "")}
                    </span>}
                    {d.emitYm && d.ym && d.emitYm !== d.ym && <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, color: "var(--fg-muted)" }}>{tr("emitida en ", "issued in ") + monthLabel(d.emitYm).toLowerCase()}</span>}
                    <button onClick={() => setItems(its => its.filter(x => x.id !== d.id))} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.04em", color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="x" size={11} stroke="currentColor" />{tr("quitar", "remove")}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: msg ? "var(--ink)" : "var(--fg-muted)", maxWidth: 440, lineHeight: 1.5 }}>{msg || tr("Cada constancia se guarda en la propiedad (o socio) y el mes del reporte que elijas. Reemplaza la que ya hubiera.", "Each certificate is saved to the property (or owner) and report month you choose. It replaces any existing one.")}</span>
            <button className="sa-file-btn dark" onClick={saveAll} disabled={!ready.length || busy === "save"}>
              {busy === "save" ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.4)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }}></span> : <Icon name="check" size={15} stroke="var(--alabaster)" />}
              {tr("Guardar constancias", "Save certificates")}{ready.length ? " · " + ready.length : ""}
            </button>
          </div>
        </React.Fragment>
      )}
      {!items.length && msg && <p style={{ margin: "10px 0 0", fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--ink)" }}>{msg}</p>}
    </div>
  );
}

Object.assign(window, { RetencionBatchUpload });
