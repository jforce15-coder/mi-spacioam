/**
 * PLANTILLA-CORREOS.gs — correos a socios de Spacio AM
 * ═══════════════════════════════════════════════════════════════════════════
 * Layout heredado del proyecto EPI. NO tocar emailShell_ — ahí vive el diseño.
 * Para un correo nuevo: copiar una de las funciones correo*() y cambiar piezas.
 *
 * CONFIGURACIÓN (los dos únicos valores que debes revisar):
 */
var EMAIL_IMG_BASE = "https://mi.spacioam.com/email-assets/";  // ← con diagonal final
var EMAIL_APP_URL  = "https://mi.spacioam.com";                // ← el dashboard
var EMAIL_FROM     = "Spacio AM";
var EMAIL_REPLY_TO = "hola@spacioam.com";
// Remitente. Para que salga de hola@spacioam.com y no de tu cuenta personal,
// ese correo debe estar dado de alta como ALIAS verificado en el Gmail que
// ejecuta el script (Gmail › Configuración › Cuentas › "Enviar como").
// Si el alias no existe, el script avisa en el Logger y envía desde la cuenta.
var EMAIL_SENDER   = "hola@spacioam.com";
var EMAIL_BCC      = "";        // opcional: copia oculta al admin
var EMAIL_DRY_RUN  = false;     // true = no envía, solo registra en el Logger

// hojas
var EM_TAB_SETUP    = "SETUP";
var EM_TAB_RESUMEN  = "Resumenconsolidado";
var EM_TAB_ARCHIVOS = "Archivos cargados";
var EM_TAB_LOG      = "Correos enviados";

// ═══════════════════════════════════════════════════════════════════════════
// 1 · EL SHELL (layout compartido)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Piezas (todas opcionales menos heading):
 *   eyebrow, heading, paras[], image, imageAlt, band, rows[[k,v]],
 *   stops[{n,titulo,meta,codigo,urgente}], cta{label,url}, footerNote,
 *   signoff, preheader
 */
