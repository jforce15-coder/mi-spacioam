// ============================================================
// Spacio AM — Contratos compartidos con socios
// ------------------------------------------------------------
// Dos orígenes, una sola pestaña "Contratos" en la hoja:
//  A) Sistema de contratos (docs.spacioam.com): cada documento ya trae
//     la propiedad vinculada en EPI. Se sincroniza y se empareja con la
//     propiedad del dashboard por nombre.
//  B) Contratos antiguos en PDF: el admin sube varios, revisa la
//     propiedad sugerida por el nombre del archivo y guarda.
// El socio los ve en Mi cuenta → Documentos compartidos.
// ============================================================
const { useState: ctUseState, useEffect: ctUseEffect, useMemo: ctUseMemo, useRef: ctUseRef } = React;

const CT_CSS = `
.ct-card { background: var(--alabaster); border: 1px solid var(--ink-08); border-radius: 22px; box-shadow: var(--shadow-sm); margin-bottom: 18px; overflow: hidden; }
.ct-head { display: flex; align-items: center; gap: 10px; padding: 18px 20px 0; }
.ct-head b { font-family: var(--sans); font-size: 11px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink); }
.ct-sub { font-family: var(--sans); font-size: 12px; line-height: 1.65; letter-spacing: 0.03em; color: var(--fg-muted); margin: 6px 20px 16px; max-width: 640px; text-wrap: pretty; }
.ct-seg { display: flex; gap: 6px; padding: 0 20px 16px; flex-wrap: wrap; }
.ct-body { padding: 0 20px 20px; }
.ct-list { display: flex; flex-direction: column; border: 1px solid var(--ink-08); border-radius: 16px; }
.ct-row { display: grid; grid-template-columns: 34px minmax(0,1.3fr) minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 11px 14px; border-top: 1px solid var(--ink-08); }
.ct-row:first-child { border-top: none; }
.ct-ic { width: 34px; height: 34px; border-radius: 10px; background: var(--beige-soft); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ct-name { min-width: 0; }
.ct-name b { display: block; font-family: var(--sans); font-size: 12.5px; font-weight: 600; letter-spacing: 0.01em; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ct-name span { display: block; font-family: var(--sans); font-size: 10.5px; letter-spacing: 0.03em; color: var(--fg-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ct-hint { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-muted); }
.ct-act { display: flex; gap: 6px; align-items: center; }
.ct-drop { position: relative; display: flex; gap: 14px; align-items: flex-start; border: 1.5px dashed var(--warm-grey); border-radius: 16px; padding: 16px; background: var(--beige-soft); cursor: pointer; margin-bottom: 14px; }
.ct-drop:hover, .ct-drop.drag { border-color: var(--ink); }
.ct-drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.ct-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.ct-msg { font-family: var(--sans); font-size: 11.5px; line-height: 1.5; letter-spacing: 0.03em; color: var(--ink); }
.ct-doc { display: flex; align-items: center; gap: 13px; padding: 13px 0; border-bottom: 1px solid var(--ink-08); text-decoration: none; }
.ct-doc:last-child { border-bottom: none; }
.ct-doc:hover .ct-doc-t { opacity: .6; }
.ct-doc-t { font-family: var(--serif); font-size: 16px; line-height: 1.15; color: var(--ink); transition: opacity .18s var(--ease); }
.ct-doc-m { font-family: var(--sans); font-size: 10.5px; letter-spacing: 0.06em; color: var(--fg-muted); margin-top: 3px; }
.ct-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 3px 9px; font-family: var(--sans); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; background: var(--beige-soft); color: var(--fg-muted); }
.ct-badge.ok { background: rgba(61,107,82,0.10); color: #3d6b52; }
@media (max-width: 779px) {
  .ct-row { grid-template-columns: 34px minmax(0,1fr); }
  .ct-row > :nth-child(3), .ct-row > :nth-child(4) { grid-column: 1 / -1; }
}
`;
(function () { if (document.getElementById("ct-css")) return; const s = document.createElement("style"); s.id = "ct-css"; s.textContent = CT_CSS; document.head.appendChild(s); })();

