// ============================================================
// Spacio AM — Owner Dashboard · Distribution / Evolution / Expenses / Operations / Opportunity
// ============================================================

// ---- Distribution (donut) ----
const DistributionSection = ({ pdata, fmt, t, lang }) => {
  const { money, pct } = fmt;
  const c = pdata.cur;
  const gross = c.ingresoBruto || 1;
  // real identity: bruto = neto + fee + iva + host + insumos + reparaciones
  const raw = [
    { key: "net", label: t("dist_net"), value: c.ingresoNeto, color: "var(--ink)" },
    { key: "fee", label: t("dist_fee"), value: c.fee, color: "var(--peach)" },
    { key: "exp", label: t("dist_exp"), value: c.insumos, color: "var(--earth)" },
    { key: "rep", label: t("dist_rep"), value: c.reparaciones, color: "#C4B7AE" },
    { key: "iva", label: t("dist_iva"), value: c.ivaTotal, color: "var(--warm-grey)" },
    { key: "host", label: t("dist_host"), value: c.hostFee, color: "#B8AEA6" },
  ].filter(s => s.value > 0.5);
  const denom = raw.reduce((a, s) => a + s.value, 0) || 1;
  const segs = raw.map(s => ({ ...s, pretty: pct(s.value / denom) }));
  return (
    <section id="sec-distribution" className="sa-section">
      <SectionHead eyebrow={t("sec_distribution")} title={t("dist_title")} sub={t("dist_sub")} />
      <Card pad={28}>
        <div className="sa-dist-grid">
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Donut segments={segs} size={232} thickness={30} centerLabel={money(gross)} centerSub={t("kpi_gross")} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {segs.map((s, i) => (
              <div key={s.key} className="sa-dist-row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, letterSpacing: "0.03em", color: "var(--ink)" }}>{s.label}</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.08em", color: "var(--earth)" }}>{s.pretty} {t("of_total")}</span>
                  <span style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, color: "var(--ink)", minWidth: 86, textAlign: "right" }}>{money(s.value)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
};

// ---- Evolution: year-over-year line chart (Ene–Dic) + delta table ----
const EvolutionSection = ({ pdata, fmt, t, lang }) => {
  const { money, pct, num } = fmt;
  const months = pdata.hist.months;
  const [metricKey, setMetricKey] = useState("ingresoNeto");
  const [cmp, setCmp] = useState("year");
  const metricDefs = {
    ingresoNeto: { label: t("m_net"), fmt: money, short: fmt.moneyShort },
    ingresoBruto: { label: t("m_gross"), fmt: money, short: fmt.moneyShort },
    ocupacionAjustada: { label: t("m_occ"), fmt: pct, short: (v) => Math.round(v * 100) + "%" },
    adr: { label: t("kpi_adr"), fmt: money, short: fmt.moneyShort },
    estadias: { label: t("kpi_stays"), fmt: num, short: (v) => Math.round(v) },
    nochesReservadas: { label: t("kpi_nights"), fmt: num, short: (v) => Math.round(v) },
  };
  const md = metricDefs[metricKey];
  const evo = SpacioAgg.evoSeries(months, metricKey, cmp);
  const labels = evo.labels.map(l => l[lang]);
  const cmpName = cmp === "year" ? t("evo_vs_year") : t("evo_vs_month");
  const series = [
    { key: "primary", name: md.label, color: "var(--peach)", values: evo.primary, width: 2.6, fill: 0.14, dots: true },
    { key: "compare", name: cmpName, color: "var(--earth)", values: evo.compare, width: 1.8, dash: "5 5", area: false, opacity: 0.9, dots: true },
  ];
  // delta table (recent present months)
  const presentAll = months.filter(m => m.present);
  const rows = presentAll.slice(-6);
  const metric = (m, prev, key, format) => ({ v: format(m[key]), d: prev ? ((m[key] - prev[key]) / Math.abs(prev[key] || 1)) * 100 : null });

  const metricOpts = [
    { value: "ingresoNeto", label: t("m_net") }, { value: "ingresoBruto", label: t("m_gross") },
    { value: "ocupacionAjustada", label: t("m_occ") }, { value: "adr", label: t("kpi_adr") },
    { value: "estadias", label: t("kpi_stays") }, { value: "nochesReservadas", label: t("kpi_nights") },
  ];
  return (
    <section id="sec-evolution" className="sa-section">
      <SectionHead eyebrow={t("sec_evolution")} title={t("evo_title")} sub={t("evo_sub")}
        right={<div style={{ minWidth: 200 }}><Select value={metricKey} onChange={setMetricKey} options={metricOpts} icon="trendUp" align="right" minWidth={200} /></div>} />
      <Card pad={24} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{md.label} · {lang === "es" ? "por mes" : "by month"}</span>
          <Segmented size="sm" value={cmp} onChange={setCmp}
            options={[{ value: "year", label: t("evo_vs_year") }, { value: "month", label: t("evo_vs_month") }]} />
        </div>
        <LineChart series={series} labels={labels} height={250} formatY={md.short} formatTip={md.fmt} />
        <Legend items={[{ name: md.label, color: "var(--peach)" }, { name: cmpName, color: "var(--earth)", dash: true }]} />
        {cmp === "year" && !evo.overlap && (
          <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.04em", lineHeight: 1.6, color: "var(--earth)", margin: "14px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="info" size={14} stroke="var(--earth)" /> {t("evo_yoy_note")}
          </p>
        )}
      </Card>
      <Card pad={0}>
        <div className="sa-evo-head sa-evo-row">
          <span>{lang === "es" ? "Mes" : "Month"}</span>
          <span>{t("kpi_net")}</span><span>{t("kpi_occ")}</span><span>{t("kpi_adr")}</span><span>{t("kpi_stays")}</span>
        </div>
        {rows.map((m, i) => {
          const gi = presentAll.indexOf(m);
          const prev = presentAll[gi - 1];
          const net = metric(m, prev, "ingresoNeto", money);
          const occ = metric(m, prev, "ocupacionAjustada", pct);
          const adr = metric(m, prev, "adr", money);
          const stays = metric(m, prev, "estadias", num);
          const cell = (x) => (
            <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>{x.v}</span>
              {x.d != null && <Trend value={x.d} muted={Math.abs(x.d) < 0.5} />}
            </span>
          );
          return (
            <div key={i} className="sa-evo-row" style={{ borderTop: "1px solid var(--ink-08)" }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--ink)" }}>{m.label[lang]} <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--earth)", letterSpacing: "0.06em" }}>'{String(m.y).slice(2)}</span></span>
              {cell(net)}{cell(occ)}{cell(adr)}{cell(stays)}
            </div>
          );
        })}
      </Card>
    </section>
  );
};

