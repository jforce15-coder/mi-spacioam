// ============================================================
// Spacio AM — Confirmar manteniendo presionado (300 ms)
// Reemplaza contraseñas y window.confirm en acciones que piden una
// confirmación extra. Si sueltas antes de 300 ms, no pasa nada.
//   <HoldButton label="Mantén para eliminar" danger onConfirm={fn} />
//   if (await window.saConfirm("¿Eliminar este gasto?")) …
// ============================================================
const HC_MS = 300;
const HC_CSS = `
.hc-btn { position: relative; overflow: hidden; isolation: isolate; display: flex; align-items: center; gap: 14px; width: 100%; min-height: 60px; padding: 10px 18px 10px 10px; border-radius: 999px; border: 1px solid var(--ink); background: var(--surface, #fff); color: var(--ink); font-family: var(--sans); cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none; text-align: left; transition: transform .18s var(--ease), border-color .18s var(--ease); }
.hc-btn:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px rgba(233,130,106,0.35)); }
.hc-btn:disabled { background: var(--divider); border-color: var(--divider); color: var(--fg-subtle); cursor: not-allowed; }
.hc-btn.danger { border-color: var(--color-error, #C0392B); }
.hc-fill { position: absolute; inset: 0; z-index: -1; transform-origin: left center; transform: scaleX(0); background: var(--peach-12, rgba(233,130,106,0.16)); transition: transform .18s cubic-bezier(0.22, 0.61, 0.36, 1); }
.hc-btn.danger .hc-fill { background: var(--color-error-tint, rgba(192,57,43,0.10)); }
.hc-btn.holding { transform: scale(0.98); }
.hc-btn.holding .hc-fill { transform: scaleX(1); transition: transform ${HC_MS}ms linear; }
.hc-btn.done .hc-fill { transform: scaleX(1); transition: none; }
.hc-ring { position: relative; flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; background: var(--bg-alt); display: flex; align-items: center; justify-content: center; }
.hc-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
.hc-ring circle { fill: none; stroke-width: 2.5; }
.hc-ring .hc-track { stroke: var(--divider); }
.hc-ring .hc-arc { stroke: var(--peach); stroke-linecap: round; stroke-dasharray: 113.1; stroke-dashoffset: 113.1; transition: stroke-dashoffset .18s cubic-bezier(0.22, 0.61, 0.36, 1); }
.hc-btn.danger .hc-arc { stroke: var(--color-error, #C0392B); }
.hc-btn.holding .hc-arc { stroke-dashoffset: 0; transition: stroke-dashoffset ${HC_MS}ms linear; }
.hc-btn.done .hc-arc { stroke-dashoffset: 0; transition: none; }
.hc-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hc-txt b { font-size: 11px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; }
.hc-txt small { font-size: 11px; letter-spacing: 0.03em; color: var(--fg-muted); }
.hc-btn.early .hc-txt small { color: var(--attention-text, #B54D36); }
.hc-ov { position: fixed; inset: 0; z-index: 400; background: rgba(62,63,63,0.55); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: sa-fade .18s var(--ease); }
.hc-modal { width: min(440px, 100%); background: var(--surface, #fff); border-radius: 28px; box-shadow: var(--shadow-lg); padding: 28px 24px 20px; display: flex; flex-direction: column; gap: 14px; animation: hc-rise .24s cubic-bezier(0.22, 0.61, 0.36, 1); }
@keyframes hc-rise { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
.hc-eyebrow { font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: var(--fg-muted); text-align: center; }
.hc-title { font-family: var(--serif); font-size: 24px; line-height: 1.15; color: var(--ink); text-align: center; text-wrap: pretty; }
.hc-body { font-family: var(--sans); font-size: 12.5px; line-height: 1.6; letter-spacing: 0.03em; color: var(--fg-muted); text-align: center; margin: 0; text-wrap: pretty; }
.hc-cancel { align-self: center; border: none; background: transparent; color: var(--fg-muted); font-family: var(--sans); font-size: 10.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; padding: 10px 16px; min-height: 44px; cursor: pointer; border-radius: 999px; }
.hc-cancel:hover { color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .hc-btn.holding { transform: none; } .hc-modal { animation: sa-fade .18s var(--ease); } }
`;
(function () { if (document.getElementById("hc-css")) return; const s = document.createElement("style"); s.id = "hc-css"; s.textContent = HC_CSS; document.head.appendChild(s); })();

