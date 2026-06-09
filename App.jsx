import React, { useState, useEffect, useRef, Component } from "react";

/* ─── Responsive hook */
function useScreen() {
  var [w,setW] = useState(typeof window!=="undefined"?window.innerWidth:1024);
  useEffect(function(){
    function h(){setW(window.innerWidth);}
    window.addEventListener("resize",h);
    return function(){window.removeEventListener("resize",h);};
  },[]);
  return {w:w, mobile:w<640, tablet:w>=640&&w<1024, desktop:w>=1024};
}
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

/* ═══ TOKENS */
const C = {
  alabaster:"#FAFAFA", beige:"#F5F3F0",   earth:"#938B8A",
  gray:"#D8D4CE",      black:"#3E3F3F",   peach:"#E9826A",
  green:"#3d6b52",     red:"#8a3030",     orange:"#9a5020",
  sand:"#E8E4DF",      taupe:"#938B8A",   accent:"#E9826A",
  surface:"#FFFFFF",   surfaceWarm:"#F5F3F0", line:"#EAE6E0",
};
const CATS = ["Limpieza tradicional","Limpieza profunda","Mantenimiento","Nuevo Producto","Ajuste","Reporte de Daños"];
const BADGE = {
  "Limpieza tradicional":{bg:"#E8EDE9",tx:"#4a7a60"},
  "Limpieza profunda":   {bg:"#DDE8DF",tx:"#3a6b50"},
  "Mantenimiento":       {bg:"#E8EAF0",tx:"#4a5a7a"},
  "Nuevo Producto":      {bg:"#EDE8E2",tx:"#7a5a3a"},
  "Ajuste":             {bg:"#EDEAE3",tx:"#7a7050"},
  "Reporte de Daños":   {bg:"#EDE4E4",tx:"#9b3a3a"},
};
const ALT = {
  red:    {label:"Trabajo de hace 3+ semanas", clr:"#9b3a3a", bg:"#EDE4E4"},
  orange: {label:"Trabajo de hace 2 semanas",  clr:"#b5622a", bg:"#EDE7E0"},
  yellow: {label:"Trabajo de la semana anterior", clr:"#8a7040", bg:"#F5F2EC"},
};
const PERIODS   = [[3,"3 días"],[5,"5 días"],[7,"7 días"],[14,"14 días"],[30,"30 días+"]];
const PAGADORES   = ["Spacio AM","Dueño"];
const CLEAN_CATS  = ["Limpieza tradicional","Limpieza profunda"];

/* ─── Auto-tariff helper — shared across all form types */
function autoTarifa(email, vendors) {
  if (!email||!vendors) return {tarifa:"",locked:false};
  var v = vendors.find(function(x){return x.email===email;});
  if (!v) return {tarifa:"",locked:false};
  var isEPI = v.tipo==="interno"&&(v.categoria==="EPI Limpieza"||v.categoria==="EPI Mantenimiento");
  if (!isEPI) return {tarifa:"",locked:false};
  var hasTarifa = v.tarifaLimpieza && parseFloat(v.tarifaLimpieza)>0;
  return {tarifa: hasTarifa ? String(v.tarifaLimpieza) : "", locked: hasTarifa};
}


function isCleaning(cat){return CLEAN_CATS.indexOf(cat)>=0;}
const INTERNAL_CATS = ["Administrativo","EPI Limpieza","EPI Mantenimiento"];

/* ─── Convert any Google Drive URL to inline-displayable thumbnail */
function driveThumb(url, size) {
  if (!url||typeof url!=="string") return url;
  if (url.startsWith("data:")) return url;
  size = size || 400;
  var m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
          url.match(/\/d\/([a-zA-Z0-9_-]{20,})\//);
  if (!m) return url;
  return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w" + size;
}

function vendorDisplay(v) {
  if (!v) return "—";
  if (v.primerNombre) return [v.primerNombre, v.primerApellido].filter(Boolean).join(" ");
  return v.name||v.email||"—";
}

/* ─── Fuzzy vendor matcher
   Matches by email, phone, or name similarity.
   Returns the best-matching vendor and a confidence score 0-1.
*/
function normalize(s) {
  if (!s) return "";
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g,"")  /* remove accents */
    .replace(/[^a-z0-9@.+\s]/g," ")
    .replace(/\s+/g," ").trim();
}

function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a||!b) return 0;
  if (a===b) return 1;
  if (a.includes(b)||b.includes(a)) return 0.9;
  /* Count matching words */
  var wa = a.split(" ").filter(Boolean);
  var wb = b.split(" ").filter(Boolean);
  var matches = wa.filter(function(w){ return w.length>2&&wb.some(function(x){return x.includes(w)||w.includes(x)||levenshtein(w,x)<=2;}); });
  return matches.length / Math.max(wa.length, wb.length);
}

function levenshtein(a, b) {
  var m=a.length, n=b.length;
  var dp=[];
  for(var i=0;i<=m;i++){dp[i]=[i];for(var j=1;j<=n;j++){if(i===0){dp[i][j]=j;}else{var cost=a[i-1]===b[j-1]?0:1;dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);}}}
  return dp[m][n];
}

function fuzzyMatchVendor(query, vendors) {
  /* query: raw text from Hospitable — could be email, name, phone, or any combo */
  if (!query||!vendors||!vendors.length) return {vendor:null, score:0};
  var q = normalize(query);

  var scored = vendors.map(function(v){
    var scores = [];
    /* Email match */
    var em = normalize(v.email||"");
    if (em&&q.includes(em.split("@")[0])) scores.push(0.95);
    else if (em&&similarity(q,em)>0.5) scores.push(similarity(q,em));

    /* Phone match — normalize digits only */
    var ph = (v.phone||"").replace(/\D/g,"");
    var qph = q.replace(/\D/g,"");
    if (ph&&qph&&qph.includes(ph.slice(-8))) scores.push(0.9);

    /* Full name match */
    var fullName = [v.primerNombre,v.segundoNombre,v.primerApellido,v.segundoApellido].filter(Boolean).join(" ");
    var oldName  = v.name||"";
    var ns1 = similarity(q, fullName);
    var ns2 = similarity(q, oldName);
    scores.push(Math.max(ns1,ns2));

    return {vendor:v, score:scores.length?Math.max.apply(null,scores):0};
  });

  scored.sort(function(a,b){return b.score-a.score;});
  var best = scored[0];
  return best&&best.score>0.25 ? best : {vendor:null, score:0};
}

function vendorTipo(v) {
  if (!v) return "";
  var t = v.tipo==="interno" ? "Interno" : v.tipo==="externo" ? "Externo" : "";
  return t + (v.categoria ? " · "+v.categoria : "");
}



const MOTIVOS_AJUSTE = ["Tokens de lavado","Transporte","Limpieza pendiente","Día doble","Servicio adicional","Compras adicionales","Otro"];

const GEO = {
  Guatemala: ["Ciudad de Guatemala","Antigua Guatemala","Puerto San José","Quetzaltenango"],
  Perú:      ["Lima","Cusco","Arequipa","Miraflores"],
};

const INV_DEFAULT = [
  {id:"inv1",  name:"Tarjetas de acceso",              requirePhoto:true,  cantidad:1},
  {id:"inv2",  name:"Juegos de sábanas en buen estado",requirePhoto:false, cantidad:1, note:"Incluye sábana con elástico, sábana plana y fundas"},
  {id:"inv3",  name:"Cubrecama / Edredón / Duvet",     requirePhoto:false, cantidad:1},
  {id:"inv4",  name:"Toallas de cuerpo",               requirePhoto:false, cantidad:2},
  {id:"inv5",  name:"Toallas de mano",                 requirePhoto:false, cantidad:2},
  {id:"inv6",  name:"Toallas desmaquillante",          requirePhoto:false, cantidad:2},
  {id:"inv7",  name:"Alfombra de baño",                requirePhoto:false, cantidad:1},
  {id:"inv8",  name:"Plancha",                         requirePhoto:false, cantidad:1},
  {id:"inv9",  name:"Ventilador",                      requirePhoto:false, cantidad:1},
  {id:"inv10", name:"Secadora",                        requirePhoto:false, cantidad:1},
  {id:"inv11", name:"Cafetera",                        requirePhoto:false, cantidad:1},
  {id:"inv12", name:"Bombillos (generales y lámparas)",requirePhoto:false, cantidad:1},
  {id:"inv13", name:"Objetos olvidados",               requirePhoto:true,  cantidad:0},
];


/* ═══ UTILS */
function fmtDate(d) {
  if (!d) return "—";
  try {
    var dt = (typeof d==="string"&&d.length===10&&/^\d{4}-\d{2}-\d{2}$/.test(d))
      ? new Date(d+"T12:00:00")
      : new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("es-GT",{day:"2-digit",month:"short",year:"numeric"});
  } catch(e) { return String(d)||"—"; }
}
function todayStr() { return new Date().toISOString().split("T")[0]; }
function relDate(days) { return new Date(Date.now()-days*86400000).toISOString().split("T")[0]; }
/* Rangos de período rápido (compartido por todos los filtros). Semanas lunes→domingo. */
function presetRange(val){
  var now=new Date(); now.setHours(12,0,0,0);
  function iso(d){ return d.toISOString().split("T")[0]; }
  var to=iso(now);
  var lunes=new Date(now); lunes.setDate(now.getDate()-((now.getDay()+6)%7)); /* lunes de esta semana */
  if(val==="hoy")        return {from:to,to:to};
  if(val==="semana")     return {from:iso(lunes), to:to};
  if(val==="semana_ant"){ var lAnt=new Date(lunes); lAnt.setDate(lunes.getDate()-7); var dAnt=new Date(lunes); dAnt.setDate(lunes.getDate()-1); return {from:iso(lAnt), to:iso(dAnt)}; }
  if(val==="mes")        return {from:iso(new Date(now.getFullYear(),now.getMonth(),1)), to:to};
  if(val==="3meses"){ var t3=new Date(now); t3.setMonth(t3.getMonth()-3); return {from:iso(t3), to:to}; }
  if(val==="7d")  return {from:relDate(6),  to:to};
  if(val==="14d") return {from:relDate(13), to:to};
  if(val==="30d") return {from:relDate(29), to:to};
  return {from:"", to:""};
}
/* Opciones del menú "Período rápido" — orden y etiquetas uniformes */
var PRESET_OPTS = [
  ["hoy","Hoy"],
  ["semana","Semana en curso"],
  ["semana_ant","Semana anterior"],
  ["mes","Este mes"],
  ["3meses","Últimos 3 meses"],
  ["todo","Todo"],
];
function daysSince(ts) { return Math.floor((Date.now()-ts)/86400000); }
function alertLvl(r) {
  if (r.paid || !r.total) return null;
  var d = daysSince(r.createdAt||r.id);
  if (d>=21) return "red"; if (d>=14) return "orange"; if (d>=7) return "yellow";
  return null;
}
function uniq(arr) { return [...new Set(arr)]; }
function compress(file) {
  return new Promise(function(res) {
    var fr = new FileReader();
    fr.onload = function(ev) {
      var img = new Image();
      img.onload = function() {
        var rt = Math.min(900/img.width, 1);
        var cv = document.createElement("canvas");
        cv.width  = Math.round(img.width*rt);
        cv.height = Math.round(img.height*rt);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL("image/jpeg", 0.75));
      };
      img.src = ev.target.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ═══ STORAGE — auto-detects environment */
var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxzYpBaTI_1S0VepOi810zrzB-fyC4R2Flug0ZEOOxNzZ9F7CLiSWaKXEtk1C17sfsX/exec";

/* Detect if running inside Claude sandbox — strict check */
var IS_CLAUDE_SANDBOX = (
  typeof window !== "undefined" && (
    window.location.hostname.endsWith("claude.ai") ||
    window.location.hostname.endsWith("claude.site") ||
    window.location.hostname.endsWith("anthropic.com")
  )
);

/* ─── GOOGLE SHEETS API (used when deployed to Vercel / custom domain) */
async function apiCall(action, payload) {
  var body = JSON.stringify(Object.assign({action:action}, payload||{}));
  var r = await fetch(SCRIPT_URL, {
    method:"POST",
    headers:{"Content-Type":"text/plain"},
    body:body,
    mode:"cors",
    redirect:"follow"
  });
  if (!r.ok) throw new Error("HTTP "+r.status);
  var text = await r.text();
  var j; try { j=JSON.parse(text); } catch(e) { throw new Error("Respuesta inválida"); }
  if (!j.ok) throw new Error(j.error||"Error servidor");
  return j.data;
}

/* ─── LOCAL STORAGE FALLBACK (used inside Claude published artifact) */
function ls_get(k){ try{var v=localStorage.getItem("sam_"+k);return v?JSON.parse(v):null;}catch(e){return null;} }
function ls_set(k,v){ try{localStorage.setItem("sam_"+k,JSON.stringify(v));}catch(e){} }
function ls_del(k){ try{localStorage.removeItem("sam_"+k);}catch(e){} }

function ls_loadAll(){
  var keys=Object.keys(localStorage).filter(function(k){return k.startsWith("sam_m:");}).map(function(k){return k.replace("sam_","");});
  var reps=[];
  for(var i=0;i<keys.length;i++){var r=ls_get(keys[i]);if(r)reps.push(r);}
  var cfg={
    vendors: ls_get("c:v")||null,
    props:   ls_get("c:p")||null,
    adminpin:ls_get("c:pin")||null,
    company: ls_get("c:co")||null,
    extcats:   ls_get("c:ec")||null,
    schedules: ls_get("c:sched")||null,
    hospurlday:  ls_get("c:hospday")||null,
    hospurlweek: ls_get("c:hospweek")||null,
    feedback:  ls_get("c:fb")||null,
  };
  return {reports:reps.sort(function(a,b){return (b.createdAt||b.id)-(a.createdAt||a.id);}), ...cfg};
}
function ls_saveReport(rep){ls_set("m:"+rep.id,rep);}
function ls_deleteReport(id){ls_del("m:"+id);}
function ls_saveConfig(key,value){var km={vendors:"c:v",props:"c:p",adminpin:"c:pin",company:"c:co",extcats:"c:ec"};ls_set(km[key]||key,value);}

async function loadAllData() {
  if (IS_CLAUDE_SANDBOX) {
    var d = ls_loadAll();
    return {
      reports:   d.reports,
      vendors:   d.vendors   || DEF_V,
      props:     d.props     || DEF_P,
      pin:       d.adminpin  || "spacio2024",
      company:   d.company   || {name:"Spacio AM S.A.",nit:"118287796"},
      extcats:   d.extcats   || [],
      schedules: d.schedules || [],
      feedback:  d.feedback  || [],
      adelantos: adv_load(),
    };
  }
  /* Carga SECUENCIAL (no Promise.all): el Apps Script ocasionalmente mezcla las
     respuestas cuando getAll y getConfig llegan a la vez, devolviendo getConfig sin
     "vendors". Pedir config primero (crítico para el login) y luego los reportes
     elimina esa condición de carrera. */
  var cfg = await apiCall("getConfig") || {};
  if (!Array.isArray(cfg.vendors) || !cfg.vendors.length) {
    for (var attempt=0; attempt<2; attempt++) {
      try {
        var retry = await apiCall("getConfig");
        if (retry && Array.isArray(retry.vendors) && retry.vendors.length) { cfg = retry; break; }
      } catch(e){ /* sigue intentando */ }
    }
  }
  var rd = await apiCall("getAll") || {};
  return {
    reports: (rd.reports||[]).sort(function(a,b){return (b.createdAt||b.id)-(a.createdAt||a.id);}),
    vendors: (Array.isArray(cfg.vendors)&&cfg.vendors.length) ? cfg.vendors : DEF_V,
    props:   cfg.props   || DEF_P,
    pin:     cfg.adminpin|| "spacio2024",
    company: cfg.company || {name:"Spacio AM S.A.",nit:"118287796"},
    extcats: cfg.extcats || [],
    adelantos: Array.isArray(cfg.adelantos) ? cfg.adelantos : null,
  };
}

async function uploadMedia(b64, name, mime, subfolder) {
  if (!b64||typeof b64!=="string"||!b64.startsWith("data:")) return b64;
  var r = await apiCall("uploadFile", {b64:b64, name:name, mime:mime, subfolder:subfolder||""});
  return r.url;
}

async function processMedia(rep) {
  var r = Object.assign({}, rep);
  var id = r.id;

  /* Upload in parallel batches of 3 to reduce total time */
  async function upArr(arr, prefix) {
    if (!arr||!arr.length) return arr||[];
    var out = new Array(arr.length);
    /* Batch size 3 — parallel within batch, sequential across batches */
    for (var i=0;i<arr.length;i+=3) {
      var batch = arr.slice(i,i+3);
      var results = await Promise.all(batch.map(function(f,j){
        return f&&f.startsWith&&f.startsWith("data:")
          ? uploadMedia(f, prefix+"-"+id+"-"+(i+j)+".jpg","image/jpeg")
          : Promise.resolve(f);
      }));
      for (var j=0;j<results.length;j++) out[i+j]=results[j];
    }
    return out;
  }
  async function upOne(val, name) {
    return val&&val.startsWith&&val.startsWith("data:") ? await uploadMedia(val, name+"-"+id+".jpg","image/jpeg") : val;
  }

  /* Build safe filename prefix: apt-name + date + category */
  var safeApt  = (rep.propiedad||"sin-apto").replace(/[^a-zA-Z0-9\u00C0-\u017E]/g,"").replace(/\s+/g,"-").slice(0,30);
  var safeDate = (rep.fecha||todayStr()).replace(/-/g,"");
  var safeCat  = (rep.categoria||"trabajo").split(" ")[0].toLowerCase();
  var prefix   = safeApt+"_"+safeDate+"_"+safeCat;

  r.fotoAntes   = r.fotoAntes   ? await Promise.all(r.fotoAntes.map(function(f,i){  return f&&f.startsWith&&f.startsWith("data:")?uploadMedia(f,prefix+"_antes-"+(i+1)+".jpg","image/jpeg",safeCat):Promise.resolve(f); })) : [];
  r.fotoDespues = r.fotoDespues ? await Promise.all(r.fotoDespues.map(function(f,i){return f&&f.startsWith&&f.startsWith("data:")?uploadMedia(f,prefix+"_despues-"+(i+1)+".jpg","image/jpeg",safeCat):Promise.resolve(f);})) : [];

  if (r.factura&&r.factura.data&&r.factura.data.startsWith("data:")) {
    var ext = r.factura.type==="application/pdf"?"pdf":"jpg";
    var fu  = await uploadMedia(r.factura.data,"factura-"+id+"."+ext, r.factura.type);
    r.factura = {name:r.factura.name, type:r.factura.type, data:fu};
  }

  /* Upload single fields in parallel */
  var singleFields = ["fotoUniforme","fotoPisoGeneral","fotosRegadera","fotosDucha","fotosEstufa","fotosFregadero",
    "fotosMicroondas","fotosCafetera","fotosEcofiltro","fotosLavatrastos","fotosRefrigerador",
    "fotosTv","fotosSillon","fotosInsumos","fotosDebajoCama","fotosCloset",
    "fotosMicroondas2","fotosPlatos","fotosDetrasElect"];
  await Promise.all(singleFields.map(async function(sf){
    if(r[sf]&&r[sf].startsWith&&r[sf].startsWith("data:"))
      r[sf] = await upOne(r[sf],sf);
  }));

  /* Upload array fields in parallel */
  var arrFields = ["fotosHabitaciones","fotosDrenajes","fotosVentanas","fotosGavetas","fotosDetalle"];
  await Promise.all(arrFields.map(async function(af){
    if(r[af]) r[af]=await upArr(r[af],af);
  }));

  if (r.fotosBanos&&r.fotosBanos.length) {
    var nb=[];
    for (var bi=0;bi<r.fotosBanos.length;bi++) {
      var bn=Object.assign({},r.fotosBanos[bi]);
      if(bn.ducha&&bn.ducha.startsWith&&bn.ducha.startsWith("data:")) bn.ducha=await uploadMedia(bn.ducha,"bano-ducha-"+id+"-"+bi+".jpg","image/jpeg");
      if(bn.inodoro&&bn.inodoro.startsWith&&bn.inodoro.startsWith("data:")) bn.inodoro=await uploadMedia(bn.inodoro,"bano-inodoro-"+id+"-"+bi+".jpg","image/jpeg");
      nb.push(bn);
    }
    r.fotosBanos=nb;
  }

  if (r.inventario&&r.inventario.length) {
    var ni=r.inventario.map(function(item){return Object.assign({},item);});
    for(var ii=0;ii<ni.length;ii++){
      if(ni[ii].foto&&ni[ii].foto.startsWith&&ni[ii].foto.startsWith("data:"))
        ni[ii].foto=await uploadMedia(ni[ii].foto,"inv-"+id+"-"+ii+".jpg","image/jpeg");
    }
    r.inventario=ni;
  }

  if (r.danios&&r.danios.length) {
    var nd=[];
    for(var di=0;di<r.danios.length;di++){
      var dobj=Object.assign({},r.danios[di]);
      dobj.fotos  = await upArr(dobj.fotos,  "danio-"+di);
      dobj.fotos2 = await upArr(dobj.fotos2, "danio2-"+di);
      nd.push(dobj);
    }
    r.danios=nd;
  }

  return r;
}

async function saveReportFull(rep) {
  if (IS_CLAUDE_SANDBOX) {
    var r = Object.assign({},rep);
    ls_saveReport(r);
    return r;
  }
  /* STEP 1: Save report immediately without photos (fast, ensures record exists) */
  /* Strip ALL base64 photo fields — they're too large for Sheets and will be uploaded in step 2 */
  function stripBase64(v) {
    if(!v) return v;
    if(typeof v==="string"&&v.startsWith("data:")) return null;
    if(Array.isArray(v)) return v.map(function(x){return stripBase64(x);});
    if(typeof v==="object"){var c=Object.assign({},v);Object.keys(c).forEach(function(k){c[k]=stripBase64(c[k]);});return c;}
    return v;
  }
  var photoFields=["fotoAntes","fotoDespues","factura","fotoUniforme","fotoPisoGeneral",
    "fotosHabitaciones","fotosBanos","fotosDrenajes","fotosVentanas","fotosGavetas","fotosDetalle",
    "fotosMicroondas","fotosCafetera","fotosEcofiltro","fotosLavatrastos","fotosRefrigerador",
    "fotosEstufa","fotosTv","fotosSillon","fotosInsumos","fotosDebajoCama","fotosCloset",
    "fotosMicroondas2","fotosPlatos","fotosDetrasElect","fotosRegadera","fotosDucha","fotosFregadero","inventario","danios"];
  var stub = Object.assign({},rep,{_uploading:true});
  photoFields.forEach(function(k){if(stub[k]!==undefined)stub[k]=stripBase64(stub[k]);});
  /* Also clear simple array fields */
  stub.fotoAntes=[]; stub.fotoDespues=[]; stub.factura=null;
  try { await apiCall("saveReport",{data:stub}); } catch(e) { console.error("Stub save failed:",e); throw e; }

  /* STEP 2: Upload media & update report (may take longer) */
  var maxRetries = 2;
  for (var attempt=0; attempt<=maxRetries; attempt++) {
    try {
      var processed = await processMedia(rep);
      processed._uploading = false;
      processed._photoError = false;
      await apiCall("saveReport",{data:processed});
      console.log("Photos uploaded successfully on attempt", attempt+1);
      return processed;
    } catch(e) {
      console.error("Photo upload attempt "+(attempt+1)+" failed:", e&&e.message?e.message:String(e));
      if (attempt < maxRetries) {
        await new Promise(function(r){setTimeout(r, 2000*(attempt+1));});
        continue;
      }
      /* All retries exhausted — save stub without photos */
      var failStub = Object.assign({},stub,{_uploading:false,_photoError:true});
      try { await apiCall("saveReport",{data:failStub}); } catch(_){}
      return failStub;
    }
  }
}

async function deleteReportById(id) {
  if(IS_CLAUDE_SANDBOX){ls_deleteReport(id);return;}
  await apiCall("deleteReport",{id:id});
}

async function saveConfigItem(key, value) {
  if(IS_CLAUDE_SANDBOX){
    var ls_km={vendors:"c:v",props:"c:p",pin:"c:pin",company:"c:co",extcats:"c:ec"};
    ls_set(ls_km[key]||key,value);
    return;
  }
  var km={vendors:"vendors",props:"props",pin:"adminpin",company:"company",extcats:"extcats"};
  try {
    await apiCall("saveConfig",{key:km[key]||key,value:value});
  } catch(e) {
    console.error("saveConfig failed for key "+key+":", e.message);
    /* Fallback to localStorage so data isn't lost */
    var ls_km2={vendors:"c:v",props:"c:p",pin:"c:pin",company:"c:co",extcats:"c:ec"};
    ls_set(ls_km2[key]||key,value);
  }
}


/* ═══ OFFLINE RETRY QUEUE */
var RETRY_KEY = "sam_retry_q";

function rq_get() { try{return JSON.parse(localStorage.getItem(RETRY_KEY)||"[]");}catch(e){return[];} }
function rq_set(q) { try{localStorage.setItem(RETRY_KEY,JSON.stringify(q));}catch(e){} }
function rq_add(rep) {
  var q=rq_get(); if(q.find(function(x){return x.rep.id===rep.id;})) return;
  q.push({rep:rep,attempts:0,nextTry:Date.now()+30000});
  rq_set(q);
}
function rq_remove(id) { rq_set(rq_get().filter(function(x){return x.rep.id!==id;})); }
function rq_pending() { return rq_get().filter(function(x){return x.attempts>=3;}); }

async function rq_process(onSuccess) {
  var q=rq_get(); if(!q.length) return false;
  var now=Date.now(); var changed=false;
  var delays=[30000,120000,300000];
  for(var i=q.length-1;i>=0;i--) {
    var item=q[i];
    if(item.attempts>=3||now<item.nextTry) continue;
    try {
      var r=await saveReportFull(item.rep);
      q.splice(i,1); changed=true;
      if(onSuccess) onSuccess(r);
    } catch(e) {
      q[i].attempts++;
      q[i].nextTry=now+(delays[Math.min(q[i].attempts-1,2)]);
      changed=true;
    }
  }
  if(changed) rq_set(q);
  return changed;
}


/* ─── Error Boundary — catches any render crash and shows friendly screen */
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = {hasError:false, msg:""}; }
  static getDerivedStateFromError(err) { return {hasError:true, msg:err&&err.message?err.message:String(err)}; }
  componentDidCatch(err, info) { console.error("App crash:", err, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#FAFAFA",gap:20,padding:30,fontFamily:"Montserrat,sans-serif"}}>
          <div style={{fontSize:32}}>⚠</div>
          <div style={{fontSize:18,fontWeight:600,color:"#3E3F3F",textAlign:"center"}}>Algo salió mal</div>
          <div style={{fontSize:12,color:"#938B8A",textAlign:"center",maxWidth:320,lineHeight:1.6}}>{this.state.msg||"Error inesperado al cargar la aplicación."}</div>
          <button onClick={function(){window.location.reload();}} style={{marginTop:8,padding:"12px 28px",borderRadius:8,border:"none",background:"#3E3F3F",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",letterSpacing:".06em"}}>Recargar →</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══ DEFAULTS (fallback si Sheets aún no tiene config) */
var DEF_V = [
  {id:"v1",name:"Jorge Mantenimiento",primerNombre:"Jorge",segundoNombre:"",primerApellido:"Mantenimiento",segundoApellido:"",empresa:"",tipo:"interno",categoria:"EPI Mantenimiento",email:"jorge@spacioam.com",password:"jorge123",phone:"",active:true,tarifaLimpieza:75,isAdmin:false},
  {id:"v2",name:"Luis Electricidad",  primerNombre:"Luis", segundoNombre:"",primerApellido:"Electricidad", segundoApellido:"",empresa:"",tipo:"interno",categoria:"EPI Mantenimiento",email:"luis@spacioam.com", password:"luis123", phone:"",active:true,tarifaLimpieza:100,isAdmin:false},
  {id:"v3",name:"María Limpieza",     primerNombre:"María",segundoNombre:"",primerApellido:"Limpieza",     segundoApellido:"",empresa:"",tipo:"interno",categoria:"EPI Limpieza",    email:"maria@spacioam.com",password:"maria123",phone:"",active:true,tarifaLimpieza:75,isAdmin:false},
];
var DEF_P = [
  {id:"p1",name:"Narama – Apto 725",cuartos:1,banos:1},
  {id:"p2",name:"Narama – Apto 801",cuartos:1,banos:1},
  {id:"p3",name:"Narama – Apto 612",cuartos:1,banos:1},
  {id:"p4",name:"Casa San Ignacio – Apto 506",cuartos:2,banos:1},
  {id:"p5",name:"Casa San Ignacio – Apto 312",cuartos:1,banos:1},
  {id:"p6",name:"Edificio Principal – Apto 1508",cuartos:2,banos:2},
  {id:"p7",name:"Edificio Principal – Apto 210",cuartos:1,banos:1},
];

/* ═══ ROOT */
export default function App() {
  const [sess,     setSess]     = useState(null);
  const [reps,     setReps]     = useState([]);
  const [vendors,  setVendors]  = useState(DEF_V);
  const [props,    setProps]    = useState(DEF_P);
  const [pin,      setPin]      = useState("spacio2024");
  const [company,  setCompany]  = useState({name:"Spacio AM S.A.",nit:"118287796"});
  const [extCats,   setExtCats]   = useState([]);
  const [hospUrlDay,  setHospUrlDay]  = useState("https://share.hospitable.com/metrics/1d1aabad-db5f-4f7a-847d-0de50c9dedc4");
  const [hospUrlWeek, setHospUrlWeek] = useState("https://share.hospitable.com/metrics/c914e6fc-94b9-4c1b-89c6-7722cf2315d6");
  const [schedules, setSchedules] = useState([]);
  const [feedback,  setFeedback]  = useState([]);
  const [ready,    setReady]    = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [syncMsg,  setSyncMsg]  = useState("");
  const [sheetsOk, setSheetsOk] = useState(null);
  const [retryQ,   setRetryQ]   = useState([]);
  const [adelantos, setAdelantos] = useState([]);

  /* Adelantos (advances): se cargan vía loadAllData (localStorage en demo, Sheets en vivo)
     y se migran/ligan a su técnico en el .then de carga. */
  async function svAdelantos(v){ setAdelantos(v); adv_persist(v); }

  useEffect(function(){
    /* Restore session from localStorage */
    try {
      var saved = localStorage.getItem("sam_sess");
      if (saved) {
        var ps = JSON.parse(saved);
        /* Only restore if session has a valid role */
        if (ps && (ps.role==="admin"||ps.role==="vendor")) setSess(ps);
        else localStorage.removeItem("sam_sess");
      }
    } catch(e){ try{localStorage.removeItem("sam_sess");}catch(_){} }
    try { setRetryQ(rq_pending()); } catch(e){}

    setSyncing(true); setSyncMsg("Conectando…");

    /* Hard timeout: 15s — show app no matter what (carga secuencial + cold start) */
    var timeoutId = setTimeout(function(){
      console.warn("Sheets timeout — loading with localStorage fallback");
      try {
        var fb = ls_loadAll();
        if(fb.vendors&&fb.vendors.length) setVendors(fb.vendors);
        if(fb.props&&fb.props.length)     setProps(fb.props);
        if(fb.reports)                    setReps(fb.reports);
        if(fb.adminpin)                   setPin(fb.adminpin);
      } catch(lsErr){ console.error("localStorage fallback failed:", lsErr); }
      setSheetsOk(false); setReady(true); setSyncing(false);
    }, 15000);

    loadAllData().then(function(d){
      clearTimeout(timeoutId);
      setReps(d.reports||[]);
      setVendors(d.vendors||DEF_V);
      setProps(d.props||DEF_P);
      setPin(d.pin||"spacio2024");
      setCompany(d.company||{name:"Spacio AM S.A.",nit:"118287796"});
      if(d.extcats)   setExtCats(d.extcats);
      if(d.schedules) setSchedules(d.schedules);
      if(d.hospurlday)  setHospUrlDay(d.hospurlday||"");
      if(d.hospurlweek) setHospUrlWeek(d.hospurlweek||"");
      if(d.feedback)  setFeedback(d.feedback);
      /* Adelantos: tomar de la fuente (Sheets/local) o sembrar; luego ligar a técnicos. */
      var advRaw=(d.adelantos && d.adelantos.length)?d.adelantos:adv_seed();
      var mig=adv_migrate(advRaw, d.vendors||DEF_V);
      setAdelantos(mig.list);
      if(mig.changed || !(d.adelantos && d.adelantos.length)) { try{ adv_persist(mig.list); }catch(_){} }
      setSheetsOk(!IS_CLAUDE_SANDBOX);
      setReady(true); setSyncing(false);
    }).catch(function(e){
      clearTimeout(timeoutId);
      console.error("Load failed:",e);
      try {
        var fb = ls_loadAll();
        if(fb.vendors) setVendors(fb.vendors);
        if(fb.props)   setProps(fb.props);
        if(fb.reports) setReps(fb.reports);
      } catch(_){}
      setSheetsOk(false); setReady(true); setSyncing(false);
    });

    /* Retry queue — every 45s */
    var retryInterval = setInterval(function(){
      rq_process(function(r){
        setReps(function(prev){
          var i=prev.findIndex(function(x){return x.id===r.id;});
          if(i>=0){var n=[...prev];n[i]=r;return n;}
          return [r,...prev];
        });
      }).then(function(ch){if(ch)setRetryQ(rq_pending());}).catch(function(){});
    }, 45000);

    return function(){ clearTimeout(timeoutId); clearInterval(retryInterval); };
  },[]);

  async function upsert(r) {
    setSyncing(true); setSyncMsg("Subiendo a Google Drive…");
    try {
      var processed = await saveReportFull(r);
      setReps(function(prev){
        var i=prev.findIndex(function(x){return x.id===r.id;});
        if(i>=0){var n=[...prev];n[i]=processed;return n;}
        return [processed,...prev];
      });
    } catch(e) {
      console.error("Upsert failed, adding to retry queue:", e);
      rq_add(r);
      /* Still show locally so the user sees it */
      setReps(function(prev){
        var i=prev.findIndex(function(x){return x.id===r.id;});
        if(i>=0){var n=[...prev];n[i]=r;return n;}
        return [r,...prev];
      });
      setRetryQ(rq_pending());
    } finally { setSyncing(false); setSyncMsg(""); }
  }
  async function del(id) {
    await deleteReportById(id);
    setReps(function(p){return p.filter(function(r){return r.id!==id;});});
  }
  async function svV(v) { setVendors(v); saveConfigItem("vendors",v); }
  async function svP(v) { setProps(v);   saveConfigItem("props",v); }
  async function svPin(v) { setPin(v);     saveConfigItem("pin",v); }
  async function svCo(v)  { setCompany(v); saveConfigItem("company",v); }
  async function svExtCats(v)   { setExtCats(v);   saveConfigItem("extcats",v); }
  async function svSchedules(v) { setSchedules(v); saveConfigItem("schedules",v); }
  async function svHospUrlDay(v)  { setHospUrlDay(v);  saveConfigItem("hospurlday",v); }
  /* Preset Hospitable URLs already configured */
  async function svHospUrlWeek(v) { setHospUrlWeek(v); saveConfigItem("hospurlweek",v); }
  async function svFeedback(v)  { setFeedback(v);  saveConfigItem("feedback",v); }

  async function refresh() {
    setSyncing(true); setSyncMsg("Actualizando…");
    try {
      var d = await loadAllData();
      setReps(d.reports);
      setVendors(d.vendors);
      setProps(d.props);
      setPin(d.pin);
      setCompany(d.company);
      if(d.extcats)   setExtCats(d.extcats);
      if(d.schedules) setSchedules(d.schedules);
      if(d.hospurlday)  setHospUrlDay(d.hospurlday||"");
      if(d.hospurlweek) setHospUrlWeek(d.hospurlweek||"");
      if(d.feedback)  setFeedback(d.feedback);
      setSheetsOk(true);
    } catch(e) { setSheetsOk(false); }
    finally { setSyncing(false); setSyncMsg(""); }
  }
  function login(s) {
    try { localStorage.setItem("sam_sess",JSON.stringify(s)); } catch(e){}
    setSess(s);
  }
  function logout() {
    try { localStorage.removeItem("sam_sess"); } catch(e){}
    setSess(null);
  }

  var inner;
  if (!ready) {
    inner = <Loader/>;
  } else if (!sess) {
    inner = <Login vendors={vendors} adminPin={pin} onLogin={login} sheetsOk={sheetsOk}/>;
  } else if (sess.role==="vendor"&&sess.vendor) {
    inner = <VendorApp vendor={sess.vendor} allVendors={vendors} reps={reps.filter(function(r){return r.reportadoPor===sess.vendor.email;})} props={props} company={company} schedules={schedules} hospUrlDay={hospUrlDay} hospUrlWeek={hospUrlWeek} adelantos={adelantos} onSvAdelantos={svAdelantos} onSubmit={upsert} onUpdate={upsert} onSvV={svV} onSvFeedback={svFeedback} onLogout={logout}/>;
  } else {
    inner = <AdminApp reps={reps} vendors={vendors} props={props} adminPin={pin} company={company} extCats={extCats} schedules={schedules} hospUrlDay={hospUrlDay} hospUrlWeek={hospUrlWeek} feedback={feedback} adelantos={adelantos} onSvAdelantos={svAdelantos} syncing={syncing} syncMsg={syncMsg} sheetsOk={sheetsOk} retryQ={retryQ} setRetryQ={setRetryQ} setReps={setReps} adminVendor={sess&&sess.vendor?sess.vendor:null} onUpsert={upsert} onDelete={del} onSvV={svV} onSvP={svP} onSvPin={svPin} onSvCo={svCo} onSvExtCats={svExtCats} onSvSchedules={svSchedules} onSvHospUrlDay={svHospUrlDay} onSvHospUrlWeek={svHospUrlWeek} onSvFeedback={svFeedback} onRefresh={refresh} onLogout={logout}/>;
  }
  return <ErrorBoundary>{inner}</ErrorBoundary>;
}

/* ═══ LOGIN */
function Login({vendors, adminPin, onLogin, sheetsOk}) {
  const [email,    setEmail]    = useState("");
  const [pass,     setPass]     = useState("");
  const [err,      setErr]      = useState("");
  const [adminPin2,setAdminPin2]= useState("");
  const [adminErr, setAdminErr] = useState("");
  const [showAdmin,setShowAdmin]= useState(false);

  function loginUser() {
    var input = email.toLowerCase().trim();
    var v = vendors.find(function(x){
      var em = x.email.toLowerCase();
      var user = em.split("@")[0];
      return (em===input||user===input) && x.password===pass && x.active;
    });
    if (v) onLogin({role:v.isAdmin?"admin":"vendor",vendor:v});
    else setErr("Correo o contraseña incorrectos.");
  }
  function loginAdmin() {
    if(adminPin2===adminPin) onLogin({role:"admin"});
    else setAdminErr("Contraseña incorrecta.");
  }

  return (
    <div style={{minHeight:"100vh",background:C.alabaster,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"Montserrat,sans-serif",}}>
      <GS/>
      {/* Sheets badge + hidden admin gear — top right, fixed */}
      <div style={{position:"fixed",top:14,right:14,display:"flex",alignItems:"center",gap:8,zIndex:200}}>
        {sheetsOk===false&&<div style={{fontSize:10,fontWeight:700,background:"#F5EDEC",color:"#8a3030",padding:"4px 10px",borderRadius:6,border:"1px solid #DBC8C4",letterSpacing:".06em"}}>⚠ Sin Sheets</div>}
        {sheetsOk===true&&<div style={{fontSize:10,fontWeight:700,background:"#EDF5EF",color:"#3d6b52",padding:"4px 10px",borderRadius:6,letterSpacing:".06em"}}>● Sheets OK</div>}
        <button onClick={function(){setShowAdmin(function(p){return !p;});setAdminErr("");setAdminPin2("");}} title="Acceso administrador" style={{background:"none",border:"none",cursor:"pointer",padding:"4px",color:C.gray,fontSize:15,lineHeight:1,opacity:.45}}>⚙</button>
      </div>

      <div style={{width:"100%",maxWidth:400,padding:"0 4px"}}>
        {/* Logo — same as before */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:36,gap:12}}>
          <LogoWordmark width={180}/>
          <div style={{fontSize:9.5,color:C.earth,fontWeight:600,letterSpacing:".22em",textTransform:"uppercase",marginTop:2,textAlign:"center",lineHeight:1.9}}>
            App operativa para el<br/>Equipo de primera impresión (EPI)
          </div>
        </div>

        {/* Main login form */}
        <div style={{background:"#fff",borderRadius:12,padding:"28px 24px",border:"1px solid "+C.line,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <F label="Correo electrónico">
              <input type="email" placeholder="tu@correo.com" value={email} onChange={function(e){setEmail(e.target.value);setErr("");}} autoFocus/>
            </F>
            <F label="Contraseña">
              <input type="password" placeholder="••••••••" value={pass} onChange={function(e){setPass(e.target.value);setErr("");}} onKeyDown={function(e){if(e.key==="Enter")loginUser();}}/>
            </F>
            {err&&<Err msg={err}/>}
            <BigBtn onClick={loginUser} dis={!email||!pass}>Ingresar →</BigBtn>
          </div>
        </div>

        {/* Admin panel — revealed by gear icon */}
        {showAdmin&&(
          <div style={{marginTop:12,background:"#fff",borderRadius:10,padding:"16px 20px",border:"1.5px solid "+C.line,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
            <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".22em",textTransform:"uppercase",marginBottom:12}}>Acceso administrador</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <F label="Contraseña">
                <input type="password" placeholder="••••••••" value={adminPin2} onChange={function(e){setAdminPin2(e.target.value);setAdminErr("");}} onKeyDown={function(e){if(e.key==="Enter")loginAdmin();}} autoFocus/>
              </F>
              {adminErr&&<Err msg={adminErr}/>}
              <BigBtn onClick={loginAdmin} dis={!adminPin2}>Ingresar →</BigBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ ADMIN */
function AdminApp({reps,vendors,props,adminPin,company,extCats,schedules,hospUrlDay,hospUrlWeek,feedback,adelantos,onSvAdelantos,syncing,syncMsg,sheetsOk,retryQ,setRetryQ,setReps,adminVendor,onUpsert,onDelete,onSvV,onSvP,onSvPin,onSvCo,onSvExtCats,onSvSchedules,onSvHospUrlDay,onSvHospUrlWeek,onSvFeedback,onRefresh,onLogout}) {
  const [tab,    setTab]    = useState("dash");
  const [detail, setDetail] = useState(null);
  const [cDel,   setCDel]   = useState(null);

  function markPaid(idOrRep,p) {
    /* markPaid(id, bool) — toggle paid    |    markPaid(repObj) — update any field */
    var base;
    if (typeof idOrRep==="object") { base=Object.assign({},reps.find(function(x){return x.id===idOrRep.id;})||{},idOrRep); }
    else { base=Object.assign({},reps.find(function(x){return x.id===idOrRep;})||{},{paid:p}); }
    onUpsert(base);
  }
  function qaUpdate(id,status,comment) {
    var r=reps.find(function(x){return x.id===id;}); if(!r) return;
    var upd=Object.assign({},r,{qaStatus:status,qaComentario:comment||"",qaFecha:todayStr()});
    onUpsert(upd); setDetail(upd);
  }
  var alerts    = reps.filter(function(r){return !!alertLvl(r);});
  var pendingQA = reps.filter(function(r){return isCleaning(r.categoria)&&r.qaStatus==="pendiente";}).length;

  return (
    <div style={{background:C.alabaster,minHeight:"100vh",fontFamily:"Montserrat,sans-serif"}}>
      <GS/>
      {syncing&&<SyncBanner msg={syncMsg}/>}
      {sheetsOk===false&&(
        <div style={{background:"#F5EDEC",borderBottom:"1px solid #DBC8C4",padding:"10px 20px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:700,color:C.red}}>⚠ Sin conexión a Google Sheets</span>
          <span style={{fontSize:12,color:C.earth}}>Los datos se guardan localmente. Se reintentará automáticamente.</span>
        </div>
      )}
      {retryQ&&retryQ.length>0&&<RetryBanner retryQ={retryQ} setRetryQ={setRetryQ} reps={reps} setReps={setReps} onSyncing={function(b,m){}}/>}
      <ResponsiveHeader
        tab={tab} setTab={setTab}
        alertCount={alerts.length} pendingQA={pendingQA} sheetsOk={sheetsOk} adminLabel={adminVendor?vendorDisplay(adminVendor):"Admin"}
        navItems={[["dash","Dashboard","dash"],["form","Formulario","edit"],["sched","Programa","calendar"],["qa","Calidad","star"],["adv","Adelantos","coins"],["cfg","Config","settings"]]}
        onLogout={onLogout}
        role="Admin"
      />

      <div style={{display:tab==="dash"?"block":"none"}}><DashView reps={reps} vendors={vendors} alerts={alerts} adelantos={adelantos} onSelect={setDetail} onMarkPaid={markPaid} onRefresh={onRefresh}/></div>
      <div style={{display:tab==="form"?"block":"none"}}><RepForm  vendors={vendors} props={props} company={company} defaultVendor={adminVendor?adminVendor.email:""} onSubmit={function(r){onUpsert(r);setTab("dash");}}/></div>
      <div style={{display:tab==="sched"?"block":"none"}}>
        <ScheduleCfg schedules={schedules||[]} vendors={vendors||[]} props={props||[]} hospUrlDay={hospUrlDay||""} hospUrlWeek={hospUrlWeek||""} onSave={onSvSchedules} onSaveHospUrlDay={onSvHospUrlDay} onSaveHospUrlWeek={onSvHospUrlWeek}/>
        {/* Hospitable iframes — reference view for admin */}
        {(hospUrlDay||hospUrlWeek)&&(
          <div style={{padding:"0 16px 60px",fontFamily:"Montserrat,sans-serif",maxWidth:700,margin:"0 auto"}}>
            {hospUrlDay&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:9.5,fontWeight:700,color:"#938B8A",letterSpacing:".18em",textTransform:"uppercase",marginBottom:8}}>Programa de hoy (Hospitable)</div>
                <div style={{borderRadius:10,overflow:"hidden",border:"1px solid #D8D4CE"}}>
                  <iframe src={hospUrlDay} title="Hoy" style={{width:"100%",height:420,border:"none",display:"block"}} sandbox="allow-scripts allow-same-origin allow-popups allow-forms"/>
                </div>
                <a href={hospUrlDay} target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",marginTop:8,fontSize:11.5,color:"#938B8A",textDecoration:"none"}}>↗ Abrir en pantalla completa</a>
              </div>
            )}
            {hospUrlWeek&&(
              <div>
                <div style={{fontSize:9.5,fontWeight:700,color:"#938B8A",letterSpacing:".18em",textTransform:"uppercase",marginBottom:8}}>Programa semanal (Hospitable)</div>
                <div style={{borderRadius:10,overflow:"hidden",border:"1px solid #D8D4CE"}}>
                  <iframe src={hospUrlWeek} title="Semana" style={{width:"100%",height:460,border:"none",display:"block"}} sandbox="allow-scripts allow-same-origin allow-popups allow-forms"/>
                </div>
                <a href={hospUrlWeek} target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",marginTop:8,fontSize:11.5,color:"#938B8A",textDecoration:"none"}}>↗ Abrir en pantalla completa</a>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{display:tab==="qa"?"block":"none"}}>
        <AdminQAPanel reps={reps} vendors={vendors} onQA={qaUpdate} onSelect={setDetail}/>
      </div>
      <div style={{display:tab==="adv"?"block":"none"}}><AdvancesAdmin adelantos={adelantos} reps={reps} vendors={vendors} onSvAdelantos={onSvAdelantos}/></div>
      <div style={{display:tab==="cfg" ?"block":"none"}}><CfgView  vendors={vendors} props={props} adminPin={adminPin} company={company} extCats={extCats||[]} onSvV={onSvV} onSvP={onSvP} onSvPin={onSvPin} onSvCo={onSvCo} onSvExtCats={onSvExtCats}/></div>

      {detail&&<DetailModal rep={detail} vendors={vendors} props={props} onClose={function(){setDetail(null);}} onMarkPaid={function(p){markPaid(detail.id,p);setDetail(function(x){return Object.assign({},x,{paid:p});});}} onSave={function(r){onUpsert(r);setDetail(r);}} onQA={qaUpdate} onDelete={function(){setCDel(detail.id);}}/>}
      {cDel&&<Overlay><ConfirmDel onCancel={function(){setCDel(null);}} onConfirm={function(){onDelete(cDel);setCDel(null);setDetail(null);}}/></Overlay>}
    </div>
  );
}

/* ─── Dashboard container */
function DashView({reps,vendors,alerts,adelantos,onSelect,onMarkPaid,onRefresh}) {
  const [sub,setSub] = useState("ops");
  return (
    <div>
      {alerts.length>0&&<div style={{background:"#EDE4E4",padding:"10px 22px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",borderBottom:"1px solid #D6C8C8"}}><span>⚠️</span><span style={{fontSize:13,fontWeight:600,color:C.red}}>{alerts.length} trabajo{alerts.length!==1?"s":""} con pago pendiente</span></div>}
      <div style={{background:"#fff",borderBottom:"1px solid "+C.gray,padding:"0 22px",display:"flex",gap:4}}>
        {[["ops","Dashboard Operativo"],["exec","Dashboard Ejecutivo"]].map(function(it){ var k=it[0],l=it[1]; return (
          <button key={k} onClick={function(){setSub(k);}} style={{padding:"14px 16px",border:"none",borderBottom:"1.5px solid "+(sub===k?C.black:"transparent"),background:"none",fontSize:13,fontWeight:600,cursor:"pointer",color:sub===k?C.black:C.taupe,transition:"all .2s"}}>{l}</button>
        ); })}
      </div>
      <div style={{display:sub==="ops" ?"block":"none"}}><OpsDash  reps={reps} vendors={vendors} adelantos={adelantos} onSelect={onSelect} onMarkPaid={onMarkPaid} onRefresh={onRefresh}/></div>
      <div style={{display:sub==="exec"?"block":"none"}}><ExecDash reps={reps} vendors={vendors}/></div>
    </div>
  );
}

/* ─── Operational Dashboard */
function OpsDash({reps,vendors,adelantos,onSelect,onMarkPaid,onRefresh}) {
  const [view,     setView]     = useState("table");
  const [fVend,    setFVend]    = useState("Todos");
  const [fStatus,  setFStatus]  = useState("Todos");
  const [fCat,     setFCat]     = useState("Todos");
  const [fPagador, setFPagador] = useState("Todos");
  const [fDesde,   setFDesde]   = useState("");
  const [fHasta,   setFHasta]   = useState("");
  const [showAll,  setShowAll]  = useState(false);

  function applyPreset(val) {
    var r = presetRange(val); setFDesde(r.from); setFHasta(r.to);
  }

  function reset() { setFVend("Todos"); setFStatus("Todos"); setFCat("Todos"); setFPagador("Todos"); setFDesde(""); setFHasta(""); setShowAll(false); }

  var fReps = reps.filter(function(r) {
    if (fVend!=="Todos"&&r.reportadoPor!==fVend) return false;
    if (fStatus==="✓ Pagado"&&!(r.paid&&r.total)) return false;
    if (fStatus==="● Pendiente"&&(r.paid||!r.total)) return false;
    if (fCat!=="Todos"&&r.categoria!==fCat) return false;
    if (fPagador!=="Todos"&&(r.pagadoPor||"")!==fPagador) return false;
    if (fDesde&&r.fecha<fDesde) return false;
    if (fHasta&&r.fecha>fHasta) return false;
    return true;
  });
  var shown  = showAll ? fReps : fReps.slice(0,10);
  /* Use auto-tariff as fallback when r.total is not yet saved */
  function effT(r){
    var t=parseFloat(r.total||0);
    if(t>0) return t;
    var at=autoTarifa(r.reportadoPor||"",vendors||[]);
    return at.tarifa?parseFloat(at.tarifa)||0:0;
  }
  var tot    = fReps.reduce(function(s,r){return s+effT(r);},0);
  var cob    = fReps.filter(function(r){return r.paid;}).reduce(function(s,r){return s+effT(r);},0);
  var unp    = fReps.filter(function(r){return (r.total||autoTarifa(r.reportadoPor||"",vendors||[]).tarifa)&&!r.paid;}).length;
  /* Separar semanas anteriores (pagables) de la semana en curso — la empresa paga a internos con 1 semana de atraso */
  var wk     = splitPayableWeeks(fReps, effT);
  var adel   = advanceChargeFor(adelantos, reps, fVend);
  var netoPrev = Math.max(0, wk.prev.porCobrar - adel);
  /* Build vendor map: email → display name */
  var vMap = {};
  (vendors||[]).forEach(function(v){if(v.email)vMap[v.email]=vendorDisplay(v);});
  /* List of unique vendor emails in current reports */
  var vEmails = uniq(reps.map(function(r){return r.reportadoPor;}).filter(Boolean));
  var actF   = [fVend!=="Todos",fStatus!=="Todos",fCat!=="Todos",fPagador!=="Todos",!!fDesde,!!fHasta].filter(Boolean).length;

  var IS = {border:"1.5px solid "+C.gray,borderRadius:9,padding:"7px 10px",fontSize:12.5,fontFamily:"Montserrat,sans-serif",outline:"none",background:"#fff",color:C.black,cursor:"pointer",transition:"all .2s"};
  var IS_A = Object.assign({},IS,{border:"1.5px solid "+C.black,fontWeight:600});
  var LBL = {fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".13em",textTransform:"uppercase",display:"block",marginBottom:5};

  return (
    <div>
      {/* Stats bar */}
      <StatsSummary
        heroLabel="A depositar"
        heroValue={"Q"+netoPrev.toLocaleString()}
        heroGreen={netoPrev<=0}
        enCursoCount={wk.cur.reps.length}
        enCursoMonto={wk.cur.monto}
        items={[
          {label:"Trabajos", value:wk.prev.pndCount, sub:"pendientes"},
          {label:"Facturado", value:"Q"+Math.round(wk.prev.porCobrar).toLocaleString(), sub:"sin pagar"},
          {label:"Cobrado", value:"Q"+Math.round(wk.prev.cob).toLocaleString(), green:true},
          adel>0?{label:"Adelanto / sem"+(fVend!=="Todos"?"":" (todos)"), value:"−Q"+adel.toLocaleString(), peach:true, sub:"descuento auto"}:null,
        ]}
      />

      {/* Filter panel */}
      <div style={{background:"#fff",borderBottom:"1px solid "+C.gray,padding:"14px 20px"}}>
        {/* Row 1: dropdowns */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:12}}>
          <div>
            <span style={LBL}>Técnico</span>
            <select value={fVend} onChange={function(e){setFVend(e.target.value);setShowAll(false);}} style={fVend!=="Todos"?IS_A:IS}>
              <option value="Todos">Todos</option>
              {vEmails.map(function(email){return <option key={email} value={email}>{vMap[email]||email}</option>;})}
            </select>
          </div>
          <div>
            <span style={LBL}>Categoría</span>
            <select value={fCat} onChange={function(e){setFCat(e.target.value);setShowAll(false);}} style={fCat!=="Todos"?IS_A:IS}>
              {["Todos"].concat(CATS).map(function(c){return <option key={c}>{c}</option>;})}
            </select>
          </div>
          <div>
            <span style={LBL}>Estado de pago</span>
            <select value={fStatus} onChange={function(e){setFStatus(e.target.value);setShowAll(false);}} style={fStatus!=="Todos"?IS_A:IS}>
              <option>Todos</option>
              <option>✓ Pagado</option>
              <option>● Pendiente</option>
            </select>
          </div>
          <div>
            <span style={LBL}>Pagador</span>
            <select value={fPagador} onChange={function(e){setFPagador(e.target.value);setShowAll(false);}} style={fPagador!=="Todos"?IS_A:IS}>
              <option>Todos</option>
              <option>Spacio AM</option>
              <option>Dueño</option>
            </select>
          </div>
        </div>

        {/* Row 2: date range + presets + actions */}
        {/* Bulk paid action — only shows when there are pending reps */}
        {fReps.filter(function(r){return !r.paid&&(r.total||autoTarifa(r.reportadoPor||"",vendors).tarifa);}).length>0&&(
          <div style={{background:"#EDF5EF",borderRadius:8,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:12.5,color:C.green,fontWeight:600}}>
              {fReps.filter(function(r){return !r.paid&&(r.total||autoTarifa(r.reportadoPor||"",vendors).tarifa);}).length} trabajo{fReps.filter(function(r){return !r.paid;}).length!==1?"s":""} pendientes de pago{fVend!=="Todos"?" de "+( vMap[fVend]||fVend):""}
            </div>
            <button onClick={function(){
              var toMark = fReps.filter(function(r){return !r.paid&&(r.total||autoTarifa(r.reportadoPor||"",vendors).tarifa);});
              toMark.forEach(function(r){
                var at=autoTarifa(r.reportadoPor||"",vendors);
                onMarkPaid(Object.assign({},r,{paid:true,total:r.total||at.tarifa}));
              });
            }} style={{padding:"7px 16px",borderRadius:7,border:"none",background:"#3d6b52",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              ✓ Marcar todos como pagados
            </button>
          </div>
        )}
        <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div>
            <span style={LBL}>Período rápido</span>
            <select onChange={function(e){applyPreset(e.target.value);e.target.value="";}} style={IS} defaultValue="">
              <option value="" disabled>Seleccionar…</option>
              <option value="hoy">Hoy</option>
              <option value="semana">Semana en curso</option>
              <option value="semana_ant">Semana anterior</option>
              <option value="mes">Este mes</option>
              <option value="3meses">Últimos 3 meses</option>
              <option value="todo">Todo</option>
            </select>
          </div>
          <div>
            <span style={LBL}>Período</span>
            <DateRangePicker from={fDesde} to={fHasta} baseStyle={IS} activeStyle={IS_A} onChange={function(a,b){setFDesde(a);setFHasta(b);setShowAll(false);}}/>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
            {actF>0&&(
              <button onClick={reset} style={{padding:"7px 14px",borderRadius:9,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                ✕ Limpiar
                <span style={{background:C.peach,color:"#fff",borderRadius:"50%",width:17,height:17,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{actF}</span>
              </button>
            )}
            <button onClick={onRefresh} title="Actualizar" style={{padding:"7px 11px",borderRadius:8,border:"1px solid "+C.gray,background:"#fff",color:C.earth,fontSize:15,cursor:"pointer",fontWeight:600,lineHeight:1}}>↻</button>
            <div style={{display:"flex",background:C.surfaceWarm,borderRadius:100,overflow:"hidden",border:"1px solid "+C.line,padding:2,gap:2}}>
              {[["table","Lista","list"],["cal","Cal","calendar"]].map(function(it){ var k=it[0],l=it[1],ic=it[2]; return <button key={k} onClick={function(){setView(k);}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",borderRadius:100,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:view===k?C.black:"transparent",color:view===k?"#fff":C.earth,transition:"all .2s",whiteSpace:"nowrap"}}><Icon name={ic} size={14} stroke={view===k?"#fff":C.earth}/>{l}</button>; })}
            </div>
          </div>
        </div>
      </div>

      {fReps.length===0&&<div style={{textAlign:"center",padding:"52px 20px",color:C.earth,fontSize:14}}>No hay trabajos con estos filtros.<br/><button onClick={reset} style={{marginTop:14,padding:"9px 22px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.black,fontSize:13,fontWeight:600,cursor:"pointer"}}>Limpiar filtros</button></div>}
      {fReps.length>0&&(view==="table"
        ?<TableView reps={shown} total={fReps.length} showAll={showAll} onToggleAll={function(){setShowAll(function(p){return !p;});}} onSelect={onSelect} onMarkPaid={onMarkPaid} vendors={vendors}/>
        :<CalView   reps={fReps} onSelect={onSelect} onMarkPaid={onMarkPaid} vendors={vendors}/>
      )}
    </div>
  );
}

/* ─── Table View */
function TableView({reps,total,showAll,onToggleAll,onSelect,onMarkPaid,vendors}) {
  return (
    <div style={{padding:"20px 16px 80px"}}>
      <div style={{background:"#fff",borderRadius:16,border:"1px solid "+C.gray,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 88px 1fr 88px 108px",padding:"11px 18px",background:C.surface,borderBottom:"1px solid "+C.line}}>
          {["Propiedad","Fecha","Trabajo realizado","Total","Estado de pago"].map(function(h,i){return <div key={i} style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase"}}>{h}</div>;})}
        </div>
        {reps.map(function(r,i) {
          var b=BADGE[r.categoria]||BADGE["Mantenimiento"]; var al=alertLvl(r);
          return (
            <div key={r.id} className="rh" onClick={function(){onSelect(r);}} style={{display:"grid",gridTemplateColumns:"1fr 88px 1fr 88px 108px",padding:"14px 18px",borderBottom:i<reps.length-1?"1px solid "+C.gray:"none",alignItems:"start",background:al?ALT[al].bg+"88":"#fff",cursor:"pointer",transition:"background .15s"}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.black,marginBottom:4}}>{r.propiedad}</div>
                <span style={{padding:"2px 7px",borderRadius:20,fontSize:9.5,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",background:b.bg,color:b.tx}}>{r.categoria}</span>
                {al&&<div style={{fontSize:10,color:ALT[al].clr,fontWeight:600,marginTop:3}}>⚠ {ALT[al].label}</div>}
                <div style={{fontSize:11,color:C.earth,marginTop:3}}>{r.reportadoPor}</div>
              </div>
              <div style={{fontSize:12,color:C.earth,paddingTop:2}}>{fmtDate(r.fecha)}</div>
              <div style={{fontSize:13,color:C.black,lineHeight:1.55,paddingRight:12}}>{r.descripcion}</div>
              <QuickEditTotal rep={r} vendors={vendors} onSave={function(val){onMarkPaid(Object.assign({},r,{total:val}));}}/>
              <div onClick={function(e){e.stopPropagation();}} style={{display:"flex",flexDirection:"column",gap:5}}>
                {(r.total||autoTarifa(r.reportadoPor||"",vendors).tarifa) ? <button onClick={function(e){e.stopPropagation();onMarkPaid(r.id,!r.paid);}} style={{padding:"5px 10px",borderRadius:100,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",background:r.paid?"#EDF5EF":"#F5EDEC",color:r.paid?C.green:C.red,whiteSpace:"nowrap"}}>{r.paid?"✓ Pagado":"● Pendiente"}</button> : <span style={{fontSize:12,color:C.gray}}>—</span>}
                {r.pagadoPor&&<span style={{fontSize:9.5,fontWeight:700,letterSpacing:".08em",padding:"2px 7px",borderRadius:100,whiteSpace:"nowrap",background:r.pagadoPor==="Spacio AM"?"#EEF3FA":"#FEF0EC",color:r.pagadoPor==="Spacio AM"?"#4a7fa5":"#E9826A"}}>{r.pagadoPor}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {total>10&&<button onClick={onToggleAll} style={{marginTop:12,width:"100%",padding:"12px",borderRadius:10,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:13,fontWeight:600,cursor:"pointer"}}>{showAll?"Mostrar solo últimos 10":"Ver todos los "+total+" registros →"}</button>}
    </div>
  );
}

/* ─── Calendar View */
function CalView({reps,onSelect,onMarkPaid,vendors}) {
  const [month,setMonth] = useState(function(){
    if (reps.length>0&&reps[0].fecha) { var p=reps[0].fecha.split("-"); return new Date(parseInt(p[0]),parseInt(p[1])-1,1); }
    return new Date();
  });
  const [dayP,setDayP] = useState(null);

  var yr=month.getFullYear(), mo=month.getMonth();
  var fd=(new Date(yr,mo,1).getDay()+6)%7, dim=new Date(yr,mo+1,0).getDate();
  var today=todayStr();
  var byDate={};
  reps.forEach(function(r){ if(!byDate[r.fecha]) byDate[r.fecha]=[]; byDate[r.fecha].push(r); });
  var cells=[];
  for(var i=0;i<fd;i++) cells.push(null);
  for(var d=1;d<=dim;d++) { var ds=yr+"-"+String(mo+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"); cells.push({d:d,ds:ds,reps:byDate[ds]||[]}); }
  var moKey=String(mo+1).padStart(2,"0");
  var mTot=Object.entries(byDate).filter(function(e){return e[0].startsWith(yr+"-"+moKey);}).reduce(function(s,e){return s+e[1].length;},0);

  return (
    <div style={{padding:"20px 16px 80px",maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
        <button onClick={function(){setMonth(new Date(yr,mo-1,1));}} style={{background:C.beige,border:"none",borderRadius:8,width:34,height:34,fontSize:20,cursor:"pointer",color:C.black,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
        <span style={{fontSize:15,fontWeight:600,color:C.black,textTransform:"capitalize",flex:1,textAlign:"center"}}>
          {month.toLocaleDateString("es-GT",{month:"long",year:"numeric"})}
          {mTot>0&&<span style={{fontSize:12,color:C.earth,fontWeight:400,marginLeft:8}}>— {mTot} trabajo{mTot!==1?"s":""}</span>}
        </span>
        <button onClick={function(){setMonth(new Date(yr,mo+1,1));}} style={{background:C.beige,border:"none",borderRadius:8,width:34,height:34,fontSize:20,cursor:"pointer",color:C.black,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(function(d){return <div key={d} style={{textAlign:"center",fontSize:10.5,fontWeight:700,color:C.earth,padding:"5px 0"}}>{d}</div>;})}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {cells.map(function(cell,idx) {
          if (!cell) return <div key={idx}/>;
          var isT=cell.ds===today, hw=cell.reps.length>0, ha=cell.reps.some(function(r){return !!alertLvl(r);}), isO=dayP&&dayP.date===cell.ds;
          return (
            <div key={idx} onClick={function(){if(hw)setDayP(isO?null:{date:cell.ds,reps:cell.reps});}} style={{minHeight:62,borderRadius:10,padding:"8px 7px",background:isO?C.black:(hw?(ha?"#F5EDEC":"#fff"):C.surfaceWarm),border:"1.5px solid "+(isT?C.peach:(isO?C.black:(hw?C.gray:"transparent"))),cursor:hw?"pointer":"default",transition:"all .18s"}}>
              <div style={{fontSize:12,fontWeight:isT?700:400,color:isO?"#fff":(isT?C.peach:C.black),marginBottom:4}}>{cell.d}</div>
              {hw&&<div style={{display:"flex",flexWrap:"wrap",gap:2,marginBottom:2}}>{cell.reps.slice(0,4).map(function(r,j){var b=BADGE[r.categoria]||BADGE["Mantenimiento"];var al=alertLvl(r);return <div key={j} style={{width:7,height:7,borderRadius:"50%",background:al?ALT[al].clr:(isO?"rgba(255,255,255,.6)":b.tx)}}/>;})}</div>}
              {hw&&<div style={{fontSize:9.5,color:isO?"rgba(255,255,255,.55)":C.earth}}>{cell.reps.length} trab.</div>}
            </div>
          );
        })}
      </div>
      {dayP&&(
        <div style={{marginTop:16,background:"#fff",borderRadius:14,border:"1px solid "+C.gray,overflow:"hidden"}}>
          <div style={{padding:"12px 18px",background:C.beige,borderBottom:"1px solid "+C.gray,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:600,color:C.black}}>{fmtDate(dayP.date)} — {dayP.reps.length} trabajo{dayP.reps.length!==1?"s":""}</div>
            <button onClick={function(){setDayP(null);}} style={{background:"none",border:"none",fontSize:18,color:C.earth,cursor:"pointer"}}>×</button>
          </div>
          {dayP.reps.map(function(r,i){return (
            <div key={r.id} className="rh" onClick={function(){onSelect(r);}} style={{padding:"13px 18px",borderBottom:i<dayP.reps.length-1?"1px solid "+C.gray:"none",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13.5,fontWeight:600,color:C.black}}>{r.propiedad}</div>
                <div style={{fontSize:12,color:C.earth,marginTop:3}}>{r.descripcion.slice(0,65)}{r.descripcion.length>65?"…":""}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:14}}>
                <QuickEditTotal rep={r} vendors={vendors} onSave={function(val){onMarkPaid(Object.assign({},r,{total:val}));}} />
                {r.total&&<div style={{fontSize:10,fontWeight:700,color:r.paid?C.green:C.red,marginTop:3}}>{r.paid?"✓ Pagado":"● Pendiente"}</div>}
              </div>
            </div>
          );})}
        </div>
      )}
      {mTot===0&&<div style={{textAlign:"center",padding:"32px 20px",color:C.earth,fontSize:13}}>No hay trabajos en este mes. Usa las flechas para navegar.</div>}
    </div>
  );
}

/* ─── Executive Dashboard */
function ExecDash({reps,vendors}) {
  const [fProp,  setFProp]   = useState("Todas");
  const [fDesde, setFDesde]  = useState("");
  const [fHasta, setFHasta]  = useState("");
  const [exp,    setExp]     = useState(false);
  const [dSt,    setDSt]     = useState(null);

  function applyPreset(val) {
    var r = presetRange(val); setFDesde(r.from); setFHasta(r.to);
  }

  var base = reps.filter(function(r){
    if (fDesde&&r.fecha<fDesde) return false;
    if (fHasta&&r.fecha>fHasta) return false;
    return true;
  });
  var fil  = fProp==="Todas" ? base : base.filter(function(r){return r.propiedad===fProp;});
  var pNames   = ["Todas"].concat(uniq(reps.map(function(r){return r.propiedad;}).filter(Boolean)).sort());
  var byCat    = CATS.map(function(c){return {name:c.slice(0,6),count:fil.filter(function(r){return r.categoria===c;}).length};}).filter(function(d){return d.count>0;});
  var tMap     = {};
  var spanDays = (fDesde&&fHasta) ? Math.round((new Date(fHasta)-new Date(fDesde))/86400000) : 60;
  fil.forEach(function(r){
    var d=new Date(r.fecha+"T12:00:00"); if(isNaN(d)) return;
    var k = spanDays<=21 ? r.fecha.slice(5) : r.fecha.slice(0,7);
    if(!tMap[k]) tMap[k]={label:k,count:0}; tMap[k].count++;
  });
  var tData    = Object.values(tMap).sort(function(a,b){return a.label.localeCompare(b.label);});
  var pRank    = uniq(base.map(function(r){return r.propiedad;}).filter(Boolean)).map(function(p){
    var pr=base.filter(function(r){return r.propiedad===p;});
    return {name:p,count:pr.length,total:pr.reduce(function(s,r){return s+parseFloat(r.total||0);},0),pending:pr.filter(function(r){return r.total&&!r.paid;}).length};
  }).sort(function(a,b){return b.count-a.count;});
  var maxC     = pRank.length>0 ? pRank[0].count : 1;
  var RED_T    = 3;
  var tFact    = fil.reduce(function(s,r){return s+parseFloat(r.total||0);},0);
  var tCobr    = fil.filter(function(r){return r.paid;}).reduce(function(s,r){return s+parseFloat(r.total||0);},0);
  var tPend    = fil.filter(function(r){return r.total&&!r.paid;}).reduce(function(s,r){return s+parseFloat(r.total||0);},0);

  async function exportDrive() {
    setExp(true); setDSt(null);
    try {
      var header = "Propiedad,Fecha,Tecnico,Categoria,Total,Estado";
      var rows   = reps.map(function(r){return '"'+r.propiedad+'","'+r.fecha+'","'+r.reportadoPor+'","'+r.categoria+'","Q'+(r.total||0)+'","'+(r.paid?"Pagado":"Pendiente")+'"';});
      var csv    = [header].concat(rows).join("\n");
      var res    = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:"Sube este CSV a Google Drive como Reporte_SpacioAM_"+todayStr()+".csv:\n\n"+csv}],mcp_servers:[{type:"url",url:"https://drivemcp.googleapis.com/mcp/v1",name:"google-drive"}]})});
      var data   = await res.json();
      var ok     = data.content&&data.content.some(function(x){return x.type==="mcp_tool_result"||x.type==="text";});
      setDSt({ok:ok,msg:ok?"✓ Reporte exportado a Google Drive correctamente.":"No se recibió confirmación. Intenta de nuevo."});
    } catch(e) { setDSt({ok:false,msg:"Error al exportar. Verifica tu conexión."}); }
    setExp(false);
  }

  var IS  = {border:"1.5px solid "+C.gray,borderRadius:9,padding:"7px 10px",fontSize:12.5,fontFamily:"Montserrat,sans-serif",outline:"none",background:"#fff",color:C.black,cursor:"pointer",width:"100%"};
  var ISA = Object.assign({},IS,{border:"1.5px solid "+C.black,fontWeight:600});
  var LBL = {fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".13em",textTransform:"uppercase",display:"block",marginBottom:5};
  var hasDate = !!(fDesde||fHasta);
  var actF = [fProp!=="Todas",hasDate].filter(Boolean).length;

  return (
    <div style={{padding:"20px 22px 80px",maxWidth:900,margin:"0 auto"}}>

      {/* ── Filter panel */}
      <div style={{background:"#fff",borderRadius:14,border:"1px solid "+C.gray,padding:"16px 18px",marginBottom:20}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:14}}>
          <div>
            <span style={LBL}>Propiedad</span>
            <select value={fProp} onChange={function(e){setFProp(e.target.value);}} style={fProp!=="Todas"?ISA:IS}>
              {pNames.map(function(n){return <option key={n}>{n}</option>;})}
            </select>
          </div>
          <div>
            <span style={LBL}>Período rápido</span>
            <select onChange={function(e){applyPreset(e.target.value);e.target.value="";}} style={IS} defaultValue="">
              <option value="" disabled>Seleccionar…</option>
              <option value="hoy">Hoy</option>
              <option value="semana">Semana en curso</option>
              <option value="semana_ant">Semana anterior</option>
              <option value="mes">Este mes</option>
              <option value="3meses">Últimos 3 meses</option>
              <option value="todo">Todo el historial</option>
            </select>
          </div>
          <div>
            <span style={LBL}>Período</span>
            <DateRangePicker from={fDesde} to={fHasta} baseStyle={IS} activeStyle={ISA} onChange={function(a,b){setFDesde(a);setFHasta(b);}}/>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {actF>0&&<button onClick={function(){setFProp("Todas");setFDesde("");setFHasta("");}} style={{padding:"6px 14px",borderRadius:8,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>✕ Limpiar <span style={{background:C.peach,color:"#fff",borderRadius:"50%",width:17,height:17,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{actF}</span></button>}
            {fDesde&&fHasta&&<span style={{fontSize:12,color:C.earth,fontWeight:500}}>{fDesde} → {fHasta} ({fil.length} registros)</span>}
          </div>
          <button onClick={exportDrive} disabled={exp} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:9,border:"1.5px solid "+C.gray,background:"#fff",color:C.black,fontSize:12,fontWeight:600,cursor:exp?"not-allowed":"pointer"}}>📁 {exp?"Exportando…":"Exportar a Drive"}</button>
        </div>
      </div>
      {dSt&&<div style={{marginBottom:16,padding:"10px 14px",borderRadius:9,fontSize:13,fontWeight:600,background:dSt.ok?"#EDF5EF":"#F5EDEC",color:dSt.ok?C.green:C.red}}>{dSt.msg}</div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {[{l:"Trabajos",v:fil.length},{l:"Facturado",v:"Q"+tFact.toLocaleString(),a:true},{l:"Cobrado",v:"Q"+tCobr.toLocaleString(),g:true},{l:"Pendiente",v:"Q"+tPend.toLocaleString(),w:tPend>0}].map(function(s,i){
          return <div key={i} style={{background:"#fff",borderRadius:14,padding:"16px",border:"1px solid "+C.line}}><div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>{s.l}</div><div style={{fontSize:22,fontWeight:600,color:s.g?C.green:s.w?C.red:s.a?C.peach:C.black}}>{s.v}</div></div>;
        })}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
        <div style={{background:"#fff",borderRadius:14,padding:"18px",border:"1px solid "+C.line}}>
          <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:14}}>Trabajos por tipo</div>
          {byCat.length>0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byCat} margin={{top:0,right:0,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.gray}/>
                <XAxis dataKey="name" tick={{fontSize:11,fill:C.earth}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:C.earth}} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                <Bar dataKey="count" fill={C.sand} radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart/>}
        </div>
        <div style={{background:"#fff",borderRadius:14,padding:"18px",border:"1px solid "+C.line}}>
          <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:14}}>Trabajos en el tiempo</div>
          {tData.length>1 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={tData} margin={{top:0,right:10,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.gray}/>
                <XAxis dataKey="label" tick={{fontSize:10,fill:C.earth}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:C.earth}} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                <Line type="monotone" dataKey="count" stroke={C.peach} strokeWidth={2.5} dot={{r:4,fill:C.peach}} name="Trabajos"/>
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart/>}
        </div>
      </div>

      <div style={{background:"#fff",borderRadius:14,padding:"18px",border:"1px solid "+C.line}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase"}}>Actividad por propiedad</div>
          {pRank.filter(function(p){return p.count>=RED_T;}).length>0&&<span style={{fontSize:11,fontWeight:700,color:C.red,background:"#F5EDEC",padding:"3px 10px",borderRadius:100}}>🔴 {pRank.filter(function(p){return p.count>=RED_T;}).length} con alta actividad</span>}
        </div>
        {pRank.length===0&&<EmptyChart label="Sin datos en este período"/>}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {pRank.map(function(p,i){
            var pct=(p.count/maxC)*100; var isR=p.count>=RED_T;
            return (
              <div key={i}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {isR&&<span style={{fontSize:14}}>🔴</span>}
                    <span style={{fontSize:13,fontWeight:isR?700:500,color:isR?C.red:C.black}}>{p.name}</span>
                  </div>
                  <div style={{display:"flex",gap:14,alignItems:"center",flexShrink:0,marginLeft:12}}>
                    <span style={{fontSize:12,color:C.earth}}>{p.count} trabajo{p.count!==1?"s":""}</span>
                    {p.total>0&&<span style={{fontSize:12,fontWeight:600,color:C.black}}>{"Q"+p.total.toLocaleString()}</span>}
                    {p.pending>0&&<span style={{fontSize:11,fontWeight:700,color:C.red,background:"#F5EDEC",padding:"2px 7px",borderRadius:100}}>{p.pending} pend.</span>}
                  </div>
                </div>
                <div style={{background:C.beige,borderRadius:100,height:6}}><div style={{width:pct+"%",height:"100%",borderRadius:100,background:isR?C.red:C.taupe,transition:"width .4s"}}/></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Pagos semanales de limpieza */}
      <PagosLimpieza reps={reps} vendors={vendors}/>

    </div>
  );
}
function EmptyChart({label}) { return <div style={{height:160,display:"flex",alignItems:"center",justifyContent:"center",color:C.earth,fontSize:13}}>{label||"Sin datos"}</div>; }

/* ─── Pagos semanales de limpieza */
function PagosLimpieza({reps,vendors}) {
  const [semana,setSemana] = useState(0); /* 0=esta semana, 1=semana pasada, etc */
  var CATS_LIMPIEZA = ["Limpieza tradicional","Limpieza profunda"];

  /* Build week window */
  var now   = Date.now();
  var wStart = new Date(now - semana*7*86400000);
  wStart.setHours(0,0,0,0);
  wStart.setDate(wStart.getDate() - ((wStart.getDay()+6)%7)); /* Monday */
  var wEnd  = new Date(wStart.getTime() + 7*86400000);

  var inWindow = reps.filter(function(r){
    if (!CATS_LIMPIEZA.includes(r.categoria)) return false;
    var d = new Date(r.fecha+"T12:00:00");
    return d>=wStart && d<wEnd;
  });

  /* Group by cleaner */
  var byVend = {};
  inWindow.forEach(function(r){
    var key = r.reportadoPor;
    if (!byVend[key]) byVend[key]={email:key,count:0,totalQ:0,paid:0,pendiente:0};
    var t = parseFloat(r.total||0);
    byVend[key].count++;
    byVend[key].totalQ += t;
    if (r.paid) byVend[key].paid += t; else byVend[key].pendiente += t;
  });

  var rows = Object.values(byVend).sort(function(a,b){return b.totalQ-a.totalQ;});

  /* Format week label */
  var opts = {day:"2-digit",month:"short"};
  var wLabel = wStart.toLocaleDateString("es-GT",opts)+" – "+new Date(wEnd.getTime()-86400000).toLocaleDateString("es-GT",opts);

  /* Total pendiente this week */
  var totalPend = rows.reduce(function(s,r){return s+r.pendiente;},0);

  return (
    <div style={{background:"#fff",borderRadius:14,padding:"18px",border:"1px solid "+C.gray,marginTop:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:4}}>Pagos de limpieza por semana</div>
          <div style={{fontSize:12,color:C.earth}}>{wLabel}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={function(){setSemana(function(s){return s+1;});}} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,cursor:"pointer"}}>‹ Anterior</button>
          {semana>0&&<button onClick={function(){setSemana(0);}} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid "+C.gray,background:C.black,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Esta semana</button>}
          {semana>0&&<button onClick={function(){setSemana(function(s){return s-1;});}} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,cursor:"pointer"}}>Siguiente ›</button>}
        </div>
      </div>

      {totalPend>0&&<div style={{background:"#F2F0EC",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,fontWeight:600,color:C.orange}}>💰 Pendiente de pago esta semana: Q{totalPend.toLocaleString()}</div>}

      {rows.length===0&&<div style={{textAlign:"center",padding:"24px",color:C.earth,fontSize:13}}>No hay limpiezas registradas esta semana.</div>}

      {rows.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 56px 80px 80px 80px 96px",padding:"9px 14px",background:C.surface,borderRadius:6,marginBottom:6,border:"1px solid "+C.line}}>
            {["Cleaner","Limpiezas","Tarifa","Total","Cobrado","Pendiente"].map(function(h,i){return <div key={i} style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".12em",textTransform:"uppercase",textAlign:i>0?"center":"left"}}>{h}</div>;})}
          </div>
          {rows.map(function(row,i){
            var vend = vendors&&vendors.find(function(v){return v.email===row.email;});
            var name = vend?vend.name:row.email;
            var tarifa = vend&&vend.tarifaLimpieza?"Q"+vend.tarifaLimpieza:"—";
            return (
              <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 56px 80px 80px 80px 96px",padding:"12px 12px",borderBottom:i<rows.length-1?"1px solid "+C.gray:"none",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:C.black}}>{name}</div>
                  <div style={{fontSize:11,color:C.earth}}>{row.email}</div>
                </div>
                <div style={{textAlign:"center",fontSize:14,fontWeight:700,color:C.black}}>{row.count}</div>
                <div style={{textAlign:"center",fontSize:12,color:C.earth,fontWeight:600}}>{tarifa}</div>
                <div style={{textAlign:"center",fontSize:13,fontWeight:700,color:C.black}}>{"Q"+row.totalQ.toLocaleString()}</div>
                <div style={{textAlign:"center",fontSize:12,fontWeight:700,color:C.green}}>{row.paid>0?"Q"+row.paid.toLocaleString():"—"}</div>
                <div style={{textAlign:"center"}}>
                  {row.pendiente>0
                    ?<span style={{fontSize:12,fontWeight:700,color:C.red,background:"#F5EDEC",padding:"3px 8px",borderRadius:100}}>Q{row.pendiente.toLocaleString()}</span>
                    :<span style={{fontSize:12,fontWeight:700,color:C.green}}>✓ Al día</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary footer */}
      {rows.length>0&&(
        <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid "+C.gray,display:"flex",gap:20,flexWrap:"wrap"}}>
          <Stat label="Limpiezas" value={rows.reduce(function(s,r){return s+r.count;},0)}/>
          <Sep/>
          <Stat label="Total semana" value={"Q"+rows.reduce(function(s,r){return s+r.totalQ;},0).toLocaleString()}/>
          <Sep/>
          <Stat label="Por pagar" value={"Q"+totalPend.toLocaleString()} warn={totalPend>0}/>
        </div>
      )}
    </div>
  );
}



/* ─── Report Form — dispatcher (all hooks before any return) */
function RepForm({vendors,props,company,onSubmit,defaultVendor,onSaveFeedback}) {
  /* Determine allowed cats by vendor type */
  var vend = vendors&&vendors.find(function(v){return v.email===defaultVendor;});
  var isEPILimpieza = vend&&vend.tipo==="interno"&&vend.categoria==="EPI Limpieza";
  var isEPIMant = vend&&vend.tipo==="interno"&&vend.categoria==="EPI Mantenimiento";
  var allowedCats = isEPILimpieza
    ? ["Limpieza tradicional","Limpieza profunda","Ajuste","Reporte de Daños"]
    : isEPIMant
    ? ["Mantenimiento","Nuevo Producto","Ajuste","Reporte de Daños"]
    : CATS; /* Admin + Administrativo + External: all categories */
  /* Start with null (selector screen) so user always picks category first */
  const [cat,setCat] = useState(null);
  function goBack(){setCat(null);}
  var shared = {vendors:vendors,props:props,company:company,onSubmit:onSubmit,defaultVendor:defaultVendor,onBack:goBack,onSaveFeedback:onSaveFeedback};
  if (cat==="Limpieza tradicional") return <LimpiezaTradForm {...shared}/>;
  if (cat==="Limpieza profunda")    return <LimpiezaProfForm  {...shared}/>;
  if (cat==="Ajuste")               return <AjusteForm           {...shared}/>;
  if (cat==="Reporte de Daños")     return <DanosFormSolo         {...shared}/>;
  if (cat==="Nuevo Producto")       return <NuevoProductoForm      {...shared}/>;
  return <StandardRepForm cat={cat} setCat={setCat} allowedCats={allowedCats} {...shared}/>;
}

/* ─── Standard Rep Form (Mantenimiento / Producto) */
function StandardRepForm({cat,setCat,vendors,props,company,onSubmit,defaultVendor,allowedCats}) {
  allowedCats = allowedCats||CATS;
  var initAT = autoTarifa(defaultVendor||"", vendors);
  var blank={propiedad:"",fecha:todayStr(),categoria:cat,reportadoPor:defaultVendor||"",descripcion:"",comentarios:"",total:initAT.tarifa,paid:false,pagadoPor:"",fotoAntes:[],fotoDespues:[],factura:null};
  const [form,setForm] = useState(blank);
  const [busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);

  async function addPics(files,field,max){var c=await Promise.all(Array.from(files).map(function(f){return compress(f);}));setForm(function(p){var merged=p[field].concat(c).slice(0,max);var u=Object.assign({},p);u[field]=merged;return u;});}
  function rmPic(field,idx){setForm(function(p){var u=Object.assign({},p);u[field]=p[field].filter(function(_,j){return j!==idx;});return u;});}
  function setF(key,val){setForm(function(p){var u=Object.assign({},p);u[key]=val;return u;});}

  async function sub(){
    if(!form.propiedad||!form.reportadoPor||!form.descripcion)return;
    setBusy(true);
    try {
      await onSubmit(Object.assign({},form,{id:Date.now(),createdAt:Date.now(),categoria:cat}));
      setDone(true);
      setTimeout(function(){setDone(false);setForm(Object.assign({},blank,{reportadoPor:defaultVendor||""}));},2600);
    } catch(e) {
      console.error("Error al enviar");
    } finally { setBusy(false); }
  }

  if(done) return <SuccessScreen msg="¡Reporte enviado!" sub="El trabajo quedó registrado correctamente."/>;

  var coName=company&&company.name?company.name:"Spacio AM S.A.";
  var coNit =company&&company.nit?company.nit:"118287796";

  return (
    <div style={{width:"100%",maxWidth:560,margin:"0 auto",padding:"24px 16px 90px",fontFamily:"Montserrat,sans-serif"}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9.5,fontWeight:600,color:C.earth,letterSpacing:".28em",textTransform:"uppercase",marginBottom:8}}>Nuevo reporte</div>
        <div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:28,fontWeight:400,color:C.black,letterSpacing:".04em"}}>¿Qué trabajo se realizó?</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Card title="Tipo de trabajo">
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {allowedCats.map(function(c){var b=BADGE[c]||BADGE["Mantenimiento"];var s=cat===c;return <button key={c} onClick={function(){setCat(c);}} style={{padding:"7px 14px",borderRadius:100,cursor:"pointer",border:"1.5px solid "+(s?b.tx:C.gray),background:s?b.bg:"#fff",color:s?b.tx:C.earth,fontSize:12.5,fontWeight:600,transition:"all .18s"}}>{c}</button>;})}
          </div>
        </Card>
        <Card title="Responsable">
          {defaultVendor
            ?<div style={{fontSize:14,fontWeight:600,color:C.black,background:C.surfaceWarm,padding:"11px 14px",borderRadius:10}}>{vendors.find(function(v){return v.email===defaultVendor;})?vendorDisplay(vendors.find(function(v){return v.email===defaultVendor;})):defaultVendor}</div>
            :<F label="Técnico / Proveedor"><select value={form.reportadoPor} onChange={function(e){
                    var email = e.target.value;
                    setF("reportadoPor",email);
                    var at = autoTarifa(email, vendors);
                    if(at.tarifa) setF("total",at.tarifa);
                  }}><option value="">Seleccionar…</option>{vendors.filter(function(v){return v.active;}).map(function(v){return <option key={v.id} value={v.email}>{v.name}</option>;})}</select></F>
          }
        </Card>
        <Card title="Propiedad">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <F label="Propiedad"><select value={form.propiedad} onChange={function(e){setF("propiedad",e.target.value);}}><option value="">Seleccionar…</option>{props.map(function(p){return <option key={p.id}>{p.name}</option>;})}</select></F>
            <F label="Fecha"><input type="date" value={form.fecha} onChange={function(e){setF("fecha",e.target.value);}}/></F>
          </div>
        </Card>
        <Card title="Descripción"><F label="¿Qué se hizo?"><textarea rows={4} placeholder="Describe brevemente el trabajo realizado…" value={form.descripcion} onChange={function(e){setF("descripcion",e.target.value);}}/></F></Card>
        <Card title="Evidencia fotográfica">
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <PicUp label="ANTES"   max={2} photos={form.fotoAntes}   accent={C.earth} onAdd={function(f){addPics(f,"fotoAntes",2);}}   onDel={function(i){rmPic("fotoAntes",i);}}/>
            <div style={{height:1,background:C.gray}}/>
            <PicUp label="DESPUÉS" max={3} photos={form.fotoDespues} accent={C.peach} onAdd={function(f){addPics(f,"fotoDespues",3);}} onDel={function(i){rmPic("fotoDespues",i);}}/>
          </div>
        </Card>
        <Card title="Factura">
          <div style={{marginBottom:12,padding:"12px 14px",borderRadius:10,background:C.surfaceWarm,border:"1px solid "+C.line,fontSize:12.5,color:C.black,lineHeight:1.65}}>
            📋 Favor emitir su factura a nombre de <strong>{coName}</strong><br/>
            <span style={{color:C.earth}}>NIT: <strong style={{color:C.black}}>{coNit}</strong></span>
          </div>
          <InvoiceUp factura={form.factura} onAdd={function(file){var r=new FileReader();r.onload=function(ev){setF("factura",{name:file.name,type:file.type,data:ev.target.result});};r.readAsDataURL(file);}} onDel={function(){setF("factura",null);}}/>
        </Card>
        <Card title="Detalles finales">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <F label="Comentarios"><textarea rows={3} placeholder="Observaciones, materiales, pendientes…" value={form.comentarios} onChange={function(e){setF("comentarios",e.target.value);}}/></F>
            <F label="Total cobrado (Q)"><input type="number" placeholder="Ej. 850" value={form.total} onChange={function(e){setF("total",e.target.value);}}/></F>
          </div>
        </Card>
        <BigBtn onClick={sub} dis={busy||!form.propiedad||!form.reportadoPor||!form.descripcion}>{busy?"Enviando…":"Enviar reporte →"}</BigBtn>
      </div>
    </div>
  );
}


/* ─── Nuevo Producto Form */
function NuevoProductoForm({vendors,props,onSubmit,defaultVendor,onBack}) {
  const [nombre,  setNombre]  = useState("");
  const [desc,    setDesc]    = useState("");
  const [precio,  setPrecio]  = useState("");
  const [prop,    setProp]    = useState("");
  const [fecha,   setFecha]   = useState(todayStr());
  const [establec,setEstablec]= useState("");
  const [fotos,   setFotos]   = useState([]);
  const [factura, setFactura] = useState(null);
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState(false);
  const facRef = useRef(null);

  async function addFotos(files) {
    var c = await Promise.all(Array.from(files).slice(0,4-fotos.length).map(function(f){return compress(f);}));
    setFotos(function(p){return p.concat(c).slice(0,4);});
  }

  async function sub() {
    if(!nombre||!precio) return;
    setBusy(true);
    try {
      await onSubmit({
        id:Date.now(), createdAt:Date.now(),
        categoria:"Nuevo Producto",
        propiedad:prop||"General",
        fecha:fecha,
        reportadoPor:defaultVendor||"admin",
        descripcion:desc?nombre+" — "+desc:nombre,
        establecimiento:establec,
        comentarios:desc,
        total:precio,
        paid:false, pagadoPor:"",
        fotoAntes:[], fotoDespues:fotos, factura:factura,
        nombreProducto:nombre,
      });
      setDone(true);
    } catch(e) { console.error("Error al guardar"); }
    finally { setBusy(false); }
  }

  if(done) return <SuccessScreen msg="¡Producto registrado!" sub="El nuevo mobiliario quedó guardado en el inventario."/>;

  return (
    <div style={{maxWidth:520,margin:"0 auto",padding:"24px 16px 90px",fontFamily:"Montserrat,sans-serif"}}>
      <div style={{marginBottom:10}}><button onClick={onBack} style={{background:"none",border:"none",color:C.earth,fontSize:12.5,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>← Cambiar tipo</button></div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,color:C.peach,fontWeight:700,letterSpacing:".18em",textTransform:"uppercase",marginBottom:6}}>Nuevo Producto</div>
        <div style={{fontSize:22,fontWeight:400,color:C.black}}>Registrar nuevo mobiliario</div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Card title="Información del producto">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <F label="Nombre del producto o mobiliario">
              <input placeholder="Ej. Sillón de lectura, Mesa de centro…" value={nombre} onChange={function(e){setNombre(e.target.value);}}/>
            </F>
            <F label="Descripción">
              <textarea rows={3} placeholder="Material, color, dimensiones, uso previsto…" value={desc} onChange={function(e){setDesc(e.target.value);}}/>
            </F>
          </div>
        </Card>

        <Card title="Ubicación y fecha">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <F label="Propiedad / Apartamento donde va">
              <select value={prop} onChange={function(e){setProp(e.target.value);}}>
                <option value="">Sin asignar (general)</option>
                {props.map(function(p){return <option key={p.id}>{p.name}</option>;})}
              </select>
            </F>
            <F label="Fecha de compra">
              <input type="date" value={fecha} onChange={function(e){setFecha(e.target.value);}}/>
            </F>
          </div>
        </Card>

        <Card title="Fotos del producto">
          <div style={{fontSize:12,color:C.earth,marginBottom:12}}>Sube entre 3 y 4 fotos del producto — frente, detalle, empaque y ubicación final si ya está instalado.</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {fotos.map(function(src,i){return (
              <div key={i} style={{position:"relative",width:96,height:96,borderRadius:11,overflow:"hidden",border:"2px solid "+C.gray}}>
                <img src={src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <button onClick={function(){setFotos(function(p){return p.filter(function(_,j){return j!==i;});});}} style={{position:"absolute",top:4,right:4,width:22,height:22,borderRadius:"50%",border:"none",background:"rgba(0,0,0,.6)",color:"#fff",fontSize:15,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
            );})}
            {fotos.length<4&&(
              <label style={{width:96,height:96,borderRadius:10,border:"1.5px dashed "+C.line,background:C.surface,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",transition:"background .2s"}}>
                <span style={{fontSize:28,color:C.peach}}>+</span>
                <span style={{fontSize:10,color:C.earth,fontWeight:600}}>Foto</span>
                <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={function(e){if(e.target.files)addFotos(e.target.files);e.target.value="";}}/>
              </label>
            )}
          </div>
          <div style={{marginTop:10,fontSize:11,color:C.earth}}>{fotos.length}/4 fotos — {fotos.length<3?"Se recomiendan mínimo 3":"✓ Suficientes fotos"}</div>
        </Card>

        <Card title="Precio y factura">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <F label="Precio de compra (Q)">
              <input type="number" placeholder="Ej. 1500" value={precio} onChange={function(e){setPrecio(e.target.value);}}/>
            </F>
            <F label="Establecimiento / Tienda">
              <input placeholder="Ej. IKEA, Mercado La Terminal, Amazon…" value={establec} onChange={function(e){setEstablec(e.target.value);}}/>
            </F>
            <div>
              <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>Factura de compra</div>
              {factura ? (
                <div style={{display:"flex",alignItems:"center",gap:12,background:C.surface,borderRadius:8,padding:"12px 14px",border:"1px solid "+C.line}}>
                  <span style={{fontSize:20}}>{factura.type&&factura.type.startsWith("image/")?"🖼️":"📄"}</span>
                  <span style={{fontSize:13,fontWeight:600,color:C.black,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{factura.name}</span>
                  <button onClick={function(){setFactura(null);}} style={{background:"none",border:"none",color:C.red,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
                </div>
              ) : (
                <button onClick={function(){if(facRef.current)facRef.current.click();}} style={{width:"100%",padding:"14px",borderRadius:8,border:"1.5px dashed "+C.line,background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",gap:10,cursor:"pointer",fontSize:12.5,color:C.earth,fontWeight:600,fontFamily:"Montserrat,sans-serif",letterSpacing:".04em",transition:"background .2s"}}>
                  <span style={{fontSize:20}}>📎</span>Adjuntar factura (PDF o imagen)
                </button>
              )}
              <input ref={facRef} type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={function(e){if(e.target.files&&e.target.files[0]){var f=e.target.files[0];var r=new FileReader();r.onload=function(ev){setFactura({name:f.name,type:f.type,data:ev.target.result});};r.readAsDataURL(f);}e.target.value="";}}/>
            </div>
          </div>
        </Card>

        <BigBtn onClick={sub} dis={busy||!nombre||!precio}>{busy?"Guardando…":"Registrar producto →"}</BigBtn>
      </div>
    </div>
  );
}

/* ─── Ajuste Form (simplified, no photos) */
function AjusteForm({vendors,props,onSubmit,defaultVendor,onBack}) {
  const [motivo,  setMotivo]  = useState("");
  const [prop,    setProp]    = useState("");
  const [fecha,   setFecha]   = useState(todayStr());
  const [monto,   setMonto]   = useState("");
  const [coment,  setComent]  = useState("");
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState(false);

  async function sub() {
    if(!motivo||!prop)return;
    setBusy(true);
    await onSubmit({id:Date.now(),createdAt:Date.now(),categoria:"Ajuste",propiedad:prop,fecha:fecha,reportadoPor:defaultVendor||"",descripcion:coment?motivo+" — "+coment:motivo,comentarios:coment,total:monto,paid:false,pagadoPor:"",fotoAntes:[],fotoDespues:[],factura:null});
    setBusy(false);setDone(true);
  }

  if(done) return <SuccessScreen msg="¡Ajuste registrado!" sub="El ajuste quedó registrado correctamente."/>;

  return (
    <div style={{maxWidth:480,margin:"0 auto",padding:"24px 16px 90px",fontFamily:"Montserrat,sans-serif"}}>
      <div style={{marginBottom:10}}><button onClick={onBack} style={{background:"none",border:"none",color:C.earth,fontSize:12.5,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>← Cambiar tipo</button></div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9.5,fontWeight:600,color:C.earth,letterSpacing:".28em",textTransform:"uppercase",marginBottom:8}}>Ajuste</div>
        <div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:28,fontWeight:400,color:C.black}}>Nuevo registro de ajuste</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Card title="Motivo del ajuste">
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {MOTIVOS_AJUSTE.map(function(m){var s=motivo===m;return <button key={m} onClick={function(){setMotivo(s?"":m);}} style={{padding:"8px 14px",borderRadius:100,cursor:"pointer",border:"1.5px solid "+(s?C.black:C.gray),background:s?C.black:"#fff",color:s?"#fff":C.earth,fontSize:12.5,fontWeight:600,transition:"all .18s"}}>{s?"✓ ":""}{m}</button>;})}
          </div>
        </Card>
        <Card title="Detalles">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <F label="Apartamento"><select value={prop} onChange={function(e){setProp(e.target.value);}}><option value="">Seleccionar…</option>{props.map(function(p){return <option key={p.id}>{p.name}</option>;})}</select></F>
            <F label="Fecha"><input type="date" value={fecha} onChange={function(e){setFecha(e.target.value);}}/></F>
            <F label="Monto (Q)"><input type="number" placeholder="Ej. 120" value={monto} onChange={function(e){setMonto(e.target.value);}}/></F>
          </div>
        </Card>
        <Card title="Comentarios">
          <F label="Notas adicionales"><textarea rows={3} placeholder="Detalles del ajuste, razón, observaciones…" value={coment} onChange={function(e){setComent(e.target.value);}}/></F>
        </Card>
        <BigBtn onClick={sub} dis={busy||!motivo||!prop}>{busy?"Guardando…":"Registrar ajuste →"}</BigBtn>
      </div>
    </div>
  );
}

/* ─── Reporte de Daños — standalone form */
function DanosFormSolo({vendors,props,onSubmit,defaultVendor,onBack}) {
  const [prop,    setProp]    = useState("");
  const [fecha,   setFecha]   = useState(todayStr());
  const [resp,    setResp]    = useState(defaultVendor||"");
  const [danios,  setDanios]  = useState([{desc:"",fotos:[],origen:"",reparacion:"",comentarios:"",fotos2:[],cobrado:false,quienPaga:""}]);
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState(false);

  function addDanio(){setDanios(function(p){return p.concat([{desc:"",fotos:[],origen:"",reparacion:"",comentarios:"",fotos2:[],cobrado:false,quienPaga:""}]);});}
  function rmDanio(idx){setDanios(function(p){return p.filter(function(_,j){return j!==idx;});});}
  function setD(idx,k,v){setDanios(function(p){return p.map(function(d,j){if(j!==idx)return d;var u=Object.assign({},d);u[k]=v;return u;});});}

  async function sub(){
    if(!prop||!resp)return;
    setBusy(true);
    var desc = danios.map(function(d,i){return "Daño "+(i+1)+": "+d.desc;}).join(" | ");
    try {
      await onSubmit({id:Date.now(),createdAt:Date.now(),categoria:"Reporte de Daños",propiedad:prop,fecha:fecha,reportadoPor:resp,descripcion:desc||"Reporte de daños",comentarios:"",total:"",paid:false,pagadoPor:"",fotoAntes:[],fotoDespues:[],factura:null,danios:danios,hayDanios:true});
      setDone(true);
    } catch(e) { console.error("Error al enviar reporte de daños"); }
    finally { setBusy(false); }
  }

  if(done) return <SuccessScreen msg="¡Reporte de daños enviado!" sub="El equipo de Spacio AM ha sido notificado."/>;

  return (
    <div style={{maxWidth:580,margin:"0 auto",padding:"24px 16px 90px",fontFamily:"Montserrat,sans-serif"}}>
      <div style={{marginBottom:10}}><button onClick={onBack} style={{background:"none",border:"none",color:C.earth,fontSize:12.5,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>← Cambiar tipo</button></div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,color:C.red,fontWeight:700,letterSpacing:".18em",textTransform:"uppercase",marginBottom:6}}>Reporte de Daños</div>
        <div style={{fontSize:22,fontWeight:400,color:C.black}}>Documentar daño encontrado</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Card title="Información básica">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {defaultVendor
              ?<div style={{fontSize:14,fontWeight:600,color:C.black,background:C.surfaceWarm,padding:"11px 14px",borderRadius:10}}>{vendors.find(function(v){return v.email===defaultVendor;})?vendorDisplay(vendors.find(function(v){return v.email===defaultVendor;})):defaultVendor}</div>
              :<F label="Quien reporta"><select value={resp} onChange={function(e){setResp(e.target.value);}}><option value="">Seleccionar…</option>{vendors.filter(function(v){return v.active;}).map(function(v){return <option key={v.id} value={v.email}>{v.name}</option>;})}</select></F>
            }
            <F label="Propiedad"><select value={prop} onChange={function(e){setProp(e.target.value);}}><option value="">Seleccionar…</option>{props.map(function(p){return <option key={p.id}>{p.name}</option>;})}</select></F>
            <F label="Fecha"><input type="date" value={fecha} onChange={function(e){setFecha(e.target.value);}}/></F>
          </div>
        </Card>

        {danios.map(function(d,idx){return (
          <div key={idx} style={{background:"#fff",borderRadius:14,padding:"18px",border:"2px solid #f5c6a0"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.red,letterSpacing:".12em",textTransform:"uppercase"}}>Daño {idx+1}</div>
              {danios.length>1&&<button onClick={function(){rmDanio(idx);}} style={{background:"none",border:"none",color:C.gray,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <F label="Describe el daño"><textarea rows={3} placeholder="¿Qué fue dañado y cómo?" value={d.desc} onChange={function(e){setD(idx,"desc",e.target.value);}}/></F>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>Fotos del daño</div>
                <MultiPhotoUp label="Fotos" photos={d.fotos} max={5} accent={C.peach} onAdd={function(files){var c=[...d.fotos];Promise.all(Array.from(files).slice(0,5-c.length).map(compress)).then(function(ds){setD(idx,"fotos",c.concat(ds).slice(0,5));});}} onDel={function(i){setD(idx,"fotos",d.fotos.filter(function(_,j){return j!==i;}));}}/>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>Origen del daño</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["Estaba antes","Lo dejó el huésped","No estoy seguro"].map(function(op){return <ChipBtn key={op} active={d.origen===op} onClick={function(){setD(idx,"origen",op);}} color={C.earth}>{op}</ChipBtn>;})}</div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>¿Se puede reparar?</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["Se puede reparar","Hay que reemplazar","No estoy seguro"].map(function(op){return <ChipBtn key={op} active={d.reparacion===op} onClick={function(){setD(idx,"reparacion",op);}} color={C.earth}>{op}</ChipBtn>;})}</div>
              </div>
              <div style={{borderTop:"1px solid "+C.gray,paddingTop:12}}>
                <F label="Notas internas / Acciones tomadas"><textarea rows={2} placeholder="Comentarios para el equipo…" value={d.comentarios} onChange={function(e){setD(idx,"comentarios",e.target.value);}}/></F>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>Evidencia adicional</div>
                <MultiPhotoUp label="Fotos adicionales" photos={d.fotos2} max={3} accent={C.earth} onAdd={function(files){var c=[...d.fotos2];Promise.all(Array.from(files).slice(0,3-c.length).map(compress)).then(function(ds){setD(idx,"fotos2",c.concat(ds).slice(0,3));});}} onDel={function(i){setD(idx,"fotos2",d.fotos2.filter(function(_,j){return j!==i;}));}}/>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>¿Ya se cobró?</div>
                  <div style={{display:"flex",gap:6}}>
                    <ChipBtn active={d.cobrado}  onClick={function(){setD(idx,"cobrado",true);}}  color={C.green}>✓ Cobrado</ChipBtn>
                    <ChipBtn active={!d.cobrado} onClick={function(){setD(idx,"cobrado",false);}} color={C.red}>Pendiente</ChipBtn>
                  </div>
                </div>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>¿Quién paga?</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{["Airbnb","Seguro","Dueño","Spacio AM"].map(function(op){return <ChipBtn key={op} active={d.quienPaga===op} onClick={function(){setD(idx,"quienPaga",op);}} color={C.earth}>{op}</ChipBtn>;})}</div>
                </div>
              </div>
            </div>
          </div>
        );})}

        <button onClick={addDanio} style={{padding:"12px",borderRadius:12,border:"2px dashed "+C.gray,background:"#fff",color:C.earth,fontSize:13,fontWeight:600,cursor:"pointer"}}>+ Agregar otro daño</button>
        <BigBtn onClick={sub} dis={busy||!prop||!resp||!danios[0].desc}>{busy?"Enviando…":"Enviar reporte de daños →"}</BigBtn>
      </div>
    </div>
  );
}

/* ═══════════════ LIMPIEZA TRADICIONAL WIZARD ══════════════════════════ */
function LimpiezaTradForm({vendors,props,onSubmit,defaultVendor,onBack,onSaveFeedback}) {
  const STEPS = ["Bienvenida","País","Ciudad","Responsable","Propiedad","Habitaciones","Baños","Cocina","Sala e Insumos","Limpieza Detallada","Inventario","Daños","Foto uniforme","Confirmación"];
  var TOTAL_STEPS_F = STEPS.length - 1;
  const [step,setStep]   = useState(0);
  const [errMsg,setErrMsg] = useState("");
  const [form,setForm] = useState({
    pais:"Guatemala", ciudad:"Ciudad de Guatemala",
    reportadoPor:defaultVendor||"", propiedad:"",
    fecha:todayStr(),
    fotosHabitaciones:[], fotoPisoGeneral:null,
    fotosBanos:[],
    fotosMicroondas:null, fotosCafetera:null, fotosEcofiltro:null, fotosLavatrastos:null, fotosRefrigerador:null,
    fotosTv:null, fotosSillon:null, fotosInsumos:null,
    fotosDebajoCama:null, fotosCloset:null,
    inventario:INV_DEFAULT.map(function(i){return Object.assign({},i,{cantidad:i.cantidad,estado:"ok",foto:null});}),
    hayDanios:false, danios:[], fotoUniforme:null,
    comentarios:"",
  });
  const [done,setDone]=useState(false);
  const [busy,setBusy]=useState(false);

  function sf(k,v){setForm(function(p){var u=Object.assign({},p);u[k]=v;return u;});}

  var propObj = props.find(function(p){return p.name===form.propiedad;})||{};
  var cuartos  = propObj.cuartos||1;
  var banos    = propObj.banos||1;

  function next(){if(step<STEPS.length-1)setStep(function(s){return s+1;});}
  function prev(){if(step>0)setStep(function(s){return s-1;});}

  async function submitTrad() {
    setBusy(true);
    var vend = vendors.find(function(v){return v.email===form.reportadoPor;});
    var tarifa = vend&&vend.tarifaLimpieza ? String(vend.tarifaLimpieza) : "";
    var rep = Object.assign({},form,{
      id:Date.now(), createdAt:Date.now(),
      categoria:"Limpieza tradicional",
      descripcion:"Limpieza tradicional — "+form.propiedad,
      total:tarifa, paid:false, pagadoPor:"",
      fotoAntes:[], fotoDespues:[], factura:null,
      qaStatus:"pendiente", qaComentario:"", qaFecha:"", qaRespuesta:null, qaRespuestaFecha:"",
    });
    try {
      await onSubmit(rep);
      /* Auto-create damage report if damages were reported */
      if (form.hayDanios && form.danios && form.danios.length>0) {
        var dmgDesc = form.danios.map(function(d,i){return "Daño "+(i+1)+": "+d.desc;}).join(" | ");
        /* Build damage report — strip base64 from fotos (photos already in cleaning report) */
        var dmgDanios = (form.danios||[]).map(function(d){
          return Object.assign({},d,{fotos:(d.fotos||[]).filter(function(f){return f&&f.startsWith("http");})});
        });
        var dmgRep = {
          id: now+1, createdAt: now+1,
          categoria:"Reporte de Daños",
          propiedad: form.propiedad,
          fecha: form.fecha,
          reportadoPor: form.reportadoPor,
          descripcion: dmgDesc||"Daños encontrados durante limpieza",
          comentarios: "Generado automáticamente desde reporte de limpieza #"+now,
          total:"", paid:false, pagadoPor:"",
          fotoAntes:[], fotoDespues:[], factura:null,
          danios: dmgDanios, hayDanios:true,
          _linkedToReport: String(now),
        };
        try { await onSubmit(dmgRep); } catch(dmgErr) { console.error("Damage report failed:",dmgErr); }
      }
      setDone(true);
    } catch(e) {
      setErrMsg("Error al enviar: "+(e&&e.message?e.message:"verifica tu conexión e intenta de nuevo."));
    } finally { setBusy(false); }
  }

  if (done) return <SuccessScreen msg="¡Reporte de limpieza enviado!" sub="Gracias por tu compromiso. Este reporte nos ayuda a mantener el estándar de excelencia de Spacio AM."/>;

  var pct = Math.round((step/(STEPS.length-1))*100);

  return (
    <div style={{maxWidth:560,margin:"0 auto",padding:"0 0 80px",fontFamily:"Montserrat,sans-serif"}}>
      <FeedbackBubble vendor={vendors&&vendors.find(function(v){return v.email===form.reportadoPor;})} onSaveFeedback={onSaveFeedback} currentStep={step} totalSteps={TOTAL_STEPS_F}/>
      {/* Progress bar */}
      {step>0&&step<STEPS.length-1&&(
        <div style={{position:"sticky",top:58,zIndex:20,background:"#fff",borderBottom:"1px solid "+C.gray,padding:"12px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase"}}>{STEPS[step]}</span>
            <span style={{fontSize:10,color:C.earth}}>{step} / {STEPS.length-2}</span>
          </div>
          <div style={{background:C.gray,borderRadius:2,height:3}}><div style={{width:pct+"%",height:"100%",borderRadius:2,background:C.earth,transition:"width .3s"}}/></div>
        </div>
      )}

      <div style={{padding:"28px 18px"}}>

        {/* STEP 0: Bienvenida */}
        {step===0&&(
          <div style={{textAlign:"center",padding:"20px 0 40px"}}>
            <div style={{fontSize:48,marginBottom:20}}>🧹</div>
            <div style={{fontSize:11,color:C.peach,fontWeight:700,letterSpacing:".2em",textTransform:"uppercase",marginBottom:10}}>Spacio AM</div>
            <div style={{fontSize:24,fontWeight:400,color:C.black,marginBottom:14,lineHeight:1.4}}>Bienvenido al Reporte de Limpieza</div>
            <div style={{fontSize:14,color:C.earth,lineHeight:1.7,marginBottom:32}}>Gracias por tu dedicación. Vamos a guiarte paso a paso para completar el control de calidad de esta limpieza.</div>
            <button onClick={next} style={{padding:"14px 36px",borderRadius:100,border:"none",background:C.black,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:".08em"}}>Empezar →</button>
            <div style={{marginTop:16}}><button onClick={onBack} style={{background:"none",border:"none",color:C.earth,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>← Volver al formulario general</button></div>
          </div>
        )}

        {/* STEP 1: País */}
        {step===1&&(
          <WizStep title="¿En qué país estás realizando la limpieza?" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext={!!form.pais}>
            <F label="País">
              <select value={form.pais} onChange={function(e){sf("pais",e.target.value);sf("ciudad",Object.keys(GEO).indexOf(e.target.value)>=0?GEO[e.target.value][0]:"");}}>
                {Object.keys(GEO).map(function(p){return <option key={p}>{p}</option>;})}
              </select>
            </F>
          </WizStep>
        )}

        {/* STEP 2: Ciudad */}
        {step===2&&(
          <WizStep title="¿En qué ciudad estás trabajando hoy?" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext={!!form.ciudad}>
            <F label="Ciudad">
              <select value={form.ciudad} onChange={function(e){sf("ciudad",e.target.value);}}>
                {(GEO[form.pais]||[]).map(function(c){return <option key={c}>{c}</option>;})}
              </select>
            </F>
          </WizStep>
        )}

        {/* STEP 3: Responsable */}
        {step===3&&(
          <WizStep title="¿Quién está realizando esta limpieza?" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext={!!form.reportadoPor}>
            {defaultVendor
              ?<div style={{fontSize:14,fontWeight:600,color:C.black,background:C.beige,padding:"14px",borderRadius:12}}>{vendors.find(function(v){return v.email===defaultVendor;})?vendors.find(function(v){return v.email===defaultVendor;}).name:defaultVendor}</div>
              :<F label="Cleaner / Responsable"><select value={form.reportadoPor} onChange={function(e){sf("reportadoPor",e.target.value);}}><option value="">Seleccionar…</option>{vendors.filter(function(v){return v.active;}).map(function(v){return <option key={v.id} value={v.email}>{v.name}</option>;})}</select></F>
            }
          </WizStep>
        )}

        {/* STEP 4: Propiedad */}
        {step===4&&(
          <WizStep title="¿Qué propiedad estás limpiando?" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext={!!form.propiedad}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <F label="Propiedad"><select value={form.propiedad} onChange={function(e){sf("propiedad",e.target.value);}}><option value="">Seleccionar…</option>{props.map(function(p){return <option key={p.id}>{p.name}</option>;})}</select></F>
              <F label="Fecha de limpieza"><input type="date" value={form.fecha} onChange={function(e){sf("fecha",e.target.value);}}/></F>
            </div>
          </WizStep>
        )}

        {/* STEP 5: Habitaciones */}
        {step===5&&(
          <WizStep title="Fotos de habitaciones" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext>
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <div style={{fontSize:13,color:C.earth,lineHeight:1.6,background:C.surfaceWarm,padding:"11px 14px",borderRadius:8,border:"1px solid "+C.line}}>Sube una foto general de cada habitación mostrando la cama completa y un ángulo abierto del cuarto.</div>
              {Array.from({length:cuartos},function(_,i){
                var foto=form.fotosHabitaciones[i]||null;
                return (
                  <div key={i}>
                    <div style={{fontSize:11,fontWeight:700,color:C.earth,letterSpacing:".12em",textTransform:"uppercase",marginBottom:8}}>Cuarto {i+1}</div>
                    <SinglePhotoUp foto={foto} accent={C.earth} onAdd={function(f){compress(f).then(function(d){var arr=[...form.fotosHabitaciones];arr[i]=d;sf("fotosHabitaciones",arr);});}} onDel={function(){var arr=[...form.fotosHabitaciones];arr[i]=null;sf("fotosHabitaciones",arr);}}/>
                  </div>
                );
              })}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.earth,letterSpacing:".12em",textTransform:"uppercase",marginBottom:8}}>Piso General</div>
                <div style={{fontSize:12,color:C.earth,marginBottom:8}}>Foto del piso general de la propiedad mostrando limpieza y orden.</div>
                <SinglePhotoUp foto={form.fotoPisoGeneral} accent={C.earth} onAdd={function(f){compress(f).then(function(d){sf("fotoPisoGeneral",d);});}} onDel={function(){sf("fotoPisoGeneral",null);}}/>
              </div>
            </div>
          </WizStep>
        )}

        {/* STEP 6: Baños */}
        {step===6&&(
          <WizStep title="Fotos de baños" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext>
            <div style={{display:"flex",flexDirection:"column",gap:24}}>
              {Array.from({length:banos},function(_,i){
                var bano=form.fotosBanos[i]||{ducha:null,inodoro:null};
                function updateBano(field,val){var arr=[...form.fotosBanos];arr[i]=Object.assign({},bano,{[field]:val});sf("fotosBanos",arr);}
                return (
                  <div key={i} style={{background:C.beige,borderRadius:12,padding:"14px"}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.black,marginBottom:14}}>Baño {i+1}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:14}}>
                      <div>
                        <div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Ducha</div>
                        <SinglePhotoUp foto={bano.ducha} accent="#3a8fa3" onAdd={function(f){compress(f).then(function(d){updateBano("ducha",d);});}} onDel={function(){updateBano("ducha",null);}}/>
                      </div>
                      <div>
                        <div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Inodoro</div>
                        <SinglePhotoUp foto={bano.inodoro} accent="#3a8fa3" onAdd={function(f){compress(f).then(function(d){updateBano("inodoro",d);});}} onDel={function(){updateBano("inodoro",null);}}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </WizStep>
        )}

        {/* STEP 7: Cocina */}
        {step===7&&(
          <WizStep title="Cocina — Electrodomésticos" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {[
                ["fotosMicroondas","Microondas limpio (puerta abierta)"],
                ["fotosCafetera", "Cafetera limpia"],
                ["fotosEcofiltro", "Ecofiltro lleno"],
                ["fotosLavatrastos","Lavatrastos limpio y seco"],
                ["fotosRefrigerador","Refrigerador abierto"],
              ].map(function(item){
                var key=item[0]; var lbl=item[1];
                return (
                  <div key={key}>
                    <div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>{lbl}</div>
                    <SinglePhotoUp foto={form[key]} accent={C.peach} onAdd={function(f){compress(f).then(function(d){sf(key,d);});}} onDel={function(){sf(key,null);}}/>
                  </div>
                );
              })}
            </div>
          </WizStep>
        )}

        {/* STEP 8: Sala e Insumos */}
        {step===8&&(
          <WizStep title="Sala e Insumos de cortesía" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {[
                ["fotosTv","TV encendida"],
                ["fotosSillon","Sillón (foto desde arriba)"],
                ["fotosInsumos","Insumos de cortesía (café, azúcar, jabón, papel, etc.)"],
              ].map(function(item){
                var key=item[0]; var lbl=item[1];
                return (
                  <div key={key}>
                    <div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>{lbl}</div>
                    <SinglePhotoUp foto={form[key]} accent={C.earth} onAdd={function(f){compress(f).then(function(d){sf(key,d);});}} onDel={function(){sf(key,null);}}/>
                  </div>
                );
              })}
            </div>
          </WizStep>
        )}

        {/* STEP 9: Limpieza detallada */}
        {step===9&&(
          <WizStep title="Limpieza detallada" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div>
                <div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Debajo de la cama</div>
                <div style={{fontSize:12,color:C.earth,marginBottom:8}}>Para revisar limpieza de polvo o basura.</div>
                <SinglePhotoUp foto={form.fotosDebajoCama} accent={C.earth} onAdd={function(f){compress(f).then(function(d){sf("fotosDebajoCama",d);});}} onDel={function(){sf("fotosDebajoCama",null);}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Clóset — Blancos ordenados</div>
                <div style={{fontSize:12,color:C.earth,marginBottom:8}}>Toallas y sábanas ordenadas en el clóset.</div>
                <SinglePhotoUp foto={form.fotosCloset} accent={C.earth} onAdd={function(f){compress(f).then(function(d){sf("fotosCloset",d);});}} onDel={function(){sf("fotosCloset",null);}}/>
              </div>
            </div>
          </WizStep>
        )}

        {/* STEP 10: Inventario */}
        {step===10&&(
          <WizStep title="Inventario de la propiedad" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <div style={{fontSize:13,color:C.earth,lineHeight:1.6,background:C.surfaceWarm,padding:"11px 14px",borderRadius:8,border:"1px solid "+C.line,marginBottom:10}}>Verifica que todos los ítems estén presentes y en buen estado. Marca los que faltan o están dañados.</div>
              {form.inventario.map(function(item,idx){
                function setInv(k,v){var arr=form.inventario.map(function(x,j){if(j!==idx)return x;var u=Object.assign({},x);u[k]=v;return u;});sf("inventario",arr);}
                var isOk=item.estado==="ok";
                return (
                  <div key={item.id} style={{background:"#fff",borderRadius:12,padding:"13px 15px",border:"1.5px solid "+(isOk?C.gray:"#e9826a"),marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:isOk?0:10}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:C.black}}>{item.name}</div>
                        {item.note&&<div style={{fontSize:11,color:C.earth,marginTop:2}}>{item.note}</div>}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={function(){setInv("estado","ok");}} style={{padding:"5px 11px",borderRadius:100,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",background:isOk?C.surfaceWarm:"#f5f5f5",color:isOk?C.green:C.taupe}}>✓ OK</button>
                        <button onClick={function(){setInv("estado","falta");}} style={{padding:"5px 11px",borderRadius:100,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",background:!isOk?"#FEF0EC":"#f5f5f5",color:!isOk?C.peach:C.gray}}>✗ Falta</button>
                      </div>
                    </div>
                    {!isOk&&<div style={{marginTop:8}}>
                      <F label="Cantidad"><input type="number" min="0" value={item.cantidad} onChange={function(e){setInv("cantidad",parseInt(e.target.value)||0);}}/></F>
                    </div>}
                    {item.requirePhoto&&<div style={{marginTop:10}}><div style={{fontSize:10,color:C.earth,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",marginBottom:6}}>Foto requerida</div><SinglePhotoUp foto={item.foto} accent={C.earth} onAdd={function(f){compress(f).then(function(d){setInv("foto",d);});}} onDel={function(){setInv("foto",null);}}/></div>}
                  </div>
                );
              })}
            </div>
          </WizStep>
        )}

        {/* STEP 11: Daños */}
        {step===11&&(
          <WizStep title="Reporte de daños" step={step} total={STEPS.length-2} onPrev={prev} onNext={next} canNext>
            <DaniosSection form={form} sf={sf}/>
          </WizStep>
        )}

        {/* STEP 12: Foto uniforme */}
        {step===12&&(
          <WizStep title="Foto en uniforme" step={step} total={STEPS.length-2} onPrev={prev} onNext={function(){
            if(!form.fotoUniforme){sf("_uniWarn","noPhoto");}
            next();
          }} canNext>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{background:"#EDF5EF",borderRadius:8,padding:"12px 14px",border:"1px solid #c8dfc8",fontSize:13,color:C.black,lineHeight:1.7,fontWeight:500}}>
                📸 Tómate una foto con la <strong>cámara</strong> usando tu uniforme completo:<br/>
                <span style={{fontSize:11.5,color:C.earth}}>✓ Playera Spacio AM &nbsp;·&nbsp; ✓ Gorra Spacio AM</span>
              </div>
              <SinglePhotoUp
                foto={form.fotoUniforme}
                accent={C.earth}
                cameraOnly={true}
                label="Tomar foto con uniforme"
                onAdd={function(f){compress(f).then(function(d){sf("fotoUniforme",d);sf("_uniWarn",null);});}}
                onDel={function(){sf("fotoUniforme",null);}}
              />
              {form.fotoUniforme&&(
                <div style={{background:"#FFF9E6",borderRadius:8,padding:"10px 14px",border:"1px solid #E6D88A"}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:"#7a6000",marginBottom:4}}>¿Llevas la gorra?</div>
                  <div style={{display:"flex",gap:8}}>
                    {[["si","✓ Sí, llevo gorra"],["no","✗ No llevo gorra"]].map(function(it){
                      var sel=form._gorraOk===it[0];
                      return <button key={it[0]} onClick={function(){sf("_gorraOk",it[0]);}} style={{flex:1,padding:"8px",borderRadius:7,border:"1.5px solid "+(sel?C.black:C.gray),background:sel?C.black:"#fff",color:sel?"#fff":C.earth,fontSize:12,fontWeight:600,cursor:"pointer"}}>{it[1]}</button>;
                    })}
                  </div>
                  {form._gorraOk==="no"&&<div style={{marginTop:8,fontSize:12,color:"#b5622a",fontWeight:600}}>⚠ Recuerda que el uniforme consiste en playera y gorra. No olvides llevar tu gorra pues es parte esencial del uniforme.</div>}
                </div>
              )}
              {!form.fotoUniforme&&<div style={{fontSize:11.5,color:"#b5622a",textAlign:"center",fontWeight:600}}>⚠ La foto es obligatoria antes de continuar</div>}
            </div>
          </WizStep>
        )}

        {/* STEP 13: Confirmación */}
        {step===13&&(
          <div>
            <div style={{textAlign:"center",marginBottom:28}}>
              <div style={{fontSize:48,marginBottom:12}}>📋</div>
              <div style={{fontSize:22,fontWeight:600,color:C.black,marginBottom:8}}>¡Reporte Completado!</div>
              <div style={{fontSize:14,color:C.earth,lineHeight:1.7}}>Gracias por tu compromiso. Este reporte nos ayuda a mantener el estándar de excelencia que distingue a Spacio AM.</div>
            </div>
            <div style={{background:C.beige,borderRadius:14,padding:"16px 18px",marginBottom:20}}>
              {[["Propiedad",form.propiedad],["Ciudad",form.ciudad],["Fecha",fmtDate(form.fecha)],["Responsable",form.reportadoPor]].map(function(r,i){return <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<3?"1px solid "+C.gray:"none"}}><span style={{fontSize:12,color:C.earth,fontWeight:600}}>{r[0]}</span><span style={{fontSize:13,color:C.black,fontWeight:500}}>{r[1]||"—"}</span></div>;})}
            </div>
            {errMsg&&<div style={{padding:"12px 14px",borderRadius:8,background:"#F5EDEC",color:C.red,fontSize:13,fontWeight:600,border:"1px solid #DBC8C4"}}>{errMsg}</div>}
            <div style={{display:"flex",gap:10,flexDirection:"column"}}>
              <button onClick={prev} style={{padding:"12px",borderRadius:12,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:13,fontWeight:600,cursor:"pointer"}}>← Revisar</button>
              <BigBtn onClick={submitTrad} dis={busy}>{busy?"Subiendo… puede tardar unos segundos":"Enviar limpieza →"}</BigBtn>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ═══════════════ LIMPIEZA PROFUNDA WIZARD ═════════════════════════════ */
function LimpiezaProfForm({vendors,props,onSubmit,defaultVendor,onBack}) {
  const STEPS_P = ["Bienvenida","Propiedad","Regadera y Ducha","Ventanas","Cocina profunda","Gavetas y Detrás","Detalle extra","Inventario","Foto uniforme","Confirmación"];
  const [step,setStep]   = useState(0);
  const [errMsg,setErrMsg] = useState("");
  const [form,setForm] = useState({
    reportadoPor:defaultVendor||"", propiedad:"", fecha:todayStr(),
    fotosRegadera:null, fotosDucha:null, fotosDrenajes:[],
    fotosVentanas:[], 
    fotosEstufa:null, fotosFregadero:null, fotosMicroondas2:null, fotosPlatos:null,
    fotosGavetas:[], fotosDetrasElect:null,
    fotosDetalle:[],
    inventario:INV_DEFAULT.map(function(i){return Object.assign({},i,{estado:"ok",foto:null});}),
    comentarios:"",
  });
  const [done,setDone]=useState(false);
  const [busy,setBusy]=useState(false);

  function sf(k,v){setForm(function(p){var u=Object.assign({},p);u[k]=v;return u;});}
  function next(){if(step<STEPS_P.length-1)setStep(function(s){return s+1;});}
  function prev(){if(step>0)setStep(function(s){return s-1;});}
  var propObj=props.find(function(p){return p.name===form.propiedad;})||{};
  var banos=propObj.banos||1;

  async function submit(){
    setBusy(true);
    var vP=vendors.find(function(v){return v.email===form.reportadoPor;});
    var tarifaP=vP&&vP.tarifaLimpieza?String(vP.tarifaLimpieza):"";
    var rep=Object.assign({},form,{id:Date.now(),createdAt:Date.now(),categoria:"Limpieza profunda",descripcion:"Limpieza profunda — "+form.propiedad,total:tarifaP,paid:false,pagadoPor:"",fotoAntes:[],fotoDespues:[],factura:null,qaStatus:"pendiente",qaComentario:"",qaFecha:"",qaRespuesta:null,qaRespuestaFecha:""});
    try {
      await onSubmit(rep);
      setDone(true);
    } catch(e) {
      setErrMsg("Error al enviar: "+(e&&e.message?e.message:"verifica tu conexión."));
    } finally { setBusy(false); }
  }

  if(done) return <SuccessScreen msg="¡Limpieza profunda registrada!" sub="Excelente trabajo. Cada detalle cuenta para Spacio AM."/>;
  var pct=Math.round((step/(STEPS_P.length-1))*100);

  return (
    <div style={{maxWidth:560,margin:"0 auto",padding:"0 0 80px",fontFamily:"Montserrat,sans-serif"}}>
      {step>0&&step<STEPS_P.length-1&&(
        <div style={{position:"sticky",top:58,zIndex:20,background:"#fff",borderBottom:"1px solid "+C.gray,padding:"12px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase"}}>{STEPS_P[step]}</span>
            <span style={{fontSize:10,color:C.earth}}>{step} / {STEPS_P.length-2}</span>
          </div>
          <div style={{background:C.gray,borderRadius:2,height:3}}><div style={{width:pct+"%",height:"100%",borderRadius:2,background:C.taupe,transition:"width .3s"}}/></div>
        </div>
      )}
      <div style={{padding:"28px 18px"}}>

        {step===0&&(
          <div style={{textAlign:"center",padding:"20px 0 40px"}}>
            <div style={{fontSize:48,marginBottom:20}}>🫧</div>
            <div style={{fontSize:11,color:"#2e7d52",fontWeight:700,letterSpacing:".2em",textTransform:"uppercase",marginBottom:10}}>Spacio AM</div>
            <div style={{fontSize:24,fontWeight:400,color:C.black,marginBottom:14,lineHeight:1.4}}>Limpieza Profunda</div>
            <div style={{fontSize:14,color:C.earth,lineHeight:1.7,marginBottom:32,textAlign:"left",background:C.beige,padding:"16px",borderRadius:12}}>
              Hoy nos enfocamos en todo lo que normalmente no da tiempo en la rutina diaria:<br/><br/>
              Duchas · Regaderas · Drenajes · Ventanas · Cocina profunda · Organización
            </div>
            <button onClick={next} style={{padding:"14px 36px",borderRadius:100,border:"none",background:C.black,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>Empezar →</button>
            <div style={{marginTop:16}}><button onClick={onBack} style={{background:"none",border:"none",color:C.earth,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>← Volver al formulario general</button></div>
          </div>
        )}

        {step===1&&(
          <WizStep title="¿Qué propiedad estás limpiando?" step={step} total={STEPS_P.length-2} onPrev={prev} onNext={next} canNext={!!form.propiedad&&!!form.reportadoPor} color="#2e7d52">
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {defaultVendor
                ?<div style={{fontSize:14,fontWeight:600,color:C.black,background:C.beige,padding:"11px 14px",borderRadius:10,marginBottom:4}}>{vendors.find(function(v){return v.email===defaultVendor;})?vendors.find(function(v){return v.email===defaultVendor;}).name:defaultVendor}</div>
                :<F label="Responsable"><select value={form.reportadoPor} onChange={function(e){sf("reportadoPor",e.target.value);}}><option value="">Seleccionar…</option>{vendors.filter(function(v){return v.active;}).map(function(v){return <option key={v.id} value={v.email}>{v.name}</option>;})}</select></F>
              }
              <F label="Propiedad"><select value={form.propiedad} onChange={function(e){sf("propiedad",e.target.value);}}><option value="">Seleccionar…</option>{props.map(function(p){return <option key={p.id}>{p.name}</option>;})}</select></F>
              <F label="Fecha"><input type="date" value={form.fecha} onChange={function(e){sf("fecha",e.target.value);}}/></F>
            </div>
          </WizStep>
        )}

        {step===2&&(
          <WizStep title="Regadera, Ducha y Drenajes" step={step} total={STEPS_P.length-2} onPrev={prev} onNext={next} canNext color="#2e7d52">
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div><div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Regadera — Ojitos (que no estén tapados)</div><SinglePhotoUp foto={form.fotosRegadera} accent="#2e7d52" onAdd={function(f){compress(f).then(function(d){sf("fotosRegadera",d);});}} onDel={function(){sf("fotosRegadera",null);}}/></div>
              <div><div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Ducha / Mampara (vidrio o cortina)</div><SinglePhotoUp foto={form.fotosDucha} accent="#2e7d52" onAdd={function(f){compress(f).then(function(d){sf("fotosDucha",d);});}} onDel={function(){sf("fotosDucha",null);}}/></div>
              <div>
                <div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Drenajes — 1 foto por baño</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {Array.from({length:banos},function(_,i){var foto=form.fotosDrenajes[i]||null;return <div key={i}><div style={{fontSize:11,color:C.earth,marginBottom:6}}>Drenaje baño {i+1}</div><SinglePhotoUp foto={foto} accent="#2e7d52" onAdd={function(f){compress(f).then(function(d){var arr=[...form.fotosDrenajes];arr[i]=d;sf("fotosDrenajes",arr);});}} onDel={function(){var arr=[...form.fotosDrenajes];arr[i]=null;sf("fotosDrenajes",arr);}}/></div>;})}
                </div>
              </div>
            </div>
          </WizStep>
        )}

        {step===3&&(
          <WizStep title="Ventanas" step={step} total={STEPS_P.length-2} onPrev={prev} onNext={next} canNext color="#2e7d52">
            <div><div style={{fontSize:13,color:C.earth,marginBottom:12}}>Al menos 1 ventana limpia por apartamento.</div>
            <MultiPhotoUp label="Ventanas" photos={form.fotosVentanas} max={4} accent="#2e7d52" onAdd={function(files){var copies=[...form.fotosVentanas];Promise.all(Array.from(files).slice(0,4-copies.length).map(compress)).then(function(ds){sf("fotosVentanas",copies.concat(ds).slice(0,4));});}} onDel={function(i){sf("fotosVentanas",form.fotosVentanas.filter(function(_,j){return j!==i;}));}}/>
            </div>
          </WizStep>
        )}

        {step===4&&(
          <WizStep title="Cocina profunda" step={step} total={STEPS_P.length-2} onPrev={prev} onNext={next} canNext color="#2e7d52">
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[["fotosEstufa","Estufa limpia"],["fotosFregadero","Fregadero limpio"],["fotosMicroondas2","Interior del microondas"],["fotosPlatos","Platos, vasos y cubiertos ordenados"]].map(function(item){var key=item[0];var lbl=item[1];return <div key={key}><div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>{lbl}</div><SinglePhotoUp foto={form[key]} accent="#2e7d52" onAdd={function(f){compress(f).then(function(d){sf(key,d);});}} onDel={function(){sf(key,null);}}/></div>;})}
            </div>
          </WizStep>
        )}

        {step===5&&(
          <WizStep title="Gavetas y detrás de electrodomésticos" step={step} total={STEPS_P.length-2} onPrev={prev} onNext={next} canNext color="#2e7d52">
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div><div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Organización de gavetas / utensilios (1-2 ejemplos)</div><MultiPhotoUp label="Gavetas" photos={form.fotosGavetas} max={3} accent="#2e7d52" onAdd={function(files){var c=[...form.fotosGavetas];Promise.all(Array.from(files).slice(0,3-c.length).map(compress)).then(function(ds){sf("fotosGavetas",c.concat(ds).slice(0,3));});}} onDel={function(i){sf("fotosGavetas",form.fotosGavetas.filter(function(_,j){return j!==i;}));}}/></div>
              <div><div style={{fontSize:11,color:C.earth,fontWeight:600,marginBottom:8}}>Detrás de electrodomésticos (si se movieron)</div><SinglePhotoUp foto={form.fotosDetrasElect} accent="#2e7d52" onAdd={function(f){compress(f).then(function(d){sf("fotosDetrasElect",d);});}} onDel={function(){sf("fotosDetrasElect",null);}}/></div>
            </div>
          </WizStep>
        )}

        {step===6&&(
          <WizStep title="Detalle extra" step={step} total={STEPS_P.length-2} onPrev={prev} onNext={next} canNext color="#2e7d52">
            <div>
              <div style={{fontSize:13,color:C.earth,marginBottom:12}}>Cualquier detalle adicional que hayas corregido — antes/después si aplica.</div>
              <MultiPhotoUp label="Detalles extra" photos={form.fotosDetalle} max={6} accent="#2e7d52" onAdd={function(files){var c=[...form.fotosDetalle];Promise.all(Array.from(files).slice(0,6-c.length).map(compress)).then(function(ds){sf("fotosDetalle",c.concat(ds).slice(0,6));});}} onDel={function(i){sf("fotosDetalle",form.fotosDetalle.filter(function(_,j){return j!==i;}));}}/>
              <div style={{marginTop:16}}><F label="Comentarios adicionales"><textarea rows={3} placeholder="Observaciones del equipo…" value={form.comentarios} onChange={function(e){sf("comentarios",e.target.value);}}/></F></div>
            </div>
          </WizStep>
        )}

        {step===7&&(
          <WizStep title="Inventario de la propiedad" step={step} total={STEPS_P.length-2} onPrev={prev} onNext={next} canNext color="#2e7d52">
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <div style={{fontSize:13,color:C.earth,lineHeight:1.6,background:C.surfaceWarm,padding:"11px 14px",borderRadius:8,border:"1px solid "+C.line,marginBottom:10}}>Verifica que todos los ítems estén presentes.</div>
              {form.inventario.map(function(item,idx){
                function setInv(k,v){var arr=form.inventario.map(function(x,j){if(j!==idx)return x;var u=Object.assign({},x);u[k]=v;return u;});sf("inventario",arr);}
                var isOk=item.estado==="ok";
                return (
                  <div key={item.id} style={{background:"#fff",borderRadius:12,padding:"13px 15px",border:"1.5px solid "+(isOk?C.gray:"#e9826a"),marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.black}}>{item.name}</div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={function(){setInv("estado","ok");}} style={{padding:"5px 11px",borderRadius:100,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",background:isOk?C.surfaceWarm:"#f5f5f5",color:isOk?C.green:C.taupe}}>✓</button>
                        <button onClick={function(){setInv("estado","falta");}} style={{padding:"5px 11px",borderRadius:100,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",background:!isOk?"#FEF0EC":"#f5f5f5",color:!isOk?C.peach:C.gray}}>✗</button>
                      </div>
                    </div>
                    {item.requirePhoto&&<div style={{marginTop:8}}><SinglePhotoUp foto={item.foto} accent="#2e7d52" onAdd={function(f){compress(f).then(function(d){setInv("foto",d);});}} onDel={function(){setInv("foto",null);}}/></div>}
                  </div>
                );
              })}
            </div>
          </WizStep>
        )}

        {step===8&&(
          <div>
            <div style={{textAlign:"center",marginBottom:28}}>
              <div style={{fontSize:48,marginBottom:12}}>🫧</div>
              <div style={{fontSize:22,fontWeight:600,color:C.black,marginBottom:8}}>¡Limpieza registrada!</div>
              <div style={{fontSize:14,color:C.earth,lineHeight:1.7}}>Excelente trabajo. Cada detalle cuenta.</div>
            </div>
            <div style={{background:C.beige,borderRadius:14,padding:"16px 18px",marginBottom:20}}>
              {[["Propiedad",form.propiedad],["Fecha",fmtDate(form.fecha)],["Responsable",form.reportadoPor]].map(function(r,i){return <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<2?"1px solid "+C.gray:"none"}}><span style={{fontSize:12,color:C.earth,fontWeight:600}}>{r[0]}</span><span style={{fontSize:13,color:C.black}}>{r[1]||"—"}</span></div>;})}
            </div>
            {errMsg&&<div style={{padding:"12px 14px",borderRadius:8,background:"#F5EDEC",color:C.red,fontSize:13,fontWeight:600,border:"1px solid #DBC8C4"}}>{errMsg}</div>}
            <div style={{display:"flex",gap:10,flexDirection:"column"}}>
              <button onClick={prev} style={{padding:"12px",borderRadius:12,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:13,fontWeight:600,cursor:"pointer"}}>← Revisar</button>
              <BigBtn onClick={submit} dis={busy}>{busy?"Subiendo… puede tardar unos segundos":"Enviar limpieza →"}</BigBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ SHARED WIZARD HELPERS ════════════════════════════════ */
function WizStep({title,step,total,onPrev,onNext,canNext,children,color}) {
  var ac = color||C.peach;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{fontSize:20,fontWeight:500,color:C.black,lineHeight:1.4}}>{title}</div>
      {children}
      <div style={{display:"flex",gap:10,marginTop:8}}>
        {step>1&&<button onClick={onPrev} style={{flex:1,padding:"13px",borderRadius:12,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:13,fontWeight:600,cursor:"pointer"}}>← Anterior</button>}
        <button onClick={onNext} disabled={!canNext} style={{flex:2,padding:"13px",borderRadius:12,border:"none",background:canNext?ac:C.gray,color:"#fff",fontSize:13,fontWeight:600,cursor:canNext?"pointer":"not-allowed",transition:"background .2s"}}>Siguiente →</button>
      </div>
    </div>
  );
}

function SuccessScreen({msg,sub}) {
  return (
    <div style={{textAlign:"center",padding:"80px 20px",fontFamily:"Montserrat,sans-serif",maxWidth:400,margin:"0 auto"}}>
      <div style={{fontSize:64,marginBottom:20}}>✓</div>
      <div style={{fontSize:22,fontWeight:600,color:C.black,marginBottom:12}}>{msg}</div>
      <div style={{fontSize:14,color:C.earth,lineHeight:1.7}}>{sub}</div>
    </div>
  );
}

function DaniosSection({form,sf}) {
  function addDanio() {
    sf("danios",form.danios.concat([{desc:"",fotos:[],origen:"",reparacion:"",comentarios:"",fotos2:[],factura:null,cobrado:false,quienPaga:""}]));
  }
  function setDanio(idx,k,v) {
    sf("danios",form.danios.map(function(d,j){if(j!==idx)return d;var u=Object.assign({},d);u[k]=v;return u;}));
  }
  function rmDanio(idx) { sf("danios",form.danios.filter(function(_,j){return j!==idx;})); }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontSize:15,fontWeight:500,color:C.black}}>¿Encontraste algún daño en la propiedad?</div>
      <div style={{display:"flex",gap:8}}>
        <ChipBtn active={!form.hayDanios} onClick={function(){sf("hayDanios",false);sf("danios",[]);}} color={C.green}>No</ChipBtn>
        <ChipBtn active={form.hayDanios}  onClick={function(){sf("hayDanios",true);if(form.danios.length===0)addDanio();}} color={C.red}>Sí</ChipBtn>
      </div>
      {form.hayDanios&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {form.danios.map(function(d,idx){
            return (
              <div key={idx} style={{background:"#fff",borderRadius:14,padding:"16px",border:"2px solid #f5c6a0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.peach,letterSpacing:".1em",textTransform:"uppercase"}}>Daño {idx+1}</div>
                  {form.danios.length>1&&<button onClick={function(){rmDanio(idx);}} style={{background:"none",border:"none",color:C.gray,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <F label="Describe el daño"><textarea rows={3} placeholder="¿Qué fue dañado y cómo?" value={d.desc} onChange={function(e){setDanio(idx,"desc",e.target.value);}}/></F>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>Fotos del daño</div>
                    <MultiPhotoUp label="Fotos del daño" photos={d.fotos} max={5} accent={C.peach} onAdd={function(files){var c=[...d.fotos];Promise.all(Array.from(files).slice(0,5-c.length).map(compress)).then(function(ds){setDanio(idx,"fotos",c.concat(ds).slice(0,5));});}} onDel={function(i){setDanio(idx,"fotos",d.fotos.filter(function(_,j){return j!==i;}));}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>¿Origen del daño?</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {["Estaba antes","Lo dejó el huésped","No estoy seguro"].map(function(op){return <ChipBtn key={op} active={d.origen===op} onClick={function(){setDanio(idx,"origen",op);}} color={C.earth}>{op}</ChipBtn>;})}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>¿Se puede reparar?</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {["Se puede reparar","Hay que reemplazar","No estoy seguro"].map(function(op){return <ChipBtn key={op} active={d.reparacion===op} onClick={function(){setDanio(idx,"reparacion",op);}} color={C.earth}>{op}</ChipBtn>;})}
                    </div>
                  </div>
                  <div style={{borderTop:"1px solid "+C.gray,paddingTop:14,marginTop:4}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:10}}>Seguimiento del daño</div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      <F label="Comentarios / Notas internas"><textarea rows={2} placeholder="Acciones tomadas, notas para el equipo…" value={d.comentarios} onChange={function(e){setDanio(idx,"comentarios",e.target.value);}}/></F>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>Evidencia adicional / Factura</div>
                        <MultiPhotoUp label="Fotos adicionales" photos={d.fotos2} max={3} accent={C.earth} onAdd={function(files){var c=[...d.fotos2];Promise.all(Array.from(files).slice(0,3-c.length).map(compress)).then(function(ds){setDanio(idx,"fotos2",c.concat(ds).slice(0,3));});}} onDel={function(i){setDanio(idx,"fotos2",d.fotos2.filter(function(_,j){return j!==i;}));}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>¿Ya se cobró?</div>
                        <div style={{display:"flex",gap:6}}>
                          <ChipBtn active={d.cobrado} onClick={function(){setDanio(idx,"cobrado",true);}} color={C.green}>✓ Cobrado</ChipBtn>
                          <ChipBtn active={!d.cobrado} onClick={function(){setDanio(idx,"cobrado",false);}} color={C.red}>Pendiente</ChipBtn>
                        </div>
                      </div>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>¿Quién paga el daño?</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {["Airbnb","Seguro","Dueño","Spacio AM"].map(function(op){return <ChipBtn key={op} active={d.quienPaga===op} onClick={function(){setDanio(idx,"quienPaga",op);}} color={C.earth}>{op}</ChipBtn>;})}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <button onClick={addDanio} style={{padding:"12px",borderRadius:12,border:"2px dashed "+C.gray,background:"#fff",color:C.earth,fontSize:13,fontWeight:600,cursor:"pointer"}}>+ Agregar otro daño</button>
        </div>
      )}
    </div>
  );
}

function SinglePhotoUp({foto,accent,onAdd,onDel,cameraOnly,label}) {
  var ref=useRef(null);
  return (
    <div>
      {foto
        ?<div style={{position:"relative",width:"100%",maxWidth:280,borderRadius:12,overflow:"hidden"}}>
          <img src={foto} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block"}}/>
          <button onClick={onDel} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.6)",color:"#fff",border:"none",borderRadius:"50%",width:28,height:28,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>
        </div>
        :<label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:"100%",maxWidth:280,minHeight:130,borderRadius:12,border:"2px dashed "+(accent||C.earth),cursor:"pointer",background:C.surfaceWarm,gap:6}}>
          <span style={{fontSize:26}}>📷</span>
          <span style={{fontSize:12,color:C.earth,fontWeight:600,textAlign:"center",padding:"0 12px"}}>{label||"Toca para añadir foto"}</span>
          {cameraOnly&&<span style={{fontSize:10,color:C.taupe}}>Solo cámara</span>}
          <input ref={ref} type="file" accept="image/*" capture={cameraOnly?"environment":undefined} style={{display:"none"}} onChange={function(e){var f=e.target.files&&e.target.files[0];if(f)onAdd(f);e.target.value="";}}/>
        </label>
      }
    </div>
  );
}

function MultiPhotoUp({label,photos,max,accent,onAdd,onDel}) {
  var ref=useRef(null);
  return (
    <div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {photos.map(function(src,i){return <div key={i} style={{position:"relative",width:84,height:84,borderRadius:10,overflow:"hidden",border:"2px solid "+(accent+"30")}}><img src={src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/><button onClick={function(){onDel(i);}} style={{position:"absolute",top:3,right:3,width:20,height:20,borderRadius:"50%",border:"none",background:"rgba(0,0,0,.55)",color:"#fff",fontSize:14,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button></div>;})}
        {photos.length<max&&<button onClick={function(){if(ref.current)ref.current.click();}} style={{width:84,height:84,borderRadius:10,border:"1.5px dashed "+C.line,background:C.surface,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",transition:"background .2s"}}><span style={{fontSize:20,color:C.earth}}>+</span><span style={{fontSize:9.5,color:C.earth,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase"}}>Foto</span></button>}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple style={{display:"none"}} onChange={function(e){if(e.target.files&&e.target.files.length)onAdd(e.target.files);e.target.value="";}}/>
    </div>
  );
}


/* ─── Config */
function CfgView({vendors,props,adminPin,company,extCats,schedules,hospUrlDay,hospUrlWeek,feedback,onSvV,onSvP,onSvPin,onSvCo,onSvExtCats,onSvSchedules,onSvHospUrlDay,onSvHospUrlWeek,onSvFeedback}) {
  const [tab,setTab] = useState("vendors");
  return (
    <div style={{maxWidth:640,margin:"0 auto",padding:"28px 18px 60px",fontFamily:"Montserrat,sans-serif"}}>
      <div style={{marginBottom:20}}><div style={{fontSize:9.5,fontWeight:600,color:C.earth,letterSpacing:".28em",textTransform:"uppercase",marginBottom:8}}>Configuración</div><div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:28,fontWeight:400,color:C.black}}>Ajustes del sistema</div></div>
      <div style={{display:"flex",background:"#fff",borderRadius:10,padding:4,gap:3,marginBottom:18,border:"1px solid "+C.gray,flexWrap:"wrap"}}>
        {[["vendors","Proveedores"],["props","Propiedades"],["sched","Programación"],["feedback","Feedback"],["recovery","📷 Recuperar fotos"],["company","Empresa"],["security","Seguridad"]].map(function(it){ var k=it[0],l=it[1]; return <button key={k} onClick={function(){setTab(k);}} style={{flex:1,minWidth:90,padding:"9px 6px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:tab===k?C.black:"transparent",color:tab===k?"#fff":C.taupe,fontSize:12,letterSpacing:".06em",transition:"all .2s"}}>{l}</button>; })}
      </div>
      <div style={{display:tab==="vendors"  ?"block":"none"}}><VendorsCfg  vendors={vendors} extCats={extCats||[]} onSave={onSvV} onSaveExtCats={onSvExtCats}/></div>
      <div style={{display:tab==="sched"   ?"block":"none"}}><ScheduleCfg schedules={schedules||[]} vendors={vendors||[]} props={props||[]} hospUrlDay={hospUrlDay||""} hospUrlWeek={hospUrlWeek||""} onSave={onSvSchedules} onSaveHospUrlDay={onSvHospUrlDay} onSaveHospUrlWeek={onSvHospUrlWeek}/></div>
      <div style={{display:tab==="feedback"?"block":"none"}}><FeedbackCfg feedback={feedback||[]} onSave={onSvFeedback}/></div>
      <div style={{display:tab==="recovery"?"block":"none"}}><PhotoRecoveryTool/></div>
      <div style={{display:tab==="props"   ?"block":"none"}}><PropsCfg    props={props}     onSave={onSvP}/></div>
      <div style={{display:tab==="company" ?"block":"none"}}><CompanyCfg  company={company} onSave={onSvCo}/></div>
      <div style={{display:tab==="security"?"block":"none"}}><SecurityCfg adminPin={adminPin} onSave={onSvPin}/></div>
    </div>
  );
}


function VendorsCfg({vendors, extCats, onSave, onSaveExtCats}) {
  const blankNew = {primerNombre:"",segundoNombre:"",primerApellido:"",segundoApellido:"",empresa:"",tipo:"interno",categoria:"EPI Limpieza",email:"",password:"",phone:"",tarifaLimpieza:""};
  const [newV,     setNewV]     = useState(blankNew);
  const [newExtCat,setNewExtCat]= useState("");
  const [editId,   setEditId]   = useState(null);
  const [editFld,  setEFld]     = useState(null);
  const [editVal,  setEVal]     = useState("");

  function startEdit(id,fld,cur){setEditId(id);setEFld(fld);setEVal(fld==="password"?"":cur||"");}
  function cancelEdit(){setEditId(null);setEFld(null);setEVal("");}
  function confirmEdit(){
    if(editVal!==null&&editVal!==""){
      var val=editFld==="tarifaLimpieza"?parseFloat(editVal)||0:editVal;
      var updated=vendors.map(function(v){if(v.id===editId){var u=Object.assign({},v);u[editFld]=val;u.name=vendorDisplay(u);return u;}return v;});
      onSave(updated);
    }
    cancelEdit();
  }

  function addExtCat(){
    var cat=newExtCat.trim().split(/\s+/).slice(0,3).join(" ");
    if(!cat||(extCats||[]).includes(cat)) return;
    var updated=(extCats||[]).concat([cat]);
    if(onSaveExtCats) onSaveExtCats(updated);
    setNewExtCat("");
  }

  function addVendor(){
    if(!newV.primerNombre||!newV.primerApellido||!newV.email||!newV.password)return;
    var name=[newV.primerNombre,newV.primerApellido].filter(Boolean).join(" ");
    onSave(vendors.concat([Object.assign({},newV,{id:"v"+Date.now(),name:name,active:true,isAdmin:false,tarifaLimpieza:parseFloat(newV.tarifaLimpieza)||0})]));
    setNewV(blankNew);
  }

  var allExtCats=(extCats||[]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* Existing vendors */}
      {vendors.map(function(v){
        function EditRow(field,label,cur,type){
          var isMe=editId===v.id&&editFld===field;
          return (
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".1em",textTransform:"uppercase",minWidth:72}}>{label}</span>
              {isMe?(
                <div style={{display:"flex",gap:6,alignItems:"center",flex:1}}>
                  <input value={editVal} onChange={function(e){setEVal(e.target.value);}} type={type||"text"} style={{flex:1,maxWidth:200,border:"1.5px solid "+C.earth,borderRadius:6,padding:"4px 9px",fontSize:12,fontFamily:"Montserrat,sans-serif",outline:"none"}}/>
                  <button onClick={confirmEdit} style={{fontSize:11,fontWeight:700,color:C.green,background:"#EDF5EF",border:"none",borderRadius:6,padding:"4px 9px",cursor:"pointer"}}>OK</button>
                  <button onClick={cancelEdit}  style={{fontSize:11,color:C.earth,background:"none",border:"none",cursor:"pointer"}}>✕</button>
                </div>
              ):(
                <div style={{display:"flex",gap:8,alignItems:"center",flex:1}}>
                  <span style={{fontSize:12,color:C.black,background:field==="tarifaLimpieza"?"#EDF5EF":C.surfaceWarm,padding:"3px 9px",borderRadius:6,fontWeight:field==="tarifaLimpieza"?700:400,color:field==="tarifaLimpieza"?C.green:C.black}}>
                    {field==="password"?"••••••••":field==="tarifaLimpieza"?(cur?"Q"+cur:"Sin tarifa"):cur||"—"}
                  </span>
                  <button onClick={function(){startEdit(v.id,field,cur);}} style={{fontSize:11,color:C.earth,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Editar</button>
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={v.id} style={{background:"#fff",borderRadius:10,padding:"16px",border:"1px solid "+C.line}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:14}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:C.black}}>{vendorDisplay(v)}</div>
                {v.primerApellido&&v.segundoApellido&&<div style={{fontSize:11.5,color:C.earth}}>{[v.segundoNombre,v.segundoApellido].filter(Boolean).join(" ")}</div>}
                <div style={{fontSize:11,color:C.taupe,marginTop:2}}>{vendorTipo(v)}</div>
                {v.empresa&&<div style={{fontSize:11,color:C.taupe}}>{v.empresa}</div>}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0,marginLeft:8}}>
                <span style={{fontSize:10,fontWeight:700,color:v.active?C.green:C.red,background:v.active?"#EDF5EF":"#F5EDEC",padding:"3px 8px",borderRadius:100}}>{v.active?"Activo":"Inactivo"}</span>
                <button onClick={function(){var u=vendors.map(function(x){if(x.id===v.id){var r=Object.assign({},x);r.active=!x.active;return r;}return x;});onSave(u);}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+C.gray,background:"#fff",color:C.black,fontSize:11,cursor:"pointer"}}>{v.active?"Desactivar":"Activar"}</button>
                <button onClick={function(){if(confirm("¿Eliminar a "+vendorDisplay(v)+" permanentemente?")){onSave(vendors.filter(function(x){return x.id!==v.id;}));}}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #DBC8C4",background:"#fff",color:C.red,fontSize:11,cursor:"pointer",fontWeight:600}}>Eliminar</button>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {EditRow("email",          "Email",       v.email)}
              {EditRow("password",       "Password",    v.password, "password")}
              {EditRow("phone",          "Tel.",        v.phone)}
              {EditRow("empresa",        "Empresa",     v.empresa)}
              {EditRow("tarifaLimpieza", "Tarifa (Q)",  v.tarifaLimpieza||0, "number")}
              {EditRow("primerNombre",   "1er nombre",  v.primerNombre)}
              {EditRow("primerApellido", "1er apellido",v.primerApellido)}
              {/* Tipo + Categoria inline */}
              <div style={{paddingTop:6,borderTop:"1px solid "+C.line}}>
                <div style={{fontSize:9,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:6}}>Tipo de proveedor</div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  {["interno","externo"].map(function(t){var s=v.tipo===t;return(
                    <button key={t} onClick={function(){var u=vendors.map(function(x){if(x.id===v.id){var r=Object.assign({},x);r.tipo=t;r.categoria=t==="interno"?"EPI Limpieza":allExtCats[0]||"";return r;}return x;});onSave(u);}} style={{padding:"5px 14px",borderRadius:6,border:"1.5px solid "+(s?C.black:C.gray),background:s?C.black:"#fff",color:s?"#fff":C.earth,fontSize:11.5,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{t}</button>
                  );})}
                </div>
                <div style={{fontSize:9,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:6}}>Categoría</div>
                {v.tipo==="interno"?(
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {INTERNAL_CATS.map(function(c){var s=v.categoria===c;return(
                      <button key={c} onClick={function(){var u=vendors.map(function(x){if(x.id===v.id){var r=Object.assign({},x);r.categoria=c;return r;}return x;});onSave(u);}} style={{padding:"4px 10px",borderRadius:100,border:"1.5px solid "+(s?C.black:C.gray),background:s?C.black:"#fff",color:s?"#fff":C.earth,fontSize:11,fontWeight:600,cursor:"pointer"}}>{c}</button>
                    );})}
                  </div>
                ):(
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {(allExtCats||[]).map(function(c){var s=v.categoria===c;return(
                      <button key={c} onClick={function(){var u=vendors.map(function(x){if(x.id===v.id){var r=Object.assign({},x);r.categoria=c;return r;}return x;});onSave(u);}} style={{padding:"4px 10px",borderRadius:100,border:"1.5px solid "+(s?C.black:C.gray),background:s?C.black:"#fff",color:s?"#fff":C.earth,fontSize:11,fontWeight:600,cursor:"pointer"}}>{c}</button>
                    );})}
                  </div>
                )}
              </div>
              {/* Admin toggle for internal */}
              {v.tipo==="interno"&&(
                <div style={{display:"flex",alignItems:"center",gap:10,paddingTop:6,borderTop:"1px solid "+C.line}}>
                  <span style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".1em",textTransform:"uppercase",minWidth:72}}>Acceso Admin</span>
                  <button onClick={function(){var u=vendors.map(function(x){if(x.id===v.id){var r=Object.assign({},x);r.isAdmin=!x.isAdmin;return r;}return x;});onSave(u);}} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",borderRadius:6,border:"1px solid "+C.gray,background:v.isAdmin?"#1E1E1E":"#fff",color:v.isAdmin?"#fff":C.earth,fontSize:11.5,fontWeight:600,cursor:"pointer",transition:"all .2s"}}>
                    <span style={{width:14,height:14,borderRadius:"50%",background:v.isAdmin?C.green:"#ccc",display:"inline-block",flexShrink:0}}/>
                    {v.isAdmin?"Admin activo":"Sin acceso admin"}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Custom external categories */}
      <div style={{background:"#fff",borderRadius:10,padding:"14px",border:"1px solid "+C.line}}>
        <div style={{fontSize:9.5,color:C.earth,fontWeight:700,letterSpacing:".16em",textTransform:"uppercase",marginBottom:10}}>Categorías externas guardadas</div>
        {allExtCats.length===0&&<div style={{fontSize:12,color:C.taupe,marginBottom:8}}>Ninguna aún — agrégalas abajo.</div>}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
          {allExtCats.map(function(c,i){return <span key={i} style={{padding:"4px 10px",borderRadius:100,background:C.surfaceWarm,fontSize:12,color:C.black,border:"1px solid "+C.line,display:"flex",alignItems:"center",gap:6}}>{c}<button onClick={function(){var u=allExtCats.filter(function(_,j){return j!==i;});if(onSaveExtCats)onSaveExtCats(u);}} style={{background:"none",border:"none",color:C.gray,fontSize:14,cursor:"pointer",lineHeight:1}}>×</button></span>;})}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input placeholder="Ej. Servicios Múltiples (máx 3 palabras)" value={newExtCat} onChange={function(e){setNewExtCat(e.target.value);}} style={{flex:1,border:"1px solid "+C.gray,borderRadius:6,padding:"8px 12px",fontSize:12.5,fontFamily:"Montserrat,sans-serif",outline:"none"}}/>
          <button onClick={addExtCat} style={{padding:"8px 14px",borderRadius:6,border:"none",background:C.black,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Agregar</button>
        </div>
      </div>

      {/* Add new vendor */}
      <div style={{background:"#fff",borderRadius:10,padding:"16px",border:"1.5px dashed "+C.gray}}>
        <div style={{fontSize:9.5,color:C.earth,fontWeight:700,letterSpacing:".16em",textTransform:"uppercase",marginBottom:14}}>Agregar proveedor</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <F label="Primer nombre *"><input placeholder="María" value={newV.primerNombre} onChange={function(e){setNewV(function(p){return Object.assign({},p,{primerNombre:e.target.value});})}}/></F>
            <F label="Segundo nombre"><input placeholder="José" value={newV.segundoNombre} onChange={function(e){setNewV(function(p){return Object.assign({},p,{segundoNombre:e.target.value});})}}/></F>
            <F label="Primer apellido *"><input placeholder="García" value={newV.primerApellido} onChange={function(e){setNewV(function(p){return Object.assign({},p,{primerApellido:e.target.value});})}}/></F>
            <F label="Segundo apellido"><input placeholder="López" value={newV.segundoApellido} onChange={function(e){setNewV(function(p){return Object.assign({},p,{segundoApellido:e.target.value});})}}/></F>
          </div>
          <F label="Empresa / Razón social"><input placeholder="Servicios XYZ S.A." value={newV.empresa} onChange={function(e){setNewV(function(p){return Object.assign({},p,{empresa:e.target.value});})}}/></F>
          <div>
            <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase",marginBottom:8}}>Tipo de proveedor</div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              {["interno","externo"].map(function(t){var s=newV.tipo===t;return <button key={t} onClick={function(){setNewV(function(p){return Object.assign({},p,{tipo:t,categoria:t==="interno"?"EPI Limpieza":allExtCats[0]||""});});}} style={{padding:"8px 18px",borderRadius:6,border:"1.5px solid "+(s?C.black:C.gray),background:s?C.black:"#fff",color:s?"#fff":C.earth,fontSize:12.5,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{t}</button>;})}
            </div>
            <div>
              <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase",marginBottom:6}}>Categoría</div>
              {newV.tipo==="interno"?(
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {INTERNAL_CATS.map(function(c){var s=newV.categoria===c;return <button key={c} onClick={function(){setNewV(function(p){return Object.assign({},p,{categoria:c});});}} style={{padding:"6px 14px",borderRadius:100,border:"1.5px solid "+(s?C.black:C.gray),background:s?C.black:"#fff",color:s?"#fff":C.earth,fontSize:12,fontWeight:600,cursor:"pointer"}}>{c}</button>;})}
                </div>
              ):(
                <div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                    {allExtCats.map(function(c){var s=newV.categoria===c;return <button key={c} onClick={function(){setNewV(function(p){return Object.assign({},p,{categoria:c});});}} style={{padding:"6px 14px",borderRadius:100,border:"1.5px solid "+(s?C.black:C.gray),background:s?C.black:"#fff",color:s?"#fff":C.earth,fontSize:12,fontWeight:600,cursor:"pointer"}}>{c}</button>;})}
                  </div>
                  {allExtCats.length===0&&<div style={{fontSize:12,color:C.taupe}}>Agrega primero una categoría externa arriba.</div>}
                </div>
              )}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <F label="Correo electrónico *"><input type="email" placeholder="correo@empresa.com" value={newV.email} onChange={function(e){setNewV(function(p){return Object.assign({},p,{email:e.target.value});})}}/></F>
            <F label="Contraseña inicial *"><input type="password" placeholder="••••••••" value={newV.password} onChange={function(e){setNewV(function(p){return Object.assign({},p,{password:e.target.value});})}}/></F>
            <F label="WhatsApp"><input placeholder="+502 9999 9999" value={newV.phone} onChange={function(e){setNewV(function(p){return Object.assign({},p,{phone:e.target.value});})}}/></F>
            <F label="Tarifa limpieza (Q)"><input type="number" placeholder="75" value={newV.tarifaLimpieza} onChange={function(e){setNewV(function(p){return Object.assign({},p,{tarifaLimpieza:e.target.value});})}}/></F>
          </div>
          <button onClick={addVendor} style={{width:"100%",padding:"13px",borderRadius:8,border:"none",background:C.black,color:"#fff",fontSize:12.5,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>+ Agregar proveedor</button>
        </div>
      </div>
    </div>
  );
}



/* ─── PropList — property list with safe delete + inline note about existing reports */
function PropList({props, onSave}) {
  const [confirmId, setConfirmId] = useState(null);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {props.map(function(p,i){
        var isConfirming = confirmId===p.id;
        return (
          <div key={p.id} style={{background:"#fff",borderRadius:10,padding:"12px 16px",border:"1px solid "+(isConfirming?"#DBC8C4":C.line)}}>
            {/* Name + delete area */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:isConfirming?10:8}}>
              <span style={{fontSize:13.5,fontWeight:500,color:C.black,flex:1}}>{p.name}</span>
              {!isConfirming&&(
                <button onClick={function(){setConfirmId(p.id);}} style={{flexShrink:0,padding:"5px 12px",borderRadius:6,border:"1px solid #DBC8C4",background:"#FFF9F9",color:C.red,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                  Eliminar
                </button>
              )}
            </div>

            {/* Confirm delete */}
            {isConfirming&&(
              <div style={{background:"#FFF9F9",borderRadius:8,padding:"11px 13px",border:"1px solid #E8D0D0",marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:600,color:C.red,marginBottom:4}}>¿Eliminar "{p.name}"?</div>
                <div style={{fontSize:11.5,color:C.earth,lineHeight:1.6,marginBottom:10}}>
                  Los trabajos ya creados con esta propiedad <strong>no se verán afectados</strong> — seguirán mostrando el nombre original. Solo desaparecerá del selector al crear nuevos reportes.
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={function(){onSave(props.filter(function(x){return x.id!==p.id;}));setConfirmId(null);}} style={{flex:1,padding:"9px",borderRadius:7,border:"none",background:C.red,color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Sí, eliminar</button>
                  <button onClick={function(){setConfirmId(null);}} style={{flex:1,padding:"9px",borderRadius:7,border:"1px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Cuartos / Baños */}
            {!isConfirming&&(
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".12em",textTransform:"uppercase",display:"block",marginBottom:4}}>Cuartos</label>
                  <input type="number" min="1" max="10" value={p.cuartos||1} onChange={function(e){var v=parseInt(e.target.value)||1;onSave(props.map(function(x,j){if(j!==i)return x;return Object.assign({},x,{cuartos:v});}));}} style={{width:"100%",border:"1px solid "+C.gray,borderRadius:6,padding:"6px 10px",fontSize:13,fontFamily:"Montserrat,sans-serif",outline:"none"}}/>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".12em",textTransform:"uppercase",display:"block",marginBottom:4}}>Baños</label>
                  <input type="number" min="1" max="10" value={p.banos||1} onChange={function(e){var v=parseInt(e.target.value)||1;onSave(props.map(function(x,j){if(j!==i)return x;return Object.assign({},x,{banos:v});}));}} style={{width:"100%",border:"1px solid "+C.gray,borderRadius:6,padding:"6px 10px",fontSize:13,fontFamily:"Montserrat,sans-serif",outline:"none"}}/>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


function PropsCfg({props,onSave}) {
  const [newP, setNewP] = useState("");
  const [msg,  setMsg]  = useState(null);
  const ref = useRef(null);
  function handleTxt(e) {
    var file=e.target.files&&e.target.files[0]; if(!file) return;
    var reader=new FileReader();
    reader.onload=function(ev){
      var lines=ev.target.result.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
      var added=0,sk=0,merged=props.slice();
      lines.forEach(function(name,i){if(merged.some(function(p){return p.name.toLowerCase()===name.toLowerCase();})){sk++;return;} merged.push({id:"p"+Date.now()+"_"+i,name:name,cuartos:1,banos:1});added++;});
      onSave(merged);
      setMsg(added+" propiedades agregadas"+(sk>0?", "+sk+" omitidas":"")+".");
      setTimeout(function(){setMsg(null);},4000);
    };
    reader.readAsText(file); e.target.value="";
  }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:"#fff",borderRadius:12,padding:18,border:"1px solid "+C.line}}>
        <div style={{fontSize:10.5,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:10}}>Cargar desde archivo .txt</div>
        <div style={{background:C.beige,borderRadius:10,padding:"11px 14px",marginBottom:12,fontSize:12,color:C.earth,fontFamily:"monospace",lineHeight:1.8}}>Narama – Apto 725<br/>Casa San Ignacio – Apto 506</div>
        <button onClick={function(){if(ref.current)ref.current.click();}} style={{padding:"11px 18px",borderRadius:10,border:"1.5px solid "+C.gray,background:C.black,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>📄 Seleccionar .txt</button>
        <input ref={ref} type="file" accept=".txt,text/plain" style={{display:"none"}} onChange={handleTxt}/>
        {msg&&<div style={{marginTop:10,fontSize:13,fontWeight:600,color:C.green,background:"#EDF5EF",padding:"9px 13px",borderRadius:9}}>{msg}</div>}
      </div>
      <div style={{fontSize:10.5,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",paddingLeft:2}}>Lista — {props.length} propiedades</div>
      <PropList props={props} onSave={onSave}/>
      <div style={{background:"#fff",borderRadius:12,padding:14,border:"1.5px dashed "+C.gray}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"end"}}>
          <F label="Agregar propiedad"><input placeholder="Ej. Torre Norte – Apto 304" value={newP} onChange={function(e){setNewP(e.target.value);}}/></F>
          <button onClick={function(){if(!newP)return;onSave(props.concat([{id:"p"+Date.now(),name:newP,cuartos:1,banos:1}]));setNewP("");}} style={{height:44,padding:"0 18px",borderRadius:10,border:"none",background:C.black,color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>+ Agregar</button>
        </div>
      </div>
    </div>
  );
}

function CompanyCfg({company,onSave}) {
  const [name, setName] = useState(company&&company.name?company.name:"");
  const [nit,  setNit]  = useState(company&&company.nit?company.nit:"");
  const [ok,   setOk]   = useState(false);
  function save() { if(!name||!nit) return; onSave({name:name,nit:nit}); setOk(true); setTimeout(function(){setOk(false);},2500); }
  return (
    <Card title="Datos de la empresa (para facturas)">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{fontSize:13,color:C.earth,lineHeight:1.6,background:C.beige,padding:"12px 14px",borderRadius:10}}>Estos datos aparecen en la nota de facturación del formulario.</div>
        <F label="Nombre de la empresa"><input placeholder="Spacio AM S.A." value={name} onChange={function(e){setName(e.target.value);}}/></F>
        <F label="NIT"><input placeholder="118287796" value={nit} onChange={function(e){setNit(e.target.value);}}/></F>
        {ok&&<div style={{padding:"10px 13px",borderRadius:9,fontSize:13,fontWeight:600,background:"#EDF5EF",color:C.green}}>✓ Datos actualizados.</div>}
        <BigBtn onClick={save} dis={!name||!nit}>Guardar →</BigBtn>
      </div>
    </Card>
  );
}

function SecurityCfg({adminPin,onSave}) {
  const [cur,  setCur]  = useState("");
  const [np,   setNp]   = useState("");
  const [cp,   setCp]   = useState("");
  const [msg,  setMsg]  = useState(null);
  function save() {
    if(cur!==adminPin) { setMsg({ok:false,t:"PIN actual incorrecto."}); return; }
    if(np.length<4)    { setMsg({ok:false,t:"El nuevo PIN debe tener al menos 4 caracteres."}); return; }
    if(np!==cp)        { setMsg({ok:false,t:"Los PINs nuevos no coinciden."}); return; }
    onSave(np); setCur(""); setNp(""); setCp("");
    setMsg({ok:true,t:"✓ PIN actualizado correctamente."}); setTimeout(function(){setMsg(null);},3000);
  }
  return (
    <Card title="Cambiar PIN de administrador">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <F label="PIN actual"><input type="password" placeholder="••••••••" value={cur} onChange={function(e){setCur(e.target.value);}}/></F>
        <div style={{height:1,background:C.gray}}/>
        <F label="Nuevo PIN"><input type="password" placeholder="Mínimo 4 caracteres" value={np} onChange={function(e){setNp(e.target.value);}}/></F>
        <F label="Confirmar nuevo PIN"><input type="password" placeholder="Repite el PIN" value={cp} onChange={function(e){setCp(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")save();}}/></F>
        {msg&&<div style={{padding:"10px 13px",borderRadius:9,fontSize:13,fontWeight:600,background:msg.ok?"#EDF5EF":"#F5EDEC",color:msg.ok?C.green:C.red}}>{msg.t}</div>}
        <BigBtn onClick={save} dis={!cur||!np||!cp}>Actualizar PIN →</BigBtn>
      </div>
    </Card>
  );
}

/* ─── Detail Modal */
function DetailModal({rep,vendors,props,onClose,onMarkPaid,onDelete,onSave,onQA}) {
  const [editing, setEditing] = useState(false);
  /* Auto-fill total from tariff if empty */
  var initAT2 = autoTarifa(rep.reportadoPor||"", vendors);
  var initTotal = rep.total||"" || initAT2.tarifa;
  const [form,    setForm]    = useState({
    propiedad:    rep.propiedad,
    fecha:        rep.fecha,
    reportadoPor: rep.reportadoPor,
    categoria:    rep.categoria,
    descripcion:  rep.descripcion,
    comentarios:  rep.comentarios||"",
    total:        initTotal,
    pagadoPor:    rep.pagadoPor||"",
    fotoAntes:    rep.fotoAntes||[],
    fotoDespues:  rep.fotoDespues||[],
    factura:      rep.factura||null,
  });
  const [saved, setSaved] = useState(false);

  function setF(k,v) { setForm(function(p){var u=Object.assign({},p);u[k]=v;return u;}); }

  function resetForm() {
    var rAT=autoTarifa(rep.reportadoPor||"",vendors);
    setForm({propiedad:rep.propiedad,fecha:rep.fecha,reportadoPor:rep.reportadoPor,categoria:rep.categoria,descripcion:rep.descripcion,comentarios:rep.comentarios||"",total:rep.total||""||rAT.tarifa,pagadoPor:rep.pagadoPor||"",fotoAntes:rep.fotoAntes||[],fotoDespues:rep.fotoDespues||[],factura:rep.factura||null});
  }

  async function addPics(files,field,max) {
    var c = await Promise.all(Array.from(files).map(function(f){return compress(f);}));
    setForm(function(p){var merged=p[field].concat(c).slice(0,max);var u=Object.assign({},p);u[field]=merged;return u;});
  }
  function rmPic(field,idx) { setForm(function(p){var u=Object.assign({},p);u[field]=p[field].filter(function(_,j){return j!==idx;});return u;}); }

  function saveEdit() {
    var updated = Object.assign({},rep,form);
    onSave(updated);
    setSaved(true);
    setEditing(false);
    setTimeout(function(){setSaved(false);},2500);
  }

  var vend = vendors&&vendors.find(function(v){return v.email===rep.reportadoPor;});
  var ph   = vend&&vend.phone ? vend.phone.replace(/\D/g,"") : "";
  var vn   = vend&&vend.name  ? vend.name : rep.reportadoPor;
  var al   = alertLvl(rep);
  var b    = BADGE[rep.categoria]||BADGE["Mantenimiento"];

  function waLink(type) {
    var base = ph ? "https://wa.me/"+ph+"?text=" : "https://wa.me/?text=";
    var txt;
    if (type==="paid") {
      txt = "Hola "+vn+"\n\nTe confirmamos que el pago por el trabajo en "+rep.propiedad+" ("+fmtDate(rep.fecha)+") por Q"+rep.total+" ya fue procesado.\n\nGracias - Spacio AM";
    } else {
      var d = daysSince(rep.createdAt||rep.id);
      txt = "Hola "+vn+"\n\nTe recordamos que el pago del trabajo en "+rep.propiedad+" ("+fmtDate(rep.fecha)+") por Q"+rep.total+" lleva "+d+" dia"+(d!==1?"s":"")+" pendiente.\n\nSpacio AM";
    }
    return base+encodeURIComponent(txt);
  }

  return (
    <Overlay onClick={onClose}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:580,maxHeight:"90vh",overflow:"auto",boxShadow:"0 32px 80px rgba(0,0,0,.22)"}} onClick={function(e){e.stopPropagation();}}>

        {/* Header */}
        <div style={{padding:"18px 24px",borderBottom:"1px solid "+C.gray,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff",zIndex:10}}>
          <div>
            <div style={{fontSize:10,color:editing?C.peach:C.earth,fontWeight:700,letterSpacing:".18em",textTransform:"uppercase",marginBottom:3}}>{editing?"Modo edición":"Detalle del trabajo"}</div>
            <div style={{fontSize:15,fontWeight:600,color:C.black}}>{rep.propiedad}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {saved&&<span style={{fontSize:11,fontWeight:700,color:C.green,background:"#EDF5EF",padding:"4px 10px",borderRadius:100}}>✓ Guardado</span>}
            {!editing&&<button onClick={function(){setEditing(true);}} style={{padding:"7px 13px",borderRadius:8,border:"1.5px solid "+C.earth,background:"none",color:C.earth,fontSize:12,fontWeight:600,cursor:"pointer"}}>✏ Editar</button>}
            {!editing&&<button onClick={onDelete} style={{padding:"7px 13px",borderRadius:8,border:"1.5px solid #e0cece",background:"none",color:C.red,fontSize:12,fontWeight:600,cursor:"pointer"}}>Eliminar</button>}
            {editing&&<button onClick={function(){setEditing(false);resetForm();}} style={{padding:"7px 13px",borderRadius:8,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,fontWeight:600,cursor:"pointer"}}>Cancelar</button>}
            {editing&&<button onClick={saveEdit} style={{padding:"7px 13px",borderRadius:8,border:"none",background:C.peach,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Guardar cambios →</button>}
            {!editing&&<button onClick={onClose} style={{padding:"7px 13px",borderRadius:8,border:"none",background:C.black,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Cerrar</button>}
          </div>
        </div>

        <div style={{padding:"22px 24px",display:"flex",flexDirection:"column",gap:18}}>

          {/* ── EDIT MODE ── */}
          {editing&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{background:"#FEF0EC",borderRadius:10,padding:"10px 14px",fontSize:12.5,color:C.peach,fontWeight:600}}>✏ Editando registro — los cambios se guardan al presionar "Guardar cambios"</div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <F label="Propiedad">
                  <select value={form.propiedad} onChange={function(e){setF("propiedad",e.target.value);}}>
                    {props&&props.map(function(p){return <option key={p.id}>{p.name}</option>;})}
                    {!(props&&props.some(function(p){return p.name===form.propiedad;}))&&<option>{form.propiedad}</option>}
                  </select>
                </F>
                <F label="Fecha">
                  <input type="date" value={form.fecha} onChange={function(e){setF("fecha",e.target.value);}}/>
                </F>
              </div>

              <F label="Proveedor / Técnico responsable">
                <select value={form.reportadoPor} onChange={function(e){
                    var email = e.target.value;
                    setF("reportadoPor",email);
                    var at = autoTarifa(email, vendors);
                    if(at.tarifa) setF("total",at.tarifa);
                  }}>
                  {vendors&&vendors.map(function(v){return <option key={v.id} value={v.email}>{vendorDisplay(v)} ({v.email})</option>;})}
                  {!(vendors&&vendors.some(function(v){return v.email===form.reportadoPor;}))&&<option value={form.reportadoPor}>{form.reportadoPor}</option>}
                </select>
              </F>

              <div>
                <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:10}}>Categoría</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {CATS.map(function(c){var bx=BADGE[c];var s=form.categoria===c;return <button key={c} onClick={function(){setF("categoria",c);}} style={{padding:"7px 14px",borderRadius:100,cursor:"pointer",border:"1.5px solid "+(s?bx.tx:C.gray),background:s?bx.bg:"#fff",color:s?bx.tx:C.earth,fontSize:12.5,fontWeight:600,transition:"all .18s"}}>{c}</button>;})}
                </div>
              </div>

              <F label="Descripción / Trabajo realizado">
                <textarea rows={4} value={form.descripcion} onChange={function(e){setF("descripcion",e.target.value);}}/>
              </F>

              <F label="Notas / Comentarios internos">
                <textarea rows={3} placeholder="Observaciones, materiales usados, pendientes…" value={form.comentarios} onChange={function(e){setF("comentarios",e.target.value);}}/>
              </F>

              {(function(){
                var at = autoTarifa(form.reportadoPor, vendors);
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase",flex:1}}>Total cobrado (Q)</div>
                      {at.locked&&<span style={{fontSize:10,color:C.green,fontWeight:600}}>Tarifa fija: Q{at.tarifa}</span>}
                    </div>
                    <input type="number" placeholder="Ej. 850" value={form.total} onChange={function(e){setF("total",e.target.value);}}
                      style={{border:"1.5px solid "+(at.locked&&form.total===at.tarifa?"#c8dfc8":C.gray),borderRadius:8,padding:"10px 14px",fontSize:14,fontFamily:"Montserrat,sans-serif",outline:"none",fontWeight:at.locked&&form.total===at.tarifa?700:400,color:at.locked&&form.total===at.tarifa?C.green:C.black}}/>
                    {at.locked&&form.total!==at.tarifa&&form.total!==""&&<div style={{fontSize:11,color:"#7a6000"}}>⚠ Modificado — tarifa fija es Q{at.tarifa}</div>}
                  </div>
                );
              })()}

              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase"}}>¿Quién paga este trabajo?</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {["Spacio AM","Dueño"].map(function(v){
                    var colors={"Spacio AM":{bg:"#EEF3FA",tx:"#4a7fa5",bd:"#4a7fa5"},"Dueño":{bg:"#FEF0EC",tx:"#E9826A",bd:"#E9826A"}};
                    var cx=colors[v]; var s=form.pagadoPor===v;
                    return <button key={v} onClick={function(){setF("pagadoPor",s?"":v);}} style={{padding:"8px 18px",borderRadius:100,cursor:"pointer",border:"1.5px solid "+(s?cx.bd:C.gray),background:s?cx.bg:"#fff",color:s?cx.tx:C.earth,fontSize:13,fontWeight:600,transition:"all .18s"}}>{s?"✓ ":""}{v}</button>;
                  })}
                  {form.pagadoPor&&<button onClick={function(){setF("pagadoPor","");}} style={{padding:"8px 14px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.gray,fontSize:12,cursor:"pointer"}}>✕ Sin clasificar</button>}
                </div>
              </div>

              {!isCleaning(rep.categoria)&&(
                <div style={{borderTop:"1px solid "+C.gray,paddingTop:16,display:"flex",flexDirection:"column",gap:16}}>
                  <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase"}}>Evidencia fotográfica</div>
                  <PicUp label="ANTES"   max={2} photos={form.fotoAntes}   accent={C.earth} onAdd={function(f){addPics(f,"fotoAntes",2);}}   onDel={function(i){rmPic("fotoAntes",i);}}/>
                  <div style={{height:1,background:C.gray}}/>
                  <PicUp label="DESPUÉS" max={3} photos={form.fotoDespues} accent={C.peach} onAdd={function(f){addPics(f,"fotoDespues",3);}} onDel={function(i){rmPic("fotoDespues",i);}}/>
                </div>
              )}
              {!isCleaning(rep.categoria)&&(
                <div style={{borderTop:"1px solid "+C.gray,paddingTop:16,display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase"}}>Factura</div>
                  <InvoiceUp
                    factura={form.factura}
                    onAdd={function(file){var r=new FileReader();r.onload=function(ev){setF("factura",{name:file.name,type:file.type,data:ev.target.result});};r.readAsDataURL(file);}}
                    onDel={function(){setF("factura",null);}}
                  />
                </div>
              )}
              {isCleaning(rep.categoria)&&(
                <div style={{borderTop:"1px solid "+C.gray,paddingTop:16}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase",marginBottom:12}}>Fotos de la limpieza</div>
                  <CleaningPhotoGallery rep={rep}/>
                </div>
              )}

              <button onClick={saveEdit} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:C.black,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:".05em"}}>Guardar cambios →</button>
            </div>
          )}

          {/* ── VIEW MODE ── */}
          {!editing&&(
            <div style={{display:"flex",flexDirection:"column",gap:18}}>
              {al&&<div style={{background:ALT[al].bg,borderRadius:10,padding:"10px 14px",fontSize:13,fontWeight:600,color:ALT[al].clr}}>⚠ {ALT[al].label}</div>}
              <ExecSummary rep={rep} vendors={vendors}/>
              <div><div style={{fontSize:10,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>Categoría</div><span style={{padding:"5px 13px",borderRadius:100,fontSize:12,fontWeight:700,background:b.bg,color:b.tx}}>{rep.categoria}</span></div>
              <div><div style={{fontSize:10,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>Trabajo realizado</div><div style={{fontSize:14,color:C.black,lineHeight:1.65,background:C.beige,padding:"13px 15px",borderRadius:10}}>{rep.descripcion}</div></div>
              {rep.comentarios&&<div><div style={{fontSize:10,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>Notas / Comentarios</div><div style={{fontSize:13.5,color:C.earth,lineHeight:1.65,background:C.beige,padding:"11px 14px",borderRadius:10}}>{rep.comentarios}</div></div>}
              {/* ── Cleaning: full photo gallery organized by section */}
              {isCleaning(rep.categoria)&&<CleaningPhotoGallery rep={rep}/>}
              {/* ── Non-cleaning: simple before/after */}
              {!isCleaning(rep.categoria)&&rep.fotoAntes&&rep.fotoAntes.length>0&&<PicsRow title="Fotos ANTES" photos={rep.fotoAntes}/>}
              {!isCleaning(rep.categoria)&&rep.fotoDespues&&rep.fotoDespues.length>0&&<PicsRow title="Fotos DESPUÉS" photos={rep.fotoDespues} accent={C.peach}/>}
              {/* ── Inventory summary */}
              {isCleaning(rep.categoria)&&rep.inventario&&rep.inventario.length>0&&(
                <InventorySummary inventario={rep.inventario}/>
              )}
              {/* ── Damage summary */}
              {isCleaning(rep.categoria)&&rep.hayDanios&&rep.danios&&rep.danios.length>0&&(
                <DamageSummary danios={rep.danios}/>
              )}
              {isCleaning(rep.categoria)&&!rep.hayDanios&&(
                <div style={{padding:"10px 14px",borderRadius:8,background:"#EDF5EF",fontSize:13,color:C.green,fontWeight:600}}>✓ Sin daños reportados</div>
              )}
              {rep.factura ? (
                <div>
                  <div style={{fontSize:10,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:10}}>Factura adjunta</div>
                  {rep.factura.type&&rep.factura.type.startsWith("image/")
                    ? <img src={rep.factura.data} alt="factura" style={{width:"100%",maxHeight:280,objectFit:"contain",borderRadius:10,border:"1px solid "+C.gray}}/>
                    : <a href={rep.factura.data} download={rep.factura.name} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"11px 16px",borderRadius:10,background:C.beige,border:"1px solid "+C.gray,color:C.black,fontSize:13,fontWeight:600,textDecoration:"none"}}>📄 {rep.factura.name}</a>}
                </div>
              ) : <div style={{fontSize:12,color:C.gray,padding:"10px 14px",borderRadius:9,border:"1px dashed "+C.gray,textAlign:"center"}}>Sin factura adjunta</div>}
              {isCleaning(rep.categoria)&&<QASection rep={rep} onQA={onQA}/>}
              {rep.total&&(
                <div style={{borderTop:"1px solid "+C.gray,paddingTop:16}}>
                  <div style={{fontSize:10,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:10}}>Estado de pago</div>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                    <div style={{flex:1,padding:"11px 14px",borderRadius:10,background:rep.paid?"#EDF5EF":"#F5EDEC",fontSize:14,fontWeight:700,color:rep.paid?C.green:C.red}}>{rep.paid?"✓ Pagado":"● Pendiente"}</div>
                    <button onClick={function(){onMarkPaid(!rep.paid);}} style={{padding:"11px 16px",borderRadius:10,border:"1.5px solid "+C.gray,background:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer",color:C.black,whiteSpace:"nowrap"}}>{rep.paid?"Marcar pendiente":"Marcar pagado ✓"}</button>
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>¿Quién paga este trabajo?</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {["Spacio AM","Dueño"].map(function(v){
                        var colors={"Spacio AM":{bg:"#EEF3FA",tx:"#4a7fa5"},"Dueño":{bg:"#FEF0EC",tx:"#E9826A"}};
                        var cx=colors[v]; var s=rep.pagadoPor===v;
                        return <button key={v} onClick={function(){onSave(Object.assign({},rep,{pagadoPor:s?"":v}));}} style={{padding:"7px 16px",borderRadius:100,cursor:"pointer",border:"1.5px solid "+(s?cx.tx:C.gray),background:s?cx.bg:"#fff",color:s?cx.tx:C.earth,fontSize:12.5,fontWeight:600,transition:"all .18s"}}>{s?"✓ ":""}{v}</button>;
                      })}
                    </div>
                    {!rep.pagadoPor&&<div style={{fontSize:11,color:C.earth,marginTop:6}}>Sin clasificar — selecciona quién cubre este trabajo.</div>}
                  </div>
                  {!ph&&<div style={{fontSize:12,color:C.earth,background:C.beige,padding:"9px 12px",borderRadius:8,marginBottom:8}}>💡 Agrega el número del proveedor en Configuración para enviar por WhatsApp.</div>}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <a href={waLink("paid")} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:10,background:"#25D366",color:"#fff",fontSize:12.5,fontWeight:600,textDecoration:"none"}}>💬 Confirmar pago</a>
                    {!rep.paid&&<a href={waLink("reminder")} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:10,background:"#F2F0EC",border:"1.5px solid "+C.orange,color:C.orange,fontSize:12.5,fontWeight:600,textDecoration:"none"}}>⏰ Recordatorio de cobro</a>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

/* ═══ VENDOR APP */
function VendorApp({vendor,allVendors,reps,props,company,schedules,hospUrlDay,hospUrlWeek,adelantos,onSvAdelantos,onSubmit,onUpdate,onSvV,onSvFeedback,onLogout}) {
  const [view,setView] = useState("jobs");
  var tot=reps.reduce(function(s,r){return s+parseFloat(r.total||0);},0);
  var cob=reps.filter(function(r){return r.paid;}).reduce(function(s,r){return s+parseFloat(r.total||0);},0);
  var pnd=reps.filter(function(r){return r.total&&!r.paid;});
  var cleaningReps = reps.filter(function(r){return isCleaning(r.categoria);});
  var pendingCorrections = cleaningReps.filter(function(r){return r.qaStatus==="correccion";}).length;

  async function vendorRespond(repId, response) {
    var r = reps.find(function(x){return x.id===repId;}); if(!r) return;
    var upd = Object.assign({},r,{qaStatus:response,qaRespuesta:response,qaRespuestaFecha:todayStr()});
    if(onUpdate) await onUpdate(upd);
  }
  return (
    <div style={{background:C.alabaster,minHeight:"100vh",fontFamily:"Montserrat,sans-serif"}}>
      <GS/>
      <ResponsiveHeader
        tab={view} setTab={setView}
        alertCount={0}
        navItems={(function(){
    var isInternal = vendor.tipo==="interno";
    var navItems = [["jobs","Mis trabajos","list"],["new","Nuevo reporte","edit"]];
    if(isInternal) navItems.push(["sched","Programa","calendar"]);
    if(isInternal) navItems.push(["hist","Calidad","star"]);
    if(isEpiLimpieza(vendor)) navItems.push(["adv","Adelanto","coins"]);
    navItems.push(["account","Cuenta","user"]);
    return navItems;
  })()}
        onLogout={onLogout}
        role={vendorDisplay(vendor)}
      />
      <div style={{display:view==="jobs"   ?"block":"none"}}><VendorJobsView reps={reps} tot={tot} cob={cob} pnd={pnd} adelantos={adelantos} pendingCorrections={pendingCorrections} onNew={function(){setView("new");}} vendor={vendor} allVendors={allVendors}/></div>
      <div style={{display:view==="new"    ?"block":"none"}}><RepForm vendors={allVendors||[]} props={props} company={company} defaultVendor={vendor.email} onSubmit={async function(r){await onSubmit(r);setView("jobs");}} onSaveFeedback={function(fb){onSvFeedback&&onSvFeedback(fb);}}/></div>
      <div style={{display:view==="sched"  ?"block":"none"}}><VendorSchedule vendor={vendor} schedules={schedules} hospUrlDay={hospUrlDay} hospUrlWeek={hospUrlWeek}/></div>
      <div style={{display:view==="hist"   ?"block":"none"}}><VendorHistory reps={cleaningReps} onRespond={vendorRespond}/></div>
      <div style={{display:view==="account"?"block":"none"}}><VendorAccount vendor={vendor} allVendors={allVendors} onSvV={onSvV}/></div>
      {isEpiLimpieza(vendor)&&<div style={{display:view==="adv"?"block":"none"}}><AdvanceRequest vendor={vendor} reps={reps} adelantos={adelantos} onSvAdelantos={onSvAdelantos}/></div>}
    </div>
  );
}



/* ─── Vendor Jobs View — with filters */
function VendorJobsView({reps, tot, cob, pnd, adelantos, pendingCorrections, onNew, vendor, allVendors}) {
  const [fCat,    setFCat]    = useState("Todos");
  const [fStatus, setFStatus] = useState("Todos");
  const [fDesde,  setFDesde]  = useState("");
  const [fHasta,  setFHasta]  = useState("");
  const [showAll, setShowAll] = useState(false);

  function applyPreset(val) {
    var r = presetRange(val); setFDesde(r.from); setFHasta(r.to);
  }

  function reset() { setFCat("Todos"); setFStatus("Todos"); setFDesde(""); setFHasta(""); setShowAll(false); }

  var fReps = reps.filter(function(r) {
    if (fCat!=="Todos"&&r.categoria!==fCat) return false;
    if (fStatus==="✓ Pagado"&&!(r.paid&&r.total)) return false;
    if (fStatus==="● Pendiente"&&(r.paid||!r.total)) return false;
    if (fDesde&&r.fecha<fDesde) return false;
    if (fHasta&&r.fecha>fHasta) return false;
    return true;
  });
  var shown  = showAll ? fReps : fReps.slice(0,15);
  var actF   = [fCat!=="Todos",fStatus!=="Todos",!!fDesde,!!fHasta].filter(Boolean).length;

  var IS  = {border:"1px solid "+C.gray,borderRadius:6,padding:"7px 10px",fontSize:12.5,fontFamily:"Montserrat,sans-serif",outline:"none",background:"#fff",color:C.black,width:"100%",minHeight:40};
  var ISA = Object.assign({},IS,{border:"1.5px solid "+C.black,fontWeight:600});
  var LBL = {fontSize:9,fontWeight:600,color:C.earth,letterSpacing:".2em",textTransform:"uppercase",display:"block",marginBottom:5};

  return (
    <div style={{maxWidth:640,margin:"0 auto",padding:"0 0 100px"}}>
      {/* Stats */}
      {(function(){
        var miAdv=(adelantos||[]).find(function(a){return a.vendorEmail===vendor.email && a.status==="activo";});
        var stAdv= miAdv ? advanceState(miAdv, reps) : null;
        var advSem = stAdv ? stAdv.weeklyCharge : 0;
        var wk = splitPayableWeeks(reps);
        var neto = Math.max(0, wk.prev.porCobrar - advSem);
        return (
          <StatsSummary
            heroLabel="Neto a recibir"
            heroValue={"Q"+Math.round(neto).toLocaleString()}
            heroGreen={neto>0}
            enCursoCount={wk.cur.reps.length}
            enCursoMonto={wk.cur.monto}
            items={[
              {label:"Mis trabajos", value:wk.prev.pndCount, sub:"pendientes"},
              {label:"Facturado", value:"Q"+Math.round(wk.prev.porCobrar).toLocaleString(), sub:"sin pagar"},
              {label:"Cobrado", value:"Q"+Math.round(wk.prev.cob).toLocaleString(), green:true},
              (advSem>0?{label:"Adelanto / sem", value:"−Q"+advSem.toLocaleString(), peach:true, sub:"saldo Q"+stAdv.saldo.toLocaleString()}:null),
            ]}
          />
        );
      })()}

      {/* Correction alert */}
      {pendingCorrections>0&&(
        <div style={{background:"#F5EDEC",padding:"13px 16px",borderBottom:"1.5px solid #DBC8C4"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:3}}>⚠ {pendingCorrections} limpieza{pendingCorrections!==1?"s":""} requiere{pendingCorrections===1?"":"n"} corrección</div>
          <div style={{fontSize:11.5,color:C.earth}}>Revisa la pestaña ★ Calidad para responder.</div>
        </div>
      )}

      {/* Filters */}
      <div style={{background:"#fff",padding:"14px 16px",borderBottom:"1px solid "+C.line}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <span style={LBL}>Categoría</span>
            <select value={fCat} onChange={function(e){setFCat(e.target.value);setShowAll(false);}} style={fCat!=="Todos"?ISA:IS}>
              {(function(){
                var isEPIL = vendor&&vendor.tipo==="interno"&&vendor.categoria==="EPI Limpieza";
                var isEPIM = vendor&&vendor.tipo==="interno"&&vendor.categoria==="EPI Mantenimiento";
                var cats = isEPIL
                  ? ["Todos","Limpieza tradicional","Limpieza profunda","Ajuste","Reporte de Daños"]
                  : isEPIM
                  ? ["Todos","Mantenimiento","Nuevo Producto","Ajuste","Reporte de Daños"]
                  : ["Todos"].concat(CATS);
                return cats.map(function(c){return <option key={c}>{c}</option>;});
              })()}
            </select>
          </div>
          <div>
            <span style={LBL}>Estado de pago</span>
            <select value={fStatus} onChange={function(e){setFStatus(e.target.value);setShowAll(false);}} style={fStatus!=="Todos"?ISA:IS}>
              <option>Todos</option><option>✓ Pagado</option><option>● Pendiente</option>
            </select>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,alignItems:"flex-end"}}>
          <div>
            <span style={LBL}>Período rápido</span>
            <select onChange={function(e){applyPreset(e.target.value);e.target.value="";}} style={IS} defaultValue="">
              <option value="" disabled>Seleccionar…</option>
              <option value="hoy">Hoy</option>
              <option value="semana">Semana en curso</option>
              <option value="semana_ant">Semana anterior</option>
              <option value="mes">Este mes</option>
              <option value="3meses">Últimos 3 meses</option>
              <option value="todo">Todo</option>
            </select>
          </div>
          <div>
            <span style={LBL}>Período</span>
            <DateRangePicker from={fDesde} to={fHasta} baseStyle={IS} activeStyle={ISA} onChange={function(a,b){setFDesde(a);setFHasta(b);setShowAll(false);}}/>
          </div>
        </div>
        {actF>0&&<button onClick={reset} style={{marginTop:10,padding:"6px 14px",borderRadius:6,border:"1px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>✕ Limpiar filtros <span style={{background:C.peach,color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{actF}</span></button>}
      </div>

      {/* List */}
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {fReps.length===0&&(
          <div style={{textAlign:"center",padding:"48px 20px",color:C.earth,fontSize:13}}>
            Sin resultados.{actF>0&&<><br/><button onClick={reset} style={{marginTop:12,padding:"9px 20px",borderRadius:6,border:"1px solid "+C.gray,background:"#fff",color:C.black,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Limpiar filtros</button></>}
            {!actF&&reps.length===0&&<><br/><button onClick={onNew} style={{marginTop:14,padding:"10px 24px",borderRadius:6,border:"none",background:C.black,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>Crear primer reporte →</button></>}
          </div>
        )}
        {shown.map(function(r) {
          var b  = BADGE[r.categoria]||BADGE["Mantenimiento"];
          var qa = r.qaStatus;
          var qaColors = {correccion:{bg:"#F5EDEC",tx:C.red,label:"⚠ Corrección"},aprobada:{bg:"#EDF5EF",tx:C.green,label:"✓ Aprobada"},pendiente:{bg:"#F0F0EE",tx:C.taupe,label:"En revisión"}};
          var qac = isCleaning(r.categoria)&&qa ? qaColors[qa]||null : null;
          return (
            <div key={r.id} style={{background:"#fff",borderRadius:10,padding:"15px 16px",border:"1px solid "+(qa==="correccion"?"#DBC8C4":C.line),boxShadow:qa==="correccion"?"0 2px 8px rgba(155,58,58,.06)":"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:C.black,marginBottom:4}}>{r.propiedad}</div>
                  <span style={{padding:"2px 8px",borderRadius:20,fontSize:9.5,fontWeight:700,textTransform:"uppercase",background:b.bg,color:b.tx}}>{r.categoria}</span>
                  {qac&&<span style={{marginLeft:6,padding:"2px 8px",borderRadius:20,fontSize:9.5,fontWeight:700,background:qac.bg,color:qac.tx}}>{qac.label}</span>}
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                  <div style={{fontSize:15,fontWeight:700,color:r.total?C.black:C.gray}}>{r.total?"Q"+r.total:"—"}</div>
                  {r.total&&<div style={{fontSize:10,fontWeight:700,marginTop:4,padding:"2px 8px",borderRadius:5,background:r.paid?"#EDF5EF":"#F5EDEC",color:r.paid?C.green:C.red}}>{r.paid?"✓ Pagado":"● Pendiente"}</div>}
                </div>
              </div>
              <div style={{fontSize:12.5,color:C.earth,lineHeight:1.5,marginBottom:5}}>{r.descripcion&&r.descripcion.slice(0,80)}{r.descripcion&&r.descripcion.length>80?"…":""}</div>
              <div style={{fontSize:11,color:C.taupe}}>{fmtDate(r.fecha)}</div>
            </div>
          );
        })}
        {fReps.length>15&&<button onClick={function(){setShowAll(function(p){return !p;});}} style={{padding:"12px",borderRadius:8,border:"1px solid "+C.gray,background:"#fff",color:C.earth,fontSize:13,fontWeight:600,cursor:"pointer"}}>{showAll?"Ver menos":"Ver todos los "+fReps.length+" registros →"}</button>}
      </div>
    </div>
  );
}


/* ─── Vendor History — Historial de calidad de limpiezas */
function VendorHistory({reps, onRespond}) {
  var cleanReps = (reps||[]).filter(function(r){return isCleaning(r.categoria);})
    .sort(function(a,b){return (b.createdAt||b.id)-(a.createdAt||a.id);});

  var pendCnt = cleanReps.filter(function(r){return r.qaStatus==="correccion";}).length;

  var qaLabel = {
    pendiente:  {label:"En revisión", bg:"#F0F0EE", tx:C.taupe},
    aprobada:   {label:"✓ Aprobada",  bg:"#EDF5EF", tx:C.green},
    correccion: {label:"⚠ Corrección",bg:"#F5EDEC", tx:C.red},
    corregido:  {label:"✓ Corregida", bg:"#EDF5EF", tx:C.green},
    futuro:     {label:"→ A futuro",  bg:"#EDEAE3", tx:C.taupe},
  };

  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"22px 16px 100px",fontFamily:"Montserrat,sans-serif"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9.5,color:C.earth,fontWeight:700,letterSpacing:".24em",textTransform:"uppercase",marginBottom:6}}>Historial de Calidad</div>
        <div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:24,fontWeight:400,color:C.black}}>Revisiones de limpieza</div>
      </div>

      {pendCnt>0&&(
        <div style={{background:"#F5EDEC",borderRadius:8,padding:"14px 16px",marginBottom:18,border:"1.5px solid #DBC8C4"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:4}}>⚠ {pendCnt} corrección{pendCnt!==1?"es":""} pendiente{pendCnt!==1?"s":""}</div>
          <div style={{fontSize:12,color:C.earth}}>Responde a los comentarios del administrador abajo.</div>
        </div>
      )}

      {cleanReps.length===0&&(
        <div style={{textAlign:"center",padding:"52px 20px",color:C.taupe,fontSize:13}}>
          No hay limpiezas registradas aún.
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {cleanReps.map(function(r){
          var ql  = qaLabel[r.qaStatus] || qaLabel["pendiente"];
          var isCorr = r.qaStatus==="correccion";
          return (
            <div key={r.id} style={{background:"#fff",borderRadius:10,border:"1.5px solid "+(isCorr?"#DBC8C4":C.line),overflow:"hidden",boxShadow:isCorr?"0 2px 8px rgba(155,58,58,.08)":"none"}}>
              {/* Header row */}
              <div style={{padding:"13px 16px",borderBottom:"1px solid "+C.line,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <div>
                  <div style={{fontSize:13.5,fontWeight:600,color:C.black}}>{r.propiedad}</div>
                  <div style={{fontSize:11,color:C.taupe,marginTop:2}}>{fmtDate(r.fecha)} · {r.categoria}</div>
                </div>
                <span style={{padding:"4px 10px",borderRadius:100,fontSize:11,fontWeight:700,background:ql.bg,color:ql.tx}}>{ql.label}</span>
              </div>

              {/* Admin comment */}
              {r.qaComentario&&(
                <div style={{padding:"12px 16px",background:C.surfaceWarm,borderBottom:"1px solid "+C.line}}>
                  <div style={{fontSize:9.5,color:C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:5}}>Comentario del admin</div>
                  <div style={{fontSize:13,color:C.black,lineHeight:1.6}}>{r.qaComentario}</div>
                </div>
              )}

              {/* Vendor response buttons — only when correction pending */}
              {isCorr&&(
                <div style={{padding:"12px 16px",display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={function(){onRespond(r.id,"corregido");}} style={{flex:1,minWidth:140,padding:"11px 12px",borderRadius:7,border:"none",background:C.black,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:".04em"}}>
                    ✓ Corrección realizada
                  </button>
                  <button onClick={function(){onRespond(r.id,"futuro");}} style={{flex:1,minWidth:140,padding:"11px 12px",borderRadius:7,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:".04em"}}>
                    → Lo tomo en cuenta
                  </button>
                </div>
              )}

              {/* Response shown */}
              {(r.qaStatus==="corregido"||r.qaStatus==="futuro")&&(
                <div style={{padding:"10px 16px",background:qaLabel[r.qaStatus].bg}}>
                  <span style={{fontSize:11,fontWeight:700,color:qaLabel[r.qaStatus].tx}}>
                    {r.qaStatus==="corregido"?"Tu respuesta: Corrección realizada":"Tu respuesta: Tomado en cuenta para próximas limpiezas"}
                  </span>
                  {r.qaRespuestaFecha&&<span style={{fontSize:10,color:C.taupe,marginLeft:8}}>{fmtDate(r.qaRespuestaFecha)}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VendorAccount({vendor,allVendors,onSvV}) {
  /* Contact info */
  const [phone,   setPhone]   = useState(vendor.phone||"");
  const [email,   setEmail]   = useState(vendor.email||"");
  const [ctMsg,   setCtMsg]   = useState(null);

  /* Password change */
  const [cur,  setCur]  = useState("");
  const [np,   setNp]   = useState("");
  const [cp,   setCp]   = useState("");
  const [pwMsg,setPwMsg]= useState(null);

  function saveContact() {
    if (!email.trim()) { setCtMsg({ok:false,t:"El correo no puede estar vacío."}); return; }
    /* Check email not used by another vendor */
    var conflict = allVendors.find(function(v){return v.id!==vendor.id&&v.email.toLowerCase()===email.toLowerCase().trim();});
    if (conflict) { setCtMsg({ok:false,t:"Ese correo ya está en uso por otro usuario."}); return; }
    onSvV(allVendors.map(function(v){if(v.id===vendor.id){return Object.assign({},v,{phone:phone.trim(),email:email.trim()});}return v;}));
    vendor.phone=phone.trim(); vendor.email=email.trim();
    setCtMsg({ok:true,t:"✓ Datos de contacto actualizados."}); setTimeout(function(){setCtMsg(null);},3000);
  }

  function savePass() {
    if(cur!==vendor.password) { setPwMsg({ok:false,t:"Contraseña actual incorrecta."}); return; }
    if(np.length<6) { setPwMsg({ok:false,t:"Mínimo 6 caracteres."}); return; }
    if(np!==cp) { setPwMsg({ok:false,t:"Las contraseñas no coinciden."}); return; }
    onSvV(allVendors.map(function(v){if(v.id===vendor.id){var u=Object.assign({},v);u.password=np;return u;}return v;}));
    vendor.password=np; setCur(""); setNp(""); setCp("");
    setPwMsg({ok:true,t:"✓ Contraseña actualizada."}); setTimeout(function(){setPwMsg(null);},3000);
  }

  return (
    <div style={{maxWidth:480,margin:"0 auto",padding:"28px 18px 100px",fontFamily:"Montserrat,sans-serif",display:"flex",flexDirection:"column",gap:18}}>
      {/* Header */}
      <div>
        <div style={{fontSize:9.5,fontWeight:600,color:C.earth,letterSpacing:".28em",textTransform:"uppercase",marginBottom:8}}>Mi cuenta</div>
        <div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:26,fontWeight:400,color:C.black}}>{vendorDisplay(vendor)}</div>
        {vendor.tipo&&<div style={{fontSize:11.5,color:C.taupe,marginTop:3}}>{vendorTipo(vendor)}</div>}
      </div>

      {/* Contact info — editable by all */}
      <Card title="Datos de contacto">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <F label="Correo electrónico">
            <input type="email" placeholder="tu@correo.com" value={email} onChange={function(e){setEmail(e.target.value);}}/>
          </F>
          <F label="WhatsApp / Teléfono">
            <input type="tel" placeholder="+502 9999 9999" value={phone} onChange={function(e){setPhone(e.target.value);}}/>
          </F>
          {ctMsg&&<div style={{padding:"10px 13px",borderRadius:8,fontSize:13,fontWeight:600,background:ctMsg.ok?"#EDF5EF":"#F5EDEC",color:ctMsg.ok?C.green:C.red}}>{ctMsg.t}</div>}
          <BigBtn onClick={saveContact} dis={!email.trim()}>Guardar datos de contacto →</BigBtn>
        </div>
      </Card>

      {/* Password change */}
      <Card title="Cambiar contraseña">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <F label="Contraseña actual"><input type="password" placeholder="••••••••" value={cur} onChange={function(e){setCur(e.target.value);}}/></F>
          <div style={{height:1,background:C.gray}}/>
          <F label="Nueva contraseña"><input type="password" placeholder="Mínimo 6 caracteres" value={np} onChange={function(e){setNp(e.target.value);}}/></F>
          <F label="Confirmar nueva contraseña"><input type="password" placeholder="Repite la contraseña" value={cp} onChange={function(e){setCp(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")savePass();}}/></F>
          {pwMsg&&<div style={{padding:"10px 13px",borderRadius:8,fontSize:13,fontWeight:600,background:pwMsg.ok?"#EDF5EF":"#F5EDEC",color:pwMsg.ok?C.green:C.red}}>{pwMsg.t}</div>}
          <BigBtn onClick={savePass} dis={!cur||!np||!cp}>Actualizar contraseña →</BigBtn>
        </div>
      </Card>
    </div>
  );
}

/* ═══ SHARED */

/* ═══ LOGO COMPONENTS — official brand images ═══════════════════════════ */
var LOGO_WORDMARK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlgAAAFRCAYAAACogdOJAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAABySElEQVR42u2dd3hUZfr+75k500tCEkJoIbSAdJHeRUpQcC1fey+4KoqrawV3FXFdV8UCrgqKuuuuq2JHpIQQQu8tdJBQkpDepvffH7vv+U1CIJOQMgn357pyiZBMZs457/Pe71MVTqczCEIIIYQQUm8oeQkIIYQQQiiwCCGEEEIosAghhBBCKLAIIYQQQggFFiGEEEIIBRYhhBBCCAUWIYQQQgihwCKEEEIIocAihBBCCKHAIoQQQgghFFiEEEIIIRRYhBBCCCEUWIQQQgghFFiEEEIIIYQCixBCCCGEAosQQgghhAKLEEIIIYRQYBFCCCGEUGARQgghhFBgEUIIIYQQCixCCCGEEAosQgghhBAKLEIIIYQQQoFFCCGEEEKBRQghhBBCgUUIIYQQQoFFCCGEEEIosAghhBBCKLAIIYQQQiiwCCGEEEIIBRYhhBBCCAUWIYQQQggFFiGEEEIIocAihBBCCKHAIoQQQgihwCKEEEIIIRRYhBBCCCEUWIQQQgghFFiEEEIIIRRYhBBCCCGEAosQQgghhAKLEEIIIYQCixBCCCGEUGARQgghhFBgEUIIIYRQYBFCCCGEEAosQgghhBAKLEIIIYQQCixCCCGEEEKBRQghhBBCgUUIIYQQQoFFCCGEEEKBRQghhBBCKLAIIS0YhUIBl8sFl8sFpZJmixAS+Ui8BISQiD8JKpXw+/28EISQ5mO3eAkIIZFMMBiEUqmE3W5HeXk5VCoVgsEgLwwhhAKLEEIuRmCpVCrk5uYiPz+fAosQ0ixgiJAQ0izweDzweDy8EIQQCixCCLlYhLeqsLBQFlj0YBFCKLAIIaQesFqt8Pl8vBCEEAosQgipLxwOBxwOBy8EIYQCixBC6ovCwkIUFxcD+G9fLEIIocAihJA6IsRUXl4e7HY7AoEABRYhJOJhmwZCSGQbKaUSXq8XNpsNVqsVbrcbSqWSie6EEAosQgipC6IHltVqRUVFBYqLi5Gbmwu1Wk2BRQihwCKEkLoKLLVajTNnzqCkpAQejwe5ubmcR0gIocAihJCLEVgAcObMGXi9XgQCARw+fLjSvxFCCAUWIYTUgczMTAQCAUiSJP+ZXixCCAUWIYTUAUmS4HA4sH//fkiSBLVajSNHjuDs2bPQaDT0YhFCKLAIIaQ2BAIBaDQaHDp0CFlZWdBqtZAkCUVFRdiyZQtUKhUCgQAvFCGEAosQQsIlGAxCoVBg5cqV8Hg8cmsGtVqN5cuXy39HCCEUWIQQEgaBQAA6nQ4nTpzA6tWrYTQaEQgEEAgEYDAYsHfvXqxduxZ6vZ7zCQkhFFiEEFITIq9KpVLhww8/hM1mg0qlkv8+GAxCo9Fg4cKFKC0thVarZaiQEEKBRQgh50MIJYPBgE8++QTp6ekwm82VBFQwGIROp8Pp06fx6quvQqFQQK1Ww+/38wISQiIGhdPpZBkOIaTJCAaD8nxBg8GAQCCARYsW4bPPPoPBYDhvpaBKpUJ5eTnGjx+PF198ERaLBQ6HA8FgEEqlkvMKCSEUWISQS0dMhYb6FAoFNBoNJOm/c+f37duHjz/+GJs3b4bFYqn0/ecTWVarFZ07d8ajjz6K0aNHQ6lUwufzwePxyL9DfBFCCAUWIaRZCqjq/isEjkqlglqtriR28vPzsXfvXqSmpmLLli3weDwwmUxhh/xUKhWcTicCgQAGDRqEq6++GoMGDUJ8fLz8PX6/Hz6fT06Ulw1gFeFFEUYIocAihESOIQkRUAqFotr2CT6fD06nE2fPnkVeXh4OHz6MQ4cO4dixYygoKAAAGI1GKBSKWieti99nt9sRCATQpk0b9OzZE/369UNycjLat2+PuLg46HS6akWUEF5VBRghhFBgEUKajEAgAJfLBYfDAZfLBavViuLiYhQVFaGsrAy5ubkoLCxEaWkpCgsL4XA44PP5oFQqodFooFar5de5GITQ8nq9cLvdcsWhxWJBfHw8WrVqhXbt2iEhIQFmsxmtW7dGq1atYDAYoNPpoNfroVaroVKpeFMJIRRYhJCmFVf5+fnIzs7G/v37kZ+fj4KCAlRUVKC8vBw2mw02mw1+v1/OiZIkSRZWQhQFAoF6GX2jVCqhVCoRCATg8Xjg8XjkQdFKpRKSJMFkMsFsNiM6OhqtWrVCbGws2rZti969e6Nt27aIj4+HJEkcxUMIocAihDQdSqVSDg+KEF8wGJQ9ScXFxSgvL0dJSQlOnTqF7OxsnDx5Ejk5OSgtLQUA2XtU13YLQlQ5nU74/X5YLBa0a9cOXbp0QceOHZGUlIS4uDhYLBbExMRAp9NBkqRKIc1gMAi/388wISGEAosQEhmEentEnpMQL0LIhOJyuVBYWIjMzExs3rwZW7duRXFxMcxmsyyWwjJi/xN1NpsNOp0OV1xxBUaOHInLL78cbdu2hcFgOOd9ioT36qoUmehOCKHAIoQ0C+FVXVWhUqmslO905swZfPfdd/jhhx/g9Xqh1+tr9GaJlgxutxsTJkzAbbfdht69e8teNK/XK4cmqwo/CilCCAUWIaTFii/RZFSr1UKlUmHfvn149dVXcfr0aRiNxvOKLKVSCY/HA61Wi6effhpTpkxBMBiE0+lks1FCCAUWIYQIseX3+2EymVBQUIAnnngCJ0+ehF6vPydcqFAo4PP5oNVq8cYbb2DgwIGw2+3nbRFBCCGNDS0RISQyTnv/qy602WyIj4/H3LlzYTQa4fP5qvVEeb1ezJo1CwMHDoTVaoVKpaK4IoRQYBFCSHUIkdWtWzc88MADcDgclQSWGI8zbdo0jB8/Hna7Xe6jRQghFFiEEHIeVCoV3G43rr32WnTr1g0ul0tOTPf5fGjVqhXuvvvu83q3CCGEAosQQqoghJTRaMSUKVPgdrvlBqJ2ux1jx45Fx44d5b8nhBAKLEIICcc4/a8X1qhRoxAVFQWfz4dgMAi1Wo2JEyfKXeEJIYQCixBCwkShUMDj8SAxMRHdunWTR9506NABl112GbxeL71XhBAKLEIIqS1+vx9qtRp9+vSB3++Hx+PBZZddBovFAq/XywtECKHAIoSQ2iJCgL1794ZKpUIwGESfPn14YQghFFiEEHIxBINBtG3bFhqNBiqVCp07d64kvgghhAKLEEJqgUKhkPOuYmJiYDQa0aFDB/j9fgosQkhEI/ESEEIiWWAFAgEYDAaYzWao1WrExsbC6/VSYBFCIhp6sAghEU0gEIAkSTCZTDAajVCr1QgGOUKVEBLZ0INFCIlohJjq0KEDSktLoVAo2AOLEEKBRQgh9UGrVq1gNBoriS5CCKHAIoSQi8BoNEKr1fJCEEIosAghpL6wWCzweDy8EIQQCixCCLlYRK5VbGwsfD5fpb8jhBAKLEIIuQh0Oh0CgQAvBCGEAosQQi4WhUIBn8+H9u3bw+fzsckoIYQCixBC6kNgBQIBaLVaaLVaCixCCAUWIYTUB8FgEGq1Wv4zIYRQYBFCSD0ILNGigQKLEEKBRQgh9SiyCCGkucBZhIQQQgghFFiEEEIIIRRYhBBCCCEUWIQQQgghhAKLEEIIIYQCixBCCCGEAosQQgghhFBgEUIIIYRQYBFCCCGEUGARQgghhBAKLEIIIYQQCixCCCGEEAosQgghhBAKLEIIIYQQQoFFCGkAgsEggsEgLwQhhFBgEULqQ1j5/X5oNBqoVCpeEEIIocAihNSVQCAAv98PrVYLo9GI7Oxs2O12KJU0DYQQQoFFCKm1sAoEAjAYDDAajcjKysLbb7+NO++8E+vWrYNGo4Hf7+eFIoSQOiLxErQcRO5M1f8KFArFOX8O/TtyaQgrhUIBg8EAADh48CC+++47pKenw2q1AgBWrVqFqVOn0otFyHnsbKhtpZ0lFFgtcJEHAgF58SqVSqjVaiiVyrA2RhEa8vl8ssFQKBTyF2m5wioYDGLXrl349ttvsWHDBjgcDhiNRlgsFgQCAezbtw+HDx/GZZddBpfLRaFVh423pkKBqhsv11zk3k9xL4VtFXa2pnsmbLTP50MgEKCdpcAikb5JBoNBKJXKc5KRPR4PiouLYbVa4XQ64Xa7UV5eDq/XKy9qvV4Ps9kMjUYDg8GAqKgoWCwWqNVq+XV8Ph+8Xq+8ITfm5ireZzgbVGPREoxgMBiEwWCA3+/Hxo0b8d1332Hr1q3weDwwGo2IioqC3++H3++HSqWCw+FAamoqevfuzYrCGtZi6MarUqkqraVwX0dswOI1m2oDDl1/zem1G+K+KhQKqNXqSvczEAjA6XSisLAQNpsNbrcbdrsdVqtVPuwqlUqYTCYYjUY5rzEmJgZ6vb6SvfZ6vZVsMw8xLROF0+mkBY3wzTEQCECpVEKn00GhUMDn8yEnJwe//fYbjh07huPHj6O4uBiFhYWw2+3w+Xzw+/2yUBKIDUCcwsxmM1q3bo24uDgkJyejW7du6Nq1KxISEqBUKhEMBuFyueTf35AGsuprV+dmb6prL66h2FCb0wk0EAhAo9Fg9+7d+OSTT7Bv3z74/X4YjUYolcpz8qwUCgW8Xi/i4+OxePFiGI1G+P3+S/60HeoxliQJGo2m0mHA4XDAbrejqKgIZWVlcDqd8Hq9cDqd8Pv98sFIrVZDr9dDkiSYzWZER0cjNjYWer0eOp2u0n3zer3w+Xzyxt3Q96Ax7nEkCvbqbCwAlJSUICsrC6dOncKhQ4eQl5eHoqIilJSUwOVyyYcSEQWQvRaSBEmSoFKpoNFoEBMTg7i4OLRu3Rq9evVCp06d0KVLF8TFxcm/S7xeY9xnQoFFAPj9fkiSBK1WC7/fjyNHjmDjxo3YsWMHTp48ifLy8kqeJpVKBZVKJW/+KpVKFkqhLmrxJYyD3+9HIBCAJEmIjY1Fly5dMGTIEAwbNgzdunWDUqmE2+2Gz+drMANQdaMXRkuhUMjvL5zfez4DHq5hD/0darUaBoMBkiSd87urevoiVXAJMfXTTz9h9uzZSEhIqCQaq0OlUqG8vBxz5szBNddcA7vdfsm2bhDXSaPRQJL+6/B3OBzIycnBsWPHcOLECfz2228oKChARUUFysrKZM+EWGNVny+xhpRKJfR6PaKjo2E2m9GhQwckJSWhS5cu6Ny5MxISEuRcOZ/PB4/HIwu1+n7WxDPRkM9wMBiU7VMk3lufz4cTJ05g586d2LlzJ44fP46CggJ4PB4oFApZOAl7UHXNh4aHxVdoKoZ4FtRqNeLi4tC1a1dcccUVGDhwILp37y4XlrjdbllUEwos0gALX5ymrFYr0tPTsXz5chw4cAAOhwMajQZKpVI25Gq1Wv47scB9Pl8lUaTT6aBWq6FQKM4JRQjDX/XnTCYT+vbti5SUFIwePRpRUVHweDzwer31tuGK9/+Xv/wFBw4cgF6vr7SZAKgkZMIRSlUNeF1PzVqtFq1atYJer0dUVBSio6PRuXNndOzYEe3atUObNm3kTVdcl0hz94tNzev14oEHHsCZM2eg0WgueE2USiVsNhuGDRuGd99995LLwxIbozjcAEB+fj4yMzOxbds2HDhwADk5OXA4HAgEAlCr1ZAkCUqlstLmG/p61SVFh27AYhMWv9doNKJ9+/bo2bMnhgwZgn79+qFNmzaVnrX6EFqBQAB6vR5paWn46KOPYDKZzvHIXCzi2VGpVJg7dy7atWsni5amFFZCvObm5iIjIwMZGRk4fPgwbDYbVCoVdDodJEmqJJJCr434r/BWqVQq+f5Xveehz4TwTgoPpdFoRHJyMkaPHo1x48ahU6dOspCn0KLAIg3gcXC73fjll1+wZMkSHD9+HCqVCiaTSQ47tGnTBv3790evXr3QpUsXREdHQ6PRyAvf5XKhqKhIDiMePHgQeXl5cj6OJEnVluGHnsz8fj+cTicCgQCSkpLwu9/9DtOmTUNUVBScTqd8mr7YzUyj0eCee+7B5s2bER0dDa1WC5VKVSmJ/2KM8YV+tqrADDXAwrAKQSpEnlqtRnR0NBITE9G3b19cccUV6NOnD8xmMwKBAFwuV0QZRvFMLVy4EIsWLUJ0dHRYLRiCwSAWLlyI5OTkS0JkiXus1WohSRJsNhu2b9+O9PR07Nq1CwUFBbIgUavVCAaD8iYpQnlVRZTweKjVavlQEpq/Ffr8hYYcRYjf4/FAqVSidevW6N+/P8aNG4ehQ4fKeXPivtR1fYhn4+uvv8Zzzz2HVq1ayQe2i+3qLz6Ty+WCy+WCWq3GkiVL0LVrV7hcribJMQsGg9Dr9VAoFMjMzMTPP/+M9evXo7CwEGq1GkajEQqFQs5jVSqVcq5qq1at0LZtW0iSVMm7np+fj5KSElitVtmDKcS5eE6qeoyr2lmXywWv14uYmBiMHDkS1157LS6//HIoFAo4HA4mxVNgkYtd/ACg1+uxe/duvP/++9i7dy+0Wq2cF1BWVoakpCTcdNNNGDdunHyire6UXHUzLCoqwp49e5CWloatW7eioqICRqPxvEIr9HVCjWTnzp1x991345prrpEN0cV4s4SHJSMjA0ePHsWxY8ewb98+2O12mEymC4ayznc6DednQkM4QkSJMKsIGYR6BEOTdIXwEp4+jUaDjh07YsyYMZg8eTK6d+8u5+VEQk6FELFZWVmYPn16WJumSqVCWVkZ7r33Xjz++OMtOkxYVVjl5eVh1apVWL58OU6cOCGLEI1GA6/XC4fDgWAwiOjoaCQkJKBdu3Zo164dLBYL9Ho9AoEArFYrSktLcebMGRQVFSEvLw92ux0KhQI6nU4WMBd6VoU3VAg5IUoSExMxYcIEXH311UhMTJS9znW5P8KDfOLECaxbtw5nz57Frl27kJ2dDZPJBKVSWes1KJ4ft9sNr9eLHj16oE+fPujQoQMmT54Mk8nU6Hl9fr8fOp0OKpUK+/fvx7///W9s2LABTqcTBoMBOp0OHo8HNpsNOp1ODt/16tUL3bt3R1RUFIxGY7VFDD6fDw6HA1arFVlZWTh69Cj27NmDw4cPo7i4WM67E9GDC9lZn88Hu90OrVaLYcOG4Y477sDAgQNlEcYpCxRYpI4iQ5IkLF68GJ9//rls1MXmbrPZcP311+PRRx9FdHT0OVUoVT01oW7sqhUxx48fxw8//IBff/0Vdrtd9rxcaOMVxt7lcsHtdmP48OGYOXMmunfvXi8nLJHgGwgEcOzYMSxcuBAbNmwIW2QplUrY7XaMHz8ed911F5xOZ40eF+ENrKioQE5ODgoKCpCXl4dTp07JicrCOAqPWnWJ7sFgEG63Gy6XCxaLBaNGjcKtt96K3r17y16IpjaMgUAAOp0OzzzzDNavX1/jdVUoFPB4PEhISMCnn34KvV7fIpPdA4EAVCoVtFot8vLy8N133+HXX39FXl4etFot9Hq9/Gy53W60adMGgwcPxrBhw9CzZ08kJCRAr9df8PXtdjuys7Nx6NAhbN++HXv37kVBQQEkSapx463q8QD+GyJ0Op2IiYlBSkoKbr31VrRv377O61AIcPGMlpaW4qeffpLtkPDYhItSqYTD4UDbtm0xY8YMjBw5Ur5GHo+nToLtYu6vqKDOycnB559/jhUrVsDlcsmCSQir+Ph4XHXVVZg4cSJ69uwph4dDD2HVvXeR7yq+xO/Nzs7Gpk2bsGbNGuzfv18OB17ofgs7K54bSZIwceJE3H///ejUqVO9RQ4IBdYlgajycrvdeOWVV5CamoqoqCh5EYp8mEcffRT33ntvnfMvQkNcOp0OSqUSR48exSeffIL09HS5sikcQ69UKmG1WmEymfDwww/j5ptvhsfjkfO96nodQttJKBQKvP766/juu+9gsVhqDGkJj8vtt9+OP/7xj/K1q8tJt7i4GNnZ2di1axd27dqFgwcPwmq1wmAwnLfDubgufr8fNpsNBoMBU6dOxYMPPoiYmJgm9wAJwb569WrMmjUrLOEq7vPcuXORkpLSorxY4uBiMBjgcDjw3Xff4auvvkJeXp58n0M9t8nJybj22mtx5ZVXyp7j0OTl8wkQ0cIhtOowLy8PW7ZswYoVK7Bv376wNt7qnjWv1wu73Y74+Hg89NBDuP766+vszQr1pokQ4aZNmzB79mx5LYUjspRKJZxOJ5KSkvD222+jbdu2coWcWKeN+cyLdIPvv/8en3zyCQoKCmA2m+X3YbVaYbFYcP311+P6669Hu3btAKDSexZ25EL2tmqCe2grHa/Xi507d+Lbb7/Fxo0bEQwGYTQaazzUikOd1WpFTEwM7r33Xtx8883yNaY3K/JRvfjiiy/zMjSduFKr1XA6nXj22Wexbt06xMTEyItUpVKhoqICd955Jx5++GE5NFGXsFNo9ZJIIm/Tpg0mTZqEhIQE7Nq1CzabDVqttkZDGgwGodPp4Pf7kZ6ejpycHAwbNgw6nU4Wf7VW+iHvTyS4jxo1Cnv27Ak7MdvtdqNnz54YMWIE7Ha7nMdS05cQrSLJ2GQyoX379hg4cCBSUlIwcuRImEwmZGdno6ioCFqtttoNJzTMCwC7du3CunXrkJiYiC5dusDj8dRoqBvsJPU/T1tCQgLWr1+P0tJSOUH/Qj8jrtHEiRNbjAdLeK30ej02b96Ml156CUuXLkUgEJDbVwBAeXk5EhIS8Oijj+LJJ5/EwIEDodPp4HK5KnlixLNb3Ze47uI58/l8MJvN6NWrF1JSUtC/f3/YbDZkZWXB6/XKXpNwBJGoQnQ6nVizZg2ysrIwYMAAtGrVSs4fqu36E94Tl8uFbt26wWw2Y+3atWHZBSEQNRoN3nrrLSQlJcFqtcrVzI3pdREHivz8fLz88sv44osvZGEj3qfVasXo0aMxd+5cTJ48Wb6WPp+v0vUIxysY6tEWP+P3+2Vb1rlzZ0yaNAl9+vRBTk4OsrKy5Ly8miqf9Xo9PB4PMjIycPDgQfTp0wetW7eu9T0mFFiXDEJABYNBzJo1C5s3b0ZMTEylvjcOhwN9+/bFSy+9JP99fWxwoSdgr9eLPn36YMSIEdi/fz9ycnKg1+vDElnCwO/btw+7du3CkCFDEBsbe9ELX3iCdDod4uLisGLFCjlZtCaB1bt3b4wePRo+n69Sy4oLfVU1pKEJxoFAAG3atMGwYcMwYcIEqFQqHDp0CG63+7ybjvg7o9GI0tJSrFy5Enq9HldccUW93sfa3nNRGVpcXIxt27bVeJ9Ffs7Zs2cxcuRIxMfHy5tPc8Xv98NgMMDtdmPBggV4++23UVpaCrPZLH8un88Hp9OJ66+/HnPmzMGgQYPkMLB47mtzyLnQxpuUlIRJkyahd+/eyMnJwcmTJ2vceKuzI3q9HgcPHkR6errc6qGugl6EvLxeL3r27InNmzcjPz+/xiaqKpUKVqsV1113Ha699lrYbLZaN16tL8+k0WjEpk2b8Nxzz+HAgQNyVACAnFrx+OOP4+mnn0Z0dPRFHV7DPTR6vV507twZKSkpiIqKwt69e2G326HT6Wpch0qlEgaDASdOnEBaWhrat2+P5OTkJj20EQqsiBZYer0e77zzDn755ZdK4irUezBr1iwkJSU1yGlFGH632434+HhMmDABJ06cwNGjR8MSWeJzGI1GZGdnY/369Rg0aBASEhIuugxbiKy4uDisX78eJSUlF/S4hAqsUaNG1dmTVt2GKMSWyWTCiBEjMGjQIBw8eBC5ubkXvE6hJfzp6enweDwYOXJkk4kssQlGRUVh1apVYSe7V1RUICoqCkOHDpWr2pqruDIajTh27Biee+45pKWlwWQyQa1Wy14tt9sNjUaD2bNn4/7774darZaTy+tr861u4+3SpQtSUlJgsViwd+9eOByOsLxGVe2J1WrFihUroNVqMWjQoEqh97p4+vR6PYqLi7F169YabYIQj7///e/Rvn37Rvd4ivdmMBjw1VdfYe7cuXKulZhS4HK5YDKZ8Je//AVXX301XC5XpcNYQx5wxP0GgIEDB2LEiBE4evQoTp48KY+wqul+CA/qqlWrIEkSBg8eLIeoKbIosEiIoU9NTcX8+fPPKZsX3qvLL78cDz74YIO7gpVKJTweD3Q6HSZMmCB3Lg5XZImFL4x7v3790K5du4v2doiQzZYtW5CVlXXBDac+Bdb5NsRAIAC3242OHTti4sSJYYnR0LyyzZs3Q6VSYejQoXLPrMb2Ynm9XrRp0wYHDhzA8ePHww79FBcXIyUlpVabfiQdZsRBIDU1FS+88ALOnj2L6OjoSuOnXC4XoqKiMG/ePIwaNQp2u73BE4pDDzkKhQIDBw7E8OHDcfjwYZw+fbpG70Z1HkdJkpCRkYG8vDyMHDmyzs+ZSH4vKSlBenr6BcP0QlyZzWbcfffdco5RYz3jYp3pdDosWLAAH3zwAQwGA9RqtSyu3G43oqOj8fbbb2PgwIFyv6vGXIehndsTEhIwadIklJWVYc+ePdBqtWHNNxStP9atW4eKigqMHj36ooQ0aTgYwG0CY69Wq1FSUoIPPvgAGo2m2h4pXq8X48aNCyvxvL48G16vFwAwZ84cDB06VM6fCBev14vY2FgYDIZ6Na61zSVpSOMoSZLs1n/99dcxbtw4VFRUXPA6iQ2+VatWWLhwIZYvXy7PBmyK50+hUGDKlClhf79Wq8WpU6ewbdu28yb5R/J6E16Nf/3rX5g9eza8Xq/cUDNUnEdFReGdd95Bv379Gn3zFc+P3W5H9+7d8cEHH+D6669HeXl5rSoDQxsIi3yjixUD4V4HEa6sKZzfUM+0RqPB3/72N3z++eeIjo6Wc62EbTMajXjrrbfQq1cv2Gy2GnMQGxJJkuRK59mzZ2PGjBmyoK/pWov9oFWrVvjyyy8xd+5cuYk0Z4dSYF3SiCTQ77//HqdOnar2hOr3+2GxWDBw4MBGPQUqlUrZXT537lx07tw5rHYHooJvwIAB+OCDD5CcnFzvHppwDUdj5CQIg61QKDBnzhz06tULdrv9gtcptMnhO++8g5MnT0Kr1TZqyXqot3Lw4MFy6DnczXPVqlWN+jzW1zOj1+sxf/58vPPOOzAajVCpVLJIFLlparUar7/+Onr27Nmkm69Kpaq08c6cOTPsjVd4WW02G/7whz/g6aefviQOrMB/27y89dZb+Oabb9CqVatKYTPRXuHll1+OCHFV9X45HA7cd999eO655+ByucK616LqMyYmBj/++CNef/11uUCCIosC65L1Xmk0GhQXF2Pp0qWyp6c671V8fDwSEhLqNdQV7qJ3u92IiYnB7Nmza/SgCXE1fvx4vPPOO4iOjq5RbDQkQmA1llAxGAyYNWtWWH2iQkMuH374YZPMZRPPl8Viwbhx48Lq0C5CtTt27KgxVBuJ4uqdd97BZ599hujo6HM2INGK4emnn5Yr+pp68w3deO+55x48//zzcoL9+Z4XUbQSCATwpz/9CXfeeaecuN3SD6x6vR4ffvghvvrqK1lchV4Xq9WKhx9+WK4ujgRxFfr8iT5rN954I55//nk4nc6wDomiUXJMTAy+/fZbzJ8/P+y0DkKB1SKNgVqtxsaNG5GTk1PtRiU2wI4dO9apk3l9naLtdjv69euHe++9t9pQoag0Ki0txQ033IC//vWvkCSpzh2l6wuTydRopziVSgWHw4EePXrg//7v/2Cz2WoUK8I7mZGRga1bt0Kn0zX6PRan+kmTJoXVY0x81vLycqxevbrSGKNI33gXLlyIf/7zn4iJiTmnX5VI4P/d736HqVOnRtTmG7rx3nDDDXjuuefOu/GK/CK1Wo2//vWvmDZtWpMechqL0EHmixcvPieXVVQ1jh49GrfffntE944SNve6667DH/7wB9hstrAPX0Jk/fOf/8SSJUuaLP2AUGA1udEMBAJYv379eRv3ie8ROQRNdRoRFTe33XYbevXqJY99CTXw5eXleOCBBzB79mx5HltTG/XGvl7Cc3DTTTeFXT0p7vGSJUuaJDFVJHR37doVgwYNCmszFqNk0tPTYbfbG738vq4b7yeffHKOV0PcA1Gw8Mgjj0RsdWTVjddqtVZ6XsS/R0VF4d1335WT81t6E0pxj/fu3Yt58+bJUy9C76/oOTZz5swmsQ11vde33XYb7rrrLpSVlYV9HwOBAMxmM9577z3s2LFDrpwkFFiXBCK5vbi4GEeOHKkxzCJGxzSlUfD7/dDr9bjnnnsqdTUW4Ysnn3wSM2bMuKTHN4jS6/j4eIwfP76SEL3QdTUYDNi1a1eThdyEsJs0aVLY7Th0Oh1OnDiB7du3V1ucEWkb71tvvXXe8ncRGrz//vsRExPTJFWdddl477zzTpSXl8tjWSoqKpCYmIgFCxZUSs6/FGxpWVkZXnvtNXi93nP6hokJGDfffDO6dOnSbIaViy7tM2bMwFVXXVVjAU3oNRG2+bXXXpNnIDJcSIF1SQmsrKwsFBUVXXC+V6SIFeHFGj16NHr37g232y2PB3nppZdwxx13wG63V/JqXYoIT+P48ePDDvmJzXHTpk11Hqh7sffW7XZj2LBh6N69u9zrKZzneMWKFRFpuMUaKy8vx2uvvSYXbFR9r6INyoABAzB58uRmMXZEbLyPPfYYxowZA5vNBpvNhr59+2LBggXo2rVrxOUXNeR91mg0+Pvf/47jx4/LLSFC16PwTt50003NqnebsCWBQAAvvPCCPH8wnPcfCARgMBhw6tQpzJ8/v8bpF4QCq0UZBQA4e/ZsjYnroQ3pIsEjoNVqcc0116CiogJarRZvvvkmrr76ajkUcan3XhEJ78nJyUhMTAyrMk+UtO/bt69JBKp4HsWQ8XAQBnz79u1yFWQkGXCx8X700UfVbrxVP8stt9wSsZ648228ADBr1izExsZi8ODBmD9/PuLi4i6JsKCwRwaDAevXr8fPP/+MqKioSg2aQ8Xo7373u4j3Tl7InsTExODZZ5+Vn9dw8Pl8iIqKwvLly7FmzRrmY1FgXVoUFhaGNVDZZrNFhGdIdFQfNmwY+vXrhzfeeAMjRoy4JEIRtUEM7O3Ro0dYJ2YhBk6cOIGysrILejQbApFTtWnTJhw+fDjshpaSJKGsrAxr1qyJqGR3If62bt2KH3/8sdqNV6wnp9OJHj16YPTo0U1elFGXjTc2Nhbvvvsu5s6dC71e36w+w8UKaEmSYLPZ5Crc6u6vqMJOSUmJiLzQuiDCwkOGDMEdd9xRq56E4jotXLgQFRUVjW5bCAVWk5GXl1djKb8kScjJyYmIYZ7CYMXExOCDDz5A//79L5lQRF3o3r172MZMqVSivLw8rMHLDXFfA4EAfvnll0pzGcMVZunp6XA6nRHzHIj2Ih9//HGNMys9Hg8mTJgAnU5XrQiLdJHldrvRrVs3GI3GZj26qK6Hgh9++AGHDx+uts2NCP+OGjUKbdu2DbvPWyTf63vvvRc9e/YMK79T7CF6vR7Hjh3DkiVLmqTfHqHAavQNDai5T5PII8nNzUVRUVHEJCqKwc7NIV+lKe9vhw4dwjoxihCh0+lEWVnZeatKG2qj0ul0OHjwIHbu3Clv1OGMNhLJ7seOHcOOHTsiwniLweArV67Enj17zhsaFJVlrVq1wtixY+H3+5ulOBE5Ro09668pER7fwsJCfPPNN+etkhMH1CuvvLLZj44Rz6vRaMQjjzxSq3UWCARgMpnw3XffIS8vj/lYFFgt30CE+32SJKGkpAT79++PqDBMc92QGvMeJyQkQK/Xh33PAoFAo3tRRBHFr7/+CqfTCZ/Ph8TERLRv375WbSaWL18eEddcjC/6+uuva5yX53Q60adPn7Bz5SJ5872Uch9FD8Eff/wRubm51d5nITwTExPRt2/fZpd7VR2i196oUaMwfvz4sEOF4qCen5+PH374QR5oTiiwWjQWiyVsb8jatWsr/X+keGnI+UWH0WiUKwnDESrBYFCeAdlYgkSr1SI/Px8ZGRkwm82w2Wy47bbb5Gab4baZ2L59O06fPt2kye4ibJSRkSEP3j7fRiIGEg8fPrxRPYbk4p9ZtVqN0tJS/Prrr+e9xyKkNmDAAJjN5hYhsEKf83vuuadW/a1EXuLy5ctRVFRELxYFVsunbdu2NT7kopdPaAIyTx/N55Rdm6RShULRqE07A4EAJEnC6tWrkZ+fj2AwiHbt2mHMmDEYMWIEoqKiwjLgwsu6du3aJvWyivmZS5curVE0+f1+mM1mDBgwoFnNVOS6+u/81vT0dJw5c6ZGQd+/f/+WtUn/ryqyZ8+emDhxYtgFRiKsmpOTg/T0dHqxKLBaPrGxsWGdnoVr+PPPP2dYrhmdtDUaTdh5c+J7GvP+SpIEp9OJFStWQKfTwWazYfz48bBYLOjUqRMGDx4cVjKt2PRWr17dZMnuIpcsMzMT+/btqzbpOVTIejwetG/fHh07dmz0GZ/k4gSG1+tFampqtX3NBKJFQc+ePREIBFrU/RXe15tuugkmkylsL5bw/q1atQoej4f5sxRYLRMRDkpMTLzgRlD1tL1mzRr88ssvMBgMza7i6VLdDML1jIiEcZPJ1Ciue9HTbMuWLTh69Cg0Gg2MRiOuvvpquSlnSkpK2O9dr9fj6NGj2LVrV5P0kxJJzGlpaTV26hYCq1u3blxLzQghoo8dO4YDBw6cNzwoEsJjY2MRHx/f4u6vCH8mJydj9OjRYfc9EzM5Dx8+LE8QoReLAqtFbrwejweJiYlo27ZtWMnEYgOeN28e9u3bB5PJxI2hmVCTYBI5W1qtFmazuVEqwoTIX7ZsGRQKBRwOBwYNGiT37nK73Rg6dCiSkpLCSgAXp+qVK1c2SbhNrVbDZrNh27ZtNYbRxWdPTk7mw9nM1pFCocDGjRsvKCqEl6tz586ynWyJIeBgMIhrr722VuE+0bpi/fr1TTrflgKLNCg+nw8mkwn9+vULuxmlJEnweDx44YUXcODAAdk9zEUS2YRj3EXLAJH31JAbgvAEHDlyBNu3b5e9qNdcc438HIrhuOPGjQtrdps4HW/duhU5OTmNmuwu8t0OHDiAM2fO1JjAK0IlSUlJYd8f0vSoVCp4vV5s3bq1xtC73+9Hu3btWqyIEF6s/v37o3fv3mGP0BGpCzt27LhkmtJSYF3Cm+64ceMumEtQdSPRarUoKyvDE088gbS0NBiNRqhUKo5AiMD76/f7wzpZigaunTp1qlVl0MWcfJVKJZYtWwa73S6P9hk+fLjc0Fa8/4kTJ8petZpeU61Wo6ioqNGT3YVnY9euXWEdVoTAjIuL4+GkmSDy/E6dOoUTJ07UGN4KBoNo3bp1i74mfr8fGo0GV111VdhVkmIPOXHiBE6dOhVxI64osEi9nkAGDhyIXr161WqIp1arhdvtxuzZs/H222/D5XLBaDTKi44LJjIElsvlCmvDFyHC7t27y5tDQ4oRjUYjCyGTyQSXy4WUlBTo9Xo57BzaJTzcZHfx2qmpqXC5XI12OhbVg3v27KnRsxE6jaBNmzYtqny/JSMOBYcPH5ZHvtQk9hMSEiodZlviHuLz+TBq1CjExcWF/SyL0TsHDx6UbQ+hwGpx+Hw+6HQ63HTTTbUy9KK8Xq/X49///jemT58u59KEerS4cJrW+LlcLjl/6UKbvvCoXH755Q2+IYhwWlpaGs6ePQsAiI+Px8SJE8+Z1SY8Q5MmTQr7tUUS7Z49exoliVZspoWFhWGFB8WGYrFYwu5RRiKHzMzMsJ4JSZIQHR3d4g9xohq2X79+cDqdtSqqOXToEB8oCqyWi0qlgsvlwoQJE3DFFVfUamhyMBhEMBhEdHQ0srOz8fLLL+ORRx7BL7/8AofDAaPRCIPBAACy2KJnq3FP20VFRTV6fkI7TicnJzf4zEmVSgW32y23ZrDb7RgzZgzatGlzTjK7KMYYOnQoOnXqFHayu8/nw6pVqxpFuIjN9NSpUygtLQ0r3C4KRph/0rxspc/nw8mTJ2vsLSdEt16vb/E2TxyChg8fHvY4ILFmfvvtN7ZroMBq2Qhv1OOPPw6tVlvrBGcRhzebzTh48CDmzJmDBx98EPPnz0dmZqbs1TIYDHJeDAVXwxs9AMjOzq4xRChCcaNHj27wylAxp2/btm04dOgQNBoNdDodpk6dWq0nR4TTLBYLxo8fX6tk982bNzfK3DPx2llZWWEPOxaz2dhssfmsJ0mSUFxcjJycnBrDwEJoXApD6JVKJQKBAAYMGICoqKiw7IcQoGfPnpWHy3MvoMBqsQtEzER79NFHUVFRUWsPRjAYlEchWCwWnD17Fv/4xz/w6KOP4uGHH8aHH36I7du3w+FwwGAwUHA1EidPngxL9FgsFkyaNKnBGyKKUOUvv/yCYDAIp9Mp5wCez3MmDPjEiRNhsVhqNOAiD6ugoABr166FJEmNImJOnDhRq/AIT+3NC5VKhdLSUtnLH07rE/G8t+QQsAgTdujQQW6pEk6upEqlgtVqRVFRUdhFVoQCq9kaD4fDgVtvvRW33HILSkpK6nT6EmJJo9EgOjoaKpUKhw8fxieffIInnngCDzzwAGbNmoWvvvoKe/fuvaDg4oK7ONHs9Xpx6NChC562VSqV3D29W7ducLlcDbYZiOKI48ePY9u2bXK14tSpU2URdT4D7nK50KVLFwwcODCsYgwhslauXNngpeDiepWUlHCmYAtFiKS8vLywi4EuJYTN79evX9i5vOJgn5OTw35YjYTES9C0JxGXy4U//vGPsNvtWLp0KWJiYurkWQoGg3JZvV6vl/sc5efn4/Tp01i5ciUMBgPi4uLQtWtX9OrVC/369UPXrl3RqlUrAP9NwPd4PJVOgyS8a6/RaHDmzBlkZWVdMNFbjPO44447GqU1g0qlwq+//gqr1Qq9Xo+uXbtixIgRNYogkVM2efJkrFu3LiwxJ/psZWZm4oorrmiQjVF8JofDgbNnzzLU0YLXFADk5+eH3TRU5KheSnarR48eYa8xIapKSkr4gFFgXRoCSwijP//5z9DpdPj2228RFRV1QQ9DOJudQK1WQ6PRyJVUhYWF8vBPrVaLhIQE9O7dG8OHD8eAAQPQrl07AIDH45HntVFo1Xy9VSoVtm3bhtLSUkRHR1crnkROycyZM9GlS5ewx11cjOgrKSlBeno6jEYj7HY7Jk2aJP/5Qr9bJLsPGzYMnTt3Rk5OTo25VeJnUlNTMWjQoAa73iqVChUVFaioqGDYr4VTUVERti0NtX0tXWiJ/SE5OVkO44crQm02Gx8sCqxLR2QJozBr1iy0bdsWixYtglKprNSj6GI22tBNsargKigowJkzZ7B8+XLEx8djwIABGD9+PAYPHix3GBeJzhRa59/wPR4PVq1add7woBAFw4YNw+233x5W8vjFij61Wo01a9YgOzsbZrMZcXFxmDx5Mvx+f1h9ukKT3T/++GPodLoLet1EsvuGDRtQUFCAmJiYBuk5Jcb8hDNuijRvnE5n2M+E1+tt0JB7pO0bXq8XsbGxiImJQW5ubtjFJXa7nQ9WYwlhXoLIEVkOhwP33Xcf5s2bhzZt2qC0tBQKhaJeN2KRHC9yrtRqNSwWC6KiomCz2ZCamopZs2bhwQcfxMKFC5GTkwOj0QiNRsM8rWoQVXqbN29GZmZmtYO8VSoVnE4n4uPjMXv2bDkJvCE3AiH6VqxYAa1WC7vdjlGjRqFdu3ZhtV4IPSVfddVVYXd212g0yMvLQ0ZGRoMlu4d2zK/NNeQcz+aH1+ut1f29lLwzordbYmJi2AcZhUIBq9Uq/5lQYF0yIkupVMJut2PEiBH45JNPcPPNN8Pj8cBut0OpVDaIx0OEKP1+P1QqFcxmM0wmE3Jzc7Fo0SI8+OCDeOutt2ShdTGhy5aGyAdyu934/PPPqzVY4t/1ej1ee+01dOjQoVG8V1qtFjt37sSBAweg1Wqh0WgwderUWglk0a+ra9euGDhwYNid3dVqNVatWgWv11vvITwR+hEd88NN1hWdrEXYm0S+PRTelnDulygyyc/Pl5+TS0FgKRQKtGnTJqzDhlg74XoFCQVWi0NsBGazGc899xzef/99DBkyBHa7HXa7HQqFAiqVqkFOH8K7JWaARUdHw+Vy4T//+Q8eeOABfPzxx/B4PDAYDJyDiP/vvfriiy+QmZkJo9FYSXxKkgSn0wmdToc333wT/fr1a9C8q6ob1LJly+D3++F0OjFgwAD07du31uJOtJGYMmVK2N+v1+tx8OBB7N+/v0E6uwsPVm36xwlRxue2+a2x2lBUVHTJXaO2bdsyskCBRWojsnw+HxwOBy6//HK89957ePPNNzF48GC43W6Ul5fLHqeGOo0Lz5ZKpUJ0dDTcbjc++ugjTJ8+HZs2bYLRaJQF2aWIz+eDyWRCRkYGPv30U5hMJnkzECK4rKwMbdu2xYIFCzBw4MBGEVehg103b94sNzK95ppr6jSMWYQahw0bJvfcqUnUiEaqorN7Uxt/URFptVrlxqTckJoHtakSVSgUl6TAio+Pr1VfK4YGKbAueUTI0OFwwO12Y8yYMZg/fz7mz5+PqVOnwmAwoKysTE5YFGKrvhdPVaF1+vRp/PGPf8SHH34ItVrdaE0lIwWRv2YymbBlyxa8/PLLkCRJvu5iJmRpaSnGjh2LDz/8EJdddlmjea5E2HL58uUoLy+Hz+dDly5dMGrUqLC7nlfF6/XCbDZj3LhxtersvmHDBhQWFjZIZ3eVShX2piK6gpeWlqKgoICtHZoB4v6Ig1y49/jkyZMNEpqO1D0CAKKjo8N6psVhR4xT4xqgwOIN+p9oEkJr0KBBePnll/HJJ5/gmWeewRVXXAGFQiGLLTG8t74FlxBaOp0OOp0OixYtwgsvvACPxwONRtPiRZb4/FqtFkajET///DOef/55eL1eSJIkX+vy8nLodDo8++yzePPNNxETE9Oo4kqtVqOsrAxr1qyBwWCAw+HAhAkTYDab61zRp1Qq4ff75depKTQnkt3Pnj2L9evX1+t4GlEQotPpaiXcRJPF4uJi5mA1I8JtviwEVl5enty+41IREDqdLuxnWoyMIo30/PISNB+hBQAOhwPAf+Put956K2666SacOHEC27Ztw44dO3DkyBEUFRXB7/dDkiRoNBqo1Wr59FK1bUNdPDgAEBsbizVr1sBms+Fvf/ub3FKiJbqf/X6/PEj21KlTWLhwIVJTU2EwGKDT6eDz+WC326HT6XDttdfi3nvvRWJiopxM2linaeE5+vXXX3Hq1CmYzWa0atUKKSkpYbVmuJCocbvd6NatGwYNGoR169bBZDLVOBtOpVIhNTUV1157bb1XwqrVajl8GU7ITyRBZ2dnY+jQoTy9NxOEtyVcgVVWVobc3NwGaxESiQc/nU4XtldWoVBQYFFgkZqElsfjkROQu3btiu7du+P2229Hfn4+Dh06hP379+PAgQM4ffo0iouL4fP5IEkStFqtHNK6mFmEPp8PrVq1wrZt2zBr1iy8+eabcoVhSzBqIr9MkiQYjUaUlpbi888/x5IlS1BeXo7o6Gj4fD6UlZXBYDBg0qRJuPXWW9G3b1/4/f5G81pVJyJWrFgBjUYDu92Oq6++Gh07drzo9yPymFJSUpCRkRG22Nu/fz8OHTqE3r1711v1pJjBqdVq5QNHuJ/hyJEjNCLNiKioqLDtiZi1d/ToUfTt27fFi2hxaJYkSc7brelaUWBRYJEwF5fYMN1utyxs4uLicOWVV+LKK6+E3+9HQUEBfvvtN2RmZiIzMxO//fYbSkpK5JNPaNPR2hokIbI2btyI9957D88//zwcDkezFlihwkqv18Nms+HHH3/E119/jdOnT8ttLEpLS2E0GnHNNdfgpptuQp8+fQBA/vyNLa6EoNmxYwf27dsHvV4Pl8uFadOm1UtXa+EtGjJkCJKSksJqbCg2vJUrV9bbhicqCE0mE+Li4lBYWHjB2Y9VvV5ZWVnweDzsAN8M7BsAJCQk1DqB++DBg7jxxhuZzH2eQ1JsbCwvBgUWqYvY8nq9cLvdskejdevWaNu2LUaNGgW/34+8vDzs27cPO3bswO7du5GTkwO/3w+DwSDnytRmI/T5fIiJicG3336Lyy+/HJMnT24S7019CyuHw4Hvv/8e33zzDY4fPw6DwQCLxYKKigqYzWZcd911+L//+z/07NkTwWBQ9qQ0ZX6PQqHAL7/8Ap/PB6fTiX79+qFfv3715jkSnd3HjRuHTz/9NOzO7uvWrcN9991Xq5Ee4XiwEhISkJmZGfb91Wg0OHnyJPLz89GuXTt2go9wmxYIBNCmTRu5LUw4fZ40Gg0OHjwIu93OYobzrJsOHTpccjMbKbBIvYstsSl6PB759JKQkID27dtjypQpKCsrw969e7FmzRps3boVhYWF0Ov1cu+icI1TMBiEVqvFwoULMWTIEBiNxlr1KIoEYSVyrGw2G3799Vd8++23OHr0KHQ6HcxmM6xWK6Kjo3HTTTfhhhtuQPfu3SNGWInrf+rUKWzatAkmkwlWqxXXXHMN1Gp1vXlsRAh48uTJ+Pbbb8Pq7K7VapGbm4uNGzfi2muvrZf3Ip7Ldu3ahR2SDi0AOHjwIDp27CjPkCSRid/vR0xMDCwWC4qLi2v0VIr+fdnZ2Thx4gT69OnTIAPHI8l2hU41qGlfEBGHmJiYFpsvG2mwnOYSEFyiqlChUMid4e12OwwGA8aOHYs5c+Zg8eLFmDFjBlq3bo2ysjI5vyvck5FOp8PJkyfx3XffNYuqQlEVKHKsnE4nlixZgunTp+O1117D6dOn5b/XaDS444478Mknn+C5555D165dYbfbZePd1AZcCIWVK1eipKQEPp8PiYmJGDNmTJ1bM5zvWXK5XOjatSuuuOKKsDu7i2R3UeFaH+8DALp3717rnlbBYBBbt26lYWgGdkt4xzt27Bh2wrpKpYLD4cCOHTsiogdbY1wnt9tdo2ASswvbtWuHVq1aUWBRYJGG9HCJfk0OhwN2ux1t2rTB/fffj8WLF+Phhx+WDVW4J3zhfl62bBlKS0sbpPdRfQortVoNo9GI8vJyfPHFF3jggQfwxhtvyCOBXC4XDAYD7rvvPixevBhPPvkkEhMTYbfb4XK5GrTJa20/j1qtRkVFBVavXg2j0QiHw4GJEyciKiqq3iupxKl50qRJYYUZRJhwz549OHLkSL10dhcbZ+fOnWEymcJ+PXEQ2LlzJ0pKSiL2GSX//34plUp07tw5bEEg1sOWLVsumbFIYkJBTQLL5/Oha9eul1zvQgos0uTeLa/XC7vdDpPJhOnTp+Ojjz5C7969UV5eHpbIEuGg7OxsbNmypV57H9WXsQ7tY1VQUIBFixbhgQcewHvvvYeCggIYDAY4nU5YLBZMnz4dn376KWbMmIG2bdvCbrfD7XZHjLAK/VwajQbr1q1DVlaW3BB2ypQpDRKmVSqV8Hg8GDp0KJKSkuByuWr8HUKsr1y5sl66qItTe8eOHeVcqnDuicjRyc3Nxfbt2yPuGSXV069fv7CfGyGiDx06hOPHjzfIqKZIw2q11ihAxWFIFOMQCizSyGJLeLVsNhuSk5Px/vvvY/LkySgrKwvbkxUMBrFly5aIEiDCu2Y0GpGVlYV33nkHDzzwABYtWiS3WXA4HIiNjcWMGTPw6aef4qGHHkJcXBzsdrucNxSJLnWlUgmfz4fly5dDkiQ4HA4MHz4cnTp1gtvtrncxKEINUVFRGD9+fK06u69fvx6lpaVQq9X1cl/1ej169+5d62R1hUKBlStX1ioMTprm2fb7/ejRo4fcFiUcxDzXjIyMFj0WSXyuvLy8Gg9Tfr8fUVFR6NmzJ597CizSlEJLkiS5EvCVV17BhAkT5O7INW16Wq0Whw8fRkVFRZNW8YgkfYPBAIPBgMzMTLzyyiuYPn06vvzySzidTrlasE2bNnjqqaewePFi3HvvvYiKioLdbpdHbkRqroI4rWdmZmLPnj3Q6/VQKpWYOnVqg153UeE1YcIEWCyWsJPdz5w5gy1btkCj0Vz00GXx+QYNGlSrXBshtnfs2IFDhw5dEh6O5myLPB4P2rdvj+Tk5LAPDGJdpKenw2q1tvhqwtzc3BqFqmgU3LFjx7DmiRIKLNKAiMZ1fr8fs2fPRrdu3WqsyBH5DwUFBcjPz4dGo2kS0QEAZrMZarUamzdvxjPPPINHH30US5cuBQBotVrY7XZ07NgRzz77LBYvXozbb78dRqNRHjcUycIq9HqL1gwejwdutxt9+vTB5Zdf3iDeq6oGu2vXrrj88strley+YsWKi+oqH/oefD4f+vfvj/j4+FrlmomQ5ffff8/BzxGOKOAYNmxYrfKwQgeet1QRLQ4WZ8+evWCvMOF1Hjp0KPOvKLBIxDwc/+sMbrFY8Nhjj4XVukFUmpWUlDR6FY84uQLAypUrMXPmTDz55JNYt24dNBoNNBoNrFYrunTpghdffBEff/wxbrrpJllwiaHWzaW9hMh527BhA0wmE9xuN6ZMmQKNRgOfz1dpNFJ9f4mQxOTJk8My2CKkt3v3bhw9evSiNz3h3YiPj8fll19eq15folHp6tWrcejQIej1em46ESwiAoEARowYgaioqLDDhMJ+/fTTT/VWvRpp61+SJFRUVODUqVMXbGHh9/thNpsxYsSIFjNpgwKLtBhPlsjrGTJkCOx2+wWNlRBlwm3dWAJLiKsDBw7g4YcfxuzZs7F7926YTCa5o3iPHj0wZ84cLFy4EL/73e/kUKg4JTcnwyOaoq5atQrFxcXw+/3o1KkTJk+eDADQ6/WyqGyIL71eDwAYO3YskpOTw052t9vtWL16db14joQH76qrrqq1mFepVHA6nfjss89a1IYj+rq1pEOey+VC586d0b9//7D7WolQ8K5du7Bz584WJ6JFtCAvLw9FRUXnFVhKpRIOhwP9+vVDt27dGtSzTc6FjUZJWItZqVRi8uTJ2LRpU1gdlV0uV5N4dA4dOoRgMIjo6GjY7XZYrVYMGDAAN910E0aPHg2tVguXyyULxebaaFKSJNhsNqxatQp6vR5utxuDBg2C3W5HQUFBoxhR4Qnq378/jh07Br1eX2Nnd51Oh4yMDNxzzz3Q6XQXtempVCq43W4MGTIE3bp1w8mTJ6HVasMSWuK9r127FmlpaZgwYUKznEBQdQ2oVCpoNJpGX3+NYX9SUlKwYcOGsAWxaML59ddfY/DgwS3OJisUCuzfv19uglzd2hMewMmTJ0OlUrG5LgUWicRTpM/nQ79+/RAbGxvWKbIp8lpEGb7L5YLNZsPAgQNxyy23YOTIkZAkSRZWog9Yc8Xv98NoNGLt2rX47bffYLFYoFKpsHbtWqSnpzfJexLd+8MRwadOncLmzZvrZaySz+eD0WhESkoK3nvvvRpFXnVegPfffx8DBgyQ+4Y1xxO+EFcVFRU4ffo0+vbtK1fQNncPncj5GzlyJLp164ZTp06FJaQDgQBMJhM2bdqELVu2YMSIEc1eRIcKJwDYs2fPeZ9Xka7RpUsXjB49ul6bDpMwn11eAhLOYvb5fIiPj0fbtm3D2oTqoxS/LgQCAQwePBjz5s3DggULMHbsWLnHl/B6tATB6/f7sWzZskqbp9PphMvlapKv2j5PK1asqJdycRGSTklJQUJCQq1aNoiB59nZ2Xj33Xeb7Jmtr+deo9EgNTUV9957L55//nl5Q23uSfzC/phMJlx33XV1CnN99tlnLWbItzgYlJSUYN++fefNZxTh1WuvvRYWi6Xemw4TCqxmt3AiNU9AtGDo2LHjBat5RPJl69atK520GhqR3zN27FjMnz8fI0eOhMfjgcPhOGc+Y3MmNNds165dMBqN8Hq9chilqb7CnV0pcmN2795dL40gQ5Pdp02bFlZFYyiiP9Dy5cvx73//GwaDoVaJ1JHkvXI4HFi2bJksOg0GQ4tJahYNbqdMmYKuXbuGlfMnnjej0Yjdu3fjl19+qXFAeXOxAWq1Grt27cLZs2ernUggmvF26tQJ11xzDb1XTQRDhBG2aNRqNZxOZ8QZRbGAW7VqdcENUQgxIbAa+xqazWYEg0HYbDao1eoWd2ITuRe//vor3G43AKBr166YPXt2k4lzUQb+0ksvIT8/v8ahvCqVCmVlZUhLS0NycvJFe1jE5nvjjTdi2bJlKCsrq1XvI/Hc/P3vf0f79u0xbtw42Gw2SFLzMI8in+zzzz/HsWPHoNPpcPXVV7eonBvxjFksFtxxxx145ZVXwhZLooJ18eLFGDFiBGJjY5v1GB1h09LS0s47rkqpVMLpdOK2225Dq1atWkxolAKL1MlAGo1G5Obm4tChQ7jyyitrVXbemBgMhgsufJ/PB7PZjNjY2EYfKCqSWsUIoJaGyGE6e/Ys1q1bB6PRCJvNhqlTpyI5OVnu39UUz68kSRg3bhw+//xzaLXasJLd165di7vuuktuPFrXZ0Vsvq1bt8att96Kt99+Wx5oWxvRKkkS5syZg6ioKFx++eXNQmQJcbV792589tlnUKlUSExMlD24LWkdqFQquFwuTJkyBcuWLcPevXthNBprPFiI3Mz8/Hy8//77ePXVV+H1epu1DThx4gS2bt0qeymriiu73Y7+/ftj2rRp8uxU0vjQZxgh4iovLw/PPvss3n77bdjt9ojtPnyh9yTCNZ07d0br1q2bJObfknMMRGuG1NRUFBQUIBgMol27dhg/fjw8Hg88Hg+cTmejf7ndbvj9fkycOBEmkynsZPesrCxs3ry5XoYui833hhtuQJ8+fWpsJ1Lde5IkCV6vF8899xz27dsHk8kU0eFCv98PvV6P7OxsvPzyywgGg/B6vbjxxhthNptbZM6N8PTPmDGjRk9p1WtlsViwcuVKLF26FAaDoVmGCoVHcunSpSgvL692nxDpAjNmzOCkAgqsSxdRAfXbb7/hsccew2+//YaioiKsXLkSGo0mIheGSBa/kAerT58+cniC1B9i1qBozeBwOHDllVdWCnk0xZdKpYLH40FycnLYnd0FK1euPG+Yoy6bj16vx4wZM2o8DJzv5zUaDex2O5566ils3LhRFoyRdtgR4qq4uBjPPvssCgsLEQgE0KNHD1x99dXyYPIWt2H9r69T//79cfvtt4c9jF48D3q9Hu+++y6OHz9erfenOXivsrOzsXz58mq9d6KS9Oabb8YVV1xR65xEQoHVYjxXJpMJe/bsweOPP46cnByYTCZIkoSvvvoKZWVltTqhNZZnqKSk5LwLVmxwI0aMqLdNk/z/a6vVarF582YcPXoUarUaRqMR11xzTUQkMouKwMmTJ4d178WzsmvXLmRlZdXLgUKERoYMGYJbbrlFPuHX5Tq73W4899xz+P7772E0GuXKzUixHQaDAUVFRXjqqadw/PhxuZP/fffdB6PR2OwS9Wt7n10uF+6//34MGjQINpstLJElvJR2ux1z5syRQ8DNRWQJD/a///3vapuLqlQq2Gw29O3bFw899FDEpplQYJEGN5BGoxEZGRl48sknUV5eDoPBAK/XC51Oh6ysLPzzn/+MKC+W6EWTm5tbrVtaJFX27NkTl112GTsGN4DADQQCcpWYw+HA4MGD0b1794gwpCLRfPjw4WEPlJUkCeXl5UhLS7vgLLW6bL7Tp09Hnz59wt58q25karUakiThr3/9K15//XXZ29zU3izxPrKzszFz5kwcOXIE0dHRKC0txdixYzF+/Hg4HI4WnXMj1oJarcasWbMQHR0ddr6Z6I116NAhvPrqq5AkqVm0shDVkHv27MHSpUthNpsrCX5ROWo2m/Hiiy/KTXx5yKXAumQQbRiMRiN+/vlnzJo1Cz6fr1JSsJgb9fXXX2P79u1hNXBsjPctSRJKSkpQWFhYrcASicZTp06Vk5ZJ/XqvDh06hB07dsBgMCAYDGLatGmNPu/xQpue1+tFdHQ0xo4dG1YzWpHsnpaWJld9XuxnEZuvXq/Hiy++KLexqO1GIzYns9mMJUuW4JFHHsHOnTthNBqhVqsbXWiJpqEmkwmZmZl47LHHcPLkSVgsFrjdbhiNRjz00EOXzOBqIaSTkpLwpz/9CT6fL2xB4fP5EBUVhdWrV2PevHny/NJIvXaiDYfT6cS77757TkGIsAFutxsvvPACunXrFvZIIUKB1WLEFfDfKrx//OMfmDt3rtyWoboqEAB47bXXkJ+f3+S9W4TAOnbsWLWu6VDv1cSJE+m9aoDrr1Qq8euvv8LpdMLj8aBHjx4YMmRIROXaCHEzadKkWiW7nzhxAtu2bas3j614HpOTk/H888/LjVBrK7LEgSg6OhrHjh3DE088gXnz5qGoqAhGoxGSJMHv9zeYl1kM1Ra9w/R6Pb777js88cQTKCwshNFoRDAYhNVqxd13343k5ORLamMVve9GjRqFp59+Ws4PDec++/1+REdH46uvvsL7778vz9aMRJElDlgffvghMjMzK+WOKRQKKBQKVFRU4A9/+AOuuuoqtmSgwLr0NkhJkqDX6/Hee+9h/vz5MJlM8oZ0vpN9bm4u/vznP8PtdlcrxBpbHG7duvW8rRe8Xm+l/A+6puvv2ms0Gpw9exbp6ekwGo1yqbpOp4uoXBsRRu7RowcGDBgQ9mYfDAaxatWqes3bE5vvxIkT8dhjj6GioqLOwkMklKvVavznP//BAw88gMWLF6OkpARGo1FuXSLE0MVs0kLU+f1+KJVK+fW3b9+OmTNnyuFK4XWpqKjA8OHDceedd8LpdF5yG6u4zzfeeCNmzJiBioqKWomsqKgofPbZZ3j33Xeh1+vlprmRgggJ//jjj/jqq68QFRUlH1yEuCorK8Pvf/973HbbbS0+PEyBRc4xmAqFAjabDXPnzsU///lPREVF1XhaEknwO3fuxIsvvihXODW2J0ts8CUlJdiwYcM5U+klSUJFRQUmTZqEq6666pI08g2J3++HWq3GkiVLUFBQAABISEjAVVddFZHNEkWy+6RJk8LqbSW8Mzt27MDp06fDHtYc7ubrcDhw991346677kJJSUmd+1oJ4RQVFYWKigp88MEHeOCBBzBv3jzs27evkhgSIXS/3y+LLvEVDAZlESW+xPeJESgGgwFGoxFutxvp6el46qmn8MQTT2Dr1q0wm83y+nK5XIiPj8esWbNaxEici73P9957Lx577DFYrVbZ6xvOfY2KisIXX3yBuXPnQqFQ1NjHrTHFlclkwrp16/DWW29Br9fL91isq/Lycjz00EN46KGHWDEYgbDRaCMIFL1ejzVr1uA///kPEhISahRXVU9YGRkZePbZZzF37lxYLJZGPaWI0/vy5cuRnZ1daWq7MGyJiYl48sknI8Kb0pI2GVEMcfDgQXz77bewWCywWq2YMGEC4uPjIzIUIJJthw0bhg4dOlQbUj7HCEkSSktLkZaWhvvvv79eu48rFAo4nU488cQT8Hq9+PLLLxETE1NnT5NoqhodHY3y8nJ8+eWX+PHHH5GcnIxhw4Zh4MCB6Ny5M6Kjo6vd7KqGdqpuqMXFxThy5Ai2b9+OrVu34uTJkwD+O0xbJC4LL4tCocBLL72E9u3bR8yzID5TY69DhUIBh8Mhe9HffvttqNXqsA6lIgz8448/ylGDtm3byr3UGtsbLwS4yWRCRkYG/vSnP8ntUMTa8Hq9cLlc+MMf/oC77rpLHglGKLAuKUQ+yOTJk2Gz2fDOO+9ApVKFfUoSuQKbN2/GY489hjlz5qBLly7ygmrIRSVClXl5efjyyy8rxf5F1ZhWq8XLL7+MuLi4BjHywWAw7AG+CoUC5eXllQx9c0WUZDudTrz55pvytQ4EAujcuXPEvm/RCy06Ohrt27c/76y0qp9Vq9Vi9erVuPXWW+u1yW5oAvAzzzwDnU6Hzz//HGazuc7hIOGdEkLL7/fjwIED2L17N/R6PeLi4pCUlIROnTqhbdu2aN++PcxmM7RaLTQaDQDA7XbD7XajvLwcOTk5yM3NRVZWFk6fPo2ioiI5DGgymSp50MR7ttvteOmllzBkyJAGE1fC2+Z2u8O6TiJEbLfbERMT0+jPnRBZN998M1q3bo2//OUvsNlsYTWMFXZ2586d+P3vf4+nn34aY8aMgdfrlSsUG8OmCI+1Xq/HDz/8gHnz5kGpVMrtJESbCa1Wi1deeQUpKSmNshcQCqyI3nQ8Hg9uvvlmJCQk4LXXXkNxcTEsFktYJ2nRhfjYsWN4+OGH8cQTT+Caa66B3++XS/Tre3GJ0KZKpcLbb7+NgoICWCwWOTdEDBh+5ZVX0K9fv3o38iJcUlpaKvdJqmmTVqvVOHnyZER3wg9XXIlQxcsvv4x9+/YhOjq6krhtDp8t3GcyGAxCp9Ph2LFjSEtLw7Rp0+p1TI0QWU6nE48//jji4uKwYMECKBQK6PX6OntehdACIIf1AoEAiouLcfbsWWzYsEH20Ikv0Y4iEAjA5/PJX+L7NBoNjEajnJ8ZKmxEQ1efz4cXXngBU6dObXDPlUKhwKFDh2qs0BOVbmVlZTh+/DiSkpKaZA6i6IV25ZVXokOHDpg7dy7279+P6OjoSh7E89lZs9mMkpISPPvss7juuuvw4IMPIi4uDm63Gz6fr8GEltgHjEYj7HY73nvvPXzzzTcwGAzyelcqlSgtLUX37t3xpz/9Cb1792ZCe4SjevHFF1/mZWiczcbtdqN79+4YM2YMTp48iWPHjkGj0YQlBkQulNvtRlpaGk6dOoXk5GR5qLIw0vWx+P1+P1QqFXQ6Hd577z389NNPcnKlKBfWarX4y1/+gtGjRzfIIhehydWrV2Pp0qVhzRxTq9UoKChAr1690K1bt2bZaE+cYHU6Hf72t7/hhx9+kL0kojS9U6dOGDlyZMQOrBV9ur788stahbOVSiUyMzNx5ZVXIiYmpl6rUcW68Hq9GDhwIHr37o1du3ahsLBQriCrD2+PEEJarRZ6vR46nQ5qtVq+BmIjFbMPNRpNpe8Tm2lVeyBJEmw2GwwGA1555RVMmTKlQVMFxIHFarXivffeC+tZE606AoEAJk6c2GTPp/CktWnTBpMmTYLb7ca+ffvkljg13Uchhnfv3o2MjAyo1Wp07dpVrtoMFeQXY2+F0BYCXaPRYMuWLfjzn/+MtWvXwmKxyNMSXC4XXC4XrrvuOsydOxcdO3akuKLAItUt/NjYWEyePBlmsxmZmZmoqKiAVqut0TMhTolarRYHDx5EamoqnE4nkpKS0KpVK0iSJPeDqYsXQfyc6B305ptv4ptvvoHFYpHff1lZGRITE/G3v/0NgwYNahDPlcg9Kioqwty5c2sllAKBAE6cOIFJkybBYDDI4cVId5+H9khzuVx49dVX8eOPP1bKeRP3s7y8HFOmTJFzmyLls4nNx2AwYNWqVfj555/lnl3hIAom9u3bh9GjRyM6Ohput7teNjPx8+Kg06VLF1x11VUoKirCgQMHoFAo5PBdfV2L0K+q76Gm7wu1GQBQVlaGPn364PXXX8cVV1zRoJurKE7Q6XT4+9//jk2bNtVqqLLwYPXs2bPOLTLqw9Z6vV5IkoQxY8bgsssuw/Hjx5GdnS0LqAt9DiF6rFYr1q5di82bNyMYDKJDhw6wWCxyVXd1/dCq+6zie0LtrDhIqdVqZGZmYv78+Vi4cCFKS0thsVjkcHtFRQU6deqEWbNm4Z577pH3EYqrZuBYcTqdQV6GxkUkqoqu7YsXL8aaNWvkklyRZ3GhjUkkOtrtdrRt2xYpKSmYOHEiunfvLgs1j8cTVkNEpVIpd64OBoPYtm0bPvjgAxw4cECueHQ6nfB6vUhJScEf/vAHxMbG1quRF+9RkiSo1Wrk5+dj9uzZyMzMDMu4h34Wm82G4cOHY86cOXKX59DS5kj0Wul0OqhUKuzduxfz5s3DwYMHK5Vkh34+q9WK6dOn46GHHmqyRNzq7p1KpYJGo8Hhw4fx5JNPymG+2oQzxbiPpKQkPPvss7jiiisAoNI9rI/76Pf7odVqIUkSVqxYgcWLF+O3336D0WiU+3E1ZRhW3FOr1QqNRoNbbrkFDz74IHQ6XYN4roTAEwc4APj000+xcOHCWolkhUIhe2HnzJmDUaNGwe/3y56txvZohR5cbDYblixZgm+++Qb5+fkwmUyyUDrf51MoFHIercfjQWJiIkaNGoUxY8agR48eMJvNlZ6pqq06xHMqktRD71thYSF27dqF1NRUbN26FS6XS64SFblssbGxuPHGG3HrrbciKiqK+VYUWKQ2Rl70XtmxYwe+/PJLbN26FW63GwaDQfZQnE9ciMXv8XjgdDphMpnQt29fjBgxAv3790diYqKcJFuT4CsoKMDevXuxfPlybNu2DQqFQs4HcLlc6NatGx588EHZ9V/f7n+RY1VcXIyNGzfiH//4B/Ly8uo0kFWIrE6dOuG+++7D0KFD0apVK3mjjqgF+L9cq1OnTmHJkiX4+eef4fV6YTAYLlgE4fF4MHPmTNx6663wer1N1ntMhLqA/5aMr1u3DgsXLpS9snVJIhdhaKVSiQkTJmDKlCno3r27fKqvGqa5WFFhMBhQXl6Ob7/9Fj/88APOnj0LnU4nC43zeZcaSliJA43P58PgwYPx0EMPYcCAAXC73XKouL5RqVTyMPEjR47gq6++wtq1a+WwWG2fCZ/Ph2AwiP/7v//DtGnT0KFDB3nGY1MIV5EPptVqkZubi2+//RbLly9HQUGBfK9F3tv5PInC+ylSJDp27Ig+ffrgsssuQ9euXREbG4vo6Gjo9XpZBAn77XQ6UVpaisLCQhw5cgQHDhzA/v37kZ+fD4VCAZPJJAs5p9OJ2NhYTJo0CTfffDMSExPh8Xjg9XrptaLAIrVd+ADkU+KePXvw888/Y+PGjSguLoYkSdDpdPImVp0BEELL7/fD4XDIvYXatWuHjh07IjExEW3btoVOp5P7WIkTUnZ2Nk6ePImsrCwUFRXJoQGXywWv14ukpCRcf/31mDZtmtwioj5PUCLnYdGiRdi3bx/y8/Nx9uxZaLVaudKyLh24VSqV/Bnat2+PuLg4DBkyBPfdd19Yc/Ia42QtxPHChQuRmpqK0tJSmM1m2dCfL9QQmrQ9ZswYPPHEE4iLi6vTtbqY969Wq1FYWIh58+bB6XQiPz8f2dnZ8vNa11lo4toEg0HZC5aQkIC2bdvC4/Fg7NixuO222+otx054XDQaDQoKCvDLL79g+fLlOHnypJwIf6H1V1/eKrF+AaB379649dZbMWHCBLmZZkN4KkWl8NatW/Gvf/0LVqsVWVlZ8ly70Jyxutw/q9UKi8WCpKQktG7dGjNnzkTr1q3rNL6ovrxZwnOZm5uLVatWYcWKFcjKyqrUUFassepCvCLC4PF45BC2VquF0WhEVFSU3KJDfJ/f70dpaSnKy8vhcDjgdrvlxtMircNut0OhUCAxMRETJ07ElClTkJiY2KCFTIQC65IUWgCQnZ2N9evXY926dTh8+DCsVqucJyKSYUN7zggjIDYc4Zb3er3yxiuMQ6jBET8jDKIIU/bu3RuTJk3ClVdeCYvF0mAnKDEu5Y477sDWrVsRExMjV1rVx1w6cZouKirC5MmTsWjRoohoyBfaof3aa6+VK+lq45mRJAn5+flYtGgRJkyY0KifS9y306dP44YbboDL5ZLzSerT4yOeS1G1WlJSgnvuuQdz586t9xC1aOarVqtRUVGBTZs2IS0tDXv37kVJSUml9Sd+b9XPeqFQU9X/inxDt9stC5r+/ftj2rRpGD16NLRaLZxOZ9hNM+sqLo1GI77++ms888wziIuLgyRJ550yUZf7Jzw4KpUK3333Hbp27QqXy9VkgqGq0LLZbNixYwfS09Oxe/du5Ofnw+fzQa1WQ6vVQqVSVWtrQw+aouLT5/OdE8oWXl5xXUXrC1HE0bp1awwYMADjxo3DkCFD5NQACisKLNJAQkssbL/fj6ysLOzZswe7d+/GsWPHkJeXB5fLJYcLhHtfLGZh/MX/h5Z8h5aIC0Og0WgQHR2N7t27Y+DAgRgyZAi6desml4WLcGBDLHThwfrHP/6BEydO1Ns8uqpG3u12o1evXrj99tvD7qvV0EZekiSUl5dj0aJFcDqdtX5PQjzecccd6NGjR6N+LvH+S0tLsWjRIvl3N1T4JzQXZtiwYbj22msbpEpUrA9JkuQQ4ZkzZ7Br1y5s374dR44cQV5enix8RF6NSqWS10jV9xS69vx+v1yIolKpYDab0bVrVwwdOhSjRo1CcnIyFAqFvL4bOiQkPFg7duzA999/D71eX+9dzMUzKUkSpk+fjri4uCbxYIVzr0XRw/bt23H48GGcPHkSNptNfr+h91p8VRXPoZ5OkZcl7rkkSTAajUhMTETPnj0xaNAg9OnTR25A3dD2llBgkZDFr1Qq5QpD4L95LqIpYVZWFvLy8pCbm4vy8nK4XC54PB44HI5zTtZiBIdarYbRaER8fDzatWuH9u3bo2fPnujYsSPatGkj/26XyyX//sZY6GK2WkNf06Y8OZ9v86mpdLwmhJeyub7/uoiChs6lE+tPfD4hdMrKypCTk4Njx44hKysLubm5yMvLg9VqlXMhq1Y+arVaOc/HZDKhXbt26NChA5KTk5GcnIyOHTvKxQAul6tBPVYX8obWV9+xC9FUOVg13WvxntRqNdRqtbyucnNzkZ2djaNHj+Ls2bPIzc1FUVERHA4HvF6vnPwe6pUUtlaEAWNjY9G+fXu0adMGycnJlVI2gP+22PF4PPJ9p7CiwCJNILaEq1nkCAiEqHK73XC5XKioqDgn1KTX62GxWKDRaKDT6eRmhoLQRV7dKbwxjVxDioFINF4X67Fr6nBnYw/Hbez7WHX9VW3n4HA45I3WarXKeVRiLRmNRpjNZrnnVWjfLZEPKV6/qe5lYyXyR3pfutC8K1EVG/qeA4EAHA6HfJitqKiQRXGooBad+0VuVqgnUhwQQlM3KKoosEiEGQCxoKu6q6sLKwh3ddVBs6EbFhc5IbVff6HhwdB8ndANNTQ8H9o6hR6L5nW/q7O1Ve9fqI0Vdpe2lgKLNHNDUN2fq578q/szIaR+1l91a4/rjraWXJpwFmFLUcpc0IQ0+frj2qOtJUSg5CUghBBCCKHAIoQQQgihwCKEEEIIocAihBBCCCEUWIQQQgghFFiEEEIIIRRYhBBCCCGEAosQQgghhAKLEEIIIYQCixBCCCGEUGARQgghhFBgEUIIIYRQYBFCCCGEUGARQgghhBAKLEIIIYQQCixCCCGEEAosQgghhBBCgUUIIYQQQoFFCCGEEEKBRQghhBBCKLAIIYQQQiiwCCGEEEIosAghhBBCCAUWIYQQQggFFiGEEEIIBRYhhBBCCAUWIYQQQgihwCKEEEIIocAihBBCCKHAIoQQQgghtUTiJWi5BAKB/6poJXU0IYScz0ZWpTFt5vneAwAoFAooFAreKAosEmlGw2AwAABcLhcvCiGEVBEvwkZWtZ9ut7tRhE0wGKz2PYTidrsRDAZ5wyiwSCQgFuyePXuQmpqKe++9F61atYLX6+VpiBByyR9AdTodNm7ciC+++AImkwmBQABKpRJ2ux3XX389UlJSYLfboVKpGvR96PV6LFq0CLt27YLBYJAPxwqFAuXl5YiKisKf//xnGI1G+P1+2m8KLNLUp7Lt27djyZIl2Lp1KwoLC9G3b1+kpKTA7XY3qMEghJDmYCO9Xi8GDBiAjz76CFu2bIHBYEAwGITP58OJEyfQq1cvtGvXDh6Pp0HChUJc7dmzB4sXL0YwGIRCoZA9VV6vFykpKRg3bhzUarX876R5weScFnQq02q1+Ne//oXf//73yMjIgCRJsFgsWLlyJQKBABcoIYQCS6GA3++H2WzGiy++iJiYGBgMBhiNRsTExKCsrAzz589v0DwspVIJn8+HhQsXAgCioqJgNBphsVigVCrxyCOP4K9//SsmT54sCyxCgUWa2HB06tQJGo0GZrNZdoXv3r0bx48fh06n40IlhHDj+1848LLLLsMtt9yC8vJy2bNlsViwdu1a/PzzzzAYDPD7/fX6u/1+P3Q6HZYtW4bt27cjKioKXq8XwWBQ/v1Tp06Fz+eDzWajzabAIpEgrjweD4YOHYqOHTvC6XQCAFQqFaxWK9LT06FUKi9YsUIIIZeSyPJ4PLjtttvQqVMnObFdhO8++ugjnDlzBlqttt7sZjAYhFqtRmlpKd5//31MmjQJSUlJcLlcsmdNr9fLXiumdFBgkQgRWF6vF2azGcOGDYPL5ZIFlVarxdq1a2G32yFJEk9EhBDazP/ZzOjoaIwePRpOpxNKpRLBYBAajQbFxcWYP39+vYqcQCAAjUaDTz/9FA6HA4899li9e8gIBRZpIIMRDAYxfvx4uSIlGAxCp9PhxIkT2LFjR72exgghpLkTDAbRu3dv2XsVmqOVnp5eb6FC4Rk7cuQI/vWvf+Hhhx9G+/bt4XQ6mR9LgUWaC0JYCU+VMByrVq2S/58QQngo/W8jT71eD4PBIAspcVg1GAz44IMPkJ2dfdGHU/G73n33XXTu3Bk333wznE4nw4AUWKQ5GYwff/wRLpdLXrh+vx8GgwHbtm3D6dOnodVqGSYkhJCQQ6lOp8N9990HAPIBVa1Wo6Sk5KJDhSK3KjU1FevXr8dTTz0FnU7H8CAFFmkOBINBaLVanD59GhkZGXjwwQcRHR0Nn88HhUIBSZJQUlKCjIwMqFQqhgkJIURshEolbDYbxo8fj2nTpqGiogIqlQp+vx8WiwVr1qzB0qVL6xQqFELNZrPh3XffRUpKCkaNGiXnfBEKLNIMTmAqlQo///wzJEnC/fffj/79+8vJ7iJxc82aNWw4SgghVVAoFHC5XJg+fTo6dux4TlXhhx9+iJycnFqHCkVi+xdffIHCwkI8/vjj9FxRYJHmgjghWa1WLF26FFOnToVGo8H48ePlqsHQBMu9e/cy2Z0QQqoILLfbjejoaMyYMaOSwNJoNCgsLKx1qFCEHk+ePIlPP/0UDzzwADp16iQffAkFFolwhAFYu3YtysrKcMMNN8Dv92PgwIHo0aOH7IoWvbJSU1MrjWUghBDy376BPp8PkyZNQkpKCioqKiBJEvx+P6KiopCWloZffvmlVqFClUqFBQsWID4+HnfeeSfcbjfFFQUWaTY3UamE3+/HN998g5EjRyIpKQkOhwMGgwETJ06Ex+Op5OretGkT8vPzmexOCCHV4PV6MWPGDCQkJJxjPz/44IOwQoWiuGjDhg1YuXIlnnzySZhMJjkvllBgkQhHuKAzMzNx8OBB3HzzzQgGg/KsqyuvvBKtW7eG1+sFAGg0GuTn52PDhg2QJIlhQkIICUHkYiUkJODhhx8+pwFpYWEhFixYcMFQYTAYhCRJcDqdmDdvHsaOHYurrrqKbRkuMSReguaNmLL+zTffoFu3bhg0aJCcxO52u9G+fXsMGzYMv/zyC6KiouTxC2lpafjd737XaK5qkQdGCCFCyERqqEySJDgcDlx99dVYv3491qxZA4vFIocKV69ejVGjRmHq1Kmw2+3niCbh7frHP/6BU6dO4Y033pD7E9J7RYFFmom40ul0yM3Nxdq1a/Hkk09CkiRZYIk8q8mTJ2PFihWyyDEYDMjMzMThw4fRq1evBk+4FEn4ksTHjRDy/+2CmMEXqQQCATz22GPYs2eP7H0KDRUOHDgQ8fHx8Hg8sg0V48lyc3OxcOFC3HXXXejevXu1Qkw0HyUUWCQCF79KpcLSpUuh0+kwceJEeL1eeaErlUq43W5cfvnl6NGjB44ePQq9Xg+FQgGHw4HVq1ejT58+DZqHJcTV6dOnsX37dnmIKSHk0kQU2yQnJ6Nfv37wer0RKTKE/ezYsSMeeugh/PWvf0VUVBT8fj80Gg0KCgrw/vvv4y9/+cu5G6sk4YMPPoDRaMT9999fSYCF2sZQLx6FFgUWiSDUajUcDgd++uknTJkyBdHR0eeckvx+P4xGIyZOnIj9+/fLMwr1ej3WrVuHe+65p0ETLwOBACRJwsGDBzF37lyYzWaGCgm5hFGpVCgtLcX999+PgQMHRnRfPpVKBafTieuuuw7r16/Hpk2bYDab5VBhamoqRo4ciWuuuQZ2ux0KhQIGgwE7duzATz/9hNdffx1RUVHVeq8IBRaJUPx+P3Q6HdLS0lBUVIQbb7xRnqFV9RQmkt2/+OIL2c2t1Wpx5swZbN26FSkpKfB4PA1qAER4MnRGIiHk0kPYgOZiB8T7nDlzJjIzM+Hz+aBUKuUCIxEqFMVEXq8X8+bNw5AhQzBlyhQmtlNgkeaGqGr55ptvMGzYMHTp0gUOh+McN7Rwx4tk92XLlsnJ7gqFAqmpqZg0aVKDuafFZPrExETcdttt0Ol0FFiEXMIoFAo4nU4MGDCg2kNhJNpal8uFLl264P7778fbb7+N6OhoOVSYn5+PBQsW4NVXX4Ver8c333yDgwcP4t///recB8vwHwUWaSaIk9P+/fuxb98+vPvuu2GJlsmTJ2PlypVyiM5gMGD37t3IyspCUlKS3O+lvo2Tx+NBnz590L9/f948QgiA/5/k3hyabopQ4c0334wNGzZg165dMJlM8qzClStXYty4cRg9ejTmz5+PW2+9FX369Kn20EsosEiEGyalUoklS5agY8eOGDRoEJxOJ4LB4Hm7CzscDvTv3x/du3fHsWPHYDAYoFQqUVZWhrS0NDz00ENy0nxDnFg9Hg9zrwghlexCcxIfosXNzJkz8fDDD8uhwmAwCK1Wi88++wyrV6+GWq3G9OnTIzZ5n1BgkQsscq1Wi7y8PGRkZOCZZ56BXq8P++dvuukmzJ07t9Jrpaen44477pDnFjaUMWUeAiGkuaJUKuF0OnHZZZfh7rvvxgcffCCHCkVbhkOHDuGVV15BXFwcE9sJBVZzQ1TlrVy5EqWlpUhLS8PmzZtrzGUQnYXLysqg0WjkJFOdTocTJ05g586dGDNmDF3ahBByAZHlcrlwxx13YOPGjTh48KBcmS1JEgwGA7RaLS8UocBqljdMkmC327Fs2TJ0794dTqcTZWVlYbmixaiHdu3a4ezZs1Cr1fKMrdTUVIwZM4YXmBBCzkPoTMInnngCM2bMkFMfAoEAlEolFixYgAEDBiAmJoZzBymwSHNB9LRav349Tpw4gf/85z/o3r17rV9n06ZNeOqpp6BWq2VjsW3bNmRnZ6Nt27YNkuxOCCEtAaVSKee03nbbbfj0008rhQrPnj2LDz/8EC+//DLzsC71Z4WXoHktbNGaYfDgwejWrRvsdjscDkfYX06nEwMHDkRycrI8pkKtVqOoqAgZGRnyKAhCCCHnt8Vutxv33HMPLrvsMjm1QjQgXb58OdLT02EwGM5beEQosEiEIOZbHT58GDt37sQtt9win4yUSmXYX6LFw1VXXQW32y33adFoNEhLS4vorsqEENLQhONxEv39TCYTZs6cKdtRgSRJeP/991FaWlrjeDD2BaTAIhEgsJRKJb788kt06tQJw4cPr5MYEqesK6+8Uu48LJLdDx8+jH379kGj0dCLRQhp8QhxU1hYiPLychQUFJwjli5kS+12O4YMGYIbb7wRFRUVkCRJPsSePHkSn3zyyQXtaXXV1QwpUmCRRjQAPp8PJpMJmzZtwk8//YRRo0ZBo9HA6/XW6XTmdDrRoUMH9OzZUw4Tioagq1atkkWYGG1DCCEt0bYKMZWWloZAIIDVq1fLiezhiiy3240HH3wQXbt2rRQqtFgs+P7777FlyxYYjcZKoUIxOkx4wsTfCTvc3MYJEQqsZmkAJEmCyWTCjh078Oqrr0KtVqO8vLzOfaUUCgVMJhMCgQBKSkqgVqsB/NdDZjabkZqais2bN8NsNkOv18v/TgghLc22GgwG/Otf/8KOHTuQkJCAZcuWISMjAyaTKSz7qlAo4PP5EBUVhZkzZ8qeKnFoVSgUWLBgAex2e6VQofjdBw4cwMmTJ+URYmq1GiUlJdi5cyc0Gg3tbzNH9eKLL77MyxCZBkCpVKKkpARffPEF3nzzTTgcDuh0Ovz2229o27YtunfvLp+CwhVXdrsd2dnZ+PDDD7Fx40ZotVr4fD75xOb1epGeng6fzyf3dzEYDLwhhJAWZVtLS0vx8ccfY/HixXIYz+/3Y+3atdBoNEhKSgpL4AivU9euXVFQUIAdO3ZAq9XC6/VCrVbj9OnTCAQCGDlypFxVWFxcjM2bN+ONN96QD8wiagAAO3bsgNFoRFRUFPR6PcOGzRSF0+mkDzJCjYBOp8Mrr7yC1NRUtG7dWv43sRDfffdddOnSRU5WvxB+vx8GgwGrVq3CO++8A6VSCa1We44LWix0l8sFlUqF4cOHY/bs2WzdQAhpUbZ17ty5sm0V4Thh4woLC3H77bfjkUcegcPhqNGbJTxi5eXl+OMf/4iSkpJKkzECgQBef/119OjRAz6fD3/+85+xfft2GI3GcyZoCBvscDiQlJSEN954A2azmT21KLBIfeN0OuU8AbEIxf9rtdpaj7fxer1wu91yMma1D8X/3Nti1lZtRvEQQkhzsq1V7aAQMQqFAnq9Pmz7KkSW2+2udOgVgkmSJPn1HA6H/O/Vvb5CoZB/zmAwUFhRYJGG4Hxja2qTiFmdeAo3gTMQCLCikBDSIm3r+SoGxd/X1vaJ8GNVG1v19S70u6sKPfbRosAiDUQ4C7A+X7M+fw8hhDRH29oQ9jX09Wpjg2l/my8clRPpCrgBFhcXLCGEtlXRZK9LG3xpwDYNhBBCCCEUWIQQQgghFFiEEEIIIRRYhBBCCCGEAosQQgghhAKLEEIIIYQCixBCCCGEUGARQgghhFBgEUIIIYRQYBFCCCGEEAosQgghhBAKLEIIIYQQCixCCCGEEAosQgghhBBCgUUIIYQQQoFFCCGEEEKBRQghhBBCKLAIIYQQQiiwCCGEEEIosAghhBBCCAUWIYQQQggFFiGEEEIIBRYhhBBCCKHAIoQQQgihwCKEEEIIocAihBBCCKHAIoQQQgghFFiEEEIIIRRYhBBCCCEUWIQQQgghhAKLEEIIIYQCixBCCCGEAosQQgghhFBgEUIIIYRQYBFCCCGEUGARQgghhBAKLEIIIYQQCixCCCGEEAosQgghhBAKLEIIIYQQQoFFCCGEEEKBRQghhBBCgUUIIYQQQiiwCCGEEEIosAghhBBCKLAIIYQQQggFFiGEEEIIBRYhhBBCCAUWIYQQQgihwCKEEEIIqW/+HxoIemuUUdFcAAAAAElFTkSuQmCC";
var LOGO_MONOGRAM = "data:image/png;base64,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0wB0pH7wfwHy3XffzbvvvktOTg59fX2Ew2HWrl3LN998g67rdpuJBDOZWNV1HSEEr7zyCjfeeCMvvfSS4z3UyXjpyaSlE52pMiheunQp8+bN48svv2T79u0cPnyYZ599lu+++47q6mrKysoIBAJD/jcWi9HV1cUPP/zA3Llz7YK80y3AyRumTzYeSxVE2Vz08MMPc99999mkwS+//EJdXR1btmyhpKSEwsJCLrroIrKysmzJrKioICcnx3Y8TjMxowLopB1JPjXu8/koKyujrKzMXktPTw+RSARFUewCvNfrtcFyi30Z3ietD//SSUOczMIkdydomkZubi65ubmnLd423i71cg8Pt/ThxtGpkGakzGL4Ooanb26o62jOY1Q+MJFIpB1AaR7SeVvGWBKSqYM5I/GN+mgvmy5VFkLg9Xod6xSQjaJ+vz+tII526FsfaxfToS5er5empibq6uocqZTJYH3fvn2sXLkyY7bPNimjHXdNV9tvPB5n//79DA4OOmqvDMOguLgYn8+XFtUdLVgf87xwOtTO7XMdqWYp8gT9aEMfj0FOBQBpU90YqTpDu5F8jKGPR3xTvdbpXD1/N54qn5qOXTgfx0htdpMC8L8I4lhOY1IAjseYni9jore6Tcg4ne8gmqY5YYc3YetuWda4L6U5X9U2JQCTbeL5AKIs1E82XlRTnditGC9dQXaq2pQyhy+5PFmjPVekLl1XgOrp2kknz2akutZ03uab1iqS3FU3roxyGriMAJjsYJJ7/c5H4DIG4EhAOn2juSwJOHHzpe7EyyRfJpspMJ0EzVEAxwJzpGe8vzPS48b4H/w7shHIdxECAAAAAElFTkSuQmCC";
var LOGO_BADGE    = "data:image/png;base64,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";
var LOGO_STAMP    = "data:image/png;base64,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xFYylFqPk8tdMzk+/k4jDugLehFNsltUvFn9/eeMjY19obbpkgAJ1BLAzPX7MIH00do9kUJkvtcciQlRuDOJ9c8TER9A2QooC9FOPf3FiRAeoU0zy3ptoli8MeQwBpNAzxOoundQ68EyMn+NCgUvgaq+hxf2Cj9qelHiJSM+qPU0ysyaNWvOKk9Pf1vPaP/Q8XpxuY8EeokAPif+MG7mB1WeG91vKt7o6Ojin2dmPlfbykXLYxde5cuYoo79EuvzaZQDv/Do8AD2XoB9vDJ2IRHBbGQv95OASQR04YF/bRTbpKYE4fFHHcMbsjsxOfUz/464t40Qn6rqInKoC49kGAr8BPqB9kCNP4gbANMjgSwQgOAcwv2xXPKC/pp36+UJD/PtiH+XP47vvkOUzv4Se9UOgQlsUjUSHpV9AJ1SfrokQALVBHB/uJ9frjeaGYuL5eV+8wsPttf6hKc68Q5tJVnzOcsVGsv6K5pPe6HSMvdkVM9XNwDo56efBNJMwH2bXCrVjGZev359/3+PHfsZi4tVZw/3Il7i3F4dmNxWx6tWKiv+Go4KV24U4ZE0osRTadIlgV4ngHtmHxis8nE4gfuo6ysaJlbzkWHe6MT60gdBNvcDxIUB4VVBeBV4GwIOVwVygwRIoIrA6pGRi3O2/TFqFV4fkB7hm6+/PuPAgQNlPaxb/sRqPiqDEJFVfTK3y7KOoMr3mApv5LLW04gQ95PAKQJBrQwMU7kVKxzuMIlRYjUflWkMfNoPf8PBhio+xOomCNUr2P5EhdElARIIJ4BWxi/QyvheYkgNSHVGhx/RnT2J13yiZLMyrmcQca9X8dnXo0jQJYHGBFD7kS4OmVWQeAWjsXWnYiT2qj2qQRIPiijr/HjCg4moZzZzPOOSQK8TgOjIUhpjJnMwsuYD1ZZm1k0CjjUeky8f2kYCGSSAD58ty2C2mCUSIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAESIAGDCPQ3Y8vw8PCGJb/+9f8tWbr0p//8+997mjmWcUmABEhAJ2DpG1H9w/m8I3Fx8G9LpdJU1OMYjwRIgAQUgZzyNONOlEpWn+P8EQr0gRKiZo5nXBIgARJoqeajYxvK5yeRyGqEvQlRWqfvo58ESIAEwgi0LT4qYVUDQoKb0BR7VoXTJQESIIEgArGJjyR++cjI8n7b/tQ9keNcODExsT/opAwjARIggVjFR+HEW7E/9FnW07Lt9g+pHXRJgARIoEKgI+Kj6Gr9QW9DhK5T4XRJgARIIBEC0h8kf0OFwg2JnJAnIQESaEgA9+QrhUJhbsOIHYrQ0qv2Zm2RppeTy11jOc5O1THdbBqMTwIkEDMByzpiO8733bonO9rsCkKF/qBH0R90H058CG/FLgiKwzASIIHkCEB8duNsV+LvOCoKi5I6c+LiozIGESpChGSo9J8nS6WHVDhdEiCB7hCACP0TZ74IorAXFYNLOm1F18Sn0xlj+iRAAq0RgAh9gyPn4W8MNaErWkul8VEUn8aMGIMEepKA1xdkWY9MFIsPxA2B4hM3UaZHAhkiMDg4OGf2wMCPkiWIxT1ojj0VV/YoPnGRZDokkGECQyMjecu2i24WHedGzF54rd3sUnzaJcjjSaCHCOTz+UFZzUKynLOsoWKx2PK6XhSfHrpwmFUSiIsAROh6iNAbkh5E6HyI0OFm06b4NEuM8UmABDwC+jzO6XL5zKmpqZPeTnpIgARIoNMEhguFF7y3Y50+GdMnARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIgARIggTYJDOfz+9pMgoeTAAkYTCBnsG2rVq5cOWCwfTSNBEigDQJGig9qPY7kaf6CBT+1kTceSgIkYDAByyTbIDofwJ7BKpsc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";

/* Full wordmark — for login screen (light bg) */
function LogoWordmark({width}) {
  return <img src={LOGO_WORDMARK} alt="Spacio AM" style={{width:width||180,height:"auto",display:"block"}}/>;
}

/* S monogram — for header */
function LogoMark({size}) {
  var h = size || 36;
  return <img src={LOGO_MONOGRAM} alt="Spacio AM" style={{width:h,height:h,objectFit:"contain",display:"block",filter:"brightness(0)"}}/>;
}

/* Badge variant — circular seal */
function LogoBadge({size}) {
  return <img src={LOGO_BADGE} alt="Spacio AM" style={{width:size||40,height:size||40,objectFit:"contain",display:"block"}}/>;
}

/* Slim text row — SPACIO / A—M for header companion to LogoMark */
function LogoText({color}) {
  var c = color || "#FAFAFA";
  return (
    <div style={{display:"flex",flexDirection:"column",lineHeight:1.1}}>
      <span style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:16,fontWeight:400,letterSpacing:".18em",color:c}}>SPACIO</span>
      <div style={{display:"flex",alignItems:"center",gap:3}}>
        <span style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:9,fontWeight:400,letterSpacing:".12em",color:c,opacity:.7}}>A</span>
        <div style={{flex:1,height:.5,background:c,opacity:.5,minWidth:24}}/>
        <span style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:9,fontWeight:400,letterSpacing:".12em",color:c,opacity:.7}}>M</span>
      </div>
    </div>
  );
}


/* ─── Line icons (Lucide-style, stroke 1.5, editorial) — replaces emoji */
var ICONS = {
  dash:"M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  grid:"M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list:"M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  edit:"M4 20h4L18.5 9.5a2 2 0 00-2.8-2.8L5 17.2V20zM14.5 6.5l3 3",
  pencil:"M4 20h4L18.5 9.5a2 2 0 00-2.8-2.8L5 17.2V20zM14.5 6.5l3 3",
  calendar:"M8 2v4M16 2v4M3.5 9h17M5 5h14a1.5 1.5 0 011.5 1.5v12A1.5 1.5 0 0119 20H5a1.5 1.5 0 01-1.5-1.5v-12A1.5 1.5 0 015 5z",
  star:"M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6L12 16.8 6.6 19.6l1.2-6L3.3 9.4l6.1-.8L12 3z",
  settings:"M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.6 7.6 0 000-2l1.7-1.3-1.7-3-2 .8a7.6 7.6 0 00-1.7-1l-.3-2.1h-3.4l-.3 2.1a7.6 7.6 0 00-1.7 1l-2-.8-1.7 3L6 11a7.6 7.6 0 000 2l-1.7 1.3 1.7 3 2-.8a7.6 7.6 0 001.7 1l.3 2.1h3.4l.3-2.1a7.6 7.6 0 001.7-1l2 .8 1.7-3z",
  coins:"M9 8.5a4.5 2.5 0 109 0 4.5 2.5 0 10-9 0zM4.5 15.5a4.5 2.5 0 109 0M4.5 11.5a4.5 2.5 0 109 0M4.5 11.5v8c0 1.4 2 2.5 4.5 2.5s4.5-1.1 4.5-2.5M18 8.5v8",
  home:"M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5",
  file:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h4",
  upload:"M12 16V4M7 9l5-5 5 5M5 20h14",
  download:"M12 4v12M7 11l5 5 5-5M5 20h14",
  trash:"M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13",
  check:"M5 12.5l4.5 4.5L19 7",
  x:"M6 6l12 12M18 6L6 18",
  plus:"M12 5v14M5 12h14",
  alert:"M12 3.2L2.4 19.6a1 1 0 00.87 1.5h17.46a1 1 0 00.87-1.5L12 3.2zM12 9v5M12 17.2v.05",
  refresh:"M20 11a8 8 0 10-2.3 6M20 5v6h-6",
  logout:"M9 21H5a1.5 1.5 0 01-1.5-1.5v-15A1.5 1.5 0 015 3h4M16 17l5-5-5-5M21 12H9",
  search:"M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  arrowRight:"M5 12h14M13 6l6 6-6 6",
  chevronDown:"M6 9l6 6 6-6",
  chevronLeft:"M15 6l-6 6 6 6",
  chevronRight:"M9 6l6 6-6 6",
  camera:"M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  user:"M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0",
  clip:"M21 11.5l-8.6 8.6a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8",
};
function Icon({name, size, stroke, width, style}) {
  var d = ICONS[name] || "";
  return (
    <svg width={size||20} height={size||20} viewBox="0 0 24 24" fill="none" stroke={stroke||"currentColor"} strokeWidth={width||1.5} strokeLinecap="round" strokeLinejoin="round" style={Object.assign({display:"block",flexShrink:0},style||{})} aria-hidden="true">
      {d.split("M").filter(Boolean).map(function(seg,i){return <path key={i} d={"M"+seg}/>;})}
    </svg>
  );
}

/* ─── Combined date-range picker — pick start & end in one calendar popover */
function fmtRangeShort(ds){ if(!ds) return ""; var p=ds.split("-"); return p[2]+"/"+p[1]; }
function DateRangePicker({from,to,onChange,activeStyle,baseStyle}){
  const [open,setOpen]=useState(false);
  const [month,setMonth]=useState(function(){ return from?new Date(from+"T12:00:00"):new Date(); });
  const ref=useRef(null);
  useEffect(function(){ function h(e){ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); } document.addEventListener("mousedown",h); return function(){document.removeEventListener("mousedown",h);}; },[]);
  var yr=month.getFullYear(), mo=month.getMonth();
  var fd=(new Date(yr,mo,1).getDay()+6)%7, dim=new Date(yr,mo+1,0).getDate();
  var cells=[]; for(var i=0;i<fd;i++)cells.push(null);
  for(var d=1;d<=dim;d++){ cells.push(yr+"-"+String(mo+1).padStart(2,"0")+"-"+String(d).padStart(2,"0")); }
  function pick(ds){
    if(!from || (from&&to)){ onChange(ds,""); }
    else if(ds<from){ onChange(ds,from); setOpen(false); }
    else { onChange(from,ds); setOpen(false); }
  }
  var label = from&&to ? fmtRangeShort(from)+" – "+fmtRangeShort(to) : from ? fmtRangeShort(from)+" – …" : "Rango de fechas";
  var btnStyle = Object.assign({}, (from||to)?(activeStyle||{}):(baseStyle||{}), {display:"flex",alignItems:"center",gap:8,minWidth:150});
  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={function(){setOpen(function(p){return !p;});}} style={btnStyle}>
        <Icon name="calendar" size={15} stroke={(from||to)?C.black:C.earth}/>
        <span style={{flex:1,textAlign:"left",color:(from||to)?C.black:C.earth}}>{label}</span>
        <Icon name="chevronDown" size={13} stroke={C.earth} style={{transform:open?"rotate(180deg)":"none",transition:"transform .18s"}}/>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,zIndex:80,background:"#fff",border:"1px solid "+C.line,borderRadius:16,boxShadow:"0 12px 40px rgba(62,63,63,.14)",padding:14,width:268}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <button onClick={function(){setMonth(new Date(yr,mo-1,1));}} style={{background:C.surfaceWarm,border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="chevronLeft" size={16} stroke={C.black}/></button>
            <span style={{fontSize:12.5,fontWeight:600,color:C.black,textTransform:"capitalize"}}>{month.toLocaleDateString("es-GT",{month:"long",year:"numeric"})}</span>
            <button onClick={function(){setMonth(new Date(yr,mo+1,1));}} style={{background:C.surfaceWarm,border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="chevronRight" size={16} stroke={C.black}/></button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
            {["L","M","M","J","V","S","D"].map(function(w,i){return <div key={i} style={{textAlign:"center",fontSize:9.5,fontWeight:700,color:C.earth,padding:"3px 0"}}>{w}</div>;})}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {cells.map(function(ds,idx){
              if(!ds) return <div key={idx}/>;
              var isFrom=ds===from, isTo=ds===to, inRange=from&&to&&ds>=from&&ds<=to;
              var end=isFrom||isTo;
              return <button key={idx} onClick={function(){pick(ds);}} style={{height:32,border:"none",borderRadius:end?9:(inRange?0:9),cursor:"pointer",fontSize:11.5,fontWeight:end?700:400,background:end?C.black:(inRange?C.peach12||"rgba(233,130,106,.14)":"transparent"),color:end?"#fff":C.black,transition:"background .12s"}}>{parseInt(ds.split("-")[2],10)}</button>;
            })}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:10,borderTop:"1px solid "+C.line}}>
            <button onClick={function(){onChange("","");}} style={{background:"none",border:"none",color:C.earth,fontSize:11.5,fontWeight:600,cursor:"pointer"}}>Limpiar</button>
            <button onClick={function(){setOpen(false);}} style={{background:C.black,border:"none",color:"#fff",fontSize:11.5,fontWeight:600,borderRadius:100,padding:"6px 16px",cursor:"pointer"}}>Listo</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Responsive Header Component */
function ResponsiveHeader({tab, setTab, alertCount, pendingQA, navItems, onLogout, role, sheetsOk, adminLabel}) {
  var sc = useScreen();
  var isMobile = sc.mobile;

  return (
    <>
      {/* Top bar */}
      <header style={{background:"#fff",height:isMobile?54:62,display:"flex",alignItems:"center",justifyContent:"space-between",padding:isMobile?"0 16px":"0 24px",position:"sticky",top:0,zIndex:50,borderBottom:"1px solid "+C.line}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:isMobile?8:12}}>
          <img src={LOGO_STAMP} alt="Spacio AM" style={{width:isMobile?38:44,height:isMobile?38:44,objectFit:"contain",display:"block",flexShrink:0}}/>
          {IS_CLAUDE_SANDBOX&&<span style={{fontSize:9,fontWeight:700,background:"#F0EDE8",color:"#938B8A",padding:"2px 6px",borderRadius:4,letterSpacing:".08em",display:isMobile?"none":"block"}}>LOCAL</span>}
          
          {!isMobile&&<div style={{width:1,height:20,background:C.line,margin:"0 6px"}}/>}
          {!isMobile&&<span style={{fontSize:11,color:C.taupe,letterSpacing:".06em"}}>{adminLabel||role}</span>}
          {sheetsOk===false&&!isMobile&&<span style={{fontSize:9,fontWeight:700,background:"#F5EDEC",color:C.red,padding:"2px 6px",borderRadius:4,letterSpacing:".06em"}}>SIN SHEETS</span>}
          {sheetsOk===true&&!isMobile&&<span style={{fontSize:9,fontWeight:700,background:"#EDF5EF",color:C.green,padding:"2px 6px",borderRadius:4,letterSpacing:".06em"}}>● SHEETS</span>}
          {alertCount>0&&<button onClick={function(e){e.stopPropagation();setTab&&setTab("dash");}} title={alertCount+" trabajo"+(alertCount!==1?"s":"")+" con pago pendiente"} style={{background:C.red,color:"#fff",fontSize:9,fontWeight:700,borderRadius:100,padding:"2px 6px",border:"none",cursor:"pointer",lineHeight:1.4}}>{"⚠ "+alertCount}</button>}{pendingQA>0&&<button onClick={function(e){e.stopPropagation();setTab&&setTab("qa");}} title={pendingQA+" limpieza"+(pendingQA!==1?"s":"")+" pendiente"+(pendingQA!==1?"s":"")+" de revisión QA"} style={{background:"#4a5a7a",color:"#fff",fontSize:9,fontWeight:700,borderRadius:100,padding:"2px 6px",marginLeft:2,border:"none",cursor:"pointer",lineHeight:1.4}}>{"★ "+pendingQA}</button>}
        </div>

        {/* Desktop nav */}
        {!isMobile&&(
          <nav style={{display:"flex",background:C.surfaceWarm,borderRadius:100,padding:3,gap:2,border:"1px solid "+C.line}}>
            {navItems.map(function(it){ var k=it[0],l=it[1],ic=it[2]; return (
              <button key={k} onClick={function(){setTab(k);}} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 15px",borderRadius:100,border:"none",fontSize:11.5,fontWeight:600,letterSpacing:".04em",cursor:"pointer",background:tab===k?C.black:"transparent",color:tab===k?"#fff":C.taupe,transition:"all .2s"}}><Icon name={ic} size={15} stroke={tab===k?"#fff":C.taupe}/>{l}</button>
            ); })}
          </nav>
        )}

        {/* Logout */}
        <button onClick={onLogout} style={{background:"none",border:"none",color:C.earth,fontSize:isMobile?12:11.5,cursor:"pointer",fontWeight:500,letterSpacing:".04em",padding:"8px 0"}}>Salir</button>
      </header>

      {/* Mobile bottom tab bar */}
      {isMobile&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"#fff",borderTop:"1px solid "+C.line,display:"flex",height:56,paddingBottom:"env(safe-area-inset-bottom)"}}>
          {navItems.map(function(it){ var k=it[0],l=it[1],ic=it[2]; return (
            <button key={k} onClick={function(){setTab(k);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,border:"none",background:"transparent",cursor:"pointer",padding:"6px 0",transition:"all .15s"}}>
              <Icon name={ic} size={20} stroke={tab===k?C.black:C.taupe}/>
              <span style={{fontSize:9,fontWeight:tab===k?700:500,letterSpacing:".08em",color:tab===k?C.black:C.taupe,textTransform:"uppercase",transition:"all .15s"}}>{l.split(" ")[0]}</span>
              {tab===k&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:24,height:2,background:C.black,borderRadius:100}}/>}
            </button>
          ); })}
        </div>
      )}
    </>
  );
}




/* ─── Inventory Summary — full list with OK + issues */
function InventorySummary({inventario}) {
  const [expanded, setExpanded] = useState(false);
  var all    = inventario||[];
  var issues = all.filter(function(x){return x.estado!=="ok";});
  var ok     = all.filter(function(x){return x.estado==="ok";});
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase"}}>Inventario ({all.length} ítems)</div>
        <button onClick={function(){setExpanded(function(p){return !p;});}} style={{fontSize:11,color:C.earth,fontWeight:600,background:"none",border:"1px solid "+C.gray,borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>
          {expanded?"Ver menos ▲":"Ver completo ▼"}
        </button>
      </div>
      {/* Issues always visible */}
      {issues.map(function(item,i){return (
        <div key={i} style={{padding:"11px 14px",borderRadius:8,background:"#FEF0EC",border:"1px solid #e9c2a0",display:"flex",flexDirection:"column",gap:4}}>
          <div style={{fontSize:13,fontWeight:600,color:"#b5622a"}}>✗ {item.name}</div>
          {item.cantidad>0&&<div style={{fontSize:12,color:C.earth}}>Cantidad: {item.cantidad}</div>}
          {item.foto&&(item.foto.startsWith("http")||item.foto.startsWith("data:"))&&(
            <a href={item.foto} target="_blank" rel="noopener noreferrer">
              <img src={item.foto} alt={item.name} style={{width:80,height:70,objectFit:"cover",borderRadius:6,marginTop:4,border:"1px solid "+C.line}}/>
            </a>
          )}
        </div>
      );})}
      {issues.length===0&&<div style={{padding:"8px 14px",borderRadius:8,background:"#EDF5EF",fontSize:12,color:C.green,fontWeight:600}}>✓ Todo en buen estado</div>}
      {/* Full list only when expanded */}
      {expanded&&ok.map(function(item,i){return (
        <div key={i} style={{padding:"9px 14px",borderRadius:8,background:C.surfaceWarm,border:"1px solid "+C.line,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:12.5,color:C.black}}>{item.name}</span>
          <span style={{fontSize:11,fontWeight:600,color:C.green}}>✓ OK</span>
        </div>
      );})}
    </div>
  );
}

/* ─── Damage Summary — shown in detail view */
function DamageSummary({danios}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{fontSize:10,fontWeight:700,color:C.red,letterSpacing:".18em",textTransform:"uppercase"}}>⚠ Daños reportados ({danios.length})</div>
      {(danios||[]).map(function(d,i){return (
        <div key={i} style={{padding:"12px 14px",borderRadius:8,background:"#F5EDEC",border:"1px solid #DBC8C4",display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:13,fontWeight:700,color:C.red}}>Daño {i+1}: {d.desc||d.tipo||"Sin descripción"}</div>
          {d.origen&&<div style={{fontSize:12,color:C.earth}}>Origen: {d.origen}</div>}
          {d.quienPaga&&<div style={{fontSize:12,color:C.earth}}>Cubre: {d.quienPaga}</div>}
          {d.fotos&&d.fotos.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {d.fotos.map(function(src,pi){return (
                src&&(src.startsWith("http")||src.startsWith("data:"))
                  ? <a key={pi} href={src} target="_blank" rel="noopener noreferrer">
                      <img src={driveThumb(src,300)} alt={"daño "+i+" foto "+pi} style={{width:80,height:70,objectFit:"cover",borderRadius:6,border:"1px solid "+C.line}} onError={function(e){e.target.src=src;}}/>
                    </a>
                  : null
              );})}
            </div>
          )}
        </div>
      );})}
    </div>
  );
}


/* ─── RetryBanner — discrete expandable pending sync */
function RetryBanner({retryQ, setRetryQ, reps, setReps, onSyncing}) {
  const [open, setOpen] = useState(false);
  var q = rq_get();
  return (
    <div style={{background:"#F7F5F2",borderBottom:"1px solid "+C.line,fontFamily:"Montserrat,sans-serif"}}>
      <div style={{padding:"8px 20px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:"#b5622a",flexShrink:0,display:"inline-block"}}/>
        <span style={{fontSize:11.5,color:"#8a5020",fontWeight:600}}>{retryQ.length} trabajo{retryQ.length!==1?"s":""} pendiente{retryQ.length!==1?"s":""} de sincronizar</span>
        <button onClick={function(){setOpen(function(p){return !p;});}} style={{fontSize:10.5,color:C.earth,fontWeight:600,background:"none",border:"1px solid "+C.gray,borderRadius:5,padding:"2px 9px",cursor:"pointer",marginLeft:"auto"}}>{open?"Cerrar ▲":"Ver ▼"}</button>
      </div>
      {open&&(
        <div style={{padding:"0 20px 14px",display:"flex",flexDirection:"column",gap:8}}>
          {q.map(function(item,i){
            var r=item.rep;
            return (
              <div key={i} style={{background:"#fff",borderRadius:8,padding:"12px 14px",border:"1px solid "+C.line,display:"flex",gap:10,alignItems:"center"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.black,marginBottom:2}}>{r.propiedad||"Sin propiedad"}</div>
                  <div style={{fontSize:11,color:C.earth}}>{r.categoria} · {fmtDate(r.fecha)} · {item.attempts} intento{item.attempts!==1?"s":""}</div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={async function(){
                    onSyncing(true,"Reintentando…");
                    await rq_process(function(r2){setReps(function(p){var ix=p.findIndex(function(x){return x.id===r2.id;});if(ix>=0){var n=[...p];n[ix]=r2;return n;}return[r2,...p];});});
                    setRetryQ(rq_pending()); onSyncing(false,"");
                  }} style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:5,border:"none",background:C.black,color:"#fff",cursor:"pointer"}}>↻</button>
                  <button onClick={function(){rq_remove(r.id);setRetryQ(rq_pending());}} style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:5,border:"1px solid "+C.gray,background:"#fff",color:C.red,cursor:"pointer"}}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Executive Summary + PDF export */
function ExecSummary({rep, vendors}) {
  var vn = (function(){var v=vendors&&vendors.find(function(x){return x.email===rep.reportadoPor;});return v?vendorDisplay(v):rep.reportadoPor||"—";})();
  var isCl = isCleaning(rep.categoria);
  var inv = rep.inventario||[];
  var okItems  = inv.filter(function(x){return x.estado==="ok";});
  var badItems = inv.filter(function(x){return x.estado!=="ok";});
  var danios   = rep.danios||[];

  function exportPDF() {
    function isP(v){return v&&typeof v==="string"&&(v.startsWith("http")||v.startsWith("data:"));}
    function imgTag(src){
    if(!isP(src)) return "";
    /* Use thumbnail URL for Drive images to render inline in PDF */
    var dSrc=src;
    var fm=src.match(/[?&/]id=([a-zA-Z0-9_-]{20,})/);
    if(!fm)fm=src.match(/\/d\/([a-zA-Z0-9_-]{20,})\//);
    if(fm)dSrc="https://drive.google.com/thumbnail?id="+fm[1]+"&sz=w300";
    return "<img src='" + dSrc + "' style='max-width:150px;max-height:120px;object-fit:cover;border-radius:5px;border:1px solid #E2E2E0;margin:3px'/>";
  }
    function sec(title,html){return "<h2 style='font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#8C8C8A;margin:24px 0 8px;border-bottom:1px solid #E2E2E0;padding-bottom:5px'>"+title+"</h2>"+html;}
    function row(label,val){return "<div style='display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F4F4F2;font-size:13px'><span style='color:#8C8C8A'>"+label+"</span><span>"+val+"</span></div>";}
    function badge(txt,green){return "<span style='padding:2px 10px;border-radius:100px;font-size:11px;font-weight:600;background:"+(green?"#EDF5EF":"#F5EDEC")+";color:"+(green?"#3d6b52":"#8a3030")+"'>"+txt+"</span>";}
    function photoRow(arr){if(!arr||!arr.length)return "";var imgs=arr.map(imgTag).join("");return imgs?"<div style='display:flex;flex-wrap:wrap;gap:4px;margin-top:6px'>"+imgs+"</div>":"";}
    function cleanSlot(title, val, isArr){var p=isArr?(Array.isArray(val)?val.filter(isP):[]):(isP(val)?[val]:[]);return p.length?"<div style='margin-bottom:10px'><div style='font-size:9px;color:#8C8C8A;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px'>"+title+"</div>"+photoRow(p)+"</div>":"";}

    var L = [
      "<html><head><meta charset='UTF-8'><style>",
      "body{font-family:Georgia,serif;max-width:800px;margin:30px auto;color:#1E1E1E;line-height:1.6}",
      "h1{font-size:24px;font-weight:400;margin:0 0 4px}",
      ".sub{font-size:11px;color:#8C8C8A;letter-spacing:.2em;text-transform:uppercase;margin-bottom:24px}",
      "@media print{body{margin:15px}.no-break{page-break-inside:avoid}}",
      "</style><title>"+rep.propiedad+"</title></head><body>",
      "<h1>"+rep.propiedad+"</h1>",
      "<div class='sub'>"+rep.categoria+" · "+fmtDate(rep.fecha)+"</div>",
      sec("Resumen general",
        row("Técnico", vn)+
        row("Fecha", fmtDate(rep.fecha))+
        row("Total", rep.total?"Q"+rep.total:"Sin tarifa")+
        row("Estado de pago", badge(rep.paid?"✓ Pagado":"● Pendiente", rep.paid))+
        (rep.pagadoPor?row("Pagador", rep.pagadoPor):"")+
        (rep.comentarios?row("Notas", rep.comentarios):"")
      ),
      rep.descripcion?sec("Trabajo realizado","<p style='font-size:13px;margin:0'>"+rep.descripcion+"</p>"):"",
    ];

    /* QA */
    var qaLabels={pendiente:"En revisión",aprobada:"✓ Aprobada",correccion:"⚠ Corrección requerida",corregido:"✓ Corregida",futuro:"→ Tomado en cuenta"};
    if(rep.qaStatus){
      L.push(sec("Control de calidad",
        row("Estado", qaLabels[rep.qaStatus]||rep.qaStatus)+
        (rep.qaComentario?row("Comentario admin", rep.qaComentario):"")+
        (rep.qaRespuesta?row("Respuesta técnico", rep.qaRespuesta):"")
      ));
    }

    /* Inventario */
    if(isCl&&inv.length>0){
      var invHtml="";
      inv.forEach(function(x){
        var ok=x.estado==="ok";
        invHtml+=row(x.name,"<span style='color:"+(ok?"#3d6b52":"#8a3030")+";font-weight:600'>"+(ok?"✓ OK":"✗ Falta")+(x.cantidad>0?" ("+x.cantidad+")":"")+"</span>");
        if(isP(x.foto))invHtml+=photoRow([x.foto]);
      });
      L.push(sec("Inventario ("+inv.length+" ítems)",invHtml));
    }

    /* Daños */
    if(isCl&&rep.hayDanios&&danios.length>0){
      var dmgHtml="";
      danios.forEach(function(d,i){
        dmgHtml+="<div class='no-break' style='background:#FFF5F5;border:1px solid #e8d0d0;border-radius:6px;padding:12px;margin-bottom:10px'>";
        dmgHtml+="<div style='color:#8a3030;font-weight:700;margin-bottom:4px'>Daño "+(i+1)+": "+d.desc+"</div>";
        if(d.origen)dmgHtml+=row("Origen",d.origen);
        if(d.reparacion)dmgHtml+=row("Reparación",d.reparacion);
        if(d.quienPaga)dmgHtml+=row("Cubre",d.quienPaga);
        if(d.comentarios)dmgHtml+=row("Notas",d.comentarios);
        var allFotos=(d.fotos||[]).concat(d.fotos2||[]).filter(isP);
        if(allFotos.length)dmgHtml+=photoRow(allFotos);
        dmgHtml+="</div>";
      });
      L.push(sec("Daños reportados ("+danios.length+")",dmgHtml));
    }
    if(isCl&&!rep.hayDanios) L.push(sec("Daños","<p style='color:#3d6b52;font-weight:600;font-size:13px;margin:0'>✓ Sin daños reportados</p>"));

    /* All cleaning photos */
    if(isCl){
      var photoHtml="";
      photoHtml+=cleanSlot("Foto en uniforme", rep.fotoUniforme, false);
      photoHtml+=cleanSlot("Piso general", rep.fotoPisoGeneral, false);
      if(rep.fotosHabitaciones)rep.fotosHabitaciones.forEach(function(f,i){photoHtml+=cleanSlot("Cuarto "+(i+1),f,false);});
      if(rep.fotosBanos)rep.fotosBanos.forEach(function(b,i){if(b){photoHtml+=cleanSlot("Baño "+(i+1)+" – Ducha",b.ducha,false);photoHtml+=cleanSlot("Baño "+(i+1)+" – Inodoro",b.inodoro,false);}});
      ["fotosMicroondas","fotosCafetera","fotosEcofiltro","fotosLavatrastos","fotosRefrigerador","fotosEstufa","fotosTv","fotosSillon","fotosInsumos","fotosDebajoCama","fotosCloset","fotosRegadera","fotosDucha","fotosMicroondas2","fotosPlatos","fotosDetrasElect"].forEach(function(k){
        var lbl={"fotosMicroondas":"Microondas","fotosCafetera":"Cafetera","fotosEcofiltro":"Ecofiltro","fotosLavatrastos":"Lavatrastos","fotosRefrigerador":"Refrigerador","fotosEstufa":"Estufa","fotosTv":"Televisor","fotosSillon":"Sillón","fotosInsumos":"Insumos de cortesía","fotosDebajoCama":"Debajo de la cama","fotosCloset":"Clóset / Blancos","fotosRegadera":"Regadera","fotosDucha":"Ducha / Mampara","fotosMicroondas2":"Microondas interior","fotosPlatos":"Platos y cubiertos","fotosDetrasElect":"Detrás electrodomésticos"}[k]||k;
        photoHtml+=cleanSlot(lbl,rep[k],false);
      });
      if(rep.fotosVentanas)photoHtml+=cleanSlot("Ventanas",rep.fotosVentanas,true);
      if(rep.fotosGavetas)photoHtml+=cleanSlot("Gavetas",rep.fotosGavetas,true);
      if(rep.fotosDrenajes)rep.fotosDrenajes.forEach(function(f,i){photoHtml+=cleanSlot("Drenaje baño "+(i+1),f,false);});
      if(rep.fotosDetalle)photoHtml+=cleanSlot("Detalle extra",rep.fotosDetalle,true);
      if(photoHtml) L.push(sec("Evidencia fotográfica de limpieza",photoHtml));
    }

    L.push("<div style='margin-top:36px;padding-top:10px;border-top:1px solid #E2E2E0;font-size:10px;color:#aaa;text-align:center'>Spacio AM · Generado "+new Date().toLocaleString("es-GT")+"</div></body></html>");
    var w=window.open("","_blank","width=900,height=750");
    if(!w) return;
    w.document.write(L.join(""));
    w.document.close();
    setTimeout(function(){w.print();},700);
  }

  return (
    <div style={{background:C.surfaceWarm,borderRadius:10,padding:"16px",border:"1px solid "+C.line}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".2em",textTransform:"uppercase"}}>Resumen ejecutivo</div>
        <button onClick={exportPDF} style={{padding:"6px 13px",borderRadius:6,border:"1px solid "+C.gray,background:"#fff",color:C.black,fontSize:11.5,fontWeight:600,cursor:"pointer"}}>📄 PDF</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:isCl&&inv.length>0?12:0}}>
        <Tile label="Técnico" value={vn}/>
        <Tile label="Fecha"   value={fmtDate(rep.fecha)}/>
        <Tile label="Total"   value={rep.total?"Q"+rep.total:"—"} accent={!!rep.total}/>
        <Tile label="Pago"    value={rep.paid?"✓ Pagado":"● Pendiente"}/>
      </div>
      {/* Uniform photo check — only for cleanings */}
      {isCl&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {rep.fotoUniforme&&(rep.fotoUniforme.startsWith("http")||rep.fotoUniforme.startsWith("data:")) ? (
            <div style={{display:"flex",gap:10,alignItems:"center",padding:"8px 12px",borderRadius:8,background:rep._gorraOk==="no"?"#FFF9E6":"#EDF5EF",border:"1px solid "+(rep._gorraOk==="no"?"#E6D88A":"#c8dfc8")}}>
              <a href={rep.fotoUniforme} target="_blank" rel="noopener noreferrer">
                <img src={driveThumb(rep.fotoUniforme,200)} alt="uniforme" style={{width:44,height:44,objectFit:"cover",borderRadius:6,border:"1px solid "+C.line,flexShrink:0}} onError={function(e){e.target.src=rep.fotoUniforme;}}/>
              </a>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:rep._gorraOk==="no"?"#7a6000":C.green}}>
                  {rep._gorraOk==="no"?"⚠ Sin gorra en foto":"✓ Foto de uniforme"}
                </div>
                <div style={{fontSize:10.5,color:C.earth,marginTop:2}}>
                  {rep._gorraOk==="no"?"Proveedor reportó no llevar gorra":"Uniforme documentado"}
                </div>
              </div>
            </div>
          ) : (
            <div style={{padding:"8px 12px",borderRadius:8,background:"#F5EDEC",border:"1px solid #DBC8C4",fontSize:12,fontWeight:700,color:C.red}}>
              ⚠ Sin foto de uniforme — proveedor no subió evidencia
            </div>
          )}
        </div>
      )}
      {isCl&&inv.length>0&&(
        <div style={{display:"flex",gap:8}}>
          {[[okItems.length,"OK","#EDF5EF",C.green],[badItems.length,"Faltantes","#F5EDEC",C.red],[danios.length,"Daños","#F5EDEC",C.red]].map(function(it,i){
            var val=it[0],lbl=it[1],bg=val>0||i>0?it[2]:C.surfaceWarm,cl=val>0||i>0?it[3]:C.taupe;
            return <div key={i} style={{flex:1,padding:"9px 8px",borderRadius:8,background:val>0?bg:C.surfaceWarm,textAlign:"center"}}><div style={{fontSize:18,fontWeight:700,color:val>0?cl:C.taupe}}>{val}</div><div style={{fontSize:9,color:val>0?cl:C.taupe,letterSpacing:".1em",textTransform:"uppercase"}}>{lbl}</div></div>;
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Cleaning Photo Gallery — shows all cleaning-specific photos in admin view */
function CleaningPhotoGallery({rep}) {
  const [light, setLight] = useState(null);
  /* Helper to check if a value is a valid photo URL */
  function isPhoto(v) { return v&&typeof v==="string"&&(v.startsWith("http")||v.startsWith("data:")); }
  function validArr(arr) { return Array.isArray(arr)?arr.filter(isPhoto):[]; }
  function validOne(v) { return isPhoto(v)?[v]:[]; }

  /* Build sections array — ALL expected cleaning photo slots */
  var sections   = [];
  var expected   = 0; /* total expected photo slots */
  var uploaded   = 0; /* slots that have a photo */

  function slot(title, val, isArr) {
    expected++;
    var photos = isArr ? validArr(val) : validOne(val);
    if(photos.length>0){ uploaded++; sections.push({title:title,photos:photos}); }
  }
  function slotArr(title, arr) {
    if(!arr||!arr.length) return;
    arr.forEach(function(v,i){
      expected++;
      var p = isArr2(v)?validArr(v):validOne(v);
      if(p.length>0){ uploaded++; sections.push({title:title+" "+(i+1),photos:p}); }
    });
  }
  function isArr2(v){return Array.isArray(v);}

  /* Selfie */
  slot("Foto en uniforme",       rep.fotoUniforme,       false);

  /* Trad — rooms */
  if(rep.fotosHabitaciones&&rep.fotosHabitaciones.length){
    rep.fotosHabitaciones.forEach(function(f,i){expected++;var p=validOne(f);if(p.length){uploaded++;sections.push({title:"Cuarto "+(i+1),photos:p});}});
  } else { expected++; } /* at least 1 room expected */

  slot("Piso general",           rep.fotoPisoGeneral,    false);

  /* Bathrooms */
  if(rep.fotosBanos&&rep.fotosBanos.length){
    rep.fotosBanos.forEach(function(b,i){
      if(!b) return;
      expected+=2;
      var d=validOne(b.ducha),in2=validOne(b.inodoro);
      if(d.length){ uploaded++; sections.push({title:"Baño "+(i+1)+" – Ducha",photos:d}); }
      if(in2.length){ uploaded++; sections.push({title:"Baño "+(i+1)+" – Inodoro",photos:in2}); }
    });
  } else { expected+=2; }

  /* Kitchen */
  slot("Microondas",             rep.fotosMicroondas,    false);
  slot("Cafetera",               rep.fotosCafetera,      false);
  slot("Ecofiltro",              rep.fotosEcofiltro,     false);
  slot("Lavatrastos",            rep.fotosLavatrastos,   false);
  slot("Refrigerador",           rep.fotosRefrigerador,  false);
  slot("Estufa",                 rep.fotosEstufa,        false);

  /* Sala */
  slot("Televisor",              rep.fotosTv,            false);
  slot("Sillón",                 rep.fotosSillon,        false);
  slot("Insumos de cortesía",    rep.fotosInsumos,       false);

  /* Detail */
  slot("Debajo de la cama",      rep.fotosDebajoCama,    false);
  slot("Clóset / Blancos",       rep.fotosCloset,        false);

  /* Prof-only */
  slot("Regadera",               rep.fotosRegadera,      false);
  slot("Ducha / Mampara",        rep.fotosDucha,         false);
  slot("Microondas (interior)",  rep.fotosMicroondas2,   false);
  slot("Platos y cubiertos",     rep.fotosPlatos,        false);
  slot("Detrás electrodomésticos",rep.fotosDetrasElect,  false);

  if(rep.fotosDrenajes&&rep.fotosDrenajes.length)
    rep.fotosDrenajes.forEach(function(f,i){expected++;var p=validOne(f);if(p.length){uploaded++;sections.push({title:"Drenaje baño "+(i+1),photos:p});}});
  if(rep.fotosVentanas&&rep.fotosVentanas.length){expected++;var vw=validArr(rep.fotosVentanas);if(vw.length){uploaded++;sections.push({title:"Ventanas",photos:vw});}}
  if(rep.fotosGavetas&&rep.fotosGavetas.length){expected++;var gv=validArr(rep.fotosGavetas);if(gv.length){uploaded++;sections.push({title:"Gavetas",photos:gv});}}
  if(rep.fotosDetalle&&rep.fotosDetalle.length){expected++;var dt=validArr(rep.fotosDetalle);if(dt.length){uploaded++;sections.push({title:"Detalle extra",photos:dt});}}

  /* Inventory photos */
  if(rep.inventario&&rep.inventario.length){
    rep.inventario.forEach(function(item){
      if(isPhoto(item.foto)) sections.push({title:"Inventario: "+item.name, photos:[item.foto]});
    });
  }

  /* Damage photos */
  if(rep.danios&&rep.danios.length){
    rep.danios.forEach(function(d,i){
      var p=validArr(d.fotos).concat(validArr(d.fotos2));
      if(p.length) sections.push({title:"Daño "+(i+1)+(d.desc?" – "+d.desc.slice(0,30):""), photos:p});
    });
  }

  var pct = expected>0 ? Math.round(uploaded/expected*100) : 100;
  var lowPhotos = pct < 50;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Photo coverage indicator */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:8,background:lowPhotos?"#F5EDEC":C.surfaceWarm,border:"1px solid "+(lowPhotos?"#DBC8C4":C.line)}}>
        <div>
          <div style={{fontSize:12.5,fontWeight:600,color:lowPhotos?C.red:C.black}}>
            {lowPhotos?"⚠ Fotos insuficientes":"📷 Evidencia fotográfica"}
          </div>
          <div style={{fontSize:11,color:C.earth,marginTop:2}}>
            {uploaded} de {expected} secciones con foto ({pct}%)
            {lowPhotos&&" — el proveedor no subió suficientes fotos"}
          </div>
        </div>
        <div style={{fontSize:18,fontWeight:700,color:lowPhotos?C.red:C.green}}>{pct}%</div>
      </div>

      {sections.length===0&&(
        <div style={{padding:"14px",background:"#F5EDEC",borderRadius:8,fontSize:13,color:C.red,fontWeight:600,textAlign:"center"}}>
          ⚠ No se subió ninguna foto en este reporte
        </div>
      )}

      {/* Gallery */}
      {/* Build flat list of ALL photos for global navigation */}
      {(function(){
        var allPhotos = [];
        sections.forEach(function(sec){ sec.photos.forEach(function(p){ allPhotos.push(p); }); });
        return (
          <>
            {light&&<PhotoLightbox photos={light.photos} initialIdx={light.idx} onClose={function(){setLight(null);}}/>}
            {(function(){
              var gIdx = 0;
              return sections.map(function(sec,si) {
                var sectionStart = gIdx;
                gIdx += sec.photos.length;
                return (
                  <div key={si} style={{marginBottom:12}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase",marginBottom:6}}>{sec.title}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {sec.photos.map(function(src,pi){
                        var globalPhotoIdx = sectionStart + pi;
                        return (
                          <div key={pi} onClick={function(){ setLight({photos:allPhotos,idx:globalPhotoIdx}); }} style={{cursor:"zoom-in",flexShrink:0}}>
                            <img src={driveThumb(src,300)} alt={sec.title}
                              style={{width:100,height:84,objectFit:"cover",borderRadius:7,border:"1px solid "+C.line,cursor:"zoom-in",background:"#f0f0f0"}}
                              onError={function(e){e.target.src=src;}}/>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </>
        );
      })()}
    </div>
  );
}

/* ─── QA Review Section — shown in admin DetailModal for cleaning reports */
function QASection({rep, onQA}) {
  const [mode,    setMode]    = useState(null); /* null | "corregir" */
  const [comment, setComment] = useState("");
  const [busy,    setBusy]    = useState(false);

  var st = rep.qaStatus;

  async function approve() {
    setBusy(true);
    await onQA(rep.id,"aprobada","");
    setBusy(false);
  }
  async function flagCorrection() {
    if (!comment.trim()) return;
    setBusy(true);
    await onQA(rep.id,"correccion",comment.trim());
    setBusy(false); setMode(null); setComment("");
  }

  var statusColors = {
    pendiente:  {bg:"#F0F0EE",tx:C.taupe,  label:"Pendiente de revisión"},
    aprobada:   {bg:"#EDF5EF",tx:C.green,  label:"✓ Limpieza aprobada"},
    correccion: {bg:"#F5EDEC",tx:C.red,    label:"⚠ Necesita corrección"},
    corregido:  {bg:"#EDF5EF",tx:C.green,  label:"✓ Corrección realizada"},
    futuro:     {bg:"#EDEAE3",tx:C.taupe,  label:"→ Tomado en cuenta"},
  };
  var sc = statusColors[st] || statusColors["pendiente"];

  return (
    <div style={{borderTop:"1px solid "+C.line,paddingTop:16,display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:10,color:C.earth,fontWeight:700,letterSpacing:".18em",textTransform:"uppercase"}}>Control de Calidad</div>

      {/* Status badge */}
      <div style={{padding:"10px 14px",borderRadius:8,background:sc.bg,fontSize:13,fontWeight:700,color:sc.tx}}>{sc.label}</div>

      {/* Admin comment if flagged */}
      {(st==="correccion"||st==="corregido"||st==="futuro")&&rep.qaComentario&&(
        <div style={{background:C.surfaceWarm,borderRadius:8,padding:"11px 14px",border:"1px solid "+C.line}}>
          <div style={{fontSize:9.5,color:C.earth,fontWeight:700,letterSpacing:".16em",textTransform:"uppercase",marginBottom:5}}>Comentario admin</div>
          <div style={{fontSize:13,color:C.black,lineHeight:1.6}}>{rep.qaComentario}</div>
          <div style={{fontSize:10,color:C.taupe,marginTop:4}}>{fmtDate(rep.qaFecha)}</div>
        </div>
      )}

      {/* Vendor response */}
      {(st==="corregido"||st==="futuro")&&(
        <div style={{padding:"8px 12px",borderRadius:8,background:statusColors[st].bg,fontSize:12,color:statusColors[st].tx,fontWeight:600}}>
          Respuesta del proveedor: {st==="corregido"?"Corrección realizada":"Tomado en cuenta para próximas limpiezas"}
          {rep.qaRespuestaFecha&&<span style={{fontWeight:400,marginLeft:6,opacity:.7}}>({fmtDate(rep.qaRespuestaFecha)})</span>}
        </div>
      )}

      {/* Admin action buttons */}
      {(st==="pendiente"||st==="correccion")&&!mode&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={approve} disabled={busy} style={{flex:1,padding:"11px 14px",borderRadius:7,border:"none",background:C.green,color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer",letterSpacing:".04em"}}>
            {busy?"…":"✓ Aprobar limpieza"}
          </button>
          <button onClick={function(){setMode("corregir");}} style={{flex:1,padding:"11px 14px",borderRadius:7,border:"1.5px solid "+C.red,background:"#fff",color:C.red,fontSize:12.5,fontWeight:600,cursor:"pointer",letterSpacing:".04em"}}>
            ⚠ Necesita corrección
          </button>
        </div>
      )}

      {/* Comment input for correction */}
      {mode==="corregir"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <F label="Comentario para el proveedor">
            <textarea rows={3} placeholder="Describe qué debe corregirse o mejorar…" value={comment} onChange={function(e){setComment(e.target.value);}}/>
          </F>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){setMode(null);setComment("");}} style={{flex:1,padding:"10px",borderRadius:7,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Cancelar</button>
            <button onClick={flagCorrection} disabled={!comment.trim()||busy} style={{flex:2,padding:"10px",borderRadius:7,border:"none",background:busy||!comment.trim()?C.gray:C.red,color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
              {busy?"Enviando…":"Enviar corrección →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════
   FEEDBACK BUBBLE — non-invasive corner popup during forms
   Shows around step 5-7 of any wizard
   ══════════════════════════════════════════════════════════ */
function FeedbackBubble({vendor, onSaveFeedback, currentStep, totalSteps}) {
  const [open,    setOpen]    = useState(false);
  const [sent,    setSent]    = useState(false);
  const [text,    setText]    = useState("");
  const [type,    setType]    = useState("mejora"); /* mejora | error */
  const [visible, setVisible] = useState(false);

  /* Show bubble around the middle of the form */
  useEffect(function(){
    if (!sent && totalSteps && currentStep >= Math.floor(totalSteps/2)) {
      var t = setTimeout(function(){ setVisible(true); }, 1500);
      return function(){ clearTimeout(t); };
    }
  }, [currentStep, totalSteps, sent]);

  function submit() {
    if (!text.trim()) return;
    var fb = {
      id:        Date.now(),
      fecha:     todayStr(),
      hora:      new Date().toLocaleTimeString("es-GT",{hour:"2-digit",minute:"2-digit"}),
      usuario:   vendor ? vendor.email : "anon",
      tipo:      type,
      mensaje:   text.trim(),
      visto:     false,
    };
    onSaveFeedback(fb);
    setText(""); setSent(true); setOpen(false);
  }

  if (!visible || sent) return null;

  return (
    <div style={{position:"fixed",bottom:80,right:16,zIndex:500,maxWidth:280,fontFamily:"Montserrat,sans-serif"}}>
      {!open&&(
        <button onClick={function(){setOpen(true);}} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderRadius:100,background:"#fff",border:"1px solid "+C.line,boxShadow:"0 2px 12px rgba(0,0,0,.12)",color:C.earth,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
          💬 ¿Tienes un comentario?
          <button onClick={function(e){e.stopPropagation();setVisible(false);}} style={{background:"none",border:"none",color:C.gray,fontSize:14,cursor:"pointer",padding:"0 0 0 4px",lineHeight:1}}>×</button>
        </button>
      )}
      {open&&(
        <div style={{background:"#fff",borderRadius:14,padding:"16px",boxShadow:"0 4px 24px rgba(0,0,0,.14)",border:"1px solid "+C.line}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:C.black}}>Tu opinión nos ayuda</div>
            <button onClick={function(){setOpen(false);}} style={{background:"none",border:"none",color:C.gray,fontSize:16,cursor:"pointer",lineHeight:1}}>×</button>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {[["mejora","💡 Sugerencia"],["error","🐛 Error"]].map(function(it){
              return <button key={it[0]} onClick={function(){setType(it[0]);}} style={{flex:1,padding:"6px",borderRadius:6,border:"1.5px solid "+(type===it[0]?C.black:C.gray),background:type===it[0]?C.black:"#fff",color:type===it[0]?"#fff":C.earth,fontSize:11.5,fontWeight:600,cursor:"pointer"}}>{it[1]}</button>;
            })}
          </div>
          <textarea rows={3} placeholder={type==="error"?"Describe el error que encontraste…":"¿Qué mejorarías en el app?"} value={text} onChange={function(e){setText(e.target.value);}} style={{width:"100%",border:"1px solid "+C.gray,borderRadius:8,padding:"9px 11px",fontSize:13,fontFamily:"Montserrat,sans-serif",outline:"none",resize:"none",boxSizing:"border-box"}}/>
          <button onClick={submit} disabled={!text.trim()} style={{marginTop:10,width:"100%",padding:"10px",borderRadius:7,border:"none",background:text.trim()?C.black:C.gray,color:"#fff",fontSize:12.5,fontWeight:600,cursor:text.trim()?"pointer":"default",letterSpacing:".04em"}}>Enviar comentario →</button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SCHEDULE SYSTEM
   ══════════════════════════════════════════════════════════ */
function blankSched() {
  return {id:"",fecha:todayStr(),hora:"09:00",propiedad:"",vendorId:"",tipo:"Limpieza",codigoAcceso:"",notas:""};
}

/* Admin: Schedule management */

/* Hospitable URL config widget — shown in ScheduleCfg */

/* ─── CSV Importer — parses Hospitable export format */
function CSVImporter({vendors, props, onImport, onClose}) {
  const [raw,     setRaw]     = useState("");
  const [preview, setPreview] = useState(null);
  const [err,     setErr]     = useState("");
  const [busy,    setBusy]    = useState(false);

  function parseCSV(text) {
    var lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return {error:"El archivo está vacío o tiene formato incorrecto."};

    /* Detect separator */
    var sep = lines[0].includes("\t") ? "\t" : ",";

    function splitLine(line) {
      /* Handle quoted fields */
      var result=[]; var cur=""; var inQ=false;
      for(var i=0;i<line.length;i++){
        var c=line[i];
        if(c==='"') {inQ=!inQ; continue;}
        if(c===sep&&!inQ){result.push(cur.trim());cur="";}
        else cur+=c;
      }
      result.push(cur.trim());
      return result;
    }

    var headers = splitLine(lines[0]).map(function(h){return h.toLowerCase().replace(/[^a-z0-9]/g,"");});

    /* Column detection */
    function col(keys) {
      for(var i=0;i<keys.length;i++){
        var idx=headers.indexOf(keys[i]);
        if(idx>=0) return idx;
      }
      return -1;
    }

    var idxDate  = col(["startdate","start","startdatetime","scheduleddate","date"]);
    var idxEnd   = col(["enddate","end","enddatetime"]);
    var idxType  = col(["type","tasktype","cleaningtype"]);
    var idxFName = col(["teammatefirstname","firstname","assigneefirstname","technicianfirst"]);
    var idxLName = col(["teammatelastname","lastname","assigneelastname","technicianlast"]);
    var idxEmail = col(["teammateemail","email","assigneeemail","technicianaemail"]);
    var idxProp  = col(["listing","listingname","property","propertyname","unit","apartment"]);
    var idxTime  = col(["starttime","time","hour"]);
    var idxNote  = col(["notes","note","comment","comments","description"]);

    if (idxDate<0) return {error:"No se encontró columna de fecha. Verifica que el CSV tenga 'Start Date'."};

    var entries = [];
    for(var r=1;r<lines.length;r++){
      var cols = splitLine(lines[r]);
      if(!cols[idxDate]||cols[idxDate].trim()==="") continue;

      var dateRaw = cols[idxDate]||"";
      /* Normalize date to yyyy-MM-dd */
      var fecha = dateRaw.replace(/\//g,"-").replace(/(\d{4})-(\d{1,2})-(\d{1,2}).*/, function(_,y,m,d){
        return y+"-"+m.padStart(2,"0")+"-"+d.padStart(2,"0");
      });
      if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        /* Try MM/DD/YYYY or DD-MM-YYYY */
        var parts = dateRaw.split(/[\/-]/);
        if(parts.length===3){
          if(parts[0].length===4) fecha=parts[0]+"-"+parts[1].padStart(2,"0")+"-"+parts[2].padStart(2,"0");
          else fecha=parts[2]+"-"+parts[0].padStart(2,"0")+"-"+parts[1].padStart(2,"0");
        }
      }

      var fname  = idxFName>=0 ? (cols[idxFName]||"").trim() : "";
      var lname  = idxLName>=0 ? (cols[idxLName]||"").trim() : "";
      var email  = idxEmail>=0 ? (cols[idxEmail]||"").trim() : "";
      var prop   = idxProp>=0  ? (cols[idxProp]||"").trim()  : "";
      var tipo   = idxType>=0  ? (cols[idxType]||"Limpieza").trim() : "Limpieza";
      var hora   = idxTime>=0  ? (cols[idxTime]||"").trim()  : "";
      var notas  = idxNote>=0  ? (cols[idxNote]||"").trim()  : "";

      /* Normalize tipo */
      var tipoMap = {cleaning:"Limpieza",maintenance:"Mantenimiento",inspection:"Revisión","deep cleaning":"Limpieza Profunda","limpieza profunda":"Limpieza Profunda"};
      tipo = tipoMap[tipo.toLowerCase()] || tipo || "Limpieza";

      /* Fuzzy match vendor */
      var query = [fname,lname,email].filter(Boolean).join(" ");
      var match = fuzzyMatchVendor(query, vendors.filter(function(v){return v.active;}));

      /* Fuzzy match property */
      var propMatch = null;
      if(prop) {
        var bestProp=null,bestScore=0;
        (props||[]).forEach(function(p){
          var s=similarity(prop, p.name);
          if(s>bestScore){bestScore=s;bestProp=p;}
        });
        if(bestProp&&bestScore>0.4) propMatch={prop:bestProp,score:bestScore};
      }

      entries.push({
        fecha:      fecha,
        hora:       hora,
        tipo:       tipo,
        rawProp:    prop,
        propMatch:  propMatch,
        rawVendor:  query,
        vendorMatch:match,
        notas:      notas,
        email:      email,
      });
    }

    return {entries:entries};
  }

  function handlePaste(text) {
    setErr(""); setPreview(null);
    var result = parseCSV(text);
    if(result.error) { setErr(result.error); return; }
    if(!result.entries.length) { setErr("No se encontraron filas con datos."); return; }
    setPreview(result.entries);
  }

  function doImport() {
    if(!preview||!preview.length) return;
    setBusy(true);
    var newScheds = preview.map(function(e,i){
      return {
        id:          "csv"+Date.now()+i,
        fecha:       e.fecha,
        hora:        e.hora,
        propiedad:   e.propMatch ? e.propMatch.prop.name : e.rawProp,
        vendorId:    e.vendorMatch.vendor ? e.vendorMatch.vendor.id : "",
        vendorRaw:   e.rawVendor,
        tipo:        e.tipo,
        codigoAcceso:"",
        notas:       e.notas,
      };
    });
    onImport(newScheds);
    setBusy(false);
    onClose();
  }

  var IS = {border:"1px solid "+C.gray,borderRadius:6,padding:"8px 11px",fontSize:12.5,fontFamily:"Montserrat,sans-serif",outline:"none",width:"100%",boxSizing:"border-box",background:"#fff"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:14,padding:"20px",maxWidth:640,width:"100%",maxHeight:"90vh",overflow:"auto",fontFamily:"Montserrat,sans-serif",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.black}}>Importar desde Hospitable</div>
            <div style={{fontSize:11.5,color:C.earth,marginTop:3}}>Pega el CSV de la vista "Detalles" de Hospitable</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:C.gray,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {/* Instructions */}
        <div style={{background:"#EDF5EF",borderRadius:8,padding:"11px 14px",fontSize:12,lineHeight:1.7}}>
          <div style={{fontWeight:700,color:C.green,marginBottom:4}}>Cómo exportar de Hospitable:</div>
          <div style={{color:C.black}}>1. Ve a <b>Metrics → Operations → Details</b></div>
          <div style={{color:C.black}}>2. Selecciona el rango de fechas que quieres importar</div>
          <div style={{color:C.black}}>3. Presiona <b>Export / CSV</b> arriba a la derecha</div>
          <div style={{color:C.black}}>4. Abre el archivo y copia todo el contenido (Ctrl+A, Ctrl+C)</div>
          <div style={{color:C.black}}>5. Pega aquí abajo</div>
        </div>

        {/* Paste area */}
        {!preview&&(
          <div>
            <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase",marginBottom:6}}>Pega el contenido del CSV</div>
            <textarea
              rows={8}
              placeholder={"Start Date,End Date,Type,Teammate First Name,Teammate Last Name,Teammate Email\n2026-05-20,2026-05-20,Cleaning,Lilia,Del Cid,dubonmar20@gmail.com\n..."}
              value={raw}
              onChange={function(e){setRaw(e.target.value);}}
              style={{width:"100%",border:"1.5px solid "+C.gray,borderRadius:8,padding:"10px 12px",fontSize:12,fontFamily:"monospace",outline:"none",resize:"vertical",boxSizing:"border-box",minHeight:140}}
            />
            {err&&<div style={{color:C.red,fontSize:12,marginTop:6,fontWeight:600}}>{err}</div>}
            <button onClick={function(){handlePaste(raw);}} disabled={!raw.trim()} style={{marginTop:10,width:"100%",padding:"12px",borderRadius:7,border:"none",background:raw.trim()?C.black:C.gray,color:"#fff",fontSize:13,fontWeight:600,cursor:raw.trim()?"pointer":"default"}}>
              Analizar CSV →
            </button>
          </div>
        )}

        {/* Preview */}
        {preview&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13.5,fontWeight:700,color:C.black}}>{preview.length} turnos detectados</div>
              <button onClick={function(){setPreview(null);setRaw("");}} style={{fontSize:11.5,color:C.earth,background:"none",border:"1px solid "+C.gray,borderRadius:5,padding:"3px 9px",cursor:"pointer"}}>← Editar</button>
            </div>
            <div style={{display:"flex",gap:8,fontSize:11.5}}>
              <span style={{padding:"3px 10px",borderRadius:100,background:"#EDF5EF",color:C.green,fontWeight:700}}>✓ {preview.filter(function(e){return e.vendorMatch.score>0.7;}).length} técnicos identificados</span>
              <span style={{padding:"3px 10px",borderRadius:100,background:"#FFF9E6",color:"#7a6000",fontWeight:700}}>⚠ {preview.filter(function(e){return e.vendorMatch.score<=0.7&&e.vendorMatch.vendor;}).length} coincidencia baja</span>
              <span style={{padding:"3px 10px",borderRadius:100,background:"#F5EDEC",color:C.red,fontWeight:700}}>✕ {preview.filter(function(e){return !e.vendorMatch.vendor;}).length} sin match</span>
            </div>

            {/* Preview list */}
            <div style={{maxHeight:320,overflow:"auto",display:"flex",flexDirection:"column",gap:6}}>
              {preview.map(function(e,i){
                var vm=e.vendorMatch; var pm=e.propMatch;
                var bg=vm.score>0.7?"#fff":vm.vendor?"#FFF9E6":"#FFF5F5";
                return (
                  <div key={i} style={{background:bg,borderRadius:7,padding:"10px 12px",border:"1px solid "+C.line,fontSize:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,color:C.black,marginBottom:2}}>
                          {pm?pm.prop.name:<span style={{color:C.red}}>{e.rawProp||"Sin propiedad"}</span>}
                        </div>
                        <div style={{color:C.earth}}>{fmtDate(e.fecha)} {e.hora&&"· "+e.hora} · {e.tipo}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        {vm.vendor?(
                          <div style={{color:vm.score>0.7?C.green:"#7a6000",fontWeight:600}}>
                            {vm.score>0.7?"✓":"⚠"} {vendorDisplay(vm.vendor)}
                            <div style={{fontSize:10,color:C.taupe,fontWeight:400}}>{Math.round(vm.score*100)}% match</div>
                          </div>
                        ):(
                          <div style={{color:C.red,fontWeight:600}}>✕ {e.rawVendor||"Sin técnico"}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={doImport} disabled={busy} style={{padding:"13px",borderRadius:7,border:"none",background:busy?C.gray:C.black,color:"#fff",fontSize:13,fontWeight:600,cursor:busy?"default":"pointer",letterSpacing:".04em"}}>
              {busy?"Importando…":"✓ Importar "+preview.length+" turnos →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}



/* ─── Hospitable live sync button */
function HospSyncButton({onImport}) {
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);
  const [err,    setErr]    = useState("");

  async function sync() {
    setBusy(true); setErr(""); setResult(null);
    try {
      var r = await apiCall("syncHospitable", {days:14});
      if (!r.schedules||!r.schedules.length) {
        setErr("Sin tareas encontradas en Hospitable para los próximos 14 días. " + (r.message||""));
        return;
      }
      onImport(r.schedules);
      setResult({count:r.schedules.length, source:r.source, period:r.period});
    } catch(e) {
      setErr("Error: "+(e&&e.message?e.message:"No se pudo conectar con Hospitable"));
    } finally { setBusy(false); }
  }

  return (
    <div style={{background:"#EDF5EF",borderRadius:8,padding:"12px 14px",border:"1px solid #c8dfc8"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
        <div>
          <div style={{fontSize:9.5,fontWeight:700,color:C.green,letterSpacing:".16em",textTransform:"uppercase",marginBottom:3}}>Sincronizar con Hospitable</div>
          <div style={{fontSize:11.5,color:C.earth}}>Importa automáticamente los próximos 14 días de limpiezas y mantenimientos</div>
        </div>
        <button onClick={sync} disabled={busy} style={{flexShrink:0,padding:"9px 16px",borderRadius:7,border:"none",background:busy?C.gray:"#3d6b52",color:"#fff",fontSize:12.5,fontWeight:700,cursor:busy?"default":"pointer",whiteSpace:"nowrap"}}>
          {busy?"Sincronizando…":"↻ Sync"}
        </button>
      </div>
      {result&&(
        <div style={{marginTop:8,fontSize:12,color:C.green,fontWeight:600}}>
          ✓ {result.count} turno{result.count!==1?"s":""} importado{result.count!==1?"s":""} · {result.period}
        </div>
      )}
      {err&&<div style={{marginTop:8,fontSize:12,color:C.red,fontWeight:600}}>{err}</div>}
    </div>
  );
}


function HospUrlConfig({hospUrlDay, hospUrlWeek, onSaveDay, onSaveWeek}) {
  const [editD, setEditD] = useState(false);
  const [editW, setEditW] = useState(false);
  const [valD,  setValD]  = useState(hospUrlDay||"");
  const [valW,  setValW]  = useState(hospUrlWeek||"");

  function UrlRow({label, val, editing, setEditing, curVal, setCurVal, onSave, placeholder}) {
    return (
      <div style={{borderBottom:"1px solid "+C.line,paddingBottom:10,marginBottom:10}}>
        <div style={{fontSize:9,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase",marginBottom:5}}>{label}</div>
        {!editing&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,fontSize:11.5,color:val?C.black:C.taupe,fontStyle:val?"normal":"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {val||"Sin configurar"}
            </div>
            <button onClick={function(){setCurVal(val||"");setEditing(true);}} style={{flexShrink:0,fontSize:11,padding:"3px 9px",borderRadius:5,border:"1px solid "+C.gray,background:"#fff",color:C.earth,cursor:"pointer",fontWeight:600}}>
              {val?"✏":"+ Agregar"}
            </button>
          </div>
        )}
        {editing&&(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <input value={curVal} onChange={function(e){setCurVal(e.target.value);}} placeholder={placeholder} style={{border:"1.5px solid "+C.earth,borderRadius:6,padding:"7px 10px",fontSize:12,fontFamily:"Montserrat,sans-serif",outline:"none",width:"100%",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:6}}>
              <button onClick={function(){if(onSave)onSave(curVal.trim());setEditing(false);}} style={{flex:1,padding:"7px",borderRadius:5,border:"none",background:C.black,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Guardar</button>
              <button onClick={function(){setEditing(false);}} style={{padding:"7px 12px",borderRadius:5,border:"1px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,cursor:"pointer"}}>✕</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{background:C.surfaceWarm,borderRadius:8,padding:"12px 14px",border:"1px solid "+C.line}}>
      <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase",marginBottom:10}}>Enlaces de Hospitable</div>
      <UrlRow label="Programa de hoy" val={hospUrlDay} editing={editD} setEditing={setEditD} curVal={valD} setCurVal={setValD} onSave={onSaveDay} placeholder="https://share.hospitable.com/metrics/..."/>
      <UrlRow label="Programa semanal" val={hospUrlWeek} editing={editW} setEditing={setEditW} curVal={valW} setCurVal={setValW} onSave={onSaveWeek} placeholder="https://share.hospitable.com/metrics/..."/>
      <div style={{fontSize:10.5,color:C.taupe}}>Los proveedores ven estos programas como respaldo cuando no tienen turnos asignados.</div>
    </div>
  );
}


function ScheduleCfg({schedules, vendors, props, hospUrlDay, hospUrlWeek, onSave, onSaveHospUrlDay, onSaveHospUrlWeek}) {
  const [form,       setForm]       = useState(blankSched());
  const [editId,     setEditId]     = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filter,     setFilter]     = useState("week"); /* today|week|all */

  var today = todayStr();
  var weekEnd = (function(){var d=new Date();d.setDate(d.getDate()+7);return d.toISOString().split("T")[0];})();

  var filtered = (schedules||[]).filter(function(s){
    if(filter==="today") return s.fecha===today;
    if(filter==="week")  return s.fecha>=today&&s.fecha<=weekEnd;
    return true;
  }).sort(function(a,b){return a.fecha>b.fecha?1:a.fecha<b.fecha?-1:a.hora>b.hora?1:-1;});

  var intVendors = vendors.filter(function(v){
    return v.tipo==="interno"&&v.active&&(v.categoria==="EPI Limpieza"||v.categoria==="EPI Mantenimiento"||v.categoria==="Administrativo");
  });

  function sf(k,v){setForm(function(p){return Object.assign({},p,{[k]:v});});}

  function save() {
    if(!form.fecha||!form.propiedad||!form.vendorId) return;
    var id = editId || "s"+Date.now();
    var entry = Object.assign({},form,{id:id,vendorRaw:form.vendorRaw||""});
    var updated = editId
      ? (schedules||[]).map(function(s){return s.id===editId?entry:s;})
      : (schedules||[]).concat([entry]);
    onSave(updated);
    setForm(blankSched()); setEditId(null); setShowForm(false);
  }

  function del(id){ onSave((schedules||[]).filter(function(s){return s.id!==id;})); }

  function edit(s){ setForm(Object.assign({},s)); setEditId(s.id); setShowForm(true); window.scrollTo(0,0); }

  var IS = {border:"1px solid "+C.gray,borderRadius:6,padding:"9px 11px",fontSize:13,fontFamily:"Montserrat,sans-serif",outline:"none",width:"100%",background:"#fff"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Hospitable sync */}
      <HospSyncButton onImport={function(newS){onSave((schedules||[]).filter(function(s){return !s.hospId;}).concat(newS));}}/>
      {/* Hospitable URL config */}
      <HospUrlConfig hospUrlDay={hospUrlDay} hospUrlWeek={hospUrlWeek} onSaveDay={onSaveHospUrlDay} onSaveWeek={onSaveHospUrlWeek}/>

      {/* Filter tabs */}
      <div style={{display:"flex",background:C.surfaceWarm,borderRadius:7,padding:3,gap:2,border:"1px solid "+C.line}}>
        {[["today","Hoy"],["week","Esta semana"],["all","Todo"]].map(function(it){var k=it[0],l=it[1];return(
          <button key={k} onClick={function(){setFilter(k);}} style={{flex:1,padding:"7px",borderRadius:5,border:"none",background:filter===k?C.black:"transparent",color:filter===k?"#fff":C.earth,fontSize:11.5,fontWeight:600,cursor:"pointer"}}>{l}</button>
        );})}
      </div>

      {/* Add button */}
      <div style={{display:"flex",gap:8}}>
        <button onClick={function(){setForm(blankSched());setEditId(null);setShowForm(!showForm);}} style={{flex:1,padding:"11px",borderRadius:7,border:"1px solid "+C.gray,background:"#fff",color:C.black,fontSize:12.5,fontWeight:600,cursor:"pointer",textAlign:"left"}}>
          {showForm?"✕ Cancelar":"+ Agregar turno"}
        </button>
        <button onClick={function(){setShowImport(true);}} style={{padding:"11px 14px",borderRadius:7,border:"1.5px solid "+C.earth,background:C.surfaceWarm,color:C.black,fontSize:12.5,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
          ↓ CSV
        </button>
      </div>
      {showImport&&<CSVImporter vendors={vendors} props={props} onImport={function(newS){onSave((schedules||[]).concat(newS));}} onClose={function(){setShowImport(false);}}/>}

      {/* Form */}
      {showForm&&(
        <div style={{background:"#fff",borderRadius:10,padding:"16px",border:"1.5px solid "+C.black,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase"}}>{editId?"Editar turno":"Nuevo turno"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:5}}>Fecha *</label><input type="date" value={form.fecha} onChange={function(e){sf("fecha",e.target.value);}} style={IS}/></div>
            <div><label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:5}}>Hora</label><input type="time" value={form.hora} onChange={function(e){sf("hora",e.target.value);}} style={IS}/></div>
          </div>
          <div><label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:5}}>Propiedad *</label>
            <select value={form.propiedad} onChange={function(e){sf("propiedad",e.target.value);}} style={IS}>
              <option value="">Seleccionar…</option>
              {(props||[]).map(function(p){return <option key={p.id} value={p.name}>{p.name}</option>;})}
            </select>
          </div>
          <div>
            <label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:5}}>Técnico *</label>
            <div style={{position:"relative"}}>
              <input
                placeholder="Nombre, correo o teléfono del técnico…"
                value={form.vendorRaw||""}
                onChange={function(e){
                  sf("vendorRaw",e.target.value);
                  /* Auto fuzzy-match */
                  var match = fuzzyMatchVendor(e.target.value, intVendors);
                  if(match.vendor) sf("vendorId", match.vendor.id);
                  else sf("vendorId","");
                }}
                style={IS}
              />
              {form.vendorRaw&&(function(){
                var m = fuzzyMatchVendor(form.vendorRaw, intVendors);
                if(!m.vendor) return <div style={{fontSize:11,color:C.red,marginTop:4}}>⚠ Sin coincidencia — verifica el nombre</div>;
                return (
                  <div style={{marginTop:5,padding:"7px 11px",borderRadius:6,background:m.score>0.7?"#EDF5EF":"#FFF9E6",border:"1px solid "+(m.score>0.7?"#c8dfc8":"#e6d88a"),fontSize:12}}>
                    <span style={{fontWeight:600,color:m.score>0.7?C.green:"#7a6000"}}>
                      {m.score>0.7?"✓":"⚠"} {vendorDisplay(m.vendor)}
                    </span>
                    <span style={{color:C.taupe,marginLeft:6}}>{m.vendor.categoria} · {Math.round(m.score*100)}% coincidencia</span>
                    {m.score<0.7&&<div style={{fontSize:10.5,color:"#7a6000",marginTop:2}}>Coincidencia baja — confirma que es el técnico correcto</div>}
                  </div>
                );
              })()}
              {/* Also show dropdown as fallback */}
              <div style={{marginTop:8,display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10.5,color:C.taupe}}>O selecciona directamente:</span>
                <select value={form.vendorId} onChange={function(e){sf("vendorId",e.target.value);var v=intVendors.find(function(x){return x.id===e.target.value;});if(v)sf("vendorRaw",vendorDisplay(v));}} style={{fontSize:12,padding:"4px 8px",border:"1px solid "+C.gray,borderRadius:5,background:"#fff",fontFamily:"Montserrat,sans-serif",outline:"none"}}>
                  <option value="">—</option>
                  {intVendors.map(function(v){return <option key={v.id} value={v.id}>{vendorDisplay(v)}</option>;})}
                </select>
              </div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:5}}>Tipo</label>
              <select value={form.tipo} onChange={function(e){sf("tipo",e.target.value);}} style={IS}>
                <option>Limpieza</option><option>Limpieza Profunda</option><option>Mantenimiento</option><option>Revisión</option>
              </select>
            </div>
            <div><label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:5}}>Código de acceso</label>
              <input placeholder="Ej. 1234#" value={form.codigoAcceso} onChange={function(e){sf("codigoAcceso",e.target.value);}} style={IS}/>
            </div>
          </div>
          <div><label style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:5}}>Notas</label>
            <input placeholder="Instrucciones especiales…" value={form.notas} onChange={function(e){sf("notas",e.target.value);}} style={IS}/>
          </div>
          <button onClick={save} disabled={!form.fecha||!form.propiedad||!form.vendorId} style={{padding:"12px",borderRadius:7,border:"none",background:form.fecha&&form.propiedad&&form.vendorId?C.black:C.gray,color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
            {editId?"Guardar cambios →":"Agregar turno →"}
          </button>
        </div>
      )}

      {/* Schedule list */}
      {filtered.length===0&&<div style={{textAlign:"center",padding:"32px",color:C.taupe,fontSize:13}}>Sin turnos {filter==="today"?"hoy":filter==="week"?"esta semana":"programados"}.</div>}
      {filtered.map(function(s){
        var v=vendors.find(function(x){return x.id===s.vendorId;});
        var isToday=s.fecha===today;
        return (
          <div key={s.id} style={{background:"#fff",borderRadius:9,padding:"13px 15px",border:"1px solid "+(isToday?"#B2A193":C.line),display:"flex",flexDirection:"column",gap:5}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:8}}>
              <div>
                <div style={{fontSize:13.5,fontWeight:600,color:C.black}}>{s.propiedad}</div>
                <div style={{fontSize:11.5,color:C.earth,marginTop:2}}>{fmtDate(s.fecha)} {s.hora&&"· "+s.hora} · {s.tipo}</div>
                {v?<div style={{fontSize:11,color:C.taupe,marginTop:1}}>{vendorDisplay(v)}</div>:s.vendorRaw?<div style={{fontSize:11,color:C.taupe,marginTop:1}}>{s.vendorRaw}</div>:null}
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={function(){edit(s);}} style={{fontSize:11,padding:"4px 9px",borderRadius:5,border:"1px solid "+C.gray,background:"#fff",color:C.earth,cursor:"pointer"}}>✏</button>
                <button onClick={function(){del(s.id);}} style={{fontSize:11,padding:"4px 9px",borderRadius:5,border:"1px solid #DBC8C4",background:"#fff",color:C.red,cursor:"pointer"}}>✕</button>
              </div>
            </div>
            {s.codigoAcceso&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
              <span style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".1em",textTransform:"uppercase"}}>Código:</span>
              <span style={{fontSize:13,fontWeight:700,color:C.black,background:C.surfaceWarm,padding:"2px 10px",borderRadius:5,letterSpacing:".1em"}}>{s.codigoAcceso}</span>
            </div>}
            {s.notas&&<div style={{fontSize:12,color:C.taupe,fontStyle:"italic"}}>{s.notas}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* Admin: Feedback viewer */
function FeedbackCfg({feedback, onSave}) {
  var items = (feedback||[]).slice().sort(function(a,b){return b.id-a.id;});
  function markRead(id){ onSave((feedback||[]).map(function(f){return f.id===id?Object.assign({},f,{visto:true}):f;})); }
  var unread = items.filter(function(f){return !f.visto;}).length;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {unread>0&&<div style={{padding:"9px 13px",borderRadius:7,background:"#EDF5EF",fontSize:12.5,fontWeight:600,color:C.green}}>✓ {unread} comentario{unread!==1?"s":""} nuevo{unread!==1?"s":""} sin leer</div>}
      {items.length===0&&<div style={{textAlign:"center",padding:"32px",color:C.taupe,fontSize:13}}>Sin comentarios aún.</div>}
      {items.map(function(f){return (
        <div key={f.id} style={{background:"#fff",borderRadius:9,padding:"13px 15px",border:"1px solid "+(f.visto?C.line:"#B2A193"),opacity:f.visto?.7:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{padding:"2px 10px",borderRadius:100,fontSize:10,fontWeight:700,background:f.tipo==="error"?"#F5EDEC":"#EDF5EF",color:f.tipo==="error"?C.red:C.green}}>{f.tipo==="error"?"🐛 Error":"💡 Sugerencia"}</span>
            <span style={{fontSize:10.5,color:C.taupe}}>{f.fecha} {f.hora} · {f.usuario}</span>
          </div>
          <div style={{fontSize:13.5,color:C.black,lineHeight:1.6,marginBottom:8}}>{f.mensaje}</div>
          {!f.visto&&<button onClick={function(){markRead(f.id);}} style={{fontSize:11,padding:"4px 12px",borderRadius:5,border:"1px solid "+C.gray,background:"#fff",color:C.earth,cursor:"pointer",fontWeight:600}}>Marcar como leído</button>}
        </div>
      );})}
    </div>
  );
}

/* Vendor: Schedule for today + week — custom table first, Hospitable as fallback */
function VendorSchedule({vendor, schedules, hospUrlDay, hospUrlWeek}) {
  const [view, setView] = useState("today");
  var today    = todayStr();
  var weekEnd  = (function(){var d=new Date();d.setDate(d.getDate()+7);return d.toISOString().split("T")[0];})();
  /* Match by vendorId, OR by fuzzy name/email/phone on vendorRaw */
  var myScheds = (schedules||[]).filter(function(s){
    if(!s) return false;
    /* Exact vendorId match */
    if(s.vendorId&&s.vendorId===vendor.id) return true;
    /* Fuzzy match on vendorRaw text (name from Hospitable) */
    if(s.vendorRaw&&s.vendorRaw.trim()) {
      var m = fuzzyMatchVendor(s.vendorRaw, [vendor]);
      if(m.score > 0.4) return true;
    }
    /* Also match if vendor email appears in vendorRaw */
    var vEmail = (vendor.email||"").toLowerCase();
    var raw = (s.vendorRaw||"").toLowerCase();
    if(vEmail&&raw&&raw.includes(vEmail.split("@")[0])) return true;
    return false;
  }).sort(function(a,b){return a.fecha>b.fecha?1:a.fecha<b.fecha?-1:a.hora>b.hora?1:-1;});
  var todayList = myScheds.filter(function(s){return s.fecha===today;});
  var weekList  = myScheds.filter(function(s){return s.fecha>=today&&s.fecha<=weekEnd;});
  var shown     = view==="today" ? todayList : weekList;

  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"0 0 100px",fontFamily:"Montserrat,sans-serif"}}>
      {/* Today highlight */}
      {todayList.length>0&&(
        <div style={{background:"#3E3F3F",padding:"14px 18px",marginBottom:0}}>
          <div style={{fontSize:9.5,color:"rgba(255,255,255,.6)",letterSpacing:".2em",textTransform:"uppercase",marginBottom:4}}>Hoy · {todayList.length} turno{todayList.length!==1?"s":""}</div>
          {todayList.map(function(s,i){return(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:i>0?8:0}}>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{s.propiedad}</div>
                <div style={{fontSize:11.5,color:"rgba(255,255,255,.6)"}}>{s.hora&&s.hora+" · "}{s.tipo}</div>
              </div>
              {s.codigoAcceso&&(
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.5)",letterSpacing:".1em",textTransform:"uppercase"}}>Código</div>
                  <div style={{fontSize:18,fontWeight:700,color:"#fff",letterSpacing:".15em"}}>{s.codigoAcceso}</div>
                </div>
              )}
            </div>
          );})}
        </div>
      )}
      {todayList.length===0&&(
        <div style={{background:"#F7F5F2",padding:"13px 18px",borderBottom:"1px solid "+C.line}}>
          <div style={{fontSize:12.5,color:C.taupe}}>Sin turnos asignados hoy en el sistema.</div>
          {(hospUrlDay||hospUrlWeek)&&<div style={{fontSize:11,color:C.earth,marginTop:3}}>Revisa el programa completo abajo →</div>}
        </div>
      )}

      {/* Toggle */}
      <div style={{padding:"14px 16px",background:"#fff",borderBottom:"1px solid "+C.line}}>
        <div style={{display:"flex",background:C.surfaceWarm,borderRadius:7,padding:3,gap:2,border:"1px solid "+C.line}}>
          {[["today","Hoy"],["week","Esta semana"]].map(function(it){var k=it[0],l=it[1];return(
            <button key={k} onClick={function(){setView(k);}} style={{flex:1,padding:"8px",borderRadius:5,border:"none",background:view===k?C.black:"transparent",color:view===k?"#fff":C.earth,fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>
          );})}
        </div>
      </div>

      {/* List */}
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {shown.length===0&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{textAlign:"center",padding:"16px",color:C.taupe,fontSize:13}}>
              {(schedules||[]).length===0
                ? "Sin turnos cargados en el sistema aún."
                : "Sin turnos asignados "+(view==="today"?"para hoy":"esta semana")+"."}
            </div>
            {(function(){
              /* Show iframe only when the system has no schedules loaded yet */
              var hasSystemScheds = (schedules||[]).length > 0;
              var url = view==="today" ? hospUrlDay : hospUrlWeek;
              var lbl = view==="today" ? "Programa de hoy (Hospitable)" : "Programa semanal (Hospitable)";
              if (hasSystemScheds && shown.length===0) return (
                <div style={{padding:"12px 14px",borderRadius:8,background:C.surfaceWarm,fontSize:12.5,color:C.taupe,textAlign:"center",border:"1px dashed "+C.gray}}>
                  No tienes turnos asignados {view==="today"?"hoy":"esta semana"}. Si crees que es un error, contacta al administrador.
                </div>
              );
              if (!url) return (
                <div style={{padding:"14px",borderRadius:8,background:C.surfaceWarm,fontSize:12,color:C.taupe,textAlign:"center",border:"1px dashed "+C.gray}}>
                  El administrador puede configurar los enlaces de Hospitable en Configuración → Programación
                </div>
              );
              return (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase"}}>{lbl}</div>
                  <div style={{borderRadius:10,overflow:"hidden",border:"1px solid "+C.line,background:"#fff",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
                    <iframe
                      src={url}
                      title={lbl}
                      style={{width:"100%",height:560,border:"none",display:"block"}}
                      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    />
                  </div>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:C.earth,textAlign:"center",textDecoration:"none",fontWeight:600,padding:"10px",borderRadius:7,border:"1px solid "+C.gray,background:"#fff",display:"block",textAlign:"center"}}>
                    ↗ Abrir en pantalla completa
                  </a>
                </div>
              );
            })()}
          </div>
        )}
        {shown.map(function(s,i){
          var isToday=s.fecha===today;
          return (
            <div key={i} style={{background:"#fff",borderRadius:10,padding:"14px 16px",border:"1.5px solid "+(isToday?C.black:C.line)}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:6}}>
                <div>
                  {!isToday&&<div style={{fontSize:10.5,fontWeight:700,color:C.earth,letterSpacing:".08em",textTransform:"uppercase",marginBottom:3}}>{fmtDate(s.fecha)}</div>}
                  <div style={{fontSize:14.5,fontWeight:600,color:C.black}}>{s.propiedad}</div>
                  <div style={{fontSize:12,color:C.earth,marginTop:2}}>{s.hora&&s.hora+" · "}{s.tipo}</div>
                  {s.notas&&<div style={{fontSize:11.5,color:C.taupe,marginTop:3,fontStyle:"italic"}}>{s.notas}</div>}
                </div>
                {s.codigoAcceso&&(
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                    <div style={{fontSize:9,color:C.taupe,letterSpacing:".12em",textTransform:"uppercase",marginBottom:2}}>Código acceso</div>
                    <div style={{fontSize:20,fontWeight:700,color:C.black,letterSpacing:".15em",background:C.surfaceWarm,padding:"4px 12px",borderRadius:6}}>{s.codigoAcceso}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ─── Quick inline total editor in dashboard list */
function QuickEditTotal({rep, vendors, onSave}) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(rep.total||"");
  var at = autoTarifa(rep.reportadoPor||"", vendors);

  function save() {
    if(onSave) onSave(val);
    setEditing(false);
  }

  if (editing) return (
    <div style={{display:"flex",gap:4,alignItems:"center"}}>
      <input
        type="number"
        value={val}
        onChange={function(e){setVal(e.target.value);}}
        onKeyDown={function(e){if(e.key==="Enter")save();if(e.key==="Escape")setEditing(false);}}
        autoFocus
        style={{width:72,border:"1.5px solid "+C.black,borderRadius:6,padding:"4px 8px",fontSize:13,fontFamily:"Montserrat,sans-serif",outline:"none",fontWeight:600}}
      />
      <button onClick={save} style={{padding:"4px 8px",borderRadius:5,border:"none",background:C.black,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✓</button>
      <button onClick={function(){setEditing(false);setVal(rep.total||"");}} style={{padding:"4px 6px",borderRadius:5,border:"none",background:"#eee",color:C.gray,fontSize:11,cursor:"pointer"}}>✕</button>
    </div>
  );

  return (
    <div onClick={function(){setVal(rep.total||at.tarifa||"");setEditing(true);}} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:4,borderRadius:6,padding:"2px 4px",transition:"background .15s"}}
      onMouseEnter={function(e){e.currentTarget.style.background=C.surfaceWarm;}}
      onMouseLeave={function(e){e.currentTarget.style.background="transparent";}}
      title="Toca para editar total">
      <span style={{fontSize:14,fontWeight:700,color:rep.total?C.black:C.gray}}>
        {rep.total?"Q"+rep.total:at.tarifa?"Q"+at.tarifa:"—"}
      </span>
      <span style={{fontSize:9,color:C.gray}}>✏</span>
    </div>
  );
}



/* ─── Admin QA Panel — full quality review across all cleanings */
function AdminQAPanel({reps, vendors, onQA, onSelect}) {
  const [filter,   setFilter]   = useState("all"); /* all | pendiente | aprobada | correccion */
  const [selVend,  setSelVend]  = useState("Todos");

  var cleanReps = (reps||[]).filter(function(r){return isCleaning(r.categoria);});
  var vMap = {};
  (vendors||[]).forEach(function(v){if(v.email)vMap[v.email]=vendorDisplay(v);});
  var vEmails = ["Todos"].concat(uniq(cleanReps.map(function(r){return r.reportadoPor;}).filter(Boolean)));

  var filtered = cleanReps.filter(function(r){
    if(filter!=="all"&&(r.qaStatus||"pendiente")!==filter) return false;
    if(selVend!=="Todos"&&r.reportadoPor!==selVend) return false;
    return true;
  }).sort(function(a,b){return (b.createdAt||b.id)-(a.createdAt||a.id);});

  var counts = {
    pendiente:  cleanReps.filter(function(r){return !r.qaStatus||r.qaStatus==="pendiente";}).length,
    aprobada:   cleanReps.filter(function(r){return r.qaStatus==="aprobada";}).length,
    correccion: cleanReps.filter(function(r){return r.qaStatus==="correccion"||r.qaStatus==="corregido";}).length,
  };

  var IS = {border:"1px solid "+C.gray,borderRadius:6,padding:"7px 10px",fontSize:12.5,fontFamily:"Montserrat,sans-serif",outline:"none",background:"#fff",width:"100%"};

  return (
    <div style={{maxWidth:700,margin:"0 auto",padding:"16px 16px 100px",fontFamily:"Montserrat,sans-serif",display:"flex",flexDirection:"column",gap:14}}>
      {/* Summary stats */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[["all","Todas","#fff",C.black,cleanReps.length],["pendiente","En revisión",C.surfaceWarm,C.earth,counts.pendiente],["aprobada","Aprobadas","#EDF5EF",C.green,counts.aprobada],["correccion","Correcciones","#F5EDEC",C.red,counts.correccion]].map(function(it){
          var k=it[0],l=it[1],bg=it[2],cl=it[3],n=it[4];
          return (
            <button key={k} onClick={function(){setFilter(k);}} style={{flex:1,minWidth:80,padding:"10px 8px",borderRadius:8,border:"1.5px solid "+(filter===k?cl:C.line),background:filter===k?bg:"#fff",cursor:"pointer",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:filter===k?cl:C.earth}}>{n}</div>
              <div style={{fontSize:9.5,color:filter===k?cl:C.taupe,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase"}}>{l}</div>
            </button>
          );
        })}
      </div>

      {/* Vendor filter */}
      <select value={selVend} onChange={function(e){setSelVend(e.target.value);}} style={IS}>
        {vEmails.map(function(e){return <option key={e} value={e}>{e==="Todos"?"Todos los técnicos":(vMap[e]||e)}</option>;})}
      </select>

      {/* List */}
      {filtered.length===0&&<div style={{textAlign:"center",padding:"32px",color:C.taupe,fontSize:13}}>Sin limpiezas en esta categoría.</div>}
      {filtered.map(function(r,i){
        var vn  = vMap[r.reportadoPor]||r.reportadoPor||"—";
        var qs  = r.qaStatus||"pendiente";
        var qcl = {pendiente:C.earth, aprobada:C.green, correccion:C.red, corregido:C.green, futuro:C.earth}[qs]||C.earth;
        var qlbl= {pendiente:"En revisión",aprobada:"✓ Aprobada",correccion:"⚠ Corrección",corregido:"✓ Corregida",futuro:"→ Tomado en cuenta"}[qs]||qs;
        return (
          <div key={r.id} style={{background:"#fff",borderRadius:10,padding:"14px 16px",border:"1.5px solid "+(qs==="pendiente"?C.line:qs==="aprobada"?"#c8dfc8":"#DBC8C4"),display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:C.black}}>{r.propiedad}</div>
                <div style={{fontSize:11.5,color:C.earth,marginTop:2}}>{vn} · {fmtDate(r.fecha)} · {r.categoria}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:100,background:qs==="aprobada"?"#EDF5EF":qs==="correccion"?"#F5EDEC":C.surfaceWarm,color:qcl}}>{qlbl}</span>
                <button onClick={function(){onSelect&&onSelect(r);}} style={{fontSize:11,padding:"4px 10px",borderRadius:5,border:"1px solid "+C.gray,background:"#fff",color:C.earth,cursor:"pointer",fontWeight:600}}>Ver detalle →</button>
              </div>
            </div>
            {/* QA action buttons */}
            {(qs==="pendiente"||qs==="corregido")&&(
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={function(){onQA&&onQA(r.id,"aprobada","");}} style={{flex:1,padding:"9px",borderRadius:7,border:"none",background:"#3d6b52",color:"#fff",fontSize:12.5,fontWeight:700,cursor:"pointer"}}>✓ Aprobar</button>
                <button onClick={function(){var c=prompt("Comentario para el técnico:");if(c!==null)onQA&&onQA(r.id,"correccion",c);}} style={{flex:1,padding:"9px",borderRadius:7,border:"none",background:"#8a3030",color:"#fff",fontSize:12.5,fontWeight:700,cursor:"pointer"}}>⚠ Corrección</button>
              </div>
            )}
            {qs==="aprobada"&&(
              <div style={{fontSize:11.5,color:C.green,fontWeight:600}}>✓ Limpieza aprobada {r.qaFecha?("el "+fmtDate(r.qaFecha)):""}</div>
            )}
            {qs==="correccion"&&r.qaComentario&&(
              <div style={{fontSize:11.5,color:C.red,background:"#F5EDEC",padding:"8px 12px",borderRadius:6}}>Corrección: {r.qaComentario}</div>
            )}
            {r.qaRespuesta&&(
              <div style={{fontSize:11.5,color:C.earth,background:C.surfaceWarm,padding:"8px 12px",borderRadius:6}}>Respuesta: {r.qaRespuesta}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}



/* ═══════════════════════════════════════════════════════
   PHOTO RECOVERY TOOL
   Scans Drive folder, matches photos to reports by ID
   and updates Sheets with the missing URLs
   ═══════════════════════════════════════════════════════ */
function PhotoRecoveryTool() {
  const [status,   setStatus]   = useState("idle"); /* idle|scanning|done|error */
  const [log,      setLog]      = useState([]);
  const [results,  setResults]  = useState(null);

  function addLog(msg, type) {
    setLog(function(p){ return [...p, {msg:msg, type:type||"info", ts:new Date().toLocaleTimeString("es-GT")}]; });
  }

  async function runTest() {
    setStatus("scanning"); setLog([]);
    addLog("Probando conexión con Drive…");
    try {
      var r = await apiCall("testDrive", {});
      addLog("Carpeta Drive: " + (r.folderName||"?"), "detail");
      addLog("Archivos directos en carpeta: " + (r.directFiles||0), "detail");
      addLog("Subcarpetas: " + (r.subfolders||0), "detail");
      addLog("Total archivos (incluyendo subfolders): " + (r.totalFiles||0), r.totalFiles>0?"success":"error");
      if(r.samples&&r.samples.length) {
        r.samples.forEach(function(s){ addLog("  → " + s, "detail"); });
      }
      setStatus("idle");
    } catch(e) {
      addLog("Error: " + (e&&e.message?e.message:String(e)), "error");
      setStatus("error");
    }
  }

  async function runRecovery() {
    setStatus("scanning"); setLog([]); setResults(null);
    addLog("Iniciando recuperación de fotos…");
    try {
      addLog("Llamando al servidor para escanear Google Drive…");
      var r = await apiCall("recoverPhotos", {});
      addLog("Escaneo completado.", "success");
      addLog("Archivos encontrados en Drive: " + (r.filesFound||0));
      addLog("Reportes procesados: " + (r.reportsProcessed||0));
      addLog("Reportes actualizados con fotos recuperadas: " + (r.reportsUpdated||0));
      if(r.details&&r.details.length) {
        r.details.forEach(function(d){ addLog("↳ " + d, "detail"); });
      }
      if(r.errors&&r.errors.length) {
        r.errors.forEach(function(e){ addLog("⚠ " + e, "error"); });
      }
      setResults(r);
      setStatus("done");
      addLog("✓ Recuperación finalizada.", "success");
    } catch(e) {
      addLog("Error: " + (e&&e.message?e.message:String(e)), "error");
      setStatus("error");
    }
  }

  var logColors = {info:C.earth, success:C.green, error:C.red, detail:C.taupe};

  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"20px 16px",fontFamily:"Montserrat,sans-serif",display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:C.surfaceWarm,borderRadius:10,padding:"16px",border:"1px solid "+C.line}}>
        <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase",marginBottom:8}}>Herramienta de recuperación de fotos</div>
        <div style={{fontSize:13,color:C.earth,lineHeight:1.7,marginBottom:14}}>
          Esta herramienta escanea tu carpeta de Google Drive, identifica las fotos ya subidas y las vincula a sus reportes correspondientes en Google Sheets.
          <br/><span style={{fontSize:11.5,color:C.taupe}}>Útil para reportes que muestran 0% de fotos aunque las fotos sí llegaron a Drive.</span>
        </div>
        <button
          onClick={runTest}
          disabled={status==="scanning"}
          style={{width:"100%",padding:"10px",borderRadius:8,border:"1px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12.5,fontWeight:600,cursor:status==="scanning"?"default":"pointer",marginBottom:8}}
        >
          🔌 Probar conexión con Drive primero
        </button>
        <button
          onClick={runRecovery}
          disabled={status==="scanning"}
          style={{width:"100%",padding:"13px",borderRadius:8,border:"none",background:status==="scanning"?C.gray:C.black,color:"#fff",fontSize:13,fontWeight:700,cursor:status==="scanning"?"default":"pointer",letterSpacing:".04em"}}
        >
          {status==="scanning"?"⏳ Escaneando Drive… (puede tardar 30-60 seg)":"🔍 Iniciar recuperación de fotos"}
        </button>
      </div>

      {/* Log output */}
      {log.length>0&&(
        <div style={{background:"#1E1E1E",borderRadius:10,padding:"14px 16px",fontFamily:"monospace",fontSize:11.5,lineHeight:1.9,maxHeight:340,overflow:"auto",display:"flex",flexDirection:"column",gap:2}}>
          {log.map(function(l,i){
            return <div key={i} style={{color:l.type==="success"?"#7fba7f":l.type==="error"?"#e08080":l.type==="detail"?"#aaa":"#e0d8c8"}}>
              <span style={{color:"#666",marginRight:8}}>[{l.ts}]</span>{l.msg}
            </div>;
          })}
        </div>
      )}

      {/* Results summary */}
      {results&&(
        <div style={{background:"#EDF5EF",borderRadius:10,padding:"14px 16px",border:"1px solid #c8dfc8"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.green,marginBottom:8}}>Resultado de la recuperación</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div style={{textAlign:"center",padding:"10px",background:"#fff",borderRadius:8}}>
              <div style={{fontSize:22,fontWeight:700,color:C.black}}>{results.filesFound||0}</div>
              <div style={{fontSize:10,color:C.taupe,textTransform:"uppercase",letterSpacing:".1em"}}>Fotos en Drive</div>
            </div>
            <div style={{textAlign:"center",padding:"10px",background:"#fff",borderRadius:8}}>
              <div style={{fontSize:22,fontWeight:700,color:C.earth}}>{results.reportsProcessed||0}</div>
              <div style={{fontSize:10,color:C.taupe,textTransform:"uppercase",letterSpacing:".1em"}}>Reportes revisados</div>
            </div>
            <div style={{textAlign:"center",padding:"10px",background:"#fff",borderRadius:8}}>
              <div style={{fontSize:22,fontWeight:700,color:C.green}}>{results.reportsUpdated||0}</div>
              <div style={{fontSize:10,color:C.taupe,textTransform:"uppercase",letterSpacing:".1em"}}>Reportes recuperados</div>
            </div>
          </div>
          {results.reportsUpdated>0&&(
            <div style={{marginTop:12,fontSize:12,color:C.earth,fontWeight:600}}>
              ✓ Recarga el dashboard para ver las fotos recuperadas (botón ↻).
            </div>
          )}
        </div>
      )}
    </div>
  );
}



/* ─── Photo Lightbox — full screen photo viewer */
function PhotoLightbox({photos, initialIdx, onClose}) {
  const [idx, setIdx] = useState(initialIdx||0);
  var total = photos.length;
  function prev(e){e.stopPropagation();setIdx(function(i){return(i-1+total)%total;});}
  function next(e){e.stopPropagation();setIdx(function(i){return(i+1)%total;});}
  useEffect(function(){
    function onKey(e){if(e.key==="Escape")onClose();if(e.key==="ArrowLeft")setIdx(function(i){return(i-1+total)%total;});if(e.key==="ArrowRight")setIdx(function(i){return(i+1)%total;});}
    window.addEventListener("keydown",onKey);
    return function(){window.removeEventListener("keydown",onKey);};
  },[]);
  var src = photos[idx];
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{position:"absolute",top:16,right:20,color:"#fff",fontSize:24,cursor:"pointer",fontWeight:300,lineHeight:1}} onClick={onClose}>×</div>
      <div style={{position:"relative",maxWidth:"90vw",maxHeight:"80vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {total>1&&<button onClick={prev} style={{position:"absolute",left:-48,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",fontSize:28,width:40,height:40,borderRadius:"50%",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>‹</button>}
        <img
          src={driveThumb(src,1200)}
          alt={"foto "+(idx+1)}
          style={{maxWidth:"85vw",maxHeight:"78vh",objectFit:"contain",borderRadius:8}}
          onError={function(e){e.target.src=src;}}
          onClick={function(e){e.stopPropagation();}}
        />
        {total>1&&<button onClick={next} style={{position:"absolute",right:-48,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",fontSize:28,width:40,height:40,borderRadius:"50%",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>›</button>}
      </div>
      <div style={{color:"rgba(255,255,255,.6)",fontSize:12,letterSpacing:".1em"}}>{idx+1} / {total}</div>
      <a href={src} target="_blank" rel="noopener noreferrer" onClick={function(e){e.stopPropagation();}} style={{color:"rgba(255,255,255,.5)",fontSize:11,textDecoration:"none"}}>↗ Abrir en Drive</a>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════════
   ADELANTOS — payment advances for EPI Limpieza technicians
   Local store (Sheets-ready via saveConfig key "adelantos").
   ════════════════════════════════════════════════════════════════════ */
function adv_load(){ try{var v=localStorage.getItem("sam_adelantos");return v?JSON.parse(v):null;}catch(e){return null;} }
function adv_persist(list){
  try{ localStorage.setItem("sam_adelantos", JSON.stringify(list)); }catch(e){}
  if(!IS_CLAUDE_SANDBOX){ try{ apiCall("saveConfig",{key:"adelantos",value:list}); }catch(e){} }
}
function normNm(s){ return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }
/* Todos los adelantos legacy iniciaron el 1 de junio 2026 */
var ADV_DEFAULT_START = "2026-06-01";
function advStart(adv){ return adv.fechaInicio || adv.fechaDeposito || ADV_DEFAULT_START; }
/* Adelantos ligados a su técnico real (por correo) */
function adv_seed(){
  function mk(name,email,saldo,semanal){ return {id:"adv_"+normNm(name).replace(/[^a-z]/g,"")+"_"+Date.now()+Math.floor(Math.random()*1000), vendorEmail:email, vendorName:name, dpiNumber:"", dpiPhoto:null, monto:saldo, cobroSemanal:semanal, cuotas:Math.ceil(saldo/semanal), fechaInicio:ADV_DEFAULT_START, fechaDeposito:ADV_DEFAULT_START, status:"activo", createdAt:Date.now(), pausas:[], contractText:""}; }
  return [
    mk("Joselyn Sian","andyvas85@gmail.com",1950,250),
    mk("Lilia del Cid","dubonmar20@gmail.com",575,525),
    mk("Jackeline Ruano","kr9435454@gmail.com",900,100),
  ];
}
/* Normaliza/migra: liga adelantos legacy a su técnico por nombre, agrega fechaInicio y pausas */
function adv_migrate(list, vendors){
  var changed=false;
  var out=(list||[]).map(function(a){
    var b=Object.assign({},a);
    if(!Array.isArray(b.pausas)){ b.pausas=[]; changed=true; }
    if(!b.vendorEmail && b.vendorName){
      var target=normNm(b.vendorName);
      var v=(vendors||[]).find(function(x){ return normNm(x.name)===target || normNm(vendorDisplay(x))===target; });
      if(v){ b.vendorEmail=v.email; changed=true; }
    }
    if(!b.fechaInicio){ b.fechaInicio=b.fechaDeposito||ADV_DEFAULT_START; changed=true; }
    if(b.legacy){ b.legacy=false; changed=true; } /* ahora participan en el débito automático */
    return b;
  });
  return {list:out, changed:changed};
}
function isEpiLimpieza(v){ return !!v && v.tipo==="interno" && v.categoria==="EPI Limpieza"; }
function mondayOf(d){ var x=new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; }
function weekKeyOf(d){ return mondayOf(d).toISOString().slice(0,10); }
function last8WeeksSum(reps,email){
  if(!email) return 0;
  var start=mondayOf(new Date()); start.setDate(start.getDate()-7*7); /* covers current + 7 prior weeks */
  var s=0;
  (reps||[]).forEach(function(r){ if(r.reportadoPor!==email) return; var d=new Date((r.fecha||"")+"T12:00:00"); if(isNaN(d.getTime())) return; if(d>=start) s+=parseFloat(r.total||0)||0; });
  return s;
}
function maxAdvanceFor(reps,email){ return Math.floor(last8WeeksSum(reps,email)/2); }
/* Pago semanal promedio del técnico (semanas con trabajos) — para el % de adelanto */
function avgWeekPay(reps,email){
  if(!email) return 0;
  var weeks={};
  (reps||[]).forEach(function(r){ if(r.reportadoPor!==email) return; var d=new Date((r.fecha||"")+"T12:00:00"); if(isNaN(d.getTime()))return; var k=weekKeyOf(d); weeks[k]=(weeks[k]||0)+(parseFloat(r.total||0)||0); });
  var vals=Object.keys(weeks).map(function(k){return weeks[k];}).filter(function(x){return x>0;});
  if(!vals.length) return 0;
  return Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length);
}
/* Estado derivado de un adelanto. El cobro es AUTOMÁTICO: cada semana (desde fechaInicio)
   en la que el técnico tuvo ≥1 trabajo y TODOS quedaron pagados cuenta como una cuota
   debitada — salvo las semanas en `pausas`, que se saltan. */
function advanceState(adv, reps){
  var monto=parseFloat(adv.monto||0)||0, semanal=parseFloat(adv.cobroSemanal||0)||0;
  var cuotas=adv.cuotas||(semanal>0?Math.ceil(monto/semanal):0);
  var pausas=adv.pausas||[];
  var startMon=mondayOf(new Date(advStart(adv)+"T12:00:00"));
  var weeks={};
  if(adv.vendorEmail){
    (reps||[]).forEach(function(r){
      if(r.reportadoPor!==adv.vendorEmail) return;
      var d=new Date((r.fecha||"")+"T12:00:00"); if(isNaN(d.getTime())) return;
      var m=mondayOf(d); if(m<startMon) return;
      var k=m.toISOString().slice(0,10);
      if(!weeks[k]) weeks[k]={n:0,paid:0};
      weeks[k].n++; if(r.paid) weeks[k].paid++;
    });
  }
  var fullyPaid=Object.keys(weeks).filter(function(k){return weeks[k].n>0 && weeks[k].paid===weeks[k].n;}).sort();
  var charged=fullyPaid.filter(function(k){return pausas.indexOf(k)<0;});       /* semanas que SÍ cobran */
  var pausedDone=fullyPaid.filter(function(k){return pausas.indexOf(k)>=0;});   /* semanas pausadas ya completadas */
  var paidWeeks = adv.status==="activo" ? Math.min(charged.length, cuotas) : 0;
  var debited=Math.min(monto, paidWeeks*semanal);
  var saldo=Math.max(0, monto-debited);
  var weeklyCharge = (adv.status==="activo" && saldo>0) ? Math.min(semanal, saldo) : 0;
  return { monto:monto, semanal:semanal, cuotas:cuotas, paidWeeks:paidWeeks, debited:debited, saldo:saldo,
           weeklyCharge:weeklyCharge, done:saldo<=0, pausas:pausas, weeks:weeks,
           fullyPaidWeeks:fullyPaid, pausedDone:pausedDone, startMon:startMon };
}
/* Próxima semana cobrable: la semana pendiente más próxima (no completada y no pausada) */
function nextChargeableWeek(adv, reps){
  var st=advanceState(adv, reps);
  var cursor=new Date(st.startMon);
  var limit=mondayOf(new Date()); limit.setDate(limit.getDate()+7*5);
  while(cursor<=limit){
    var k=cursor.toISOString().slice(0,10);
    var w=st.weeks[k];
    var fullyPaid = w && w.n>0 && w.paid===w.n;
    var paused = (adv.pausas||[]).indexOf(k)>=0;
    if(!fullyPaid && !paused) return k;
    cursor.setDate(cursor.getDate()+7);
  }
  return null;
}
/* Cobro semanal de adelantos para un técnico (o "Todos") — respeta el filtro del dashboard */
function advanceChargeFor(adelantos, reps, email){
  return (adelantos||[]).reduce(function(s,a){
    if(email && email!=="Todos" && a.vendorEmail!==email) return s;
    return s + advanceState(a, reps).weeklyCharge;
  },0);
}
/* Cobro semanal total (company-wide) */
function weeklyAdvanceCharge(adelantos, reps){ return advanceChargeFor(adelantos, reps, "Todos"); }
/* Etiqueta corta de una semana: "1–7 jun" */
function weekLabel(k){
  if(!k) return "—";
  var a=new Date(k+"T12:00:00"); var b=new Date(a); b.setDate(b.getDate()+6);
  var M=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return a.getDate()+"–"+b.getDate()+" "+M[b.getMonth()];
}
/* Separa trabajos en "semanas anteriores" (PAGABLES — la empresa paga a internos con una
   semana de atraso) y "semana en curso" (aún no pagable). Semana = lunes→domingo. */
function splitPayableWeeks(reps, effFn){
  var curMon = mondayOf(new Date());
  function amt(r){ return effFn ? effFn(r) : (parseFloat(r.total||0)||0); }
  var prev={reps:[],fact:0,cob:0,pndCount:0}, cur={reps:[],monto:0,cob:0};
  (reps||[]).forEach(function(r){
    var d=new Date((r.fecha||"")+"T12:00:00");
    var isCur = !isNaN(d.getTime()) && mondayOf(d)>=curMon;
    if(isCur){ cur.reps.push(r); cur.monto+=amt(r); if(r.paid) cur.cob+=amt(r); }
    else { prev.reps.push(r); prev.fact+=amt(r); if(r.paid) prev.cob+=amt(r); else if(amt(r)>0) prev.pndCount++; }
  });
  prev.porCobrar = prev.fact - prev.cob;
  return {prev:prev, cur:cur, curMon:curMon};
}
/* Spanish number-to-words (integers up to 999,999) for the contract */
function numToWordsEs(num){
  num=Math.floor(Math.abs(num||0)); if(num===0) return "cero";
  var U=["","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve","veinte"];
  var D=["","","","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"];
  var H=["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"];
  function b100(n){ if(n<=20) return U[n]; if(n<30) return "veinti"+U[n-20]; var d=Math.floor(n/10),u=n%10; return D[d]+(u?" y "+U[u]:""); }
  function b1000(n){ if(n===100) return "cien"; var c=Math.floor(n/100),r=n%100; return (c?H[c]:"")+(c&&r?" ":"")+(r?b100(r):""); }
  if(num<1000) return b1000(num);
  var miles=Math.floor(num/1000),resto=num%1000;
  return ((miles===1?"mil":b1000(miles)+" mil")+(resto?" "+b1000(resto):"")).trim();
}
var ADV_MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fmtLongDateEs(ds){ if(!ds) return "____"; var d=new Date(ds+"T12:00:00"); if(isNaN(d.getTime())) return ds; return d.getDate()+" de "+ADV_MESES[d.getMonth()]+" de "+d.getFullYear(); }
function fmtDMY(ds){ if(!ds) return "__/__/____"; var p=ds.split("-"); return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:ds; }
function payoffDateEs(ds,cuotas){ var d=new Date((ds||todayStr())+"T12:00:00"); d.setDate(d.getDate()+7*(cuotas||1)); return fmtLongDateEs(d.toISOString().slice(0,10)); }
function buildContractText(adv){
  var monto=parseFloat(adv.monto||0)||0, fecha=adv.fechaDeposito||todayStr();
  return [
    "Guatemala, "+fmtLongDateEs(fecha)+".","",
    "Por este medio, yo, "+(adv.vendorName||"________")+", quien se identifica con el Documento Personal de Identificación número "+(adv.dpiNumber||"____ _____ ____")+" extendido por el Registro Nacional de las Personas de la República de Guatemala, quien actúa en su calidad de PERSONA INDIVIDUAL y quien es proveedor activo de Spacio AM, solicito y acepto un adelanto de pago conforme a las condiciones detalladas a continuación.","",
    "1.  Monto total solicitado: Q. "+monto.toLocaleString("es-GT")+"  ("+numToWordsEs(monto)+" quetzales exactos)",
    "2.  Fecha del depósito: "+fmtDMY(fecha),
    "3.  Número de cuotas: "+(adv.cuotas||"—"),
    "4.  Periodicidad del descuento: Semanal  (Q"+(adv.cobroSemanal||0)+" por semana)",
    "5.  Fecha de finalización del pago: "+payoffDateEs(fecha,adv.cuotas)+".","",
    "Este adelanto será descontado automáticamente de mi pago en las fechas de pago correspondientes, conforme al calendario laboral. Autorizo expresamente a Spacio AM a realizar dichos descuentos sin necesidad de autorización adicional.","",
    "Declaro haber recibido el monto indicado y me comprometo a devolverlo en su totalidad bajo las condiciones acordadas, incluso en caso de terminación anticipada de mi relación con Spacio AM. En dicho caso, acepto que el saldo pendiente podrá descontarse de cualquier pago pendiente.","",
    "Reconozco que este adelanto no constituye un derecho adquirido ni recurrente, y que es una excepción otorgada de buena fe por la empresa."
  ].join("\n");
}
function printContract(adv){
  var body = buildContractText(adv).split("\n").map(function(l){ return l.trim()? "<p style='margin:0 0 10px'>"+l.replace(/</g,"&lt;")+"</p>" : "<div style='height:8px'></div>"; }).join("");
  var html = "<html><head><meta charset='UTF-8'><title>Adelanto — "+(adv.vendorName||"")+"</title>"
    + "<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 28px;color:#3E3F3F;line-height:1.65}h1{font-size:22px;font-weight:400;letter-spacing:.04em;text-align:center;margin:0 0 30px}p{font-size:14px}.sig{margin-top:54px;border-top:1px solid #3E3F3F;width:300px;padding-top:6px;font-size:13px}@media print{body{margin:20px}}</style>"
    + "</head><body><h1>SOLICITUD Y RECIBO DE ADELANTO DE PAGO</h1>"+body
    + "<div class='sig'>"+(adv.vendorName||"")+"</div></body></html>";
  var w=window.open("","_blank","width=820,height=900"); if(!w) return; w.document.write(html); w.document.close();
}

/* ─── Contract preview modal */
function ContractModal({adv,onClose}){
  return (
    <Overlay onClick={onClose}>
      <div onClick={function(e){e.stopPropagation();}} style={{background:"#fff",borderRadius:18,maxWidth:680,width:"100%",maxHeight:"88vh",overflow:"auto",boxShadow:C.shadowLg||"0 28px 80px rgba(62,63,63,.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 22px",borderBottom:"1px solid "+C.line,position:"sticky",top:0,background:"#fff"}}>
          <div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:19,color:C.black}}>Contrato de adelanto</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,color:C.earth,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <div style={{padding:"26px 30px"}}>
          <div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:23,letterSpacing:".03em",textAlign:"center",color:C.black,marginBottom:22}}>Solicitud y recibo de adelanto de pago</div>
          <div style={{fontFamily:"Georgia,serif",fontSize:13.5,lineHeight:1.7,color:C.black,whiteSpace:"pre-wrap"}}>{buildContractText(adv)}</div>
          <div style={{marginTop:36}}>
            {adv.firma&&<img src={adv.firma} alt="Firma" style={{maxHeight:64,display:"block",marginBottom:2}}/>}
            <div style={{borderTop:"1px solid "+C.black,width:260,paddingTop:6,fontSize:13,color:C.black}}>{adv.vendorName||""}{adv.firma&&<span style={{fontSize:10.5,color:C.earth,display:"block",marginTop:2}}>Firmado digitalmente{adv.firmadoEn?" · "+fmtDate(new Date(adv.firmadoEn).toISOString().split("T")[0]):""}</span>}</div>
          </div>
          {adv.dpiPhoto&&(<div style={{marginTop:24}}><div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase",marginBottom:8}}>DPI adjunto</div><img src={adv.dpiPhoto} alt="DPI" style={{maxWidth:"100%",borderRadius:10,border:"1px solid "+C.gray}}/></div>)}
        </div>
        <div style={{padding:"14px 22px",borderBottom:"none",borderTop:"1px solid "+C.line,display:"flex",justifyContent:"flex-end",gap:10,position:"sticky",bottom:0,background:"#fff"}}>
          <button onClick={function(){printContract(adv);}} style={{padding:"10px 20px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.black,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Imprimir / PDF</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Vendor: request an advance (EPI Limpieza only) */
function AdvanceRequest({vendor, reps, adelantos, onSvAdelantos}){
  var mine = (adelantos||[]).filter(function(a){return a.vendorEmail===vendor.email;});
  var vigentes = mine.filter(function(a){return a.status==="activo"||a.status==="pendiente";});
  var maxTotal = maxAdvanceFor(reps, vendor.email);
  var sum8 = last8WeeksSum(reps, vendor.email);
  /* Suma de saldos vigentes (activos por su saldo, solicitudes pendientes por su monto) */
  var saldoVigente = vigentes.reduce(function(s,a){ return s + (a.status==="activo" ? advanceState(a,reps).saldo : (parseFloat(a.monto)||0)); },0);
  var disponible = Math.max(0, maxTotal - saldoVigente);

  const [dpiPhoto,setDpiPhoto] = useState(null);
  const [nombre,setNombre] = useState(vendorDisplay(vendor)||"");
  const [dpiNum,setDpiNum] = useState("");
  const [monto,setMonto]   = useState("");
  const [cuotas,setCuotas] = useState(8);
  const [fecha,setFecha]   = useState(todayStr());
  const [firma,setFirma]   = useState(null);
  const [err,setErr]       = useState("");
  const [busy,setBusy]     = useState(false);
  const [preview,setPreview]= useState(null);
  const fileRef = useRef(null);

  var montoN = parseFloat(monto||0)||0;
  var semanal = cuotas>0 ? Math.ceil(montoN/cuotas) : 0;
  var mensual = Math.round(semanal*52/12);
  var datosOk = !!dpiPhoto && nombre.trim() && dpiNum.trim();
  var montoOk = datosOk && montoN>0 && montoN<=disponible;

  async function pickDpi(file){ if(!file) return; try{ var d=await compress(file); setDpiPhoto(d); }catch(e){} }
  function draft(){ return {vendorName:nombre,dpiNumber:dpiNum,monto:montoN,cuotas:cuotas,cobroSemanal:semanal,fechaDeposito:fecha,fechaInicio:fecha,dpiPhoto:dpiPhoto,firma:firma}; }

  async function submit(){
    setErr("");
    if(!dpiPhoto)      return setErr("Sube la foto de tu documento (DPI).");
    if(!nombre.trim()) return setErr("Confirma tu nombre completo.");
    if(!dpiNum.trim()) return setErr("Confirma tu número de DPI (CUI).");
    if(!montoN||montoN<=0) return setErr("Ingresa el monto a solicitar.");
    if(montoN>disponible)  return setErr("El monto excede tu disponible (Q"+disponible.toLocaleString()+").");
    if(!firma)         return setErr("Firma el contrato para enviar la solicitud.");
    setBusy(true);
    var adv = Object.assign({id:"adv_"+Date.now(), vendorEmail:vendor.email, status:"pendiente", createdAt:Date.now(), pausas:[], firmadoEn:Date.now()}, draft());
    adv.contractText = buildContractText(adv);
    try{ await onSvAdelantos([adv].concat(adelantos||[])); }catch(e){}
    setBusy(false); setDpiPhoto(null); setDpiNum(""); setMonto(""); setCuotas(8); setFirma(null);
  }

  function StepBadge({n,done,active}){ return <span style={{width:24,height:24,borderRadius:"50%",flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,background:done?C.green:(active?C.black:C.gray),color:done||active?"#fff":C.earth}}>{done?"✓":n}</span>; }

  return (
    <div style={{maxWidth:520,margin:"0 auto",padding:"24px 16px 90px",fontFamily:"Montserrat,sans-serif"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9.5,fontWeight:600,color:C.earth,letterSpacing:".28em",textTransform:"uppercase",marginBottom:8}}>Adelanto de pago</div>
        <div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:27,color:C.black}}>Solicitar un adelanto</div>
      </div>

      {/* Available */}
      <div style={{background:C.black,borderRadius:16,padding:"18px 20px",marginBottom:16,color:"#fff"}}>
        <div style={{fontSize:9.5,fontWeight:600,letterSpacing:".2em",textTransform:"uppercase",opacity:.7,marginBottom:6}}>Disponible para solicitar</div>
        <div style={{fontSize:30,fontWeight:600,letterSpacing:"-.01em",color:disponible>0?"#fff":C.peach}}>Q{disponible.toLocaleString()}</div>
        <div style={{fontSize:11,opacity:.62,marginTop:8,lineHeight:1.7}}>Máximo (½ de tus últimas 8 semanas, Q{sum8.toLocaleString()}): <b style={{color:"#fff"}}>Q{maxTotal.toLocaleString()}</b>{saldoVigente>0?<> · En adelantos vigentes: <b style={{color:"#fff"}}>Q{saldoVigente.toLocaleString()}</b></>:null}</div>
      </div>

      {/* Mis adelantos vigentes */}
      {vigentes.length>0&&(
        <div style={{marginBottom:18}}>
          <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase",marginBottom:9}}>Mis adelantos · {vigentes.length}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {vigentes.map(function(a){ var st=advanceState(a,reps); var isP=a.status==="pendiente"; return (
              <button key={a.id} onClick={function(){setPreview(a);}} style={{textAlign:"left",background:"#fff",border:"1px solid "+C.line,borderRadius:14,padding:"13px 15px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",boxShadow:"0 4px 16px rgba(62,63,63,.04)"}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:isP?C.orange:C.green,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.black}}>Q{(a.monto||0).toLocaleString()} <span style={{fontWeight:500,color:C.earth,fontSize:11.5}}>· {isP?"pendiente de aprobación":"activo"}</span></div>
                  <div style={{fontSize:11,color:C.earth,marginTop:2}}>{isP?"En revisión":("Saldo Q"+st.saldo.toLocaleString()+" · Q"+(a.cobroSemanal||0)+"/sem")}</div>
                </div>
                <span style={{fontSize:11,color:C.earth,fontWeight:600}}>Ver →</span>
              </button>
            );})}
          </div>
        </div>
      )}

      {maxTotal<=0 ? (
        <div style={{background:C.surfaceWarm,borderRadius:14,padding:"22px",textAlign:"center",fontSize:13,color:C.earth,lineHeight:1.7,border:"1px solid "+C.line}}>Aún no tienes trabajos registrados en las últimas 8 semanas, por lo que no hay un monto disponible para adelanto.</div>
      ) : disponible<=0 ? (
        <div style={{background:C.surfaceWarm,borderRadius:14,padding:"22px",textAlign:"center",fontSize:13,color:C.earth,lineHeight:1.7,border:"1px solid "+C.line}}>Ya tienes el máximo en adelantos vigentes. Podrás solicitar otro cuando bajes el saldo pendiente.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* PASO 1 — Documento */}
          <div style={{background:"#fff",borderRadius:16,border:"1px solid "+C.line,boxShadow:"0 4px 16px rgba(62,63,63,.04)",padding:"16px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:13}}><StepBadge n={1} done={!!dpiPhoto} active={!dpiPhoto}/><span style={{fontSize:13.5,fontWeight:700,color:C.black}}>Sube tu documento</span></div>
            {dpiPhoto?(
              <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:"1px solid "+C.gray}}>
                <img src={dpiPhoto} alt="DPI" style={{width:"100%",display:"block",maxHeight:220,objectFit:"cover"}}/>
                <button onClick={function(){setDpiPhoto(null);}} style={{position:"absolute",top:8,right:8,width:30,height:30,borderRadius:"50%",border:"none",background:"rgba(62,63,63,.7)",color:"#fff",fontSize:17,cursor:"pointer"}}>×</button>
              </div>
            ):(
              <button onClick={function(){if(fileRef.current)fileRef.current.click();}} style={{width:"100%",padding:"26px",borderRadius:12,border:"2px dashed "+C.gray,background:C.surfaceWarm,display:"flex",flexDirection:"column",alignItems:"center",gap:7,cursor:"pointer",color:C.earth}}>
                <Icon name="camera" size={24} stroke={C.earth}/>
                <span style={{fontSize:13,fontWeight:600,color:C.black}}>Tomar foto / subir DPI</span>
                <span style={{fontSize:10.5,color:C.earth,textAlign:"center"}}>De aquí se toman tu nombre y número de DPI para el contrato</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={function(e){if(e.target.files&&e.target.files[0])pickDpi(e.target.files[0]);e.target.value="";}}/>
          </div>

          {/* PASO 2 — Confirma datos del documento */}
          {dpiPhoto&&(
            <div style={{background:"#fff",borderRadius:16,border:"1px solid "+C.line,boxShadow:"0 4px 16px rgba(62,63,63,.04)",padding:"16px 18px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:13}}><StepBadge n={2} done={!!(nombre.trim()&&dpiNum.trim())} active={!(nombre.trim()&&dpiNum.trim())}/><span style={{fontSize:13.5,fontWeight:700,color:C.black}}>Confirma tus datos</span></div>
              <div style={{fontSize:11,color:C.earth,marginBottom:13,lineHeight:1.6}}>Verifica que coincidan exactamente con tu documento. Se usarán en el contrato.</div>
              <div style={{display:"flex",flexDirection:"column",gap:13}} className="f">
                <F label="Nombre completo (como en el DPI)"><input value={nombre} onChange={function(e){setNombre(e.target.value);setErr("");}} placeholder="Nombre y apellidos"/></F>
                <F label="Número de DPI (CUI)"><input value={dpiNum} onChange={function(e){setDpiNum(e.target.value);setErr("");}} placeholder="0000 00000 0000" inputMode="numeric"/></F>
              </div>
            </div>
          )}

          {/* PASO 3 — Monto y plazo */}
          {datosOk&&(
            <div style={{background:"#fff",borderRadius:16,border:"1px solid "+C.line,boxShadow:"0 4px 16px rgba(62,63,63,.04)",padding:"16px 18px"}} className="f">
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:13}}><StepBadge n={3} done={montoOk} active={!montoOk}/><span style={{fontSize:13.5,fontWeight:700,color:C.black}}>Monto y plazo</span></div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <F label={"Monto a solicitar (máx. Q"+disponible.toLocaleString()+")"}><input type="number" inputMode="numeric" placeholder={"Ej. "+Math.min(500,disponible)} value={monto} onChange={function(e){setMonto(e.target.value);setErr("");}}/></F>
                {montoN>disponible&&<div style={{fontSize:11,color:C.red,fontWeight:600,marginTop:-6}}>Excede tu disponible (Q{disponible.toLocaleString()}).</div>}
                <div>
                  <div style={{fontSize:10,fontWeight:600,color:C.earth,letterSpacing:".2em",textTransform:"uppercase",marginBottom:9}}>Cuotas semanales — máx. 16</div>
                  <div style={{display:"flex",alignItems:"center",gap:14}}>
                    <input type="range" min="1" max="16" value={cuotas} onChange={function(e){setCuotas(parseInt(e.target.value));}} style={{flex:1,accentColor:C.peach}}/>
                    <span style={{fontSize:15,fontWeight:700,color:C.black,minWidth:64,textAlign:"right"}}>{cuotas} sem.</span>
                  </div>
                </div>
                {montoN>0&&(
                  <div style={{background:C.peach12||"rgba(233,130,106,.12)",borderRadius:12,padding:"13px 15px",display:"flex",flexDirection:"column",gap:9}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.black,fontWeight:600}}>Descuento semanal</span><span style={{fontSize:17,fontWeight:700,color:C.peach}}>Q{semanal.toLocaleString()}</span></div>
                    <div style={{height:1,background:"rgba(62,63,63,.10)"}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.black,fontWeight:600}}>Débito mensual aprox.</span><span style={{fontSize:14,fontWeight:700,color:C.black}}>Q{mensual.toLocaleString()}</span></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PASO 4 — Firma y envío */}
          {montoOk&&(
            <div style={{background:"#fff",borderRadius:16,border:"1px solid "+C.line,boxShadow:"0 4px 16px rgba(62,63,63,.04)",padding:"16px 18px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:13}}><StepBadge n={4} done={!!firma} active={!firma}/><span style={{fontSize:13.5,fontWeight:700,color:C.black}}>Firma y envía</span></div>
              <button onClick={function(){setPreview(Object.assign({vendorEmail:vendor.email},draft()));}} style={{width:"100%",padding:"12px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.black,fontSize:12.5,fontWeight:600,cursor:"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Icon name="file" size={15} stroke={C.black}/>Leer el contrato</button>
              <div style={{fontSize:10,fontWeight:600,color:C.earth,letterSpacing:".2em",textTransform:"uppercase",marginBottom:9}}>Tu firma</div>
              <SignaturePad onChange={setFirma}/>
              <div style={{fontSize:10.5,color:C.earth,lineHeight:1.6,marginTop:10}}>Al firmar aceptas el contrato de adelanto y autorizas el descuento semanal automático.</div>
            </div>
          )}

          {err&&<Err msg={err}/>}
          <BigBtn onClick={submit} dis={busy||!firma}>{busy?"Enviando…":"Firmar y enviar solicitud →"}</BigBtn>
          <div style={{fontSize:11,color:C.earth,textAlign:"center",lineHeight:1.7,padding:"0 10px"}}>El administrador revisará tu solicitud antes de activarla. El descuento semanal se aplica automáticamente a tus pagos.</div>
        </div>
      )}
      {preview&&<ContractModal adv={preview} onClose={function(){setPreview(null);}}/>}
    </div>
  );
}
/* ─── Pad de firma (mouse + táctil) */
function SignaturePad({onChange, height}){
  const ref=useRef(null); const ctxRef=useRef(null); const drawing=useRef(false); const empty=useRef(true);
  const [has,setHas]=useState(false);
  var H = height||150;
  useEffect(function(){
    var c=ref.current; if(!c) return;
    var rect=c.getBoundingClientRect();
    c.width=rect.width*2; c.height=H*2;
    var ctx=c.getContext("2d"); ctx.scale(2,2); ctx.lineWidth=2.2; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle="#3E3F3F"; ctxRef.current=ctx;
  },[]);
  function pos(e){ var c=ref.current; var r=c.getBoundingClientRect(); var t=e.touches&&e.touches[0]; var x=(t?t.clientX:e.clientX)-r.left; var y=(t?t.clientY:e.clientY)-r.top; return {x:x,y:y}; }
  function start(e){ e.preventDefault(); drawing.current=true; var p=pos(e); ctxRef.current.beginPath(); ctxRef.current.moveTo(p.x,p.y); }
  function move(e){ if(!drawing.current)return; e.preventDefault(); var p=pos(e); ctxRef.current.lineTo(p.x,p.y); ctxRef.current.stroke(); empty.current=false; if(!has)setHas(true); }
  function end(){ if(!drawing.current)return; drawing.current=false; if(!empty.current&&onChange) onChange(ref.current.toDataURL("image/png")); }
  function clear(){ var c=ref.current; ctxRef.current.clearRect(0,0,c.width,c.height); empty.current=true; setHas(false); if(onChange)onChange(null); }
  return (
    <div>
      <canvas ref={ref}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{width:"100%",height:H+"px",background:C.surfaceWarm,border:"1.5px dashed "+(has?C.green:C.gray),borderRadius:12,touchAction:"none",display:"block",cursor:"crosshair"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:7}}>
        <span style={{fontSize:11,color:has?C.green:C.earth,fontWeight:has?700:400}}>{has?"✓ Firma capturada":"Firma con el dedo o el mouse"}</span>
        <button onClick={clear} style={{background:"none",border:"none",color:C.earth,fontSize:11,fontWeight:600,cursor:"pointer",textDecoration:"underline"}}>Borrar</button>
      </div>
    </div>
  );
}
function AdvStat({label,value,accent}){
  return <div><div style={{fontSize:9,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase",marginBottom:4}}>{label}</div><div style={{fontSize:18,fontWeight:700,color:accent?C.peach:C.black}}>{value}</div></div>;
}

/* ─── Admin: manage advances */
function AdvancesAdmin({adelantos, reps, vendors, onSvAdelantos}){
  const [preview,setPreview] = useState(null);
  var list = adelantos||[];
  var pend   = list.filter(function(a){return a.status==="pendiente";});
  var active = list.filter(function(a){return a.status==="activo";});
  var done   = list.filter(function(a){return a.status==="pagado"||a.status==="rechazado";});

  function update(id, patch){ onSvAdelantos(list.map(function(a){return a.id===id?Object.assign({},a,patch):a;})); }
  function approve(a){ update(a.id,{status:"activo", fechaDeposito:a.fechaDeposito||todayStr(), fechaInicio:a.fechaInicio||a.fechaDeposito||todayStr()}); }
  function reject(a){ update(a.id,{status:"rechazado"}); }
  function pauseNext(a){
    var k=nextChargeableWeek(a, reps);
    if(!k) return;
    var pausas=(a.pausas||[]).slice();
    if(pausas.indexOf(k)<0) pausas.push(k);
    update(a.id, {pausas:pausas});
  }
  function unpauseWeek(a, k){
    update(a.id, {pausas:(a.pausas||[]).filter(function(x){return x!==k;})});
  }
  function delAdv(a){ onSvAdelantos(list.filter(function(x){return x.id!==a.id;})); }

  var totalSaldo = active.reduce(function(s,a){return s+advanceState(a,reps).saldo;},0);
  var totalSemanal = weeklyAdvanceCharge(list, reps);

  return (
    <div style={{maxWidth:760,margin:"0 auto",padding:"26px 16px 90px",fontFamily:"Montserrat,sans-serif"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9.5,fontWeight:600,color:C.earth,letterSpacing:".28em",textTransform:"uppercase",marginBottom:8}}>Adelantos</div>
        <div style={{fontFamily:"'Valky','Cormorant Garamond',serif",fontSize:28,color:C.black}}>Adelantos de pago</div>
      </div>

      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
        <div style={{background:"#fff",borderRadius:16,padding:"16px 18px",border:"1px solid "+C.line,boxShadow:"0 4px 16px rgba(62,63,63,.05)"}}><div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:5}}>Activos</div><div style={{fontSize:24,fontWeight:600,color:C.black}}>{active.length}</div></div>
        <div style={{background:"#fff",borderRadius:16,padding:"16px 18px",border:"1px solid "+C.line,boxShadow:"0 4px 16px rgba(62,63,63,.05)"}}><div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:5}}>Saldo total</div><div style={{fontSize:24,fontWeight:600,color:C.black}}>Q{totalSaldo.toLocaleString()}</div></div>
        <div style={{background:C.black,borderRadius:16,padding:"16px 18px"}}><div style={{fontSize:9.5,fontWeight:700,color:"rgba(255,255,255,.6)",letterSpacing:".14em",textTransform:"uppercase",marginBottom:5}}>Descuento / semana</div><div style={{fontSize:24,fontWeight:600,color:C.peach}}>Q{totalSemanal.toLocaleString()}</div></div>
      </div>

      {/* Pending requests */}
      {pend.length>0&&(
        <div style={{marginBottom:26}}>
          <div style={{fontSize:10,fontWeight:700,color:C.orange,letterSpacing:".18em",textTransform:"uppercase",marginBottom:12}}>Solicitudes pendientes · {pend.length}</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {pend.map(function(a){ return (
              <div key={a.id} style={{background:"#fff",borderRadius:16,border:"1.5px solid "+C.orange+"55",overflow:"hidden",boxShadow:"0 4px 16px rgba(62,63,63,.05)"}}>
                <div style={{padding:"16px 18px",display:"flex",flexWrap:"wrap",gap:14,alignItems:"center"}}>
                  <div style={{flex:1,minWidth:160}}>
                    <div style={{fontSize:15,fontWeight:700,color:C.black}}>{a.vendorName||a.vendorEmail}</div>
                    <div style={{fontSize:11.5,color:C.earth,marginTop:2}}>DPI {a.dpiNumber||"—"}</div>
                  </div>
                  <div style={{display:"flex",gap:18}}>
                    <AdvStat label="Monto" value={"Q"+(a.monto||0).toLocaleString()}/>
                    <AdvStat label="Semanal" value={"Q"+(a.cobroSemanal||0).toLocaleString()} accent/>
                    <AdvStat label="Cuotas" value={a.cuotas}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,padding:"0 18px 16px",flexWrap:"wrap"}}>
                  <button onClick={function(){approve(a);}} style={{flex:1,minWidth:120,padding:"11px",borderRadius:100,border:"none",background:C.green,color:"#fff",fontSize:12.5,fontWeight:700,cursor:"pointer"}}>Aprobar y activar</button>
                  <button onClick={function(){setPreview(a);}} style={{padding:"11px 18px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.black,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Ver contrato</button>
                  <button onClick={function(){reject(a);}} style={{padding:"11px 18px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.red,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Rechazar</button>
                </div>
              </div>
            );})}
          </div>
        </div>
      )}

      {/* Active advances */}
      <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase",marginBottom:12}}>Adelantos activos · {active.length}</div>
      {active.length===0&&<div style={{textAlign:"center",padding:"30px",color:C.earth,fontSize:13}}>No hay adelantos activos.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {active.map(function(a){ var st=advanceState(a,reps); var pct=st.monto>0?Math.round(st.debited/st.monto*100):0; var avgPay=avgWeekPay(reps,a.vendorEmail); var pctPay=avgPay>0?Math.round(st.semanal/avgPay*100):0; var nextK=nextChargeableWeek(a,reps); var pausasFut=(a.pausas||[]).filter(function(k){ var w=st.weeks[k]; return !(w&&w.n>0&&w.paid===w.n); }); return (
          <div key={a.id} style={{background:"#fff",borderRadius:16,border:"1px solid "+C.line,overflow:"hidden",boxShadow:"0 4px 16px rgba(62,63,63,.05)"}}>
            <div style={{padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:14,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:C.black}}>{a.vendorName||a.vendorEmail}{!a.vendorEmail&&<span style={{fontSize:9,fontWeight:700,color:C.red,background:"#F5EDEC",padding:"2px 7px",borderRadius:100,marginLeft:8,letterSpacing:".06em"}}>SIN LIGAR</span>}</div>
                  <div style={{fontSize:11,color:C.earth,marginTop:2}}>Inicio {fmtDMY(advStart(a))}{a.dpiNumber?" \u00b7 DPI "+a.dpiNumber:""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase"}}>Saldo</div>
                  <div style={{fontSize:20,fontWeight:700,color:C.black}}>Q{st.saldo.toLocaleString()}</div>
                </div>
              </div>
              {/* progress */}
              <div style={{height:6,borderRadius:100,background:C.surfaceWarm,overflow:"hidden",marginBottom:8}}><div style={{height:"100%",width:pct+"%",background:C.green,borderRadius:100,transition:"width .3s"}}/></div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.earth,marginBottom:12,flexWrap:"wrap",gap:6}}>
                <span>{st.paidWeeks} / {st.cuotas} cuotas · Q{st.debited.toLocaleString()} debitado</span>
                <span style={{color:C.peach,fontWeight:700}}>Q{st.weeklyCharge.toLocaleString()} / semana{pctPay>0?" \u00b7 "+pctPay+"% del pago":""}</span>
              </div>
              {/* próximo cobro / pausas */}
              <div style={{background:C.surfaceWarm,borderRadius:10,padding:"9px 12px",marginBottom:12,fontSize:11,color:C.earth,lineHeight:1.6}}>
                <span style={{fontWeight:700,color:C.black}}>Cobro automático.</span> Se debita Q{st.semanal.toLocaleString()} cuando se pagan todos los trabajos de la semana.{nextK&&<> Próximo: <span style={{fontWeight:700,color:C.black}}>{weekLabel(nextK)}</span>.</>}
                {pausasFut.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}><span style={{fontWeight:700,color:C.orange}}>En pausa:</span>{pausasFut.map(function(k){return <button key={k} onClick={function(){unpauseWeek(a,k);}} title="Reanudar esta semana" style={{fontSize:10,fontWeight:700,color:C.orange,background:"#fff",border:"1px solid "+C.orange+"66",borderRadius:100,padding:"2px 9px",cursor:"pointer"}}>{weekLabel(k)} ×</button>;})}</div>}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={function(){pauseNext(a);}} disabled={!nextK} style={{flex:1,minWidth:150,padding:"10px",borderRadius:100,border:"1.5px solid "+(nextK?C.orange:C.gray),background:"#fff",color:nextK?C.orange:C.gray,fontSize:12,fontWeight:700,cursor:nextK?"pointer":"not-allowed"}}>Pausar próximo cobro</button>
                <button onClick={function(){setPreview(a);}} style={{padding:"10px 16px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.black,fontSize:12,fontWeight:600,cursor:"pointer"}}>Contrato</button>
                <button onClick={function(){delAdv(a);}} title="Eliminar" style={{padding:"10px 14px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.earth,fontSize:12,cursor:"pointer"}}><Icon name="trash" size={15} stroke={C.earth}/></button>
              </div>
            </div>
          </div>
        );})}
      </div>

      {/* History */}
      {done.length>0&&(
        <div style={{marginTop:26}}>
          <div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".18em",textTransform:"uppercase",marginBottom:12}}>Historial · {done.length}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {done.map(function(a){ return (
              <div key={a.id} style={{background:C.surfaceWarm,borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid "+C.line}}>
                <div><div style={{fontSize:13,fontWeight:600,color:C.black}}>{a.vendorName||a.vendorEmail}</div><div style={{fontSize:11,color:C.earth}}>Q{(a.monto||0).toLocaleString()}</div></div>
                <span style={{fontSize:11,fontWeight:700,letterSpacing:".06em",padding:"3px 10px",borderRadius:100,background:a.status==="pagado"?"#EDF5EF":"#F5EDEC",color:a.status==="pagado"?C.green:C.red}}>{a.status==="pagado"?"Pagado":"Rechazado"}</span>
              </div>
            );})}
          </div>
        </div>
      )}

      {preview&&<ContractModal adv={preview} onClose={function(){setPreview(null);}}/>}
    </div>
  );
}

function GS() {
  var css = "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap');"
    + "@font-face{font-family:'Valky';src:url('/fonts/Valky-Light.otf') format('opentype');font-weight:300;font-style:normal;font-display:swap;}"
    + "@font-face{font-family:'Valky';src:url('/fonts/Valky-Regular.otf') format('opentype');font-weight:400;font-style:normal;font-display:swap;}"
    + "@font-face{font-family:'Valky';src:url('/fonts/Valky-Semibold.otf') format('opentype');font-weight:600;font-style:normal;font-display:swap;}"
    + "@font-face{font-family:'Valky';src:url('/fonts/Valky-Bold.otf') format('opentype');font-weight:700;font-style:normal;font-display:swap;}"
    + "*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}"
    + "body{background:#FAFAFA;font-family:'Montserrat',sans-serif;}"
    + "button,input,select,textarea{font-family:'Montserrat',sans-serif;letter-spacing:.03em;}"
    + "textarea{resize:vertical;}"
    + "button{cursor:pointer;}"
    + ".rh{cursor:pointer;transition:background .15s;}"
    + ".rh:hover{background:#F5F3F0!important;}"
    + ".rh:active{background:#EFEBE6!important;}"
    + ".f label{display:block;font-size:10px;font-weight:600;color:#938B8A;letter-spacing:.2em;text-transform:uppercase;margin-bottom:7px;}"
    + ".f input,.f select,.f textarea{width:100%;border:1px solid #D8D4CE;border-radius:6px;padding:12px 14px;font-size:14px;color:#3E3F3F;background:#fff;outline:none;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none;appearance:none;}"
    + ".f input:focus,.f select:focus,.f textarea:focus{border-color:#938B8A;box-shadow:0 0 0 3px rgba(147,139,138,.10);}"
    + "::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#D8D4CE;border-radius:3px;}"
    + "::placeholder{color:#B7B0AE;}"
    + "@media(max-width:639px){.hide-mobile{display:none!important;}.table-cols{grid-template-columns:1fr auto!important;}}"
    + "@media(max-width:639px){.filter-cols{grid-template-columns:1fr 1fr!important;}}"
    + "@media(max-width:639px){.chart-side{grid-template-columns:1fr!important;}}"
    + "@media(max-width:639px){.stat-row{gap:10px!important;flex-wrap:wrap!important;}}"
    + "input[type=date]{min-height:44px;}"
    + "select{min-height:40px;padding-right:36px;position:relative;}"
    + "button:active{transform:scale(.98);}"
    + ".card-hover:hover{box-shadow:0 4px 16px rgba(0,0,0,.07)!important;transform:translateY(-1px);transition:all .2s;}"
    + "input[type=date]::-webkit-calendar-picker-indicator{opacity:.5;cursor:pointer;}";
  return <style>{css}</style>;
}

function Card({title,children,accent}) { return <div style={{background:"#fff",borderRadius:8,padding:"18px",border:"1px solid "+(accent?accent:C.gray),boxShadow:"0 1px 4px rgba(0,0,0,.04)",transition:"box-shadow .2s"}}><div style={{fontSize:9,fontWeight:600,color:accent?accent:C.earth,letterSpacing:".24em",textTransform:"uppercase",marginBottom:14,paddingBottom:10,borderBottom:"1px solid "+(accent?accent+"40":C.line)}}>{title}</div>{children}</div>; }
function F({label,children}) { return <div className="f"><label>{label}</label>{children}</div>; }
function BigBtn({onClick,dis,children}) { return <button onClick={onClick} disabled={dis} style={{width:"100%",padding:"17px",borderRadius:6,border:"none",background:dis?C.gray:C.black,color:"#fff",fontSize:12,fontWeight:600,letterSpacing:".18em",textTransform:"uppercase",cursor:dis?"not-allowed":"pointer",transition:"all .2s",opacity:dis?.5:1,minHeight:52}}>{children}</button>; }
function Stat({label,value,green,warn,peach,sub}) { return <div><div style={{fontSize:10,fontWeight:700,color:C.earth,letterSpacing:".14em",textTransform:"uppercase",marginBottom:3}}>{label}</div><div style={{fontSize:20,fontWeight:600,color:peach?C.peach:green?C.green:warn?C.red:C.black}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.earth,marginTop:1}}>{sub}</div>}</div>; }
function Sep() { return <div style={{width:1,height:30,background:C.gray}}/>; }
/* Bloque de estadísticas: valor NETO destacado + chip "en curso" + desglose expandible.
   Separa lo pagable (semanas anteriores) de la semana en curso para dar claridad al pago. */
function StatsSummary({heroLabel, heroValue, heroGreen, enCursoCount, enCursoMonto, items, defaultOpen}){
  const [open,setOpen]=useState(!!defaultOpen);
  return (
    <div style={{background:"#fff",borderBottom:"1px solid "+C.line,padding:"16px 18px"}}>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:9.5,fontWeight:700,color:C.earth,letterSpacing:".16em",textTransform:"uppercase",marginBottom:6,display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
            <span>{heroLabel}</span>
            <span style={{fontWeight:500,letterSpacing:".02em",color:C.earth,textTransform:"none",fontSize:10.5}}>semanas anteriores</span>
          </div>
          <div style={{fontSize:34,fontWeight:600,letterSpacing:"-.02em",color:heroGreen?C.green:C.black,lineHeight:1}}>{heroValue}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {enCursoMonto>0&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",paddingRight:12,borderRight:"1px solid "+C.line}}>
              <span style={{fontSize:8.5,fontWeight:700,color:C.peach,letterSpacing:".14em",textTransform:"uppercase",marginBottom:2}}>En curso</span>
              <span style={{fontSize:15,fontWeight:700,color:C.black}}>Q{Math.round(enCursoMonto).toLocaleString()}</span>
              <span style={{fontSize:9.5,color:C.earth}}>{enCursoCount} trab. · aún no pagable</span>
            </div>
          )}
          <button onClick={function(){setOpen(function(p){return !p;});}} style={{display:"flex",alignItems:"center",gap:6,background:open?C.black:"#fff",color:open?"#fff":C.black,border:"1.5px solid "+(open?C.black:C.gray),borderRadius:100,padding:"8px 14px",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap"}}>
            Desglose <Icon name="chevronDown" size={13} stroke={open?"#fff":C.black} style={{transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}/>
          </button>
        </div>
      </div>
      {open&&(
        <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid "+C.line,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(108px,1fr))",gap:16}}>
          {items.filter(Boolean).map(function(it,i){ return (
            <div key={i}>
              <div style={{fontSize:9,fontWeight:700,color:C.earth,letterSpacing:".13em",textTransform:"uppercase",marginBottom:4}}>{it.label}</div>
              <div style={{fontSize:16,fontWeight:700,color:it.peach?C.peach:(it.green?C.green:C.black)}}>{it.value}</div>
              {it.sub&&<div style={{fontSize:10,color:C.earth,marginTop:2}}>{it.sub}</div>}
            </div>
          );})}
        </div>
      )}
    </div>
  );
}
function Tile({label,value,accent}) { return <div style={{background:C.surfaceWarm,borderRadius:6,padding:"12px 14px",border:"1px solid "+C.line}}><div style={{fontSize:9,color:C.earth,fontWeight:600,letterSpacing:".18em",textTransform:"uppercase",marginBottom:5}}>{label}</div><div style={{fontSize:14,fontWeight:600,color:accent?C.taupe:C.black}}>{value}</div></div>; }
function Overlay({onClick,children}) { return <div onClick={onClick} style={{position:"fixed",inset:0,background:"rgba(62,63,63,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>{children}</div>; }
function Err({msg}) { return <div style={{fontSize:12,color:C.red,background:"#F5EDEC",padding:"9px 12px",borderRadius:8,lineHeight:1.4}}>{msg}</div>; }
function Loader() {
  const [secs, setSecs] = useState(0);
  useEffect(function(){
    var t = setInterval(function(){setSecs(function(s){return s+1;});},1000);
    return function(){clearInterval(t);};
  },[]);
  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:C.alabaster,gap:20}}>
      <LogoWordmark width={180}/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
        <div style={{fontSize:9.5,color:C.taupe,letterSpacing:".22em",textTransform:"uppercase",fontFamily:"Montserrat,sans-serif"}}>
          {secs<4?"Conectando con Google Sheets…":secs<8?"Esto puede tardar unos segundos…":"Verificando conexión…"}
        </div>
        <div style={{display:"flex",gap:6,marginTop:4}}>
          {[0,1,2].map(function(i){return <div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.earth,opacity:.4}}/>;}) }
        </div>
        {secs>=7&&(
          <div style={{marginTop:12,fontSize:11,color:C.taupe,fontFamily:"Montserrat,sans-serif",textAlign:"center",maxWidth:260,lineHeight:1.7}}>
            Primera carga puede tardar ~10 seg.<br/>
            <span style={{fontSize:10,opacity:.7}}>El app cargará automáticamente.</span>
          </div>
        )}
      </div>
    </div>
  );
}
function SyncBanner({msg}) {
  return (
    <div style={{position:"fixed",bottom:72,left:"50%",transform:"translateX(-50%)",zIndex:300,background:C.black,color:"#fff",borderRadius:100,padding:"10px 20px",fontSize:12,fontWeight:600,letterSpacing:".06em",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 20px rgba(0,0,0,.25)",whiteSpace:"nowrap"}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:C.sand,flexShrink:0}}/>
      {msg||"Sincronizando con Google…"}
    </div>
  );
}
function ConfirmDel({onCancel,onConfirm}) {
  return (
    <div style={{background:"#fff",borderRadius:8,padding:"28px 30px",maxWidth:300,textAlign:"center",boxShadow:"0 16px 48px rgba(0,0,0,.16)"}}>
      <div style={{fontSize:34,marginBottom:12}}>🗑</div>
      <div style={{fontSize:15,fontWeight:600,color:C.black,marginBottom:6}}>¿Eliminar registro?</div>
      <div style={{fontSize:13,color:C.earth,marginBottom:22,lineHeight:1.5}}>Esta acción no se puede deshacer.</div>
      <div style={{display:"flex",gap:10,justifyContent:"center"}}>
        <button onClick={onCancel}  style={{padding:"9px 18px",borderRadius:100,border:"1.5px solid "+C.gray,background:"#fff",color:C.black,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Cancelar</button>
        <button onClick={onConfirm} style={{padding:"9px 18px",borderRadius:100,border:"none",background:C.red,color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Eliminar</button>
      </div>
    </div>
  );
}
function DropF({label,value,options,onChange,active}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <span style={{fontSize:10.5,fontWeight:700,color:active?C.black:C.earth,letterSpacing:".1em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{label}</span>
      <select value={value} onChange={function(e){onChange(e.target.value);}} style={{border:"1px solid "+(active?C.black:C.gray),borderRadius:6,padding:"6px 10px",fontSize:12,color:active?C.black:C.earth,background:"#fff",outline:"none",fontFamily:"Montserrat,sans-serif",cursor:"pointer",fontWeight:active?600:400,transition:"all .2s",letterSpacing:".03em"}}>
        {options.map(function(o){return <option key={o}>{o}</option>;})}
      </select>
    </div>
  );
}
function ChipBtn({active,onClick,children,color}) {
  var ac=color||C.black;
  return <button onClick={onClick} style={{padding:"6px 13px",borderRadius:6,border:"1px solid "+(active?ac:C.gray),background:active?ac:"#fff",color:active?"#fff":C.earth,fontSize:11.5,fontWeight:600,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap",letterSpacing:".03em"}}>{children}</button>;
}
function PicUp({label,max,photos,accent,onAdd,onDel}) {
  var ref=useRef(null);
  return (
    <div>
      <div style={{fontSize:10.5,fontWeight:700,color:accent,letterSpacing:".14em",textTransform:"uppercase",marginBottom:10}}>Fotos {label} <span style={{color:C.earth,fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:10}}>máx. {max}</span></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {photos.map(function(src,i){ return <div key={i} style={{position:"relative",width:84,height:84,borderRadius:11,overflow:"hidden",border:"2px solid "+accent+"30"}}><img src={src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/><button onClick={function(){onDel(i);}} style={{position:"absolute",top:3,right:3,width:20,height:20,borderRadius:"50%",border:"none",background:"rgba(0,0,0,.55)",color:"#fff",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",lineHeight:1}}>×</button></div>; })}
        {photos.length<max&&<button onClick={function(){if(ref.current)ref.current.click();}} style={{width:84,height:84,borderRadius:11,border:"2px dashed "+accent+"50",background:C.beige,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer"}}><span style={{fontSize:22,color:accent}}>+</span><span style={{fontSize:10,color:C.earth,fontWeight:600}}>Subir</span></button>}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple style={{display:"none"}} onChange={function(e){if(e.target.files&&e.target.files.length)onAdd(e.target.files);e.target.value="";}}/>
    </div>
  );
}
function PicsRow({title,photos,accent}) { return <div><div style={{fontSize:10,color:accent||C.earth,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:10}}>{title}</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{photos.map(function(src,i){return <img key={i} src={src} alt="" style={{width:110,height:90,objectFit:"cover",borderRadius:9,border:"1px solid "+C.gray}}/>;})}</div></div>; }
function InvoiceUp({factura,onAdd,onDel}) {
  var ref=useRef(null);
  return (
    <div>
      {factura ? (
        <div style={{display:"flex",alignItems:"center",gap:12,background:C.surface,borderRadius:8,padding:"12px 14px",border:"1px solid "+C.line}}>
          <span style={{fontSize:20}}>{factura.type&&factura.type.startsWith("image/")?"🖼️":"📄"}</span>
          <span style={{fontSize:13,fontWeight:600,color:C.black,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{factura.name}</span>
          <button onClick={onDel} style={{background:"none",border:"none",color:C.red,fontSize:18,cursor:"pointer",lineHeight:1,flexShrink:0}}>×</button>
        </div>
      ) : (
        <button onClick={function(){if(ref.current)ref.current.click();}} style={{width:"100%",padding:"14px",borderRadius:10,border:"2px dashed "+C.gray,background:C.beige,display:"flex",alignItems:"center",justifyContent:"center",gap:10,cursor:"pointer",fontSize:13,color:C.earth,fontFamily:"Montserrat,sans-serif",fontWeight:600}}>
          <span style={{fontSize:20}}>📎</span>Adjuntar factura (PDF o imagen)
        </button>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={function(e){if(e.target.files&&e.target.files[0])onAdd(e.target.files[0]);e.target.value="";}}/>
    </div>
  );
}
