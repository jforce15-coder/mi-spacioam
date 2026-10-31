// ============================================================
// Spacio AM — Escritura desde la app (Apps Script) · Escrituradesdeapp.gs
// Permite que el Dashboard escriba en la hoja: SETUP, propiedades,
// credenciales y "Ingreso Neto 2" (Depósito) en Resumenconsolidado.
// Solo puede existir UN doPost por proyecto.
// ============================================================

// 1) ID de TU hoja (en la URL, entre /d/ y /edit).
var SA_SHEET_ID = "1l9wLH8880NlN9ac2jvne2U6cqej6gycqAD77Z25cLF4";

// 2) AUTORIZACIÓN (fase 3, oct 2026): ya no hay llaves ni contraseñas en el código.
//    · Administrador = sesión firmada del login unificado con rol admin_principal en Mi.
//    · Subir archivos / facturas / contabilidad = sesión firmada de cualquier usuario con acceso a Mi.
//    · Robots o integraciones: llave opcional en la propiedad del script MI_ADMIN_TOKEN (no en el código).
//    Las llaves antiguas (SpacioAM2026!, token de subida y la contraseña de meses cerrados) dejan de valer.
var SA_UPLOAD_ACTIONS = { uploadFile: true, ping: true, ocrFactura: true, linkFacturas: true, writeConta: true };
// Lecturas que puede pedir cualquier usuario con acceso a Mi (socio, contador o administrador).
var SA_USER_READ = { leerSetup: true };

var SA_VERSION = "2026-10-08c";
// Acciones de solo lectura: no esperan el candado (una consulta nunca debe fallar
// porque otra escritura esté en curso) y no invalidan la caché del resumen.
var SA_READONLY = { ping: 1, leerSetup: 1, resumenPreview: 1, recurList: 1, recurPreview: 1, cierreMesEstado: 1, hospitableStatus: 1, fetchImage: 1 };
// Acciones que no tocan Database / SETUP / insumos & gastos / TC → no invalidan la caché.
var SA_NO_RES_IMPACT = { leerSetup: 1, uploadFile: 1, deleteFile: 1, writeRows: 1, deleteRows: 1, writeConta: 1, writeContaOpex: 1, deleteContaOpex: 1, registerUnlockDevice: 1, sendCierreMes: 1, cierreMesMulti: 1, sendRecordatoriosFactura: 1, resumenAppend: 1, recurSave: 1, recurCancel: 1, saveProfile: 1 };   // la app lo compara con el que espera (SpacioWrite.expectVersion)
var SA_TAB_SETUP   = "SETUP";
var SA_TAB_RESUMEN = "Resumenconsolidado";
var SA_TAB_INSUMOS = "insumos & gastos";
var SA_TAB_DEPOSITOS = "Depositos cargados";
var SA_FILES_TAB = "Archivos cargados";   // registro de facturas/depositos subidos a Drive
var SA_CONTA_TAB = "Contabilidad";        // movimientos clasificados de los estados de cuenta
var SA_OPEX_TAB = "Gastos operativos";    // gastos operativos globales + otros ingresos (P&L interno)

// Pestaña y celda donde tu Codigo.gs lee el mes a recalcular, y el NOMBRE de la
// funcion de tu Codigo.gs que reescribe Resumenconsolidado. Cambia SA_RECALC_FN
// por el nombre EXACTO de esa funcion (ej. "actualizarResumen"). Si lo dejas en
// "", solo se escribe la celda C1 (tu script debe correr por trigger).
var SA_RECALC_SHEET = "Resumen";
var SA_RECALC_CELL = "C1";
var SA_RECALC_FN = "generarResumenMensual";
var SA_RECALC_DATAROW = 6;   // Resumen: encabezados en fila 5, datos desde la 6

// Carpeta raiz en Drive donde se guardan facturas y depositos de socios.
// Deja "" para que el script cree/use una carpeta llamada SA_DRIVE_ROOT_NAME
// en tu Drive; o pega el ID de una carpeta existente.
var SA_DRIVE_ROOT_ID = "";
var SA_DRIVE_ROOT_NAME = "Spacio AM - Archivos de socios";
var SA_DRIVE_INVOICES = "Facturas de socios";
var SA_DRIVE_DEPOSITS = "Depositos a socios";
var SA_DRIVE_SUPPORT = "Soportes de gastos";
var SA_DRIVE_RETENCION = "Constancias de retencion";

// ------------------------------------------------------------
// Punto de entrada (POST desde el dashboard)
// ------------------------------------------------------------
/* La traza de diagnóstico se retiró (oct 2026); marca_ queda sin efecto. */
function marca_(n) {}
function doPost(e) { return doPostReal_(e); }
function doPostReal_(e) {
  try {
    var body = JSON.parse(e.postData.contents || "{}");
    var __diag = accesosDiag_(body); if (__diag) return __diag;   // fase 1b: resumen de accesos (robot)
    marca_("ini"); var __ses = sesionDe_(body); marca_("ses:" + String((__ses && __ses.apps && __ses.apps.mi) || "-")); registrarAcceso_(body.action, __ses ? true : esRobot_(body) ? 'r' : false);
    var __llaveMi = PropertiesService.getScriptProperties().getProperty("MI_ADMIN_TOKEN"), __bloq = exigirSesion_(body.action, !!__ses || !!(__llaveMi && body.token === __llaveMi), body, ['ping']); if (__bloq) return __bloq;   // fase 1c: solo bloquea con SESION_EXIGIR = 1
    var rolMi = String((__ses && __ses.apps && __ses.apps.mi) || "");
    var llaveRobot = PropertiesService.getScriptProperties().getProperty("MI_ADMIN_TOKEN");
    var esAdmin  = rolMi === "admin_principal" || !!(llaveRobot && body.token === llaveRobot);
    var esSubida = !!rolMi && (!!SA_UPLOAD_ACTIONS[body.action] || !!SA_USER_READ[body.action]);
    if (!esAdmin && !esSubida) return sa_json({ ok: false, error: "unauthorized" });

    // OCR de facturas: no toca la hoja y tarda unos segundos — fuera del lock.
    if (body.action === "ocrFactura") return sa_json(sa_ocrFactura(body));

    var t0 = Date.now();
    var ss = SpreadsheetApp.openById(SA_SHEET_ID);
    var lock = LockService.getScriptLock();
    // Escrituras cortas esperan poco: si la hoja está ocupada por una operación
    // larga (cierre, recálculo, correos) la app recibe un error claro y reintenta,
    // en vez de colgarse hasta que el navegador se rinde.
    var action = String(body.action || "");
    var readonly = !!SA_READONLY[action];
    var longAction = /^(resumen|recalc|send|recur|hospitable)/.test(action);
    marca_("auth");
    if (!readonly) {
      try { lock.waitLock(longAction ? 25000 : 8000); }
      catch (eLock) { return sa_json({ ok: false, busy: true, error: "la hoja está ocupada por otra operación; espera unos segundos e intenta de nuevo", ms: Date.now() - t0 }); }
    }
    marca_("lock");
    var out;
    try {
      switch (body.action) {
        case "leerSetup":     out = sa_leerSetup(ss);          break;
        case "saveProfile":   out = sa_saveProfile(ss, body);  break;
        case "saveSetupRow":  out = sa_saveSetupRow(ss, body); break;
        case "saveSetupRaw":  out = sa_saveSetupRaw(ss, body); break;
        case "addProperty":   out = sa_addProperty(ss, body);  break;
        case "writeDeposito": out = sa_writeDeposito(ss, body);break;
        case "appendInsumos": out = sa_appendInsumos(ss, body);break;
        case "linkFacturas":  out = sa_linkFacturas(ss, body); break;
        case "updateInsumo":  out = sa_updateInsumo(ss, body);  break;
        case "deleteInsumo":  out = sa_deleteInsumo(ss, body);  break;
        case "appendDeposito": out = sa_appendDeposito(ss, body);break;
        case "deleteDeposito": out = sa_deleteDeposito(ss, body);break;
        case "updateMoneda":  out = sa_updateMoneda(ss, body);  break;
        case "recalcMonth":   out = sa_recalcMonth(ss, body);   break;
        case "uploadFile":    out = sa_uploadFile(ss, body);     break;
        case "writeConta":    out = sa_writeConta(ss, body);     break;
        case "writeContaOpex": out = sa_writeContaOpex(ss, body); break;
        case "deleteContaOpex": out = sa_deleteContaOpex(ss, body); break;
        case "deleteFile":    out = sa_deleteFile(ss, body);     break;
        case "writeRows":     out = sa_writeRows(ss, body);      break;
        case "hospitableSync": out = sa_hospitableSync();        break;
        case "hospitableStatus": out = sa_hospitableStatus();    break;
        case "resumenPreview": out = sa_resumenPreview(ss, body); break;
        case "resumenAppend":  out = sa_resumenAppend(ss, body);  break;
        case "resumenAjuste":  out = sa_resumenAjuste(ss, body);  break;
        case "registerUnlockDevice": out = sa_registerUnlockDevice(body); break;
        case "deleteRows":    out = sa_deleteRows(ss, body);     break;
        case "recurList":     out = sa_recurList(ss, body);      break;
        case "recurSave":     out = sa_recurSave(ss, body);      break;
        case "recurCancel":   out = sa_recurCancel(ss, body);    break;
        case "recurApply":    out = sa_recurApplyAction(ss, body); break;
        case "recurPreview":  out = sa_recurPreview(ss, body);   break;
        case "fetchImage":    out = sa_fetchImage(body);       break;
        // correos a socios (viven en PLANTILLA-CORREOS.gs)
        case "sendCierreMes": out = enviarCierreMesATodos(body.mes, body.socio); break;
        case "cierreMesEstado": out = em_cierreEstado(body.mes); break;
        case "cierreMesMulti":  out = em_setMulti(!!body.on); break;
        case "sendRecordatoriosFactura": out = enviarRecordatoriosFactura(body.hasta, body.socio); break;
        case "ping":          out = { ok: true, pong: true, sheet: ss.getName() }; break;
        default:              out = { ok: false, error: "unknown action: " + body.action };
      }
    } finally { if (!readonly) lock.releaseLock(); }
    if (!readonly && !SA_NO_RES_IMPACT[action]) sa_resDirty_();
    if (out && typeof out === "object") { out.ms = Date.now() - t0; out.v = SA_VERSION; }
    return sa_json(out);
  } catch (err) {
    return sa_json({ ok: false, error: String(err) });
  }
}

// ------------------------------------------------------------
// OCR de facturas con Claude (modelo Haiku, el mas barato)
// ------------------------------------------------------------
// Guarda la llave UNA vez desde el editor: Proyecto > Configuracion >
// Propiedades del script  ->  ANTHROPIC_API_KEY = sk-ant-...
// (o ejecuta sa_guardarLlaveAnthropic() con la llave pegada abajo)
var SA_OCR_MODEL = "claude-3-5-haiku-latest";
var SA_OCR_MAX_BYTES = 3800000; // ~3.8 MB de base64; arriba de eso pedimos otra foto

function sa_guardarLlaveAnthropic() {
  var LLAVE = ""; // <- pega aqui tu llave y ejecuta esta funcion una vez
  if (!LLAVE) throw new Error("Pega la llave en la variable LLAVE.");
  PropertiesService.getScriptProperties().setProperty("ANTHROPIC_API_KEY", LLAVE);
  return "Llave guardada.";
}

