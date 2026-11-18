/* Prueba con dobles: entrar nunca depende del cupo (Juan, 18-nov-2026: «El cupo nunca nos debería evitar que hagamos
   login»). Carga apps-script/sesion.js (común a Docs, Epi, Grow y Mi) con Google sin cupo de UrlFetch y revisa:
   1. Sesión firmada válida → entra aunque el login no conteste; la siguiente ya no gasta una llamada que va a fallar.
   2. Firma de otra llave, alterada, vencida, texto sin firma o sin LOGIN_SECRETO → no entra (no se abre nada).
   3. Con internet, la sesión se sigue comprobando con el login (suspensiones) y el «no» del login manda.
   4. «__loginSecreto»: solo con la llave del robot, nunca devuelve el valor y rechaza una llave corta.
   Falla si alguien vuelve a poner una llamada a internet en el camino de entrar sin respaldo local.
   node .github/entrar-sin-cupo.js [carpeta apps-script] */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const DIR = process.argv[2] || path.join(__dirname, '..', 'apps-script');
let fallo = 0; const ok = (c, m) => { if (c) console.log('✓ ' + m); else { console.log('::error::' + m); fallo = 1; } };
const GOOGLE = 'Exception: Service invoked too many times for one day: urlfetch.';
const firmados = b => Array.from(Buffer.from(b)).map(x => (x > 127 ? x - 256 : x));
const buf = b => Buffer.from((Array.isArray(b) ? b : Array.from(b)).map(x => x & 255));
const UT = {
  DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  base64EncodeWebSafe: b => buf(typeof b === 'string' ? firmados(Buffer.from(b)) : b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  base64DecodeWebSafe: s => firmados(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  computeDigest: (alg, d) => firmados(crypto.createHash('sha256').update(typeof d === 'string' ? Buffer.from(d, 'utf8') : buf(d)).digest()),
  computeHmacSha256Signature: (d, k) => firmados(crypto.createHmac('sha256', k).update(d).digest()),
  newBlob: b => ({ getDataAsString: () => (typeof b === 'string' ? b : buf(b).toString('utf8')) })
};
const b64u = x => Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const SECRETO = 'x'.repeat(48), props = {}, cache = {};
let red = 'sin_cupo', llamadas = 0, respuestaLogin = null;
const ctx = {
  console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, String, Number, Object, Array, RegExp, Error, Utilities: UT,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
  CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
  LockService: { getUserLock: () => ({ hasLock: () => false, tryLock: () => true, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ texto: t, setMimeType() { return this; } }) },
  uf_: () => { llamadas++; if (red === 'sin_cupo') throw new Error(GOOGLE); return { getContentText: () => JSON.stringify(respuestaLogin) }; }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(DIR, 'sesion.js'), 'utf8'), ctx, { filename: 'sesion.js' });
const firmar = (d, sec) => { const c = b64u(JSON.stringify(d)); return c + '.' + b64u(crypto.createHmac('sha256', sec).update(c).digest()); };
const limpiar = () => { for (const k in cache) delete cache[k]; llamadas = 0; };
const prof = { email: 'juan@prueba.test', nombre: 'Juan', apps: { mi: 'admin_principal' } };
const sesion = (o, sec) => firmar(Object.assign({ e: prof.email, n: 'Juan', apps: prof.apps, p: prof, iat: Date.now(), exp: Date.now() + 864e5 }, o || {}), sec || SECRETO);

props.LOGIN_SECRETO = SECRETO;
const r1 = ctx.sesionDe_({ session: sesion() });
ok(r1 && r1.email === prof.email, 'sin cupo: sesión firmada válida entra aunque el login no conteste');
llamadas = 0;
const r2 = ctx.sesionDe_({ session: sesion({ iat: Date.now() - 5 }) });
ok(r2 && r2.email === prof.email && llamadas === 0, 'sin cupo: la siguiente sesión se revisa aquí, sin gastar otra llamada');
limpiar();
ok(ctx.sesionDe_({ session: sesion({}, 'otra-llave-'.repeat(5)) }) === null, 'sin cupo: firma con otra llave, no entra');
ok(ctx.sesionDe_({ session: sesion().slice(0, -3) + 'AAA' }) === null, 'sin cupo: firma alterada, no entra');
ok(ctx.sesionDe_({ session: sesion({ exp: Date.now() - 1000 }) }) === null, 'sin cupo: sesión vencida, no entra');
ok(ctx.sesionDe_({ session: 'sin-firma' }) === null && ctx.sesionDe_({}) === null, 'sin cupo: texto sin firma o sin sesión, no entra');
delete props.LOGIN_SECRETO; limpiar();
ok(ctx.sesionDe_({ session: sesion() }) === null, 'sin cupo y sin LOGIN_SECRETO: no entra (no se abre nada)');

/* Con internet: manda el login (puede decir «suspendido»). */
props.LOGIN_SECRETO = SECRETO; limpiar(); red = 'bien';
respuestaLogin = { ok: true, profile: Object.assign({}, prof, { nombre: 'Juan del login' }) };
const r3 = ctx.sesionDe_({ session: sesion() });
ok(r3 && r3.nombre === 'Juan del login' && llamadas === 1, 'con internet: la sesión se comprueba con el login');
limpiar(); respuestaLogin = { ok: false, error: 'suspended' };
ok(ctx.sesionDe_({ session: sesion() }) === null, 'con internet: si el login dice que no (suspendido), no entra');

/* «__loginSecreto» */
const ROBOT = 'robot-de-prueba-' + crypto.randomUUID();
ctx.SES_ROBOT_HASH_ = crypto.createHash('sha256').update(ROBOT).digest('hex');
const pedir = b => { const r = ctx.loginSecretoDiag_(Object.assign({ action: '__loginSecreto' }, b)); return { texto: r.texto, j: JSON.parse(r.texto) }; };
delete props.LOGIN_SECRETO;
ok(pedir({ token: 'otra', secreto: 'z'.repeat(40) }).j.error === 'token' && !props.LOGIN_SECRETO, '__loginSecreto: sin la llave del robot, no guarda nada');
ok(pedir({ token: ROBOT, secreto: 'corta' }).j.error === 'secreto' && !props.LOGIN_SECRETO, '__loginSecreto: una llave corta no se guarda');
const g = pedir({ token: ROBOT, secreto: 'z'.repeat(40) });
ok(g.j.ok && g.j.tiene && props.LOGIN_SECRETO === 'z'.repeat(40) && g.texto.indexOf('zzzz') < 0, '__loginSecreto: con el robot la guarda y nunca devuelve el valor');
ok(pedir({ token: ROBOT }).j.tiene === true, '__loginSecreto: sin «secreto» solo dice si ya está');
ok(ctx.loginSecretoDiag_({ action: 'otra' }) === null, '__loginSecreto: otras acciones siguen su camino');
process.exit(fallo);
