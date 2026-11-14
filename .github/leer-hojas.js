/* Prueba con dobles de «leerHojas» (apps-script/leerhojas.js, pasando por doPost) y de la app que la usa (sheets.js),
   sin Google ni red. La hoja de Mi deja de ser pública (14-nov-2026): la app la lee con la sesión y cada quien ve lo suyo.
   1. Sin sesión: «session» y ningún dato. Con sesión pero sin Mi: «unauthorized». Una pestaña que no es de Mi: no.
   2. El administrador principal y el contador reciben la hoja entera; el robot también.
   3. El socio recibe solo lo de sus propiedades (también los gastos con el nombre escrito distinto) y ningún correo de
      otro socio; Gastos operativos y Contabilidad le llegan vacías. Su ayudante (correo secundario) ve lo mismo.
   4. Lo que el socio ve en la app es IGUAL que antes, cuando bajaba la hoja entera: mismos meses, mismo tipo de cambio,
      mismos números, reservas y gastos de su propiedad (sheets.js armado con la hoja entera vs. con lo filtrado).
   5. Caché: la segunda lectura no vuelve a Google; una escritura desde la app la renueva; «fresco» la salta.
      Si gviz falla, se lee con getDisplayValues.
   node .github/leer-hojas.js [carpeta apps-script] */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const DIR = process.argv[2] || path.join(__dirname, '..', 'apps-script');
const RAIZ = path.join(DIR, '..');
let fallo = 0; const ok = (c, m) => { if (c) console.log('✓ ' + m); else { console.log('::error::' + m); fallo = 1; } };

