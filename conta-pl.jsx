// ============================================================
// Spacio AM — Contabilidad · Resumen contable (P&L interno, solo admin)
// ------------------------------------------------------------
// Estado de resultados de Spacio AM, por bloques:
//   1) Socios            neto − retenciones = a pagar a socios
//   2) Operativo         fee + cleaning + gastos e inversión + long term = ingreso bruto
//   3) Gastos operativos software + viáticos + contabilidad → ingreso neto Spacio AM
//   4) Base de costos    cleaning − pago EPI
//   5) Gastos e inversión por categoría
//   6) Otros ingresos    huéspedes (long term)
//   7) Diseño interiores ingreso decoración − compra de mobiliario
//   JOV                  fee + neto Socio_002 − gastos operativos; − emitidas a huéspedes = a facturar
// Vista por mes (un mes) o por año (12 meses en columnas).
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
      const bank = SRC.bank.filter(b => b.ym === key);
      const mov = (re, side) => bank.filter(b => re.test(nrm(b.tag)) && b[side] > 0).map(b => ({ label: b.desc + (b.date ? " · " + b.date : ""), usd: b[side] }));
      const softwareD = mov(/software/, "debit"), contabD = mov(/^contabilidad$/, "debit"), epiD = mov(/primera impresi/, "debit");
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

      const A = { rows, opexList, otroList, opexManual, otrosManual, catList,
        netoD: per("neto"), retD: per("ret"), feeD: per("fee"), cleanD: per("cleaning"), invD: per("gastosInv"),
        softwareD, contabD, viatD, epiD, disenoD, mobD, ltD, emitD };
      A.neto = sum("neto"); A.ret = sum("ret"); A.pagarSocios = A.neto - A.ret;
      A.fee = sum("fee"); A.cleaning = sum("cleaning"); A.gastosInv = sum("gastosInv"); A.longTerm = sumU(ltD);
      A.bruto = A.fee + A.cleaning + A.gastosInv + A.longTerm + otrosManual;
      A.software = sumU(softwareD); A.viaticos = sumU(viatD); A.contab = sumU(contabD);
      A.opex = A.software + A.viaticos + A.contab + opexManual;
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
    const A = aggFor(yy, mm - 1);

    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <Segmented size="sm" value={view} onChange={setView}
            options={[{ value: "year", label: tr("Por año", "Yearly") }, { value: "month", label: tr("Por mes", "Monthly") }]} />
          {view === "month"
            ? <Select value={ym} options={yms.map(k => ({ value: k, label: monthLabel(lang, +k.slice(0, 4), +k.slice(5) - 1) }))} onChange={setYm} icon="calendar" minWidth={170} />
            : <Select value={String(year)} options={years.map(y => ({ value: String(y), label: String(y) }))} onChange={(v) => setYear(+v)} icon="calendar" minWidth={130} />}
          <span style={{ marginLeft: "auto", fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-muted)" }}>USD · GTQ</span>
        </div>
        {view === "month"
          ? <PLMonth key={ym} A={A} ym={ym} lang={lang} tr={tr} money={money} reload={reload} />
          : <PLYear year={year} aggFor={aggFor} ymsSet={ymsSet} lang={lang} tr={tr} money={money} />}
      </div>
    );
  }

  // ---------- piezas de la vista mensual ----------
  const PL_CSS = `
.pl-sep { display: flex; align-items: center; gap: 14px; margin: 44px 0 18px; }
.pl-sep:first-child { margin-top: 0; }
.pl-sep span { font-family: var(--sans); font-size: 11px; font-weight: 600; letter-spacing: 0.28em; text-transform: uppercase; color: var(--fg-muted); white-space: nowrap; }
.pl-sep i { flex: 1; height: 1px; background: var(--warm-grey); }
.pl-grp { border: 1px solid var(--ink-08); border-radius: 18px; background: var(--alabaster); overflow: hidden; margin-bottom: 14px; }
.pl-hd { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 14px; border: none; cursor: pointer; background: transparent; padding: 16px 20px; text-align: left; }
.pl-hd:hover { background: var(--bg-alt); }
.pl-hd-l { display: inline-flex; align-items: center; gap: 11px; min-width: 0; }
.pl-hd-n { font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 0.16em; color: var(--fg-muted); }
.pl-hd-t { font-family: var(--serif); font-size: 18px; color: var(--ink); line-height: 1.15; }
.pl-hd-s { display: block; font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-muted); margin-bottom: 2px; text-align: right; }
.pl-ln { border-top: 1px solid var(--ink-08); }
.pl-ln-b { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 14px; border: none; background: transparent; padding: 12px 20px; text-align: left; font-family: var(--sans); }
.pl-ln-b.x { cursor: pointer; }
.pl-ln-b.x:hover { background: var(--bg-alt); }
.pl-ln-l { display: inline-flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; letter-spacing: 0.02em; color: var(--ink); }
.pl-sg { width: 16px; flex-shrink: 0; text-align: center; font-size: 15px; font-weight: 500; color: var(--fg-muted); }
.pl-sub { font-size: 10.5px; letter-spacing: 0.04em; color: var(--fg-muted); }
.pl-det { background: var(--bg-alt); padding: 4px 0 8px; }
.pl-det-r { display: flex; justify-content: space-between; gap: 14px; padding: 7px 20px 7px 66px; font-family: var(--sans); font-size: 12px; letter-spacing: 0.02em; color: var(--ink); }
.pl-det-r span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-det-e { padding: 8px 20px 8px 66px; font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.03em; color: var(--fg-muted); }
.pl-tot { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 20px; border-top: 1.5px solid var(--ink); background: var(--beige-soft); }
.pl-tot.dark { background: var(--ink); border-top-color: var(--ink); }
.pl-tot-l { font-family: var(--sans); font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-muted); }
.pl-tot.dark .pl-tot-l { color: rgba(250,250,250,0.72); }
.pl-man { padding: 12px 16px 2px; border-top: 1px solid var(--ink-08); }
.pl-man > div { margin-bottom: 10px !important; }
@media (max-width: 779px) { .pl-det-r, .pl-det-e { padding-left: 46px; } .pl-hd, .pl-ln-b, .pl-tot { padding-left: 16px; padding-right: 16px; } }
`;
  (function () { if (document.getElementById("pl-css")) return; const st = document.createElement("style"); st.id = "pl-css"; st.textContent = PL_CSS; document.head.appendChild(st); })();

  function Big({ usd, light }) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
        <span style={{ fontFamily: "var(--sans)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", color: light ? "var(--alabaster)" : "var(--ink)" }}>{fUSD(usd)}</span>
        <span style={{ fontFamily: "var(--sans)", fontSize: 12, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: light ? "rgba(250,250,250,0.62)" : "var(--fg-muted)" }}>{fGTQ(usd)}</span>
      </span>
    );
  }
  function PLSep({ children }) { return <div className="pl-sep"><span>{children}</span><i></i></div>; }
  function PLLine({ sign, label, sub, usd, detail, tr }) {
    const [open, setOpen] = useState(false);
    const can = detail != null;
    return (
      <div className="pl-ln">
        <button type="button" className={"pl-ln-b" + (can ? " x" : "")} onClick={() => can && setOpen(o => !o)}>
          <span className="pl-ln-l">
            <span className="pl-sg">{sign}</span>
            {can ? <Icon name="chevronDown" size={13} stroke="var(--fg-muted)" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .18s var(--ease)", flexShrink: 0 }} /> : <span style={{ width: 13, flexShrink: 0 }}></span>}
            <span style={{ minWidth: 0 }}>{label}{sub && <span className="pl-sub"> · {sub}</span>}</span>
          </span>
          <span style={{ fontSize: 13 }}><Amt usd={usd} /></span>
        </button>
        {open && can && (
          <div className="pl-det">
            {detail.length ? detail.map((d, i) => <div key={i} className="pl-det-r"><span title={d.label}>{d.label}</span><span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fUSD(d.usd)} <span style={{ color: "var(--fg-muted)", fontSize: 10.5 }}>{fGTQ(d.usd)}</span></span></div>)
              : <div className="pl-det-e">{tr("Sin movimientos este mes.", "No entries this month.")}</div>}
          </div>
        )}
      </div>
    );
  }
  function PLGroup({ n, title, totalLabel, total, dark, lines, children, tr, open: open0 }) {
    const [open, setOpen] = useState(!!open0);
    return (
      <div className="pl-grp">
        <button type="button" className="pl-hd" onClick={() => setOpen(o => !o)}>
          <span className="pl-hd-l">
            <Icon name="chevronDown" size={15} stroke="var(--fg-muted)" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .18s var(--ease)", flexShrink: 0 }} />
            {n && <span className="pl-hd-n">{n}</span>}
            <span className="pl-hd-t">{title}</span>
          </span>
          <span><span className="pl-hd-s">{totalLabel}</span><Big usd={total} /></span>
        </button>
        {open && (
          <React.Fragment>
            {lines.filter(Boolean).map((l, i) => <PLLine key={i} {...l} tr={tr} />)}
            {children && <div className="pl-man">{children}</div>}
            <div className={"pl-tot" + (dark ? " dark" : "")}><span className="pl-tot-l">{totalLabel}</span><Big usd={total} light={dark} /></div>
          </React.Fragment>
        )}
      </div>
    );
  }

  function PLMonth({ A, ym, lang, tr, money, reload }) {
    return (
      <React.Fragment>
        <PLSep>{tr("Socios", "Owners")}</PLSep>
        <PLGroup n="01" tr={tr} title={tr("Socios", "Owners")} totalLabel={tr("A pagar a socios", "Payable to owners")} total={A.pagarSocios} lines={[
          { sign: "+", label: tr("Ingreso neto socios", "Owner net income"), usd: A.neto, detail: A.netoD },
          { sign: "−", label: tr("Retenciones socios", "Owner withholdings"), usd: A.ret, detail: A.retD },
        ]} />

        <PLSep>Spacio AM</PLSep>
        <PLGroup n="02" tr={tr} title={tr("Spacio AM operativo", "Spacio AM operations")} totalLabel={tr("Ingreso bruto", "Gross income")} total={A.bruto} lines={[
          { sign: "+", label: tr("Fee Spacio AM", "Spacio AM fee"), usd: A.fee, detail: A.feeD },
          { sign: "+", label: "Cleaning fee", usd: A.cleaning, detail: A.cleanD },
          { sign: "+", label: tr("Gastos e inversión", "Expenses & investment"), usd: A.gastosInv, detail: A.catList },
          { sign: "+", label: tr("Otros ingresos", "Other income"), sub: tr("reservas directas · long term", "direct stays · long term"), usd: A.longTerm, detail: A.ltD },
          A.otrosManual ? { sign: "+", label: tr("Otros ingresos manuales", "Manual other income"), usd: A.otrosManual, detail: A.otroList.map(r => ({ label: r.concepto, usd: window.SpacioContaOpex.totalUsd([r]) })) } : null,
        ]}>
          <OpexForm kind="otro" ym={ym} lang={lang} tr={tr} money={money} list={A.otroList} reload={reload} title={tr("Agregar otro ingreso manual", "Add manual income")} totalUsd={A.otrosManual} />
        </PLGroup>
        <PLGroup n="03" tr={tr} title={tr("Gastos operativos", "Operating expenses")} totalLabel={tr("Ingreso neto Spacio AM", "Spacio AM net income")} total={A.netoSpacio} dark lines={[
          { sign: "", label: tr("Ingreso bruto", "Gross income"), usd: A.bruto },
          { sign: "−", label: "Software", sub: tr("estados de cuenta", "bank statements"), usd: A.software, detail: A.softwareD },
          { sign: "−", label: tr("Viáticos", "Travel & meals"), sub: tr("gasolina y comida · facturas", "fuel & meals · invoices"), usd: A.viaticos, detail: A.viatD },
          { sign: "−", label: tr("Contabilidad", "Accounting"), sub: tr("estados de cuenta", "bank statements"), usd: A.contab, detail: A.contabD },
          A.opexManual ? { sign: "−", label: tr("Otros gastos manuales", "Manual expenses"), usd: A.opexManual, detail: A.opexList.map(r => ({ label: r.concepto, usd: window.SpacioContaOpex.totalUsd([r]) })) } : null,
        ]}>
          <OpexForm kind="opex" ym={ym} lang={lang} tr={tr} money={money} list={A.opexList} reload={reload} title={tr("Agregar gasto operativo manual", "Add manual expense")} totalUsd={A.opexManual} />
        </PLGroup>

        <PLSep>{tr("Comparativos", "Breakdowns")}</PLSep>
        <PLGroup n="04" tr={tr} title={tr("Base de costos", "Cost base")} totalLabel={tr("Diferencia", "Difference")} total={A.baseCostos} lines={[
          { sign: "+", label: tr("Cleaning fee (ingreso)", "Cleaning fee (income)"), usd: A.cleaning, detail: A.cleanD },
          { sign: "−", label: tr("Pago EPI", "EPI payments"), sub: tr("equipo de primera impresión", "first-impression team"), usd: A.epi, detail: A.epiD },
        ]} />
        <PLGroup n="05" tr={tr} title={tr("Gastos e inversión", "Expenses & investment")} totalLabel={tr("Total gastos e inversión", "Total")} total={A.gastosInv}
          lines={A.catList.length ? A.catList.map(c => ({ sign: "+", label: c.label, usd: c.usd, detail: A.rows.filter(r => r.cats[c.label]).map(r => ({ label: r.name, usd: r.cats[c.label] })) })) : [{ sign: "", label: tr("Sin gastos este mes", "No expenses this month"), usd: 0 }]} />
        <PLGroup n="06" tr={tr} title={tr("Otros ingresos", "Other income")} totalLabel={tr("Total otros ingresos", "Total")} total={A.longTerm} lines={[
          { sign: "+", label: tr("Ingresos por huéspedes", "Guest income"), sub: "long term", usd: A.longTerm, detail: A.ltD },
        ]} />
        <PLGroup n="07" tr={tr} title={tr("Diseño de interiores", "Interior design")} totalLabel={tr("Diferencia", "Difference")} total={A.disenoDif} lines={[
          { sign: "+", label: tr("Ingreso por servicio de decoración", "Decoration service income"), usd: A.disenoIng, detail: A.disenoD },
          { sign: "−", label: tr("Compra de mobiliario", "Furniture purchases"), usd: A.mobiliario, detail: A.mobD },
        ]} />

        <PLSep>JOV</PLSep>
        <PLGroup tr={tr} title={tr("Ingreso total JOV", "JOV total income")} totalLabel={tr("A facturar", "To invoice")} total={A.aFacturar} dark lines={[
          { sign: "+", label: tr("Fee Spacio AM", "Spacio AM fee"), usd: A.fee, detail: A.feeD },
          { sign: "+", label: tr("Ingreso neto Socio_002", "Socio_002 net income"), usd: A.socio002Neto, detail: A.socio002D },
          { sign: "−", label: tr("Gastos operativos", "Operating expenses"), usd: A.opex },
          { sign: "=", label: <b>{tr("Ingreso total JOV", "JOV total income")}</b>, usd: A.jov },
          { sign: "−", label: tr("Facturas emitidas a huéspedes", "Invoices issued to guests"), usd: A.emitHues, detail: A.emitD },
        ]} />
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
      <PLYearCharts aggs={aggs} monthsPresent={monthsPresent} MONTHS={MONTHS} year={year} tr={tr} />
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

  // ---- gráficos del año: Ingreso neto Spacio AM vs Ingreso total JOV ----
  function PLYearCharts({ aggs, monthsPresent, MONTHS, year, tr }) {
    const labels = monthsPresent.map(m => MONTHS[m].slice(0, 3));
    const neto = aggs.map(g => g.netoSpacio), jov = aggs.map(g => g.jov);
    const cum = (arr) => { let a = 0; return arr.map(v => (a += v)); };
    const tN = neto.reduce((a, v) => a + v, 0), tJ = jov.reduce((a, v) => a + v, 0);
    const series = (n, j, sfx) => [
      { key: "jov" + sfx, name: tr("Ingreso total JOV", "JOV total income"), color: "var(--ink)", values: j, fill: 0.06, width: 2 },
      { key: "neto" + sfx, name: tr("Ingreso neto Spacio AM", "Spacio AM net income"), color: "var(--peach)", values: n, fill: 0.16, width: 2.5 },
    ];
    const kpi = (label, v, dot) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: dot }}></span>{label}
        </span>
        <span style={{ fontFamily: "var(--sans)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{fUSD(v)}</span>
        <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)" }}>{fGTQ(v)}</span>
      </div>
    );
    const card = (title, sub, n, j, showKpis) => (
      <div style={{ border: "1px solid var(--ink-08)", borderRadius: 22, background: "var(--alabaster)", boxShadow: "var(--shadow-sm)", padding: "20px 22px 16px", minWidth: 0 }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 19, color: "var(--ink)", lineHeight: 1.15 }}>{title}</div>
        <div style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: "var(--fg-muted)", margin: "4px 0 16px" }}>{sub}</div>
        {showKpis && <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 14 }}>{kpi(tr("Neto Spacio AM", "Spacio AM net"), tN, "var(--peach)")}{kpi(tr("Total JOV", "JOV total"), tJ, "var(--ink)")}</div>}
        <LineChart series={series(n, j, showKpis ? "m" : "c")} labels={labels} height={showKpis ? 200 : 268} formatY={v => "$" + Math.round(v / 1000) + "k"} formatTip={v => fUSD(v)} />
      </div>
    );
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, marginBottom: 22 }}>
        {card(tr("Mes a mes", "Month by month"), tr("Ingreso neto Spacio AM y total JOV de cada mes de " + year + ".", "Each month of " + year + "."), neto, jov, true)}
        {card(tr("Acumulado del año", "Year to date"), tr("Cómo crecen los dos a lo largo de " + year + ".", "How both grow through " + year + "."), cum(neto), cum(jov), false)}
      </div>
    );
  }

  window.ContaPLSection = ContaPLSection;
})();
