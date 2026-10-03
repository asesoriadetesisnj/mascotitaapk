/* =====================================================================
 * venta.js — PUNTO DE VENTA (farmacia, alimentos, accesorios, servicios
 * y cobros de la clinica).
 * Pensado para una cajera con lector de codigos y teclado:
 *  - El campo de escaneo siempre tiene el foco; "3*" antes del codigo
 *    multiplica la cantidad. Codigos de presentaciones (caja/blister),
 *    codigos alternativos y etiquetas de balanza (peso o importe).
 *  - F2 buscar · F3 venta nueva/en espera · F4 cliente · F6 consultar
 *    precio · F7 editar linea · F8 descuento · F9 cobrar · Supr quitar.
 *  - Varias ventas en espera (se guardan en este equipo).
 *  - Pago mixto, vuelto, cuenta corriente, ticket con codigo de barras.
 *  - Productos bajo receta / controlados, vencidos, sin stock, ofertas.
 *  - Descuentos y cambios de precio con limite: arriba del limite pide
 *    clave de un administrador (autorizarSupervisor).
 * Usa el mismo nucleo de emision que la facturacion (emitirFacturaCore).
 * ===================================================================== */
const POS_KEY = "mascotita-pos";
const POS = { ventas: [], activa: 0, sel: -1, mult: 1, rapidos: [], cat: "__top", res: [], resIdx: 0, ocupado: false };

function _uidLinea() { return Math.random().toString(36).slice(2, 10); }
function ventaNueva(n) { return { id: _uidLinea(), nombre: "Venta " + n, items: [], cliente: null, clienteNombre: "", clienteRuc: "", descuentoGlobal: 0, origenes: [], autorizaciones: [], creada: Date.now() }; }
function V() { return POS.ventas[POS.activa]; }
function guardarPOS() { try { localStorage.setItem(POS_KEY, JSON.stringify({ ventas: POS.ventas, activa: POS.activa })); } catch (e) {} }
function cargarPOS() {
  try {
    const g = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (g && Array.isArray(g.ventas) && g.ventas.length) { POS.ventas = g.ventas; POS.activa = Math.min(g.activa || 0, g.ventas.length - 1); return; }
  } catch (e) {}
  // migrar el carrito de la version anterior (venta rapida)
  let items = [];
  try { const old = JSON.parse(sessionStorage.getItem("mascotita-venta") || "null"); if (old && old.items) items = old.items; } catch (e) {}
  POS.ventas = [ventaNueva(1)]; POS.ventas[0].items = items.map(function (i) { return Object.assign({ uid: _uidLinea(), precioLista: i.precio }, i); }); POS.activa = 0;
}
function descMax() { const n = Number(cfg().descuentoMaxCajero); return isNaN(n) || cfg().descuentoMaxCajero === "" || cfg().descuentoMaxCajero == null ? 10 : n; }
function beep(ok) {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = ok ? 1200 : 220; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (ok ? 0.07 : 0.25));
  } catch (e) {}
}
function focoScan() {
  if (_pilaModales && _pilaModales.length) return;
  // en pantallas tactiles no se fuerza el foco (abriria el teclado a cada rato); el lector USB igual funciona
  if (window.matchMedia && matchMedia("(pointer: coarse)").matches) return; const i = document.getElementById("pos-scan"); if (i && document.activeElement !== i) i.focus(); }

/* =====================================================================
 * PANTALLA
 * ===================================================================== */
async function initVenta() {
  await protegerPagina({ permiso: "facturar", pagina: "venta.html" });
  await cargarConfig();
  ["productos", "servicios", "propietarios", "mascotas"].forEach(function (c) { Datos.suscribir(c); });
  cargarPOS();
  document.body.classList.add("pos-pagina");
  document.getElementById("content").innerHTML =
    '<div class="pos">' +
    '<div class="pos-top">' +
    '  <div class="pos-tickets" id="pos-tickets"></div>' +
    '  <div class="pos-acc">' +
    '    <span id="pos-caja" class="pos-caja"></span>' +
    '    <button class="btn btn-ghost btn-sm" id="pos-precio" title="Consultar precio (F6)"><i class="fa-solid fa-tag"></i><span> Precio</span> <kbd>F6</kbd></button>' +
    '    <button class="btn btn-ghost btn-sm" id="pos-cargos" title="Consultas, cirugías e internaciones por cobrar"><i class="fa-solid fa-stethoscope"></i><span> Cobros clínica</span> <b class="pos-badge" id="pos-ncargos" hidden></b></button>' +
    '    <button class="btn btn-ghost btn-sm" id="pos-dev" title="Devolución / nota de crédito"><i class="fa-solid fa-rotate-left"></i><span> Devolución</span></button>' +
    '    <button class="btn btn-ghost btn-sm" id="pos-hist" title="Ventas de hoy"><i class="fa-solid fa-clock-rotate-left"></i><span> Ventas de hoy</span></button>' +
    (window.mascotitaEscritorio ? '    <button class="btn btn-ghost btn-sm" id="pos-imp" title="Impresora de tickets de este equipo"><i class="fa-solid fa-print"></i></button>' : "") +
    '    <button class="btn btn-ghost btn-sm only-desktop" id="pos-full" title="Pantalla completa"><i class="fa-solid fa-expand"></i></button>' +
    "  </div>" +
    "</div>" +
    '<div class="pos-grid">' +
    '<section class="pos-main">' +
    '  <div class="card pos-scanbar">' +
    '    <span class="pos-mult" id="pos-mult" hidden></span>' +
    '    <div class="pos-scanwrap"><i class="fa-solid fa-barcode"></i><input id="pos-scan" autocomplete="off" spellcheck="false" placeholder="Escaneá el código o escribí el nombre del producto (F2)"><div class="pos-res" id="pos-res" hidden></div></div>' +
    '    <button class="btn btn-ghost" id="pos-cam" title="Escanear con la cámara"><i class="fa-solid fa-camera"></i></button>' +
    '  </div><div id="pos-camzona"></div>' +
    '  <div class="card pos-carrito"><div class="table-wrap"><table class="tabla pos-tabla"><thead><tr><th style="width:34px">#</th><th>Descripción</th><th class="num" style="width:130px">Cant.</th><th class="num">Precio</th><th class="num">Desc.</th><th class="num">Importe</th><th style="width:40px"></th></tr></thead><tbody id="pos-items"></tbody></table></div></div>' +
    '  <div class="card pos-catalogo"><div class="pos-cats" id="pos-cats"></div><div class="vr-rapidos" id="pos-rapidos"></div></div>' +
    "</section>" +
    '<aside class="pos-side">' +
    '  <div class="card">' +
    '    <div class="form-field"><label>Cliente <kbd>F4</kbd></label><div id="pos-cli"></div></div>' +
    '    <div class="grid-2 pos-cf"><input id="pos-nom" class="input" placeholder="Nombre / razón social"><input id="pos-ruc" class="input" placeholder="RUC / CI"></div>' +
    '    <div id="pos-clinfo"></div>' +
    "  </div>" +
    '  <div class="card pos-totales">' +
    '    <div id="pos-tot"></div>' +
    '    <div class="pos-botones">' +
    '      <button class="btn btn-ghost" id="pos-desc"><i class="fa-solid fa-percent"></i> Descuento <kbd>F8</kbd></button>' +
    '      <button class="btn btn-ghost" id="pos-espera"><i class="fa-solid fa-pause"></i> En espera <kbd>F3</kbd></button>' +
    '      <button class="btn btn-ghost danger" id="pos-cancelar"><i class="fa-solid fa-xmark"></i> Cancelar venta</button>' +
    "    </div>" +
    '    <button class="btn btn-primary btn-block pos-cobrar" id="pos-cobrar"><i class="fa-solid fa-check"></i> Cobrar <kbd>F9</kbd></button>' +
    "  </div>" +
    "</aside></div>" +
    '<div class="pos-atajos only-desktop"><span><kbd>F2</kbd> Buscar</span><span><kbd>3*</kbd> Cantidad</span><span><kbd>F3</kbd> Espera</span><span><kbd>F4</kbd> Cliente</span><span><kbd>F6</kbd> Precio</span><span><kbd>F7</kbd> Editar línea</span><span><kbd>F8</kbd> Descuento</span><span><kbd>F9</kbd> Cobrar</span><span><kbd>↑↓</kbd> Elegir línea</span><span><kbd>+ −</kbd> Cantidad</span><span><kbd>Supr</kbd> Quitar</span></div>' +
    "</div>";

  // ---- cliente ----
  POS.selCli = Datos.selectorDueno("pos-cli", {
    placeholder: "Consumidor final (buscar cliente)",
    nuevo: { texto: "Crear cliente nuevo", fn: function (txt) { abrirFormDueno(null, { prefill: { nombre: txt }, onGuardado: function (did) { setTimeout(function () { POS.selCli.set(did); }, 80); } }); } },
    onChange: function (d) { elegirCliente(d); }
  });
  const nom = document.getElementById("pos-nom"), ruc = document.getElementById("pos-ruc");
  nom.oninput = function () { V().clienteNombre = nom.value; guardarPOS(); };
  ruc.oninput = function () { V().clienteRuc = ruc.value; guardarPOS(); };
  validarEnVivo(ruc, "ruc");

  // ---- escaneo / busqueda ----
  const scan = document.getElementById("pos-scan");
  scan.addEventListener("input", debounce(buscarEnLinea, 90));
  scan.addEventListener("keydown", teclaScan);
  scan.addEventListener("blur", function () { setTimeout(function () { document.getElementById("pos-res").hidden = true; }, 180); });
  window.alEscanear = function (c) { procesarEntrada(c); };
  document.getElementById("pos-cam").onclick = function () { let u = "", t = 0; abrirEscanerContinuo("pos-camzona", function (c) { const a = Date.now(); if (c === u && a - t < 1500) return; u = c; t = a; procesarEntrada(c); }); };

  // ---- botones ----
  document.getElementById("pos-cobrar").onclick = abrirCobroPOS;
  document.getElementById("pos-desc").onclick = descuentoGeneral;
  document.getElementById("pos-espera").onclick = ponerEnEspera;
  document.getElementById("pos-cancelar").onclick = cancelarVenta;
  document.getElementById("pos-precio").onclick = consultarPrecio;
  document.getElementById("pos-cargos").onclick = function () { verCargos(null); };
  document.getElementById("pos-dev").onclick = function () { abrirDevolucion(null, function () { cargarRapidos(); }); };
  document.getElementById("pos-hist").onclick = ventasDeHoy;
  const bimp = document.getElementById("pos-imp"); if (bimp) bimp.onclick = configurarImpresoraLocal;
  document.getElementById("pos-full").onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {}); };
  document.addEventListener("keydown", teclaGlobal);
  document.addEventListener("click", function (e) {
    if (!e.target.closest("input, select, textarea, button, a, .selector, .pos-res, .modal-overlay, label")) setTimeout(focoScan, 0);
  });
  // si la cajera hace clic en un boton, el foco vuelve al escaneo
  document.addEventListener("focusout", function () { setTimeout(function () { const a = document.activeElement; if ((!a || a === document.body || a.tagName === "BUTTON") && !(_pilaModales && _pilaModales.length)) focoScan(); }, 120); });

  Caja.escuchar(pintarCaja);
  Datos.suscribir("productos", function () { pintarPOS(); pintarCatalogo(); });
  await Promise.all([Datos.listo("productos"), Datos.listo("propietarios")]);
  const v = V();
  if (v.cliente) POS.selCli.set(v.cliente.id); else { nom.value = v.clienteNombre || ""; ruc.value = v.clienteRuc || ""; }
  pintarTickets(); pintarPOS(); cargarRapidos(); contarCargos();
  setInterval(contarCargos, 60000);
  setTimeout(focoScan, 150);
}