function sa_ocrFactura(body) {
  var key = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, error: "no-api-key" };
  var b64 = body.dataBase64 || "";
  if (!b64) return { ok: false, error: "no-image" };
  if (b64.length > SA_OCR_MAX_BYTES) return { ok: false, error: "too-large" };
  var mime = body.mimeType || "image/jpeg";
  if (mime.indexOf("image/") !== 0) return { ok: false, error: "not-image" };

  // Lo que importa NO es la fecha de emision (los socios facturan atrasado), sino
  // el PERIODO QUE DESCRIBE la factura. Se lo pedimos explicito y en JSON.
  var prompt =
    "Eres un asistente que lee facturas de arrendamiento y servicios de Guatemala. " +
    "Devuelve SOLO un objeto JSON, sin texto alrededor, con estas llaves:\n" +
    '{"periodo":"YYYY-MM"|null,"emision":"YYYY-MM"|null,"descripcion":"...","monto":numero|null,"confianza":"alta"|"media"|"baja"}\n' +
    "Reglas:\n" +
    "- periodo = el mes DEL SERVICIO que describe la factura (por ejemplo 'servicios de mayo 2026', " +
    "'arrendamiento correspondiente a abril', 'comision marzo'). Es el dato mas importante.\n" +
    "- Si la descripcion nombra el mes pero no el anio, usa el anio de la fecha de emision.\n" +
    "- Si la descripcion NO menciona ningun periodo, deja periodo en null (no lo inventes).\n" +
    "- emision = mes de la fecha de emision o certificacion de la factura.\n" +
    "- descripcion = el concepto en 12 palabras o menos, tal como aparece.\n" +
    "- confianza = 'alta' si el periodo esta escrito con mes y anio; 'media' si lo dedujiste; 'baja' si dudas.";

  var payload = {
    model: SA_OCR_MODEL,
    max_tokens: 300,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
        { type: "text", text: prompt },
      ],
    }],
  };
  var res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify(payload),
  });
  var code = res.getResponseCode();
  if (code !== 200) return { ok: false, error: "api-" + code, detail: String(res.getContentText()).slice(0, 300) };
  var txt = "";
  try {
    var j = JSON.parse(res.getContentText());
    (j.content || []).forEach(function (c) { if (c.type === "text") txt += c.text; });
  } catch (e) { return { ok: false, error: "bad-response" }; }
  var m = txt.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "no-json", raw: txt.slice(0, 200) };
  var data;
  try { data = JSON.parse(m[0]); } catch (e) { return { ok: false, error: "bad-json", raw: m[0].slice(0, 200) }; }
  var ym = /^\d{4}-\d{2}$/.test(String(data.periodo || "")) ? data.periodo
         : (/^\d{4}-\d{2}$/.test(String(data.emision || "")) ? data.emision : "");
  return {
    ok: true, ym: ym,
    fuente: /^\d{4}-\d{2}$/.test(String(data.periodo || "")) ? "periodo" : (ym ? "emision" : ""),
    descripcion: String(data.descripcion || "").slice(0, 140),
    monto: (typeof data.monto === "number" ? data.monto : null),
    confianza: data.confianza || "baja",
  };
}

function doGet() {
  return sa_json({ ok: true, service: "Spacio AM write API", time: new Date().toISOString() });
}

// Ejecuta esta funcion UNA VEZ desde el editor para autorizar el permiso
// de salida a internet (UrlFetchApp). Necesario para traer la foto del anuncio.
function sa_authorizeExternal() {
  var r = UrlFetchApp.fetch("https://example.com", { muteHttpExceptions: true });
  Logger.log("Autorizado. Codigo: " + r.getResponseCode());
  return r.getResponseCode();
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function sa_json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
// Escritor por lotes: acumula celdas (fila, col0, valor) y las escribe con UNA
// llamada por fila (setValues sobre el tramo tocado) en vez de un setValue por
// celda. 20 conciliaciones × 4 celdas pasaban de ~80 llamadas (20-40 s, y el
// navegador se rendía) a ~20 llamadas (< 3 s).
function sa_batch_(sh, data) {
  var rows = {};
  return {
    set: function (row1, col0, val) { data[row1 - 1][col0] = val; (rows[row1] = rows[row1] || {})[col0] = true; },
    flush: function () {
      var n = 0;
      Object.keys(rows).forEach(function (rk) {
        var cols = Object.keys(rows[rk]).map(Number), lo = Math.min.apply(null, cols), hi = Math.max.apply(null, cols), r = +rk;
        sh.getRange(r, lo + 1, 1, hi - lo + 1).setValues([data[r - 1].slice(lo, hi + 1)]); n++;
      });
      return n;
    }
  };
}
function sa_headerMap(sheet) {
  var h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < h.length; i++) map[String(h[i]).trim()] = i;
  return map;
}
function sa_setIf(sheet, rowIdx0, map, colName, value) {
  if (value === undefined || value === null) return;
  if (map[colName] == null) return;
  sheet.getRange(rowIdx0 + 1, map[colName] + 1).setValue(value);
}
function sa_normKey() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) parts.push(String(arguments[i] == null ? "" : arguments[i]));
  return parts.join("||").toLowerCase().replace(/\s+/g, "").replace(/[–—]/g, "-");
}

// 1) Editar una fila de SETUP (por property_id)
function sa_saveSetupRow(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_SETUP);
  var map = sa_headerMap(sh);
  var data = sh.getDataRange().getValues();
  var pidCol = map["property_id"];
  var row = body.row || {};
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][pidCol]).trim() === String(row.property_id).trim()) {
      sa_setIf(sh, r, map, "property_name", row.property_name);
      sa_setIf(sh, r, map, "Usuario ID",   row.usuario);
      sa_setIf(sh, r, map, "User email",   row.email);
      sa_setIf(sh, r, map, "SPACIOAMFEE",  row.fee);
      sa_setIf(sh, r, map, "iva",          row.iva);
      sa_setIf(sh, r, map, "RETENCION",    row.retencion);
      sa_setIf(sh, r, map, "CLEANING_SOCIO", row.cleaningSocio);
      sa_setIf(sh, r, map, "OTRO INGRESO", row.otroIngreso);
      sa_setIf(sh, r, map, "Listing link", row.listing);
      return { ok: true, updated: row.property_id };
    }
  }
  return { ok: false, error: "property_id no encontrado: " + row.property_id };
}

// 1b) Editar CUALQUIER columna de una fila de SETUP por property_id.
//     body: { property_id, values: { "<encabezado>": valor, ... } }
//     Escribe cada par por nombre de encabezado (solo los que existan).
function sa_saveSetupRaw(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_SETUP);
  var map = sa_headerMap(sh);
  var data = sh.getDataRange().getValues();
  var pidCol = map["property_id"];
  var pid = String((body.values && body.values.property_id) || body.property_id || "").trim();
  var values = body.values || {};
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][pidCol]).trim() === pid && pid) {
      var n = 0;
      for (var key in values) {
        if (!values.hasOwnProperty(key)) continue;
        if (key === "property_id") continue;
        if (map[key] == null) continue;
        if (sa_esColClave_(key)) continue;   // las contraseñas no se escriben en SETUP (viven en el login unificado)
        sh.getRange(r + 1, map[key] + 1).setValue(values[key]);
        n++;
      }
      return { ok: true, updated: pid, cols: n };
    }
  }
  return { ok: false, error: "property_id no encontrado: " + pid };
}

function sa_addProperty(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_SETUP);
  var map = sa_headerMap(sh);
  var row = body.row || {};
  var arr = [];
  for (var i = 0; i < sh.getLastColumn(); i++) arr.push("");
  function put(col, val) { if (map[col] != null && val != null) arr[map[col]] = val; }
  put("property_id",  row.property_id || ("P" + Date.now()));
  put("property_name",row.property_name);
  put("Usuario ID",   row.usuario);
  put("User email",   row.email);
  put("SPACIOAMFEE",  row.fee);
  put("iva",          row.iva);
  put("RETENCION",    row.retencion);
  put("CLEANING_SOCIO", row.cleaningSocio);
  put("OTRO INGRESO", row.otroIngreso);
  put("Listing link", row.listing);
  put("secondary user email", sa_normEmails_(row.secondary));
  sh.appendRow(arr);
  return { ok: true, added: arr[map["property_id"]] };
}

// "a@x.com; b@y.com" -> "a@x.com, b@y.com" (lista de correos secundarios en una celda)
function sa_normEmails_(v) {
  var seen = {}, out = [];
  String(v == null ? "" : v).split(/[,;\n]+/).forEach(function (s) {
    s = s.trim(); if (!s) return;
    var k = s.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(s);
  });
  return out.join(", ");
}

// 3) Cambiar credenciales (correo / contraseña / correos secundarios)
function sa_saveProfile(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_SETUP);
  var map = sa_headerMap(sh);
  var data = sh.getDataRange().getValues();
  var codes = body.codes || (body.code ? [body.code] : []);
  var n = 0;
  for (var r = 1; r < data.length; r++) {
    var uid = String(data[r][map["Usuario ID"]]).trim();
    if (codes.indexOf(uid) >= 0) {
      if (body.email != null && body.email !== "")       sh.getRange(r + 1, map["User email"] + 1).setValue(body.email);
      // La contraseña ya no se guarda en SETUP: se cambia en el login unificado (SAAuth.setPassword).
      // varios correos secundarios en una sola celda, separados por coma
      if (body.secondary != null)                        sh.getRange(r + 1, map["secondary user email"] + 1).setValue(sa_normEmails_(body.secondary));
      n++;
    }
  }
  return { ok: true, rowsUpdated: n };
}

// 4) Grabar "Ingreso Neto 2" (Depósito) en Resumenconsolidado
function sa_writeDeposito(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_RESUMEN);
  var map = sa_headerMap(sh);
  var col = map["Ingreso Neto 2"];
  if (col == null) return { ok: false, error: "Falta la columna 'Ingreso Neto 2'" };
  var data = sh.getDataRange().getValues();
  var items = body.items || [];
  var idx = {};
  for (var i = 0; i < items.length; i++) {
    idx[sa_normKey(items[i].usuario, items[i].property_name, items[i].mes)] = items[i].value;
  }
  var n = 0;
  for (var r = 1; r < data.length; r++) {
    var k = sa_normKey(data[r][map["Usuario ID"]], data[r][map["Property_name"]], data[r][map["Mes"]]);
    if (idx[k] != null) { sh.getRange(r + 1, col + 1).setValue(idx[k]); n++; }
  }
  return { ok: true, rowsUpdated: n };
}

