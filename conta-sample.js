// ============================================================
// Spacio AM — Contabilidad · muestra de ejemplo (Abril 2026 real, subconjunto)
// Permite ver la pestaña poblada sin subir PDFs. El admin puede borrarla.
// ============================================================
(function () {
  "use strict";
  // memo, debe, haber, saldo  (clasificación se calcula con SpacioConta.classify)
  const OP_GTQ = [
    ["01-04-2026", "136073", "Epi ajuste", 75, 0, 2215.05],
    ["02-04-2026", "11789", "BANCA MOVIL", 0, 7460, 9675.05],
    ["06-04-2026", "139668", "Tokens 311", 25, 0, 9650.05],
    ["06-04-2026", "139673", "Fiamene 404 mar 2026", 3730, 0, 5920.05],
    ["06-04-2026", "171370", "Software y gastos operativos varios", 11667, 0, -5746.95],
    ["07-04-2026", "13352", "BBWEB entre cuantas", 0, 60240, 54493.05],
    ["08-04-2026", "93808", "MODRA 1108 MAR 2026", 5229.92, 0, 49263.13],
    ["09-04-2026", "122073", "Renta 311", 5000, 0, 44263.13],
    ["09-04-2026", "228260", "Caren 30 mar al 5 abr 2026", 1275, 0, 42988.13],
    ["11-04-2026", "11182661", "BI-APP P/ELECTRONICO 5280073181301", 8542.41, 0, 34445.72],
    ["13-04-2026", "203934", "Pintura Narama 633", 300, 0, 34145.72],
    ["15-04-2026", "193621", "Salario menos adelanto 100 2 de 5", 1489.11, 0, 32656.61],
    ["22-04-2026", "991153", "PAGOS DE IMPUESTOS DECLARAGUATE", 1447.28, 0, 31209.33],
    ["27-04-2026", "113125", "Contabilidad", 950, 0, 30259.33],
    ["09-04-2026", "202294", "Reparacion chapa Brunelo 1808", 500, 0, 29759.33],
    ["23-04-2026", "194976", "Luces y jardin", 300, 0, 29459.33],
    ["29-04-2026", "96465", "Compra repuesto desconocido proveedor X", 1240, 0, 28219.33],
  ];
  const OP_USD = [
    ["06-04-2026", "175405", "INTERNACIONAL", 0, 24990, 27977.22],
    ["08-04-2026", "96616", "Brunelo 705 Mar 2026", 932.79, 0, 27044.43],
    ["08-04-2026", "138879", "Inara 412 Mar 2026", 570.17, 0, 26474.26],
    ["09-04-2026", "172854", "Centro vivo Mar 2026", 3076.30, 0, 23397.96],
    ["11-04-2026", "11133211", "BI-APP P/ELECTRONICO 4042590010244", 2074.99, 0, 21322.97],
    ["14-04-2026", "17030", "Transferencia a socio por mediación especial", 800, 0, 20522.97],
  ];
  const PR_GTQ = [
    ["21-04-2026", "21189442", "ANTE PROYECTO PARQUE 14 TORRE A", 0, 1500, 2938.32],
    ["24-04-2026", "139312", "Uniformes", 2450, 0, 488.32],
    ["25-04-2026", "25219622", "MOBILIARIO EQUIPO Y FOTOS CASA IGNA", 0, 6888, 7376.32],
  ];

  function build(accId, currency, raw) {
    const C = window.SpacioConta;
    const rows = raw.map((a, i) => {
      const cls = C.classify(a[2]);
      return {
        date: a[0].split("-").reverse().join("-"), dateBI: a[0], doc: a[1], desc: a[2],
        debit: a[3], credit: a[4], saldo: a[5], tt: a[4] > 0 ? "NC" : "ND",
        tag: cls.tag, category: cls.category, source: cls.source, reviewed: false,
      };
    });
    return { ym: "2026-04", accId, currency, rows, pdf: null };
  }

  window.SpacioContaSample = {
    load: function () {
      if (!window.SpacioConta || !window.SpacioContaStore) return;
      [["op-gtq", "GTQ", OP_GTQ], ["op-usd", "USD", OP_USD], ["pr-gtq", "GTQ", PR_GTQ]].forEach(s => {
        window.SpacioContaStore.saveStatement(build(s[0], s[1], s[2]));
      });
    },
  };
})();
