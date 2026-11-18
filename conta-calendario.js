// Spacio AM — Contabilidad · calendario contable (lo que acordamos con Patricia Ruano, contadora)
// • Retenciones: el noveno día hábil de cada mes.
// • Movimientos bancarios: el segundo lunes de cada mes.
// Día hábil = lunes a viernes que no es feriado en Guatemala (1 ene, Jueves y Viernes Santo, 1 may, 30 jun,
// 15 sep, 20 oct, 1 nov y 25 dic). Para agregar una fecha nueva, súmala a FECHAS con su regla.
(function () {
  "use strict";
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const clave = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

  // Domingo de Pascua (algoritmo gregoriano anónimo)
  function pascua(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }
  function feriados(y) {
    const p = pascua(y), menos = (n) => new Date(y, p.getMonth(), p.getDate() - n);
    const set = {};
    [new Date(y, 0, 1), menos(3), menos(2), new Date(y, 4, 1), new Date(y, 5, 30), new Date(y, 8, 15),
      new Date(y, 9, 20), new Date(y, 10, 1), new Date(y, 11, 25)].forEach((d) => { set[clave(d)] = 1; });
    return set;
  }
  function esHabil(d) {
    const w = d.getDay();
    return w !== 0 && w !== 6 && !feriados(d.getFullYear())[clave(d)];
  }
  // n-ésimo día hábil del mes (m = 0..11)
  function diaHabil(y, m, n) {
    let d = new Date(y, m, 1), c = 0;
    for (;;) { if (esHabil(d) && ++c === n) return d; d = new Date(y, m, d.getDate() + 1); }
  }
  // n-ésimo día de la semana del mes (w: 0 domingo … 1 lunes)
  function nesimoDia(y, m, w, n) {
    const primero = new Date(y, m, 1), salto = (w - primero.getDay() + 7) % 7;
    return new Date(y, m, 1 + salto + 7 * (n - 1));
  }

  const FECHAS = [
    { id: "retenciones", titulo: "Retenciones", regla: "Noveno día hábil de cada mes", en: "9th business day of each month",
      fecha: (y, m) => diaHabil(y, m, 9) },
    { id: "movimientos", titulo: "Movimientos bancarios", regla: "Segundo lunes de cada mes", en: "2nd Monday of each month",
      fecha: (y, m) => nesimoDia(y, m, 1, 2) },
  ];

  // La próxima fecha de cada regla desde hoy (si la de este mes ya pasó, la del mes que viene)
  function proximas(hoy) {
    hoy = hoy || new Date();
    const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return FECHAS.map((f) => {
      let d = f.fecha(h0.getFullYear(), h0.getMonth());
      if (d < h0) d = f.fecha(h0.getMonth() === 11 ? h0.getFullYear() + 1 : h0.getFullYear(), (h0.getMonth() + 1) % 12);
      return Object.assign({}, f, { proxima: d, dias: Math.round((d - h0) / 86400000) });
    });
  }

  window.SpacioContaCalendario = { FECHAS, proximas, diaHabil, nesimoDia, esHabil };
})();
