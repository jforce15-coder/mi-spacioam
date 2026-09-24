// ============================================================
// Spacio AM — SaCombo: selector con autocompletado en línea
// ------------------------------------------------------------
// • Se escribe directo en el campo; la opción más probable aparece
//   completada en gris (como el autocorrect de iOS). Enter o Tab la
//   aceptan sin tocar el mouse. ↑ ↓ recorren la lista, Esc cancela.
// • La lista flota en <body> (portal + position:fixed): nunca queda
//   detrás de otro bloque ni recortada por un contenedor con scroll.
// • Aprende: lo que más eliges sube en el ranking (recentKey).
// ============================================================
const { useState: scUseState, useEffect: scUseEffect, useRef: scUseRef, useMemo: scUseMemo, useLayoutEffect: scUseLayoutEffect } = React;

const SA_COMBO_CSS = `
.sac { position: relative; min-width: 0; }
.sac-field { position: relative; display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box; background: var(--alabaster); border: 1px solid var(--warm-grey); border-radius: 10px; padding: 0 9px 0 11px; cursor: text; transition: border-color .18s var(--ease), box-shadow .18s var(--ease); }
.sac-field:hover { border-color: var(--fg-muted); }
.sac.open .sac-field { border-color: var(--ink); box-shadow: 0 0 0 3px rgba(233,130,106,0.22); }
.sac.pending .sac-field { background: var(--peach-12); border-color: var(--peach); }
.sac-text { position: relative; flex: 1; min-width: 0; }
.sac-input, .sac-ghost { font-family: var(--sans); font-size: 12.5px; letter-spacing: 0.01em; line-height: 18px; padding: 8px 0; margin: 0; }
.sac-input { position: relative; z-index: 1; width: 100%; border: none; outline: none; background: transparent; color: var(--ink); text-overflow: ellipsis; }
.sac-input::placeholder { color: var(--fg-muted); }
.sac.pending .sac-input::placeholder { color: var(--attention-text); }
.sac-ghost { position: absolute; inset: 0; white-space: pre; overflow: hidden; color: var(--fg-subtle); pointer-events: none; }
.sac-ghost .q { visibility: hidden; }
.sac-sm .sac-input, .sac-sm .sac-ghost { font-size: 11.5px; padding: 6px 0; line-height: 16px; }
.sac-sm .sac-field { border-radius: 9px; padding: 0 7px 0 9px; }
.sac-ic { flex-shrink: 0; display: inline-flex; color: var(--fg-muted); border: none; background: transparent; padding: 2px; cursor: pointer; border-radius: 6px; }
.sac-ic:hover { color: var(--ink); }
.sac-pop { position: fixed; z-index: 1000; background: var(--alabaster); border: 1px solid var(--ink-08); border-radius: 14px; box-shadow: var(--shadow-md); padding: 6px; overflow-y: auto; overscroll-behavior: contain; animation: sa-fade .18s var(--ease); }
.sac-grp { font-family: var(--sans); font-size: 9px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-muted); padding: 10px 10px 4px; }
.sac-opt { display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; cursor: pointer; text-align: left; padding: 8px 10px; border-radius: 9px; font-family: var(--sans); font-size: 12.5px; letter-spacing: 0.01em; color: var(--ink); }
.sac-opt.act { background: var(--beige-soft); }
.sac-opt .sub { font-size: 10.5px; letter-spacing: 0.04em; color: var(--fg-muted); margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
.sac-opt mark { background: transparent; color: var(--ink); font-weight: 600; }
.sac-opt .kbd { margin-left: auto; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); border: 1px solid var(--warm-grey); border-radius: 6px; padding: 2px 6px; }
.sac-empty { padding: 12px 10px; font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.03em; color: var(--fg-muted); }
.sac-foot { display: flex; gap: 12px; padding: 8px 10px 4px; margin-top: 4px; border-top: 1px solid var(--ink-08); font-family: var(--sans); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-muted); }
`;
(function () { if (document.getElementById("sac-css")) return; const s = document.createElement("style"); s.id = "sac-css"; s.textContent = SA_COMBO_CSS; document.head.appendChild(s); })();