// ---- Expenses (grouped table → mobile cards) ----
const ExpensesSection = ({ activeProps, pdata, fmt, t, lang }) => {
  const { money } = fmt;
  const [open, setOpen] = useState(false);
  const sliceMonths = pdata.slice.length ? pdata.slice : pdata.hist.months.slice(-3);
  const rows = SpacioAgg.collectRows(activeProps, sliceMonths, "expenses");
  // headline total comes from Resumenconsolidado (insumos + reparaciones), per brief
  const total = pdata.cur.insumos + pdata.cur.reparaciones;
  // group line items by their real category string
  const groups = {};
  rows.forEach(r => { const k = r.category || "Otros"; (groups[k] = groups[k] || []).push(r); });
  const groupKeys = Object.keys(groups).sort((a, b) => groups[b].reduce((s, r) => s + r.amount, 0) - groups[a].reduce((s, r) => s + r.amount, 0));
  const iconFor = (k) => /repar|manten/i.test(k) ? "wrench" : /invers|mejora|mueble/i.test(k) ? "sofa" : "coins";
  const monthName = (r) => SpacioI18n.monthLong(lang, r.m);
  return (
    <section id="sec-expenses" className="sa-section">
      <SectionHead eyebrow={t("sec_expenses")} title={t("exp_title")} sub={t("exp_sub")}
        right={<div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{t("exp_total")} · {lang === "es" ? "consolidado" : "consolidated"}</div>
          <div style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 26, color: "var(--ink)", marginTop: 4 }}>{money(total)}</div>
        </div>} />
      {rows.length > 0 && (
        <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.04em", lineHeight: 1.6, color: "var(--earth)", margin: "-8px 0 18px", maxWidth: 560 }}>
          {lang === "es"
            ? "El total consolidado proviene del resumen oficial. Abajo, el detalle de cada movimiento registrado en el período."
            : "The consolidated total comes from the official summary. Below, every movement recorded in the period."}
        </p>
      )}
      <Card pad={0}>
        {groupKeys.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center", fontFamily: "var(--sans)", fontSize: 13, letterSpacing: "0.04em", color: "var(--earth)" }}>
            {lang === "es" ? "No hay gastos registrados en este período." : "No expenses recorded for this period."}
          </div>
        )}
        {groupKeys.map((k, gi) => {
          const items = groups[k].sort((a, b) => (b.y - a.y) || (b.m - a.m) || (b.day - a.day));
          const shown = open ? items : items.slice(0, 3);
          const sub = items.reduce((a, r) => a + r.amount, 0);
          return (
            <div key={k} style={{ borderTop: gi ? "1px solid var(--warm-grey)" : "none" }}>
              <div className="sa-exp-grouphead">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
                  <span className="sa-exp-ic"><Icon name={iconFor(k)} size={16} stroke="var(--ink)" /></span>
                  <span style={{ fontFamily: "var(--sans)", fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink)" }}>{k}</span>
                </span>
                <span style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{money(sub)}</span>
              </div>
              {shown.map((r, i) => (
                <div key={i} className="sa-exp-row">
                  <span className="sa-exp-date">{r.day} {monthName(r).slice(0, 3)}</span>
                  <span className="sa-exp-desc">{r.desc}{activeProps.length > 1 && <em style={{ fontStyle: "normal", color: "var(--earth)", fontSize: 11, marginLeft: 8 }}>· {r._prop}</em>}</span>
                  <span className="sa-exp-amt">{money(r.amount)}</span>
                </div>
              ))}
            </div>
          );
        })}
        {rows.length > 9 && (
          <button onClick={() => setOpen(o => !o)} className="sa-viewall">
            {open ? t("view_less") : t("view_all")} <Icon name={open ? "chevronLeft" : "chevronRight"} size={14} style={{ transform: "rotate(90deg)" }} />
          </button>
        )}
      </Card>
    </section>
  );
};

