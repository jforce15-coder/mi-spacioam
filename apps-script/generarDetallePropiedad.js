function generarDetallePropiedad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaDB = ss.getSheetByName("DATABASE");
  const hojaResumen = ss.getSheetByName("Resumenconsolidado");
  const hojaDetalle = ss.getSheetByName("detallepropiedad");

  const mesFiltro = hojaDetalle.getRange("C1").getValue();
  const propiedadFiltro = normalize(hojaDetalle.getRange("E1").getValue());
  const tipoCambio = Number(hojaDetalle.getRange("G1").getValue());

  const datosDB = hojaDB.getDataRange().getValues();
  const headersDB = datosDB.shift();
  const idx = {};
  headersDB.forEach((h, i) => idx[h.trim().toLowerCase()] = i);

  const datosResumen = hojaResumen.getDataRange().getValues();
  const headersResumen = datosResumen.shift();
  const idxResumen = {};
  headersResumen.forEach((h, i) => idxResumen[h.trim().toLowerCase()] = i);

  const dateObj = new Date(mesFiltro + "-01");
  const mesTexto = dateObj.toLocaleString("es-ES", { month: "long", year: "numeric" }).toLowerCase();

  const datosFiltrados = datosDB.filter(r => {
    const status = (r[idx["status"]] || "").toLowerCase().trim();
    const property = normalize(r[idx["property_name"]] || "");
    const checkinDate = r[idx["checkin_date"]];
    if (!(checkinDate instanceof Date)) return false;

    const yearMonth = checkinDate.getFullYear() + "-" + String(checkinDate.getMonth() + 1).padStart(2, '0');
    return (
      status === "accepted" &&
      property === propiedadFiltro &&
      yearMonth === mesFiltro &&
      Number(r[idx["ingreso_bruto"]]) !== 0
    );
  });

  hojaDetalle.getRange("B5:Z1000").clearContent().clearFormat();
  hojaDetalle.getRange("B5:Z1000").setHorizontalAlignment("center");

  const setEstiloBloque = (rango, tipo) => {
    switch (tipo) {
      case "encabezado":
        rango.setBackground("#F5F3F0").setFontWeight("bold");
        break;
      case "totales":
        rango.setBackground("#E6E1DC").setFontWeight("bold");
        break;
      case "valores":
        rango.setBackground("#FAFAFA");
        break;
    }
  };

  if (datosFiltrados.length === 0) {
    hojaDetalle.getRange("B5").setValue("Sin resultados");
    return;
  }

  let fila = 5;

  const crearBloque = (datos, titulo, mostrarEncabezados = false, incluirNoches = false) => {
    if (mostrarEncabezados) {
      const encabezadoRango = hojaDetalle.getRange(fila, 2, 1, 4);
      encabezadoRango.setValues([["Fechas", "Noches", "USD", "GTQ"]]);
      setEstiloBloque(encabezadoRango, "encabezado");
      fila++;
    }

    let totalUSD = 0;
    let totalNoches = 0;

    datos.forEach(r => {
      const noches = incluirNoches ? Number(r.noches) : "";
      const usd = Number(r.usd);
      const gtq = usd * tipoCambio;

      const filaRango = hojaDetalle.getRange(fila, 2, 1, 4);
      filaRango.setValues([[r.fechas, noches, usd, gtq]]);
      filaRango.setHorizontalAlignment("center");
      if (incluirNoches) hojaDetalle.getRange(fila, 3).setNumberFormat("0");
      hojaDetalle.getRange(fila, 4, 1, 2).setNumberFormat("#,##0.00");
      setEstiloBloque(filaRango, "valores");

      fila++;
      totalUSD += usd;
      if (incluirNoches) totalNoches += Number(r.noches);
    });

    const totalGTQ = totalUSD * tipoCambio;
    const totalRango = hojaDetalle.getRange(fila, 2, 1, 4);
    totalRango.setValues([[titulo, incluirNoches ? totalNoches : "", totalUSD, totalGTQ]]);
    totalRango.setHorizontalAlignment("center");
    totalRango.setFontWeight("bold");
    totalRango.getCell(1, 3).setNumberFormat("#,##0.00");
    totalRango.getCell(1, 4).setNumberFormat("#,##0.00");
    if (incluirNoches) totalRango.getCell(1, 2).setNumberFormat("0");
    setEstiloBloque(totalRango, "totales");

    fila += 3;
  };

  const mapData = campoUSD =>
    datosFiltrados.map(r => ({
      fechas: r[idx["fechas resum"]],
      noches: r[idx["nights"]],
      usd: r[idx[campoUSD]]
    }));

  /* 🔹 CAMBIO 1 */
  crearBloque(
    datosFiltrados.map(r => ({
      fechas: r[idx["fechas resum"]],
      noches: r[idx["nights"]],
      usd: Number(r[idx["ingreso_bruto"]]) + Number(r[idx["fee_plataforma_socio"]])
    })),
    "Ingresos",
    true,
    true
  );

  /* 🔹 CAMBIO 2 */
  crearBloque(mapData("fee_plataforma_socio"), "Fee de plataforma");
  crearBloque(mapData("ingreso_bruto"), "Ingreso Bruto");

  const filaResumen = datosResumen.find(r =>
    normalize(r[idxResumen["property_name"]]) === propiedadFiltro &&
    (r[idxResumen["mes"]] || "").toString().toLowerCase().trim() === mesTexto
  );

  if (!filaResumen) return;

  const getValorResumen = campo => {
    const i = idxResumen[campo.toLowerCase()];
    return i !== undefined ? Number(filaResumen[i]) || 0 : 0;
  };

  const writeFilaResumen = (label, valor) => {
    const gtq = valor * tipoCambio;
    const filaRango = hojaDetalle.getRange(fila, 2, 1, 4);
    filaRango.setValues([[label, "", valor, gtq]]);
    filaRango.setHorizontalAlignment("center");
    filaRango.getCell(1, 3).setNumberFormat("#,##0.00");
    filaRango.getCell(1, 4).setNumberFormat("#,##0.00");
    setEstiloBloque(filaRango, "totales");
    fila++;
  };

  writeFilaResumen("Fee Spacio AM", getValorResumen("fee spacio"));
  writeFilaResumen("Insumos & gastos", getValorResumen("insumos & gastos"));
  writeFilaResumen("Reparaciones o inversión", getValorResumen("reparaciones"));

  // ✅ NUEVO (antes de Ingreso neto)
  writeFilaResumen("Otros ingresos", getValorResumen("otros ingresos 2"));

  writeFilaResumen("Ingreso neto", getValorResumen("ingreso neto"));

  fila += 10;

  /* 🔹 CAMBIO 3 */
  crearBloque(
    datosFiltrados.map(r => ({
      fechas: r[idx["fechas resum"]],
      noches: "",
      usd: Number(r[idx["cleaning_fee"]]) + Number(r[idx["diferencia_fee"]])
    })),
    "Cleaning fee"
  );

  crearBloque(mapData("pass_through_taxes"), "IVA total recaudado");

  /* 🔹 CAMBIO 4 */
  hojaDetalle.getRange("G6:H6").merge().setValue("% Ocupación").setBackground("#E6E1DC").setFontWeight("bold").setHorizontalAlignment("center");
  hojaDetalle.getRange("G7:H8").merge().setValue(getValorResumen("ocupación ajustada")).setNumberFormat("0.00%").setBackground("#FAFAFA").setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  /* 🔹 CAMBIO 5 */
  hojaDetalle.getRange("G11:H11").merge().setValue("Costo de oportunidad").setBackground("#E6E1DC").setFontWeight("bold").setHorizontalAlignment("center");
  hojaDetalle.getRange("G12:H13").merge().setValue(getValorResumen("costo de oportunidad")).setNumberFormat("#,##0.00").setBackground("#FAFAFA").setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
}

function normalize(s) {
  return (s || "").toString().toLowerCase().replace(/\s+/g, "").trim();
}
