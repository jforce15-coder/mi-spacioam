function normalizarMonedaUSD() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Database');
  const shTC = ss.getSheetByName('TC');
  if (!sh) throw new Error("❌ No existe la hoja 'Database'");

  const rng = sh.getDataRange();
  const data = rng.getValues();
  if (data.length < 2) return 0;

  const headers = data[0].map(h => String(h || '').trim().toLowerCase());
  const colCurrency = headers.indexOf('currency');
  const colProp = headers.indexOf('property_name');
  const colTag = headers.indexOf('instant_booked');   // aquí se marca la conversión
  const TAG = 'GTQ→USD';                              // etiqueta de fila convertida
  if (colCurrency < 0) throw new Error("❌ DATABASE no tiene columna 'currency'");

  // Rango de montos: columna W (índice 22) hasta AP (índice 41).
  // Todo lo que viene después son fórmulas y NO se toca.
  const COL_W = 22, COL_AP = 41;
  const ultima = Math.min(COL_AP, headers.length - 1);

  // Tipo de cambio por propiedad (hoja TC, columna 3)
  const norm = s => (s || '').toString().replace(/\s*-\s*/g, '-').trim();
  const mapaTC = {};
  if (shTC) {
    const filasTC = shTC.getDataRange().getValues();
    filasTC.shift();
    filasTC.forEach(r => {
      const k = norm(r[0]);
      const v = parseFloat((r[2] || '0').toString().replace(',', '.'));
      if (k && v > 1.5) mapaTC[k] = v;   // solo tasas GTQ reales (>1.5)
    });
  }

  let convertidas = 0, sinTC = [];
  for (let r = 1; r < data.length; r++) {
    const cur = String(data[r][colCurrency] || '').trim().toUpperCase();
    if (cur !== 'GTQ') continue;              // SOLO filas marcadas GTQ

    const prop = colProp >= 0 ? norm(data[r][colProp]) : '';
    const tc = mapaTC[prop];
    if (!tc) { sinTC.push(prop || ('fila ' + (r + 1))); continue; }  // sin TC: no se toca

    for (let c = COL_W; c <= ultima; c++) {
      const v = data[r][c];
      if (v === '' || v === null) continue;
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      if (isNaN(n) || n === 0) continue;
      data[r][c] = Math.round((n / tc) * 100) / 100;
    }
    data[r][colCurrency] = 'USD';             // marca: no se vuelve a convertir
    if (colTag >= 0) {
      const prev = String(data[r][colTag] || '').trim();
      data[r][colTag] = prev && prev.indexOf(TAG) < 0 ? (prev + ' | ' + TAG) : TAG;
    }
    convertidas++;
  }

  // ⚠️ NO escribir el rango completo: las columnas A, B y AQ..AV contienen
  // fórmulas y setValues() las reemplazaría por valores fijos.
  // Se escriben SOLO los bloques de datos que esta función modifica:
  //   · W..AP  (montos)          · currency          · instant_booked
  if (convertidas) {
    const nFilas = data.length - 1;
    const ancho = ultima - COL_W + 1;
    sh.getRange(2, COL_W + 1, nFilas, ancho)
      .setValues(data.slice(1).map(row => row.slice(COL_W, ultima + 1)));
    sh.getRange(2, colCurrency + 1, nFilas, 1)
      .setValues(data.slice(1).map(row => [row[colCurrency]]));
    if (colTag >= 0) {
      sh.getRange(2, colTag + 1, nFilas, 1)
        .setValues(data.slice(1).map(row => [row[colTag]]));
    }
  }
  Logger.log('GTQ → USD: ' + convertidas + ' reserva(s) convertidas' +
    (sinTC.length ? ' · SIN TC (no convertidas): ' + [...new Set(sinTC)].join(', ') : ''));
  return convertidas;
}