const CT_DOCS_URL_KEY = "sa-docs-url";
const CT_DOCS_TOKEN_KEY = "sa-docs-token";
const CT_DOCS_VIEW = "https://docs.spacioam.com/index.html?firmar=";
const CT_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function ctDay(v) { const d = new Date(v); if (!v || isNaN(d)) return ""; return d.getDate() + " " + CT_MES[d.getMonth()] + " " + d.getFullYear(); }
function ctProps() { return ((window.SpacioData && window.SpacioData.propertyList) || []).filter(p => p.name); }
function ctPropOptions() { return [...new Set(ctProps().map(p => p.name))].sort((a, b) => a.localeCompare(b, "es")).map(n => ({ value: n, label: n })); }
function ctUseTick() { const [, set] = ctUseState(0); ctUseEffect(() => { const h = () => set(x => x + 1); window.addEventListener("sa-rows", h); return () => window.removeEventListener("sa-rows", h); }, []); }
const CT_ESTADO = { firmado: "Firmado", enviado: "Enviado a firma", programado: "Programado", borrador: "Borrador", parcial: "Firma parcial", cancelado: "Cancelado", anulado: "Anulado" };

// JSONP contra el Web App de contratos (evita CORS)
function ctJsonp(url, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cb = "__saCt" + Date.now() + Math.floor(Math.random() * 1000);
    const qs = Object.keys(params).map(k => encodeURIComponent(k) + "=" + encodeURIComponent(params[k])).join("&");
    const s = document.createElement("script");
    const done = (fn, v) => { clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); fn(v); };
    const t = setTimeout(() => done(reject, new Error("timeout")), timeoutMs || 45000);
    window[cb] = (data) => done(resolve, data);
    s.onerror = () => done(reject, new Error("network"));
    s.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + qs + "&callback=" + cb;
    document.body.appendChild(s);
  });
}

function CtRow({ icon, title, meta, hint, children, actions }) {
  return (
    <div className="ct-row">
      <span className="ct-ic"><Icon name={icon || "file"} size={15} stroke="var(--ink)" /></span>
      <div className="ct-name"><b title={title}>{title}</b>{meta && <span title={meta}>{meta}</span>}{hint}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div className="ct-act">{actions}</div>
    </div>
  );
}

