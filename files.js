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
  function keyOf(rec) {
    var who = rec.scope === "owner" ? ("owner:" + norm(rec.owner)) : ("prop:" + norm(rec.property_name));
    return [rec.tipo, who, rec.ym].join("|");
  }

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
      pub.forEach(function (r) { byKey[keyOf(r)] = r; });
      loc.forEach(function (r) { byKey[keyOf(r)] = r; }); // local gana (más reciente)
      return Object.values(byKey);
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

    // sube un archivo; resuelve con el registro creado
    upload: async function (params) {
      // params: { kind, scope, owner, property_name, ym, file }
      var rec = {
        tipo: params.kind, scope: params.scope || "property",
        owner: params.owner || "", property_name: params.scope === "owner" ? "" : (params.property_name || ""),
        ym: params.ym, archivo: "", url: "", local: true, ts: Date.now(),
      };
      var backend = window.SpacioWrite && window.SpacioWrite.enabled && window.SpacioWrite.enabled();
      if (backend) {
        var b64 = await fileToBase64(params.file);
        var res = await window.SpacioWrite.post("uploadFile", {
          kind: params.kind, scope: rec.scope, owner: rec.owner,
          property_name: params.property_name || "", mes: params.ym,
          fileName: params.file.name, mimeType: params.file.type, dataBase64: b64,
        });
        if (res && res.ok) {
          rec.archivo = res.fileName || params.file.name; rec.url = res.url || ""; rec.local = false;
          this._remember(rec); emit();
          return { ok: true, rec: rec };
        }
        // si falla el backend, caemos a local para no perder el trabajo
      }
      // fallback local: URL de sesión (no sobrevive recarga, pero el registro sí)
      rec.archivo = params.file.name;
      try { rec.url = URL.createObjectURL(params.file); } catch (e) { rec.url = ""; }
      rec.sessionOnly = true;
      this._remember(rec); emit();
      return { ok: true, rec: rec, local: true };
    },

    _remember: function (rec) {
      var loc = readLocal();
      var k = keyOf(rec);
      loc = loc.filter(function (r) { return keyOf(r) !== k; });
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
