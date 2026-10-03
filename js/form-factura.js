/* =====================================================================
 * form-factura.js — Facturacion, cobros y caja (compartido)
 * ---------------------------------------------------------------------
 * IVA PARAGUAY: los precios se cargan CON IVA INCLUIDO y cada item tiene
 * su tasa (10%, 5% o exenta). Liquidacion: IVA10 = total10/11,
 * IVA5 = total5/21.
 * Al emitir (en UNA transaccion): numero correlativo atomico, descuento
 * de stock de productos, pago inicial en la caja abierta y marca de
 * "cobrado" en la consulta/cirugia de origen.
 * ===================================================================== */

const IVA_OPCIONES = [{ value: "10", texto: "10%" }, { value: "5", texto: "5%" }, { value: "0", texto: "Exenta" }];

function calcularTotalesFactura(items) {
  const t = { gravada10: 0, gravada5: 0, exenta: 0, iva10: 0, iva5: 0, total: 0 };
  items.forEach(function (it) {
    const tot = Math.round((Number(it.cantidad) || 0) * (Number(it.precio) || 0) * (1 - (Number(it.descuento) || 0) / 100));
    it.total = tot;
    const iva = Number(it.iva);
    if (iva === 10) t.gravada10 += tot; else if (iva === 5) t.gravada5 += tot; else t.exenta += tot;
    t.total += tot;
  });
  t.iva10 = Math.round(t.gravada10 / 11);
  t.iva5 = Math.round(t.gravada5 / 21);
  return t;
}
function formatoNumeroFactura(n) {
  const c = cfg();
  if (c.establecimiento && c.puntoExpedicion) return String(c.establecimiento).padStart(3, "0") + "-" + String(c.puntoExpedicion).padStart(3, "0") + "-" + String(n).padStart(7, "0");
  return "FAC-" + String(n).padStart(4, "0");
}
function saldoFactura(f) {
  if (f.estado === "anulada") return 0;
  if (f.saldo != null) return Number(f.saldo) || 0;
  return f.estado === "pendiente" ? Number(f.total) || 0 : 0;
}
function estadoPorSaldo(total, pagado) {
  if (pagado <= 0) return total > 0 ? "pendiente" : "pagada";
  return pagado >= total ? "pagada" : "parcial";
}

/* Movimiento de caja dentro de una transaccion. */
function _movCajaTx(tx, caja, datos) {
  const u = window.MASCOTITA.usuario;
  tx.set(db.collection("caja_movimientos").doc(), Object.assign({ cajaId: caja.id, usuario: u.nombre, usuarioUid: u.uid, fecha: FS.serverTimestamp() }, datos));
  const up = {}; up["totales." + (datos.metodo || "efectivo")] = FS.increment(datos.tipo === "egreso" ? -datos.monto : datos.monto);
  up[datos.tipo === "egreso" ? "totalEgresos" : "totalIngresos"] = FS.increment(datos.monto);
  tx.update(db.collection("cajas").doc(caja.id), up);
}

/* ---------- Abrir caja ---------- */
function abrirCajaModal(onDone) {
  if (!puede("caja")) { toast("No tenés permiso para abrir la caja.", "warn"); return; }
  modalForm("Abrir caja",
    '<p class="lead" style="margin:0 0 12px">Contá el efectivo con el que empieza el turno.</p>' +
    campo("cini", "Monto inicial en efectivo (Gs)", "", "number", { min: 0, req: true }) + areaCampo("cnota", "Nota", ""), {
      ancho: "modal-sm", textoGuardar: "Abrir caja", icono: "fa-lock-open",
      onGuardar: async function () {
        requiereConexion("Abrir la caja");
        const ya = await Caja.obtener();
        if (ya) throw errorUsuario("Ya hay una caja abierta por " + ya.abiertaPor + ".");
        const u = window.MASCOTITA.usuario;
        const ref = db.collection("cajas").doc();
        await ref.set({ estado: "abierta", fechaApertura: FS.serverTimestamp(), montoInicial: num("cini"), abiertaPor: u.nombre, abiertaPorUid: u.uid, nota: val("cnota"), totales: {}, totalIngresos: 0, totalEgresos: 0 });
        registrarAuditoria("crear", "caja", "Abrió caja con " + fmtMoneda(num("cini")));
        toast("Caja abierta.", "ok");
        Caja.actual = { id: ref.id, estado: "abierta" };
        if (onDone) onDone();
      }
    });
}

/* =====================================================================
 * NUEVA FACTURA
 * op: { consultaId, cirugiaId, propietarioId, mascotaId, items }
 * ===================================================================== */