// 5) Agregar filas de gastos PedidosYa a "insumos & gastos" (dedupe por orderId)
//    Estructura respetada: Mes | Fecha de pedido | property_name | valor |
//    categoria | Comentario.  Se aseguran (creándolas si faltan) las columnas
//    auxiliares: orderId, tag, authProductos, authTarifa.
function sa_appendInsumos(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_INSUMOS);
  if (!sh) return { ok: false, error: "No existe la hoja '" + SA_TAB_INSUMOS + "'" };
  var rows = body.rows || [];
  if (!rows.length) return { ok: true, added: 0, skipped: 0 };

  // asegura columnas auxiliares al final del encabezado.
  // "tag" va PRIMERO para que, en una hoja con A..F (Mes..Comentario),
  // quede en la columna G (justo despues de Comentario). El resto de
  // columnas auxiliares se ubican despues.
  var map = sa_headerMap(sh);
  var aux = ["tag", "orderId", "orderUrl", "authProductos", "authTarifa"];
  var lastCol = sh.getLastColumn();
  for (var a = 0; a < aux.length; a++) {
    if (map[aux[a]] == null) {
      lastCol++;
      sh.getRange(1, lastCol).setValue(aux[a]);
      map[aux[a]] = lastCol - 1;
    }
  }
  map = sa_headerMap(sh); // re-lee encabezado tras posibles inserciones

  // set de orderId ya presentes (dedupe): columna orderId + heurística en Comentario
  var data = sh.getDataRange().getValues();
  var oidCol = map["orderId"];
  var comCol = map["Comentario"];
  var present = {};
  var rowByOid = {};
  for (var r = 1; r < data.length; r++) {
    if (oidCol != null && data[r][oidCol]) { var k0 = String(data[r][oidCol]).trim(); present[k0] = true; rowByOid[k0] = r + 1; }
    if (comCol != null && data[r][comCol]) {
      var mm = String(data[r][comCol]).match(/pedido\s+(\d{6,})/i);
      if (mm) { present[mm[1]] = true; if (rowByOid[mm[1]] == null) rowByOid[mm[1]] = r + 1; }
    }
  }

  var width = sh.getLastColumn();
  var toAppend = [];
  var skipped = 0;
  var enrichedRows = {};
  var B = sa_batch_(sh, data);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var oid = String(row.orderId || "").trim();
    if (oid && present[oid]) {
      // ya existe: NO duplica, pero completa el enlace y las autorizaciones
      // de la factura si la fila guardada los tiene vacios (backfill).
      var rr = rowByOid[oid];
      if (rr) {
        var fills = ["orderUrl", "authProductos", "authTarifa", "orderId"];
        for (var fi = 0; fi < fills.length; fi++) {
          var cn = fills[fi];
          var val = (cn === "orderId") ? oid : row[cn];
          if (map[cn] != null && val && !String(data[rr - 1][map[cn]] || "").trim()) {
            B.set(rr, map[cn], val);
            enrichedRows[rr] = true;
          }
        }
      }
      skipped++; continue;
    }
    if (oid) present[oid] = true;
    var arr = [];
    for (var c = 0; c < width; c++) arr.push("");
    (function (arrRef) {
      function put(col, val) { if (map[col] != null && val != null) arrRef[map[col]] = val; }
      put("Mes",             row.Mes);
      put("Fecha de pedido", row["Fecha de pedido"]);
      put("property_name",   row.property_name);
      put("valor",           row.valor);
      put("categoria",       row.categoria);
      put("Comentario",      row.Comentario);
      put("tag",             row.tag);
      put("orderId",         oid);
      put("orderUrl",        row.orderUrl);
      put("authProductos",   row.authProductos);
      put("authTarifa",      row.authTarifa);
    })(arr);
    toAppend.push(arr);
  }
  B.flush();
  if (toAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, width).setValues(toAppend);
  }
  return { ok: true, added: toAppend.length, skipped: skipped, enriched: Object.keys(enrichedRows).length };
}

// 5b) Vincular facturas del SAT a gastos YA guardados, por FECHA + MONTO.
//     body.links = [{ fecha, total, orderId, orderUrl, authProductos, authTarifa }]
//     Solo toca filas sin autorizaciones. Una factura exacta llena UNA fila;
//     una factura "compartida" (valor repartido ÷N) llena hasta N filas.
function sa_linkFacturas(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_INSUMOS);
  if (!sh) return { ok: false, error: "No existe la hoja '" + SA_TAB_INSUMOS + "'" };
  var map = sa_headerMap(sh);
  var aux = ["tag", "orderId", "orderUrl", "authProductos", "authTarifa"];
  var lastCol = sh.getLastColumn();
  for (var a = 0; a < aux.length; a++) {
    if (map[aux[a]] == null) { lastCol++; sh.getRange(1, lastCol).setValue(aux[a]); }
  }
  map = sa_headerMap(sh);
  var data = sh.getDataRange().getValues();
  var fCol = map["Fecha de pedido"], vCol = map["valor"], cCol = map["Comentario"];
  var apCol = map["authProductos"], atCol = map["authTarifa"], ouCol = map["orderUrl"], oiCol = map["orderId"];
  function pad2(x) { return ("0" + x).slice(-2); }
  function normF(v) {
    if (v && v.getTime) return v.getFullYear() + "-" + pad2(v.getMonth() + 1) + "-" + pad2(v.getDate());
    var s = String(v || "").trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + "-" + pad2(m[2]) + "-" + pad2(m[1]);
    return s;
  }
  // candidatas: filas sin autorizaciones, indexadas por fecha
  var byF = {};
  for (var r = 1; r < data.length; r++) {
    var hasAuth = String(data[r][apCol] || "").trim() || String(data[r][atCol] || "").trim();
    if (hasAuth) continue;
    var f = normF(data[r][fCol]); if (!f) continue;
    var com = String(cCol != null ? (data[r][cCol] || "") : "");
    var mm = com.match(/\(compartido ÷(\d+)\)/);
    (byF[f] = byF[f] || []).push({ row: r + 1, valor: Number(data[r][vCol]) || 0, mult: mm ? parseInt(mm[1], 10) : 1, used: false });
  }
  // ya conciliadas antes (reintentos): por autorización presente en la hoja
  var authPresent = {};
  for (var r0 = 1; r0 < data.length; r0++) {
    [apCol, atCol].forEach(function (cc) { var v = cc != null ? String(data[r0][cc] || "").trim() : ""; if (v) authPresent[v] = true; });
  }
  var links = body.links || [], linked = 0, rowsTouched = 0, already = 0;
  var B = sa_batch_(sh, data);
  function fill(c, link) {
    function setIfEmpty(col, val) {
      if (col != null && val && !String(data[c.row - 1][col] || "").trim()) B.set(c.row, col, val);
    }
    setIfEmpty(oiCol, link.orderId);
    setIfEmpty(ouCol, link.orderUrl);
    setIfEmpty(apCol, link.authProductos);
    setIfEmpty(atCol, link.authTarifa);
    c.used = true; rowsTouched++;
  }
  for (var i = 0; i < links.length; i++) {
    var link = links[i], t = Number(link.total) || 0;
    var aP = String(link.authProductos || "").trim(), aT = String(link.authTarifa || "").trim();
    if ((aP && authPresent[aP]) || (aT && authPresent[aT])) { already++; linked++; continue; }
    var cands = byF[normF(link.fecha)] || [], hit = false;
    for (var j = 0; j < cands.length; j++) {        // monto exacto: UNA fila por factura
      var c = cands[j];
      if (!c.used && c.mult === 1 && Math.abs(c.valor - t) < 0.025) { fill(c, link); hit = true; break; }
    }
    if (!hit) {                                      // gasto compartido: hasta N filas
      var taken = 0;
      for (var j2 = 0; j2 < cands.length; j2++) {
        var c2 = cands[j2];
        if (!c2.used && c2.mult > 1 && Math.abs(c2.valor * c2.mult - t) < 0.06) {
          fill(c2, link); hit = true; taken++;
          if (taken >= c2.mult) break;
        }
      }
    }
    if (hit) linked++;
  }
  B.flush();
  return { ok: true, links: linked, rows: rowsTouched, already: already, notFound: links.length - linked };
}

// 5b) Editar / eliminar una fila de "insumos & gastos" por su orderId.
function sa_findInsumoRow(sh, orderId) {
  var map = sa_headerMap(sh);
  var oidCol = map["orderId"];
  if (oidCol == null) return { map: map, row: -1 };
  var data = sh.getDataRange().getValues();
  var want = String(orderId || "").trim();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][oidCol] || "").trim() === want && want) return { map: map, row: r + 1 };
  }
  return { map: map, row: -1 };
}
function sa_updateInsumo(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_INSUMOS);
  if (!sh) return { ok: false, error: "No existe la hoja '" + SA_TAB_INSUMOS + "'" };

  var f = sa_findInsumoRow(sh, body.orderId);
  if (f.row < 0) return { ok: false, error: "No se encontro el gasto (orderId " + body.orderId + ")" };
  var width = sh.getLastColumn();
  var rowVals = sh.getRange(f.row, 1, 1, width).getValues();
  var B = sa_batch_(sh, [rowVals[0]]);                 // índice local: fila 1 = f.row
  function set(col, val) { if (f.map[col] != null && val !== undefined) B.set(1, f.map[col], val); }
  set("property_name", body.property_name);
  set("valor",        body.valor);
  set("categoria",    body.categoria);
  set("Comentario",   body.Comentario);
  set("tag",          body.tag);
  set("orderUrl",     body.orderUrl);
  // escribe el tramo tocado en la fila real
  (function () {
    var cols = []; ["property_name","valor","categoria","Comentario","tag","orderUrl"].forEach(function (c) { if (f.map[c] != null && body[c] !== undefined) cols.push(f.map[c]); });
    if (!cols.length) return;
    var lo = Math.min.apply(null, cols), hi = Math.max.apply(null, cols);
    sh.getRange(f.row, lo + 1, 1, hi - lo + 1).setValues([rowVals[0].slice(lo, hi + 1)]);
  })();
  return { ok: true, row: f.row };
}
function sa_deleteInsumo(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_INSUMOS);
  if (!sh) return { ok: false, error: "No existe la hoja '" + SA_TAB_INSUMOS + "'" };
  var f = sa_findInsumoRow(sh, body.orderId);
  if (f.row < 0) return { ok: false, error: "No se encontro el gasto (orderId " + body.orderId + ")" };
  sh.deleteRow(f.row);
  return { ok: true };
}

// 6b) Registrar depósitos bancarios (hoja "Depositos cargados"; se crea si falta).
//     Dedupe por fecha + monto + propiedad para no duplicar la misma imagen.
function sa_appendDeposito(ss, body) {
  var rows = body.rows || [];
  if (!rows.length) return { ok: true, added: 0, skipped: 0 };
  var sh = ss.getSheetByName(SA_TAB_DEPOSITOS);
  var headers = ["Fecha", "monto", "property_name", "Numero de cuenta", "categoria", "Comentario", "archivo", "cargado"];
  if (!sh) { sh = ss.insertSheet(SA_TAB_DEPOSITOS); sh.getRange(1, 1, 1, headers.length).setValues([headers]); }
  var map = sa_headerMap(sh);
  for (var h = 0; h < headers.length; h++) { if (map[headers[h]] == null) { sh.getRange(1, sh.getLastColumn() + 1).setValue(headers[h]); } }
  map = sa_headerMap(sh);
  var data = sh.getDataRange().getValues();
  var present = {};
  for (var r = 1; r < data.length; r++) {
    present[sa_normKey(data[r][map["Fecha"]], data[r][map["monto"]], data[r][map["property_name"]])] = true;
  }
  var width = sh.getLastColumn();
  var toAppend = [], skipped = 0, now = new Date();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var k = sa_normKey(row.Fecha, row.monto, row.property_name);
    if (present[k]) { skipped++; continue; }
    present[k] = true;
    var arr = []; for (var c = 0; c < width; c++) arr.push("");
    (function (a) {
      function put(col, val) { if (map[col] != null && val != null) a[map[col]] = val; }
      put("Fecha", row.Fecha); put("monto", row.monto); put("property_name", row.property_name);
      put("Numero de cuenta", row.cuenta); put("categoria", row.categoria); put("Comentario", row.Comentario); put("archivo", row.archivo); put("cargado", now);
    })(arr);
    toAppend.push(arr);
  }
  if (toAppend.length) sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, width).setValues(toAppend);
  return { ok: true, added: toAppend.length, skipped: skipped };
}