function pintarCaja(c) {
  const e = document.getElementById("pos-caja"); if (!e) return;
  if (c) {
    const efvo = (Number(c.montoInicial) || 0) + (Number((c.totales || {}).efectivo) || 0);
    e.className = "pos-caja abierta";
    e.innerHTML = '<a href="caja.html" title="Ver caja"><i class="fa-solid fa-vault"></i> Caja abierta · ' + escHTML(c.abiertaPor || "") + (puede("caja") ? " · efectivo " + fmtMoneda(efvo) : "") + "</a>";
  } else {
    e.className = "pos-caja cerrada";
    e.innerHTML = '<i class="fa-solid fa-lock"></i> Caja cerrada ' + (puede("caja") ? '<button class="btn btn-primary btn-sm" id="pos-abrir">Abrir caja</button>' : "");
    const b = document.getElementById("pos-abrir"); if (b) b.onclick = function () { abrirCajaModal(focoScan); };
  }
}

/* ---------- Ventas abiertas (pestanas) ---------- */
function pintarTickets() {
  const c = document.getElementById("pos-tickets"); if (!c) return;
  c.innerHTML = POS.ventas.map(function (v, i) {
    const n = v.items.reduce(function (a, x) { return a + (Number(x.cantidad) || 0); }, 0);
    const t = totalesVenta(v).total;
    return '<button class="pos-ticket' + (i === POS.activa ? " activo" : "") + '" data-i="' + i + '" title="' + escHTML(v.nombre) + '"><i class="fa-solid ' + (i === POS.activa ? "fa-receipt" : "fa-pause") + '"></i> ' +
      escHTML(v.cliente ? v.cliente.nombre.split(" ")[0] : v.nombre) + (n ? " · " + fmtMoneda(t) : "") + "</button>";
  }).join("") + '<button class="pos-ticket nuevo" id="pos-nueva" title="Nueva venta (F3)"><i class="fa-solid fa-plus"></i></button>';
  c.querySelectorAll(".pos-ticket[data-i]").forEach(function (b) { b.onclick = function () { cambiarVenta(Number(b.dataset.i)); }; });
  document.getElementById("pos-nueva").onclick = ponerEnEspera;
}
function cambiarVenta(i) {
  POS.activa = i; POS.sel = -1;
  const v = V();
  if (v.cliente) POS.selCli.set(v.cliente.id); else { POS.selCli.set(null); }
  document.getElementById("pos-nom").value = v.cliente ? v.cliente.nombre : (v.clienteNombre || "");
  document.getElementById("pos-ruc").value = v.cliente ? (v.cliente.ruc || v.cliente.dni || "") : (v.clienteRuc || "");
  guardarPOS(); pintarTickets(); pintarPOS(); focoScan();
}
function ponerEnEspera() {
  if (!V().items.length) { focoScan(); return; }
  if (POS.ventas.length >= 8) { toast("Hay demasiadas ventas en espera. Cobrá o cancelá alguna.", "warn"); return; }
  POS.ventas.push(ventaNueva(POS.ventas.reduce(function (a, v) { return Math.max(a, Number(String(v.nombre).replace(/\D/g, "")) || 0); }, 0) + 1));
  toast("Venta en espera. Podés retomarla desde las pestañas de arriba.", "info", 2500);
  cambiarVenta(POS.ventas.length - 1);
}
async function cancelarVenta() {
  const v = V();
  if (v.items.length && !(await confirmar("¿Cancelar esta venta? Se quitan todos los productos.", { textoSi: "Cancelar venta" }))) { focoScan(); return; }
  if (v.items.length) registrarAuditoria("eliminar", "ventas", "Canceló una venta en caja con " + v.items.length + " ítem(s) por " + fmtMoneda(totalesVenta(v).total));
  cerrarVentaActual();
}
function cerrarVentaActual() {
  POS.ventas.splice(POS.activa, 1);
  if (!POS.ventas.length) POS.ventas.push(ventaNueva(1));
  cambiarVenta(Math.min(POS.activa, POS.ventas.length - 1));
}

/* ---------- Cliente ---------- */
async function elegirCliente(d) {
  const v = V();
  v.cliente = d ? { id: d.id, nombre: d.nombre, ruc: d.ruc || "", dni: d.dni || "", telefono: d.telefono || "" } : null;
  document.getElementById("pos-nom").value = d ? d.nombre : (v.clienteNombre || "");
  document.getElementById("pos-ruc").value = d ? (d.ruc || d.dni || "") : (v.clienteRuc || "");
  document.getElementById("pos-ruc").dispatchEvent(new Event("input"));
  document.querySelector(".pos-cf").classList.toggle("con-cliente", !!d);
  guardarPOS(); pintarTickets();
  const info = document.getElementById("pos-clinfo");
  info.innerHTML = "";
  if (!d) return;
  const [cargos, deudas] = await Promise.all([cargosPendientes(d.id), db.collection("facturas").where("propietarioId", "==", d.id).get().then(docsDe).catch(function () { return []; })]);
  if (!V().cliente || V().cliente.id !== d.id) return;
  const saldo = deudas.reduce(function (a, f) { return a + saldoFactura(f); }, 0);
  const libres = cargos.filter(function (x) { return !V().origenes.some(function (o) { return o.col === x.col && o.id === x.d.id; }); });
  info.innerHTML = (saldo > 0 ? '<div class="alerta alerta-warn pos-alerta"><i class="fa-solid fa-scale-unbalanced"></i> Debe ' + fmtMoneda(saldo) + ' en cuenta corriente <a class="link" href="facturas.html?tab=deudores">ver</a></div>' : "") +
    (libres.length ? '<div class="pos-cargos"><b><i class="fa-solid fa-stethoscope"></i> Por cobrar de la clínica</b>' + libres.map(function (x, i) {
      const tot = itemsDeCargo(x.col, x.d).reduce(function (a, it) { return a + (Number(it.cantidad) || 0) * (Number(it.precio) || 0); }, 0);
      return '<div class="pos-cargo"><span>' + escHTML(nombreCargo(x).replace(/ \(.*\)$/, "")) + "<small>" + fmtFechaCorta(x.d.fecha || x.d.egreso || x.d.ingreso) + " · " + fmtMoneda(tot) + '</small></span><button class="btn btn-sm btn-primary" data-c="' + i + '">Agregar</button></div>';
    }).join("") + "</div>" : "");
  info.querySelectorAll("[data-c]").forEach(function (b) { b.onclick = function () { agregarCargo(libres[Number(b.dataset.c)]); }; });
}
async function contarCargos() {
  try {
    const c = await cargosPendientes(null);
    const b = document.getElementById("pos-ncargos"); if (!b) return;
    b.hidden = !c.length; b.textContent = c.length;
  } catch (e) {}
}
async function verCargos() {
  const lista = await cargosPendientes(null);
  if (!lista.length) { toast("No hay consultas, cirugías ni internaciones pendientes de cobro.", "info"); return; }
  const m = abrirModal({
    titulo: "Cobros de la clínica", ancho: "modal-lg",
    cuerpo: '<p class="muted" style="margin-top:0">Consultas, cirugías e internaciones registradas por los veterinarios que todavía no se cobraron.</p><div class="pos-cargos">' + lista.map(function (x, i) {
      const tot = itemsDeCargo(x.col, x.d).reduce(function (a, it) { return a + (Number(it.cantidad) || 0) * (Number(it.precio) || 0); }, 0);
      return '<div class="pos-cargo"><span><b>' + escHTML(nombreCargo(x)) + "</b><small>" + fmtFecha(x.d.fecha || x.d.egreso || x.d.ingreso) + (x.d.veterinario ? " · " + escHTML(x.d.veterinario) : "") + " · " + fmtMoneda(tot) + '</small></span><button class="btn btn-sm btn-primary" data-c="' + i + '">Agregar a la venta</button></div>';
    }).join("") + "</div>"
  });
  m.el.querySelectorAll("[data-c]").forEach(function (b) { b.onclick = function () { m.cerrar(); agregarCargo(lista[Number(b.dataset.c)]); }; });
}
function agregarCargo(x) {
  const v = V();
  if (v.origenes.some(function (o) { return o.col === x.col && o.id === x.d.id; })) { toast("Ese cargo ya está en la venta.", "info"); return; }
  const key = x.col + "/" + x.d.id;
  v.origenes.push({ col: x.col, id: x.d.id, veterinarioUid: x.d.veterinarioUid || x.d.cirujanoUid || "", veterinario: x.d.veterinario || x.d.cirujano || "", mascotaId: x.d.mascotaId || "", mascota: x.d.mascota || x.d.paciente || "" });
  itemsDeCargo(x.col, x.d).forEach(function (it) {
    const p = it.tipo === "producto" ? Datos.porId("productos", it.refId) : null;
    v.items.push(Object.assign({ uid: _uidLinea(), precioLista: it.precio, cargo: key, categoria: p ? p.categoria || "" : "Servicios" }, it));
  });
  if (!v.cliente && x.d.propietarioId) { const d = Datos.porId("propietarios", x.d.propietarioId); if (d) POS.selCli.set(d.id); }
  POS.sel = v.items.length - 1;
  guardarPOS(); pintarPOS(); pintarTickets(); beep(true);
  if (v.cliente) elegirCliente(Datos.porId("propietarios", v.cliente.id));
}