async function abrirFormFactura(op) {
  op = op || {};
  if (!puede("facturar")) { toast("No tenés permiso para facturar.", "warn"); return; }
  Datos.suscribir("propietarios"); Datos.suscribir("mascotas"); Datos.suscribir("productos"); Datos.suscribir("servicios");
  await Promise.all([Datos.listo("propietarios"), Datos.listo("mascotas"), Datos.listo("productos"), Datos.listo("servicios")]);
  const c = await cargarConfig();
  const ivaServ = String(c.ivaServicios != null ? c.ivaServicios : 10);
  let items = (op.items || []).slice();
  let origen = null;
  if (op.consultaId) {
    const s = await db.collection("consultas").doc(op.consultaId).get();
    if (s.exists) {
      origen = Object.assign({ id: s.id, col: "consultas" }, s.data());
      if (origen.facturaId) { toast("Esta consulta ya fue facturada.", "warn"); return; }
      const servs = Datos.lista("servicios").filter(function (x) { return x.activo !== false; });
      const sc = servs.find(function (x) { return x.id === c.servicioConsultaId; }) ||
        servs.find(function (x) { return /consulta/i.test(x.nombre) && /general/i.test(x.nombre); }) ||
        servs.find(function (x) { return x.categoria === "Consulta" && x.precio > 0; }) ||
        servs.find(function (x) { return /consulta/i.test(x.nombre); });
      items.push(sc ? { tipo: "servicio", refId: sc.id, concepto: sc.nombre, cantidad: 1, precio: sc.precio || 0, iva: String(sc.iva != null ? sc.iva : ivaServ), descuento: 0 }
        : { tipo: "libre", concepto: "Consulta veterinaria", cantidad: 1, precio: 0, iva: ivaServ, descuento: 0 });
      (origen.receta || []).filter(function (r) { return r.dispensar && r.productoId; }).forEach(function (r) {
        const p = Datos.porId("productos", r.productoId);
        if (p) items.push({ tipo: "producto", refId: p.id, concepto: p.nombre, cantidad: r.cantidad || 1, precio: p.precioVenta || 0, iva: String(p.iva != null ? p.iva : 10), descuento: 0, costo: p.precioCompra || 0 });
      });
    }
  }
  if (op.cirugiaId) {
    const s = await db.collection("cirugias").doc(op.cirugiaId).get();
    if (s.exists) {
      origen = Object.assign({ id: s.id, col: "cirugias" }, s.data());
      if (origen.facturaId) { toast("Esta cirugía ya fue facturada.", "warn"); return; }
      items.push({ tipo: "libre", concepto: "Cirugía: " + (origen.tipo || ""), cantidad: 1, precio: origen.costo || 0, iva: ivaServ, descuento: 0 });
    }
  }
  if (op.internacionId) {
    const s = await db.collection("internaciones").doc(op.internacionId).get();
    if (s.exists) {
      origen = Object.assign({ id: s.id, col: "internaciones" }, s.data());
      if (origen.facturaId) { toast("Esta internación ya fue facturada.", "warn"); return; }
      const dias = origen.diasCobrar || Math.max(1, Math.ceil(((aFecha(origen.egreso) || new Date()) - aFecha(origen.ingreso)) / 86400000));
      const sd = Datos.lista("servicios").find(function (x) { return /internaci/i.test(x.nombre); });
      items.push({ tipo: sd ? "servicio" : "libre", refId: sd ? sd.id : "", concepto: "Internación (" + dias + " día" + (dias > 1 ? "s" : "") + ")", cantidad: dias, precio: origen.precioDia || (sd ? sd.precio : 0), iva: String(sd && sd.iva != null ? sd.iva : ivaServ), descuento: 0 });
    }
  }
  const propIni = op.propietarioId || (origen && origen.propietarioId) || "";
  const mascIni = op.mascotaId || (origen && origen.mascotaId) || "";

  const esPres = !!op.presupuesto;
  const ov = modalForm(esPres ? "Nuevo presupuesto" : "Nueva factura",
    '<div class="segmentado mb" id="modo-cli"><button type="button" class="activo" data-m="reg">Cliente registrado</button><button type="button" data-m="cf">Consumidor final / otro</button></div>' +
    '<div class="grid-2"><div class="form-field" id="wrap-cli"><label>Cliente <span class="req">*</span></label><div id="sel-cli"></div></div>' +
    '<div class="form-field" id="wrap-cli-txt" hidden><label for="f-fcliente">Nombre / razón social</label><input id="f-fcliente" value="Consumidor final"></div>' +
    campo("fruc", "RUC / CI", "", "text", { ph: "Opcional" }) +
    '<div class="form-field"><label>Paciente (opcional)</label><div id="sel-masc-f"></div></div>' +
    selectCampo("fcond", "Condición", [{ value: "contado", texto: "Contado" }, { value: "credito", texto: "Crédito (cuenta corriente)" }], "contado") +
    "</div>" +
    '<div class="seccion-form"><i class="fa-solid fa-list"></i> Detalle <small class="muted" style="text-transform:none;margin-left:auto">Precios con IVA incluido</small></div>' +
    '<div class="lineas" id="f-items"><div class="linea linea-fac linea-head"><span>Descripción</span><span>Cant.</span><span>Precio</span><span>IVA</span><span>Desc. %</span><span style="text-align:right">Total</span><span></span></div></div>' +
    '<div class="agregar-linea"><div id="sel-item"></div><button type="button" class="btn btn-ghost" id="f-libre"><i class="fa-solid fa-plus"></i> Ítem libre</button>' +
    (puede("stock") ? '<button type="button" class="btn btn-ghost" id="f-scan" title="Escanear código de barras"><i class="fa-solid fa-barcode"></i></button>' : "") + "</div>" +
    '<div id="scan-zona"></div>' +
    '<div class="totales" id="f-totales"></div>' +
    '<div class="caja-pago" id="f-pago"></div>' +
    (esPres ? campo("fvalidez", "Validez (días)", cfg().validezPresupuesto || 15, "number", { min: 1 }) : "") +
    areaCampo("fnotas", esPres ? "Condiciones / observaciones del presupuesto" : "Notas (aparecen en el comprobante)", op.notas || ""), {
      ancho: "modal-xl", textoGuardar: esPres ? "Guardar presupuesto" : "Emitir", icono: esPres ? "fa-file-signature" : "fa-file-invoice-dollar",
      antesDeCerrar: function () { if (window._detenerScanner) window._detenerScanner(); window.alEscanearModal = null; },
      onGuardar: async function () { return esPres ? await guardarPresupuesto() : await emitir(); }
    });
  if (esPres) { el("fcond").closest(".form-field").hidden = true; }

  let modoCli = "reg";
  const selCli = Datos.selectorDueno("sel-cli", { valor: propIni,
    onChange: function (d) { el("fruc").value = d ? (d.ruc || d.dni || "") : ""; el("fruc").dispatchEvent(new Event("input")); if (!esPres) pintarPago(); },
    nuevo: puede("pacientes") ? { texto: "Registrar cliente nuevo", fn: function (txt) { abrirFormDueno(null, { prefill: { nombre: txt }, onGuardado: function (id) { setTimeout(function () { selCli.set(id); }, 60); } }); } } : null });
  if (selCli.get()) el("fruc").value = selCli.get().ruc || selCli.get().dni || "";
  validarEnVivo(el("fruc"), "ruc");
  const selMasc = Datos.selectorMascota("sel-masc-f", { valor: mascIni, items: function () { const d = selCli.get(); return Datos.lista("mascotas").filter(function (m) { return !d || m.propietarioId === d.id; }); },
    onChange: function (m) { if (m && !selCli.get() && m.propietarioId) selCli.set(m.propietarioId); } });
  ov.el.querySelectorAll("#modo-cli button").forEach(function (b) {
    b.onclick = function () {
      modoCli = b.dataset.m;
      ov.el.querySelectorAll("#modo-cli button").forEach(function (x) { x.classList.toggle("activo", x === b); });
      document.getElementById("wrap-cli").hidden = modoCli !== "reg"; document.getElementById("wrap-cli-txt").hidden = modoCli === "reg";
      if (modoCli === "cf") { el("fcond").value = "contado"; el("fruc").value = ""; }
      pintarPago();
    };
  });

  /* ---- Items ---- */
  const cont = document.getElementById("f-items");
  function pintarItems() {
    cont.querySelectorAll(".linea:not(.linea-head)").forEach(function (x) { x.remove(); });
    items.forEach(function (it, i) {
      const p = it.tipo === "producto" ? Datos.porId("productos", it.refId) : null;
      const row = document.createElement("div");
      row.className = "linea linea-fac";
      row.innerHTML =
        '<div class="concepto"><input class="i-con" value="' + escHTML(it.concepto) + '"' + (it.tipo !== "libre" ? " readonly" : "") + ">" +
        (p ? "<small>Stock: " + fmtNum(p.cantidad) + "</small>" : it.tipo === "servicio" ? "<small>Servicio</small>" : "") + "</div>" +
        '<input class="i-cant" type="number" min="0" step="any" value="' + it.cantidad + '">' +
        '<input class="i-pre" type="number" min="0" step="1" value="' + it.precio + '"' + (!esAdmin() && it.tipo !== "libre" && !cfg().permitirCambiarPrecio ? " readonly title=\"Solo el administrador cambia precios del catálogo\"" : "") + ">" +
        '<select class="i-iva">' + IVA_OPCIONES.map(function (o) { return '<option value="' + o.value + '"' + (String(it.iva) === o.value ? " selected" : "") + ">" + o.texto + "</option>"; }).join("") + "</select>" +
        '<input class="i-desc" type="number" min="0" max="100" step="any" value="' + (it.descuento || 0) + '">' +
        '<div class="tot">' + fmtMoneda(0) + "</div>" +
        '<button type="button" class="btn-icono danger i-del" title="Quitar"><i class="fa-solid fa-trash"></i></button>';
      cont.appendChild(row);
      row.querySelector(".i-con").oninput = function () { it.concepto = this.value; };
      row.querySelector(".i-cant").oninput = function () { it.cantidad = Number(this.value) || 0; recalcular(); };
      row.querySelector(".i-pre").oninput = function () { it.precio = Number(this.value) || 0; recalcular(); };
      row.querySelector(".i-iva").onchange = function () { it.iva = this.value; recalcular(); };
      row.querySelector(".i-desc").oninput = function () { it.descuento = Math.min(100, Math.max(0, Number(this.value) || 0)); recalcular(); };
      row.querySelector(".i-del").onclick = function () { items.splice(i, 1); pintarItems(); };
    });
    if (!items.length) cont.insertAdjacentHTML("beforeend", '<div class="linea" style="display:block"><p class="muted" style="text-align:center;padding:8px">Agregá servicios o productos con el buscador de abajo.</p></div>');
    recalcular();
  }
  let totales = calcularTotalesFactura(items);
  function recalcular() {
    totales = calcularTotalesFactura(items);
    cont.querySelectorAll(".linea-fac:not(.linea-head) .tot").forEach(function (t, i) { t.textContent = fmtMoneda(items[i].total); });
    document.getElementById("f-totales").innerHTML =
      (totales.exenta ? "<div><span>Exentas</span><span>" + fmtMoneda(totales.exenta) + "</span></div>" : "") +
      (totales.gravada5 ? "<div><span>Gravadas 5%</span><span>" + fmtMoneda(totales.gravada5) + "</span></div><div><span>IVA 5%</span><span>" + fmtMoneda(totales.iva5) + "</span></div>" : "") +
      (totales.gravada10 ? "<div><span>Gravadas 10%</span><span>" + fmtMoneda(totales.gravada10) + "</span></div><div><span>IVA 10%</span><span>" + fmtMoneda(totales.iva10) + "</span></div>" : "") +
      '<div class="total"><span>TOTAL</span><span>' + fmtMoneda(totales.total) + "</span></div>";
    const m = el("fpago"); if (m && !m.dataset.tocado) m.value = totales.total;
    actualizarVuelto();
  }
  function agregar(it) {
    const ex = items.find(function (x) { return x.tipo !== "libre" && x.tipo === it.tipo && x.refId === it.refId; });
    if (ex) ex.cantidad = (Number(ex.cantidad) || 0) + 1; else items.push(it);
    pintarItems();
  }
  function itemDeProducto(p) { return { tipo: "producto", refId: p.id, concepto: p.nombre, cantidad: 1, precio: p.precioVenta || 0, iva: String(p.iva != null ? p.iva : 10), descuento: 0, costo: p.precioCompra || 0 }; }
  const selItem = selector("sel-item", {
    items: function () {
      return Datos.lista("servicios").filter(function (s) { return s.activo !== false; }).map(function (s) { return Object.assign({ _t: "servicio" }, s); })
        .concat(Datos.lista("productos").map(function (p) { return Object.assign({ _t: "producto" }, p); }));
    },
    texto: function (x) { return x.nombre; },
    sub: function (x) { return (x._t === "servicio" ? "Servicio" : "Producto · stock " + fmtNum(x.cantidad)) + " · " + fmtMoneda(x._t === "servicio" ? x.precio : x.precioVenta); },
    buscar: function (x) { return x.nombre + " " + (x.categoria || "") + " " + (x.codigoBarras || ""); },
    icono: function (x) { return '<i class="fa-solid ' + (x._t === "servicio" ? "fa-tag" : "fa-box") + '" style="width:18px;color:var(--texto-suave)"></i>'; },
    placeholder: "Agregar servicio o producto (nombre o código)...",
    onChange: function (x) {
      if (!x) return;
      if (x._t === "servicio") agregar({ tipo: "servicio", refId: x.id, concepto: x.nombre, cantidad: 1, precio: x.precio || 0, iva: String(x.iva != null ? x.iva : ivaServ), descuento: 0 });
      else agregar(itemDeProducto(x));
      setTimeout(function () { selItem.set(null); selItem.input.focus(); }, 0);
    }
  });
  // Lector de codigo de barras USB: escribe el codigo + Enter en el buscador.
  function porEscaneo(texto) {
    const r = interpretarEscaneo(texto);
    const v = validarCodigo(r.codigo);
    if (v.tipo && /^\d+$/.test(r.codigo) && !v.valido) { toast("Código " + r.codigo + " inválido (mal leído). Volvé a escanear.", "error"); return true; }
    const p = productoPorCodigo(v.normalizado || r.codigo);
    if (p) { agregar(itemDeProducto(p)); toast("+1 " + p.nombre, "ok", 1200); return true; }
    toast("No hay producto con el código " + r.codigo + ".", "warn"); return false;
  }
  selItem.input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const cod = selItem.input.value.trim(); if (!/^[\d(\]]/.test(cod) || cod.length < 6) return;
    e.preventDefault(); e.stopPropagation();
    if (porEscaneo(cod)) selItem.input.value = "";
  }, true);
  window.alEscanearModal = porEscaneo;
  document.getElementById("f-libre").onclick = function () { items.push({ tipo: "libre", concepto: "", cantidad: 1, precio: 0, iva: ivaServ, descuento: 0 }); pintarItems(); const l = cont.querySelectorAll(".i-con"); l[l.length - 1].focus(); };
  const bs = document.getElementById("f-scan");
  if (bs) bs.onclick = function () {
    abrirEscanerContinuo("scan-zona", (function () { let u = "", t = 0; return function (cod) { const a = Date.now(); if (cod === u && a - t < 1500) return; u = cod; t = a; porEscaneo(cod); }; })());
  };

  /* ---- Pago ---- */
  function pintarPago() {
    const cred = val("fcond") === "credito";
    const caja = Caja.actual;
    document.getElementById("f-pago").innerHTML =
      '<div class="fila-flex" style="margin-bottom:8px"><b><i class="fa-solid fa-money-bill-wave"></i> Pago ' + (cred ? "inicial (opcional)" : "") + "</b><span class=\"espaciador\"></span>" +
      (caja ? pill("Caja abierta", "ok") : pill("Caja cerrada", "danger")) + "</div>" +
      (!caja ? '<div class="alerta alerta-warn" style="margin:0"><i class="fa-solid fa-cash-register"></i> Para registrar cobros tiene que haber una caja abierta.' +
        (puede("caja") ? '<button type="button" class="btn btn-sm btn-primary" id="f-abrir-caja">Abrir caja</button>' : "") + "</div>" : "") +
      '<div class="grid-4"' + (!caja ? " hidden" : "") + ">" +
      selectCampo("fmetodo", "Medio de pago", METODOS_PAGO, "efectivo") +
      campo("fpago", "Monto cobrado", cred ? 0 : totales.total, "number", { min: 0 }) +
      campo("frecibido", "Recibido (efectivo)", "", "number", { min: 0, ph: "Para calcular vuelto" }) +
      '<div class="form-field"><label>Vuelto</label><input id="f-vuelto" readonly value="Gs 0"></div></div>';
    const ac = document.getElementById("f-abrir-caja"); if (ac) ac.onclick = function () { abrirCajaModal(function () { Caja.obtener().then(pintarPago); }); };
    const mp = el("fpago"); if (mp) { mp.oninput = function () { mp.dataset.tocado = "1"; actualizarVuelto(); }; if (cred) mp.dataset.tocado = "1"; }
    const rc = el("frecibido"); if (rc) rc.oninput = actualizarVuelto;
    const mt = el("fmetodo"); if (mt) mt.onchange = function () { document.getElementById("f-frecibido") && (el("frecibido").closest(".form-field").hidden = mt.value !== "efectivo"); actualizarVuelto(); };
  }
  function actualizarVuelto() {
    const v = document.getElementById("f-vuelto"); if (!v) return;
    const rec = num("frecibido"), pago = num("fpago");
    v.value = rec ? fmtMoneda(Math.max(0, rec - pago)) : "Gs 0";
  }
  el("fcond").onchange = pintarPago;
  await Caja.obtener().catch(function () {});
  if (esPres) document.getElementById("f-pago").hidden = true; else pintarPago();
  pintarItems();

  /* ---- Presupuesto ---- */
  async function guardarPresupuesto() {
    requiereConexion("Guardar un presupuesto");
    const its = items.filter(function (it) { return (Number(it.cantidad) || 0) > 0 && String(it.concepto || "").trim(); });
    if (!its.length) throw errorUsuario("Agregá al menos un ítem.");
    const cli = modoCli === "reg" ? selCli.get() : null;
    if (modoCli === "reg" && !cli) throw errorUsuario("Elegí el cliente o usá \"Consumidor final\".");
    const t = calcularTotalesFactura(its), m = selMasc.get(), u = window.MASCOTITA.usuario;
    const ref = db.collection("presupuestos").doc();
    let numero = "";
    await db.runTransaction(async function (tx) {
      const cr = db.collection("config").doc("contadores");
      const c = await tx.get(cr);
      const n = (c.exists ? Number(c.data().presupuesto) || 0 : 0) + 1;
      numero = "P-" + String(n).padStart(4, "0");
      tx.set(ref, Object.assign({ numero: numero, numeroInt: n, fecha: FS.serverTimestamp(), propietarioId: cli ? cli.id : "", cliente: cli ? cli.nombre : (val("fcliente") || "Consumidor final"),
        clienteRuc: val("fruc"), clienteTelefono: cli ? cli.telefono || "" : "", mascotaId: m ? m.id : "", mascota: m ? m.nombre : "",
        items: its.map(function (i) { return { tipo: i.tipo, refId: i.refId || "", concepto: i.concepto, cantidad: Number(i.cantidad), precio: Number(i.precio), iva: Number(i.iva), descuento: Number(i.descuento) || 0, total: i.total, costo: Number(i.costo) || 0 }; }),
        validezDias: Math.max(1, num("fvalidez") || 15), estado: "pendiente", notas: val("fnotas"), creadoPor: u.nombre, creadoPorUid: u.uid }, t));
      tx.set(cr, { presupuesto: n }, { merge: true });
    });
    registrarAuditoria("crear", "presupuestos", "Creó presupuesto " + numero + " por " + fmtMoneda(t.total));
    toast("Presupuesto " + numero + " guardado.", "ok", 8000, { texto: "PDF", fn: function () { pdfPresupuestoPorId(ref.id); } });
    if (op.onGuardado) op.onGuardado(ref.id);
  }

  /* ---- Emitir ---- */
  async function emitir() {
    requiereConexion("Emitir una factura");
    const its = items.filter(function (it) { return (Number(it.cantidad) || 0) > 0 && String(it.concepto || "").trim(); });
    if (!its.length) throw errorUsuario("Agregá al menos un ítem con cantidad y descripción.");
    const cli = modoCli === "reg" ? selCli.get() : null;
    if (modoCli === "reg" && !cli) throw errorUsuario("Elegí el cliente o usá \"Consumidor final\".");
    const cond = val("fcond");
    if (cond === "credito" && !cli) throw errorUsuario("La venta a crédito necesita un cliente registrado.");
    const sinPrecio = its.filter(function (i) { return !(Number(i.precio) > 0); });
    if (sinPrecio.length && !(await confirmar("Hay ítems sin precio: " + sinPrecio.map(function (i) { return i.concepto; }).join(", ") + ". ¿Emitir igual?", { peligro: false }))) return false;
    const t = calcularTotalesFactura(its);
    if (t.total <= 0 && !(await confirmar("El total es Gs 0. ¿Emitir igual?", { peligro: false }))) return false;
    const caja = Caja.actual;
    const pago = caja ? Math.min(num("fpago"), t.total) : 0;
    if (cond === "contado" && pago < t.total) {
      if (!caja) throw errorUsuario("Para una venta al contado tiene que haber una caja abierta (o elegí Crédito).");
      if (!(await confirmar("El monto cobrado (" + fmtMoneda(pago) + ") es menor al total. La diferencia queda como saldo pendiente. ¿Continuar?", { peligro: false }))) return false;
    }
    const metodo = val("fmetodo") || "efectivo";
    const m = selMasc.get();
    const r = await emitirFacturaCore({
      items: its, cliente: cli, clienteNombre: val("fcliente"), clienteRuc: val("fruc"), mascota: m, condicion: cond,
      pago: pago, metodo: metodo, caja: caja, notas: val("fnotas"), origen: origen, presupuestoId: op.presupuestoId || ""
    });
    const numero = r.numero, facRef = { id: r.id };
    registrarAuditoria("crear", "facturas", "Emitió " + numero + " por " + fmtMoneda(t.total) + (pago ? " (cobró " + fmtMoneda(pago) + ")" : ""));
    const vuelto = num("frecibido") ? Math.max(0, num("frecibido") - pago) : 0;
    toast("Factura " + numero + " emitida." + (vuelto ? " Vuelto: " + fmtMoneda(vuelto) : ""), "ok", 9000, { texto: "Imprimir", fn: function () { imprimirComprobante(facRef.id); } });
    if (cfg().imprimirAlEmitir) imprimirComprobante(facRef.id);
    if (op.onGuardado) op.onGuardado(facRef.id);
  }
  return ov;
}