// Botón del menú / editor: calcula el mes de Resumen!C1 y lo escribe en Resumen.
function generarResumenMensual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // ✅ PASO 0 — normaliza a USD toda reserva que haya entrado en GTQ (idempotente).
  normalizarMonedaUSD();
  const hojaResumen = ss.getSheetByName('Resumen');
  if (!hojaResumen) throw new Error("❌ No existe la hoja 'Resumen'");
  const r = calcularResumenMensual(hojaResumen.getRange('C1').getValue());
  hojaResumen.getRange(5, 1, 1, r.encabezados.length).setValues([r.encabezados]);
  if (r.resultados.length > 0) {
    hojaResumen.getRange(6, 1, r.resultados.length, r.resultados[0].length).setValues(r.resultados);
    hojaResumen.getRange(6, 18, r.resultados.length, 2).setNumberFormat("0.00%");
  }
}

// Cálculo puro (no escribe): lo usan generarResumenMensual y el dashboard
// (Opciones avanzadas). mesRaw = "AAAA-MM" (o Date).
function calcularResumenMensual(mesRaw) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const hojaDB = ss.getSheetByName('Database');
  const hojaResumen = ss.getSheetByName('Resumen');
  const hojaSetup = ss.getSheetByName('SETUP');
  const hojaGastos = ss.getSheetByName('insumos & gastos');
  const hojaTC = ss.getSheetByName('TC');

  if (!hojaDB || !hojaResumen || !hojaSetup || !hojaGastos || !hojaTC) {
    throw new Error("❌ Verifica que existan todas las hojas necesarias");
  }

  const normalize = s => (s || '').toString().replace(/\s*-\s*/g, '-').trim();
  const safeNumber = val => parseFloat((val || '0').toString().replace(',', '.'));

  if (mesRaw instanceof Date) mesRaw = mesRaw.getFullYear() + "-" + String(mesRaw.getMonth() + 1).padStart(2, "0");
  const [año, mes] = mesRaw.toString().split("-");
  const fechaReferencia = new Date(Number(año), Number(mes) - 1, 1);
  const mesBusqueda = fechaReferencia.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toLowerCase().trim();
  const mesNumerico = parseInt(mes);
  const diasDelMes = new Date(Number(año), Number(mes), 0).getDate();

  const datosDB = hojaDB.getDataRange().getValues();
  const headersDB = datosDB.shift();
  const idx = {};
  headersDB.forEach((h, i) => idx[h.trim().toLowerCase()] = i);

  const datosSetup = hojaSetup.getDataRange().getValues();
  const headerSetup = datosSetup.shift();
  const idxSetup = {};
  headerSetup.forEach((h, i) => idxSetup[h.trim().toLowerCase()] = i);

  const datosTC = hojaTC.getDataRange().getValues();
  datosTC.shift();
  const mapaTC = {};
  datosTC.forEach(r => {
    mapaTC[normalize(r[0])] = safeNumber(r[2]);
  });

  const gastos = hojaGastos.getDataRange().getValues();
  const headersGastos = gastos.shift();
  const idxGastos = {};
  headersGastos.forEach((h, i) => idxGastos[h.toLowerCase().trim()] = i);

  const propiedadesUnicas = [...new Set(datosSetup.map(r => normalize(r[idxSetup['property_name']])))].filter(p => p !== "");
  const resultados = [];

  // ⚡ Índices construidos UNA vez (antes se recorría toda la Database y todos los
  // gastos por cada propiedad, con toLocaleString por fila: minutos en vez de segundos).
  // Mismo criterio que antes: año y mes del check-in en la zona horaria del script.
  const añoN = Number(año), mesN = Number(mes);
  const dbPorId = {};
  datosDB.forEach(row => {
    if ((row[idx['status']] || '').toString().toLowerCase().trim() !== 'accepted') return;
    const ci = new Date(row[idx['checkin_date']]);
    if (isNaN(ci) || ci.getFullYear() !== añoN || ci.getMonth() + 1 !== mesN) return;
    const id = normalize(row[idx['property_id']] || '');
    (dbPorId[id] = dbPorId[id] || []).push(row);
  });
  const gastosPorProp = {};
  gastos.forEach(row => {
    if (parseInt(row[idxGastos['mes']] || '0') !== mesNumerico) return;
    const p = normalize(row[idxGastos['property_name']] || '');
    (gastosPorProp[p] = gastosPorProp[p] || []).push(row);
  });

  propiedadesUnicas.forEach(propiedad => {
    const tasaCambio = mapaTC[propiedad] || 1;

    const propertyIDsAsociados = [...new Set(datosSetup
      .filter(r => normalize(r[idxSetup['property_name']]) === propiedad)
      .map(r => normalize(r[idxSetup['property_id']])))];

    // ✅ Reservas del mes de cualquiera de los property_id asociados
    const entradasFiltradas = [];
    propertyIDsAsociados.forEach(id => { (dbPorId[id] || []).forEach(r => entradasFiltradas.push(r)); });

    if (entradasFiltradas.length === 0) return;

    let ingresoBruto = 0, ivaTotal = 0;
    let hostServiceFee = 0, cleaningFee = 0, nightsTotal = 0;

    entradasFiltradas.forEach(row => {
      ingresoBruto += safeNumber(row[idx['ingreso_bruto']]);
      ivaTotal += safeNumber(row[idx['pass_through_taxes']]);
      hostServiceFee += safeNumber(row[idx['fee_plataforma_socio']]);
      cleaningFee += safeNumber(row[idx['cleaning_fee']]);
      nightsTotal += safeNumber(row[idx['nights']]);
    });

    const reservasConIngreso = entradasFiltradas.filter(r => safeNumber(r[idx['ingreso_bruto']]) > 0);

    let noches = 0, estadias = 0, leadTimeTotal = 0;

    reservasConIngreso.forEach(row => {
      noches += safeNumber(row[idx['nights']]);
      estadias++;
      leadTimeTotal += safeNumber(row[idx['lead_time']]);
    });

    const estadiaProm = estadias > 0 ? noches / estadias : 0;
    const precioProm = nightsTotal > 0 ? (ingresoBruto + hostServiceFee) / noches : 0;
    const leadTimeProm = estadias > 0 ? leadTimeTotal / estadias : 0;

    const filaPropSetup = datosSetup.find(r => normalize(r[idxSetup['property_name']]) === propiedad);

    // ✅ IVA SOCIOS (corregido)
    let ivaSocios = 0;
    if (filaPropSetup && (filaPropSetup[idxSetup['iva']] || '').toUpperCase().trim() === 'SI') {
      const impuestoRaw = (filaPropSetup[idxSetup['impuesto']] || '').toString().replace('%', '').trim();
      const impuesto = Number(impuestoRaw);
      const feeRaw = (filaPropSetup[idxSetup['spacioamfee']] || '').toString().replace('%', '').trim();
      const fee = Number(feeRaw);
      const factor = (100 - fee) / 100;

      if (impuesto === 0.12) {
        ivaSocios = ivaTotal * factor;
      } else if (impuesto === 0.05) {
        ivaSocios = (ivaTotal * factor) * (5 / 12);
      }
    }

    let feeSpacio = 0;
    if (filaPropSetup) {
      const feeRaw = (filaPropSetup[idxSetup['spacioamfee']] || '').toString().replace('%', '').trim();
      const fee = Number(feeRaw);
      feeSpacio = ingresoBruto * (fee / 100);
    }

    let insumosYGastos = 0;
    let reparaciones = 0;
    let otrosIngresos2 = 0;

    // Misma regla que el Dashboard: si el tag (col. G) es no cobrable, el gasto
    // no se le cobra al socio aunque la categoría diga "insumos & gastos".
    const TAGS_NO_COBRABLES = { 'gasto spacio am': 1, 'restaurante / comida': 1, 'restaurante/comida': 1, 'compras ajenas a insumos': 1 };
    const iTag = idxGastos['tag'];
    (gastosPorProp[propiedad] || []).forEach(row => {
      const categoria = (row[idxGastos['categoria']] || '').toLowerCase().trim();
      const tag = iTag != null && iTag >= 0 ? String(row[iTag] || '').toLowerCase().trim() : '';
      if (TAGS_NO_COBRABLES[tag] && categoria !== 'otro ingreso') return;
      const valor = safeNumber(row[idxGastos['valor']]) / tasaCambio;
      if (categoria === 'insumos & gastos') {
        insumosYGastos += valor;
      } else if (categoria === 'reparaciones o inversión') {
        reparaciones += valor;
      } else if (categoria === 'otro ingreso') {
        otrosIngresos2 += valor;
      }
    });

    // ✅ Estadía propietario y Costo de oportunidad
    const estadiasPropietario = entradasFiltradas.filter(r => safeNumber(r[idx['base_amount']]) === 0);
    const cleaningPropietario = estadiasPropietario.reduce((sum, r) => sum + safeNumber(r[idx['cleaning_fee']]), 0);
    const nochesPropietario = estadiasPropietario.reduce((sum, r) => sum + safeNumber(r[idx['nights']]), 0);
    const costoOportunidad = nochesPropietario * precioProm;

    // ✅ Nueva lógica de AJUSTE basada en noches con base_amount = 0
    const ajuste = nochesPropietario;

    // ✅ Cleaning fee pagado directo al socio (SETUP → columna CLEANING_SOCIO = SI).
    //    Ej.: Likin, Monterrico. Se suma al neto SOLO el cleaning de reservas con
    //    ingreso (las estadías del propietario no cobran cleaning al huésped).
    const cleaningASocio = !!filaPropSetup &&
      (filaPropSetup[idxSetup['cleaning_socio']] || '').toString().toUpperCase().trim() === 'SI';
    const cleaningSocio = cleaningASocio
      ? reservasConIngreso.reduce((sum, r) => sum + safeNumber(r[idx['cleaning_fee']]), 0)
      : 0;

    // ✅ Ingreso Neto ajustado
    const ingresoNeto = ingresoBruto - insumosYGastos - reparaciones - feeSpacio - cleaningPropietario + ivaSocios + otrosIngresos2 + cleaningSocio;

    // ✅ Retención (5% sobre la base sin IVA del neto) — solo si la propiedad la tiene
    const tieneRetencion = !!filaPropSetup &&
      (filaPropSetup[idxSetup['retencion']] || '').toString().toUpperCase().trim() === 'SI';
    const retencion = tieneRetencion ? (ingresoNeto / 1.12) * 0.05 : 0;

    // ✅ Ingreso Neto 2 (Depósito) = Ingreso Neto − Retención.
    //    Se deja en blanco si la propiedad NO tiene retención (el dashboard
    //    usa el Ingreso Neto normal en ese caso).
    const ingresoNeto2 = tieneRetencion ? (ingresoNeto - retencion) : '';

    const ocupacion = diasDelMes > 0 ? noches / diasDelMes : 0;
    const ocupacionAjustada = (diasDelMes - ajuste) > 0 ? noches / (diasDelMes - ajuste) : 0;

    const resumen = [
      entradasFiltradas[0][idx['usuario_id']],
      propiedad,
      mesBusqueda,
      noches,
      estadias,
      ingresoBruto,
      ivaTotal,
      ivaSocios,
      hostServiceFee,
      feeSpacio,
      insumosYGastos,
      reparaciones,
      ingresoNeto,
      leadTimeProm,
      cleaningFee,
      estadiaProm,
      precioProm,
      ocupacion,
      ocupacionAjustada,
      otrosIngresos2,
      cleaningPropietario,
      costoOportunidad,
      ingresoNeto2,        // Columna W
      nochesPropietario,   // Columna X
      cleaningSocio        // Columna Y
    ];

    resultados.push(resumen);
  });

  const encabezados = [
    "Usuario ID", "Property_name", "Mes", "Noches", "Estadías", "Ingreso Bruto", "IVA Total",
    "IVA Socios", "Host Service Fee", "Fee Spacio", "Insumos & Gastos", "Reparaciones",
    "Ingreso Neto", "Lead Time Prom", "Cleaning Fee", "Estadía Prom", "Precio Prom",
    "Ocupación", "Ocupación Ajustada", "Otros ingresos", "Estadía propietario", "Costo de oportunidad",
    "Ingreso Neto 2", "Noches propietario", "Cleaning socio"
  ];

  return { encabezados: encabezados, resultados: resultados, mesBusqueda: mesBusqueda };
}
