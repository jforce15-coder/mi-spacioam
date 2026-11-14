/* ═══ FICHA DEL SOCIO (Hub #522 · T1 y T2) ══════════════════════════════════════════════════════════════════════════
   Lo que cada socio le ha contado a Alma: notas (cómo prefiere que le escriban, que habla inglés) y detalles que importan
   (un evento, un viaje, la boda de su hija), con su fecha. Alma la lee antes de hablar con el socio, la completa sola y
   retoma un detalle ya pasado una sola vez. Juan la ve, la corrige y la borra en Mi (pestaña «Socios», fichasocio.jsx).
   · Dónde vive: en un libro PRIVADO de Mi («Mi · Fichas de socios», pestaña SOCIO_FICHA), no en la hoja de Mi: la hoja
     de Mi se lee pública desde el navegador (gviz CSV, sheets.js), así que una pestaña nueva ahí la vería cualquiera que
     tenga su id (está en los repos). El libro lo crea el código al primer uso y guarda su id en la propiedad del script
     MI_FICHAS_ID (si Juan quiere otro libro, pone ahí su id).
   · Op «fichaSocio» (en doPost, antes del permiso de administrador y del candado del script, como «acortar»): solo con
     la sesión del administrador principal (rol admin_principal en Mi) o con la llave del robot (el Hub). Un socio, con su
     propia sesión de Mi, nunca la ve.
       op «listar»                                   → { ok, items } (todas, sin las borradas)
       op «ver»      { correo, tel }                 → { ok, items } (las de ese socio: por correo o por su número)
       op «anotar»   { correo, tel, nombre, propiedad, tipo, texto, fecha_evento, fuente } → { ok, id } · { ok, duplicado, id }
       op «corregir» { id, texto?, fecha_evento?, tipo? } → { ok, item }
       op «borrar»   { id }                          → { ok } (la fila queda sin texto, con quién y cuándo la borró)
       op «retomado» { id }                          → { ok } (Alma ya lo retomó: no lo vuelve a usar)
   · Lo que anota o corrige Alma (el robot) nunca trae salud, religión, política ni datos bancarios (la misma lista que el
     Hub, apps-script/fichasocio.js de Hub-Spacioam) y no repite lo que ya está. Lo que escribe Juan es decisión suya.
   · Las escrituras toman el candado de usuario (como enlaces.js): el del script lo tienen los envíos largos.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
var FICHA_HOJA_ = 'SOCIO_FICHA';
var FICHA_LIBRO_NOMBRE_ = 'Mi · Fichas de socios (privado)';
var FICHA_CAB_ = ['id', 'socio_correo', 'socio_tel', 'socio_nombre', 'propiedad', 'tipo', 'texto', 'fecha_evento', 'creado', 'por', 'fuente', 'retomado', 'editado', 'borrado'];
var FICHA_TIPOS_ = ['nota', 'detalle'];
var FICHA_FUENTES_ = ['whatsapp', 'encargo', 'llamada', 'chat', 'mi'];
/* Lo que nunca se guarda de un socio (Juan, 14-nov-2026). Misma lista que el Hub: si cambia aquí, cambia allá. Cada
   palabra va entera (ni «Pinula» es «pin» ni «judo» es religión); las letras con tilde cuentan como letra. */
function fichaRx_(alt) { return new RegExp('(?<![a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc])(' + alt + ')(?![a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc])', 'i'); }
var FICHA_PROHIBIDO_ = [
  ['salud', fichaRx_('salud|enferm\\S*|hospital\\S*|cl[ií]nicas?|m[eé]dic[oa]s?|doctor(a|es)?|diagn[oó]stic\\S*|c[aá]ncer|tumor(es)?|cirug[ií]as?|(lo|la|le|me) (operan|operaron|operar[aá]n)|quimio\\S*|terapias?|psic[oó]log\\S*|psiquiatr\\S*|depresi[oó]n|ansiedad|diabet\\S*|covid|embaraz\\S*|medicamentos?|alergi\\S*|discapacidad|internad[oa]|convalec\\S*')],
  ['religión', fichaRx_('religi[oó]n|religios[oa]s?|iglesias?|misas?|sacerdotes?|templo|mezquita|sinagoga|cat[oó]lic[oa]s?|evang[eé]lic[oa]s?|cristian[oa]s?|jud[ií](o|a|os|as)|musulm[aá]n(a|es|as)?|bautiz\\S*|primera comuni[oó]n|retiro espiritual|rezar|oraci[oó]n')],
  ['política', fichaRx_('pol[ií]tic\\S*|partido pol[ií]tico|elecci[oó]n(es)?|electoral(es)?|vot(o|os|ar|[oó]|aron)|candidat\\S*|diputad[oa]s?|campa[ñn]a electoral')],
  ['datos bancarios', fichaRx_('banc(o|os|aria|arias|ario|arios)|cuenta (de ahorro|monetaria|corriente|bancaria)|n[uú]mero de cuenta|iban|swift|tarjeta de (cr[eé]dito|d[eé]bito)|transferencias?|contrase[ñn]as?|claves?|pin')],
  ['datos bancarios', /\d[\d\s-]{6,}\d/]   // un número largo (cuenta, tarjeta, teléfono) nunca va en la ficha
];

