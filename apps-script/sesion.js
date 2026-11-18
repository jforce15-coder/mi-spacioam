/* ═══ SESIÓN FIRMADA · fase 1b (oct 2026) ═══════════════════════════════════════════
   Archivo común a los backends de Spacio AM (Mi, Epi, Grow, Docs, Hola). Lo mantiene GitHub.

   · sesionDe_(body) → perfil del usuario si la app envió una sesión firmada válida (body.session), o null.
     La comprueba el Apps Script del login (acción verify) y se guarda 1 hora en caché.
   · registrarAcceso_(accion, conSesion) → apunta, por acción, la última vez que llegó con sesión y sin
     ella (una sola propiedad: ACCESOS). Sirve para saber qué acciones usan huéspedes o enlaces públicos
     (sin sesión) antes de exigir sesión en las demás (fase 1c).
   · accesosDiag_(body) → si body.action === '__accesos' y trae la llave del robot, devuelve ese resumen.
   · Entrar nunca depende del cupo (18-nov-2026): si el login no contesta (sin cupo de Google, red o error) la sesión se
     comprueba aquí con LOGIN_SECRETO (el mismo valor que SESSION_SECRET del login; lo reparte el Hub con la llave del
     robot, acción «__loginSecreto»). Firma inválida, vencida o sin LOGIN_SECRETO → null (no se abre nada).
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
    /* Entrar nunca depende del cupo (Juan, 18-nov-2026): si Google ya dijo «sin cupo» hace poco, la firma se revisa aquí
       primero, sin gastar una llamada que va a fallar. */
    if (sesSinCupo_() && sesSecreto_()) { var l0 = sesionLocal_(session); if (l0) cache.put(k, JSON.stringify(l0), 600); return l0; }
    var prof = null;
    try {
      var r = uf_(SES_LOGIN_URL_, { method: 'post', contentType: 'text/plain;charset=utf-8', muteHttpExceptions: true, followRedirects: true,
        payload: JSON.stringify({ action: 'verify', token: PropertiesService.getScriptProperties().getProperty('LOGIN_TOKEN') || 'SpacioAM2026!', session: session }) });
      var j = JSON.parse(r.getContentText() || '{}');
      if (j.ok && j.profile) prof = j.profile;
    } catch (e) {
      /* El login no contestó (sin cupo de Google, red o error): la firma se revisa aquí con la misma llave (LOGIN_SECRETO).
         Lo que salga bien se guarda 10 min; un «no» no se guarda (el login puede volver). */
      console.warn('sesionDe_: ' + e);
      if (/too many times/i.test(String((e && e.message) || e))) sesSinCupoMarcar_();
      var l1 = sesionLocal_(session); if (l1) cache.put(k, JSON.stringify(l1), 600);
      return l1;
    }
    cache.put(k, prof ? JSON.stringify(prof) : '-', prof ? 3600 : 600);
    return prof;
  } finally { if (conLock) lock.releaseLock(); }
}

/* ── Comprobación local de la sesión firmada (login/apps-script/03-auth-endpoint.js del Hub, _verificarSesion) ──
   HMAC-SHA256 del cuerpo con LOGIN_SECRETO, comparación en tiempo constante y vencimiento. Perfil o null. */
function sesSecreto_() { try { return PropertiesService.getScriptProperties().getProperty('LOGIN_SECRETO') || ''; } catch (e) { return ''; } }
function sesionLocal_(session) {
  try {
    var sec = sesSecreto_(); if (!sec) return null;
    var tok = String(session || ''), i = tok.lastIndexOf('.'); if (i < 1) return null;
    var cuerpo = tok.slice(0, i), firma = tok.slice(i + 1);
    var esperada = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(cuerpo, sec)).replace(/=+$/, '');
    if (firma.length !== esperada.length) return null;
    var dif = 0; for (var n = 0; n < firma.length; n++) dif |= firma.charCodeAt(n) ^ esperada.charCodeAt(n);
    if (dif !== 0) return null;
    var d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(cuerpo + '==='.slice((cuerpo.length + 3) % 4))).getDataAsString());
    if (!d || !d.e || !d.exp || d.exp < Date.now()) return null;
    return d.p && d.p.email ? d.p : { email: d.e, nombre: d.n || '', apps: d.apps || {} };
  } catch (e) { console.warn('sesionLocal_: ' + e); return null; }
}
/* Google dijo «sin cupo» (too many times … urlfetch): durante 30 min la sesión se revisa aquí primero. */
function sesSinCupo_() { try { return !!CacheService.getScriptCache().get('ses_sin_cupo'); } catch (e) { return false; } }
function sesSinCupoMarcar_() { try { CacheService.getScriptCache().put('ses_sin_cupo', '1', 1800); } catch (e) {} }
/* Acción «__loginSecreto» (solo con la llave del robot, como «__accesos»): el Hub entrega LOGIN_SECRETO o pregunta si ya
   está. Nunca devuelve el valor: solo { ok, tiene }. */
function loginSecretoDiag_(body) {
  if (!body || body.action !== '__loginSecreto') return null;
  var out = null;
  if (!esRobot_({ robot: String(body.token || '') })) out = { ok: false, error: 'token' };
  else {
    var p = PropertiesService.getScriptProperties(), s = body.secreto == null ? '' : String(body.secreto).trim();
    if (s && (s.length < 32 || /\s/.test(s))) out = { ok: false, error: 'secreto' };
    else { if (s && s !== p.getProperty('LOGIN_SECRETO')) p.setProperty('LOGIN_SECRETO', s); out = { ok: true, tiene: !!p.getProperty('LOGIN_SECRETO') }; }
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function registrarAcceso_(accion, conSesion) {
  try {
    accion = String(accion || '(sin acción)').slice(0, 60);
    var tipo = conSesion === 'r' ? 'r' : conSesion ? 's' : 'n', cache = CacheService.getScriptCache(), ck = 'acc_' + tipo + '_' + accion;
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

/* ═══ FASE 1c · EXIGIR SESIÓN (apagado por defecto) ═══════════════════════════════════════
   · esRobot_(body) → true si la llamada trae la llave del robot (body.robot): el Hub y ALMA llaman así, de
     servidor a servidor, porque no tienen sesión de una persona.
   · exigirSesion_(accion, conSesion, body, publicas) → null si la llamada puede seguir; si no, la respuesta
     { ok:false, error:"session" } (sa-sesion.js la entiende: vuelve al login).
     Solo bloquea cuando la propiedad del script SESION_EXIGIR = 1. Siempre pasan: quien trae sesión, el robot
     y las acciones públicas de la app (huéspedes, firmas, webhooks). Lo bloqueado queda en ACCESOS como
     «⛔ acción», para ver al instante si algo legítimo se quedó afuera y apagarlo (SESION_EXIGIR = 0).
   ═════════════════════════════════════════════════════════════════════════════════════════ */
function esRobot_(body) {
  var t = String((body && body.robot) || ''); if (!t) return false;
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('') === SES_ROBOT_HASH_;
}
function exigirSesion_(accion, conSesion, body, publicas) {
  if (conSesion) return null;
  accion = String(accion || '');
  if ((publicas || []).indexOf(accion) >= 0 || esRobot_(body)) return null;
  if (PropertiesService.getScriptProperties().getProperty('SESION_EXIGIR') !== '1') return null;
  registrarAcceso_('⛔ ' + accion, false);
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'session' })).setMimeType(ContentService.MimeType.JSON);
}
