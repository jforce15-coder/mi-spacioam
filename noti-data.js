/* Fuentes de notificaciones del Dashboard de Propietarios.
   Convierte las señales reales de la app (facturas del mes sin subir, facturas
   que no se guardaron) en items para el centro de notificaciones.
   Contrato de cada item: { id, texto, contexto, ts, tipo, subcat, peso, abrir }.
   tipo: "accion" (Necesita tu acción) | "alerta" (Alertas importantes).
   Expone window.SpacioNotis. */
(function () {
  "use strict";
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function monthName(lang, y, m) {
    try { return cap(SpacioI18n.monthLong(lang, m)) + " " + y; }
    catch (e) { return (m + 1) + "/" + y; }
  }

  // Facturas mensuales del socio que faltan por subir.
  function facturasPendientes(ctx) {
    var SF = ctx.SF, out = [];
    if (!SF || ctx.isAdmin || ctx.isContador) return out;
    var es = ctx.lang !== "en";
    var scope = ctx.isAll ? "owner" : "property";
    var oLabel = ctx.ownerLabel || (ctx.owner && (ctx.owner.name || ctx.owner.code)) || "";
    var propName = ctx.isAll ? "" : (ctx.activeProps && ctx.activeProps[0] ? ctx.activeProps[0].name : "");
    // últimos meses presentes, del año en que empieza la exigencia en adelante
    var meses = (ctx.months || []).filter(function (m) { return m.present && m.y >= SF.ENFORCE_FROM_YEAR; }).slice(-6);
    meses.forEach(function (m) {
      var ymS = m.y + "-" + String(m.m + 1).padStart(2, "0");
      var income = (m.ingresoNeto != null) ? m.ingresoNeto : (m.ingresoBruto || 0);
      if (income <= 0.5) return; // meses sin ingreso no exigen factura
      var cov = SF.coverage("factura", { scope: scope, owner: oLabel, property_name: propName, ym: ymS });
      if (cov) return;
      var u = (SF.urgency ? SF.urgency(m.y, m.m) : { level: 1, days: 0 });
      if (!u || u.level < 1) return;
      var nombre = monthName(ctx.lang, m.y, m.m);
      out.push({
        id: "inv|" + scope + "|" + (propName || oLabel) + "|" + ymS,
        tipo: u.level >= 2 ? "alerta" : "accion",
        subcat: es ? "Facturas" : "Invoices",
        texto: es ? ("Falta tu factura de " + nombre + ".") : ("Your invoice for " + nombre + " is missing."),
        contexto: ctx.isAll ? (es ? "Todas tus propiedades" : "All your properties") : propName,
        ts: Date.now() - (u.days || 0) * 86400000,
        peso: u.level * 10000 + (u.days || 0),
        abrir: function () { ctx.goToMonth && ctx.goToMonth(m.y, m.m); },
      });
    });
    return out;
  }

  // Facturas que este dispositivo intentó subir y NO llegaron al Drive.
  function facturasNoGuardadas(ctx) {
    var SF = ctx.SF, out = [];
    if (!SF || !SF.pending) return out;
    var es = ctx.lang !== "en";
    (SF.pending("factura") || []).forEach(function (r, i) {
      out.push({
        id: "pend|" + (r.ym || "") + "|" + (r.archivo || i),
        tipo: "alerta",
        subcat: es ? "Facturas" : "Invoices",
        texto: es ? "Una factura no se guardó. Vuelve a subirla." : "An invoice wasn't saved. Upload it again.",
        contexto: [r.ym, r.archivo].filter(Boolean).join(" · "),
        ts: r.ts || Date.now(),
        peso: 90000,
        abrir: function () {
          if (r.ym && ctx.goToMonthStr) ctx.goToMonthStr(r.ym);
          else ctx.goToLiq && ctx.goToLiq();
        },
      });
    });
    return out;
  }

  window.SpacioNotis = {
    build: function (ctx) {
      var list = [];
      if (ctx.isAdmin) {
        try { list = list.concat(adminNotis(ctx)); } catch (e) {}
        return list;
      }
      try { list = list.concat(facturasPendientes(ctx)); } catch (e) {}
      try { list = list.concat(facturasNoGuardadas(ctx)); } catch (e) {}
      return list;
    },
  };

  // ── ADMIN ──────────────────────────────────────────────────
  // Fechas límite (mes de CIERRE = mes calendario anterior):
  //   · Depósitos a socios ......... 5º día hábil del mes
  //   · Constancias de retención ... día 10
  //   · Archivos de contabilidad ... día 10
  function nthBusinessDay(y, m, n) {
    var d = new Date(y, m, 1), count = 0;
    while (count < n) { var wd = d.getDay(); if (wd !== 0 && wd !== 6) count++; if (count < n) d.setDate(d.getDate() + 1); }
    return d.getDate();
  }
  function ymStr(y, m) { return y + "-" + String(m + 1).padStart(2, "0"); }
  // día del mes en curso a partir del cual una entrega del mes anterior está vencida
  function overdueSince(kind, now) {
    if (kind === "deposito") return nthBusinessDay(now.getFullYear(), now.getMonth(), 5);
    return 10; // retención y contabilidad
  }

  function contaCubierto(ym) {
    try {
      var live = window.SpacioContaLive;
      if (live && live.keys && live.keys().some(function (k) { return String(k).indexOf(ym) === 0; })) return true;
      var pdfs = window.SpacioContaPdfs;
      if (pdfs && pdfs.months && pdfs.months().indexOf(ym) >= 0) return true;
      var d = window.SpacioData;
      if (d && Array.isArray(d.conta) && d.conta.some(function (r) { return (r.ym || "") === ym; })) return true;
    } catch (e) {}
    return false;
  }

  function adminNotis(ctx) {
    var SF = ctx.SF, out = [];
    if (!SF) return out;
    var es = ctx.lang !== "en";
    var now = new Date();
    var enforce = SF.ENFORCE_FROM_YEAR || 2026;
    // mes de cierre = mes anterior; si aún no llega la fecha límite del actual, igual
    // reportamos el anterior (ya vencido o por vencer).
    var tY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    var tM = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    if (tY < enforce) return out;
    var ym = ymStr(tY, tM);
    var nombre = (function () { try { return cap(SpacioI18n.monthLong(ctx.lang, tM)) + " " + tY; } catch (e) { return ym; } })();
    var dia = now.getDate();
    var props = ctx.allProps || [];

    // helper: nombre del socio de una propiedad
    function ownerLabelOf(p) {
      var o = (window.SpacioData && SpacioData.owners || []).find(function (o) { return (o.codes || [o.code]).indexOf(p.code) >= 0; });
      return o ? (o.name || o.code) : p.code;
    }
    function monthOf(p) { return (p.months || []).find(function (mo) { return mo.y === tY && mo.m === tM && mo.present; }); }

    // 1) DEPÓSITOS A SOCIOS — 5º día hábil
    var depLim = overdueSince("deposito", now);
    var depDue = dia >= depLim;
    var depFaltan = [];
    props.forEach(function (p) {
      var mo = monthOf(p); if (!mo) return;
      var monto = (mo.deposito != null ? mo.deposito : mo.ingresoNeto) || 0;
      if (monto <= 0.5) return;
      var oLabel = ownerLabelOf(p);
      var cov = SF.coverageAll("deposito", { scope: "property", owner: oLabel, property_name: p.name, ym: ym });
      if (cov && cov.length) return;
      depFaltan.push(p.name);
    });
    if (depFaltan.length) {
      out.push({
        id: "adm-dep|" + ym,
        tipo: depDue ? "alerta" : "accion",
        subcat: es ? "Depósitos a socios" : "Owner deposits",
        texto: es ? ("Faltan " + depFaltan.length + " depósito" + (depFaltan.length === 1 ? "" : "s") + " a socios de " + nombre + ".")
                  : (depFaltan.length + " owner deposit" + (depFaltan.length === 1 ? "" : "s") + " missing for " + nombre + "."),
        contexto: (es ? "Límite: 5º día hábil · " : "Due: 5th business day · ") + depFaltan.slice(0, 4).join(", ") + (depFaltan.length > 4 ? "…" : ""),
        ts: depDue ? now.getTime() - (dia - depLim) * 86400000 : now.getTime(),
        peso: (depDue ? 40000 : 20000) + depFaltan.length,
        abrir: function () { ctx.goToTab && ctx.goToTab("deposits"); },
      });
    }

    // 2) CONSTANCIAS DE RETENCIÓN — día 10
    var retDue = dia >= 10;
    var retFaltan = [];
    props.forEach(function (p) {
      if (!p.flagRetencion) return;
      var mo = monthOf(p); if (!mo) return;
      if (Math.abs(mo.retencion || 0) <= 0.5) return;
      var oLabel = ownerLabelOf(p);
      var cov = SF.coverage("retencion", { scope: "property", owner: oLabel, property_name: p.name, ym: ym });
      if (cov) return;
      retFaltan.push(p.name);
    });
    if (retFaltan.length) {
      out.push({
        id: "adm-ret|" + ym,
        tipo: retDue ? "alerta" : "accion",
        subcat: es ? "Retenciones" : "Withholding",
        texto: es ? ("Faltan " + retFaltan.length + " constancia" + (retFaltan.length === 1 ? "" : "s") + " de retención de " + nombre + ".")
                  : (retFaltan.length + " withholding certificate" + (retFaltan.length === 1 ? "" : "s") + " missing for " + nombre + "."),
        contexto: (es ? "Límite: día 10 · " : "Due: 10th · ") + retFaltan.slice(0, 4).join(", ") + (retFaltan.length > 4 ? "…" : ""),
        ts: retDue ? now.getTime() - (dia - 10) * 86400000 : now.getTime(),
        peso: (retDue ? 38000 : 18000) + retFaltan.length,
        abrir: function () { ctx.goToTab && ctx.goToTab("deposits"); },
      });
    }

    // 3) ARCHIVOS DE CONTABILIDAD — día 10
    var conDue = dia >= 10;
    if (!contaCubierto(ym)) {
      out.push({
        id: "adm-con|" + ym,
        tipo: conDue ? "alerta" : "accion",
        subcat: es ? "Contabilidad" : "Accounting",
        texto: es ? ("Faltan los archivos de contabilidad de " + nombre + ".") : ("Accounting files for " + nombre + " are missing."),
        contexto: es ? "Límite: día 10 · estados de cuenta del mes" : "Due: 10th · monthly statements",
        ts: conDue ? now.getTime() - (dia - 10) * 86400000 : now.getTime(),
        peso: conDue ? 36000 : 16000,
        abrir: function () { ctx.goToTab && ctx.goToTab("conta"); },
      });
    }

    return out;
  }
})();
