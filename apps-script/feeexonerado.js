/* ═══ FEE DE SPACIO AM EXONERADO UN MES (Juan, 18-nov-2026 · Hub #825) ═══════════════════════════════════════════
   «Van a haber ocasiones en donde como empresa decidimos no descontar el fee de Spacio AM de este mes (un problema
   operativo, una cortesía para el socio)… que al aplicarlo se vuelva a generar el resumen, se agregue al acumulado…
   es temporal: solo se aplica en el mes que coloquemos y nunca más. Y debe haber un log.»
   · Una exoneración es de UNA propiedad en UN mes (AAAA-MM). Nunca pasa al mes siguiente: el cálculo
     (calcularResumenMensual, Código.js) solo la busca en ese mes exacto.
   · La pestaña «Fee exonerado» es la bitácora: cada vez que alguien exonera o devuelve el fee queda una fila
     (fecha, mes, propiedad, acción, fee, motivo, quién, depósito antes y después). Las filas no se borran; manda
     la última acción de cada propiedad y mes.
   · Al exonerar (o devolver), si la propiedad ya tiene su fila de ese mes en el acumulado, se recalcula y se actualiza
     solo esa fila (sa_resumenAppendCore_). Si todavía no la tiene, queda anotado y entra al generar el resumen.
   · Un mes cerrado (después del día 10 del mes siguiente) pide la misma confirmación que «Al acumulado».
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
var FX_TAB_ = "Fee exonerado";
var FX_H_ = ["fecha", "mes", "propiedad", "accion", "fee usd", "motivo", "quien", "deposito antes", "deposito despues"];

function fxNorm_(s) { return String(s == null ? "" : s).replace(/\s*-\s*/g, "-").trim().toLowerCase(); }
function fxYm_(v) {
  if (v instanceof Date) return v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2);
  var m = String(v == null ? "" : v).trim().match(/^(\d{4})-(\d{1,2})/);
  return m ? m[1] + "-" + ("0" + m[2]).slice(-2) : "";
}
function fxHoja_(ss, crear) {
  var sh = ss.getSheetByName(FX_TAB_);
  if (!sh && crear) { sh = ss.insertSheet(FX_TAB_); sh.getRange(1, 1, 1, FX_H_.length).setValues([FX_H_]); sh.setFrozenRows(1); }
  return sh;
}
/* Bitácora completa: [{ fila, fecha, ym, propiedad, accion, fee, motivo, quien, antes, despues }] en orden de la hoja. */
function fxBitacora_(ss) {
  var sh = fxHoja_(ss, false);
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getRange(1, 1, sh.getLastRow(), FX_H_.length).getValues(), out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i], ym = fxYm_(r[1]), prop = String(r[2] || "").trim();
    if (!ym || !prop) continue;
    out.push({ fila: i + 1, fecha: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || ""), ym: ym, propiedad: prop,
      accion: String(r[3] || "").trim().toLowerCase(), fee: Number(r[4]) || 0, motivo: String(r[5] || ""), quien: String(r[6] || ""),
      antes: r[7] === "" ? null : Number(r[7]), despues: r[8] === "" ? null : Number(r[8]) });
  }
  return out;
}
/* Propiedades con el fee exonerado en ese mes: { propiedadNormalizada: fila de la bitácora }. Manda la última acción. */
function fxExoneradosDelMes_(ss, ym) {
  ym = fxYm_(ym); var act = {};
  if (!ym) return act;
  fxBitacora_(ss).forEach(function (x) {
    if (x.ym !== ym) return;
    var k = fxNorm_(x.propiedad);
    if (x.accion === "exonerar") act[k] = x; else delete act[k];
  });
  return act;
}
/* Lo que el acumulado dice hoy de esa propiedad y mes: { fila, fee, deposito } o null. */
function fxFilaAcumulado_(ss, ym, prop) {
  var sh = typeof sa_consolidadoSheet_ === "function" ? sa_consolidadoSheet_(ss) : ss.getSheetByName("Resumenconsolidado");
  if (!sh || sh.getLastRow() < 2) return null;
  var data = sh.getDataRange().getValues(), H = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iP = H.indexOf("property_name"), iM = H.indexOf("mes"), iF = H.indexOf("fee spacio"), iN = H.indexOf("ingreso neto"), iN2 = H.indexOf("ingreso neto 2");
  var p = ym.split("-"), M = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var mes = M[+p[1] - 1] + " de " + p[0], k = fxNorm_(prop);
  for (var i = 1; i < data.length; i++) {
    if (sa_resMes_(data[i][iM]) !== mes || fxNorm_(data[i][iP]) !== k) continue;
    var n2 = iN2 >= 0 ? data[i][iN2] : "";
    return { fila: i + 1, fee: Number(data[i][iF]) || 0, deposito: n2 !== "" && n2 != null ? Number(n2) || 0 : Number(data[i][iN]) || 0 };
  }
  return null;
}
function fxRedondo_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/* Acción «resumenFeeLista» (solo lectura): exoneraciones del mes y la bitácora (las últimas 60, la más nueva primero). */
function sa_resumenFeeLista(ss, body) {
  var ym = fxYm_(body && body.ym), bit = fxBitacora_(ss), act = ym ? fxExoneradosDelMes_(ss, ym) : {};
  return { ok: true, ym: ym, activos: Object.keys(act).map(function (k) { return act[k]; }), bitacora: bit.slice(-60).reverse() };
}

