/* =====================================================================
 * codigos.js — Codigos de barras y validaciones de documentos
 *  - validarCodigo(): digito verificador GS1 (EAN-13, EAN-8, UPC-A, GTIN-14)
 *    + pais de origen por prefijo GS1.
 *  - leerGS1(): lee GTIN, lote, vencimiento y serie de codigos GS1-128 /
 *    DataMatrix (cajas de medicamentos).
 *  - buscarProductoPorCodigo(): consulta APIs abiertas y gratuitas
 *    (Open Pet Food Facts, Open Food Facts, Open Products Facts, UPCitemdb)
 *    y guarda el resultado en Firestore (codigos_cache) para no repetir.
 *  - generarCodigoInterno(): EAN-13 valido con prefijo 20 (uso interno).
 *  - pdfEtiquetas(): etiquetas con codigo de barras y precio.
 *  - validarRUC(): digito verificador del RUC paraguayo (modulo 11 SET).
 *  - Lector USB global: escanear en cualquier pantalla.
 * ===================================================================== */

/* ---------- GS1: digito verificador ---------- */
function _dvGS1(sinDV) {
  let s = 0;
  for (let i = sinDV.length - 1, p = 3; i >= 0; i--, p = p === 3 ? 1 : 3) s += Number(sinDV[i]) * p;
  return (10 - (s % 10)) % 10;
}
const PREFIJOS_GS1 = [
  [0, 19, "EE.UU. / Canadá"], [20, 29, "Uso interno (código propio)"], [30, 39, "EE.UU."], [40, 49, "Uso interno (código propio)"], [50, 59, "Cupón"],
  [60, 139, "EE.UU. / Canadá"], [200, 299, "Uso interno (código propio)"], [300, 379, "Francia"], [380, 380, "Bulgaria"], [400, 440, "Alemania"],
  [450, 459, "Japón"], [460, 469, "Rusia"], [471, 471, "Taiwán"], [489, 489, "Hong Kong"], [490, 499, "Japón"], [500, 509, "Reino Unido"],
  [520, 521, "Grecia"], [540, 549, "Bélgica / Luxemburgo"], [560, 560, "Portugal"], [590, 590, "Polonia"], [600, 601, "Sudáfrica"],
  [690, 699, "China"], [700, 709, "Noruega"], [729, 729, "Israel"], [730, 739, "Suecia"], [740, 740, "Guatemala"], [745, 745, "Panamá"],
  [750, 750, "México"], [754, 755, "Canadá"], [759, 759, "Venezuela"], [760, 769, "Suiza"], [770, 771, "Colombia"], [773, 773, "Uruguay"],
  [775, 775, "Perú"], [777, 777, "Bolivia"], [778, 779, "Argentina"], [780, 780, "Chile"], [784, 784, "Paraguay"], [786, 786, "Ecuador"],
  [789, 790, "Brasil"], [800, 839, "Italia"], [840, 849, "España"], [850, 850, "Cuba"], [858, 858, "Eslovaquia"], [859, 859, "Rep. Checa"],
  [868, 869, "Turquía"], [870, 879, "Países Bajos"], [880, 880, "Corea del Sur"], [885, 885, "Tailandia"], [888, 888, "Singapur"], [890, 890, "India"],
  [893, 893, "Vietnam"], [899, 899, "Indonesia"], [900, 919, "Austria"], [930, 939, "Australia"], [940, 949, "Nueva Zelanda"], [955, 955, "Malasia"],
  [977, 977, "Publicación (ISSN)"], [978, 979, "Libro (ISBN)"]
];
function paisGS1(ean13) {
  const p3 = Number(ean13.slice(0, 3));
  const f = PREFIJOS_GS1.find(function (x) { return p3 >= x[0] && p3 <= x[1]; }) ||
    PREFIJOS_GS1.find(function (x) { const p2 = Number(ean13.slice(0, 2)); return x[1] < 140 && p2 >= x[0] && p2 <= x[1]; });
  return f ? f[2] : "";
}
/* Devuelve { valido, tipo, normalizado, pais, mensaje }.
 * Codigos que no son GS1 (CODE128 internos, letras) se aceptan como "otro". */
