// ============================================================
// Spacio AM — Contabilidad · datos maestros + autoclasificación
// ------------------------------------------------------------
// Aprende de las hojas "Reporte financiero" históricas: los pagos
// se repiten a las mismas cuentas cada mes, así que clasificamos
// el memo del banco (columna "Descripción") en un Tag + Categoría
// siguiendo la MISMA lógica de las hojas de Drive.
// ============================================================
(function () {
  "use strict";

  // ---- Las 4 cuentas de Banco Industrial ----
  const ACCOUNTS = [
    { id: "op-gtq", number: "0160186466", name: "Operativa GTQ", group: "Operativas", currency: "GTQ" },
    { id: "op-usd", number: "0160186508", name: "Operativa USD", group: "Operativas", currency: "USD" },
    { id: "pr-gtq", number: "0160186474", name: "Proyectos GTQ", group: "Proyectos", currency: "GTQ" },
    { id: "pr-usd", number: "0160186482", name: "Proyectos USD", group: "Proyectos", currency: "USD" },
  ];
  const accByNumber = {}; ACCOUNTS.forEach(a => { accByNumber[a.number] = a; });

  // ---- Lista de referencia canónica: Tag ("Descripción") -> Categoría ("Descripción 2")
  //      Tomada de las listas de validación de las hojas mensuales.
  const REFERENCE = [
    // Operativos
    ["Tokens Lavanderia", "Gastos operativos"],
    ["Equipo de primera impresion", "Cleaning fee"],
    ["Mantenimientos", "Gastos operativos"],
    ["Gasto operativo", "Gastos operativos"],
    ["Insumos y Gastos", "Gastos operativos"],
    ["Contabilidad", "Gastos operativos"],
    ["Renta Modra 311", "Gastos operativos"],
    ["Pago de tarjeta empresarial", "Gastos operativos"],
    ["Pago de software operativo", "Gastos operativos"],
    ["Asistente - Operativo", "Gastos operativos"],
    ["Servicios operativos", "Gasto operativo"],
    ["Servicio de lavanderia", "Gasto operativo"],
    ["Viaticos", "Gasto operativo"],
    ["Gastos Operativo Monterrico", "Gasto operativo"],
    ["Pago documento legal nuevo socio - Beita 407", "Gastos operativos"],
    ["Reparación Airali 1508", "Gastos operativos"],
    // Nómina
    ["Salario", "Salarios"],
    ["Beneficio Empleado", "Salarios"],
    // Impuestos
    ["IMPUESTOS", "Impuestos"],
    // Transferencias internas
    ["Transferencia a Quetzales a cuenta 0160186466 de Spacio AM", "Transferencias entre cuentas"],
    ["Transferencia a Quetzales a cuenta 0160186474 de Spacio AM", "Transferencias entre cuentas"],
    ["Transferencia a Dolares a cuenta 0160186508 de Spacio AM", "Transferencias entre cuentas"],
    ["Transferencia a Dolares a cuenta 0160186482 de Spacio AM", "Transferencias entre cuentas"],
    ["Transferencia a GT", "Transferencias entre cuentas"],
    ["Transferencias entre cuentas", "Transferencias entre cuentas"],
    // Cobros a socios (la X se sustituye por la propiedad)
    ["Cobro por cuenta ajena (Socio)", "Cobro por cuenta ajena"],
    // Ingresos
    ["Otros ingresos", "Ingresos adicionales"],
    ["Reintegro", "Ingresos adicionales"],
    ["prestamo", "Ingresos adicionales"],
    ["Inversion", "Inversiones de terceros"],
    ["Ingreso por reserva", "Ingresos varios"],
    ["Ingreso por servicio decoración de interiores", "Ingreso"],
    // Proyectos / diseño
    ["Fotografia profesional", "Diseño de interiores"],
    ["Compra de mobiliario", "Liquidación de gastos"],
    ["Devolución por liquidación de gastos", "Liquidación de presupuesto"],
    ["Reparaciones", "Gasto terceros"],
    // Dividendos / consultoría
    ["Pago consultoria", "Dividendos"],
    // Devoluciones / ajustes
    ["devolucion a huesped", "devolución de ingresos"],
    ["Devolución por problema de transferencia", "Reintegro"],
    ["Error contable", "Error contable"],
    ["Cleaning fee Paredon", "Cleaning fee"],
    ["Cleaning fee Serza", "Cleaning fee"],
    ["Sin movimiento", "Sin movimiento"],
    ["sin identificar", "sin identificar"],
  ];
  const catForTag = {}; REFERENCE.forEach(([t, c]) => { catForTag[t] = c; });

  // Categorías únicas (para filtros), en orden de aparición
  const CATEGORIES = (() => {
    const seen = [], set = {};
    REFERENCE.forEach(([, c]) => { if (!set[c]) { set[c] = 1; seen.push(c); } });
    return seen;
  })();

  // Tags agrupados por categoría para el selector del admin
  const TAGS_BY_CATEGORY = (() => {
    const m = {};
    REFERENCE.forEach(([t, c]) => { (m[c] = m[c] || []).push(t); });
    return m;
  })();

  // ---- Propiedades (para detectar "Transferencia Socio - X") ----
  const PROPERTY_TOKENS = [
    "narama", "airali", "beita", "modra", "fiamene", "eon", "baldone",
    "coloniales", "brunelo", "pamplona", "parque mateo", "pmateo", "p mateo",
    "inara", "likin", "centro vivo", "torrenova", "namericas", "buenavista",
    "monterrico", "serza", "paredon",
  ];
  // Personas de limpieza (memos tipo "Caren 6 al 12 abr 2026")
  const CLEANING_NAMES = [
    "caren", "mirla", "joselyn", "helen", "jackeline", "jackelin", "jacqueline",
    "sucely", "lilia", "noelia", "mirna",
  ];

  // ---- normalización ----
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
      .replace(/\s+/g, " ")
      .trim();
  }
  // clave para diccionario aprendido: memo sin números/fechas finales
  function memoKey(s) {
    return norm(s)
      .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, " ")  // fechas
      .replace(/\b\d{6,}\b/g, " ")                          // doc largos
      .replace(/\s+/g, " ").trim();
  }
  const MONTH_RE = /\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/;
  const YEAR_RE = /\b20\d{2}\b/;

  // ---- diccionario aprendido (memoKey -> tag), persistido ----
  const LEARN_KEY = "sa-conta-learn";
  function loadLearned() { try { return JSON.parse(localStorage.getItem(LEARN_KEY) || "{}"); } catch (e) { return {}; } }
  let LEARNED = loadLearned();
  function learn(memo, tag) {
    if (!memo || !tag) return;
    const k = memoKey(memo); if (!k) return;
    LEARNED[k] = tag;
    try { localStorage.setItem(LEARN_KEY, JSON.stringify(LEARNED)); } catch (e) {}
  }
  function learnBulk(pairs) { // [{memo, tag}]
    (pairs || []).forEach(p => { const k = memoKey(p.memo); if (k && p.tag) LEARNED[k] = p.tag; });
    try { localStorage.setItem(LEARN_KEY, JSON.stringify(LEARNED)); } catch (e) {}
  }

  // Construye el tag "Transferencia Socio - <propiedad>" a partir del memo,
  // quitando mes/año finales. Ej: "Modra 1108 Mar 2026" -> "Transferencia Socio - Modra 1108"
  function socioTag(memo) {
    let s = String(memo || "").trim();
    // corta desde el primer mes/año en adelante (deja sólo la propiedad)
    const cut = s.search(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\b|\b20\d{2}\b/i);
    if (cut > 3) s = s.slice(0, cut);
    s = s.replace(/\s+/g, " ").trim()
      .replace(/^(ajuste|ajustes|compensacion|complemento|saldo|cobro|abono|pago)\s+/i, "")
      .replace(/[\-,]\s*$/, "").trim();
    if (!s) return "Transferencia Socio";
    return "Transferencia Socio - " + s;
  }

  // ---- el clasificador principal ----
  // Devuelve { tag, category, source, confidence }  (source null => requiere revisión)
  function classify(memo, opts) {
    opts = opts || {};
    const raw = String(memo || "");
    const n = norm(raw);
    if (!n) return { tag: "", category: "", source: null, confidence: 0 };
    const acc = opts.accId || "";
    const isProyectos = acc === "pr-gtq" || acc === "pr-usd";

    // 0) diccionario aprendido (lo que el admin ya confirmó) — máxima prioridad
    const lk = memoKey(raw);
    if (LEARNED[lk]) { const tag = LEARNED[lk]; return mk(tag, "learned", 1); }

    const has = (re) => re.test(n);
    const inc = (...arr) => arr.some(w => n.indexOf(w) > -1);

    // 1) transferencias internas
    if (inc("banca movil", "bbweb", "entre cuentas", "entre cuantas")) {
      // dirección/cuenta destino — usamos la cuenta operativa GTQ por defecto
      return mk("Transferencia a Quetzales a cuenta 0160186466 de Spacio AM", "rule", 0.9);
    }
    if (inc("internacional") || (inc("transferencia a gt"))) return mk("Transferencia a GT", "rule", 0.85);

    // 2) tarjeta empresarial (en cuentas de Proyectos suele ser compra de mobiliario)
    if (inc("bi-app", "p/electronico", "pago electronico"))
      return mk(isProyectos ? "Compra de mobiliario" : "Pago de tarjeta empresarial", "rule", isProyectos ? 0.7 : 0.9);

    // 3) impuestos
    if (inc("declaraguate", "impuesto", "iva ", "isr", "sat ")) return mk("IMPUESTOS", "rule", 0.92);

    // 4) tokens lavandería
    if (has(/\btokens?\b/)) return mk("Tokens Lavanderia", "rule", 0.95);

    // 5) salarios
    if (inc("salario", "igss", "iggs", "beneficio empleado", "bono", "aguinaldo", "indemniz")) return mk("Salario", "rule", 0.85);

    // 6) contabilidad
    if (has(/\bcontabilidad\b/)) return mk("Contabilidad", "rule", 0.9);

    // 7) software
    if (inc("software")) return mk("Pago de software operativo", "rule", 0.85);

    // 8) consultoría
    if (inc("consultoria")) return mk("Pago consultoria", "rule", 0.75);

    // 9) renta
    if (has(/\brenta\b/) && inc("311", "modra")) return mk("Renta Modra 311", "rule", 0.85);

    // 10) EPI / equipo de primera impresión (incluye limpieza de personal)
    if (inc("epi", "equipo de primera", "primera impresion", "limpiezas")) return mk("Equipo de primera impresion", "rule", 0.9);

    // 11) mantenimiento (antes que socio: requieren palabra clave específica)
    if (inc("reparacion", "reparaciones", "mantenimiento", "pintura", "cerrajero",
            "carpintero", "instalacion", "inodoro", "jardin", "contrallave", "chapa",
            "extractor", "drenaje", "sillon", "trabajos", "cambio taza", "fontaner",
            "electricista", "albañil", "albanil", "fumigacion", "bombillo", "cover duvet",
      "azulejo", "tuberia", "tuveria", "bomba modra", "chorro", "fugas", "filtro")) {
      return mk("Mantenimientos", "rule", 0.78);
    }

    // 11b) compra de mobiliario / artes (frecuente en cuentas de Proyectos)
    if (inc("compra de mobiliario", "mobiliario", "muebles", "artes ", "cortinas",
            "sartenes", "utensilios", "almohadas", "cafetera"))
      return mk("Compra de mobiliario", "rule", isProyectos ? 0.7 : 0.6);

    // 12) transferencia a socio: propiedad + mes + año
    const prop = PROPERTY_TOKENS.find(p => n.indexOf(p) > -1);
    if (prop && has(MONTH_RE) && has(YEAR_RE)) return mk(socioTag(raw), "property", 0.8);
    // propiedad + mes (sin año) también suele ser cobro de socio
    if (prop && has(MONTH_RE)) return mk(socioTag(raw), "property", 0.6);

    // 13) personal de limpieza por nombre + rango de fechas
    const name = CLEANING_NAMES.find(nm => n.indexOf(nm) > -1);
    if (name && (has(MONTH_RE) || has(/\bal\b/) || inc("adelanto", "dios te"))) {
      return mk("Equipo de primera impresion", "person", 0.7);
    }

    // 14) ingresos por reserva / diseño
    if (inc("ach ", "reserva")) return mk("Ingreso por reserva", "rule", 0.6);
    if (inc("decoracion", "interiores", "fotografia")) return mk("Ingreso por servicio decoración de interiores", "rule", 0.6);

    // 15) gastos operativos genéricos por palabras frecuentes
    if (inc("gasto operativo", "gastos operativos", "insumos", "servicios", "pago servicios",
            "pago de servicios", "basura", "gas casco", "gas antigua", "gas ", "luz ", "luces",
            "parqueo", "multa", "uniformes", "viaticos", "tarjeta", "admon", "herramientas",
            "garrafones", "lancha", "compensacion")) {
      return mk("Gasto operativo", "rule", 0.55);
    }

    // sin coincidencia → revisión manual
    return { tag: "", category: "", source: null, confidence: 0 };

    function mk(tag, source, confidence) {
      return { tag: tag, category: categoryForTag(tag), source: source, confidence: confidence };
    }
  }

  function categoryForTag(tag) {
    if (!tag) return "";
    if (catForTag[tag]) return catForTag[tag];
    if (/^transferencia socio/i.test(tag)) return "Cobro por cuenta ajena";
    if (/^transferencia a (quetzales|dolares|gt)/i.test(tag)) return "Transferencias entre cuentas";
    if (/^renta /i.test(tag)) return "Gastos operativos";
    if (/^cleaning fee/i.test(tag)) return "Cleaning fee";
    return "Gastos operativos";
  }

  // lista completa de tags conocidos (referencia + aprendidos + socio genérico)
  function allTags() {
    const set = {};
    REFERENCE.forEach(([t]) => { set[t] = 1; });
    Object.values(LEARNED).forEach(t => { set[t] = 1; });
    return Object.keys(set).sort();
  }

  window.SpacioConta = {
    ACCOUNTS, accByNumber, REFERENCE, CATEGORIES, TAGS_BY_CATEGORY, PROPERTY_TOKENS,
    classify, categoryForTag, learn, learnBulk, allTags,
    norm, memoKey,
    accountById: (id) => ACCOUNTS.find(a => a.id === id) || null,
  };
})();