/* =====================================================================
 * EMISION (nucleo compartido: formulario, punto de venta, presupuestos,
 * internacion). TODO en una transaccion: numero correlativo, stock,
 * pagos en caja y marca de cobro en los origenes.
 * p: { items, cliente, clienteNombre, clienteRuc, mascota, condicion,
 *      pagos[{metodo,monto}] | (pago, metodo), caja, notas,
 *      origenes[{col,id,veterinarioUid,veterinario}] | origen,
 *      presupuestoId, canal, recibido, vuelto, autorizaciones[], descuentoGlobal }
 * Items de producto pueden traer "factor" (presentacion: caja x10 => 10
 * unidades de stock por cada una vendida).
 * ===================================================================== */
function _unidadesStock(i) { return Math.round(Number(i.cantidad) * (Number(i.factor) || 1) * 1000) / 1000; }
async function emitirFacturaCore(p) {
  requiereConexion("Emitir una factura");
  const its = p.items, cli = p.cliente, t = calcularTotalesFactura(its);
  let pagosIn = (p.pagos || (p.pago ? [{ metodo: p.metodo || "efectivo", monto: p.pago }] : []))
    .map(function (x) { return { metodo: x.metodo || "efectivo", monto: Math.round(Number(x.monto) || 0) }; }).filter(function (x) { return x.monto > 0; });
  // Nunca se registra mas de lo que vale la factura (el excedente en efectivo es vuelto).
  let resto = t.total;
  pagosIn = pagosIn.map(function (x) { const m = Math.min(x.monto, resto); resto -= m; return { metodo: x.metodo, monto: m }; }).filter(function (x) { return x.monto > 0; });
  const pago = pagosIn.reduce(function (a, x) { return a + x.monto; }, 0), caja = p.caja;
  if (pago > 0 && !caja) throw errorUsuario("Para cobrar tiene que haber una caja abierta.");
  if (p.exigirPagoTotal && (p.condicion || "contado") === "contado" && pago < t.total) throw errorUsuario("Falta cobrar " + fmtMoneda(t.total - pago) + ". Para dejar saldo elegí cuenta corriente.");
  const u = window.MASCOTITA.usuario, cfgAct = cfg();
  const origenes = (p.origenes || (p.origen ? [p.origen] : [])).filter(Boolean);
  const primero = function (col) { const o = origenes.find(function (x) { return x.col === col; }); return o ? o.id : ""; };
  const conVet = origenes.find(function (o) { return o.veterinarioUid; }) || {};
  const prods = its.filter(function (i) { return i.tipo === "producto" && i.refId; });
  const facRef = db.collection("facturas").doc();
  let numero = "";
  await db.runTransaction(async function (tx) {
    const ctrRef = db.collection("config").doc("contadores");
    const ctr = await tx.get(ctrRef);
    const inv = await Inventario.leer(tx, prods.map(function (i) { return i.refId; }));
    if (pago > 0) { const cs = await tx.get(db.collection("cajas").doc(caja.id)); if (!cs.exists || cs.data().estado !== "abierta") throw errorUsuario("La caja se cerró. Abrí una nueva para cobrar."); }
    const origSnaps = await Promise.all(origenes.map(function (o) { return tx.get(db.collection(o.col).doc(o.id)); }));
    origSnaps.forEach(function (s, k) { if (s.exists && s.data().facturaId) throw errorUsuario("Un cargo de la clínica (" + origenes[k].col + ") ya fue cobrado en otra factura."); });
    let ult = ctr.exists ? Number(ctr.data().factura) || 0 : 0;
    if (!ctr.exists || ctr.data().factura == null) {
      const q = await db.collection("facturas").orderBy("numeroInt", "desc").limit(1).get().catch(function () { return { empty: true }; });
      if (!q.empty) ult = Number(q.docs[0].data().numeroInt) || 0;
      else {
        const q2 = await db.collection("facturas").orderBy("numero", "desc").limit(1).get();
        if (!q2.empty) ult = parseInt(String(q2.docs[0].data().numero || "").replace(/\D/g, ""), 10) || 0;
      }
    }
    const n = ult + 1; numero = formatoNumeroFactura(n);
    Inventario.mover(tx, inv, prods.map(function (i) { return { productoId: i.refId, delta: -_unidadesStock(i), motivo: "Venta " + numero }; }),
      { origen: "factura", refId: facRef.id, permitirNegativo: !!cfgAct.permitirStockNegativo });
    const pagos = pagosIn.map(function (x) { return { fecha: TS.now(), monto: x.monto, metodo: x.metodo, usuario: u.nombre, cajaId: caja.id }; });
    const datos = Object.assign({
      numero: numero, numeroInt: n, fecha: FS.serverTimestamp(),
      propietarioId: cli ? cli.id : "", cliente: cli ? cli.nombre : (p.clienteNombre || "Consumidor final"), clienteRuc: p.clienteRuc || (cli ? cli.ruc || "" : ""),
      clienteTelefono: cli ? cli.telefono || "" : "", mascotaId: p.mascota ? p.mascota.id : "", mascota: p.mascota ? p.mascota.nombre : "",
      condicion: p.condicion || "contado",
      items: its.map(function (i) {
        const x = { tipo: i.tipo, refId: i.refId || "", concepto: i.concepto, cantidad: Number(i.cantidad), precio: Number(i.precio), iva: Number(i.iva), descuento: Number(i.descuento) || 0, total: i.total, costo: Number(i.costo) || 0 };
        if (Number(i.factor) > 1) x.factor = Number(i.factor);
        if (i.presentacion) x.presentacion = i.presentacion;
        if (i.receta) x.receta = i.receta;
        if (i.oferta) x.oferta = true;
        if (i.precioLista && Number(i.precioLista) !== Number(i.precio)) x.precioLista = Number(i.precioLista);
        if (i.codigo) x.codigo = i.codigo;
        if (i.categoria) x.categoria = i.categoria;
        return x;
      }),
      pagos: pagos, pagado: pago, saldo: t.total - pago, estado: estadoPorSaldo(t.total, pago),
      consultaId: primero("consultas"), cirugiaId: primero("cirugias"), internacionId: primero("internaciones"),
      origenes: origenes.map(function (o) { return { col: o.col, id: o.id }; }),
      presupuestoId: p.presupuestoId || "", canal: p.canal || "", cajaId: caja ? caja.id : "",
      veterinarioUid: conVet.veterinarioUid || "", veterinario: conVet.veterinario || "",
      timbrado: cfgAct.timbrado || "", timbradoVigencia: cfgAct.timbradoVigencia || "", notas: p.notas || "",
      creadoPor: u.nombre, creadoPorUid: u.uid
    }, t);
    if (p.recibido) { datos.recibido = Math.round(p.recibido); datos.vuelto = Math.max(0, Math.round(p.vuelto || 0)); }
    if (p.descuentoGlobal) datos.descuentoGlobal = Number(p.descuentoGlobal);
    if (p.autorizaciones && p.autorizaciones.length) datos.autorizaciones = p.autorizaciones;
    tx.set(facRef, datos);
    const quien = cli ? cli.nombre : (p.clienteNombre || "Consumidor final");
    pagos.forEach(function (x) { _movCajaTx(tx, caja, { tipo: "ingreso", monto: x.monto, metodo: x.metodo, concepto: "Cobro " + numero + " · " + quien, facturaId: facRef.id }); });
    origenes.forEach(function (o) { tx.update(db.collection(o.col).doc(o.id), { porCobrar: false, facturaId: facRef.id }); });
    if (p.presupuestoId) tx.update(db.collection("presupuestos").doc(p.presupuestoId), { estado: "facturado", facturaId: facRef.id, numeroFactura: numero });
    tx.set(ctrRef, { factura: n }, { merge: true });
  });
  return { id: facRef.id, numero: numero, total: t.total, pago: pago };
}