function validarCodigo(codigo) {
  const c = String(codigo || "").trim();
  if (!c) return { valido: true, tipo: "", normalizado: "", pais: "", mensaje: "" };
  if (!/^\d+$/.test(c)) return { valido: true, tipo: "Otro (alfanumérico)", normalizado: c, pais: "", mensaje: "Código no numérico: no se puede verificar." };
  const tipos = { 8: "EAN-8", 12: "UPC-A", 13: "EAN-13", 14: "GTIN-14" };
  if (!tipos[c.length]) return { valido: true, tipo: "Otro", normalizado: c, pais: "", mensaje: "Largo no estándar (" + c.length + " dígitos): no se puede verificar." };
  const ok = _dvGS1(c.slice(0, -1)) === Number(c.slice(-1));
  let ean13 = c.length === 12 ? "0" + c : c.length === 14 && c[0] === "0" ? c.slice(1) : c;
  const pais = c.length === 8 ? "" : paisGS1(ean13.length === 13 ? ean13 : c.slice(1));
  return {
    valido: ok, tipo: tipos[c.length], normalizado: c.length === 14 && c[0] === "0" ? ean13 : c, pais: pais,
    mensaje: ok ? tipos[c.length] + " válido" + (pais ? " · " + pais : "") : "El dígito verificador no coincide: el código está mal leído o mal escrito."
  };
}
function htmlValidacionCodigo(codigo) {
  const v = validarCodigo(codigo);
  if (!v.tipo) return "";
  if (!/^\d+$/.test(v.normalizado) || !v.mensaje.match(/válido|verificador/)) return '<small class="hint">' + escHTML(v.mensaje) + "</small>";
  return '<small class="hint ' + (v.valido ? "texto-ok" : "texto-danger") + '"><i class="fa-solid ' + (v.valido ? "fa-circle-check" : "fa-circle-xmark") + '"></i> ' + escHTML(v.mensaje) + "</small>";
}

/* ---------- GS1-128 / DataMatrix (lote y vencimiento) ---------- */
const AI_FIJOS = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2 };
const AI_VARIABLES = { "10": 20, "21": 20, "22": 20, "30": 8, "37": 8, "90": 30, "91": 90, "92": 90, "240": 30, "241": 30, "250": 30 };
function leerGS1(texto) {
  let s = String(texto || "").trim().replace(/^\](C1|d2|Q3|e0)/, "");
  const GS = "\u001d";
  const r = {};
  if (/^\(\d{2,4}\)/.test(s)) {                       // formato legible: (01)...(17)...(10)...
    const re = /\((\d{2,4})\)([^(]*)/g; let m;
    while ((m = re.exec(s))) r[m[1]] = m[2].trim();
  } else if (/^(01|02|00)\d/.test(s) && s.length > 16) {  // formato crudo con separadores GS
    let i = 0, guard = 0;
    while (i < s.length && guard++ < 20) {
      if (s[i] === GS) { i++; continue; }
      let ai = s.substr(i, 2);
      if (AI_FIJOS[ai]) { r[ai] = s.substr(i + 2, AI_FIJOS[ai]); i += 2 + AI_FIJOS[ai]; continue; }
      if (!AI_VARIABLES[ai]) { ai = s.substr(i, 3); if (!AI_VARIABLES[ai]) { ai = s.substr(i, 4); if (!/^31\d\d$/.test(ai)) break; r[ai] = s.substr(i + 4, 6); i += 10; continue; } }
      const fin = s.indexOf(GS, i + ai.length);
      const val = s.substring(i + ai.length, fin === -1 ? Math.min(s.length, i + ai.length + AI_VARIABLES[ai]) : fin);
      r[ai] = val; i = i + ai.length + val.length;
    }
  } else return null;
  if (!r["01"] && !r["02"]) return null;
  const gtin = r["01"] || r["02"];
  let venc = null;
  if (r["17"] && /^\d{6}$/.test(r["17"])) {
    const a = 2000 + Number(r["17"].slice(0, 2)), mes = Number(r["17"].slice(2, 4)), dia = Number(r["17"].slice(4, 6));
    venc = dia === 0 ? new Date(a, mes, 0) : new Date(a, mes - 1, dia);
  }
  return { gtin: gtin, ean: gtin[0] === "0" ? gtin.slice(1) : gtin, lote: r["10"] || "", serie: r["21"] || "", vencimiento: venc, crudo: r };
}
/* Interpreta lo que llega del lector/camara: GS1 completo o codigo simple. */
function interpretarEscaneo(texto) {
  const g = leerGS1(texto);
  if (g) return { codigo: g.ean, lote: g.lote, vencimiento: g.vencimiento, gs1: true };
  return { codigo: String(texto || "").trim(), lote: "", vencimiento: null, gs1: false };
}
function _variantesCodigo(codigo) {
  const v = [codigo];
  if (codigo.length === 13 && codigo[0] === "0") v.push(codigo.slice(1));
  if (codigo.length === 12) v.push("0" + codigo);
  return v;
}
function _codigosDe(p) {
  return [p.codigoBarras].concat(p.codigosAlternos || []).filter(Boolean).map(String);
}
/* Producto por codigo: principal, alternativos o el de una presentacion (caja, blister...). */
function productoPorCodigo(codigo) {
  const r = resolverCodigo(codigo);
  return r ? r.producto : null;
}
/* Codigo de balanza (EAN-13 con prefijo configurado):
 *  modo "peso":   PP + PLU(5) + gramos(5) + DV  -> cantidad en kg
 *  modo "precio": PP + PLU(4) + precio Gs(6) + DV -> importe fijo */
