/* =====================================================================
 * facturas.js — Facturacion
 *  Pestanas: Comprobantes | Pendientes de cobro (consultas y cirugias
 *  que cargo el veterinario) | Cuentas por cobrar (saldos por cliente)
 *  | Presupuestos | Devoluciones (notas de credito)
 * ===================================================================== */
let _facs = [], _facUnsub = null, _tabFac = "comprobantes", _pend = { consultas: [], cirugias: [], internaciones: [] }, _deud = [], _pres = [], _ncs = [];

async function initFacturas() {
  await protegerPagina({ permiso: "facturar", pagina: "facturas.html" });
  await cargarConfig();
  _tabFac = paramURL("tab") || "comprobantes";
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-file-invoice-dollar"></i> Comprobantes</h1><div class="head-actions">' +
    (esAdmin() ? '<button class="btn btn-ghost" id="f-exp"><i class="fa-solid fa-file-excel"></i> Exportar</button>' : "") +
    '<button class="btn btn-ghost" id="f-pres"><i class="fa-solid fa-file-signature"></i> Presupuesto</button>' +
    '<button class="btn btn-ghost" id="f-dev"><i class="fa-solid fa-rotate-left"></i> Devolución</button>' +
    '<button class="btn btn-primary" id="f-nueva"><i class="fa-solid fa-plus"></i> Nueva factura</button></div></div>' +
    '<div id="f-caja"></div>' +
    '<div class="tabs" id="f-tabs"></div><div id="f-cuerpo">' + skeleton(8) + "</div>";
  document.getElementById("f-nueva").onclick = function () { abrirFormFactura({}); };
  document.getElementById("f-dev").onclick = function () { abrirDevolucion(null, function () { _tabFac = "devoluciones"; pintarFac(); }); };
  db.collection("notas_credito").orderBy("fecha", "desc").limit(300).onSnapshot(function (s) { _ncs = docsDe(s); if (_tabFac === "devoluciones") pintarFac(); }, function (e) { console.warn(e); });
  document.getElementById("f-pres").onclick = function () { abrirFormFactura({ presupuesto: true, onGuardado: function () { _tabFac = "presupuestos"; pintarFac(); } }); };
  db.collection("internaciones").where("porCobrar", "==", true).onSnapshot(function (s) { _pend.internaciones = docsDe(s).filter(function (x) { return !x.eliminado; }); pintarFac(); }, function () {});
  db.collection("presupuestos").orderBy("fecha", "desc").limit(300).onSnapshot(function (s) { _pres = docsDe(s); pintarFac(); }, function (e) { console.warn(e); });
  const be = document.getElementById("f-exp"); if (be) be.onclick = exportarFacturas;
  Caja.escuchar(function (c) {
    document.getElementById("f-caja").innerHTML = c ? "" : '<div class="alerta alerta-warn"><i class="fa-solid fa-cash-register"></i> La caja está cerrada: podés emitir a crédito, pero para cobrar hay que abrirla.' +
      (puede("caja") ? ' <a class="btn btn-sm btn-primary" href="caja.html">Ir a caja</a>' : "") + "</div>";
  });
  db.collection("consultas").where("porCobrar", "==", true).onSnapshot(function (s) { _pend.consultas = docsDe(s).filter(function (x) { return !x.eliminado; }); pintarFac(); }, function () {});
  db.collection("cirugias").where("porCobrar", "==", true).onSnapshot(function (s) { _pend.cirugias = docsDe(s).filter(function (x) { return !x.eliminado; }); pintarFac(); }, function () {});
  db.collection("facturas").where("saldo", ">", 0).onSnapshot(function (s) { _deud = docsDe(s).filter(function (f) { return f.estado !== "anulada"; }); pintarFac(); }, function () {});
  if (paramURL("nueva")) abrirFormFactura({ consultaId: paramURL("consulta"), cirugiaId: paramURL("cirugia") });
  pintarFac();
  escucharFacturas();
}

