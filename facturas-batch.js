/* ============================================================
   Spacio AM — Clasificador de facturas en lote
   ------------------------------------------------------------
   Deduce a qué mes pertenece cada factura. Lo que manda es el
   PERIODO QUE DESCRIBE la factura ("servicios de mayo 2026"),
   no la fecha de emisión: los socios facturan atrasado.
   Orden de intentos:
     1. PDF con texto: periodo en la descripción      → alta
     2. PDF con texto: fecha de emisión               → media
     3. OCR con Claude Haiku (imágenes y PDF escaneado) → según lo leído
     4. Nombre del archivo (2026-05, mayo 2026…)      → media
     5. Fecha de modificación del archivo             → baja
   El socio siempre ve la imagen y puede corregir el mes.
   Expone window.SpacioFacturaBatch.
   ============================================================ */
(function () {
  "use strict";
  var MES = { ene:1, enero:1, feb:2, febrero:2, mar:3, marzo:3, abr:4, abril:4, may:5, mayo:5, jun:6, junio:6, jul:7, julio:7, ago:8, agosto:8, sep:9, set:9, septiembre:9, setiembre:9, oct:10, octubre:10, nov:11, noviembre:11, dic:12, diciembre:12 };
  var MES_RE = "ene|enero|feb|febrero|mar|marzo|abr|abril|may|mayo|jun|junio|jul|julio|ago|agosto|sep|set|septiembre|setiembre|oct|octubre|nov|noviembre|dic|diciembre";
  // frases que en una factura anuncian el periodo del servicio
  var PERIODO_RE = /(correspondiente\s+a(?:l)?|por\s+el\s+mes\s+de|mes\s+de|periodo\s+de|per[íi]odo\s+de|servicios?\s+de|arrendamiento\s+de|alquiler\s+de|comisi[óo]n\s+de|renta\s+de|honorarios?\s+de)/i;

  function ymOf(y, m) { return String(y) + "-" + String(m).padStart(2, "0"); }
  function plausible(y) { return y >= 2020 && y <= new Date().getFullYear() + 1; }

  // busca una fecha o un mes en un texto libre; devuelve "YYYY-MM" o ""
  function ymFromText(raw, defaultYear) {
    var s = String(raw || "").toLowerCase().replace(/\s+/g, " ");
    var m;
    m = s.match(new RegExp("(\\d{1,2})\\s*(?:de\\s*)?(" + MES_RE + ")\\.?\\s*(?:de\\s*|del\\s*)?(\\d{4})"));
    if (m && plausible(+m[3])) return ymOf(+m[3], MES[m[2]]);
    m = s.match(new RegExp("(" + MES_RE + ")\\.?\\s*(?:de\\s*|del\\s*)?(\\d{4})"));
    if (m && plausible(+m[2])) return ymOf(+m[2], MES[m[1]]);
    // mes SIN año (típico en descripciones): usamos el año de referencia
    m = s.match(new RegExp("(?:^|[^a-z])(" + MES_RE + ")(?:[^a-z]|$)"));
    if (m && defaultYear) return ymOf(defaultYear, MES[m[1]]);
    m = s.match(/(20\d{2})[\/\-.](\d{1,2})(?:[\/\-.](\d{1,2}))?/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return ymOf(+m[1], +m[2]);
    m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return ymOf(+m[3], +m[2]);
    m = s.match(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(?:[^0-9]|$)/);
    if (m) return ymOf(+m[1], +m[2]);
    return "";
  }

  // fecha de emisión (para tener el año de referencia)
  function emisionYm(s) {
    var lab = s.toLowerCase().search(/fecha\s*(?:y\s*hora\s*)?(?:de\s*)?(?:emisi[óo]n|certificaci[óo]n)/);
    if (lab >= 0) { var hit = ymFromText(s.slice(lab, lab + 140)); if (hit) return hit; }
    return ymFromText(s.slice(0, 1600));
  }

  // periodo declarado en la descripción de la factura
  function periodoYm(s, defYear) {
    var txt = String(s || "").replace(/\s+/g, " ");
    var re = new RegExp(PERIODO_RE.source, "gi"), m;
    while ((m = re.exec(txt)) !== null) {
      var hit = ymFromText(txt.slice(m.index, m.index + 90), defYear);
      if (hit) return hit;
    }
    return "";
  }

  function fromInvoiceText(text) {
    var s = String(text || "").replace(/\s+/g, " ");
    var em = emisionYm(s);
    var defYear = em ? +em.slice(0, 4) : new Date().getFullYear();
    var per = periodoYm(s, defYear);
    if (per) return { ym: per, conf: "alta", source: "periodo" };
    if (em) return { ym: em, conf: "media", source: "emision" };
    return null;
  }

  function loadPdfLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return Promise.resolve(null);
  }

  async function pdfDoc(file) {
    var lib = await loadPdfLib();
    if (!lib) return null;
    try {
      var buf = await file.arrayBuffer();
      return await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    } catch (e) { return null; }
  }

  async function pdfText(pdf) {
    var out = "";
    var pages = Math.min(pdf.numPages, 3);
    for (var p = 1; p <= pages; p++) {
      var pg = await pdf.getPage(p);
      var tc = await pg.getTextContent();
      out += " " + tc.items.map(function (i) { return i.str; }).join(" ");
    }
    return out;
  }

  // primera página del PDF → JPEG base64 (para OCR de escaneos)
  async function pdfPageJpeg(pdf) {
    try {
      var pg = await pdf.getPage(1);
      var vp = pg.getViewport({ scale: 1 });
      var scale = Math.min(1600 / vp.width, 2);
      var v = pg.getViewport({ scale: scale });
      var cv = document.createElement("canvas");
      cv.width = Math.round(v.width); cv.height = Math.round(v.height);
      await pg.render({ canvasContext: cv.getContext("2d"), viewport: v }).promise;
      return cv.toDataURL("image/jpeg", 0.75).split(",")[1];
    } catch (e) { return ""; }
  }

  // imagen → JPEG base64 reducido (barato de enviar y suficiente para leer)
  function imageJpeg(file, maxSide) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var k = Math.min(1, (maxSide || 1600) / Math.max(img.width, img.height));
          var cv = document.createElement("canvas");
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          res(cv.toDataURL("image/jpeg", 0.75).split(",")[1]);
        } catch (e) { res(""); }
        URL.revokeObjectURL(url);
      };
      img.onerror = function () { res(""); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }

  // OCR en el servidor (Apps Script → Claude Haiku). Devuelve null si no hay backend.
  async function ocr(b64) {
    if (!b64) return null;
    var W = window.SpacioWrite;
    if (!W || !W.enabled || !W.enabled()) return null;
    var r = await W.post("ocrFactura", { dataBase64: b64, mimeType: "image/jpeg" });
    if (!r || !r.ok || !r.ym) return null;
    return {
      ym: r.ym,
      conf: r.fuente === "periodo" ? (r.confianza === "baja" ? "media" : "alta") : "media",
      source: r.fuente === "periodo" ? "ocr-periodo" : "ocr-emision",
      descripcion: r.descripcion || "",
    };
  }

  // clasifica UN archivo → { file, name, ym, conf, source, descripcion, preview }
  async function classify(file, opts) {
    opts = opts || {};
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    var base = { file: file, name: file.name, descripcion: "", preview: "" };
    if (!isPdf) { try { base.preview = URL.createObjectURL(file); } catch (e) {} }

    if (isPdf) {
      var pdf = await pdfDoc(file);
      if (pdf) {
        var txt = await pdfText(pdf);
        var hit = txt && txt.replace(/\s/g, "").length > 40 ? fromInvoiceText(txt) : null;
        if (hit) return Object.assign(base, hit);
        if (opts.ocr !== false) {
          var jpg = await pdfPageJpeg(pdf);
          if (jpg) {
            base.preview = "data:image/jpeg;base64," + jpg;
            var o = await ocr(jpg);
            if (o) return Object.assign(base, o);
          }
        }
      }
    } else if (opts.ocr !== false) {
      var b64 = await imageJpeg(file, 1600);
      var oi = await ocr(b64);
      if (oi) return Object.assign(base, oi);
    }

    var byName = ymFromText(file.name);
    if (byName) return Object.assign(base, { ym: byName, conf: "media", source: "nombre" });
    var d = new Date(file.lastModified || Date.now());
    return Object.assign(base, { ym: ymOf(d.getFullYear(), d.getMonth() + 1), conf: "baja", source: "fecha" });
  }

  // clasifica en serie (uno a la vez: no saturamos el Apps Script)
  async function classifyAll(files, opts, onEach) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var r = await classify(files[i], opts);
      out.push(r);
      if (onEach) { try { onEach(r, i, files.length); } catch (e) {} }
    }
    return out;
  }

  window.SpacioFacturaBatch = {
    classify: classify, classifyAll: classifyAll,
    ymFromText: ymFromText, periodoYm: periodoYm,
    ocrAvailable: function () { var W = window.SpacioWrite; return !!(W && W.enabled && W.enabled()); },
  };
})();