function leerBalanza(codigo) {
  const c = cfg(), pref = String(c.balanzaPrefijo || "").trim();
  if (!/^\d{2}$/.test(pref) || !/^\d{13}$/.test(codigo) || codigo.slice(0, 2) !== pref) return null;
  if (_dvGS1(codigo.slice(0, 12)) !== Number(codigo[12])) return null;
  const precio = c.balanzaModo === "precio";
  const plu = String(Number(codigo.slice(2, precio ? 6 : 7)));
  const valor = Number(codigo.slice(precio ? 6 : 7, 12));
  return precio ? { plu: plu, importe: valor } : { plu: plu, kg: valor / 1000 };
}
/* Resuelve cualquier codigo escaneado a { producto, presentacion?, cantidad?, importe? }. */
function resolverCodigo(codigo) {
  codigo = String(codigo || "").trim();
  if (!codigo) return null;
  const prods = Datos.lista("productos");
  const bal = leerBalanza(codigo);
  if (bal) {
    const p = prods.find(function (x) { return x.plu != null && x.plu !== "" && String(Number(x.plu)) === bal.plu; });
    if (p) return bal.importe != null ? { producto: p, importe: bal.importe, balanza: true } : { producto: p, cantidad: bal.kg, balanza: true };
  }
  const vars = _variantesCodigo(codigo);
  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];
    if (_codigosDe(p).some(function (c) { return vars.indexOf(c) !== -1; })) return { producto: p };
    const pr = (p.presentaciones || []).find(function (x) { return x.codigo && vars.indexOf(String(x.codigo)) !== -1; });
    if (pr) return { producto: p, presentacion: pr };
  }
  return null;
}
/* Precio vigente (con oferta si corresponde). */
function precioVigente(p) {
  const of = Number(p.precioOferta) || 0;
  if (of > 0 && of < (Number(p.precioVenta) || Infinity)) {
    const h = aFecha(p.ofertaHasta), d = aFecha(p.ofertaDesde), hoy = new Date();
    if ((!h || finDelDia(h) >= hoy) && (!d || inicioDelDia(d) <= hoy)) return { precio: of, oferta: true, hasta: h };
  }
  return { precio: Number(p.precioVenta) || 0, oferta: false };
}