/* =====================================================================
 * ESCANEO Y BUSQUEDA
 * ===================================================================== */
function teclaScan(e) {
  const inp = e.target, res = document.getElementById("pos-res");
  const abierta = !res.hidden && POS.res.length;
  if (e.key === "*" ) {
    const n = Number(inp.value.replace(",", "."));
    if (n > 0 && /^[\d.,]+$/.test(inp.value)) { e.preventDefault(); POS.mult = n; inp.value = ""; pintarMult(); return; }
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (abierta) { POS.resIdx = Math.max(0, Math.min(POS.res.length - 1, POS.resIdx + (e.key === "ArrowDown" ? 1 : -1))); pintarRes(); }
    else moverSel(e.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault(); e.stopPropagation();
    const v = inp.value.trim();
    if (abierta && /[a-záéíóúñ]/i.test(v)) { const x = POS.res[POS.resIdx]; inp.value = ""; res.hidden = true; agregarItem(x); return; }
    inp.value = ""; res.hidden = true;
    if (v) procesarEntrada(v); else if (V().items.length && !e.repeat) abrirCobroPOS();
    return;
  }
  if (e.key === "Escape") { if (!res.hidden) { res.hidden = true; e.stopPropagation(); } else if (inp.value) inp.value = ""; else if (POS.mult !== 1) { POS.mult = 1; pintarMult(); } return; }
  if (!inp.value && (e.key === "+" || e.key === "-")) { e.preventDefault(); if (POS.sel >= 0) cambiarCant(POS.sel, e.key === "+" ? 1 : -1); return; }
  if (!inp.value && e.key === "Delete") { e.preventDefault(); if (POS.sel >= 0) quitarLinea(POS.sel); }
}
function pintarMult() {
  const m = document.getElementById("pos-mult");
  m.hidden = POS.mult === 1; m.textContent = fmtNum(POS.mult, 3) + " ×";
}
function buscarEnLinea() {
  const inp = document.getElementById("pos-scan"), res = document.getElementById("pos-res");
  const q = inp.value.trim();
  if (q.length < 2 || /^\d+$/.test(q)) { res.hidden = true; POS.res = []; return; }
  const prods = Datos.lista("productos").map(function (p) { return { t: "producto", x: p }; });
  const servs = Datos.lista("servicios").filter(function (s) { return s.activo !== false; }).map(function (s) { return { t: "servicio", x: s }; });
  POS.res = prods.concat(servs).filter(function (r) {
    const x = r.x;
    return coincide([x.nombre, x.marca, x.categoria, x.codigoBarras, (x.codigosAlternos || []).join(" "), x.principioActivo, x.plu ? "plu" + x.plu : ""].join(" "), q);
  }).sort(function (a, b) {
    // primero los que empiezan con lo escrito y con stock
    const na = normalizar(a.x.nombre).indexOf(normalizar(q)) === 0 ? 0 : 1, nb = normalizar(b.x.nombre).indexOf(normalizar(q)) === 0 ? 0 : 1;
    if (na !== nb) return na - nb;
    const sa = a.t === "producto" && (Number(a.x.cantidad) || 0) <= 0 ? 1 : 0, sb = b.t === "producto" && (Number(b.x.cantidad) || 0) <= 0 ? 1 : 0;
    return sa - sb || String(a.x.nombre).localeCompare(String(b.x.nombre), "es");
  }).slice(0, 12);
  POS.resIdx = 0; pintarRes();
}
function pintarRes() {
  const res = document.getElementById("pos-res");
  if (!POS.res.length) { res.innerHTML = '<div class="sel-vacio">Sin resultados</div>'; res.hidden = false; return; }
  res.innerHTML = POS.res.map(function (r, i) {
    const x = r.x, pv = r.t === "producto" ? precioVigente(x) : { precio: x.precio };
    const st = r.t === "producto" ? (Number(x.cantidad) || 0) : null;
    return '<div class="pos-res-item' + (i === POS.resIdx ? " activo" : "") + '" data-i="' + i + '"><div><b>' + escHTML(x.nombre) + "</b>" + badgesProducto(r.t === "producto" ? x : null) +
      "<small>" + escHTML([r.t === "servicio" ? "Servicio" : x.categoria, x.marca, x.codigoBarras].filter(Boolean).join(" · ")) + "</small></div>" +
      '<div class="num"><b>' + fmtMoneda(pv.precio) + "</b>" + (st != null ? '<small class="' + (st <= 0 ? "texto-danger" : st <= (Number(x.minimoStock) || 0) ? "texto-warn" : "") + '">Stock ' + fmtNum(st, 3) + " " + escHTML(unidadCorta(x)) + "</small>" : "") + "</div></div>";
  }).join("");
  res.hidden = false;
  res.querySelectorAll(".pos-res-item").forEach(function (d) {
    d.onmousedown = function (e) { e.preventDefault(); const x = POS.res[Number(d.dataset.i)]; document.getElementById("pos-scan").value = ""; res.hidden = true; agregarItem(x); };
  });
  const act = res.querySelector(".activo"); if (act) act.scrollIntoView({ block: "nearest" });
}
function unidadCorta(p) { const u = String(p.unidad || "unidad"); return u === "unidad" ? "u." : u; }
function badgesProducto(p) {
  if (!p) return "";
  const b = [];
  if (precioVigente(p).oferta) b.push('<span class="pill pill-ok">Oferta</span>');
  if (p.controlado) b.push('<span class="pill pill-danger">Controlado</span>');
  else if (p.requiereReceta) b.push('<span class="pill pill-warn">Receta</span>');
  const vto = aFecha(p.fechaVencimiento);
  if (vto && vto < inicioDelDia()) b.push('<span class="pill pill-danger">Vencido</span>');
  else if (vto && vto < sumarDias(new Date(), 30)) b.push('<span class="pill pill-warn">Vence ' + fmtFechaCorta(vto) + "</span>");
  if (p.fraccionable) b.push('<span class="pill pill-info">Suelto</span>');
  return b.length ? " " + b.join(" ") : "";
}
/* Codigo escaneado o escrito ("3*779...", codigo de balanza, GS1, etc). */
function procesarEntrada(texto) {
  let t = String(texto || "").trim();
  const mm = /^(\d+(?:[.,]\d+)?)\*(.+)$/.exec(t);
  if (mm) { POS.mult = Number(mm[1].replace(",", ".")) || 1; t = mm[2].trim(); pintarMult(); }
  if (!t) return;
  if (/[a-záéíóúñ]/i.test(t) && !/^[A-Z]{2,4}-?\d/.test(t)) {      // texto: buscar
    const inp = document.getElementById("pos-scan"); inp.value = t; buscarEnLinea();
    if (POS.res.length === 1) { const x = POS.res[0]; inp.value = ""; document.getElementById("pos-res").hidden = true; agregarItem(x); }
    else inp.focus();
    return;
  }
  const r = interpretarEscaneo(t);
  const hit = resolverCodigo(r.codigo);
  if (!hit) {
    const vc = validarCodigo(r.codigo);
    if (vc.tipo && /^\d+$/.test(r.codigo) && !vc.valido) { beep(false); toast("Código " + r.codigo + " mal leído. Volvé a escanear.", "error"); return; }
    const sv = Datos.lista("servicios").find(function (s) { return s.codigo && String(s.codigo) === r.codigo; });
    if (sv) { agregarItem({ t: "servicio", x: sv }); return; }
    beep(false);
    toast("No hay ningún producto con el código " + r.codigo + "." + (puede("admin") ? "" : " Avisá al administrador para cargarlo."), "warn", 5000, puede("admin") ? { texto: "Cargar producto", fn: function () { location.href = "stock.html?nuevo=1&codigo=" + encodeURIComponent(r.codigo); } } : null);
    POS.mult = 1; pintarMult();
    return;
  }
  agregarItem({ t: "producto", x: hit.producto }, { presentacion: hit.presentacion, cantidad: hit.cantidad, importe: hit.importe, codigo: r.codigo, lote: r.lote });
}

/* =====================================================================
 * AGREGAR / EDITAR LINEAS
 * ===================================================================== */
async function agregarItem(r, op) {
  op = op || {};
  if (POS.ocupado) return;
  const v = V(), mult = POS.mult || 1;
  POS.mult = 1; pintarMult();
  if (r.t === "servicio") {
    const s = r.x;
    const ex = v.items.find(function (i) { return i.tipo === "servicio" && i.refId === s.id && !i.cargo && Number(i.precio) === Number(s.precio); });
    if (ex) ex.cantidad = Math.round((Number(ex.cantidad) + mult) * 1000) / 1000;
    else v.items.push({ uid: _uidLinea(), tipo: "servicio", refId: s.id, concepto: s.nombre, cantidad: mult, precio: Number(s.precio) || 0, precioLista: Number(s.precio) || 0, iva: Number(s.iva != null ? s.iva : (cfg().ivaServicios != null ? cfg().ivaServicios : 10)), descuento: 0, categoria: "Servicios" });
    return terminarAgregado(ex || v.items[v.items.length - 1]);
  }
  const p = Datos.porId("productos", r.x.id) || r.x;
  POS.ocupado = true;
  try {
    const pres = op.presentacion || null, factor = pres ? Number(pres.factor) || 1 : 1;
    // cantidad
    let cant = mult;
    if (op.cantidad != null) cant = Math.round(op.cantidad * mult * 1000) / 1000;
    else if (p.fraccionable && !pres && mult === 1) {
      const q = await pedirNumero(p.nombre, "Cantidad en " + (p.unidad && p.unidad !== "unidad" ? p.unidad : "unidades") + " (podés usar decimales)", 1, precioVigente(p).precio);
      if (q == null) return;
      cant = q;
    }
    // precio
    const pv = precioVigente(p);
    let precio = pres ? (Number(pres.precio) || Math.round(pv.precio * factor)) : pv.precio;
    if (op.importe != null && precio > 0) cant = Math.round(op.importe / precio * 1000) / 1000;
    // controles de farmacia
    const vto = aFecha(p.fechaVencimiento);
    if (vto && vto < inicioDelDia()) {
      beep(false);
      if (!(await confirmar("\"" + p.nombre + "\" figura VENCIDO (" + fmtFechaCorta(vto) + "). ¿Venderlo igual?", { textoSi: "Vender igual" }))) return;
      const a = await autorizarSupervisor("Venta de producto vencido: " + p.nombre); if (!a) return;
      v.autorizaciones.push({ motivo: "Vencido: " + p.nombre, por: a.nombre, porUid: a.uid });
    }
    const unidades = Math.round(cant * factor * 1000) / 1000;
    const enCarrito = v.items.filter(function (i) { return i.tipo === "producto" && i.refId === p.id; }).reduce(function (a, i) { return a + Number(i.cantidad) * (Number(i.factor) || 1); }, 0);
    const disp = (Number(p.cantidad) || 0) - enCarrito;
    if (unidades > disp + 1e-9) {
      if (!cfg().permitirStockNegativo) { beep(false); toast("Sin stock suficiente de " + p.nombre + ": quedan " + fmtNum(Math.max(0, disp), 3) + " " + unidadCorta(p) + ".", "error", 5000); return; }
      toast("Atención: " + p.nombre + " queda con stock negativo.", "warn");
    }
    let receta = "";
    if ((p.requiereReceta || p.controlado) && !v.items.some(function (i) { return i.refId === p.id && i.receta; })) {
      receta = await pedirReceta(p);
      if (receta == null) return;
    }
    const ex = v.items.find(function (i) {
      return i.tipo === "producto" && i.refId === p.id && (i.presentacion || "") === (pres ? pres.nombre : "") && Number(i.precio) === Number(precio) && !i.cargo && !p.fraccionable && op.importe == null;
    });
    let linea;
    if (ex) { ex.cantidad = Math.round((Number(ex.cantidad) + cant) * 1000) / 1000; linea = ex; }
    else {
      linea = { uid: _uidLinea(), tipo: "producto", refId: p.id, concepto: p.nombre + (p.marca && String(p.nombre).toLowerCase().indexOf(String(p.marca).toLowerCase()) === -1 ? " " + p.marca : ""),
        codigo: op.codigo || (pres ? pres.codigo : p.codigoBarras) || "", cantidad: cant, precio: precio, precioLista: precio, iva: Number(p.iva != null ? p.iva : 10), descuento: 0,
        costo: Math.round((Number(p.precioCompra) || 0) * factor), categoria: p.categoria || "", oferta: pv.oferta && !pres };
      if (pres) { linea.presentacion = pres.nombre; linea.factor = factor; }
      if (receta) linea.receta = receta;
      v.items.push(linea);
    }
    terminarAgregado(linea);
  } finally { POS.ocupado = false; setTimeout(focoScan, 30); }
}
function terminarAgregado(linea) {
  const v = V();
  POS.sel = v.items.indexOf(linea);
  guardarPOS(); pintarPOS(); pintarTickets(); beep(true);
  const tr = document.querySelector('#pos-items tr[data-i="' + POS.sel + '"]');
  if (tr) { tr.classList.remove("flash"); void tr.offsetWidth; tr.classList.add("flash"); tr.scrollIntoView({ block: "nearest" }); }
}
function pedirNumero(titulo, etiqueta, inicial, precioUnit) {
  return new Promise(function (resolve) {
    let r = null;
    const m = modalForm(titulo,
      campo("pq", etiqueta, inicial, "number", { min: 0, req: true }) + (precioUnit ? '<p class="muted" id="pq-imp" style="margin:4px 0 0"></p>' : ""), {
        ancho: "modal-sm", textoGuardar: "Aceptar", icono: "fa-check", alCerrar: function () { resolve(r); setTimeout(focoScan, 30); },
        onGuardar: function () { const n = num("pq"); if (!(n > 0)) throw errorUsuario("Cantidad inválida."); r = Math.round(n * 1000) / 1000; }
      });
    const i = el("pq"); i.step = "any"; setTimeout(function () { i.select(); }, 30);
    if (precioUnit) { const upd = function () { document.getElementById("pq-imp").textContent = "Importe: " + fmtMoneda(num("pq") * precioUnit); }; i.oninput = upd; upd(); }
  });
}
function pedirReceta(p) {
  return new Promise(function (resolve) {
    let r = null;
    modalForm((p.controlado ? "Medicamento controlado" : "Venta bajo receta") + " · " + p.nombre,
      '<div class="alerta ' + (p.controlado ? "alerta-danger" : "alerta-warn") + '"><i class="fa-solid fa-prescription"></i> ' +
      (p.controlado ? "Producto de venta controlada: registrá la receta (queda en el comprobante y en auditoría)." : "Este producto se vende con receta veterinaria.") + "</div>" +
      campo("rnum", "N° de receta / veterinario que la indicó", "", "text", { req: true, ph: "Ej: Rp 1234 · Dr. Benítez" }) +
      campo("rpac", "Paciente", "", "text", { ph: "Opcional: nombre de la mascota" }), {
        ancho: "modal-sm", textoGuardar: "Continuar", icono: "fa-check", alCerrar: function () { resolve(r); },
        onGuardar: function () { r = [val("rnum"), val("rpac")].filter(Boolean).join(" · "); }
      });
  });
}
function moverSel(d) {
  const n = V().items.length; if (!n) return;
  POS.sel = POS.sel < 0 ? (d > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, POS.sel + d));
  pintarPOS();
  const tr = document.querySelector('#pos-items tr[data-i="' + POS.sel + '"]'); if (tr) tr.scrollIntoView({ block: "nearest" });
}
function cambiarCant(i, d) {
  const v = V(), it = v.items[i]; if (!it) return;
  if (it.cargo && it.tipo !== "producto") { toast("La cantidad de un cargo de la clínica no se cambia acá.", "info"); return; }
  const nueva = Math.round((Number(it.cantidad) + d) * 1000) / 1000;
  if (nueva <= 0) return quitarLinea(i);
  if (d > 0 && it.tipo === "producto") {
    const p = Datos.porId("productos", it.refId);
    const enCarrito = v.items.filter(function (x) { return x.tipo === "producto" && x.refId === it.refId; }).reduce(function (a, x) { return a + Number(x.cantidad) * (Number(x.factor) || 1); }, 0);
    if (p && !cfg().permitirStockNegativo && enCarrito + (Number(it.factor) || 1) * d > (Number(p.cantidad) || 0) + 1e-9) { beep(false); toast("No hay más stock de " + p.nombre + ".", "warn"); return; }
  }
  it.cantidad = nueva; POS.sel = i; guardarPOS(); pintarPOS(); pintarTickets();
}
function quitarLinea(i) {
  const v = V(), it = v.items[i]; if (!it) return;
  v.items.splice(i, 1);
  if (it.cargo && !v.items.some(function (x) { return x.cargo === it.cargo; })) {
    v.origenes = v.origenes.filter(function (o) { return o.col + "/" + o.id !== it.cargo; });
    if (v.cliente) elegirCliente(Datos.porId("propietarios", v.cliente.id));
  }
  POS.sel = Math.min(i, v.items.length - 1);
  guardarPOS(); pintarPOS(); pintarTickets(); focoScan();
}
async function editarLinea(i) {
  const v = V(), it = v.items[i]; if (!it) return;
  const p = it.tipo === "producto" ? Datos.porId("productos", it.refId) : null;
  const ov = modalForm("Editar · " + it.concepto,
    '<div class="grid-3">' + campo("lcant", "Cantidad", it.cantidad, "number", { min: 0, req: true }) + campo("lprecio", "Precio unitario", it.precio, "number", { min: 0, req: true }) +
    campo("ldesc", "Descuento %", it.descuento || 0, "number", { min: 0, max: 100 }) + "</div>" +
    (p && (p.requiereReceta || p.controlado) ? campo("lrec", "Receta", it.receta || "", "text") : "") +
    '<p class="muted" id="l-imp" style="margin:4px 0 0"></p>' +
    '<small class="hint">Precio de lista: ' + fmtMoneda(it.precioLista || it.precio) + ". Descuento máximo sin autorización: " + fmtNum(descMax()) + "%.</small>", {
      ancho: "modal-sm", textoGuardar: "Aplicar", icono: "fa-check", alCerrar: function () { setTimeout(focoScan, 30); },
      onGuardar: async function () {
        const cant = num("lcant"), precio = Math.round(num("lprecio")), desc = Math.min(100, Math.max(0, num("ldesc")));
        if (!(cant > 0)) throw errorUsuario("Cantidad inválida.");
        if (it.cargo && it.tipo !== "producto" && cant !== Number(it.cantidad)) throw errorUsuario("La cantidad de un cargo de la clínica no se cambia acá.");
        const cambiaPrecio = precio < Number(it.precioLista || it.precio) && precio !== Number(it.precio);
        const pasaDesc = desc > descMax() && desc !== Number(it.descuento);
        if ((cambiaPrecio || pasaDesc) && !esAdmin()) {
          const a = await autorizarSupervisor((cambiaPrecio ? "Bajar el precio de " + it.concepto + " a " + fmtMoneda(precio) : "Descuento de " + desc + "% en " + it.concepto));
          if (!a) return false;
          v.autorizaciones.push({ motivo: (cambiaPrecio ? "Precio " : "Descuento " + desc + "% ") + it.concepto, por: a.nombre, porUid: a.uid });
        }
        if (it.tipo === "producto" && cant > Number(it.cantidad) && p && !cfg().permitirStockNegativo) {
          const otros = v.items.filter(function (x) { return x !== it && x.tipo === "producto" && x.refId === it.refId; }).reduce(function (a, x) { return a + Number(x.cantidad) * (Number(x.factor) || 1); }, 0);
          if (otros + cant * (Number(it.factor) || 1) > (Number(p.cantidad) || 0) + 1e-9) throw errorUsuario("No hay stock suficiente (" + fmtNum(p.cantidad, 3) + ").");
        }
        it.cantidad = cant; it.precio = precio; it.descuento = desc;
        if (el("lrec")) it.receta = val("lrec");
        guardarPOS(); pintarPOS(); pintarTickets();
      }
    });
  ["lcant", "lprecio", "ldesc"].forEach(function (k) { el(k).step = "any"; el(k).oninput = imp; });
  function imp() { document.getElementById("l-imp").textContent = "Importe: " + fmtMoneda(num("lcant") * num("lprecio") * (1 - num("ldesc") / 100)); }
  imp();
  return ov;
}
async function descuentoGeneral() {
  const v = V();
  if (!v.items.length) { focoScan(); return; }
  const tot = totalesVenta(v);
  modalForm("Descuento a toda la venta",
    '<div class="grid-2">' + campo("dg", "Descuento %", v.descuentoGlobal || "", "number", { min: 0, max: 100 }) + campo("dgm", "o monto final (Gs)", "", "number", { min: 0, ph: "Ej: redondear a " + fmtNum(Math.floor(tot.total / 1000) * 1000) }) + "</div>" +
    '<p class="muted" id="dg-imp" style="margin:4px 0 0"></p><small class="hint">Máximo sin autorización: ' + fmtNum(descMax()) + "%.</small>", {
      ancho: "modal-sm", textoGuardar: "Aplicar", icono: "fa-percent", alCerrar: function () { setTimeout(focoScan, 30); },
      onGuardar: async function () {
        let d = num("dg");
        const sinDesc = totalesVenta(Object.assign({}, v, { descuentoGlobal: 0 })).total;
        if (num("dgm") > 0) d = Math.max(0, Math.round((1 - num("dgm") / sinDesc) * 10000) / 100);
        d = Math.min(100, Math.max(0, d));
        if (d > descMax() && !esAdmin()) {
          const a = await autorizarSupervisor("Descuento general de " + fmtNum(d) + "% (" + fmtMoneda(sinDesc * d / 100) + ")");
          if (!a) return false;
          v.autorizaciones.push({ motivo: "Descuento general " + fmtNum(d) + "%", por: a.nombre, porUid: a.uid });
        }
        v.descuentoGlobal = d; guardarPOS(); pintarPOS(); pintarTickets();
      }
    });
  const imp = function () {
    const sinDesc = totalesVenta(Object.assign({}, v, { descuentoGlobal: 0 })).total;
    const d = num("dgm") > 0 ? (1 - num("dgm") / sinDesc) * 100 : num("dg");
    document.getElementById("dg-imp").textContent = "Total con descuento: " + fmtMoneda(totalesVenta(Object.assign({}, v, { descuentoGlobal: Math.max(0, d) })).total);
  };
  el("dg").oninput = imp; el("dgm").oninput = imp; imp();
}

