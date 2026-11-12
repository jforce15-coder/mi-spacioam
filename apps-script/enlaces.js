/* ═══ ENLACES CORTOS (Hub #488 · T5) ═══════════════════════════════════════════════════════════════════════
   mi.spacioam.com/k7q2m en vez de un enlace largo de Mi (un reporte, un documento de Drive de un socio). El mismo
   diseño que Grow (T1) y el Hub (T2). Regla de Juan (12-nov-2026): el enlace corto lleva la dirección de la app que lo
   genera; si el acortador no responde, sale el largo.
   Hoy los correos a socios (cierre de mes y recordatorio de factura) solo llevan mi.spacioam.com, que ya es corta: el
   acortador queda en el punto final de los correos (enviarCorreo_ de PLANTILLA-CORREOS.js) para que todo enlace largo
   que se agregue salga corto solo, y el Hub le pide aquí el código de lo que Alma manda de mi.spacioam.com.
   · Hoja «Enlaces» (en la hoja de Mi): codigo · url · app · creado · por · clics · ultimo. Se crea sola con el primero.
   · acortar_(url, por): mi.spacioam.com/<código>, o el mismo enlace si no se acorta o algo falla (nunca frena un
     envío). Solo enlaces https de mi.spacioam.com y de Google Drive / Docs, de más de 40 letras y que no sean solo la
     dirección.
   · acortarEnTexto_(texto, por) y acortarEnHtml_(html, por): lo mismo dentro de un texto o de los href de un correo
     (las imágenes no se tocan).
   · Op «acortar» (con sesión o con la llave del robot, la que usa el Hub): { url } → { ok, codigo, corto }.
   · Op «enlace» (PÚBLICA, sin sesión): { codigo } → { ok, data: { url } } y suma un clic. Solo ese dato; nunca crea la
     hoja ni filas. La usa 404.html, la página que GitHub Pages muestra para cualquier dirección que no existe.
   · Las dos van antes del permiso de administrador y del candado del script en doPost: no esperan a otra escritura.
   · El código: 5 caracteres al azar de 23456789abcdefghjkmnpqrstuvwxyz (sin 0/o ni 1/l/i). Si choca, se sortea otro.
     El mismo enlace da siempre el mismo código.
   · El candado es el de usuario, no el del script: los envíos de correos a socios ya tienen el del script.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
var ENLACES_HOJA_ = 'Enlaces';
var ENLACES_CAB_ = ['codigo', 'url', 'app', 'creado', 'por', 'clics', 'ultimo'];
var ENLACES_ABC_ = '23456789abcdefghjkmnpqrstuvwxyz';
var ENLACES_RX_ = /^[23456789abcdefghjkmnpqrstuvwxyz]{5}$/;
var ENLACES_APP_ = 'mi';
var ENLACES_BASE_ = 'https://mi.spacioam.com/';
var ENLACES_HOSTS_ = ['mi.spacioam.com', 'drive.google.com', 'docs.google.com'];
var ENLACES_RESERVADOS_ = ['cname'];   // archivos del sitio con forma de código: esa dirección nunca llega a 404.html
var ENLACES_MIN_ = 40;                 // el corto mide 29: uno de 40 o menos se deja

function enlacesLibro_() { return SpreadsheetApp.openById(SA_SHEET_ID); }

/* La hoja, o null si no existe y no se pidió crearla. */
function enlacesHoja_(crear) {
  var ss = enlacesLibro_(), sh = ss.getSheetByName(ENLACES_HOJA_);
  if (!sh && crear) {
    sh = ss.insertSheet(ENLACES_HOJA_);
    sh.getRange(1, 1, 1, ENLACES_CAB_.length).setValues([ENLACES_CAB_]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh || null;
}

/* El enlace largo, limpio, o '' si no se puede acortar (otro dominio, sin https, con @, puerto o espacios, o muy largo). */
function enlaceUrlValida_(url) {
  url = String(url == null ? '' : url).trim();
  if (!url || url.length > 2000 || /\s/.test(url)) return '';
  var m = url.match(/^https:\/\/([^\/?#:@]+)(?:[\/?#]|$)/i);
  if (!m || ENLACES_HOSTS_.indexOf(m[1].toLowerCase()) < 0) return '';
  return url;
}

/* ¿Vale la pena acortarlo? Es de esta app (o Drive), mide más de 40 y no es solo la dirección. */
function enlaceAcortable_(url) {
  var u = enlaceUrlValida_(url);
  return !!u && u.length > ENLACES_MIN_ && !/^https:\/\/[^\/?#]+\/?$/i.test(u);
}

function enlaceCodigoNuevo_(usados) {
  for (var intento = 0; intento < 20; intento++) {
    var c = '';
    for (var i = 0; i < 5; i++) c += ENLACES_ABC_.charAt(Math.floor(Math.random() * ENLACES_ABC_.length));
    if (!usados[c] && ENLACES_RESERVADOS_.indexOf(c) < 0) return c;
  }
  throw new Error('No pude crear un código nuevo. Intenta otra vez.');
}

/* El acortador en sí: { codigo, corto }. Mismo enlace, mismo código (caché de 6 h y, si no, la hoja). */
function enlaceGuardar_(url, por) {
  var u = enlaceUrlValida_(url);
  if (!u) throw new Error('Ese enlace no se puede acortar: solo los de ' + ENLACES_HOSTS_[0] + ' o de Google Drive.');
  var cache = CacheService.getScriptCache();
  var k = 'enl_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, u, Utilities.Charset.UTF_8));
  var ya = cache.get(k);
  if (ya && ENLACES_RX_.test(ya)) return { codigo: ya, corto: ENLACES_BASE_ + ya };
  var lock = LockService.getUserLock(), mio = !lock.hasLock();
  if (mio && !lock.tryLock(5000)) throw new Error('El acortador está ocupado. Intenta otra vez.');
  try {
    var sh = enlacesHoja_(true), v = sh.getDataRange().getValues(), usados = {};
    for (var i = 1; i < v.length; i++) {
      var c = String(v[i][0] == null ? '' : v[i][0]).trim().toLowerCase();
      if (!c) continue;
      if (String(v[i][1]) === u && ENLACES_RX_.test(c)) { cache.put(k, c, 21600); return { codigo: c, corto: ENLACES_BASE_ + c }; }
      usados[c] = true;
    }
    var codigo = enlaceCodigoNuevo_(usados), fila = Math.max(sh.getLastRow(), 1) + 1;
    por = String(por || ENLACES_APP_).slice(0, 80);
    if (/^[=+\-@]/.test(por)) por = "'" + por;   // lo que viene de afuera nunca se guarda como fórmula
    sh.getRange(fila, 1).setNumberFormat('@');   // el código como texto: «22345» o «3e222» no se vuelven número
    sh.getRange(fila, 1, 1, ENLACES_CAB_.length).setValues([[codigo, u, ENLACES_APP_, new Date().toISOString(), por, 0, '']]);
    cache.put(k, codigo, 21600);
    return { codigo: codigo, corto: ENLACES_BASE_ + codigo };
  } finally { if (mio) lock.releaseLock(); }
}

/* El corto de url, o url tal cual si no se acorta o algo falla. */
function acortar_(url, por) {
  if (!enlaceAcortable_(url)) return url;
  try { return enlaceGuardar_(String(url).trim(), por).corto; }
  catch (e) { console.warn('acortar_: ' + e); return url; }
}

/* Cada enlace acortable de un texto, por su corto. El punto, la coma o el paréntesis que cierran la frase quedan fuera. */
function acortarEnTexto_(texto, por) {
  if (texto == null || String(texto).indexOf('https://') < 0) return texto;
  return String(texto).replace(/https:\/\/[^\s<>"'«»“”\[\]{}|\\^`]+/gi, function (m) {
    var url = m, cola = '';
    while (/[.,;:!?)*~…]$/.test(url)) {
      if (url.slice(-1) === ')' && url.split('(').length >= url.split(')').length) break;   // (…) del propio enlace
      cola = url.slice(-1) + cola; url = url.slice(0, -1);
    }
    return enlaceAcortable_(url) ? acortar_(url, por) + cola : m;
  });
}

/* Los href de un correo en HTML (los botones y enlaces). Las imágenes (src) no se tocan. */
function acortarEnHtml_(html, por) {
  if (html == null || String(html).indexOf('https://') < 0) return html;
  return String(html).replace(/(href\s*=\s*)(["'])(https:\/\/[^"'<>\s]+)\2/gi, function (m, a, q, url) {
    var largo = url.replace(/&amp;/g, '&');
    if (!enlaceAcortable_(largo)) return m;
    var corto = acortar_(largo, por);
    return corto === largo ? m : a + q + corto + q;
  });
}

/* Op «acortar»: { url } → { ok, codigo, corto }. Con sesión o con la llave del robot (el Hub). */
function acortarEnlace_(body, ses) {
  if (!ses && !esRobot_(body)) return { ok: false, error: 'Para acortar un enlace hace falta iniciar sesión.' };
  try {
    var por = ses ? String(ses.email || ses.nombre || 'sesión') : 'Alma' + (body && body.por ? ' · ' + String(body.por).slice(0, 60) : '');
    var r = enlaceGuardar_(body && body.url, por);
    return { ok: true, codigo: r.codigo, corto: r.corto };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

/* Op «enlace» (pública): { codigo } → { ok, data: { url } }. Un código raro o que no existe da el mismo error, sin más. */
function abrirEnlace_(codigo) {
  var NO = { ok: false, error: 'Este enlace no existe.' };
  try {
    var c = String(codigo == null ? '' : codigo).trim().toLowerCase();
    if (!ENLACES_RX_.test(c)) return NO;
    var sh = enlacesHoja_(false); if (!sh) return NO;
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0] == null ? '' : v[i][0]).trim().toLowerCase() !== c) continue;
      var url = enlaceUrlValida_(v[i][1]);   // por si alguien editó la hoja a mano: nunca redirige a otro dominio
      if (!url) return NO;
      try {   // contar el clic nunca frena la apertura
        var lock = LockService.getUserLock(), mio = !lock.hasLock();
        if (!mio || lock.tryLock(3000)) {
          try {
            var celdas = sh.getRange(i + 1, 6, 1, 2), act = celdas.getValues()[0];
            celdas.setValues([[(Number(act[0]) || 0) + 1, new Date().toISOString()]]);
          } finally { if (mio) lock.releaseLock(); }
        }
      } catch (e) { console.warn('abrirEnlace_ clic: ' + e); }
      return { ok: true, data: { url: url } };
    }
    return NO;
  } catch (e) { console.error('abrirEnlace_: ' + e); return NO; }
}