/* ---------- Busqueda en bases abiertas ---------- */
const FUENTES_CODIGO = [
  { nombre: "Open Pet Food Facts", url: "https://world.openpetfoodfacts.org/api/v2/product/{c}.json?fields=product_name,product_name_es,brands,quantity,image_front_small_url,image_front_url", categoria: "Alimento", tipo: "off" },
  { nombre: "Open Food Facts", url: "https://world.openfoodfacts.org/api/v2/product/{c}.json?fields=product_name,product_name_es,brands,quantity,image_front_small_url,image_front_url", categoria: "", tipo: "off" },
  { nombre: "Open Products Facts", url: "https://world.openproductsfacts.org/api/v2/product/{c}.json?fields=product_name,product_name_es,brands,quantity,image_front_small_url,image_front_url", categoria: "", tipo: "off" },
  { nombre: "UPCitemdb", url: "https://api.upcitemdb.com/prod/trial/lookup?upc={c}", categoria: "", tipo: "upc" }
];
async function _fetchJSON(url, ms) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 7000);
  try { const r = await fetch(url, { signal: ctrl ? ctrl.signal : undefined }); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; } finally { clearTimeout(t); }
}
async function buscarProductoPorCodigo(codigo, opciones) {
  const v = validarCodigo(codigo);
  if (!v.normalizado || !/^\d{8,14}$/.test(v.normalizado)) return { encontrado: false, motivo: "Solo se pueden buscar códigos numéricos EAN/UPC." };
  if (!v.valido) return { encontrado: false, motivo: v.mensaje };
  const c = v.normalizado;
  if (/^2\d/.test(c) && c.length === 13) return { encontrado: false, motivo: "Es un código interno: no existe en bases públicas." };
  const ref = db.collection("codigos_cache").doc(c);
  if (!(opciones && opciones.forzar)) {
    try { const s = await ref.get(); if (s.exists) { const d = s.data(); const f = aFecha(d.fecha); if (d.encontrado || (f && f > sumarDias(new Date(), -15))) return Object.assign({ cache: true }, d); } } catch (e) {}
  }
  if (!navigator.onLine) return { encontrado: false, motivo: "Sin conexión a internet." };
  let res = null;
  for (const f of FUENTES_CODIGO) {
    const j = await _fetchJSON(f.url.replace("{c}", encodeURIComponent(c)));
    if (!j) continue;
    if (f.tipo === "off" && j.status === 1 && j.product) {
      const p = j.product, nom = (p.product_name_es || p.product_name || "").trim();
      if (!nom) continue;
      res = { encontrado: true, nombre: nom + (p.quantity && nom.indexOf(p.quantity) === -1 ? " " + p.quantity : ""), marca: (p.brands || "").split(",")[0].trim(),
        imagen: p.image_front_small_url || p.image_front_url || "", categoria: f.categoria, fuente: f.nombre };
      break;
    }
    if (f.tipo === "upc" && j.items && j.items.length) {
      const it = j.items[0];
      res = { encontrado: true, nombre: it.title || "", marca: it.brand || "", imagen: (it.images || [])[0] || "", categoria: /pet|dog|cat|animal/i.test(it.category || "") ? "Alimento" : "", fuente: f.nombre };
      break;
    }
  }
  res = res || { encontrado: false, motivo: "No figura en las bases públicas (suele pasar con medicamentos veterinarios)." };
  try { await ref.set(Object.assign({ codigo: c, fecha: FS.serverTimestamp() }, res)); } catch (e) {}
  return res;
}

/* ---------- Codigos internos (EAN-13 con prefijo 20) ---------- */
async function generarCodigoInterno() {
  requiereConexion("Generar un código");
  let n = 0;
  await db.runTransaction(async function (tx) {
    const ref = db.collection("config").doc("contadores");
    const s = await tx.get(ref);
    n = (s.exists ? Number(s.data().codigoInterno) || 0 : 0) + 1;
    tx.set(ref, { codigoInterno: n }, { merge: true });
  });
  const base = "20" + String(n).padStart(10, "0");
  return base + _dvGS1(base);
}