const A = 'socio.a@prueba.test', A2 = 'ayudante.a@prueba.test', B = 'socio.b@prueba.test';
const HOJA = () => ({
  SETUP: [
    ['property_id', 'property_name', 'Usuario ID', 'User email', 'secondary user email', 'Password', 'SPACIOAMFEE', 'RETENCION', 'Listing link'],
    ['pa1', 'Z4 - Rue - 301', 'Socio_001', A, A2, '', '20%', 'si', 'https://anuncio.prueba/301'],
    ['pa2', 'Z4 - Rue - 301', 'Socio_001', A, '', '', '20%', '', 'https://anuncio.prueba/301b'],
    ['pb1', 'Z10 - Ignacio - 506', 'Socio_002', B, '', 'clave-vieja', '18%', '', 'https://anuncio.prueba/506'],
    ['pb2', 'Z13 - Narama - 633', 'Socio_002', B, 'otro.b@prueba.test', '', '18%', 'si', '']],
  Resumenconsolidado: [
    ['Usuario ID', 'Property_name', 'Mes', 'Ingreso Bruto', 'Ingreso Neto', 'Fee Spacio', 'Noches', 'Ocupación', 'Precio Prom', 'Ingreso Neto 2'],
    ['Socio_002', 'Z10 - Ignacio - 506', 'julio de 2025', '900', '700', '150', '20', '65%', '45', '0'],
    ['Socio_001', 'Z4 - Rue - 301', 'septiembre de 2025', '1200', '1000', '200', '26', '83.87%', '46', '950'],
    ['Socio_002', 'Z13 - Narama - 633', 'octubre de 2025', '1500', '1300', '250', '28', '90%', '53', '0'],
    ['Socio_001', 'Z4 - Rue - 301', 'octubre de 2025', '1400', '1150', '230', '27', '87%', '52', '1100']],
  DATABASE: [
    ['property_id', 'Mes_año', 'guest_first_name', 'guest_last_name', 'nights', 'ingreso_bruto', 'Fechas resum'],
    ['pa1', 'Sep 2025', 'Huesped', 'Uno', '3', '150', '3 Sep'], ['pb1', 'Jul 2025', 'Huesped', 'Dos', '2', '90', '5 Jul'],
    ['pa2', 'Oct 2025', 'Huesped', 'Tres', '4', '210', '10 Oct']],
  'insumos & gastos': [
    ['Mes', 'Fecha de pedido', 'property_name', 'valor', 'categoria', 'Comentario', 'tag'],
    ['10', '2025-10-05', 'Z4-Rue-301', '150', 'insumos & gastos', 'Papel', ''],
    ['10', '2025-10-06', 'Z10 - Ignacio - 506', '99', 'insumos & gastos', 'Jabón', ''],
    ['9', '2025-09-02', 'Zona 4 - Rue - 301', '80', 'Reparaciones o inversión', 'Llave', '']],
  TC: [['Property_name', 'Mes', 'Valor'], ['Z4 - Rue - 301', 'octubre de 2025', '7.70'], ['Z10 - Ignacio - 506', 'octubre de 2025', '7.80'],
    ['Z13 - Narama - 633', 'septiembre de 2025', '7.60']],
  'Archivos cargados': [['tipo', 'scope', 'owner', 'property_name', 'mes', 'archivo', 'url', 'account'],
    ['factura', 'property', '', 'Z4 - Rue - 301', '2025-10', 'f1.pdf', 'https://drive.prueba/1', ''],
    ['deposito', 'owner', 'Socio_002', '', '2025-10', 'd2.pdf', 'https://drive.prueba/2', ''],
    ['deposito', 'owner', 'Socio_001', '', '2025-10', 'd1.pdf', 'https://drive.prueba/3', ''],
    ['estado-cuenta', 'property', '', '', '2025-10', 'e.pdf', 'https://drive.prueba/4', 'op-gtq']],
  'Gastos operativos': [['id', 'kind', 'mes', 'concepto', 'monto'], ['g1', 'opex', '2025-10', 'Oficina', '500']],
  'Depositos cargados': [['Fecha', 'monto', 'property_name'], ['2025-10-15', '950', 'Z4 - Rue - 301'], ['2025-10-15', '1300', 'Z13 - Narama - 633']],
  Contabilidad: [['ym', 'account', 'desc', 'debe'], ['2025-10', 'op-gtq', 'Pago', '100']],
  Facturas: [['id', 'tipo', 'property_name', 'total'], ['F1', 'recibida', 'Z4 - Rue - 301', '10'], ['F2', 'recibida', 'Z10 - Ignacio - 506', '20']],
  Contratos: [['id', 'property_name', 'url'], ['C1', 'Z13 - Narama - 633', 'https://drive.prueba/c']],
  Bitacora: [['quien', 'que'], ['x', 'y']]
});
const csv = filas => filas.map(f => f.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
function parseCsv(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function caja(o) {
  o = o || {};
  const datos = HOJA(), cache = {}, props = {}, llamadas = { gviz: 0, display: 0 };
  const hoja = n => ({ getName: () => n, getDataRange: () => ({ getDisplayValues: () => { llamadas.display++; return datos[n].map(r => r.slice()); }, getValues: () => datos[n].map(r => r.slice()) }),
    getLastRow: () => datos[n].length, getLastColumn: () => datos[n][0].length, getRange: () => ({ getValues: () => [datos[n][0]] }) });
  const ss = { getName: () => 'hoja-de-mi', getSheets: () => Object.keys(datos).map(hoja), getSheetByName: n => datos[n] ? hoja(n) : null };
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, String, Number, Object, Array, RegExp, Error, Buffer, isNaN, parseFloat,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; },
      getAll: ks => { const m = {}; ks.forEach(k => { if (k in cache) m[k] = cache[k]; }); return m; }, putAll: m => { Object.assign(cache, m); } }) },
    LockService: { getUserLock: () => ({ hasLock: () => false, tryLock: () => true, waitLock() {}, releaseLock() {} }),
                   getScriptLock: () => ({ hasLock: () => false, tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: s => ({ getContent: () => s, setMimeType() { return this; } }), MimeType: { JSON: 'json', JAVASCRIPT: 'js' } },
    Utilities: { DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, sleep() {}, parseCsv,
      computeDigest: (alg, t) => Array.from(crypto.createHash(alg).update(String(t)).digest()).map(b => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64url'), formatDate: d => new Date(d).toISOString().slice(0, 13) },
    ScriptApp: { getOAuthToken: () => 'token-del-dueno' },
    SpreadsheetApp: { openById: id => { if (id !== '1l9wLH8880NlN9ac2jvne2U6cqej6gycqAD77Z25cLF4') throw new Error('otra hoja'); return ss; } },
    GmailApp: { getAliases: () => [], sendEmail() {} }, Logger: { log() {} },
    UrlFetchApp: {
      fetch() { throw new Error('la prueba no sale a internet'); },
      fetchAll: pedidos => pedidos.map(p => {
        llamadas.gviz++;
        const m = /\/spreadsheets\/d\/([^/]+)\/gviz\/tq\?tqx=out:csv&sheet=([^&]+)/.exec(p.url);
        const conDueno = p.headers && p.headers.Authorization === 'Bearer token-del-dueno';
        if (o.gvizCae || !m || !conDueno) return { getResponseCode: () => 403, getContentText: () => '<html>sin permiso</html>' };
        return { getResponseCode: () => 200, getContentText: () => csv(datos[decodeURIComponent(m[2])]) };
      }) }
  };
  vm.createContext(ctx);
  ['Escrituradesdeapp.js', 'PLANTILLA-CORREOS.js', 'sesion.js', 'cupo.js', 'enlaces.js', 'fichasocio.js', 'leerhojas.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f }));
  vm.runInContext("SES_ROBOT_HASH_ = '" + crypto.createHash('sha256').update('llave-robot').digest('hex') + "';", ctx);
  const SES = {
    juan: { email: 'admin@prueba.test', apps: { mi: 'admin_principal' } }, conta: { email: 'conta@prueba.test', apps: { mi: 'contador' } },
    a: { email: A, user_id: 'U-AAAA', apps: { mi: 'socio' } }, ayu: { email: A2, user_id: 'U-BBBB', apps: { mi: 'socio' } },
    hub: { email: 'equipo@prueba.test', apps: { hola: 'admin_secundario' } }
  };
  ctx.sesionDe_ = b => (b && SES[b.session]) || null;
  const api = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ action: 'leerHojas' }, body)) } }).getContent());
  return { ctx, datos, llamadas, props, api };
}
const filasDe = (r, t) => (r.tabs[t] || []).slice(1);