async function obtenerFactura(id) { const s = await db.collection("facturas").doc(id).get(); return s.exists ? Object.assign({ id: s.id }, s.data()) : null; }
async function pdfFacturaPorId(id) { const f = await obtenerFactura(id); if (f) generarPDF(function () { return pdfFactura(f); }); }

/* =====================================================================
 * REGISTRAR PAGO (pagos parciales / cuenta corriente)
 * ===================================================================== */
async function abrirCobro(facturaId, onDone) {
  const f = await obtenerFactura(facturaId);
  if (!f) return;
  const saldo = saldoFactura(f);
  if (saldo <= 0) { toast("Esta factura no tiene saldo pendiente.", "info"); return; }
  await Caja.obtener().catch(function () {});
  const caja = Caja.actual;
  const ov = modalForm("Cobrar " + f.numero,
    '<div class="chips"><div class="chip-resumen"><small>Cliente</small><b>' + escHTML(f.cliente) + '</b></div><div class="chip-resumen"><small>Total</small><b>' + fmtMoneda(f.total) +
    '</b></div><div class="chip-resumen"><small>Saldo</small><b class="texto-danger">' + fmtMoneda(saldo) + "</b></div></div>" +
    (!caja ? '<div class="alerta alerta-warn"><i class="fa-solid fa-cash-register"></i> No hay caja abierta.' + (puede("caja") ? ' <button type="button" class="btn btn-sm btn-primary" id="c-abrir">Abrir caja</button>' : "") + "</div>" : "") +
    '<div class="grid-2">' + selectCampo("cmetodo", "Medio de pago", METODOS_PAGO, "efectivo") + campo("cmonto", "Monto", saldo, "number", { min: 1, max: saldo, req: true }) +
    campo("crec", "Recibido (efectivo)", "", "number", { min: 0 }) + '<div class="form-field"><label>Vuelto</label><input id="f-cvuelto" readonly value="Gs 0"></div></div>', {
      ancho: "modal-sm", textoGuardar: "Registrar pago", icono: "fa-hand-holding-dollar",
      onGuardar: async function () {
        requiereConexion("Registrar un pago");
        const cj = Caja.actual; if (!cj) throw errorUsuario("Abrí la caja para registrar el cobro.");
        const monto = Math.round(num("cmonto"));
        if (monto <= 0) throw errorUsuario("Monto inválido.");
        const metodo = val("cmetodo");
        const u = window.MASCOTITA.usuario;
        const ref = db.collection("facturas").doc(facturaId);
        let nuevo;
        await db.runTransaction(async function (tx) {
          const s = await tx.get(ref);
          const fx = s.data();
          const cs = await tx.get(db.collection("cajas").doc(cj.id));
          if (!cs.exists || cs.data().estado !== "abierta") throw errorUsuario("La caja se cerró.");
          const sal = saldoFactura(fx);
          if (monto > sal) throw errorUsuario("El monto supera el saldo (" + fmtMoneda(sal) + ").");
          const pagado = (Number(fx.pagado) || (fx.estado === "pagada" ? fx.total : 0)) + monto;
          nuevo = estadoPorSaldo(fx.total, pagado);
          tx.update(ref, { pagos: (fx.pagos || []).concat([{ fecha: TS.now(), monto: monto, metodo: metodo, usuario: u.nombre, cajaId: cj.id }]), pagado: pagado, saldo: Math.max(0, fx.total - pagado), estado: nuevo });
          _movCajaTx(tx, cj, { tipo: "ingreso", monto: monto, metodo: metodo, concepto: "Cobro " + fx.numero + " · " + fx.cliente, facturaId: facturaId });
        });
        registrarAuditoria("cobrar", "facturas", "Cobró " + fmtMoneda(monto) + " de " + f.numero + " (" + nombreMetodo(metodo) + ")");
        const vuelto = num("crec") ? Math.max(0, num("crec") - monto) : 0;
        toast("Pago registrado." + (vuelto ? " Vuelto: " + fmtMoneda(vuelto) : ""), "ok", 6000);
        if (onDone) onDone();
      }
    });
  const upd = function () { const r = num("crec"); document.getElementById("f-cvuelto").value = r ? fmtMoneda(Math.max(0, r - num("cmonto"))) : "Gs 0"; };
  el("crec").oninput = upd; el("cmonto").oninput = upd;
  const ab = document.getElementById("c-abrir"); if (ab) ab.onclick = function () { ov.cerrar(); abrirCajaModal(function () { abrirCobro(facturaId, onDone); }); };
}

