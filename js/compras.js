/* =====================================================================
 * compras.js (solo ADMIN) — Proveedores y compras
 * Cargar una compra suma el stock (transaccion), actualiza costo, lote y
 * vencimiento, y opcionalmente registra el pago como egreso de caja.
 * ===================================================================== */
let _tabCom = "compras", _compras = [];

async function initCompras() {
  await protegerPagina({ permiso: "admin", pagina: "compras.html" });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-truck-field"></i> Compras y proveedores</h1><div class="head-actions">' +
    '<button class="btn btn-ghost" id="co-prov"><i class="fa-solid fa-plus"></i> Proveedor</button><button class="btn btn-primary" id="co-nueva"><i class="fa-solid fa-cart-plus"></i> Cargar compra</button></div></div>' +
    '<div class="tabs"><button class="tab" data-t="compras"><i class="fa-solid fa-receipt"></i> Compras</button><button class="tab" data-t="proveedores"><i class="fa-solid fa-building"></i> Proveedores</button><button class="tab" data-t="sugerido"><i class="fa-solid fa-lightbulb"></i> Sugerido de compra</button></div>' +
    '<div class="filtros card"><input type="search" id="co-buscar" placeholder="Buscar..."></div><div id="co-cuerpo">' + skeleton(6) + "</div>";
  document.getElementById("co-prov").onclick = function () { abrirFormProveedor(null); };
  document.getElementById("co-nueva").onclick = function () { abrirFormCompra(); };
  if (paramURL("tab")) _tabCom = paramURL("tab");
  document.getElementById("co-buscar").oninput = debounce(pintarCompras, 150);
  document.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { _tabCom = t.dataset.t; pintarCompras(); }; });
  Datos.suscribir("productos"); Datos.suscribir("proveedores", pintarCompras);
  db.collection("compras").orderBy("fecha", "desc").limit(500).onSnapshot(function (s) { _compras = docsDe(s); pintarCompras(); }, function (e) { toast(mensajeError(e), "error"); });
}
function pintarCompras() {
  document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("activo", t.dataset.t === _tabCom); });
  const q = document.getElementById("co-buscar").value, cont = document.getElementById("co-cuerpo");
  document.querySelector(".filtros").hidden = _tabCom === "sugerido";
  if (_tabCom === "sugerido") return pintarSugerido(cont);
  if (_tabCom === "proveedores") {
    const gasto = {}; _compras.forEach(function (c) { gasto[c.proveedorId] = (gasto[c.proveedorId] || 0) + (c.total || 0); });
    tabla(cont, {
      filas: Datos.lista("proveedores").filter(function (p) { return coincide([p.nombre, p.ruc, p.contacto, p.telefono].join(" "), q); }), orden: "nombre", vacio: "Sin proveedores", vacioIcono: "fa-building",
      alClic: function (p) { abrirFormProveedor(p.id); },
      columnas: [
        { k: "nombre", t: "Proveedor", r: function (p) { return "<b>" + escHTML(p.nombre) + "</b>" + (p.ruc ? "<br><small>RUC " + escHTML(p.ruc) + "</small>" : ""); } },
        { k: "contacto", t: "Contacto", r: function (p) { return escHTML(p.contacto || "") + "<br><small>" + escHTML([p.telefono, p.email].filter(Boolean).join(" · ")) + "</small>"; } },
        { k: "gasto", t: "Comprado (últimas)", cls: "num", v: function (p) { return gasto[p.id] || 0; }, r: function (p) { return fmtMoneda(gasto[p.id] || 0); } },
        { k: "a", t: "", sort: false, cls: "acciones", r: function (p) { return (p.telefono ? btnIcono("fa-brands fa-whatsapp", "WhatsApp", "waProv('" + p.id + "')", "wa") : "") + btnIcono("fa-trash", "Eliminar", "eliminarProveedor('" + p.id + "')", "danger"); } }
      ]
    });
    return;
  }
  tabla(cont, {
    filas: _compras.filter(function (c) { return coincide([c.proveedor, c.numeroFactura, (c.items || []).map(function (i) { return i.nombre; }).join(" ")].join(" "), q); }),
    orden: "fecha", dir: -1, vacio: "Sin compras cargadas", vacioIcono: "fa-receipt", alClic: verCompra,
    columnas: [
      { k: "fecha", t: "Fecha", r: function (c) { return fmtFechaCorta(c.fecha); }, v: function (c) { return aFecha(c.fecha); } },
      { k: "proveedor", t: "Proveedor", r: function (c) { return "<b>" + escHTML(c.proveedor || "") + "</b>" + (c.numeroFactura ? "<br><small>Fact. " + escHTML(c.numeroFactura) + "</small>" : ""); } },
      { k: "items", t: "Productos", v: function (c) { return (c.items || []).length; }, r: function (c) { return escHTML((c.items || []).map(function (i) { return i.cantidad + "× " + i.nombre; }).join(", ")); } },
      { k: "total", t: "Total", cls: "num", r: function (c) { return fmtMoneda(c.total); } },
      { k: "condicion", t: "Pago", r: function (c) { return pill(c.condicion === "credito" ? "crédito" : "contado", c.condicion === "credito" ? "credito" : "contado") + (c.pagadoCaja ? " " + pill("desde caja", "info") : ""); } },
      { k: "creadoPor", t: "Cargó" }
    ]
  });
}
function abrirFormProveedor(id) {
  const p = id ? Datos.porId("proveedores", id) || {} : {};
  modalForm((id ? "Editar" : "Nuevo") + " proveedor", '<div class="grid-2">' +
    campo("pnombre", "Nombre / razón social", p.nombre, "text", { req: true }) + campo("pruc", "RUC", p.ruc) + campo("pcontacto", "Persona de contacto", p.contacto) +
    campo("ptel", "Teléfono", p.telefono, "tel") + campo("pemail", "Email", p.email, "email") + campo("pdir", "Dirección", p.direccion) + "</div>" + areaCampo("pnotas", "Notas (días de visita, condiciones...)", p.notas), {
      onGuardar: async function () {
        const d = { nombre: val("pnombre"), ruc: val("pruc"), contacto: val("pcontacto"), telefono: val("ptel"), email: val("pemail"), direccion: val("pdir"), notas: val("pnotas") };
        if (id) await actualizarDoc("proveedores", id, d); else await crearDoc("proveedores", d);
        registrarAuditoria(id ? "editar" : "crear", "proveedores", (id ? "Editó" : "Creó") + " proveedor " + d.nombre);
        toast("Proveedor guardado.", "ok");
      }
    });
}
async function eliminarProveedor(id) { const p = Datos.porId("proveedores", id); if (await confirmar("¿Enviar a " + p.nombre + " a la papelera?")) await Datos.aPapelera("proveedores", id, p); }
function waProv(id) { const p = Datos.porId("proveedores", id); enviarWhatsApp(p.telefono, "Hola " + (p.contacto || p.nombre) + ", te escribimos de " + nombreClinica() + ". "); }

