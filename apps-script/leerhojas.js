/* ═══ LEER LA HOJA DE MI CON SESIÓN (Juan, 14-nov-2026) ══════════════════════════════════════════════════════════
   La hoja de Mi deja de estar compartida con «cualquiera con el enlace». Antes la app la leía desde el navegador
   (gviz CSV) y su id está en repos públicos: cualquiera podía ver SETUP (los correos de los socios) y los números del
   negocio. Ahora la app pide las pestañas aquí (acción «leerHojas»), y este script, que corre como el dueño de la hoja,
   las lee aunque la hoja sea privada.
   · Quién ve qué:
       – administrador principal (su sesión) y el robot (MI_ADMIN_TOKEN o la llave del robot): todo;
       – contador: todo (Contabilidad cruza todas las propiedades);
       – cualquier otro usuario de Mi (socio o ayudante de socio): solo lo de sus propiedades. Su cuenta se encuentra
         igual que en la app (sheets.js · fromProfile): su correo es el «User email» de la cuenta o uno de sus «secondary
         user email» (o su user_id es el «Usuario ID»). Gastos operativos y Contabilidad le llegan vacías.
       – sin sesión: { ok:false, error:"session" } (sa-sesion.js lo lleva al login).
   · Al socio también le llegan los meses del reporte y el tipo de cambio promedio de cada mes (sin nombres de otras
     propiedades), para que su pantalla salga igual que cuando bajaba la hoja entera.
   · Cada pestaña se lee una vez y queda en caché LH_TTL_ segundos (en trozos de 90 KB). Cualquier escritura desde la
     app la renueva al instante (sa_hojasDirty_ en doPost); «fresco: true» la salta (verificar algo recién escrito).
   · Cada pestaña sale como la daba el lector de hojas del login: gviz CSV con el permiso del dueño y, si gviz falla,
     getDisplayValues. SETUP sale siempre de getDisplayValues y sin las columnas de contraseña (como leerSetup).
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
var LH_PESTANAS_ = ["SETUP", "Resumenconsolidado", "DATABASE", "insumos & gastos", "TC", "Archivos cargados",
  "Gastos operativos", "Depositos cargados", "Contabilidad", "Facturas", "Contratos", "Long term"];
var LH_SOLO_ADMIN_ = { "Gastos operativos": 1, "Contabilidad": 1 };
var LH_TTL_ = 60, LH_TROZO_ = 90000;
var LH_MESES_ = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };

/* La acción. body.tabs = nombres de pestaña (de LH_PESTANAS_); sin tabs, todas. */
function leerHojasOp_(body, ses) {
  var rol = String((ses && ses.apps && ses.apps.mi) || "");
  var llave = PropertiesService.getScriptProperties().getProperty("MI_ADMIN_TOKEN");
  var todo = rol === "admin_principal" || rol === "contador" || esRobot_(body) || !!(llave && body.token === llave);
  if (!todo && !ses) return { ok: false, error: "session" };
  if (!todo && !rol) return { ok: false, error: "unauthorized" };   // tiene sesión, pero no acceso a Mi
  var pedidas = Array.isArray(body.tabs) && body.tabs.length ? body.tabs.map(String) : LH_PESTANAS_.slice();
  var malas = pedidas.filter(function (t) { return LH_PESTANAS_.indexOf(t) < 0; });
  if (malas.length) return { ok: false, error: "pestaña no permitida: " + malas.join(", ") };
  var t0 = Date.now(), ss = SpreadsheetApp.openById(SA_SHEET_ID);
  if (todo) return { ok: true, rol: rol || "robot", tabs: lhLeer_(ss, pedidas, !!body.fresco), ms: Date.now() - t0 };
  /* Socio: se leen también SETUP (para saber cuáles son sus propiedades), Resumen y TC (meses y tipo de cambio). */
  var leer = pedidas.slice();
  ["SETUP", "Resumenconsolidado", "TC"].forEach(function (t) { if (leer.indexOf(t) < 0) leer.push(t); });
  var crudas = lhLeer_(ss, leer, !!body.fresco), s = lhSuyo_(crudas.SETUP || [], ses), tabs = {};
  pedidas.forEach(function (t) { tabs[t] = lhFiltrar_(t, crudas[t] || [], s); });
  return { ok: true, rol: rol, filtrado: true, tabs: tabs, extra: lhExtra_(crudas), ms: Date.now() - t0 };
}

