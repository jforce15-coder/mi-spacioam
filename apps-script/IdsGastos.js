// ============================================================
// Ids de «insumos & gastos» (nov 2026)
//
// Cada gasto tiene en N..R su bloque de ids: tag · orderId · orderUrl · authProductos · authTarifa.
// La app edita y borra un gasto buscando su orderId. A inicios de noviembre alguien ordenó solo A..F
// (Mes · Fecha · propiedad · valor · categoria · Comentario) sin N..R, y muchos bloques quedaron en la
// fila de otro gasto. Este archivo trae:
//   1. sa_insumoVerificado_: antes de editar o borrar, revisa que la fila sea el gasto que la app vio
//      (misma propiedad, mismo valor y, si viene, el mismo mes). Si no, no toca nada.
//   2. sa_repararIdsGastos_: una sola vez (propiedad GASTOS_IDS_V1) devuelve cada bloque a su fila
//      cuando hay UNA sola fila posible. Nunca cambia A..F, nunca borra filas, nunca repite un id.
//      Cada cambio queda en la pestaña «Reparación de ids de gastos».
//   3. Ids retirados (GASTOS_IDS_RETIRADOS): los que salieron de una fila sin tener otra segura.
//      sa_appendInsumos y sa_linkFacturas los cuentan como ya guardados, para que un gasto programado
//      o una factura no se vuelva a crear en otra fila.
// ============================================================

var SA_GID_FLAG = "GASTOS_IDS_V1";
var SA_GID_RETIRADOS = "GASTOS_IDS_RETIRADOS";
var SA_GID_TAB = "Reparación de ids de gastos";
var SA_GID_BLOQUE = ["tag", "orderId", "orderUrl", "authProductos", "authTarifa"];

// ---------- comparaciones ----------
// Propiedad sin mayúsculas, tildes, espacios ni guiones: «Z4 - Rue - 301» = «z4-rue-301».
function sa_propClave_(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
// Valor en centavos (número o texto «Q 1,650.00»). NaN si no es un número.
function sa_valorCent_(v) {
  if (v === "" || v == null) return NaN;
  var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? NaN : Math.round(n * 100);
}
// Día «yyyy-MM-dd» de una celda de fecha (Date o texto). "" si no se entiende.
function sa_diaDe_(v) {
  if (v && v.getTime) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var s = String(v || "").trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return "";
}
function sa_diasEntre_(a, b) {   // b - a, en días
  var p = a.split("-"), q = b.split("-");
  return Math.round((Date.UTC(+q[0], +q[1] - 1, +q[2]) - Date.UTC(+p[0], +p[1] - 1, +p[2])) / 86400000);
}
// El orderId que sa_recurApply_ le pone a un gasto programado (regla, mes yyyy-MM, propiedad).
function sa_recurOrderId_(id, ym, prop) {
  return "REC-" + id + "-" + ym + "-" + sa_pnorm_(prop).replace(/[^a-z0-9]+/g, "-");
}
// El orderId que reportes-import.js le pone a un reporte de mantenimiento ([REP:id]).
function sa_repOrderId_(id) { return "REP-" + String(id || "").replace(/[^A-Za-z0-9]+/g, "-"); }
// El orderId que le toca a una fila por su comentario ([REC:regla] o [REP:id]); "" si no tiene marca.
function sa_idEsperado_(comentario, fecha, prop) {
  var c = String(comentario || ""), m;
  if ((m = c.match(/\[REC:([^\]]+)\]/))) { var ym = sa_ym_(fecha); return ym ? sa_recurOrderId_(m[1], ym, prop) : ""; }
  if ((m = c.match(/\[REP:([^\]]+)\]/))) return sa_repOrderId_(m[1]);
  return "";
}

// ---------- ids retirados ----------
function sa_idsRetirados_() {
  var o = {};
  try { (JSON.parse(PropertiesService.getScriptProperties().getProperty(SA_GID_RETIRADOS) || "[]") || []).forEach(function (k) { if (k) o[String(k)] = true; }); } catch (e) {}
  return o;
}