/* ---------- Totales ---------- */
function _descEfectivo(i, dg) { const dl = Number(i.descuento) || 0; return dg ? Math.round((1 - (1 - dl / 100) * (1 - dg / 100)) * 10000) / 100 : dl; }
function itemsParaEmitir(v) {
  return v.items.map(function (i) {
    const x = Object.assign({}, i);
    x.descuento = _descEfectivo(i, Number(v.descuentoGlobal) || 0);
    delete x.uid; delete x.cargo;
    return x;
  });
}
function totalesVenta(v) {
  const its = itemsParaEmitir(v);
  const t = calcularTotalesFactura(its);
  t.bruto = v.items.reduce(function (a, i) { return a + Math.round(Number(i.cantidad) * Number(i.precioLista || i.precio)); }, 0);
  t.descuentos = Math.max(0, t.bruto - t.total);
  t.articulos = v.items.reduce(function (a, i) { return a + (Number(i.cantidad) || 0); }, 0);
  return t;
}

/* ---------- Pintar ---------- */
function pintarPOS() {
  const v = V(), body = document.getElementById("pos-items"); if (!body) return;
  if (POS.sel >= v.items.length) POS.sel = v.items.length - 1;
  const its = itemsParaEmitir(v); calcularTotalesFactura(its);
  body.innerHTML = v.items.length ? v.items.map(function (i, k) {
    const p = i.tipo === "producto" ? Datos.porId("productos", i.refId) : null;
    const enCarrito = p ? v.items.filter(function (x) { return x.tipo === "producto" && x.refId === i.refId; }).reduce(function (a, x) { return a + Number(x.cantidad) * (Number(x.factor) || 1); }, 0) : 0;
    const sinStock = p && enCarrito > (Number(p.cantidad) || 0) + 1e-9;
    const dEf = _descEfectivo(i, Number(v.descuentoGlobal) || 0);
    return '<tr data-i="' + k + '" class="' + (k === POS.sel ? "sel" : "") + '"><td class="muted">' + (k + 1) + "</td>" +
      "<td><b>" + escHTML(i.concepto) + "</b>" + (i.presentacion ? ' <span class="pill pill-info">' + escHTML(i.presentacion) + "</span>" : "") + (i.oferta ? ' <span class="pill pill-ok">Oferta</span>' : "") +
      (i.cargo ? ' <span class="pill pill-neutral">Clínica</span>' : "") + (i.receta ? ' <span class="pill pill-warn" title="' + escHTML(i.receta) + '"><i class="fa-solid fa-prescription"></i> ' + escHTML(i.receta.slice(0, 24)) + "</span>" : "") +
      "<small>" + escHTML([i.codigo, p && sinStock ? "" : "", i.tipo === "servicio" ? "Servicio" : ""].filter(Boolean).join(" · ")) + (sinStock ? ' <span class="texto-danger">Stock ' + fmtNum(p.cantidad, 3) + "</span>" : "") + "</small></td>" +
      '<td class="num"><div class="pos-cant"><button class="btn-icono" data-menos="' + k + '" tabindex="-1"><i class="fa-solid fa-minus"></i></button><b>' + fmtNum(i.cantidad, 3) + '</b><button class="btn-icono" data-mas="' + k + '" tabindex="-1"><i class="fa-solid fa-plus"></i></button></div></td>' +
      '<td class="num">' + fmtMoneda(i.precio) + (Number(i.precioLista) && Number(i.precioLista) !== Number(i.precio) ? "<br><small><s>" + fmtMoneda(i.precioLista) + "</s></small>" : "") + "</td>" +
      '<td class="num">' + (dEf ? fmtNum(dEf, 2) + "%" : '<span class="muted">—</span>') + "</td>" +
      '<td class="num"><b>' + fmtMoneda(its[k].total) + "</b></td>" +
      '<td><button class="btn-icono danger" data-quitar="' + k + '" title="Quitar (Supr)" tabindex="-1"><i class="fa-solid fa-xmark"></i></button></td></tr>';
  }).join("") : '<tr class="vacio"><td colspan="7">' + vacio("Escaneá un producto o escribí su nombre para empezar.", "fa-barcode") + "</td></tr>";
  body.querySelectorAll("tr[data-i]").forEach(function (tr) {
    tr.onclick = function (e) { if (e.target.closest("button")) return; const k = Number(tr.dataset.i); if (POS.sel === k) editarLinea(k); else { POS.sel = k; pintarPOS(); } };
  });
  body.querySelectorAll("[data-mas]").forEach(function (b) { b.onclick = function () { cambiarCant(Number(b.dataset.mas), 1); }; });
  body.querySelectorAll("[data-menos]").forEach(function (b) { b.onclick = function () { cambiarCant(Number(b.dataset.menos), -1); }; });
  body.querySelectorAll("[data-quitar]").forEach(function (b) { b.onclick = function () { quitarLinea(Number(b.dataset.quitar)); }; });
  // totales
  const t = totalesVenta(v);
  document.getElementById("pos-tot").innerHTML =
    '<div class="pos-tl"><span>Artículos</span><span>' + fmtNum(t.articulos, 3) + "</span></div>" +
    (t.descuentos ? '<div class="pos-tl"><span>Subtotal</span><span>' + fmtMoneda(t.bruto) + '</span></div><div class="pos-tl texto-ok"><span>Descuentos' + (v.descuentoGlobal ? " (" + fmtNum(v.descuentoGlobal) + "% general)" : "") + "</span><span>− " + fmtMoneda(t.descuentos) + "</span></div>" : "") +
    (t.iva10 ? '<div class="pos-tl muted"><span>IVA 10% incluido</span><span>' + fmtMoneda(t.iva10) + "</span></div>" : "") +
    (t.iva5 ? '<div class="pos-tl muted"><span>IVA 5% incluido</span><span>' + fmtMoneda(t.iva5) + "</span></div>" : "") +
    '<div class="pos-total"><span>TOTAL</span><span>' + fmtMoneda(t.total) + "</span></div>";
  document.getElementById("pos-cobrar").disabled = !v.items.length;
  // barra en el celular
  let barra = document.getElementById("vr-barra");
  if (!barra) {
    barra = document.createElement("button"); barra.id = "vr-barra"; barra.type = "button"; barra.className = "vr-barra";
    barra.onclick = function () { abrirCobroPOS(); };
    document.body.appendChild(barra);
  }
  barra.hidden = !v.items.length;
  barra.innerHTML = '<span><i class="fa-solid fa-basket-shopping"></i> ' + fmtNum(t.articulos, 3) + " ítem" + (t.articulos === 1 ? "" : "s") + "</span><b>Cobrar " + fmtMoneda(t.total) + "</b>";
}

