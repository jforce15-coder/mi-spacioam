/* ============================================================
   Spacio AM — Owner Dashboard · LIVE Google Sheets loader
   Reads the published sheet directly from the browser (gviz CSV).
   Canonical key = property_id (UUID) from SETUP / DATABASE.
   Tabs: SETUP · Resumenconsolidado · DATABASE · insumos & gastos
   ============================================================ */
(function () {
  "use strict";

  const SHEET_ID = "1l9wLH8880NlN9ac2jvne2U6cqej6gycqAD77Z25cLF4";
  const GTQ_RATE = 7.46;            // USD → GTQ (alineado al Reporte Financiero oficial)
  const DEMO_PASS = "spacioam";     // contraseña demo única (auth real vive en EPI)
  const ADMIN_EMAIL = "jovalle@spacioam.com";
  const ADMIN_PASS = "Valencia2026!";
  // Usuario Contador: inicia sesión con cualquiera de estos correos (solo ve la pestaña Contabilidad).
  // Estos son los valores POR DEFECTO; el administrador puede editarlos desde
  // Setup → "Usuarios de contabilidad" (se guardan en el navegador).
  const CONTADOR_DEFAULTS = [
    "pruano@minerva.com.gt",
    "anasimon@minerva.com.gt",
    "andreasimon@minerva.com.gt",
  ].filter(e => e && e.trim());
  const CONTADOR_PASS_DEFAULT = "Contabilidad2026!";
  const LS_CONTA = "spacio_conta_users_v1";
  function contaConfig() {
    try {
      const v = JSON.parse(localStorage.getItem(LS_CONTA) || "null");
      if (v && Array.isArray(v.emails)) {
        return { emails: v.emails.filter(e => e && e.trim()), pass: v.pass || CONTADOR_PASS_DEFAULT };
      }
    } catch (e) {}
    return { emails: CONTADOR_DEFAULTS.slice(), pass: CONTADOR_PASS_DEFAULT };
  }
  window.SpacioContaUsers = {
    get: contaConfig,
    save(emails, pass) {
      const clean = (emails || []).map(e => String(e || "").trim().toLowerCase()).filter(Boolean);
      try { localStorage.setItem(LS_CONTA, JSON.stringify({ emails: clean, pass: pass || CONTADOR_PASS_DEFAULT })); } catch (e) {}
      return contaConfig();
    },
    reset() { try { localStorage.removeItem(LS_CONTA); } catch (e) {} return contaConfig(); },
    defaults: { emails: CONTADOR_DEFAULTS.slice(), pass: CONTADOR_PASS_DEFAULT },
  };

  const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ES_MONTH = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
  const EN_MONTH = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  // ---------- low-level ----------
  function csvURL(sheet) {
    return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(sheet);
  }
  function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else {
        if (c === '"') q = true;
        else if (c === ",") { row.push(cur); cur = ""; }
        else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
        else if (c === "\r") { }
        else cur += c;
      }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function objectify(rows) {
    if (!rows.length) return { items: [], head: [] };
    const head = rows[0].map(h => h.trim());
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.every(c => !c || !c.trim())) continue;
      const o = {};
      head.forEach((h, j) => { o[h] = r[j] != null ? r[j].trim() : ""; });
      out.push(o);
    }
    return { items: out, head };
  }
  function num(v) {
    if (v == null) return 0;
    const s = String(v).replace(/[^0-9.\-]/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function pctNum(v) {
    if (!v) return 0;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n / 100;
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[–—]/g, "-").replace(/[^a-z0-9\-]/g, ""); }
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }

  function parseMesES(s) { // "julio de 2025"
    const m = String(s || "").toLowerCase().trim().match(/([a-záéíóú]+)\s+de\s+(\d{4})/);
    if (!m) return null;
    const mi = ES_MONTH[m[1]]; if (mi == null) return null;
    return { y: parseInt(m[2], 10), m: mi };
  }
  function parseMesEN(s) { // "Apr 2026" / "May 2024"
    const m = String(s || "").trim().match(/([A-Za-z]{3})[a-z]*\s+(\d{4})/);
    if (!m) return null;
    const mi = EN_MONTH[m[1].toLowerCase()]; if (mi == null) return null;
    return { y: parseInt(m[2], 10), m: mi };
  }
  function parseDayMon(s) { // "1 May" / "30 Apr" → {day, mon}
    const m = String(s || "").trim().match(/(\d{1,2})\s+([A-Za-z]{3})/);
    if (!m) return null;
    return { day: parseInt(m[1], 10), mon: EN_MONTH[m[2].toLowerCase()] };
  }

  // location / zona from name
  function locate(name) {
    const n = name.toLowerCase();
    if (n.includes("antigua")) return "Antigua Guatemala";
    if (n.includes("likin")) return "Iztapa, Escuintla";
    if (n.includes("monterrico")) return "Monterrico, Santa Rosa";
    const z = name.match(/z\s*(\d+)/i);
    if (z) return "Zona " + z[1] + ", Ciudad de Guatemala";
    return "Guatemala";
  }
  // parse "Z4 - EdificioA4 - 304" → { zona, edificio, apto }
  function parseName(name) {
    const parts = String(name || "").split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) return { zona: parts[0], edificio: parts[1], apto: parts.slice(2).join(" - ") };
    if (parts.length === 2) return { zona: parts[0], edificio: parts[1], apto: "" };
    return { zona: parts[0] || name, edificio: "", apto: "" };
  }
  const yesFlag = (v) => !!v && /^(si|sí|yes|true|x|1)$/i.test(String(v).trim());

  function zeroMonth(y, m) {
    return {
      y, m, label: { es: MONTHS_ES[m], en: MONTHS_EN[m] }, present: false,
      ingresoBruto: 0, ingresoNeto: 0, fee: 0, insumos: 0, reparaciones: 0, gastos: 0,
      otrosDescuentos: 0, otrosIngresos: 0, otrosIngresos2: 0, ivaTotal: 0, ivaSocios: 0, hostFee: 0, cleaningFee: 0,
      retencion: 0, deposito: 0,
      nochesReservadas: 0, estadias: 0, huespedes: 0, adr: 0, leadTime: 0, estadiaProm: 0,
      ocupacionTotal: 0, ocupacionAjustada: 0, available: daysIn(y, m), totalDays: daysIn(y, m),
      nochesBloqueadas: 0, nochesPropietario: 0, cleaningPropietario: 0, costoOportunidad: 0,
    };
  }

  // ---------- build model ----------
  function build(setup, resumen, db, exp, tc) {
    // month axis from Resumen (ascending)
    const mkSet = {};
    resumen.items.forEach(r => { const d = parseMesES(r["Mes"]); if (d) mkSet[d.y + "-" + d.m] = d; });
    const monthKeys = Object.values(mkSet).sort((a, b) => (a.y - b.y) || (a.m - b.m));
    const mkIndex = {}; monthKeys.forEach((k, i) => mkIndex[k.y + "-" + k.m] = i);

    // TC tab → exchange rate per property per month (GTQ per USD)
    const tcByProp = {};   // normName -> { "y-m": rate }
    const tcByMonth = {};  // "y-m" -> [rates] (fallback average)
    (tc.items || []).forEach(r => {
      const nm = norm(r["Property_name"]); const d = parseMesES(r["Mes"]); const v = num(r["Valor"]);
      if (!nm || !d || !v) return;
      (tcByProp[nm] = tcByProp[nm] || {})[d.y + "-" + d.m] = v;
      (tcByMonth[d.y + "-" + d.m] = tcByMonth[d.y + "-" + d.m] || []).push(v);
    });
    function rateFor(nm, y, m) {
      const p = tcByProp[nm]; if (p && p[y + "-" + m]) return p[y + "-" + m];
      const arr = tcByMonth[y + "-" + m]; if (arr && arr.length) return arr.reduce((a, b) => a + b, 0) / arr.length;
      return GTQ_RATE;
    }

    // properties from SETUP — CONSOLIDATED by normalized name (dup listings → one property)
    const propByName = {};     // normName -> property
    const propById = {};       // any property_id -> same property object (for DATABASE lookup)
    const idxByCodeName = {};  // "code|normName" -> property (for Resumen)
    const idxByName = {};      // normName -> property (for expenses)
    const idxByLoose = {};     // edificio+apto / zona+apto -> property (fuzzy)
    const ownerNames = {};     // code -> ordered list of normNames
    const codeInfo = {};       // code -> { email, pass, secondary }

    setup.items.forEach(r => {
      const pid = (r["property_id"] || "").trim();
      const name = (r["property_name"] || "").trim();
      const code = (r["Usuario ID"] || "").trim();
      if (!pid || !name || !code) return;
      const nm = norm(name);
      // owner-level credentials (first non-empty per code wins)
      const ci = codeInfo[code] = codeInfo[code] || { email: "", pass: "", secondary: "" };
      if (!ci.email && r["User email"]) ci.email = r["User email"].trim();
      if (!ci.pass && r["Password"]) ci.pass = r["Password"].trim();
      if (!ci.secondary && r["secondary user email"]) ci.secondary = r["secondary user email"].trim();
      let p = propByName[nm];
      if (!p) {
        const parts = parseName(name);
        p = propByName[nm] = {
          id: nm, pids: [], code, name, location: locate(name),
          zona: parts.zona, edificio: parts.edificio, apto: parts.apto,
          feePct: num(r["SPACIOAMFEE"]),
          flagIva: yesFlag(r["iva"]), flagRetencion: yesFlag(r["RETENCION"]), flagOtroIngreso: yesFlag(r["OTRO INGRESO"]),
          moneda: (r["Moneda"] || "USD").trim().toUpperCase(),
          cuenta: (r["Numero de cuenta"] || r["Número de cuenta"] || r["Cuenta"] || r["No. de cuenta"] || "").trim(),
          listings: [], listing: "",
          months: monthKeys.map(k => zeroMonth(k.y, k.m)),
          reservations: [], expenses: [],
          setupRows: [],
        };
        idxByCodeName[code + "|" + nm] = p;
        idxByName[nm] = p;
        // indices "sueltos" para tolerar pequenas diferencias de nombre en
        // la hoja de gastos (p.ej. "Z10 - Ignacio - 506" vs "Z10-Ignacio-506")
        const lp = parseName(name);
        if (lp.edificio && lp.apto) idxByLoose[norm(lp.edificio + lp.apto)] = idxByLoose[norm(lp.edificio + lp.apto)] || p;
        if (lp.zona && lp.apto) idxByLoose[norm(lp.zona + lp.apto)] = idxByLoose[norm(lp.zona + lp.apto)] || p;
        (ownerNames[code] = ownerNames[code] || []).push(nm);
      }
      // accumulate listings + pids from every duplicate row (consolidated)
      p.pids.push(pid);
      propById[pid] = p;
      const link = (r["Listing link"] || "").trim();
      if (link && p.listings.indexOf(link) === -1) p.listings.push(link);
      if (!p.listing && link) p.listing = link;
      // capture flags if any duplicate row sets them
      if (yesFlag(r["iva"])) p.flagIva = true;
      if (yesFlag(r["RETENCION"])) p.flagRetencion = true;
      if (yesFlag(r["OTRO INGRESO"])) p.flagOtroIngreso = true;
      p.setupRows.push({ property_id: pid, property_name: name, usuario: code, iva: r["iva"] || "", fee: r["SPACIOAMFEE"] || "", retencion: r["RETENCION"] || "", otroIngreso: r["OTRO INGRESO"] || "", email: r["User email"] || "", listing: link, raw: Object.assign({}, r) });
    });

    // Resumenconsolidado → monthly figures (match by code + normName; ACCUMULATE for dup listings)
    resumen.items.forEach(r => {
      const code = (r["Usuario ID"] || "").trim();
      const name = (r["Property_name"] || "").trim();
      const d = parseMesES(r["Mes"]);
      if (!code || !name || !d) return;
      const p = idxByCodeName[code + "|" + norm(name)];
      if (!p) return;
      const idx = mkIndex[d.y + "-" + d.m];
      if (idx == null) return;
      const bruto = num(r["Ingreso Bruto"]);
      const neto = num(r["Ingreso Neto"]);
      const fee = num(r["Fee Spacio"]);
      const insumos = num(r["Insumos & Gastos"]);
      const reparaciones = num(r["Reparaciones"]);
      // La columna real de Resumenconsolidado es "Otros ingresos" (así la escribe
      // Codigo.gs); leíamos "Otros ingresos 2" por error → siempre 0. Fallback por si acaso.
      const otrosIng2 = num(r["Otros ingresos"]) || num(r["Otros ingresos 2"]);
      const noches = num(r["Noches"]);
      const occAdj = pctNum(r["Ocupación Ajustada"] || r["Ocupación"]);
      const occTot = pctNum(r["Ocupación"]);
      const adr = num(r["Precio Prom"]);
      const days = daysIn(d.y, d.m);
      const avail = occAdj > 0 ? noches / occAdj : days;
      const total = occTot > 0 ? noches / occTot : days;
      const cur = p.months[idx];
      const had = cur.present;
      const acc = {
        y: d.y, m: d.m, label: { es: MONTHS_ES[d.m], en: MONTHS_EN[d.m] }, present: true,
        ingresoBruto: cur.ingresoBruto + bruto, ingresoNeto: cur.ingresoNeto + neto, fee: cur.fee + fee,
        insumos: cur.insumos + insumos, reparaciones: cur.reparaciones + reparaciones, gastos: cur.gastos + insumos + reparaciones,
        otrosIngresos: cur.otrosIngresos + otrosIng2, otrosIngresos2: cur.otrosIngresos2 + otrosIng2,
        ivaTotal: cur.ivaTotal + num(r["IVA Total"]), ivaSocios: cur.ivaSocios + num(r["IVA Socios"]),
        hostFee: cur.hostFee + num(r["Host Service Fee"]), cleaningFee: cur.cleaningFee + num(r["Cleaning Fee"]),
        nochesReservadas: cur.nochesReservadas + noches, estadias: cur.estadias + num(r["Estadías"]), huespedes: 0,
        available: cur.available === days && !had ? avail : (had ? cur.available + avail : avail),
        totalDays: cur.totalDays === days && !had ? total : (had ? cur.totalDays + total : total),
        leadTime: had ? (cur.leadTime + num(r["Lead Time Prom"])) / 2 : num(r["Lead Time Prom"]),
        estadiaProm: num(r["Estadía Prom"]),
        cleaningPropietario: (cur.cleaningPropietario || 0) + num(r["Estadía propietario"]),
        costoOportunidad: cur.costoOportunidad + num(r["Costo de oportunidad"]),
        _adrW: (cur._adrW || 0) + adr * noches,
        netoSheet2: (cur.netoSheet2 || 0) + num(r["Ingreso Neto 2"]),
        nochesPropSheet: (cur.nochesPropSheet || 0) + num(r["Noches propietario"]),
      };
      acc.adr = acc.nochesReservadas ? acc._adrW / acc.nochesReservadas : adr;
      acc.ocupacionAjustada = acc.available ? acc.nochesReservadas / acc.available : 0;
      acc.ocupacionTotal = acc.totalDays ? acc.nochesReservadas / acc.totalDays : 0;
      acc.otrosDescuentos = Math.max(0, acc.ingresoBruto - acc.ingresoNeto - acc.fee - acc.insumos - acc.reparaciones);
      // retención: 5% sobre la base sin IVA del neto (solo si la propiedad tiene retención)
      acc.retencion = p.flagRetencion ? (acc.ingresoNeto / 1.12) * 0.05 : 0;
      // Ingreso Neto 2 (Depósito) = Ingreso Neto − Retención.
      // NO se suma IVA de socios (ya está incluido dentro del Ingreso Neto).
      acc.deposito = acc.ingresoNeto - acc.retencion;
      // Monto a depositar (liquidación): Ingreso Neto 2 si la propiedad lo tiene; si no, Ingreso Neto.
      // Se calcula POR propiedad/mes para que al agregar varias propiedades se SUME bien.
      acc.montoDeposito = acc.netoSheet2 > 0 ? acc.netoSheet2 : acc.ingresoNeto;
      // Noches de uso personal del propietario: usa la columna "Noches propietario"
      // del consolidado si existe; si no (meses viejos), la deriva de
      // Costo de oportunidad ÷ Precio Prom (costoOport = noches × precioProm).
      acc.nochesPropietario = acc.nochesPropSheet > 0
        ? acc.nochesPropSheet
        : (acc.adr > 0 ? Math.round(acc.costoOportunidad / acc.adr) : 0);
      acc.nochesBloqueadas = acc.nochesPropietario; // "noches bloqueadas por ti" = noches de uso propio
      p.months[idx] = acc;
    });

    // DATABASE → reservations (match by property_id)
    db.items.forEach(r => {
      const pid = (r["property_id"] || "").trim();
      const p = propById[pid];
      if (!p) return;
      const d = parseMesEN(r["Mes_año"]);
      const ingresoBruto = num(r["ingreso_bruto"]);
      const feePlataforma = num(r["Fee_plataforma_socio"]);
      p.reservations.push({
        y: d ? d.y : null, m: d ? d.m : null,
        checkin: r["checkin_date"] || "", checkout: r["checkout_date"] || "",
        fechas: (r["Fechas resum"] || "").trim(),
        nights: num(r["nights"]), platform: (r["platform"] || "").trim() || "—",
        guest: ((r["guest_first_name"] || "") + " " + (r["guest_last_name"] || "")).trim() || "—",
        guests: num(r["guest_count"]), status: (r["status"] || "").trim(),
        ingresoBruto, feePlataforma, ingresos: ingresoBruto + feePlataforma,
        cleaningFee: num(r["cleaning_fee"]), iva: num(r["pass_through_taxes"]),
        leadTime: num(r["lead_time"]), rating: num(r["review_rating"]),
        _sort: (function () { const dd = parseDayMon(r["Fechas resum"]); return dd ? (dd.mon * 100 + dd.day) : 0; })(),
      });
    });

    // huéspedes per month from reservations
    Object.values(propById).forEach(p => {
      const g = {};
      p.reservations.forEach(rv => { if (rv.m != null) g[rv.y + "-" + rv.m] = (g[rv.y + "-" + rv.m] || 0) + (rv.guests || 0); });
      p.months.forEach(mo => { const v = g[mo.y + "-" + mo.m]; if (v) mo.huespedes = v; else if (mo.present) mo.huespedes = Math.round(mo.estadias * 2.2); });
    });

    // insumos & gastos → expenses (only owner-billable categories)
    const BILLABLE = { "insumos & gastos": "insumos", "reparaciones o inversión": "reparaciones", "reparaciones o inversion": "reparaciones", "mantenimiento e inversión": "reparaciones", "mantenimientos e inversión": "reparaciones", "mantenimiento e inversion": "reparaciones" };
    // etiquetas (columna G) que NUNCA se le cobran al socio: el gasto se
    // registra y lo ve el administrador, pero se oculta de la vista del socio.
    const NON_BILLABLE_TAGS = { "restaurante / comida": 1, "restaurante/comida": 1, "compras ajenas a insumos": 1, "gasto spacio am": 1 };
    // resuelve el anio de un gasto sin anio contra la ventana real del reporte
    const yearsByMonth = {}; monthKeys.forEach(k => { (yearsByMonth[k.m] = yearsByMonth[k.m] || []).push(k.y); });
    const resolveYear = (mn) => { const ys = yearsByMonth[mn]; return ys && ys.length ? Math.max.apply(null, ys) : null; };
    const nameKey = exp.head[2] || "property";
    exp.items.forEach(r => {
      const pname = (r[nameKey] || "").trim();
      if (!pname) return;
      const lp = parseName(pname);
      const p = idxByName[norm(pname)]
        || (lp.edificio && lp.apto && idxByLoose[norm(lp.edificio + lp.apto)])
        || (lp.zona && lp.apto && idxByLoose[norm(lp.zona + lp.apto)]);
      if (!p) return;
      const catRaw = (r["categoria"] || "").trim();
      const catKey = BILLABLE[catRaw.toLowerCase()];
      const billable = !!catKey;
      const tagRaw = (r["tag"] || "").trim();
      // adminOnly = no se le cobra al socio (categoría no cobrable, o tag no cobrable).
      // Estos gastos SÍ los ve el administrador, pero se ocultan al socio.
      const adminOnly = !billable || !!NON_BILLABLE_TAGS[tagRaw.toLowerCase()];
      const ed = parseExpDate(r["Fecha de pedido"], num(r["Mes"]), resolveYear);
      // insumos & gastos line items are recorded in GTQ → convert to USD with TC (property+month)
      const valorGTQ = num(r["valor"]);
      const rate = rateFor(norm(p.name), ed.y, ed.m);
      // limpia sufijos técnicos del comentario (p.ej. "· (aplicado a 33)")
      const descClean = ((r["Comentario"] || catRaw).trim() || catRaw || "—").replace(/\s*[·\-–—]?\s*\(aplicado a \d+\)\s*$/i, "").trim();
      p.expenses.push({
        y: ed.y, m: ed.m, day: ed.day,
        catKey: catKey || "otros", category: catRaw || "Otros", billable, tag: tagRaw, adminOnly,
        desc: descClean || catRaw || "—",
        amount: rate ? valorGTQ / rate : valorGTQ, amountGTQ: valorGTQ, tc: rate,
        orderId: (r["orderId"] || "").trim(), orderUrl: (r["orderUrl"] || "").trim(),
        authProductos: (r["authProductos"] || "").trim(), authTarifa: (r["authTarifa"] || "").trim(),
      });
    });
    Object.values(propById).forEach(p => p.expenses.sort((a, b) => (b.y - a.y) || (b.m - a.m) || (b.day - a.day)));

    // accounts: keyed by login email, merging any Usuario IDs that share that email.
    const hasData = (nm) => propByName[nm] && (propByName[nm].months.some(m => m.present) || propByName[nm].reservations.length);
    const byEmail = {};
    Object.keys(ownerNames).sort().forEach(code => {
      const info = codeInfo[code] || {};
      const props = ownerNames[code].filter(hasData);
      if (!props.length) return;
      const email = (info.email || "").trim();
      const key = (email || code).toLowerCase();
      const acc = byEmail[key] || (byEmail[key] = {
        primaryCode: code, codes: [], props: [],
        email: email, pass: (info.pass || DEMO_PASS), secondaryEmail: (info.secondary || ""),
      });
      acc.codes.push(code);
      acc.props = acc.props.concat(props);
      if (!acc.email && email) acc.email = email;
      if (!acc.secondaryEmail && info.secondary) acc.secondaryEmail = info.secondary;
    });
    function prettyName(email, code) {
      if (email && email.includes("@")) { const lp = email.split("@")[0]; return lp.charAt(0).toUpperCase() + lp.slice(1); }
      return code.replace(/_/g, " ");
    }
    const owners = Object.values(byEmail).map(a => ({
      code: a.primaryCode, codes: a.codes,
      name: prettyName(a.email, a.primaryCode),
      email: a.email, pass: a.pass, secondaryEmail: a.secondaryEmail,
      props: [...new Set(a.props)],
    }));

    // admin account — sees every property; can filter by zona/edificio/propiedad
    const allProps = Object.keys(propByName).filter(hasData);
    const admin = {
      code: "__admin__", codes: ["__admin__"], name: "Spacio AM", isAdmin: true,
      email: ADMIN_EMAIL, pass: ADMIN_PASS, secondaryEmail: "", props: allProps,
    };
    // cuenta del contador (solo lectura de Contabilidad; 4 correos alternativos)
    const cfgC = contaConfig();
    const contador = {
      code: "__contador__", codes: ["__contador__"], name: "Contador", isContador: true,
      email: cfgC.emails[0] || "", emails: cfgC.emails.slice(), pass: cfgC.pass, secondaryEmail: "", props: [],
    };

    // effective credentials apply any locally-saved profile edits (demo persistence)
    function eff(o) {
      const pr = SpacioProfile.get(o.code);
      return {
        email: pr.email != null ? pr.email : o.email,
        secondaryEmail: pr.secondaryEmail != null ? pr.secondaryEmail : o.secondaryEmail,
        pass: pr.pass != null ? pr.pass : o.pass,
        avatar: pr.avatar != null ? pr.avatar : (o.avatar || ""),
      };
    }

    const byId = propByName; // id === normalized name

    return {
      live: true, rate: GTQ_RATE, monthKeys, MONTHS_ES, MONTHS_EN, setupHead: setup.head || [],
      properties: byId, propertyList: Object.values(propByName), owners, admin, contador,
      effCreds: eff,
      // Convierte el perfil del auth unificado en un "owner" del dashboard.
      // Vincula por LLAVE ESTABLE (user_id), luego código de socio, y solo al
      // final por correo — así cambiar el correo nunca desvincula al usuario.
      fromProfile(p) {
        const email = (p.email || "").toLowerCase();
        const uid = p.user_id || p.userId || "";
        const codes = [].concat(p.codes || p.usuario || p.code || []).map(c => String(c).toLowerCase());
        const rol = (p.apps && p.apps.mi) || "";
        if (rol === "admin_principal") return Object.assign({}, admin, { user_id: uid, email: p.email, avatar: p.foto || "" });
        if (rol === "contador") return Object.assign({}, contador, { user_id: uid, email: p.email });
        const byUid = uid && owners.find(o => (o.user_id || "") === uid);
        const byCode = !byUid && codes.length && owners.find(o => (o.codes || [o.code]).some(c => codes.indexOf(String(c).toLowerCase()) >= 0));
        const byEmail = !byUid && !byCode && owners.find(o => {
          const e = eff(o);
          return (e.email || "").toLowerCase() === email || (e.secondaryEmail || "").toLowerCase() === email;
        });
        const found = byUid || byCode || byEmail;
        return found ? Object.assign({}, found, { user_id: uid || found.user_id || "", avatar: p.foto || found.avatar || "" }) : Object.assign({ code: "__u__", user_id: uid, name: p.nombre || p.email, email: p.email, props: [], avatar: p.foto || "" });
      },
      auth(login, pass) {
        const L = String(login || "").trim().toLowerCase();
        if (L === ADMIN_EMAIL.toLowerCase() && pass === ADMIN_PASS) return Object.assign({}, admin);
        // se relee en cada intento para respetar los cambios del administrador
        const cc = contaConfig();
        if (cc.emails.some(e => e.toLowerCase() === L) && pass === cc.pass) return Object.assign({}, contador, { email: L, emails: cc.emails.slice(), pass: cc.pass });
        for (const o of owners) {
          const e = eff(o);
          const email = (e.email || "").toLowerCase();
          const sec = (e.secondaryEmail || "").toLowerCase();
          if ((L && (L === email || (sec && L === sec))) && pass === e.pass) {
            return Object.assign({}, o, e);
          }
        }
        return null;
      },
      ownerProps(owner) {
        if (owner && owner.isContador) return [];
        if (owner && owner.isAdmin) return (owner.props || allProps).map(id => byId[id]).filter(Boolean);
        return owner.props.map(id => byId[id]).filter(Boolean);
      },
      // deposito rows to write into Resumenconsolidado "Ingreso Neto 2"
      depositoItems() {
        const LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const items = [];
        Object.values(byId).forEach(p => {
          if (!p.flagRetencion) return;
          p.months.forEach(mo => {
            if (!mo.present) return;
            items.push({ usuario: p.code, property_name: p.name, mes: LONG[mo.m] + " de " + mo.y, value: Math.round(mo.deposito * 100) / 100 });
          });
        });
        return items;
      },
    };
  }

  // ---------- local profile store (demo persistence; real write-back lives in backend) ----------
  const SpacioProfile = {
    key(code) { return "sa-profile-" + code; },
    get(code) { try { return JSON.parse(localStorage.getItem(this.key(code))) || {}; } catch (e) { return {}; } },
    set(code, patch) { const next = Object.assign({}, this.get(code), patch); localStorage.setItem(this.key(code), JSON.stringify(next)); return next; },
    reset(code) { localStorage.removeItem(this.key(code)); },
  };
  window.SpacioProfile = SpacioProfile;

  // ---------- local SETUP overrides (admin edits; real write-back needs backend) ----------
  const SpacioSetup = {
    KEY: "sa-setup-overrides",
    all() { try { const a = JSON.parse(localStorage.getItem(this.KEY)) || {}; a.edits = a.edits || {}; a.added = a.added || []; a.editsRaw = a.editsRaw || {}; a.addedRaw = a.addedRaw || []; return a; } catch (e) { return { edits: {}, added: [], editsRaw: {}, addedRaw: [] }; } },
    saveEdit(id, row) { const a = this.all(); a.edits[id] = row; localStorage.setItem(this.KEY, JSON.stringify(a)); },
    addRow(row) { const a = this.all(); a.added.push(row); localStorage.setItem(this.KEY, JSON.stringify(a)); return a; },
    // versiones "raw" (todas las columnas A–O por nombre de encabezado)
    saveEditRaw(id, row) { const a = this.all(); a.editsRaw[id] = row; localStorage.setItem(this.KEY, JSON.stringify(a)); },
    addRowRaw(row) { const a = this.all(); a.addedRaw.push(row); localStorage.setItem(this.KEY, JSON.stringify(a)); return a; },
    reset() { localStorage.removeItem(this.KEY); },
  };
  window.SpacioSetup = SpacioSetup;

  // ---------- write-back client (Apps Script web app) ----------
  // CONEXIÓN PERSISTENTE: el admin la introduce UNA vez en Setup → "Conexión de
  // escritura" y queda guardada de forma redundante (localStorage + cookie de
  // ~400 días + IndexedDB). En cada carga se re-sella en los tres almacenes, así
  // Safari/iOS no la borra mientras se use el dashboard con regularidad, y si un
  // almacén se limpia, se restaura desde otro. Solo cambia si el admin la cambia.
  const SA_WK = "sa-writeapi-url", SA_TK = "sa-writeapi-token";
  // ---------------------------------------------------------------
  // CONEXIÓN PÚBLICA DE SUBIDA — rellenar UNA vez y volver a publicar.
  // Sin esto, un socio que sube una factura desde su teléfono NO la guarda en
  // Drive (su navegador no tiene la conexión del admin) y el archivo se pierde
  // al recargar. El token de subida solo autoriza "uploadFile" en el Apps
  // Script (SA_UPLOAD_TOKEN), por eso puede ir dentro del código publicado.
  const SA_PUBLIC_URL = "https://script.google.com/macros/s/AKfycbzqUTv_0NuNBVRXhlfHGaS5RdWKjBAmfA-dIsdDnMLbl2aE2PriEXNWw3qCi8yPF28qaQ/exec"; // ej. "https://script.google.com/macros/s/AKfyc…/exec"
  const SA_PUBLIC_TOKEN = "spam-subida-8f42c7bd91e6a5-2026"; // el mismo valor de SA_UPLOAD_TOKEN en el Apps Script
  // ---------------------------------------------------------------
  function saCookieGet(k) {
    try { const m = document.cookie.match("(?:^|; )" + k.replace(/[-]/g, "\\$&") + "=([^;]*)"); return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return ""; }
  }
  function saCookieSet(k, v) {
    try { document.cookie = k + "=" + encodeURIComponent(v || "") + ";path=/;max-age=" + (60 * 60 * 24 * 400) + ";SameSite=Lax"; } catch (e) {}
  }
  // IndexedDB (respaldo más resistente)
  function saIdb(mode, vals) {
    return new Promise((res) => {
      try {
        const req = indexedDB.open("spacio-cfg", 1);
        req.onupgradeneeded = () => { req.result.createObjectStore("kv"); };
        req.onerror = () => res(null);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction("kv", mode === "set" ? "readwrite" : "readonly");
            const st = tx.objectStore("kv");
            if (mode === "set") { st.put(vals.url, SA_WK); st.put(vals.token, SA_TK); tx.oncomplete = () => res(true); }
            else { const o = {}; const a = st.get(SA_WK), b = st.get(SA_TK); a.onsuccess = () => { o.url = a.result || ""; }; b.onsuccess = () => { o.token = b.result || ""; }; tx.oncomplete = () => res(o); }
          } catch (e) { res(null); }
        };
      } catch (e) { res(null); }
    });
  }
  function saLocalGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function saLocalSet(k, v) { try { localStorage.setItem(k, v || ""); } catch (e) {} }

  const SpacioWrite = {
    urlKey: SA_WK, tokenKey: SA_TK,
    // lee de localStorage; si está vacío, cae a la cookie y luego a la conexión
    // pública de subida (para que TODO dispositivo pueda guardar archivos).
    url() { return (saLocalGet(SA_WK) || saCookieGet(SA_WK) || SA_PUBLIC_URL || "").trim(); },
    token() { return (saLocalGet(SA_TK) || saCookieGet(SA_TK) || SA_PUBLIC_TOKEN || "").trim(); },
    // ¿este dispositivo tiene la conexión completa del admin (no la pública)?
    isAdminConn() { return !!(saLocalGet(SA_TK) || saCookieGet(SA_TK)); },
    // escribe en los TRES almacenes
    setConfig(url, token) {
      url = (url || "").trim(); token = (token || "").trim();
      saLocalSet(SA_WK, url); saLocalSet(SA_TK, token);
      saCookieSet(SA_WK, url); saCookieSet(SA_TK, token);
      saIdb("set", { url: url, token: token });
    },
    // al cargar: restaura desde el almacén que sobreviva y re-sella todo
    async hydrate() {
      let url = saLocalGet(SA_WK) || saCookieGet(SA_WK), token = saLocalGet(SA_TK) || saCookieGet(SA_TK);
      if (!url) { const o = await saIdb("get"); if (o && o.url) { url = o.url; token = o.token || token; } }
      if (url) this.setConfig(url, token); // re-sella (refresca el temporizador de Safari)
      return !!this.url();
    },
    enabled() { return !!this.url(); },
    async post(action, payload) {
      if (!this.url()) return { ok: false, offline: true };
      try {
        // text/plain → "simple request", evita preflight CORS contra Apps Script
        const res = await fetch(this.url(), {
          method: "POST", redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ action: action, token: this.token() }, payload || {})),
        });
        return await res.json();
      } catch (e) { return { ok: false, error: String(e) }; }
    },
    ping() { return this.post("ping", {}); },
  };
  window.SpacioWrite = SpacioWrite;
  // Restaura/re-sella la conexión en cada carga (localStorage ↔ cookie ↔ IndexedDB).
  SpacioWrite.hydrate();

  // expense date: prefer a real date in "Fecha de pedido"; else month heuristic.
  // `resolveYear(m)` (optional) picks a year that actually exists in the report
  // window for month m, so expenses never fall into an empty (and invisible) bucket.
  function parseExpDate(fecha, mesNum, resolveYear) {
    const s = String(fecha || "").trim();
    // 1) fecha completa con anio explicito: ISO, dd/mm/yyyy, "22 May 2026", "22 mayo 2026"
    let mm = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (mm) return { y: +mm[1], m: +mm[2] - 1, day: +mm[3] };
    mm = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (mm) return { y: +mm[3], m: +mm[2] - 1, day: +mm[1] };
    mm = s.match(/(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3,})\.?\s+(\d{4})/);
    if (mm) {
      const mi = monthIndexOf(mm[2]); if (mi != null) return { y: +mm[3], m: mi, day: +mm[1] };
    }
    const dRaw = new Date(s);
    if (!isNaN(dRaw) && /\d{4}/.test(s)) return { y: dRaw.getFullYear(), m: dRaw.getMonth(), day: dRaw.getDate() };
    // 2) sin anio: "22 May" / "1 May" + numero de Mes → deducir mes y dia
    const dm = parseDayMon(s);
    const mn = mesNum && mesNum >= 1 && mesNum <= 12 ? mesNum - 1 : (dm ? dm.mon : 0);
    const day = dm ? dm.day : 1;
    // anio: usa el resolutor (ventana real) si existe; si no, heuristica jul'25–jun'26
    const y = (resolveYear && resolveYear(mn)) || (mn >= 6 ? 2025 : 2026);
    return { y, m: mn, day };
  }
  function monthIndexOf(token) {
    const t = String(token || "").toLowerCase().replace(/\./g, "");
    if (ES_MONTH[t] != null) return ES_MONTH[t];
    if (EN_MONTH[t] != null) return EN_MONTH[t];
    const t3 = t.slice(0, 3);
    if (EN_MONTH[t3] != null) return EN_MONTH[t3];
    const es3 = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
    return es3[t3] != null ? es3[t3] : null;
  }

  async function load() {
    const fetchTab = async (name) => objectify(parseCSV(await (await fetch(csvURL(name))).text()));
    const [setup, resumen, dbT, expT, tcT] = await Promise.all([
      fetchTab("SETUP"), fetchTab("Resumenconsolidado"), fetchTab("DATABASE"), fetchTab("insumos & gastos"), fetchTab("TC"),
    ]);
    const data = build(setup, resumen, dbT, expT, tcT);
    // registro de archivos subidos (facturas/depositos a Drive) — best effort
    try {
      const filesT = await fetchTab("Archivos cargados");
      data.files = (filesT.items || []).map(r => ({
        tipo: (r["tipo"] || "").trim().toLowerCase(),
        scope: (r["scope"] || "").trim().toLowerCase() || "property",
        owner: (r["owner"] || "").trim(),
        property_name: (r["property_name"] || "").trim(),
        ym: (r["mes"] || "").trim(),
        archivo: (r["archivo"] || "").trim(),
        url: (r["url"] || "").trim(),
        cargado: (r["cargado"] || "").trim(),
        orderId: (r["orderId"] || "").trim(),
        account: (r["account"] || "").trim(),
      })).filter(r => r.tipo && r.ym);
    } catch (e) { data.files = []; }
    // gastos operativos globales + otros ingresos (P&L interno) — best effort
    try {
      const opexT = await fetchTab("Gastos operativos");
      data.contaOpex = (opexT.items || []).map(r => ({
        id: (r["id"] || "").trim(),
        kind: (r["kind"] || "opex").trim().toLowerCase(),
        ym: (r["mes"] || r["ym"] || "").trim(),
        concepto: (r["concepto"] || "").trim(),
        categoria: (r["categoria"] || "").trim(),
        monto: num(r["monto"]),
        currency: (r["moneda"] || r["currency"] || "GTQ").trim().toUpperCase() === "USD" ? "USD" : "GTQ",
        fileUrl: (r["url"] || "").trim(),
        fileName: (r["archivo"] || "").trim(),
      })).filter(r => r.id && r.ym);
    } catch (e) { data.contaOpex = []; }
    // depósitos registrados en "Depositos cargados" (respaldo visible aunque no
    // haya quedado el archivo en Drive) — best effort
    try {
      const depT = await fetchTab("Depositos cargados");
      data.depositos = (depT.items || []).map(r => ({
        fecha: (r["Fecha"] || "").trim(),
        monto: parseFloat(String(r["monto"] || "").replace(/[^0-9.\-]/g, "")) || 0,
        property_name: (r["property_name"] || "").trim(),
        cuenta: (r["Numero de cuenta"] || r["Número de cuenta"] || "").trim(),
        categoria: (r["categoria"] || "").trim(),
        comentario: (r["Comentario"] || "").trim(),
        archivo: (r["archivo"] || "").trim(),
      })).filter(r => r.property_name && (r.monto || r.fecha));
    } catch (e) { data.depositos = []; }
    // Contabilidad: movimientos clasificados de estados de cuenta (best effort)
    try {
      const conT = await fetchTab("Contabilidad");
      data.conta = (conT.items || []).map(r => ({
        ym: (r["ym"] || "").trim(), account: (r["account"] || "").trim(), currency: (r["currency"] || "").trim(),
        date: (r["date"] || "").trim(), doc: (r["doc"] || "").trim(), desc: (r["desc"] || "").trim(),
        debit: parseFloat(String(r["debe"] || "").replace(/[^0-9.\-]/g, "")) || 0,
        credit: parseFloat(String(r["haber"] || "").replace(/[^0-9.\-]/g, "")) || 0,
        saldo: parseFloat(String(r["saldo"] || "").replace(/[^0-9.\-]/g, "")) || 0,
        tt: (r["tt"] || "").trim(), tag: (r["tag"] || "").trim(), category: (r["categoria"] || "").trim(),
        factura: (r["factura"] || "").trim(),
        pdfUrl: (r["pdf_url"] || "").trim(), savedAt: (r["savedAt"] || "").trim(),
      })).filter(r => r.ym && r.account);
    } catch (e) { data.conta = []; }
    window.SpacioData = data;
    window.__sheets = { setup: setup.items.length, resumen: resumen.items.length, db: dbT.items.length, exp: expT.items.length, tc: tcT.items.length, accounts: data.owners.length, files: (data.files || []).length };
    return data;
  }

  window.SpacioLoad = load;
  window.SPACIO_RATE = GTQ_RATE;
  window.SPACIO_SHEET_ID = SHEET_ID;
})();