// ---------- 1. seguridad al editar / borrar ----------
// body.orderId + body.antes = { property_name, valor, mes } tal como la app vio el gasto.
// Devuelve { map, row } con la fila correcta, o { error } sin tocar nada.
function sa_insumoVerificado_(sh, body) {
  var map = sa_headerMap(sh);
  var want = String(body.orderId || "").trim();
  if (!want) return { error: "Falta el id del gasto; no lo toqué." };
  var oidCol = map["orderId"];
  if (oidCol == null) return { error: "La hoja no tiene la columna orderId; no lo toqué." };
  var a = body.antes;
  if (!a || a.property_name == null || a.valor == null || a.valor === "")
    return { error: "Actualiza la página y vuelve a intentar: la app no dijo qué gasto era, así que no lo toqué.", code: "sin_antes" };
  var data = sh.getDataRange().getValues();
  var filas = [];
  for (var r = 1; r < data.length; r++) if (String(data[r][oidCol] || "").trim() === want) filas.push(r);
  if (!filas.length) return { error: "No se encontró el gasto (orderId " + want + ")" };
  var wP = sa_propClave_(a.property_name), wV = sa_valorCent_(a.valor);
  var wMes = String(a.mes == null ? "" : a.mes).trim(), mYm = wMes.match(/^(\d{4})-(\d{1,2})$/);
  function esElMismo(r) {
    var row = data[r];
    if (sa_propClave_(row[map["property_name"]]) !== wP) return false;
    var v = sa_valorCent_(row[map["valor"]]);
    if (isNaN(v) || isNaN(wV) || Math.abs(v - wV) > 1) return false;
    if (wMes) {
      var dia = map["Fecha de pedido"] != null ? sa_diaDe_(row[map["Fecha de pedido"]]) : "";
      if (dia && mYm) { if (dia.slice(0, 7) !== mYm[1] + "-" + ("0" + mYm[2]).slice(-2)) return false; }
      else {
        var mesFila = dia ? +dia.slice(5, 7) : parseInt(row[map["Mes"]], 10);
        var mesApp = mYm ? +mYm[2] : parseInt(wMes, 10);
        if (mesFila && mesApp && mesFila !== mesApp) return false;
      }
    }
    return true;
  }
  for (var i = 0; i < filas.length; i++) if (esElMismo(filas[i])) return { map: map, row: filas[i] + 1 };
  return { error: "Ese gasto cambió de fila; no lo toqué. Actualiza la lista y vuelve a intentar.", code: "fila_cambio" };
}