/* ── Lectura (con caché) ── { pestaña: filas } con filas = [[texto]] y la fila 0 de encabezado. */
function lhStamp_() { return PropertiesService.getScriptProperties().getProperty("SA_HOJAS_STAMP") || "0"; }
function sa_hojasDirty_() { PropertiesService.getScriptProperties().setProperty("SA_HOJAS_STAMP", String(Date.now())); }
function lhClave_(stamp, tab) { return "lh|" + stamp + "|" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, tab)).slice(0, 16); }
function lhCacheGet_(k) {
  try {
    var c = CacheService.getScriptCache(), n = Number(c.get(k + "_n") || 0); if (!n) return null;
    var ks = []; for (var i = 0; i < n; i++) ks.push(k + "_" + i);
    var got = c.getAll(ks), s = "";
    for (var j = 0; j < n; j++) { var p = got[k + "_" + j]; if (p == null) return null; s += p; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function lhCachePut_(k, filas) {
  try {
    var s = JSON.stringify(filas); if (s.length > LH_TROZO_ * 60) return;
    var n = Math.ceil(s.length / LH_TROZO_) || 1, m = {};
    for (var i = 0; i < n; i++) m[k + "_" + i] = s.substr(i * LH_TROZO_, LH_TROZO_);
    m[k + "_n"] = String(n);
    CacheService.getScriptCache().putAll(m, LH_TTL_);
  } catch (e) { console.warn("lhCachePut_: " + e); }
}
function lhLeer_(ss, tabs, fresco) {
  var stamp = lhStamp_(), out = {}, faltan = [];
  tabs.forEach(function (t) { var c = fresco ? null : lhCacheGet_(lhClave_(stamp, t)); if (c) out[t] = c; else faltan.push(t); });
  if (!faltan.length) return out;
  var hojas = {};
  ss.getSheets().forEach(function (sh) { hojas[sh.getName().trim().toLowerCase()] = sh; });
  var porGviz = [];
  faltan.forEach(function (t) {
    var sh = hojas[t.toLowerCase()];
    if (!sh) out[t] = [];                                  // la pestaña no existe: vacía (gviz devolvía la primera)
    else if (t === SA_TAB_SETUP) out[t] = lhSinClaves_(sh.getDataRange().getDisplayValues());
    else porGviz.push({ t: t, sh: sh });
  });
  if (porGviz.length) {
    var tok = ScriptApp.getOAuthToken(), res = [];
    try {
      res = ufAll_(porGviz.map(function (g) {
        return { url: "https://docs.google.com/spreadsheets/d/" + SA_SHEET_ID + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(g.sh.getName()), headers: { Authorization: "Bearer " + tok }, muteHttpExceptions: true, followRedirects: true };
      }));
    } catch (e) { console.warn("lhLeer_ gviz: " + e); res = []; }
    porGviz.forEach(function (g, i) {
      var txt = "";
      try { if (res[i] && res[i].getResponseCode() === 200) txt = res[i].getContentText(); } catch (e) {}
      var filas = null;
      if (txt && !/^\s*</.test(txt)) { try { filas = Utilities.parseCsv(txt); } catch (e) { filas = null; } }
      out[g.t] = filas || g.sh.getDataRange().getDisplayValues();
    });
  }
  faltan.forEach(function (t) { lhCachePut_(lhClave_(stamp, t), out[t]); });
  return out;
}
function lhSinClaves_(v) {
  if (!v || !v.length) return [];
  var quitar = v[0].map(function (h) { return sa_esColClave_(h); });
  return v.map(function (row) { return row.filter(function (_, i) { return !quitar[i]; }).map(function (x) { return String(x); }); });
}

/* ── Lo del socio: sus propiedades, armadas igual que build() en sheets.js ── */
function lhNorm_(s) { return String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[–—]/g, "-").replace(/[^a-z0-9\-]/g, ""); }
function lhPartes_(name) {
  var p = String(name || "").split(/\s*-\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (p.length >= 3) return { zona: p[0], edificio: p[1], apto: p.slice(2).join(" - ") };
  if (p.length === 2) return { zona: p[0], edificio: p[1], apto: "" };
  return { zona: p[0] || name, edificio: "", apto: "" };
}
function lhCorreos_(v) { return String(v || "").split(/[,;\n]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(function (s) { return s.indexOf("@") >= 0; }); }
function lhCol_(head, nombres) {
  for (var i = 0; i < nombres.length; i++) { var k = head.indexOf(nombres[i]); if (k >= 0) return k; }
  var bajos = head.map(function (h) { return h.toLowerCase(); });
  for (var j = 0; j < nombres.length; j++) { var q = bajos.indexOf(nombres[j].toLowerCase()); if (q >= 0) return q; }
  return -1;
}
function lhCab_(filas) { return ((filas && filas[0]) || []).map(function (h) { return String(h == null ? "" : h).trim(); }); }

function lhSuyo_(setup, ses) {
  var head = lhCab_(setup), cPid = head.indexOf("property_id"), cNom = head.indexOf("property_name"), cCod = head.indexOf("Usuario ID"),
      cMail = head.indexOf("User email"), cSec = head.indexOf("secondary user email");
  var s = { nms: {}, pids: {}, codigos: {}, duenos: {}, primero: {}, porNombre: {}, porSuelto: {}, cSetup: { pid: cPid, nom: cNom, cod: cCod, mail: cMail, sec: cSec } };
  if (cPid < 0 || cNom < 0 || cCod < 0) return s;
  var info = {}, nombresDe = {};
  for (var i = 1; i < setup.length; i++) {
    var r = setup[i], pid = String(r[cPid] || "").trim(), name = String(r[cNom] || "").trim(), code = String(r[cCod] || "").trim();
    if (!pid || !name || !code) continue;
    var nm = lhNorm_(name), ci = info[code] = info[code] || { email: "", sec: [] };
    if (!ci.email && cMail >= 0 && String(r[cMail] || "").trim()) ci.email = String(r[cMail]).trim().toLowerCase();
    if (cSec >= 0) lhCorreos_(r[cSec]).forEach(function (e) { if (ci.sec.indexOf(e) < 0) ci.sec.push(e); });
    if (!(nm in s.primero)) {
      s.primero[nm] = code; s.porNombre[nm] = nm; (nombresDe[code] = nombresDe[code] || []).push(nm);
      var lp = lhPartes_(name);
      if (lp.edificio && lp.apto && !s.porSuelto[lhNorm_(lp.edificio + lp.apto)]) s.porSuelto[lhNorm_(lp.edificio + lp.apto)] = nm;
      if (lp.zona && lp.apto && !s.porSuelto[lhNorm_(lp.zona + lp.apto)]) s.porSuelto[lhNorm_(lp.zona + lp.apto)] = nm;
    }
  }
  /* Cuentas: los códigos que comparten correo principal son una sola cuenta (como en la app). */
  var cuentas = {};
  Object.keys(nombresDe).forEach(function (code) {
    var ci = info[code], key = ci.email || code.toLowerCase(), a = cuentas[key] = cuentas[key] || { email: ci.email, codes: [], sec: [] };
    a.codes.push(code); ci.sec.forEach(function (e) { if (a.sec.indexOf(e) < 0) a.sec.push(e); });
  });
  var mios = [String((ses && ses.email) || "").trim().toLowerCase()].concat(lhCorreos_(ses && ses.email_alterno)).filter(Boolean);
  var uid = String((ses && (ses.user_id || ses.userId)) || "").trim().toLowerCase();
  Object.keys(cuentas).forEach(function (k) {
    var a = cuentas[k];
    var es = (a.email && mios.indexOf(a.email) >= 0) || a.sec.some(function (e) { return mios.indexOf(e) >= 0; })
      || (uid && a.codes.some(function (c) { return c.toLowerCase() === uid; }));
    if (!es) return;
    a.codes.forEach(function (c) {
      s.codigos[c] = 1; s.duenos[lhNorm_(c)] = 1;
      (nombresDe[c] || []).forEach(function (nm) { s.nms[nm] = 1; });
    });
    if (a.email) s.duenos[lhNorm_(a.email.split("@")[0])] = 1;   // en «Archivos cargados» el socio va por código o por nombre
  });
  for (var j = 1; j < setup.length; j++) {
    var rr = setup[j], p2 = String(rr[cPid] || "").trim();
    if (p2 && s.nms[lhNorm_(rr[cNom])]) s.pids[p2] = 1;
  }
  return s;
}

/* Las filas de una pestaña que le tocan al socio (la fila 0, el encabezado, siempre va). */
function lhFiltrar_(tab, filas, s) {
  if (!filas || !filas.length) return [];
  var head = lhCab_(filas), cuerpo = filas.slice(1), si;
  var prop = function (c) { return function (r) { return c >= 0 && !!s.nms[lhNorm_(r[c])]; }; };
  if (LH_SOLO_ADMIN_[tab]) si = function () { return false; };
  else if (tab === "SETUP") {
    var c = s.cSetup;
    return [filas[0]].concat(cuerpo.filter(function (r) { return s.nms[lhNorm_(r[c.nom])] && String(r[c.pid] || "").trim() && String(r[c.cod] || "").trim(); })
      .map(function (r) {   // otra fila de un apartamento suyo (otro código): sin los correos de esa otra persona
        if (s.codigos[String(r[c.cod]).trim()]) return r;
        var x = r.slice(); if (c.mail >= 0) x[c.mail] = ""; if (c.sec >= 0) x[c.sec] = ""; return x;
      }));
  }
  else if (tab === "Resumenconsolidado") {
    var cc = lhCol_(head, ["Usuario ID"]), cn = lhCol_(head, ["Property_name", "property_name"]);
    si = function (r) { var nm = lhNorm_(r[cn]); return cn >= 0 && !!s.nms[nm] && String(r[cc] || "").trim() === s.primero[nm]; };
  }
  else if (tab === "DATABASE") { var cp = lhCol_(head, ["property_id"]); si = function (r) { return cp >= 0 && !!s.pids[String(r[cp] || "").trim()]; }; }
  else if (tab === "insumos & gastos") {
    si = function (r) {   // el nombre está en la 3.ª columna; mismo emparejamiento suelto que la app (Z10-Ignacio-506)
      var n = String(r[2] || "").trim(); if (!n) return false;
      var lp = lhPartes_(n), nm = s.porNombre[lhNorm_(n)]
        || (lp.edificio && lp.apto && s.porSuelto[lhNorm_(lp.edificio + lp.apto)])
        || (lp.zona && lp.apto && s.porSuelto[lhNorm_(lp.zona + lp.apto)]);
      return !!(nm && s.nms[nm]);
    };
  }
  else if (tab === "Archivos cargados") {
    var cpn = lhCol_(head, ["property_name"]), cs = lhCol_(head, ["scope"]), co = lhCol_(head, ["owner"]);
    si = function (r) {
      var esSocio = cs >= 0 && String(r[cs] || "").trim().toLowerCase() === "owner";
      return esSocio ? (co >= 0 && !!s.duenos[lhNorm_(r[co])]) : prop(cpn)(r);
    };
  }
  else si = prop(lhCol_(head, ["property_name", "Property_name", "propiedad", "property"]));   // TC, depósitos, facturas, contratos, long term
  return [filas[0]].concat(cuerpo.filter(si));
}

/* Lo que el socio necesita de las demás propiedades sin verlas: los meses del reporte y el TC promedio de cada mes. */
function lhMes_(v) {
  var m = String(v || "").toLowerCase().trim().match(/([a-záéíóú]+)\s+de\s+(\d{4})/);
  if (!m || LH_MESES_[m[1]] == null) return "";
  return m[2] + "-" + LH_MESES_[m[1]];
}
function lhNum_(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
function lhExtra_(crudas) {
  var meses = {}, res = crudas.Resumenconsolidado || [], cm = lhCol_(lhCab_(res), ["Mes"]);
  for (var i = 1; i < res.length; i++) { var k = lhMes_(res[i][cm]); if (cm >= 0 && k && !meses[k]) meses[k] = String(res[i][cm]).trim(); }
  var tc = crudas.TC || [], h = lhCab_(tc), cp = lhCol_(h, ["Property_name"]), cmt = lhCol_(h, ["Mes"]), cv = lhCol_(h, ["Valor"]), suma = {};
  for (var j = 1; j < tc.length; j++) {
    var r = tc[j], km = cmt >= 0 ? lhMes_(r[cmt]) : "", v = cv >= 0 ? lhNum_(r[cv]) : 0;
    if (cp < 0 || !lhNorm_(r[cp]) || !km || !v) continue;
    (suma[km] = suma[km] || []).push(v);
  }
  var tcMes = {};
  Object.keys(suma).forEach(function (k) { tcMes[k] = suma[k].reduce(function (a, b) { return a + b; }, 0) / suma[k].length; });
  return { meses: Object.keys(meses).map(function (k) { return meses[k]; }), tcMes: tcMes };
}
