/* ═══ TRASLADO · quién atiende lo de fondo (Hub-Spacioam docs/specs/traslado-workspace.md) ═══
   Mientras dura el traslado a alma@ hay dos proyectos de Mi (el viejo en la cuenta Gmail y el nuevo en alma@) que leen
   la misma hoja (Spacio AM 2025). Si los dos corrieran sus activadores de las 6:00, los gastos fijos del mes se
   cargarían dos veces y Hospitable se sincronizaría dos veces.
   Los vivos del viejo el 18-nov-2026 (robot __traslado): los tres de MI_ACTIVADORES_, todos por reloj.
   · La pestaña TRASLADO de Spacio AM 2025 dice qué proyecto es el dueño (B1 = su id). Un activador diario de cualquier
     otro proyecto sale sin hacer nada (miSaltarActivador_). Sin la pestaña o con B1 vacío, todos corren como siempre.
   · Solo se saltan las corridas que lanza un ACTIVADOR (traen triggerUid) de las funciones de MI_ACTIVADORES_. Lo que
     pide la app o el Hub por /exec corre siempre en el proyecto que lo recibe (también sa_hspRun, el «Actualizar datos»
     que se lanza al vuelo: lo pidió alguien en ese proyecto).
   · La pestaña se lee en cada activador, sin caché. Si la hoja no se puede leer, el activador corre.
   · miTomarActivadores() (lo corre el nuevo al traer las Propiedades, «al_traer»): instala los activadores de Mi y,
     solo si quedaron todos, se anota como dueño. Desde ahí lo de fondo lo hace alma@; el viejo queda de respaldo.
   · La pestaña no la lee la app: leerHojas solo entrega las pestañas de su lista (leerhojas.js).
   · Volver atrás: robot { action: "__traslado", token, dueno: "yo" } al proyecto VIEJO (o poner su id en B1 a mano). */
var MI_TRASLADO_HOJA_ = 'TRASLADO';
/* Los activadores diarios de Mi: [función, cómo]. Los que tiene vivos el viejo (robot __traslado). */
var MI_ACTIVADORES_ = [
  ['aplicarRecurrentesAutomatico', function (b) { return b.atHour(6).everyDays(1); }],   // gastos fijos y condicionados del mes
  ['hospitableAutomatico', function (b) { return b.atHour(6).everyDays(1); }],           // reservas de Hospitable → DATABASE
  ['generarResumenMensual', function (b) { return b.atHour(7).everyDays(1); }]           // resumen del mes de Resumen!C1 (el viejo lo tiene por reloj; Google no dice la hora: 7:00, después de Hospitable)
];

function miTrasladoHoja_(crear) {
  var ss = SpreadsheetApp.openById(SA_SHEET_ID), sh = ss.getSheetByName(MI_TRASLADO_HOJA_);
  if (!sh && crear) { sh = ss.insertSheet(MI_TRASLADO_HOJA_); try { sh.hideSheet(); } catch (e) {} }
  return sh;
}
function miDueno_() {
  var sh = miTrasladoHoja_(false);
  return sh ? String(sh.getRange('B1').getValue() || '').trim() : '';
}
function miPonerDueno_(id) {
  var sh = miTrasladoHoja_(true);
  sh.getRange('A1:C1').setValues([['dueño', id, new Date().toISOString()]]);
  sh.getRange('A2').setValue('El proyecto con este id atiende lo de fondo de Mi (gastos fijos y Hospitable a las 6:00, resumen del mes). Para volver al viejo, pon su id en B1.');
}

/* true = este proyecto NO es el dueño y la corrida viene de un activador: salir sin hacer nada. */
function miSaltarActivador_(e) {
  if (!e || typeof e !== 'object' || !e.triggerUid) return false;
  var d = '';
  try { d = miDueno_(); } catch (err) { console.warn('miSaltarActivador_: ' + err); return false; }
  if (!d || d === ScriptApp.getScriptId()) return false;
  console.log('Traslado: lo de fondo lo atiende el proyecto ' + d.slice(0, 8) + '…; este sale sin hacer nada.');
  return true;
}

function miActivadoresVivos_() {
  var n = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { var f = t.getHandlerFunction(); n[f] = (n[f] || 0) + 1; });
  return n;
}
/* Cómo es cada activador vivo (para copiarlo igual): función → [tipo · origen · id de la hoja si es de hoja]. */
function miActivadoresTipos_() {
  var out = {};
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var d = String(t.getEventType()) + ' · ' + String(t.getTriggerSource());
    try { if (String(t.getTriggerSource()) === 'SPREADSHEETS') d += ' · ' + String(t.getTriggerSourceId()).slice(-6); } catch (e) {}
    (out[t.getHandlerFunction()] = out[t.getHandlerFunction()] || []).push(d);
  });
  return out;
}

function miTomarActivadores() {
  var nombres = MI_ACTIVADORES_.map(function (x) { return x[0]; });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (nombres.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  var fallas = [];
  MI_ACTIVADORES_.forEach(function (x) {
    try { x[1](ScriptApp.newTrigger(x[0]).timeBased()).create(); } catch (e) { fallas.push(x[0] + ': ' + e.message); }
  });
  var n = miActivadoresVivos_();
  var faltan = nombres.filter(function (f) { return !n[f]; });
  if (faltan.length) {   // sin todos los activadores no se toma nada: el viejo sigue siendo el dueño (ni hueco ni dobles)
    ScriptApp.getProjectTriggers().forEach(function (t) { if (nombres.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
    throw new Error('Faltaron activadores (' + faltan.join(', ') + '). ' + fallas.join(' · ') + ' El viejo sigue atendiendo lo de fondo. Vuelve a correr miTomarActivadores.');
  }
  miPonerDueno_(ScriptApp.getScriptId());
  console.log('Mi: activadores ' + JSON.stringify(n) + '. Dueño de lo de fondo: este proyecto.');
  return n;
}

/* Robot: { action: "__traslado", token } → id de este proyecto, dueño, activadores vivos y si abre la hoja y la carpeta.
   Con dueno: "yo" este proyecto se vuelve el dueño, solo si ya tiene todos sus activadores (volver atrás sin hueco). */
function miTrasladoDiag_(body) {
  if (!body || body.action !== '__traslado') return null;
  var out;
  try {
    if (!esRobot_({ robot: String(body.token || '') })) out = { ok: false, error: 'token' };
    else {
      var n = miActivadoresVivos_(), yo = ScriptApp.getScriptId();
      var faltan = MI_ACTIVADORES_.map(function (x) { return x[0]; }).filter(function (f) { return !n[f]; });
      if (body.dueno === 'yo') {
        if (faltan.length) out = { ok: false, error: 'faltan_activadores', faltan: faltan };
        else miPonerDueno_(yo);
      }
      if (!out) {
        var d = miDueno_(), abre = {};
        try { abre.hoja = !!SpreadsheetApp.openById(SA_SHEET_ID).getName(); } catch (e) { abre.hoja = false; }
        try { abre.carpeta = !!DriveApp.getFolderById(SA_DRIVE_ROOT_ID).getName(); } catch (e) { abre.carpeta = false; }
        out = { ok: true, proyecto: yo, dueno: d, soy_dueno: !d || d === yo, activadores: n, tipos: miActivadoresTipos_(), faltan: faltan, abre: abre, pegado: !!SpreadsheetApp.getActiveSpreadsheet() };
      }
    }
  } catch (e) { out = { ok: false, error: String(e.message || e).slice(0, 120) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
