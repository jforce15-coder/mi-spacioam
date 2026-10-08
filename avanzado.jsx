// ============================================================
// Spacio AM — Opciones avanzadas (solo admin)
// ------------------------------------------------------------
// • Resumen mensual: corre calcularResumenMensual(mes) en el Apps Script
//   y lo muestra aquí (no escribe en la pestaña Resumen).
// • "+ al acumulado": vuelve a calcular el mes en el servidor y lo pasa a
//   Resumenconsolidado — agrega nuevas, actualiza cambios y elimina
//   duplicados (una sola fila por propiedad y mes).
// ============================================================
const { useState: avUseState, useEffect: avUseEffect, useMemo: avUseMemo } = React;

const AV_CSS = `
.av-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; }
.av-btn { display: inline-flex; align-items: center; gap: 8px; border: none; cursor: pointer; border-radius: 999px; padding: 11px 20px; font-family: var(--sans); font-size: 11px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; transition: filter .18s var(--ease), box-shadow .18s var(--ease); }
.av-btn:hover:not(:disabled) { filter: brightness(.94); box-shadow: var(--shadow-sm); }
.av-btn:active:not(:disabled) { transform: scale(0.98); }
.av-btn:disabled, .av-btn.warm:disabled, .av-btn.dark:disabled { background: var(--divider); color: var(--fg-subtle); cursor: not-allowed; border-color: var(--divider); box-shadow: none; filter: none; }
.av-btn.dark { background: var(--ink); color: var(--alabaster); }
.av-btn.warm { background: var(--peach-12, rgba(233,130,106,0.12)); color: var(--ink); border: 1px solid var(--peach); }
.av-btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--divider); }
.av-close { display: inline-flex; align-items: center; gap: 7px; font-family: var(--sans); font-size: 10.5px; font-weight: 500; letter-spacing: 0.08em; color: var(--fg-muted); }
.av-close i { width: 7px; height: 7px; border-radius: 50%; background: var(--color-success, #3d6b52); }
.av-close.closed i { background: var(--fg-muted); }
.av-ov { position: fixed; inset: 0; z-index: 300; background: rgba(62,63,63,0.55); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: sa-fade .18s var(--ease); }
.av-modal { width: min(420px, 100%); background: var(--surface, #fff); border-radius: 28px; box-shadow: var(--shadow-lg); padding: 28px 26px 22px; display: flex; flex-direction: column; gap: 12px; }
.av-lock { width: 48px; height: 48px; border-radius: 50%; background: var(--bg-alt); display: flex; align-items: center; justify-content: center; margin: 0 auto 4px; }
.av-m-t { font-family: var(--serif); font-size: 24px; line-height: 1.12; color: var(--ink); text-align: center; }
.av-m-s { font-family: var(--sans); font-size: 12px; line-height: 1.6; letter-spacing: 0.03em; color: var(--fg-muted); text-align: center; margin: 0 0 6px; text-wrap: pretty; }
.av-or { display: flex; align-items: center; gap: 10px; font-family: var(--sans); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-muted); }
.av-or::before, .av-or::after { content: ""; flex: 1; height: 1px; background: var(--divider); }
.av-in { width: 100%; box-sizing: border-box; font-family: var(--sans); font-size: 14px; color: var(--ink); padding: 12px 14px; border: 1px solid var(--divider); border-radius: 14px; background: var(--surface, #fff); outline: none; transition: border-color .18s var(--ease), box-shadow .18s var(--ease); }
.av-in:focus { border-color: var(--ink); box-shadow: var(--focus-ring, 0 0 0 3px rgba(233,130,106,0.35)); }
.av-rem { display: flex; align-items: center; gap: 8px; font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.02em; color: var(--ink); cursor: pointer; }
.av-rem input { width: 16px; height: 16px; accent-color: var(--ink); }
.av-m-err { font-family: var(--sans); font-size: 11.5px; color: var(--color-error, #C0392B); margin: 0; }
.av-m-ft { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.av-msg { font-family: var(--sans); font-size: 12px; line-height: 1.55; letter-spacing: 0.03em; color: var(--fg-muted); flex-basis: 100%; text-wrap: pretty; }
.av-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 14px; margin-bottom: 20px; }
.av-kpi { background: var(--surface, #fff); border: 1px solid var(--ink-08); border-radius: 22px; box-shadow: var(--shadow-sm); padding: 18px 20px; }
.av-kpi-k { font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-muted); }
.av-kpi-v { font-family: var(--sans); font-size: 24px; font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; color: var(--ink); margin-top: 6px; }
.av-kpi-s { font-family: var(--sans); font-size: 11px; font-variant-numeric: tabular-nums; color: var(--fg-muted); margin-top: 2px; }
.av-tbl-wrap { background: var(--surface, #fff); border: 1px solid var(--ink-08); border-radius: 22px; box-shadow: var(--shadow-sm); overflow: hidden; }
.av-tbl-scroll { overflow-x: auto; }
.av-tbl { border-collapse: collapse; width: 100%; font-family: var(--sans); }
.av-tbl th { position: sticky; top: 0; text-align: right; font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); padding: 12px 14px; border-bottom: 1px solid var(--divider); background: var(--bg-alt); white-space: nowrap; }
.av-tbl td { text-align: right; font-size: 12.5px; color: var(--ink); font-variant-numeric: tabular-nums; padding: 11px 14px; border-top: 1px solid var(--ink-08); white-space: nowrap; }
.av-tbl tr:hover td { background: var(--bg-alt); }
.av-tbl th:first-child, .av-tbl td:first-child { text-align: left; position: sticky; left: 0; z-index: 1; background: var(--surface, #fff); }
.av-tbl th:first-child { background: var(--bg-alt); z-index: 2; }
.av-tbl tr:hover td:first-child { background: var(--bg-alt); }
.av-tbl tfoot td { font-weight: 700; border-top: 1.5px solid var(--ink); background: var(--bg-alt); }
.av-prop { display: flex; align-items: center; gap: 9px; font-weight: 600; }
.av-st { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 2px 8px; font-size: 9px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
.av-st i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.av-st.new { background: var(--color-info-tint, rgba(59,102,145,0.10)); color: var(--color-info, #3B6691); }
.av-st.chg { background: var(--attention-tint, rgba(242,117,90,0.10)); color: var(--attention-text, #B54D36); }
.av-st.chg i { background: var(--attention, #F2755A); }
.av-st.same { background: var(--bg-alt); color: var(--fg-muted); }
.av-st.dup { background: var(--attention-tint, rgba(242,117,90,0.10)); color: var(--attention-text, #B54D36); }
.av-diff { color: var(--attention-text, #B54D36); }
.av-diff small { display: block; font-size: 10px; color: var(--fg-muted); text-decoration: line-through; }
.av-empty { padding: 44px 22px; text-align: center; font-family: var(--sans); font-size: 12.5px; letter-spacing: 0.03em; color: var(--fg-muted); }
.av-legend { display: flex; flex-wrap: wrap; gap: 14px; padding: 12px 16px; border-top: 1px solid var(--ink-08); font-family: var(--sans); font-size: 11px; letter-spacing: 0.03em; color: var(--fg-muted); }

.av-to { font-family: var(--sans); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-muted); }
.av-prog { background: var(--surface, #fff); border: 1px solid var(--ink-08); border-radius: 22px; box-shadow: var(--shadow-sm); padding: 18px 22px; margin-bottom: 20px; }
.av-prog-row { display: flex; justify-content: space-between; gap: 12px; font-family: var(--sans); font-size: 12px; letter-spacing: 0.03em; color: var(--ink); margin-bottom: 10px; }
.av-prog-row .t-num { color: var(--fg-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.av-prog-track { height: 6px; border-radius: 999px; background: var(--bg-alt); overflow: hidden; }
.av-prog-fill { height: 100%; border-radius: 999px; background: var(--peach); transition: width .36s var(--ease); }
.av-prog-sub { margin-top: 8px; font-family: var(--sans); font-size: 11px; letter-spacing: 0.03em; color: var(--fg-muted); }
.av-rowbtn { width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--peach); background: var(--peach-12, rgba(233,130,106,0.12)); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: filter .18s var(--ease); }
.av-rowbtn:hover:not(:disabled) { filter: brightness(.94); }
.av-rowbtn:disabled { background: transparent; border-color: var(--divider); color: var(--fg-subtle); cursor: default; }
.av-dot-busy { width: 8px; height: 8px; border-radius: 50%; background: var(--peach); animation: av-pulse 1s var(--ease) infinite; }
@keyframes av-pulse { 0%,100% { opacity: .35; transform: scale(.8);} 50% { opacity: 1; transform: scale(1);} }
.av-months { font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-muted); font-weight: 500; }
.av-block { margin-bottom: 24px; }
.av-block-h { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 0 4px 10px; }
.av-block-s { font-family: var(--sans); font-size: 11px; letter-spacing: 0.03em; color: var(--fg-muted); }
.av-adj-list { border: 1px solid var(--ink-08); border-radius: 14px; padding: 6px 12px; max-height: 160px; overflow-y: auto; }
.av-adj-row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-family: var(--sans); font-size: 12px; color: var(--ink); border-top: 1px solid var(--ink-08); }
.av-adj-row:first-child { border-top: none; }
.av-adj-row s { color: var(--fg-muted); }
.av-opt { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--divider); border-radius: 14px; padding: 12px 14px; cursor: pointer; transition: border-color .18s var(--ease), background .18s var(--ease); }
.av-opt.on { border-color: var(--ink); background: var(--bg-alt); }
.av-opt input { margin-top: 3px; accent-color: var(--ink); }
.av-opt b { display: block; font-family: var(--sans); font-size: 12.5px; font-weight: 600; color: var(--ink); }
.av-opt small { display: block; font-family: var(--sans); font-size: 11px; line-height: 1.55; color: var(--fg-muted); margin-top: 2px; text-wrap: pretty; }
`;
(function () { if (document.getElementById("av-css")) return; const s = document.createElement("style"); s.id = "av-css"; s.textContent = AV_CSS; document.head.appendChild(s); })();