// 6c) Actualizar la columna "Moneda" en SETUP para una propiedad (por nombre).
//     body: { property_name, moneda:"USD"|"GTQ" }. Actualiza todas las filas
//     (listings duplicados) que coincidan por nombre normalizado.
function sa_deleteDeposito(ss, body) {
  var sh = ss.getSheetByName(SA_TAB_DEPOSITOS);
  if (!sh) return { ok: false, error: "No existe '" + SA_TAB_DEPOSITOS + "'" };
  var map = sa_headerMap(sh);
  var data = sh.getDataRange().getValues();
  var wantProp = sa_normKey(body.property_name);
  var wantMonto = Math.round((parseFloat(body.monto) || 0) * 100);
  var removed = 0;
  for (var r = data.length - 1; r >= 1; r--) {
    var pName = sa_normKey(data[r][map["property_name"]]);
    var monto = Math.round((parseFloat(data[r][map["monto"]]) || 0) * 100);
    if (pName === wantProp && monto === wantMonto) { sh.deleteRow(r + 1); removed++; }
  }
  return { ok: true, removed: removed };
}

function sa_updateMoneda(ss, body) {
  var prop = String(body.property_name || "").trim();
  var mon = String(body.moneda || "").trim().toUpperCase();
  var cuenta = (body.cuenta != null) ? String(body.cuenta).trim() : null;
  if (!prop) return { ok: false, error: "property_name requerido" };
  var setMon = (mon === "USD" || mon === "GTQ");
  if (!setMon && cuenta == null) return { ok: false, error: "nada que actualizar" };
  var sh = ss.getSheetByName(SA_TAB_SETUP);
  if (!sh) return { ok: false, error: "No existe SETUP" };
  var map = sa_headerMap(sh);
  var nameCol = map["property_name"];
  if (nameCol == null) return { ok: false, error: "SETUP sin columna property_name" };
  // Moneda -> columna N (indice 13) ; Numero de cuenta -> columna O (indice 14).
  // Usa el nombre de columna si existe; si no, cae a la posicion fija N/O.
  var monCol = (map["Moneda"] != null) ? map["Moneda"] : 13;
  var ctaCol = (map["Numero de cuenta"] != null) ? map["Numero de cuenta"]
             : (map["Número de cuenta"] != null) ? map["Número de cuenta"] : 14;
  if (sh.getRange(1, monCol + 1).getValue() === "") sh.getRange(1, monCol + 1).setValue("Moneda");
  if (sh.getRange(1, ctaCol + 1).getValue() === "") sh.getRange(1, ctaCol + 1).setValue("Numero de cuenta");
  var norm = function (s) { return String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, ""); };
  var want = norm(prop), data = sh.getDataRange().getValues(), n = 0;
  for (var r = 1; r < data.length; r++) {
    if (norm(data[r][nameCol]) === want) {
      if (setMon) sh.getRange(r + 1, monCol + 1).setValue(mon);
      if (cuenta != null && cuenta !== "") sh.getRange(r + 1, ctaCol + 1).setValue(cuenta);
      n++;
    }
  }
  return { ok: true, updated: n };
}

// Disparar recalculo: escribe el mes en Resumen!C1 y ejecuta tu Codigo.gs.
// body: { month: 1-12, year }
function sa_recalcMonth(ss, body) {
  var sh = ss.getSheetByName(SA_RECALC_SHEET);
  if (!sh) return { ok: false, error: "No existe la hoja '" + SA_RECALC_SHEET + "'" };
  var month = parseInt(body.month, 10);
  var year = parseInt(body.year, 10) || new Date().getFullYear();
  if (!(month >= 1 && month <= 12)) return { ok: false, error: "mes invalido" };
  // C1 con el formato que espera generarResumenMensual: "2026-5"
  sh.getRange(SA_RECALC_CELL).setValue(year + "-" + month);
  SpreadsheetApp.flush();
  var ran = false;
  if (SA_RECALC_FN) {
    try {
      var fn = (typeof globalThis !== "undefined") ? globalThis[SA_RECALC_FN] : this[SA_RECALC_FN];
      if (typeof fn === "function") { fn(); ran = true; }
    } catch (e) { return { ok: false, error: "C1 escrito, pero fallo " + SA_RECALC_FN + ": " + e, cellSet: true }; }
  }
  var upserted = 0;
  if (ran) { try { upserted = sa_pushResumenToConsolidado(ss); } catch (e) { return { ok: false, error: "Recalc OK, pero fallo el volcado a consolidado: " + e, cellSet: true, ranRecalc: true }; } }
  return { ok: true, month: month, year: year, cellSet: true, ranRecalc: ran, consolidado: upserted };
}

// Vuelca las filas del mes desde "Resumen" (datos desde fila SA_RECALC_DATAROW) a
// "Resumenconsolidado", emparejando por Usuario ID + Property_name + Mes.
function sa_pushResumenToConsolidado(ss) {
  var src = ss.getSheetByName(SA_RECALC_SHEET);
  var dst = ss.getSheetByName(SA_TAB_RESUMEN);
  if (!src || !dst) return 0;
  var headerRow = SA_RECALC_DATAROW - 1;
  var lastCol = src.getLastColumn();
  var headers = src.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var nRows = src.getLastRow() - SA_RECALC_DATAROW + 1;
  if (nRows <= 0) return 0;
  var rows = src.getRange(SA_RECALC_DATAROW, 1, nRows, lastCol).getValues();
  var dHead = sa_headerMap(dst);
  for (var h = 0; h < headers.length; h++) { if (dHead[headers[h]] == null && headers[h]) { dst.getRange(1, dst.getLastColumn() + 1).setValue(headers[h]); } }
  dHead = sa_headerMap(dst);
  var dData = dst.getDataRange().getValues();
  var keyCols = ["Usuario ID", "Property_name", "Mes"];
  function keyOf(getter) { return keyCols.map(function (c) { return getter(c); }).join("||").toLowerCase().replace(/\s+/g, ""); }
  var rowByKey = {};
  for (var r = 1; r < dData.length; r++) {
    rowByKey[keyOf(function (c) { return dHead[c] != null ? dData[r][dHead[c]] : ""; })] = r + 1;
  }
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var srcRow = rows[i];
    var get = function (col) { var ci = headers.indexOf(col); return ci >= 0 ? srcRow[ci] : ""; };
    if (!get("Property_name")) continue;
    var key = keyOf(get);
    var targetRow = rowByKey[key];
    if (!targetRow) { targetRow = dst.getLastRow() + 1; rowByKey[key] = targetRow; }
    for (var c = 0; c < headers.length; c++) {
      var name = headers[c];
      if (!name || dHead[name] == null) continue;
      dst.getRange(targetRow, dHead[name] + 1).setValue(srcRow[c]);
    }
    n++;
  }
  return n;
}

//    body: { kind:"factura"|"deposito", scope:"property"|"owner",
//            owner, property_name, mes:"2026-05", fileName, mimeType, dataBase64 }
//    - Estructura: raiz / (Facturas|Depositos) / <subcarpeta> / archivo
//      subcarpeta = nombre de la propiedad, o "Socio - <nombre>" si scope=owner.
//    - Nombre del archivo: "<propiedad o socio> - <mes>.<ext>"  (facil de ubicar)
//    - Reemplaza el archivo anterior del mismo periodo (no duplica).
//    - Registra/actualiza una fila en SA_FILES_TAB para alimentar las alertas.
function sa_uploadFile(ss, body) {
  var kind = (body.kind === "deposito") ? "deposito" : (body.kind === "retencion") ? "retencion" : (body.kind === "soporte") ? "soporte" : (body.kind === "estado-cuenta") ? "estado-cuenta" : (body.kind === "contrato") ? "contrato" : (body.kind === "longterm") ? "longterm" : "factura";
  var scope = (body.scope === "owner") ? "owner" : "property";
  var owner = String(body.owner || "").trim();
  var prop = String(body.property_name || "").trim();
  var account = String(body.account || "").trim();
  var mes = String(body.mes || "").trim();           // "2026-05"
  if (!body.dataBase64) return { ok: false, error: "no file data" };
  if (kind !== "estado-cuenta") {
    if (scope === "owner" && !owner) return { ok: false, error: "owner requerido" };
    if (scope === "property" && !prop) return { ok: false, error: "property requerida" };
  } else if (!account) { return { ok: false, error: "account requerida" }; }

  // carpetas
  var root = sa_rootFolder();
  var folderName = kind === "factura" ? SA_DRIVE_INVOICES : kind === "deposito" ? SA_DRIVE_DEPOSITS : kind === "retencion" ? SA_DRIVE_RETENCION : kind === "estado-cuenta" ? "Estados de cuenta" : kind === "contrato" ? "Contratos" : kind === "longterm" ? "Depositos long term" : SA_DRIVE_SUPPORT;
  var kindFolder = sa_getFolder(root, folderName);
  var subName = kind === "estado-cuenta" ? ("Cuenta " + account) : (scope === "owner" ? ("Socio - " + owner) : prop);
  var sub = sa_getFolder(kindFolder, sa_safeName(subName));

  // blob
  var ext = sa_extFromName(body.fileName) || sa_extFromMime(body.mimeType) || "bin";
  var baseLabel = kind === "estado-cuenta" ? account : (scope === "owner" ? owner : prop);
  var fileName = sa_safeName(baseLabel + " - " + mes) + "." + ext;
  var bytes = Utilities.base64Decode(body.dataBase64);

  if (body.multiple) {
    // varios archivos por propiedad/mes: NO reemplazar; busca un nombre libre
    // agregando " (2)", " (3)"... para no sobreescribir comprobantes anteriores.
    var stem = sa_safeName(baseLabel + " - " + mes), n = 2;
    while (sub.getFilesByName(fileName).hasNext()) { fileName = stem + " (" + n + ")." + ext; n++; }
  } else {
    // un solo archivo por periodo: reemplaza el anterior del mismo nombre
    var existing = sub.getFilesByName(fileName);
    while (existing.hasNext()) { existing.next().setTrashed(true); }
  }
  var blob = Utilities.newBlob(bytes, body.mimeType || "application/octet-stream", fileName);
  var file = sub.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  var url = file.getUrl();

  // registro: si multiple, APPEND (varias filas); si no, upsert (una fila)
  sa_registerFile(ss, { tipo: kind, scope: scope, owner: owner, property_name: scope === "owner" ? "" : prop, mes: mes, archivo: fileName, url: url, orderId: String(body.orderId || ""), account: account }, body.multiple);
  return { ok: true, url: url, fileName: fileName, folder: sub.getName() };
}

// Borrar un archivo (factura/deposito) de Drive y de la hoja de registro.
// body: { kind, scope, owner, property_name, mes, archivo }
function sa_deleteFile(ss, body) {
  var kind = (body.kind === "deposito") ? "deposito" : (body.kind === "retencion") ? "retencion" : (body.kind === "soporte") ? "soporte" : "factura";
  var scope = (body.scope === "owner") ? "owner" : "property";
  var archivo = String(body.archivo || "").trim();
  // 1) Drive: localizar la subcarpeta y mandar el archivo a la papelera
  try {
    var root = sa_rootFolder();
    var folderName = kind === "factura" ? SA_DRIVE_INVOICES : kind === "deposito" ? SA_DRIVE_DEPOSITS : kind === "retencion" ? SA_DRIVE_RETENCION : SA_DRIVE_SUPPORT;
    var kindFolder = sa_getFolder(root, folderName);
    var subName = scope === "owner" ? ("Socio - " + String(body.owner || "")) : String(body.property_name || "");
    var sub = sa_getFolder(kindFolder, sa_safeName(subName));
    if (archivo) { var it = sub.getFilesByName(archivo); while (it.hasNext()) it.next().setTrashed(true); }
  } catch (e) {}
  // 2) Registro: borrar la(s) fila(s) que coincidan
  var sh = ss.getSheetByName(SA_FILES_TAB);
  var removed = 0;
  if (sh) {
    var map = sa_headerMap(sh);
    var data = sh.getDataRange().getValues();
    for (var r = data.length - 1; r >= 1; r--) {
      var sameArch = archivo && String(data[r][map["archivo"]] || "").trim() === archivo;
      var sameKey = sa_normKey(data[r][map["tipo"]], data[r][map["scope"]], scope === "owner" ? data[r][map["owner"]] : data[r][map["property_name"]], data[r][map["mes"]]) ===
                    sa_normKey(kind, scope, scope === "owner" ? body.owner : body.property_name, body.mes);
      if (sameArch || (!archivo && sameKey)) { sh.deleteRow(r + 1); removed++; }
    }
  }
  return { ok: true, removed: removed };
}

