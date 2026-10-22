/* Antes vivía dentro de index.html como <script type="text/babel">. Se movió aquí para compilarlo junto con los demás. */
    const { useState, useEffect, useMemo } = React;

    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

    function Dashboard({ owner, lang, setLang, currency, setCurrency, onLogout, onUpdateOwner }) {
      const isAdmin = !!owner.isAdmin;
      const isContador = !!owner.isContador;
      const allOwnerProps = SpacioData.ownerProps(owner);
      const [adminZona, setAdminZona] = useState([]);
      const [adminEdificio, setAdminEdificio] = useState([]);
      const [adminProps, setAdminProps] = useState([]);
      const [adminOwner, setAdminOwner] = useState("all");
      const inList = (arr, v) => !arr || arr.length === 0 || arr.indexOf(v) >= 0;
      // mapa propiedad → código de socio canónico (para filtrar por socio)
      const ownerOf = (p) => { const o = (SpacioData.owners || []).find(o => (o.codes || [o.code]).indexOf(p.code) >= 0); return o ? o.code : p.code; };
      const scopeProps = isAdmin
        ? allOwnerProps.filter(p => (adminOwner === "all" || ownerOf(p) === adminOwner) && inList(adminZona, p.zona) && inList(adminEdificio, p.edificio))
        : allOwnerProps;
      const props = scopeProps;
      const single = props.length === 1;
      const [selProp, setSelProp] = useState(single ? props[0].id : "all");
      const [period, setPeriod] = useState("current");
      const [tab, setTab] = useState(() => { if (owner.isContador) return "conta"; try { return new URLSearchParams(location.search).get("tab") || "dashboard"; } catch (e) { return "dashboard"; } });
      const [navMore, setNavMore] = useState(false);
      // ── Centro de notificaciones ──
      const [notiOpen, setNotiOpen] = useState(false);
      const [notiDismiss, setNotiDismiss] = useState(() => { try { return JSON.parse(localStorage.getItem("sam:notiDismiss") || "{}"); } catch (e) { return {}; } });
      const [notiSnooze, setNotiSnooze] = useState(() => { try { return JSON.parse(localStorage.getItem("sam:notiSnooze") || "{}"); } catch (e) { return {}; } });
      const [notiPrefs, setNotiPrefs] = useState(() => window.SpacioNotiPrefs ? SpacioNotiPrefs.get() : null);
      useEffect(() => { const h = () => setNotiPrefs(SpacioNotiPrefs.get()); window.addEventListener("sam-notiprefs", h); return () => window.removeEventListener("sam-notiprefs", h); }, []);
      const notiPersist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
      const dismissNoti = (n) => setNotiDismiss(p => { const u = Object.assign({}, p, { [n.id]: 1 }); notiPersist("sam:notiDismiss", u); return u; });
      const snoozeNoti = (n) => setNotiSnooze(p => { const u = Object.assign({}, p, { [n.id]: Date.now() + 86400000 }); notiPersist("sam:notiSnooze", u); return u; });

      const t = (k) => SpacioI18n.t(lang, k);
      const fmt = {
        money: (v) => SpacioI18n.money(v, currency),
        money2: (v) => SpacioI18n.money(v, currency, { decimals: 2 }),
        currency: currency,
        // GTQ exacto (2 decimales) — para montos que se registran en quetzales y
        // no deben pasar por la conversión USD↔GTQ (p.ej. insumos & gastos).
        gtq: (v) => "Q " + (Math.round((v || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        // Monto con 2 decimales donde los decimales se ven más pequeños (para el Resumen).
        moneyEl: (v) => {
          const val = currency === "GTQ" ? (v || 0) * SpacioI18n.GTQ_RATE : (v || 0);
          const sym = currency === "GTQ" ? "Q " : "$";
          const neg = val < 0 ? "−" : "";
          const abs = Math.abs(val);
          const ent = Math.floor(abs).toLocaleString("en-US");
          const dec = Math.round((abs - Math.floor(abs)) * 100).toString().padStart(2, "0");
          return React.createElement("span", null, neg + sym + ent,
            React.createElement("span", { style: { fontSize: "0.72em", opacity: 0.62 } }, "." + dec));
        },
        moneyShort: (v) => SpacioI18n.moneyShort(v, currency),
        pct: SpacioI18n.pct, num: SpacioI18n.num,
      };

      // if current selection falls outside the admin scope, fall back to "all"
      const selInScope = selProp === "all" || props.some(p => p.id === selProp);
      const effSelProp = selInScope ? selProp : "all";
      // admin: propiedades múltiples; socio: la del TopBar (una)
      const selPropArr = isAdmin ? adminProps.filter(id => props.some(p => p.id === id)) : (effSelProp === "all" ? [] : [effSelProp]);
      const isAll = selPropArr.length === 0;
      const activeProps = isAll ? props : props.filter(p => selPropArr.indexOf(p.id) >= 0);
      const property = (!isAll && activeProps.length === 1) ? activeProps[0] : null;
      const scopeKey = isAdmin ? adminOwner + "|" + adminZona.join(",") + "|" + adminEdificio.join(",") + "|" + selPropArr.join(",") : owner.code + "|" + effSelProp;
      const months = useMemo(() => property ? property.months : SpacioAgg.combineMonths(activeProps.length ? activeProps : (props.length ? props : allOwnerProps)), [scopeKey, owner.code]);
      const pdata = useMemo(() => SpacioAgg.periodData(months, period), [months, period]);

      const propOptions = (single ? [] : [{ value: "all", label: t("all_props"), sub: props.length + " " + (lang === "es" ? "propiedades" : "properties") }])
        .concat(props.map(p => ({ value: p.id, label: p.name, sub: p.location })));

      const periodText = (() => {
        const s = pdata.slice; if (!s.length) return "";
        const a = s[0], b = s[s.length - 1];
        if (s.length === 1) return cap(SpacioI18n.monthLong(lang, a.m)) + " " + a.y;
        return cap(a.label[lang]) + " " + a.y + " — " + cap(b.label[lang]) + " " + b.y;
      })();
      const contextLine = SpacioInsights.hero(lang, pdata.cur, pdata.hist);

      const lastSlice = pdata.slice[pdata.slice.length - 1];
      const reportYM = lastSlice ? { y: lastSlice.y, m: lastSlice.m } : null;

      // alerta de factura del período visto (nivel 1-2 → en el bloque; nivel 3 → arriba)
      const invAlert = (() => {
        const SF = window.SpacioFiles; if (!SF) return null;
        const em = lastSlice;
        if (!em || em.y < SF.ENFORCE_FROM_YEAR) return null;
        const ymS = em.y + "-" + String(em.m + 1).padStart(2, "0");
        const scope = isAll ? "owner" : "property";
        const oLabel = (typeof ownerLabelFor !== "undefined")
          ? ownerLabelFor({ scope, property: isAll ? null : activeProps[0], activeProps, owner, isAdmin })
          : (owner.name || owner.code);
        if (SF.exemptOwner && (SF.exemptOwner(oLabel) || SF.exemptOwner(owner.code))) return null;
        const cov = SF.coverage("factura", { scope, owner: oLabel, property_name: isAll ? "" : (activeProps[0] ? activeProps[0].name : ""), ym: ymS, properties: activeProps || [] });
        const income = pdata.cur.ingresoNeto || 0;
        if (cov || income <= 0.5) return null;
        const u = SF.urgency(em.y, em.m);
        return u.level >= 1 ? { level: u.level, y: em.y, m: em.m, days: u.days } : null;
      })();
      const scrollToLiq = () => { try { const el = document.getElementById("sec-liquidation"); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 70, behavior: "smooth" }); } catch (e) {} };

      // ── Notificaciones: fuentes reales → items del centro ──
      const notiOwnerLabel = (typeof ownerLabelFor !== "undefined")
        ? ownerLabelFor({ scope: isAll ? "owner" : "property", property, activeProps, owner, isAdmin })
        : (owner.name || owner.code);
      const goToMonth = (y, m) => { setTab("dashboard"); setPeriod("ym:" + y + "-" + m); setTimeout(scrollToLiq, 90); };
      const goToMonthStr = (ym) => { const p = String(ym).split("-"); goToMonth(+p[0], (+p[1]) - 1); };
      const goToTab = (id) => { setTab(id); window.scrollTo({ top: 0, behavior: "smooth" }); };
      const notiAll = useMemo(() => (window.SpacioNotis ? window.SpacioNotis.build({
        months, owner, isAll, activeProps, isAdmin, isContador, lang,
        SF: window.SpacioFiles, ownerLabel: notiOwnerLabel, goToMonth, goToMonthStr, goToLiq: scrollToLiq,
        allProps: allOwnerProps, goToTab, prefs: notiPrefs,
      }) : []), [months, isAll, effSelProp, lang, tab, scopeKey, notiPrefs]);
      const notis = notiAll.filter(n => !notiDismiss[n.id] && !(notiSnooze[n.id] && notiSnooze[n.id] > Date.now()));

      const monthOpts = (months || []).filter(m => m.present).slice().reverse().map(m => ({
        value: "ym:" + m.y + "-" + m.m, label: cap(SpacioI18n.monthLong(lang, m.m)) + " " + m.y,
      }));
      const periodOpts = [
        { value: "current", label: t("p_current") },
        { value: "m3", label: t("p_3m") },
        { value: "m6", label: t("p_6m") },
        { value: "m12", label: t("p_12m") },
      ].concat(monthOpts);

      const tabs = isContador ? [
        { id: "conta", icon: "bank", label: t("nav_conta") },
      ] : isAdmin ? [
        { id: "dashboard", icon: "home", label: t("nav_dashboard") },
        { id: "expenses", icon: "coins", label: t("nav_expenses") },
        { id: "report", icon: "file", label: t("nav_report") },
        { id: "deposits", icon: "coins", label: t("nav_deposits") },
        { id: "conta", icon: "bank", label: t("nav_conta") },
      ] : [
        { id: "dashboard", icon: "home", label: t("nav_dashboard") },
        { id: "expenses", icon: "coins", label: t("nav_expenses") },
        { id: "report", icon: "file", label: t("nav_report") },
      ];
      const switchTab = (id) => { setTab(id); setNavMore(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
      // Móvil: 3 pestañas principales visibles + “+” con el resto
      const navPrimary = tabs.slice(0, 3);
      const navOverflow = tabs.slice(3);
      const overflowActive = navOverflow.some(tb => tb.id === tab);

      return (
        <div>
          <TopBar owner={owner} lang={lang} setLang={setLang} currency={currency} setCurrency={setCurrency}
            propOptions={propOptions} selProp={effSelProp} setSelProp={setSelProp} period={period} setPeriod={setPeriod}
            months={months} periodText={periodText} hidePropSelect={isAdmin || isContador} hidePeriod={isContador}
            invoiceAlert={(tab === "dashboard" && !isAdmin && !isContador) ? invAlert : null} onAlertClick={scrollToLiq}
            onLogout={onLogout} t={t} notiTotal={notis.length} onNotiOpen={() => setNotiOpen(true)}
            isAdmin={isAdmin} isContador={isContador} onAccount={() => switchTab("account")} onSetup={() => switchTab("setup")} onAdvanced={() => switchTab("advanced")} advActive={tab === "advanced"} />

          {window.NotiCenter && <NotiCenter open={notiOpen} onClose={() => setNotiOpen(false)} notis={notis} onDismiss={dismissNoti} onSnooze={snoozeNoti} />}
          {window.NotiPush && <NotiPush notis={notis} storeKey="sam:notiSeen" onOpen={() => setNotiOpen(true)} />}

          <div className="sa-tabs-bar">
            <div className="sa-tabs-inner">
              {tabs.map(tb => (
                <button key={tb.id} className={"sa-tab" + (tab === tb.id ? " active" : "")} onClick={() => switchTab(tb.id)}>
                  <Icon name={tb.icon} size={15} stroke="currentColor" />{tb.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sa-wrap">
            {isAdmin && tab === "dashboard" && typeof MailNudgeCard !== "undefined" && (
              <MailNudgeCard lang={lang} />
            )}
            {isAdmin && tab !== "setup" && tab !== "account" && tab !== "deposits" && tab !== "conta" && tab !== "advanced" && (
              <AdminFilters allProps={allOwnerProps} owner={adminOwner} setOwner={setAdminOwner} zona={adminZona} setZona={setAdminZona}
                edificio={adminEdificio} setEdificio={setAdminEdificio} selProp={adminProps} setSelProp={setAdminProps} t={t} lang={lang} />
            )}
            <div className="sa-pagehead">
              <div>
                <Eyebrow style={{ marginBottom: 12 }}>{isContador ? t("conta_badge") : isAdmin ? t("admin_badge") : t("greeting") + ", " + owner.name}</Eyebrow>
                <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "clamp(28px,4.4vw,46px)", letterSpacing: "-0.015em", lineHeight: 1.04, margin: 0, color: "var(--ink)" }}>
                  {isContador ? "Contabilidad" : isAll ? (isAdmin ? "Spacio AM" : (lang === "es" ? "Tu portafolio" : "Your portfolio")) : property.name}
                </h1>
                {tab !== "account" && tab !== "advanced" && !isContador && (
                  <div className="sa-period-chip">
                    <Icon name="calendar" size={13} stroke="var(--fg-muted)" />
                    <span>{t("period_showing")}</span><strong>{periodText}</strong>
                  </div>
                )}
              </div>
            </div>

            {tab === "dashboard" && !isAdmin && typeof PendingInvoicesAlert !== "undefined" && (
              <PendingInvoicesAlert activeProps={activeProps} owner={owner} isAdmin={isAdmin} isAll={isAll} lang={lang} t={t} setPeriod={setPeriod} compact />
            )}

            {tab === "dashboard" && (
              <React.Fragment>
                <div className="sa-top" id="top">
                  <Hero property={property} isAll={isAll} propsCount={props.length} periodText={periodText} contextLine={contextLine} t={t} lang={lang} />
                  <SummaryKPIs cur={pdata.cur} prev={pdata.prev} fmt={fmt} t={t} />
                </div>
                <LiquidationBlock pdata={pdata} fmt={fmt} t={t} lang={lang} property={property} activeProps={activeProps} owner={owner} isAdmin={isAdmin} isAll={isAll} />
                <FinancialSection pdata={pdata} fmt={fmt} t={t} lang={lang} />
                <DistributionSection pdata={pdata} fmt={fmt} t={t} lang={lang} />
                <OccupancySection pdata={pdata} fmt={fmt} t={t} lang={lang} />
                <EvolutionSection pdata={pdata} fmt={fmt} t={t} lang={lang} />
              </React.Fragment>
            )}

            {tab === "expenses" && (
              <ExpensesSection activeProps={activeProps} pdata={pdata} fmt={fmt} t={t} lang={lang} isAdmin={isAdmin} />
            )}

            {tab === "report" && (
              <div className="sa-section" style={{ marginTop: 28 }}>
                {isAll && props.length > 1 && (
                  <p style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.04em", color: "var(--fg-muted)", margin: "0 0 18px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="info" size={14} stroke="var(--fg-muted)" /> {t("report_pickall")}
                  </p>
                )}
                {activeProps.map(p => {
                  const mo = reportYM ? p.months.find(x => x.y === reportYM.y && x.m === reportYM.m) : null;
                  const rs = reportYM ? SpacioAgg.resForMonth(p, reportYM.y, reportYM.m) : [];
                  return <ReporteFinanciero key={p.id} property={p} monthObj={mo} reservations={rs} t={t} lang={lang} />;
                })}
              </div>
            )}

            {tab === "account" && (
              <AccountSection owner={owner} lang={lang} t={t} onUpdate={onUpdateOwner} />
            )}

            {tab === "advanced" && isAdmin && typeof AdvancedSection !== "undefined" && (
              <AdvancedSection lang={lang} owner={owner} />
            )}

            {tab === "setup" && isAdmin && (
              <SetupSection lang={lang} t={t} />
            )}

            {tab === "deposits" && isAdmin && (
              <DepositsSection allProps={allOwnerProps} pdata={pdata} period={period} fmt={fmt} t={t} lang={lang} />
            )}

            {tab === "conta" && (isAdmin || isContador) && (
              <ContabilidadSection owner={owner} isAdmin={isAdmin} isContador={isContador} lang={lang} t={t} currency={currency} fmt={fmt} allProps={SpacioData.propertyList} />
            )}

            <footer style={{ marginTop: 64, paddingTop: 26, borderTop: "1px solid var(--warm-grey)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--fg-muted)" }}>© Spacio AM · MMXXVI</span>
              <span style={{ fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{t("help")}</span>
            </footer>
          </div>

          <nav className="sa-bottomnav">
            <div className="sa-bottomnav-inner">
              {navPrimary.map(tb => (
                <button key={tb.id} className={"sa-navbtn" + (tab === tb.id ? " active" : "")} onClick={() => switchTab(tb.id)}>
                  <Icon name={tb.icon} size={19} stroke="currentColor" />
                  <span>{tb.label}</span>
                  <span className="sa-navdot" />
                </button>
              ))}
              {navOverflow.length > 0 && (
                <div className="sa-navmore">
                  <button className={"sa-navbtn" + (overflowActive || navMore ? " active" : "")} onClick={() => setNavMore(m => !m)} style={{ width: "100%" }} aria-label={t("nav_more")}>
                    <Icon name={navMore ? "x" : "plus"} size={19} stroke="currentColor" />
                    <span>{t("nav_more")}</span>
                    <span className="sa-navdot" />
                  </button>
                  {navMore && (
                    <div className="sa-navmore-sheet">
                      {navOverflow.map(tb => (
                        <button key={tb.id} className={"sa-navmore-item" + (tab === tb.id ? " active" : "")} onClick={() => switchTab(tb.id)}>
                          <Icon name={tb.icon} size={17} stroke="currentColor" />{tb.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </nav>
          {navMore && <div className="sa-navmore-backdrop" onClick={() => setNavMore(false)} />}
        </div>
      );
    }

    function Splash({ state, onRetry, lang }) {
      const es = lang !== "en";
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--alabaster)", padding: 24, textAlign: "center" }}>
          <div style={{ marginBottom: 30 }}><img src="logo-wordmark.png" alt="Spacio AM" style={{ width: 172, maxWidth: "70vw", height: "auto", display: "block" }} /></div>
          {state === "loading" && (
            <React.Fragment>
              <div className="sa-spin" style={{ width: 26, height: 26, border: "2px solid var(--warm-grey)", borderTopColor: "var(--peach)", borderRadius: "50%" }} />
              <p style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginTop: 22 }}>
                {es ? "Conectando con tu información…" : "Connecting to your data…"}
              </p>
            </React.Fragment>
          )}
          {state === "error" && (
            <React.Fragment>
              <Icon name="info" size={26} stroke="var(--peach)" />
              <p style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", margin: "16px 0 6px", maxWidth: 420 }}>
                {es ? "No pudimos leer la hoja en este momento." : "We couldn't read the sheet right now."}
              </p>
              <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, letterSpacing: "0.04em", lineHeight: 1.6, color: "var(--fg-muted)", maxWidth: 420, margin: "0 0 22px" }}>
                {es ? "Verifica que el documento esté publicado o compartido como “cualquiera con el enlace”, y vuelve a intentar." : "Make sure the document is published or shared as “anyone with the link”, then try again."}
              </p>
              <button onClick={onRetry} style={{ border: "none", cursor: "pointer", background: "var(--ink)", color: "var(--alabaster)", borderRadius: 12, padding: "13px 26px", fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase" }}>
                {es ? "Reintentar" : "Retry"}
              </button>
            </React.Fragment>
          )}
        </div>
      );
    }

    function App() {
      const [lang, setLang] = useState(() => localStorage.getItem("sa-lang") || "es");
      const [currency, setCurrency] = useState(() => localStorage.getItem("sa-cur") || "USD");
      const [owner, setOwnerState] = useState(null);
      const [state, setState] = useState("loading"); // loading | ready | error
      useEffect(() => { localStorage.setItem("sa-lang", lang); document.documentElement.lang = lang; }, [lang]);
      useEffect(() => { localStorage.setItem("sa-cur", currency); }, [currency]);

      // session: keep the user logged in across refreshes until logout or 30-day expiry
      const SESSION_KEY = "sa-session";
      const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 días
      const saveSession = (o) => {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ code: o.code, isAdmin: !!o.isAdmin, isContador: !!o.isContador, ts: Date.now() })); } catch (e) {}
      };
      const resolveOwner = (code, isAdmin, isContador) => {
        if (isContador && SpacioData.contador) return Object.assign({}, SpacioData.contador);
        if (isAdmin && SpacioData.admin) return Object.assign({}, SpacioData.admin);
        const acc = SpacioData.owners.find(x => x.code === code || (x.codes && x.codes.includes(code)));
        return acc ? Object.assign({}, acc, SpacioData.effCreds(acc)) : null;
      };
      const setOwner = (o) => {
        if (o) saveSession(o); else { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
        setOwnerState(o);
      };

      /* Las hojas de Mi son privadas: solo se leen con la sesión firmada (lector seguro del login).
         Sin sesión → primero el login; al entrar, se recarga y los datos se leen ya con la sesión.
         El inicio de sesión recordado lo hace el propio login con la sesión firmada (SASesion).
         Editado en GitHub, no en Claude Design. */
      const cargado = React.useRef(false);
      const loadData = React.useCallback(() => {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
        if (!(window.SASesion && window.SASesion.leer())) { setState("ready"); return; }
        setState("loading");
        SpacioLoad().then(() => { cargado.current = true; setState("ready"); })
          .catch((e) => { console.error("Sheet load failed", e); setState("error"); });
      }, []);
      const entrar = (o) => {
        if (!cargado.current) { setState("loading"); location.reload(); return; }   // recién inició sesión: leer los datos con la sesión
        setOwner(o);
      };
      useEffect(() => { loadData(); }, [loadData]);

      if (state !== "ready") return <Splash state={state} onRetry={loadData} lang={lang} />;
      if (!owner) return <Login lang={lang} setLang={setLang} onLogin={entrar} />;
      return <Dashboard key={owner.code} owner={owner} lang={lang} setLang={setLang} currency={currency} setCurrency={setCurrency} onLogout={() => { try { window.SASesion && window.SASesion.borrar(); } catch (e) {} setOwner(null); location.reload(); }} onUpdateOwner={setOwnerState} />;
    }

    // Si algo rompe la página en silencio (iPad), lo mostramos abajo en vez de dejarla en blanco.
    (function () {
      function show(t) { try { var el = document.getElementById("sa-crash"); if (!el) { el = document.createElement("div"); el.id = "sa-crash"; el.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#3E3F3F;color:#FAFAFA;font:12px/1.5 Montserrat,sans-serif;padding:12px 16px;border-radius:14px;box-shadow:0 12px 40px rgba(62,63,63,.2)"; el.onclick = function () { el.remove(); }; document.body.appendChild(el); } el.textContent = "Algo falló en la página: " + t + " · toca para cerrar"; } catch (e) {} }
      window.addEventListener("error", function (e) { if (e && e.message) show(e.message); });
      window.addEventListener("unhandledrejection", function (e) { var r = e && e.reason; show(r && r.message ? r.message : String(r)); });
    })();
    ReactDOM.createRoot(document.getElementById("app")).render(<App />);
