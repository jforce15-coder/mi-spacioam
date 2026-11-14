/* Prueba con dobles de la ficha del socio (Hub #522 · T1 y T2): apps-script/fichasocio.js, pasando por doPost de
   Escrituradesdeapp.js y la sesión de sesion.js, sin Sheets ni red.
   1. Vive en un libro privado (lo crea el código al primer uso y guarda su id en MI_FICHAS_ID), nunca en la hoja de Mi
      (que se lee pública desde el navegador): la hoja de Mi no recibe ninguna pestaña.
   2. Solo el administrador principal (su sesión) o el robot (el Hub, con su llave): sin sesión, con la sesión de un socio
      o con otra llave, nada (ni leer ni escribir).
   3. Lo que anota Alma (el robot): guarda lo personal permitido con su fecha; nunca salud, religión, política ni datos
      bancarios; no repite lo que ya está (y si llega la fecha que faltaba, la pone).
   4. «ver» trae solo las de ese socio (por su correo o su número); «retomado» lo marca; Juan corrige y borra (la fila
      queda sin texto) y lo borrado ya no sale en «ver» ni en «listar».
   node .github/ficha-socio.js [carpeta apps-script] */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const DIR = process.argv[2] || path.join(__dirname, '..', 'apps-script');
let fallo = 0; const ok = (c, m) => { if (c) console.log('✓ ' + m); else { console.log('::error::' + m); fallo = 1; } };
const LLAVE = 'llave-del-robot-de-prueba';
const SOC = { correo: 'socio.a@prueba.test', tel: '50255550201', nombre: 'Socio Prueba', propiedad: 'Z13 - Edificio Alto - 633' };

function hojaFalsa(nombre) {
  const sh = { nombre, filas: [], formatos: [],
    getDataRange: () => ({ getValues: () => sh.filas.map(f => f.slice()) }),
    getLastRow: () => sh.filas.length, setFrozenRows() {}, setName(n) { sh.nombre = n; return sh; },
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const rango = {
        setValues(vals) { vals.forEach((fila, i) => { while (sh.filas.length < r + i) sh.filas.push([]); fila.forEach((v, j) => { sh.filas[r + i - 1][c + j - 1] = v; }); }); return rango; },
        setValue(v) { return rango.setValues([[v]]); },
        setNumberFormat(f) { sh.formatos.push([r, c, f]); return rango; }, setFontWeight() { return rango; }
      };
      return rango;
    } };
  return sh;
}
function libroFalso(id) {
  const lb = { id, hojas: [hojaFalsa('Hoja 1')],
    getId: () => id, getName: () => id, getSheets: () => lb.hojas,
    getSheetByName: n => lb.hojas.find(h => h.nombre === n) || null,
    insertSheet: n => { const h = hojaFalsa(n); lb.hojas.push(h); return h; } };
  return lb;
}

function caja(o) {
  o = o || {};
  const cache = {}, props = { SESION_EXIGIR: o.exigir ? '1' : null }, libros = {}, creados = [];
  libros['1l9wLH8880NlN9ac2jvne2U6cqej6gycqAD77Z25cLF4'] = libroFalso('hoja-de-mi');
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, String, Number, Object, Array, RegExp, Error, Buffer, isNaN,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
    LockService: { getUserLock: () => ({ hasLock: () => false, tryLock: () => true, waitLock() {}, releaseLock() {} }),
                   getScriptLock: () => ({ hasLock: () => false, tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: s => ({ getContent: () => s, setMimeType() { return this; } }), MimeType: { JSON: 'json', JAVASCRIPT: 'js' } },
    Utilities: { DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, sleep() {},
      computeDigest: (alg, t) => Array.from(crypto.createHash(alg).update(String(t)).digest()).map(b => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64url'), formatDate: d => new Date(d).toISOString().slice(0, 10) },
    SpreadsheetApp: {
      openById: id => { if (!libros[id]) throw new Error('no existe ' + id); return libros[id]; },
      create: n => { const id = 'libro-privado-' + (creados.length + 1); creados.push(n); return (libros[id] = libroFalso(id)); },
      getActiveSpreadsheet: () => ({ getSheetByName: () => null, insertSheet: () => ({ appendRow() {} }) }) },
    GmailApp: { getAliases: () => [], sendEmail() {} }, Logger: { log() {} },
    UrlFetchApp: { fetch() { throw new Error('la prueba no sale a internet'); } }
  };
  vm.createContext(ctx);
  ['Escrituradesdeapp.js', 'PLANTILLA-CORREOS.js', 'sesion.js', 'cupo.js', 'enlaces.js', 'fichasocio.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f }));
  vm.runInContext("SES_ROBOT_HASH_ = '" + crypto.createHash('sha256').update(LLAVE).digest('hex') + "';", ctx);
  ctx.sesionDe_ = b => (b && b.session === 'juan' ? { email: 'juan@prueba.test', nombre: 'Juan', apps: { mi: 'admin_principal' } }
    : b && b.session === 'socio' ? { email: SOC.correo, nombre: 'Socio', apps: { mi: 'socio' } } : null);
  const api = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ action: 'fichaSocio' }, body)) } }).getContent());
  const privada = () => { const id = props.MI_FICHAS_ID; return id && libros[id] ? libros[id].getSheetByName('SOCIO_FICHA') : null; };
  return { ctx, props, libros, creados, api, privada };
}
const ROBOT = { robot: LLAVE };

