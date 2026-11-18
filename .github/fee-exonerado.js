/* Prueba con dobles: fee de Spacio AM exonerado un mes (apps-script/feeexonerado.js + calcularResumenMensual en Código.js).
   Juan, 18-nov-2026 (Hub #825): «solo se debe aplicar un mes, en el mes que coloquemos y nunca más; y debe haber un log».
   node .github/fee-exonerado.js [carpeta apps-script] */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = process.argv[2] || path.join(__dirname, '..', 'apps-script');
let fallo = 0; const ok = (c, m) => { if (c) console.log('✓ ' + m); else { console.log('::error::' + m); fallo = 1; } };

const P = 'Z9 - Prueba - 1012';
const hojas = {
  Database: [['status', 'checkin_date', 'property_id', 'ingreso_bruto', 'pass_through_taxes', 'fee_plataforma_socio', 'cleaning_fee', 'nights', 'lead_time', 'base_amount', 'usuario_id'],
    ['accepted', '2026-10-05T12:00:00', 'abc', 1000, 0, 0, 0, 5, 3, 1000, 'Socio_001'],
    ['accepted', '2026-11-05T12:00:00', 'abc', 1000, 0, 0, 0, 5, 3, 1000, 'Socio_001']],
  Resumen: [['']],
  SETUP: [['property_id', 'property_name', 'spacioamfee', 'iva', 'impuesto', 'retencion', 'cleaning_socio'], ['abc', P, '20%', 'NO', '', 'NO', 'NO']],
  'insumos & gastos': [['Mes', 'Fecha de pedido', 'property_name', 'valor', 'categoria', 'Comentario']],
  TC: [['Propiedad', 'Mes', 'Valor'], [P, 'octubre de 2026', 1]]
};
function hoja(n) {
  if (!hojas[n]) return null;
  const h = hojas[n];
  return {
    getName: () => n,
    getLastRow: () => h.length,
    getLastColumn: () => Math.max(...h.map(r => r.length)),
    getDataRange: () => ({ getValues: () => h.map(r => r.slice()) }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => h.slice(r - 1, r - 1 + (nr || 1)).map(x => { const o = x.slice(c - 1, c - 1 + (nc || 1)); while (o.length < (nc || 1)) o.push(''); return o; }),
      setValues: (v) => { v.forEach((row, i) => { h[r - 1 + i] = h[r - 1 + i] || []; row.forEach((x, j) => { h[r - 1 + i][c - 1 + j] = x; }); }); },
      setValue: (x) => { h[r - 1] = h[r - 1] || []; h[r - 1][c - 1] = x; },
      setNumberFormat: function () { return this; }
    }),
    appendRow: (row) => { h.push(row.slice()); },
    setFrozenRows: () => {}
  };
}
const ss = { getSheetByName: hoja, insertSheet: (n) => { hojas[n] = []; return hoja(n); } };
const props = {};
let appendCalls = [];
const ctx = {
  console, JSON, Date, Math, String, Number, Object, Array, RegExp, Error, isNaN, parseInt, parseFloat, Set,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, flush: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  miLibro_: () => ss,
  sa_resDirty_: () => {},
  sa_mesCerrado_: (ym) => ym < '2026-10',
  sa_unlockOk_: (u) => !!(u && u.hold),
  sa_resMes_: (v) => String(v == null ? '' : v).toLowerCase().trim(),
  sa_consolidadoSheet_: (s) => s.getSheetByName('Resumenconsolidado'),
};
vm.createContext(ctx);
for (const f of ['Código.js', 'feeexonerado.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
// el acumulado de prueba: se rehace con el cálculo real (como sa_resumenAppendCore_)
ctx.sa_resumenAppendCore_ = (s, body) => {
  appendCalls.push(body);
  const r = ctx.calcularResumenMensual(body.ym), H = r.encabezados;
  hojas.Resumenconsolidado = [H.slice()].concat(r.resultados.map(x => x.slice()));
  return { ok: true, updated: 1 };
};
const feeDe = (ym) => { const r = ctx.calcularResumenMensual(ym); return r.resultados[0][r.encabezados.indexOf('Fee Spacio')]; };
const netoDe = (ym) => { const r = ctx.calcularResumenMensual(ym); return r.resultados[0][r.encabezados.indexOf('Ingreso Neto')]; };

ok(feeDe('2026-10') === 200 && netoDe('2026-10') === 800, 'sin exoneración: fee 200 y neto 800 en octubre');
ctx.sa_resumenAppendCore_(ss, { ym: '2026-10' }); appendCalls = [];

let r = ctx.sa_resumenFee(ss, { ym: '2026-10', property: P }, null);
ok(!r.ok && /motivo/.test(r.error) && !hojas['Fee exonerado'], 'sin motivo no exonera ni anota nada');

r = ctx.sa_resumenFee(ss, { ym: '2026-10', property: P, motivo: 'Cortesía por problema operativo' }, { nombre: 'Juan' });
ok(r.ok && r.activo && r.acumulado === 'actualizado', 'exonera octubre y actualiza el acumulado');
ok(r.depositoAntes === 800 && r.depositoDespues === 1000, 'el depósito pasa de 800 a 1000 (sin el fee)');
ok(appendCalls.length === 1 && appendCalls[0].props[0] === P && appendCalls[0].ym === '2026-10' && appendCalls[0].nocache, 'recalcula solo esa propiedad y ese mes, sin caché');
ok(feeDe('2026-10') === 0, 'octubre: fee 0');
ok(feeDe('2026-11') === 200, 'noviembre: el fee vuelve solo (es de un mes, nunca más)');
const log = hojas['Fee exonerado'];
ok(log.length === 2 && log[1][3] === 'exonerar' && log[1][4] === 200 && log[1][7] === 800 && log[1][8] === 1000 && log[1][6] === 'Juan', 'la bitácora anota acción, fee, quién y depósito antes → después');

r = ctx.sa_resumenFee(ss, { ym: '2026-10', property: 'z9-prueba-1012', motivo: 'otra vez' }, null);
ok(r.ok && r.igual && hojas['Fee exonerado'].length === 2, 'exonerar dos veces no duplica nada');

r = ctx.sa_resumenFee(ss, { ym: '2026-09', property: P, motivo: 'x' }, null);
ok(!r.ok && r.locked, 'un mes cerrado pide confirmación');

const l = ctx.sa_resumenFeeLista(ss, { ym: '2026-10' });
ok(l.ok && l.activos.length === 1 && l.bitacora.length === 1, 'la lista devuelve la exoneración activa y la bitácora');
ok(ctx.sa_resumenFeeLista(ss, { ym: '2026-11' }).activos.length === 0, 'en noviembre no hay nada activo');

r = ctx.sa_resumenFee(ss, { ym: '2026-10', property: P, quitar: true }, null);
ok(r.ok && !r.activo && r.depositoDespues === 800 && feeDe('2026-10') === 200, 'devolver: el fee vuelve a descontarse y el depósito regresa a 800');
ok(hojas['Fee exonerado'].length === 3 && hojas['Fee exonerado'][2][3] === 'devolver', 'y también queda en la bitácora');

hojas.Resumenconsolidado = [hojas.Resumenconsolidado[0]];   // el mes todavía no está en el acumulado
appendCalls = [];
r = ctx.sa_resumenFee(ss, { ym: '2026-10', property: P, motivo: 'antes de cerrar' }, null);
ok(r.ok && r.acumulado === 'pendiente' && appendCalls.length === 0 && feeDe('2026-10') === 0, 'si el mes aún no está en el acumulado, queda anotado y entra al generar el resumen');
process.exit(fallo);