/* ---------- Etiquetas con codigo de barras (PDF) ---------- */
const FORMATOS_ETIQUETA = {
  "a4-24": { nombre: "A4 · 24 etiquetas (70 × 37 mm)", pagina: "a4", cols: 3, filas: 8, w: 70, h: 37.125, mx: 0, my: 0 },
  "a4-40": { nombre: "A4 · 40 etiquetas (52,5 × 29,7 mm)", pagina: "a4", cols: 4, filas: 10, w: 52.5, h: 29.7, mx: 0, my: 0 },
  "t-50x25": { nombre: "Rollo térmico 50 × 25 mm", pagina: [50, 25], cols: 1, filas: 1, w: 50, h: 25, mx: 0, my: 0 },
  "t-40x30": { nombre: "Rollo térmico 40 × 30 mm", pagina: [40, 30], cols: 1, filas: 1, w: 40, h: 30, mx: 0, my: 0 }
};
function _imgCodigo(codigo) {
  const cv = document.createElement("canvas");
  const v = validarCodigo(codigo);
  const fmt = v.valido && v.normalizado.length === 13 ? "EAN13" : v.valido && v.normalizado.length === 8 ? "EAN8" : v.valido && v.normalizado.length === 12 ? "UPC" : "CODE128";
  try { JsBarcode(cv, fmt === "CODE128" ? String(codigo) : v.normalizado, { format: fmt, width: 2, height: 60, fontSize: 18, margin: 4, displayValue: true }); }
  catch (e) { JsBarcode(cv, String(codigo), { format: "CODE128", width: 2, height: 60, fontSize: 18, margin: 4 }); }
  return { data: cv.toDataURL("image/png"), w: cv.width, h: cv.height };
}
async function pdfEtiquetas(lista, formato, opciones) {
  opciones = opciones || {};
  await cargarLib("pdf"); await cargarLib("barcode");
  const F = FORMATOS_ETIQUETA[formato] || FORMATOS_ETIQUETA["a4-24"];
  const J = window.jspdf.jsPDF;
  const doc = new J({ unit: "mm", format: F.pagina, orientation: Array.isArray(F.pagina) && F.pagina[0] > F.pagina[1] ? "landscape" : "portrait" });
  const etiquetas = [];
  lista.forEach(function (x) { for (let i = 0; i < (x.cantidad || 1); i++) etiquetas.push(x.producto); });
  const porPag = F.cols * F.filas;
  const cache = {};
  etiquetas.forEach(function (p, i) {
    if (i > 0 && i % porPag === 0) doc.addPage(F.pagina, Array.isArray(F.pagina) && F.pagina[0] > F.pagina[1] ? "landscape" : "portrait");
    const k = i % porPag, x = F.mx + (k % F.cols) * F.w, y = F.my + Math.floor(k / F.cols) * F.h;
    const pad = 2.2;
    doc.setFont("helvetica", "normal"); doc.setFontSize(F.h < 28 ? 5.5 : 6.5); doc.setTextColor(110);
    if (opciones.clinica !== false) doc.text(nombreClinica(), x + pad, y + pad + 1.6);
    doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(F.h < 28 ? 7 : 8.5);
    const nom = doc.splitTextToSize(p.nombre || "", F.w - pad * 2).slice(0, 2);
    doc.text(nom, x + pad, y + pad + 4.8);
    if (opciones.precio !== false && p.precioVenta) { doc.setFontSize(F.h < 28 ? 9 : 11); doc.text(fmtMoneda(p.precioVenta).replace(/ /, " "), x + F.w - pad, y + pad + 4.8 + nom.length * 3.2, { align: "right" }); }
    if (p.codigoBarras) {
      const img = cache[p.codigoBarras] = cache[p.codigoBarras] || _imgCodigo(p.codigoBarras);
      const altoDisp = F.h * 0.48, anchoDisp = F.w - pad * 2;
      let w = anchoDisp, h = w * img.h / img.w; if (h > altoDisp) { h = altoDisp; w = h * img.w / img.h; }
      doc.addImage(img.data, "PNG", x + (F.w - w) / 2, y + F.h - h - 1.2, w, h);
    }
  });
  await guardarArchivo(doc.output("blob"), "etiquetas_" + hoyISO() + ".pdf");
}