/* ── 1 y 2 ── dónde vive y quién entra */
{ const c = caja();
  const r = c.api(Object.assign({ op: 'anotar', tipo: 'detalle', texto: 'La boda de su hija', fecha_evento: '2026-11-08', fuente: 'whatsapp' }, SOC, ROBOT));
  ok(r.ok && /^fs/.test(r.id), 'Alma (el robot) anota un detalle que importa: ' + r.id);
  ok(c.creados.length === 1 && /privado/.test(c.creados[0]) && /^libro-privado/.test(c.props.MI_FICHAS_ID), 'el libro privado se crea solo al primer uso y su id queda en MI_FICHAS_ID');
  const h = c.privada();
  ok(h && h.filas.length === 2 && h.filas[0][0] === 'id' && h.filas[0].indexOf('fecha_evento') >= 0 && h.filas[0].indexOf('retomado') >= 0, 'la pestaña SOCIO_FICHA tiene su encabezado (id … fecha_evento … retomado … borrado)');
  ok(c.libros['1l9wLH8880NlN9ac2jvne2U6cqej6gycqAD77Z25cLF4'].hojas.every(x => x.nombre !== 'SOCIO_FICHA'), 'la hoja de Mi (pública por gviz) no recibe ninguna pestaña nueva');
  ok(h.formatos.some(f => f[0] === 2 && f[2] === '@'), 'la fila se guarda como texto (la fecha no se vuelve Date ni el número pierde dígitos)');
  c.api(Object.assign({ op: 'anotar', texto: 'Prefiere que le escriban por la tarde' }, SOC, ROBOT));
  ok(c.creados.length === 1, 'la segunda nota va al mismo libro (no crea otro)');

  const sin = c.api({ op: 'listar' }), socio = c.api({ op: 'ver', session: 'socio', correo: SOC.correo }), otra = c.api({ op: 'listar', robot: 'otra' });
  ok([sin, socio, otra].every(x => x.ok === false && x.error === 'unauthorized' && !x.items), 'sin sesión, con la sesión de un socio o con otra llave: «unauthorized» y ningún dato');
  const escSocio = c.api(Object.assign({ op: 'anotar', session: 'socio', texto: 'Nota del socio' }, SOC));
  ok(escSocio.ok === false && h.filas.length === 3, 'un socio con su sesión tampoco puede escribir');
  const exigir = caja({ exigir: true });
  ok(exigir.api(Object.assign({ op: 'anotar', texto: 'Viaja a Japón en diciembre' }, SOC, ROBOT)).ok, 'con SESION_EXIGIR encendido, el robot pasa');
  const juan = c.api({ op: 'listar', session: 'juan' });
  ok(juan.ok && juan.items.length === 2 && juan.items.every(x => !('borrado' in x) && !('fila' in x)), 'el administrador principal (su sesión) lista todo');
}