function emailShell_(o) {
  o = o || {};
  var INK = "#3E3F3F", EARTH = "#938B8A", ALABASTER = "#FAFAFA",
      BEIGE = "#F5F3F0", WARM = "#D8D4CE", PEACH = "#E9826A";
  var SANS  = "'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif";
  var SERIF = "'Valky',Georgia,'Times New Roman',serif";
  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  var img = function (src) {
    return /^https?:\/\//i.test(src) ? src : EMAIL_IMG_BASE + src;
  };
  var B = [];   // bloques HTML
  var T = [];   // versión de texto plano (espejo de los bloques)

  // — preheader (lo que se lee en la bandeja antes de abrir)
  var pre = o.preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' +
      esc(o.preheader) + '&#8199;&#65279;'.repeat(60) + '</div>'
    : '';

  // — logo
  B.push(
    '<tr><td align="center" style="padding:44px 32px 34px;">' +
      '<img src="' + img("logo-wordmark.png") + '" width="132" alt="Spacio AM" ' +
      'style="display:block;border:0;width:132px;height:auto;">' +
    '</td></tr>');

  // — eyebrow
  if (o.eyebrow) {
    B.push('<tr><td align="center" style="padding:0 40px 12px;">' +
      '<div style="font-family:' + SANS + ';font-size:10px;font-weight:600;letter-spacing:0.32em;' +
      'text-transform:uppercase;color:' + (o.urgente ? PEACH : EARTH) + ';">' + esc(o.eyebrow) + '</div>' +
      '</td></tr>');
    T.push(String(o.eyebrow).toUpperCase());
  }

  // — heading
  B.push('<tr><td align="center" style="padding:0 40px 22px;">' +
    '<h1 style="margin:0;font-family:' + SERIF + ';font-weight:400;font-size:30px;line-height:1.25;' +
    'color:' + INK + ';letter-spacing:-0.01em;">' + esc(o.heading || "") + '</h1>' +
    '</td></tr>');
  T.push(o.heading || "");

  // — imagen hero
  if (o.image) {
    B.push('<tr><td style="padding:6px 32px 26px;">' +
      '<img src="' + img(o.image) + '" width="536" alt="' + esc(o.imageAlt || "") + '" ' +
      'style="display:block;border:0;width:100%;max-width:536px;height:auto;border-radius:18px;">' +
      '</td></tr>');
  }

  // — párrafos
  (o.paras || []).forEach(function (p) {
    B.push('<tr><td style="padding:0 44px 16px;">' +
      '<p style="margin:0;font-family:' + SANS + ';font-size:14px;line-height:1.85;letter-spacing:0.04em;' +
      'color:' + INK + ';">' + esc(p) + '</p></td></tr>');
    T.push(p);
  });

  // — franja delgada
  if (o.band) {
    B.push('<tr><td style="padding:12px 32px 24px;">' +
      '<img src="' + img(o.band) + '" width="536" alt="" ' +
      'style="display:block;border:0;width:100%;max-width:536px;height:auto;border-radius:14px;">' +
      '</td></tr>');
  }

  // — tabla de datos
  if (o.rows && o.rows.length) {
    var tr = o.rows.map(function (r, i) {
      var last = i === o.rows.length - 1;
      return '<tr>' +
        '<td style="padding:13px 0;border-bottom:' + (last ? 'none' : '1px solid ' + WARM) + ';' +
          'font-family:' + SANS + ';font-size:11px;letter-spacing:0.16em;text-transform:uppercase;' +
          'color:' + EARTH + ';">' + esc(r[0]) + '</td>' +
        '<td align="right" style="padding:13px 0;border-bottom:' + (last ? 'none' : '1px solid ' + WARM) + ';' +
          'font-family:' + SANS + ';font-size:15px;font-weight:600;letter-spacing:0.02em;' +
          'color:' + INK + ';">' + esc(r[1]) + '</td>' +
      '</tr>';
    }).join("");
    B.push('<tr><td style="padding:10px 44px 26px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'style="background:' + BEIGE + ';border-radius:16px;padding:6px 20px;">' + tr + '</table>' +
      '</td></tr>');
    o.rows.forEach(function (r) { T.push("  " + r[0] + ": " + r[1]); });
  }

  // — tarjetas numeradas
  if (o.stops && o.stops.length) {
    var cards = o.stops.map(function (s) {
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
        'style="margin-bottom:10px;background:' + ALABASTER + ';border:1px solid ' +
        (s.urgente ? PEACH : WARM) + ';border-radius:14px;"><tr>' +
        '<td width="46" align="center" valign="top" style="padding:16px 0 16px 16px;' +
          'font-family:' + SERIF + ';font-size:22px;color:' + (s.urgente ? PEACH : EARTH) + ';">' +
          esc(s.n) + '</td>' +
        '<td style="padding:16px 18px 16px 6px;">' +
          '<div style="font-family:' + SERIF + ';font-size:17px;color:' + INK + ';line-height:1.35;">' +
            esc(s.titulo) + '</div>' +
          (s.meta ? '<div style="margin-top:5px;font-family:' + SANS + ';font-size:11.5px;' +
            'letter-spacing:0.08em;color:' + EARTH + ';">' + esc(s.meta) + '</div>' : '') +
        '</td>' +
        (s.codigo ? '<td align="right" valign="top" style="padding:16px 18px 16px 0;font-family:' + SANS + ';' +
          'font-size:12px;font-weight:600;letter-spacing:0.08em;color:' + INK + ';">' + esc(s.codigo) + '</td>' : '') +
      '</tr></table>';
    }).join("");
    B.push('<tr><td style="padding:0 44px 22px;">' + cards + '</td></tr>');
    o.stops.forEach(function (s) {
      T.push("  " + s.n + ". " + s.titulo + (s.meta ? " — " + s.meta : "") + (s.codigo ? " [" + s.codigo + "]" : ""));
    });
  }

  // — botón
  if (o.cta && o.cta.url) {
    B.push('<tr><td align="center" style="padding:8px 44px 34px;">' +
      '<a href="' + esc(o.cta.url) + '" style="display:inline-block;background:' + INK + ';color:' + ALABASTER + ';' +
      'font-family:' + SANS + ';font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;' +
      'text-decoration:none;padding:15px 34px;border-radius:999px;">' + esc(o.cta.label || "Abrir") + '</a>' +
      '</td></tr>');
    T.push("");
    T.push((o.cta.label || "Abrir") + ": " + o.cta.url);
  }

  // — despedida
  if (o.signoff) {
    var lines = String(o.signoff).split("\n");
    B.push('<tr><td style="padding:0 44px 8px;">' +
      '<div style="font-family:' + SERIF + ';font-size:17px;color:' + INK + ';line-height:1.4;">' +
        esc(lines[0]) + '</div>' +
      (lines.length > 1 ? '<div style="margin-top:4px;font-family:' + SANS + ';font-size:12px;' +
        'letter-spacing:0.1em;color:' + EARTH + ';">' + esc(lines.slice(1).join(" · ")) + '</div>' : '') +
      '</td></tr>');
    T.push("");
    T.push(lines.join("\n"));
  }

  // — nota al pie
  if (o.footerNote) {
    B.push('<tr><td style="padding:20px 44px 0;">' +
      '<div style="border-top:1px solid ' + WARM + ';padding-top:16px;font-family:' + SANS + ';' +
      'font-size:11px;line-height:1.7;letter-spacing:0.05em;color:' + EARTH + ';">' +
      esc(o.footerNote) + '</div></td></tr>');
    T.push("");
    T.push(o.footerNote);
  }

  // — pie de marca
  B.push('<tr><td align="center" style="padding:32px 44px 46px;">' +
    '<div style="font-family:' + SANS + ';font-size:10px;letter-spacing:0.28em;text-transform:uppercase;' +
    'color:' + EARTH + ';">Spacio AM · Guatemala</div>' +
    '<div style="margin-top:8px;font-family:' + SANS + ';font-size:10.5px;letter-spacing:0.06em;color:' + EARTH + ';">' +
    EMAIL_REPLY_TO + '</div></td></tr>');

  var html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>@font-face{font-family:"Valky";src:url("' + EMAIL_IMG_BASE + 'Valky-Regular.otf") format("opentype");font-weight:400;font-display:swap}' +
    '@media (max-width:620px){.sa-w{width:100%!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:' + BEIGE + ';">' + pre +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="background:' + BEIGE + ';"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" class="sa-w" width="600" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:600px;max-width:600px;background:' + ALABASTER + ';border-radius:24px;overflow:hidden;">' +
    B.join("") + '</table></td></tr></table></body></html>';

  return { html: html, text: T.join("\n") + "\n\n— Spacio AM · " + EMAIL_REPLY_TO };
}