/* ---------- Catalogo tactil por categoria ---------- */
async function cargarRapidos() {
  try {
    const s = await db.collection("movimientos_stock").where("fecha", ">=", TS.fromDate(sumarDias(new Date(), -30))).orderBy("fecha", "desc").limit(800).get();
    const cnt = {}; docsDe(s).forEach(function (m) { if (m.tipo === "salida" && m.origen === "factura") cnt[m.productoId] = (cnt[m.productoId] || 0) + m.cantidad; });
    POS.rapidos = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
  } catch (e) { POS.rapidos = []; }
  pintarCatalogo();
}
function pintarCatalogo() {
  // categorias sin distinguir mayusculas/tildes ("medicamento" = "Medicamento")
  const cats = {}, nombres = {};
  const catDe = function (p) { const c = String(p.categoria || "Otros").trim() || "Otros"; return normalizar(c); };
  Datos.lista("productos").forEach(function (p) { const k = catDe(p); cats[k] = (cats[k] || 0) + 1; if (!nombres[k] || /^[A-ZÁÉÍÓÚÑ]/.test(p.categoria || "")) nombres[k] = String(p.categoria || "Otros").trim() || "Otros"; });
  const lista = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 10);
  const cc = document.getElementById("pos-cats"); if (!cc) return;
  cc.innerHTML = [["__top", "Más vendidos", "fa-star"]].concat(lista.map(function (c) { const n = nombres[c]; return [c, n.charAt(0).toUpperCase() + n.slice(1), ""]; })).concat([["__serv", "Servicios", "fa-tags"]]).map(function (c) {
    return '<button class="pos-cat' + (POS.cat === c[0] ? " activo" : "") + '" data-c="' + escHTML(c[0]) + '">' + (c[2] ? '<i class="fa-solid ' + c[2] + '"></i> ' : "") + escHTML(c[1]) + "</button>";
  }).join("");
  cc.querySelectorAll(".pos-cat").forEach(function (b) { b.onclick = function () { POS.cat = b.dataset.c; pintarCatalogo(); }; });
  let items;
  if (POS.cat === "__serv") items = Datos.lista("servicios").filter(function (s) { return s.activo !== false; }).slice(0, 24).map(function (s) { return { t: "servicio", x: s }; });
  else if (POS.cat === "__top") {
    let top = POS.rapidos.map(function (id) { return Datos.porId("productos", id); }).filter(function (p) { return p && !p.eliminado; }).slice(0, 18);
    if (top.length < 12) top = top.concat(Datos.lista("productos").filter(function (p) { return top.indexOf(p) === -1 && (Number(p.cantidad) || 0) > 0; }).slice(0, 18 - top.length));
    items = top.map(function (p) { return { t: "producto", x: p }; });
  } else items = Datos.lista("productos").filter(function (p) { return catDe(p) === POS.cat; }).sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), "es"); }).slice(0, 36).map(function (p) { return { t: "producto", x: p }; });
  const c = document.getElementById("pos-rapidos");
  c.innerHTML = items.length ? items.map(function (r, i) {
    const x = r.x, pr = r.t === "producto" ? precioVigente(x).precio : x.precio, sin = r.t === "producto" && (Number(x.cantidad) || 0) <= 0;
    return '<button class="vr-rapido' + (sin ? " sin-stock" : "") + '" data-i="' + i + '">' + (x.imagenURL ? '<img src="' + escHTML(x.imagenURL) + '" alt="" loading="lazy" data-fb="fa-box">' : '<i class="fa-solid ' + (r.t === "servicio" ? "fa-tag" : "fa-box") + '"></i>') +
      "<span>" + escHTML(x.nombre) + "</span><b>" + fmtMoneda(pr) + "</b>" + (r.t === "producto" ? "<small>" + (sin ? "Sin stock" : "Stock " + fmtNum(x.cantidad, 3)) + "</small>" : "") + "</button>";
  }).join("") : '<p class="muted">Sin productos en esta categoría.</p>';
  c.querySelectorAll(".vr-rapido").forEach(function (b) { b.onclick = function () { agregarItem(items[Number(b.dataset.i)]); }; });
}

