// ============================================================
// Spacio AM — Owner Dashboard · UI primitives
// Editorial, warm, minimal. Valky headings + Montserrat. Peach = accent only.
// ============================================================
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---- Sparkle sigil ----
const Sparkle = ({ size = 14, color = "var(--ink)", style = {} }) => (
  <svg viewBox="0 0 100 100" fill={color} width={size} height={size} style={{ display: "inline-block", verticalAlign: "middle", ...style }} aria-hidden="true">
    <path d="M50 4 C 52 32, 58 42, 96 50 C 58 58, 52 68, 50 96 C 48 68, 42 58, 4 50 C 42 42, 48 32, 50 4 Z" />
  </svg>
);

// ---- Wordmark ----
const Wordmark = ({ size = 17, color = "var(--ink)" }) => (
  <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, color, lineHeight: 1 }}>
    <Sparkle size={size * 0.46} color={color} style={{ marginBottom: 3 }} />
    <span style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: size, letterSpacing: "0.06em" }}>SPACIO</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--serif)", fontSize: size * 0.3, letterSpacing: "0.16em", marginTop: 1 }}>
      <span>A</span><span style={{ width: size * 1.4, height: 1, background: color }} /><span>M</span>
    </span>
  </span>
);

// ---- Lucide-style line icons (stroke 1.25, editorial weight) ----
const ICONS = {
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUpRight: "M7 17L17 7M8 7h9v9",
  calendar: "M8 2v4M16 2v4M3.5 9h17M5 5h14a1.5 1.5 0 011.5 1.5v12A1.5 1.5 0 0119 20H5a1.5 1.5 0 01-1.5-1.5v-12A1.5 1.5 0 015 5z",
  copy: "M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  alert: "M12 3.2L2.4 19.6a1 1 0 00.87 1.5h17.46a1 1 0 00.87-1.5L12 3.2zM12 9v5M12 17.2v.05",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0",
  logout: "M9 21H5a1.5 1.5 0 01-1.5-1.5v-15A1.5 1.5 0 015 3h4M16 17l5-5-5-5M21 12H9",
  home: "M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5",
  info: "M12 16v-5M12 8h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  x: "M6 6l12 12M18 6L6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  trendUp: "M3 17l6-6 4 4 8-8M15 7h6v6",
  trendDown: "M3 7l6 6 4-4 8 8M15 17h6v-6",
  sparkles: "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  moon: "M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z",
  key: "M15 7a4 4 0 11-3.9 5H7v2H5v2H2v-3l5.1-5.1A4 4 0 1115 7zM16 7h.01",
  lock: "M7 11V8a5 5 0 0110 0v3M5.5 11h13a1 1 0 011 1v8a1 1 0 01-1 1h-13a1 1 0 01-1-1v-8a1 1 0 011-1z",
  pin: "M12 21s7-6.4 7-11a7 7 0 10-14 0c0 4.6 7 11 7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  bed: "M3 18v-7m0 0a2 2 0 012-2h11a3 3 0 013 3v6M3 11h18M3 18h18M6.5 9V8a1 1 0 011-1h2a1 1 0 011 1v1",
  guests: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 11a3.5 3.5 0 000-7M17 14.5a6.5 6.5 0 014.5 5.5",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  star: "M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6L12 16.8 6.6 19.6l1.2-6L3.3 9.4l6.1-.8L12 3z",
  link: "M9 15l6-6M10 6l1-1a4 4 0 015.7 5.7l-1 1M14 18l-1 1A4 4 0 017.3 13.3l1-1",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  eyeOff: "M3 3l18 18M10.6 10.7a3 3 0 004.2 4.2M9.4 5.7A9.5 9.5 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-2.6 3.3M6.2 6.3A16 16 0 002.5 12S6 18.5 12 18.5a9 9 0 003.6-.7",
  check: "M5 12.5l4.5 4.5L19 7",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3.5 12h17M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z",
  coins: "M9 8.5a4.5 2.5 0 109 0 4.5 2.5 0 10-9 0zM4.5 15.5a4.5 2.5 0 109 0M4.5 11.5a4.5 2.5 0 109 0M4.5 11.5v8c0 1.4 2 2.5 4.5 2.5s4.5-1.1 4.5-2.5M18 8.5v8",
  wrench: "M14.5 6.5a3.5 3.5 0 01-4.6 4.6L5 16l3 3 4.9-4.9a3.5 3.5 0 004.6-4.6l-2.1 2.1-2-.5-.5-2 2.1-2.1z",
  sofa: "M5 11V8.5A2.5 2.5 0 017.5 6h9A2.5 2.5 0 0119 8.5V11M3 12.5A1.5 1.5 0 014.5 11h0A1.5 1.5 0 016 12.5V16h12v-3.5A1.5 1.5 0 0119.5 11h0a1.5 1.5 0 011.5 1.5V18H3v-5.5zM6 18v2M18 18v2",
  file: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h4",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
};
const Icon = ({ name, size = 20, stroke = "currentColor", width = 1.25, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width}
    strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", ...style }} aria-hidden="true">
    {(ICONS[name] || "").split("M").filter(Boolean).map((d, i) => <path key={i} d={"M" + d} />)}
  </svg>
);

// ---- Eyebrow ----
const Eyebrow = ({ children, color = "var(--earth)", style = {} }) => (
  <div style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.32em", textTransform: "uppercase", color, ...style }}>{children}</div>
);

