function limpiarYActualizarDatabase() { 
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DATABASE");
  const datos = hoja.getDataRange().getValues();

  // 1. Eliminar filas completamente vacías
  for (let i = datos.length - 1; i >= 1; i--) {
    const fila = datos[i];
    if (fila.every(valor => valor === "")) {
      hoja.deleteRow(i + 1);
    }
  }

  // 2. Eliminar filas donde columnas C (3) o F (6) estén vacías
  const datosActualizados = hoja.getDataRange().getValues();
  for (let i = datosActualizados.length - 1; i >= 1; i--) {
    const c = datosActualizados[i][2]; // Columna C
    const f = datosActualizados[i][5]; // Columna F
    if (!c || !f) {
      hoja.deleteRow(i + 1);
    }
  }

  // 3. Detectar última fila con datos reales
  const valoresColumnaC = hoja.getRange("C:C").getValues();
  let ultimaFila = valoresColumnaC.findIndex((fila, idx) => {
    return idx > 1 && (!fila[0] || fila[0].toString().trim() === "");
  });
  if (ultimaFila === -1) ultimaFila = hoja.getLastRow();

  // 4. Columnas a extender: A(1), B(2), AQ(43), AR(44), AS(45), AT(46), AU(47), AV(48)
  const columnas = [1, 2, 43, 44, 45, 46, 47, 48];
  columnas.forEach(col => {
    const formulaR1C1 = hoja.getRange(3, col).getFormulaR1C1(); // ← Notación R1C1
    if (formulaR1C1) {
      const rango = hoja.getRange(4, col, ultimaFila - 3); // desde fila 4
      rango.setFormulaR1C1(formulaR1C1); // ← Usa notación R1C1 para pegarla correctamente
    }
  });

  // 5. Ordenar por columna C (col 3) de menor a mayor
  hoja.getRange(4, 1, ultimaFila - 3, hoja.getLastColumn())
      .sort({ column: 3, ascending: true });
}

// Antes había aquí un doGet() que ejecutaba esta limpieza: lo usaba n8n. Pisaba al doGet de
// Escrituradesdeapp.js, y como el web app es público, cualquiera que abriera la URL borraba filas
// de DATABASE. La limpieza diaria sigue corriendo desde Actualizacion.js (hsp_limpiarYExtenderFormulas_).