/** Envío con opciones estándar + registro en la hoja de log. */
function enviarCorreo_(para, asunto, shell, tipo) {
  if (!para) return false;
  if (EMAIL_DRY_RUN) { Logger.log("[DRY RUN] " + tipo + " → " + para + " · " + asunto); return true; }
  var opts = { htmlBody: shell.html, name: EMAIL_FROM, replyTo: EMAIL_REPLY_TO };
  if (EMAIL_BCC) opts.bcc = EMAIL_BCC;
  if (EMAIL_SENDER && em_aliasDisponible_(EMAIL_SENDER)) opts.from = EMAIL_SENDER;
  // GmailApp (no MailApp) es el único que respeta "from"
  GmailApp.sendEmail(para, asunto, shell.text, opts);
  registrarEnvio_(tipo, para, asunto);
  return true;
}

/** ¿está EMAIL_SENDER dado de alta como alias en esta cuenta? (se consulta una vez) */
var EM_ALIAS_CACHE = null;
function em_aliasDisponible_(dir) {
  if (EM_ALIAS_CACHE === null) {
    try { EM_ALIAS_CACHE = GmailApp.getAliases() || []; } catch (e) { EM_ALIAS_CACHE = []; }
  }
  var ok = EM_ALIAS_CACHE.indexOf(dir) >= 0;
  if (!ok) Logger.log('El alias "' + dir + '" no existe en esta cuenta. Alias disponibles: ' +
    (EM_ALIAS_CACHE.join(", ") || "ninguno") + '. Se enviará desde la cuenta que ejecuta el script.');
  return ok;
}

function registrarEnvio_(tipo, para, asunto) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(EM_TAB_LOG);
    if (!sh) { sh = ss.insertSheet(EM_TAB_LOG); sh.appendRow(["Fecha", "Tipo", "Para", "Asunto"]); }
    sh.appendRow([new Date(), tipo, para, asunto]);
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 · LOS CORREOS
// ═══════════════════════════════════════════════════════════════════════════

