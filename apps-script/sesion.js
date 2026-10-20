/* ═══ SESIÓN FIRMADA · fase 1b (oct 2026) ═══════════════════════════════════════════
   Archivo común a los backends de Spacio AM (Mi, Epi, Grow, Docs, Hola). Lo mantiene GitHub.

   · sesionDe_(body) → perfil del usuario si la app envió una sesión firmada válida (body.session), o null.
     La comprueba el Apps Script del login (acción verify) y se guarda 1 hora en caché.
   · registrarAcceso_(accion, conSesion) → apunta, por acción, la última vez que llegó con sesión y sin
     ella (una sola propiedad: ACCESOS). Sirve para saber qué acciones usan huéspedes o enlaces públicos
     (sin sesión) antes de exigir sesión en las demás (fase 1c).
   · accesosDiag_(body) → si body.action === '__accesos' y trae la llave del robot, devuelve ese resumen.
   Nada de esto bloquea todavía: las apps siguen funcionando igual con o sin sesión.
   ═══════════════════════════════════════════════════════════════════════════════════ */
var SES_LOGIN_URL_ = 'https://script.google.com/macros/s/AKfycbxfdwLzsA8bwgOxUTOtf3Hw1ptIm8Cy34tspmFndu3WtRrkVSSnGyBP7obRrm73mcUd/exec';
var SES_ROBOT_HASH_ = 'b0d3ca9d3adb76025e4b4289181cb6300d7769a1d53a2a0c91636df9e0c65ed5';

function sesionDe_(body) {
  var session = String((body && body.session) || '');
  if (session.indexOf('.') < 1 || session.length > 4000) return null;
  var cache = CacheService.getScriptCache();
  var k = 'ses_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, session)).slice(0, 40);
  var hit = cache.get(k);
  if (hit) { try { return hit === '-' ? null : JSON.parse(hit); } catch (e) {} }
  var lock = LockService.getUserLock(), conLock = !lock.hasLock() && lock.tryLock(15000);
  try {
    hit = cache.get(k);
    if (hit) { try { return hit === '-' ? null : JSON.parse(hit); } catch (e) {} }
    var prof = null;
    try {
      var r = UrlFetchApp.fetch(SES_LOGIN_URL_, { method: 'post', contentType: 'text/plain;charset=utf-8', muteHttpExceptions: true, followRedirects: true,
        payload: JSON.stringify({ action: 'verify', token: PropertiesService.getScriptProperties().getProperty('LOGIN_TOKEN') || 'SpacioAM2026!', session: session }) });
      var j = JSON.parse(r.getContentText() || '{}');
      if (j.ok && j.profile) prof = j.profile;
    } catch (e) { console.warn('sesionDe_: ' + e); return null; }   // error de red: no se guarda el negativo
    cache.put(k, prof ? JSON.stringify(prof) : '-', prof ? 3600 : 600);
    return prof;
  } finally { if (conLock) lock.releaseLock(); }
}

function registrarAcceso_(accion, conSesion) {
  try {
    accion = String(accion || '(sin acción)').slice(0, 60);
    var tipo = conSesion ? 's' : 'n', cache = CacheService.getScriptCache(), ck = 'acc_' + tipo + '_' + accion;
    if (cache.get(ck)) return;                       // como mucho una escritura por acción y tipo cada hora
    cache.put(ck, '1', 3600);
    var lock = LockService.getUserLock(), conLock = !lock.hasLock() && lock.tryLock(5000);
    try {
      var p = PropertiesService.getScriptProperties(), m = {};
      try { m = JSON.parse(p.getProperty('ACCESOS') || '{}'); } catch (e) {}
      m[accion] = m[accion] || {};
      m[accion][tipo] = new Date().toISOString();
      p.setProperty('ACCESOS', JSON.stringify(m));
    } finally { if (conLock) lock.releaseLock(); }
  } catch (e) { console.warn('registrarAcceso_: ' + e); }
}

function accesosDiag_(body) {
  if (!body || body.action !== '__accesos') return null;
  var t = String(body.token || ''), h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  var out = h === SES_ROBOT_HASH_ ? { ok: true, accesos: JSON.parse(PropertiesService.getScriptProperties().getProperty('ACCESOS') || '{}'), traza: JSON.parse(CacheService.getScriptCache().get('traza') || '[]') } : { ok: false, error: 'token' };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