function sa_rootFolder() {
  if (SA_DRIVE_ROOT_ID) { try { return DriveApp.getFolderById(SA_DRIVE_ROOT_ID); } catch (e) {} }
  var it = DriveApp.getFoldersByName(SA_DRIVE_ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SA_DRIVE_ROOT_NAME);
}
function sa_getFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function sa_safeName(s) { return String(s || "").replace(/[\/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "sin-nombre"; }
function sa_extFromName(n) { var m = String(n || "").match(/\.([a-z0-9]{2,5})$/i); return m ? m[1].toLowerCase() : ""; }
function sa_extFromMime(m) {
  m = String(m || "").toLowerCase();
  if (m.indexOf("pdf") >= 0) return "pdf";
  if (m.indexOf("png") >= 0) return "png";
  if (m.indexOf("jpeg") >= 0 || m.indexOf("jpg") >= 0) return "jpg";
  if (m.indexOf("webp") >= 0) return "webp";
  return "";
}
// upsert en la hoja de registro
function sa_registerFile(ss, rec, multiple) {
  var headers = ["tipo", "scope", "owner", "property_name", "mes", "archivo", "url", "cargado", "orderId", "account"];
  var sh = ss.getSheetByName(SA_FILES_TAB);
  if (!sh) { sh = ss.insertSheet(SA_FILES_TAB); sh.getRange(1, 1, 1, headers.length).setValues([headers]); }
  var map = sa_headerMap(sh);
  for (var h = 0; h < headers.length; h++) { if (map[headers[h]] == null) { sh.getRange(1, sh.getLastColumn() + 1).setValue(headers[h]); } }
  map = sa_headerMap(sh);
  var now = new Date();
  // multiple → siempre agrega una fila nueva (varios archivos por propiedad/mes)
  if (!multiple) {
    var data = sh.getDataRange().getValues();
    var keyOf = function (tipo, scope, owner, prop, mes) { return sa_normKey(tipo, scope, scope === "owner" ? owner : prop, mes); };
    var want = keyOf(rec.tipo, rec.scope, rec.owner, rec.property_name, rec.mes);
    for (var r = 1; r < data.length; r++) {
      var k = keyOf(data[r][map["tipo"]], data[r][map["scope"]], data[r][map["owner"]], data[r][map["property_name"]], data[r][map["mes"]]);
      if (k === want) {
        sh.getRange(r + 1, map["archivo"] + 1).setValue(rec.archivo);
        sh.getRange(r + 1, map["url"] + 1).setValue(rec.url);
        sh.getRange(r + 1, map["cargado"] + 1).setValue(now);
        return;
      }
    }
  }
  var arr = []; for (var c = 0; c < sh.getLastColumn(); c++) arr.push("");
  function put(col, val) { if (map[col] != null) arr[map[col]] = val; }
  put("tipo", rec.tipo); put("scope", rec.scope); put("owner", rec.owner);
  put("property_name", rec.property_name); put("mes", rec.mes);
  put("archivo", rec.archivo); put("url", rec.url); put("cargado", now);
  put("orderId", rec.orderId || "");
  put("account", rec.account || "");
  sh.appendRow(arr);
}

// ============================================================
// Contabilidad: guarda los movimientos clasificados de un estado
// de cuenta. body: { ym, account, currency, totals, pdf, rows:[
//   { date, doc, desc, debit, credit, saldo, tt, tag, categoria } ] }
// Reemplaza las filas previas de ese (ym, account) y reescribe.
// ============================================================
function sa_writeConta(ss, body) {
  var ym = String(body.ym || "").trim();
  var account = String(body.account || "").trim();
  if (!ym || !account) return { ok: false, error: "ym y account requeridos" };
  var headers = ["ym", "account", "currency", "date", "doc", "desc", "debe", "haber", "saldo", "tt", "tag", "categoria", "factura", "pdf_url", "savedAt"];
  var sh = ss.getSheetByName(SA_CONTA_TAB);
  if (!sh) { sh = ss.insertSheet(SA_CONTA_TAB); sh.getRange(1, 1, 1, headers.length).setValues([headers]); }
  var map = sa_headerMap(sh);
  for (var h = 0; h < headers.length; h++) { if (map[headers[h]] == null) { sh.getRange(1, sh.getLastColumn() + 1).setValue(headers[h]); } }
  map = sa_headerMap(sh);
  // borra filas previas de este (ym, account)
  var data = sh.getDataRange().getValues();
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][map["ym"]]) === ym && String(data[r][map["account"]]) === account) sh.deleteRow(r + 1);
  }
  var now = new Date();
  var rows = body.rows || [];
  var pdfUrl = (body.pdf && body.pdf.url) || "";
  var width = sh.getLastColumn();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var rw = rows[i]; var arr = []; for (var c = 0; c < width; c++) arr.push("");
    function set(col, val) { if (map[col] != null) arr[map[col]] = val; }
    set("ym", ym); set("account", account); set("currency", body.currency || "");
    set("date", rw.date || ""); set("doc", rw.doc || ""); set("desc", rw.desc || "");
    set("debe", rw.debit || 0); set("haber", rw.credit || 0); set("saldo", rw.saldo || 0);
    set("tt", rw.tt || ""); set("tag", rw.tag || ""); set("categoria", rw.categoria || rw.category || "");
    set("factura", rw.factura || "");
    set("pdf_url", pdfUrl); set("savedAt", now);
    out.push(arr);
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, width).setValues(out);
  return { ok: true, written: out.length, ym: ym, account: account };
}


function sa_fetchImage(body) {
  return sa_fetchImage_impl(body);
}

// ============================================================
// Gastos operativos / otros ingresos globales (P&L interno) — upsert por id
// ============================================================
function sa_writeContaOpex(ss, body) {
  var id = String(body.id || "").trim();
  if (!id) return { ok: false, error: "id requerido" };
  var headers = ["id", "kind", "mes", "concepto", "categoria", "monto", "moneda", "url", "archivo", "savedAt"];
  var sh = ss.getSheetByName(SA_OPEX_TAB);
  if (!sh) { sh = ss.insertSheet(SA_OPEX_TAB); sh.getRange(1, 1, 1, headers.length).setValues([headers]); }
  var map = sa_headerMap(sh);
  for (var h = 0; h < headers.length; h++) { if (map[headers[h]] == null) { sh.getRange(1, sh.getLastColumn() + 1).setValue(headers[h]); } }
  map = sa_headerMap(sh);
  var data = sh.getDataRange().getValues();
  var rowIdx = -1;
  for (var r = 1; r < data.length; r++) { if (String(data[r][map["id"]]) === id) { rowIdx = r + 1; break; } }
  var width = sh.getLastColumn();
  var arr = []; for (var c = 0; c < width; c++) arr.push("");
  function set(col, val) { if (map[col] != null) arr[map[col]] = val; }
  set("id", id); set("kind", body.kind || "opex"); set("mes", body.ym || ""); set("concepto", body.concepto || "");
  set("categoria", body.categoria || ""); set("monto", body.monto || 0); set("moneda", body.moneda || "GTQ");
  set("url", body.url || ""); set("archivo", body.archivo || ""); set("savedAt", new Date());
  if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, width).setValues([arr]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, width).setValues([arr]);
  return { ok: true, id: id };
}
// ============================================================
// Filas genéricas por id: Facturas · Contratos · Long term
// body: { tab, rows:[{ id, ... }] }  → upsert por id (agrega columnas nuevas)
// ============================================================
var SA_ROW_TABS = {
  "Facturas":  ["id", "tipo", "auth", "fecha", "mes", "nit", "contraparte", "descripcion", "total", "moneda", "clasificacion", "propiedad", "origen", "fuente", "ref", "nota", "savedAt"],
  "Contratos": ["id", "origen", "property_name", "nombre", "folio", "fecha", "estado", "url", "archivo", "sugerida", "savedAt"],
  "Long term": ["id", "sig", "fecha", "mes", "property_name", "monto", "moneda", "cuenta", "depositante", "comentario", "url", "archivo", "savedAt"]
};
function sa_rowsSheet(ss, tab) {
  var headers = SA_ROW_TABS[tab]; if (!headers) return null;
  var sh = ss.getSheetByName(tab);
  if (!sh) { sh = ss.insertSheet(tab); sh.getRange(1, 1, 1, headers.length).setValues([headers]); sh.setFrozenRows(1); }
  return sh;
}
function sa_writeRows(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return { ok: false, error: "hoja ocupada, intenta de nuevo" }; }
  try {
    var tab = String(body.tab || "");
    var byId = {}; (body.rows || []).forEach(function (r) { var k = String((r && r.id) || "").trim(); if (k) byId[k] = Object.assign(byId[k] || {}, r); });
    var rows = Object.keys(byId).map(function (k) { return byId[k]; });
    var sh = sa_rowsSheet(ss, tab); if (!sh) return { ok: false, error: "tab no permitida: " + tab };
    var map = sa_headerMap(sh);
    var need = SA_ROW_TABS[tab].slice();
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (need.indexOf(k) < 0) need.push(k); }); });
    var missing = need.filter(function (h) { return map[h] == null; });
    if (missing.length) { sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]); map = sa_headerMap(sh); }
    var width = sh.getLastColumn(), last = sh.getLastRow();
    var data = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
    var at = {}; for (var i = 0; i < data.length; i++) { var id0 = String(data[i][map["id"]] || ""); if (id0) at[id0] = i; }
    var added = 0, updated = 0, appendRows = [], touched = false;
    rows.forEach(function (r) {
      var id = String(r.id || "").trim(); if (!id) return;
      var base;
      if (at[id] != null) { base = data[at[id]]; touched = true; updated++; }
      else { base = []; for (var c = 0; c < width; c++) base.push(""); appendRows.push(base); at[id] = -1; added++; }
      Object.keys(r).forEach(function (k) { if (map[k] != null && k !== "savedAt") base[map[k]] = (r[k] == null ? "" : r[k]); });
      if (map["savedAt"] != null) base[map["savedAt"]] = new Date();
    });
    if (touched && data.length) sh.getRange(2, 1, data.length, width).setValues(data);
    if (appendRows.length) sh.getRange(last + 1, 1, appendRows.length, width).setValues(appendRows);
    return { ok: true, added: added, updated: updated };
  } finally { lock.releaseLock(); }
}
// Botón "Actualizar datos" del admin → hospitableAutomatico() (Actualizacion.gs, mismo proyecto).
// Tarda minutos: la web app NO la corre en la llamada (se cortaría). Programa un trigger
// de un solo uso que la ejecuta en segundo plano y guarda el resultado en SA_HSP.
function sa_hospitableSync() {
  if (typeof hospitableAutomatico !== "function") return { ok: false, error: "hospitableAutomatico no está en este proyecto" };
  var P = PropertiesService.getScriptProperties();
  var cur = {}; try { cur = JSON.parse(P.getProperty("SA_HSP") || "{}"); } catch (e) {}
  if (cur.state === "run" && Date.now() - (cur.t0 || 0) < 9 * 60 * 1000) return { ok: true, state: "run", t0: cur.t0 };
  sa_hspClearTriggers_();
  ScriptApp.newTrigger("sa_hspRun").timeBased().after(1000).create();
  var st = { state: "run", t0: Date.now() };
  P.setProperty("SA_HSP", JSON.stringify(st));
  return { ok: true, state: "run", t0: st.t0 };
}
function sa_hspRun() {
  var P = PropertiesService.getScriptProperties();
  sa_hspClearTriggers_();
  var prev = {}; try { prev = JSON.parse(P.getProperty("SA_HSP") || "{}"); } catch (e) {}
  var st = { state: "done", t0: prev.t0 || Date.now() };
  try {
    var r = hospitableAutomatico() || {};
    try { sa_resDirty_(); } catch (eD) {}
    st.r = { reservas: r.reservas || 0, nuevas: r.nuevas || 0, actualizadas: r.actualizadas || 0, errores: (r.errores || []).length };
  } catch (e) { st.state = "error"; st.error = String((e && e.message) || e).slice(0, 300); }
  st.t1 = Date.now();
  P.setProperty("SA_HSP", JSON.stringify(st));
}
function sa_hospitableStatus() {
  var st = {}; try { st = JSON.parse(PropertiesService.getScriptProperties().getProperty("SA_HSP") || "{}"); } catch (e) {}
  return Object.assign({ ok: true }, st);
}
function sa_hspClearTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "sa_hspRun") ScriptApp.deleteTrigger(t); });
}