/* El motivo por el que un texto no se puede guardar ('' si se puede). */
function fichaProhibido_(texto) {
  var t = String(texto == null ? '' : texto);
  for (var i = 0; i < FICHA_PROHIBIDO_.length; i++) if (FICHA_PROHIBIDO_[i][1].test(t)) return FICHA_PROHIBIDO_[i][0];
  return '';
}

/* El libro privado (lo crea si se pide y no existe). */
function fichaLibro_(crear) {
  var p = PropertiesService.getScriptProperties(), id = String(p.getProperty('MI_FICHAS_ID') || '').trim();
  if (id) return SpreadsheetApp.openById(id);
  if (!crear) return null;
  var ss = SpreadsheetApp.create(FICHA_LIBRO_NOMBRE_);   // nuevo = privado: solo la cuenta que publica el Apps Script
  p.setProperty('MI_FICHAS_ID', ss.getId());
  return ss;
}
function fichaHoja_(crear) {
  var ss = fichaLibro_(crear); if (!ss) return null;
  var sh = ss.getSheetByName(FICHA_HOJA_);
  if (!sh && crear) {
    var hojas = ss.getSheets(), vacia = hojas.length === 1 && hojas[0].getLastRow() === 0 ? hojas[0] : null;
    sh = vacia ? vacia.setName(FICHA_HOJA_) : ss.insertSheet(FICHA_HOJA_);
    sh.getRange(1, 1, 1, FICHA_CAB_.length).setValues([FICHA_CAB_]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh || null;
}

function fichaFin8_(t) { return String(t == null ? '' : t).replace(/\D/g, '').slice(-8); }
function fichaCelda_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }   // nunca como fórmula
function fichaFecha_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, 'America/Guatemala', 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function fichaTexto_(v) { return v instanceof Date ? v.toISOString() : String(v == null ? '' : v); }

/* Las filas como objetos (con su número de fila), las borradas incluidas. */
function fichaFilas_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var o = { fila: i + 1 };
    FICHA_CAB_.forEach(function (k, j) { o[k] = k === 'fecha_evento' ? fichaFecha_(v[i][j]) : fichaTexto_(v[i][j]); });
    if (o.id) out.push(o);
  }
  return out;
}
function fichaPublica_(o) { var r = {}; FICHA_CAB_.forEach(function (k) { if (k !== 'borrado') r[k] = o[k]; }); return r; }
function fichaDelSocio_(filas, correo, tel) {
  var c = String(correo || '').trim().toLowerCase(), k = fichaFin8_(tel);
  if (!c && k.length < 8) return [];
  return filas.filter(function (o) { return !o.borrado && ((c && o.socio_correo.toLowerCase() === c) || (k.length === 8 && fichaFin8_(o.socio_tel) === k)); });
}

/* ¿Ya está (aunque escrito distinto)? La mayoría de sus palabras con significado coinciden. */
function fichaPalabras_(t) {
  var vacias = ' de del la las el los un una unos unas y o en con por para su sus que se al a es le lo mi tu muy mas más ya ';
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(function (w) { return w.length > 2 && vacias.indexOf(' ' + w + ' ') < 0; }).map(function (w) { return w.slice(0, 5); });
}
function fichaParecida_(a, b) {
  var x = fichaPalabras_(a), y = fichaPalabras_(b); if (!x.length || !y.length) return false;
  var comun = x.filter(function (w) { return y.indexOf(w) >= 0; }).length;
  return comun / Math.min(x.length, y.length) >= 0.75;
}