// ---- Reporte Financiero (estado de resultados, per property + month) ----
const StatementRow = ({ label, nights, usd, gtq, n2, rate, kind }) => (
  <div className={"sa-rf-row" + (kind ? " sa-rf-" + kind : "")}>
    <span className="sa-rf-lbl">{label}</span>
    <span className="sa-rf-n">{nights != null ? nights : ""}</span>
    <span className="sa-rf-v">{usd != null ? n2(usd) : ""}</span>
    <span className="sa-rf-v">{usd != null ? n2(usd * rate) : ""}</span>
  </div>
);

const ReporteFinanciero = ({ property, monthObj, reservations, t, lang }) => {
  const rate = SpacioI18n.GTQ_RATE;
  const [showPT, setShowPT] = useState(false);
  const n2 = (v) => (v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mAb = (mi) => (lang === "es" ? SpacioI18n.MONTHS_ES : SpacioI18n.MONTHS_EN)[mi];
  const dateLabel = (r) => r.fechas || (r.nights + " " + t("nights_unit"));
  const ymLabel = monthObj ? `${monthObj.y}-${String(monthObj.m + 1).padStart(2, "0")}` : "";
  const sum = (k) => reservations.reduce((a, r) => a + (r[k] || 0), 0);
  const totalNights = sum("nights");

  if (!reservations.length) {
    return (
      <Card pad={28} style={{ marginBottom: 18 }}>
        <ReporteHead property={property} ymLabel={ymLabel} lang={lang} />
        <p style={{ fontFamily: "var(--sans)", fontSize: 13, letterSpacing: "0.04em", color: "var(--earth)", textAlign: "center", padding: "30px 0 8px" }}>{t("report_empty")}</p>
      </Card>
    );
  }

  const M = monthObj || {};
  const perStay = (title, key, opts) => {
    opts = opts || {};
    return (
      <div className="sa-rf-block">
        {reservations.map((r, i) => <StatementRow key={i} label={dateLabel(r)} nights={opts.nights ? r.nights : null} usd={r[key]} n2={n2} rate={rate} />)}
        <StatementRow label={title} nights={opts.nights ? totalNights : null} usd={sum(key)} n2={n2} rate={rate} kind={opts.bold ? "strong" : "total"} />
      </div>
    );
  };
  const ptCleaning = sum("cleaningFee"), ptIva = M.ivaTotal || sum("iva");

  return (
    <Card pad={0} style={{ marginBottom: 18, overflow: "hidden" }}>
      <div style={{ padding: "26px 26px 4px" }}><ReporteHead property={property} ymLabel={ymLabel} lang={lang} /></div>
      <div className="sa-rf-grid-wrap">
        {/* statement */}
        <div className="sa-rf-table">
          <div className="sa-rf-row sa-rf-colhead">
            <span className="sa-rf-lbl">{t("col_dates")}</span><span className="sa-rf-n">{t("col_nights")}</span>
            <span className="sa-rf-v">USD</span><span className="sa-rf-v">GTQ</span>
          </div>
          {perStay(t("row_ingresos"), "ingresos", { nights: true })}
          {perStay(t("row_fee_plat"), "feePlataforma")}
          {perStay(t("row_ingreso_bruto"), "ingresoBruto", { bold: true })}
          {/* consolidated deductions (from Resumenconsolidado) */}
          <div className="sa-rf-block">
            <StatementRow label={t("row_fee_spacio")} usd={M.fee} n2={n2} rate={rate} kind="line" />
            <StatementRow label={t("row_insumos")} usd={M.insumos} n2={n2} rate={rate} kind="line" />
            <StatementRow label={t("row_reparaciones")} usd={M.reparaciones} n2={n2} rate={rate} kind="line" />
            {property.flagOtroIngreso && <StatementRow label={t("row_otros")} usd={M.otrosIngresos2} n2={n2} rate={rate} kind="line" />}
            {property.flagIva && <StatementRow label={t("row_iva_socio")} usd={M.ivaSocios} n2={n2} rate={rate} kind="line" />}
            <StatementRow label={t("row_ingreso_neto")} usd={M.ingresoNeto} n2={n2} rate={rate} kind="strong" />
            {property.flagRetencion && <StatementRow label={t("row_retencion")} usd={M.retencion} n2={n2} rate={rate} kind="line" />}
            {property.flagRetencion && <StatementRow label={t("row_deposito")} usd={M.deposito} n2={n2} rate={rate} kind="total" />}
          </div>

          {/* separation + notification + collapsible pass-through */}
          <div className="sa-rf-passthrough">
            <div className="sa-rf-notif">
              <Icon name="info" size={16} stroke="var(--peach)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p>{t("passthrough_note")}</p>
            </div>
            <button className="sa-rf-pt-toggle" onClick={() => setShowPT(s => !s)}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--earth)" }}>{t("passthrough_title")}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.1em", color: "var(--ink)" }}>
                {showPT ? t("hide_detail") : t("show_detail")}
                <Icon name="chevronDown" size={14} stroke="var(--earth)" style={{ transform: showPT ? "rotate(180deg)" : "none", transition: "transform .18s var(--ease)" }} />
              </span>
            </button>
            {showPT ? (
              <React.Fragment>
                {perStay(t("row_cleaning"), "cleaningFee")}
                {perStay(t("row_iva"), "iva")}
              </React.Fragment>
            ) : (
              <div className="sa-rf-block">
                <StatementRow label={t("row_cleaning")} usd={ptCleaning} n2={n2} rate={rate} kind="total" />
                <StatementRow label={t("row_iva")} usd={ptIva} n2={n2} rate={rate} kind="total" />
              </div>
            )}
          </div>
        </div>
        {/* side cards */}
        <div className="sa-rf-side">
          <div className="sa-rf-sidecard">
            <div className="sa-rf-side-lbl">{t("occ_label")}</div>
            <div className="sa-rf-side-val">{monthObj ? Math.round(monthObj.ocupacionAjustada * 100) + "%" : "—"}</div>
          </div>
          <div className="sa-rf-sidecard">
            <div className="sa-rf-side-lbl">{t("opp_cost_label")}</div>
            <div className="sa-rf-side-val">{n2(monthObj ? monthObj.costoOportunidad : 0)}</div>
            <div className="sa-rf-side-sub">USD</div>
          </div>
          <div className="sa-rf-sidecard sa-rf-sidecard-soft">
            <div className="sa-rf-side-lbl">{t("kpi_stays")}</div>
            <div className="sa-rf-side-val">{reservations.length}</div>
            <div className="sa-rf-side-sub">{totalNights} {t("nights_unit")}</div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const ReporteHead = ({ property, ymLabel, lang }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18, paddingBottom: 18, borderBottom: "1px solid var(--warm-grey)", marginBottom: 4 }}>
    <img src="logo-stamp.png" alt="Spacio AM" style={{ width: 56, height: 56, flexShrink: 0 }} />
    <div>
      <h3 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "clamp(22px,2.6vw,30px)", letterSpacing: "-0.01em", color: "var(--ink)", margin: 0, lineHeight: 1.05 }}>{lang === "es" ? "Detalle del mes" : "Monthly detail"}</h3>
      <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, letterSpacing: "0.04em", color: "var(--earth)", marginTop: 6 }}>{property.name}</div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.16em", color: "var(--earth)", marginTop: 2 }}>{ymLabel}</div>
    </div>
  </div>
);

