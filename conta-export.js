// ============================================================
// Spacio AM — Contabilidad · exportaciones (CSV / Excel / PDF imprimible)
// ============================================================
(function () {
  "use strict";
  const XLSX_SRC = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  let _xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsxP) return _xlsxP;
    _xlsxP = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = XLSX_SRC; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error("No se pudo cargar Excel."));
      document.head.appendChild(s);
    });
    return _xlsxP;
  }

  const HEAD = ["Fecha", "TT", "Descripción", "No. Doc", "Debe", "Haber", "Saldo", "Tag (Descripción)", "Categoría"];
  function biDate(iso) { const p = String(iso || "").split("-"); return p.length === 3 ? (p[2] + "-" + p[1] + "-" + p[0]) : iso; }
  function rowToArr(r) {
    return [biDate(r.date), r.tt || "", r.desc || "", r.doc || "",
      r.debit || 0, r.credit || 0, r.saldo || 0, r.tag || "", r.category || r.categoria || ""];
  }
  function aoa(rows) { return [HEAD].concat((rows || []).map(rowToArr)); }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }

  function toCSV(rows, filename) {
    const esc = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = "\uFEFF" + aoa(rows).map(r => r.map(esc).join(",")).join("\r\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename || "contabilidad.csv");
  }

  // statements: [{accId, accName, currency, rows}]  -> un libro con una hoja por cuenta
  async function toXLSX(statements, filename) {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    (statements || []).forEach(s => {
      const ws = XLSX.utils.aoa_to_sheet(aoa(s.rows));
      ws["!cols"] = [{ wch: 12 }, { wch: 5 }, { wch: 40 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 32 }, { wch: 24 }];
      const name = (s.accName || s.accId || "Cuenta").slice(0, 28).replace(/[\\/?*\[\]:]/g, " ");
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD]), "Sin datos");
    XLSX.writeFile(wb, filename || "contabilidad.xlsx");
  }

  function money(n, cur) {
    const v = (n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v;
  }
  // Reporte imprimible (abre ventana y manda a imprimir → el usuario guarda como PDF)
  function printReport(meta, statements) {
    const w = window.open("", "_blank");
    if (!w) { alert("Habilita las ventanas emergentes para generar el PDF."); return; }
    const blocks = (statements || []).map(s => {
      const body = (s.rows || []).map(r => {
        const pend = !r.tag;
        return "<tr" + (pend ? ' class="pend"' : "") + "><td>" + biDate(r.date) + "</td><td>" + (r.tt || "") +
          "</td><td class=desc>" + escapeHtml(r.desc || "") + "</td><td class=num>" + (r.debit ? money(r.debit) : "") +
          "</td><td class=num>" + (r.credit ? money(r.credit) : "") + "</td><td class=num>" + money(r.saldo) +
          "</td><td>" + escapeHtml(r.tag || "—") + "</td><td>" + escapeHtml(r.category || r.categoria || "") + "</td></tr>";
      }).join("");
      const td = (s.rows || []).reduce((a, r) => a + (r.debit || 0), 0);
      const tc = (s.rows || []).reduce((a, r) => a + (r.credit || 0), 0);
      return "<section><h2>" + escapeHtml(s.accName || s.accId) + " · <span>" + (s.currency || "") + " · " + escapeHtml(s.number || "") +
        "</span></h2><table><thead><tr><th>Fecha</th><th>TT</th><th>Descripción</th><th>Debe</th><th>Haber</th><th>Saldo</th><th>Tag</th><th>Categoría</th></tr></thead><tbody>" +
        body + "</tbody><tfoot><tr><td colspan=3>Totales</td><td class=num>" + money(td) + "</td><td class=num>" + money(tc) + "</td><td colspan=3></td></tr></tfoot></table></section>";
    }).join("");
    w.document.write(
      "<!DOCTYPE html><html lang=es><head><meta charset=utf-8><title>" + escapeHtml(meta.title || "Contabilidad") + "</title>" +
      "<style>" +
      "@page{size:A4 landscape;margin:14mm}" +
      "body{font-family:'Montserrat',-apple-system,Segoe UI,sans-serif;color:#3E3F3F;margin:0}" +
      ".head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #3E3F3F;padding-bottom:10px;margin-bottom:18px}" +
      ".head h1{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:24px;margin:0;letter-spacing:.01em}" +
      ".head .ey{font-size:9px;letter-spacing:.32em;text-transform:uppercase;color:#938B8A;margin-bottom:6px}" +
      ".head .per{font-size:11px;color:#938B8A;text-align:right}" +
      "section{margin-bottom:22px;break-inside:avoid}" +
      "h2{font-family:Georgia,serif;font-weight:400;font-size:15px;margin:0 0 8px;border-left:3px solid #E9826A;padding-left:9px}" +
      "h2 span{font-size:10px;color:#938B8A;font-family:Montserrat,sans-serif;letter-spacing:.04em}" +
      "table{width:100%;border-collapse:collapse;font-size:9.5px}" +
      "th{text-align:left;text-transform:uppercase;letter-spacing:.08em;font-size:8px;color:#938B8A;border-bottom:1px solid #938B8A;padding:5px 6px}" +
      "td{padding:4px 6px;border-bottom:1px solid #ECE9E4;vertical-align:top}" +
      "td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}" +
      "td.desc{max-width:230px}" +
      "tr.pend td{background:#FBEEE9}" +
      "tfoot td{font-weight:600;border-top:1px solid #3E3F3F;border-bottom:none}" +
      "</style></head><body>" +
      "<div class=head><div><div class=ey>Spacio AM · Contabilidad</div><h1>" + escapeHtml(meta.title || "") + "</h1></div>" +
      "<div class=per>" + escapeHtml(meta.period || "") + "<br>Generado " + new Date().toLocaleDateString("es-GT") + "</div></div>" +
      blocks + "</body></html>");
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 500);
  }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  window.SpacioContaExport = { toCSV, toXLSX, printReport, loadXLSX, HEAD };
})();