/* ── 1 ── quién entra */
{ const c = caja();
  const sin = c.api({}), hub = c.api({ session: 'hub' }), mala = c.api({ session: 'juan', tabs: ['Bitacora'] });
  ok(sin.ok === false && sin.error === 'session' && !sin.tabs, 'sin sesión: «session» y ningún dato');
  ok(hub.ok === false && hub.error === 'unauthorized' && !hub.tabs, 'con sesión pero sin acceso a Mi: «unauthorized» y ningún dato');
  ok(mala.ok === false && /no permitida/.test(mala.error) && !mala.tabs, 'una pestaña que no usa la app (Bitacora): no se entrega');
}

/* ── 2 ── el administrador, el contador y el robot: todo */
{ const c = caja(), d = HOJA();
  const juan = c.api({ session: 'juan' }), conta = c.api({ session: 'conta' }), robot = c.api({ robot: 'llave-robot', tabs: ['SETUP'] });
  ok(juan.ok && !juan.filtrado && filasDe(juan, 'DATABASE').length === 3 && filasDe(juan, 'Resumenconsolidado').length === 4 && filasDe(juan, 'Contabilidad').length === 1,
    'el administrador principal recibe la hoja entera (12 pestañas)');
  ok(juan.tabs.SETUP[0].indexOf('Password') < 0 && JSON.stringify(juan).indexOf('clave-vieja') < 0, 'SETUP sale sin la columna de contraseñas');
  ok(JSON.stringify(juan.tabs['insumos & gastos']) === JSON.stringify(d['insumos & gastos']), 'cada pestaña sale igual que en la hoja');
  ok(conta.ok && filasDe(conta, 'Gastos operativos').length === 1 && filasDe(conta, 'SETUP').length === 4, 'el contador también recibe todo');
  ok(robot.ok && filasDe(robot, 'SETUP').length === 4 && Object.keys(robot.tabs).length === 1, 'el robot (Hub) con su llave: lo que pide');
}

