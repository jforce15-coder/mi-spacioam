// ============================================================
// Spacio AM — Ficha del socio (solo el administrador principal) · Hub #522
// ------------------------------------------------------------
// Lo que cada socio le ha contado a Alma: notas y detalles que importan (con su fecha). Alma la lee antes de hablar con
// el socio y la completa sola; aquí Juan la ve, la corrige y la borra. Vive en un libro privado de Mi (no en la hoja de
// Mi, que se lee pública): la trae la op «fichaSocio» del Apps Script (apps-script/fichasocio.js), que solo responde a la
// sesión del administrador principal.
// ============================================================
const { useState: fsUseState, useEffect: fsUseEffect, useMemo: fsUseMemo, useRef: fsUseRef } = React;

const FS_CSS = `
.fs-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 18px; }
.fs-q { flex: 1 1 220px; min-width: 0; box-sizing: border-box; font-family: var(--sans); font-size: 14px; color: var(--ink); padding: 12px 16px; min-height: 44px; border: 1px solid var(--divider); border-radius: 999px; background: var(--surface, #fff); outline: none; }
.fs-q:focus, .fs-in:focus { border-color: var(--ink); box-shadow: var(--focus-ring, 0 0 0 3px rgba(233,130,106,0.35)); }
.fs-list { display: flex; flex-direction: column; gap: 14px; }
.fs-card { background: var(--alabaster); border: 1px solid var(--ink-08); border-radius: 24px; box-shadow: var(--shadow-sm); padding: 20px 20px 14px; }
.fs-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.fs-name { font-family: var(--serif); font-size: 22px; line-height: 1.15; color: var(--ink); margin: 0; overflow-wrap: anywhere; }
.fs-props { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.fs-chip { font-family: var(--sans); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); background: var(--bg-alt); border-radius: 999px; padding: 4px 10px; }
.fs-grp { font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-muted); margin: 16px 0 4px; }
.fs-it { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--ink-08); }
.fs-it:first-of-type { border-top: none; }
.fs-txt { flex: 1; min-width: 0; font-family: var(--sans); font-size: 14px; line-height: 1.5; color: var(--ink); overflow-wrap: anywhere; }
.fs-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; margin-top: 4px; font-family: var(--sans); font-size: 11px; letter-spacing: 0.03em; color: var(--fg-muted); }
.fs-date { color: var(--ink); font-weight: 600; }
.fs-ok { color: var(--color-success, #3d6b52); }
.fs-acts { display: flex; gap: 2px; flex-shrink: 0; }
.fs-ib { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; border-radius: 50%; color: var(--fg-muted); cursor: pointer; }
.fs-ib:hover { background: var(--bg-alt); color: var(--ink); }
.fs-form { display: flex; flex-direction: column; gap: 8px; padding: 10px 0; }
.fs-in { width: 100%; box-sizing: border-box; font-family: var(--sans); font-size: 14px; color: var(--ink); padding: 11px 14px; border: 1px solid var(--divider); border-radius: 14px; background: var(--surface, #fff); outline: none; resize: vertical; }
.fs-in.err { border-color: var(--color-error, #C0392B); }
.fs-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.fs-row .fs-in { width: auto; flex: 1 1 150px; }
.fs-btn { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; border: none; cursor: pointer; border-radius: 999px; padding: 0 18px; font-family: var(--sans); font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; background: var(--ink); color: var(--alabaster); }
.fs-btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--divider); }
.fs-btn.peach { background: var(--peach-12, rgba(233,130,106,0.12)); color: var(--ink); border: 1px solid var(--peach, #E9826A); }
.fs-btn:disabled { opacity: .5; cursor: default; }
.fs-seg { display: inline-flex; border: 1px solid var(--divider); border-radius: 999px; padding: 3px; }
.fs-seg button { min-height: 38px; border: none; background: transparent; border-radius: 999px; padding: 0 14px; font-family: var(--sans); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-muted); cursor: pointer; }
.fs-seg button.on { background: var(--ink); color: var(--alabaster); }
.fs-err { font-family: var(--sans); font-size: 12px; color: var(--color-error, #C0392B); margin: 4px 0 0; }
.fs-empty { padding: 36px 20px; text-align: center; font-family: var(--sans); font-size: 13px; line-height: 1.6; color: var(--fg-muted); }
.fs-sk { height: 12px; border-radius: 6px; background: linear-gradient(90deg, var(--bg-alt) 0%, var(--ink-08) 50%, var(--bg-alt) 100%); background-size: 200% 100%; animation: fs-sk 1.4s var(--ease, ease) infinite; margin: 10px 0; }
@keyframes fs-sk { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .fs-sk { animation: none; } }
`;

