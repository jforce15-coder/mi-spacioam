/**
 * ─────────────────────────────────────────────────────────────
 *  DATABASE Hospitable → Google Sheets  (Spacio AM)
 *  Réplica en Apps Script del workflow n8n "DATABASE Hospitable"
 * ─────────────────────────────────────────────────────────────
 *
 *  Equivalencia con los nodos de n8n:
 *    Schedule Trigger (6:00)      → hospitableAutomatico()  + hospitableCrearTrigger()
 *    HTTP Request1 + Code         → hsp_obtenerPropiedades_()
 *    Loop + Fechas + HTTP Request → hsp_obtenerReservas_()  (una llamada por propiedad)
 *    Code1                        → se añade property_id / property_name a cada reserva
 *    Code2                        → hsp_transformarReserva_()   (idéntico)
 *    Append or update row         → hsp_escribirEnHoja_()       (coincide por "code")
 *    Limpiar y extender fórmulas  → hsp_limpiarYExtenderFormulas_()
 *
 *  Lo único nuevo: puedes pedir fechas específicas con
 *  hospitableConFechas('AAAA-MM-DD', 'AAAA-MM-DD') o desde el menú "Hospitable".
 *
 *  Token: se guarda en Configuración del proyecto → Propiedades de la secuencia
 *  de comandos, con la clave HOSPITABLE_TOKEN (sin la palabra "Bearer").
 */

const HSP_CONFIG = {
  SPREADSHEET_ID: '1l9wLH8880NlN9ac2jvne2U6cqej6gycqAD77Z25cLF4', // Spacio AM 2025
  SHEET_GID: 722698946,                                           // pestaña DATABASE
  HEADER_ROW: 1,
  MATCH_COLUMN: 'code',
  API_BASE: 'https://public.api.hospitable.com/v2',
  INCLUDE: ['financials', 'guest', 'property', 'review'],
  DIAS_ATRAS: 90,
  CLEANUP_URL: 'https://script.google.com/macros/s/AKfycbzqUTv_0NuNBVRXhlfHGaS5RdWKjBAmfA-dIsdDnMLbl2aE2PriEXNWw3qCi8yPF28qaQ/exec',
};

/* ═════════════════════════ PUNTOS DE ENTRADA ═════════════════════════ */

/** Automático: últimos 90 días hasta hoy (igual que el nodo "Fechas"). */
function hospitableAutomatico() {
  const hoy = new Date();
  const inicio = new Date(hoy.getTime());
  inicio.setUTCDate(inicio.getUTCDate() - HSP_CONFIG.DIAS_ATRAS);
  return hsp_sincronizar_(hsp_formatoFecha_(inicio), hsp_formatoFecha_(hoy));
}

/** Manual con fechas específicas. Ej: hospitableConFechas('2025-01-01', '2025-03-31') */
function hospitableConFechas(startDate, endDate) {
  hsp_validarFechas_(startDate, endDate);
  return hsp_sincronizar_(startDate, endDate);
}

/** Para correr desde el editor: cambia estas dos fechas y pulsa ▶ Ejecutar. */
function hospitableManual() {
  const START_DATE = '2025-01-01';
  const END_DATE   = '2025-03-31';
  hospitableConFechas(START_DATE, END_DATE);
}

/** Crea (o reemplaza) el disparador diario entre las 6:00 y las 7:00. */
function hospitableCrearTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'hospitableAutomatico')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('hospitableAutomatico').timeBased().everyDays(1).atHour(6).create();
}

/* ═════════════════════════ MENÚ EN LA HOJA ═════════════════════════ */

/**
 * No se usa onOpen() aquí para no pisar el que ya tengas en otro archivo.
 * Llama hospitableAgregarMenu() desde tu onOpen existente (ver instrucciones).
 */
function hospitableAgregarMenu() {
  SpreadsheetApp.getUi()
    .createMenu('Hospitable')
    .addItem('Sincronizar últimos 90 días', 'hospitableMenuAutomatico')
    .addItem('Sincronizar por fechas…', 'hospitableMenuPorFechas')
    .addToUi();
}

