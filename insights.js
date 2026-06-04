/* ============================================================
   Spacio AM — contextual narrative (context before numbers)
   Editorial one-liners generated from REAL data fields.
   ============================================================ */
(function () {
  "use strict";
  function pct(v) { return Math.round(v * 100) + "%"; }

  window.SpacioInsights = {
    hero(lang, cur, hist) {
      const occ = cur.ocupacionAjustada, avg = hist.avgOcc;
      const up = occ >= avg;
      if (lang === "es") {
        return `Ocupación del ${pct(occ)}, ${up ? "por encima del" : "por debajo del"} promedio histórico de ${pct(avg)} de la propiedad.`;
      }
      return `Occupancy of ${pct(occ)}, ${up ? "above" : "below"} the property's historical average of ${pct(avg)}.`;
    },
    netContext(lang, cur, prev, money) {
      const d = prev ? (cur.ingresoNeto - prev.ingresoNeto) : null;
      if (lang === "es") {
        if (d == null) return "El monto final que recibes después de comisión, gastos e impuestos.";
        return d >= 0 ? `Recibiste ${money(d)} más que el período anterior.` : `Recibiste ${money(-d)} menos que el período anterior.`;
      }
      if (d == null) return "What you take home after fee, expenses and taxes.";
      return d >= 0 ? `You received ${money(d)} more than the previous period.` : `You received ${money(-d)} less than the previous period.`;
    },
    season(lang, slice) {
      const present = slice.filter(m => m.present);
      if (present.length < 2) return lang === "es" ? "Un mes sólido para tu espacio." : "A solid month for your space.";
      const first = present[0].ingresoBruto, last = present[present.length - 1].ingresoBruto;
      const rising = last >= first;
      if (lang === "es") return rising ? "Las reservas vienen en ascenso durante esta temporada." : "La demanda entra en su valle estacional; es normal y esperado.";
      return rising ? "Bookings have been climbing through this season." : "Demand is entering its seasonal low; this is normal and expected.";
    },
    fee(lang, cur, money) {
      const ratio = cur.ingresoBruto ? cur.fee / cur.ingresoBruto : 0;
      if (lang === "es") return `La comisión de Spacio AM representó ${pct(ratio)} del ingreso bruto — ${money(cur.fee)} por gestionar tu propiedad de principio a fin.`;
      return `The Spacio AM fee was ${pct(ratio)} of gross income — ${money(cur.fee)} for managing your property end to end.`;
    },
    opportunity(lang, cur, money) {
      const blocked = cur.nochesBloqueadas;
      const cost = cur.costoOportunidad || Math.round(blocked * cur.adr);
      if (lang === "es") {
        if (!blocked) return { lead: "No registraste estadías propias este período.", body: "Tu propiedad estuvo disponible al máximo para generar ingresos." };
        return {
          lead: `Usaste tu propiedad ${blocked} ${blocked === 1 ? "noche" : "noches"} este período.`,
          body: `El ingreso potencial estimado de esas noches habría sido de ${money(cost)} — el costo de darte ese descanso en tu propio espacio.`,
        };
      }
      if (!blocked) return { lead: "You logged no personal stays this period.", body: "Your property was fully available to generate income." };
      return {
        lead: `You used your property ${blocked} ${blocked === 1 ? "night" : "nights"} this period.`,
        body: `Estimated potential income from those nights would have been ${money(cost)} — the cost of resting in your own space.`,
      };
    },
    occContext(lang, cur, hist) {
      const up = cur.ocupacionAjustada >= hist.avgOcc;
      if (lang === "es") return up
        ? "Por encima del promedio histórico: tu disponibilidad se está aprovechando bien."
        : "Por debajo del promedio histórico: vale la pena revisar precios o estancias mínimas.";
      return up
        ? "Above the historical average: your availability is being used well."
        : "Below the historical average: worth reviewing pricing or minimum stays.";
    },
  };
})();