/* ---------- RUC paraguayo (modulo 11, algoritmo de la SET) ---------- */
function dvRUC(numero) {
  const n = String(numero).toUpperCase().replace(/[^0-9A-Z]/g, "").split("").map(function (ch) { return /\d/.test(ch) ? ch : String(ch.charCodeAt(0)); }).join("");
  let total = 0, k = 2;
  for (let i = n.length - 1; i >= 0; i--) { if (k > 11) k = 2; total += Number(n[i]) * k; k++; }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}
/* Devuelve { tipo: "ruc"|"ci"|"", valido, mensaje } */
function validarRUC(texto) {
  const t = String(texto || "").trim();
  if (!t) return { tipo: "", valido: true, mensaje: "" };
  const m = t.match(/^([0-9A-Za-z]{3,9})-(\d)$/);
  if (m) {
    const ok = dvRUC(m[1]) === Number(m[2]);
    return { tipo: "ruc", valido: ok, mensaje: ok ? "RUC válido" : "El dígito verificador no coincide (debería ser " + m[1] + "-" + dvRUC(m[1]) + ")." };
  }
  if (/^\d{4,9}$/.test(t)) return { tipo: "ci", valido: true, mensaje: "CI (para facturar con RUC: " + t + "-" + dvRUC(t) + ")" };
  return { tipo: "", valido: false, mensaje: "Formato inválido. RUC: 80012345-6 · CI: solo números." };
}
function htmlValidacionRUC(texto) {
  const v = validarRUC(texto);
  if (!v.mensaje) return "";
  return '<small class="hint ' + (v.valido ? (v.tipo === "ruc" ? "texto-ok" : "") : "texto-danger") + '">' + (v.tipo === "ruc" || !v.valido ? '<i class="fa-solid ' + (v.valido ? "fa-circle-check" : "fa-circle-xmark") + '"></i> ' : "") + escHTML(v.mensaje) + "</small>";
}
/* Engancha validacion en vivo a un input (RUC o codigo). */
function validarEnVivo(input, tipo) {
  if (!input) return;
  let box = input.parentElement.querySelector(".val-vivo");
  if (!box) { box = document.createElement("div"); box.className = "val-vivo"; (input.closest(".form-field") || input.parentElement).appendChild(box); }
  const pintar = function () { box.innerHTML = tipo === "ruc" ? htmlValidacionRUC(input.value) : htmlValidacionCodigo(input.value); };
  input.addEventListener("input", pintar); input.addEventListener("change", pintar); pintar();
}

/* ---------- Lector USB global ----------
 * Los lectores escriben muy rapido y terminan con Enter. Si eso pasa
 * fuera de un campo de texto, se dispara window.alEscanear(codigo) de la
 * pagina, o se abre el producto en Stock. */
(function () {
  let buf = "", ultimo = 0, rapido = true;
  document.addEventListener("keydown", function (e) {
    const t = e.target, enCampo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (enCampo || e.ctrlKey || e.altKey || e.metaKey) { buf = ""; return; }
    const ahora = Date.now();
    if (ahora - ultimo > 60) { buf = ""; rapido = true; }
    ultimo = ahora;
    if (e.key === "Enter") {
      if (buf.length >= 6 && rapido) { e.preventDefault(); const c = buf; buf = ""; manejarEscaneoGlobal(c); }
      buf = ""; return;
    }
    if (e.key.length === 1) buf += e.key;
  }, true);
})();
function manejarEscaneoGlobal(texto) {
  if (_pilaModales && _pilaModales.length) { if (typeof window.alEscanearModal === "function") window.alEscanearModal(texto); return; }
  if (typeof window.alEscanear === "function") { window.alEscanear(texto); return; }
  if (!window.MASCOTITA.usuario || !puede("stock")) return;
  const e = interpretarEscaneo(texto);
  location.href = "stock.html?q=" + encodeURIComponent(e.codigo) + "&escaneo=1";
}