// ============================================================
// Opciones avanzadas · Resumen mensual en el dashboard + "+ al acumulado"
// calcularResumenMensual(mes) vive en Codigo.gs (mismo proyecto).
// Llave única en Resumenconsolidado: property_name + mes.
// ============================================================
function sa_consolidadoSheet_(ss) {
  var shs = ss.getSheets();
  for (var i = 0; i < shs.length; i++) if (/^resumen\s*consolidado$/i.test(shs[i].getName().trim())) return shs[i];
  return null;
}
function sa_resNorm_(s) { return String(s == null ? "" : s).replace(/\s*-\s*/g, "-").trim().toLowerCase(); }
function sa_resMes_(v) {
  if (v instanceof Date) return v.toLocaleString("es-ES", { month: "long", year: "numeric" }).toLowerCase().trim();
  return String(v == null ? "" : v).toLowerCase().trim();
}
// Caché del cálculo: el mismo mes se sirve al instante hasta que algo cambie en la
// hoja (toda escritura vía la app marca SA_RES_STAMP; la Database entra en la clave
// por su nº de filas, por si Hospitable escribe directo).
function sa_resStamp_() { return PropertiesService.getScriptProperties().getProperty("SA_RES_STAMP") || "0"; }
function sa_resDirty_() { PropertiesService.getScriptProperties().setProperty("SA_RES_STAMP", String(Date.now())); }
function sa_resCalc_(body, ss) {
  if (typeof calcularResumenMensual !== "function") throw new Error("calcularResumenMensual no está en este proyecto (actualiza Codigo.gs)");
  var ym = String(body.ym || "");
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error("periodo inválido");
  var dbRows = 0; try { var db = (ss || SpreadsheetApp.openById(SA_SHEET_ID)).getSheetByName("Database"); dbRows = db ? db.getLastRow() : 0; } catch (e) {}
  var key = "res|" + ym + "|" + sa_resStamp_() + "|" + dbRows;
  var cache = CacheService.getScriptCache();
  if (!body.nocache) { var hit = cache.get(key); if (hit) { try { var o = JSON.parse(hit); o.cached = true; return o; } catch (e1) {} } }
  var t0 = Date.now();
  if (typeof normalizarMonedaUSD === "function") normalizarMonedaUSD();
  var r = calcularResumenMensual(ym);
  r.calcMs = Date.now() - t0;
  try { var s = JSON.stringify(r); if (s.length < 95000) cache.put(key, s, 21600); } catch (e2) {}
  return r;
}
function sa_resumenPreview(ss, body) {
  var r = sa_resCalc_(body, ss);
  var existing = {};
  var sh = sa_consolidadoSheet_(ss);
  if (sh && sh.getLastRow() > 1) {
    var data = sh.getDataRange().getValues();
    var H = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iP = H.indexOf("property_name"), iM = H.indexOf("mes");
    for (var i = 1; i < data.length; i++) {
      if (sa_resMes_(data[i][iM]) !== r.mesBusqueda) continue;
      var k = sa_resNorm_(data[i][iP]); if (!k) continue;
      if (existing[k]) { existing[k].count++; continue; }
      var vals = {}; H.forEach(function (h, c) { vals[h] = data[i][c]; });
      existing[k] = { count: 1, values: vals };
    }
  }
  return { ok: true, headers: r.encabezados, rows: r.resultados, mes: r.mesBusqueda, existing: existing, sheet: sh ? sh.getName() : "", closed: sa_mesCerrado_(body.ym), cached: !!r.cached, calcMs: r.calcMs || 0 };
}
// Un mes queda abierto hasta el día 10 del mes siguiente, 23:59 hora de Guatemala.
function sa_mesCerrado_(ym) { var p = String(ym).split("-"); return Date.now() >= Date.UTC(+p[0], +p[1], 11, 6, 0, 0); }
function sa_unlockOk_(u) {
  if (!u) return false;
  // confirmación por "mantener presionado" (300 ms) desde la app: la petición ya viene
  // autenticada como administrador (sesión firmada), así que basta con la intención explícita.
  if (u.hold === true) return "mantener presionado";
  if (u.pass) return "confirmación del administrador";   // la contraseña fija se quitó: la petición ya es de un admin con sesión
  if (u.deviceKey) { var d = {}; try { d = JSON.parse(PropertiesService.getScriptProperties().getProperty("SA_UNLOCK_DEVICES") || "{}"); } catch (e) {} if (d[u.deviceKey]) return "face id"; }
  return false;
}
function sa_registerUnlockDevice(body) {
  // Solo llega aquí un administrador con sesión firmada (ver doPost); ya no se pide la contraseña fija.
  var P = PropertiesService.getScriptProperties();
  var d = {}; try { d = JSON.parse(P.getProperty("SA_UNLOCK_DEVICES") || "{}"); } catch (e) {}
  var key = Utilities.getUuid() + "-" + Utilities.getUuid();
  d[key] = { label: String(body.label || "").slice(0, 80), t: new Date().toISOString() };
  P.setProperty("SA_UNLOCK_DEVICES", JSON.stringify(d));
  return { ok: true, deviceKey: key };
}
function sa_unlockLog_(ym, via, r) {
  var P = PropertiesService.getScriptProperties();
  var log = []; try { log = JSON.parse(P.getProperty("SA_UNLOCK_LOG") || "[]"); } catch (e) {}
  log.unshift({ t: new Date().toISOString(), ym: ym, via: via, added: r.added, updated: r.updated, removed: r.removed });
  P.setProperty("SA_UNLOCK_LOG", JSON.stringify(log.slice(0, 100)));
}
function sa_resumenAppend(ss, body) {
  var via = "";
  if (sa_mesCerrado_(body.ym)) {
    via = sa_unlockOk_(body.unlock);
    if (!via) return { ok: false, locked: true, error: "Mes cerrado: solo el administrador principal puede modificarlo." };
  }
  var out = sa_resumenAppendCore_(ss, body);
  if (via && out && out.ok) sa_unlockLog_(body.ym, via, out);
  return out;
}
// Comparación única (la misma que usa la vista previa): números con tolerancia
// de medio centavo, texto exacto. Devuelve la lista de columnas distintas.
function sa_resDiffCols_(H, colOf, row, base, mesBusqueda) {
  var cols = [];
  colOf.forEach(function (c, j) {
    if (c < 0) return;
    var a = row[j], b = base[c];
    if (H[c] === "mes" && sa_resMes_(b) === mesBusqueda) return;
    var numish = (typeof a === "number" || typeof b === "number") && (a === "" || b === "" || !isNaN(+a) && !isNaN(+b));
    var diff = numish ? Math.abs((+a || 0) - (+b || 0)) > 0.005 : String(a == null ? "" : a).trim() !== String(b == null ? "" : b).trim();
    if (diff) cols.push(H[c]);
  });
  return cols;
}
// body.force: sobrescribe TODAS las filas del mes con el recálculo aunque parezcan iguales.
function sa_resumenAppendCore_(ss, body) {
  // el candado ya lo tiene doPost: no se vuelve a pedir (anidarlo podía esperar 25 s y fallar)
  {
    var force = !!body.force;
    // gastos programados/condicionados del mes: se escriben ANTES de calcular (idempotente por orderId)
    var recur = null;
    try { recur = sa_recurApply_(ss, String(body.ym || ""), { closing: true, unlocked: true }); } catch (eRec) { recur = { error: String(eRec) }; }
    var r = sa_resCalc_(body, ss);                   // se recalcula en el servidor: nunca se confía en la pantalla
    // body.props: solo estas propiedades (botón por fila). Dedupe por (mes, propiedad):
    // agregar una fila sola y luego "todas" nunca duplica — la segunda vez se actualiza.
    var only = null;
    if (Array.isArray(body.props) && body.props.length) { only = {}; body.props.forEach(function (p) { only[sa_resNorm_(p)] = 1; }); }
    var resultados = only ? r.resultados.filter(function (row) { return only[sa_resNorm_(row[1])]; }) : r.resultados;
    var sh = sa_consolidadoSheet_(ss);
    if (!sh) { sh = ss.insertSheet("Resumenconsolidado"); sh.getRange(1, 1, 1, r.encabezados.length).setValues([r.encabezados]); sh.setFrozenRows(1); }
    if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, r.encabezados.length).setValues([r.encabezados]);
    // columnas: por nombre; las que falten se agregan al final
    var H = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var missing = r.encabezados.filter(function (h) { return H.indexOf(String(h).trim().toLowerCase()) < 0; });
    if (missing.length) { sh.getRange(1, H.length + 1, 1, missing.length).setValues([missing]); H = H.concat(missing.map(function (h) { return String(h).trim().toLowerCase(); })); }
    var W = H.length;
    var colOf = r.encabezados.map(function (h) { return H.indexOf(String(h).trim().toLowerCase()); });
    var iP = H.indexOf("property_name"), iM = H.indexOf("mes");
    var last = sh.getLastRow();
    var data = last > 1 ? sh.getRange(2, 1, last - 1, W).getValues() : [];
    var at = {}, dupRows = [];
    for (var i = 0; i < data.length; i++) {
      if (sa_resMes_(data[i][iM]) !== r.mesBusqueda) continue;
      var k = sa_resNorm_(data[i][iP]); if (!k) continue;
      if (at[k] != null) dupRows.push(i + 2); else at[k] = i;
    }
    var added = 0, updated = 0, same = 0, appendRows = [], touched = {}, changedKeys = [];
    resultados.forEach(function (row) {
      var k = sa_resNorm_(row[1]);
      if (at[k] != null) {
        var base = data[at[k]];
        var cols = sa_resDiffCols_(H, colOf, row, base, r.mesBusqueda);
        if (cols.length || force) {
          colOf.forEach(function (c, j) { if (c >= 0 && !(H[c] === "mes" && sa_resMes_(base[c]) === r.mesBusqueda)) base[c] = row[j]; });
          touched[at[k]] = 1;
          if (cols.length) { updated++; changedKeys.push(String(row[1]) + " (" + cols.slice(0, 3).join(", ") + ")"); } else same++;
        } else same++;
      } else {
        var nr = []; for (var c = 0; c < W; c++) nr.push("");
        colOf.forEach(function (c, j) { nr[c] = row[j]; });
        appendRows.push(nr); at[k] = -1; added++;
      }
    });
    // filas tocadas: se agrupan en tramos contiguos → una escritura por tramo (no una por fila)
    var idxs = Object.keys(touched).map(Number).sort(function (a, b) { return a - b; }), writes = 0;
    for (var s = 0; s < idxs.length;) {
      var e = s; while (e + 1 < idxs.length && idxs[e + 1] === idxs[e] + 1) e++;
      var block = []; for (var q = s; q <= e; q++) block.push(data[idxs[q]]);
      sh.getRange(idxs[s] + 2, 1, block.length, W).setValues(block); writes++;
      s = e + 1;
    }
    // duplicados: se borran de abajo hacia arriba para no mover índices
    dupRows.sort(function (a, b) { return b - a; }).forEach(function (rn) { sh.deleteRow(rn); });
    if (appendRows.length) sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, W).setValues(appendRows);
    SpreadsheetApp.flush();
    return { ok: true, added: added, updated: updated, same: same, removed: dupRows.length, forced: force ? idxs.length : 0, writes: writes, changed: changedKeys.slice(0, 12), recur: recur, sheet: sh.getName(), props: only ? Object.keys(only).length : null };
  }
}

