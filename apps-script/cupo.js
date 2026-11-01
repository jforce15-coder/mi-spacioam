/* ═══ CUPO DE GOOGLE (Hub issue #318) ═════════════════════════════════════════════════════════════════════
   El cupo diario de UrlFetch es de la cuenta de Google: lo comparten todos los Apps Script de la cuenta (Hub/ALMA,
   Hola, Epi, Grow, Docs, Mi y el login). Esta app cuenta las suyas para que la batería de «Uso» del Hub sea de toda
   la cuenta. Este archivo es igual en Hola, Epi, Grow, Docs y Mi.
   · Toda llamada a internet de esta app pasa por uf_ / ufAll_ (mismos argumentos que UrlFetchApp.fetch / fetchAll;
     el canal es opcional y aquí no se usa: basta un total por hora).
   · Cuenta en CacheService: una clave por hora (cupo_<yyyyMMddHH>, hora de Guatemala) que dura 6 h.
   · La caché dura poco: la primera llamada de cada hora (y cada lectura del Hub) vuelca las horas cerradas a la
     propiedad CUPO_HORAS, un JSON { "yyyyMMddHH": n } con las últimas 48 h.
   · Acción «__cupo» (solo con la llave del robot, como «__accesos»): { ok:true, horas: { "yyyyMMddHH": n } }.
   · NUNCA pausa nada: solo cuenta. Si el contador falla, la llamada sigue igual. */

var CUPO_TZ_ = 'America/Guatemala';
var CUPO_PROP_ = 'CUPO_HORAS';
var CUPO_HORA_VISTA_ = '';   // hora ya revisada para el volcado en esta ejecución

/* ── Las llamadas ── */
function uf_(url, opciones, canal) {
  cupoContar_(1);
  return opciones === undefined ? UrlFetchApp.fetch(url) : UrlFetchApp.fetch(url, opciones);
}
function ufAll_(pedidos, canal) {
  var lista = pedidos || [];
  if (lista.length) cupoContar_(lista.length);   // fetchAll cuenta N
  return UrlFetchApp.fetchAll(lista);
}

function cupoHora_(ms) { return Utilities.formatDate(new Date(ms), CUPO_TZ_, 'yyyyMMddHH'); }

/* ── El contador ── una lectura y una escritura de caché por llamada; nunca rompe la llamada. */
function cupoContar_(n) {
  try {
    var c = CacheService.getScriptCache(), hora = cupoHora_(Date.now()), k = 'cupo_' + hora;
    c.put(k, String(Number(c.get(k) || 0) + (n || 1)), 21600);
    if (CUPO_HORA_VISTA_ !== hora) {   // la primera llamada de la hora vuelca las horas que ya cerraron
      CUPO_HORA_VISTA_ = hora;
      if (c.get('cupo_hora') !== hora) { c.put('cupo_hora', hora, 21600); cupoVolcar_(); }
    }
  } catch (e) { console.warn('cupoContar_: ' + e); }
}
/* Las horas guardadas en CUPO_HORAS (solo las últimas 48 h). */
function cupoGuardadas_() {
  var m = {};
  try { m = JSON.parse(PropertiesService.getScriptProperties().getProperty(CUPO_PROP_) || '{}') || {}; } catch (e) { m = {}; }
  var desde = cupoHora_(Date.now() - 48 * 3600000), out = {};
  Object.keys(m).forEach(function (h) { if (h >= desde && Number(m[h]) > 0) out[h] = Number(m[h]); });
  return out;
}
/* Pasa a CUPO_HORAS las horas cerradas que siguen en la caché (las de la caché duran 6 h). Se queda con el número
   mayor, así volcar dos veces no suma doble. */
function cupoVolcar_() {
  try {
    var c = CacheService.getScriptCache(), ahora = Date.now(), claves = [], horas = [];
    for (var i = 1; i <= 6; i++) { var h = cupoHora_(ahora - i * 3600000); horas.push(h); claves.push('cupo_' + h); }
    var v = c.getAll(claves), m = cupoGuardadas_(), cambio = false;
    horas.forEach(function (h, j) {
      var n = Number(v[claves[j]] || 0);
      if (n > (m[h] || 0)) { m[h] = n; cambio = true; }
    });
    var p = PropertiesService.getScriptProperties();
    if (cambio || p.getProperty(CUPO_PROP_) !== JSON.stringify(m)) p.setProperty(CUPO_PROP_, JSON.stringify(m));
  } catch (e) { console.warn('cupoVolcar_: ' + e); }
}
/* Las últimas 48 h: lo volcado y lo que está en la caché (incluida la hora actual). */
function cupoHoras_() {
  var m = cupoGuardadas_();
  try {
    var c = CacheService.getScriptCache(), ahora = Date.now(), claves = [], horas = [];
    for (var i = 0; i <= 6; i++) { var h = cupoHora_(ahora - i * 3600000); horas.push(h); claves.push('cupo_' + h); }
    var v = c.getAll(claves);
    horas.forEach(function (h, j) { var n = Number(v[claves[j]] || 0); if (n > (m[h] || 0)) m[h] = n; });
  } catch (e) { console.warn('cupoHoras_: ' + e); }
  return m;
}
/* Acción «__cupo»: el Hub la lee con la llave del robot (body.token, igual que «__accesos»). */
function cupoDiag_(body) {
  if (!body || body.action !== '__cupo') return null;
  var out;
  if (!esRobot_({ robot: String(body.token || '') })) out = { ok: false, error: 'token' };
  else { cupoVolcar_(); out = { ok: true, tz: CUPO_TZ_, horas: cupoHoras_() }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