/** Cierre de mes: "ya están tus números". */
function correoCierreMes(d) {
  var rows = [];
  if (d.propiedad) rows.push(["Propiedad", d.propiedad]);
  if (d.facturar != null)  rows.push(["Monto a facturar", fmtUSD_(d.facturar)]);
  if (d.retencion)         rows.push(["Retención", "− " + fmtUSD_(d.retencion)]);
  if (d.deposito != null)  rows.push(["Monto a depositar", fmtUSD_(d.deposito)]);

  var shell = emailShell_({
    preheader: "Ya puedes revisar el resultado de " + (d.mes || "el mes") + ".",
    eyebrow: "Cierre de mes",
    heading: "El mes cerró. Aquí están tus números.",
    image: "hero-cierre-mes.jpg",
    imageAlt: "Un espacio en calma con luz de mañana",
    paras: [
      "Ya está listo el resultado de " + (d.mes || "este mes") + ". Puedes entrar a la plataforma cuando quieras y ver el detalle completo: reservas, ocupación, gastos y el respaldo de cada movimiento.",
      "Si algo no te cuadra, escríbenos y lo revisamos contigo.",
    ],
    rows: rows.length ? rows : null,
    cta: { label: "Ver mi reporte", url: EMAIL_APP_URL },
    signoff: "Gracias por confiarnos tu espacio.\nEquipo Spacio AM",
    footerNote: (d.listaPropiedades ? "Propiedades consideradas: " + d.listaPropiedades + ". " : "") +
      "Entras con tu correo y tu contraseña en " + EMAIL_APP_URL.replace(/^https?:\/\//, "") + ". Si la olvidaste, respóndenos este correo.",
  });
  return enviarCorreo_(d.email, "Tu reporte de " + (d.mes || "este mes") + " ya está listo", shell, "cierre-mes");
}

/** Recordatorio de facturas pendientes. urgente:true cambia el tono, no el layout. */
function correoRecordatorioFactura(d) {
  var meses = d.meses || (d.mes ? [d.mes] : []);
  var stops = meses.map(function (m, i) {
    return { n: i + 1, titulo: typeof m === "string" ? m : m.mes,
             meta: (typeof m === "object" && m.propiedad) ? m.propiedad : "Factura pendiente",
             urgente: !!d.urgente };
  });
  var rows = [];
  if (d.monto != null) rows.push(["Monto a facturar", fmtUSD_(d.monto)]);
  if (d.limite) rows.push(["Fecha límite", d.limite]);

  var shell = emailShell_({
    preheader: d.urgente ? "Quedan facturas pendientes de subir." : "Te falta subir una factura.",
    eyebrow: d.urgente ? "Última llamada" : "Recordatorio",
    urgente: !!d.urgente,
    heading: d.urgente
      ? "Aún nos falta tu factura."
      : "Te falta subir una factura.",
    band: "band-factura.jpg",
    paras: [
      d.urgente
        ? "Tienes " + (stops.length || 1) + " mes(es) sin factura cargada. Sin ella no podemos cerrar la contabilidad de tu propiedad."
        : "Para cerrar el mes necesitamos tu factura. Puedes subirla desde la plataforma en menos de un minuto.",
      "Entra, elige el mes y súbela desde el bloque de facturación.",
    ],
    stops: stops.length ? stops : null,
    rows: rows.length ? rows : null,
    cta: { label: "Subir factura", url: EMAIL_APP_URL },
    signoff: "Quedamos pendientes.\nEquipo Spacio AM",
    footerNote: "Si ya la subiste en los últimos minutos, ignora este mensaje.",
  });
  return enviarCorreo_(d.email, d.urgente ? "Última llamada: factura pendiente" : "Recordatorio: factura pendiente", shell, "recordatorio-factura");
}

function fmtUSD_(n) {
  var v = Number(n) || 0;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 · ENVÍOS MASIVOS (los que dispara el botón del panel de administración)
// ═══════════════════════════════════════════════════════════════════════════

function em_norm_(s) { return String(s || "").replace(/\s*-\s*/g, "-").trim(); }
function em_mesTexto_(mesISO) {
  var p = String(mesISO || "").split("-");
  var d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
  return d.toLocaleString("es-ES", { month: "long", year: "numeric" }).toLowerCase().trim();
}
function em_headerMap_(sh) {
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], m = {};
  h.forEach(function (x, i) { m[String(x).trim()] = i; m[String(x).trim().toLowerCase()] = i; });
  return m;
}

/** SETUP → [{code, email, secondary, props:[nombre]}] agrupado por socio. */
function em_socios_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EM_TAB_SETUP);
  if (!sh) throw new Error("No existe la hoja " + EM_TAB_SETUP);
  var data = sh.getDataRange().getValues();
  var head = data.shift().map(function (h) { return String(h).trim().toLowerCase(); });
  var iCode = head.indexOf("usuario id"), iMail = head.indexOf("user email"),
      iSec = head.indexOf("secondary user email"), iProp = head.indexOf("property_name");
  var by = {};
  data.forEach(function (r) {
    var code = em_norm_(r[iCode]); if (!code) return;
    var s = by[code] || (by[code] = { code: code, email: "", secondary: "", props: [] });
    if (!s.email && iMail >= 0 && r[iMail]) s.email = String(r[iMail]).trim();
    // la celda puede traer varios correos separados por coma: se acumulan todos
    if (iSec >= 0 && r[iSec]) s.secondary = em_mergeEmails_(s.secondary, r[iSec]);
    var p = em_norm_(r[iProp]); if (p && s.props.indexOf(p) < 0) s.props.push(p);
  });
  return Object.keys(by).map(function (k) { return by[k]; });
}