/* =====================================================================
 * ANULAR (solo ADMIN): repone stock y, si se cobro, registra devolucion
 * ===================================================================== */
async function anularFactura(facturaId, onDone) {
  if (!esAdmin()) { toast("Solo el administrador puede anular.", "warn"); return; }
  const f = await obtenerFactura(facturaId);
  if (!f || f.estado === "anulada") return;
  await Caja.obtener().catch(function () {});
  const pagado = Number(f.pagado) || (f.estado === "pagada" ? Number(f.total) : 0);
  modalForm("Anular " + f.numero,
    '<div class="alerta alerta-danger"><i class="fa-solid fa-triangle-exclamation"></i> La factura queda registrada como ANULADA (no se borra). Los productos vuelven al stock.</div>' +
    areaCampo("amotivo", "Motivo de la anulación", "", { req: true }) +
    (pagado > 0 ? checkCampo("adev", "Registrar la devolución de " + fmtMoneda(pagado) + " como egreso de la caja abierta (por el mismo medio de pago)", !!Caja.actual) : ""), {
      ancho: "modal-sm", textoGuardar: "Anular factura", icono: "fa-ban",
      onGuardar: async function () {
        requiereConexion("Anular una factura");
        const dev = pagado > 0 && chk("adev");
        if (dev && !Caja.actual) throw errorUsuario("No hay caja abierta para registrar la devolución.");
        const u = window.MASCOTITA.usuario;
        await db.runTransaction(async function (tx) {
          const ref = db.collection("facturas").doc(facturaId);
          const s = await tx.get(ref); const fx = s.data();
          if (fx.estado === "anulada") throw errorUsuario("Ya estaba anulada.");
          if (Number(fx.devuelto) > 0) throw errorUsuario("Esta factura tiene devoluciones. Para el resto hacé otra devolución (nota de crédito) en lugar de anularla.");
          const prods = (fx.items || []).filter(function (i) { return i.tipo === "producto" && i.refId; });
          const inv = await Inventario.leer(tx, prods.map(function (i) { return i.refId; }));
          Inventario.mover(tx, inv, prods.filter(function (i) { return inv[i.refId]; }).map(function (i) { return { productoId: i.refId, delta: _unidadesStock(i), motivo: "Anulación " + fx.numero }; }), { origen: "anulacion", refId: facturaId, permitirNegativo: true });
          tx.update(ref, { estado: "anulada", saldo: 0, motivoAnulacion: val("amotivo"), anuladaPor: u.nombre, anuladaEn: FS.serverTimestamp() });
          if (dev) {
            // Devolver por el mismo medio con que se cobro (efectivo, transferencia...).
            const porMetodo = {};
            (fx.pagos || []).forEach(function (p) { porMetodo[p.metodo || "efectivo"] = (porMetodo[p.metodo || "efectivo"] || 0) + (Number(p.monto) || 0); });
            if (!Object.keys(porMetodo).length) porMetodo.efectivo = pagado;
            Object.keys(porMetodo).forEach(function (m) {
              if (porMetodo[m] > 0) _movCajaTx(tx, Caja.actual, { tipo: "egreso", monto: porMetodo[m], metodo: m, concepto: "Devolución por anulación " + fx.numero, facturaId: facturaId });
            });
          }
          const ors = (fx.origenes && fx.origenes.length) ? fx.origenes : [["consultas", fx.consultaId], ["cirugias", fx.cirugiaId], ["internaciones", fx.internacionId]].filter(function (x) { return x[1]; }).map(function (x) { return { col: x[0], id: x[1] }; });
          ors.forEach(function (o) { tx.update(db.collection(o.col).doc(o.id), { porCobrar: true, facturaId: "" }); });
          if (fx.presupuestoId) tx.update(db.collection("presupuestos").doc(fx.presupuestoId), { estado: "aceptado", facturaId: "", numeroFactura: "" });
        });
        registrarAuditoria("anular", "facturas", "Anuló " + f.numero + ": " + val("amotivo"));
        toast("Factura anulada.", "ok");
        if (onDone) onDone();
      }
    });
}

/* =====================================================================
 * Escaner de codigo de barras con la camara (carga diferida)
 * ===================================================================== */
let _scanner = null;
async function abrirEscaner(contId, onCodigo) {
  if (_scanner) { detenerScanner(); return; }
  const zona = document.getElementById(contId);
  zona.innerHTML = '<div id="reader" class="reader-box"></div><p class="hint" style="text-align:center">Apuntá la cámara al código de barras. <button type="button" class="btn btn-ghost btn-sm" id="scan-stop">Cerrar cámara</button></p>';
  document.getElementById("scan-stop").onclick = detenerScanner;
  try {
    await cargarLib("scanner");
    _scanner = new Html5Qrcode("reader");
    await _scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 140 } }, function (txt) { detenerScanner(); onCodigo(txt); }, function () {});
  } catch (e) { console.error(e); toast("No se pudo abrir la cámara.", "error"); detenerScanner(); }
}
/* Escaner que sigue leyendo (modo inventario / venta rapida). */
async function abrirEscanerContinuo(contId, onCodigo) {
  if (_scanner) { detenerScanner(); return; }
  const zona = document.getElementById(contId);
  zona.innerHTML = '<div id="reader" class="reader-box"></div><p class="hint" style="text-align:center">Cámara activa: pasá los productos de a uno. <button type="button" class="btn btn-ghost btn-sm" id="scan-stop">Cerrar cámara</button></p>';
  document.getElementById("scan-stop").onclick = detenerScanner;
  try {
    await cargarLib("scanner");
    _scanner = new Html5Qrcode("reader");
    await _scanner.start({ facingMode: "environment" }, { fps: 8, qrbox: { width: 260, height: 140 } }, function (txt) { onCodigo(txt); }, function () {});
  } catch (e) { console.error(e); toast("No se pudo abrir la cámara.", "error"); detenerScanner(); }
}
function detenerScanner() {
  if (_scanner) { const s = _scanner; _scanner = null; s.stop().then(function () { s.clear(); }).catch(function () {}); }
  const r = document.getElementById("reader"); if (r && r.parentElement) r.parentElement.innerHTML = "";
}
window._detenerScanner = detenerScanner;
// Apagar la camara siempre que se cierre cualquier modal (Esc, fondo o X).
document.addEventListener("keydown", function (e) { if (e.key === "Escape") detenerScanner(); });

/* =====================================================================
 * PRESUPUESTOS: PDF y conversion a factura
 * ===================================================================== */
async function obtenerPresupuesto(id) { const s = await db.collection("presupuestos").doc(id).get(); return s.exists ? Object.assign({ id: s.id }, s.data()) : null; }
async function pdfPresupuestoPorId(id) { const p = await obtenerPresupuesto(id); if (p) generarPDF(function () { return pdfPresupuesto(p); }); }
async function facturarPresupuesto(id) {
  const p = await obtenerPresupuesto(id); if (!p) return;
  if (p.estado === "facturado") { toast("Ya fue facturado (" + (p.numeroFactura || "") + ").", "info"); return; }
  // Precios actualizados de productos? Se respetan los del presupuesto.
  abrirFormFactura({ presupuestoId: id, propietarioId: p.propietarioId, mascotaId: p.mascotaId, notas: p.notas,
    items: (p.items || []).map(function (i) { return Object.assign({}, i, { iva: String(i.iva) }); }) });
}

/* =====================================================================
 * IMPRESION: A4 (PDF) o TICKET para impresora termica 58 / 80 mm
 * ===================================================================== */
/* formato: "a4" | "ticket80" | "ticket58" (por defecto el de Configuracion). */
async function imprimirComprobante(id, formato) {
  const f = await obtenerFactura(id); if (!f) return;
  let fmt = formato || cfg().formatoComprobante || "a4";
  if (esApp()) fmt = "a4";        // en el celular: PDF para compartir (la app no imprime tickets)
  if (fmt === "a4") return generarPDF(function () { return pdfFactura(f); });
  return imprimirTicket(f, fmt === "ticket58" ? 58 : 80);
}
/* Codigo de barras (SVG) del numero del comprobante: se escanea para devoluciones. */
async function _svgCodigo(texto, alto) {
  try {
    await cargarLib("barcode");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, texto, { format: "CODE128", height: alto || 34, width: 1.4, margin: 0, displayValue: false });
    return svg.outerHTML;
  } catch (e) { return ""; }
}
/* Impresion por equipo (programa de escritorio): directo a la impresora elegida, sin dialogo.
 * Se guarda en ESTE equipo (cada caja puede tener su propia impresora). */