const AV_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const AV_MES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// columnas visibles (clave = encabezado del script en minúsculas)
const AV_COLS = [
  { k: "noches", l: "Noches", f: "n0" },
  { k: "estadías", l: "Estadías", f: "n0" },
  { k: "ingreso bruto", l: "Ingreso bruto", f: "usd", sum: 1 },
  { k: "iva total", l: "IVA total", f: "usd", sum: 1 },
  { k: "iva socios", l: "IVA socios", f: "usd", sum: 1 },
  { k: "host service fee", l: "Host service fee", f: "usd", sum: 1 },
  { k: "fee spacio", l: "Fee Spacio", f: "usd", sum: 1 },
  { k: "insumos & gastos", l: "Insumos & gastos", f: "usd", sum: 1 },
  { k: "reparaciones", l: "Reparaciones", f: "usd", sum: 1 },
  { k: "otros ingresos", l: "Otros ingresos", f: "usd", sum: 1 },
  { k: "estadía propietario", l: "Cleaning propietario", f: "usd", sum: 1 },
  { k: "cleaning socio", l: "Cleaning socio", f: "usd", sum: 1 },
  { k: "ingreso neto", l: "Ingreso neto", f: "usd", sum: 1, strong: 1 },
  { k: "ingreso neto 2", l: "Neto 2 (depósito)", f: "usd", sum: 1 },
  { k: "cleaning fee", l: "Cleaning fee", f: "usd", sum: 1 },
  { k: "precio prom", l: "ADR", f: "usd" },
  { k: "estadía prom", l: "Estadía prom", f: "n1" },
  { k: "lead time prom", l: "Lead time", f: "n1" },
  { k: "ocupación", l: "Ocupación", f: "pct" },
  { k: "ocupación ajustada", l: "Ocup. ajustada", f: "pct" },
  { k: "noches propietario", l: "Noches prop.", f: "n0" },
  { k: "costo de oportunidad", l: "Costo oportunidad", f: "usd", sum: 1 },
];
function avFmt(v, f) {
  if (v === "" || v == null) return "—";
  const n = +v; if (!isFinite(n)) return String(v);
  if (f === "usd") return "$ " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (f === "pct") return (n * 100).toFixed(1) + "%";
  if (f === "n1") return n.toFixed(1);
  return Math.round(n).toLocaleString("en-US");
}
// Cierre de mes: un mes queda abierto hasta el día 10 del mes siguiente (23:59, hora de
// Guatemala). Después solo el administrador principal puede tocarlo, confirmando con
// Face ID o contraseña. La misma regla se valida en el Apps Script.
function avCloseAt(ym) { const [y, m] = ym.split("-").map(Number); return Date.UTC(y, m, 11, 6, 0, 0); } // día 11 00:00 GT = 06:00 UTC
function avIsClosed(ym) { return Date.now() >= avCloseAt(ym); }
function avCloseLabel(ym, es) {
  const [y, m] = ym.split("-").map(Number); const n = new Date(Date.UTC(y, m, 10));
  const M = es ? ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"] : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return "10 " + M[n.getUTCMonth()] + " " + n.getUTCFullYear();
}
// ---- Face ID / huella (WebAuthn, autenticador del dispositivo) ----
const AV_DEV_KEY = "sa-unlock-device";
const avB64 = { enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), dec: (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); } };
function avDevice() { try { return JSON.parse(localStorage.getItem(AV_DEV_KEY)) || null; } catch (e) { return null; } }
async function avBioAvailable() { try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; } }
async function avBioRegister(email) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "Spacio AM" },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: email || "admin@spacioam", displayName: "Spacio AM · administrador" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" }, timeout: 60000,
  } });
  return avB64.enc(cred.rawId);
}
async function avBioVerify(credId) {
  await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: avB64.dec(credId) }], userVerification: "required", timeout: 60000 } });
  return true;
}