function hospitableMenuAutomatico() {
  const r = hospitableAutomatico();
  SpreadsheetApp.getUi().alert(hsp_resumen_(r));
}

function hospitableMenuPorFechas() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Fecha de inicio (start_date)', 'Formato AAAA-MM-DD', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const b = ui.prompt('Fecha de fin (end_date)', 'Formato AAAA-MM-DD', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  try {
    const r = hospitableConFechas(a.getResponseText().trim(), b.getResponseText().trim());
    ui.alert(hsp_resumen_(r));
  } catch (e) {
    ui.alert('No se pudo sincronizar: ' + e.message);
  }
}

/* ═════════════════════════ FLUJO PRINCIPAL ═════════════════════════ */

function hsp_sincronizar_(startDate, endDate) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Ya hay una sincronización en curso. Intenta en unos minutos.');

  try {
    console.log(`Sincronizando reservas del ${startDate} al ${endDate}`);
    const token = hsp_obtenerToken_();

    // HTTP Request1 + Code
    const propiedades = hsp_obtenerPropiedades_(token);
    console.log(`${propiedades.length} propiedades encontradas`);

    // Loop + Fechas + HTTP Request + Code1
    const reservas = [];
    const errores = [];
    propiedades.forEach(p => {
      try {
        hsp_obtenerReservas_(token, p.property_id, startDate, endDate).forEach(res => {
          reservas.push(Object.assign({}, res, {
            property_id: p.property_id,
            property_name: p.property_name,
          }));
        });
      } catch (e) {
        console.error(`Error en ${p.property_name} (${p.property_id}): ${e.message}`);
        errores.push(p.property_name || p.property_id);
      }
    });

    // Code2
    const filas = reservas.map(hsp_transformarReserva_);

    // Append or update row in sheet
    const escritura = hsp_escribirEnHoja_(filas);

    // Limpiar y extender fórmulas (una sola vez)
    hsp_limpiarYExtenderFormulas_();

    const resultado = {
      startDate, endDate,
      propiedades: propiedades.length,
      reservas: filas.length,
      actualizadas: escritura.actualizadas,
      nuevas: escritura.nuevas,
      errores,
    };
    console.log(JSON.stringify(resultado));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

/* ═════════════════════════ HOSPITABLE API ═════════════════════════ */

function hsp_obtenerToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('HOSPITABLE_TOKEN');
  if (!token) throw new Error('Falta la propiedad HOSPITABLE_TOKEN en Configuración del proyecto.');
  return token
    .replace(/\s+/g, '')          // saltos de línea / espacios pegados al copiar
    .replace(/^["']+|["']+$/g, '') // comillas al inicio o al final
    .replace(/^Bearer/i, '');      // por si se pegó con "Bearer"
}

/** Diagnóstico: revisa el token guardado y prueba una llamada a Hospitable. */
function hospitableProbarToken() {
  const t = hsp_obtenerToken_();
  console.log(`Largo: ${t.length} · empieza: ${t.slice(0, 12)} · termina: ${t.slice(-8)} · partes JWT: ${t.split('.').length}`);
  const resp = UrlFetchApp.fetch(HSP_CONFIG.API_BASE + '/properties', {
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' },
    muteHttpExceptions: true,
  });
  console.log(`Hospitable respondió HTTP ${resp.getResponseCode()}: ${resp.getContentText().slice(0, 150)}`);
}

function hsp_obtenerPropiedades_(token) {
  const out = [];
  let page = 1;
  let lastPage = 1;
  do {
    const body = hsp_fetchJson_(`${HSP_CONFIG.API_BASE}/properties?page=${page}`, token);
    (body.data || []).forEach(p => out.push({ property_id: p.id, property_name: p.name ?? null }));
    lastPage = (body.meta && body.meta.last_page) || page;
    page++;
  } while (page <= lastPage);
  return out;
}

function hsp_obtenerReservas_(token, propertyId, startDate, endDate) {
  const out = [];
  let page = 1;
  while (page <= 500) {
    const qs = [
      'properties%5B%5D=' + encodeURIComponent(propertyId),
      'start_date=' + startDate,
      'end_date=' + endDate,
      ...HSP_CONFIG.INCLUDE.map(i => 'include%5B%5D=' + i),
      'page=' + page,
    ].join('&');
    const body = hsp_fetchJson_(`${HSP_CONFIG.API_BASE}/reservations?${qs}`, token);
    out.push(...(body.data || []));
    if (!body.links || !body.links.next) break; // misma condición de fin que n8n
    page++;
  }
  return out;
}

function hsp_fetchJson_(url, token) {
  const opciones = {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    muteHttpExceptions: true,
  };
  const intentos = 4;
  for (let i = 1; i <= intentos; i++) {
    const resp = UrlFetchApp.fetch(url, opciones);
    const code = resp.getResponseCode();
    if (code >= 200 && code < 300) return JSON.parse(resp.getContentText());
    if ((code === 429 || code >= 500) && i < intentos) {
      const retryAfter = Number(resp.getHeaders()['Retry-After']) || 2 * i;
      Utilities.sleep(Math.min(retryAfter, 30) * 1000);
      continue;
    }
    throw new Error(`HTTP ${code}: ${resp.getContentText().slice(0, 300)}`);
  }
}

/* ═════════════════════════ CODE2 (idéntico) ═════════════════════════ */

function hsp_transformarReserva_(r) {
  function moneyFix(value) {
    return typeof value === 'number' ? Math.abs(value) / 100 : 0;
  }
  function formatDate(value) {
    return value ? value.split('T')[0] : null;
  }
  function findFee(fees, label) {
    if (!Array.isArray(fees)) return 0;
    const fee = fees.find(f =>
      f.label?.toLowerCase().replace(/[_\s]/g, '') === label.toLowerCase().replace(/[_\s]/g, '')
    );
    return moneyFix(fee?.amount);
  }
  function fixPhoneNumber(phone) {
    return typeof phone === 'string' && phone.startsWith('+') ? `'${phone}` : phone;
  }

  const locationParts = (r.guest?.location ?? '').split(',');
  const guest_city = locationParts[0]?.trim() || null;
  const guest_country = locationParts[1]?.trim() || null;

  const guestFees = r.financials?.guest?.fees || [];
  const guestDiscounts = r.financials?.guest?.discounts || [];

  const baseAmount = moneyFix(r.financials?.guest?.accommodation?.amount);
  const cleaningFee = findFee(guestFees, 'Cleaning Fee');
  const linenFee = findFee(guestFees, 'Linen Fee');
  const resortFee = findFee(guestFees, 'Resort Fee');
  const managementFee = findFee(guestFees, 'Management Fee');
  const communityFee = findFee(guestFees, 'Community Fee');
  const petFee = findFee(guestFees, 'Pet Fee');
  const extraGuestFee = findFee(guestFees, 'Extra Guest Fee');
  const otherFee = findFee(guestFees, 'Other Fee');
  const guestServiceFee = findFee(guestFees, 'Guest Service Fee');
  const remittedTaxes = moneyFix(r.financials?.remitted_taxes);

  const guest_discount = moneyFix(
    guestDiscounts.reduce((acc, d) => acc + (typeof d.amount === 'number' ? d.amount : 0), 0)
  );

  const subtotal = baseAmount + cleaningFee + linenFee + resortFee + managementFee +
    communityFee + petFee + extraGuestFee + otherFee + remittedTaxes;

  return {
    checkin_date: formatDate(r.arrival_date),
    checkout_date: formatDate(r.departure_date),
    booking_date: formatDate(r.booking_date),
    code: r.code ?? null,
    platform: r.platform ?? null,
    property_id: r.property_id ?? null,
    property_name: r.property_name ?? null,
    status: r.reservation_status?.current?.category ?? null,
    instant_booked: r.instant_booked ?? null,
    guest_first_name: r.guest?.first_name ?? null,
    guest_last_name: r.guest?.last_name ?? null,
    guest_count: r.guests?.total ?? null,
    guests_pets: r.guests?.pet_count ?? null,
    guest_email: r.guest?.email ?? null,
    guest_phone: fixPhoneNumber(r.guest?.phone_numbers?.[0] ?? null),
    guest_city,
    guest_country,
    review_rating: r.review?.public?.rating ?? null,
    nights: r.nights ?? null,
    currency: r.financials?.currency ?? null,
    base_amount: baseAmount,
    guest_discount,
    cleaning_fee: cleaningFee,
    linen_fee: linenFee,
    subtotal,
    guest_service_fee: guestServiceFee,
    resort_fee: resortFee,
    management_fee: managementFee,
    community_fee: communityFee,
    pet_fee: petFee,
    extra_guest_fee: extraGuestFee,
    other_fee: otherFee,
    remitted_taxes: remittedTaxes,
    total_price: moneyFix(r.financials?.guest?.total_price?.amount),
    security_deposit: moneyFix(r.financials?.security_deposit),
    pass_through_taxes: moneyFix(r.financials?.guest?.taxes?.[0]?.amount),
    host_service_fee: moneyFix(r.financials?.host?.host_fees?.[0]?.amount),
    payout: moneyFix(r.financials?.host?.revenue?.amount),
    adjusted_amount: moneyFix(r.financials?.adjusted_amount),
    revenue: moneyFix(r.financials?.host?.revenue?.amount),
  };
}

/* ═════════════════ APPEND OR UPDATE (coincide por "code") ═════════════════
 * Solo escribe las columnas que genera Code2. Las columnas de fórmulas
 * (Mes_año, Fechas resum, lead_time, ingreso_bruto, % Fee plataforma, etc.)
 * no se tocan, igual que en n8n.
 */
function hsp_escribirEnHoja_(filas) {
  const res = { actualizadas: 0, nuevas: 0 };
  if (!filas.length) return res;

  const sh = SpreadsheetApp.openById(HSP_CONFIG.SPREADSHEET_ID)
    .getSheets().find(s => s.getSheetId() === HSP_CONFIG.SHEET_GID);
  if (!sh) throw new Error('No encontré la pestaña DATABASE (gid ' + HSP_CONFIG.SHEET_GID + ').');

  // Encabezados
  const headers = sh.getRange(HSP_CONFIG.HEADER_ROW, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(h => String(h).trim());
  const colIdx = {};
  headers.forEach((h, i) => { if (h && !(h in colIdx)) colIdx[h] = i; });
  if (!(HSP_CONFIG.MATCH_COLUMN in colIdx)) throw new Error('No existe la columna "code" en DATABASE.');

  const campos = Object.keys(filas[0]);
  const faltantes = campos.filter(k => !(k in colIdx));
  if (faltantes.length) console.warn('Columnas que no existen en la hoja (se omiten): ' + faltantes.join(', '));

  // Agrupa las columnas mapeadas en tramos contiguos para escribir en bloque
  const nombrePorCol = {};
  campos.filter(k => k in colIdx).forEach(k => { nombrePorCol[colIdx[k]] = k; });
  const tramos = [];
  Object.keys(nombrePorCol).map(Number).sort((a, b) => a - b).forEach(c => {
    const t = tramos[tramos.length - 1];
    if (t && c === t.fin + 1) t.fin = c; else tramos.push({ ini: c, fin: c });
  });
  const valoresTramo = (fila, t) => {
    const out = [];
    for (let c = t.ini; c <= t.fin; c++) {
      const v = fila[nombrePorCol[c]];
      out.push(v === null || v === undefined ? '' : v);
    }
    return out;
  };

  // Índice de códigos existentes
  const primeraFila = HSP_CONFIG.HEADER_ROW + 1;
  const ultimaFila = sh.getLastRow();
  const filaPorCodigo = {};
  let ultimaConCodigo = HSP_CONFIG.HEADER_ROW;
  if (ultimaFila >= primeraFila) {
    sh.getRange(primeraFila, colIdx[HSP_CONFIG.MATCH_COLUMN] + 1, ultimaFila - primeraFila + 1, 1)
      .getValues().forEach((r, i) => {
        const c = String(r[0]).trim();
        if (c === '') return;
        if (!(c in filaPorCodigo)) filaPorCodigo[c] = primeraFila + i;
        ultimaConCodigo = primeraFila + i;
      });
  }

  // Deduplica dentro del lote (la última versión gana)
  const porCodigo = new Map();
  filas.forEach(f => {
    if (f.code === null || f.code === '') { console.warn('Reserva sin code, omitida'); return; }
    porCodigo.set(String(f.code).trim(), f);
  });

  const nuevas = [];
  porCodigo.forEach((fila, code) => {
    const row = filaPorCodigo[code];
    if (row) {
      tramos.forEach(t => {
        sh.getRange(row, t.ini + 1, 1, t.fin - t.ini + 1).setValues([valoresTramo(fila, t)]);
      });
      res.actualizadas++;
    } else {
      nuevas.push(fila);
    }
  });

  if (nuevas.length) {
    const inicio = ultimaConCodigo + 1;
    const necesarias = inicio + nuevas.length - 1 - sh.getMaxRows();
    if (necesarias > 0) sh.insertRowsAfter(sh.getMaxRows(), necesarias);
    tramos.forEach(t => {
      sh.getRange(inicio, t.ini + 1, nuevas.length, t.fin - t.ini + 1)
        .setValues(nuevas.map(f => valoresTramo(f, t)));
    });
    res.nuevas = nuevas.length;
  }

  SpreadsheetApp.flush();
  return res;
}

/* ═════════════════════ LIMPIAR Y EXTENDER FÓRMULAS ═════════════════════ */

function hsp_limpiarYExtenderFormulas_() {
  SpreadsheetApp.flush();

  // 1) Limpiar y extender fórmulas (función del otro archivo del proyecto)
  try {
    if (typeof limpiarYActualizarDatabase === 'function') {
      limpiarYActualizarDatabase();
      console.log('limpiarYActualizarDatabase ejecutada');
    } else {
      // Respaldo: el web app que usaba n8n
      const resp = UrlFetchApp.fetch(HSP_CONFIG.CLEANUP_URL, { muteHttpExceptions: true, followRedirects: true });
      console.log('Limpiar y extender fórmulas (web app) → HTTP ' + resp.getResponseCode());
    }
  } catch (e) {
    console.error('limpiarYActualizarDatabase falló: ' + e.message);
  }

  // 2) Normalizar GTQ → USD (cada sync vuelve a escribir los montos en GTQ)
  try {
    SpreadsheetApp.flush();
    if (typeof normalizarMonedaUSD === 'function') {
      const n = normalizarMonedaUSD();
      console.log('normalizarMonedaUSD: ' + n + ' reserva(s) convertidas');
    } else {
      console.warn('No existe normalizarMonedaUSD en el proyecto');
    }
  } catch (e) {
    console.error('normalizarMonedaUSD falló: ' + e.message);
  }

  // generarResumenMensual NO se ejecuta aquí: lleva su propio proceso manual.
}

/* ═════════════════════════ UTILIDADES ═════════════════════════ */

function hsp_formatoFecha_(d) {
  return d.toISOString().substring(0, 10); // mismo formato UTC que el nodo "Fechas"
}

function hsp_validarFechas_(a, b) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(a) || !re.test(b)) throw new Error('Usa el formato AAAA-MM-DD en ambas fechas.');
  if (isNaN(Date.parse(a)) || isNaN(Date.parse(b))) throw new Error('Alguna de las fechas no es válida.');
  if (a > b) throw new Error('La fecha de inicio no puede ser posterior a la de fin.');
}

function hsp_resumen_(r) {
  let txt = `Listo (${r.startDate} → ${r.endDate})\n` +
    `${r.reservas} reservas · ${r.actualizadas} actualizadas · ${r.nuevas} nuevas`;
  if (r.errores.length) txt += `\n\nFallaron: ${r.errores.join(', ')}`;
  return txt;
}
