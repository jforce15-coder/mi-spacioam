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

function AdvancedSection({ lang, owner }) {
  const principal = !!(owner && owner.isAdmin && owner.isPrincipal);
  const [unlockOpen, setUnlockOpen] = avUseState(false);
  const es = lang !== "en"; const tr = (a, b) => (es ? a : b);
  const periods = avUseMemo(() => avPeriods(), []);
  const [ym, setYm] = avUseState(() => { try { return localStorage.getItem("sa-av-ym") || periods[1]; } catch (e) { return periods[1]; } });
  const [data, setData] = avUseState(null);   // { headers, rows, existing, ym }
  const [busy, setBusy] = avUseState("");
  const [msg, setMsg] = avUseState("");
  const [warn, setWarn] = avUseState("");   // inconsistencia tras agregar → ofrece forzar
  const [secs, setSecs] = avUseState(0);
  avUseEffect(() => {
    if (!busy) { setSecs(0); return; }
    const t0 = Date.now(); const iv = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [busy]);
  // el cálculo del mes puede tardar más de un minuto: límite amplio, pero con límite
  const AV_T = { timeout: 170000 };
  avUseEffect(() => { try { localStorage.setItem("sa-av-ym", ym); } catch (e) {} setData(null); setMsg(""); }, [ym]);
  const years = avUseMemo(() => [...new Set(periods.map(k => k.slice(0, 4)))], [periods]);
  const [yr, setYr] = avUseState(() => ym.slice(0, 4));
  // meses del año elegido, en orden cronológico (enero → diciembre)
  const monthsOfYr = periods.filter(k => k.slice(0, 4) === yr).slice().sort();
  const pickYear = (y) => { setYr(y); const ks = periods.filter(k => k.slice(0, 4) === y); if (ks.indexOf(ym) < 0 && ks.length) setYm(ks[0]); };

  const W = () => (window.SpacioWrite && window.SpacioWrite.enabled() ? window.SpacioWrite : null);
  const label = (k) => { const [y, m] = k.split("-"); return (es ? AV_MES : AV_MES_EN)[+m - 1] + " " + y; };

  const generate = async () => {
    const w = W(); if (!w) { setMsg(tr("Conecta la escritura en Setup para usar esta opción.", "Connect writing in Setup.")); return; }
    setBusy("gen"); setMsg(""); setWarn("");
    let res;
    try { res = await w.post("resumenPreview", { ym }, AV_T); } catch (e) { res = { error: (e && e.message) || "error" }; }
    setBusy("");
    if (res && res.ok) { setData(Object.assign({ ym }, res)); if (!res.rows.length) setMsg(tr("No hay reservas aceptadas con check-in en " + label(ym) + ".", "No accepted bookings this month.")); }
    else setMsg(tr("No se pudo generar: ", "Could not generate: ") + ((res && res.error) || tr("sin conexión", "offline")) + (res && res.timeout ? tr(" · el cálculo tardó demasiado; vuelve a intentar.", " · took too long; try again.") : ""));
  };
  const closed = avIsClosed(ym);
  const [lastUnlock, setLastUnlock] = avUseState(null);
  const append = async (unlock, force) => {
    const w = W(); if (!w || !data) return false;
    if (closed && !unlock) { if (principal) setUnlockOpen(true); return false; }
    if (unlock) setLastUnlock(unlock);
    setBusy(force ? "force" : "add"); setMsg(""); setWarn("");
    const payload = { ym }; if (unlock) payload.unlock = unlock; if (force) payload.force = true;
    let res;
    try {
      res = await w.post("resumenAppend", payload, AV_T);
      if (res && res.busy) { await new Promise(r => setTimeout(r, 5000)); res = await w.post("resumenAppend", payload, AV_T); }
    } catch (e) { res = { error: (e && e.message) || "error" }; }
    if (res && res.locked) { setBusy(""); if (unlock) return false; setMsg(tr("Este mes está cerrado.", "This month is closed.")); return false; }
    if (unlock) setUnlockOpen(false);
    if (res && res.ok) {
      const before = pending;
      setMsg(tr("Resumenconsolidado · " + label(ym) + ": " + res.added + " nuevas, " + res.updated + " actualizadas, " + res.same + " sin cambios" + (res.removed ? ", " + res.removed + " duplicadas eliminadas" : "") + (res.forced ? ", " + res.forced + " sobrescritas" : "") + ".", "Added " + res.added + ", updated " + res.updated + (res.forced ? ", overwrote " + res.forced : "") + "."));
      let again = null;
      try { again = await w.post("resumenPreview", { ym }, AV_T); } catch (e) {}
      setBusy("");
      if (again && again.ok) {
        setData(Object.assign({ ym }, again));
        // el servidor dijo "igual" pero la hoja sigue distinta → se ofrece sobrescribir
        const H = (again.headers || []).map(h => String(h).trim().toLowerCase());
        const ex = again.existing || {}; let still = 0;
        again.rows.forEach(r => { const o = {}; H.forEach((h, i) => { o[h] = r[i]; }); const e = ex[String(o["property_name"] || "").trim().toLowerCase()]; if (!e) { still++; return; } if (AV_COLS.some(c => Math.abs((+o[c.k] || 0) - (+e.values[c.k] || 0)) > 0.005)) still++; });
        if (still && !force) setWarn(tr(still + " propiedad(es) siguen distintas en Resumenconsolidado después de agregar. Puedes sobrescribirlas con este cálculo.", still + " propert(ies) still differ after adding. You can overwrite them with this calculation."));
      } else if (before) setWarn(tr("Se agregó, pero no se pudo releer la hoja. Genera el resumen de nuevo para confirmar.", "Added, but could not re-read the sheet. Generate again to confirm."));
      return true;
    } else { setBusy(""); setMsg(tr("No se pudo agregar: ", "Could not add: ") + ((res && res.error) || tr("sin conexión", "offline")) + (res && res.timeout ? tr(" · tardó demasiado. Genera el resumen de nuevo: si ya aparece igual, sí se guardó.", " · took too long. Generate again: if it shows as equal, it was saved.") : "")); if (unlock) setUnlockOpen(false); return true; }
  };
  const forceAppend = () => append(closed ? lastUnlock : undefined, true);

  // filas como objetos por encabezado + estado vs acumulado
  const view = avUseMemo(() => {
    if (!data || !data.rows) return null;
    const H = (data.headers || []).map(h => String(h).trim().toLowerCase());
    const rows = data.rows.map(r => { const o = {}; H.forEach((h, i) => { o[h] = r[i]; }); return o; });
    const ex = data.existing || {};
    const keyOf = (o) => String(o["property_name"] || "").trim().toLowerCase();
    let nNew = 0, nChg = 0, nSame = 0;
    rows.forEach(o => {
      const e = ex[keyOf(o)];
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
  }, [data]);
  const pending = view ? view.nNew + view.nChg + view.dups : 0;

  return (
    <section className="sa-section" style={{ marginTop: 28 }}>
      <SectionHead eyebrow={tr("Opciones avanzadas", "Advanced options")} title={tr("Resumen mensual", "Monthly summary")}
        sub={tr("Calcula el resumen de un mes con los mismos datos y reglas del Apps Script (Database, SETUP, insumos & gastos y TC) y te lo muestra aquí, sin tocar la pestaña Resumen.", "Computes the month with the same data and rules as the Apps Script and shows it here.")} />

      <div className="av-bar">
        <Segmented size="sm" value={yr} onChange={pickYear} options={years.slice().sort().map(y => ({ value: y, label: y }))} />
        <Select value={ym} onChange={setYm} icon="calendar" minWidth={180} sort={false} searchable={false} options={monthsOfYr.map(k => ({ value: k, label: (es ? AV_MES : AV_MES_EN)[+k.slice(5) - 1] }))} />
        <button className="av-btn dark" onClick={generate} disabled={!!busy}><Icon name="refresh" size={14} stroke="currentColor" />{busy === "gen" ? tr("Calculando…", "Computing…") + (secs > 2 ? " " + secs + "s" : "") : tr("Generar resumen", "Generate")}</button>
        <button className="av-btn warm" onClick={() => append()} disabled={!view || !view.rows.length || !!busy || !pending || (closed && !principal)} title={closed ? tr("Mes cerrado el " + avCloseLabel(ym, true), "Closed") : tr("Agrega las nuevas y actualiza las que cambiaron en Resumenconsolidado", "Upsert into Resumenconsolidado")}>
          <Icon name={closed ? "lock" : "plus"} size={14} stroke="currentColor" />{busy === "add" || busy === "force" ? tr("Agregando…", "Adding…") + (secs > 2 ? " " + secs + "s" : "") : (closed && principal ? tr("Desbloquear y agregar", "Unlock & add") : tr("Al acumulado", "To consolidated")) + (view && pending ? " · " + pending : "")}
        </button>
        <span className={"av-close " + (closed ? "closed" : "open")}><i></i>{closed ? tr("Cerrado el " + avCloseLabel(ym, true), "Closed " + avCloseLabel(ym, false)) : tr("Abierto hasta el " + avCloseLabel(ym, true), "Open until " + avCloseLabel(ym, false))}</span>
        {closed && !principal && <p className="av-msg">{tr("Este mes ya está cerrado: se puede consultar, pero solo el administrador principal puede modificarlo en Resumenconsolidado.", "This month is closed; only the principal admin can change it.")}</p>}
        {msg && <p className="av-msg" style={/No se pudo|Could not/.test(msg) ? { color: "var(--attention-text, #B54D36)" } : null}>{msg}</p>}
        {warn && !busy && (
          <p className="av-msg" style={{ color: "var(--attention-text, #B54D36)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span>{warn}</span>
            {(!closed || principal) && <button className="av-btn warm" onClick={forceAppend} style={{ padding: "6px 14px" }}><Icon name="refresh" size={14} stroke="currentColor" />{tr("Sobrescribir con este cálculo", "Overwrite with this calculation")}</button>}
          </p>
        )}
        {view && view.rows.length > 0 && !pending && !msg && <p className="av-msg">{tr("Resumenconsolidado ya tiene " + label(ym) + " igual a este cálculo.", "Already up to date.")}</p>}
      </div>

      {!view && !busy && (
        <div className="av-tbl-wrap"><div className="av-empty">{tr("Elige el periodo y presiona “Generar resumen”.", "Pick a period and press Generate.")}</div></div>
      )}
      {busy === "gen" && !view && (
        <div className="av-tbl-wrap"><div className="av-empty">{tr("Calculando " + label(ym) + "…", "Computing…")}{secs > 5 ? <span style={{ display: "block", marginTop: 8, fontSize: 12 }}>{tr("Lee Database, SETUP, insumos & gastos y TC; suele tardar entre 20 s y 2 min. " + secs + " s", "Reading sheets; usually 20 s – 2 min. " + secs + " s")}</span> : null}</div></div>
      )}

      {view && view.rows.length > 0 && (
        <React.Fragment>
          <div className="av-kpis">
            <div className="av-kpi"><div className="av-kpi-k">{tr("Propiedades", "Properties")}</div><div className="av-kpi-v">{view.rows.length}</div><div className="av-kpi-s">{view.nNew} {tr("nuevas", "new")} · {view.nChg} {tr("con cambios", "changed")}</div></div>
            <div className="av-kpi"><div className="av-kpi-k">{tr("Ingreso bruto", "Gross income")}</div><div className="av-kpi-v">{avFmt(view.tot["ingreso bruto"], "usd")}</div><div className="av-kpi-s">{view.tot["noches"]} {tr("noches", "nights")} · {view.tot["estadías"]} {tr("estadías", "stays")}</div></div>
            <div className="av-kpi"><div className="av-kpi-k">{tr("Fee Spacio", "Spacio fee")}</div><div className="av-kpi-v">{avFmt(view.tot["fee spacio"], "usd")}</div></div>
            <div className="av-kpi"><div className="av-kpi-k">{tr("Ingreso neto socios", "Owner net")}</div><div className="av-kpi-v">{avFmt(view.tot["ingreso neto"], "usd")}</div></div>
          </div>
          <div className="av-tbl-wrap">
            <div className="av-tbl-scroll">
              <table className="av-tbl">
                <thead><tr><th>{tr("Propiedad", "Property")}</th>{AV_COLS.map(c => <th key={c.k}>{c.l}</th>)}</tr></thead>
                <tbody>
                  {view.rows.map((o, i) => (
                    <tr key={i}>
                      <td>
                        <div className="av-prop">
                          <span>{o["property_name"]}</span>
                          <span className={"av-st " + o._st}><i></i>{o._st === "new" ? tr("Nueva", "New") : o._st === "chg" ? tr("Cambia", "Changed") : tr("Igual", "Same")}</span>
                          {o._dup && <span className="av-st dup"><i></i>{tr("Duplicada", "Duplicate")}</span>}
                        </div>
                      </td>
                      {AV_COLS.map(c => (
                        <td key={c.k} style={c.strong ? { fontWeight: 700 } : null} className={o._prev && c.k in o._prev ? "av-diff" : ""}>
                          {avFmt(o[c.k], c.f)}
                          {o._prev && c.k in o._prev && <small>{avFmt(o._prev[c.k], c.f)}</small>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td>{tr("Total", "Total")}</td>{AV_COLS.map(c => <td key={c.k}>{c.k in view.tot ? avFmt(view.tot[c.k], c.f) : ""}</td>)}</tr></tfoot>
              </table>
            </div>
            <div className="av-legend">
              <span><span className="av-st new"><i></i>{tr("Nueva", "New")}</span> {tr("no está en Resumenconsolidado", "not in consolidated")}</span>
              <span><span className="av-st chg"><i></i>{tr("Cambia", "Changed")}</span> {tr("el valor tachado es el que hay hoy", "struck-through value is current")}</span>
              <span><span className="av-st dup"><i></i>{tr("Duplicada", "Duplicate")}</span> {tr("hay más de una fila; se deja una sola", "extra rows get removed")}</span>
            </div>
          </div>
        </React.Fragment>
      )}
      {unlockOpen && <AvUnlockModal ym={ym} label={label(ym)} email={owner && owner.email} tr={tr} onClose={() => setUnlockOpen(false)} onUnlock={(u) => append(u)} />}
    </section>
  );
}

Object.assign(window, { AdvancedSection });