// ---- Account / profile (change email, secondary email, password — saved locally) ----
const AccountField = ({ label, hint, value, onChange, type, placeholder }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <span style={{ fontFamily: "var(--sans)", fontSize: 10, fontWeight: 500, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--earth)" }}>{label}</span>
    <input value={value} onChange={e => onChange(e.target.value)} type={type || "text"} placeholder={placeholder || ""}
      autoCapitalize="none" autoCorrect="off"
      style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--sans)", fontSize: 14.5, letterSpacing: "0.02em", color: "var(--ink)",
        padding: "14px 15px", background: "var(--alabaster)", border: "1px solid var(--warm-grey)", borderRadius: 13, outline: "none", transition: "border-color .18s var(--ease)" }}
      onFocus={e => e.target.style.borderColor = "var(--ink)"} onBlur={e => e.target.style.borderColor = "var(--warm-grey)"} />
    {hint && <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.03em", color: "var(--earth)", lineHeight: 1.5 }}>{hint}</span>}
  </label>
);

const AccountSection = ({ owner, lang, t, onUpdate }) => {
  const orig = (SpacioData.owners || []).find(o => o.code === owner.code) || owner;
  const [email, setEmail] = useState(owner.email || "");
  const [secondary, setSecondary] = useState(owner.secondaryEmail || "");
  const [pass, setPass] = useState("");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const props = SpacioData.ownerProps(owner);

  const save = () => {
    if (!email || !/.+@.+\..+/.test(email)) { setErr(t("acc_invalid_email")); return; }
    setErr("");
    const patch = { email: email.trim(), secondaryEmail: secondary.trim() };
    if (pass) patch.pass = pass;
    SpacioProfile.set(owner.code, patch);
    setSaved(true); setTimeout(() => setSaved(false), 2600);
    onUpdate && onUpdate(Object.assign({}, owner, { email: patch.email, secondaryEmail: patch.secondaryEmail }, pass ? { pass } : {}));
    // write-back to the sheet if the Apps Script is connected
    if (SpacioWrite.enabled()) {
      SpacioWrite.post("saveProfile", { codes: owner.codes || [owner.code], email: patch.email, secondary: patch.secondaryEmail, password: pass || "" })
        .then(r => { if (!r.ok && !r.offline) console.warn("saveProfile", r); });
    }
    setPass("");
  };
  const reset = () => {
    SpacioProfile.reset(owner.code);
    setEmail(orig.email || ""); setSecondary(orig.secondaryEmail || ""); setPass(""); setErr(""); setSaved(false);
    onUpdate && onUpdate(Object.assign({}, owner, { email: orig.email, secondaryEmail: orig.secondaryEmail, pass: orig.pass }));
  };

  return (
    <section className="sa-section" style={{ marginTop: 28 }}>
      <SectionHead eyebrow={t("account")} title={t("acc_title")} sub={t("acc_sub")} />
      <div className="sa-acc-grid">
        <Card pad={28}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <AccountField label={t("acc_email")} hint={t("acc_email_hint")} value={email} onChange={setEmail} type="email" placeholder="tu@correo.com" />
            <AccountField label={t("acc_secondary")} hint={t("acc_secondary_hint")} value={secondary} onChange={setSecondary} type="email" placeholder="alterno@correo.com" />
            <AccountField label={t("acc_pass")} hint={t("acc_pass_hint")} value={pass} onChange={setPass} type="password" placeholder="••••••••" />
            {err && <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--sans)", fontSize: 12, color: "var(--peach)" }}><Icon name="info" size={15} /> {err}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
              <button onClick={save} style={{ border: "none", cursor: "pointer", background: "var(--ink)", color: "var(--alabaster)", borderRadius: 13, padding: "14px 24px",
                fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 9 }}>
                {saved ? <React.Fragment><Icon name="check" size={15} stroke="var(--alabaster)" /> {t("acc_saved")}</React.Fragment> : t("acc_save")}
              </button>
              <button onClick={reset} style={{ border: "1px solid var(--ink-08)", cursor: "pointer", background: "transparent", color: "var(--earth)", borderRadius: 13, padding: "14px 20px",
                fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase" }}>{t("acc_reset")}</button>
            </div>
            <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", lineHeight: 1.6, color: "var(--earth)", margin: 0, textWrap: "pretty", display: "flex", gap: 8 }}>
              <Icon name="info" size={14} stroke="var(--earth)" style={{ flexShrink: 0, marginTop: 2 }} /> {t("acc_note")}
            </p>
          </div>
        </Card>
        <Card pad={24} soft>
          <div style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)", marginBottom: 16 }}>{t("acc_props")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {props.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 10, borderBottom: "1px solid var(--ink-08)" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--ink)", lineHeight: 1.1 }}>{p.name}</span>
                  <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--earth)" }}>{p.location}</span>
                </span>
                {p.listing && <a href={p.listing} target="_blank" rel="noreferrer" aria-label={t("view_listing")} style={{ flexShrink: 0, color: "var(--earth)", display: "flex" }}><Icon name="arrowUpRight" size={17} /></a>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
};