/* Acción «resumenFee»: body { ym, property, quitar, motivo, unlock }.
   quitar = false → exonera el fee de ese mes; quitar = true → lo devuelve (vuelve a cobrarse). */
function sa_resumenFee(ss, body, ses) {
  var ym = fxYm_(body.ym), prop = String(body.property || "").trim(), quitar = !!body.quitar;
  var motivo = String(body.motivo || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!ym || !prop) return { ok: false, error: "faltan el mes o la propiedad" };
  if (!quitar && !motivo) return { ok: false, error: "escribe el motivo (queda en la bitácora)" };
  if (sa_mesCerrado_(ym) && !sa_unlockOk_(body.unlock)) return { ok: false, locked: true, error: "Mes cerrado: confirma para modificarlo." };
  var activo = !!fxExoneradosDelMes_(ss, ym)[fxNorm_(prop)];
  if (activo === !quitar) return { ok: true, igual: true, activo: activo };
  var antes = fxFilaAcumulado_(ss, ym, prop);
  var sh = fxHoja_(ss, true);
  var quien = ses ? String(ses.nombre || ses.email || "administrador").slice(0, 80) : "robot";
  sh.appendRow([new Date(), ym, prop, quitar ? "devolver" : "exonerar", antes ? fxRedondo_(antes.fee) : "", motivo, quien, antes ? fxRedondo_(antes.deposito) : "", ""]);
  var fila = sh.getLastRow();
  sh.getRange(fila, 2).setNumberFormat("@").setValue(ym);   // «2026-10» como texto: que la hoja no lo vuelva fecha
  SpreadsheetApp.flush();
  var out = { ok: true, activo: !quitar, ym: ym, propiedad: prop, feeAntes: antes ? fxRedondo_(antes.fee) : null, depositoAntes: antes ? fxRedondo_(antes.deposito) : null, acumulado: "pendiente" };
  if (antes) {
    sa_resDirty_();
    var r = sa_resumenAppendCore_(ss, { ym: ym, props: [prop], nocache: true });
    if (!r || !r.ok) { out.ok = false; out.error = "Quedó anotado, pero no se pudo recalcular el acumulado: " + ((r && r.error) || "error"); return out; }
    var despues = fxFilaAcumulado_(ss, ym, prop);
    if (despues) { out.feeDespues = fxRedondo_(despues.fee); out.depositoDespues = fxRedondo_(despues.deposito); sh.getRange(fila, 9).setValue(out.depositoDespues); }
    out.acumulado = "actualizado";
  }
  return out;
}
