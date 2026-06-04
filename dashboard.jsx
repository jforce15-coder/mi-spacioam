// ============================================================
// Spacio AM — Owner Dashboard · Shell + Summary/Financial/Occupancy
// ============================================================

// ---- Top bar ----
const TopBar = ({ owner, lang, setLang, currency, setCurrency, propOptions, selProp, setSelProp, period, setPeriod, months, periodText, hidePropSelect, onLogout, t }) => {
  const [menu, setMenu] = useState(false);
  const mref = useRef(null);
  useEffect(() => {
    const h = e => { if (mref.current && !mref.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <header className="sa-topbar">
      <div className="sa-topbar-inner">
        <a className="sa-brand" href="#" onClick={e => e.preventDefault()} aria-label="Spacio AM">
          <img src="assets/logo-wordmark.png" alt="Spacio AM" className="sa-brand-logo" />
        </a>

        <div className="sa-topbar-controls">
          {!hidePropSelect && propOptions.length > 1 && (
            <Select icon="home" value={selProp} onChange={setSelProp} options={propOptions} minWidth={220} />
          )}
          <PeriodPicker period={period} setPeriod={setPeriod} months={months} periodText={periodText} t={t} lang={lang} />
        </div>

        <div className="sa-topbar-right">
          <div className="sa-only-desktop"><Segmented size="sm" value={currency} onChange={setCurrency} options={[{ value: "USD", label: "USD" }, { value: "GTQ", label: "GTQ" }]} /></div>
          <div className="sa-only-desktop"><Segmented size="sm" value={lang} onChange={setLang} options={[{ value: "es", label: "ES" }, { value: "en", label: "EN" }]} /></div>
          <div ref={mref} style={{ position: "relative" }}>
            <button onClick={() => setMenu(m => !m)} className="sa-avatar" aria-label="account">
              {owner.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
            </button>
            {menu && (
              <div className="sa-menu" style={{ animation: "sa-fade .18s var(--ease)" }}>
                <div style={{ padding: "12px 14px 12px", borderBottom: "1px solid var(--warm-grey)" }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink)", lineHeight: 1.1 }}>{owner.name}</div>
                  <div style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.06em", color: "var(--earth)", marginTop: 3 }}>{owner.email}</div>
                </div>
                <div className="sa-only-mobile" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12, borderBottom: "1px solid var(--warm-grey)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{t("currency_label")}</span>
                    <Segmented size="sm" value={currency} onChange={setCurrency} options={[{ value: "USD", label: "USD" }, { value: "GTQ", label: "GTQ" }]} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{t("language_label")}</span>
                    <Segmented size="sm" value={lang} onChange={setLang} options={[{ value: "es", label: "ES" }, { value: "en", label: "EN" }]} />
                  </div>
                </div>
                <button onClick={onLogout} className="sa-menu-item">
                  <Icon name="logout" size={16} stroke="var(--earth)" /> {t("logout")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// ---- generic warm property imagery (until a real listing photo is connected) ----
function propertyPhoto(property) {
  return "assets/property-placeholder.jpg";
}
// Lazy-fetch the listing's og:image via the Apps Script (server-side, no CORS),
// cache it in localStorage. Falls back to the branded placeholder.
function useListingPhoto(property) {
  const listing = property && property.listing;
  const cacheKey = listing ? "sa-img-" + listing : null;
  const [src, setSrc] = useState(() => (cacheKey && localStorage.getItem(cacheKey)) || propertyPhoto(property));
  useEffect(() => {
    if (!listing || !cacheKey) { setSrc(propertyPhoto(property)); return; }
    const cached = localStorage.getItem(cacheKey);
    if (cached) { setSrc(cached); return; }
    setSrc(propertyPhoto(property));
    if (window.SpacioWrite && SpacioWrite.enabled()) {
      SpacioWrite.post("fetchImage", { url: listing.indexOf("http") === 0 ? listing : "https://" + listing }).then(r => {
        if (r && r.ok && r.image) { localStorage.setItem(cacheKey, r.image); setSrc(r.image); }
      }).catch(() => {});
    }
  }, [listing]);
  return src;
}

// ---- Hero property block ----
const HeroPhoto = ({ property }) => {
  const photo = useListingPhoto(property);
  return <img src={photo} alt={property.name} className="sa-hero-img"
    onError={(e) => { if (!e.target.dataset.fb) { e.target.dataset.fb = "1"; e.target.src = "assets/property-placeholder.jpg"; } }} />;
};
const Hero = ({ property, isAll, propsCount, periodText, contextLine, t, lang }) => (
  <div className="sa-hero">
    <div className="sa-hero-media">
      {isAll ? (
        <div className="sa-hero-all">
          <img src="assets/logo-stamp.png" alt="Spacio AM" style={{ width: 72, height: 72, opacity: 0.85 }} />
          <div style={{ fontFamily: "var(--serif)", fontSize: "clamp(22px,3vw,30px)", color: "var(--ink)", marginTop: 16, letterSpacing: "-0.01em" }}>{t("all_props")}</div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--earth)", marginTop: 8 }}>{propsCount} {propsCount === 1 ? (lang === "es" ? "propiedad" : "property") : (lang === "es" ? "propiedades" : "properties")}</div>
        </div>
      ) : (
        <a className="sa-hero-photo" href={property.listing || undefined} target={property.listing ? "_blank" : undefined} rel="noreferrer" aria-label={property.listing ? t("view_listing") : property.name}>
          <HeroPhoto property={property} />
        </a>
      )}
      {!isAll && (
        <div className="sa-hero-overlay">
          <div style={{ fontFamily: "var(--sans)", fontSize: 10.5, fontWeight: 500, letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(250,250,250,0.85)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="pin" size={13} stroke="var(--peach)" />{property.location}
          </div>
          <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "clamp(24px,3.2vw,34px)", color: "var(--alabaster)", letterSpacing: "-0.01em", lineHeight: 1.08, marginTop: 8 }}>{property.name}</div>
          {property.listing && (
            <a className="sa-hero-listing" href={property.listing} target="_blank" rel="noreferrer">
              <Icon name="arrowUpRight" size={13} stroke="var(--ink)" /> {t("view_listing")}
            </a>
          )}
        </div>
      )}
    </div>
    <div className="sa-hero-context">
      <Eyebrow>{periodText}</Eyebrow>
      <p style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(20px,2.5vw,27px)", lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--ink)", margin: "16px 0 0", textWrap: "pretty" }}>{contextLine}</p>
      {!isAll && (
        property.listing ? (
          <a className="sa-listing-link" href={property.listing} target="_blank" rel="noreferrer">
            <Icon name="link" size={14} /> {property.listing.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <div className="sa-listing-link" style={{ cursor: "default" }}>
            <Icon name="link" size={14} /> {t("connect_hint")}
          </div>
        )
      )}
    </div>
  </div>
);

// ---- Summary KPI grid ----
const SummaryKPIs = ({ cur, prev, fmt, t }) => {
  const { money, pct, num } = fmt;
  const d = (k) => SpacioAgg.delta(cur, prev, k);
  return (
    <div className="sa-kpi-grid">
      <KpiCard big accent label={t("kpi_net")} value={money(cur.ingresoNeto)} trend={d("ingresoNeto")} help={t("net_help")} />
      <KpiCard label={t("kpi_gross")} value={money(cur.ingresoBruto)} trend={d("ingresoBruto")} help={t("gross_help")} />
      <KpiCard label={t("kpi_occ")} value={pct(cur.ocupacionAjustada)} trend={d("ocupacionAjustada")} help={t("occ_help")} />
      <KpiCard label={t("kpi_adr")} value={money(cur.adr)} trend={d("adr")} help={t("adr_help")} />
      <KpiCard label={t("kpi_stays")} value={num(cur.estadias)} trend={d("estadias")} help={t("stays_help")} />
      <KpiCard label={t("kpi_nights")} value={num(cur.nochesReservadas)} trend={d("nochesReservadas")} help={t("nights_help")} />
    </div>
  );
};

// ---- Financial section ----
const FinancialSection = ({ pdata, fmt, t, lang }) => {
  const { money } = fmt;
  const slice = pdata.slice.length > 1 ? pdata.slice : pdata.hist.months.slice(-6);
  const labels = slice.map(m => m.label[lang]);
  const series = [
    { key: "bruto", name: t("gross"), color: "var(--ink)", values: slice.map(m => m.ingresoBruto), width: 2, fill: 0.05 },
    { key: "neto", name: t("net"), color: "var(--peach)", values: slice.map(m => m.ingresoNeto), width: 2.4, fill: 0.16 },
  ];
  const cur = pdata.cur;
  const highlights = [
    { icon: "trendUp", title: t("highlight"), body: SpacioInsights.season(lang, slice) },
    { icon: "coins", title: t("fee"), body: SpacioInsights.fee(lang, cur, money) },
  ];
  return (
    <section id="sec-financial" className="sa-section">
      <SectionHead eyebrow={t("sec_financial")} title={t("fin_title")} sub={t("fin_sub")} />
      <div className="sa-fin-grid">
        <Card pad={24}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{t("net")}</div>
              <div style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", color: "var(--ink)", marginTop: 6 }}>{money(cur.ingresoNeto)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{t("fee")}</div>
              <div style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: 20, color: "var(--earth)", marginTop: 6 }}>{money(cur.fee)}</div>
            </div>
          </div>
          <LineChart series={series} labels={labels} height={250} formatY={v => fmt.moneyShort(v)} formatTip={v => money(v)} />
          <Legend items={series.map(s => ({ name: s.name, color: s.color, dash: !!s.dash }))} />
        </Card>
        <div className="sa-highlights">
          <Eyebrow style={{ marginBottom: 4 }}>{t("context")}</Eyebrow>
          {highlights.map((h, i) => (
            <div key={i} className="sa-highlight">
              <span className="sa-highlight-ic"><Icon name={h.icon} size={17} stroke="var(--peach)" /></span>
              <div>
                <div style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink)", marginBottom: 6 }}>{h.title}</div>
                <p style={{ fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.65, letterSpacing: "0.03em", color: "var(--earth)", margin: 0, textWrap: "pretty" }}>{h.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ---- Occupancy section (redesigned: gauge + clean columns) ----
const OccupancySection = ({ pdata, fmt, t, lang }) => {
  const { pct, num } = fmt;
  const cur = pdata.cur;
  const slice = (pdata.hist.months || []).filter(m => m.present).slice(-7);
  const cols = slice.map(m => ({ label: m.label[lang], occ: m.ocupacionAjustada }));
  const stats = [
    { label: t("occ_total"), value: pct(cur.ocupacionTotal) },
    { label: t("nights_sold"), value: num(cur.nochesReservadas) },
    { label: t("nights_blocked"), value: num(cur.nochesBloqueadas) },
  ];
  return (
    <section id="sec-occupancy" className="sa-section">
      <SectionHead eyebrow={t("sec_occupancy")} title={t("occ_title")} sub={t("occ_sub")} />
      <div className="sa-occ-grid">
        {/* left: gauge + stats */}
        <Card pad={26} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ alignSelf: "flex-start", fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{t("occ_adjusted")}</span>
          <div style={{ margin: "18px 0 6px" }}>
            <Gauge value={cur.ocupacionAjustada} size={230} label={pct(cur.ocupacionAjustada)} sub={t("this_month")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, width: "100%", marginTop: 14 }}>
            {stats.map((s, i) => (
              <div key={i} style={{ textAlign: "center", padding: "12px 6px", background: "var(--beige-soft)", borderRadius: 14 }}>
                <div style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 19, color: "var(--ink)", letterSpacing: "-0.01em" }}>{s.value}</div>
                <div style={{ fontFamily: "var(--sans)", fontSize: 9, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--earth)", marginTop: 5, lineHeight: 1.3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>
        {/* right: monthly columns */}
        <Card pad={24}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{t("occ_adjusted")} · {lang === "es" ? "mensual" : "monthly"}</span>
          </div>
          <OccColumns data={cols} height={250} lang={lang} />
          <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, lineHeight: 1.65, letterSpacing: "0.03em", color: "var(--earth)", margin: "14px 0 0", textWrap: "pretty" }}>{SpacioInsights.occContext(lang, cur, pdata.hist)}</p>
        </Card>
      </div>
    </section>
  );
};

const Row = ({ k, v }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
    <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--earth)", letterSpacing: "0.04em" }}>{k}</span>
    <span style={{ fontFamily: "var(--sans)", fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{v}</span>
  </div>
);

// ---- Period picker: "Vista rápida" presets vs "Mes específico" (mes + año) ----
const PeriodPicker = ({ period, setPeriod, months, periodText, t, lang }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const isYm = typeof period === "string" && period.indexOf("ym:") === 0;
  const [mode, setMode] = useState(isYm ? "month" : "quick");
  const present = (months || []).filter(m => m.present);
  const years = [...new Set(present.map(m => m.y))].sort((a, b) => b - a);
  const cur = isYm ? period.slice(3).split("-").map(Number) : null;
  const [selYear, setSelYear] = useState(cur ? cur[0] : (years[0] || new Date().getFullYear()));
  const monthsInYear = present.filter(m => m.y === selYear).sort((a, b) => b.m - a.m);
  const presets = [
    { value: "current", label: t("p_current") }, { value: "m3", label: t("p_3m") },
    { value: "m6", label: t("p_6m") }, { value: "m12", label: t("p_12m") },
  ];
  const pick = (v) => { setPeriod(v); setOpen(false); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", background: "var(--alabaster)",
        border: "1px solid var(--ink-08)", borderRadius: 999, padding: "10px 14px 10px 16px",
        fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.06em", color: "var(--ink)", boxShadow: "var(--shadow-xs)",
      }}>
        <Icon name="calendar" size={15} stroke="var(--earth)" />
        <span style={{ fontWeight: 500 }}>{periodText}</span>
        <Icon name="chevronDown" size={14} stroke="var(--earth)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s var(--ease)" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60, width: 264,
          background: "var(--alabaster)", border: "1px solid var(--ink-08)", borderRadius: 16, boxShadow: "var(--shadow-md)",
          padding: 14, animation: "sa-fade .18s var(--ease)" }}>
          <div style={{ marginBottom: 12 }}>
            <Segmented size="sm" value={mode} onChange={setMode}
              options={[{ value: "quick", label: t("filt_mode_quick") }, { value: "month", label: t("filt_mode_month") }]} />
          </div>
          {mode === "quick" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {presets.map(p => {
                const active = period === p.value;
                return (
                  <button key={p.value} onClick={() => pick(p.value)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", border: "none", cursor: "pointer",
                    background: active ? "var(--beige-soft)" : "transparent", borderRadius: 10, padding: "11px 12px",
                    fontFamily: "var(--sans)", fontSize: 12.5, letterSpacing: "0.03em", color: "var(--ink)", fontWeight: active ? 500 : 400,
                  }}>
                    {p.label}{active && <Icon name="check" size={15} stroke="var(--peach)" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)", margin: "2px 0 7px" }}>{t("filt_year")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {years.map(y => (
                  <button key={y} onClick={() => setSelYear(y)} style={{
                    border: "1px solid var(--ink-08)", cursor: "pointer", borderRadius: 9, padding: "7px 13px",
                    background: selYear === y ? "var(--ink)" : "transparent", color: selYear === y ? "var(--alabaster)" : "var(--ink)",
                    fontFamily: "var(--sans)", fontSize: 12, fontWeight: 500, letterSpacing: "0.04em",
                  }}>{y}</button>
                ))}
              </div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)", margin: "2px 0 7px" }}>{t("filt_month")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                {monthsInYear.map(m => {
                  const v = "ym:" + m.y + "-" + m.m; const active = period === v;
                  return (
                    <button key={v} onClick={() => pick(v)} style={{
                      border: "1px solid var(--ink-08)", cursor: "pointer", borderRadius: 9, padding: "9px 4px",
                      background: active ? "var(--peach)" : "transparent", color: active ? "var(--alabaster)" : "var(--ink)",
                      fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 500, letterSpacing: "0.04em",
                    }}>{(lang === "es" ? SpacioI18n.MONTHS_ES : SpacioI18n.MONTHS_EN)[m.m]}</button>
                  );
                })}
                {!monthsInYear.length && <span style={{ gridColumn: "1/-1", fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--earth)", padding: "8px 0" }}>—</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---- Admin filter bar: zona / edificio / propiedad ----
const AdminFilters = ({ allProps, zona, setZona, edificio, setEdificio, selProp, setSelProp, t, lang }) => {
  const zonas = [...new Set(allProps.map(p => p.zona).filter(Boolean))].sort();
  const inZona = zona === "all" ? allProps : allProps.filter(p => p.zona === zona);
  const edificios = [...new Set(inZona.map(p => p.edificio).filter(Boolean))].sort();
  const inEd = edificio === "all" ? inZona : inZona.filter(p => p.edificio === edificio);
  const zonaOpts = [{ value: "all", label: t("admin_all_zonas") }].concat(zonas.map(z => ({ value: z, label: z })));
  const edOpts = [{ value: "all", label: t("admin_all_edificios") }].concat(edificios.map(e => ({ value: e, label: e })));
  const propOpts = [{ value: "all", label: t("admin_all_props"), sub: inEd.length + " " + (lang === "es" ? "propiedades" : "properties") }]
    .concat(inEd.map(p => ({ value: p.id, label: p.name, sub: p.location })));
  return (
    <div className="sa-admin-bar">
      <span className="sa-admin-badge"><Sparkle size={11} color="var(--alabaster)" />{t("admin_scope")}</span>
      <Select value={zona} onChange={(v) => { setZona(v); setEdificio("all"); setSelProp("all"); }} options={zonaOpts} icon="pin" minWidth={150} />
      <Select value={edificio} onChange={(v) => { setEdificio(v); setSelProp("all"); }} options={edOpts} icon="home" minWidth={170} />
      <Select value={selProp} onChange={setSelProp} options={propOpts} icon="grid" minWidth={210} />
    </div>
  );
};

Object.assign(window, { TopBar, Hero, SummaryKPIs, FinancialSection, OccupancySection, Row, PeriodPicker, AdminFilters });
