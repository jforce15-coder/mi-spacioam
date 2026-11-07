/* Prueba de los ids de «insumos & gastos» (apps-script/IdsGastos.js + Escrituradesdeapp.js) con dobles de la hoja:
   sin internet ni Google. Corre el código real en una caja con una hoja de mentira y revisa:
   1. el caso de la fila 1353: un REC que está en la fila de otro gasto vuelve a la fila con su marca [REC:…],
      igual al id que arma sa_recurApply_, y el gasto programado no se duplica después;
   2. una factura (hex) vuelve a su única fila (mismo valor y fecha); si hay dos filas posibles, no se mueve;
   3. un REC sin fila (o con dos) no se toca: se queda donde está y el gasto programado no se vuelve a crear;
   6. solo se reparan filas de septiembre 2026 en adelante: una fila de antes se queda exactamente igual;
   4. borrar o editar con la fila equivocada → error y no toca nada; sin «antes» tampoco; con la fila buena, sí;
   5. la segunda corrida no hace nada.
   Nunca cambia A..F ni borra filas.
   node .github/ids-gastos.js [carpeta apps-script] */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = process.argv[2] || path.join(__dirname, '..', 'apps-script');
let fallo = 0; const ok = (c, m) => { if (c) console.log('✓ ' + m); else { console.log('::error::' + m); fallo = 1; } };

const H = ['Mes', 'Fecha de pedido', 'property_name', 'valor', 'categoria', 'Comentario', '', '', '', '', '', '', '', 'tag', 'orderId', 'orderUrl', 'authProductos', 'authTarifa'];
const dia = s => new Date(s + 'T00:00:00-06:00');   // como getValues: fecha en hora de Guatemala
const fila = (fecha, prop, valor, com, id, aP, aT) => [+fecha.slice(5, 7), dia(fecha), prop, valor, 'insumos & gastos', com || '', '', '', '', '', '', '', '', '', id || '', '', aP || '', aT || ''];