/* =====================================================================
 * COBRO
 * ===================================================================== */
const METODOS_POS = [
  { value: "efectivo", texto: "Efectivo", icon: "fa-money-bill-wave", tecla: "1" },
  { value: "tarjeta_debito", texto: "Débito", icon: "fa-credit-card", tecla: "2" },
  { value: "tarjeta_credito", texto: "Crédito", icon: "fa-credit-card", tecla: "3" },
  { value: "transferencia", texto: "Transferencia", icon: "fa-building-columns", tecla: "4" },
  { value: "qr", texto: "QR / billetera", icon: "fa-qrcode", tecla: "5" }
];
async function abrirCobroPOS() {
  const v = V();
  if (!v.items.length) { focoScan(); return; }
  if (_pilaModales && _pilaModales.length) return;
  const caja = Caja.actual || await Caja.obtener().catch(function () { return null; });
  if (!caja) { toast("La caja está cerrada: abrila para cobrar.", "warn"); if (puede("caja")) abrirCajaModal(function () { setTimeout(abrirCobroPOS, 200); }); return; }
  const sinPrecio = v.items.filter(function (i) { return !(Number(i.precio) > 0); });
  if (sinPrecio.length && !(await confirmar("Hay ítems sin precio: " + sinPrecio.map(function (i) { return i.concepto; }).join(", ") + ". ¿Cobrar igual?", { peligro: false }))) return;
  const t = totalesVenta(v), total = t.total;
  const pagos = [];      // [{metodo, monto}]
  let metodo = "efectivo", credito = false;
  const ov = modalForm("Cobrar",
    '<div class="cobro-total"><small>Total a cobrar</small><b id="cb-total">' + fmtMoneda(total) + "</b><span id=\"cb-cli\">" + escHTML(v.cliente ? v.cliente.nombre : (v.clienteNombre || "Consumidor final")) + "</span></div>" +
    '<div class="cobro-metodos" id="cb-met">' + METODOS_POS.map(function (m) { return '<button type="button" class="cobro-met" data-m="' + m.value + '"><i class="fa-solid ' + m.icon + '"></i><span>' + m.texto + "</span><kbd>" + m.tecla + "</kbd></button>"; }).join("") + "</div>" +
    '<div class="grid-2"><div class="form-field"><label id="cb-lmonto">Recibido</label><input id="f-cbmonto" type="number" min="0" step="1" class="t-grande" inputmode="numeric"></div>' +
    '<div class="form-field"><label id="cb-lres">Vuelto</label><input id="f-cbres" readonly class="t-grande"></div></div>' +
    '<div class="vr-billetes" id="cb-bill"></div>' +
    '<div id="cb-pagos"></div>' +
    '<div class="fila-flex"><button type="button" class="btn btn-ghost btn-sm" id="cb-mixto"><i class="fa-solid fa-plus"></i> Pago mixto (agregar otro medio)</button>' +
    (v.cliente ? '<label class="check" style="margin-left:auto"><input type="checkbox" id="cb-cred"> Dejar saldo en cuenta corriente</label>' : "") + "</div>" +
    (v.autorizaciones.length ? '<p class="hint mt"><i class="fa-solid fa-user-shield"></i> ' + escHTML(v.autorizaciones.map(function (a) { return a.motivo + " (" + a.por + ")"; }).join(" · ")) + "</p>" : ""), {
      ancho: "modal-md", textoGuardar: "Confirmar cobro", icono: "fa-check",
      alCerrar: function (motivo) { if (motivo !== "guardado") setTimeout(focoScan, 30); },
      onGuardar: async function () {
        const fin = calcular();
        if (!credito && fin.falta > 0) throw errorUsuario("Falta cobrar " + fmtMoneda(fin.falta) + ".");
        const listaPagos = fin.pagos.slice();
        const recibidoEf = fin.recibidoEfectivo;
        const its = itemsParaEmitir(v);
        const masc = v.origenes.find(function (o) { return o.mascotaId; });
        const cliFull = v.cliente ? (Datos.porId("propietarios", v.cliente.id) || v.cliente) : null;
        const r = await emitirFacturaCore({
          items: its, cliente: cliFull, clienteNombre: (document.getElementById("pos-nom").value.trim() || "Consumidor final"), clienteRuc: document.getElementById("pos-ruc").value.trim(),
          mascota: masc ? { id: masc.mascotaId, nombre: masc.mascota } : null,
          condicion: credito ? "credito" : "contado", pagos: listaPagos, caja: caja, notas: "", canal: "mostrador",
          origenes: v.origenes, recibido: recibidoEf || 0, vuelto: fin.vuelto, autorizaciones: v.autorizaciones, descuentoGlobal: v.descuentoGlobal || 0, exigirPagoTotal: !credito
        });
        registrarAuditoria("crear", "facturas", "Venta " + r.numero + " por " + fmtMoneda(r.total) + " (" + listaPagos.map(function (p) { return nombreMetodo(p.metodo); }).join(" + ") + (credito ? ", saldo en cuenta" : "") + ")");
        cerrarVentaActual();
        cargarRapidos(); contarCargos();
        setTimeout(function () { ventaFinalizada(r, fin.vuelto); }, 200);
      }
    });
  const inp = el("cbmonto");
  function restante() { return Math.max(0, total - pagos.reduce(function (a, p) { return a + p.monto; }, 0)); }
  function calcular() {
    const rest = restante();
    // efectivo con el campo vacio = paga justo
    const monto = inp.value === "" ? (metodo === "efectivo" ? rest : 0) : Math.round(Number(inp.value) || 0);
    const lista = pagos.slice();
    let vueltoV = 0, recEf = 0;
    if (monto > 0) {
      if (metodo === "efectivo") { recEf = monto; lista.push({ metodo: "efectivo", monto: Math.min(monto, rest) }); vueltoV = Math.max(0, monto - rest); }
      else lista.push({ metodo: metodo, monto: Math.min(monto, rest) });
    }
    const pagado = lista.reduce(function (a, p) { return a + p.monto; }, 0);
    return { pagos: lista, vuelto: vueltoV, falta: Math.max(0, total - pagado), recibidoEfectivo: recEf, monto: monto, rest: rest };
  }
  function pintar() {
    const c = calcular();
    ov.el.querySelectorAll(".cobro-met").forEach(function (b) { b.classList.toggle("activo", b.dataset.m === metodo); });
    document.getElementById("cb-lmonto").textContent = metodo === "efectivo" ? "Recibido en efectivo" : "Monto con " + nombreMetodo(metodo).toLowerCase();
    inp.placeholder = metodo === "efectivo" ? "Justo: " + fmtNum(c.rest) : "";
    const res = el("cbres");
    if (metodo === "efectivo" && c.monto > c.rest) { document.getElementById("cb-lres").textContent = "Vuelto"; res.value = fmtMoneda(c.vuelto); res.classList.add("vuelto"); res.classList.remove("falta"); }
    else if (c.falta > 0) { document.getElementById("cb-lres").textContent = credito ? "Queda en cuenta corriente" : "Falta"; res.value = fmtMoneda(c.falta); res.classList.toggle("falta", !credito); res.classList.remove("vuelto"); }
    else { document.getElementById("cb-lres").textContent = metodo === "efectivo" ? "Vuelto" : "Resta"; res.value = fmtMoneda(0); res.classList.remove("vuelto", "falta"); }
    const rest = c.rest;
    document.getElementById("cb-bill").innerHTML = metodo === "efectivo" && rest > 0 ? [rest, 10000, 50000, 100000].map(function (m) { return Math.ceil(rest / m) * m; }).concat([Math.ceil(rest / 100000) * 100000 + 100000])
      .filter(function (x, i, a) { return x >= rest && a.indexOf(x) === i; }).slice(0, 5).map(function (x) { return '<button type="button" class="btn btn-ghost btn-sm" data-b="' + x + '">' + (x === rest ? "Justo" : fmtMoneda(x)) + "</button>"; }).join("") : "";
    ov.el.querySelectorAll("[data-b]").forEach(function (b) { b.onclick = function () { inp.value = b.dataset.b; pintar(); ov.q("[data-guardar]").focus(); }; });
    document.getElementById("cb-pagos").innerHTML = pagos.length ? '<div class="cobro-pagos">' + pagos.map(function (p, i) {
      return '<div><span><i class="fa-solid fa-check texto-ok"></i> ' + escHTML(nombreMetodo(p.metodo)) + "</span><b>" + fmtMoneda(p.monto) + '</b><button type="button" class="btn-icono danger" data-qp="' + i + '"><i class="fa-solid fa-xmark"></i></button></div>';
    }).join("") + '<div class="muted"><span>Resta</span><b>' + fmtMoneda(rest) + "</b></div></div>" : "";
    ov.el.querySelectorAll("[data-qp]").forEach(function (b) { b.onclick = function () { pagos.splice(Number(b.dataset.qp), 1); inp.value = restante() || ""; pintar(); }; });
  }
  function elegirMetodo(m) {
    metodo = m;
    const rest = restante();
    inp.value = m === "efectivo" ? "" : rest;
    pintar(); inp.focus(); inp.select();
  }
  ov.el.querySelectorAll(".cobro-met").forEach(function (b) { b.onclick = function () { elegirMetodo(b.dataset.m); }; });
  inp.oninput = pintar;
  document.getElementById("cb-mixto").onclick = function () {
    const c = calcular();
    const monto = Math.min(c.monto, c.rest);
    if (!(monto > 0)) { toast("Escribí cuánto paga con " + nombreMetodo(metodo).toLowerCase() + " y después agregá el otro medio.", "info"); inp.focus(); return; }
    if (monto >= c.rest) { toast("Ese monto ya cubre el total.", "info"); return; }
    pagos.push({ metodo: metodo, monto: monto });
    const sig = METODOS_POS.find(function (m) { return m.value !== metodo; });
    elegirMetodo(metodo === "efectivo" ? "tarjeta_debito" : sig.value);
  };
  const cc = document.getElementById("cb-cred");
  if (cc) cc.onchange = function () { credito = cc.checked; pintar(); };
  // teclas 1-5 eligen el medio (si no se esta escribiendo un monto)
  ov.el.addEventListener("keydown", function (e) {
    // 1-5 eligen el medio cuando el foco no esta en el monto (o con Alt desde cualquier lado)
    const m = METODOS_POS.find(function (x) { return x.tecla === e.key || (e.altKey && e.code === "Digit" + x.tecla); });
    if (m && (e.target !== inp || e.altKey) && e.target.tagName !== "INPUT") { e.preventDefault(); elegirMetodo(m.value); }
    else if (m && e.altKey) { e.preventDefault(); elegirMetodo(m.value); }
  });
  elegirMetodo("efectivo");
}
function ventaFinalizada(r, vuelto) {
  const fmtT = cfg().formatoTicketPOS || (cfg().formatoComprobante && cfg().formatoComprobante !== "a4" ? cfg().formatoComprobante : "ticket80");
  const prev = window.alEscanearModal;
  const m = abrirModal({
    titulo: "Venta " + r.numero, ancho: "modal-sm",
    cuerpo: '<div class="venta-ok"><i class="fa-solid fa-circle-check"></i><p>Cobrado ' + fmtMoneda(r.pago || r.total) + "</p>" +
      (vuelto ? '<div class="venta-vuelto"><small>VUELTO</small><b>' + fmtMoneda(vuelto) + "</b></div>" : "") +
      (r.pago < r.total ? '<p class="texto-warn">Saldo en cuenta corriente: ' + fmtMoneda(r.total - r.pago) + "</p>" : "") + "</div>",
    pie: '<button class="btn btn-ghost" id="vo-a4"><i class="fa-solid fa-file-pdf"></i> Factura A4</button><button class="btn btn-ghost" data-cerrar>Nueva venta <kbd>Esc</kbd></button><button class="btn btn-primary" id="vo-tk"><i class="fa-solid fa-print"></i> Ticket <kbd>Enter</kbd></button>',
    alCerrar: function () { window.alEscanearModal = prev; setTimeout(focoScan, 30); }
  });
  m.q("#vo-tk").onclick = function () { imprimirComprobante(r.id, fmtT); m.cerrar(); };
  m.q("#vo-a4").onclick = function () { imprimirComprobante(r.id, "a4"); m.cerrar(); };
  setTimeout(function () { m.q("#vo-tk").focus(); }, 50);
  // el siguiente cliente: escanear cierra este aviso y agrega el producto
  window.alEscanearModal = function (c) { m.cerrar(); setTimeout(function () { procesarEntrada(c); }, 50); };
  if (cfg().imprimirTicketPOS) { imprimirComprobante(r.id, fmtT); }
}

