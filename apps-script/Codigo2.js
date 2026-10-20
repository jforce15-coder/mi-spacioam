/**
 * BACKFILL — Spacio AM
 * Recorre varios meses hacia atrás, ejecuta generarResumenMensual() para cada uno
 * y AGREGA (append) el resultado a la pestaña "Resumenconsolidado".
 *
 * Cómo usarlo:
 *   1. Pega este archivo junto a tu código.gs (NO lo reemplaza).
 *   2. Ejecuta backfill() UNA sola vez desde el editor de Apps Script.
 *
 * Rango configurado: enero 2025 → junio 2025 (julio 2025 ya está consolidado).
 */

const CONFIG = {
  HOJA_RESUMEN: 'Resumen',
  HOJA_CONSOLIDADO: 'Resumenconsolidado',
  ANIO_INICIO: 2025,
  MES_INICIO: 1,   // enero
  ANIO_FIN: 2025,
  MES_FIN: 6,      // junio (inclusive)
  PRIMERA_FILA_DATOS: 6,
  NUM_COLUMNAS: 22 // columnas A a V
};

function backfill() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaResumen = ss.getSheetByName(CONFIG.HOJA_RESUMEN);
  const hojaConsolidado = ss.getSheetByName(CONFIG.HOJA_CONSOLIDADO);

  if (!hojaResumen) throw new Error('❌ No existe la hoja "' + CONFIG.HOJA_RESUMEN + '"');
  if (!hojaConsolidado) throw new Error('❌ No existe la hoja "' + CONFIG.HOJA_CONSOLIDADO + '"');

  // Construye la lista de meses del más antiguo al más reciente
  const meses = [];
  let a = CONFIG.ANIO_INICIO, m = CONFIG.MES_INICIO;
  while (a < CONFIG.ANIO_FIN || (a === CONFIG.ANIO_FIN && m <= CONFIG.MES_FIN)) {
    meses.push(a + '-' + m);
    m++;
    if (m > 12) { m = 1; a++; }
  }

  const log = [];

  meses.forEach(mesKey => {
    // 1. Escribe el mes en C1
    hojaResumen.getRange('C1').setValue(mesKey);
    SpreadsheetApp.flush();

    // 2. Ejecuta tu cálculo existente
    generarResumenMensual();
    SpreadsheetApp.flush();

    // 3. Lee la fila 6 en adelante (A:V)
    const ultimaFila = hojaResumen.getLastRow();
    const numFilas = ultimaFila - CONFIG.PRIMERA_FILA_DATOS + 1;

    if (numFilas <= 0) {
      log.push(mesKey + ' → 0 filas (sin reservas), omitido');
      return;
    }

    const datos = hojaResumen
      .getRange(CONFIG.PRIMERA_FILA_DATOS, 1, numFilas, CONFIG.NUM_COLUMNAS)
      .getValues();

    // Descarta filas totalmente vacías por seguridad
    const datosLimpios = datos.filter(fila =>
      fila.some(celda => celda !== '' && celda !== null)
    );

    if (datosLimpios.length === 0) {
      log.push(mesKey + ' → 0 filas con datos, omitido');
      return;
    }

    // 4. Agrega al consolidado en filas nuevas vacías
    const destino = hojaConsolidado.getLastRow() + 1;
    hojaConsolidado
      .getRange(destino, 1, datosLimpios.length, CONFIG.NUM_COLUMNAS)
      .setValues(datosLimpios);

    // Replica el formato de % de Ocupación/Ocupación Ajustada (columnas R y S = 18 y 19)
    hojaConsolidado
      .getRange(destino, 18, datosLimpios.length, 2)
      .setNumberFormat('0.00%');

    SpreadsheetApp.flush();
    log.push(mesKey + ' → ' + datosLimpios.length + ' filas agregadas (fila ' + destino + ')');
  });

  Logger.log('✅ Backfill completado:\n' + log.join('\n'));
  SpreadsheetApp.getUi().alert('✅ Backfill completado:\n\n' + log.join('\n'));
}