// ============================================================
// Spacio AM — Owner Dashboard · Login
// ============================================================
const Login = ({ lang, setLang, onLogin }) => {
  const t = (k) => SpacioI18n.t(lang, k);
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setErr(false); setBusy(true);
    setTimeout(() => {
      const owner = SpacioData.auth(code, pass);
      if (owner) onLogin(owner);
      else { setErr(true); setBusy(false); }
    }, 520);
  };

  const fill = (o) => { setCode(o.email || o.code); setPass(o.pass); setErr(false); };

  const field = (label, value, onChange, ph, type, extra) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <span style={{ fontFamily: "var(--sans)", fontSize: 10, fontWeight: 500, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--earth)" }}>{label}</span>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input value={value} onChange={e => { onChange(e.target.value); setErr(false); }} placeholder={ph} type={type}
          autoCapitalize="none" autoCorrect="off"
          style={{
            width: "100%", boxSizing: "border-box", fontFamily: "var(--sans)", fontSize: 15, letterSpacing: "0.04em",
            color: "var(--ink)", padding: "15px 16px", paddingRight: extra ? 46 : 16, background: "var(--alabaster)",
            border: "1px solid " + (err ? "var(--peach)" : "var(--warm-grey)"), borderRadius: 14, outline: "none",
            transition: "border-color .18s var(--ease)",
          }}
          onFocus={e => e.target.style.borderColor = "var(--ink)"}
          onBlur={e => e.target.style.borderColor = err ? "var(--peach)" : "var(--warm-grey)"} />
        {extra}
      </div>
    </label>
  );

  return (
    <div style={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: "1fr", background: "var(--alabaster)" }} className="sa-login">
      <style>{`
        @media (min-width: 880px){ .sa-login { grid-template-columns: 1.05fr 1fr !important; } .sa-login-aside{ display:flex !important; } }
      `}</style>

      {/* brand aside */}
      <aside className="sa-login-aside" style={{
        display: "none", position: "relative", overflow: "hidden", background: "var(--beige-soft)",
        flexDirection: "column", justifyContent: "space-between", padding: "56px 56px 48px",
      }}>
        <img src="brushstroke.svg" aria-hidden="true" style={{ position: "absolute", top: "18%", left: "-20%", width: "150%", opacity: 0.55, pointerEvents: "none", transform: "rotate(-4deg)" }} />
        <div style={{ position: "relative", zIndex: 2 }}><img src="logo-stamp.png" alt="Spacio AM" style={{ height: 64, width: "auto", display: "block" }} /></div>
        <div style={{ position: "relative", zIndex: 2, maxWidth: 460 }}>
          <Sparkle size={22} color="var(--peach)" />
          <p style={{ fontFamily: "var(--serif)", fontWeight: 300, fontStyle: "italic", fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 1.18, letterSpacing: "-0.01em", color: "var(--ink)", margin: "20px 0 0", textWrap: "balance" }}>
            “{t("login_quote")}”
          </p>
          <div style={{ width: 38, height: 1, background: "var(--ink)", margin: "26px 0 14px" }} />
          <Eyebrow>Spacio AM · {lang === "es" ? "Portal de propietarios" : "Owner portal"}</Eyebrow>
        </div>
        <div style={{ position: "relative", zIndex: 2, fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--earth)" }}>
          Guatemala · {t("help")}
        </div>
      </aside>

      {/* form side */}
      <main style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "40px 24px", position: "relative" }}>
        <div style={{ position: "absolute", top: 20, right: 20 }}>
          <Segmented size="sm" value={lang} onChange={setLang}
            options={[{ value: "es", label: "ES" }, { value: "en", label: "EN" }]} />
        </div>

        <div style={{ width: "100%", maxWidth: 380 }}>
          <div className="sa-login-mark" style={{ display: "flex", justifyContent: "flex-start", marginBottom: 30 }}><img src="logo-wordmark.png" alt="Spacio AM" style={{ height: 72, width: "auto", display: "block" }} /></div>
          <Eyebrow style={{ marginBottom: 14 }}>{t("login_eyebrow")}</Eyebrow>
          <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 38, letterSpacing: "-0.01em", lineHeight: 1.08, color: "var(--ink)", margin: 0 }}>{t("login_welcome")}</h1>
          <p style={{ fontFamily: "var(--sans)", fontSize: 13.5, letterSpacing: "0.04em", lineHeight: 1.7, color: "var(--earth)", margin: "12px 0 30px" }}>{t("login_sub")}</p>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {field(t("user_label"), code, setCode, t("user_ph"), "text", null)}
            {field(t("pass_label"), pass, setPass, t("pass_ph"), show ? "text" : "password",
              <button type="button" onClick={() => setShow(s => !s)} aria-label="toggle"
                style={{ position: "absolute", right: 12, border: "none", background: "transparent", cursor: "pointer", color: "var(--earth)", padding: 4, display: "flex" }}>
                <Icon name={show ? "eyeOff" : "eye"} size={18} />
              </button>)}

            {err && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.03em", color: "var(--peach)", marginTop: -4 }}>
                <Icon name="info" size={15} /> {t("login_error")}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.04em", color: "var(--earth)" }}>{t("forgot")}</span>
            </div>

            <button type="submit" disabled={busy} style={{
              marginTop: 6, width: "100%", border: "none", cursor: busy ? "default" : "pointer",
              background: "var(--ink)", color: "var(--alabaster)", borderRadius: 14, padding: "16px",
              fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 500, letterSpacing: "0.24em", textTransform: "uppercase",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              opacity: busy ? 0.7 : 1, transition: "opacity .18s var(--ease), transform .12s var(--ease)",
            }}
              onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
              onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
              {busy ? <span className="sa-spin" style={{ width: 15, height: 15, border: "2px solid rgba(250,250,250,0.35)", borderTopColor: "var(--alabaster)", borderRadius: "50%" }} /> : <><Icon name="lock" size={15} stroke="var(--alabaster)" />{t("enter")}</>}
            </button>
          </form>

          {/* default-password note */}
          <div style={{ marginTop: 30, paddingTop: 22, borderTop: "1px solid var(--warm-grey)", display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", background: "var(--peach-12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="key" size={15} stroke="var(--peach)" />
            </span>
            <p style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.03em", lineHeight: 1.65, color: "var(--earth)", margin: 0, textWrap: "pretty" }}>
              {lang === "es"
                ? <React.Fragment>Tu contraseña por defecto es <strong style={{ color: "var(--ink)", fontWeight: 600 }}>spacioam</strong>. Una vez dentro, puedes cambiarla en <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Mi cuenta</strong>.</React.Fragment>
                : <React.Fragment>Your default password is <strong style={{ color: "var(--ink)", fontWeight: 600 }}>spacioam</strong>. Once inside, you can change it under <strong style={{ color: "var(--ink)", fontWeight: 600 }}>My account</strong>.</React.Fragment>}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

Object.assign(window, { Login });