/* ── 3 ── el socio: solo lo suyo */
{ const c = caja(), a = c.api({ session: 'a' }), txt = JSON.stringify(a);
  ok(a.ok && a.filtrado && filasDe(a, 'SETUP').length === 2 && filasDe(a, 'SETUP').every(r => r[2] === 'Socio_001'), 'el socio recibe sus 2 filas de SETUP (Rue 301)');
  ok(txt.indexOf(B) < 0 && txt.indexOf('otro.b@') < 0 && txt.indexOf('Ignacio') < 0 && txt.indexOf('Narama') < 0, 'ni el correo ni las propiedades del otro socio aparecen en la respuesta');
  ok(filasDe(a, 'Resumenconsolidado').length === 2 && filasDe(a, 'DATABASE').map(r => r[0]).join() === 'pa1,pa2', 'su Resumen (2 meses) y sus reservas (los dos anuncios)');
  ok(filasDe(a, 'insumos & gastos').length === 2, 'sus gastos, también los escritos distinto («Z4-Rue-301», «Zona 4 - Rue - 301»)');
  ok(filasDe(a, 'Gastos operativos').length === 0 && filasDe(a, 'Contabilidad').length === 0 && a.tabs.Contabilidad.length === 1, 'Gastos operativos y Contabilidad: solo el encabezado');
  ok(filasDe(a, 'Archivos cargados').map(r => r[5]).join() === 'f1.pdf,d1.pdf', 'sus archivos (de la propiedad y de socio), sin los del otro ni los estados de cuenta');
  ok(filasDe(a, 'Depositos cargados').length === 1 && filasDe(a, 'Facturas').map(r => r[0]).join() === 'F1' && filasDe(a, 'Contratos').length === 0, 'sus depósitos, facturas y contratos');
  ok(a.extra.meses.length === 3 && a.extra.meses.indexOf('julio de 2025') >= 0, 'los meses del reporte llegan aparte (también julio, que es de otro socio)');
  ok(Math.abs(a.extra.tcMes['2025-9'] - 7.75) < 1e-9 && Math.abs(a.extra.tcMes['2025-8'] - 7.6) < 1e-9, 'el tipo de cambio promedio de cada mes (sin nombres de otras propiedades)');
  const ayu = c.api({ session: 'ayu' });
  ok(ayu.ok && JSON.stringify(ayu.tabs) === JSON.stringify(a.tabs), 'su ayudante (correo secundario) ve exactamente lo mismo');
}

