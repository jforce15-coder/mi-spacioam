// ============================================================
// Spacio AM — Contabilidad · Resumen contable (P&L interno, solo admin)
// ------------------------------------------------------------
// Estado de resultados de Spacio AM, por bloques:
//   1) Socios            neto − retenciones = a pagar a socios
//   2) Operativo         fee + cleaning + gastos e inversión + long term = ingreso bruto
//   3) Gastos operativos software + salarios + viáticos + contabilidad → ingreso neto Spacio AM
//   4) Base de costos    cleaning − pago EPI
//   5) Gastos e inversión por categoría
//   6) Otros ingresos    huéspedes (long term)
//   7) Diseño interiores ingreso decoración − compra de mobiliario
//   8) JOV               fee + neto Socio_002 − gastos operativos; − emitidas a huéspedes = a facturar
// Arriba un bento de indicadores; vista por mes (editable) o por año (suma + tabla).
// ============================================================
(function () {
  "use strict";
  const { useState } = React;
  const pad2 = (n) => String(n + 1).padStart(2, "0");
  const ymStr = (y, m) => y + "-" + pad2(m);
  const monthLabel = (lang, y, m) => (lang === "es" ? SpacioI18n.MONTHS_ES : SpacioI18n.MONTHS_EN)[m] + " " + y;
  // montos: el dashboard trabaja en USD base → mostramos GTQ y USD a la vez
  const RATE = (window.SpacioI18n && window.SpacioI18n.GTQ_RATE) || 7.46;
  const fGTQ = (usd) => "Q" + Math.round((usd || 0) * RATE).toLocaleString("en-US");
  const fUSD = (usd) => "$" + Math.round(usd || 0).toLocaleString("en-US");
  // celda de monto con doble moneda (USD arriba, GTQ debajo)
  function Amt({ usd, strong, light }) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.22 }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: strong ? 700 : 500, color: light ? "var(--alabaster)" : "var(--ink)" }}>{fUSD(usd)}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 10.5, color: light ? "rgba(250,250,250,0.62)" : "var(--fg-muted)" }}>{fGTQ(usd)}</span>
      </span>
    );
  }

  // ---------- fuentes externas (todas convertidas a USD) ----------
  const toUsd = (v, cur) => (+v || 0) / (/USD/i.test(cur || "") ? 1 : RATE);
  const nrm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // movimientos de estados de cuenta (local + hoja), sin duplicados
  function bankRows() {
    const out = [], seen = {};
    const push = (r, ym, acc, cur) => {
      const d = +r.debit || 0, c = +r.credit || 0; if (!d && !c) return;
      const k = [acc, ym, r.date, r.doc || "", r.desc || "", d, c].join("|"); if (seen[k]) return; seen[k] = 1;
      out.push({ ym: String(ym || "").slice(0, 7), tag: r.tag || "", desc: r.desc || r.tag || "", date: r.date || "", debit: toUsd(d, cur), credit: toUsd(c, cur) });
    };
    try { (window.SpacioContaStore ? window.SpacioContaStore.listStatements() : []).forEach(st => (st.rows || []).forEach(r => push(r, st.ym, st.accId, st.currency))); } catch (e) {}
    ((window.SpacioData && window.SpacioData.conta) || []).forEach(r => push(r, r.ym, r.account, r.currency));
    return out;
  }
  // facturas recibidas: hoja (pestaña Facturas) + lote SAT del navegador
  function receivedInvoices() {
    const by = {};
    try { const d = window.pyaSatDraft && window.pyaSatDraft(); ((d && d.invoices) || []).forEach(i => { by[i.auth] = { auth: i.auth, ym: String(i.day || "").slice(0, 7), usd: toUsd(i.total, i.moneda), who: i.emisor || i.comercial || "", desc: ((i.items || [])[0] || {}).desc || "", clas: "" }; }); } catch (e) {}
    ((window.SaRows && window.SaRows.list("Facturas")) || []).filter(r => r.tipo !== "emitida").forEach(r => {
      const k = r.auth || r.id; const prev = by[k] || {};
      by[k] = Object.assign({}, prev, { auth: k, ym: (r.mes || String(r.fecha || "").slice(0, 7)) || prev.ym, usd: toUsd(r.total, r.moneda) || prev.usd || 0, who: r.contraparte || prev.who || "", desc: r.descripcion || prev.desc || "", clas: r.clasificacion || "", fuente: r.fuente || "" });
    });
    return Object.values(by);
  }
  // gasolina y comida de restaurante / tienda de conveniencia (nunca insumos)
  const VIAT_RE = /gasolin|combustib|diesel|shell|puma|texaco|\buno\b|estacion de servicio|restaur|comedor|cafeter|\bcafe\b|campero|mcdonald|burger|pizza|taco|starbucks|subway|domino|kfc|wendy|pollo|oxxo|super ?24|conveniencia|circle k|am ?pm/;
  function isViatico(f, insumoAuths) {
    if (insumoAuths[f.auth]) return false;
    if (f.clas) return /viatic/.test(nrm(f.clas));
    return VIAT_RE.test(nrm(f.who + " " + f.desc));
  }
  function issuedGuests() {
    return ((window.SaRows && window.SaRows.list("Facturas")) || []).filter(r => r.tipo === "emitida" && /hosped|huesped/.test(nrm(r.clasificacion)))
      .map(r => ({ ym: r.mes || String(r.fecha || "").slice(0, 7), usd: toUsd(r.total, r.moneda), who: r.contraparte || "" }));
  }
  function longTermRows() {
    return ((window.SaRows && window.SaRows.list("Long term")) || []).map(r => ({ ym: r.mes || String(r.fecha || "").slice(0, 7), usd: toUsd(r.monto, r.moneda), prop: r.property_name || "" }));
  }
  const byLabel = (items, key) => { const o = {}; items.forEach(x => { const k = x[key] || "—"; o[k] = (o[k] || 0) + x.usd; }); return Object.keys(o).sort((a, b) => o[b] - o[a]).map(k => ({ label: k, usd: o[k] })); };
  const sumU = (a) => a.reduce((t, x) => t + (x.usd || 0), 0);

  function ContaPLSection({ lang, t, currency, fmt, allProps }) {
    const tr = (es, en) => (lang === "es" ? es : en);
    const money = fmt.money;
    const [view, setView] = useState("year");
    const [tick, setTick] = useState(0);
    const reload = () => setTick(x => x + 1);
    const OX = window.SpacioContaOpex;
    React.useEffect(() => { const h = () => reload(); window.addEventListener("sa-rows", h); return () => window.removeEventListener("sa-rows", h); }, []);

    const ymsSet = {};
    (allProps || []).forEach(p => (p.months || []).forEach(m => { if (m.present) ymsSet[ymStr(m.y, m.m)] = { y: m.y, m: m.m }; }));
    const yms = Object.keys(ymsSet).sort().reverse();
    const years = [...new Set(yms.map(k => +k.slice(0, 4)))].sort((a, b) => b - a);
    const [ym, setYm] = useState(yms[0] || ymStr(new Date().getFullYear(), new Date().getMonth()));
    const [year, setYear] = useState(years[0] || new Date().getFullYear());

    // fuentes cargadas una vez por render
    const SRC = React.useMemo(() => {
      const insumoAuths = {};
      (allProps || []).forEach(p => (p.expenses || []).forEach(e => [e.authProductos, e.authTarifa].filter(Boolean).join(",").split(/[,\s]+/).filter(Boolean).forEach(a => { insumoAuths[a] = 1; })));
      return { bank: bankRows(), rec: receivedInvoices(), emit: issuedGuests(), lt: longTermRows(), insumoAuths };
    }, [tick, allProps]);

    function lineFor(p, y, m) {
      const mo = (p.months || []).find(x => x.y === y && x.m === m && x.present);
      if (!mo) return null;
      const cats = {}; let hasExp = false;
      (p.expenses || []).forEach(e => {
        if (e.y !== y || e.m !== m) return;
        if (e.catKey === "otros" || /otro ingreso/i.test(e.category || "")) return;
        hasExp = true; const k = e.category || "Sin categoría"; cats[k] = (cats[k] || 0) + (e.amount || 0);
      });
      if (!hasExp) { if (mo.insumos) cats["Insumos & gastos"] = mo.insumos; if (mo.reparaciones) cats["Inversiones & reparación"] = mo.reparaciones; }
      const gastosInv = Object.values(cats).reduce((a, v) => a + v, 0);
      return { name: p.name, code: p.code || "", neto: mo.ingresoNeto || 0, ret: mo.retencion || 0, fee: mo.fee || 0, cleaning: mo.cleaningFee || 0, gastosInv, cats };
    }
    function aggFor(y, m) {
      const key = ymStr(y, m);
      const rows = (allProps || []).map(p => lineFor(p, y, m)).filter(r => r && (r.neto || r.ret || r.fee || r.cleaning || r.gastosInv));
      const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
      const per = (k) => rows.filter(r => r[k]).map(r => ({ label: r.name, usd: r[k] }));
      const cat = {}; rows.forEach(r => Object.keys(r.cats).forEach(c => { cat[c] = (cat[c] || 0) + r.cats[c]; }));
      const catList = Object.keys(cat).sort((a, b) => cat[b] - cat[a]).map(c => ({ label: c, usd: cat[c] }));
      const catProps = {}; catList.forEach(c => { catProps[c.label] = rows.filter(r => r.cats[c.label]).map(r => ({ label: r.name, usd: r.cats[c.label] })); });
      const bank = SRC.bank.filter(b => b.ym === key);
      const mov = (re, side) => bank.filter(b => re.test(nrm(b.tag)) && b[side] > 0).map(b => ({ label: b.desc + (b.date ? " · " + b.date : ""), usd: b[side] }));
      const softwareD = mov(/software/, "debit"), salariosD = mov(/salari|sueldo|planilla|nomina|bonificaci|aguinaldo|bono 14|igss/, "debit"), contabD = mov(/^contabilidad$/, "debit"), epiD = mov(/primera impresi/, "debit");
      const disenoD = mov(/servicio.*decoraci|decoracion de interiores/, "credit");
      const mobBank = mov(/compra de mobiliario/, "debit");
      const rec = SRC.rec.filter(f => f.ym === key);
      const viatD = rec.filter(f => isViatico(f, SRC.insumoAuths)).map(f => ({ label: f.who || f.desc || f.auth, usd: f.usd }));
      const mobFact = rec.filter(f => /compra de mobiliario/.test(nrm(f.clas)) && f.fuente !== "estado-cuenta").map(f => ({ label: f.who + " · " + tr("factura", "invoice"), usd: f.usd }));
      const mobD = mobBank.concat(mobFact);
      const ltD = byLabel(SRC.lt.filter(x => x.ym === key), "prop");
      const emitD = SRC.emit.filter(x => x.ym === key).map(x => ({ label: x.who || tr("Huésped", "Guest"), usd: x.usd }));
      const opexList = OX.forMonth(key, "opex"), otroList = OX.forMonth(key, "otro");
      const opexManual = OX.totalUsd(opexList), otrosManual = OX.totalUsd(otroList);

      const A = { rows, opexList, otroList, opexManual, otrosManual, catList, catProps,
        netoD: per("neto"), retD: per("ret"), feeD: per("fee"), cleanD: per("cleaning"), invD: per("gastosInv"),
        softwareD, salariosD, contabD, viatD, epiD, disenoD, mobD, ltD, emitD };
      A.neto = sum("neto"); A.ret = sum("ret"); A.pagarSocios = A.neto - A.ret;
      A.fee = sum("fee"); A.cleaning = sum("cleaning"); A.gastosInv = sum("gastosInv"); A.longTerm = sumU(ltD);
      A.bruto = A.fee + A.cleaning + A.gastosInv + A.longTerm + otrosManual;
      A.software = sumU(softwareD); A.salarios = sumU(salariosD); A.viaticos = sumU(viatD); A.contab = sumU(contabD);
      A.opex = A.software + A.salarios + A.viaticos + A.contab + opexManual;
      A.netoSpacio = A.bruto - A.opex;
      A.epi = sumU(epiD); A.baseCostos = A.cleaning - A.epi;
      A.disenoIng = sumU(disenoD); A.mobiliario = sumU(mobD); A.disenoDif = A.disenoIng - A.mobiliario;
      A.socio002Neto = rows.filter(r => r.code === "Socio_002").reduce((a, r) => a + r.neto, 0);
      A.socio002D = rows.filter(r => r.code === "Socio_002" && r.neto).map(r => ({ label: r.name, usd: r.neto }));
      A.jov = A.fee + A.socio002Neto - A.opex;
      A.emitHues = sumU(emitD); A.aFacturar = A.jov - A.emitHues;
      return A;
    }

    const [yy, mm] = ym.split("-").map(Number);
    const [showTable, setShowTable] = useState(false);
    const Y = view === "month" ? yy : year;
    // meses del año en vista (para el bento)
    const monthsY = []; for (let m = 0; m < 12; m++) if (ymsSet[ymStr(Y, m)]) monthsY.push(m);
    const aggsY = monthsY.map(m => aggFor(Y, m));
    let A, P, periodLabel, prevLabel;
    if (view === "month") {
      A = aggFor(yy, mm - 1);
      const i = yms.indexOf(ym); const pk = yms[i + 1];
      P = pk ? aggFor(+pk.slice(0, 4), +pk.slice(5) - 1) : null;
      periodLabel = monthLabel(lang, yy, mm - 1); prevLabel = tr("vs mes anterior", "vs previous month");
    } else {
      A = sumAggs(aggsY);
      const py = []; for (let m = 0; m < 12; m++) if (ymsSet[ymStr(year - 1, m)]) py.push(aggFor(year - 1, m));
      P = py.length ? sumAggs(py) : null;
      periodLabel = String(year); prevLabel = tr("vs " + (year - 1), "vs " + (year - 1));
    }
    const MONTHS = lang === "es" ? SpacioI18n.MONTHS_ES : SpacioI18n.MONTHS_EN;

    return (
      <div className="plx">
        <div className="plx-bar">
          <Segmented size="sm" value={view} onChange={setView}
            options={[{ value: "year", label: tr("Por año", "Yearly") }, { value: "month", label: tr("Por mes", "Monthly") }]} />
          {view === "month"
            ? <Select value={ym} options={yms.map(k => ({ value: k, label: monthLabel(lang, +k.slice(0, 4), +k.slice(5) - 1) }))} onChange={setYm} icon="calendar" minWidth={170} />
            : <Select value={String(year)} options={years.map(y => ({ value: String(y), label: String(y) }))} onChange={(v) => setYear(+v)} icon="calendar" minWidth={130} />}
          <span className="plx-cur">USD · GTQ</span>
        </div>

        {monthsY.length > 0 && <PLBento A={A} P={P} aggsY={aggsY} labels={monthsY.map(m => MONTHS[m].slice(0, 3))} hiIdx={view === "month" ? monthsY.indexOf(mm - 1) : -1} period={periodLabel} prevLabel={prevLabel} tr={tr} />}

        <PLBlocks key={view + ym + year} A={A} ym={ym} editable={view === "month"} period={periodLabel} lang={lang} tr={tr} money={money} reload={reload} />

        {view === "year" && (
          <section className="plx-sec">
            <div className="plx-sech">
              <div><div className="plx-kick">{tr("Detalle", "Detail")}</div><h3 className="plx-h">{tr("Mes a mes", "Month by month")}</h3></div>
              <button type="button" className="plx-link" onClick={() => setShowTable(v => !v)}>{showTable ? tr("Ocultar tabla", "Hide table") : tr("Ver tabla por mes", "Show monthly table")}<Icon name="chevronDown" size={13} stroke="currentColor" style={{ transform: showTable ? "rotate(180deg)" : "none", transition: "transform .18s var(--ease)" }} /></button>
            </div>
            {showTable && <PLYear year={year} aggFor={aggFor} ymsSet={ymsSet} lang={lang} tr={tr} money={money} />}
          </section>
        )}
      </div>
    );
  }

  // suma de varios meses: números se suman, listas {label,usd} se agrupan por etiqueta
  function mergeList(lists) { const o = {}, order = []; lists.forEach(l => (l || []).forEach(x => { const k = typeof x.label === "string" ? x.label : String(x.label); if (!(k in o)) { o[k] = 0; order.push(k); } o[k] += x.usd || 0; })); return order.map(k => ({ label: k, usd: o[k] })).sort((a, b) => b.usd - a.usd); }
  function sumAggs(list) {
    const out = { opexList: [], otroList: [], rows: [] };
    if (!list.length) return out;
    Object.keys(list[0]).forEach(k => {
      const v0 = list[0][k];
      if (typeof v0 === "number") out[k] = list.reduce((a, g) => a + (g[k] || 0), 0);
      else if (k === "catProps") { const keys = [...new Set(list.flatMap(g => Object.keys(g.catProps || {})))]; out.catProps = {}; keys.forEach(c => { out.catProps[c] = mergeList(list.map(g => (g.catProps || {})[c])); }); }
      else if (Array.isArray(v0) && k !== "rows" && k !== "opexList" && k !== "otroList") out[k] = mergeList(list.map(g => g[k]));
    });
    return out;
  }

  // ---------- estilos ----------
  const PL_CSS = `
.plx-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 0; margin-bottom: 18px; background: rgba(250,250,250,0.88); backdrop-filter: blur(20px) saturate(120%); -webkit-backdrop-filter: blur(20px) saturate(120%); }
.plx-cur { margin-left: auto; font-family: var(--sans); font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-muted); }
.plx-kick { font-family: var(--sans); font-size: 11px; font-weight: 500; letter-spacing: 0.32em; text-transform: uppercase; color: var(--fg-muted); }
.plx-h { font-family: var(--serif); font-weight: 400; font-size: clamp(24px, 3vw, 32px); line-height: 1.12; letter-spacing: -0.01em; color: var(--ink); margin: 6px 0 0; }
.plx-sub { font-family: var(--sans); font-size: 12.5px; line-height: 1.7; letter-spacing: 0.04em; color: var(--fg-muted); margin: 8px 0 0; max-width: 620px; text-wrap: pretty; }
.plx-sec { margin-top: 64px; }
.plx-sech { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.plx-link { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--warm-grey); background: var(--surface, #fff); border-radius: 999px; padding: 9px 16px; cursor: pointer; font-family: var(--sans); font-size: 10.5px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink); transition: border-color .18s var(--ease); }
.plx-link:hover { border-color: var(--ink); }
/* bento */
.plb-bento { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 780px) { .plb-bento { grid-template-columns: repeat(2, minmax(0,1fr)); } .plb-t.big { grid-column: 1 / -1; } }
@media (min-width: 1080px) { .plb-bento { grid-template-columns: repeat(4, minmax(0,1fr)); } .plb-t.big { grid-column: span 2; grid-row: span 2; } }
.plb-t { background: var(--surface, #fff); border: 1px solid var(--ink-08); border-radius: 28px; box-shadow: var(--shadow-sm); padding: 22px 22px 18px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.plb-th { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.plb-tk { font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-muted); }
.plb-tt { font-family: var(--serif); font-size: 19px; line-height: 1.15; color: var(--ink); margin-top: 4px; }
.plb-num { font-family: var(--sans); font-size: 30px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; color: var(--ink); line-height: 1.05; }
.plb-num2 { font-family: var(--sans); font-size: 12px; font-variant-numeric: tabular-nums; color: var(--fg-muted); }
.plb-note { font-family: var(--sans); font-size: 11px; line-height: 1.55; letter-spacing: 0.03em; color: var(--fg-muted); margin-top: auto; text-wrap: pretty; }
.plb-leg { display: flex; gap: 18px; flex-wrap: wrap; }
.plb-leg span { display: inline-flex; align-items: center; gap: 7px; font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-muted); }
.plb-leg i { width: 9px; height: 9px; border-radius: 3px; }
.plb-kpis { display: flex; gap: 28px; flex-wrap: wrap; }
.plb-delta { display: inline-flex; align-items: center; gap: 4px; font-family: var(--sans); font-size: 11px; font-weight: 600; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
.plb-delta small { font-weight: 400; color: var(--fg-muted); letter-spacing: 0.03em; }
.plb-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 4px 12px; align-items: baseline; padding: 9px 0; border-top: 1px solid var(--ink-08); }
.plb-row:first-of-type { border-top: none; }
.plb-row b { font-family: var(--sans); font-size: 12px; font-weight: 500; letter-spacing: 0.02em; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plb-row em { font-style: normal; font-family: var(--sans); font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.plb-bar { grid-column: 1 / -1; position: relative; height: 6px; border-radius: 999px; background: var(--bg-alt); overflow: hidden; }
.plb-bar i { position: absolute; top: 0; bottom: 0; border-radius: 999px; }
.plb-bar::after { content: ""; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--warm-grey); }
.plb-dn { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.plb-dn-l { flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 8px; }
.plb-dn-l div { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-family: var(--sans); font-size: 11.5px; color: var(--ink); }
.plb-dn-l span { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.plb-dn-l i { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.plb-dn-l em { font-style: normal; font-variant-numeric: tabular-nums; color: var(--fg-muted); }
/* bloques */
.plk-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 900px) { .plk-grid.two { grid-template-columns: repeat(2, minmax(0,1fr)); } }
.plk { background: var(--surface, #fff); border: 1px solid var(--ink-08); border-radius: 28px; box-shadow: var(--shadow-sm); overflow: hidden; min-width: 0; transition: box-shadow .18s var(--ease), transform .18s var(--ease); }
.plk:hover { box-shadow: var(--shadow-md); }
.plk.dark { background: var(--ink); border-color: var(--ink); }
.plk-hd { width: 100%; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 16px; align-items: center; border: none; background: transparent; cursor: pointer; text-align: left; padding: 22px 26px; }
.plk-hd:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--peach); border-radius: 28px; }
.plk-n { display: inline-flex; align-items: center; gap: 10px; font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-muted); }
.plk-n b { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 7px; border-radius: 999px; background: var(--bg-alt); color: var(--ink); font-size: 11px; letter-spacing: 0.04em; }
.plk.dark .plk-n { color: rgba(250,250,250,0.7); } .plk.dark .plk-n b { background: rgba(250,250,250,0.12); color: var(--alabaster); }
.plk-t { font-family: var(--serif); font-size: 21px; line-height: 1.15; color: var(--ink); margin-top: 8px; }
.plk.dark .plk-t { color: var(--alabaster); }
.plk-p { font-family: var(--sans); font-size: 11.5px; line-height: 1.55; letter-spacing: 0.03em; color: var(--fg-muted); margin-top: 4px; text-wrap: pretty; }
.plk.dark .plk-p { color: rgba(250,250,250,0.62); }
.plk-r { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.plk-rl { font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-muted); }
.plk.dark .plk-rl { color: rgba(250,250,250,0.62); }
.plk-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 10px; font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
.plk-chip.pos { background: rgba(61,107,82,0.10); color: #3d6b52; }
.plk-chip.neg { background: var(--peach-12, rgba(233,130,106,0.12)); color: var(--attention-text, #B54D36); }
.plk-chip i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.plk-chip.neg i { background: var(--attention, #F2755A); }
.plk-tg { display: inline-flex; align-items: center; gap: 6px; font-family: var(--sans); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-muted); }
.plk.dark .plk-tg { color: rgba(250,250,250,0.62); }
.plk-body { border-top: 1px solid var(--ink-08); animation: sa-fade .36s var(--ease); }
.plk.dark .plk-body { border-top-color: rgba(250,250,250,0.12); background: rgba(250,250,250,0.04); }
.pl-ln { border-top: 1px solid var(--ink-08); }
.pl-ln:first-child { border-top: none; }
.plk.dark .pl-ln { border-top-color: rgba(250,250,250,0.1); }
.pl-ln-b { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 14px; border: none; background: transparent; padding: 12px 26px; text-align: left; font-family: var(--sans); }
.pl-ln-b.x { cursor: pointer; }
.pl-ln-b.x:hover { background: var(--bg-alt); }
.plk.dark .pl-ln-b.x:hover { background: rgba(250,250,250,0.06); }
.pl-ln-l { display: inline-flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; letter-spacing: 0.02em; color: var(--ink); }
.plk.dark .pl-ln-l { color: var(--alabaster); }
.pl-sg { width: 16px; flex-shrink: 0; text-align: center; font-size: 15px; font-weight: 500; color: var(--fg-muted); }
.pl-sub { font-size: 10.5px; letter-spacing: 0.04em; color: var(--fg-muted); }
.pl-ln.eq .pl-ln-b { border-top: 1.5px solid var(--ink); }
.plk.dark .pl-ln.eq .pl-ln-b { border-top-color: rgba(250,250,250,0.4); }
.pl-det { background: var(--bg-alt); padding: 4px 0 8px; }
.plk.dark .pl-det { background: rgba(250,250,250,0.05); }
.pl-det-r { display: flex; justify-content: space-between; gap: 14px; padding: 7px 26px 7px 72px; font-family: var(--sans); font-size: 12px; letter-spacing: 0.02em; color: var(--ink); }
.plk.dark .pl-det-r { color: var(--alabaster); }
.pl-det-r span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-det-e { padding: 8px 26px 8px 72px; font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.03em; color: var(--fg-muted); }
.plk.dark .pl-sub, .plk.dark .pl-sg, .plk.dark .pl-det-e, .plk.dark .pl-det-r span span { color: rgba(250,250,250,0.62) !important; }
.plk.dark .pl-ln-b svg { stroke: rgba(250,250,250,0.62); }
.pl-man { padding: 14px 22px 4px; border-top: 1px solid var(--ink-08); }
.pl-man > div { margin-bottom: 10px !important; }
@media (max-width: 779px) {
  .plk-hd { grid-template-columns: 1fr; padding: 20px; } .plk-r { align-items: flex-start; }
  .pl-ln-b { padding-left: 18px; padding-right: 18px; } .pl-det-r, .pl-det-e { padding-left: 46px; padding-right: 18px; }
  .plb-num { font-size: 26px; }
}
`;
  (function () { const old = document.getElementById("pl-css"); if (old) old.remove(); const st = document.createElement("style"); st.id = "pl-css"; st.textContent = PL_CSS; document.head.appendChild(st); })();

  function Big({ usd, light, size }) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
        <span style={{ fontFamily: "var(--sans)", fontSize: size || 22, fontWeight: 600, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", color: light ? "var(--alabaster)" : "var(--ink)" }}>{(usd < 0 ? "−" : "") + fUSD(Math.abs(usd))}</span>
        <span style={{ fontFamily: "var(--sans)", fontSize: 12, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: light ? "rgba(250,250,250,0.62)" : "var(--fg-muted)" }}>{(usd < 0 ? "−" : "") + fGTQ(Math.abs(usd))}</span>
      </span>
    );
  }
  // variación: subir es bueno salvo que inverse; bajar = atención (peach), nunca rojo
  function Delta({ cur, prev, label, pts, inverse }) {
    if (prev == null || !isFinite(prev)) return null;
    let v;
    if (pts) v = (cur - prev) * 100;
    else { if (!prev) return null; v = ((cur - prev) / Math.abs(prev)) * 100; }
    if (!isFinite(v)) return null;
    const good = inverse ? v <= 0 : v >= 0;
    const flat = Math.abs(v) < 0.5;
    return (
      <span className="plb-delta" style={{ color: flat ? "var(--fg-muted)" : good ? "#3d6b52" : "var(--attention-text, #B54D36)" }}>
        <span style={{ color: flat ? "var(--fg-muted)" : good ? "#3d6b52" : "var(--attention, #F2755A)" }}>{flat ? "→" : v > 0 ? "↑" : "↓"}</span>
        {(v > 0 ? "+" : "") + v.toFixed(1) + (pts ? " pts" : "%")}
        {label && <small>{label}</small>}
      </span>
    );
  }

  // ---------- bento de indicadores ----------
  function PLBento({ A, P, aggsY, labels, hiIdx, period, prevLabel, tr }) {
    const [mode, setMode] = useState("mes");
    const cum = (arr) => { let a = 0; return arr.map(v => (a += v)); };
    const neto = aggsY.map(g => g.netoSpacio), jov = aggsY.map(g => g.jov);
    const nS = mode === "acum" ? cum(neto) : neto, jS = mode === "acum" ? cum(jov) : jov;
    const series = [
      { key: "jov-" + mode, name: tr("Ingreso total JOV", "JOV total income"), color: "var(--ink)", values: jS, fill: 0.05, width: 2 },
      { key: "neto-" + mode, name: tr("Ingreso neto Spacio AM", "Spacio AM net income"), color: "var(--peach)", values: nS, fill: 0.16, width: 2.5 },
    ];
    const margin = (g) => (g && g.bruto ? g.netoSpacio / g.bruto : null);
    const mCur = margin(A), mPrev = margin(P);
    const mSeries = aggsY.map(g => (margin(g) || 0) * 100);
    const comp = [
      { label: tr("Fee Spacio AM", "Spacio AM fee"), value: Math.max(0, A.fee || 0), color: "var(--peach)" },
      { label: "Cleaning fee", value: Math.max(0, A.cleaning || 0), color: "var(--ink)" },
      { label: tr("Gastos e inversión", "Expenses & inv."), value: Math.max(0, A.gastosInv || 0), color: "#6F6867" },
      { label: tr("Long term", "Long term"), value: Math.max(0, (A.longTerm || 0) + (A.otrosManual || 0)), color: "#938B8A" },
    ];
    const compT = comp.reduce((a, s) => a + s.value, 0) || 1;
    comp.forEach(s => { s.pretty = Math.round((s.value / compT) * 100) + "%"; });
    const ctrl = [
      { label: tr("Base de costos", "Cost base"), v: A.baseCostos || 0 },
      { label: tr("Diseño de interiores", "Interior design"), v: A.disenoDif || 0 },
      { label: tr("Ingreso neto Spacio AM", "Spacio AM net"), v: A.netoSpacio || 0 },
    ];
    const cMax = Math.max(1, ...ctrl.map(x => Math.abs(x.v)));
    const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
    return (
      <div className="plb-bento">
        <div className="plb-t big">
          <div className="plb-th">
            <div><div className="plb-tk">{tr("Desempeño", "Performance")} · {labels.length ? period.slice(-4) : ""}</div><div className="plb-tt">{tr("Neto Spacio AM vs total JOV", "Spacio AM net vs JOV total")}</div></div>
            <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "mes", label: tr("Mes a mes", "Monthly") }, { value: "acum", label: tr("Acumulado", "Cumulative") }]} />
          </div>
          <div className="plb-kpis">
            <div><div className="plb-tk" style={{ display: "flex", alignItems: "center", gap: 7 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: "var(--peach)" }}></i>{tr("Neto Spacio AM", "Spacio AM net")} · {period}</div><div className="plb-num" style={{ marginTop: 6 }}>{fUSD(A.netoSpacio)}</div><div className="plb-num2">{fGTQ(A.netoSpacio)} · <Delta cur={A.netoSpacio} prev={P && P.netoSpacio} label={prevLabel} /></div></div>
            <div><div className="plb-tk" style={{ display: "flex", alignItems: "center", gap: 7 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: "var(--ink)" }}></i>{tr("Total JOV", "JOV total")} · {period}</div><div className="plb-num" style={{ marginTop: 6 }}>{fUSD(A.jov)}</div><div className="plb-num2">{fGTQ(A.jov)} · <Delta cur={A.jov} prev={P && P.jov} label={prevLabel} /></div></div>
          </div>
          <div style={{ flex: 1, minHeight: 200 }}>
            <LineChart series={series} labels={labels} height={240} formatY={v => "$" + (Math.abs(v) >= 1000 ? Math.round(v / 1000) + "k" : Math.round(v))} formatTip={v => fUSD(v)} />
          </div>
        </div>

        <div className="plb-t">
          <div><div className="plb-tk">{tr("Rentabilidad", "Profitability")}</div><div className="plb-tt">{tr("Margen operativo", "Operating margin")}</div></div>
          <div><div className="plb-num">{pct(mCur)}</div><div className="plb-num2"><Delta cur={mCur || 0} prev={mPrev} pts label={prevLabel} /></div></div>
          {mSeries.length > 1 && <Sparkline values={mSeries} color="var(--peach)" width={220} height={40} />}
          <p className="plb-note">{tr("De cada $100 de ingreso bruto, quedan " + (mCur == null ? "—" : "$" + Math.round(mCur * 100)) + " después de gastos operativos.", "Net left from every $100 of gross income.")}</p>
        </div>

        <div className="plb-t">
          <div><div className="plb-tk">{tr("Socios · " + period, "Owners · " + period)}</div><div className="plb-tt">{tr("A pagar y a facturar", "Payable and to invoice")}</div></div>
          <div className="plb-row"><b>{tr("A pagar a socios", "Payable to owners")}</b><em>{fUSD(A.pagarSocios)}</em><span style={{ gridColumn: "1 / -1" }}><Delta cur={A.pagarSocios} prev={P && P.pagarSocios} label={prevLabel} /></span></div>
          <div className="plb-row"><b>{tr("A facturar (JOV)", "To invoice (JOV)")}</b><em>{fUSD(A.aFacturar)}</em><span style={{ gridColumn: "1 / -1" }}><Delta cur={A.aFacturar} prev={P && P.aFacturar} label={prevLabel} /></span></div>
          <p className="plb-note">{tr("Retenciones del periodo: " + fUSD(A.ret) + ".", "Withholdings: " + fUSD(A.ret) + ".")}</p>
        </div>

        <div className="plb-t">
          <div><div className="plb-tk">{tr("Ingreso bruto · " + period, "Gross income · " + period)}</div><div className="plb-tt">{tr("¿De dónde viene?", "Where it comes from")}</div></div>
          <div className="plb-dn">
            <Donut segments={comp} size={140} thickness={16} centerLabel={"$" + (Math.abs(A.bruto) >= 1000 ? Math.round(A.bruto / 1000) + "k" : Math.round(A.bruto))} centerSub={tr("bruto", "gross")} />
            <div className="plb-dn-l">{comp.map((s, i) => <div key={i}><span><i style={{ background: s.color }}></i><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span></span><em>{s.pretty}</em></div>)}</div>
          </div>
        </div>

        <div className="plb-t">
          <div><div className="plb-tk">{tr("Controles · " + period, "Controls · " + period)}</div><div className="plb-tt">{tr("Recibido vs pagado", "Received vs paid")}</div></div>
          <div>
            {ctrl.map((x, i) => {
              const w = (Math.abs(x.v) / cMax) * 50;
              return (
                <div className="plb-row" key={i}>
                  <b>{x.label}</b>
                  <em style={{ color: x.v < 0 ? "var(--attention-text, #B54D36)" : "var(--ink)" }}>{(x.v < 0 ? "−" : "+") + fUSD(Math.abs(x.v))}</em>
                  <span className="plb-bar"><i style={x.v < 0 ? { right: "50%", width: w + "%", background: "var(--attention, #F2755A)" } : { left: "50%", width: w + "%", background: "#3d6b52" }}></i></span>
                </div>
              );
            })}
          </div>
          <p className="plb-note">{tr("A la derecha, a favor; a la izquierda, se pagó más de lo recibido.", "Right: surplus. Left: paid more than received.")}</p>
        </div>
      </div>
    );
  }

  // ---------- bloques ----------
  function PLLine({ sign, label, sub, usd, detail, eq, tr }) {
    const [open, setOpen] = useState(false);
    const can = detail != null;
    return (
      <div className={"pl-ln" + (eq ? " eq" : "")}>
        <button type="button" className={"pl-ln-b" + (can ? " x" : "")} onClick={() => can && setOpen(o => !o)} aria-expanded={can ? open : undefined}>
          <span className="pl-ln-l">
            <span className="pl-sg">{sign}</span>
            {can ? <Icon name="chevronDown" size={13} stroke={PLLine.dark ? "rgba(250,250,250,0.62)" : "var(--fg-muted)"} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .18s var(--ease)", flexShrink: 0 }} /> : <span style={{ width: 13, flexShrink: 0 }}></span>}
            <span style={{ minWidth: 0, fontWeight: eq ? 600 : 400 }}>{label}{sub && <span className="pl-sub"> · {sub}</span>}</span>
          </span>
          <span style={{ fontSize: 13 }}><Amt usd={usd} strong={eq} light={PLLine.dark} /></span>
        </button>
        {open && can && (
          <div className="pl-det">
            {detail.length ? detail.map((d, i) => <div key={i} className="pl-det-r"><span title={d.label}>{d.label}</span><span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fUSD(d.usd)} <span style={{ color: "var(--fg-muted)", fontSize: 10.5 }}>{fGTQ(d.usd)}</span></span></div>)
              : <div className="pl-det-e">{tr("Sin movimientos en el periodo.", "No entries in this period.")}</div>}
          </div>
        )}
      </div>
    );
  }
  function PLBlock({ n, title, purpose, totalLabel, total, dark, diff, lines, children, tr }) {
    const [open, setOpen] = useState(false);
    const nLines = lines.filter(Boolean).length;
    return (
      <div className={"plk" + (dark ? " dark" : "")}>
        <button type="button" className="plk-hd" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span style={{ minWidth: 0 }}>
            <span className="plk-n"><b>{n}</b>{totalLabel}</span>
            <span className="plk-t" style={{ display: "block" }}>{title}</span>
            {purpose && <span className="plk-p" style={{ display: "block" }}>{purpose}</span>}
          </span>
          <span className="plk-r">
            <Big usd={total} light={dark} />
            {diff && <span className={"plk-chip " + (total < 0 ? "neg" : "pos")}><i></i>{total < 0 ? tr("Se pagó más de lo recibido", "Paid more than received") : tr("A favor", "Surplus")}</span>}
            <span className="plk-tg">{open ? tr("Ocultar", "Hide") : tr("Ver " + nLines + " líneas", "Show " + nLines + " lines")}<Icon name="chevronDown" size={12} stroke="currentColor" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s var(--ease)" }} /></span>
          </span>
        </button>
        {open && (
          <div className="plk-body">
            {lines.filter(Boolean).map((l, i) => { PLLine.dark = !!dark; return <PLLine key={i} {...l} tr={tr} />; })}
            {children && <div className="pl-man">{children}</div>}
          </div>
        )}
      </div>
    );
  }
  function PLGroupHead({ kick, title, sub, first }) {
    return (
      <div className="plx-sech" style={first ? { marginTop: 0 } : null}>
        <div><div className="plx-kick">{kick}</div><h3 className="plx-h">{title}</h3>{sub && <p className="plx-sub">{sub}</p>}</div>
      </div>
    );
  }

  function PLBlocks({ A, ym, editable, period, lang, tr, money, reload }) {
    const OXL = window.SpacioContaOpex;
    return (
      <React.Fragment>
        <section className="plx-sec">
          <PLGroupHead kick={tr("Socios · " + period, "Owners · " + period)} title={tr("Lo que reciben los socios", "What owners receive")} sub={tr("Ingreso neto de las propiedades menos retenciones: lo que se les transfiere.", "Net property income less withholdings: what gets transferred.")} />
          <PLBlock n="1" tr={tr} title={tr("Socios", "Owners")} totalLabel={tr("A pagar a socios", "Payable to owners")} total={A.pagarSocios} lines={[
            { sign: "+", label: tr("Ingreso neto socios", "Owner net income"), usd: A.neto, detail: A.netoD },
            { sign: "−", label: tr("Retenciones socios", "Owner withholdings"), usd: A.ret, detail: A.retD },
          ]} />
        </section>

        <section className="plx-sec">
          <PLGroupHead kick={"Spacio AM · " + period} title={tr("La empresa operativa", "The operating company")} sub={tr("Lo que genera Spacio AM y lo que cuesta operarla.", "What Spacio AM earns and what it costs to run.")} />
          <div className="plk-grid">
            <PLBlock n="2" tr={tr} title={tr("Spacio AM operativo", "Spacio AM operations")} purpose={tr("Fee, cleaning, gastos e inversión y reservas directas.", "Fee, cleaning, expenses and direct stays.")} totalLabel={tr("Ingreso bruto", "Gross income")} total={A.bruto} lines={[
              { sign: "+", label: tr("Fee Spacio AM", "Spacio AM fee"), usd: A.fee, detail: A.feeD },
              { sign: "+", label: "Cleaning fee", usd: A.cleaning, detail: A.cleanD },
              { sign: "+", label: tr("Gastos e inversión", "Expenses & investment"), usd: A.gastosInv, detail: A.catList },
              { sign: "+", label: tr("Otros ingresos", "Other income"), sub: tr("reservas directas · long term", "direct stays · long term"), usd: A.longTerm, detail: A.ltD },
              A.otrosManual ? { sign: "+", label: tr("Otros ingresos manuales", "Manual other income"), usd: A.otrosManual, detail: editable ? A.otroList.map(r => ({ label: r.concepto, usd: OXL.totalUsd([r]) })) : null } : null,
            ]}>
              {editable && <OpexForm kind="otro" ym={ym} lang={lang} tr={tr} money={money} list={A.otroList} reload={reload} title={tr("Agregar otro ingreso manual", "Add manual income")} totalUsd={A.otrosManual} />}
            </PLBlock>
            <PLBlock n="3" tr={tr} dark title={tr("Gastos operativos", "Operating expenses")} purpose={tr("Software, salarios, viáticos y contabilidad sobre el ingreso bruto.", "Software, salaries, travel and accounting.")} totalLabel={tr("Ingreso neto Spacio AM", "Spacio AM net income")} total={A.netoSpacio} lines={[
              { sign: "", label: tr("Ingreso bruto", "Gross income"), usd: A.bruto },
              { sign: "−", label: "Software", sub: tr("estados de cuenta", "bank statements"), usd: A.software, detail: A.softwareD },
              { sign: "−", label: tr("Salarios", "Salaries"), sub: tr("estados de cuenta", "bank statements"), usd: A.salarios, detail: A.salariosD },
              { sign: "−", label: tr("Viáticos", "Travel & meals"), sub: tr("gasolina y comida · facturas", "fuel & meals · invoices"), usd: A.viaticos, detail: A.viatD },
              { sign: "−", label: tr("Contabilidad", "Accounting"), sub: tr("estados de cuenta", "bank statements"), usd: A.contab, detail: A.contabD },
              A.opexManual ? { sign: "−", label: tr("Otros gastos manuales", "Manual expenses"), usd: A.opexManual, detail: editable ? A.opexList.map(r => ({ label: r.concepto, usd: OXL.totalUsd([r]) })) : null } : null,
              { sign: "=", eq: true, label: tr("Ingreso neto Spacio AM", "Spacio AM net income"), usd: A.netoSpacio },
            ]}>
              {editable && <OpexForm kind="opex" ym={ym} lang={lang} tr={tr} money={money} list={A.opexList} reload={reload} title={tr("Agregar gasto operativo manual", "Add manual expense")} totalUsd={A.opexManual} />}
            </PLBlock>
          </div>
        </section>

        <section className="plx-sec">
          <PLGroupHead kick={tr("Controles · " + period, "Controls · " + period)} title={tr("Recibido vs pagado", "Received vs paid")} sub={tr("Una diferencia positiva es a favor; una negativa significa que se pagó más de lo que se recibió en ese rubro.", "Positive is a surplus; negative means more was paid than received.")} />
          <div className="plk-grid two">
            <PLBlock n="4" tr={tr} diff title={tr("Base de costos", "Cost base")} purpose={tr("Cleaning fee cobrado vs pagos al equipo EPI.", "Cleaning fee vs EPI payments.")} totalLabel={tr("Diferencia", "Difference")} total={A.baseCostos} lines={[
              { sign: "+", label: tr("Cleaning fee (ingreso)", "Cleaning fee (income)"), usd: A.cleaning, detail: A.cleanD },
              { sign: "−", label: tr("Pago EPI", "EPI payments"), sub: tr("equipo de primera impresión", "first-impression team"), usd: A.epi, detail: A.epiD },
            ]} />
            <PLBlock n="5" tr={tr} title={tr("Gastos e inversión", "Expenses & investment")} purpose={tr("Mismas categorías de la pestaña Gastos e inversiones.", "Same categories as the Expenses tab.")} totalLabel={tr("Total", "Total")} total={A.gastosInv}
              lines={A.catList.length ? A.catList.map(c => ({ sign: "+", label: c.label, usd: c.usd, detail: (A.catProps || {})[c.label] || [] })) : [{ sign: "", label: tr("Sin gastos en el periodo", "No expenses in period"), usd: 0 }]} />
            <PLBlock n="6" tr={tr} title={tr("Otros ingresos", "Other income")} purpose={tr("Huéspedes de estadía larga (Long term).", "Long-stay guests.")} totalLabel={tr("Total", "Total")} total={A.longTerm} lines={[
              { sign: "+", label: tr("Ingresos por huéspedes", "Guest income"), sub: "long term", usd: A.longTerm, detail: A.ltD },
            ]} />
            <PLBlock n="7" tr={tr} diff title={tr("Diseño de interiores", "Interior design")} purpose={tr("Servicio de decoración cobrado vs mobiliario comprado.", "Decoration income vs furniture bought.")} totalLabel={tr("Diferencia", "Difference")} total={A.disenoDif} lines={[
              { sign: "+", label: tr("Ingreso por servicio de decoración", "Decoration service income"), usd: A.disenoIng, detail: A.disenoD },
              { sign: "−", label: tr("Compra de mobiliario", "Furniture purchases"), usd: A.mobiliario, detail: A.mobD },
            ]} />
          </div>
        </section>

        <section className="plx-sec">
          <PLGroupHead kick={"JOV · " + period} title={tr("Ingreso del dueño y facturación", "Owner income and invoicing")} sub={tr("Fee más el neto de Socio_002, menos gastos operativos. Restando lo ya facturado a huéspedes queda lo que falta facturar.", "Fee plus Socio_002 net, less operating expenses, less guest invoices.")} />
          <PLBlock n="8" tr={tr} dark title="JOV" purpose={tr("Ingreso total JOV: " + fUSD(A.jov) + ".", "JOV total income: " + fUSD(A.jov) + ".")} totalLabel={tr("A facturar", "To invoice")} total={A.aFacturar} lines={[
            { sign: "+", label: tr("Fee Spacio AM", "Spacio AM fee"), usd: A.fee, detail: A.feeD },
            { sign: "+", label: tr("Ingreso neto Socio_002", "Socio_002 net income"), usd: A.socio002Neto, detail: A.socio002D },
            { sign: "−", label: tr("Gastos operativos", "Operating expenses"), usd: A.opex },
            { sign: "=", eq: true, label: tr("Ingreso total JOV", "JOV total income"), usd: A.jov },
            { sign: "−", label: tr("Facturas emitidas a huéspedes", "Invoices issued to guests"), usd: A.emitHues, detail: A.emitD },
            { sign: "=", eq: true, label: tr("A facturar", "To invoice"), usd: A.aFacturar },
          ]} />
        </section>
      </React.Fragment>
    );
  }

  const thStyle = (first) => ({
    textAlign: first ? "left" : "right", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 9.5, fontWeight: 600,
    color: "var(--fg-muted)", padding: "11px 16px", borderBottom: "1px solid var(--warm-grey)", whiteSpace: "nowrap", background: "var(--alabaster)",
  });
  const tdStyle = (first) => ({
    textAlign: first ? "left" : "right", padding: "10px 16px", borderTop: "1px solid var(--ink-08)",
    fontSize: 13, color: "var(--ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
  });

  // ---- formulario + lista de gastos operativos / otros ingresos ----
  function OpexForm({ kind, ym, lang, tr, money, list, reload, title, totalUsd }) {
    const [concepto, setConcepto] = useState("");
    const [monto, setMonto] = useState("");
    const [cur, setCur] = useState("GTQ");
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const inputRef = React.useRef(null);
    const [open, setOpen] = useState(false);
    const OX = window.SpacioContaOpex;

    const submit = async () => {
      const n = parseFloat(String(monto).replace(/[^0-9.\-]/g, ""));
      if (!concepto.trim() || !n) return;
      setBusy(true);
      const rec = { kind, ym, concepto: concepto.trim(), monto: n, currency: cur };
      try {
        if (file && window.SpacioFiles && window.SpacioFiles.upload) {
          const up = await window.SpacioFiles.upload({ kind: "opex", scope: "conta", property_name: "", ym, file, multiple: true });
          if (up && up.url) { rec.fileUrl = up.url; rec.fileName = file.name; }
        }
      } catch (e) {}
      OX.add(rec);
      setConcepto(""); setMonto(""); setFile(null); setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      reload();
    };

    return (
      <div style={{ border: "1px dashed var(--warm-grey)", borderRadius: 14, marginBottom: 16, background: "var(--alabaster)", overflow: "hidden" }}>
        <button onClick={() => setOpen(o => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, border: "none", cursor: "pointer", background: "transparent", padding: "11px 14px", textAlign: "left" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
            <Icon name="chevronDown" size={15} stroke="var(--fg-muted)" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .18s var(--ease)" }} />
            <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{title}</span>
            {list.length > 0 && <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--fg-muted)" }}>{list.length}</span>}
          </span>
          <span style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.22 }}>
            <span style={{ fontVariantNumeric: "tabular-nums", color: kind === "opex" ? "var(--attention-text)" : "var(--ink)" }}>{(kind === "opex" ? "− " : "+ ") + fUSD(totalUsd)}</span>
            <span style={{ fontSize: 10.5, color: "var(--fg-muted)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fGTQ(totalUsd)}</span>
          </span>
        </button>
        {open && <div style={{ borderTop: "1px solid var(--ink-08)", padding: "14px 18px 16px" }}>
        {list.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {list.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--beige-soft)", borderRadius: 11 }}>
                <span style={{ flex: 1, fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--ink)", letterSpacing: "0.02em" }}>{r.concepto}</span>
                {r.fileUrl && <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" title={r.fileName} style={{ color: "var(--fg-muted)", display: "inline-flex" }}><Icon name="file" size={14} stroke="currentColor" /></a>}
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{r.currency === "GTQ" ? "Q" : "$"}{(+r.monto).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <button onClick={() => { OX.remove(r.id); reload(); }} title={tr("Eliminar", "Delete")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)", display: "inline-flex", padding: 2 }}><Icon name="x" size={14} stroke="currentColor" /></button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder={tr("Concepto", "Description")}
            style={{ flex: "2 1 180px", minWidth: 140, border: "1px solid var(--warm-grey)", borderRadius: 10, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--ink)", background: "var(--alabaster)" }} />
          <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="decimal" placeholder={tr("Monto", "Amount")}
            style={{ flex: "1 1 90px", minWidth: 80, border: "1px solid var(--warm-grey)", borderRadius: 10, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--ink)", background: "var(--alabaster)", textAlign: "right" }} />
          <Segmented size="sm" value={cur} onChange={setCur} options={[{ value: "GTQ", label: "GTQ" }, { value: "USD", label: "USD" }]} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", border: "1px solid var(--warm-grey)", borderRadius: 10, padding: "9px 12px", fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.04em", color: file ? "var(--ink)" : "var(--fg-muted)", background: "var(--alabaster)" }}>
            <Icon name="paperclip" size={14} stroke="currentColor" />{file ? (file.name.length > 14 ? file.name.slice(0, 12) + "…" : file.name) : tr("Adjuntar", "Attach")}
            <input ref={inputRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={e => setFile(e.target.files[0] || null)} />
          </label>
          <button onClick={submit} disabled={busy || !concepto.trim() || !monto} className="sa-file-btn dark" style={{ opacity: (busy || !concepto.trim() || !monto) ? 0.5 : 1 }}>
            {busy ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(250,250,250,0.5)", borderTopColor: "var(--alabaster)", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="plus" size={15} stroke="currentColor" />}
            {tr("Agregar", "Add")}
          </button>
        </div>
        </div>}
      </div>
    );
  }

  // ---- vista anual (12 meses en columnas) ----
  function PLYear({ year, aggFor, ymsSet, lang, tr, money }) {
    const monthsPresent = [];
    for (let m = 0; m < 12; m++) if (ymsSet[ymStr(year, m)]) monthsPresent.push(m);
    if (!monthsPresent.length) {
      return <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--fg-muted)", letterSpacing: "0.04em", textAlign: "center", padding: "40px 0" }}>{tr("Sin datos para este año.", "No data for this year.")}</p>;
    }
    const aggs = monthsPresent.map(m => aggFor(year, m));
    const MONTHS = lang === "es" ? SpacioI18n.MONTHS_ES : SpacioI18n.MONTHS_EN;
    const H = (label) => ({ head: label });
    const lines = [
      H(tr("1 · Socios", "1 · Owners")),
      { label: tr("Ingreso neto socios", "Owner net income"), key: "neto" },
      { label: tr("Retenciones socios", "Owner withholdings"), key: "ret" },
      { label: tr("A pagar a socios", "Payable to owners"), key: "pagarSocios", strong: true },
      H(tr("2 · Spacio AM operativo", "2 · Spacio AM operations")),
      { label: tr("Fee Spacio AM", "Spacio AM fee"), key: "fee" },
      { label: "Cleaning fee", key: "cleaning" },
      { label: tr("Gastos e inversión", "Expenses & investment"), key: "gastosInv" },
      { label: tr("Otros ingresos (long term)", "Other income (long term)"), key: "longTerm" },
      { label: tr("Ingreso bruto", "Gross income"), key: "bruto", strong: true },
      H(tr("3 · Gastos operativos", "3 · Operating expenses")),
      { label: "Software", key: "software" },
      { label: tr("Salarios", "Salaries"), key: "salarios" },
      { label: tr("Viáticos", "Travel & meals"), key: "viaticos" },
      { label: tr("Contabilidad", "Accounting"), key: "contab" },
      { label: tr("Ingreso neto Spacio AM", "Spacio AM net income"), key: "netoSpacio", strong: true, dark: true },
      H(tr("4 · Base de costos", "4 · Cost base")),
      { label: "Cleaning fee", key: "cleaning" },
      { label: tr("Pago EPI", "EPI payments"), key: "epi" },
      { label: tr("Diferencia", "Difference"), key: "baseCostos", strong: true },
      H(tr("5 · Gastos e inversión", "5 · Expenses & investment")),
      { label: tr("Gastos e inversión", "Expenses & investment"), key: "gastosInv", strong: true },
      H(tr("6 · Otros ingresos", "6 · Other income")),
      { label: tr("Ingresos por huéspedes", "Guest income"), key: "longTerm", strong: true },
      H(tr("7 · Diseño de interiores", "7 · Interior design")),
      { label: tr("Ingreso por decoración", "Decoration income"), key: "disenoIng" },
      { label: tr("Compra de mobiliario", "Furniture purchases"), key: "mobiliario" },
      { label: tr("Diferencia", "Difference"), key: "disenoDif", strong: true },
      H("JOV"),
      { label: tr("Fee Spacio AM", "Spacio AM fee"), key: "fee" },
      { label: tr("Ingreso neto Socio_002", "Socio_002 net income"), key: "socio002Neto" },
      { label: tr("Gastos operativos", "Operating expenses"), key: "opex" },
      { label: tr("Ingreso total JOV", "JOV total income"), key: "jov", strong: true },
      { label: tr("Facturas emitidas a huéspedes", "Invoices issued to guests"), key: "emitHues" },
      { label: tr("A facturar", "To invoice"), key: "aFacturar", strong: true, dark: true },
    ];
    const rowTotal = (key) => aggs.reduce((a, g) => a + (g[key] || 0), 0);
    const ncol = monthsPresent.length + 2;
    return (
      <React.Fragment>
      <div style={{ border: "1px solid var(--ink-08)", borderRadius: 18, overflow: "hidden", background: "var(--alabaster)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontFamily: "var(--sans)", width: "100%", minWidth: 120 + monthsPresent.length * 96 + 120 }}>
            <thead>
              <tr>
                <th style={Object.assign({}, thStyle(true), { position: "sticky", left: 0, zIndex: 2 })}>{tr("Concepto", "Line")}</th>
                {monthsPresent.map((m, i) => <th key={i} style={thStyle(false)}>{MONTHS[m]}</th>)}
                <th style={Object.assign({}, thStyle(false), { background: "var(--beige-soft)" })}>{tr("Total", "Total")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => ln.head ? (
                <tr key={i}><td colSpan={ncol} style={{ padding: i ? "26px 16px 8px" : "14px 16px 8px", fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--fg-muted)", borderTop: i ? "1px solid var(--warm-grey)" : "none", position: "sticky", left: 0 }}>{ln.head}</td></tr>
              ) : (
                <tr key={i} style={ln.dark ? { background: "var(--ink)" } : null}>
                  <td style={Object.assign({}, tdStyle(true), { position: "sticky", left: 0, background: ln.dark ? "var(--ink)" : "var(--alabaster)", color: ln.dark ? "var(--alabaster)" : "var(--ink)", zIndex: 1, fontWeight: ln.strong ? 700 : 400, borderTop: ln.strong ? "1.5px solid var(--ink)" : "1px solid var(--ink-08)" })}>{ln.label}</td>
                  {aggs.map((g, j) => <td key={j} style={Object.assign({}, tdStyle(false), { borderTop: ln.strong ? "1.5px solid var(--ink)" : "1px solid var(--ink-08)" })}><Amt usd={g[ln.key]} strong={ln.strong} light={ln.dark} /></td>)}
                  <td style={Object.assign({}, tdStyle(false), { background: ln.dark ? "var(--ink)" : "var(--beige-soft)", borderTop: ln.strong ? "1.5px solid var(--ink)" : "1px solid var(--ink-08)" })}><Amt usd={rowTotal(ln.key)} strong light={ln.dark} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </React.Fragment>
    );
  }

  window.ContaPLSection = ContaPLSection;
})();