// ============================================================
// Diferencia en el depósito sin tocar el acumulado
// body: { ym, property, oldDep, newDep, mode: "mes"|"registro", targetYm, unlock }
//  · "mes": la diferencia (USD → GTQ con el TC de la propiedad) entra como gasto
//    manual en el mes destino: "otro ingreso" si el depósito nuevo es mayor,
//    "insumos & gastos" si es menor. orderId AJU-… → nunca se duplica.
//  · "registro": solo queda constancia.
// Todo queda en la pestaña "Ajustes de depósito".
// ============================================================
var SA_AJUSTE_TAB = "Ajustes de depósito";
var SA_AJUSTE_H = ["fecha", "mes", "propiedad", "deposito anterior", "deposito nuevo", "diferencia usd", "accion", "mes destino", "valor gtq", "categoria", "orderId"];
function sa_resumenAjuste(ss, body) {
  var ym = String(body.ym || ""), prop = String(body.property || "").trim();
  if (!/^\d{4}-\d{2}$/.test(ym) || !prop) return { ok: false, error: "faltan datos del ajuste" };
  var oldDep = Math.round((+body.oldDep || 0) * 100) / 100, newDep = Math.round((+body.newDep || 0) * 100) / 100;
  var diff = Math.round((newDep - oldDep) * 100) / 100;
  if (!diff) return { ok: true, skipped: true };
  var mode = body.mode === "mes" ? "mes" : "registro", target = String(body.targetYm || "");
  var valorQ = "", cat = "", oid = "", added = 0, skipped = 0;
  if (mode === "mes") {
    if (!/^\d{4}-\d{2}$/.test(target)) return { ok: false, error: "elige el mes donde aplicar la diferencia" };
    if (sa_mesCerrado_(target) && !sa_unlockOk_(body.unlock)) return { ok: false, locked: true, error: "El mes destino está cerrado." };
    var tc = sa_recurTC_(ss)[sa_pnorm_(prop)] || 1;
    valorQ = Math.round(Math.abs(diff) * tc * 100) / 100;
    cat = diff > 0 ? "otro ingreso" : "insumos & gastos";
    oid = "AJU-" + ym + "-" + sa_pnorm_(prop).replace(/[^a-z0-9]+/g, "-") + "-" + target;
    var res = sa_appendInsumos(ss, { rows: [{
      Mes: parseInt(target.split("-")[1], 10), "Fecha de pedido": target + "-01", property_name: prop, valor: valorQ, categoria: cat,
      Comentario: "Ajuste de depósito de " + sa_resMesLabel_(ym) + ": anterior $" + oldDep.toFixed(2) + " → nuevo $" + newDep.toFixed(2) + " (" + (diff > 0 ? "+" : "") + diff.toFixed(2) + " USD × TC " + tc + ")",
      tag: "Ajuste depósito", orderId: oid, orderUrl: "", authProductos: "", authTarifa: ""
    }] });
    if (!res.ok) return res;
    added = res.added || 0; skipped = res.skipped || 0;
  }
  var sh = ss.getSheetByName(SA_AJUSTE_TAB);
  if (!sh) { sh = ss.insertSheet(SA_AJUSTE_TAB); sh.getRange(1, 1, 1, SA_AJUSTE_H.length).setValues([SA_AJUSTE_H]); sh.setFrozenRows(1); }
  sh.appendRow([new Date(), ym, prop, oldDep, newDep, diff, mode === "mes" ? (added ? "aplicado en mes" : "ya aplicado antes") : "solo registro", target, valorQ, cat, oid]);
  return { ok: true, mode: mode, diff: diff, valorQ: valorQ, categoria: cat, added: added, skipped: skipped };
}
function sa_resMesLabel_(ym) { var M = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]; var p = ym.split("-"); return M[+p[1] - 1] + " " + p[0]; }

function sa_deleteRows(ss, body) {
  var sh = ss.getSheetByName(String(body.tab || ""));
  if (!sh || !SA_ROW_TABS[body.tab]) return { ok: true, deleted: 0 };
  var ids = {}; (body.ids || []).forEach(function (x) { ids[String(x)] = 1; });
  var map = sa_headerMap(sh); var data = sh.getDataRange().getValues(); var del = 0;
  for (var r = data.length - 1; r >= 1; r--) { if (ids[String(data[r][map["id"]])]) { sh.deleteRow(r + 1); del++; } }
  return { ok: true, deleted: del };
}

function sa_deleteContaOpex(ss, body) {
  var id = String(body.id || "").trim();
  var sh = ss.getSheetByName(SA_OPEX_TAB);
  if (!sh) return { ok: true, deleted: 0 };
  var map = sa_headerMap(sh); var data = sh.getDataRange().getValues(); var del = 0;
  for (var r = data.length - 1; r >= 1; r--) { if (String(data[r][map["id"]]) === id) { sh.deleteRow(r + 1); del++; } }
  return { ok: true, deleted: del };
}

function sa_fetchImage_impl(body) {
  var url = body.url;
  if (!url) return { ok: false, error: "no url" };
  try {
    var html = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { "User-Agent": "Mozilla/5.0" } }).getContentText();
    var img = sa_meta(html, "og:image") || sa_meta(html, "twitter:image");
    if (!img) { var m = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i); if (m) img = m[1]; }
    if (img && img.indexOf("//") === 0) img = "https:" + img;
    return { ok: true, image: img || "" };
  } catch (e) { return { ok: false, error: String(e) }; }
}
function sa_meta(html, prop) {
  var re = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']+)["\']', "i");
  var m = html.match(re);
  if (m) return m[1];
  re = new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', "i");
  m = html.match(re);
  return m ? m[1] : null;
}


// ============================================================
// Gastos programados (recurrentes) y condicionados
// Pestaña "Gastos recurrentes" = las reglas. Cada aplicación escribe en
// "insumos & gastos" con orderId REC-<id>-<AAAA-MM>-<prop> (dedupe: nunca
// duplica). Hacia atrás no se toca nada: una regla solo aplica de "desde"
// en adelante, y cancelarla no borra lo ya aplicado.
//   tipo "fijo"         → valor GTQ cada mes
//   tipo "condicionado" → Σ términos: Q × estadías/noches, o % × monto USD
//                         (ingreso bruto/neto, reparaciones, insumos) × TC
// Los condicionados se calculan cuando el mes YA terminó (o al pasar el mes
// al acumulado). Disparador diario opcional: aplicarRecurrentesAutomatico.
// ============================================================
var SA_RECUR_TAB = "Gastos recurrentes";
var SA_RECUR_H = ["id", "estado", "frecuencia", "propiedades", "tipo", "valor", "terminos", "categoria", "tag", "comentario", "desde", "hasta", "creado", "cancelado", "aplicados"];
var SA_RECUR_MONEY = { ingresoBruto: 1, ingresoNeto: 1, reparaciones: 1, insumos: 1 };
var SA_RECUR_LBL = { estadias: "estadías", noches: "noches", ingresoBruto: "ingreso bruto", ingresoNeto: "ingreso neto", reparaciones: "inversiones & reparaciones", insumos: "insumos & gastos" };

function sa_jp_(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function sa_ym_(v) {
  if (v && v.getTime) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM");
  var m = String(v || "").match(/(\d{4})-(\d{1,2})/); return m ? m[1] + "-" + ("0" + m[2]).slice(-2) : "";
}
function sa_ymNow_() { return Utilities.formatDate(new Date(), "America/Guatemala", "yyyy-MM"); }
function sa_ymAdd_(ym, n) { var p = ym.split("-"), d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
function sa_ymEarliest_() { var prev = sa_ymAdd_(sa_ymNow_(), -1); return sa_mesCerrado_(prev) ? sa_ymNow_() : prev; }
function sa_pnorm_(s) { return String(s || "").replace(/\s*-\s*/g, "-").trim().toLowerCase(); }

function sa_recurSheet_(ss) {
  var sh = ss.getSheetByName(SA_RECUR_TAB);
  if (!sh) { sh = ss.insertSheet(SA_RECUR_TAB); sh.getRange(1, 1, 1, SA_RECUR_H.length).setValues([SA_RECUR_H]); sh.setFrozenRows(1); }
  var H = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  var miss = SA_RECUR_H.filter(function (h) { return H.indexOf(h) < 0; });
  if (miss.length) sh.getRange(1, H.length + 1, 1, miss.length).setValues([miss]);
  return sh;
}
function sa_recurRead_(ss) {
  var sh = sa_recurSheet_(ss);
  var d = sh.getDataRange().getValues(), H = d[0].map(String), rules = [];
  for (var r = 1; r < d.length; r++) {
    var o = { _row: r + 1 }; H.forEach(function (h, i) { o[h] = d[r][i]; });
    if (!o.id) continue;
    o.id = String(o.id); o.propiedades = sa_jp_(o.propiedades, []); o.terminos = sa_jp_(o.terminos, []);
    o.valor = +o.valor || 0; o.desde = sa_ym_(o.desde); o.hasta = sa_ym_(o.hasta);
    o.aplicados = String(o.aplicados || "").split(",").filter(String);
    o.estado = String(o.estado || "activo"); o.frecuencia = String(o.frecuencia || "mensual");
    rules.push(o);
  }
  return { sh: sh, H: H, rules: rules };
}
function sa_recurWrite_(R, o) {
  var row = R.H.map(function (h) {
    var v = o[h];
    if (h === "propiedades" || h === "terminos") return JSON.stringify(v || []);
    if (h === "aplicados") return (v || []).join(",");
    if ((h === "desde" || h === "hasta") && v) return "'" + v;   // texto, que Sheets no lo vuelva fecha
    return v == null ? "" : v;
  });
  if (o._row) R.sh.getRange(o._row, 1, 1, row.length).setValues([row]);
  else { R.sh.appendRow(row); o._row = R.sh.getLastRow(); }
}
function sa_recurPublic_(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== "_row") c[k] = o[k]; }); return c; }

// ¿la regla aplica al mes ym?
function sa_recurCovers_(o, ym) { return o.desde && ym >= o.desde && (!o.hasta || ym <= o.hasta); }