// ---- Section header (eyebrow + serif title + sub) ----
const SectionHead = ({ eyebrow, title, sub, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginBottom: 22, flexWrap: "wrap" }}>
    <div>
      {eyebrow && <Eyebrow style={{ marginBottom: 12 }}>{eyebrow}</Eyebrow>}
      <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "clamp(24px,3.2vw,34px)", letterSpacing: "-0.01em", lineHeight: 1.1, margin: 0, color: "var(--ink)" }}>{title}</h2>
      {sub && <p style={{ fontFamily: "var(--sans)", fontSize: 13, letterSpacing: "0.06em", lineHeight: 1.7, color: "var(--earth)", margin: "10px 0 0", maxWidth: 520, textWrap: "pretty" }}>{sub}</p>}
    </div>
    {right}
  </div>
);

// ---- Trend chip (delta) ----
const Trend = ({ value, suffix = "%", invert = false, muted = false }) => {
  const up = value >= 0;
  const good = invert ? !up : up;
  const color = muted ? "var(--earth)" : good ? "#5B8A6B" : "var(--peach)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 500, letterSpacing: "0.04em", color }}>
      <Icon name={up ? "trendUp" : "trendDown"} size={13} width={1.6} />
      {up ? "+" : "−"}{Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 1 })}{suffix}
    </span>
  );
};

// ---- Pill / segmented control ----
const Segmented = ({ options, value, onChange, size = "md" }) => {
  const pad = size === "sm" ? "7px 12px" : "9px 16px";
  const fs = size === "sm" ? 10.5 : 11;
  return (
    <div style={{ display: "inline-flex", padding: 3, background: "var(--beige-soft)", borderRadius: 999, gap: 2 }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            border: "none", cursor: "pointer", padding: pad, borderRadius: 999,
            fontFamily: "var(--sans)", fontSize: fs, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase",
            background: active ? "var(--alabaster)" : "transparent",
            color: active ? "var(--ink)" : "var(--earth)",
            boxShadow: active ? "var(--shadow-xs)" : "none",
            transition: "all .18s var(--ease)", whiteSpace: "nowrap",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
};

// ---- Dropdown select (custom, editorial) ----
const Select = ({ value, options, onChange, icon, align = "left", minWidth = 180 }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = options.find(o => o.value === value);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer",
        background: "var(--alabaster)", border: "1px solid var(--ink-08)", borderRadius: 999,
        padding: "10px 14px 10px 16px", fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.08em",
        color: "var(--ink)", boxShadow: "var(--shadow-xs)", transition: "border-color .18s var(--ease)",
      }}>
        {icon && <Icon name={icon} size={15} stroke="var(--earth)" />}
        <span style={{ fontWeight: 500 }}>{cur ? cur.label : ""}</span>
        <Icon name="chevronDown" size={14} stroke="var(--earth)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s var(--ease)" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", [align]: 0, zIndex: 60, minWidth,
          background: "var(--alabaster)", border: "1px solid var(--ink-08)", borderRadius: 16,
          boxShadow: "var(--shadow-md)", padding: 6, animation: "sa-fade .18s var(--ease)",
          maxHeight: 340, overflowY: "auto",
        }}>
          {options.map(o => {
            const active = o.value === value;
            return (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                border: "none", cursor: "pointer", background: active ? "var(--beige-soft)" : "transparent",
                borderRadius: 11, padding: "11px 12px", fontFamily: "var(--sans)", fontSize: 12.5,
                letterSpacing: "0.04em", color: "var(--ink)", transition: "background .14s var(--ease)",
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--beige-30)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                {o.sub ? (
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 500 }}>{o.label}</span>
                    <span style={{ fontSize: 10.5, color: "var(--earth)", letterSpacing: "0.06em" }}>{o.sub}</span>
                  </span>
                ) : <span style={{ fontWeight: active ? 500 : 400 }}>{o.label}</span>}
                {active && <Icon name="check" size={15} stroke="var(--peach)" style={{ marginLeft: "auto" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---- Card shell ----
const Card = ({ children, pad = 24, style = {}, soft = false, onClick, hover = false }) => {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => hover && setH(true)} onMouseLeave={() => hover && setH(false)}
      style={{
        background: soft ? "var(--beige-soft)" : "var(--alabaster)",
        border: "1px solid var(--ink-08)", borderRadius: 24, padding: pad,
        boxShadow: h ? "var(--shadow-md)" : "var(--shadow-sm)",
        transition: "box-shadow .36s var(--ease), transform .36s var(--ease)",
        transform: h ? "translateY(-2px)" : "none",
        cursor: onClick ? "pointer" : "default", ...style,
      }}>{children}</div>
  );
};

// ---- KPI card ----
const KpiCard = ({ label, value, help, trend, accent = false, big = false, spark, onInfo }) => (
  <Card pad={big ? 26 : 20} style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative", minHeight: big ? 150 : 120 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--earth)" }}>{label}</span>
      {accent && <Sparkle size={12} color="var(--peach)" />}
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: big ? 16 : 12, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: big ? "clamp(34px,4.4vw,46px)" : "clamp(26px,3vw,32px)", letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1 }}>{value}</span>
      {trend != null && <Trend value={trend} />}
    </div>
    {spark && <div style={{ marginTop: 12 }}>{spark}</div>}
    {help && <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.04em", lineHeight: 1.5, color: "var(--earth)", margin: "auto 0 0", paddingTop: 12, textWrap: "pretty" }}>{help}</p>}
  </Card>
);

Object.assign(window, { Sparkle, Wordmark, Icon, Eyebrow, SectionHead, Trend, Segmented, Select, Card, KpiCard });
