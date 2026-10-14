// ============================================================
// Spacio AM — Setup · Control de notificaciones (solo admin)
// Toggle por tipo de aviso + filtro por propiedad(es) cuando está activo.
// Guarda en este dispositivo (window.SpacioNotiPrefs, en noti-data.js).
// ============================================================
const NP_CATS = [
  { key: "deposito", icon: "coins", es: "Constancias de depósito", en: "Deposit receipts",
    subEs: "Depósitos a socios pendientes · límite 5º día hábil", subEn: "Pending owner deposits · due 5th business day", byProp: true },
  { key: "retencion", icon: "file", es: "Constancias de retención", en: "Withholding certificates",
    subEs: "Constancias faltantes · límite día 10", subEn: "Missing certificates · due the 10th", byProp: true },
  { key: "contabilidad", icon: "bank", es: "Contabilidad", en: "Accounting",
    subEs: "Archivos del mes · límite día 10 · aplica a toda la empresa", subEn: "Monthly files · due the 10th · company-wide", byProp: false },
];

const NpSwitch = ({ on, onClick, label }) => (
  <button type="button" role="switch" aria-checked={!!on} aria-label={label} onClick={onClick}
    style={{ width: 40, height: 24, borderRadius: 999, border: "1px solid " + (on ? "var(--peach)" : "var(--warm-grey)"), background: on ? "var(--peach-12, rgba(233,130,106,.12))" : "var(--alabaster)", position: "relative", cursor: "pointer", padding: 0, flexShrink: 0, transition: "all .18s var(--ease)" }}>
    <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: on ? "var(--ink)" : "var(--warm-grey)", transition: "left .18s var(--ease)" }} />
  </button>
);

const NotiPrefsCard = ({ lang }) => {
  const es = lang !== "en";
  const tr = (a, b) => (es ? a : b);
  const store = window.SpacioNotiPrefs;
  const [prefs, setPrefs] = React.useState(() => store ? store.get() : null);
  React.useEffect(() => {
    const h = () => store && setPrefs(store.get());
    window.addEventListener("sam-notiprefs", h); return () => window.removeEventListener("sam-notiprefs", h);
  }, []);
  if (!store || !prefs) return null;
  const update = (key, patch) => { const next = Object.assign({}, prefs, { [key]: Object.assign({}, prefs[key], patch) }); setPrefs(next); store.set(next); };
  const propOpts = [{ value: "all", label: tr("Todas las propiedades", "All properties") }]
    .concat((SpacioData.propertyList || []).map(p => ({ value: p.id, label: p.name })));
  const nameOf = (id) => { const p = (SpacioData.propertyList || []).find(x => x.id === id); return p ? p.name : id; };
  const DS = window.SpacioAMDesignSystem_2c08fe;
  const activeCount = NP_CATS.filter(c => prefs[c.key] && prefs[c.key].on).length;

  return (
    <Card pad={20} soft style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <Icon name="alert" size={16} stroke="var(--ink)" />
        <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink)" }}>{tr("Notificaciones", "Notifications")}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{activeCount + tr(" de ", " of ") + NP_CATS.length + tr(" activas", " on")}</span>
      </div>
      <p style={{ margin: "0 0 10px", fontFamily: "var(--sans)", fontSize: 12, lineHeight: 1.7, letterSpacing: "0.03em", color: "var(--fg-muted)", textWrap: "pretty" }}>
        {tr("Elige qué avisos llegan a la campana. Con un aviso activo puedes limitarlo a una o varias propiedades.", "Choose which alerts reach the bell. With an alert on, you can limit it to one or more properties.")}
      </p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {NP_CATS.map(c => {
          const st = prefs[c.key] || { on: true, props: [] };
          const sel = st.props || [];
          return (
            <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 0", borderTop: "1px solid var(--ink-08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: "var(--alabaster)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={c.icon} size={16} stroke={st.on ? "var(--ink)" : "var(--warm-grey)"} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.02em", color: st.on ? "var(--ink)" : "var(--fg-muted)" }}>{tr(c.es, c.en)}</span>
                  <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.03em", color: "var(--fg-muted)", marginTop: 2 }}>{st.on ? tr(c.subEs, c.subEn) : tr("Apagado · no llegan avisos de este tipo", "Off · no alerts of this type")}</span>
                </span>
                <NpSwitch on={st.on} onClick={() => update(c.key, { on: !st.on })} label={tr(c.es, c.en)} />
              </div>
              {st.on && c.byProp && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingLeft: 46 }}>
                  <Select multi searchable value={sel} onChange={(v) => update(c.key, { props: v })} icon="home" minWidth={220} options={propOpts} placeholder={tr("Todas las propiedades", "All properties")} />
                  {sel.length > 0 && (
                    <React.Fragment>
                      <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.03em", color: "var(--fg-muted)", flex: 1, minWidth: 160 }}>
                        {tr("Solo avisos de ", "Only alerts for ") + sel.slice(0, 3).map(nameOf).join(", ") + (sel.length > 3 ? tr(" y " + (sel.length - 3) + " más", " and " + (sel.length - 3) + " more") : "")}
                      </span>
                      <button type="button" className="sa-chip-btn sa-chip-btn-ghost" style={{ padding: "7px 12px", fontSize: 10 }} onClick={() => update(c.key, { props: [] })}>{tr("Quitar filtro", "Clear filter")}</button>
                    </React.Fragment>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ margin: "4px 0 0", paddingTop: 12, borderTop: "1px solid var(--ink-08)", fontFamily: "var(--sans)", fontSize: 11, lineHeight: 1.6, letterSpacing: "0.03em", color: "var(--fg-muted)", display: "flex", gap: 8 }}>
        <Icon name="info" size={13} stroke="var(--fg-muted)" style={{ flexShrink: 0, marginTop: 2 }} />
        {tr("Se guarda en este dispositivo y se aplica al instante en la campana.", "Saved on this device and applied to the bell right away.")}
      </p>
    </Card>
  );
};

Object.assign(window, { NotiPrefsCard });