// tipo de cambio por propiedad (pestaña TC: col A propiedad, col C tasa)
function sa_recurTC_(ss) {
  var sh = ss.getSheetByName("TC"), m = {}; if (!sh) return m;
  sh.getDataRange().getValues().slice(1).forEach(function (r) { var k = sa_pnorm_(r[0]); if (k) m[k] = parseFloat(String(r[2] || "0").replace(",", ".")) || 1; });
  return m;
}
// variables del mes por propiedad (desde calcularResumenMensual de Codigo.gs, en USD)
function sa_recurVars_(ym, cache) {
  if (cache[ym]) return cache[ym];
  var out = {};
  if (typeof calcularResumenMensual === "function") {
    var r = calcularResumenMensual(ym);
    (r.resultados || []).forEach(function (x) {
      out[sa_pnorm_(x[1])] = { noches: +x[3] || 0, estadias: +x[4] || 0, ingresoBruto: +x[5] || 0, insumos: +x[10] || 0, reparaciones: +x[11] || 0, ingresoNeto: +x[12] || 0 };
    });
  }
  cache[ym] = out; return out;
}
function sa_recurAmounts_(ss, o, ym, cache) {
  var props = o.propiedades || [];
  if (o.tipo !== "condicionado") return props.map(function (p) { return { prop: p, amount: Math.round(o.valor * 100) / 100, detail: "monto fijo" }; });
  var V = sa_recurVars_(ym, cache), TC = cache.__tc || (cache.__tc = sa_recurTC_(ss));
  return props.map(function (p) {
    var k = sa_pnorm_(p), v = V[k] || {}, tasa = TC[k] || 1, tot = 0, det = [];
    (o.terminos || []).forEach(function (t) {
      var f = +t.f || 0, x = +v[t.v] || 0;
      if (SA_RECUR_MONEY[t.v]) { tot += (f / 100) * x * tasa; det.push(f + "% de " + SA_RECUR_LBL[t.v] + " (" + Math.round(x * tasa * 100) / 100 + ")"); }
      else { tot += f * x; det.push(x + " " + SA_RECUR_LBL[t.v] + " × Q" + f); }
    });
    return { prop: p, amount: Math.round(tot * 100) / 100, detail: det.join(" + "), vars: v };
  });
}

// Aplica las reglas que cubren ym. opts: { only: id, closing, unlocked }
function sa_recurApply_(ss, ym, opts) {
  opts = opts || {};
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: "periodo inválido" };
  if (ym > sa_ymNow_()) return { ok: true, added: 0 };
  if (sa_mesCerrado_(ym) && !opts.unlocked) return { ok: true, added: 0, closed: true };
  var R = sa_recurRead_(ss), cache = {}, rows = [], used = {};
  var mm = parseInt(ym.split("-")[1], 10), p = ym.split("-");
  var last = ym + "-" + ("0" + new Date(+p[0], +p[1], 0).getDate()).slice(-2);
  R.rules.forEach(function (o) {
    if (opts.only && o.id !== opts.only) return;
    if (!sa_recurCovers_(o, ym)) return;
    if (o.tipo === "condicionado" && ym >= sa_ymNow_() && !opts.closing) return;   // el mes aún no termina
    sa_recurAmounts_(ss, o, ym, cache).forEach(function (a) {
      if (!(a.amount > 0)) return;
      rows.push({
        Mes: mm, "Fecha de pedido": o.tipo === "condicionado" ? last : ym + "-01",
        property_name: a.prop, valor: a.amount, categoria: o.categoria || "insumos & gastos",
        Comentario: (o.comentario || "Gasto programado") + " · " + a.detail + " · [REC:" + o.id + "]",
        tag: o.tag || "", orderId: "REC-" + o.id + "-" + ym + "-" + sa_pnorm_(a.prop).replace(/[^a-z0-9]+/g, "-"),
        orderUrl: "", authProductos: "", authTarifa: ""
      });
      used[o.id] = o;
    });
  });
  var res = rows.length ? sa_appendInsumos(ss, { rows: rows }) : { ok: true, added: 0 };
  Object.keys(used).forEach(function (id) { var o = used[id]; if (o.aplicados.indexOf(ym) < 0) { o.aplicados.push(ym); sa_recurWrite_(R, o); } });
  return { ok: res.ok !== false, added: res.added || 0, skipped: res.skipped || 0, ym: ym };
}
// aplica a todos los meses pendientes desde "desde" hasta hoy (máx. 3)
function sa_recurCatchUp_(ss, o) {
  var ym = o.desde, now = sa_ymNow_(), n = 0, added = 0;
  while (ym <= now && n < 3) { var r = sa_recurApply_(ss, ym, { only: o.id }); added += r.added || 0; ym = sa_ymAdd_(ym, 1); n++; }
  return added;
}

function sa_recurList(ss) {
  var R = sa_recurRead_(ss);
  return { ok: true, rules: R.rules.map(sa_recurPublic_), now: sa_ymNow_(), earliest: sa_ymEarliest_() };
}
function sa_recurSave(ss, body) {
  var x = body.rule || {};
  var props = (x.propiedades || []).filter(String);
  if (!props.length) return { ok: false, error: "Elige al menos una propiedad." };
  var desde = sa_ym_(x.desde), min = sa_ymEarliest_();
  if (!desde) return { ok: false, error: "Elige el mes." };
  if (desde < min) return { ok: false, error: "Ese mes ya está cerrado: los gastos programados solo aplican hacia adelante." };
  var tipo = x.tipo === "condicionado" ? "condicionado" : "fijo";
  var terms = (x.terminos || []).filter(function (t) { return t && SA_RECUR_LBL[t.v] && +t.f > 0; }).map(function (t) { return { v: t.v, f: +t.f }; });
  if (tipo === "fijo" && !(+x.valor > 0)) return { ok: false, error: "Escribe el monto." };
  if (tipo === "condicionado" && !terms.length) return { ok: false, error: "Agrega al menos una variable con su valor." };
  var freq = x.frecuencia === "una vez" ? "una vez" : "mensual";
  var o = {
    id: "R" + Date.now().toString(36), estado: "activo", frecuencia: freq, propiedades: props, tipo: tipo,
    valor: tipo === "fijo" ? +x.valor : 0, terminos: terms, categoria: x.categoria || "insumos & gastos",
    tag: x.tag || "", comentario: x.comentario || "", desde: desde, hasta: freq === "una vez" ? desde : "",
    creado: new Date(), cancelado: "", aplicados: []
  };
  var R = sa_recurRead_(ss); sa_recurWrite_(R, o);
  var added = sa_recurCatchUp_(ss, o);
  sa_recurEnsureTrigger_();
  return { ok: true, rule: sa_recurPublic_(o), added: added };
}
function sa_recurCancel(ss, body) {
  var R = sa_recurRead_(ss), o = R.rules.filter(function (r) { return r.id === String(body.id); })[0];
  if (!o) return { ok: false, error: "No se encontró la regla." };
  var now = sa_ymNow_();
  // deja de aplicar desde el primer mes que todavía no se aplicó
  var from = o.aplicados.indexOf(now) >= 0 ? sa_ymAdd_(now, 1) : now;
  if (from < o.desde) from = o.desde;
  o.hasta = sa_ymAdd_(from, -1); o.estado = "cancelado"; o.cancelado = new Date();
  sa_recurWrite_(R, o);
  return { ok: true, rule: sa_recurPublic_(o) };
}
function sa_recurApplyAction(ss, body) {
  if (body.id) {
    var o = sa_recurRead_(ss).rules.filter(function (r) { return r.id === String(body.id); })[0];
    if (!o) return { ok: false, error: "No se encontró la regla." };
    return { ok: true, added: sa_recurCatchUp_(ss, o) };
  }
  return sa_recurApply_(ss, sa_ym_(body.ym), {});
}
function sa_recurPreview(ss, body) {
  var x = body.rule || {}, ym = sa_ym_(x.desde || body.ym);
  if (!ym) return { ok: false, error: "periodo inválido" };
  var o = { propiedades: x.propiedades || [], tipo: x.tipo, valor: +x.valor || 0, terminos: (x.terminos || []).map(function (t) { return { v: t.v, f: +t.f || 0 }; }) };
  return { ok: true, ym: ym, finished: ym < sa_ymNow_(), items: sa_recurAmounts_(ss, o, ym, {}) };
}
function sa_recurEnsureTrigger_() {
  try {
    var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "aplicarRecurrentesAutomatico"; });
    if (!has) ScriptApp.newTrigger("aplicarRecurrentesAutomatico").timeBased().everyDays(1).atHour(6).create();
  } catch (e) {}
}
// Disparador diario: fijos del mes en curso + condicionados del mes que ya terminó.
function aplicarRecurrentesAutomatico() {
  var ss = SpreadsheetApp.openById(SA_SHEET_ID);
  var lock = LockService.getScriptLock();
  try { lock.waitLock(60000); } catch (e) { return; }
  try { var now = sa_ymNow_(); sa_recurApply_(ss, sa_ymAdd_(now, -1), {}); sa_recurApply_(ss, now, {}); }
  finally { lock.releaseLock(); }
}

// ------------------------------------------------------------
// SETUP sin contraseñas (oct 2026)
// La pestaña SETUP tenía una columna «Password» con la contraseña de cada socio, y la app la descargaba entera
// al abrir. Ya nadie la usa (todos entran con el login unificado), así que:
//  · leerSetup devuelve SETUP sin las columnas de contraseña (la app lee SETUP por aquí).
//  · Las escrituras (saveSetupRaw, addProperty, saveProfile) nunca escriben ni borran esa columna.
//  · La primera lectura vacía la columna en la hoja (sa_quitarClavesDeSetup_), para que tampoco salga por el
//    lector de hojas ni por la descarga directa. Antes guarda un respaldo en las Propiedades del script:
//    SETUP_CLAVE_<Usuario ID> = sha256 de la contraseña (solo el hash, nunca la contraseña).
// ------------------------------------------------------------
function sa_esColClave_(h) { return /^(password|pass|contrase(n|ñ)a|clave|pwd)$/i.test(String(h || "").trim()); }
function sa_sha256Hex_(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)
    .map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
function sa_quitarClavesDeSetup_(ss) {
  var sh = ss.getSheetByName(SA_TAB_SETUP); if (!sh || sh.getLastRow() < 2) return 0;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], cols = [];
  head.forEach(function (h, i) { if (sa_esColClave_(h)) cols.push(i); });
  if (!cols.length) return 0;
  var data = sh.getDataRange().getValues(), uidCol = head.map(function (h) { return String(h).trim(); }).indexOf("Usuario ID");
  var hay = data.slice(1).some(function (r) { return cols.some(function (c) { return String(r[c] == null ? "" : r[c]) !== ""; }); });
  if (!hay) return 0;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0;
  try {
    data = sh.getDataRange().getValues();
    var props = PropertiesService.getScriptProperties(), n = 0;
    for (var r = 1; r < data.length; r++) {
      cols.forEach(function (c) {
        var v = String(data[r][c] == null ? "" : data[r][c]);
        if (!v) return;
        var quien = String((uidCol >= 0 ? data[r][uidCol] : "") || ("fila" + (r + 1))).trim().replace(/[^A-Za-z0-9_@.\-]/g, "_").slice(0, 200);
        if (!props.getProperty("SETUP_CLAVE_" + quien)) props.setProperty("SETUP_CLAVE_" + quien, sa_sha256Hex_(v));
        sh.getRange(r + 1, c + 1).setValue("");
        n++;
      });
    }
    return n;
  } finally { lock.releaseLock(); }
}
function sa_leerSetup(ss) {
  try { sa_quitarClavesDeSetup_(ss); } catch (e) { console.warn("sa_quitarClavesDeSetup_: " + e); }
  var sh = ss.getSheetByName(SA_TAB_SETUP);
  if (!sh) return { ok: false, error: "No existe SETUP" };
  var v = sh.getDataRange().getDisplayValues();
  if (!v.length) return { ok: true, csv: "" };
  var quitar = v[0].map(function (h) { return sa_esColClave_(h); });
  var csv = v.map(function (row) {
    return row.filter(function (_, i) { return !quitar[i]; })
      .map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(",");
  }).join("\n");
  return { ok: true, csv: csv };
}
