// ============================================================
// Spacio AM — Contabilidad · carga EN VIVO de la clasificación 2026
// ------------------------------------------------------------
// Cada mes de 2026 tiene su propio Google Sheet "Reporte financiero"
// en Drive, con 4 pestañas de detalle (una por cuenta) que ya traen
// la clasificación humana (columnas "Descripción" = Tag y
// "Descripción 2" = Categoría).
//
// Este módulo descarga ese workbook como XLSX (el endpoint /export
// permite CORS), lo parsea con SheetJS (ya cargado en el dashboard)
// y entrega los movimientos clasificados al almacén de contabilidad.
// Así el contador ve el detalle de meses anteriores SIN que el admin
// tenga que subir nada, y se actualiza solo cuando cambia la hoja.
//
// Se cachea en localStorage para que cargue al instante / offline.
// Para añadir un mes nuevo: agrega el ID de su Google Sheet a SHEET_IDS.
// (El mes real se deduce de las fechas del propio detalle, no del
//  título ni de la pestaña MENU, que a veces quedan desactualizados.)
// ============================================================
(function () {
  "use strict";

  // IDs de los Google Sheets mensuales de 2026 (Ene–Abr ya clasificados).
  // Mayo 2026 todavía no tiene hoja de clasificación (solo PDFs).
  const SHEET_IDS = [
    "18YhzDDHUsKfYqIG28bwKLNLhrnL7p8fR67NS08WAEmM", // Enero
    "1-HMc2ilkuQVNNpRmrgMht6r01m9rcrGtij5g5lHe16s", // Febrero
    "1gX0l_VhgggwK0Uja0cOIbM_x3rEg32qw-ijUJMMMl-8", // Marzo
    "1zUumdnhVSnLQ-JwptD858i4p8Ujl3YxpgLzK2Sp3I-g", // Abril
  ];

  const ACC_BY_NUMBER = { "0160186466": "op-gtq", "0160186508": "op-usd", "0160186474": "pr-gtq", "0160186482": "pr-usd" };
  const CUR_BY_ACC = { "op-gtq": "GTQ", "op-usd": "USD", "pr-gtq": "GTQ", "pr-usd": "USD" };

  // ---- Mayo 2026: sin hoja de clasificación todavía → detalle horneado
  //      desde los 4 PDFs del banco, autoclasificado para que el admin lo
  //      revise EN la plataforma. Filas: [fecha, doc, descripción, debe, haber, saldo].
  //      (pr-usd no tuvo movimientos en mayo 2026.)
  const MAY2026_RAW = {"op-gtq":[["2026-05-04","126264","Tokens 311",25,0,7060.26],["2026-05-04","142849","Tokens 1508",25,0,7035.26],["2026-05-04","159489","Tokens 1012",25,0,7010.26],["2026-05-04","170681","Tokens 1508",25,0,6985.26],["2026-05-04","170682","Noelia hasta 24 abr",1070,0,5915.26],["2026-05-04","170683","Parking Narama",320,0,5595.26],["2026-05-04","243861","Tokens 311",25,0,5570.26],["2026-05-05","119290","Trabajo casco",125,0,5445.26],["2026-05-05","202957","Salario menos adelanto 100 3 de 5",1489.11,0,3956.15],["2026-05-05","209292","Chapa brunelo 1808",1800,0,2156.15],["2026-05-05","209313","Reparacion aire Narama 623 y secado",2100,0,56.15],["2026-05-06","129903","Tokens 1508",25,0,31.15],["2026-05-07","192083","Tokens 311",25,0,6.15],["2026-05-08","29747","BANCA MOVIL",0,52430,52436.15],["2026-05-08","163121","Tokens 633",25,0,52411.15],["2026-05-08","174425","coloniales i09 Abril 2026",8792.99,0,43618.16],["2026-05-08","176510","Ajustes Epi",225,0,43393.16],["2026-05-08","215751","Lilia 27 abr al 3 mayo 2026 DIOS TE",850,0,42543.16],["2026-05-08","215758","Mirla 27 abr al 3 mayo 2026 DIOS TE",825,0,41718.16],["2026-05-08","215937","Fiamene 404 abr 2026",3635.62,0,38082.54],["2026-05-08","229040","Joselyn 27 abr al 3 may 2026 DIOS T",300,0,37782.54],["2026-05-08","229053","Ajustes EPI",300,0,37482.54],["2026-05-08","237014","Ajustes EPI",102,0,37380.54],["2026-05-08","237027","Caren 27 abr al 3 may 2026 DIOS TE",600,0,36780.54],["2026-05-08","241469","Ajustes EPI",220,0,36560.54],["2026-05-08","241473","Jackeline 27 abr al 3 may 2026 DIOS",675,0,35885.54],["2026-05-08","241481","Sucely 27 abr al 3 may 2026 DIOS TE",825,0,35060.54],["2026-05-08","253931","Ajustes EPI",206.28,0,34854.26],["2026-05-08","8152189","BANCA MOVIL",5179,0,29675.26],["2026-05-11","107172","renta Modra 311",5000,0,24675.26],["2026-05-11","200817","Parqueo ATOM",700,0,23975.26],["2026-05-11","200818","Modra 1108 abr 2026",5853.75,0,18121.51],["2026-05-11","200819","Baldone 1010 abr 2026",9460.31,0,8661.2],["2026-05-11","200820","Marzo y abril epi antigua",3900,0,4761.2],["2026-05-11","200821","Tokens 1508",25,0,4736.2],["2026-05-11","200822","EON 901 ABR 2026",4160.17,0,576.03],["2026-05-13","185488","Narama 1012",25,0,551.03],["2026-05-13","185490","Tokens 1508",25,0,526.03],["2026-05-15","151359","Tokens 311",25,0,501.03],["2026-05-15","189446","Tokens 1012",25,0,476.03],["2026-05-15","603180","PAGOS DE IMPUESTOS DECLARAGUATE",14.74,0,461.29],["2026-05-18","4448","BBWEB ENTRE CUENTAS",0,7420,7881.29],["2026-05-18","125381","Tokens 1508",25,0,7856.29],["2026-05-18","174423","Tokens 633 y 1012",50,0,7806.29],["2026-05-18","192002","Tokens 311 Modra",25,0,7781.29],["2026-05-19","178307","Joselyn 4 al 17 de mayo 2026 DIOS T",1200,0,6581.29],["2026-05-19","195910","Lilia 4 al 17 de mayo 2026 DIOS TE",975,0,5606.29],["2026-05-19","195915","Caren 4 al 17 de mayo 2026 DIOS TE",1050,0,4556.29],["2026-05-19","195917","Mirla 4 al 17 de mayo 2026 DIOS TE",1125,0,3431.29],["2026-05-19","195924","Jackeline 4 al 17 de mayo 2026 DIOS",1025,0,2406.29],["2026-05-19","209248","Sucely 4 al 17 de mayo 2026 DIOS TE",1575,0,831.29],["2026-05-21","156573","Tokens Narama 1012",25,0,806.29],["2026-05-22","210103","Tokens airali 1508",25,0,781.29],["2026-05-25","7745","BANCA MOVIL",0,22320,23101.29],["2026-05-25","157097","Tokens 311",25,0,23076.29],["2026-05-25","272974","Tokens 1508",25,0,23051.29],["2026-05-26","133404","Lilia 18 al 25 may 2026 DIOS TE BEN",700,0,22351.29],["2026-05-26","133417","Caren 18 al 25 may 2026 DIOS TE BEN",675,0,21676.29],["2026-05-26","133429","Mirla 18 al 25 may 2026 DIOS TE BEN",450,0,21226.29],["2026-05-26","147157","Instalacion de calentador Brunelo 9",1400,0,19826.29],["2026-05-26","147175","Agua monaco y tarjeta perdida Ignac",475,0,19351.29],["2026-05-26","147183","Joselyn 18 al 25 may 2026 DIOS TE B",750,0,18601.29],["2026-05-26","160998","Jackeline 18 al 25 may 2026 DIOS TE",825,0,17776.29],["2026-05-26","161015","Ajustes epi",125,0,17651.29],["2026-05-26","161020","Sucely 18 al 25 may 2026 DIOS TE BE",450,0,17201.29],["2026-05-26","173486","Selvin 18 al 25 mayo 2026 DIOS TE B",400,0,16801.29],["2026-05-26","173491","Flor 18 al 25 2026 DIOS TE BENDIGA",675,0,16126.29],["2026-05-26","215162","Ajustes EPI",300,0,15826.29],["2026-05-28","150537","Tokens 311",25,0,15801.29],["2026-05-28","179455","Tokens 311",25,0,15776.29]],"op-usd":[["2026-05-04","126263","Parqueo marzo",30.77,0,22592.81],["2026-05-08","29747","BANCA MOVIL",7000,0,15592.81],["2026-05-08","212989","Coloniales J5 Abril 2026",263.44,0,15329.37],["2026-05-08","213649","Brunelo 705 Abril 2026",774.15,0,14555.22],["2026-05-08","258198","Centro vivo abr 2026",3729.23,0,10825.99],["2026-05-11","107171","Narama 633 Abr 2026",474.2,0,10351.79],["2026-05-11","200810","Narama 1012 abr 2026",345.51,0,10006.28],["2026-05-11","200811","Inara 412 abr 2026",1279.4,0,8726.88],["2026-05-11","200812","Pmateo 1603 abr 2026",725.43,0,8001.45],["2026-05-11","200813","Pamplona 606 abr 2026",804.06,0,7197.39],["2026-05-11","200814","Fiamene 1102 Abr 2026",469.96,0,6727.43],["2026-05-11","200815","Brunelo 905 abr 2026",1033.48,0,5693.95],["2026-05-11","200816","Baldone 1010 abr 2026",532.46,0,5161.49],["2026-05-13","229240","Brunelo 1808 abril 2026",934.34,0,4227.15],["2026-05-14","14147121","BI-APP P/ELECTRONICO 4042590010244",645.67,0,3581.48],["2026-05-14","14174150","BI-APP P/ELECTRONICO 4042590010244",86.56,0,3494.92],["2026-05-18","4448","BBWEB ENTRE CUENTAS",1000,0,2494.92],["2026-05-18","157448","Uso de lavanderia",17,0,2477.92],["2026-05-19","134324","INTERNACIONAL",0,7990,10467.92],["2026-05-19","191346","Software y pagos varios",866.94,0,9600.98],["2026-05-25","7745","BANCA MOVIL",3000,0,6600.98],["2026-05-28","28083242","BI-APP P/ELECTRONICO 4042590010244",1473.69,0,5127.29]],"pr-gtq":[["2026-05-08","8190102","MOBILIARIO APTO A703 PARQUE 14",0,50000,50361.37],["2026-05-09","9209117","COMPLEMENTO MOBILIARIO APTO A703 PA",0,13866,64227.37],["2026-05-11","179047","Multa huespedes",1000,0,63227.37],["2026-05-11","11155607","BANCA MOVIL",5000,0,58227.37],["2026-05-11","11190896","BI-APP P/ELECTRONICO 5280073181301",4000,0,54227.37],["2026-05-11","11204358","BI-APP P/ELECTRONICO 5280073181301",301.85,0,53925.52],["2026-05-12","156533","Adelanto epi",1000,0,52925.52],["2026-05-12","12179627","BI-APP P/ELECTRONICO 5280073181301",4000,0,48925.52],["2026-05-13","13247861","DISEO",0,2000,50925.52],["2026-05-14","16499185","AGENCIA EUROPLAZA",0,50070,100995.52],["2026-05-14","16499186","AGENCIA EUROPLAZA",0,64981,165976.52],["2026-05-14","214060","ACH AUTO PARTES Y MAS D RENTA 18",0,5567.07,171543.59],["2026-05-14","14243418","PH02 Y 1004",0,4000,175543.59],["2026-05-14","137085","Fiamene 405 Abr 2026",3134.94,0,172408.65],["2026-05-14","227358","Ignacion Narama airali",1750,0,170658.65],["2026-05-14","14127361","BANCA MOVIL",4000,0,166658.65],["2026-05-14","14184246","BANCA MOVIL",2559.42,0,164099.23],["2026-05-15","250019","Salario menos adelanto 100 4 de 5",1489.11,0,162610.12],["2026-05-15","866435","PAGOS DE IMPUESTOS DECLARAGUATE",3158.44,0,159451.68],["2026-05-18","191997","Epi antigua hasta 17 May 2026",612.5,0,158839.18],["2026-05-18","18164418","BANCA MOVIL",8000,0,150839.18],["2026-05-19","121133","ACH CORPORACION SOL SO INVERSION I",0,37048.3,187887.48],["2026-05-19","101572","Muebles 703 parque 14",3510,0,184377.48],["2026-05-19","191353","Servicios varios casas",5982.48,0,178395],["2026-05-19","209285","Ajustes EPI",445,0,177950],["2026-05-20","175907","Ajustes Epi",200,0,177750],["2026-05-20","175916","Ajustes Epi",225,0,177525],["2026-05-20","20180628","BI-APP P/ELECTRONICO 5280073181301",8000,0,169525],["2026-05-21","157683","Igss",743.76,0,168781.24],["2026-05-26","192729","6 colchones",12600,0,156181.24],["2026-05-27","219088","ACH GABRIEL ASTURIAS MOR A",0,663,156844.24],["2026-05-27","133612","P14 703",2595,0,154249.24],["2026-05-27","192177","Colchon 1105",2100,0,152149.24],["2026-05-27","232223","P14 703",3510,0,148639.24],["2026-05-28","28086116","BI-APP P/ELECTRONICO 4042590010244",966.32,0,147672.92],["2026-05-29","196202","ACH KATHLEEN.MICHELL RENTA.C4",0,1850,149522.92],["2026-05-29","172194","Base de camas",3600,0,145922.92],["2026-05-29","187478","Cabecera p14 703",799,0,145123.92],["2026-05-29","190935","Reparacion puertas centro vivo",3675,0,141448.92],["2026-05-29","29149111","BANCA MOVIL",3000,0,138448.92],["2026-05-30","162875","ACH ALLAN FERNANDO MIGUEL GyTACHIFT",0,2000,140448.92]]};
  function buildMay2026() {
    const C = window.SpacioConta; if (!C) return [];
    const out = [];
    Object.keys(MAY2026_RAW).forEach(accId => {
      const rows = (MAY2026_RAW[accId] || []).map(a => {
        const memo = a[2];
        const cls = C.classify(memo, { accId: accId });
        let category = cls.tag ? (cls.category || C.categoryForTag(cls.tag) || "") : "";
        return {
          date: a[0], doc: a[1], desc: memo,
          debit: a[3], credit: a[4], saldo: a[5],
          tt: a[4] > 0 ? "NC" : "ND",
          tag: cls.tag || "", category: category,
          source: cls.tag ? "auto" : null, reviewed: false,
        };
      });
      if (rows.length) out.push({ ym: "2026-05", accId: accId, currency: CUR_BY_ACC[accId] || "GTQ", rows: rows, fromSheet: false, baked: true, savedAt: Date.now() });
    });
    return out;
  }

  const CACHE_PREFIX = "sa-conta-live-";
  const INDEX_KEY = "sa-conta-live-index";

  const cache = {};                  // "ym|accId" -> statement
  const keyOf = (ym, accId) => ym + "|" + accId;

  function num(v) {
    if (typeof v === "number") return v;
    const s = String(v == null ? "" : v).replace(/[^0-9.\-]/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Parsea un workbook (ArrayBuffer) -> [{ ym, accId, currency, rows, fromSheet }]
  function parseWorkbook(buf) {
    if (!window.XLSX) return [];
    const wb = window.XLSX.read(buf, { type: "array" });
    const out = [];
    wb.SheetNames.forEach(nm => {
      const ws = wb.Sheets[nm];
      const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
      if (!aoa.length) return;
      // ¿qué cuenta es esta pestaña? -> buscar el número de cuenta en las primeras filas
      const head = JSON.stringify(aoa.slice(0, 4));
      const am = head.match(/016018(6466|6508|6474|6482)/);
      if (!am) return;                       // MENU / referencia / resumen → ignorar
      const accId = ACC_BY_NUMBER["016018" + am[1]];
      // fila de encabezados: la que tiene la celda "TT"
      let hr = -1;
      for (let i = 0; i < Math.min(aoa.length, 8); i++) {
        if ((aoa[i] || []).some(c => String(c).trim() === "TT")) { hr = i; break; }
      }
      if (hr < 0) return;
      const header = (aoa[hr] || []).map(c => String(c).trim());
      const iTT = header.findIndex(c => c === "TT");
      if (iTT < 0) return;
      // Las pestañas no son uniformes: algunas duplican "Saldo", parten
      // "No. Doc" / "Debe (USD)" en celdas, o dejan la categoría vacía.
      // Detectamos columnas por encabezado (con respaldo posicional).
      const find = (re, from) => { for (let j = (from || 0); j < header.length; j++) { if (re.test(header[j])) return j; } return -1; };
      let iDate = find(/fecha/i); if (iDate < 0) iDate = iTT - 1;
      let iMemo = find(/descripci/i, iTT + 1); if (iMemo < 0) iMemo = iTT + 1;
      let iDoc = find(/doc/i); if (iDoc < 0) iDoc = iTT + 2;
      let iDebe = find(/debe/i); if (iDebe < 0) iDebe = iTT + 3;
      let iHaber = find(/haber/i); if (iHaber < 0) iHaber = iTT + 4;
      let iSaldo = find(/saldo/i); if (iSaldo < 0) iSaldo = iTT + 5;   // PRIMER "Saldo" = saldo real
      const iCat = find(/descripci.n\s*2/i);                          // categoría (solo cuentas operativas)
      const iTag = iSaldo + 1;                                        // columna de clasificación (Tag)
      const C = window.SpacioConta;

      const rows = [];
      const tally = {};
      for (let i = hr + 1; i < aoa.length; i++) {
        const r = aoa[i] || [];
        const dRaw = String(r[iDate] == null ? "" : r[iDate]).trim();
        const dm = dRaw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
        if (!dm) continue;                   // totales / listas de referencia / filas vacías → fuera
        const dd = dm[1].padStart(2, "0"), mm = dm[2].padStart(2, "0"), yyyy = dm[3];
        if (+yyyy < 2022 || +yyyy > 2030 || +mm < 1 || +mm > 12) continue;
        const memo = String(r[iMemo] || "").trim();
        let tag = String(r[iTag] || "").trim();
        let category = iCat >= 0 ? String(r[iCat] || "").trim() : "";
        let source = tag ? "sheet" : null;
        if (!tag && C) {                     // la hoja lo dejó en blanco → autoclasifica
          const cls = C.classify(memo, { accId: accId });
          if (cls.tag) { tag = cls.tag; if (!category) category = cls.category; source = "auto"; }
        }
        if (tag && !category && C) category = C.categoryForTag(tag) || "";
        rows.push({
          date: yyyy + "-" + mm + "-" + dd,
          doc: String(r[iDoc] || "").trim(),
          desc: memo,
          debit: num(r[iDebe]), credit: num(r[iHaber]), saldo: num(r[iSaldo]),
          tt: String(r[iTT] || "").trim(),
          tag: tag, category: category,
          source: source, reviewed: !!tag,
        });
        const ym = yyyy + "-" + mm;
        tally[ym] = (tally[ym] || 0) + 1;
      }
      if (!rows.length) return;
      const ym = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
      out.push({ ym: ym, accId: accId, currency: CUR_BY_ACC[accId] || "GTQ", rows: rows, fromSheet: true, savedAt: Date.now() });
    });
    return out;
  }

  function hydrate() {
    let idx = [];
    try { idx = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); } catch (e) {}
    idx.forEach(k => { try { const raw = localStorage.getItem(CACHE_PREFIX + k); if (raw) cache[k] = JSON.parse(raw); } catch (e) {} });
    // hornea mayo 2026 (idempotente; solo si no hay ya una versión cacheada/real)
    ensureMay();
  }
  function persist(stmt) {
    const k = keyOf(stmt.ym, stmt.accId);
    cache[k] = stmt;
    try { localStorage.setItem(CACHE_PREFIX + k, JSON.stringify(stmt)); } catch (e) {}
    let idx = [];
    try { idx = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); } catch (e) {}
    if (idx.indexOf(k) < 0) { idx.push(k); try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch (e) {} }
  }

  let loading = false, loadedThisSession = false;
  async function load(onUpdate) {
    if (loading || loadedThisSession) { if (onUpdate) onUpdate(); return; }
    loading = true;
    for (const id of SHEET_IDS) {
      try {
        const url = "https://docs.google.com/spreadsheets/d/" + id + "/export?format=xlsx";
        const r = await fetch(url);
        if (!r.ok) continue;
        const buf = await r.arrayBuffer();
        const stmts = parseWorkbook(buf);
        let changed = false;
        stmts.forEach(s => { persist(s); changed = true; });
        if (changed && onUpdate) onUpdate();
      } catch (e) { /* offline o bloqueado → conservamos el cache */ }
    }
    loading = false; loadedThisSession = true;
    if (onUpdate) onUpdate();
  }

  function getStatement(ym, accId) { ensureMay(); return cache[keyOf(ym, accId)] || null; }
  function keys() { ensureMay(); return Object.keys(cache); }
  function months() { ensureMay(); const s = {}; keys().forEach(k => s[k.split("|")[0]] = 1); return Object.keys(s).sort().reverse(); }

  // Construye/garantiza el detalle horneado de mayo 2026 aunque el timing
  // de carga de SpacioConta haya cambiado. Idempotente y sin red.
  let mayBuilt = false;
  function ensureMay() {
    if (mayBuilt) return;
    if (!window.SpacioConta) return;        // aún no está el clasificador; reintenta luego
    try {
      buildMay2026().forEach(s => { const k = keyOf(s.ym, s.accId); if (!cache[k]) cache[k] = s; });
      mayBuilt = true;
    } catch (e) {}
  }

  hydrate();
  window.SpacioContaLive = { load, getStatement, keys, months, hydrate, parseWorkbook, SHEET_IDS };
})();