/* ── 4 ── en la app, el socio ve lo mismo que antes */
function app(respuesta) {
  const almacen = {}, w = {
    console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, String, Number, Object, Array, RegExp, Error, isNaN, parseFloat, parseInt, Promise, Set, setTimeout,
    localStorage: { getItem: k => almacen[k] ?? null, setItem: (k, v) => { almacen[k] = String(v); }, removeItem: k => { delete almacen[k]; }, length: 0, key: () => null },
    document: { cookie: '' }, location: { protocol: 'https:', hostname: 'mi.spacioam.com' }, indexedDB: null, fetch: () => Promise.reject(new Error('sin red'))
  };
  w.window = w; vm.createContext(w);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'sheets.js'), 'utf8'), w, { filename: 'sheets.js' });
  w.SpacioWrite.post = async (action, payload) => respuesta(action, payload);
  return w;
}
(async () => {
  const c = caja();
  const todo = app((ac, p) => c.api(Object.assign({ session: 'juan' }, p)));
  const suyo = app((ac, p) => c.api(Object.assign({ session: 'a' }, p)));
  const D1 = await todo.SpacioLoad(), D2 = await suyo.SpacioLoad();
  const antes = D1.fromProfile({ email: A, apps: { mi: 'socio' } }), ahora = D2.fromProfile({ email: A, apps: { mi: 'socio' } });
  ok(antes.code === 'Socio_001' && ahora.code === 'Socio_001' && JSON.stringify(antes.props) === JSON.stringify(ahora.props), 'la app encuentra la misma cuenta y las mismas propiedades: ' + ahora.props.join());
  const pa = D1.ownerProps(antes)[0], pb = D2.ownerProps(ahora)[0], limpio = p => JSON.stringify(p, (k, v) => (k === 'raw' ? undefined : v));
  ok(limpio(pa) === limpio(pb), 'Rue 301 sale idéntica (meses, ocupación, depósito, reservas, gastos y tipo de cambio)');
  ok(JSON.stringify(D1.monthKeys) === JSON.stringify(D2.monthKeys), 'el mismo eje de meses (' + D2.monthKeys.length + ')');
  ok(D2.owners.length === 1 && D2.propertyList.length === 1, 'y en su navegador ya no hay otras cuentas ni otras propiedades');
  const ayu = D2.fromProfile({ email: A2, apps: { mi: 'socio' } });
  ok(ayu.code === 'Socio_001', 'el ayudante entra a la cuenta del socio');
  const texto = await suyo.SpacioHoja.texto('insumos & gastos', { fresco: true });
  ok(/Z4-Rue-301/.test(texto) && !/Ignacio/.test(texto), 'SpacioHoja.texto (Pedidos Ya, Facturas) da el CSV filtrado');

  /* ── 5 ── caché */
  const k = caja();
  k.api({ session: 'juan' }); const g1 = k.llamadas.gviz;
  k.api({ session: 'juan' });
  ok(g1 === 10 && k.llamadas.gviz === g1, 'la segunda lectura sale de la caché (10 pestañas por gviz la primera vez —SETUP va directo y «Long term» no existe—, 0 la segunda)');
  k.api({ session: 'a' });
  ok(k.llamadas.gviz === g1, 'la lectura del socio también sale de la caché (se filtra después)');
  k.ctx.sa_hojasDirty_(); k.props.SA_HOJAS_STAMP += 'b';   // lo que hace doPost tras escribir (y que no choque con el mismo milisegundo)
  k.datos['insumos & gastos'].push(['11', '2025-11-01', 'Z4 - Rue - 301', '10', 'insumos & gastos', 'Nuevo', '']);
  const tras = k.api({ session: 'juan', tabs: ['insumos & gastos'] });
  ok(k.llamadas.gviz === g1 + 1 && filasDe(tras, 'insumos & gastos').length === 4, 'una escritura desde la app renueva la caché (se ve el gasto nuevo)');
  k.api({ session: 'juan', tabs: ['TC'], fresco: true });
  ok(k.llamadas.gviz === g1 + 2, '«fresco» lee de nuevo sin esperar la caché');
  const w = caja({ gvizCae: true }), r = w.api({ session: 'juan', tabs: ['DATABASE', 'TC'] });
  ok(r.ok && filasDe(r, 'DATABASE').length === 3 && w.llamadas.display >= 2, 'si gviz falla, se lee con getDisplayValues');
  const src = fs.readFileSync(path.join(DIR, 'Escrituradesdeapp.js'), 'utf8');
  ok(/if \(!readonly\) sa_hojasDirty_\(\);/.test(src), 'doPost renueva la caché con cualquier escritura (sa_hojasDirty_)');
  process.exit(fallo);
})().catch(e => { console.log('::error::' + (e && e.stack || e)); process.exit(1); });