// ============================================================
// Setup (admin)
// ============================================================
function ContratosSetupCard({ lang }) {
  const es = lang !== "en"; const tr = (a, b) => (es ? a : b);
  ctUseTick();
  const [mode, setMode] = ctUseState("pdf");
  const propOptions = ctUseMemo(() => ctPropOptions(), []);
  const props = ctUseMemo(() => ctProps(), []);
  const saved = window.SaRows.list("Contratos");

  // --- A) sistema de contratos
  const [docsUrl, setDocsUrl] = ctUseState(() => localStorage.getItem(CT_DOCS_URL_KEY) || "");
  const [docsToken, setDocsToken] = ctUseState(() => localStorage.getItem(CT_DOCS_TOKEN_KEY) || "");
  const [remote, setRemote] = ctUseState(null); // [{id, folio, nombre, epiProp, estado, fecha, firmante, property_name, sure}]
  const [busy, setBusy] = ctUseState("");
  const [msg, setMsg] = ctUseState("");
  const sync = async () => {
    const url = docsUrl.trim(); if (!url) { setMsg(tr("Pega la URL del Web App de contratos (…/exec).", "Paste the contracts web app URL.")); return; }
    localStorage.setItem(CT_DOCS_URL_KEY, url); localStorage.setItem(CT_DOCS_TOKEN_KEY, docsToken.trim());
    setBusy("sync"); setMsg("");
    try {
      const r = await ctJsonp(url, { action: "listarDocs", token: docsToken.trim() });
      if (!r || !r.ok) throw new Error((r && r.error) || "sin respuesta");
      const byId = {}; saved.forEach(s => { byId[s.id] = s; });
      const list = (r.docs || []).filter(d => d && d.id && (d.propiedad || d.propiedadNombre || (d.data && (d.data.propiedadNombre || d.data.propiedadId)) || /cohost|co-host|propiet/i.test(String(d.tipo || "") + " " + String(d.categoria || ""))))
        .map(d => {
          const epiProp = d.propiedad || d.propiedadNombre || (d.data && d.data.propiedadNombre) || "";
          const prev = byId["DOC-" + d.id];
          const s = epiProp ? window.SaRows.suggestProperty(epiProp, props) : null;
          return {
            id: d.id, folio: d.folio || "", nombre: d.nombre || d.tipoLabel || tr("Contrato", "Contract"), epiProp, estado: d.estado || "",
            fecha: d.firmado || d.enviado || d.fecha || d.creado || "", firmante: d.firmanteNombre || "",
            property_name: prev ? prev.property_name : (s ? s.name : ""), sure: prev ? true : !!(s && s.sure), linked: !!prev,
          };
        }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      setRemote(list);
      setMsg(tr(list.length + " contrato(s) con propiedad en el sistema · " + list.filter(x => x.property_name).length + " emparejados.", list.length + " contract(s) found."));
    } catch (e) {
      setMsg(tr("No se pudo leer el sistema de contratos (" + e.message + "). Revisa la URL y el token.", "Could not read contracts (" + e.message + ")."));
    }
    setBusy("");
  };
  const setRemoteProp = (id, v) => setRemote(rs => rs.map(r => r.id === id ? Object.assign({}, r, { property_name: v, sure: true }) : r));
  const saveRemote = async () => {
    const rows = (remote || []).filter(r => r.property_name).map(r => ({
      id: "DOC-" + r.id, origen: "docs", property_name: r.property_name, nombre: r.nombre, folio: r.folio, fecha: r.fecha, estado: r.estado,
      url: CT_DOCS_VIEW + encodeURIComponent(r.id), archivo: "", sugerida: r.epiProp,
    }));
    if (!rows.length) return;
    setBusy("save");
    const res = await window.SaRows.upsert("Contratos", rows);
    setMsg(res.ok ? tr(rows.length + " contrato(s) vinculados. Los socios ya los ven en Mi cuenta.", rows.length + " linked.") + (res.local ? tr(" (solo en este navegador)", " (this browser only)") : "") : tr("No se pudo guardar: " + (res.error || "sin conexión"), "Could not save."));
    setRemote(rs => rs.map(r => r.property_name ? Object.assign({}, r, { linked: true }) : r));
    setBusy("");
  };

  // --- B) PDF antiguos
  const [pdfs, setPdfs] = ctUseState([]); // {id, file, name, property_name, sure, score}
  const [drag, setDrag] = ctUseState(false);
  const onPdfs = (list) => {
    const arr = [...(list || [])].filter(f => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name));
    setPdfs(prev => prev.concat(arr.filter(f => !prev.some(p => p.name === f.name && p.file.size === f.size)).map((f, i) => {
      const s = window.SaRows.suggestProperty(f.name, props);
      return { id: "PDF-" + Date.now() + "-" + i, file: f, name: f.name, nombre: f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " "), property_name: s ? s.name : "", sure: !!(s && s.sure), guessed: !!s };
    })));
    setMsg("");
  };
  const setPdf = (id, patch) => setPdfs(ps => ps.map(p => p.id === id ? Object.assign({}, p, patch) : p));
  const readyPdfs = pdfs.filter(p => p.property_name);
  const savePdfs = async () => {
    if (!readyPdfs.length) return;
    setBusy("pdf"); setMsg("");
    const rows = []; let fail = 0;
    for (const p of readyPdfs) {
      const r = await window.SaRows.uploadToDrive("contrato", p.file, { property_name: p.property_name, mes: "Contrato" });
      if (!r || !r.ok) { fail++; continue; }
      rows.push({ id: p.id, origen: "pdf", property_name: p.property_name, nombre: p.nombre, folio: "", fecha: new Date().toISOString().slice(0, 10), estado: "firmado", url: r.url, archivo: r.fileName || p.name, sugerida: p.guessed ? "archivo" : "" });
    }
    const res = rows.length ? await window.SaRows.upsert("Contratos", rows) : { ok: true };
    setPdfs(ps => ps.filter(p => !rows.some(r => r.id === p.id)));
    setMsg(fail && !rows.length
      ? tr("No se pudo subir a Drive. Revisa la conexión de escritura (arriba).", "Could not upload to Drive.")
      : tr(rows.length + " contrato(s) guardados en Drive y compartidos con su socio." + (fail ? " " + fail + " fallaron." : ""), rows.length + " saved.") + (res.local ? tr(" (registro solo en este navegador)", "") : ""));
    setBusy("");
  };

  // --- guardados
  const [showSaved, setShowSaved] = ctUseState(false);
  const reassign = (r, v) => { if (v) window.SaRows.upsert("Contratos", [Object.assign({}, r, { property_name: v })]); };
  const unlink = (r) => { if (window.confirm(tr("¿Dejar de compartir “" + r.nombre + "”? El archivo se queda en Drive.", "Stop sharing?"))) window.SaRows.remove("Contratos", [r.id]); };

  const pendRemote = (remote || []).filter(r => !r.linked).length;

  return (
    <div className="ct-card">
      <div className="ct-head"><Icon name="file" size={16} stroke="var(--ink)" /><b>{tr("Contratos de socios", "Owner contracts")}</b>
        <span className="ct-badge" style={{ marginLeft: "auto" }}>{saved.length} {tr("compartidos", "shared")}</span></div>
      <p className="ct-sub">{tr("Cada contrato queda vinculado a una propiedad y su socio lo ve en Mi cuenta → Documentos compartidos.", "Each contract is linked to a property; its owner sees it in My account.")}</p>
      <div className="ct-seg">
        <Segmented size="sm" value={mode} onChange={setMode} options={[
          { value: "pdf", label: tr("PDF antiguos", "Legacy PDFs") },
          { value: "docs", label: tr("Sistema de contratos", "Contracts system") },
          { value: "saved", label: tr("Compartidos", "Shared") + " · " + saved.length },
        ]} />
      </div>
      <div className="ct-body">
        {mode === "pdf" && (
          <React.Fragment>
            <label className={"ct-drop" + (drag ? " drag" : "")} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); onPdfs(e.dataTransfer.files); }}>
              <input type="file" accept="application/pdf,.pdf" multiple onChange={e => { onPdfs(e.target.files); e.target.value = ""; }} />
              <span className="ct-ic" style={{ background: "var(--alabaster)", width: 40, height: 40 }}><Icon name="upload" size={18} stroke="var(--ink)" /></span>
              <span>
                <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.03em", color: "var(--ink)" }}>{tr("Sube uno o varios PDF", "Upload one or more PDFs")}</span>
                <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 11, lineHeight: 1.55, letterSpacing: "0.03em", color: "var(--fg-muted)", marginTop: 3 }}>{tr("Sugerimos la propiedad por el nombre del archivo: “Contrato 623” → el apartamento 623; “Contrato Narama 1012” → Narama 1012.", "We suggest the property from the file name.")}</span>
              </span>
            </label>
            {pdfs.length > 0 && (
              <div className="ct-list">
                {pdfs.map(p => (
                  <CtRow key={p.id} title={p.name} meta={(p.file.size / 1024 / 1024).toFixed(1) + " MB"}
                    hint={p.property_name && p.guessed && p.property_name ? <span className="ct-hint"><Icon name="sparkles" size={11} stroke="var(--peach)" />{p.sure ? tr("Sugerida por el nombre", "Suggested by name") : tr("Sugerencia dudosa · confirma", "Unsure · confirm")}</span> : null}
                    actions={<button className="cf-eye" title={tr("Quitar", "Remove")} onClick={() => setPdfs(ps => ps.filter(x => x.id !== p.id))}><Icon name="x" size={14} stroke="currentColor" /></button>}>
                    <SaCombo size="sm" pending={!p.sure} value={p.property_name} onChange={v => setPdf(p.id, { property_name: v, sure: !!v, guessed: false })} options={propOptions} recentKey="sa-combo-props" placeholder={tr("Escribe la propiedad…", "Type the property…")} />
                  </CtRow>
                ))}
              </div>
            )}
            <div className="ct-foot">
              <span className="ct-msg" style={{ color: msg ? "var(--ink)" : "var(--fg-muted)" }}>{msg || (pdfs.length ? tr(readyPdfs.length + " de " + pdfs.length + " con propiedad asignada.", readyPdfs.length + " of " + pdfs.length + " assigned.") : "")}</span>
              {pdfs.length > 0 && <button className="cf-btn dark" onClick={savePdfs} disabled={!readyPdfs.length || busy === "pdf"}><Icon name="check" size={14} stroke="currentColor" />{busy === "pdf" ? tr("Subiendo…", "Uploading…") : tr("Guardar y compartir", "Save & share") + " · " + readyPdfs.length}</button>}
            </div>
          </React.Fragment>
        )}

        {mode === "docs" && (
          <React.Fragment>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <input className="sa-setup-input" style={{ flex: 2, minWidth: 220 }} value={docsUrl} onChange={e => setDocsUrl(e.target.value)} placeholder={tr("URL del Web App de contratos (…/exec)", "Contracts web app URL (…/exec)")} />
              <input className="sa-setup-input" style={{ flex: 1, minWidth: 140 }} value={docsToken} onChange={e => setDocsToken(e.target.value)} placeholder="TOKEN" />
              <button className="cf-btn dark" onClick={sync} disabled={busy === "sync"}><Icon name="link" size={14} stroke="currentColor" />{busy === "sync" ? tr("Leyendo…", "Reading…") : tr("Sincronizar", "Sync")}</button>
            </div>
            <p style={{ fontFamily: "var(--sans)", fontSize: 11, lineHeight: 1.6, letterSpacing: "0.03em", color: "var(--fg-muted)", margin: "0 0 14px" }}>
              {tr("Es la misma URL y token de docs.spacioam.com → Setup → Base de datos. Se traen los contratos que tienen propiedad vinculada en EPI.", "Same URL and token as docs.spacioam.com → Setup.")}
            </p>
            {remote && remote.length > 0 && (
              <div className="ct-list">
                {remote.map(r => (
                  <CtRow key={r.id} icon={r.estado === "firmado" ? "check" : "file"} title={(r.folio ? r.folio + " · " : "") + r.nombre}
                    meta={[CT_ESTADO[r.estado] || r.estado, r.firmante, ctDay(r.fecha)].filter(Boolean).join(" · ")}
                    hint={<span className="ct-hint">{tr("En EPI", "In EPI")}: {r.epiProp || "—"}{r.linked ? " · " + tr("vinculado", "linked") : ""}</span>}
                    actions={<a className="cf-eye" href={CT_DOCS_VIEW + encodeURIComponent(r.id)} target="_blank" rel="noreferrer" title={tr("Ver contrato", "View contract")}><Icon name="eye" size={15} stroke="currentColor" /></a>}>
                    <SaCombo size="sm" pending={!r.sure} value={r.property_name} onChange={v => setRemoteProp(r.id, v)} options={propOptions} recentKey="sa-combo-props" placeholder={tr("Propiedad del dashboard…", "Dashboard property…")} />
                  </CtRow>
                ))}
              </div>
            )}
            <div className="ct-foot">
              <span className="ct-msg" style={{ color: msg ? "var(--ink)" : "var(--fg-muted)" }}>{msg}</span>
              {remote && remote.length > 0 && <button className="cf-btn dark" onClick={saveRemote} disabled={busy === "save" || !remote.some(r => r.property_name)}><Icon name="check" size={14} stroke="currentColor" />{tr("Vincular", "Link")} · {remote.filter(r => r.property_name).length}{pendRemote ? "" : ""}</button>}
            </div>
          </React.Fragment>
        )}

        {mode === "saved" && (
          saved.length ? (
            <div className="ct-list">
              {saved.slice().sort((a, b) => String(a.property_name).localeCompare(String(b.property_name), "es")).map(r => (
                <CtRow key={r.id} icon={r.origen === "docs" ? "check" : "file"} title={r.nombre || r.archivo}
                  meta={[r.origen === "docs" ? tr("Sistema de contratos", "Contracts system") : "PDF", r.folio, ctDay(r.fecha)].filter(Boolean).join(" · ")}
                  actions={<React.Fragment>
                    {r.url && <a className="cf-eye" href={r.url} target="_blank" rel="noreferrer" title={tr("Ver", "View")}><Icon name="eye" size={15} stroke="currentColor" /></a>}
                    <button className="cf-eye" title={tr("Dejar de compartir", "Unshare")} onClick={() => unlink(r)}><Icon name="trash" size={14} stroke="currentColor" /></button>
                  </React.Fragment>}>
                  <SaCombo size="sm" value={r.property_name} onChange={v => reassign(r, v)} options={propOptions} recentKey="sa-combo-props" />
                </CtRow>
              ))}
            </div>
          ) : <p className="ct-msg" style={{ color: "var(--fg-muted)" }}>{tr("Aún no hay contratos compartidos.", "No shared contracts yet.")}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Mi cuenta (socio)
// ============================================================
function ContratosAccountCard({ lang, props }) {
  const es = lang !== "en"; const tr = (a, b) => (es ? a : b);
  ctUseTick();
  const names = new Set((props || []).map(p => window.SaRows.norm(p.name)));
  const docs = window.SaRows.list("Contratos").filter(r => r.url && names.has(window.SaRows.norm(r.property_name)))
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  const multi = (props || []).length > 1;
  return (
    <Card pad={24}>
      <div style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 6 }}>{tr("Documentos compartidos", "Shared documents")}</div>
      <p style={{ fontFamily: "var(--sans)", fontSize: 12, lineHeight: 1.6, letterSpacing: "0.03em", color: "var(--fg-muted)", margin: "0 0 8px" }}>{tr("Los documentos que compartimos contigo, empezando por tu contrato.", "Documents we've shared with you, starting with your contract.")}</p>
      {docs.length ? docs.map(d => (
        <a key={d.id} className="ct-doc" href={d.url} target="_blank" rel="noreferrer">
          <span className="ct-ic"><Icon name="file" size={16} stroke="var(--ink)" /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="ct-doc-t" style={{ display: "block" }}>{d.nombre || tr("Contrato", "Contract")}</span>
            <span className="ct-doc-m" style={{ display: "block" }}>{[multi ? d.property_name : "", d.folio, ctDay(d.fecha)].filter(Boolean).join(" · ")}</span>
          </span>
          {d.estado === "firmado" && <span className="ct-badge ok"><Icon name="check" size={10} stroke="currentColor" />{tr("Firmado", "Signed")}</span>}
          <Icon name="arrowUpRight" size={16} stroke="var(--fg-muted)" />
        </a>
      )) : (
        <p style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.03em", color: "var(--fg-muted)", margin: "12px 0 0" }}>{tr("Aún no hay documentos compartidos. Te avisamos cuando subamos tu contrato.", "No shared documents yet.")}</p>
      )}
    </Card>
  );
}

Object.assign(window, { ContratosSetupCard, ContratosAccountCard });