async function abrirFormCompra(pre) {
  pre = pre || {};
  await Promise.all([Datos.listo("productos"), Datos.listo("proveedores")]);
  await Caja.obtener().catch(function () {});
  let items = (pre.items || []).slice();
  const ov = modalForm("Cargar compra",
    '<div class="grid-3"><div class="form-field"><label>Proveedor <span class="req">*</span></label><div id="sel-prov"></div></div>' +
    campo("cnum", "N° de factura del proveedor", "") + campo("cfecha", "Fecha", hoyISO(), "date", { req: true }) +
    selectCampo("ccond", "Condición", [{ value: "contado", texto: "Contado" }, { value: "credito", texto: "Crédito" }], "contado") + "</div>" +
    '<div class="seccion-form"><i class="fa-solid fa-boxes-stacked"></i> Productos</div>' +
    '<div class="lineas" id="c-items"><div class="linea linea-com linea-head"><span>Producto</span><span>Cantidad</span><span>Costo unit.</span><span>Vence / lote</span><span></span></div></div>' +
    '<div class="agregar-linea"><div id="sel-prod-c"></div><input id="c-scan" class="input" style="max-width:230px" placeholder="Escanear código + Enter" autocomplete="off"><button type="button" class="btn btn-ghost" id="c-nuevo-prod"><i class="fa-solid fa-plus"></i> Producto nuevo</button></div><small class="hint">Con códigos GS1 de medicamentos se cargan solos el lote y el vencimiento.</small>' +
    '<div class="totales" id="c-tot"></div>' +
    checkCampo("cact", "Actualizar el costo de cada producto con este precio", true) + "<br>" +
    (Caja.actual ? checkCampo("ccaja", "Pagar en efectivo desde la caja abierta (registra egreso)", false) : '<small class="hint">Sin caja abierta: el pago no se registra en caja.</small>') +
    areaCampo("cnotas", "Notas", ""), {
      ancho: "modal-xl", textoGuardar: "Registrar compra",
      onGuardar: async function () {
        requiereConexion("Cargar una compra");
        const prov = selProv.get(); if (!prov) throw errorUsuario("Elegí el proveedor.");
        const its = items.filter(function (i) { return i.cantidad > 0; });
        if (!its.length) throw errorUsuario("Agregá al menos un producto con cantidad.");
        const total = its.reduce(function (a, i) { return a + i.cantidad * i.costo; }, 0);
        const pagarCaja = chk("ccaja") && Caja.actual;
        const act = chk("cact");
        const ref = db.collection("compras").doc();
        await db.runTransaction(async function (tx) {
          const inv = await Inventario.leer(tx, its.map(function (i) { return i.productoId; }));
          if (pagarCaja) { const cs = await tx.get(db.collection("cajas").doc(Caja.actual.id)); if (!cs.exists || cs.data().estado !== "abierta") throw errorUsuario("La caja se cerró."); }
          Inventario.mover(tx, inv, its.map(function (i) { return { productoId: i.productoId, delta: i.cantidad, motivo: "Compra " + prov.nombre + (val("cnum") ? " fact. " + val("cnum") : "") }; }), { origen: "compra", refId: ref.id, permitirNegativo: true });
          its.forEach(function (i) {
            const up = {};
            if (act && i.costo) up.precioCompra = i.costo;
            if (i.vence) up.fechaVencimiento = tsDeInput(i.vence);
            if (i.lote) up.lote = i.lote;
            if (!inv[i.productoId].proveedorId) { up.proveedorId = prov.id; up.proveedor = prov.nombre; }
            if (Object.keys(up).length) tx.update(db.collection("productos").doc(i.productoId), up);
          });
          tx.set(ref, Object.assign({ proveedorId: prov.id, proveedor: prov.nombre, numeroFactura: val("cnum"), fecha: tsDeInput(val("cfecha")), condicion: val("ccond"),
            items: its.map(function (i) { return { productoId: i.productoId, nombre: i.nombre, cantidad: i.cantidad, costo: i.costo, subtotal: i.cantidad * i.costo, vence: i.vence || "", lote: i.lote || "" }; }),
            total: total, pagadoCaja: !!pagarCaja, notas: val("cnotas") }, metaCrear()));
          if (pagarCaja) _movCajaTx(tx, Caja.actual, { tipo: "egreso", monto: total, metodo: "efectivo", concepto: "Compra " + prov.nombre + (val("cnum") ? " fact. " + val("cnum") : ""), categoria: "Pago a proveedor" });
        });
        registrarAuditoria("crear", "compras", "Compra a " + prov.nombre + " por " + fmtMoneda(total) + " (" + its.length + " productos)");
        toast("Compra registrada. Stock actualizado.", "ok");
      }
    });
  const selProv = selector("sel-prov", { valor: pre.proveedorId, items: function () { return Datos.lista("proveedores"); }, texto: function (p) { return p.nombre; }, sub: function (p) { return p.ruc || ""; }, req: true, placeholder: "Buscar proveedor...",
    nuevo: { texto: "Crear proveedor", fn: function () { abrirFormProveedor(null); } } });
  const cont = document.getElementById("c-items");
  function pintar() {
    cont.querySelectorAll(".linea:not(.linea-head)").forEach(function (x) { x.remove(); });
    items.forEach(function (it, i) {
      const r = document.createElement("div"); r.className = "linea linea-com";
      r.innerHTML = '<div class="concepto"><b>' + escHTML(it.nombre) + "</b><small>Stock actual: " + fmtNum((Datos.porId("productos", it.productoId) || {}).cantidad) + "</small></div>" +
        '<input type="number" min="0" step="any" class="c-cant" value="' + it.cantidad + '"><input type="number" min="0" class="c-costo" value="' + it.costo + '">' +
        '<div style="display:flex;flex-direction:column;gap:4px"><input type="date" class="c-vence" value="' + (it.vence || "") + '"><input class="c-lote" placeholder="Lote" value="' + escHTML(it.lote || "") + '"></div>' +
        '<button type="button" class="btn-icono danger"><i class="fa-solid fa-trash"></i></button>';
      cont.appendChild(r);
      r.querySelector(".c-cant").oninput = function () { it.cantidad = Number(this.value) || 0; tot(); };
      r.querySelector(".c-costo").oninput = function () { it.costo = Number(this.value) || 0; tot(); };
      r.querySelector(".c-vence").onchange = function () { it.vence = this.value; };
      r.querySelector(".c-lote").oninput = function () { it.lote = this.value; };
      r.querySelector(".btn-icono").onclick = function () { items.splice(i, 1); pintar(); };
    });
    tot();
  }
  function tot() { document.getElementById("c-tot").innerHTML = '<div class="total"><span>Total compra</span><span>' + fmtMoneda(items.reduce(function (a, i) { return a + i.cantidad * i.costo; }, 0)) + "</span></div>"; }
  const selP = selector("sel-prod-c", { items: function () { return Datos.lista("productos"); }, texto: function (p) { return p.nombre; }, sub: function (p) { return "Stock " + fmtNum(p.cantidad) + " · costo " + fmtMoneda(p.precioCompra); },
    buscar: function (p) { return p.nombre + " " + (p.codigoBarras || ""); }, placeholder: "Agregar producto (nombre o código)...",
    onChange: function (p) {
      if (!p) return;
      if (!items.find(function (x) { return x.productoId === p.id; })) items.push({ productoId: p.id, nombre: p.nombre, cantidad: 1, costo: p.precioCompra || 0, vence: "", lote: "" });
      pintar(); setTimeout(function () { selP.set(null); }, 0);
    } });
  document.getElementById("c-nuevo-prod").onclick = function () { location.href = "stock.html"; };
  function porEscaneo(texto) {
    const r = interpretarEscaneo(texto), v = validarCodigo(r.codigo);
    if (v.tipo && /^\d+$/.test(r.codigo) && !v.valido) { toast("Código " + r.codigo + " inválido (mal leído).", "error"); return; }
    const p = productoPorCodigo(v.normalizado || r.codigo);
    if (!p) { toast("No hay producto con el código " + r.codigo + ". Crealo primero en Stock.", "warn", 6000); return; }
    let it = items.find(function (x) { return x.productoId === p.id && (!r.lote || x.lote === r.lote); });
    if (it) it.cantidad++;
    else items.push({ productoId: p.id, nombre: p.nombre, cantidad: 1, costo: p.precioCompra || 0, vence: r.vencimiento ? fechaInput(r.vencimiento) : "", lote: r.lote || "" });
    pintar(); toast("+1 " + p.nombre + (r.lote ? " · lote " + r.lote : ""), "ok", 1500);
  }
  const cs = document.getElementById("c-scan");
  cs.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); const v = cs.value.trim(); cs.value = ""; if (v) porEscaneo(v); } });
  window.alEscanearModal = porEscaneo;
  pintar();
}
function verCompra(c) {
  abrirModal({
    titulo: "Compra · " + (c.proveedor || ""), ancho: "modal-lg",
    cuerpo: '<div class="ficha-datos" style="margin-top:0"><div><small>Fecha</small>' + fmtFechaCorta(c.fecha) + "</div><div><small>Factura</small>" + escHTML(c.numeroFactura || "—") + "</div><div><small>Condición</small>" + escHTML(c.condicion) + "</div><div><small>Cargó</small>" + escHTML(c.creadoPor || "") + "</div></div>" +
      '<div class="table-wrap mt"><table class="tabla"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Costo</th><th class="num">Subtotal</th><th>Vence / lote</th></tr></thead><tbody>' +
      (c.items || []).map(function (i) { return "<tr><td>" + escHTML(i.nombre) + '</td><td class="num">' + fmtNum(i.cantidad) + '</td><td class="num">' + fmtMoneda(i.costo) + '</td><td class="num">' + fmtMoneda(i.subtotal) + "</td><td>" + escHTML([i.vence, i.lote].filter(Boolean).join(" · ")) + "</td></tr>"; }).join("") +
      '</tbody></table></div><div class="totales"><div class="total"><span>Total</span><span>' + fmtMoneda(c.total) + "</span></div></div>" + (c.notas ? '<p class="muted">' + escHTML(c.notas) + "</p>" : "")
  });
}
/* ---------- Sugerido de compra (segun consumo real) ---------- */
const SUG = { dias: 30, cobertura: 30, movs: null, cargando: false };
async function cargarConsumo() {
  SUG.cargando = true;
  try {
    const s = await db.collection("movimientos_stock").where("fecha", ">=", TS.fromDate(sumarDias(new Date(), -SUG.dias))).get();
    SUG.movs = docsDe(s).filter(function (m) { return m.tipo === "salida" && ["factura", "manual", "vacuna"].indexOf(m.origen || "manual") !== -1; });
  } catch (e) { toast(mensajeError(e), "error"); SUG.movs = []; }
  SUG.cargando = false; pintarCompras();
}
function calcularSugerido() {
  const cons = {};
  (SUG.movs || []).forEach(function (m) { cons[m.productoId] = (cons[m.productoId] || 0) + (Number(m.cantidad) || 0); });
  return Datos.lista("productos").map(function (p) {
    const diario = (cons[p.id] || 0) / SUG.dias, stock = Number(p.cantidad) || 0, min = Number(p.minimoStock) || 0;
    let sug = Math.ceil(diario * SUG.cobertura + min - stock);
    if (!cons[p.id] && stock <= min) sug = Math.max(sug, Math.max(1, min * 2 - stock));
    const dura = diario > 0 ? Math.floor(stock / diario) : null;
    return { p: p, consumo: cons[p.id] || 0, diario: diario, stock: stock, sugerido: Math.max(0, sug), dura: dura };
  }).filter(function (x) { return x.sugerido > 0; });
}
function pintarSugerido(cont) {
  if (!SUG.movs && !SUG.cargando) { cont.innerHTML = skeleton(4); cargarConsumo(); return; }
  if (SUG.cargando) return;
  const l = calcularSugerido();
  const grupos = {};
  l.forEach(function (x) { const k = x.p.proveedorId || ""; (grupos[k] = grupos[k] || []).push(x); });
  const total = l.reduce(function (a, x) { return a + x.sugerido * (Number(x.p.precioCompra) || 0); }, 0);
  cont.innerHTML = '<div class="filtros card"><label class="fl">Consumo de los últimos <select id="sg-dias"><option>30</option><option>60</option><option>90</option></select> días</label>' +
    '<label class="fl">Comprar para <select id="sg-cob"><option value="15">15 días</option><option value="30">30 días</option><option value="45">45 días</option><option value="60">60 días</option></select></label>' +
    '<span class="muted">Sugerido = consumo diario × días + stock mínimo − stock actual</span></div>' +
    '<div class="chips"><div class="chip-resumen"><small>Productos a reponer</small><b>' + l.length + '</b></div><div class="chip-resumen"><small>Costo estimado</small><b>' + fmtMoneda(total) + "</b></div></div>" +
    (l.length ? Object.keys(grupos).map(function (k) {
      const pr = Datos.porId("proveedores", k);
      return '<div class="card"><h3><i class="fa-solid fa-building"></i> ' + escHTML(pr ? pr.nombre : "Sin proveedor asignado") +
        '<span class="acc fila-flex">' + (pr && pr.telefono ? '<button class="btn btn-wa btn-sm" data-wa="' + k + '"><i class="fa-brands fa-whatsapp"></i> Pedir</button>' : "") +
        '<button class="btn btn-primary btn-sm" data-comp="' + k + '"><i class="fa-solid fa-cart-plus"></i> Crear compra</button></span></h3>' +
        '<div class="table-wrap"><table class="tabla tabla-resp"><thead><tr><th>Producto</th><th class="num">Stock</th><th class="num">Consumo/día</th><th class="num">Alcanza</th><th class="num">Sugerido</th><th class="num">Costo</th></tr></thead><tbody>' +
        grupos[k].sort(function (a, b) { return (a.dura == null ? 9999 : a.dura) - (b.dura == null ? 9999 : b.dura); }).map(function (x) {
          return '<tr><td data-label="Producto"><b>' + escHTML(x.p.nombre) + '</b></td><td class="num" data-label="Stock">' + fmtNum(x.stock) + '</td><td class="num" data-label="Consumo/día">' + fmtNum(x.diario, 1) +
            '</td><td class="num" data-label="Alcanza">' + (x.dura == null ? "—" : '<span class="' + (x.dura <= 7 ? "texto-danger" : "") + '">' + x.dura + " días</span>") + '</td><td class="num" data-label="Sugerido"><b>' + fmtNum(x.sugerido) +
            '</b></td><td class="num" data-label="Costo">' + fmtMoneda(x.sugerido * (Number(x.p.precioCompra) || 0)) + "</td></tr>";
        }).join("") + "</tbody></table></div></div>";
    }).join("") : '<div class="card">' + vacio("Con el consumo actual no hace falta reponer nada.", "fa-circle-check") + "</div>");
  const sd = document.getElementById("sg-dias"), sc = document.getElementById("sg-cob");
  sd.value = String(SUG.dias); sc.value = String(SUG.cobertura);
  sd.onchange = function () { SUG.dias = Number(sd.value); SUG.movs = null; pintarCompras(); };
  sc.onchange = function () { SUG.cobertura = Number(sc.value); pintarCompras(); };
  cont.querySelectorAll("[data-comp]").forEach(function (b) {
    b.onclick = function () {
      const g = grupos[b.dataset.comp];
      abrirFormCompra({ proveedorId: b.dataset.comp, items: g.map(function (x) { return { productoId: x.p.id, nombre: x.p.nombre, cantidad: x.sugerido, costo: Number(x.p.precioCompra) || 0, vence: "", lote: "" }; }) });
    };
  });
  cont.querySelectorAll("[data-wa]").forEach(function (b) {
    b.onclick = function () {
      const pr = Datos.porId("proveedores", b.dataset.wa), g = grupos[b.dataset.wa];
      enviarWhatsApp(pr.telefono, "Hola " + (pr.contacto || pr.nombre) + "! Somos " + nombreClinica() + ". Quisiéramos hacer el siguiente pedido:\n" + g.map(function (x) { return "• " + fmtNum(x.sugerido) + " × " + x.p.nombre; }).join("\n") + "\n¿Nos confirmás precio y disponibilidad? ¡Gracias!");
    };
  });
}
window.eliminarProveedor = eliminarProveedor; window.waProv = waProv;
document.addEventListener("DOMContentLoaded", initCompras);