function sacNorm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function sacUsage(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
function sacBump(key, v) { if (!key || !v) return; const u = sacUsage(key); u[v] = (u[v] || 0) + 1; try { localStorage.setItem(key, JSON.stringify(u)); } catch (e) {} }

// puntaje de una opción para lo escrito
function sacScore(o, q, usage) {
  const L = sacNorm(o.label); const G = sacNorm(o.group || ""); const K = sacNorm(o.kw || "");
  let s = 0;
  if (L === q) s = 100;
  else if (L.indexOf(q) === 0) s = 85;
  else if (L.split(/[^a-z0-9]+/).some(w => w && w.indexOf(q) === 0)) s = 65;
  else if (L.indexOf(q) >= 0) s = 45;
  else if (K && K.indexOf(q) >= 0) s = 40;
  else if (G && G.indexOf(q) >= 0) s = 25;
  else {
    let i = 0; for (const ch of L) { if (ch === q[i]) i++; if (i === q.length) break; }
    if (i === q.length) s = 15;
  }
  if (!s) return 0;
  return s + Math.min(10, (usage[o.value] || 0) * 2) - Math.min(8, L.length / 12);
}

function SaCombo({ value, options, onChange, placeholder, allowCreate, createLabel, clearable, pending, size, recentKey, width, disabled, autoFocus }) {
  const [open, setOpen] = scUseState(false);
  const [q, setQ] = scUseState("");
  const [act, setAct] = scUseState(0);
  const [pos, setPos] = scUseState(null);
  const wrapRef = scUseRef(null), inputRef = scUseRef(null), popRef = scUseRef(null);
  const cur = (options || []).find(o => o.value === value);
  const usage = scUseMemo(() => (recentKey ? sacUsage(recentKey) : {}), [recentKey, open]);
  const qn = sacNorm(q.trim());

  const ranked = scUseMemo(() => {
    if (!qn) return null;
    return (options || []).map(o => ({ o, s: sacScore(o, qn, usage) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 60).map(x => x.o);
  }, [qn, options, usage]);
  const canCreate = allowCreate && q.trim() && !(options || []).some(o => sacNorm(o.label) === qn);
  const flat = ranked || (options || []);
  const rows = flat.concat(canCreate ? [{ value: "__create", label: q.trim(), create: true }] : []);
  const best = ranked && ranked[0];
  const ghost = best && sacNorm(best.label).indexOf(qn) === 0 && q.length > 0 ? best.label.slice(q.length) : "";

  const place = () => {
    const el = wrapRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const W = Math.max(r.width, 240), vh = window.innerHeight;
    const below = vh - r.bottom - 12, above = r.top - 12;
    const up = below < 220 && above > below;
    const maxH = Math.max(160, Math.min(340, up ? above : below));
    let left = r.left; if (left + W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - W);
    setPos({ left, width: W, maxH, top: up ? null : r.bottom + 6, bottom: up ? vh - r.top + 6 : null });
  };
  scUseLayoutEffect(() => { if (open) place(); }, [open]);
  scUseEffect(() => {
    if (!open) return;
    const h = () => place();
    const out = (e) => { if (wrapRef.current && wrapRef.current.contains(e.target)) return; if (popRef.current && popRef.current.contains(e.target)) return; close(); };
    window.addEventListener("scroll", h, true); window.addEventListener("resize", h); document.addEventListener("mousedown", out); document.addEventListener("touchstart", out);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); document.removeEventListener("mousedown", out); document.removeEventListener("touchstart", out); };
  }, [open]);
  scUseEffect(() => { setAct(0); }, [qn]);
  scUseEffect(() => {
    if (!open || !popRef.current) return;
    const el = popRef.current.querySelector('[data-i="' + act + '"]');
    if (el) { const p = popRef.current; const t = el.offsetTop, b = t + el.offsetHeight; if (t < p.scrollTop) p.scrollTop = t - 6; else if (b > p.scrollTop + p.clientHeight) p.scrollTop = b - p.clientHeight + 6; }
  }, [act, open]);

  const openUp = () => { if (disabled) return; setOpen(true); setQ(""); setAct(Math.max(0, (options || []).findIndex(o => o.value === value))); };
  const close = () => { setOpen(false); setQ(""); };
  const pick = (o) => {
    if (!o) return;
    const v = o.create ? q.trim() : o.value;
    sacBump(recentKey, v);
    onChange && onChange(v, !!o.create);
    close(); if (inputRef.current) inputRef.current.blur();
  };
  const onKey = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); openUp(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAct(a => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(rows[act] || best); }
    else if (e.key === "Tab") { if (ghost || (qn && rows[act])) { e.preventDefault(); pick(rows[act] || best); } else close(); }
    else if (e.key === "ArrowRight" && ghost && e.target.selectionStart === q.length) { e.preventDefault(); setQ(q + ghost); }
    else if (e.key === "Escape") { e.preventDefault(); close(); inputRef.current && inputRef.current.blur(); }
  };

  const hl = (label) => {
    if (!qn) return label;
    const i = sacNorm(label).indexOf(qn); if (i < 0) return label;
    return <React.Fragment>{label.slice(0, i)}<mark>{label.slice(i, i + qn.length)}</mark>{label.slice(i + qn.length)}</React.Fragment>;
  };
  const optBtn = (o, i) => (
    <button key={(o.create ? "c:" : "") + o.value + ":" + i} data-i={i} type="button" className={"sac-opt" + (i === act ? " act" : "")}
      onMouseDown={e => e.preventDefault()} onMouseEnter={() => setAct(i)} onClick={() => pick(o)}>
      {o.create ? <Icon name="plus" size={13} stroke="var(--fg-muted)" /> : (o.value === value ? <Icon name="check" size={13} stroke="var(--peach)" /> : <span style={{ width: 13, flexShrink: 0 }}></span>)}
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.create ? ((createLabel || "Agregar") + " “" + o.label + "”") : hl(o.label)}</span>
      {i === act && qn ? <span className="kbd">Enter</span> : (o.sub || (ranked && o.group)) ? <span className="sub">{o.sub || o.group}</span> : null}
    </button>
  );

  // lista agrupada cuando no se ha escrito nada
  let body;
  if (!rows.length) body = <div className="sac-empty">Sin coincidencias{allowCreate ? " — escribe para agregar una nueva" : ""}.</div>;
  else if (!ranked && flat.some(o => o.group)) {
    const out = []; let g = null;
    flat.forEach((o, i) => { if (o.group !== g) { g = o.group; out.push(<div key={"g" + i} className="sac-grp">{g}</div>); } out.push(optBtn(o, i)); });
    body = out;
  } else body = rows.map(optBtn);

  const pop = open && pos ? ReactDOM.createPortal(
    <div ref={popRef} className="sac-pop" style={{ left: pos.left, width: pos.width, maxHeight: pos.maxH, top: pos.top != null ? pos.top : "auto", bottom: pos.bottom != null ? pos.bottom : "auto" }}>
      {clearable && value && !qn && (
        <button type="button" className="sac-opt" onMouseDown={e => e.preventDefault()} onClick={() => { onChange && onChange(""); close(); }} style={{ color: "var(--fg-muted)" }}>
          <Icon name="x" size={13} stroke="var(--fg-muted)" />Quitar selección
        </button>
      )}
      {body}
      <div className="sac-foot"><span>↑↓ mover</span><span>Enter elegir</span><span>Esc cerrar</span></div>
    </div>, document.body) : null;

  return (
    <div ref={wrapRef} className={"sac" + (open ? " open" : "") + (pending && !value ? " pending" : "") + (size === "sm" ? " sac-sm" : "")} style={{ width: width || "100%", maxWidth: "100%" }}>
      <div className="sac-field" onMouseDown={e => { if (e.target === inputRef.current) return; e.preventDefault(); if (!open) openUp(); inputRef.current && inputRef.current.focus(); }}>
        <div className="sac-text">
          {open && ghost ? <div className="sac-ghost" aria-hidden="true"><span className="q">{q}</span>{ghost}</div> : null}
          <input ref={inputRef} className="sac-input" autoFocus={autoFocus} disabled={disabled} role="combobox" aria-expanded={open} aria-autocomplete="inline"
            value={open ? q : (cur ? cur.label : (value || ""))} placeholder={open ? (cur ? cur.label : (placeholder || "Escribe para buscar…")) : (placeholder || "—")}
            title={cur ? cur.label : ""} onFocus={() => { if (!open) openUp(); }} onChange={e => { if (!open) setOpen(true); setQ(e.target.value); }} onKeyDown={onKey} />
        </div>
        <span className="sac-ic" aria-hidden="true"><Icon name={open ? "search" : "chevronDown"} size={13} stroke="currentColor" /></span>
      </div>
      {pop}
    </div>
  );
}

Object.assign(window, { SaCombo, sacNorm });