/** Une listas de correos separadas por coma, sin duplicados. */
function em_mergeEmails_(a, b) {
  var seen = {}, out = [];
  [a, b].forEach(function (v) {
    String(v == null ? "" : v).split(/[,;\n]+/).forEach(function (s) {
      s = s.trim(); if (s.indexOf("@") < 0) return;
      var k = s.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(s);
    });
  });
  return out.join(",");
}

/** Resumenconsolidado del mes → { property_name: {ingreso, deposito} } */
function em_resumenDelMes_(mesTexto) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EM_TAB_RESUMEN);
  var out = {};
  if (!sh) return out;
  var data = sh.getDataRange().getValues();
  var head = data.shift().map(function (h) { return String(h).trim().toLowerCase(); });
  var iProp = head.indexOf("property_name"), iMes = head.indexOf("mes"),
      iNeto = head.indexOf("ingreso neto"), iNeto2 = head.indexOf("ingreso neto 2");
  data.forEach(function (r) {
    if (String(r[iMes]).toLowerCase().trim() !== mesTexto) return;
    var neto = Number(r[iNeto]) || 0;
    var dep = iNeto2 >= 0 && r[iNeto2] !== "" ? Number(r[iNeto2]) : neto;
    // la retención vive implícita: es la diferencia entre lo facturado y lo depositado
    out[em_norm_(r[iProp])] = { ingreso: neto, deposito: dep, retencion: Math.max(0, neto - dep) };
  });
  return out;
}

/**
 * CORREO 1 — cierre de mes a TODOS los socios con resultado en ese mes.
 * mesISO: "2026-07". Si se omite, usa el mes anterior al actual.
 */