const IMPRESION_KEY = "mascotita-impresion";
function impresionLocal() { try { return JSON.parse(localStorage.getItem(IMPRESION_KEY) || "{}") || {}; } catch (e) { return {}; } }
async function configurarImpresoraLocal() {
  if (!window.mascotitaEscritorio) { toast("La impresión directa está disponible en el programa de escritorio (Windows).", "info", 6000); return; }
  const lista = await window.mascotitaEscritorio.impresoras().catch(function () { return []; });
  const act = impresionLocal();
  modalForm("Impresora de tickets (este equipo)",
    '<p class="lead" style="margin:0 0 12px">Elegí la impresora térmica de esta caja. Con la impresión directa el ticket sale sin preguntar.</p>' +
    selectCampo("impn", "Impresora", lista.map(function (p) { return { value: p.nombre, texto: p.descripcion + (p.predeterminada ? " (predeterminada)" : "") }; }), act.impresora || "", { vacio: "La predeterminada de Windows" }) +
    checkCampo("impd", "Imprimir directo, sin el cuadro de impresión", act.directo !== false), {
      ancho: "modal-sm", textoGuardar: "Guardar", icono: "fa-print",
      pieExtra: '<button type="button" class="btn btn-ghost izq" id="imp-prueba"><i class="fa-solid fa-receipt"></i> Probar</button>',
      onGuardar: function () {
        try { localStorage.setItem(IMPRESION_KEY, JSON.stringify({ impresora: val("impn"), directo: chk("impd") })); } catch (e) {}
        toast("Impresora guardada para este equipo.", "ok");
      }
    }).q("#imp-prueba").onclick = function () {
      window.mascotitaEscritorio.imprimir('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + _cssTicket(80) + "</style></head><body><h1>" + escHTML(cfg().clinicaNombre || "Mascotita") + '</h1><p class="c">Prueba de impresión<br>' + fmtFecha(new Date()) + "</p><hr><p class=\"c\">Si ves este ticket, la impresora está lista.</p></body></html>", val("impn"))
        .then(function (r) { toast(r && r.ok ? "Ticket de prueba enviado." : "No se pudo imprimir: " + ((r && r.error) || "error"), r && r.ok ? "ok" : "error"); });
    };
}
function _imprimirHTML(html) {
  const loc = impresionLocal();
  if (window.mascotitaEscritorio && loc.directo !== false && (loc.impresora || loc.directo)) {
    window.mascotitaEscritorio.imprimir(html, loc.impresora).then(function (r) {
      if (!r || !r.ok) { toast("No se pudo imprimir directo (" + ((r && r.error) || "error") + "). Se abre el cuadro de impresión.", "warn"); _imprimirIframe(html); }
    }).catch(function () { _imprimirIframe(html); });
    return;
  }
  _imprimirIframe(html);
}
function _imprimirIframe(html) {
  if (esApp()) { toast("Desde el celular no se imprimen tickets: usá la PC de la caja o compartí el PDF.", "info", 6000); return; }
  const ifr = document.createElement("iframe");
  ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(ifr);
  ifr.contentDocument.open(); ifr.contentDocument.write(html); ifr.contentDocument.close();
  setTimeout(function () {
    ifr.contentWindow.focus(); ifr.contentWindow.print();
    // devolver el teclado (y el lector de codigos) a la pagina
    window.focus(); if (typeof window.focoScan === "function") window.focoScan();
    setTimeout(function () { ifr.remove(); if (typeof window.focoScan === "function") window.focoScan(); }, 1500);
  }, 300);
}
function _cssTicket(ancho) {
  const w = ancho === 58 ? 48 : 72;
  return '@page{size:' + ancho + 'mm auto;margin:3mm}*{margin:0;padding:0}body{width:' + w + 'mm;font:' + (ancho === 58 ? "10.5px" : "12px") + '/1.3 "Courier New",monospace;color:#000}' +
    'h1{font-size:1.25em;text-align:center}.c{text-align:center}.r{text-align:right}table{width:100%;border-collapse:collapse}td{vertical-align:top}hr{border:0;border-top:1px dashed #000;margin:4px 0}.t{font-size:1.3em;font-weight:bold}.s{font-size:.85em}svg{display:block;margin:4px auto 0;max-width:100%}';
}
function _cabeceraTicket(c, f) {
  const legal = !!(f.timbrado || c.timbrado);
  return "<h1>" + escHTML(c.clinicaNombre || "Mascotita") + "</h1>" +
    '<p class="c">' + escHTML([c.clinicaRuc && "RUC " + c.clinicaRuc, c.clinicaTelefono, c.clinicaDireccion].filter(Boolean).join(" · ")) + "</p>" +
    (legal ? '<p class="c">Timbrado ' + escHTML(f.timbrado || c.timbrado) + (f.timbradoVigencia || c.timbradoVigencia ? "<br>Vig. " + escHTML(f.timbradoVigencia || c.timbradoVigencia) : "") + "</p>" : "");
}
async function imprimirTicket(f, ancho) {
  const c = cfg(), legal = !!(f.timbrado || c.timbrado);
  const m = function (n) { return Math.round(Number(n) || 0).toLocaleString("es-PY"); };
  const filas = (f.items || []).map(function (i) {
    const tot = i.total != null ? i.total : i.cantidad * i.precio;
    return '<tr><td colspan="2">' + escHTML(i.concepto) + (i.presentacion ? " (" + escHTML(i.presentacion) + ")" : "") + (i.iva === 0 ? " (Ex)" : i.iva === 5 ? " (5%)" : "") + "</td></tr>" +
      "<tr><td>" + fmtNum(i.cantidad, 3) + " x " + m(i.precio) + (i.descuento ? " -" + fmtNum(i.descuento, 1) + "%" : "") + (i.oferta ? " OFERTA" : "") + '</td><td class="r">' + m(tot) + "</td></tr>";
  }).join("");
  const nItems = (f.items || []).reduce(function (a, i) { return a + (Number(i.cantidad) || 0); }, 0);
  const cod = await _svgCodigo(f.numero);
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escHTML(f.numero) + "</title><style>" + _cssTicket(ancho) + "</style></head><body>" +
    _cabeceraTicket(c, f) +
    "<hr><p><b>" + (legal ? "FACTURA " : "COMPROBANTE ") + escHTML(f.numero) + "</b><br>" + fmtFecha(f.fecha) + "<br>" + (f.condicion === "credito" ? "CRÉDITO" : "CONTADO") + "</p>" +
    "<p>Cliente: " + escHTML(f.cliente) + (f.clienteRuc ? "<br>RUC/CI: " + escHTML(f.clienteRuc) : "") + (f.mascota ? "<br>Paciente: " + escHTML(f.mascota) : "") + "</p><hr>" +
    "<table>" + filas + "</table><hr><table>" +
    '<tr><td class="s">Artículos: ' + fmtNum(nItems, 3) + "</td><td></td></tr>" +
    (f.exenta ? "<tr><td>Exentas</td><td class=\"r\">" + m(f.exenta) + "</td></tr>" : "") + (f.gravada5 ? "<tr><td>Grav. 5%</td><td class=\"r\">" + m(f.gravada5) + "</td></tr>" : "") +
    (f.gravada10 ? "<tr><td>Grav. 10%</td><td class=\"r\">" + m(f.gravada10) + "</td></tr>" : "") +
    '<tr><td class="t">TOTAL Gs</td><td class="r t">' + m(f.total) + "</td></tr>" +
    "<tr><td>IVA 5%</td><td class=\"r\">" + m(f.iva5) + "</td></tr><tr><td>IVA 10%</td><td class=\"r\">" + m(f.iva10 != null ? f.iva10 : f.iva) + "</td></tr></table><hr><table>" +
    (f.pagos || []).map(function (p) { return "<tr><td>" + escHTML(nombreMetodo(p.metodo)) + '</td><td class="r">' + m(p.monto) + "</td></tr>"; }).join("") +
    (f.recibido ? "<tr><td>Recibido</td><td class=\"r\">" + m(f.recibido) + "</td></tr><tr><td><b>Vuelto</b></td><td class=\"r\"><b>" + m(f.vuelto) + "</b></td></tr>" : "") +
    (saldoFactura(f) ? "<tr><td><b>SALDO</b></td><td class=\"r\"><b>" + m(saldoFactura(f)) + "</b></td></tr>" : "") + "</table>" +
    (Number(f.devuelto) ? '<p class="s">Devoluciones: ' + m(f.devuelto) + " (" + escHTML((f.notasCredito || []).join(", ")) + ")</p>" : "") +
    (f.items || []).filter(function (i) { return i.receta; }).map(function (i) { return '<p class="s">Receta ' + escHTML(i.concepto) + ": " + escHTML(i.receta) + "</p>"; }).join("") +
    '<hr><p class="c">' + escHTML(c.ticketPie || "¡Gracias por su compra!") + "</p>" + (!legal ? '<p class="c s">Comprobante interno, no válido como factura.</p>' : "") +
    '<p class="c s">Atendió: ' + escHTML(f.creadoPor || "") + "</p>" + cod + '<p class="c s">' + escHTML(f.numero) + "</p></body></html>";
  _imprimirHTML(html);
}

/* =====================================================================
 * AUTORIZACION DE SUPERVISOR
 * La cajera no se desloguea: un administrador escribe su usuario y clave
 * en una sesion aparte (segunda instancia de Firebase) solo para validar.
 * Devuelve {uid, nombre} o null si se cancela.
 * ===================================================================== */
function autorizarSupervisor(motivo) {
  const u = window.MASCOTITA.usuario;
  if (esAdmin()) return Promise.resolve({ uid: u.uid, nombre: u.nombre });
  return new Promise(function (resolve) {
    let ok = null;
    const m = modalForm("Autorización de supervisor",
      '<div class="alerta alerta-info"><i class="fa-solid fa-user-shield"></i> ' + escHTML(motivo) + "</div>" +
      campo("supu", "Usuario administrador", "", "text", { req: true, ph: "Ej: Admin" }) + campo("supp", "Contraseña", "", "password", { req: true }), {
        ancho: "modal-sm", textoGuardar: "Autorizar", icono: "fa-user-shield",
        alCerrar: function () { resolve(ok); },
        onGuardar: async function () {
          const app = firebase.apps.find(function (a) { return a.name === "supervisor"; }) || firebase.initializeApp(firebaseConfig, "supervisor");
          const a2 = app.auth();
          if (USAR_EMULADOR && !a2.__emu) { a2.useEmulator("http://127.0.0.1:9099", { disableWarnings: true }); a2.__emu = true; }
          try { await a2.setPersistence(firebase.auth.Auth.Persistence.NONE); } catch (e) {}
          const ent = val("supu");
          let cred;
          try { cred = await a2.signInWithEmailAndPassword((ent.indexOf("@") !== -1 ? ent : ent + "@" + DOMINIO_INTERNO).toLowerCase(), val("supp")); }
          catch (e) { throw errorUsuario("Usuario o contraseña incorrectos."); }
          const s = await db.collection("users").doc(cred.user.uid).get();
          a2.signOut().catch(function () {});
          const d = s.exists ? s.data() : {};
          if (d.role !== "admin" || d.active === false) throw errorUsuario("Ese usuario no es administrador.");
          ok = { uid: cred.user.uid, nombre: d.nombre || ent };
          registrarAuditoria("autorizar", "ventas", ok.nombre + " autorizó: " + motivo);
        }
      });
    setTimeout(function () { const i = m.el.querySelector("#f-supu"); if (i && !m.el.contains(document.activeElement)) i.focus(); }, 50);
  });
}

/* =====================================================================
 * CARGOS PENDIENTES DE LA CLINICA (consulta, cirugia, internacion)
 * -> items para cobrar desde el punto de venta o la factura.
 * ===================================================================== */
function itemsDeCargo(col, d) {
  const c = cfg(), ivaServ = Number(c.ivaServicios != null ? c.ivaServicios : 10), items = [];
  const servs = Datos.lista("servicios").filter(function (x) { return x.activo !== false; });
  if (col === "consultas") {
    const sc = servs.find(function (x) { return x.id === c.servicioConsultaId; }) ||
      servs.find(function (x) { return /consulta/i.test(x.nombre) && /general/i.test(x.nombre); }) ||
      servs.find(function (x) { return x.categoria === "Consulta" && x.precio > 0; }) || servs.find(function (x) { return /consulta/i.test(x.nombre); });
    items.push(sc ? { tipo: "servicio", refId: sc.id, concepto: sc.nombre + " · " + (d.mascota || d.paciente || ""), cantidad: 1, precio: Number(sc.precio) || 0, iva: Number(sc.iva != null ? sc.iva : ivaServ), descuento: 0 }
      : { tipo: "libre", concepto: "Consulta veterinaria · " + (d.mascota || d.paciente || ""), cantidad: 1, precio: 0, iva: ivaServ, descuento: 0 });
    (d.receta || []).filter(function (r) { return r.dispensar && r.productoId; }).forEach(function (r) {
      const p = Datos.porId("productos", r.productoId);
      if (p) items.push({ tipo: "producto", refId: p.id, concepto: p.nombre, cantidad: Number(r.cantidad) || 1, precio: Number(p.precioVenta) || 0, iva: Number(p.iva != null ? p.iva : 10), descuento: 0, costo: Number(p.precioCompra) || 0 });
    });
  } else if (col === "cirugias") {
    items.push({ tipo: "libre", concepto: "Cirugía: " + (d.tipo || "") + " · " + (d.mascota || d.paciente || ""), cantidad: 1, precio: Number(d.costo) || 0, iva: ivaServ, descuento: 0 });
  } else if (col === "internaciones") {
    const dias = d.diasCobrar || Math.max(1, Math.ceil(((aFecha(d.egreso) || new Date()) - aFecha(d.ingreso)) / 86400000));
    const sd = servs.find(function (x) { return /internaci/i.test(x.nombre); });
    items.push({ tipo: sd ? "servicio" : "libre", refId: sd ? sd.id : "", concepto: "Internación " + (d.mascota || "") + " (" + dias + " día" + (dias > 1 ? "s" : "") + ")", cantidad: dias, precio: Number(d.precioDia) || (sd ? Number(sd.precio) : 0), iva: Number(sd && sd.iva != null ? sd.iva : ivaServ), descuento: 0 });
  }
  return items;
}
/* Cargos por cobrar (de un cliente o de todos), mas nuevos primero. */
async function cargosPendientes(propietarioId) {
  const cols = ["consultas", "cirugias", "internaciones"];
  const res = await Promise.all(cols.map(function (col) {
    let q = db.collection(col).where("porCobrar", "==", true);
    return q.get().then(function (s) { return docsDe(s).filter(function (d) { return !d.eliminado && !d.facturaId && (!propietarioId || d.propietarioId === propietarioId); }).map(function (d) { return { col: col, d: d }; }); }).catch(function () { return []; });
  }));
  return [].concat.apply([], res).sort(function (a, b) { return (aFecha(b.d.fecha || b.d.egreso || b.d.ingreso) || 0) - (aFecha(a.d.fecha || a.d.egreso || a.d.ingreso) || 0); });
}
function nombreCargo(x) {
  const d = x.d;
  return (x.col === "consultas" ? "Consulta" : x.col === "cirugias" ? "Cirugía " + (d.tipo || "") : "Internación") + " · " + (d.mascota || d.paciente || "") + (d.dueno ? " (" + d.dueno + ")" : "");
}

/* =====================================================================
 * DEVOLUCIONES (NOTA DE CREDITO)
 * Devuelve parte o todo de una factura: repone stock (si corresponde),
 * baja el saldo si era a credito y devuelve dinero desde la caja.
 * ===================================================================== */
const MOTIVOS_DEVOLUCION = ["Cliente desistió de la compra", "Producto fallado / dañado", "Producto vencido", "Error al cobrar", "Cambio por otro producto", "Otro"];
function formatoNumeroNC(n) {
  const c = cfg();
  if (c.establecimiento && c.puntoExpedicion) return "NC " + String(c.establecimiento).padStart(3, "0") + "-" + String(c.puntoExpedicion).padStart(3, "0") + "-" + String(n).padStart(7, "0");
  return "NC-" + String(n).padStart(4, "0");
}
async function buscarFacturaPorNumero(texto) {
  const t = String(texto || "").trim(); if (!t) return null;
  const s = await db.collection("facturas").where("numero", "==", t).limit(1).get();
  if (!s.empty) return Object.assign({ id: s.docs[0].id }, s.docs[0].data());
  if (/^\d+$/.test(t)) {   // solo el numero: 12 -> FAC-0012 / 001-001-0000012
    const s2 = await db.collection("facturas").where("numeroInt", "==", Number(t)).limit(1).get();
    if (!s2.empty) return Object.assign({ id: s2.docs[0].id }, s2.docs[0].data());
  }
  return null;
}
async function abrirDevolucion(facturaId, onDone) {
  if (!puede("facturar")) { toast("No tenés permiso para devoluciones.", "warn"); return; }
  if (!facturaId) {
    const prev = window.alEscanearModal;
    const m = modalForm("Devolución · buscar comprobante",
      '<p class="lead" style="margin:0 0 10px">Escaneá el código del ticket o escribí el número del comprobante.</p>' + campo("dnum", "N° de comprobante", "", "text", { req: true, ph: "Ej: FAC-0012 o 12" }), {
        ancho: "modal-sm", textoGuardar: "Buscar", icono: "fa-magnifying-glass",
        alCerrar: function () { window.alEscanearModal = prev; },
        onGuardar: async function () {
          const f = await buscarFacturaPorNumero(val("dnum"));
          if (!f) throw errorUsuario("No se encontró el comprobante " + val("dnum") + ".");
          setTimeout(function () { abrirDevolucion(f.id, onDone); }, 0);
        }
      });
    window.alEscanearModal = function (c) { el("dnum").value = c; m.guardar(); };
    setTimeout(function () { el("dnum").focus(); }, 50);
    return;
  }
  const f = await obtenerFactura(facturaId);
  if (!f) return;
  if (f.estado === "anulada") { toast("Ese comprobante está anulado.", "warn"); return; }
  const dev = f.itemsDevueltos || {};
  const filas = (f.items || []).map(function (it, k) {
    const max = Math.round(((Number(it.cantidad) || 0) - (Number(dev[k]) || 0)) * 1000) / 1000;
    return { it: it, k: k, max: max };
  });
  if (!filas.some(function (x) { return x.max > 0; })) { toast("Todo lo de " + f.numero + " ya fue devuelto.", "info"); return; }
  const metPago = (f.pagos && f.pagos[0] && f.pagos[0].metodo) || "efectivo";
  const ov = modalForm("Devolución de " + f.numero,
    '<div class="chips"><div class="chip-resumen"><small>Cliente</small><b>' + escHTML(f.cliente) + '</b></div><div class="chip-resumen"><small>Fecha</small><b>' + fmtFecha(f.fecha) +
    '</b></div><div class="chip-resumen"><small>Total</small><b>' + fmtMoneda(f.total) + "</b></div>" + (Number(f.devuelto) ? '<div class="chip-resumen"><small>Ya devuelto</small><b>' + fmtMoneda(f.devuelto) + "</b></div>" : "") + "</div>" +
    '<div class="table-wrap"><table class="tabla"><thead><tr><th>Ítem</th><th class="num">Vendido</th><th class="num">A devolver</th><th>Vuelve al stock</th><th class="num">Importe</th></tr></thead><tbody>' +
    filas.map(function (x) {
      return "<tr><td><b>" + escHTML(x.it.concepto) + "</b>" + (x.it.presentacion ? "<br><small>" + escHTML(x.it.presentacion) + "</small>" : "") + '</td><td class="num">' + fmtNum(x.it.cantidad, 3) + (dev[x.k] ? "<br><small>dev. " + fmtNum(dev[x.k], 3) + "</small>" : "") + "</td>" +
        '<td class="num"><input type="number" class="input d-cant" data-k="' + x.k + '" min="0" max="' + x.max + '" step="any" value="0" style="width:90px"' + (x.max <= 0 ? " disabled" : "") + "></td>" +
        "<td>" + (x.it.tipo === "producto" && x.it.refId ? '<label class="check"><input type="checkbox" class="d-stock" data-k="' + x.k + '" checked> Sí</label>' : '<span class="muted">—</span>') + "</td>" +
        '<td class="num d-imp" data-k="' + x.k + '">Gs 0</td></tr>';
    }).join("") + "</tbody></table></div>" +
    '<div class="fila-flex mt"><button type="button" class="btn btn-ghost btn-sm" id="d-todo"><i class="fa-solid fa-check-double"></i> Devolver todo</button></div>' +
    '<div class="grid-2 mt">' + selectCampo("dmot", "Motivo", MOTIVOS_DEVOLUCION, MOTIVOS_DEVOLUCION[0]) + campo("ddet", "Detalle", "", "text", { ph: "Opcional" }) +
    selectCampo("dmet", "Devolver dinero por", METODOS_PAGO, metPago) + '<div class="form-field"><label>Total a devolver</label><input id="f-dtot" readonly class="t-grande"></div></div>' +
    '<div id="d-info"></div>', {
      ancho: "modal-lg", textoGuardar: "Registrar devolución", icono: "fa-rotate-left",
      onGuardar: async function () {
        requiereConexion("Registrar una devolución");
        const sel = leer();
        if (!sel.lineas.length) throw errorUsuario("Indicá qué cantidad se devuelve.");
        const caja = await Caja.obtener();
        const saldo = saldoFactura(f);
        const reembolso = Math.max(0, sel.total - Math.min(saldo, sel.total));
        if (reembolso > 0 && !caja) throw errorUsuario("Abrí la caja para devolver el dinero.");
        let aut = null;
        if (!esAdmin() && !cfg().devolucionSinSupervisor) { aut = await autorizarSupervisor("Devolución de " + fmtMoneda(sel.total) + " de " + f.numero); if (!aut) return false; }
        const u = window.MASCOTITA.usuario;
        const ncRef = db.collection("notas_credito").doc();
        let numero = "";
        await db.runTransaction(async function (tx) {
          const fref = db.collection("facturas").doc(f.id);
          const ctrRef = db.collection("config").doc("contadores");
          const fs = await tx.get(fref), ctr = await tx.get(ctrRef);
          const prods = sel.lineas.filter(function (l) { return l.stock; });
          const inv = await Inventario.leer(tx, prods.map(function (l) { return l.it.refId; }));
          if (reembolso > 0) { const cs = await tx.get(db.collection("cajas").doc(caja.id)); if (!cs.exists || cs.data().estado !== "abierta") throw errorUsuario("La caja se cerró."); }
          const fx = fs.data();
          if (fx.estado === "anulada") throw errorUsuario("El comprobante fue anulado.");
          const ya = Object.assign({}, fx.itemsDevueltos || {});
          sel.lineas.forEach(function (l) {
            const disp = (Number(fx.items[l.k].cantidad) || 0) - (Number(ya[l.k]) || 0);
            if (l.cant > disp + 1e-9) throw errorUsuario("Ya se devolvió parte de \"" + l.it.concepto + "\". Volvé a abrir la devolución.");
            ya[l.k] = Math.round(((Number(ya[l.k]) || 0) + l.cant) * 1000) / 1000;
          });
          const n = (ctr.exists ? Number(ctr.data().notaCredito) || 0 : 0) + 1;
          numero = formatoNumeroNC(n);
          const sx = saldoFactura(fx), aCuenta = Math.min(sx, sel.total), reint = sel.total - aCuenta;
          Inventario.mover(tx, inv, prods.filter(function (l) { return inv[l.it.refId]; }).map(function (l) { return { productoId: l.it.refId, delta: l.cant * (Number(l.it.factor) || 1), motivo: "Devolución " + numero + " (" + fx.numero + ")" }; }),
            { origen: "devolucion", refId: ncRef.id, permitirNegativo: true });
          const t = calcularTotalesFactura(sel.lineas.map(function (l) { return { cantidad: 1, precio: l.importe, iva: l.it.iva, descuento: 0 }; }));
          tx.set(ncRef, Object.assign({
            numero: numero, numeroInt: n, fecha: FS.serverTimestamp(), facturaId: f.id, facturaNumero: fx.numero, cliente: fx.cliente, clienteRuc: fx.clienteRuc || "", propietarioId: fx.propietarioId || "",
            items: sel.lineas.map(function (l) { return { indice: l.k, tipo: l.it.tipo, refId: l.it.refId || "", concepto: l.it.concepto, cantidad: l.cant, precio: l.precioUnit, iva: Number(l.it.iva), total: l.importe, alStock: !!l.stock, factor: Number(l.it.factor) || 1 }; }),
            motivo: val("dmot"), detalle: val("ddet"), aCuenta: aCuenta, reintegro: reint, metodo: reint > 0 ? val("dmet") : "", cajaId: reint > 0 ? caja.id : "",
            usuario: u.nombre, usuarioUid: u.uid, autorizadoPor: aut ? aut.nombre : "", timbrado: cfg().timbrado || ""
          }, t, { total: sel.total }));
          const devuelto = (Number(fx.devuelto) || 0) + sel.total;
          const nuevoSaldo = Math.max(0, sx - aCuenta);
          const up = { itemsDevueltos: ya, devuelto: devuelto, saldo: nuevoSaldo, notasCredito: (fx.notasCredito || []).concat([numero]) };
          if (fx.estado !== "pagada" && nuevoSaldo === 0) up.estado = "pagada";
          if (devuelto >= Number(fx.total)) up.devueltaTotal = true;
          tx.update(fref, up);
          if (reint > 0) _movCajaTx(tx, caja, { tipo: "egreso", monto: reint, metodo: val("dmet"), concepto: "Devolución " + numero + " (" + fx.numero + ") · " + fx.cliente, facturaId: f.id });
          tx.set(ctrRef, { notaCredito: n }, { merge: true });
        });
        registrarAuditoria("crear", "notas_credito", "Devolución " + numero + " de " + f.numero + " por " + fmtMoneda(sel.total) + (aut && aut.uid !== u.uid ? " (autorizó " + aut.nombre + ")" : ""));
        toast("Devolución " + numero + " registrada" + (reembolso > 0 ? ": entregá " + fmtMoneda(reembolso) + " al cliente." : "."), "ok", 10000, { texto: "Imprimir", fn: function () { imprimirNotaCredito(ncRef.id); } });
        if (cfg().imprimirAlEmitir) imprimirNotaCredito(ncRef.id);
        if (onDone) onDone(ncRef.id);
      }
    });
  function leer() {
    const lineas = [];
    ov.el.querySelectorAll(".d-cant").forEach(function (inp) {
      const k = Number(inp.dataset.k), x = filas[k];
      let cant = Math.max(0, Math.min(x.max, Number(String(inp.value).replace(",", ".")) || 0));
      const it = x.it, base = Number(it.total != null ? it.total : it.cantidad * it.precio) || 0;
      const precioUnit = it.cantidad ? base / it.cantidad : 0;          // incluye descuentos de la venta
      const importe = Math.round(precioUnit * cant);
      const td = ov.el.querySelector('.d-imp[data-k="' + k + '"]'); if (td) td.textContent = fmtMoneda(importe);
      const st = ov.el.querySelector('.d-stock[data-k="' + k + '"]');
      if (cant > 0) lineas.push({ k: k, it: it, cant: cant, precioUnit: Math.round(precioUnit), importe: importe, stock: st ? st.checked : false });
    });
    const total = lineas.reduce(function (a, l) { return a + l.importe; }, 0);
    el("dtot").value = fmtMoneda(total);
    const saldo = saldoFactura(f), aCuenta = Math.min(saldo, total);
    document.getElementById("d-info").innerHTML = total ? '<div class="alerta alerta-info">' + (aCuenta ? "Baja el saldo de la cuenta en " + fmtMoneda(aCuenta) + ". " : "") +
      (total - aCuenta > 0 ? "Se devuelve <b>" + fmtMoneda(total - aCuenta) + "</b> desde la caja." : "") + (!esAdmin() && !cfg().devolucionSinSupervisor ? " Requiere autorización de un administrador." : "") + "</div>" : "";
    return { lineas: lineas, total: total };
  }
  ov.el.querySelectorAll(".d-cant").forEach(function (i) { i.oninput = leer; });
  el("dmot").onchange = function () { const v = val("dmot"); ov.el.querySelectorAll(".d-stock").forEach(function (c) { c.checked = !/vencido|fallado/i.test(v); }); };
  ov.q("#d-todo").onclick = function () { ov.el.querySelectorAll(".d-cant").forEach(function (i) { if (!i.disabled) i.value = i.max; }); leer(); };
  leer();
  return ov;
}
async function imprimirNotaCredito(id) {
  const s = await db.collection("notas_credito").doc(id).get(); if (!s.exists) return;
  const n = s.data(), c = cfg(), ancho = c.formatoComprobante === "ticket58" ? 58 : 80;
  const m = function (x) { return Math.round(Number(x) || 0).toLocaleString("es-PY"); };
  _imprimirHTML('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escHTML(n.numero) + "</title><style>" + _cssTicket(ancho) + "</style></head><body>" + _cabeceraTicket(c, n) +
    "<hr><p><b>NOTA DE CRÉDITO " + escHTML(n.numero) + "</b><br>" + fmtFecha(n.fecha) + "<br>Comprobante: " + escHTML(n.facturaNumero) + "</p><p>Cliente: " + escHTML(n.cliente) + (n.clienteRuc ? "<br>RUC/CI: " + escHTML(n.clienteRuc) : "") + "</p><hr><table>" +
    (n.items || []).map(function (i) { return '<tr><td colspan="2">' + escHTML(i.concepto) + "</td></tr><tr><td>" + fmtNum(i.cantidad, 3) + " x " + m(i.precio) + '</td><td class="r">' + m(i.total) + "</td></tr>"; }).join("") +
    '</table><hr><table><tr><td class="t">TOTAL Gs</td><td class="r t">' + m(n.total) + "</td></tr>" +
    (n.aCuenta ? "<tr><td>A cuenta corriente</td><td class=\"r\">" + m(n.aCuenta) + "</td></tr>" : "") + (n.reintegro ? "<tr><td>Devuelto (" + escHTML(nombreMetodo(n.metodo)) + ')</td><td class="r">' + m(n.reintegro) + "</td></tr>" : "") +
    "</table><hr><p>Motivo: " + escHTML(n.motivo) + (n.detalle ? " · " + escHTML(n.detalle) : "") + '</p><p class="c s">Atendió: ' + escHTML(n.usuario) + (n.autorizadoPor ? " · Autorizó: " + escHTML(n.autorizadoPor) : "") + "</p>" +
    '<br><p class="c">______________________<br>Firma del cliente</p></body></html>');
}
window.abrirDevolucion = abrirDevolucion;