/* =====================================================================
 * CONSULTAR PRECIO (no agrega a la venta)
 * ===================================================================== */
function consultarPrecio() {
  const prev = window.alEscanearModal;
  const m = abrirModal({
    titulo: "Consultar precio", ancho: "modal-md",
    cuerpo: '<div class="pos-scanwrap"><i class="fa-solid fa-barcode"></i><input id="cp-inp" class="input" placeholder="Escaneá o escribí el código / nombre" autocomplete="off"></div><div id="cp-res" class="mt"></div>',
    alCerrar: function () { window.alEscanearModal = prev; setTimeout(focoScan, 30); }
  });
  const inp = m.q("#cp-inp");
  function mostrar(t) {
    t = String(t || "").trim(); if (!t) return;
    let p = null, pres = null;
    const r = resolverCodigo(interpretarEscaneo(t).codigo);
    if (r) { p = r.producto; pres = r.presentacion; }
    else p = Datos.lista("productos").find(function (x) { return coincide(x.nombre + " " + (x.marca || ""), t); });
    const c = m.q("#cp-res");
    if (!p) { beep(false); c.innerHTML = vacio("No se encontró \"" + escHTML(t) + "\".", "fa-magnifying-glass"); return; }
    beep(true);
    const pv = precioVigente(p);
    c.innerHTML = '<div class="cp-card">' + (p.imagenURL ? '<img src="' + escHTML(p.imagenURL) + '" alt="" data-fb="fa-box">' : '<i class="fa-solid fa-box cp-ico"></i>') +
      "<div><h3>" + escHTML(p.nombre) + badgesProducto(p) + "</h3><p class=\"muted\">" + escHTML([p.marca, p.categoria, p.codigoBarras].filter(Boolean).join(" · ")) + "</p>" +
      '<div class="cp-precio">' + fmtMoneda(pres ? (Number(pres.precio) || pv.precio * (Number(pres.factor) || 1)) : pv.precio) + (pres ? " <small>" + escHTML(pres.nombre) + "</small>" : "") + "</div>" +
      (pv.oferta ? '<p class="texto-ok">Precio normal ' + fmtMoneda(p.precioVenta) + (pv.hasta ? " · oferta hasta " + fmtFechaCorta(pv.hasta) : "") + "</p>" : "") +
      "<p>Stock: <b>" + fmtNum(p.cantidad, 3) + " " + escHTML(unidadCorta(p)) + "</b>" + (p.ubicacion ? " · Ubicación: " + escHTML(p.ubicacion) : "") + (p.fechaVencimiento ? " · Vence " + fmtFechaCorta(p.fechaVencimiento) : "") + "</p>" +
      ((p.presentaciones || []).length ? "<p>Presentaciones: " + p.presentaciones.map(function (x) { return escHTML(x.nombre) + " " + fmtMoneda(x.precio || pv.precio * (Number(x.factor) || 1)); }).join(" · ") + "</p>" : "") +
      '<button class="btn btn-primary btn-sm" id="cp-add"><i class="fa-solid fa-plus"></i> Agregar a la venta</button></div></div>';
    m.q("#cp-add").onclick = function () { m.cerrar(); agregarItem({ t: "producto", x: p }, { presentacion: pres }); };
    inp.value = ""; inp.focus();
  }
  inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); mostrar(inp.value); } });
  window.alEscanearModal = mostrar;
  setTimeout(function () { inp.focus(); }, 50);
}

