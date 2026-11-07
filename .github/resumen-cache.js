/* Prueba con dobles: la caché de «Generar resumen» (sa_resCalc_ en Escrituradesdeapp.js) se renueva cuando
   cambian SETUP, TC o «insumos & gastos» aunque se editen a mano en la hoja.
   7-nov-2026: el segundo anuncio de Z14 - P14 - 703 se agregó a SETUP y el resumen seguía con 21 noches.
   node .github/resumen-cache.js [carpeta apps-script] */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const DIR = process.argv[2] || path.join(__dirname, '..', 'apps-script');
let fallo = 0; const ok = (c, m) => { if (c) console.log('✓ ' + m); else { console.log('::error::' + m); fallo = 1; } };

const hojas = {
  SETUP: [['property_id', 'property_name'], ['4433aaeb', 'Z14 - P14 - 703']],
  TC: [['Propiedad', 'Mes', 'Valor'], ['Z14-P14-703', 'octubre de 2026', 7.7]],
  'insumos & gastos': [['Mes', 'Fecha', 'property_name', 'valor', 'categoria', 'Comentario'], [10, '2026-10-05', 'Z14 - P14 - 703', 100.05, 'insumos & gastos', '']],
  Database: [['h'], ['r1'], ['r2']]
};
const hoja = n => hojas[n] && {
  getLastRow: () => hojas[n].length,
  getDataRange: () => ({ getValues: () => hojas[n].map(r => r.slice()) }),
  getRange: (r, c, nr, nc) => ({ getValues: () => hojas[n].slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)) })
};
const ss = { getSheetByName: hoja };
let calculos = 0;
const cache = {}, props = {};
const ctx = {
  console, JSON, Date, Math, String, Number, Object, Array, RegExp, Error, isNaN,
  SpreadsheetApp: { openById: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  Utilities: { DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (a, t) => Array.from(crypto.createHash(a).update(t).digest()).map(b => b > 127 ? b - 256 : b) },
  calcularResumenMensual: ym => { calculos++; const n = hojas.SETUP.length - 1; return { mesBusqueda: 'octubre de 2026', encabezados: ['Noches'], resultados: [[n === 1 ? 21 : 24]] }; }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(DIR, 'Escrituradesdeapp.js'), 'utf8'), ctx, { filename: 'Escrituradesdeapp.js' });

const r1 = ctx.sa_resCalc_({ ym: '2026-10' }, ss);
ok(r1.resultados[0][0] === 21 && calculos === 1 && !r1.cached, 'primer cálculo: 21 noches (un solo anuncio en SETUP)');
const r2 = ctx.sa_resCalc_({ ym: '2026-10' }, ss);
ok(r2.cached && calculos === 1, 'sin cambios: usa la caché');
hojas.SETUP.push(['56c20570', 'Z14 - P14 - 703']);   // se agrega el segundo anuncio a mano en la hoja
const r3 = ctx.sa_resCalc_({ ym: '2026-10' }, ss);
ok(!r3.cached && calculos === 2 && r3.resultados[0][0] === 24, 'después de agregar el anuncio en SETUP: recalcula (24 noches)');
hojas['insumos & gastos'][1][3] = 120;
const r4 = ctx.sa_resCalc_({ ym: '2026-10' }, ss);
ok(!r4.cached && calculos === 3, 'un gasto editado a mano también renueva el cálculo');
hojas.TC[1][2] = 7.8;
ok(!ctx.sa_resCalc_({ ym: '2026-10' }, ss).cached && calculos === 4, 'un cambio en TC también');
ok(ctx.sa_resCalc_({ ym: '2026-10' }, ss).cached && calculos === 4, 'y otra vez sin cambios: caché');
ok(/^[0-9a-f]{12}$/.test(ctx.sa_resHuella_(ss)), 'la huella es corta: ' + ctx.sa_resHuella_(ss));
process.exit(fallo);