/* ── 3 ── lo personal permitido sí, lo prohibido no, sin repetir */
{ const c = caja();
  const prohibidos = ['Lo operaron de la rodilla', 'Su esposa está embarazada', 'Va a misa los domingos', 'Votó por el candidato del partido político', 'Su cuenta del Banco Industrial', 'Su número es 5555 0101'];
  const rs = prohibidos.map(t => c.api(Object.assign({ op: 'anotar', tipo: 'detalle', texto: t }, SOC, ROBOT)));
  ok(rs.every(r => r.ok === false && r.prohibido) && !c.privada(), 'salud, religión, política y datos bancarios (también un número largo) no se anotan: ' + rs.map(r => r.prohibido).join(', '));
  const permitidos = ['El partido de fútbol de su hijo el sábado', 'Su viaje a Japón en diciembre', 'Cristian, su hijo, se gradúa'];
  ok(permitidos.every(t => c.api(Object.assign({ op: 'anotar', tipo: 'detalle', texto: t }, SOC, ROBOT)).ok), 'lo personal permitido sí (un partido de fútbol, un viaje, una graduación)');
  const n = c.privada().filas.length;
  const dup = c.api(Object.assign({ op: 'anotar', tipo: 'detalle', texto: 'su viaje a Japón en diciembre', fecha_evento: '2026-12-10' }, SOC, ROBOT));
  ok(dup.ok && dup.duplicado && c.privada().filas.length === n, 'lo que ya está (escrito distinto) no se repite');
  const fila = c.privada().filas.find(f => f[0] === dup.id);
  ok(fila && fila[7] === '2026-12-10', '…y si trae la fecha que faltaba, la pone');
  const malaFecha = c.api(Object.assign({ op: 'anotar', texto: 'Cumpleaños de su esposa', fecha_evento: '8/11/2026' }, SOC, ROBOT));
  ok(malaFecha.ok === false && /AAAA-MM-DD/.test(malaFecha.error), 'una fecha que no es AAAA-MM-DD se rechaza');
  const formula = c.api(Object.assign({ op: 'anotar', texto: '=IMPORTXML("x")', session: 'juan' }, SOC));
  ok(formula.ok && c.privada().filas.find(f => f[0] === formula.id)[6].charAt(0) === "'", 'un texto que empieza con = se guarda como texto, nunca como fórmula');
  const juanSalud = c.api(Object.assign({ op: 'anotar', texto: 'Le operaron la rodilla en octubre', session: 'juan' }, SOC));
  ok(juanSalud.ok, 'lo que escribe Juan es decisión suya (la lista solo frena lo que anota Alma)');
}

/* ── 4 ── ver solo lo suyo, retomado, corregir y borrar */
{ const c = caja();
  const a = c.api(Object.assign({ op: 'anotar', tipo: 'detalle', texto: 'La boda de su hija', fecha_evento: '2026-11-08' }, SOC, ROBOT));
  c.api({ op: 'anotar', correo: 'otro@prueba.test', tel: '50255550299', texto: 'Le gusta el golf', robot: LLAVE });
  const porCorreo = c.api({ op: 'ver', correo: 'SOCIO.A@prueba.test', robot: LLAVE }), porTel = c.api({ op: 'ver', tel: '+502 5555 0201', robot: LLAVE });
  ok(porCorreo.items.length === 1 && porTel.items.length === 1 && porCorreo.items[0].texto === 'La boda de su hija', '«ver» trae solo las de ese socio, por su correo o por su número');
  ok(c.api({ op: 'ver', robot: LLAVE }).items.length === 0, '«ver» sin correo ni número no trae nada');
  ok(c.api({ op: 'retomado', id: a.id, robot: LLAVE }).ok && /^\d{4}-/.test(c.api({ op: 'ver', correo: SOC.correo, robot: LLAVE }).items[0].retomado), '«retomado» queda con su fecha');
  const corr = c.api({ op: 'corregir', id: a.id, texto: 'La boda de su hija mayor', fecha_evento: '2026-11-07', session: 'juan' });
  ok(corr.ok && corr.item.texto === 'La boda de su hija mayor' && corr.item.fecha_evento === '2026-11-07' && /juan@prueba/.test(corr.item.editado), 'Juan corrige el texto y la fecha (queda quién y cuándo)');
  ok(c.api({ op: 'corregir', id: a.id, texto: 'Ahora va a misa', robot: LLAVE }).prohibido === 'religión', 'Alma tampoco puede corregir hacia algo prohibido');
  const b = c.api({ op: 'borrar', id: a.id, session: 'juan' });
  const fila = c.privada().filas.find(f => f[0] === a.id);
  ok(b.ok && fila[6] === '' && fila[7] === '' && /juan@prueba/.test(fila[13]), 'Juan borra: la fila queda sin texto ni fecha, con quién y cuándo');
  ok(c.api({ op: 'ver', correo: SOC.correo, robot: LLAVE }).items.length === 0 && c.api({ op: 'listar', session: 'juan' }).items.length === 1, 'lo borrado ya no sale en «ver» ni en «listar»');
  ok(c.api({ op: 'borrar', id: a.id, session: 'juan' }).ok === false, 'borrar dos veces da «no encontré»');
}

process.exit(fallo);