function escucharFacturas() {
  if (_facUnsub) _facUnsub();
  const r = (document.getElementById("f-rango") || {}).value || (paramQ() ? "todo" : "mes");
  const hoy = new Date();
  const desde = r === "hoy" ? inicioDelDia() : r === "mes" ? new Date(hoy.getFullYear(), hoy.getMonth(), 1) : r === "mesant" ? new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1) : r === "anio" ? new Date(hoy.getFullYear(), 0, 1) : new Date(2000, 0, 1);
  const hasta = r === "mesant" ? new Date(hoy.getFullYear(), hoy.getMonth(), 1) : sumarDias(hoy, 1);
  _facUnsub = db.collection("facturas").where("fecha", ">=", TS.fromDate(desde)).where("fecha", "<", TS.fromDate(hasta)).orderBy("fecha", "desc").limit(r === "todo" ? 1000 : 2000)
    .onSnapshot(function (s) { _facs = docsDe(s); pintarFac(); }, function (e) { toast(mensajeError(e), "error"); });
}
function pintarFac() {
  const nPend = _pend.consultas.length + _pend.cirugias.length + _pend.internaciones.length;
  const nPres = _pres.filter(function (p) { return p.estado === "pendiente" || p.estado === "aceptado"; }).length;
  const clientes = {}; _deud.forEach(function (f) { const k = f.propietarioId || f.cliente; clientes[k] = 1; });
  document.getElementById("f-tabs").innerHTML =
    [["comprobantes", "Comprobantes", "fa-receipt", ""], ["pendientes", "Pendientes de cobro", "fa-hourglass-half", nPend], ["deudores", "Cuentas por cobrar", "fa-scale-unbalanced", Object.keys(clientes).length], ["presupuestos", "Presupuestos", "fa-file-signature", nPres], ["devoluciones", "Devoluciones", "fa-rotate-left", ""]]
      .map(function (t) { return '<button class="tab' + (_tabFac === t[0] ? " activo" : "") + '" data-t="' + t[0] + '"><i class="fa-solid ' + t[2] + '"></i> ' + t[1] + (t[3] !== "" ? ' <span class="cnt">' + t[3] + "</span>" : "") + "</button>"; }).join("");
  document.querySelectorAll("#f-tabs .tab").forEach(function (b) { b.onclick = function () { _tabFac = b.dataset.t; pintarFac(); }; });
  const cont = document.getElementById("f-cuerpo");
  if (_tabFac === "pendientes") return pintarPendientes(cont);
  if (_tabFac === "deudores") return pintarDeudores(cont);
  if (_tabFac === "presupuestos") return pintarPresupuestos(cont);
  if (_tabFac === "devoluciones") return pintarDevoluciones(cont);
  if (!document.getElementById("f-rango")) {
    cont.innerHTML = '<div class="filtros card"><input type="search" id="f-buscar" placeholder="Número, cliente, RUC o paciente...">' +
      '<select id="f-rango"><option value="hoy">Hoy</option><option value="mes">Este mes</option><option value="mesant">Mes anterior</option><option value="anio">Este año</option><option value="todo">Todo</option></select>' +
      '<select id="f-estado"><option value="">Todos los estados</option><option>pagada</option><option>parcial</option><option>pendiente</option><option>anulada</option></select></div>' +
      '<div class="chips" id="f-resumen"></div><div id="f-tabla"></div>';
    document.getElementById("f-buscar").value = paramQ();
    document.getElementById("f-rango").value = paramQ() ? "todo" : "mes";
    document.getElementById("f-buscar").oninput = debounce(pintarFac, 150);
    document.getElementById("f-rango").onchange = escucharFacturas;
    document.getElementById("f-estado").onchange = pintarFac;
  }
  const l = filtrarFacturas();
  const val = _facs.filter(function (f) { return f.estado !== "anulada"; });
  const emitido = val.reduce(function (a, f) { return a + (f.total || 0); }, 0);
  const cobrado = val.reduce(function (a, f) { return a + (f.pagado != null ? f.pagado : (f.estado === "pagada" ? f.total : 0)); }, 0);
  document.getElementById("f-resumen").innerHTML = '<div class="chip-resumen"><small>Emitido (' + val.length + ')</small><b>' + fmtMoneda(emitido) + '</b></div><div class="chip-resumen"><small>Cobrado</small><b class="texto-ok">' + fmtMoneda(cobrado) +
    '</b></div><div class="chip-resumen"><small>Saldo del período</small><b class="texto-warn">' + fmtMoneda(emitido - cobrado) + "</b></div>";
  tabla("f-tabla", {
    filas: l, orden: "fecha", dir: -1, vacio: "Sin comprobantes en este período", vacioIcono: "fa-receipt",
    claseFila: function (f) { return f.estado === "anulada" ? "fila-anulada" : ""; }, alClic: verFactura,
    columnas: [
      { k: "numero", t: "Número", v: function (f) { return f.numeroInt || f.numero; }, r: function (f) { return "<b>" + escHTML(f.numero) + "</b>"; } },
      { k: "fecha", t: "Fecha", r: function (f) { return fmtFecha(f.fecha); }, v: function (f) { return aFecha(f.fecha); } },
      { k: "cliente", t: "Cliente", r: function (f) { return escHTML(f.cliente) + (f.mascota ? "<br><small>" + escHTML(f.mascota) + "</small>" : ""); } },
      { k: "total", t: "Total", cls: "num", r: function (f) { return fmtMoneda(f.total); } },
      { k: "saldo", t: "Saldo", cls: "num", v: saldoFactura, r: function (f) { const s = saldoFactura(f); return s ? '<b class="texto-danger">' + fmtMoneda(s) + "</b>" : "—"; } },
      { k: "estado", t: "Estado", r: function (f) { return pill(f.estado, f.estado) + (f.condicion === "credito" ? " " + pill("crédito", "credito") : ""); } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (f) {
        return btnIcono("fa-file-pdf", "PDF", "pdfFacturaPorId('" + f.id + "')") +
          (saldoFactura(f) > 0 ? btnIcono("fa-hand-holding-dollar", "Registrar pago", "abrirCobro('" + f.id + "')") : "") +
          (f.clienteTelefono ? btnIcono("fa-brands fa-whatsapp", "Enviar por WhatsApp", "waFactura('" + f.id + "')", "wa") : "") +
          (f.estado !== "anulada" && !f.devueltaTotal ? btnIcono("fa-rotate-left", "Devolución", "abrirDevolucion('" + f.id + "')") : "") +
          (esAdmin() && f.estado !== "anulada" && !Number(f.devuelto) ? btnIcono("fa-ban", "Anular", "anularFactura('" + f.id + "')", "danger") : "");
      } }
    ]
  });
}
function filtrarFacturas() {
  const q = (document.getElementById("f-buscar") || {}).value || "", e = (document.getElementById("f-estado") || {}).value || "";
  return _facs.filter(function (f) { return (!e || f.estado === e) && coincide([f.numero, f.cliente, f.clienteRuc, f.mascota].join(" "), q); });
}
function verFactura(f) {
  const m = abrirModal({
    tituloHTML: escHTML(f.numero) + " " + pill(f.estado, f.estado), ancho: "modal-lg",
    cuerpo: '<div class="ficha-datos" style="margin-top:0"><div><small>Fecha</small>' + fmtFecha(f.fecha) + "</div><div><small>Cliente</small>" + escHTML(f.cliente) + "</div><div><small>RUC / CI</small>" + escHTML(f.clienteRuc || "—") +
      "</div><div><small>Condición</small>" + (f.condicion === "credito" ? "Crédito" : "Contado") + "</div>" + (f.mascota ? "<div><small>Paciente</small>" + escHTML(f.mascota) + "</div>" : "") + "<div><small>Emitida por</small>" + escHTML(f.creadoPor || "") + "</div></div>" +
      '<div class="table-wrap mt"><table class="tabla"><thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th>IVA</th><th class="num">Total</th></tr></thead><tbody>' +
      (f.items || []).map(function (i) { return "<tr><td>" + escHTML(i.concepto) + (i.descuento ? " <small>(-" + i.descuento + "%)</small>" : "") + '</td><td class="num">' + fmtNum(i.cantidad) + '</td><td class="num">' + fmtMoneda(i.precio) + "</td><td>" + (i.iva === 0 ? "Exenta" : (i.iva || 10) + "%") + '</td><td class="num">' + fmtMoneda(i.total != null ? i.total : i.cantidad * i.precio) + "</td></tr>"; }).join("") +
      '</tbody></table></div><div class="totales"><div><span>IVA 10%</span><span>' + fmtMoneda(f.iva10 != null ? f.iva10 : f.iva) + "</span></div>" + (f.iva5 ? "<div><span>IVA 5%</span><span>" + fmtMoneda(f.iva5) + "</span></div>" : "") +
      '<div class="total"><span>Total</span><span>' + fmtMoneda(f.total) + "</span></div><div><span>Pagado</span><span>" + fmtMoneda(f.pagado || 0) + "</span></div><div><span>Saldo</span><span>" + fmtMoneda(saldoFactura(f)) + "</span></div></div>" +
      ((f.pagos || []).length ? '<div class="seccion-form mt">Pagos</div><ul class="lista">' + f.pagos.map(function (p) { return "<li><div class=\"info\">" + fmtFecha(p.fecha) + " · " + escHTML(nombreMetodo(p.metodo)) + "<small>" + escHTML(p.usuario || "") + '</small></div><b>' + fmtMoneda(p.monto) + "</b></li>"; }).join("") + "</ul>" : "") +
      (Number(f.devuelto) ? '<div class="alerta alerta-warn mt"><i class="fa-solid fa-rotate-left"></i> Devoluciones por ' + fmtMoneda(f.devuelto) + ": " + escHTML((f.notasCredito || []).join(", ")) + "</div>" : "") +
      ((f.autorizaciones || []).length ? '<p class="hint mt"><i class="fa-solid fa-user-shield"></i> ' + escHTML(f.autorizaciones.map(function (a) { return a.motivo + " (autorizó " + a.por + ")"; }).join(" · ")) + "</p>" : "") +
      (f.estado === "anulada" ? '<div class="alerta alerta-danger mt"><i class="fa-solid fa-ban"></i> Anulada por ' + escHTML(f.anuladaPor || "") + ": " + escHTML(f.motivoAnulacion || "") + "</div>" : "") +
      (f.notas ? '<p class="muted mt">' + escHTML(f.notas) + "</p>" : ""),
    pie: (f.estado !== "anulada" && !f.devueltaTotal ? '<button class="btn btn-ghost izq" id="vf-dev"><i class="fa-solid fa-rotate-left"></i> Devolución</button>' : "") + '<button class="btn btn-ghost" id="vf-ticket"><i class="fa-solid fa-receipt"></i> Ticket</button><button class="btn btn-ghost" id="vf-pdf"><i class="fa-solid fa-file-pdf"></i> PDF</button>' + (saldoFactura(f) > 0 ? '<button class="btn btn-primary" id="vf-cobrar"><i class="fa-solid fa-hand-holding-dollar"></i> Registrar pago</button>' : "")
  });
  m.q("#vf-pdf").onclick = function () { generarPDF(function () { return pdfFactura(f); }); };
  m.q("#vf-ticket").onclick = function () { imprimirTicket(f, (cfg().formatoTicketPOS || cfg().formatoComprobante) === "ticket58" ? 58 : 80); };
  const dv = m.q("#vf-dev"); if (dv) dv.onclick = function () { m.cerrar(); abrirDevolucion(f.id); };
  const c = m.q("#vf-cobrar"); if (c) c.onclick = function () { m.cerrar(); abrirCobro(f.id); };
}
function pintarDevoluciones(cont) {
  tabla(cont, {
    filas: _ncs, orden: "fecha", dir: -1, vacio: "Sin devoluciones registradas.", vacioIcono: "fa-rotate-left",
    columnas: [
      { k: "fecha", t: "Fecha", r: function (n) { return '<span class="nowrap">' + fmtFecha(n.fecha) + "</span>"; }, v: function (n) { return aFecha(n.fecha); } },
      { k: "numero", t: "N°", r: function (n) { return "<b>" + escHTML(n.numero) + "</b><br><small>de " + escHTML(n.facturaNumero) + "</small>"; } },
      { k: "cliente", t: "Cliente" },
      { k: "items", t: "Productos", r: function (n) { return escHTML((n.items || []).map(function (i) { return fmtNum(i.cantidad, 3) + " × " + i.concepto; }).join(", ")); } },
      { k: "motivo", t: "Motivo", r: function (n) { return escHTML(n.motivo || "") + (n.detalle ? "<br><small>" + escHTML(n.detalle) + "</small>" : ""); } },
      { k: "total", t: "Total", cls: "num", r: function (n) { return "<b>" + fmtMoneda(n.total) + "</b><br><small>" + (n.reintegro ? "devuelto " + escHTML(nombreMetodo(n.metodo)) : "a cuenta") + "</small>"; }, v: function (n) { return Number(n.total) || 0; } },
      { k: "usuario", t: "Registró", r: function (n) { return escHTML(n.usuario || "") + (n.autorizadoPor ? "<br><small>autorizó " + escHTML(n.autorizadoPor) + "</small>" : ""); } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (n) { return btnIcono("fa-print", "Imprimir", "imprimirNotaCredito('" + n.id + "')"); } }
    ]
  });
}
function waFactura(id) {
  const f = _facs.concat(_deud).find(function (x) { return x.id === id; }); if (!f) return;
  const saldo = saldoFactura(f);
  waPlantilla(saldo ? "saldo" : "factura", f.clienteTelefono, { nombre: String(f.cliente).split(" ")[0], numero: f.numero, monto: fmtMoneda(saldo || f.total), mascota: f.mascota || "" });
}
function pintarPendientes(cont) {
  const l = _pend.consultas.map(function (c) { return { tipo: "Consulta", id: c.id, fecha: c.fecha, mascota: c.mascota, dueno: c.dueno, detalle: c.motivo, vet: c.veterinario, monto: null, col: "consultas" }; })
    .concat(_pend.cirugias.map(function (c) { return { tipo: "Cirugía", id: c.id, fecha: c.fecha, mascota: c.paciente, dueno: c.dueno, detalle: c.tipo, vet: c.veterinario, monto: c.costo, col: "cirugias" }; }))
    .concat(_pend.internaciones.map(function (c) { const d = c.diasCobrar || 1; return { tipo: "Internación", id: c.id, fecha: c.egreso || c.ingreso, mascota: c.mascota, dueno: c.dueno, detalle: d + " día(s) · " + (c.motivo || ""), vet: c.veterinario, monto: d * (c.precioDia || 0), col: "internaciones" }; }));
  tabla(cont, {
    filas: l, orden: "fecha", dir: -1, vacio: "No hay atenciones pendientes de cobro.", vacioIcono: "fa-circle-check",
    columnas: [
      { k: "fecha", t: "Fecha", r: function (x) { return fmtFecha(x.fecha); }, v: function (x) { return aFecha(x.fecha); } },
      { k: "tipo", t: "Tipo", r: function (x) { return pill(x.tipo, x.tipo === "Cirugía" ? "danger" : x.tipo === "Internación" ? "warn" : "info"); } },
      { k: "mascota", t: "Paciente", r: function (x) { return "<b>" + escHTML(x.mascota) + "</b><br><small>" + escHTML(x.dueno || "") + "</small>"; } },
      { k: "detalle", t: "Detalle" }, { k: "vet", t: "Atendió" },
      { k: "monto", t: "Monto", cls: "num", r: function (x) { return x.monto ? fmtMoneda(x.monto) : "—"; } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (x) {
        return '<button class="btn btn-primary btn-sm" onclick="abrirFormFactura({' + ({ consultas: "consultaId", cirugias: "cirugiaId", internaciones: "internacionId" })[x.col] + ":'" + x.id + "'})\">Cobrar</button> " +
          btnIcono("fa-ban", "Marcar sin cargo", "sinCargo('" + x.col + "','" + x.id + "')");
      } }
    ]
  });
}
async function sinCargo(col, id) {
  if (!(await confirmar("¿Marcar como atención sin cargo? Sale de la lista de pendientes.", { peligro: false }))) return;
  await escribir(db.collection(col).doc(id).update({ porCobrar: false, facturaId: "" }));
  registrarAuditoria("editar", col, "Marcó atención sin cargo " + id);
}
function pintarDeudores(cont) {
  const g = {};
  _deud.forEach(function (f) {
    const k = f.propietarioId || "cf:" + f.cliente;
    g[k] = g[k] || { id: f.propietarioId, cliente: f.cliente, tel: f.clienteTelefono, saldo: 0, n: 0, antigua: null };
    g[k].saldo += saldoFactura(f); g[k].n++;
    const d = aFecha(f.fecha); if (!g[k].antigua || d < g[k].antigua) g[k].antigua = d;
  });
  const l = Object.keys(g).map(function (k) { return g[k]; });
  const total = l.reduce(function (a, x) { return a + x.saldo; }, 0);
  tabla(cont, {
    filas: l, orden: "saldo", dir: -1, vacio: "No hay cuentas pendientes.", vacioIcono: "fa-circle-check",
    pie: '<div class="totales"><div class="total"><span>Total por cobrar</span><span>' + fmtMoneda(total) + "</span></div></div>",
    columnas: [
      { k: "cliente", t: "Cliente", r: function (x) { return x.id ? '<a class="link" href="pacientes.html?dueno=' + x.id + '">' + escHTML(x.cliente) + "</a>" : escHTML(x.cliente); } },
      { k: "n", t: "Comprobantes", cls: "num" },
      { k: "antigua", t: "Deuda más antigua", r: function (x) { const d = diasEntre(x.antigua, new Date()); return fmtFechaCorta(x.antigua) + " " + pill(d + " días", d > 30 ? "danger" : "warn"); }, v: function (x) { return x.antigua; } },
      { k: "saldo", t: "Saldo", cls: "num", r: function (x) { return "<b>" + fmtMoneda(x.saldo) + "</b>"; } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (x) { return x.tel ? btnIcono("fa-brands fa-whatsapp", "Recordar saldo", "waSaldo('" + escHTML(x.id || "") + "','" + x.saldo + "')", "wa") : ""; } }
    ]
  });
}
function waSaldo(pid, saldo) {
  const f = _deud.find(function (x) { return x.propietarioId === pid; }); if (!f) return;
  waPlantilla("saldo", f.clienteTelefono, { nombre: String(f.cliente).split(" ")[0], monto: fmtMoneda(Number(saldo)) });
}
function exportarFacturas() {
  const l = filtrarFacturas();
  exportarLibro([
    { nombre: "Facturas", datos: l, columnas: [{ k: "numero", t: "Número" }, { k: "fecha", t: "Fecha", f: fmtFecha }, { k: "cliente", t: "Cliente" }, { k: "clienteRuc", t: "RUC/CI" }, { k: "condicion", t: "Condición" }, { k: "estado", t: "Estado" },
      { k: "exenta", t: "Exentas" }, { k: "gravada5", t: "Gravadas 5%" }, { k: "iva5", t: "IVA 5%" }, { k: "gravada10", t: "Gravadas 10%" }, { k: "iva10", t: "IVA 10%" }, { k: "total", t: "Total" }, { k: "pagado", t: "Pagado" }, { k: "saldo", t: "Saldo", f: function (v, f) { return saldoFactura(f); } }] },
    { nombre: "Detalle", datos: [].concat.apply([], l.map(function (f) { return (f.items || []).map(function (i) { return Object.assign({ numero: f.numero, fecha: f.fecha, cliente: f.cliente, estado: f.estado }, i); }); })),
      columnas: [{ k: "numero", t: "Factura" }, { k: "fecha", t: "Fecha", f: fmtFecha }, { k: "cliente", t: "Cliente" }, { k: "estado", t: "Estado" }, { k: "tipo", t: "Tipo" }, { k: "concepto", t: "Concepto" }, { k: "cantidad", t: "Cant." }, { k: "precio", t: "Precio" }, { k: "iva", t: "IVA %" }, { k: "total", t: "Total" }] }
  ], "facturas");
}
function pintarPresupuestos(cont) {
  const hoy = inicioDelDia();
  tabla(cont, {
    filas: _pres, orden: "fecha", dir: -1, vacio: "Sin presupuestos. Creá uno con el botón \"Presupuesto\".", vacioIcono: "fa-file-signature",
    columnas: [
      { k: "numero", t: "Número", v: function (p) { return p.numeroInt; }, r: function (p) { return "<b>" + escHTML(p.numero) + "</b>"; } },
      { k: "fecha", t: "Fecha", r: function (p) { return fmtFechaCorta(p.fecha); }, v: function (p) { return aFecha(p.fecha); } },
      { k: "cliente", t: "Cliente", r: function (p) { return escHTML(p.cliente) + (p.mascota ? "<br><small>" + escHTML(p.mascota) + "</small>" : ""); } },
      { k: "total", t: "Total", cls: "num", r: function (p) { return fmtMoneda(p.total); } },
      { k: "validez", t: "Válido hasta", v: function (p) { return sumarDias(aFecha(p.fecha) || new Date(), p.validezDias || 15); }, r: function (p) { const v = sumarDias(aFecha(p.fecha) || new Date(), p.validezDias || 15); return fmtFechaCorta(v) + (v < hoy && ["pendiente", "aceptado"].indexOf(p.estado) !== -1 ? " " + pill("Vencido", "danger") : ""); } },
      { k: "estado", t: "Estado", r: function (p) { return pill(p.estado, { pendiente: "warn", aceptado: "info", facturado: "ok", rechazado: "neutral" }[p.estado] || "neutral") + (p.numeroFactura ? "<br><small>" + escHTML(p.numeroFactura) + "</small>" : ""); } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (p) {
        return btnIcono("fa-file-pdf", "PDF", "pdfPresupuestoPorId('" + p.id + "')") +
          (p.clienteTelefono ? btnIcono("fa-brands fa-whatsapp", "Enviar por WhatsApp", "waPresupuesto('" + p.id + "')", "wa") : "") +
          (p.estado === "pendiente" ? btnIcono("fa-thumbs-up", "Marcar aceptado", "estadoPresupuesto('" + p.id + "','aceptado')") + btnIcono("fa-thumbs-down", "Marcar rechazado", "estadoPresupuesto('" + p.id + "','rechazado')") : "") +
          (p.estado !== "facturado" && p.estado !== "rechazado" ? '<button class="btn btn-primary btn-sm" onclick="facturarPresupuesto(\'' + p.id + '\')">Facturar</button>' : "");
      } }
    ]
  });
}
async function estadoPresupuesto(id, estado) {
  await escribir(db.collection("presupuestos").doc(id).update({ estado: estado }));
  registrarAuditoria("editar", "presupuestos", "Presupuesto " + id + " → " + estado);
}
function waPresupuesto(id) {
  const p = _pres.find(function (x) { return x.id === id; }); if (!p) return;
  const lineas = (p.items || []).map(function (i) { return "• " + fmtNum(i.cantidad) + " × " + i.concepto + ": " + fmtMoneda(i.total); }).join("\n");
  enviarWhatsApp(p.clienteTelefono, "Hola " + String(p.cliente).split(" ")[0] + "! Te enviamos el presupuesto " + p.numero + (p.mascota ? " para " + p.mascota : "") + " de " + nombreClinica() + ":\n" + lineas + "\nTOTAL: " + fmtMoneda(p.total) + " (IVA incluido). Válido por " + (p.validezDias || 15) + " días.");
}
window.waFactura = waFactura; window.sinCargo = sinCargo; window.waSaldo = waSaldo; window.estadoPresupuesto = estadoPresupuesto; window.waPresupuesto = waPresupuesto;
document.addEventListener("DOMContentLoaded", initFacturas);