function AvUnlockModal({ ym, label, email, onUnlock, onClose, tr }) {
  const [pass, setPass] = avUseState("");
  const [err, setErr] = avUseState("");
  const [busy, setBusy] = avUseState(false);
  const [bio, setBio] = avUseState(false);
  const [remember, setRemember] = avUseState(true);
  const dev = avDevice();
  avUseEffect(() => { avBioAvailable().then(setBio); const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  const withBio = async () => {
    setErr(""); setBusy(true);
    try { await avBioVerify(dev.cred); await onUnlock({ deviceKey: dev.key }); }
    catch (e) { setErr(e && e.name === "NotAllowedError" ? tr("Se canceló la verificación. Intenta de nuevo o usa tu contraseña.", "Verification cancelled.") : (e && e.message) || tr("No se pudo verificar.", "Could not verify.")); }
    setBusy(false);
  };
  const withPass = async (e) => {
    e && e.preventDefault();
    if (!pass) { setErr(tr("Escribe tu contraseña.", "Enter your password.")); return; }
    setErr(""); setBusy(true);
    const W = window.SpacioWrite;
    // registrar este dispositivo para Face ID (la contraseña se valida en el servidor)
    if (bio && !dev && remember) {
      const r = await W.post("registerUnlockDevice", { pass, label: navigator.userAgent.slice(0, 80) });
      if (r && r.ok) { try { const cred = await avBioRegister(email); localStorage.setItem(AV_DEV_KEY, JSON.stringify({ cred, key: r.deviceKey })); } catch (e2) {} }
      else if (r && r.error) { setErr(r.error); setBusy(false); return; }
    }
    const ok = await onUnlock({ pass });
    if (!ok) setErr(tr("Contraseña incorrecta.", "Wrong password."));
    setBusy(false);
  };
  return (
    <div className="av-ov" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="av-modal" role="dialog" aria-modal="true" onSubmit={withPass}>
        <div className="av-lock"><Icon name="lock" size={20} stroke="var(--ink)" /></div>
        <div className="av-kpi-k" style={{ textAlign: "center" }}>{tr("Mes cerrado", "Closed month")}</div>
        <div className="av-m-t">{label}</div>
        <p className="av-m-s">{tr("Este mes se cerró el " + avCloseLabel(ym, true) + ". Confirma que quieres modificar Resumenconsolidado de un mes cerrado.", "This month closed on " + avCloseLabel(ym, false) + ". Confirm you want to change it.")}</p>
        {bio && dev && (
          <button type="button" className="av-btn dark" style={{ width: "100%", justifyContent: "center" }} disabled={busy} onClick={withBio}>
            <Icon name="user" size={15} stroke="currentColor" />{busy ? tr("Verificando…", "Verifying…") : tr("Confirmar con Face ID", "Confirm with Face ID")}
          </button>
        )}
        {bio && dev && <div className="av-or"><span>{tr("o con tu contraseña", "or with your password")}</span></div>}
        <label className="av-kpi-k" htmlFor="av-pass" style={{ display: "block", marginBottom: 6 }}>{tr("Contraseña del administrador principal", "Principal admin password")}</label>
        <input id="av-pass" className="av-in" type="password" autoComplete="current-password" autoFocus={!(bio && dev)} value={pass} onChange={e => setPass(e.target.value)} />
        {bio && !dev && (
          <label className="av-rem"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />{tr("Usar Face ID en este dispositivo la próxima vez", "Use Face ID on this device next time")}</label>
        )}
        {err && <p className="av-m-err">{err}</p>}
        <div className="av-m-ft">
          <button type="button" className="av-btn ghost" onClick={onClose} disabled={busy}>{tr("Cancelar", "Cancel")}</button>
          <button type="submit" className={"av-btn " + (bio && dev ? "ghost" : "dark")} disabled={busy}>{busy && !(bio && dev) ? tr("Verificando…", "Verifying…") : tr("Confirmar y agregar", "Confirm & add")}</button>
        </div>
      </form>
    </div>
  );
}

function avPeriods() {
  const out = [], now = new Date();
  for (let i = 0; i < 24; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
  return out;
}
const AV_DEP = "ingreso neto 2";   // columna del depósito
// duración típica por acción (ms) para estimar el progreso; se aprende con cada corrida
const AV_DUR_KEY = "sa-av-dur";
function avDurGet(k, dflt) { try { const d = JSON.parse(localStorage.getItem(AV_DUR_KEY)) || {}; return d[k] || dflt; } catch (e) { return dflt; } }
function avDurSet(k, ms) { try { const d = JSON.parse(localStorage.getItem(AV_DUR_KEY)) || {}; d[k] = d[k] ? Math.round(d[k] * 0.5 + ms * 0.5) : ms; localStorage.setItem(AV_DUR_KEY, JSON.stringify(d)); } catch (e) {} }
function avEta(ms, es) { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return es ? "~" + s + " s" : "~" + s + " s"; const m = Math.floor(s / 60), r = s % 60; return "~" + m + " min" + (r ? " " + r + " s" : ""); }

// Barra de progreso: pasos completados + avance estimado del paso en curso.
// El tramo en curso avanza con el tiempo transcurrido frente a la duración típica
// y se frena al acercarse al 95 %: nunca promete terminar antes de que termine.
function AvProgress({ prog, es }) {
  const [, tick] = avUseState(0);
  avUseEffect(() => { if (!prog) return; const iv = setInterval(() => tick(t => t + 1), 250); return () => clearInterval(iv); }, [prog]);
  if (!prog) return null;
  const el = Date.now() - prog.stepT0;
  const frac = Math.min(0.95, 1 - Math.exp(-el / Math.max(1500, prog.stepEst)));
  const pct = Math.min(99, Math.round(((prog.done + frac) / prog.total) * 100));
  const left = Math.max(0, prog.stepEst - el) + (prog.total - prog.done - 1) * prog.stepEst;
  return (
    <div className="av-prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="av-prog-row"><span>{prog.label}</span><span className="t-num">{pct}% · {es ? "faltan " : "left "}{avEta(left, es)}</span></div>
      <div className="av-prog-track"><div className="av-prog-fill" style={{ width: pct + "%" }} /></div>
      {prog.sub && <div className="av-prog-sub">{prog.sub}</div>}
    </div>
  );
}

// Un socio con cambio en el depósito: ¿acumulado, ajuste en un mes o solo registro?
function AvAdjustModal({ items, months, periods, es, tr, onPick, onClose }) {
  const [mode, setMode] = avUseState("acumulado");
  const [target, setTarget] = avUseState(months[months.length - 1]);
  const lbl = (k) => { const [y, m] = k.split("-"); return (es ? AV_MES : AV_MES_EN)[+m - 1] + " " + y; };
  const sum = items.reduce((s, x) => s + (x.newDep - x.oldDep), 0);
  const opts = [
    { v: "acumulado", t: tr("Modificar el acumulado", "Update the consolidated sheet"), d: tr("Lo de siempre: la fila del mes se actualiza con el cálculo nuevo.", "The usual: the month's row is updated with the new calculation.") },
    { v: "mes", t: tr("Aplicar la diferencia en otro mes", "Apply the difference in another month"), d: tr("El acumulado no se toca. La diferencia entra como gasto manual en el mes que elijas: “otro ingreso” si el depósito sube, “insumos & gastos” si baja.", "Consolidated stays as is. The difference goes in as a manual expense in the month you choose: “otro ingreso” if the deposit went up, “insumos & gastos” if down.") },
    { v: "registro", t: tr("Dejar solo el registro", "Record only"), d: tr("No se cambia nada. Queda constancia del depósito anterior, el nuevo y la diferencia.", "Nothing changes. Previous deposit, new deposit and difference are recorded.") },
  ];
  return (
    <div className="av-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="av-modal" role="dialog" aria-modal="true" style={{ width: "min(520px, 100%)" }}>
        <div className="av-kpi-k" style={{ textAlign: "center" }}>{tr("Cambia el monto a depositar", "Deposit amount changed")}</div>
        <div className="av-m-t">{items.length === 1 ? items[0].prop : items.length + tr(" propiedades", " properties")}</div>
        <p className="av-m-s">{tr("El ingreso neto cambió y con él el depósito del socio. Diferencia total: ", "Net income changed, and so did the owner deposit. Total difference: ") + (sum >= 0 ? "+" : "−") + avFmt(Math.abs(sum), "usd") + ". " + tr("¿Qué hacemos?", "What should we do?")}</p>
        <div className="av-adj-list">
          {items.slice(0, 6).map((x, i) => <div key={i} className="av-adj-row"><span>{x.prop} · {lbl(x.ym)}</span><span className="t-num"><s>{avFmt(x.oldDep, "usd")}</s> → <b>{avFmt(x.newDep, "usd")}</b></span></div>)}
          {items.length > 6 && <div className="av-adj-row" style={{ color: "var(--fg-muted)" }}>{tr("y " + (items.length - 6) + " más", "and " + (items.length - 6) + " more")}</div>}
        </div>
        {opts.map(o => (
          <label key={o.v} className={"av-opt" + (mode === o.v ? " on" : "")}>
            <input type="radio" name="av-adj" checked={mode === o.v} onChange={() => setMode(o.v)} />
            <span><b>{o.t}</b><small>{o.d}</small></span>
          </label>
        ))}
        {mode === "mes" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="av-kpi-k">{tr("Mes donde aplicar", "Month to apply in")}</span>
            <Select value={target} onChange={setTarget} icon="calendar" minWidth={180} sort={false} searchable={false} options={periods.slice().sort().map(k => ({ value: k, label: lbl(k) }))} />
          </div>
        )}
        <div className="av-m-ft">
          <button type="button" className="av-btn ghost" onClick={onClose}>{tr("Cancelar", "Cancel")}</button>
          <button type="button" className="av-btn dark" onClick={() => onPick(mode, target)}>{mode === "acumulado" ? tr("Agregar al acumulado", "Add to consolidated") : mode === "mes" ? tr("Aplicar en " + lbl(target), "Apply in " + lbl(target)) : tr("Guardar registro", "Save record")}</button>
        </div>
      </div>
    </div>
  );
}

// filas de un mes como objetos + estado frente al acumulado
function avBuildView(data) {
  if (!data || !data.rows) return null;
  const H = (data.headers || []).map(h => String(h).trim().toLowerCase());
  const rows = data.rows.map(r => { const o = {}; H.forEach((h, i) => { o[h] = r[i]; }); o._ym = data.ym; return o; });
  const ex = data.existing || {};
  const keyOf = (o) => String(o["property_name"] || "").trim().toLowerCase();
  let nNew = 0, nChg = 0, nSame = 0;
  rows.forEach(o => {
    o._key = keyOf(o);
    const e = ex[o._key];
    if (!e) { o._st = "new"; nNew++; return; }
    o._prev = {};
    AV_COLS.forEach(c => { const a = +o[c.k] || 0, b = +e.values[c.k] || 0; if (Math.abs(a - b) > 0.005) o._prev[c.k] = e.values[c.k]; });
    o._dup = e.count > 1;
    o._st = Object.keys(o._prev).length ? "chg" : "same";
    o._st === "chg" ? nChg++ : nSame++;
  });
  rows.sort((a, b) => String(a["property_name"]).localeCompare(String(b["property_name"]), "es"));
  const tot = {}; AV_COLS.forEach(c => { if (c.sum) tot[c.k] = rows.reduce((s, o) => s + (+o[c.k] || 0), 0); });
  tot["noches"] = rows.reduce((s, o) => s + (+o["noches"] || 0), 0);
  tot["estadías"] = rows.reduce((s, o) => s + (+o["estadías"] || 0), 0);
  return { rows, tot, nNew, nChg, nSame, dups: rows.filter(o => o._dup).length };
}
// consolidado de varios meses: suma por propiedad; estado = el peor de sus meses
function avBuildMulti(views) {
  const by = {};
  views.forEach(v => v.rows.forEach(o => {
    const g = by[o._key] || (by[o._key] = { "property_name": o["property_name"], _key: o._key, _months: [], _pend: [], _st: "same", _dup: false });
    g._months.push(o._ym);
    if (o._st !== "same" || o._dup) g._pend.push(o._ym);
    if (o._st === "new") g._st = "new"; else if (o._st === "chg" && g._st !== "new") g._st = "chg";
    if (o._dup) g._dup = true;
    AV_COLS.forEach(c => { if (c.sum || c.f === "n0") g[c.k] = (g[c.k] || 0) + (+o[c.k] || 0); });
  }));
  const rows = Object.values(by).sort((x, y) => String(x["property_name"]).localeCompare(String(y["property_name"]), "es"));
  const tot = {}; AV_COLS.forEach(c => { if (c.sum || c.f === "n0") tot[c.k] = rows.reduce((s, o) => s + (+o[c.k] || 0), 0); });
  return { rows, tot, nNew: rows.filter(r => r._st === "new").length, nChg: rows.filter(r => r._st === "chg").length, nSame: rows.filter(r => r._st === "same" && !r._dup).length, dups: rows.filter(r => r._dup).length };
}

function AvTable({ view, cols, tr, es, onRow, rowBusy, canAdd, multi, label }) {
  return (
    <div className="av-tbl-wrap">
      <div className="av-tbl-scroll">
        <table className="av-tbl">
          <thead><tr><th>{tr("Propiedad", "Property")}</th>{cols.map(c => <th key={c.k}>{c.l}</th>)}<th>{tr("Acumulado", "Consolidated")}</th></tr></thead>
          <tbody>
            {view.rows.map((o, i) => {
              const pend = o._st !== "same" || o._dup;
              const busy = rowBusy === (o._ym || "all") + "|" + o._key;
              return (
                <tr key={i}>
                  <td>
                    <div className="av-prop">
                      <span>{o["property_name"]}</span>
                      <span className={"av-st " + o._st}><i></i>{o._st === "new" ? tr("Nueva", "New") : o._st === "chg" ? tr("Cambia", "Changed") : tr("Igual", "Same")}</span>
                      {o._dup && <span className="av-st dup"><i></i>{tr("Duplicada", "Duplicate")}</span>}
                      {multi && o._pend && o._pend.length > 0 && <span className="av-months">{o._pend.map(k => (es ? AV_MES : AV_MES_EN)[+k.slice(5) - 1].slice(0, 3)).join(" · ")}</span>}
                    </div>
                  </td>
                  {cols.map(c => (
                    <td key={c.k} style={c.strong ? { fontWeight: 700 } : null} className={o._prev && c.k in o._prev ? "av-diff" : ""}>
                      {c.k in o || !multi ? avFmt(o[c.k], c.f) : "—"}
                      {o._prev && c.k in o._prev && <small>{avFmt(o._prev[c.k], c.f)}</small>}
                    </td>
                  ))}
                  <td>
                    <button type="button" className="av-rowbtn" disabled={!pend || !canAdd || !!rowBusy} onClick={() => onRow(o)}
                      title={!pend ? tr("Ya está igual en Resumenconsolidado", "Already equal in consolidated") : multi ? tr("Agregar esta propiedad en todos los meses seleccionados", "Add this property for all selected months") : tr("Agregar solo esta propiedad al acumulado", "Add only this property to consolidated")}
                      aria-label={tr("Agregar " + o["property_name"] + " al acumulado", "Add " + o["property_name"] + " to consolidated")}>
                      {busy ? <span className="av-dot-busy" /> : <Icon name={pend ? "plus" : "check"} size={14} stroke="currentColor" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td>{tr("Total", "Total") + (label ? " · " + label : "")}</td>{cols.map(c => <td key={c.k}>{c.k in view.tot ? avFmt(view.tot[c.k], c.f) : ""}</td>)}<td></td></tr></tfoot>
        </table>
      </div>
      <div className="av-legend">
        <span><span className="av-st new"><i></i>{tr("Nueva", "New")}</span> {tr("no está en Resumenconsolidado", "not in consolidated")}</span>
        <span><span className="av-st chg"><i></i>{tr("Cambia", "Changed")}</span> {tr("el valor tachado es el que hay hoy", "struck-through value is current")}</span>
        <span><span className="av-st dup"><i></i>{tr("Duplicada", "Duplicate")}</span> {tr("hay más de una fila; se deja una sola", "extra rows get removed")}</span>
        <span><Icon name="plus" size={12} stroke="currentColor" /> {tr("agrega solo esa fila; nunca se duplica aunque luego agregues todas", "adds only that row; never duplicates even if you later add all")}</span>
      </div>
    </div>
  );
}

function AdvancedSection({ lang, owner }) {
  const principal = !!(owner && owner.isAdmin && owner.isPrincipal);
  const es = lang !== "en"; const tr = (a, b) => (es ? a : b);
  const periods = avUseMemo(() => avPeriods(), []);
  const years = avUseMemo(() => [...new Set(periods.map(k => k.slice(0, 4)))].sort(), [periods]);
  const label = (k) => { const [y, m] = k.split("-"); return (es ? AV_MES : AV_MES_EN)[+m - 1] + " " + y; };
  const [range, setRange] = avUseState(() => { try { return localStorage.getItem("sa-av-range") === "1"; } catch (e) { return false; } });
  const [ym, setYm] = avUseState(() => { try { return localStorage.getItem("sa-av-ym") || periods[1]; } catch (e) { return periods[1]; } });
  const [ymTo, setYmTo] = avUseState(() => { try { return localStorage.getItem("sa-av-ym-to") || periods[1]; } catch (e) { return periods[1]; } });
  const [yr, setYr] = avUseState(() => ym.slice(0, 4));
  const monthsOfYr = periods.filter(k => k.slice(0, 4) === yr).slice().sort();
  const pickYear = (y) => { setYr(y); const ks = periods.filter(k => k.slice(0, 4) === y).sort(); if (ks.indexOf(ym) < 0 && ks.length) setYm(ks[0]); if (ks.indexOf(ymTo) < 0 && ks.length) setYmTo(ks[ks.length - 1]); };
  // meses seleccionados (cronológico)
  const months = avUseMemo(() => {
    if (!range) return [ym];
    const lo = ym < ymTo ? ym : ymTo, hi = ym < ymTo ? ymTo : ym;
    return periods.filter(k => k >= lo && k <= hi).sort();
  }, [range, ym, ymTo, periods]);
  avUseEffect(() => { try { localStorage.setItem("sa-av-ym", ym); localStorage.setItem("sa-av-ym-to", ymTo); localStorage.setItem("sa-av-range", range ? "1" : "0"); } catch (e) {} setData({}); setMsg(""); setWarn(""); }, [ym, ymTo, range]);

  const [data, setData] = avUseState({});    // ym → respuesta de resumenPreview
  const [busy, setBusy] = avUseState("");    // "gen" | "add" | ""
  const [rowBusy, setRowBusy] = avUseState("");
  const [prog, setProg] = avUseState(null);
  const [msg, setMsg] = avUseState("");
  const [warn, setWarn] = avUseState("");
  const [unlockOpen, setUnlockOpen] = avUseState(false);
  const [adjust, setAdjust] = avUseState(null);   // { items, action }
  const [pendingAct, setPendingAct] = avUseState(null);
  const AV_T = { timeout: 170000 };
  const W = () => (window.SpacioWrite && window.SpacioWrite.enabled() ? window.SpacioWrite : null);
  const isErr = (s) => /No se pudo|Could not/.test(s);

  // ── generar: un mes tras otro, con barra de progreso ──
  const fetchMonth = async (w, k) => {
    let res; try { res = await w.post("resumenPreview", { ym: k }, AV_T); } catch (e) { res = { error: (e && e.message) || "error" }; }
    if (res && res.busy) { await new Promise(r => setTimeout(r, 4000)); try { res = await w.post("resumenPreview", { ym: k }, AV_T); } catch (e) { res = { error: (e && e.message) || "error" }; } }
    if (res && res.ok && !Array.isArray(res.rows)) res = { ok: false, error: tr("el servidor respondió sin datos; el Apps Script publicado es una versión anterior (Implementar → Administrar implementaciones → Nueva versión).", "server answered without data; the published Apps Script is an older version.") };
    return res;
  };
  const generate = async () => {
    const w = W(); if (!w) { setMsg(tr("Conecta la escritura en Setup para usar esta opción.", "Connect writing in Setup.")); return; }
    setBusy("gen"); setMsg(""); setWarn(""); setData({});
    const out = {}, errs = []; const est = avDurGet("gen", 25000);
    for (let i = 0; i < months.length; i++) {
      const k = months[i];
      setProg({ label: tr("Calculando " + label(k), "Computing " + label(k)), sub: months.length > 1 ? tr("Mes " + (i + 1) + " de " + months.length, "Month " + (i + 1) + " of " + months.length) : tr("Lee Database, SETUP, insumos & gastos y TC", "Reading Database, SETUP, expenses and FX"), done: i, total: months.length, stepT0: Date.now(), stepEst: est });
      const t0 = Date.now(); const res = await fetchMonth(w, k);
      if (res && res.ok) { out[k] = Object.assign({ ym: k }, res); if (!res.cached) avDurSet("gen", Date.now() - t0); setData(Object.assign({}, out)); }
      else errs.push(label(k) + ": " + ((res && res.error) || tr("sin conexión", "offline")) + (res && res.timeout ? tr(" (tardó demasiado)", " (timed out)") : ""));
    }
    setProg(null); setBusy("");
    if (errs.length) setMsg(tr("No se pudo generar ", "Could not generate ") + errs.join(" · "));
    else if (months.length === 1 && out[months[0]] && !out[months[0]].rows.length) setMsg(tr("No hay reservas aceptadas con check-in en " + label(months[0]) + ".", "No accepted bookings this month."));
  };

  // ── vistas ──
  const views = avUseMemo(() => { const o = {}; months.forEach(k => { if (data[k]) o[k] = avBuildView(data[k]); }); return o; }, [data, months]);
  const loaded = months.filter(k => views[k]);
  const multi = loaded.length > 1 ? avBuildMulti(loaded.map(k => views[k])) : null;
  const pendingOf = (v) => v ? v.nNew + v.nChg + v.dups : 0;
  const pendingAll = loaded.reduce((s, k) => s + pendingOf(views[k]), 0);
  const anyClosed = (ks) => ks.some(k => avIsClosed(k));

  // ── agregar: acción = { months:[ym], props:[nombre]|null } ──
  const changedDeposits = (act) => {
    const items = [];
    act.months.forEach(k => { const v = views[k]; if (!v) return; v.rows.forEach(o => {
      if (act.props && act.props.indexOf(o._key) < 0) return;
      if (o._prev && AV_DEP in o._prev) items.push({ ym: k, prop: o["property_name"], key: o._key, oldDep: +o._prev[AV_DEP] || 0, newDep: +o[AV_DEP] || 0 });
    }); });
    return items;
  };
  const startAppend = (act) => {
    if (!W()) return;
    if (anyClosed(act.months) && !principal) { setMsg(tr("Hay meses cerrados: solo el administrador principal puede modificarlos.", "Closed months: only the principal admin can change them.")); return; }
    const items = changedDeposits(act);
    if (items.length) { setAdjust({ items, action: act }); return; }
    runAppend(act, null);
  };
  const runAppend = async (act, unlock, force) => {
    if (anyClosed(act.months) && !unlock) { setPendingAct(act); setUnlockOpen(true); return false; }
    const w = W(); if (!w) return false;
    const rowKey = act.props && act.props.length === 1 ? (act.months.length === 1 ? act.months[0] : "all") + "|" + act.props[0] : "";
    if (rowKey) setRowBusy(rowKey); else setBusy("add");
    setMsg(""); setWarn("");
    const est = avDurGet("add", 20000), tot = { added: 0, updated: 0, same: 0, removed: 0, forced: 0 }, errs = []; let locked = false;
    for (let i = 0; i < act.months.length; i++) {
      const k = act.months[i];
      if (!rowKey) setProg({ label: tr("Agregando " + label(k) + " al acumulado", "Adding " + label(k) + " to consolidated"), sub: act.months.length > 1 ? tr("Mes " + (i + 1) + " de " + act.months.length, "Month " + (i + 1) + " of " + act.months.length) : "", done: i, total: act.months.length, stepT0: Date.now(), stepEst: est });
      const payload = { ym: k }; if (unlock) payload.unlock = unlock; if (force) payload.force = true;
      if (act.props) payload.props = act.props.map(p => { const v = views[k]; const o = v && v.rows.find(r => r._key === p); return o ? o["property_name"] : p; });
      const t0 = Date.now(); let res;
      try { res = await w.post("resumenAppend", payload, AV_T); if (res && res.busy) { await new Promise(r => setTimeout(r, 5000)); res = await w.post("resumenAppend", payload, AV_T); } }
      catch (e) { res = { error: (e && e.message) || "error" }; }
      if (res && res.locked) { locked = true; break; }
      if (res && res.ok) { avDurSet("add", Date.now() - t0); ["added", "updated", "same", "removed", "forced"].forEach(f => { tot[f] += res[f] || 0; }); }
      else errs.push(label(k) + ": " + ((res && res.error) || tr("sin conexión", "offline")) + (res && res.timeout ? tr(" (tardó demasiado: genera de nuevo; si aparece igual, sí se guardó)", " (timed out; generate again to confirm)") : ""));
      // releer el mes para reflejar el estado real
      const again = await fetchMonth(w, k);
      if (again && again.ok) setData(d => Object.assign({}, d, { [k]: Object.assign({ ym: k }, again) }));
    }
    setProg(null); setBusy(""); setRowBusy(""); setUnlockOpen(false); setPendingAct(null);
    if (locked) { setMsg(tr("Mes cerrado: la clave no fue aceptada.", "Closed month: unlock not accepted.")); return false; }
    const scope = act.props ? (act.props.length === 1 ? tr("1 propiedad", "1 property") : act.props.length + tr(" propiedades", " properties")) : tr("todas", "all");
    const okTxt = tr("Resumenconsolidado · " + scope + " · " + tot.added + " nuevas, " + tot.updated + " actualizadas, " + tot.same + " sin cambios" + (tot.removed ? ", " + tot.removed + " duplicadas eliminadas" : "") + (tot.forced ? ", " + tot.forced + " sobrescritas" : "") + ".", "Consolidated · " + scope + " · added " + tot.added + ", updated " + tot.updated + ", same " + tot.same + ".");
    setMsg(errs.length ? tr("No se pudo agregar ", "Could not add ") + errs.join(" · ") + (tot.added + tot.updated ? " · " + okTxt : "") : okTxt);
    return true;
  };
  // tras releer: si algo sigue distinto, ofrecer sobrescribir
  avUseEffect(() => {
    if (busy || !loaded.length || !msg || isErr(msg) || !/Resumenconsolidado|Consolidated/.test(msg)) return;
    let still = 0; loaded.forEach(k => { still += views[k].nChg; });
    setWarn(still ? tr(still + " fila(s) siguen distintas después de agregar. Puedes sobrescribirlas con este cálculo.", still + " row(s) still differ after adding. You can overwrite them with this calculation.") : "");
  }, [data]);
  const onAdjust = async (mode, target) => {
    const { items, action } = adjust; setAdjust(null);
    if (mode === "acumulado") { runAppend(action, null); return; }
    const w = W(); if (!w) return;
    setBusy("add"); setMsg("");
    let ok = 0, errs = [];
    for (let i = 0; i < items.length; i++) {
      const x = items[i];
      setProg({ label: mode === "mes" ? tr("Aplicando diferencia en " + label(target), "Applying difference in " + label(target)) : tr("Guardando registro", "Saving record"), sub: x.prop, done: i, total: items.length, stepT0: Date.now(), stepEst: 6000 });
      let res; try { res = await w.post("resumenAjuste", { ym: x.ym, property: x.prop, oldDep: x.oldDep, newDep: x.newDep, mode, targetYm: target }, AV_T); } catch (e) { res = { error: (e && e.message) || "error" }; }
      if (res && res.ok) ok++; else errs.push(x.prop + ": " + ((res && res.error) || tr("sin conexión", "offline")));
    }
    setProg(null); setBusy("");
    setMsg((ok ? (mode === "mes" ? tr(ok + " ajuste(s) aplicados en " + label(target) + " como gasto manual. El acumulado no cambió.", ok + " adjustment(s) applied in " + label(target) + ". Consolidated unchanged.") : tr(ok + " registro(s) guardados en “Ajustes de depósito”. El acumulado no cambió.", ok + " record(s) saved. Consolidated unchanged.")) : "") + (errs.length ? " " + tr("No se pudo: ", "Could not: ") + errs.join(" · ") : ""));
  };

  const rowAdd = (o) => startAppend({ months: o._months || [o._ym], props: [o._key] });
  const canAdd = !busy && !rowBusy && (!anyClosed(months) || principal);
  const closedAny = anyClosed(months);
  const cur = loaded.length === 1 ? views[loaded[0]] : null;
  const kpiView = multi || cur;

  return (
    <section className="sa-section" style={{ marginTop: 28 }}>
      <SectionHead eyebrow={tr("Opciones avanzadas", "Advanced options")} title={tr("Resumen mensual", "Monthly summary")}
        sub={tr("Calcula uno o varios meses con los mismos datos y reglas del Apps Script y los compara con Resumenconsolidado. Puedes pasar al acumulado todo o una propiedad a la vez.", "Computes one or several months with the Apps Script rules and compares them with the consolidated sheet. Add everything or one property at a time.")} />

      <div className="av-bar">
        <Segmented size="sm" value={range ? "range" : "one"} onChange={v => setRange(v === "range")} options={[{ value: "one", label: tr("Un mes", "One month") }, { value: "range", label: tr("Varios meses", "Several months") }]} />
        <Segmented size="sm" value={yr} onChange={pickYear} options={years.map(y => ({ value: y, label: y }))} />
        <Select value={ym} onChange={setYm} icon="calendar" minWidth={160} sort={false} searchable={false} options={monthsOfYr.map(k => ({ value: k, label: (es ? AV_MES : AV_MES_EN)[+k.slice(5) - 1] }))} />
        {range && <React.Fragment><span className="av-to">{tr("a", "to")}</span><Select value={ymTo} onChange={setYmTo} icon="calendar" minWidth={160} sort={false} searchable={false} options={monthsOfYr.map(k => ({ value: k, label: (es ? AV_MES : AV_MES_EN)[+k.slice(5) - 1] }))} /></React.Fragment>}
        <button className="av-btn dark" onClick={generate} disabled={!!busy || !!rowBusy}><Icon name="refresh" size={14} stroke="currentColor" />{busy === "gen" ? tr("Calculando…", "Computing…") : tr("Generar resumen", "Generate") + (months.length > 1 ? " · " + months.length + tr(" meses", " months") : "")}</button>
        <button className="av-btn warm" onClick={() => startAppend({ months: loaded, props: null })} disabled={!loaded.length || !pendingAll || !canAdd} title={closedAny ? tr("Hay meses cerrados", "Closed months") : tr("Agrega las nuevas y actualiza las que cambiaron en Resumenconsolidado", "Upsert into consolidated")}>
          <Icon name={closedAny ? "lock" : "plus"} size={14} stroke="currentColor" />{busy === "add" ? tr("Agregando…", "Adding…") : (closedAny && principal ? tr("Desbloquear y agregar", "Unlock & add") : tr("Todo al acumulado", "All to consolidated")) + (pendingAll ? " · " + pendingAll : "")}
        </button>
        {months.length === 1 && <span className={"av-close " + (closedAny ? "closed" : "open")}><i></i>{closedAny ? tr("Cerrado el " + avCloseLabel(ym, true), "Closed " + avCloseLabel(ym, false)) : tr("Abierto hasta el " + avCloseLabel(ym, true), "Open until " + avCloseLabel(ym, false))}</span>}
        {closedAny && !principal && <p className="av-msg">{tr("Hay meses cerrados: se pueden consultar, pero solo el administrador principal puede modificarlos en Resumenconsolidado.", "Closed months: only the principal admin can change them.")}</p>}
        {msg && <p className="av-msg" style={isErr(msg) ? { color: "var(--attention-text, #B54D36)" } : null}>{msg}</p>}
        {warn && !busy && (
          <p className="av-msg" style={{ color: "var(--attention-text, #B54D36)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span>{warn}</span>
            {(!closedAny || principal) && <button className="av-btn warm" onClick={() => runAppend({ months: loaded, props: null }, null, true)} style={{ padding: "6px 14px" }}><Icon name="refresh" size={14} stroke="currentColor" />{tr("Sobrescribir con este cálculo", "Overwrite with this calculation")}</button>}
          </p>
        )}
        {loaded.length > 0 && !pendingAll && !msg && <p className="av-msg">{tr("Resumenconsolidado ya está igual a este cálculo.", "Already up to date.")}</p>}
      </div>

      {prog && <AvProgress prog={prog} es={es} />}
      {!loaded.length && !busy && <div className="av-tbl-wrap"><div className="av-empty">{tr("Elige el periodo y presiona “Generar resumen”.", "Pick a period and press Generate.")}</div></div>}

      {kpiView && kpiView.rows.length > 0 && (
        <div className="av-kpis">
          <div className="av-kpi"><div className="av-kpi-k">{tr("Propiedades", "Properties")}</div><div className="av-kpi-v">{kpiView.rows.length}</div><div className="av-kpi-s">{kpiView.nNew} {tr("nuevas", "new")} · {kpiView.nChg} {tr("con cambios", "changed")}</div></div>
          <div className="av-kpi"><div className="av-kpi-k">{tr("Ingreso bruto", "Gross income")}</div><div className="av-kpi-v">{avFmt(kpiView.tot["ingreso bruto"], "usd")}</div><div className="av-kpi-s">{kpiView.tot["noches"]} {tr("noches", "nights")} · {kpiView.tot["estadías"]} {tr("estadías", "stays")}</div></div>
          <div className="av-kpi"><div className="av-kpi-k">{tr("Fee Spacio", "Spacio fee")}</div><div className="av-kpi-v">{avFmt(kpiView.tot["fee spacio"], "usd")}</div></div>
          <div className="av-kpi"><div className="av-kpi-k">{tr("Ingreso neto socios", "Owner net")}</div><div className="av-kpi-v">{avFmt(kpiView.tot["ingreso neto"], "usd")}</div><div className="av-kpi-s">{tr("Depósito ", "Deposit ") + avFmt(kpiView.tot[AV_DEP], "usd")}</div></div>
        </div>
      )}

      {multi && (
        <div className="av-block">
          <div className="av-block-h"><span className="av-kpi-k">{tr("Resumen de los meses seleccionados", "Selected months combined")}</span><span className="av-block-s">{label(loaded[0]) + " → " + label(loaded[loaded.length - 1])} · {tr("el botón de cada fila agrega esa propiedad en todos estos meses", "each row's button adds that property for all these months")}</span></div>
          <AvTable view={multi} cols={AV_COLS.filter(c => c.sum || c.f === "n0")} tr={tr} es={es} onRow={rowAdd} rowBusy={rowBusy} canAdd={canAdd} multi />
        </div>
      )}
      {loaded.map(k => views[k].rows.length > 0 && (
        <div className="av-block" key={k}>
          {multi && (
            <div className="av-block-h">
              <span className="av-kpi-k">{label(k)}</span>
              <span className={"av-close " + (avIsClosed(k) ? "closed" : "open")}><i></i>{avIsClosed(k) ? tr("Cerrado", "Closed") : tr("Abierto", "Open")}</span>
              <button className="av-btn warm" style={{ padding: "6px 14px", marginLeft: "auto" }} onClick={() => startAppend({ months: [k], props: null })} disabled={!pendingOf(views[k]) || !canAdd}><Icon name="plus" size={13} stroke="currentColor" />{tr("Este mes al acumulado", "This month to consolidated")}{pendingOf(views[k]) ? " · " + pendingOf(views[k]) : ""}</button>
            </div>
          )}
          <AvTable view={views[k]} cols={AV_COLS} tr={tr} es={es} onRow={rowAdd} rowBusy={rowBusy} canAdd={canAdd} label={multi ? label(k) : ""} />
        </div>
      ))}

      {unlockOpen && pendingAct && <AvUnlockModal ym={pendingAct.months[0]} label={pendingAct.months.map(label).join(" · ")} email={owner && owner.email} tr={tr} onClose={() => { setUnlockOpen(false); setPendingAct(null); }} onUnlock={(u) => runAppend(pendingAct, u)} />}
      {adjust && <AvAdjustModal items={adjust.items} months={adjust.action.months} periods={periods} es={es} tr={tr} onPick={onAdjust} onClose={() => setAdjust(null)} />}
    </section>
  );
}

Object.assign(window, { AdvancedSection });
