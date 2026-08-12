/* ============================================================
   Spacio AM — Cliente de archivos (facturas / depositos a socios)
   ------------------------------------------------------------
   - Sube facturas/depositos a Drive vía Apps Script (action "uploadFile").
   - Si no hay backend configurado, guarda un registro local (localStorage)
     con una URL de sesión, para que el flujo sea demostrable.
   - Lee el registro publicado (SpacioData.files) + lo pendiente local para
     saber qué períodos están cubiertos y cuáles faltan (alertas).
   Expone window.SpacioFiles.
   ============================================================ */
(function () {
  "use strict";
  var LOCAL_KEY = "sa-files-local";
  var ENFORCE_FROM_YEAR = 2026; // solo exigimos facturas de 2026 en adelante

  function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch (e) { return []; } }
  function writeLocal(arr) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)); } catch (e) {} }
  function emit() { try { window.dispatchEvent(new CustomEvent("spacio-files")); } catch (e) {} }

  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[–—]/g, "-").replace(/[^a-z0-9\-]/g, ""); }
  // deriva "YYYY-MM" de una fecha ISO, dd/mm/yyyy o "18 May 2026" / "mayo de 2026"
  var ES_M = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
  function ymFromDate(s) {
    s = String(s || "");
    var m = s.match(/(\d{4})-(\d{1,2})/); if (m) return m[1] + "-" + String(+m[2]).padStart(2, "0");
    m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); if (m) return m[3] + "-" + String(+m[2]).padStart(2, "0");
    m = s.toLowerCase().match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?\s*(?:de\s+)?(\d{4})/);
    if (m) return m[2] + "-" + String(ES_M[m[1]]).padStart(2, "0");
    m = s.match(/(\d{4})/); if (m) return m[1] + "-01";
    return "";
  }
  // propiedades (nombres) de un socio, por nombre legible o código
  function ownerProps(ownerName) {
    var D = window.SpacioData || {};
    var o = (D.owners || []).find(function (x) { return (x.name || x.code) === ownerName || x.code === ownerName; });
    if (!o) return [""];
    var codes = o.codes || [o.code];
    var list = (D.propertyList || []).filter(function (p) { return codes.indexOf(p.code) >= 0; }).map(function (p) { return p.name; });
    return list.length ? list : [""];
  }
  function keyOf(rec) {
    var who = rec.scope === "owner" ? ("owner:" + norm(rec.owner)) : ("prop:" + norm(rec.property_name));
    return [rec.tipo, who, rec.ym].join("|");
  }
  // identidad ÚNICA de un archivo (permite varios por propiedad/mes): incluye el
  // nombre del archivo (único en Drive) o el fid local.
  function fidOf(rec) {
    if (rec.fid) return rec.fid;
    var who = rec.scope === "owner" ? ("owner:" + norm(rec.owner)) : ("prop:" + norm(rec.property_name));
    return [rec.tipo, who, rec.ym, rec.archivo || rec.url || ""].join("|");
  }
  var TOMB_KEY = "sa-files-deleted";
  function readTomb() { try { return JSON.parse(localStorage.getItem(TOMB_KEY)) || []; } catch (e) { return []; } }
  function writeTomb(a) { try { localStorage.setItem(TOMB_KEY, JSON.stringify(a)); } catch (e) {} }

  function fileToBase64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ""); res(s.slice(s.indexOf(",") + 1)); };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }

  var SpacioFiles = {
    ENFORCE_FROM_YEAR: ENFORCE_FROM_YEAR,

    // todos los registros (publicados + locales), con el local pisando al publicado
    records: function () {
      var pub = (window.SpacioData && window.SpacioData.files) || [];
      var loc = readLocal();
      var byKey = {};
      // merge por identidad ÚNICA (fid) → varios archivos por propiedad/mes coexisten
      pub.forEach(function (r) { byKey[fidOf(r)] = r; });
      loc.forEach(function (r) { byKey[fidOf(r)] = r; }); // local gana (más reciente)
      var tomb = readTomb();
      // los registros FALLIDOS (no llegaron a Drive) no cuentan como cobertura:
      // se listan aparte con pending() para poder volver a subirlos.
      return Object.values(byKey).filter(function (r) { return tomb.indexOf(fidOf(r)) < 0 && !r.failed; });
    },

    // archivos que este dispositivo intentó subir y NO se guardaron en Drive.
    // Sirven de rastro para volver a cargarlos (el archivo en sí ya no existe).
    pending: function (kind) {
      var tomb = readTomb();
      return readLocal().filter(function (r) {
        return r.failed && tomb.indexOf(fidOf(r)) < 0 && (!kind || r.tipo === kind);
      }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    },

    // TODOS los archivos que cubren una propiedad/socio para un mes (puede haber
    // varios depósitos). A nivel propiedad incluye también los del socio.
    coverageAll: function (kind, opts) {
      var ym = opts.ym, ownerN = norm(opts.owner), propN = norm(opts.property_name);
      var hits = this.records().filter(function (r) {
        if (r.tipo !== kind || r.ym !== ym) return false;
        if (opts.scope === "owner") return r.scope === "owner" && ownerN && norm(r.owner) === ownerN;
        return (r.scope === "property" && propN && norm(r.property_name) === propN) ||
               (r.scope === "owner" && ownerN && norm(r.owner) === ownerN);
      });
      // dedupe: el MISMO depósito puede quedar registrado a la vez a nivel propiedad
      // y a nivel socio (o subirse dos veces) — no debe mostrarse como dos botones.
      // Firma: mismo monto+fecha = mismo depósito; si no hay, por url; si no, por fid.
      var seen = {}, out = [];
      hits.forEach(function (r) {
        var sig = (r.monto != null && r.monto !== "" && r.fecha)
          ? "m:" + Math.round(Number(r.monto) * 100) + "|" + r.fecha
          : (r.url ? "u:" + r.url : "f:" + (r.fid || ""));
        if (seen[sig]) return;
        seen[sig] = true; out.push(r);
      });
      return out;
    },

    // ¿hay archivo para este período? property: cubre el de la propiedad O el del socio.
    coverage: function (kind, opts) {
      var recs = this.records();
      var ym = opts.ym;
      var ownerN = norm(opts.owner);
      var propN = norm(opts.property_name);
      var byOwner = null, byProp = null;
      recs.forEach(function (r) {
        if (r.tipo !== kind || r.ym !== ym) return;
        if (r.scope === "owner" && ownerN && norm(r.owner) === ownerN) byOwner = r;
        if (r.scope === "property" && propN && norm(r.property_name) === propN) byProp = r;
      });
      // si piden a nivel socio, solo cuenta el del socio
      if (opts.scope === "owner") return byOwner || null;
      return byProp || byOwner || null; // a nivel propiedad, el del socio también cubre
    },

    // como coverage pero, si no hay archivo para ese mes exacto, devuelve el más
    // reciente de esa propiedad/socio (para que el comprobante siempre sea visible
    // aunque el admin esté viendo otro período).
    coverageLatest: function (kind, opts) {
      var exact = this.coverage(kind, opts);
      if (exact) return exact;
      var ownerN = norm(opts.owner), propN = norm(opts.property_name);
      var best = null;
      this.records().forEach(function (r) {
        if (r.tipo !== kind) return;
        var hit = (r.scope === "owner" && ownerN && norm(r.owner) === ownerN) ||
                  (r.scope === "property" && propN && norm(r.property_name) === propN);
        if (!hit) return;
        if (!best || String(r.ym) > String(best.ym)) best = r;
      });
      return best;
    },

    // lista todos los archivos de un tipo (p.ej. "deposito"), ordenados por mes desc.
    list: function (kind) {
      var tomb = readTomb();
      var out = this.records()
        .filter(function (r) { return r.tipo === kind; });
      // respaldo: depósitos registrados en "Depositos cargados" que no tengan
      // ya un archivo en el registro (para que SIEMPRE se vean tras recargar)
      if (kind === "deposito") {
        // ya cubiertos: por propiedad+mes Y por propiedad+monto (evita el
        // duplicado "fantasma sin enlace" cuando el archivo quedó en otro mes)
        var have = {}, haveAmt = {}, haveFile = {};
        out.forEach(function (r) {
          // un comprobante a nivel SOCIO cubre a todas sus propiedades: si no se
          // expande aquí, la hoja genera una copia fantasma por cada propiedad.
          var props = r.scope === "owner" ? ownerProps(r.owner) : [r.property_name];
          props.forEach(function (pn) {
            have[norm(pn) + "|" + (r.ym || "")] = true;
            if (r.monto) haveAmt[norm(pn) + "|" + Math.round(r.monto * 100)] = true;
          });
          if (r.archivo) haveFile[norm(r.archivo)] = true;
        });
        var deps = (window.SpacioData && window.SpacioData.depositos) || [];
        deps.forEach(function (d, i) {
          var ym = ymFromDate(d.fecha);
          var key = norm(d.property_name) + "|" + ym;
          var amtKey = norm(d.property_name) + "|" + Math.round((d.monto || 0) * 100);
          // el mismo archivo ya está en el registro (aunque la hoja lo repita por propiedad)
          if (d.archivo && haveFile[norm(d.archivo)]) return;
          if (have[key] || (d.monto && haveAmt[amtKey])) return; // ya hay archivo para este depósito
          // fid estable para poder ocultarlo/borrarlo (tumba)
          var fid = "sheet|" + norm(d.property_name) + "|" + ym + "|" + Math.round((d.monto || 0) * 100);
          if (tomb.indexOf(fid) >= 0) return;
          have[key] = true;
          out.push({ fid: fid, tipo: "deposito", scope: "property", owner: "", property_name: d.property_name, ym: ym, archivo: d.archivo || "", url: "", monto: d.monto, cuenta: d.cuenta, fecha: d.fecha, fromSheet: true });
        });
      }
      return out.sort(function (a, b) { return String(b.ym).localeCompare(String(a.ym)); });
    },

    // sube un archivo; resuelve con el registro creado
    upload: async function (params) {
      // params: { kind, scope, owner, property_name, ym, file, multiple, monto, cuenta, fecha }
      var fid = "f" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      var multiple = params.multiple != null ? params.multiple : (params.kind === "deposito");
      var rec = {
        fid: fid,
        tipo: params.kind, scope: params.scope || "property",
        owner: params.owner || "", property_name: params.scope === "owner" ? "" : (params.property_name || ""),
        ym: params.ym, archivo: "", url: "", local: true, ts: Date.now(),
        // gasto específico al que pertenece la factura (orderId de insumos & gastos)
        orderId: params.orderId || "",
        // cuenta bancaria (estados de cuenta de Contabilidad)
        account: params.account || "",
        // metadatos opcionales para mostrar en listas (depósitos: monto, cuenta, fecha)
        monto: params.monto != null ? params.monto : "", cuenta: params.cuenta || "", fecha: params.fecha || "",
      };
      var backend = window.SpacioWrite && window.SpacioWrite.enabled && window.SpacioWrite.enabled();
      if (backend) {
        var b64 = await fileToBase64(params.file);
        var res = await window.SpacioWrite.post("uploadFile", {
          kind: params.kind, scope: rec.scope, owner: rec.owner,
          property_name: params.property_name || "", mes: params.ym, multiple: multiple, fid: fid,
          orderId: params.orderId || "", account: params.account || "",
          fileName: params.file.name, mimeType: params.file.type, dataBase64: b64,
        });
        if (res && res.ok) {
          rec.archivo = res.fileName || params.file.name; rec.url = res.url || ""; rec.local = false;
          this._remember(rec, multiple); emit();
          return { ok: true, rec: rec, fileName: rec.archivo, url: rec.url };
        }
        // el backend falló: guardamos SOLO el rastro (marcado como fallido) para
        // que el socio vea qué factura hay que volver a subir, y avisamos.
        rec.archivo = params.file.name; rec.failed = true;
        rec.error = (res && res.error) || "backend";
        this._remember(rec, true); emit();
        return { ok: false, error: rec.error, rec: rec };
      }
      // SIN conexión de escritura: el archivo no puede salir del dispositivo.
      // Antes se guardaba una URL de sesión que moría al recargar (las facturas
      // "desaparecían"). Ahora se registra como fallida y se avisa al usuario.
      rec.archivo = params.file.name; rec.failed = true; rec.error = "no-backend";
      this._remember(rec, true); emit();
      return { ok: false, error: "no-backend", rec: rec };
    },

    // borra un archivo (por su registro): quita del local, marca tumba para ocultar
    // el publicado, y pide al backend borrarlo de Drive + hoja de registro.
    remove: async function (rec) {
      var fid = fidOf(rec);
      var loc = readLocal().filter(function (r) { return fidOf(r) !== fid; });
      writeLocal(loc);
      var tomb = readTomb(); if (tomb.indexOf(fid) < 0) tomb.push(fid); writeTomb(tomb);
      emit();
      var backend = window.SpacioWrite && window.SpacioWrite.enabled && window.SpacioWrite.enabled();
      if (backend) {
        try {
          if (rec.fromSheet) {
            // fila solo en "Depositos cargados" (sin archivo en Drive): borra la fila
            await window.SpacioWrite.post("deleteDeposito", {
              property_name: rec.property_name || "", monto: rec.monto, fecha: rec.fecha || "",
            });
          } else {
            await window.SpacioWrite.post("deleteFile", {
              kind: rec.tipo, scope: rec.scope, owner: rec.owner || "",
              property_name: rec.property_name || "", mes: rec.ym, archivo: rec.archivo || "",
            });
          }
        } catch (e) {}
      }
      return { ok: true };
    },

    _remember: function (rec, multiple) {
      var loc = readLocal();
      if (!multiple) {
        // un solo archivo por (tipo, propiedad/socio, mes): reemplaza el anterior
        var k = keyOf(rec);
        loc = loc.filter(function (r) { return keyOf(r) !== k; });
      }
      loc.push(rec); writeLocal(loc);
    },

    // meses 2026 (hasta el mes actual) con ingreso presente pero SIN factura.
    // props: lista de objetos propiedad del scope; owner: código/nombre del socio.
    missingInvoiceMonths: function (opts) {
      var self = this;
      var owner = opts.owner;
      var props = opts.properties || [];
      var now = new Date();
      var nowY = now.getFullYear(), nowM = now.getMonth();
      var seen = {};
      var out = [];
      props.forEach(function (p) {
        (p.months || []).forEach(function (mo) {
          if (!mo.present) return;
          if (mo.y < ENFORCE_FROM_YEAR) return;            // solo 2026+
          if (mo.y > nowY || (mo.y === nowY && mo.m > nowM)) return; // no meses futuros
          // el mes en curso solo se exige pasado el día 15; los meses cerrados siempre
          var isClosed = (mo.y < nowY) || (mo.y === nowY && mo.m < nowM);
          if (!isClosed && self.urgency(mo.y, mo.m).level < 1) return;
          var income = (mo.deposito || mo.ingresoNeto || 0);
          if (income <= 0.5) return;
          var ym = mo.y + "-" + String(mo.m + 1).padStart(2, "0");
          // cubierto si hay factura de la propiedad o del socio para ese mes
          var cov = self.coverage("factura", { owner: owner, property_name: p.name, ym: ym });
          if (cov) return;
          var key = ym; // agrupamos por mes a nivel scope
          if (!seen[key]) { seen[key] = { y: mo.y, m: mo.m, ym: ym, props: [] }; out.push(seen[key]); }
          seen[key].props.push(p.name);
        });
      });
      return out.sort(function (a, b) { return (a.y - b.y) || (a.m - b.m); });
    },

    // nivel de urgencia de una factura faltante del mes (y,m), según el día actual:
    //   level 0: antes del 15        → sin alerta
    //   level 1: del 15 al 24        → alerta sutil EN el bloque "monto a facturar"
    //   level 2: del 25 a fin de mes → alerta un poco mayor, en el mismo bloque
    //   level 3: pasado el mes (>30) → alerta arriba, junto a los filtros
    urgency: function (y, m) {
      var now = new Date();
      var d15 = new Date(y, m, 15);
      var d25 = new Date(y, m, 25);
      var endNext = new Date(y, m + 1, 1); // 1° del mes siguiente (pasado el 30/fin de mes)
      var days = Math.floor((now.getTime() - d15.getTime()) / 86400000);
      if (now < d15) return { level: 0, days: days };
      if (now < d25) return { level: 1, days: days };
      if (now < endNext) return { level: 2, days: days };
      return { level: 3, days: days };
    },

    // ¿hoy es posterior a julio 2026? (gate de la alerta de "más de 2 meses sin facturar")
    backlogActive: function () {
      var now = new Date();
      return now.getFullYear() > 2026 || (now.getFullYear() === 2026 && now.getMonth() >= 7); // ago 2026+
    },
  };

  window.SpacioFiles = SpacioFiles;
})();