// ── Un solo reporte por socio y mes ─────────────────────────────────────────
// Registro en PropertiesService: EM_CIERRE_<AAAA-MM> = { socio: [fecha ISO, …] }.
// El administrador puede permitir temporalmente más de uno (EM_CIERRE_MULTI = "1")
// para reenviar un correo que no llegó; el toggle vuelve a apagarse solo tras
// el siguiente envío.
function em_cierreLog_(mesISO) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("EM_CIERRE_" + mesISO) || "{}"); } catch (e) { return {}; }
}
function em_cierreMarcar_(mesISO, code) {
  var log = em_cierreLog_(mesISO); (log[code] = log[code] || []).push(new Date().toISOString());
  PropertiesService.getScriptProperties().setProperty("EM_CIERRE_" + mesISO, JSON.stringify(log));
}
function em_multiPermitido_() { return PropertiesService.getScriptProperties().getProperty("EM_CIERRE_MULTI") === "1"; }
function em_setMulti(on) {
  PropertiesService.getScriptProperties().setProperty("EM_CIERRE_MULTI", on ? "1" : "0");
  return { ok: true, multi: !!on };
}
function em_mesISO_(mesISO) {
  if (mesISO) return String(mesISO).slice(0, 7);
  var n = new Date(); n.setMonth(n.getMonth() - 1);
  return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0");
}
/** Estado por socio para el mes: quién tiene datos, quién ya recibió, y el toggle. */
function em_cierreEstado(mesISO) {
  mesISO = em_mesISO_(mesISO);
  var mesTexto = em_mesTexto_(mesISO), resumen = em_resumenDelMes_(mesTexto), log = em_cierreLog_(mesISO);
  var socios = em_socios_().map(function (s) {
    var conDatos = s.props.filter(function (p) { return resumen[p]; });
    if (!conDatos.length) return null;
    var env = log[s.code] || [];
    var total = 0; conDatos.forEach(function (p) { total += resumen[p].deposito; });
    return { code: s.code, email: s.email, props: conDatos, deposito: total, enviados: env.length, ultimo: env.length ? env[env.length - 1] : "" };
  }).filter(Boolean);
  return { ok: true, mes: mesISO, mesTexto: mesTexto, multi: em_multiPermitido_(), socios: socios };
}
/**
 * CORREO 1 — cierre de mes. Sin "socio": a TODOS los pendientes del mes
 * (los que ya recibieron el suyo no reciben nada). Con "socio": solo a ese,
 * y solo si aún no lo recibió — salvo que el administrador haya permitido
 * más de uno, en cuyo caso se envía y el permiso se apaga.
 */
function enviarCierreMesATodos(mesISO, socio) {
  mesISO = em_mesISO_(mesISO);
  var mesTexto = em_mesTexto_(mesISO);
  var resumen = em_resumenDelMes_(mesTexto);
  var log = em_cierreLog_(mesISO), multi = em_multiPermitido_();
  var enviados = 0, sinCorreo = [], detalle = [], omitidos = [], usoMulti = false;

  em_socios_().forEach(function (s) {
    if (socio && s.code !== em_norm_(socio)) return;
    var conDatos = s.props.filter(function (p) { return resumen[p]; });
    if (!conDatos.length) return;
    if (!s.email) { sinCorreo.push(s.code); return; }
    if ((log[s.code] || []).length) {
      // ya recibió el reporte de este mes
      if (!(socio && multi)) { omitidos.push(s.code); return; }
      usoMulti = true;
    }

    // el correo es del SOCIO, no de una propiedad: se suman todas y se listan por nombre
    var facturar = 0, deposito = 0, retencion = 0;
    conDatos.forEach(function (p) {
      facturar += resumen[p].ingreso;
      deposito += resumen[p].deposito;
      retencion += resumen[p].retencion;
    });

    correoCierreMes({
      email: s.email + (s.secondary ? "," + s.secondary : ""),
      mes: mesTexto,
      propiedad: conDatos.length === 1 ? conDatos[0] : conDatos.length + " propiedades",
      listaPropiedades: conDatos.length > 1 ? conDatos.join(" · ") : "",
      facturar: facturar,
      deposito: deposito,
      retencion: retencion,
    });
    em_cierreMarcar_(mesISO, s.code);
    enviados++;
    detalle.push(s.code + " → " + s.email);
  });
  if (usoMulti) em_setMulti(false);   // la excepción es de un solo uso

  if (socio && !enviados && omitidos.length) return { ok: false, error: "ya-enviado", mes: mesTexto };
  var msg = "Cierre de mes (" + mesTexto + "): " + enviados + " correo(s) enviado(s)" +
    (omitidos.length ? " · YA TENÍAN: " + omitidos.join(", ") : "") +
    (sinCorreo.length ? " · SIN CORREO: " + sinCorreo.join(", ") : "");
  Logger.log(msg + "\n" + detalle.join("\n"));
  return { ok: true, enviados: enviados, omitidos: omitidos, sinCorreo: sinCorreo, mes: mesTexto, multi: em_multiPermitido_() };
}

/**
 * CORREO 2 — recordatorio a los socios con facturas pendientes.
 * Compara los meses con ingreso en Resumenconsolidado contra las facturas
 * registradas en "Archivos cargados" (tipo = factura).
 * hasta: "2026-07" — último mes que se exige. Por defecto, el mes anterior.
 */
