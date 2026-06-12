// ============================================================
// Spacio AM — Contabilidad · parser de estados de cuenta Banco Industrial
// ------------------------------------------------------------
// Extrae texto del PDF con pdf.js y lo convierte en filas de
// movimientos. El PDF NO trae la columna ND/NC, así que el signo
// (Debe/Haber) se deduce de la dirección del Saldo corrido.
// ============================================================
(function () {
  "use strict";

  const PDFJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  let _libPromise = null;
  function loadLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (_libPromise) return _libPromise;
    _libPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PDFJS_SRC;
      s.onload = () => {
        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (e) {}
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error("No se pudo cargar pdf.js"));
      document.head.appendChild(s);
    });
    return _libPromise;
  }

  function num(s) { return parseFloat(String(s).replace(/,/g, "")) || 0; }
  function r2(n) { return Math.round(n * 100) / 100; }

  async function extractText(arrayBuffer) {
    const pdfjsLib = await loadLib();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let out = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      out += " " + tc.items.map(it => it.str).join(" ");
    }
    return out.replace(/\s+/g, " ").trim();
  }

  // Convierte el texto plano de un estado BI en estructura de movimientos
  function parseText(text) {
    const result = { accountNumber: "", ym: "", from: "", to: "", currency: "", rows: [], totals: null, warnings: [] };

    const mAcc = text.match(/Numero de cuenta:\s*(\d{6,})/i);
    if (mAcc) result.accountNumber = mAcc[1];
    const acc = window.SpacioConta && window.SpacioConta.accByNumber[result.accountNumber];
    if (acc) result.currency = acc.currency;

    const mPer = text.match(/Comprendidos del\s*(\d{2}\/\d{2}\/\d{4})\s*al\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (mPer) {
      result.from = mPer[1]; result.to = mPer[2];
      const [, , my] = mPer[1].split("/"); // dd/mm/yyyy
      const parts = mPer[1].split("/");
      result.ym = parts[2] + "-" + parts[1];
    }

    // saldo anterior (semilla del saldo corrido)
    const mSA = text.match(/SALDO ANTERIOR\**\s*([\d,]+\.\d{2})/i);
    let prevSaldo = mSA ? num(mSA[1]) : null;
    result.saldoAnterior = prevSaldo;

    // recorta el cuerpo: desde después de "Saldo" del encabezado hasta el aviso legal
    let body = text;
    const cut = body.search(/FAVOR DE REVISAR|Totales:\s/i);
    let totalsStr = "";
    if (cut > -1) { totalsStr = body.slice(cut); body = body.slice(0, cut); }

    // separa en chunks que empiezan con una fecha DD-MM-YYYY
    const chunks = body.split(/(?=\b\d{2}-\d{2}-\d{4}\b)/);
    const DEC = /-?[\d,]*\d\.\d{2}/g;

    chunks.forEach(chunk => {
      const m = chunk.match(/^(\d{2})-(\d{2})-(\d{4})\s+([\s\S]*)$/);
      if (!m) return;
      const dd = m[1], mm = m[2], yyyy = m[3];
      let rest = m[4].trim();
      // doc = primer entero
      const dm = rest.match(/^(\d+)\s+([\s\S]*)$/);
      let doc = "", tail = rest;
      if (dm) { doc = dm[1]; tail = dm[2]; }
      // números decimales en el tail
      const decs = []; let mm2;
      DEC.lastIndex = 0;
      while ((mm2 = DEC.exec(tail)) !== null) decs.push({ v: num(mm2[0]), idx: mm2.index, raw: mm2[0] });
      if (decs.length < 2) return; // no es una fila de movimiento válida
      const saldoTok = decs[decs.length - 1];
      const amtTok = decs[decs.length - 2];
      const saldo = saldoTok.v;
      const amount = amtTok.v;
      let desc = tail.slice(0, amtTok.idx).trim().replace(/\s+/g, " ");

      // signo por dirección del saldo
      let debit = 0, credit = 0, amountCheck = false;
      if (prevSaldo == null) { // sin semilla: asumimos débito
        debit = amount;
      } else {
        const delta = r2(saldo - prevSaldo);
        if (Math.abs(delta - amount) <= 0.02) credit = amount;
        else if (Math.abs(delta + amount) <= 0.02) debit = amount;
        else { // no cuadra: usamos el signo del delta
          amountCheck = true;
          if (delta >= 0) credit = amount; else debit = amount;
        }
      }
      prevSaldo = saldo;

      const tt = credit > 0 ? "NC" : "ND";
      result.rows.push({
        date: yyyy + "-" + mm + "-" + dd,   // ISO
        dateBI: dd + "-" + mm + "-" + yyyy,
        doc: doc, desc: desc,
        debit: debit, credit: credit, saldo: saldo,
        sign: credit > 0 ? "credit" : "debit", tt: tt,
        amountCheck: amountCheck,
      });
    });

    // totales del PDF (Totales: deb cred saldoFinal)
    const mTot = totalsStr.match(/Totales:\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i);
    if (mTot) result.totals = { debit: num(mTot[1]), credit: num(mTot[2]), saldo: num(mTot[3]) };

    if (!result.rows.length) result.warnings.push("No se reconocieron movimientos en el PDF. ¿Es un estado de cuenta de Banco Industrial?");
    if (mAcc && !acc) result.warnings.push("La cuenta " + result.accountNumber + " no es una de las 4 cuentas configuradas.");

    return result;
  }

  async function parseFile(file) {
    const buf = await file.arrayBuffer();
    const text = await extractText(buf);
    const parsed = parseText(text);
    parsed.fileName = file.name;
    return parsed;
  }

  window.SpacioContaParse = { parseFile, parseText, extractText, loadLib };
})();