// ---------- 2. reparación (una sola vez) ----------
// opts.simular = true: calcula todo y devuelve el resumen sin escribir nada (ni la marca).
function sa_repararIdsGastos_(ss, opts) {
  opts = opts || {};
  var P = PropertiesService.getScriptProperties();
  if (P.getProperty(SA_GID_FLAG) && !opts.simular) return { ok: true, yaHecho: true, cuando: P.getProperty(SA_GID_FLAG) };
  var sh = ss.getSheetByName(SA_TAB_INSUMOS);
  if (!sh) return { ok: false, error: "No existe la hoja '" + SA_TAB_INSUMOS + "'" };
  var map = sa_headerMap(sh);
  var need = ["Fecha de pedido", "property_name", "valor", "Comentario"].concat(SA_GID_BLOQUE);
  for (var q = 0; q < need.length; q++) if (map[need[q]] == null) return { ok: false, error: "Falta la columna " + need[q] };
  var data = sh.getDataRange().getValues();
  var cF = map["Fecha de pedido"], cP = map["property_name"], cV = map["valor"], cC = map["Comentario"];
  var cols = SA_GID_BLOQUE.map(function (h) { return map[h]; }), cO = map["orderId"];
  var txt = function (v) { return String(v == null ? "" : v).trim(); };

  // A..F de cada fila (no se tocan) y el id que le toca por su comentario
  var filas = {}, porEsperado = {};
  for (var r = 1; r < data.length; r++) {
    var f = { r: r, dia: sa_diaDe_(data[r][cF]), ym: sa_ym_(data[r][cF]), prop: sa_propClave_(data[r][cP]), cent: sa_valorCent_(data[r][cV]),
      esperado: sa_idEsperado_(data[r][cC], data[r][cF], data[r][cP]) };
    filas[r] = f;
    if (f.esperado) (porEsperado[f.esperado] = porEsperado[f.esperado] || []).push(r);
  }
  // bloques: cada fila con orderId
  var bloques = [], cuantas = {};
  for (var r1 = 1; r1 < data.length; r1++) {
    var id = txt(data[r1][cO]); if (!id) continue;
    cuantas[id] = (cuantas[id] || 0) + 1;
    bloques.push({ desde: r1, id: id, vals: cols.map(function (c) { return data[r1][c]; }), tipo: sa_gidTipo_(id) });
  }
  // evidencia de fuera: Facturas (auth → total, fecha, propiedad) y Archivos cargados (orderId → propiedad, mes)
  var fact = sa_gidFacturas_(ss), arch = sa_gidArchivos_(ss);

  // Paso 1: qué dice la prueba de cada bloque sobre la fila donde está.
  //   bien = es su fila (no se mueve y nadie más la puede tomar) · mal = probadamente NO es su fila
  //   duda = puede ser su fila o no (se queda, salvo que una prueba fuerte de otro bloque reclame esa fila)
  var fijo = {}, porFila = {};
  bloques.forEach(function (b) {
    var f = filas[b.desde];
    porFila[b.desde] = b;
    b.ev = null;
    if (cuantas[b.id] > 1) { b.estado = "bien"; fijo[b.desde] = true; b.motivo = "id repetido en la hoja: no se toca"; return; }
    if (b.tipo === "REC" || b.tipo === "REP") {
      if (f.esperado === b.id) { b.estado = "bien"; fijo[b.desde] = true; } else b.estado = "mal";
      return;
    }
    if (f.esperado) { b.estado = "mal"; }   // una fila con [REC:…]/[REP:…] solo puede tener ese id
    if (b.tipo === "HEX") b.ev = sa_gidEvFactura_(b, cols, fact);
    else if (b.tipo === "MAN") { var mm = b.id.match(/^MAN-(\d{4}-\d{2}-\d{2})-/); b.ev = mm ? { dia: mm[1], archivo: arch[b.id] || null } : null; }
    else if (b.tipo === "DEP") b.ev = arch[b.id] || null;
    if (b.estado) return;
    if (!b.ev) { b.estado = "duda"; return; }
    if (b.tipo === "HEX") b.estado = sa_gidCoincideFactura_(f, b.ev) ? "duda" : "mal";
    else if (b.tipo === "MAN") b.estado = (f.dia === b.ev.dia && sa_gidCoincideArchivo_(f, b.ev.archivo)) ? "duda" : "mal";
    else b.estado = sa_gidCoincideArchivo_(f, b.ev) ? "duda" : "mal";
  });
  var tomadas = {}, conflicto = {};
  function reclamar(b, fila) { if (tomadas[fila]) conflicto[fila] = true; else tomadas[fila] = b; b.hacia = fila; }
  function candidatas(prueba, b) {
    var out = [];
    for (var k in filas) { var fk = filas[k]; if (!fk.esperado && !(fijo[fk.r] && fk.r !== b.desde) && !tomadas[fk.r] && prueba(fk)) out.push(fk.r); }
    return out;
  }

  // Paso 2a: REC / REP → la fila con su marca, si es UNA sola. Si no hay (o hay dos), sale de donde está.
  bloques.forEach(function (b) {
    if ((b.tipo !== "REC" && b.tipo !== "REP") || b.estado !== "mal") return;
    var rs = porEsperado[b.id] || [];
    if (rs.length === 1 && !fijo[rs[0]]) reclamar(b, rs[0]);
    else { b.retirar = true; b.motivo = rs.length > 1 ? rs.length + " filas tienen la misma marca" : "ninguna fila tiene su marca"; }
  });
  // Rondas: cada bloque busca su ÚNICA fila posible. Una fila que ya es de otro gasto deja de ser posible,
  // así que se repite hasta que nada cambie. Si dos bloques quieren la misma fila, ninguno se la lleva.
  var vetada = {};
  function rondas(lista, prueba, puedeEntrar) {
    var cambio = true;
    while (cambio) {
      cambio = false;
      var quiere = {};
      lista.forEach(function (b) {
        if (b.hecho) return;
        var c = candidatas(function (fk) { return !vetada[fk.r] && prueba(b, fk); }, b);
        b.cands = c.length;
        if (c.length === 1 && (c[0] === b.desde || puedeEntrar(c[0]))) (quiere[c[0]] = quiere[c[0]] || []).push(b);
      });
      Object.keys(quiere).forEach(function (k) {
        var bs = quiere[k], fila = +k; cambio = true;
        if (bs.length > 1) { vetada[fila] = true; bs.forEach(function (b) { b.hecho = true; b.motivo = "otro id quiere la misma fila"; }); return; }
        var b = bs[0]; b.hecho = true;
        if (fila === b.desde) { b.estado = "bien"; fijo[fila] = true; } else reclamar(b, fila);
      });
    }
  }
  // Paso 2b: facturas → la ÚNICA fila con ese valor y esa fecha (y esa propiedad, si la factura la dice).
  rondas(bloques.filter(function (b) { return b.tipo === "HEX" && b.ev && b.estado !== "bien"; }),
    function (b, fk) { return sa_gidCoincideFactura_(fk, b.ev); },
    function () { return true; });
  // Paso 2c: gastos manuales (MAN, por su día) y comprobantes (DEP, por Archivos cargados): prueba débil,
  //   así que solo se mueven si están probadamente mal, a la ÚNICA fila posible, y solo si esa fila está vacía
  //   o lo que tiene está mal o se va.
  bloques.forEach(function (b) { if ((b.tipo === "MAN" || b.tipo === "DEP") && tomadas[b.desde]) b.estado = "mal"; });   // su fila es de una factura o un REC
  rondas(bloques.filter(function (b) { return (b.tipo === "MAN" || b.tipo === "DEP") && b.ev && b.estado === "mal"; }),
    function (b, fk) { return b.tipo === "MAN" ? (fk.dia === b.ev.dia && sa_gidCoincideArchivo_(fk, b.ev.archivo)) : sa_gidCoincideArchivo_(fk, b.ev); },
    function (fila) { var ahi = porFila[fila]; return !ahi || ahi.estado === "mal" || ahi.hacia != null; });
  // dos bloques para la misma fila: ninguno se mueve (y un REC/REP que ya no entra, sale igual)
  bloques.forEach(function (b) {
    if (b.hacia == null || !conflicto[b.hacia]) return;
    b.hacia = null;
    if (b.tipo === "REC" || b.tipo === "REP") { b.retirar = true; b.motivo = "otro id quiere la misma fila"; }
  });
  Object.keys(conflicto).forEach(function (k) { delete tomadas[k]; });

  // Paso 3: el resultado. Lo que llega a una fila desplaza lo que había, si eso no se va a otra fila.
  var nuevo = {}, motivo = {}, retirados = [];
  bloques.forEach(function (b) { if (b.hacia != null) { nuevo[b.hacia] = b.vals; motivo[b.hacia] = sa_gidPorQue_(b) + " (venía de la fila " + (b.desde + 1) + ")"; } });
  bloques.forEach(function (b) {
    var llega = Object.prototype.hasOwnProperty.call(nuevo, b.desde) && nuevo[b.desde] !== null;
    if (b.hacia != null) { if (!llega) { nuevo[b.desde] = null; motivo[b.desde] = "se fue a la fila " + (b.hacia + 1); } return; }
    if (!b.retirar && llega) { b.retirar = true; b.motivo = "su fila es de otro gasto y no hay otra fila segura"; }
    if (!b.retirar) return;
    retirados.push(b);
    if (llega) motivo[b.desde] += " · sale " + b.id + ": " + b.motivo;
    else { nuevo[b.desde] = null; motivo[b.desde] = "sale " + b.id + ": " + b.motivo; }
  });
  // Una fila que tenía id sigue teniendo uno: si su bloque se fue y no llegó otro, recibe un id nuevo
  // (GID-…, no lo usa nadie más), así se puede seguir editando desde la app con la revisión de arriba.
  var semilla = "GID-" + Date.now().toString(36) + "-", idsNuevos = 0;
  Object.keys(nuevo).forEach(function (k) {
    if (nuevo[k] !== null) return;
    var v = cols.map(function () { return ""; }); v[1] = semilla + (+k + 1);
    nuevo[k] = v; idsNuevos++; motivo[k] += " · queda con id nuevo " + v[1];
  });
  // nunca un id repetido
  var final = {};
  for (var r2 = 1; r2 < data.length; r2++) {
    var v2 = Object.prototype.hasOwnProperty.call(nuevo, r2) ? nuevo[r2] : cols.map(function (c) { return data[r2][c]; });
    var id2 = v2 ? txt(v2[1]) : "";
    if (!id2) continue;
    if (final[id2]) return { ok: false, error: "La reparación repetiría el id " + id2 + "; no escribí nada." };
    final[id2] = true;
  }

  // resumen por tipo
  var res = {};
  bloques.forEach(function (b) {
    var t = res[b.tipo] = res[b.tipo] || { total: 0, bien: 0, movidos: 0, retirados: 0, quedan: 0 };
    t.total++;
    if (b.hacia != null) t.movidos++;
    else if (b.retirar) t.retirados++;
    else if (b.estado === "bien") t.bien++;
    else {
      t.quedan++;
      var por = !b.ev ? "sinPrueba" : b.estado === "duda" ? "puedeSerSuya" : (b.cands > 1 ? "variasFilas" : "ningunaFila");
      t[por] = (t[por] || 0) + 1;
    }
  });
  var conMarca = 0, conMarcaBien = 0;
  Object.keys(filas).forEach(function (k) {
    var fk = filas[k]; if (!fk.esperado) return; conMarca++;
    var v3 = Object.prototype.hasOwnProperty.call(nuevo, k) ? nuevo[k] : cols.map(function (c) { return data[k][c]; });
    if (v3 && txt(v3[1]) === fk.esperado) conMarcaBien++;
  });
  var cambios = Object.keys(nuevo).map(Number).sort(function (a, b) { return a - b; });
  var out = { ok: true, simulado: !!opts.simular, porTipo: res, filasCambiadas: cambios.length, idsNuevos: idsNuevos,
    filasConMarca: conMarca, filasConMarcaConSuId: conMarcaBien, retirados: retirados.length };
  if (opts.detalle) out.detalle = cambios.map(function (k) { return { fila: k + 1, antes: sa_gidTexto_(cols.map(function (c) { return data[k][c]; })), despues: sa_gidTexto_(nuevo[k]), motivo: motivo[k] || "" }; });
  if (opts.simular) return out;

  // Paso 4: escribir. Solo N..R, una columna a la vez, solo el tramo de filas que cambia.
  if (cambios.length) {
    var lo = cambios[0], hi = cambios[cambios.length - 1];
    cols.forEach(function (c, j) {
      var vals = [];
      for (var r3 = lo; r3 <= hi; r3++) vals.push([Object.prototype.hasOwnProperty.call(nuevo, r3) ? (nuevo[r3] ? nuevo[r3][j] : "") : data[r3][c]]);
      sh.getRange(lo + 1, c + 1, vals.length, 1).setValues(vals);
    });
    // bitácora
    var log = ss.getSheetByName(SA_GID_TAB);
    if (!log) { log = ss.insertSheet(SA_GID_TAB); log.getRange(1, 1, 1, 5).setValues([["fecha", "fila", "antes", "después", "motivo"]]); log.setFrozenRows(1); }
    var now = new Date();
    var filasLog = cambios.map(function (k) { return [now, k + 1, sa_gidTexto_(cols.map(function (c) { return data[k][c]; })), sa_gidTexto_(nuevo[k]), motivo[k] || ""]; });
    log.getRange(log.getLastRow() + 1, 1, filasLog.length, 5).setValues(filasLog);
  }
  // ids retirados: quedan reservados para que nada los vuelva a crear en otra fila
  if (retirados.length) {
    var prev = Object.keys(sa_idsRetirados_());
    // (los MAN- no: son al azar y nada los vuelve a crear)
    retirados.forEach(function (b) { if (b.tipo !== "MAN") [b.id, txt(b.vals[3]), txt(b.vals[4])].forEach(function (k) { if (k && prev.indexOf(k) < 0) prev.push(k); }); });
    P.setProperty(SA_GID_RETIRADOS, JSON.stringify(prev));
  }
  P.setProperty(SA_GID_FLAG, new Date().toISOString() + " · " + cambios.length + " filas");
  return out;
}