const FS_TX = {
  es: { eyebrow: "Socios", title: "Ficha del socio", sub: "Lo que cada socio le ha contado a Alma. Ella la lee antes de hablar con él, la completa sola y retoma un detalle con calidez una sola vez. Aquí la corriges o la borras.",
    buscar: "Buscar socio o apartamento", detalles: "Detalles que importan", notas: "Notas", agregar: "Agregar", otro: "Agregar a otro socio", elegir: "Elige un socio",
    nota: "Nota", detalle: "Detalle", texto: "Qué contó (sin salud, religión, política ni datos bancarios)", guardar: "Guardar", cancelar: "Cancelar", borrar: "¿Borrar?", si: "Sí, borrar", no: "No",
    retomado: "Alma ya lo retomó", vacio: "Todavía no hay fichas. Alma las arma sola conforme conversa con cada socio (WhatsApp, encargos y llamadas).", sinRes: "Ningún socio coincide con la búsqueda.",
    error: "No pude traer las fichas", reintentar: "Reintentar", falta: "Escribe qué contó (3 letras o más).", editar: "Corregir", quitar: "Borrar", fecha: "Fecha del evento", soloPrincipal: "Solo el administrador principal ve las fichas." },
  en: { eyebrow: "Partners", title: "Partner profile", sub: "What each partner has told Alma. She reads it before talking to them, fills it in on her own and brings up a detail warmly only once. Here you correct or delete it.",
    buscar: "Search partner or apartment", detalles: "Details that matter", notas: "Notes", agregar: "Add", otro: "Add to another partner", elegir: "Choose a partner",
    nota: "Note", detalle: "Detail", texto: "What they shared (no health, religion, politics or banking data)", guardar: "Save", cancelar: "Cancel", borrar: "Delete?", si: "Yes, delete", no: "No",
    retomado: "Alma already brought it up", vacio: "No profiles yet. Alma builds them as she talks with each partner (WhatsApp, errands and calls).", sinRes: "No partner matches the search.",
    error: "Could not load the profiles", reintentar: "Retry", falta: "Write what they shared (3 letters or more).", editar: "Edit", quitar: "Delete", fecha: "Event date", soloPrincipal: "Only the main administrator sees the profiles." },
};
const FS_FUENTE = { whatsapp: "WhatsApp", encargo: "Encargo", llamada: "Llamada", chat: "Chat con Alma", mi: "Mi" };

function fsFecha(s, lang) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return "";
  const mes = (lang === "es" ? ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])[+m[2] - 1];
  return (+m[3]) + " " + mes + " " + m[1];
}
function fsClave(o) { return String(o.socio_correo || "").toLowerCase() || ("tel:" + String(o.socio_tel || "").replace(/\D/g, "").slice(-8)); }
function fsSacudir(el) { try { if (el && window.SAMov) window.SAMov.sacudir(el); } catch (e) {} }

function FsForm({ L, inicial, onGuardar, onCancelar }) {
  const [tipo, setTipo] = fsUseState(inicial.tipo || "nota");
  const [texto, setTexto] = fsUseState(inicial.texto || "");
  const [fecha, setFecha] = fsUseState(inicial.fecha_evento || "");
  const [err, setErr] = fsUseState("");
  const ref = fsUseRef(null);
  const guardar = () => {
    if (texto.trim().length < 3) { setErr(L.falta); fsSacudir(ref.current); return; }
    onGuardar({ tipo, texto: texto.trim(), fecha_evento: tipo === "detalle" ? fecha : "" });
  };
  return (
    <div className="fs-form">
      <div className="fs-seg" role="group">
        {["detalle", "nota"].map(k => <button key={k} type="button" className={tipo === k ? "on" : ""} onClick={() => setTipo(k)}>{L[k]}</button>)}
      </div>
      <textarea ref={ref} className={"fs-in" + (err ? " err" : "")} rows={2} maxLength={300} value={texto} placeholder={L.texto}
        onChange={e => { setTexto(e.target.value); if (err) setErr(""); }} />
      {err && <p className="fs-err">{err}</p>}
      <div className="fs-row">
        {tipo === "detalle" && <input className="fs-in" type="date" value={fecha} aria-label={L.fecha} onChange={e => setFecha(e.target.value)} />}
        <button className="fs-btn" type="button" onClick={guardar}>{L.guardar}</button>
        <button className="fs-btn ghost" type="button" onClick={onCancelar}>{L.cancelar}</button>
      </div>
    </div>
  );
}

