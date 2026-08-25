// ============================================================
// Spacio AM — Módulo Gastos PedidosYa (solo admin)
// Bloque dentro de la pestaña "Gastos e inversiones".
// Sube Excel SAT + JSON de PedidosYa, cruza por fecha+monto,
// permite asignar property_name / categoría / tag, ver factura
// y pedido en un box, y escribe en "insumos & gastos".
// ============================================================
const { useState: pyaUseState, useEffect: pyaUseEffect, useMemo: pyaUseMemo, useRef: pyaUseRef } = React;

const PYA_STYLE = `
.pya-block { margin-top: 18px; }
.pya-card { background: var(--alabaster); border: 1px solid var(--ink-08); border-radius: 24px; box-shadow: var(--shadow-sm); overflow: hidden; }
.pya-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 24px 26px 18px; border-bottom: 1px solid var(--ink-08); }
.pya-head-title { font-family: var(--serif); font-weight: 400; font-size: clamp(22px,2.6vw,28px); letter-spacing: -0.01em; line-height: 1.08; color: var(--ink); margin: 8px 0 0; }
.pya-head-sub { font-family: var(--sans); font-size: 12.5px; letter-spacing: 0.04em; line-height: 1.6; color: var(--fg-muted); margin: 8px 0 0; max-width: 560px; text-wrap: pretty; }
.pya-body { padding: 22px 26px 26px; }

.pya-drops { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 720px) { .pya-drops { grid-template-columns: 1fr 1fr; } }
.pya-drop { position: relative; display: flex; gap: 14px; align-items: flex-start; border: 1.5px dashed var(--warm-grey); border-radius: 18px; padding: 18px; background: var(--beige-soft); cursor: pointer; transition: border-color .18s var(--ease), background .18s var(--ease); }
.pya-drop:hover, .pya-drop.drag { border-color: var(--peach); background: var(--alabaster); }
.pya-drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.pya-drop-ic { flex-shrink: 0; width: 42px; height: 42px; border-radius: 12px; background: var(--alabaster); border: 1px solid var(--ink-08); display: flex; align-items: center; justify-content: center; }
.pya-drop.drag .pya-drop-ic, .pya-drop:hover .pya-drop-ic { border-color: var(--peach); }
.pya-drop-lbl { font-family: var(--sans); font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--ink); }
.pya-drop-hint { font-family: var(--sans); font-size: 11px; letter-spacing: 0.03em; line-height: 1.5; color: var(--fg-muted); margin-top: 4px; text-wrap: pretty; }
.pya-drop-done { font-family: var(--sans); font-size: 11px; letter-spacing: 0.03em; color: #5B8A6B; margin-top: 6px; display: flex; align-items: center; gap: 6px; }

.pya-stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 4px; }
.pya-stat { display: inline-flex; align-items: baseline; gap: 7px; padding: 8px 13px; border-radius: 999px; background: var(--beige-soft); }
.pya-stat b { font-family: var(--sans); font-size: 14px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.pya-stat span { font-family: var(--sans); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-muted); }

.pya-warn { display: flex; gap: 10px; align-items: flex-start; background: var(--peach-12); border-radius: 14px; padding: 13px 15px; margin-top: 14px; }
.pya-warn p { font-family: var(--sans); font-size: 11.5px; line-height: 1.55; letter-spacing: 0.02em; color: var(--ink); margin: 0; }

.pya-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin: 22px 0 14px; }
.pya-filters { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.pya-fchip { border: 1px solid var(--ink-08); background: var(--alabaster); cursor: pointer; border-radius: 999px; padding: 7px 13px; font-family: var(--sans); font-size: 10.5px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-muted); transition: all .16s var(--ease); }
.pya-fchip:hover { color: var(--ink); }
.pya-fchip.on { background: var(--ink); color: var(--alabaster); border-color: var(--ink); }

.pya-scroll { overflow-x: auto; max-height: 420px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--ink-08); border-radius: 18px; }
.pya-table { width: 100%; min-width: 1080px; border-collapse: collapse; }
.pya-table th { position: sticky; top: 0; z-index: 2; background: var(--beige-soft); font-family: var(--sans); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-muted); text-align: left; padding: 12px 12px; white-space: nowrap; }
.pya-table td { padding: 11px 12px; border-top: 1px solid var(--ink-08); font-family: var(--sans); font-size: 12px; color: var(--ink); vertical-align: middle; }
.pya-table tr.imported td { opacity: 0.5; }
.pya-table tr:hover td { background: var(--beige-30); }
.pya-num { font-variant-numeric: tabular-nums; white-space: nowrap; }

.pya-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 999px; font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.pya-badge .dot { width: 7px; height: 7px; border-radius: 50%; }
.pya-badge.matched { background: rgba(91,138,107,0.12); color: #4d7a5d; }
.pya-badge.matched .dot { background: #5B8A6B; }
.pya-badge.revisar { background: var(--peach-12); color: #c25a40; }
.pya-badge.revisar .dot { background: var(--peach); }
.pya-badge.sin { background: var(--beige-soft); color: var(--fg-muted); }
.pya-badge.sin .dot { background: var(--warm-grey); }
.pya-badge.dupe { background: var(--ink); color: var(--alabaster); }

.pya-link { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--ink-08); background: var(--alabaster); cursor: pointer; border-radius: 9px; padding: 6px 9px; font-family: var(--sans); font-size: 10px; font-weight: 500; letter-spacing: 0.06em; color: var(--ink); transition: all .16s var(--ease); white-space: nowrap; }
.pya-link:hover { border-color: var(--peach); color: var(--peach); }
.pya-link:disabled { opacity: 0.4; cursor: default; }

.pya-mini { position: relative; }
.pya-mini-btn { width: 100%; min-width: 130px; display: flex; align-items: center; justify-content: space-between; gap: 6px; cursor: pointer; background: var(--alabaster); border: 1px solid var(--warm-grey); border-radius: 9px; padding: 7px 9px; font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.02em; color: var(--ink); text-align: left; }
.pya-mini-btn.empty { color: var(--fg-muted); }
.pya-mini-btn:hover { border-color: var(--ink); }
.pya-mini-pop { position: absolute; top: calc(100% + 5px); left: 0; z-index: 30; min-width: 200px; max-height: 280px; overflow-y: auto; background: var(--alabaster); border: 1px solid var(--ink-08); border-radius: 13px; box-shadow: var(--shadow-md); padding: 6px; animation: sa-fade .16s var(--ease); }
.pya-mini-search { width: 100%; box-sizing: border-box; border: 1px solid var(--warm-grey); border-radius: 8px; padding: 8px 10px; font-family: var(--sans); font-size: 12px; color: var(--ink); margin-bottom: 6px; outline: none; }
.pya-mini-opt { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: none; cursor: pointer; background: transparent; border-radius: 9px; padding: 9px 10px; font-family: var(--sans); font-size: 12px; letter-spacing: 0.02em; color: var(--ink); }
.pya-mini-opt:hover { background: var(--beige-30); }
.pya-mini-opt.on { background: var(--beige-soft); }

.pya-check { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--warm-grey); background: var(--alabaster); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .14s var(--ease); }
.pya-check.on { background: var(--ink); border-color: var(--ink); }

.pya-footer { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--warm-grey); }
.pya-btn { display: inline-flex; align-items: center; gap: 9px; border: none; cursor: pointer; border-radius: 13px; padding: 13px 22px; font-family: var(--sans); font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; transition: opacity .16s var(--ease); }
.pya-btn:disabled { opacity: 0.4; cursor: default; }
.pya-btn-dark { background: var(--ink); color: var(--alabaster); }
.pya-btn-ghost { background: transparent; color: var(--fg-muted); border: 1px solid var(--ink-08); }

.pya-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(40,40,40,0.42); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: sa-fade .18s var(--ease); }
.pya-modal { width: 100%; max-width: 540px; max-height: 86vh; overflow-y: auto; background: var(--alabaster); border-radius: 24px; box-shadow: var(--shadow-lg); animation: sa-rise .28s var(--ease); }
.pya-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 24px 26px 16px; border-bottom: 1px solid var(--ink-08); position: sticky; top: 0; background: var(--alabaster); }
.pya-modal-body { padding: 20px 26px 26px; }
.pya-modal-x { border: none; background: var(--beige-soft); cursor: pointer; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.pya-modal-x:hover { background: var(--warm-grey); }
.pya-kv { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid var(--ink-08); }
.pya-kv:last-child { border-bottom: none; }
.pya-kv dt { font-family: var(--sans); font-size: 10px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-muted); }
.pya-kv dd { margin: 0; font-family: var(--sans); font-size: 13px; letter-spacing: 0.02em; color: var(--ink); text-align: right; font-variant-numeric: tabular-nums; }
.pya-copy { border: none; background: transparent; cursor: pointer; color: var(--fg-muted); display: inline-flex; align-items: center; gap: 5px; font-family: var(--sans); font-size: 10px; letter-spacing: 0.06em; padding: 2px 0; }
.pya-copy:hover { color: var(--peach); }
.pya-items { background: var(--beige-soft); border-radius: 14px; padding: 6px 14px; margin: 14px 0; }
.pya-item { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--warm-grey); font-family: var(--sans); font-size: 12px; color: var(--ink); }
.pya-item:last-child { border-bottom: none; }
.pya-openbtn { display: inline-flex; align-items: center; justify-content: center; gap: 9px; width: 100%; text-decoration: none; border-radius: 13px; padding: 14px; font-family: var(--sans); font-size: 11px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; margin-top: 8px; }
.pya-openbtn-dark { background: var(--ink); color: var(--alabaster); }
.pya-openbtn-peach { background: var(--peach); color: var(--alabaster); }
.pya-empty { padding: 36px 24px; text-align: center; font-family: var(--sans); font-size: 12.5px; letter-spacing: 0.03em; color: var(--fg-muted); }

/* ---- mode tabs (SAT · Manual · Depósitos) ---- */
.pya-modes { display: inline-flex; gap: 4px; background: var(--beige-soft); border-radius: 14px; padding: 4px; margin: 0 0 4px; }
.pya-mode { display: inline-flex; align-items: center; gap: 8px; border: none; cursor: pointer; background: transparent; border-radius: 11px; padding: 10px 16px; font-family: var(--sans); font-size: 11px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-muted); transition: all .16s var(--ease); }
.pya-mode:hover { color: var(--ink); }
.pya-mode.on { background: var(--alabaster); color: var(--ink); box-shadow: var(--shadow-sm); }

/* ---- forms (manual + deposit) ---- */
.pya-form { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 720px) { .pya-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; } }
.pya-field { display: flex; flex-direction: column; gap: 7px; }
.pya-field > label { font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-muted); }
.pya-input { width: 100%; box-sizing: border-box; font-family: var(--sans); font-size: 13.5px; letter-spacing: 0.01em; color: var(--ink); padding: 12px 13px; background: var(--alabaster); border: 1px solid var(--warm-grey); border-radius: 11px; outline: none; transition: border-color .16s var(--ease); }
.pya-input:focus { border-color: var(--ink); }
.pya-input::placeholder { color: var(--warm-grey); }
textarea.pya-input { resize: vertical; min-height: 64px; }

/* ---- multi-select property chips ---- */
.pya-propsel { display: flex; flex-wrap: wrap; gap: 8px; max-height: 168px; overflow-y: auto; padding: 12px; border: 1px solid var(--ink-08); border-radius: 13px; background: var(--beige-soft); }
.pya-pchip { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--warm-grey); background: var(--alabaster); cursor: pointer; border-radius: 999px; padding: 7px 12px; font-family: var(--sans); font-size: 11.5px; letter-spacing: 0.02em; color: var(--ink); transition: all .14s var(--ease); }
.pya-pchip:hover { border-color: var(--ink); }
.pya-pchip.on { background: var(--ink); color: var(--alabaster); border-color: var(--ink); }
.pya-segbtn { display: inline-flex; gap: 4px; background: var(--beige-soft); border-radius: 11px; padding: 4px; }
.pya-segbtn button { border: none; cursor: pointer; background: transparent; border-radius: 8px; padding: 8px 14px; font-family: var(--sans); font-size: 11px; letter-spacing: 0.04em; color: var(--fg-muted); }
.pya-segbtn button.on { background: var(--alabaster); color: var(--ink); box-shadow: var(--shadow-sm); }

/* ---- deposit review cards ---- */
.pya-deps { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 18px; }
@media (min-width: 720px) { .pya-deps { grid-template-columns: repeat(2, 1fr); } }
.pya-dep { display: grid; grid-template-columns: 88px 1fr; gap: 14px; background: var(--beige-soft); border: 1px solid var(--ink-08); border-radius: 16px; padding: 12px; }
.pya-dep-thumb { width: 88px; height: 88px; border-radius: 12px; object-fit: cover; background: var(--warm-grey); cursor: pointer; }
.pya-dep-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.pya-dep-row { display: flex; gap: 8px; align-items: center; }
.pya-dep-mini { flex: 1; min-width: 0; }
.pya-dep-ocr { font-family: var(--sans); font-size: 10px; letter-spacing: 0.06em; color: var(--fg-muted); display: inline-flex; align-items: center; gap: 5px; }

/* ---- iframe / link viewer box ---- */
.pya-frame { width: 100%; height: min(62vh, 560px); border: 1px solid var(--ink-08); border-radius: 14px; background: var(--beige-soft); }
.pya-frame-fallback { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 30px 22px; background: var(--beige-soft); border-radius: 14px; }

/* ---- SAT copy panel (auth / NIT / monto) ---- */
.pya-satcopy { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 14px; }
@media (min-width: 640px) { .pya-satcopy { grid-template-columns: repeat(2, 1fr); } }
.pya-satcopy-card { background: var(--beige-soft); border: 1px solid var(--ink-08); border-radius: 14px; padding: 13px 14px; }
.pya-satcopy-kind { font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--peach); margin-bottom: 9px; }
.pya-copyfield { margin-top: 9px; }
.pya-copyfield:first-of-type { margin-top: 0; }
.pya-copyfield-lbl { display: block; font-family: var(--sans); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-muted); margin-bottom: 4px; }
.pya-copyfield-row { display: flex; align-items: center; gap: 8px; background: var(--alabaster); border: 1px solid var(--warm-grey); border-radius: 9px; padding: 7px 9px; }
.pya-copyfield-val { flex: 1; min-width: 0; font-family: var(--sans); font-size: 12px; letter-spacing: 0.01em; color: var(--ink); }
.pya-copyfield-btn { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; background: var(--beige-soft); border-radius: 8px; cursor: pointer; color: var(--fg-muted); transition: all .14s var(--ease); }
.pya-copyfield-btn:hover { background: var(--ink); color: var(--alabaster); }

/* ---- Monday-first date picker ---- */
.pya-datewrap { position: relative; }
.pya-datebtn { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; text-align: left; }
.pya-cal { position: absolute; z-index: 60; top: calc(100% + 6px); left: 0; width: 268px; background: var(--alabaster); border: 1px solid var(--ink-08); border-radius: 16px; box-shadow: var(--shadow-lg); padding: 14px; }
.pya-cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.pya-cal-head span { font-family: var(--serif); font-size: 15px; color: var(--ink); }
.pya-cal-head button { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: none; background: var(--beige-soft); border-radius: 9px; cursor: pointer; transition: background .14s var(--ease); }
.pya-cal-head button:hover { background: var(--warm-grey); }
.pya-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.pya-cal-dow span { text-align: center; font-family: var(--sans); font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg-muted); padding: 4px 0 7px; }
.pya-cal-day { aspect-ratio: 1; display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; border-radius: 9px; cursor: pointer; font-family: var(--sans); font-size: 12.5px; color: var(--ink); transition: all .12s var(--ease); }
.pya-cal-day:hover { background: var(--beige-soft); }
.pya-cal-day.today { box-shadow: inset 0 0 0 1px var(--warm-grey); }
.pya-cal-day.sel { background: var(--ink); color: var(--alabaster); }

/* ---- saved expenses manager ---- */
.pya-saved { display: flex; flex-direction: column; gap: 10px; }
.pya-saved-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; background: var(--beige-soft); border: 1px solid var(--ink-08); border-radius: 16px; padding: 14px 16px; }
.pya-saved-row.editing { display: block; background: var(--alabaster); border-color: var(--warm-grey); box-shadow: var(--shadow-sm); }
.pya-saved-main { min-width: 0; flex: 1; }
.pya-saved-top { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.pya-saved-prop { font-family: var(--serif); font-size: 17px; color: var(--ink); }
.pya-saved-amt { font-family: var(--sans); font-weight: 600; font-size: 14px; color: var(--ink); margin-left: auto; }
.pya-saved-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; font-family: var(--sans); font-size: 11px; letter-spacing: 0.03em; color: var(--fg-muted); }
.pya-saved-chip { background: var(--alabaster); border: 1px solid var(--warm-grey); border-radius: 999px; padding: 3px 9px; font-size: 10px; letter-spacing: 0.04em; color: var(--ink); }
.pya-saved-chip.warn { border-color: var(--peach); color: var(--peach); }
.pya-saved-com { margin-top: 8px; font-family: var(--sans); font-size: 12px; line-height: 1.5; color: var(--fg-muted); text-wrap: pretty; }
.pya-saved-actions { display: flex; gap: 6px; flex-shrink: 0; }
.pya-icbtn { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--warm-grey); background: var(--alabaster); border-radius: 10px; cursor: pointer; transition: all .14s var(--ease); }
.pya-icbtn:hover { border-color: var(--ink); transform: translateY(-1px); }
.pya-icbtn.danger:hover { border-color: var(--peach); background: var(--peach-12); }
.pya-saved-edit { display: flex; flex-direction: column; gap: 12px; }
.pya-saved-edit-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 640px) { .pya-saved-edit-grid { grid-template-columns: repeat(2, 1fr); } }
.pya-manual-split { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 720px) { .pya-manual-split { grid-template-columns: 1fr 1fr; } }
.pya-manual-list { display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow-y: auto; -webkit-overflow-scrolling: touch; scroll-behavior: smooth; overscroll-behavior: contain; padding-right: 2px; }
.pya-manual-inv { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--ink-08); border-radius: 10px; background: var(--alabaster); cursor: pointer; transition: border-color .14s var(--ease), background .14s var(--ease); }
.pya-manual-inv:hover { border-color: var(--warm-grey); }
.pya-manual-inv.on { background: var(--beige-soft); }
.pya-manual-inv.pv { border-color: var(--ink); }
.pya-manual-preview { border: 1px solid var(--ink-08); border-radius: 14px; background: var(--beige-soft); padding: 14px; min-height: 190px; }
.pya-stats.sticky { position: sticky; top: 0; z-index: 20; background: var(--alabaster); align-items: center; justify-content: space-between; padding: 12px 0; margin: 10px 0 6px; box-shadow: 0 10px 14px -10px rgba(62,63,63,0.22); }
.pya-stats-nums { display: flex; flex-wrap: wrap; gap: 8px; }
.pya-mmode { display: inline-flex; background: var(--beige-soft); border-radius: 999px; padding: 3px; gap: 2px; }
.pya-mmode-btn { border: none; background: transparent; border-radius: 999px; padding: 6px 14px; font-family: var(--sans); font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg-muted); cursor: pointer; transition: background .14s var(--ease), color .14s var(--ease); }
.pya-mmode-btn.on { background: var(--ink); color: var(--alabaster); }
`;