function caja(insumos, extra) {
  const props = {};
  const pad = n => ('0' + n).slice(-2);
  function hoja(name, rows) {
    const data = rows.map(r => r.slice()), w = Math.max(1, ...data.map(r => r.length));
    data.forEach(r => { while (r.length < w) r.push(''); });
    const sh = {
      data, escrituras: 0, borradas: 0,
      getName: () => name, getLastRow: () => data.length, getLastColumn: () => w,
      getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
      getRange: (row, col, nr = 1, nc = 1) => ({
        getValues: () => data.slice(row - 1, row - 1 + nr).map(r => r.slice(col - 1, col - 1 + nc)),
        setValues: v => { sh.escrituras++; v.forEach((vr, i) => { while (data.length < row + i) data.push(new Array(w).fill('')); vr.forEach((x, j) => { data[row - 1 + i][col - 1 + j] = x; }); }); },
        setValue: x => { sh.escrituras++; while (data.length < row) data.push(new Array(w).fill('')); data[row - 1][col - 1] = x; },
      }),
      appendRow: r => { sh.escrituras++; data.push(r.slice()); },
      deleteRow: r => { sh.borradas++; data.splice(r - 1, 1); }, setFrozenRows: () => {},
    };
    return sh;
  }
  const tabs = { 'insumos & gastos': hoja('insumos & gastos', [H].concat(insumos)) };
  Object.keys(extra || {}).forEach(k => { tabs[k] = hoja(k, extra[k]); });
  const ss = { getSheetByName: n => tabs[n] || null, insertSheet: n => (tabs[n] = hoja(n, [['']])) };
  const ctx = {
    console, JSON, Date, Math, String, Number, Object, Array, RegExp, parseInt, parseFloat, isNaN,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    Session: { getScriptTimeZone: () => 'America/Guatemala' },
    Utilities: { formatDate: (d, tz, f) => { const g = new Date(d.getTime() - 6 * 3600e3); return f.replace('yyyy', g.getUTCFullYear()).replace('MM', pad(g.getUTCMonth() + 1)).replace('dd', pad(g.getUTCDate())); } },
  };
  vm.createContext(ctx);
  for (const f of ['Escrituradesdeapp.js', 'IdsGastos.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  return { ctx, ss, tabs, props, ins: tabs['insumos & gastos'] };
}
const AF = sh => JSON.stringify(sh.data.map(r => r.slice(0, 6)));
const idDe = (sh, n) => String(sh.data[n - 1][14] || '');

/* 1 · El caso de la fila 1353 (y el de la 1335). */
const REC_NOV = 'REC-Rmuyd7bkz-2026-11-z4-edificioa4-304', REC_OCT = 'REC-Rmuyd7bkz-2026-10-z4-edificioa4-304';
const RECUR = [['id', 'estado', 'frecuencia', 'propiedades', 'tipo', 'valor', 'terminos', 'categoria', 'tag', 'comentario', 'desde', 'hasta', 'creado', 'cancelado', 'aplicados'],
  ['Rmuyd7bkz', 'activo', 'mensual', '["Z4 - EdificioA4 - 304"]', 'fijo', 509, '[]', 'insumos & gastos', '', 'EEGSA ZONA 4 (1534646)', '2026-09', '', '', '', '2026-10,2026-11']];
let C = caja([
  fila('2026-10-01', 'Z4 - EdificioA4 - 304', 509, 'EEGSA ZONA 4 (1534646) · monto fijo · [REC:Rmuyd7bkz]', 'MAN-2026-10-01-abcde-0'), // fila 2 (como la 1335)
  fila('2026-10-04', 'Z4 - Rue - 301', 165.3, '', REC_NOV),                                                                              // fila 3 (como la 1353)
  fila('2026-11-01', 'Z4 - EdificioA4 - 304', 509, 'EEGSA ZONA 4 (1534646) · monto fijo · [REC:Rmuyd7bkz]', ''),                       // fila 4
  fila('2026-09-30', 'Z10 - Ignacio - 1206', 205.55, 'insumos', REC_OCT),                                                               // fila 5
], { 'Gastos recurrentes': RECUR });
ok(C.ctx.sa_recurOrderId_('Rmuyd7bkz', '2026-11', 'Z4 - EdificioA4 - 304') === REC_NOV, 'el id se arma igual que en sa_recurApply_ (regla, mes y propiedad)');
const af0 = AF(C.ins);
let r = C.ctx.sa_repararIdsGastos_(C.ss, {});
ok(r.ok && idDe(C.ins, 4) === REC_NOV, 'fila 1353: el REC de noviembre vuelve a la fila con [REC:Rmuyd7bkz] de noviembre');
ok(idDe(C.ins, 2) === REC_OCT, 'fila 1335: la fila de octubre recibe su REC de octubre');
ok(/^GID-/.test(idDe(C.ins, 3)) && /^GID-/.test(idDe(C.ins, 5)), 'las filas que se quedaron sin su id reciben uno nuevo (GID-…), así se pueden seguir editando');
ok(AF(C.ins) === af0 && C.ins.data.length === 5, 'A..F no cambian y no se borra ninguna fila');
const ids = C.ins.data.slice(1).map(x => String(x[14])).filter(Boolean);
ok(new Set(ids).size === ids.length, 'ningún id repetido');
const log = C.tabs['Reparación de ids de gastos'];
ok(log && log.data.length === 5 && log.data.some(x => x[1] === 4 && /REC/.test(x[3]) && /\[REC\]/.test(x[4])), 'la bitácora «Reparación de ids de gastos» tiene fila, antes, después y motivo');
ok(!!C.props.GASTOS_IDS_V1, 'queda la marca GASTOS_IDS_V1');
// el disparador vuelve a aplicar noviembre: no duplica (el id ya está en su fila)
let ap = C.ctx.sa_recurApply_(C.ss, '2026-11', { unlocked: true });
ok(ap.ok && ap.added === 0 && C.ins.data.length === 5, 'aplicar los programados de noviembre después de reparar no crea otra fila');

/* 5 · Segunda corrida: no hace nada. */
const antes2 = JSON.stringify(C.ins.data), esc = C.ins.escrituras;
r = C.ctx.sa_repararIdsGastos_(C.ss, {});
ok(r.yaHecho && JSON.stringify(C.ins.data) === antes2 && C.ins.escrituras === esc, 'la segunda corrida no hace nada (GASTOS_IDS_V1)');
delete C.props.GASTOS_IDS_V1;
r = C.ctx.sa_repararIdsGastos_(C.ss, { simular: true });
ok(r.filasCambiadas === 0, 'y aunque se borrara la marca, sobre la hoja ya reparada no movería nada');

/* control: sin reparación ni reserva, sa_recurApply_ sí crea la fila, con el mismo id que arma la reparación */
C = caja([], { 'Gastos recurrentes': RECUR });
ap = C.ctx.sa_recurApply_(C.ss, '2026-10', { unlocked: true });
ok(ap.added === 1 && idDe(C.ins, 2) === REC_OCT, 'control: sa_recurApply_ crea el gasto de octubre con el id ' + REC_OCT);

/* 3 · Programados que faltan o están dos veces (Juan aún no decide): no se tocan. */
C = caja([
  fila('2026-09-28', 'Z1 - Centro Vivo - 1107', 339.1, 'insumos', 'REC-Rmuyd7bkz-2026-10-z4-edificioa4-304'),        // su fila no existe
  fila('2026-09-01', 'Antigua - casco - 64A', 310, 'Prime TV · monto fijo · [REC:Rmuyettcd]', ''),                      // dos filas con la misma marca
  fila('2026-09-01', 'Antigua - casco - 64A', 310, 'Prime TV · monto fijo · [REC:Rmuyettcd]', ''),
  fila('2026-10-02', 'Z10 - EON - 901', 75.8, 'insumos', 'REC-Rmuyettcd-2026-09-antigua-casco-64a'),
], { 'Gastos recurrentes': RECUR });
const sin0 = JSON.stringify(C.ins.data);
r = C.ctx.sa_repararIdsGastos_(C.ss, {});
ok(r.ok && JSON.stringify(C.ins.data) === sin0 && !C.props.GASTOS_IDS_RETIRADOS, 'un REC sin fila, o con dos filas con su marca, se queda donde está (no se mueve, no sale, no se reserva)');
ap = C.ctx.sa_recurApply_(C.ss, '2026-10', { unlocked: true });
ok(ap.added === 0 && C.ins.data.length === 5, 'y el gasto programado de ese mes no se crea otra vez (su id sigue en la hoja)');

/* 6 · Antes de septiembre 2026 no se toca nada. */
const FACT6 = [['id', 'tipo', 'auth', 'fecha', 'total', 'propiedad'],
  ['R-1', 'recibida', 'DDDDDDDD-0000-0000-0000-000000000001', dia('2026-10-10'), 120.5, ''],
  ['R-2', 'recibida', 'EEEEEEEE-0000-0000-0000-000000000002', dia('2026-08-10'), 88.2, '']];
const HD = 'DDDDDDDD-0000-0000-0000-000000000001', HE = 'EEEEEEEE-0000-0000-0000-000000000002';
C = caja([
  fila('2026-08-03', 'Z4 - Modra - 311', 5000, 'Renta 311', HD, HD, HD),         // fila 2: agosto, con una factura de octubre
  fila('2026-10-10', 'Z10 - EON - 901', 120.5, 'insumos', ''),                   // fila 3: la fila de esa factura
  fila('2026-10-20', 'Z1 - Centro Vivo - 1102', 300, 'insumos', HE, HE, HE),     // fila 4: octubre, con una factura de agosto
  fila('2026-08-10', 'Z13 - Narama - 725', 88.2, 'insumos', ''),                 // fila 5: su fila es de agosto
  fila('2026-07-17', 'Z1 - Centro Vivo - 1102', 286.55, 'Insumos', 'REP-1783133056195'),
  fila('2026-07-04', 'Z1 - Centro Vivo - 1107', 350, 'Mantenimiento · [REP:1783133056195] Ver detalle', ''),
], { Facturas: FACT6 });
const ago = JSON.stringify([C.ins.data[1], C.ins.data[4], C.ins.data[5], C.ins.data[6]]);
r = C.ctx.sa_repararIdsGastos_(C.ss, {});
ok(r.ok && JSON.stringify([C.ins.data[1], C.ins.data[4], C.ins.data[5], C.ins.data[6]]) === ago, 'las filas de antes de septiembre quedan exactamente igual (no se les quita, no se les pone, no reciben GID)');
ok(idDe(C.ins, 3) === '' && idDe(C.ins, 4) === HE, 'un id que está en una fila de agosto, o cuya fila es de agosto, no se mueve');
ok(r.porTipo.HEX.antesDeSept === 1 && r.porTipo.REP.antesDeSept === 1, 'el resumen cuenta aparte los ids de antes de septiembre');

/* 2 · Facturas: una sola fila posible → se mueve; dos → se queda. */
const FACT = [['id', 'tipo', 'auth', 'fecha', 'mes', 'nit', 'contraparte', 'descripcion', 'total', 'moneda', 'clasificacion', 'propiedad'],
  ['R-A', 'recibida', 'AAAAAAAA-0000-0000-0000-000000000001', dia('2026-10-05'), '', '', 'Súper', 'productos', 346.15, 'GTQ', '', ''],
  ['R-B', 'recibida', 'AAAAAAAA-0000-0000-0000-000000000002', dia('2026-10-05'), '', '', 'Reparto', 'tarifa', 4, 'GTQ', '', ''],
  ['R-C', 'recibida', 'CCCCCCCC-0000-0000-0000-000000000003', dia('2026-10-07'), '', '', 'Súper', 'productos', 61.44, 'GTQ', '', '']];
const HA = 'AAAAAAAA-0000-0000-0000-000000000001', HB = 'AAAAAAAA-0000-0000-0000-000000000002', HC = 'CCCCCCCC-0000-0000-0000-000000000003';
C = caja([
  fila('2026-10-01', 'Antigua - casco - 64A', 2250, 'Inca & koru', HA, HA, HB),   // fila 2: factura de otro gasto
  fila('2026-10-05', 'Antigua - Casco - 64B', 350.15, 'insumos', ''),             // fila 3: su gasto (346.15 + 4)
  fila('2026-10-07', 'Z7 - Monaco - C5', 61.44, 'Software', HC, HC, HC),          // fila 4 y 5: dos filas iguales
  fila('2026-10-07', 'Z7 - Monaco - C6', 61.44, 'Software', ''),
  fila('2026-10-20', 'Z1 - Centro Vivo - 1107', 90, 'insumos', 'MAN-2026-10-02-abcde-0'),
], { Facturas: FACT });
r = C.ctx.sa_repararIdsGastos_(C.ss, {});
ok(idDe(C.ins, 3) === HA && C.ins.data[2][16] === HA && C.ins.data[2][17] === HB, 'la factura (orderId + authProductos + authTarifa) vuelve a su única fila: mismo valor y fecha');
ok(idDe(C.ins, 4) === HC && idDe(C.ins, 5) === '', 'con dos filas posibles la factura se queda donde está');
ok(idDe(C.ins, 6) === 'MAN-2026-10-02-abcde-0', 'un gasto manual sin una única fila posible se queda donde está');

/* 4 · Editar / borrar: la fila tiene que ser el gasto que la app vio. */
C = caja([
  fila('2026-10-04', 'Z4 - Rue - 301', 165.3, '', REC_NOV),
  fila('2026-11-01', 'Z4 - EdificioA4 - 304', 509, '· [REC:Rmuyd7bkz]', ''),
]);
const af1 = AF(C.ins);
let d = C.ctx.sa_deleteInsumo(C.ss, { orderId: REC_NOV, antes: { property_name: 'Z4 - EdificioA4 - 304', valor: 509, mes: '2026-11' } });
ok(!d.ok && /cambió de fila; no lo toqué/.test(d.error) && C.ins.borradas === 0 && C.ins.data.length === 3, 'borrar con la fila equivocada → «ese gasto cambió de fila; no lo toqué» y no borra nada');
d = C.ctx.sa_deleteInsumo(C.ss, { orderId: REC_NOV });
ok(!d.ok && C.ins.borradas === 0, 'borrar sin decir qué gasto era (app vieja) → error y no borra nada');
let u = C.ctx.sa_updateInsumo(C.ss, { orderId: REC_NOV, antes: { property_name: 'Z4 - EdificioA4 - 304', valor: 509 }, valor: 1 });
ok(!u.ok && AF(C.ins) === af1 && C.ins.escrituras === 0, 'editar con la fila equivocada → error y no escribe nada');
u = C.ctx.sa_updateInsumo(C.ss, { orderId: REC_NOV, antes: { property_name: 'z4-rue-301', valor: '165.30', mes: '2026-10' }, Comentario: 'Mantenimiento' });
ok(u.ok && C.ins.data[1][5] === 'Mantenimiento', 'editar con la fila buena (propiedad escrita distinto, valor en texto) sí funciona');
d = C.ctx.sa_deleteInsumo(C.ss, { orderId: REC_NOV, antes: { property_name: 'Z4 - Rue - 301', valor: 165.3, mes: '2026-11' } });
ok(!d.ok && C.ins.borradas === 0, 'si el mes no coincide, tampoco borra');
// dos filas con el mismo id: borra la que coincide
C = caja([
  fila('2026-10-04', 'Z4 - Rue - 301', 165.3, '', 'X-1'),
  fila('2026-10-05', 'Z10 - EON - 901', 75.8, '', 'X-1'),
]);
d = C.ctx.sa_deleteInsumo(C.ss, { orderId: 'X-1', antes: { property_name: 'Z10 - EON - 901', valor: 75.8 } });
ok(d.ok && C.ins.data.length === 2 && C.ins.data[1][2] === 'Z4 - Rue - 301', 'si otra fila con el mismo id sí es el gasto, borra esa y deja la otra');

process.exit(fallo);
