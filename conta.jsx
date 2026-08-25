// ============================================================
// Spacio AM — Contabilidad
// ------------------------------------------------------------
// • Admin: sube los PDF de las 4 cuentas de Banco Industrial,
//   el sistema autoclasifica (memo → Tag + Categoría) y resalta
//   lo pendiente para revisión.
// • Contador: ve y descarga (Excel / CSV / PDF) y baja los PDF
//   originales. Filtra por mes y por cuenta.
// Reutiliza Icon, Eyebrow, SectionHead, Select, Segmented (ui.jsx)
// y los globales React (useState/useEffect/useMemo/useRef).
// ============================================================

const CONTA_MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function contaMonthLabel(ym) {
  const [y, m] = String(ym || "").split("-"); const mi = parseInt(m, 10) - 1;
  return (CONTA_MONTHS_ES[mi] || m) + " " + y;
}
function contaMoney(n, cur) {
  const sym = cur === "USD" ? "$" : "Q";
  return sym + (n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function contaBIDate(iso) { const p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : iso; }

// ---------- selector de Tag (solo admin) ----------
function TagPicker({ value, onPick, lang }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const C = window.SpacioConta;
  const groups = C.TAGS_BY_CATEGORY;
  const cats = Object.keys(groups);
  const ql = q.trim().toLowerCase();
  const pending = !value;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} title={value || ""} style={{
        display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 230, cursor: "pointer",
        border: "1px solid " + (pending ? "var(--peach)" : "var(--ink-08)"),
        background: pending ? "var(--peach-12)" : "var(--alabaster)",
        color: pending ? "var(--peach)" : "var(--ink)", borderRadius: 9, padding: "6px 10px",
        fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.02em", textAlign: "left",
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || (lang === "es" ? "Sin clasificar" : "Unclassified")}
        </span>
        <Icon name="chevronDown" size={13} stroke="currentColor" style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 70, width: 290, maxHeight: 360, overflow: "auto",
          background: "var(--alabaster)", border: "1px solid var(--ink-08)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", marginBottom: 4, borderBottom: "1px solid var(--warm-grey)" }}>
            <Icon name="search" size={14} stroke="var(--fg-muted)" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={lang === "es" ? "Buscar tag…" : "Search tag…"}
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--sans)", fontSize: 12.5, width: "100%", color: "var(--ink)" }} />
          </div>
          {value && (
            <button onClick={() => { onPick(""); setOpen(false); }} style={pickItemStyle("var(--peach)")}>
              <Icon name="x" size={13} stroke="var(--peach)" />{lang === "es" ? "Quitar clasificación" : "Clear"}
            </button>
          )}
          {cats.map(cat => {
            const tags = groups[cat].filter(tg => !ql || tg.toLowerCase().indexOf(ql) > -1 || cat.toLowerCase().indexOf(ql) > -1);
            if (!tags.length) return null;
            return (
              <div key={cat} style={{ marginTop: 6 }}>
                <div style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", padding: "4px 8px" }}>{cat}</div>
                {tags.map(tg => (
                  <button key={tg} onClick={() => { onPick(tg); setOpen(false); }} style={pickItemStyle(tg === value ? "var(--peach)" : "var(--ink)")}>
                    {tg === value && <Icon name="check" size={13} stroke="var(--peach)" />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tg}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
  function pickItemStyle(color) {
    return { display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "transparent", cursor: "pointer",
      padding: "8px", borderRadius: 8, fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.01em", color, textAlign: "left" };
  }
}

// ---------- panel de carga (solo admin) ----------
function ContaUpload({ ym, onSaved, lang, t }) {
  const [parsing, setParsing] = useState(false);
  const [previews, setPreviews] = useState([]); // {accId, accName, currency, number, rows, file, warnings, totals, unknownNumber}
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const C = window.SpacioConta;
  const tr = (es, en) => (lang === "es" ? es : en);

  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []); if (!files.length) return;
    setParsing(true); setMsg("");
    const next = previews.slice();
    for (const file of files) {
      try {
        const parsed = await window.SpacioContaParse.parseFile(file);
        const acc = C.accByNumber[parsed.accountNumber];
        const rows = (parsed.rows || []).map(r => {
          const cls = C.classify(r.desc, { accId: acc ? acc.id : "" });
          return Object.assign({}, r, { tag: cls.tag, category: cls.category, source: cls.source, reviewed: false });
        });
        next.push({
          accId: acc ? acc.id : "", accName: acc ? acc.name : (tr("Cuenta no reconocida", "Unknown account")),
          number: parsed.accountNumber, currency: acc ? acc.currency : (parsed.currency || "GTQ"),
          ym: parsed.ym || ym, rows, file, warnings: parsed.warnings, totals: parsed.totals, unknownNumber: !acc,
        });
      } catch (e) {
        next.push({ accId: "", accName: file.name, error: e.message, rows: [], file });
      }
    }
    setPreviews(next); setParsing(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const setPreviewAcc = (i, accId) => {
    setPreviews(ps => ps.map((p, j) => {
      if (j !== i) return p; const acc = C.accountById(accId);
      return Object.assign({}, p, { accId, accName: acc ? acc.name : p.accName, currency: acc ? acc.currency : p.currency, unknownNumber: false });
    }));
  };
  const removePreview = (i) => setPreviews(ps => ps.filter((_, j) => j !== i));

  const saveAll = async () => {
    const ready = previews.filter(p => p.accId && p.rows.length);
    if (!ready.length) { setMsg(tr("Asigna una cuenta a cada estado antes de guardar.", "Assign an account to each statement first.")); return; }
    setBusy(true);
    for (const p of ready) {
      const stmt = { ym: p.ym || ym, accId: p.accId, currency: p.currency, rows: p.rows, totals: p.totals, pdf: { name: p.file.name, url: "" } };
      // subir el PDF original a Drive (best-effort)
      try {
        if (window.SpacioFiles && window.SpacioFiles.upload) {
          const up = await window.SpacioFiles.upload({ kind: "estado-cuenta", scope: "conta", property_name: "", ym: stmt.ym, account: p.accId, file: p.file, multiple: true });
          if (up && up.url) stmt.pdf.url = up.url;
        }
      } catch (e) {}
      window.SpacioContaStore.saveStatement(stmt);
    }
    setBusy(false); setPreviews([]);
    setMsg(tr(ready.length + " estado(s) guardado(s) y clasificado(s).", ready.length + " statement(s) saved and classified."));
    onSaved && onSaved();
  };

  return (
    <div style={{ border: "1px solid var(--ink-08)", borderRadius: 20, padding: "22px 24px", marginBottom: 26, background: "var(--alabaster)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Icon name="upload" size={17} stroke="var(--fg-muted)" />
        <h3 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 18, margin: 0, color: "var(--ink)" }}>{tr("Subir estados de cuenta", "Upload statements")}</h3>
      </div>
      <p style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.03em", lineHeight: 1.6, color: "var(--fg-muted)", margin: "0 0 16px", maxWidth: 560 }}>
        {tr("Arrastra los PDF de las 4 cuentas de Banco Industrial. El sistema reconoce la cuenta y el mes, clasifica automáticamente cada movimiento y marca los pendientes.",
            "Drop the 4 Banco Industrial PDFs. The system detects account and month, auto-classifies each line and flags what needs review.")}
      </p>

      <label className="sa-file-btn dark" style={{ cursor: "pointer" }}>
        <Icon name="upload" size={15} stroke="currentColor" />{parsing ? tr("Leyendo PDF…", "Reading PDF…") : tr("Seleccionar PDF", "Select PDFs")}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple style={{ display: "none" }} disabled={parsing}
          onChange={e => onFiles(e.target.files)} />
      </label>

      {previews.length > 0 && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {previews.map((p, i) => {
            const pend = p.rows.filter(r => !r.tag).length;
            const auto = p.rows.length - pend;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "var(--beige-soft)", borderRadius: 14, padding: "12px 16px" }}>
                <Icon name="file" size={18} stroke="var(--fg-muted)" />
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "0.02em" }}>
                    {p.error ? p.file.name : p.accName + (p.number ? " · " + p.number : "")}
                  </div>
                  <div style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.03em", marginTop: 2 }}>
                    {p.error ? <span style={{ color: "var(--attention-text)" }}>{p.error}</span>
                      : (contaMonthLabel(p.ym) + " · " + p.rows.length + " " + tr("movimientos", "lines") + " · " + auto + " " + tr("auto", "auto") + (pend ? " · " + pend + " " + tr("pendientes", "pending") : ""))}
                  </div>
                </div>
                {p.unknownNumber && !p.error && (
                  <select value={p.accId} onChange={e => setPreviewAcc(i, e.target.value)}
                    style={{ fontFamily: "var(--sans)", fontSize: 12, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--peach)", background: "var(--alabaster)", color: "var(--ink)" }}>
                    <option value="">{tr("Elegir cuenta…", "Pick account…")}</option>
                    {C.ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name} · {a.number}</option>)}
                  </select>
                )}
                <button onClick={() => removePreview(i)} title={tr("Quitar", "Remove")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)" }}>
                  <Icon name="trash" size={15} stroke="currentColor" />
                </button>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <button className="sa-file-btn dark" onClick={saveAll} disabled={busy}>
              {busy ? <span className="sa-spin" style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.5)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} /> : <Icon name="check" size={15} stroke="currentColor" />}
              {tr("Guardar y clasificar", "Save & classify")}
            </button>
            <button className="sa-file-btn ghost" onClick={() => setPreviews([])} disabled={busy}>{tr("Cancelar", "Cancel")}</button>
          </div>
        </div>
      )}
      {msg && <p style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.03em", color: "var(--fg-muted)", margin: "14px 0 0", display: "flex", alignItems: "center", gap: 7 }}><Icon name="info" size={14} stroke="var(--fg-muted)" />{msg}</p>}
    </div>
  );
}

// ---------- tabla de movimientos ----------
function ContaLedger({ statements, isAdmin, q, status, lang, onEditTag, onDeleteStatement, filesTick, onViewFactura }) {
  const tr = (es, en) => (lang === "es" ? es : en);
  const ql = (q || "").trim().toLowerCase();
  const filtered = statements.map(s => {
    const rows = s.rows.map((r, idx) => Object.assign({ _idx: idx }, r)).filter(r => {
      if (status === "pending" && r.tag) return false;
      if (ql) { const hay = [r.desc, r.tag, r.category, r.doc, contaBIDate(r.date)].join(" ").toLowerCase(); if (hay.indexOf(ql) < 0) return false; }
      return true;
    });
    return Object.assign({}, s, { _rows: rows });
  }).filter(s => s._rows.length || status !== "pending");

  if (!filtered.some(s => s._rows.length)) {
    return <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--fg-muted)", letterSpacing: "0.04em", padding: "30px 0" }}>
      {status === "pending" ? tr("No hay movimientos pendientes. Todo está clasificado.", "Nothing pending — all classified.") : tr("No hay movimientos para este filtro.", "No lines for this filter.")}
    </p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {filtered.map(s => {
        if (!s._rows.length) return null;
        const acc = window.SpacioConta.accountById(s.accId) || {};
        const td = s.rows.reduce((a, r) => a + (r.debit || 0), 0);
        const tc = s.rows.reduce((a, r) => a + (r.credit || 0), 0);
        const pend = s.rows.filter(r => !r.tag).length;
        const pdfRec = findPdf(s, filesTick);
        return (
          <div key={s.accId} style={{ border: "1px solid var(--ink-08)", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "15px 20px", background: "var(--beige-soft)", borderBottom: "1px solid var(--ink-08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--peach)" }} />
                <div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--ink)" }}>{acc.name || s.accId}</div>
                  <div style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-muted)", marginTop: 2 }}>{acc.number} · {s.currency}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                {pend > 0 && <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--attention-text)", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="alert" size={13} stroke="var(--peach)" />{pend} {tr("pendientes", "pending")}</span>}
                <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--fg-muted)", letterSpacing: "0.03em" }}>{tr("Debe", "Debit")} <strong style={{ color: "var(--ink)" }}>{contaMoney(td, s.currency)}</strong></span>
                <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--fg-muted)", letterSpacing: "0.03em" }}>{tr("Haber", "Credit")} <strong style={{ color: "var(--ink)" }}>{contaMoney(tc, s.currency)}</strong></span>
                {pdfRec && pdfRec.url && <a className="sa-file-btn ghost" href={pdfRec.url} target="_blank" rel="noopener noreferrer" style={{ padding: "7px 12px", fontSize: 11 }}><Icon name="download" size={13} stroke="currentColor" />PDF</a>}
                {isAdmin && <button onClick={() => { if (window.confirm(tr("¿Quitar el estado de ", "Remove the ") + (acc.name || s.accId) + tr(" de este mes? Esto borra sus movimientos clasificados.", " statement for this month? This deletes its classified lines."))) onDeleteStatement(s.accId); }}
                  title={tr("Quitar este estado", "Remove this statement")} style={{ border: "1px solid var(--ink-08)", background: "var(--alabaster)", cursor: "pointer", borderRadius: 9, padding: "7px 9px", color: "var(--fg-muted)", display: "inline-flex" }}>
                  <Icon name="trash" size={14} stroke="currentColor" />
                </button>}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="conta-table">
                <thead>
                  <tr>
                    <th>{tr("Fecha", "Date")}</th><th>{tr("Doc", "Doc")}</th><th style={{ minWidth: 220 }}>{tr("Descripción", "Description")}</th>
                    <th className="num">{tr("Debe", "Debit")}</th><th className="num">{tr("Haber", "Credit")}</th><th className="num">{tr("Saldo", "Balance")}</th>
                    <th style={{ minWidth: 180 }}>{tr("Tag", "Tag")}</th><th>{tr("Categoría", "Category")}</th><th>{tr("Factura", "Invoice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s._rows.map(r => (
                    <tr key={r._idx} className={!r.tag ? "pend" : ""}>
                      <td style={{ whiteSpace: "nowrap" }}>{contaBIDate(r.date)}</td>
                      <td style={{ color: "var(--fg-muted)" }}>{r.doc}</td>
                      <td>{r.desc}{r.amountCheck && <span title={tr("Verifica el monto", "Check amount")} style={{ color: "var(--attention-text)", marginLeft: 5 }}>⚠</span>}</td>
                      <td className="num">{r.debit ? contaMoney(r.debit, s.currency) : ""}</td>
                      <td className="num">{r.credit ? contaMoney(r.credit, s.currency) : ""}</td>
                      <td className="num" style={{ color: "var(--fg-muted)" }}>{contaMoney(r.saldo, s.currency)}</td>
                      <td>{isAdmin
                        ? <TagPicker value={r.tag} lang={lang} onPick={(tag) => onEditTag(s.accId, r._idx, tag)} />
                        : <span style={{ color: r.tag ? "var(--ink)" : "var(--peach)", fontSize: 12 }}>{r.tag || tr("Sin clasificar", "Unclassified")}</span>}
                      </td>
                      <td style={{ color: "var(--fg-muted)", fontSize: 11.5 }}>{r.category}</td>
                      <td>{r.factura ? (
                        <button onClick={() => onViewFactura && onViewFactura(r.factura)} title={r.factura} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--ink-08)", background: "var(--alabaster)", cursor: "pointer", borderRadius: 9, padding: "5px 10px", fontFamily: "var(--sans)", fontSize: 11, color: "var(--ink)", whiteSpace: "nowrap" }}>
                          <Icon name="eye" size={13} stroke="currentColor" />{tr("Ver", "View")}
                        </button>
                      ) : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );

  function findPdf(s, tick) {
    if (s.pdf && s.pdf.url) return s.pdf;
    try {
      const recs = window.SpacioFiles ? window.SpacioFiles.records() : [];
      const rec = recs.find(f => f.tipo === "estado-cuenta" && f.account === s.accId && f.ym === s.ym && f.url);
      if (rec) return rec;
    } catch (e) {}
    try { if (window.SpacioContaPdfs) return window.SpacioContaPdfs.get(s.ym, s.accId); } catch (e) {}
    return null;
  }
}

// ---------- sección principal ----------
function ContabilidadSection({ owner, isAdmin, isContador, lang, t, currency, fmt, allProps }) {
  const tr = (es, en) => (lang === "es" ? es : en);
  const [tick, setTick] = useState(0);
  const reload = () => setTick(x => x + 1);
  const [subtab, setSubtab] = useState("estados");
  const [liveBusy, setLiveBusy] = useState(false);
  // trae la clasificación en vivo de los meses 2026 (Google Sheets en Drive)
  useEffect(() => {
    if (!window.SpacioContaLive) return;
    setLiveBusy(true);
    window.SpacioContaLive.load(() => { setTick(x => x + 1); }).then(() => setLiveBusy(false)).catch(() => setLiveBusy(false));
  }, []);
  const months = useMemo(() => {
    const set = {};
    window.SpacioContaStore.listMonths().forEach(m => set[m] = 1);
    (window.SpacioContaPdfs ? window.SpacioContaPdfs.months() : []).forEach(m => set[m] = 1);
    (window.SpacioContaArchive ? window.SpacioContaArchive.months() : []).forEach(m => set[m] = 1);
    ["2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"].forEach(m => set[m] = 1);
    return Object.keys(set).sort().reverse();
  }, [tick]);
  const monthsWithData = useMemo(() => window.SpacioContaStore.listMonths(), [tick]);
  const [ym, setYm] = useState(monthsWithData[0] || "2026-04");
  const [accFilter, setAccFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [facturaBox, setFacturaBox] = useState(null);
  const onViewFactura = (auth) => {
    const inv = window.pyaSatInvoiceByAuth ? window.pyaSatInvoiceByAuth(auth) : null;
    if (inv) setFacturaBox(inv);
    else window.alert(tr("La factura " + auth + " no está en el ZIP cargado. Súbelo de nuevo en Gastos e inversiones → Facturas SAT para poder verla.", "Invoice " + auth + " is not in the loaded ZIP."));
  };
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (dlRef.current && !dlRef.current.contains(e.target)) setDlOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const allStatements = useMemo(() => window.SpacioContaStore.statementsForMonth(ym), [ym, tick]);
  const statements = useMemo(() => allStatements.filter(s => accFilter === "all" || s.accId === accFilter), [allStatements, accFilter]);

  const onEditTag = (accId, idx, tag) => {
    const stmt = window.SpacioContaStore.getStatement(ym, accId); if (!stmt) return;
    const row = stmt.rows[idx]; if (!row) return;
    row.tag = tag; row.category = window.SpacioConta.categoryForTag(tag); row.source = tag ? "manual" : null; row.reviewed = !!tag;
    window.SpacioContaStore.saveStatement(stmt);
    reload();
  };
  const onDeleteStatement = (accId) => { window.SpacioContaStore.deleteStatement(ym, accId); reload(); };

  // resumen
  const allRows = statements.reduce((a, s) => a.concat(s.rows), []);
  const pendCount = allRows.filter(r => !r.tag).length;
  const hasData = allStatements.length > 0;

  // descargas
  const exportStatements = () => statements.map(s => {
    const acc = window.SpacioConta.accountById(s.accId) || {};
    return { accId: s.accId, accName: acc.name, number: acc.number, currency: s.currency, rows: s.rows };
  });
  const doXLSX = () => { window.SpacioContaExport.toXLSX(exportStatements(), "Contabilidad " + contaMonthLabel(ym) + ".xlsx"); setDlOpen(false); };
  const doCSV = () => {
    const rows = exportStatements().reduce((a, s) => a.concat(s.rows.map(r => Object.assign({}, r, { _acc: s.accName }))), []);
    window.SpacioContaExport.toCSV(rows, "Contabilidad " + contaMonthLabel(ym) + ".csv"); setDlOpen(false);
  };
  const doPDF = () => {
    window.SpacioContaExport.printReport({ title: "Contabilidad — " + contaMonthLabel(ym), period: contaMonthLabel(ym) }, exportStatements()); setDlOpen(false);
  };

  const monthOpts = months.map(m => ({ value: m, label: contaMonthLabel(m) }));
  const accChips = [{ value: "all", label: tr("Todas", "All") }].concat(window.SpacioConta.ACCOUNTS.map(a => ({ value: a.id, label: a.name })));

  return (
    <div className="sa-section" style={{ marginTop: 28 }}>
      {isAdmin && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[{ id: "estados", label: tr("Estados de cuenta", "Bank statements") }, { id: "pl", label: tr("Resumen contable", "Accounting summary") }].map(s => (
            <button key={s.id} onClick={() => setSubtab(s.id)} style={{
              border: "1px solid " + (subtab === s.id ? "var(--ink)" : "var(--warm-grey)"), cursor: "pointer",
              background: subtab === s.id ? "var(--ink)" : "transparent", color: subtab === s.id ? "var(--alabaster)" : "var(--fg-muted)",
              borderRadius: 999, padding: "9px 18px", fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", transition: "all .18s var(--ease)",
            }}>{s.label}</button>
          ))}
        </div>
      )}
      {isAdmin && subtab === "pl" ? (
        typeof ContaPLSection !== "undefined"
          ? <ContaPLSection lang={lang} t={t} currency={currency} fmt={fmt} allProps={allProps || []} />
          : null
      ) : (
      <React.Fragment>
      <SectionHead
        eyebrow={tr("Contabilidad", "Accounting")}
        title={tr("Estados de cuenta", "Bank statements")}
        sub={isContador
          ? tr("Movimientos clasificados de las 4 cuentas. Filtra por mes y cuenta, y descarga en Excel, CSV o PDF.", "Classified lines for the 4 accounts. Filter by month and account, download to Excel, CSV or PDF.")
          : tr("Sube los PDF del banco; el sistema clasifica y tú revisas lo pendiente.", "Upload the bank PDFs; the system classifies and you review what's pending.")}
        right={
          <div ref={dlRef} style={{ position: "relative" }}>
            <button className="sa-file-btn ghost" onClick={() => setDlOpen(o => !o)} disabled={!hasData}>
              <Icon name="download" size={15} stroke="currentColor" />{tr("Descargar", "Download")}<Icon name="chevronDown" size={13} stroke="currentColor" />
            </button>
            {dlOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 70, minWidth: 220, background: "var(--alabaster)", border: "1px solid var(--ink-08)", borderRadius: 14, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
                <button className="conta-dl-item" onClick={doXLSX}><Icon name="grid" size={15} stroke="var(--fg-muted)" />{tr("Excel (.xlsx) con clasificación", "Excel (.xlsx)")}</button>
                <button className="conta-dl-item" onClick={doCSV}><Icon name="file" size={15} stroke="var(--fg-muted)" />{tr("CSV con clasificación", "CSV")}</button>
                <button className="conta-dl-item" onClick={doPDF}><Icon name="file" size={15} stroke="var(--fg-muted)" />{tr("PDF imprimible del reporte", "Printable PDF")}</button>
              </div>
            )}
          </div>
        }
      />

      {/* filtros */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <Select value={ym} options={monthOpts} onChange={setYm} icon="calendar" minWidth={170} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {accChips.map(c => (
            <button key={c.value} onClick={() => setAccFilter(c.value)} style={{
              border: "1px solid " + (accFilter === c.value ? "var(--ink)" : "var(--warm-grey)"), cursor: "pointer",
              background: accFilter === c.value ? "var(--ink)" : "transparent", color: accFilter === c.value ? "var(--alabaster)" : "var(--fg-muted)",
              borderRadius: 999, padding: "7px 14px", fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.06em", transition: "all .18s var(--ease)",
            }}>{c.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          {isAdmin && <Segmented size="sm" value={status} onChange={setStatus} options={[{ value: "all", label: tr("Todos", "All") }, { value: "pending", label: tr("Pendientes", "Pending") }]} />}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--warm-grey)", borderRadius: 999, padding: "8px 14px", background: "var(--alabaster)" }}>
            <Icon name="search" size={14} stroke="var(--fg-muted)" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr("Buscar…", "Search…")}
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--sans)", fontSize: 12.5, width: 130, color: "var(--ink)" }} />
          </div>
        </div>
      </div>

      {isAdmin && <ContaUpload ym={ym} onSaved={reload} lang={lang} t={t} />}

      {isAdmin && hasData && pendCount > 0 && (
        <div className="sa-overdue lvl2" style={{ marginBottom: 20 }}>
          <Icon name="alert" size={18} stroke="var(--peach)" />
          <span><strong>{pendCount}</strong> {tr("movimiento(s) sin clasificar este mes.", "line(s) unclassified this month.")} {tr("Filtra por “Pendientes” y asígnales un tag.", "Filter by “Pending” and tag them.")}</span>
        </div>
      )}

      {!hasData ? (
        <div style={{ textAlign: "center", padding: "48px 24px", border: "1px dashed var(--warm-grey)", borderRadius: 20 }}>
          {liveBusy ? (
            <React.Fragment>
              <span className="sa-spin" style={{ width: 22, height: 22, border: "2px solid var(--warm-grey)", borderTopColor: "var(--ink)", borderRadius: "50%", display: "inline-block", margin: "0 auto 14px" }} />
              <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--fg-muted)", letterSpacing: "0.04em", margin: 0 }}>{tr("Cargando clasificación del mes…", "Loading this month's classification…")}</p>
            </React.Fragment>
          ) : (
          <React.Fragment>
          <Icon name="file" size={26} stroke="var(--fg-muted)" style={{ margin: "0 auto 14px" }} />
          <p style={{ fontFamily: "var(--serif)", fontSize: 19, color: "var(--ink)", margin: "0 0 6px" }}>{tr("Aún no hay clasificación para ", "Not classified yet — ") + contaMonthLabel(ym)}</p>
          {(() => {
            const pdfs = window.SpacioContaPdfs ? window.SpacioConta.ACCOUNTS.map(a => ({ a, p: window.SpacioContaPdfs.get(ym, a.id) })).filter(x => x.p) : [];
            const arch = window.SpacioContaArchive ? window.SpacioContaArchive.folders(ym) : [];
            const hasLinks = pdfs.length || arch.length;
            return (
              <React.Fragment>
                <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fg-muted)", letterSpacing: "0.03em", margin: "0 0 18px" }}>
                  {hasLinks
                    ? tr("Descarga los estados de cuenta originales del banco para este mes:", "Download this month's original bank statements:")
                    : (isAdmin ? tr("Sube los PDF del banco arriba.", "Upload the bank PDFs above.") : tr("El administrador aún no ha cargado este mes.", "The admin hasn't uploaded this month yet."))}
                </p>
                {pdfs.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", margin: "0 0 22px" }}>
                    {pdfs.map(({ a, p }) => (
                      <a key={a.id} className="sa-file-btn ghost" href={p.url} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 13px", fontSize: 11 }}>
                        <Icon name="download" size={13} stroke="currentColor" />{a.name}
                      </a>
                    ))}
                  </div>
                )}
                {pdfs.length === 0 && arch.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", margin: "0 0 22px" }}>
                    {arch.map((f, i) => (
                      <a key={i} className="sa-file-btn ghost" href={f.url} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 13px", fontSize: 11 }}>
                        <Icon name="download" size={13} stroke="currentColor" />{f.label}
                      </a>
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          })()}
          </React.Fragment>
          )}
        </div>
      ) : (
        <ContaLedger statements={statements} isAdmin={isAdmin} q={q} status={status} lang={lang} onEditTag={onEditTag} onDeleteStatement={onDeleteStatement} filesTick={tick} onViewFactura={onViewFactura} />
      )}
      {facturaBox && window.PyaDteBox && <window.PyaDteBox inv={facturaBox} lang={lang} onClose={() => setFacturaBox(null)} />}
      </React.Fragment>
      )}
    </div>
  );
}