function FsItem({ it, L, lang, onCorregir, onBorrar }) {
  const [modo, setModo] = fsUseState("");
  const ref = fsUseRef(null);
  if (modo === "editar") return <FsForm L={L} inicial={it} onCancelar={() => setModo("")} onGuardar={c => { setModo(""); onCorregir(it, c); }} />;
  return (
    <div className="fs-it" ref={ref}>
      <div className="fs-txt">
        {it.texto}
        <div className="fs-meta">
          {it.fecha_evento && <span className="fs-date">{fsFecha(it.fecha_evento, lang)}</span>}
          {it.retomado && <span className="fs-ok">✓ {L.retomado} · {fsFecha(it.retomado, lang)}</span>}
          <span>{FS_FUENTE[it.fuente] || it.fuente || "Mi"} · {fsFecha(it.creado, lang)}</span>
        </div>
        {modo === "borrar" && (
          <div className="fs-row" style={{ marginTop: 8 }}>
            <span className="fs-meta" style={{ margin: 0 }}>{L.borrar}</span>
            <button className="fs-btn peach" type="button" onClick={() => { setModo(""); onBorrar(it, ref.current); }}>{L.si}</button>
            <button className="fs-btn ghost" type="button" onClick={() => setModo("")}>{L.no}</button>
          </div>
        )}
      </div>
      {modo === "" && (
        <div className="fs-acts">
          <button className="fs-ib" type="button" aria-label={L.editar} title={L.editar} onClick={() => setModo("editar")}><Icon name="pencil" size={17} /></button>
          <button className="fs-ib" type="button" aria-label={L.quitar} title={L.quitar} onClick={() => setModo("borrar")}><Icon name="trash" size={17} /></button>
        </div>
      )}
    </div>
  );
}

function FsSocio({ s, L, lang, abrir, onAnotar, onCorregir, onBorrar, onCerrar }) {
  const [nuevo, setNuevo] = fsUseState(!!abrir);
  const det = s.items.filter(x => x.tipo === "detalle").sort((a, b) => String(b.fecha_evento || b.creado).localeCompare(String(a.fecha_evento || a.creado)));
  const notas = s.items.filter(x => x.tipo !== "detalle");
  const fila = it => <FsItem key={it.id} it={it} L={L} lang={lang} onCorregir={onCorregir} onBorrar={onBorrar} />;
  return (
    <div className="fs-card">
      <div className="fs-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="fs-name">{s.nombre || s.correo || ("+" + s.tel)}</h3>
          <div className="fs-props">{s.propiedades.map(p => <span key={p} className="fs-chip">{p}</span>)}</div>
        </div>
        {!nuevo && <button className="fs-btn ghost" type="button" onClick={() => setNuevo(true)}><Icon name="plus" size={14} /> {L.agregar}</button>}
      </div>
      {nuevo && <FsForm L={L} inicial={{ tipo: "detalle" }} onCancelar={() => { setNuevo(false); if (onCerrar) onCerrar(); }} onGuardar={c => { setNuevo(false); onAnotar(s, c); }} />}
      {det.length > 0 && <div className="fs-grp">{L.detalles}</div>}
      {det.map(fila)}
      {notas.length > 0 && <div className="fs-grp">{L.notas}</div>}
      {notas.map(fila)}
    </div>
  );
}

