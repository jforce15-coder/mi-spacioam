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
function avPeriods() {
  const out = [], now = new Date();
  for (let i = 0; i < 24; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
  return out;
}

function AdvancedSection({ lang }) {
  const es = lang !== "en"; const tr = (a, b) => (es ? a : b);
  const periods = avUseMemo(() => avPeriods(), []);
  const [ym, setYm] = avUseState(() => { try { return localStorage.getItem("sa-av-ym") || periods[1]; } catch (e) { return periods[1]; } });
  const [data, setData] = avUseState(null);   // { headers, rows, existing, ym }
  const [busy, setBusy] = avUseState("");
  const [msg, setMsg] = avUseState("");
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
    setBusy("gen"); setMsg("");
    const res = await w.post("resumenPreview", { ym });
    setBusy("");
    if (res && res.ok) { setData(Object.assign({ ym }, res)); if (!res.rows.length) setMsg(tr("No hay reservas aceptadas con check-in en " + label(ym) + ".", "No accepted bookings this month.")); }
    else setMsg(tr("No se pudo generar: ", "Could not generate: ") + ((res && res.error) || tr("sin conexión", "offline")));
  };
  const append = async () => {
    const w = W(); if (!w || !data) return;
    setBusy("add"); setMsg("");
    const res = await w.post("resumenAppend", { ym });
    setBusy("");
    if (res && res.ok) {
      setMsg(tr("Resumenconsolidado · " + label(ym) + ": " + res.added + " nuevas, " + res.updated + " actualizadas, " + res.same + " sin cambios" + (res.removed ? ", " + res.removed + " duplicadas eliminadas" : "") + ".", "Added " + res.added + ", updated " + res.updated + "."));
      const again = await w.post("resumenPreview", { ym }); if (again && again.ok) setData(Object.assign({ ym }, again));
    } else setMsg(tr("No se pudo agregar: ", "Could not add: ") + ((res && res.error) || tr("sin conexión", "offline")));
  };

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
        <button className="av-btn dark" onClick={generate} disabled={!!busy}><Icon name="refresh" size={14} stroke="currentColor" />{busy === "gen" ? tr("Calculando…", "Computing…") : tr("Generar resumen", "Generate")}</button>
        <button className="av-btn warm" onClick={append} disabled={!view || !view.rows.length || !!busy || !pending} title={tr("Agrega las nuevas y actualiza las que cambiaron en Resumenconsolidado", "Upsert into Resumenconsolidado")}>
          <Icon name="plus" size={14} stroke="currentColor" />{busy === "add" ? tr("Agregando…", "Adding…") : tr("Al acumulado", "To consolidated") + (view && pending ? " · " + pending : "")}
        </button>
        {msg && <p className="av-msg" style={/No se pudo|Could not/.test(msg) ? { color: "var(--attention-text, #B54D36)" } : null}>{msg}</p>}
        {view && view.rows.length > 0 && !pending && !msg && <p className="av-msg">{tr("Resumenconsolidado ya tiene " + label(ym) + " igual a este cálculo.", "Already up to date.")}</p>}
      </div>

      {!view && !busy && (
        <div className="av-tbl-wrap"><div className="av-empty">{tr("Elige el periodo y presiona “Generar resumen”.", "Pick a period and press Generate.")}</div></div>
      )}
      {busy === "gen" && !view && (
        <div className="av-tbl-wrap"><div className="av-empty">{tr("Calculando " + label(ym) + "…", "Computing…")}</div></div>
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
    </section>
  );
}

Object.assign(window, { AdvancedSection });