// ---- compact searchable dropdown (property / categoría / tag) ----
function PyaMini({ value, options, onChange, placeholder, search }) {
  const [open, setOpen] = pyaUseState(false);
  const [q, setQ] = pyaUseState("");
  const [pos, setPos] = pyaUseState(null); // {left, top, width} en coords de viewport
  const ref = pyaUseRef(null);
  const btnRef = pyaUseRef(null);
  pyaUseEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  // ancla el popup al botón con position:fixed para escapar del overflow del scroll
  const place = () => {
    const b = btnRef.current; if (!b) return;
    const r = b.getBoundingClientRect();
    const W = Math.max(r.width, 200);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 240 && r.top > spaceBelow;
    let left = r.left; if (left + W > window.innerWidth - 8) left = window.innerWidth - 8 - W;
    setPos({ left: Math.max(8, left), top: openUp ? null : r.bottom + 5, bottom: openUp ? (window.innerHeight - r.top + 5) : null, width: W });
  };
  pyaUseEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true); window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); };
  }, [open]);
  const cur = options.find(o => o.value === value);
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <div className="pya-mini" ref={ref}>
      <button ref={btnRef} className={"pya-mini-btn" + (cur ? "" : " empty")} onClick={() => setOpen(o => !o)}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur ? cur.label : (placeholder || "—")}</span>
        <Icon name="chevronDown" size={13} stroke="var(--fg-muted)" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .16s var(--ease)" }} />
      </button>
      {open && pos && (
        <div className="pya-mini-pop" style={{ position: "fixed", left: pos.left, top: pos.top != null ? pos.top : "auto", bottom: pos.bottom != null ? pos.bottom : "auto", width: pos.width, minWidth: pos.width }}>
          {search && <input className="pya-mini-search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" />}
          {filtered.map(o => (
            <button key={o.value} className={"pya-mini-opt" + (o.value === value ? " on" : "")}
              onClick={() => { onChange(o.value); setOpen(false); setQ(""); }}>
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.value === value && <Icon name="check" size={14} stroke="var(--peach)" />}
            </button>
          ))}
          {!filtered.length && <div style={{ padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--fg-muted)" }}>Sin resultados</div>}
        </div>
      )}
    </div>
  );
}

