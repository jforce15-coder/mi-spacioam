/* ============================================================
   Spacio AM — Módulo Gastos PedidosYa · Motor de parseo + cruce
   ------------------------------------------------------------
   Lógica pura (sin React). Expone window.PedidosYa con:
     · parseOrderFiles(files)  → {orders, stats}
     · parseSATFile(file)      → {invoices, stats, warnings}
     · crossReference(orders, invoices, importedSet)
     · helpers (links, money, dates, NITs)
   Depende de SheetJS (window.XLSX) para Excel/XML/HTML y de
   pdf.js (window.pdfjsLib) para PDF — ambos cargados en el HTML.
   ============================================================ */
(function () {
  "use strict";

  // --- NITs PedidosYa en el SAT (anexo del brief) ---
  const NIT_PRODUCTOS = "110411668"; // DELIVERY HERO DMART  → factura de PRODUCTOS
  const NIT_TARIFA    = "100446329"; // DELIVERY HERO GUATEMALA → factura de TARIFA DE SERVICIO
  const TOL = 1.0;        // tolerancia de redondeo del cruce (±Q1)
  const REVIEW_TOL = 6.0; // si el mejor candidato cae dentro de esto, se marca "revisar"

  // ---------- helpers ----------
  const digits = (s) => String(s == null ? "" : s).replace(/[^0-9]/g, "");
  const numQ = (v) => {
    if (v == null) return 0;
    let s = String(v).trim();
    // formatos posibles: "1,234.56" | "1.234,56" | "Q 78.56" | "78,56"
    s = s.replace(/[^0-9.,\-]/g, "");
    if (s.indexOf(",") > -1 && s.indexOf(".") > -1) {
      // el último separador es el decimal
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (s.indexOf(",") > -1) {
      // sólo comas: si hay exactamente 2 decimales tras la última coma → decimal
      const parts = s.split(",");
      if (parts[parts.length - 1].length === 2) s = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
      else s = s.replace(/,/g, "");
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };
  const money = (v) => "Q" + (Math.round((v || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // fecha calendario en hora de Guatemala (UTC-6) a partir de un ISO con Z
  function localDayGT(input) {
    if (!input) return null;
    let d;
    if (input instanceof Date) d = input;
    else {
      const s = String(input).trim();
      // ISO con zona
      if (/\d{4}-\d{2}-\d{2}T/.test(s)) d = new Date(s);
      else return parseLooseDate(s);
    }
    if (isNaN(d)) return null;
    const gt = new Date(d.getTime() - 6 * 3600 * 1000); // a hora local GT
    return ymd(gt.getUTCFullYear(), gt.getUTCMonth(), gt.getUTCDate());
  }
  function ymd(y, m, day) { return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0"); }

  // parsea fechas sueltas del SAT: "31/05/2026", "2026-05-31", "31/05/2026 06:00:00", serial Excel
  function parseLooseDate(s) {
    if (s == null || s === "") return null;
    if (typeof s === "number") { // serial de Excel
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + s * 86400000);
      return ymd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const str = String(s).trim();
    let m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return ymd(+m[1], +m[2] - 1, +m[3]);
    m = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); // dd/mm/yyyy
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      return ymd(y, +m[2] - 1, +m[1]);
    }
    const d = new Date(str);
    if (!isNaN(d)) return ymd(d.getFullYear(), d.getMonth(), d.getDate());
    return null;
  }
  function prettyDay(ymdStr, lang) {
    if (!ymdStr) return "—";
    const [y, m, d] = ymdStr.split("-").map(Number);
    const MES = lang === "en"
      ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      : ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return d + " " + MES[m - 1] + " " + y;
  }
  function mesLargoES(ymdStr) {
    const LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const [y, m] = ymdStr.split("-").map(Number);
    return LONG[m - 1] + " de " + y;
  }

  // ---------- enlaces externos ----------
  const links = {
    order: (orderId) => "https://www.pedidosya.com.gt/order-details?orderId=" + encodeURIComponent(orderId) + "&origin=myOrders",
    satVerificador: "https://felpub.c.sat.gob.gt/verificador-web/publico/vistas/verificacionDte.jsf",
  };

  // ============================================================
  // 1) JSON de PedidosYa (múltiples archivos, paginados por scroll)
  // ============================================================
  function deepFindOrders(obj, acc) {
    acc = acc || [];
    if (!obj || typeof obj !== "object") return acc;
    if (Array.isArray(obj.orders)) obj.orders.forEach(o => acc.push(o));
    // algunos batches traen {data:{orders:[]}} o list directo
    if (Array.isArray(obj)) {
      obj.forEach(o => { if (o && (o.orderId || o.id)) acc.push(o); else deepFindOrders(o, acc); });
    } else {
      Object.keys(obj).forEach(k => {
        if (k === "orders") return;
        if (obj[k] && typeof obj[k] === "object") deepFindOrders(obj[k], acc);
      });
    }
    return acc;
  }

  function parseOrdersText(text) {
    if (!text) return [];
    let data = text.trim();
    // la respuesta de red puede venir doble-codificada (string que contiene JSON)
    for (let i = 0; i < 3; i++) {
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed === "string") { data = parsed; continue; }
        return collectOrders(parsed);
      } catch (e) {
        // intento: varios objetos JSON concatenados / NDJSON
        const chunks = splitConcatenatedJSON(data);
        if (chunks.length > 1) {
          let all = [];
          chunks.forEach(c => { try { all = all.concat(collectOrders(JSON.parse(c))); } catch (_) {} });
          if (all.length) return all;
        }
        return [];
      }
    }
    return [];
  }
  function collectOrders(parsed) {
    const raw = [];
    if (Array.isArray(parsed)) deepFindOrders(parsed, raw);
    else if (parsed && Array.isArray(parsed.orders)) parsed.orders.forEach(o => raw.push(o));
    else deepFindOrders(parsed, raw);
    return raw.map(normalizeOrder).filter(Boolean);
  }
  function splitConcatenatedJSON(s) {
    const out = []; let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") { if (depth === 0) start = i; depth++; }
      else if (c === "}") { depth--; if (depth === 0 && start >= 0) { out.push(s.slice(start, i + 1)); start = -1; } }
    }
    return out;
  }

  function normalizeOrder(o) {
    if (!o) return null;
    const orderId = String(o.orderId || o.id || (o.feedback && o.feedback.resourceId || "").replace(/^ORDER-/, "") || "").trim();
    if (!orderId) return null;
    const vendor = o.vendor || {};
    const businessType = (o.businessType || vendor.businessType || "").toUpperCase();
    const status = (o.status || "").toUpperCase();
    const items = Array.isArray(o.items) ? o.items.map(it => ({
      name: (it.name || "").trim(), qty: +it.quantity || 1, amount: numQ(it.amount),
    })) : [];
    return {
      orderId,
      amount: numQ(o.orderAmount),
      amountNoDiscount: numQ(o.orderAmountNoDiscount),
      plusSavings: numQ(o.plusSavingsAmount),
      currency: o.currency || "Q",
      dateISO: o.registeredDate || "",
      day: localDayGT(o.registeredDate),
      vendor: (vendor.name || "").trim(),
      businessType, status,
      code: (o.code || "").trim(),
      items,
    };
  }

  async function parseOrderFiles(files) {
    const seen = new Set();
    const orders = [];
    let totalParsed = 0, dupes = 0;
    for (const f of files) {
      const text = await readText(f);
      const parsed = parseOrdersText(text);
      totalParsed += parsed.length;
      parsed.forEach(o => {
        if (seen.has(o.orderId)) { dupes++; return; } // dedupe por orderId (batches se traslapan)
        seen.add(o.orderId); orders.push(o);
      });
    }
    const groceries = orders.filter(o => o.businessType === "GROCERIES");
    const delivered = groceries.filter(o => o.status === "DELIVERED");
    const valid = delivered;
    const excluded = orders.filter(o => !(o.businessType === "GROCERIES" && o.status === "DELIVERED"));
    return {
      orders: valid,
      all: orders,
      stats: {
        files: files.length, totalParsed, unique: orders.length, dupes,
        groceries: groceries.length, delivered: valid.length,
        excludedRestaurant: orders.filter(o => o.businessType && o.businessType !== "GROCERIES").length,
        excludedStatus: groceries.length - valid.length,
        excluded: excluded.length,
      },
    };
  }

  // ============================================================
  // 2) Excel / XML / PDF del SAT (FEL · Consultar DTE)
  // ============================================================
  // mapeo flexible de nombres de columna del SAT
  const COL = {
    fecha:   [/fecha\s*de\s*emisi/i, /fecha\s*emisi/i, /^fecha$/i],
    auth:    [/n[uú]mero\s*de\s*autoriz/i, /autorizaci/i, /^autorizaci[oó]n$/i],
    nit:     [/nit\s*del?\s*emisor/i, /nit\s*emisor/i, /^nit$/i],
    emisor:  [/nombre\s*(completo\s*)?del?\s*emisor/i, /^emisor$/i],
    receptor:[/nombre\s*(completo\s*)?del?\s*receptor/i, /^receptor$/i],
    estado:  [/^estado$/i, /estado\s*(del)?\s*dte/i],
    total:   [/gran\s*total/i, /total\s*\(moneda/i, /^total$/i, /monto\s*total/i],
  };
  function findCol(headers, patterns) {
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] || "").trim();
      if (patterns.some(re => re.test(h))) return i;
    }
    return -1;
  }
  // localiza la fila de encabezados (algunos exports traen título arriba)
  function locateHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i].map(c => String(c || ""));
      const hasNit = r.some(c => /nit/i.test(c));
      const hasTotal = r.some(c => /total/i.test(c));
      const hasFecha = r.some(c => /fecha/i.test(c));
      if (hasNit && (hasTotal || hasFecha)) return i;
    }
    return 0;
  }

  function rowsToInvoices(rows, warnings) {
    if (!rows || !rows.length) return [];
    const hi = locateHeaderRow(rows);
    const headers = rows[hi].map(c => String(c || "").trim());
    const ix = {
      fecha: findCol(headers, COL.fecha), auth: findCol(headers, COL.auth),
      nit: findCol(headers, COL.nit), emisor: findCol(headers, COL.emisor),
      receptor: findCol(headers, COL.receptor), estado: findCol(headers, COL.estado),
      total: findCol(headers, COL.total),
    };
    if (ix.nit === -1 || ix.total === -1) {
      warnings.push("No se reconocieron las columnas NIT / Gran Total del SAT. Revisa que sea el export de FEL → Consultar DTE.");
    }
    const out = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(c => c == null || String(c).trim() === "")) continue;
      const nit = digits(ix.nit > -1 ? row[ix.nit] : "");
      const total = numQ(ix.total > -1 ? row[ix.total] : 0);
      const estado = (ix.estado > -1 ? String(row[ix.estado] || "") : "").trim();
      const kind = nit === NIT_PRODUCTOS ? "productos" : nit === NIT_TARIFA ? "tarifa" : "otro";
      // Ya NO se descarta "otro": se conserva para que el admin pueda identificar
      // facturas emitidas con OTRA NIT (p.ej. PedidosYa Market / la tienda factura
      // los productos con su propia NIT, no con la de Delivery Hero).
      out.push({
        fechaRaw: ix.fecha > -1 ? row[ix.fecha] : "",
        day: parseLooseDate(ix.fecha > -1 ? row[ix.fecha] : ""),
        auth: String(ix.auth > -1 ? row[ix.auth] : "").trim(),
        nit, emisor: String(ix.emisor > -1 ? row[ix.emisor] : "").trim(),
        receptor: String(ix.receptor > -1 ? row[ix.receptor] : "").trim(),
        estado, vigente: /vigente/i.test(estado) || estado === "",
        total, kind,
      });
    }
    return out;
  }

  async function parseSATFile(file) {
    const warnings = [];
    const name = (file.name || "").toLowerCase();
    let rows = [];
    try {
      if (name.endsWith(".pdf")) {
        rows = await parsePDF(file, warnings);
      } else if (window.XLSX) {
        const buf = await readArrayBuffer(file);
        const wb = window.XLSX.read(new Uint8Array(buf), { type: "array", cellDates: false, raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
      } else {
        warnings.push("SheetJS no está disponible para leer el archivo.");
      }
    } catch (e) {
      warnings.push("No se pudo leer el archivo: " + e.message);
    }
    const invoices = rowsToInvoices(rows, warnings);
    const productos = invoices.filter(i => i.kind === "productos");
    const tarifa = invoices.filter(i => i.kind === "tarifa");
    const otros = invoices.filter(i => i.kind === "otro");
    // resumen por NIT de las "otras" facturas (para descubrir la NIT del Market)
    const nitMap = {};
    otros.forEach(i => { const k = i.nit || "?"; (nitMap[k] = nitMap[k] || { nit: k, emisor: i.emisor, count: 0, sum: 0 }); nitMap[k].count++; nitMap[k].sum += i.total || 0; if (!nitMap[k].emisor && i.emisor) nitMap[k].emisor = i.emisor; });
    const otrosByNit = Object.values(nitMap).sort((a, b) => b.count - a.count);
    return {
      invoices,
      stats: { rows: rows.length, productos: productos.length, tarifa: tarifa.length, otros: otros.length, total: productos.length + tarifa.length, otrosByNit },
      warnings,
    };
  }

  // PDF → texto → filas (best-effort, se apoya en los 9 dígitos del NIT)
  async function parsePDF(file, warnings) {
    if (!window.pdfjsLib) { warnings.push("Visor de PDF no disponible."); return []; }
    const buf = await readArrayBuffer(file);
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      // agrupa por coordenada Y para reconstruir filas
      const byY = {};
      tc.items.forEach(it => {
        const y = Math.round(it.transform[5]);
        (byY[y] = byY[y] || []).push({ x: it.transform[4], s: it.str });
      });
      Object.keys(byY).sort((a, b) => b - a).forEach(y => {
        const cells = byY[y].sort((a, b) => a.x - b.x).map(c => c.s.trim()).filter(Boolean);
        if (cells.length) lines.push(cells);
      });
    }
    warnings.push("PDF leído en modo texto (best-effort). Verifica los montos antes de guardar.");
    return lines;
  }

  // ============================================================
  // 3) Cruce JSON ↔ facturas SAT (fecha + monto)
  // ============================================================
  function bestComboForOrder(order, productos, tarifa) {
    // candidatos del mismo día (y día ±1 como respaldo: las facturas de productos
    // se emiten en lote a las 06:00, no a la hora real del pedido)
    const sameDay = (inv, day) => inv.day && day && (inv.day === day || dayDiff(inv.day, day) <= 1);
    const prods = productos.filter(p => p.vigente && sameDay(p, order.day));
    const tars = tarifa.filter(p => p.vigente && sameDay(p, order.day));
    let best = null;
    const consider = (combo, sum) => {
      const diff = Math.abs(sum - order.amount);
      if (!best || diff < best.diff) best = { combo, sum, diff };
    };
    // 1) producto solo
    prods.forEach(p => consider({ prod: p, tar: null }, p.total));
    // 2) producto + tarifa
    prods.forEach(p => tars.forEach(t => consider({ prod: p, tar: t }, p.total + t.total)));
    // 3) sólo tarifa (raro, pero por si el pedido fue mínimo)
    tars.forEach(t => consider({ prod: null, tar: t }, t.total));
    return best;
  }
  function dayDiff(a, b) {
    const da = new Date(a + "T00:00:00Z"), db = new Date(b + "T00:00:00Z");
    return Math.abs(Math.round((da - db) / 86400000));
  }

  function crossReference(orders, invoices, importedSet) {
    importedSet = importedSet || new Set();
    const productos = invoices.filter(i => i.kind === "productos");
    const tarifa = invoices.filter(i => i.kind === "tarifa");
    return orders.map(order => {
      const best = bestComboForOrder(order, productos, tarifa);
      let matchStatus = "sin_cruzar", prod = null, tar = null, invoiceTotal = 0, diff = null;
      if (best) {
        prod = best.combo.prod; tar = best.combo.tar; invoiceTotal = best.sum; diff = best.diff;
        if (best.diff <= TOL) matchStatus = "matched";
        else if (best.diff <= REVIEW_TOL) matchStatus = "revisar";
        else { matchStatus = "sin_cruzar"; prod = null; tar = null; invoiceTotal = 0; diff = null; }
      }
      return {
        order, prod, tar, invoiceTotal, diff, matchStatus,
        alreadyImported: importedSet.has(order.orderId),
        // valores editables por el admin (se rellenan en la UI):
        property_name: "", categoria: "insumos & gastos", tag: "",
        include: true,
      };
    }).sort((a, b) => (a.order.day < b.order.day ? 1 : a.order.day > b.order.day ? -1 : 0));
  }

  // comentario sugerido (brief §10): establecimiento + orderId + Nº autorización
  function buildComment(row) {
    const parts = [];
    if (row.order.vendor) parts.push(row.order.vendor);
    parts.push("Pedido " + row.order.orderId);
    const auths = [];
    if (row.prod && row.prod.auth) auths.push(row.prod.auth);
    if (row.tar && row.tar.auth) auths.push(row.tar.auth);
    if (auths.length) parts.push("Aut: " + auths.join(" / "));
    return parts.join(" · ");
  }

  // fila lista para "insumos & gastos"
  function toSheetRow(row) {
    return {
      Mes: row.order.day ? mesLargoES(row.order.day) : "",
      "Fecha de pedido": row.order.day || "",
      property_name: row.property_name || "",
      valor: Math.round(row.order.amount * 100) / 100,
      categoria: row.categoria || "insumos & gastos",
      Comentario: buildComment(row),
      tag: row.tag || "",
      orderId: row.order.orderId,
      authProductos: row.prod ? row.prod.auth : "",
      authTarifa: row.tar ? row.tar.auth : "",
    };
  }

  // ============================================================
  // 3b) SOLO SAT · emparejar facturas (productos + tarifa) → líneas
  //     (sin JSON: el admin asigna propiedad + URL del pedido)
  // ============================================================
  function makeLine(prod, tar, importedSet) {
    const key = (prod && prod.auth) || (tar && tar.auth) || ("L" + Math.random().toString(36).slice(2));
    const day = (prod && prod.day) || (tar && tar.day) || null;
    const total = (prod ? prod.total : 0) + (tar ? tar.total : 0);
    const receptor = (prod && prod.receptor) || (tar && tar.receptor) || "";
    return {
      id: String(key), day, prod, tar,
      consolidated: Math.round(total * 100) / 100, receptor,
      vigente: (prod ? prod.vigente : true) && (tar ? tar.vigente : true),
      alreadyImported: importedSet.has(String(key)),
      // editable por el admin:
      property_name: "", orderUrl: "", categoria: "insumos & gastos", tag: "",
      comentario: "insumos & gastos", include: true,
    };
  }
  // Empareja cada factura de productos con la tarifa de servicio más cercana del
  // mismo día (proximidad = orden de emisión en el export del SAT).
  function pairSATInvoices(invoices, importedSet, opts) {
    importedSet = importedSet || new Set();
    opts = opts || {};
    const list = (invoices || []).map((inv, i) => Object.assign({ _idx: i }, inv));
    const prods = list.filter(i => i.kind === "productos" && i.vigente);
    const tars  = list.filter(i => i.kind === "tarifa"   && i.vigente);
    const usedTar = new Set();
    const lines = [];
    prods.forEach(prod => {
      let tar = null, bestDist = Infinity;
      tars.forEach(t => {
        if (usedTar.has(t._idx)) return;
        if (t.day && prod.day && t.day !== prod.day && dayDiff(t.day, prod.day) > 1) return;
        const d = Math.abs(t._idx - prod._idx);
        if (d < bestDist) { bestDist = d; tar = t; }
      });
      if (tar) usedTar.add(tar._idx);
      lines.push(makeLine(prod, tar, importedSet));
    });
    tars.forEach(t => { if (!usedTar.has(t._idx)) lines.push(makeLine(null, t, importedSet)); });
    // facturas de OTRA NIT (p.ej. el Market emite con NIT propia): se muestran como
    // líneas sueltas asignables cuando el admin activa "incluir otras NITs".
    if (opts.includeOther) {
      list.filter(i => i.kind === "otro" && i.vigente).forEach(o => lines.push(makeLine(o, null, importedSet)));
    }
    return lines.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }

  function buildCommentLine(line) {
    const parts = [];
    if (line.receptor) parts.push(line.receptor);
    const auths = [];
    if (line.prod && line.prod.auth) auths.push(line.prod.auth);
    if (line.tar && line.tar.auth) auths.push(line.tar.auth);
    if (auths.length) parts.push("Aut: " + auths.join(" / "));
    if (line.orderUrl) parts.push(line.orderUrl);
    return parts.join(" · ");
  }
  function toSheetRowFromLine(line) {
    const oid = (line.prod && line.prod.auth) || (line.tar && line.tar.auth) || "";
    return {
      Mes: line.day ? mesLargoES(line.day) : "",
      "Fecha de pedido": line.day || "",
      property_name: line.property_name || "",
      valor: line.consolidated,
      categoria: line.categoria || "insumos & gastos",
      // Columna F (Comentario): texto limpio editable por el admin.
      Comentario: (line.comentario != null ? line.comentario : ""),
      // Columna G (tag): etiqueta descriptiva.
      tag: line.tag || "",
      orderId: oid, orderUrl: line.orderUrl || "",
      authProductos: line.prod ? line.prod.auth : "",
      authTarifa: line.tar ? line.tar.auth : "",
    };
  }

  // ============================================================
  // 3c) Gasto manual + gasto multipropiedad
  // ============================================================
  function manualSheetRows(entry, properties, split) {
    // entry: { day, valor, categoria, comentario, tag }
    // properties: [names]; split=true → divide en partes iguales
    const ps = (properties || []).filter(Boolean);
    if (!ps.length) return [];
    const each = split ? Math.round((entry.valor / ps.length) * 100) / 100 : entry.valor;
    return ps.map((name, i) => ({
      Mes: entry.day ? mesLargoES(entry.day) : "",
      "Fecha de pedido": entry.day || "",
      property_name: name,
      valor: each,
      categoria: entry.categoria || "Reparaciones o inversión",
      Comentario: (entry.comentario || "") + (ps.length > 1 ? (split ? " · (compartido ÷" + ps.length + ")" : " · (aplicado a " + ps.length + ")") : ""),
      tag: entry.tag || "",
      orderId: "MAN-" + (entry.day || "") + "-" + Math.random().toString(36).slice(2, 7) + "-" + i,
      orderUrl: "", authProductos: "", authTarifa: "",
    }));
  }

  // ============================================================
  // 3d) Depósitos bancarios · extracción de fecha + monto del OCR
  // ============================================================
  const ES_MES = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };
  function parseSpanishDate(t) {
    const m = String(t||"").toLowerCase().match(/(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?\s*(?:de\s+)?(\d{4})/);
    if (!m) return null;
    const mi = ES_MES[m[2] === "set" ? "sep" : m[2]]; if (mi == null) return null;
    return ymd(+m[3], mi, +m[1]);
  }
  function extractDeposit(text, filename) {
    const t = String(text || "");
    // monto: toma el mayor número con 2 decimales (suele ser el total acreditado)
    const amts = []; const re = /([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\b/g; let m;
    while ((m = re.exec(t))) { const n = numQ(m[1]); if (n > 0) amts.push(n); }
    const amount = amts.length ? Math.max.apply(null, amts) : 0;
    const dm = (t.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/) || [])[1];
    const day = parseLooseDate(dm) || parseSpanishDate(t);
    return { amount: Math.round(amount * 100) / 100, day, raw: t, filename: filename || "" };
  }
  // intenta deducir la propiedad por edificio + número de apto en un texto libre
  function matchProperty(hint, names) {
    const h = String(hint || "").toLowerCase().replace(/[^a-z0-9áéíóúñ #]/gi, " ");
    if (!h.trim()) return "";
    let best = "", bestScore = 0;
    (names || []).forEach(name => {
      const parts = String(name).toLowerCase().split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);
      let score = 0;
      parts.forEach(p => {
        const tok = p.replace(/[^a-z0-9áéíóúñ]/gi, "");
        if (tok.length >= 3 && h.replace(/[^a-z0-9áéíóúñ]/gi, "").includes(tok)) score += tok.length;
        const numM = p.match(/\d{2,4}/); // número de apto
        if (numM && new RegExp("\\b" + numM[0] + "\\b").test(h)) score += 4;
      });
      if (score > bestScore) { bestScore = score; best = name; }
    });
    return bestScore >= 4 ? best : "";
  }

  // ---------- file readers ----------
  function readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
  function readArrayBuffer(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); }); }

  window.PedidosYa = {
    NIT_PRODUCTOS, NIT_TARIFA, TOL, REVIEW_TOL,
    parseOrderFiles, parseSATFile, parseOrdersText,
    crossReference, buildComment, toSheetRow,
    // SAT-only flow + manual + deposits
    pairSATInvoices, buildCommentLine, toSheetRowFromLine,
    manualSheetRows, extractDeposit, matchProperty, parseSpanishDate,
    links, money, prettyDay, mesLargoES, localDayGT, numQ,
  };
})();
