// ============================================================
// Spacio AM — Contabilidad · índice de PDF originales en Drive
// ------------------------------------------------------------
// Estados de cuenta de Banco Industrial ya subidos a Drive
// (mayo 2026 hacia atrás). El contador y el admin pueden
// descargarlos desde la pestaña, por mes y cuenta, aunque ese
// mes todavía no esté clasificado.
//
// El nombre del PDF incluye el número de cuenta, así que cada
// archivo queda mapeado automáticamente a su cuenta:
//   0160186466 → op-gtq   0160186508 → op-usd
//   0160186474 → pr-gtq   0160186482 → pr-usd
//
// Para agregar un mes nuevo a mano: copia el ID del archivo de
// Drive (la parte entre /d/ y /view de su enlace) en el mes y
// cuenta que corresponda.
// ============================================================
(function () {
  "use strict";

  // ym -> { accId: driveFileId }
  const MAP = {
    "2026-01": { "op-gtq": "1ifCnfwTmSAQiVZLx7bbZh8stpKo2qYFR", "op-usd": "1CjwmKyzanbtU2jTkqbEZBjZSOnl3UEL6", "pr-gtq": "1NrVHzAp2cvu3TrxK922b1HPqiGZ8Pdn4", "pr-usd": "1vo5o2_V9WwVVd3u6s9_nyhIUVFR32_DD" },
    "2026-02": { "op-gtq": "16WHzt6ZMKw8jYwSb3mVyan3ZzuwZYt_q", "op-usd": "18_MJvks_HfW8XvmNcnKY22c9ioeiEr48", "pr-gtq": "1ZrbmuRqIi331rzDzX-aiY9f5c6QgJSSx", "pr-usd": "18XhhTREMsgzp67A4y3AoLVCc8Fsbj--A" },
    "2026-03": { "op-gtq": "1x5BllRo4NLLiDAMPzrgsZ2wWa0Xdmsiz", "op-usd": "1cfMGTfzx-ShKqzGuGQtYFaFNwh5cPsuZ", "pr-gtq": "1LTog18AOgwnBgyFHMOSmsL84FJl4glfU", "pr-usd": "1G2ExpArL7uWjy4FlGs6LjISevuWRofI-" },
    "2026-04": { "op-gtq": "16Kmn3CfMQbFDe0Jgrn2lsZdx6l5Szjww", "op-usd": "1vog0-5lL847mcVea3mBE6WJssJpf0NAc", "pr-gtq": "1d146HJ_eZzfri13H8bLkencS45F0JL_I", "pr-usd": "1rvCX0J8QqjF0ipW_DJO2Y3LIndHAJb12" },
    "2026-05": { "op-gtq": "1SG_VROVZ9iPoE-UmOY2YowteEQlf3JoF", "op-usd": "1exuJkGKhCOgSgb9x6NJokQxbWlVCMRbl", "pr-gtq": "1tXJFkzab4uUNnYIdJM7u3rRZnX53zEuV", "pr-usd": "1nZr6zmm8eNDeOHUZNua5FVCZxIbcaZbX" },
  };

  function viewUrl(id) { return "https://drive.google.com/file/d/" + id + "/view"; }
  function get(ym, accId) {
    const m = MAP[ym]; const id = m && m[accId];
    return id ? { id: id, url: viewUrl(id), name: "", fromDrive: true } : null;
  }
  function months() { return Object.keys(MAP).sort().reverse(); }
  function accountsFor(ym) { return Object.keys(MAP[ym] || {}); }

  window.SpacioContaPdfs = { MAP, get, months, accountsFor, viewUrl };
})();