function enviarRecordatoriosFactura(hasta, soloSocio) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!hasta) {
    var n = new Date(); n.setMonth(n.getMonth() - 1);
    hasta = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0");
  }

  // facturas ya cargadas: set de "propiedad|ym" y "socio|ym"
  var cargadas = {};
  var shA = ss.getSheetByName(EM_TAB_ARCHIVOS);
  if (shA) {
    var dA = shA.getDataRange().getValues();
    var hA = dA.shift().map(function (h) { return String(h).trim().toLowerCase(); });
    var iT = hA.indexOf("tipo"), iP = hA.indexOf("property_name"),
        iO = hA.indexOf("owner"), iY = hA.indexOf("ym");
    dA.forEach(function (r) {
      if (String(r[iT]).toLowerCase().trim() !== "factura") return;
      var ym = String(r[iY]).trim();
      if (iP >= 0 && r[iP]) cargadas[em_norm_(r[iP]) + "|" + ym] = true;
      if (iO >= 0 && r[iO]) cargadas["@" + em_norm_(r[iO]) + "|" + ym] = true;
    });
  }

  // meses con ingreso por propiedad
  var shR = ss.getSheetByName(EM_TAB_RESUMEN);
  var conIngreso = {};   // propiedad → [ym]
  if (shR) {
    var dR = shR.getDataRange().getValues();
    var hR = dR.shift().map(function (h) { return String(h).trim().toLowerCase(); });
    var iProp = hR.indexOf("property_name"), iMes = hR.indexOf("mes"), iNeto = hR.indexOf("ingreso neto");
    var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    dR.forEach(function (r) {
      if (!(Number(r[iNeto]) > 0)) return;
      var m = String(r[iMes]).toLowerCase().match(/([a-záéíóú]+)\D+(\d{4})/);
      if (!m) return;
      var mi = MESES.indexOf(m[1]); if (mi < 0) return;
      var ym = m[2] + "-" + String(mi + 1).padStart(2, "0");
      if (ym > hasta) return;
      var p = em_norm_(r[iProp]);
      (conIngreso[p] = conIngreso[p] || []).push(ym);
    });
  }

  var enviados = 0, sinCorreo = [];
  em_socios_().forEach(function (s) {
    // soloSocio: recordatorio dirigido a un socio desde la tabla de control
    if (soloSocio && em_norm_(s.code) !== em_norm_(soloSocio)) return;
    var faltan = [];
    s.props.forEach(function (p) {
      (conIngreso[p] || []).forEach(function (ym) {
        if (cargadas[p + "|" + ym] || cargadas["@" + s.code + "|" + ym]) return;
        faltan.push({ mes: em_mesTexto_(ym), propiedad: p, ym: ym });
      });
    });
    if (!faltan.length) return;
    if (!s.email) { sinCorreo.push(s.code); return; }
    faltan.sort(function (a, b) { return a.ym < b.ym ? -1 : 1; });

    correoRecordatorioFactura({
      email: s.email + (s.secondary ? "," + s.secondary : ""),
      meses: faltan.slice(0, 6),
      urgente: faltan.length > 2,
    });
    enviados++;
  });

  var msg = "Recordatorios de factura: " + enviados + " correo(s)" +
    (sinCorreo.length ? " · SIN CORREO: " + sinCorreo.join(", ") : "");
  Logger.log(msg);
  return { ok: true, enviados: enviados, sinCorreo: sinCorreo, hasta: hasta };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 · PRUEBA
// ═══════════════════════════════════════════════════════════════════════════
function correoDePrueba() {
  var yo = Session.getActiveUser().getEmail();
  correoCierreMes({
    email: yo, mes: "julio de 2026", propiedad: "2 propiedades",
    listaPropiedades: "Casa Zona 10 · Loft Cayalá",
    facturar: 2480.5, retencion: 110.74, deposito: 2369.76,
  });
  correoRecordatorioFactura({
    email: yo,
    meses: [{ mes: "junio de 2026", propiedad: "Casa Zona 10" },
            { mes: "julio de 2026", propiedad: "Casa Zona 10" }],
    urgente: false,
  });
  Logger.log("Dos correos de prueba enviados a " + yo + ". Ábrelos EN EL TELÉFONO.");
  Logger.log("Alias disponibles en esta cuenta: " + (GmailApp.getAliases().join(", ") || "ninguno"));
}