function PyaCheck({ on, onClick }) {
  return (
    <span className={"pya-check" + (on ? " on" : "")} onClick={onClick} role="checkbox" aria-checked={on}>
      {on && <Icon name="check" size={12} stroke="var(--alabaster)" width={2} />}
    </span>
  );
}

// ---- detail box: pedido (admin) ----
function PyaOrderBox({ row, lang, onClose }) {
  const o = row.order;
  const P = window.PedidosYa;
  return (
    <div className="pya-overlay" onClick={onClose}>
      <div className="pya-modal" onClick={e => e.stopPropagation()}>
        <div className="pya-modal-head">
          <div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{lang === "es" ? "Pedido PedidosYa" : "PedidosYa order"}</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 24, color: "var(--ink)", marginTop: 5, lineHeight: 1.1 }}>{o.vendor || "—"}</div>
          </div>
          <button className="pya-modal-x" onClick={onClose}><Icon name="x" size={17} stroke="var(--ink)" /></button>
        </div>
        <div className="pya-modal-body">
          <dl style={{ margin: 0 }}>
            <div className="pya-kv"><dt>{lang === "es" ? "Fecha" : "Date"}</dt><dd>{P.prettyDay(o.day, lang)}</dd></div>
            <div className="pya-kv"><dt>Order ID</dt><dd>{o.orderId} <CopyBtn text={o.orderId} /></dd></div>
            {o.code && <div className="pya-kv"><dt>{lang === "es" ? "Código" : "Code"}</dt><dd>{o.code}</dd></div>}
            <div className="pya-kv"><dt>{lang === "es" ? "Total consolidado" : "Consolidated total"}</dt><dd style={{ fontWeight: 600 }}>{P.money(o.amount)}</dd></div>
            {o.amountNoDiscount > 0 && o.amountNoDiscount !== o.amount && <div className="pya-kv"><dt>{lang === "es" ? "Sin descuento" : "No discount"}</dt><dd style={{ color: "var(--fg-muted)" }}>{P.money(o.amountNoDiscount)}</dd></div>}
            <div className="pya-kv"><dt>{lang === "es" ? "Estado" : "Status"}</dt><dd>{o.status} · {o.businessType}</dd></div>
          </dl>
          {o.items.length > 0 && (
            <div className="pya-items">
              {o.items.map((it, i) => (
                <div className="pya-item" key={i}>
                  <span style={{ flex: 1 }}>{it.qty > 1 ? it.qty + "× " : ""}{it.name}</span>
                  <span className="pya-num" style={{ color: "var(--fg-muted)" }}>{P.money(it.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <a className="pya-openbtn pya-openbtn-peach" href={P.links.order(o.orderId)} target="_blank" rel="noreferrer">
            {lang === "es" ? "Abrir pedido en PedidosYa" : "Open order in PedidosYa"} <Icon name="arrowUpRight" size={15} stroke="var(--alabaster)" />
          </a>
          <p style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.03em", lineHeight: 1.5, color: "var(--fg-muted)", margin: "12px 0 0", textWrap: "pretty" }}>
            {lang === "es" ? "Abre la dirección y notas del pedido para deducir la propiedad. Requiere tu sesión de PedidosYa." : "Opens the order address/notes to deduce the property. Requires your PedidosYa session."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- detail box: factura(s) SAT ----
function PyaInvoiceBox({ row, lang, onClose }) {
  const P = window.PedidosYa;
  const invs = [row.prod, row.tar].filter(Boolean);
  return (
    <div className="pya-overlay" onClick={onClose}>
      <div className="pya-modal" onClick={e => e.stopPropagation()}>
        <div className="pya-modal-head">
          <div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{lang === "es" ? "Factura(s) SAT" : "SAT invoice(s)"}</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 24, color: "var(--ink)", marginTop: 5, lineHeight: 1.1 }}>{row.order.vendor || "—"}</div>
          </div>
          <button className="pya-modal-x" onClick={onClose}><Icon name="x" size={17} stroke="var(--ink)" /></button>
        </div>
        <div className="pya-modal-body">
          {!invs.length && <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fg-muted)", margin: "0 0 14px" }}>{lang === "es" ? "Este pedido aún no tiene factura cruzada en el Excel SAT." : "This order has no SAT invoice matched yet."}</p>}
          {invs.map((inv, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className="pya-badge" style={{ background: "var(--beige-soft)", color: "var(--ink)" }}>{inv.kind === "productos" ? (lang === "es" ? "Productos" : "Products") : (lang === "es" ? "Tarifa de servicio" : "Service fee")}</span>
                <span className="pya-num" style={{ marginLeft: "auto", fontWeight: 600, fontFamily: "var(--sans)", fontSize: 14 }}>{P.money(inv.total)}</span>
              </div>
              <dl style={{ margin: 0 }}>
                <div className="pya-kv"><dt>{lang === "es" ? "Nº autorización" : "Authorization No."}</dt><dd style={{ fontSize: 11.5, wordBreak: "break-all" }}>{inv.auth || "—"} {inv.auth && <CopyBtn text={inv.auth} />}</dd></div>
                <div className="pya-kv"><dt>NIT</dt><dd>{inv.nit}</dd></div>
                <div className="pya-kv"><dt>{lang === "es" ? "Emisor" : "Issuer"}</dt><dd style={{ fontSize: 11.5 }}>{inv.emisor || "—"}</dd></div>
                <div className="pya-kv"><dt>{lang === "es" ? "Emisión" : "Issued"}</dt><dd>{P.prettyDay(inv.day, lang)}</dd></div>
                <div className="pya-kv"><dt>{lang === "es" ? "Estado" : "Status"}</dt><dd>{inv.estado || "Vigente"}</dd></div>
              </dl>
            </div>
          ))}
          {invs.length > 0 && (
            <React.Fragment>
              <a className="pya-openbtn pya-openbtn-dark" href={P.links.satVerificador} target="_blank" rel="noreferrer">
                {lang === "es" ? "Abrir verificador del SAT" : "Open SAT verifier"} <Icon name="arrowUpRight" size={15} stroke="var(--alabaster)" />
              </a>
              <p style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.03em", lineHeight: 1.5, color: "var(--fg-muted)", margin: "12px 0 0", textWrap: "pretty" }}>
                {lang === "es" ? "El verificador público pide el Nº de autorización (cópialo arriba). Algunos DTE tardan hasta 6 días en aparecer." : "The public verifier asks for the authorization number (copy it above). Some DTEs take up to 6 days to appear."}
              </p>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ text }) {
  const [done, setDone] = pyaUseState(false);
  return (
    <button className="pya-copy" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }}>
      <Icon name={done ? "check" : "file"} size={12} stroke="currentColor" />{done ? "✓" : ""}
    </button>
  );
}

// ---- reusable invoice / order viewer (box tipo iframe + abrir en pestaña) ----
// Recibe datos planos: { orderUrl, authProductos, authTarifa, desc, day, amount,
//   vendor, receptor, invoices:[{kind,auth,nit,total,receptor}] }
function InvoiceViewBox({ data, lang, onClose }) {
  const P = window.PedidosYa;
  const es = lang !== "en";
  const [cfg, setCfg] = pyaUseState(() => { try { const c = JSON.parse(localStorage.getItem("sa-sat-config")) || {}; return { nit: c.nit || "118287796", clave: c.clave || "" }; } catch (e) { return { nit: "118287796", clave: "" }; } });
  const [cfgOpen, setCfgOpen] = pyaUseState(false);
  const saveCfg = (c) => { setCfg(c); try { localStorage.setItem("sa-sat-config", JSON.stringify(c)); } catch (e) {} };
  const [tab, setTab] = pyaUseState(data.orderUrl ? "order" : "sat");
  const [frameErr, setFrameErr] = pyaUseState(false);
  pyaUseEffect(() => { setFrameErr(false); }, [tab]);
  // normaliza la lista de facturas (desde invoices, o desde authProductos/authTarifa)
  const invoices = (data.invoices && data.invoices.length) ? data.invoices
    : [data.authProductos && { kind: "productos", auth: data.authProductos },
       data.authTarifa && { kind: "tarifa", auth: data.authTarifa }].filter(Boolean);
  const satUrl = (P && P.links.satVerificador) || "https://felpub.c.sat.gob.gt/verificador-web/publico/vistas/verificacionDte.jsf";
  const cur = tab === "order" ? data.orderUrl : satUrl;
  const kindLabel = (k) => k === "tarifa" ? (es ? "Tarifa de servicio" : "Service fee") : (es ? "Productos" : "Products");
  return (
    <div className="pya-overlay" onClick={onClose}>
      <div className="pya-modal" style={{ maxWidth: 780 }} onClick={e => e.stopPropagation()}>
        <div className="pya-modal-head">
          <div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)" }}>{es ? "Factura del pedido" : "Order invoice"}</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", marginTop: 5, lineHeight: 1.1 }}>{data.vendor || data.desc || (es ? "Pedido" : "Order")}</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--fg-muted)", marginTop: 4 }}>
              {data.day ? P.prettyDay(data.day, lang) : ""}{data.amount != null ? " · " + (typeof data.amount === "number" ? P.money(data.amount) : data.amount) : ""}
            </div>
          </div>
          <button className="pya-modal-x" onClick={onClose}><Icon name="x" size={17} stroke="var(--ink)" /></button>
        </div>
        <div className="pya-modal-body">
          <div className="pya-segbtn" style={{ marginBottom: 14 }}>
            {data.orderUrl && <button className={tab === "order" ? "on" : ""} onClick={() => setTab("order")}>{es ? "Pedido / recibo" : "Order / receipt"}</button>}
            {invoices.length > 0 && <button className={tab === "sat" ? "on" : ""} onClick={() => setTab("sat")}>{es ? "Ver factura (SAT)" : "View invoice (SAT)"}</button>}
          </div>

          {tab === "sat" && invoices.length > 0 && (
            <React.Fragment>
              <p style={{ fontFamily: "var(--sans)", fontSize: 11.5, letterSpacing: "0.02em", lineHeight: 1.55, color: "var(--fg-muted)", margin: "0 0 12px", textWrap: "pretty" }}>
                {es ? "Toca “Ver factura” para abrirla en la Agencia Virtual (requiere haber iniciado sesión en el SAT). Si no carga, abre el verificador público y pega estos datos:" : "Tap “View invoice” to open it in Agencia Virtual (requires being logged in to SAT). If it doesn't load, open the public verifier and paste these fields:"}
              </p>
              <div className="pya-satcopy">
                {invoices.map((inv, i) => (
                  <div className="pya-satcopy-card" key={i}>
                    <div className="pya-satcopy-kind">{kindLabel(inv.kind)}{inv.total != null ? " · " + P.money(inv.total) : ""}</div>
                    <a className="pya-openbtn pya-openbtn-dark" style={{ marginTop: 0, marginBottom: 11, width: "100%", boxSizing: "border-box", justifyContent: "center", opacity: cfg.clave ? 1 : 0.45, pointerEvents: cfg.clave ? "auto" : "none" }}
                      href={P.links.satFactura(inv.auth, cfg.nit, cfg.clave)} target="_blank" rel="noreferrer">
                      {es ? "Ver factura" : "View invoice"} <Icon name="arrowUpRight" size={14} stroke="var(--alabaster)" />
                    </a>
                    <CopyField label={es ? "Nº de autorización" : "Authorization No."} value={inv.auth} mono />
                    {inv.nit && <CopyField label={es ? "NIT emisor" : "Issuer NIT"} value={inv.nit} />}
                    {cfg.nit && <CopyField label={es ? "ID del receptor" : "Receiver ID"} value={cfg.nit} />}
                    {inv.total != null && <CopyField label={es ? "Monto total" : "Total amount"} value={(Math.round(inv.total * 100) / 100).toFixed(2)} />}
                  </div>
                ))}
              </div>
              <a className="pya-openbtn pya-openbtn-dark" href={satUrl} target="_blank" rel="noreferrer" style={{ marginTop: 2, marginBottom: 12 }}>
                {es ? "Abrir verificador del SAT" : "Open SAT verifier"} <Icon name="arrowUpRight" size={15} stroke="var(--alabaster)" />
              </a>
              <button onClick={() => setCfgOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.04em", color: "var(--fg-muted)", textDecoration: "underline" }}>
                {cfg.clave ? (es ? "Cambiar Clave de Agencia Virtual" : "Change Agencia Virtual key") : (es ? "Configurar acceso para ‘Ver factura’" : "Set up access for ‘View invoice’")}
              </button>
              {(cfgOpen || !cfg.clave) && (
                <div style={{ background: "var(--beige-soft)", border: "1px solid var(--ink-08)", borderRadius: 12, padding: 14, marginTop: 10 }}>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 11, lineHeight: 1.5, letterSpacing: "0.02em", color: "var(--fg-muted)", margin: "0 0 10px", textWrap: "pretty" }}>
                    {es ? "Para abrir la factura en la Agencia Virtual del SAT pega el NIT del receptor y tu Clave. Se guardan solo en este navegador (no se publican)." : "To open the invoice in SAT's Agencia Virtual, paste the receiver NIT and your Clave. Stored only in this browser."}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <input className="pya-input" style={{ flex: "1 1 120px", fontSize: 12 }} defaultValue={cfg.nit} placeholder={es ? "NIT receptor" : "Receiver NIT"} id="sa-cfg-nit" />
                    <input className="pya-input" style={{ flex: "2 1 200px", fontSize: 12 }} defaultValue={cfg.clave} placeholder={es ? "Clave de Agencia Virtual" : "Agencia Virtual key"} id="sa-cfg-clave" />
                    <button className="pya-btn pya-btn-dark" onClick={() => { const nit = (document.getElementById("sa-cfg-nit") || {}).value || cfg.nit; const clave = (document.getElementById("sa-cfg-clave") || {}).value || ""; saveCfg({ nit: nit.trim(), clave: clave.trim() }); setCfgOpen(false); }}>{es ? "Guardar" : "Save"}</button>
                  </div>
                </div>
              )}
            </React.Fragment>
          )}

          {tab === "order" && !data.orderUrl && (
            <div className="pya-frame-fallback" style={{ marginBottom: 12 }}>
              <Icon name="info" size={22} stroke="var(--peach)" />
              <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0, maxWidth: 360 }}>{es ? "Aún no se ha pegado la URL del pedido para esta factura." : "No order URL has been pasted for this invoice yet."}</p>
            </div>
          )}

          {tab === "order" && data.orderUrl && (
            <div className="pya-frame-fallback" style={{ marginBottom: 4 }}>
              <Icon name="file" size={26} stroke="var(--ink)" />
              <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0, maxWidth: 400, textWrap: "pretty" }}>
                {es ? "Abre el pedido en PedidosYa y toca \u201cDescargar factura\u201d para ver o guardar el PDF de la factura." : "Open the order in PedidosYa and tap \u201cDownload invoice\u201d to view or save the invoice PDF."}
              </p>
            </div>
          )}

          {tab === "order" && data.orderUrl && (
            <a className="pya-openbtn pya-openbtn-dark" href={data.orderUrl} target="_blank" rel="noreferrer" style={{ marginTop: 14 }}>
              {es ? "Abrir pedido en PedidosYa" : "Open order in PedidosYa"} <Icon name="arrowUpRight" size={15} stroke="var(--alabaster)" />
            </a>
          )}
          {tab === "sat" && (
            <p style={{ fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.03em", lineHeight: 1.5, color: "var(--fg-muted)", margin: "12px 0 0", textWrap: "pretty" }}>
              {es ? "El verificador del SAT pide un captcha. Algunos DTE tardan hasta 6 días en aparecer." : "The SAT verifier asks for a captcha. Some DTEs take up to 6 days to appear."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// campo con etiqueta + valor + botón copiar
function CopyField({ label, value, mono }) {
  const [done, setDone] = pyaUseState(false);
  return (
    <div className="pya-copyfield">
      <span className="pya-copyfield-lbl">{label}</span>
      <div className="pya-copyfield-row">
        <span className="pya-copyfield-val" style={mono ? { fontVariantLigatures: "none", wordBreak: "break-all" } : null}>{value}</span>
        <button className="pya-copyfield-btn" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(String(value)); setDone(true); setTimeout(() => setDone(false), 1300); }}>
          {done ? <Icon name="check" size={13} stroke="#5B8A6B" /> : <Icon name="copy" size={13} stroke="currentColor" />}
        </button>
      </div>
    </div>
  );
}

// ---- selector de fecha con LUNES como primer día (issue: semana lun→dom) ----
function PyaDate({ value, onChange, lang }) {
  const es = lang !== "en";
  const [open, setOpen] = pyaUseState(false);
  const ref = pyaUseRef(null);
  const today = new Date();
  const init = value ? value.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const [view, setView] = pyaUseState({ y: init[0], m: init[1] - 1 }); // m: 0-based
  pyaUseEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const DOW = es ? ["L", "M", "M", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"];
  const MON = es ? ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
                 : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const first = new Date(view.y, view.m, 1);
  // getDay(): 0=Dom..6=Sab → convertir a 0=Lun..6=Dom
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const sel = value ? value.split("-").map(Number) : null;
  const isSel = (d) => sel && sel[0] === view.y && sel[1] === view.m + 1 && sel[2] === d;
  const isToday = (d) => today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
  const pick = (d) => { onChange(view.y + "-" + String(view.m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0")); setOpen(false); };
  const shift = (delta) => setView(v => { let m = v.m + delta, y = v.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y, m }; });
  const label = value ? P_pretty(value, lang) : (es ? "Elegir fecha" : "Pick a date");
  return (
    <div className="pya-datewrap" ref={ref}>
      <button type="button" className="pya-input pya-datebtn" onClick={() => setOpen(o => !o)}>
        <Icon name="calendar" size={14} stroke="var(--fg-muted)" />
        <span style={{ color: value ? "var(--ink)" : "var(--warm-grey)" }}>{label}</span>
      </button>
      {open && (
        <div className="pya-cal">
          <div className="pya-cal-head">
            <button type="button" onClick={() => shift(-1)}><Icon name="chevronLeft" size={16} stroke="var(--ink)" /></button>
            <span>{MON[view.m]} {view.y}</span>
            <button type="button" onClick={() => shift(1)}><Icon name="chevronRight" size={16} stroke="var(--ink)" /></button>
          </div>
          <div className="pya-cal-grid pya-cal-dow">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="pya-cal-grid">
            {cells.map((d, i) => d == null
              ? <span key={i} />
              : <button type="button" key={i} className={"pya-cal-day" + (isSel(d) ? " sel" : "") + (isToday(d) ? " today" : "")} onClick={() => pick(d)}>{d}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
function P_pretty(ymd, lang) {
  const [y, m, d] = ymd.split("-").map(Number);
  const MES = lang === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return d + " " + MES[m - 1] + " " + y;
}

Object.assign(window, { PyaMini, PyaCheck, PyaOrderBox, PyaInvoiceBox, InvoiceViewBox, CopyBtn, CopyField, PyaDate, PYA_STYLE });