function FichaSocioSection({ lang }) {
  const L = FS_TX[lang === "en" ? "en" : "es"];
  const [items, setItems] = fsUseState(null);   // null = todavía no llega
  const [error, setError] = fsUseState("");
  const [q, setQ] = fsUseState("");
  const [otro, setOtro] = fsUseState("");
  const cargar = async () => {
    setError("");
    const r = await window.SpacioWrite.post("fichaSocio", { op: "listar" }, { timeout: 30000 });
    if (r && r.ok) setItems(r.items || []);
    else { setItems(x => x || []); setError(r && r.unauthorized ? L.soloPrincipal : (L.error + (r && r.error ? ": " + r.error : ""))); }
  };
  fsUseEffect(() => { cargar(); }, []);

  /* Socios de Mi (correo, nombre y apartamentos) para nombrar las fichas y agregar a uno que aún no tiene. */
  const duenos = fsUseMemo(() => ((window.SpacioData && window.SpacioData.owners) || []).filter(o => o.email), []);
  const socios = fsUseMemo(() => {
    const por = {};
    (items || []).forEach(it => {
      const k = fsClave(it);
      const s = por[k] = por[k] || { clave: k, correo: it.socio_correo, tel: it.socio_tel, nombre: "", propiedades: [], items: [] };
      s.items.push(it);
      if (!s.nombre && it.socio_nombre) s.nombre = it.socio_nombre;
      if (it.propiedad && s.propiedades.indexOf(it.propiedad) < 0) s.propiedades.push(it.propiedad);
    });
    if (otro && !por[otro]) { const d = duenos.find(o => o.email.toLowerCase() === otro); if (d) por[otro] = { clave: otro, correo: d.email, tel: "", nombre: d.name, propiedades: (d.props || []).slice(0, 4), items: [] }; }
    Object.values(por).forEach(s => {
      const d = s.correo && duenos.find(o => o.email.toLowerCase() === String(s.correo).toLowerCase());
      if (d && !s.nombre) s.nombre = d.name;
      if (d && !s.propiedades.length) s.propiedades = (d.props || []).slice(0, 4);
    });
    const t = q.trim().toLowerCase();
    return Object.values(por)
      .filter(s => !t || [s.nombre, s.correo, s.tel].concat(s.propiedades).join(" ").toLowerCase().indexOf(t) >= 0)
      .sort((a, b) => (a.clave === otro ? -1 : b.clave === otro ? 1 : String(a.nombre || a.correo).localeCompare(String(b.nombre || b.correo), "es")));
  }, [items, q, otro, duenos]);

  /* Lo que casi nunca falla se ve hecho al instante y se deshace si falla (ds/velocidad.md). */
  const escribir = async (cuerpo, antes, despues) => {
    setItems(despues); setError("");
    const r = await window.SpacioWrite.post("fichaSocio", cuerpo, { timeout: 30000 });
    if (!r || !r.ok) { setItems(antes); setError((r && r.error) || L.error); return null; }
    return r;
  };
  const onCorregir = (it, c) => { const antes = items; escribir(Object.assign({ op: "corregir", id: it.id }, c), antes, antes.map(x => x.id === it.id ? Object.assign({}, x, c) : x)); };
  const onBorrar = (it, el) => {
    const antes = items, quitar = () => escribir({ op: "borrar", id: it.id }, antes, antes.filter(x => x.id !== it.id));
    if (el && window.SAMov && window.SAMov.quitar) window.SAMov.quitar(el, quitar); else quitar();
  };
  const onAnotar = async (s, c) => {
    const antes = items, tmp = Object.assign({ id: "tmp" + Date.now(), socio_correo: s.correo || "", socio_tel: s.tel || "", socio_nombre: s.nombre || "", propiedad: s.propiedades[0] || "", fuente: "mi", creado: new Date().toISOString() }, c);
    const r = await escribir({ op: "anotar", correo: tmp.socio_correo, tel: tmp.socio_tel, nombre: tmp.socio_nombre, propiedad: tmp.propiedad, tipo: c.tipo, texto: c.texto, fecha_evento: c.fecha_evento, fuente: "mi" }, antes, antes.concat([tmp]));
    if (r && r.id) setItems(xs => (xs || []).map(x => x.id === tmp.id ? Object.assign({}, x, { id: r.id }) : x));
    if (r && r.duplicado) setItems(xs => (xs || []).filter(x => x.id !== tmp.id));
    if (r) setOtro("");
  };

  const sinFicha = duenos.filter(d => !socios.some(s => String(s.correo || "").toLowerCase() === d.email.toLowerCase()));
  return (
    <div>
      <style>{FS_CSS}</style>
      <SectionHead eyebrow={L.eyebrow} title={L.title} sub={L.sub} />
      <div className="fs-bar">
        <input className="fs-q" type="search" value={q} placeholder={L.buscar} aria-label={L.buscar} onChange={e => setQ(e.target.value)} />
        {sinFicha.length > 0 && (
          <select className="fs-q" style={{ flex: "0 1 260px" }} value="" aria-label={L.otro} onChange={e => { setOtro(e.target.value.toLowerCase()); setQ(""); }}>
            <option value="">{L.otro}</option>
            {sinFicha.map(d => <option key={d.email} value={d.email}>{d.name + (d.props && d.props[0] ? " · " + d.props[0] : "")}</option>)}
          </select>
        )}
      </div>
      {error && <p className="fs-err" style={{ marginBottom: 12 }}>{error} {items !== null && <button className="fs-btn ghost" type="button" style={{ marginLeft: 8 }} onClick={cargar}>{L.reintentar}</button>}</p>}
      {items === null ? (
        <div className="fs-list">{[0, 1].map(i => <div key={i} className="fs-card"><div className="fs-sk" style={{ width: "40%", height: 18 }} /><div className="fs-sk" style={{ width: "85%" }} /><div className="fs-sk" style={{ width: "60%" }} /></div>)}</div>
      ) : socios.length ? (
        <div className="fs-list">{socios.map(s => <FsSocio key={s.clave} s={s} L={L} lang={lang} abrir={s.clave === otro && !s.items.length} onCerrar={() => setOtro("")} onAnotar={onAnotar} onCorregir={onCorregir} onBorrar={onBorrar} />)}</div>
      ) : (
        <div className="fs-card fs-empty">{q ? L.sinRes : L.vacio}</div>
      )}
    </div>
  );
}
window.FichaSocioSection = FichaSocioSection;