// ---- Admin: SETUP editor (edit rows, add property — saved locally; export to paste back) ----
const SETUP_COLS = [
  { k: "property_name", label: "col_prop", w: 200 },
  { k: "usuario", label: "col_owner", w: 110 },
  { k: "email", label: "col_email", w: 180 },
  { k: "fee", label: "col_fee", w: 70 },
  { k: "iva", label: "col_iva", w: 64 },
  { k: "retencion", label: "col_ret", w: 90 },
  { k: "otroIngreso", label: "col_otro", w: 100 },
  { k: "listing", label: "col_listing", w: 200 },
];

const SetupSection = ({ lang, t }) => {
  // flatten current setup rows from the data model + any local additions
  const baseRows = useMemo(() => {
    const rows = [];
    (SpacioData.propertyList || []).forEach(p => (p.setupRows || []).forEach(sr => rows.push({
      property_id: sr.property_id, property_name: sr.property_name, usuario: sr.usuario,
      email: sr.email, fee: sr.fee, iva: sr.iva, retencion: sr.retencion, otroIngreso: sr.otroIngreso, listing: sr.listing,
    })));
    return rows;
  }, []);
  const store = SpacioSetup.all();
  const [rows, setRows] = useState(() => {
    const merged = baseRows.map(r => Object.assign({}, r, store.edits[r.property_id] || {}));
    return merged.concat(store.added || []);
  });
  const [q, setQ] = useState("");
  const [savedId, setSavedId] = useState(null);
  // write-back connection
  const [apiUrl, setApiUrl] = useState(SpacioWrite.url());
  const [apiToken, setApiToken] = useState(SpacioWrite.token());
  const [conn, setConn] = useState(SpacioWrite.enabled() ? "set" : "off"); // off | set | testing | ok | fail
  const [syncMsg, setSyncMsg] = useState("");

  const saveConn = () => { SpacioWrite.setConfig(apiUrl, apiToken); setConn(SpacioWrite.enabled() ? "set" : "off"); };
  const testConn = async () => {
    SpacioWrite.setConfig(apiUrl, apiToken);
    setConn("testing");
    const r = await SpacioWrite.ping();
    setConn(r && r.ok ? "ok" : "fail");
  };
  const syncDeposits = async () => {
    if (!SpacioWrite.enabled()) { setSyncMsg(lang === "es" ? "Conecta el backend primero." : "Connect the backend first."); return; }
    setSyncMsg(lang === "es" ? "Sincronizando…" : "Syncing…");
    const items = SpacioData.depositoItems();
    const r = await SpacioWrite.post("writeDeposito", { items });
    setSyncMsg(r && r.ok ? (lang === "es" ? `Listo · ${r.rowsUpdated} filas escritas` : `Done · ${r.rowsUpdated} rows written`) : (lang === "es" ? "Error: " + (r.error || "sin conexión") : "Error: " + (r.error || "offline")));
  };

  const update = (idx, key, val) => {
    setRows(rs => rs.map((r, i) => i === idx ? Object.assign({}, r, { [key]: val }) : r));
  };
  const persist = (r) => {
    SpacioSetup.saveEdit(r.property_id, { property_name: r.property_name, usuario: r.usuario, email: r.email, fee: r.fee, iva: r.iva, retencion: r.retencion, otroIngreso: r.otroIngreso, listing: r.listing });
    setSavedId(r.property_id); setTimeout(() => setSavedId(null), 1800);
    if (SpacioWrite.enabled()) {
      const action = r._new ? "addProperty" : "saveSetupRow";
      SpacioWrite.post(action, { row: r }).then(res => { if (!res.ok && !res.offline) console.warn(action, res); });
    }
  };
  const addRow = () => {
    const id = "new-" + Date.now();
    const r = { property_id: id, property_name: "", usuario: "", email: "", fee: "", iva: "", retencion: "", otroIngreso: "", listing: "", _new: true };
    setRows(rs => [r].concat(rs)); SpacioSetup.addRow(r);
  };
  const exportRows = () => {
    const header = ["property_id", "property_name", "Usuario ID", "User email", "SPACIOAMFEE", "iva", "RETENCION", "OTRO INGRESO", "Listing link"];
    const lines = [header.join("\t")].concat(rows.map(r => [r.property_id, r.property_name, r.usuario, r.email, r.fee, r.iva, r.retencion, r.otroIngreso, r.listing].join("\t")));
    const blob = new Blob([lines.join("\n")], { type: "text/tab-separated-values" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "setup-spacioam.tsv"; a.click();
  };
  const filtered = rows.map((r, i) => ({ r, i })).filter(({ r }) => !q || (r.property_name || "").toLowerCase().includes(q.toLowerCase()) || (r.usuario || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="sa-section" style={{ marginTop: 28 }}>
      <SectionHead eyebrow={t("admin_badge")} title={t("setup_title")} sub={t("setup_sub")} />

      {/* write-back connection */}
      <Card pad={20} soft style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <Icon name="link" size={16} stroke="var(--ink)" />
          <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink)" }}>{lang === "es" ? "Conexión de escritura" : "Write connection"}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase",
            color: conn === "ok" ? "#5B8A6B" : conn === "fail" ? "var(--peach)" : "var(--earth)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: conn === "ok" ? "#5B8A6B" : conn === "fail" ? "var(--peach)" : conn === "set" ? "var(--earth)" : "var(--warm-grey)" }} />
            {conn === "ok" ? (lang === "es" ? "Conectado" : "Connected") : conn === "fail" ? (lang === "es" ? "Sin respuesta" : "No response") : conn === "testing" ? (lang === "es" ? "Probando…" : "Testing…") : conn === "set" ? (lang === "es" ? "Configurado" : "Configured") : (lang === "es" ? "Sin conectar" : "Not connected")}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <input className="sa-setup-input" value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder={lang === "es" ? "URL de la app web (…/exec)" : "Web app URL (…/exec)"} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input className="sa-setup-input" style={{ flex: 1, minWidth: 180 }} value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="TOKEN" />
            <button className="sa-chip-btn sa-chip-btn-ghost" onClick={saveConn}>{lang === "es" ? "Guardar" : "Save"}</button>
            <button className="sa-chip-btn sa-chip-btn-dark" onClick={testConn}>{lang === "es" ? "Probar conexión" : "Test"}</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--warm-grey)" }}>
          <button className="sa-chip-btn sa-chip-btn-ghost" onClick={syncDeposits}><Icon name="coins" size={14} stroke="var(--earth)" />{lang === "es" ? "Sincronizar depósitos" : "Sync deposits"}</button>
          {syncMsg && <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: "var(--earth)" }}>{syncMsg}</span>}
        </div>
      </Card>

      <div className="sa-setup-toolbar">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("setup_search")}
          className="sa-setup-input" style={{ maxWidth: 280 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="sa-chip-btn sa-chip-btn-ghost" onClick={exportRows}><Icon name="arrowUpRight" size={14} stroke="var(--earth)" />{t("setup_export")}</button>
          <button className="sa-chip-btn sa-chip-btn-dark" onClick={addRow}><Icon name="check" size={14} stroke="var(--alabaster)" />{t("setup_add")}</button>
        </div>
      </div>
      <div className="sa-setup-scroll">
        <table className="sa-setup-table">
          <thead>
            <tr>
              {SETUP_COLS.map(c => <th key={c.k} style={{ minWidth: c.w }}>{t(c.label)}</th>)}
              <th style={{ minWidth: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ r, i }) => (
              <tr key={r.property_id}>
                {SETUP_COLS.map(c => (
                  <td key={c.k}><input className="sa-setup-input" value={r[c.k] || ""} onChange={e => update(i, c.k, e.target.value)} /></td>
                ))}
                <td>
                  <button className="sa-chip-btn sa-chip-btn-dark" style={{ padding: "8px 12px" }} onClick={() => persist(r)}>
                    {savedId === r.property_id ? <Icon name="check" size={13} stroke="var(--alabaster)" /> : t("setup_save")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", lineHeight: 1.6, color: "var(--earth)", margin: "16px 0 0", display: "flex", gap: 8, maxWidth: 720 }}>
        <Icon name="info" size={14} stroke="var(--earth)" style={{ flexShrink: 0, marginTop: 2 }} /> {t("setup_note")}
      </p>
    </section>
  );
};

// ---- Liquidation block (above Financial): deposit / withholding / VAT + invoicing notice ----
const LiquidationBlock = ({ pdata, fmt, t, lang }) => {
  const { money } = fmt;
  const c = pdata.cur;
  const stats = [
    { label: t("liq_deposit"), value: money(c.deposito), help: t("liq_deposit_help"), accent: true },
  ];
  if ((c.retencion || 0) > 0.005) stats.push({ label: t("liq_retencion"), value: money(c.retencion) });
  if ((c.ivaSocios || 0) > 0.005) stats.push({ label: t("liq_iva"), value: money(c.ivaSocios) });
  return (
    <section className="sa-section" id="sec-liquidation" style={{ marginTop: 8 }}>
      <SectionHead eyebrow={t("liq_eyebrow")} title={t("liq_title")} sub={t("liq_sub")} />
      <div className="sa-liq-grid" data-cols={stats.length}>
        {stats.map((s, i) => (
          <Card key={i} pad={22} style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 120 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{s.label}</span>
              {s.accent && <Sparkle size={12} color="var(--peach)" />}
            </div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: s.accent ? "clamp(30px,3.6vw,40px)" : "clamp(24px,2.6vw,30px)", letterSpacing: "-0.02em", color: s.accent ? "var(--ink)" : "var(--earth)", lineHeight: 1, marginTop: 16 }}>{s.value}</div>
            {s.help && <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.04em", lineHeight: 1.5, color: "var(--earth)", margin: "auto 0 0", paddingTop: 12 }}>{s.help}</p>}
          </Card>
        ))}
      </div>
      <div className="sa-liq-invoice">
        <div className="sa-liq-invoice-amt">
          <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{t("liq_invoice_label")}</span>
          <span style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 30, letterSpacing: "-0.02em", color: "var(--ink)", marginTop: 6 }}>{money(c.ingresoNeto)}</span>
          <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", color: "var(--earth)", marginTop: 4 }}>{t("liq_invoice_help")}</span>
        </div>
        <div className="sa-liq-invoice-body">
          <div className="sa-liq-line"><Icon name="file" size={15} stroke="var(--ink)" /><span><strong>{t("liq_invoice_to")}</strong></span></div>
          <div className="sa-liq-line"><Icon name="arrowUpRight" size={15} stroke="var(--ink)" /><span>{t("liq_invoice_send")}</span></div>
          <div className="sa-liq-note"><Icon name="info" size={14} stroke="var(--peach)" style={{ flexShrink: 0, marginTop: 1 }} /><span>{t("liq_invoice_note")}</span></div>
        </div>
      </div>
    </section>
  );
};