/* =====================================================================
 * VENTAS DE HOY (reimprimir, devolver) + resumen por medio de pago
 * ===================================================================== */
async function ventasDeHoy() {
  const m = abrirModal({ titulo: "Ventas de hoy", ancho: "modal-xl", cuerpo: '<div id="vh-cuerpo"><span class="spinner"></span></div>', alCerrar: function () { setTimeout(focoScan, 30); } });
  let fs = [];
  try { fs = docsDe(await db.collection("facturas").where("fecha", ">=", TS.fromDate(inicioDelDia())).orderBy("fecha", "desc").limit(300).get()); }
  catch (e) { m.q("#vh-cuerpo").innerHTML = '<p class="texto-danger">' + escHTML(mensajeError(e)) + "</p>"; return; }
  const validas = fs.filter(function (f) { return f.estado !== "anulada"; });
  const porMet = {};
  validas.forEach(function (f) { (f.pagos || []).forEach(function (p) { porMet[p.metodo] = (porMet[p.metodo] || 0) + (Number(p.monto) || 0); }); });
  const total = validas.reduce(function (a, f) { return a + (Number(f.total) || 0) - (Number(f.devuelto) || 0); }, 0);
  const cont = m.q("#vh-cuerpo");
  cont.innerHTML = '<div class="chips"><div class="chip-resumen"><small>Comprobantes</small><b>' + validas.length + '</b></div><div class="chip-resumen"><small>Vendido (neto)</small><b>' + fmtMoneda(total) + "</b></div>" +
    Object.keys(porMet).map(function (k) { return '<div class="chip-resumen"><small>' + escHTML(nombreMetodo(k)) + "</small><b>" + fmtMoneda(porMet[k]) + "</b></div>"; }).join("") + "</div>" +
    '<input class="input mb" id="vh-q" placeholder="Filtrar por número, cliente o producto...">' + '<div id="vh-tabla"></div>';
  function pintar() {
    const q = m.q("#vh-q").value.trim();
    tabla(m.q("#vh-tabla"), {
      filas: fs.filter(function (f) { return !q || coincide([f.numero, f.cliente, (f.items || []).map(function (i) { return i.concepto; }).join(" ")].join(" "), q); }),
      orden: "fecha", dir: -1, vacio: "Todavía no hay ventas hoy.",
      columnas: [
        { k: "fecha", t: "Hora", r: function (f) { return fmtHora(f.fecha); }, v: function (f) { return aFecha(f.fecha); } },
        { k: "numero", t: "N°", r: function (f) { return "<b>" + escHTML(f.numero) + "</b>"; } },
        { k: "cliente", t: "Cliente", r: function (f) { return escHTML(f.cliente) + "<br><small>" + (f.items || []).length + " ítem(s) · " + escHTML(f.creadoPor || "") + "</small>"; } },
        { k: "pagos", t: "Pago", r: function (f) { return escHTML((f.pagos || []).map(function (p) { return nombreMetodo(p.metodo); }).join(" + ") || (f.condicion === "credito" ? "Cuenta corriente" : "—")); } },
        { k: "total", t: "Total", cls: "num", r: function (f) { return fmtMoneda(f.total) + (Number(f.devuelto) ? '<br><small class="texto-danger">dev. ' + fmtMoneda(f.devuelto) + "</small>" : "") + (f.estado === "anulada" ? '<br><span class="pill pill-danger">Anulada</span>' : ""); }, v: function (f) { return Number(f.total) || 0; } },
        { k: "acc", t: "", r: function (f) { return '<div class="acciones"><button class="btn btn-ghost btn-sm" data-tk="' + f.id + '"><i class="fa-solid fa-print"></i> Ticket</button>' + (f.estado !== "anulada" && !f.devueltaTotal ? '<button class="btn btn-ghost btn-sm" data-dv="' + f.id + '"><i class="fa-solid fa-rotate-left"></i> Devolver</button>' : "") + "</div>"; } }
      ]
    });
    m.el.querySelectorAll("[data-tk]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); imprimirComprobante(b.dataset.tk, cfg().formatoTicketPOS || "ticket80"); }; });
    m.el.querySelectorAll("[data-dv]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); m.cerrar(); abrirDevolucion(b.dataset.dv); }; });
  }
  m.q("#vh-q").oninput = debounce(pintar, 150);
  pintar();
}

/* =====================================================================
 * TECLADO
 * ===================================================================== */
function teclaGlobal(e) {
  if (e.defaultPrevented) return;
  const modal = _pilaModales && _pilaModales.length;
  const F = { F2: 1, F3: 1, F4: 1, F6: 1, F7: 1, F8: 1, F9: 1 };
  if (F[e.key]) {
    e.preventDefault();
    if (modal) return;
    if (e.key === "F2") { const i = document.getElementById("pos-scan"); i.focus(); i.select(); }
    else if (e.key === "F3") ponerEnEspera();
    else if (e.key === "F4") { const i = document.querySelector("#pos-cli input"); i.focus(); i.select(); }
    else if (e.key === "F6") consultarPrecio();
    else if (e.key === "F7") { if (POS.sel >= 0) editarLinea(POS.sel); }
    else if (e.key === "F8") descuentoGeneral();
    else if (e.key === "F9") abrirCobroPOS();
    return;
  }
  if (modal) return;
  const t = e.target, enCampo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  if (enCampo || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === "Delete" && POS.sel >= 0) { e.preventDefault(); quitarLinea(POS.sel); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); moverSel(e.key === "ArrowDown" ? 1 : -1); return; }
  // cualquier tecla imprimible va al campo de escaneo (el lector "escribe" ahi)
  if (e.key.length === 1) { const i = document.getElementById("pos-scan"); if (i) i.focus(); }
}
window.addEventListener("beforeunload", guardarPOS);
document.addEventListener("DOMContentLoaded", initVenta);