function sa_gidTipo_(id) {
  if (/^REC-/.test(id)) return "REC";
  if (/^REP-/.test(id)) return "REP";
  if (/^MAN-/.test(id)) return "MAN";
  if (/^DEP-/.test(id)) return "DEP";
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(id)) return "HEX";
  return "OTRO";
}
function sa_gidTexto_(v) { return v ? v.map(function (x) { return String(x == null ? "" : x).trim(); }).join(" · ") : "(vacío)"; }
function sa_gidPorQue_(b) {
  if (b.tipo === "REC" || b.tipo === "REP") return "su comentario dice [" + b.tipo + "] → " + b.id;
  if (b.tipo === "HEX") return "factura de Q" + (b.ev.cent / 100).toFixed(2) + " del " + b.ev.dia + ": única fila con ese valor y fecha";
  if (b.tipo === "MAN") return "gasto manual del " + b.ev.dia + ": única fila de ese día";
  return "comprobante de " + b.ev.prop + " " + b.ev.ym + ": única fila posible";
}
// Facturas: auth → { cent, dia, prop } (si un auth sale 2 veces con datos distintos, no sirve de prueba)
function sa_gidFacturas_(ss) {
  var sh = ss.getSheetByName("Facturas"), o = {};
  if (!sh || sh.getLastRow() < 2) return o;
  var d = sh.getDataRange().getValues(), H = d[0].map(function (h) { return String(h).trim(); });
  var ia = H.indexOf("auth"), it = H.indexOf("total"), ifc = H.indexOf("fecha"), ip = H.indexOf("propiedad");
  if (ia < 0 || it < 0 || ifc < 0) return o;
  for (var r = 1; r < d.length; r++) {
    var a = String(d[r][ia] || "").trim().toUpperCase(); if (!a) continue;
    var x = { cent: sa_valorCent_(d[r][it]), dia: sa_diaDe_(d[r][ifc]), prop: ip >= 0 ? sa_propClave_(d[r][ip]) : "" };
    if (o[a] && (o[a].cent !== x.cent || o[a].dia !== x.dia)) o[a] = { malo: true }; else if (!o[a]) o[a] = x;
  }
  return o;
}
// Archivos cargados: orderId → { prop, ym } (comprobantes y facturas adjuntadas a un gasto)
function sa_gidArchivos_(ss) {
  var sh = ss.getSheetByName(SA_FILES_TAB), o = {};
  if (!sh || sh.getLastRow() < 2) return o;
  var d = sh.getDataRange().getValues(), H = d[0].map(function (h) { return String(h).trim(); });
  var io = H.indexOf("orderId"), ip = H.indexOf("property_name"), im = H.indexOf("mes");
  if (io < 0 || ip < 0) return o;
  for (var r = 1; r < d.length; r++) {
    var k = String(d[r][io] || "").trim(); if (!k) continue;
    var x = { prop: sa_propClave_(d[r][ip]), ym: im >= 0 ? sa_ym_(d[r][im]) : "" };
    if (o[k] && (o[k].prop !== x.prop || o[k].ym !== x.ym)) o[k] = null; else if (o[k] !== null) o[k] = x;
  }
  Object.keys(o).forEach(function (k) { if (!o[k]) delete o[k]; });
  return o;
}
// La prueba de un bloque de factura: suma de sus facturas (productos + tarifa), día más temprano y propiedad.
function sa_gidEvFactura_(b, cols, fact) {
  var aP = String(b.vals[3] || "").trim().toUpperCase(), aT = String(b.vals[4] || "").trim().toUpperCase();
  var auths = [];
  [aP, aT].forEach(function (a) { if (a && auths.indexOf(a) < 0) auths.push(a); });
  if (!auths.length) auths.push(b.id.toUpperCase());
  var cent = 0, dia = "", prop = "";
  for (var i = 0; i < auths.length; i++) {
    var x = fact[auths[i]];
    if (!x || x.malo || isNaN(x.cent) || !x.dia) return null;
    cent += x.cent;
    if (!dia || x.dia < dia) dia = x.dia;
    if (x.prop) { if (prop && prop !== x.prop) return null; prop = x.prop; }
  }
  return { cent: cent, dia: dia, prop: prop };
}
// ¿la fila es de esa propiedad y ese mes? (lo que dice Archivos cargados de un comprobante; sin dato, sí)
function sa_gidCoincideArchivo_(f, a) {
  if (!a) return true;
  return f.prop === a.prop && (!a.ym || f.ym === a.ym);
}
// ¿la fila puede ser el gasto de esa factura? mismo valor (±1 centavo), la factura del mismo día o hasta
// 3 días después (como concilia la app) y, si la factura dice propiedad, la misma propiedad.
function sa_gidCoincideFactura_(f, ev) {
  if (isNaN(f.cent) || Math.abs(f.cent - ev.cent) > 1 || !f.dia) return false;
  var d = sa_diasEntre_(f.dia, ev.dia);
  if (d < 0 || d > 3) return false;
  return !ev.prop || ev.prop === f.prop;
}

// Desde el editor de Apps Script: ver qué haría (no escribe) y hacerlo a mano.
function simularReparacionIdsGastos() {
  var r = sa_repararIdsGastos_(SpreadsheetApp.openById(SA_SHEET_ID), { simular: true });
  Logger.log(JSON.stringify(r, null, 1));
  return r;
}
function repararIdsGastos() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { var r = sa_repararIdsGastos_(SpreadsheetApp.openById(SA_SHEET_ID), {}); Logger.log(JSON.stringify(r, null, 1)); return r; }
  finally { lock.releaseLock(); }
}