// ---- Admin: Owner deposits — one table per currency, by owner or by property ----
const DepositsSection = ({ allProps, pdata, period, fmt, t, lang }) => {
  const [view, setView] = useState("owner");
  // currency conversion to the property's OWN moneda
  const conv = (usd, moneda) => moneda === "GTQ" ? usd * SpacioI18n.GTQ_RATE : usd;
  const fmtMon = (usd, moneda) => (moneda === "GTQ" ? "Q " : "$") + Math.round(conv(usd, moneda)).toLocaleString("en-US");
  // per-property settlement for the selected period
  const rows = allProps.map(p => {
    const pd = SpacioAgg.periodData(p.months, period);
    const c = pd.cur;
    const income = c.deposito || c.ingresoNeto || 0; // neto2 si retención, si no neto
    const iva = c.ivaSocios || 0;
    const acc = SpacioData.owners.find(o => o.props.indexOf(p.id) >= 0);
    return {
      moneda: p.moneda || "USD", owner: p.code, ownerEmail: acc ? acc.email : "", prop: p.name,
      cuenta: p.cuenta || "", income, iva, total: income + iva,
    };
  });
  const monedas = [...new Set(rows.map(r => r.moneda))].sort();
  const hasAccounts = rows.some(r => r.cuenta);

  const buildGroups = (rs) => {
    if (view === "prop") return rs.map(r => ({ key: r.prop, owner: r.owner, email: r.ownerEmail, label: r.prop, cuenta: r.cuenta, income: r.income, iva: r.iva, total: r.total, moneda: r.moneda }));
    const g = {};
    rs.forEach(r => {
      const k = r.owner;
      if (!g[k]) g[k] = { key: k, owner: r.owner, email: r.ownerEmail, label: r.owner, cuenta: r.cuenta, income: 0, iva: 0, total: 0, moneda: r.moneda };
      g[k].income += r.income; g[k].iva += r.iva; g[k].total += r.total;
      if (!g[k].cuenta && r.cuenta) g[k].cuenta = r.cuenta;
    });
    return Object.values(g);
  };

  return (
    <section className="sa-section" style={{ marginTop: 28 }}>
      <SectionHead eyebrow={t("admin_badge")} title={t("dep_title")} sub={t("dep_sub")}
        right={<Segmented size="sm" value={view} onChange={setView}
          options={[{ value: "owner", label: t("dep_by_owner") }, { value: "prop", label: t("dep_by_prop") }]} />} />
      {monedas.map(mon => {
        const rs = rows.filter(r => r.moneda === mon);
        const groups = buildGroups(rs).filter(x => x.total !== 0).sort((a, b) => b.total - a.total);
        const tot = groups.reduce((a, g) => ({ income: a.income + g.income, iva: a.iva + g.iva, total: a.total + g.total }), { income: 0, iva: 0, total: 0 });
        return (
          <div key={mon} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 14px", background: "var(--ink)", color: "var(--alabaster)", borderRadius: 999, fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.16em" }}>{mon}</span>
              <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.1em", color: "var(--earth)" }}>{groups.length} {view === "owner" ? (lang === "es" ? "socios" : "owners") : (lang === "es" ? "propiedades" : "properties")}</span>
            </div>
            <div className="sa-setup-scroll">
              <table className="sa-setup-table sa-dep-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 130 }}>{view === "owner" ? t("dep_col_owner") : t("dep_col_prop")}</th>
                    {view === "prop" && <th style={{ minWidth: 110 }}>{t("dep_col_owner")}</th>}
                    <th style={{ minWidth: 110, textAlign: "right" }}>{t("dep_col_income")}</th>
                    <th style={{ minWidth: 100, textAlign: "right" }}>{t("dep_col_iva")}</th>
                    <th style={{ minWidth: 110, textAlign: "right" }}>{t("dep_col_total")}</th>
                    <th style={{ minWidth: 130 }}>{t("dep_col_account")}</th>
                    <th style={{ minWidth: 170 }}>{t("dep_col_email")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <tr key={g.key}>
                      <td style={{ fontWeight: 500 }}>{g.label}</td>
                      {view === "prop" && <td style={{ color: "var(--earth)" }}>{g.owner}</td>}
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMon(g.income, mon)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--earth)" }}>{fmtMon(g.iva, mon)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtMon(g.total, mon)}</td>
                      <td style={{ color: g.cuenta ? "var(--ink)" : "var(--earth)" }}>{g.cuenta || t("dep_no_account")}</td>
                      <td style={{ color: "var(--earth)" }}>{g.email}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "var(--beige-soft)" }}>
                    <td style={{ fontWeight: 600 }}>{t("dep_total_row")}</td>
                    {view === "prop" && <td></td>}
                    <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtMon(tot.income, mon)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtMon(tot.iva, mon)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtMon(tot.total, mon)}</td>
                    <td></td><td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {!hasAccounts && (
        <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.03em", lineHeight: 1.6, color: "var(--earth)", margin: "4px 0 0", display: "flex", gap: 8 }}>
          <Icon name="info" size={14} stroke="var(--earth)" style={{ flexShrink: 0, marginTop: 2 }} /> {t("dep_account_note")}
        </p>
      )}
    </section>
  );
};

Object.assign(window, { DistributionSection, EvolutionSection, ExpensesSection, ReporteFinanciero, AccountSection, SetupSection, LiquidationBlock, DepositsSection });