/* Op «fichaSocio». ses: la sesión verificada (o null). */
function fichaSocioOp_(body, ses) {
  body = body || {};
  var principal = String((ses && ses.apps && ses.apps.mi) || '') === 'admin_principal', robot = esRobot_(body);
  if (!principal && !robot) return { ok: false, error: 'unauthorized' };
  var por = principal ? String(ses.email || ses.nombre || 'administrador').slice(0, 80) : 'Alma';
  try {
    var op = String(body.op || 'ver');
    if (op === 'listar' || op === 'ver') {
      var filas = fichaFilas_(fichaHoja_(false));
      var items = op === 'listar' ? filas.filter(function (o) { return !o.borrado; }) : fichaDelSocio_(filas, body.correo, body.tel);
      return { ok: true, items: items.map(fichaPublica_) };
    }
    if (['anotar', 'corregir', 'borrar', 'retomado'].indexOf(op) < 0) return { ok: false, error: 'op desconocida: ' + op };
    var lock = LockService.getUserLock(), mio = !lock.hasLock();
    if (mio && !lock.tryLock(8000)) return { ok: false, busy: true, error: 'La ficha está ocupada. Intenta otra vez.' };
    try { return fichaEscribir_(op, body, por, robot && !principal); }
    finally { if (mio) lock.releaseLock(); }
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

function fichaEscribir_(op, body, por, esAlma) {
  var ahora = new Date().toISOString();
  var texto = body.texto == null ? null : String(body.texto).replace(/\s+/g, ' ').trim();
  var fecha = body.fecha_evento == null ? null : String(body.fecha_evento).trim();
  if (fecha && !fichaFecha_(fecha)) return { ok: false, error: 'La fecha va como AAAA-MM-DD.' };
  if (texto != null && (texto.length < 3 || texto.length > 300)) return { ok: false, error: 'La nota va de 3 a 300 letras.' };
  if (esAlma && texto) { var mot = fichaProhibido_(texto); if (mot) return { ok: false, prohibido: mot, error: 'No se anota: es de ' + mot + '.' }; }
  var tipo = body.tipo == null ? null : (FICHA_TIPOS_.indexOf(String(body.tipo)) >= 0 ? String(body.tipo) : 'nota');

  if (op === 'anotar') {
    var correo = String(body.correo || '').trim().toLowerCase(), tel = String(body.tel || '').replace(/\D/g, '');
    if (!correo && tel.length < 8) return { ok: false, error: 'Falta de qué socio es (su correo o su número).' };
    if (!texto) return { ok: false, error: 'Falta el texto.' };
    var sh = fichaHoja_(true), filas = fichaFilas_(sh);
    var igual = fichaDelSocio_(filas, correo, tel).filter(function (o) { return fichaParecida_(o.texto, texto); })[0];
    if (igual) {
      if (fecha && !igual.fecha_evento) sh.getRange(igual.fila, FICHA_CAB_.indexOf('fecha_evento') + 1).setNumberFormat('@').setValue(fecha);
      return { ok: true, duplicado: true, id: igual.id };
    }
    var fuente = FICHA_FUENTES_.indexOf(String(body.fuente)) >= 0 ? String(body.fuente) : (esAlma ? 'chat' : 'mi');
    var id = 'fs' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    var fila = [id, correo, tel, String(body.nombre || '').slice(0, 80), String(body.propiedad || '').slice(0, 120), tipo || 'nota', texto, fecha || '', ahora, por, fuente, '', '', ''];
    var n = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(n, 1, 1, FICHA_CAB_.length).setNumberFormat('@').setValues([fila.map(fichaCelda_)]);   // texto plano: la fecha no se vuelve Date ni el número se pierde
    return { ok: true, id: id };
  }

  var sh2 = fichaHoja_(false), f = fichaFilas_(sh2).filter(function (o) { return o.id === String(body.id || '') && !o.borrado; })[0];
  if (!f) return { ok: false, error: 'No encontré esa nota (quizá ya se borró).' };
  var col = function (k) { return FICHA_CAB_.indexOf(k) + 1; };
  if (op === 'retomado') { sh2.getRange(f.fila, col('retomado')).setValue(ahora); return { ok: true }; }
  if (op === 'borrar') {
    sh2.getRange(f.fila, col('texto')).setValue('');
    sh2.getRange(f.fila, col('fecha_evento')).setValue('');
    sh2.getRange(f.fila, col('borrado')).setValue(fichaCelda_(ahora + ' · ' + por));
    return { ok: true };
  }
  /* corregir */
  if (texto != null) { if (!texto) return { ok: false, error: 'Falta el texto.' }; sh2.getRange(f.fila, col('texto')).setValue(fichaCelda_(texto)); f.texto = texto; }
  if (fecha != null) { sh2.getRange(f.fila, col('fecha_evento')).setNumberFormat('@').setValue(fecha); f.fecha_evento = fecha; }
  if (tipo != null) { sh2.getRange(f.fila, col('tipo')).setValue(tipo); f.tipo = tipo; }
  f.editado = ahora + ' · ' + por;
  sh2.getRange(f.fila, col('editado')).setValue(fichaCelda_(f.editado));
  return { ok: true, item: fichaPublica_(f) };
}
