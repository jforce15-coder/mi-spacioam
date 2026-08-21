// ============================================================
// Spacio AM — Contabilidad · Resumen contable (P&L interno, solo admin)
// ------------------------------------------------------------
// Estado de resultados de Spacio AM como empresa:
//   A) Socios (informativo): Ingreso neto + Retenciones por propiedad
//   B) Ingreso bruto = Fee + Cleaning Fee + Gastos e inversión (+ Otros ingresos manuales)
//   C) Gastos operativos (globales, manuales/adjuntos) → Ingreso neto = bruto − opex
//   D) Base de costos = Gastos operativos + Cleaning Fee + Insumos y gastos
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
  // celda de monto con doble moneda (GTQ arriba, USD debajo)
  function Amt({ usd, strong, light }) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.22 }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: strong ? 700 : 500, color: light ? "var(--alabaster)" : "var(--ink)" }}>{fGTQ(usd)}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 10.5, color: light ? "rgba(250,250,250,0.62)" : "var(--fg-muted)" }}>{fUSD(usd)}</span>
      </span>
    );
  }

  function ContaPLSection({ lang, t, currency, fmt, allProps }) {
    const tr = (es, en) => (lang === "es" ? es : en);
    const money = fmt.money;
    const [view, setView] = useState("month");
    const [tick, setTick] = useState(0);
    const reload = () => setTick(x => x + 1);
    const OX = window.SpacioContaOpex;

    // meses presentes en todo el portafolio
    const ymsSet = {};
    (allProps || []).forEach(p => (p.months || []).forEach(m => { if (m.present) ymsSet[ymStr(m.y, m.m)] = { y: m.y, m: m.m }; }));
    const yms = Object.keys(ymsSet).sort().reverse();
    const years = [...new Set(yms.map(k => +k.slice(0, 4)))].sort((a, b) => b - a);
    const [ym, setYm] = useState(yms[0] || ymStr(new Date().getFullYear(), new Date().getMonth()));
    const [year, setYear] = useState(years[0] || new Date().getFullYear());

    function lineFor(p, y, m) {
      const mo = (p.months || []).find(x => x.y === y && x.m === m && x.present);
      if (!mo) return null;
      // Gastos e inversión: los MISMOS datos de la pestaña Gastos e inversiones
      // (line items por propiedad), no el consolidado (que viene en 0).
      let expInv = 0, expInsumos = 0, hasExp = false;
      (p.expenses || []).forEach(e => {
        if (e.y !== y || e.m !== m) return;
        if (e.catKey === "otros" || /otro ingreso/i.test(e.category || "")) return; // es ingreso, no gasto
        hasExp = true;
        expInv += (e.amount || 0);
        if (e.catKey === "insumos" || /insumo/i.test(e.category || "")) expInsumos += (e.amount || 0);
      });
      const gastosInv = hasExp ? expInv : ((mo.insumos || 0) + (mo.reparaciones || 0));
      const insumos = hasExp ? expInsumos : (mo.insumos || 0);
      return {
        name: p.name, code: p.code || "",
        neto: mo.ingresoNeto || 0, ret: mo.retencion || 0,
        fee: mo.fee || 0, cleaning: mo.cleaningFee || 0,
        gastosInv: gastosInv, insumos: insumos,
      };
    }
    function aggFor(y, m) {
      const rows = (allProps || []).map(p => lineFor(p, y, m)).filter(r => r && (r.neto || r.ret || r.fee || r.cleaning || r.gastosInv));
      const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
      const key = ymStr(y, m);
      const opexList = OX.forMonth(key, "opex"), otroList = OX.forMonth(key, "otro");
      const opex = OX.totalUsd(opexList), otros = OX.totalUsd(otroList);
      const bruto = sum("fee") + sum("cleaning") + sum("gastosInv") + otros;
      const socio002Neto = rows.filter(r => r.code === "Socio_002").reduce((a, r) => a + r.neto, 0);
      return {
        rows, sum, opexList, otroList, opex, otros,
        neto: sum("neto"), ret: sum("ret"), pagarSocios: sum("neto") - sum("ret"),
        fee: sum("fee"), cleaning: sum("cleaning"), gastosInv: sum("gastosInv"), insumos: sum("insumos"),
        bruto, netoSpacio: bruto - opex, baseCostos: opex + sum("cleaning") + sum("insumos"),
        socio002Neto, jov: sum("fee") + socio002Neto - opex,
      };
    }

    const [yy, mm] = ym.split("-").map(Number);
    const A = aggFor(yy, mm - 1);

    return (
      <div style={{ marginTop: 6 }}>
        {/* controles */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <Segmented size="sm" value={view} onChange={setView}
            options={[{ value: "month", label: tr("Por mes", "Monthly") }, { value: "year", label: tr("Por año", "Yearly") }]} />
          {view === "month"
            ? <Select value={ym} options={yms.map(k => ({ value: k, label: monthLabel(lang, +k.slice(0, 4), +k.slice(5) - 1) }))} onChange={setYm} icon="calendar" minWidth={170} />
            : <Select value={String(year)} options={years.map(y => ({ value: String(y), label: String(y) }))} onChange={(v) => setYear(+v)} icon="calendar" minWidth={130} />}
          <span style={{ marginLeft: "auto", fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-muted)" }}>
            {tr("Moneda", "Currency")}: {currency}
          </span>
        </div>

        {view === "month"
          ? <PLMonth A={A} ym={ym} lang={lang} tr={tr} money={money} currency={currency} reload={reload} tick={tick} />
          : <PLYear year={year} aggFor={aggFor} ymsSet={ymsSet} lang={lang} tr={tr} money={money} />}
      </div>
    );
  }

  // ---- bloque colapsable con desglose por propiedad ----
  function PLBlock({ title, total, money, tr, cols, rows, footer, accent, defaultOpen }) {
    const [open, setOpen] = useState(!!defaultOpen);
    return (
      <div style={{ border: "1px solid var(--ink-08)", borderRadius: 18, overflow: "hidden", marginBottom: 16, background: "var(--alabaster)" }}>
        <button onClick={() => setOpen(o => !o)} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
          border: "none", cursor: "pointer", background: accent ? "var(--beige-soft)" : "transparent", padding: "16px 20px", textAlign: "left",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
            <Icon name="chevronDown" size={15} stroke="var(--fg-muted)" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .18s var(--ease)" }} />
            <span style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink)" }}>{title}</span>
          </span>
          <span style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}><Amt usd={total} strong /></span>
        </button>
        {open && (
          <div style={{ borderTop: "1px solid var(--ink-08)", overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse", fontFamily: "var(--sans)" }}>
              <thead>
                <tr>
                  <th style={thStyle(true)}>{tr("Propiedad", "Property")}</th>
                  {cols.map((c, i) => <th key={i} style={thStyle(false)}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={tdStyle(true)}>{r.label}</td>
                    {r.vals.map((v, j) => <td key={j} style={tdStyle(false)}><Amt usd={v} /></td>)}
                  </tr>
                ))}
                {footer && (
                  <tr>
                    <td style={Object.assign({}, tdStyle(true), { fontWeight: 700, borderTop: "1.5px solid var(--ink)" })}>{footer.label}</td>
                    {footer.vals.map((v, j) => <td key={j} style={Object.assign({}, tdStyle(false), { borderTop: "1.5px solid var(--ink)" })}><Amt usd={v} strong /></td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
  const thStyle = (first) => ({
    textAlign: first ? "left" : "right", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 9.5, fontWeight: 600,
    color: "var(--fg-muted)", padding: "11px 16px", borderBottom: "1px solid var(--warm-grey)", whiteSpace: "nowrap", background: "var(--alabaster)",
  });
  const tdStyle = (first) => ({
    textAlign: first ? "left" : "right", padding: "10px 16px", borderTop: "1px solid var(--ink-08)",
    fontSize: 13, color: first ? "var(--ink)" : "var(--ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
  });

  // ---- resultado destacado (ingreso bruto / neto) ----
  function PLResult({ label, value, money, accent }) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "18px 22px", marginBottom: 16,
        borderRadius: 18, background: accent ? "var(--ink)" : "var(--beige-soft)",
      }}>
        <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: accent ? "rgba(250,250,250,0.7)" : "var(--fg-muted)" }}>{label}</span>
        <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
          <span style={{ fontFamily: "var(--sans)", fontSize: 23, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: accent ? "var(--alabaster)" : "var(--ink)" }}>{fGTQ(value)}</span>
          <span style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: accent ? "rgba(250,250,250,0.62)" : "var(--fg-muted)" }}>{fUSD(value)}</span>
        </span>
      </div>
    );
  }

  // ---- vista mensual ----
  function PLMonth({ A, ym, lang, tr, money, currency, reload, tick }) {
    const FOCUS = "Socio_002";
    const sociosBlock = (title, rs, defaultOpen) => {
      const sNeto = rs.reduce((a, r) => a + r.neto, 0), sRet = rs.reduce((a, r) => a + r.ret, 0);
      return (
        <PLBlock title={title} total={sNeto - sRet} money={money} tr={tr} defaultOpen={defaultOpen}
          cols={[tr("Ingreso neto", "Net income"), tr("Retención", "Withholding"), tr("A pagar", "Payable")]}
          rows={rs.map(r => ({ label: r.name, vals: [r.neto, r.ret, r.neto - r.ret] }))}
          footer={{ label: tr("Total a pagar a socios", "Total payable to owners"), vals: [sNeto, sRet, sNeto - sRet] }} />
      );
    };
    const focusRows = A.rows.filter(r => r.code === FOCUS);
    const restRows = A.rows.filter(r => r.code !== FOCUS);
    const focusNeto = focusRows.reduce((a, r) => a + r.neto, 0);
    const jovTotal = A.fee + focusNeto - A.opex;
    return (
      <React.Fragment>
        <Eyebrow style={{ marginBottom: 10 }}>{tr("Socios", "Owners")}</Eyebrow>
        {sociosBlock(tr("Ingreso neto socios y retenciones", "Owner net income & withholdings"), restRows)}
        {focusRows.length > 0 && (
          <React.Fragment>
            <Eyebrow style={{ margin: "18px 0 10px" }}>{FOCUS}</Eyebrow>
            {sociosBlock(tr("Ingreso neto y retenciones — " + FOCUS, "Net income & withholdings — " + FOCUS), focusRows)}
          </React.Fragment>
        )}

        <Eyebrow style={{ margin: "22px 0 10px" }}>{tr("Ingreso bruto Spacio AM", "Spacio AM gross income")}</Eyebrow>
        <PLBlock title={tr("Fee de Spacio AM", "Spacio AM fee")} total={A.fee} money={money} tr={tr}
          cols={[tr("Monto", "Amount")]}
          rows={A.rows.filter(r => r.fee).map(r => ({ label: r.name, vals: [r.fee] }))}
          footer={{ label: tr("Total fee", "Total fee"), vals: [A.fee] }} />
        <PLBlock title={tr("Cleaning Fee", "Cleaning fee")} total={A.cleaning} money={money} tr={tr}
          cols={[tr("Monto", "Amount")]}
          rows={A.rows.filter(r => r.cleaning).map(r => ({ label: r.name, vals: [r.cleaning] }))}
          footer={{ label: tr("Total cleaning", "Total cleaning"), vals: [A.cleaning] }} />
        <PLBlock title={tr("Gastos e inversión (por propiedad)", "Expenses & investment (per property)")} total={A.gastosInv} money={money} tr={tr}
          cols={[tr("Monto", "Amount")]}
          rows={A.rows.filter(r => r.gastosInv).map(r => ({ label: r.name, vals: [r.gastosInv] }))}
          footer={{ label: tr("Total gastos e inversión", "Total expenses & investment"), vals: [A.gastosInv] }} />
        <OpexForm kind="otro" ym={ym} lang={lang} tr={tr} money={money} list={A.otroList} reload={reload}
          title={tr("Otros ingresos (manual)", "Other income (manual)")} totalUsd={A.otros} />
        <PLResult label={tr("Ingreso bruto", "Gross income")} value={A.bruto} money={money} />

        <Eyebrow style={{ margin: "22px 0 10px" }}>{tr("Gastos operativos", "Operating expenses")}</Eyebrow>
        <OpexForm kind="opex" ym={ym} lang={lang} tr={tr} money={money} list={A.opexList} reload={reload}
          title={tr("Gastos operativos (globales)", "Operating expenses (global)")} totalUsd={A.opex} />
        <PLResult label={tr("Ingreso neto (Spacio AM)", "Net income (Spacio AM)")} value={A.netoSpacio} money={money} accent />

        <Eyebrow style={{ margin: "22px 0 10px" }}>{tr("Base de costos", "Cost base")}</Eyebrow>
        <PLBlock title={tr("Gastos operativos + Cleaning + Insumos y gastos", "Operating + Cleaning + Supplies")} total={A.baseCostos} money={money} tr={tr}
          cols={[tr("Monto", "Amount")]}
          rows={[
            { label: tr("Gastos operativos", "Operating expenses"), vals: [A.opex] },
            { label: tr("Cleaning fee", "Cleaning fee"), vals: [A.cleaning] },
            { label: tr("Insumos y gastos", "Supplies & expenses"), vals: [A.insumos] },
          ]}
          footer={{ label: tr("Base de costos total", "Total cost base"), vals: [A.baseCostos] }} defaultOpen />

        <Eyebrow style={{ margin: "26px 0 10px" }}>{tr("Ingreso total JOV", "JOV total income")}</Eyebrow>
        <JOVBlock fee={A.fee} socioNeto={focusNeto} socioLabel={FOCUS} opex={A.opex} total={jovTotal} tr={tr} />
      </React.Fragment>
    );
  }

  // ---- bloque resumen Ingreso total JOV ----
  function JOVBlock({ fee, socioNeto, socioLabel, opex, total, tr }) {
    const line = (sign, label, usd, neg) => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "13px 22px", borderTop: "1px solid var(--ink-08)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 18, textAlign: "center", fontFamily: "var(--sans)", fontSize: 16, fontWeight: 500, color: neg ? "var(--peach)" : "var(--fg-muted)" }}>{sign}</span>
          <span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)", letterSpacing: "0.02em" }}>{label}</span>
        </span>
        <Amt usd={usd} />
      </div>
    );
    return (
      <div style={{ border: "1px solid var(--ink-08)", borderRadius: 18, overflow: "hidden", marginBottom: 16, background: "var(--alabaster)" }}>
        {line("+", tr("Fee Spacio AM", "Spacio AM fee"), fee)}
        {line("+", tr("Ingreso neto del socio ", "Net income of owner ") + socioLabel, socioNeto)}
        {line("−", tr("Gastos operativos", "Operating expenses"), opex, true)}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "18px 22px", background: "var(--ink)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 18, textAlign: "center", fontFamily: "var(--sans)", fontSize: 16, fontWeight: 500, color: "rgba(250,250,250,0.7)" }}>=</span>
            <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(250,250,250,0.7)" }}>{tr("Ingreso total JOV", "JOV total income")}</span>
          </span>
          <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 23, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: "var(--alabaster)" }}>{fGTQ(total)}</span>
            <span style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "rgba(250,250,250,0.62)" }}>{fUSD(total)}</span>
          </span>
        </div>
      </div>
    );
  }

  // ---- formulario + lista de gastos operativos / otros ingresos ----
  function OpexForm({ kind, ym, lang, tr, money, list, reload, title, totalUsd }) {
    const [concepto, setConcepto] = useState("");
    const [monto, setMonto] = useState("");
    const [cur, setCur] = useState("GTQ");
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const inputRef = React.useRef(null);
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
      <div style={{ border: "1px dashed var(--warm-grey)", borderRadius: 18, padding: "16px 18px", marginBottom: 16, background: "var(--alabaster)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{title}</span>
          <span style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: kind === "opex" ? "var(--peach)" : "var(--ink)", display: "inline-flex", alignItems: "baseline", gap: 7 }}>
            <span>{(kind === "opex" ? "− " : "+ ") + fGTQ(totalUsd)}</span>
            <span style={{ fontSize: 11, color: "var(--fg-muted)", fontWeight: 500 }}>{fUSD(totalUsd)}</span>
          </span>
        </div>
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
    const lines = [
      { label: tr("Ingreso neto socios", "Owner net income"), key: "neto" },
      { label: tr("Retenciones socios", "Owner withholdings"), key: "ret" },
      { label: tr("A pagar a socios", "Payable to owners"), key: "pagarSocios", strong: true },
      { label: tr("Fee Spacio AM", "Spacio AM fee"), key: "fee", gap: true },
      { label: tr("Cleaning fee", "Cleaning fee"), key: "cleaning" },
      { label: tr("Gastos e inversión", "Expenses/investment"), key: "gastosInv" },
      { label: tr("Otros ingresos", "Other income"), key: "otros" },
      { label: tr("Ingreso bruto", "Gross income"), key: "bruto", strong: true },
      { label: tr("Gastos operativos", "Operating expenses"), key: "opex", gap: true },
      { label: tr("Ingreso neto (Spacio AM)", "Net income (Spacio AM)"), key: "netoSpacio", strong: true },
      { label: tr("Base de costos", "Cost base"), key: "baseCostos", gap: true },
      { label: tr("Fee Spacio AM", "Spacio AM fee"), key: "fee", gap: true },
      { label: tr("Ingreso neto socio Socio_002", "Net income owner Socio_002"), key: "socio002Neto" },
      { label: tr("Gastos operativos", "Operating expenses"), key: "opex" },
      { label: tr("Ingreso total JOV", "JOV total income"), key: "jov", strong: true },
    ];
    const rowTotal = (key) => aggs.reduce((a, g) => a + g[key], 0);
    return (
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
              {lines.map((ln, i) => (
                <tr key={i}>
                  <td style={Object.assign({}, tdStyle(true), { position: "sticky", left: 0, background: "var(--alabaster)", zIndex: 1, fontWeight: ln.strong ? 700 : 400, borderTop: ln.gap ? "1.5px solid var(--ink)" : (ln.strong ? "1.5px solid var(--ink)" : "1px solid var(--ink-08)") })}>{ln.label}</td>
                  {aggs.map((g, j) => <td key={j} style={Object.assign({}, tdStyle(false), { fontWeight: ln.strong ? 700 : 400, borderTop: (ln.gap || ln.strong) ? "1.5px solid var(--ink)" : "1px solid var(--ink-08)" })}>{money(g[ln.key])}</td>)}
                  <td style={Object.assign({}, tdStyle(false), { fontWeight: 700, background: "var(--beige-soft)", borderTop: (ln.gap || ln.strong) ? "1.5px solid var(--ink)" : "1px solid var(--ink-08)" })}>{money(rowTotal(ln.key))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  window.ContaPLSection = ContaPLSection;
})();