function HoldButton({ label, hint, icon, danger, disabled, onConfirm, es = true, autoFocus }) {
  const [st, setSt] = React.useState("idle"); // idle | holding | early | done
  const tRef = React.useRef(0), keyRef = React.useRef(false), btnRef = React.useRef(null);
  React.useEffect(() => { if (autoFocus && btnRef.current) btnRef.current.focus(); return () => clearTimeout(tRef.current); }, []);
  const start = () => {
    if (disabled || st === "done") return;
    clearTimeout(tRef.current); setSt("holding");
    tRef.current = setTimeout(() => { setSt("done"); try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} onConfirm && onConfirm(); }, HC_MS);
  };
  const stop = () => {
    if (st !== "holding") return;
    clearTimeout(tRef.current); setSt("early");
    tRef.current = setTimeout(() => setSt(s => (s === "early" ? "idle" : s)), 1600);
  };
  const sub = st === "holding" ? (es ? "Sigue presionando…" : "Keep holding…")
    : st === "early" ? (es ? "Soltaste antes: no pasó nada" : "Released early: nothing happened")
    : st === "done" ? (es ? "Confirmado" : "Confirmed")
    : (hint || (es ? "Mantén presionado · 0.3 s" : "Press and hold · 0.3 s"));
  return (
    <button ref={btnRef} type="button" disabled={disabled} className={"hc-btn" + (danger ? " danger" : "") + (st !== "idle" ? " " + st : "")}
      onPointerDown={e => { if (e.button !== 0) return; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} start(); }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => { if ((e.key === " " || e.key === "Enter") && !e.repeat && !keyRef.current) { e.preventDefault(); keyRef.current = true; start(); } }}
      onKeyUp={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); keyRef.current = false; stop(); } }}
      aria-label={label + ". " + (es ? "Mantén presionado para confirmar" : "Press and hold to confirm")}>
      <span className="hc-fill" aria-hidden="true"></span>
      <span className="hc-ring" aria-hidden="true">
        <svg viewBox="0 0 40 40"><circle className="hc-track" cx="20" cy="20" r="18"></circle><circle className="hc-arc" cx="20" cy="20" r="18"></circle></svg>
        <Icon name={st === "done" ? "check" : (icon || (danger ? "trash" : "check"))} size={16} stroke={danger ? "var(--color-error, #C0392B)" : "var(--ink)"} />
      </span>
      <span className="hc-txt"><b>{label}</b><small aria-live="polite">{sub}</small></span>
    </button>
  );
}

// Modal genérico: title / body / label / danger / icon / eyebrow
function HoldConfirmModal({ title, body, label, danger, icon, eyebrow, es = true, onConfirm, onClose }) {
  React.useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  return (
    <div className="hc-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hc-modal" role="alertdialog" aria-modal="true" aria-label={title}>
        {eyebrow && <div className="hc-eyebrow">{eyebrow}</div>}
        <div className="hc-title">{title}</div>
        {body && <p className="hc-body">{body}</p>}
        <HoldButton label={label || (danger ? (es ? "Mantén para eliminar" : "Hold to delete") : (es ? "Mantén para confirmar" : "Hold to confirm"))} danger={danger} icon={icon} es={es} autoFocus onConfirm={() => setTimeout(onConfirm, 220)} />
        <button type="button" className="hc-cancel" onClick={onClose}>{es ? "Cancelar" : "Cancel"}</button>
      </div>
    </div>
  );
}

// Promesa: reemplaza window.confirm. Acepta un texto o { title, body, label, danger, icon, eyebrow }.
function saConfirm(arg, extra) {
  let o = typeof arg === "string" ? { msg: arg } : Object.assign({}, arg);
  if (extra) o = Object.assign(o, extra);
  if (o.msg != null) {
    const m = String(o.msg).trim(); const cut = m.search(/[?.](\s|$)/);
    o.title = o.title || (cut > 0 && cut < m.length - 1 ? m.slice(0, cut + 1) : m);
    o.body = o.body != null ? o.body : (cut > 0 && cut < m.length - 1 ? m.slice(cut + 1).trim() : "");
  }
  const es = o.es != null ? o.es : !/^(Delete|Remove|Stop|Clear|Cancel|This|Send|Allow|Enable)\b/i.test(String(o.title || ""));
  if (o.danger == null) o.danger = /^¿?\s*(Eliminar|Borrar|Quitar|Dejar de|Delete|Remove|Stop|Clear)/i.test(String(o.title || ""));
  return new Promise(resolve => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = ReactDOM.createRoot(host);
    let done = false;
    const close = (v) => { if (done) return; done = true; root.unmount(); host.remove(); resolve(v); };
    root.render(<HoldConfirmModal {...o} es={es} onConfirm={() => close(true)} onClose={() => close(false)} />);
  });
}

Object.assign(window, { HoldButton, HoldConfirmModal, saConfirm });
