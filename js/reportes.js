/* =====================================================================
 * reportes.js (solo ADMIN) — Reportes de gestion
 *  - Rango libre con atajos y comparacion contra el periodo anterior.
 *  - Ingresos reales desde facturas (no solo cirugias como antes),
 *    cobrado por caja, margen de productos, ticket promedio.
 *  - Rankings: categorias, productos, servicios, clientes, veterinarios,
 *    medios de pago. Deudores. Exportacion a Excel con varias hojas.
 * Solo se consulta el rango pedido (antes se descargaba TODO).
 * ===================================================================== */
const R = { chart: null, d: null };

async function initReportes() {
  await protegerPagina({ permiso: "admin", pagina: "reportes.html" });
  Datos.suscribir("servicios"); Datos.suscribir("productos"); Datos.suscribir("usuarios");
  const hoy = new Date();
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-chart-line"></i> Reportes</h1><div class="head-actions"><button class="btn btn-ghost" id="r-exp"><i class="fa-solid fa-file-excel"></i> Exportar</button></div></div>' +
    '<div class="filtros card"><select id="r-pre"><option value="hoy">Hoy</option><option value="7">Últimos 7 días</option><option value="mes" selected>Este mes</option><option value="mesant">Mes anterior</option><option value="30">Últimos 30 días</option><option value="anio">Este año</option><option value="custom">Personalizado</option></select>' +
    '<label class="fl">Desde <input type="date" id="r-desde"></label><label class="fl">Hasta <input type="date" id="r-hasta"></label><span class="muted" id="r-comp"></span></div>' +
    '<div class="kpis" id="r-kpis">' + skeleton(4, "sk-card").replace('class="sk-wrap"', 'style="display:contents"') + "</div>" +
    '<div class="card"><div class="chart-head"><h3><i class="fa-solid fa-chart-column"></i> Facturación por día</h3></div><div class="chart-box"><canvas id="ch-dia" role="img" aria-label="Facturación por día"></canvas></div></div>' +
    '<div class="mt" id="r-prod"></div><div class="grid-cards mt" id="r-rank"></div>';
  document.getElementById("r-pre").onchange = function () { aplicarPreset(this.value); };
  ["r-desde", "r-hasta"].forEach(function (id) { document.getElementById(id).onchange = function () { document.getElementById("r-pre").value = "custom"; cargarReportes(); }; });
  document.getElementById("r-exp").onclick = exportarReportes;
  document.addEventListener("tema-cambiado", function () { if (R.d) pintarGrafico(); });
  aplicarPreset("mes");
}
function aplicarPreset(p) {
  const h = new Date(); let d = inicioDelDia(h), a = h;
  if (p === "7") d = inicioDelDia(sumarDias(h, -6));
  else if (p === "30") d = inicioDelDia(sumarDias(h, -29));
  else if (p === "mes") d = new Date(h.getFullYear(), h.getMonth(), 1);
  else if (p === "mesant") { d = new Date(h.getFullYear(), h.getMonth() - 1, 1); a = new Date(h.getFullYear(), h.getMonth(), 0); }
  else if (p === "anio") d = new Date(h.getFullYear(), 0, 1);
  if (p !== "custom") { document.getElementById("r-desde").value = fechaInput(d); document.getElementById("r-hasta").value = fechaInput(a); }
  cargarReportes();
}
async function rangoDocs(col, campo, d, h) {
  const s = await db.collection(col).where(campo, ">=", TS.fromDate(d)).where(campo, "<=", TS.fromDate(h)).get();
  return docsDe(s).filter(function (x) { return !x.eliminado; });
}
async function cargarReportes() {
  const d = parseFechaLocal(document.getElementById("r-desde").value), h = finDelDia(parseFechaLocal(document.getElementById("r-hasta").value));
  if (!d || !h || d > h) { toast("Rango de fechas inválido.", "warn"); return; }
  const dur = h - d; const pd = new Date(d.getTime() - dur - 1), ph = new Date(d.getTime() - 1);
  document.getElementById("r-comp").textContent = "Comparado con " + fmtFechaCorta(pd) + " – " + fmtFechaCorta(ph);
  mostrarLoading(true);
  try {
    const r = await Promise.all([
      rangoDocs("facturas", "fecha", d, h), rangoDocs("facturas", "fecha", pd, ph),
      rangoDocs("consultas", "fecha", d, h), rangoDocs("consultas", "fecha", pd, ph),
      rangoDocs("cirugias", "fecha", d, h), rangoDocs("caja_movimientos", "fecha", d, h),
      rangoDocs("mascotas", "creadoEn", d, h).catch(function () { return []; }),
      db.collection("facturas").where("saldo", ">", 0).get().then(docsDe),
      rangoDocs("notas_credito", "fecha", d, h).catch(function () { return []; }),
      rangoDocs("notas_credito", "fecha", pd, ph).catch(function () { return []; })
    ]);
    R.d = { desde: d, hasta: h, fac: r[0].filter(function (f) { return f.estado !== "anulada"; }), facAnt: r[1].filter(function (f) { return f.estado !== "anulada"; }), anuladas: r[0].filter(function (f) { return f.estado === "anulada"; }),
      cons: r[2], consAnt: r[3], cir: r[4], caja: r[5], nuevos: r[6], deud: r[7].filter(function (f) { return f.estado !== "anulada"; }), nc: r[8], ncAnt: r[9] };
    pintarReportes();
  } catch (e) { console.error(e); toast(mensajeError(e), "error"); }
  finally { mostrarLoading(false); }
}
function suma(l, f) { return l.reduce(function (a, x) { return a + (Number(f(x)) || 0); }, 0); }
function delta(a, b) {
  if (!b) return a ? '<span class="kpi-delta sube">nuevo</span>' : "";
  const p = Math.round((a - b) / b * 100);
  return '<span class="kpi-delta ' + (p >= 0 ? "sube" : "baja") + '">' + (p >= 0 ? "▲ " : "▼ ") + Math.abs(p) + "%</span>";
}
function categoriaItem(i) {
  if (i.tipo === "servicio") { const s = Datos.porId("servicios", i.refId); return s ? s.categoria || "Servicios" : "Servicios"; }
  if (i.tipo === "producto") { const p = Datos.porId("productos", i.refId); return "Productos · " + (p && p.categoria ? p.categoria : "otros"); }
  return /cirug/i.test(i.concepto || "") ? "Cirugía" : /consulta/i.test(i.concepto || "") ? "Consulta" : "Otros";
}
function agrupar(items, clave, valor) {
  const g = {};
  items.forEach(function (x) { const k = clave(x) || "—"; g[k] = (g[k] || 0) + (Number(valor(x)) || 0); });
  return Object.keys(g).map(function (k) { return { k: k, v: g[k] }; }).sort(function (a, b) { return b.v - a.v; });
}
function barrasH(titulo, icono, datos, fmt, max) {
  datos = datos.slice(0, max || 8);
  const top = Math.max.apply(null, datos.map(function (x) { return x.v; }).concat([1]));
  return '<div class="card"><h3><i class="fa-solid ' + icono + '"></i> ' + titulo + "</h3>" + (datos.length ? datos.map(function (x) {
    return '<div class="barra-h" title="' + escHTML(x.k + ": " + (fmt || fmtMoneda)(x.v)) + '"><span class="nom">' + escHTML(x.k) + '</span><span class="bar"><i style="width:' + Math.max(2, x.v / top * 100) + '%"></i></span><span class="v">' + (fmt || fmtMoneda)(x.v) + "</span></div>";
  }).join("") : '<p class="muted">Sin datos en el período.</p>') + "</div>";
}
function itemsDe(fs) { return [].concat.apply([], fs.map(function (f) { return (f.items || []).map(function (i) { return Object.assign({ _f: f }, i, { total: i.total != null ? i.total : (i.cantidad || 0) * (i.precio || 0) }); }); })); }
function pintarReportes() {
  const D = R.d;
  // Neto: lo facturado menos las devoluciones (notas de credito) del periodo.
  const devol = suma(D.nc || [], function (n) { return n.total; });
  const fact = suma(D.fac, function (f) { return f.total; }) - devol, factAnt = suma(D.facAnt, function (f) { return f.total; }) - suma(D.ncAnt || [], function (n) { return n.total; });
  const cobrado = suma(D.caja.filter(function (m) { return m.tipo === "ingreso" && m.facturaId; }), function (m) { return m.monto; });
  const egresos = suma(D.caja.filter(function (m) { return m.tipo === "egreso"; }), function (m) { return m.monto; });
  const its = itemsDe(D.fac);
  const prod = its.filter(function (i) { return i.tipo === "producto"; });
  const margen = suma(prod, function (i) { return i.total - (i.costo || 0) * i.cantidad; });
  const ticket = D.fac.length ? fact / D.fac.length : 0;
  const deuda = suma(D.deud, saldoFactura);
  const k = [
    { i: "fa-file-invoice-dollar", l: "Facturado neto" + (devol ? " (dev. " + fmtMoneda(devol) + ")" : ""), v: fmtMoneda(fact), x: delta(fact, factAnt) },
    { i: "fa-sack-dollar", l: "Cobrado (caja)", v: fmtMoneda(cobrado), c: "azul" },
    { i: "fa-receipt", l: "Ticket promedio (" + D.fac.length + " comprob.)", v: fmtMoneda(ticket) },
    { i: "fa-percent", l: "Margen bruto en productos", v: fmtMoneda(margen), c: "naranja" },
    { i: "fa-stethoscope", l: "Consultas", v: fmtNum(D.cons.length, 0), x: delta(D.cons.length, D.consAnt.length) },
    { i: "fa-syringe", l: "Cirugías", v: fmtNum(D.cir.length, 0) },
    { i: "fa-paw", l: "Pacientes nuevos", v: fmtNum(D.nuevos.length, 0) },
    { i: "fa-scale-unbalanced", l: "Por cobrar (total)", v: fmtMoneda(deuda), c: "rojo" }
  ];
  document.getElementById("r-kpis").innerHTML = k.map(function (x) { return '<div class="kpi ' + (x.c || "") + '"><i class="fa-solid ' + x.i + '"></i><div><span class="kpi-valor">' + x.v + '</span><span class="kpi-label">' + x.l + " " + (x.x || "") + "</span></div></div>"; }).join("");
  const vets = agrupar(D.cons, function (c) { return c.veterinario || "Sin asignar"; }, function () { return 1; });
  const cnt = function (n) { return fmtNum(n, 0); };
  document.getElementById("r-rank").innerHTML =
    barrasH("Ingresos por categoría", "fa-layer-group", agrupar(its, categoriaItem, function (i) { return i.total; })) +
    barrasH("Productos más vendidos", "fa-box", agrupar(prod, function (i) { return i.concepto; }, function (i) { return i.total; })) +
    barrasH("Servicios más facturados", "fa-tags", agrupar(its.filter(function (i) { return i.tipo !== "producto"; }), function (i) { return i.concepto; }, function (i) { return i.total; })) +
    barrasH("Mejores clientes", "fa-user", agrupar(D.fac, function (f) { return f.cliente; }, function (f) { return f.total; })) +
    barrasH("Consultas por veterinario", "fa-user-doctor", vets, cnt) +
    barrasH("Ventas por cajero/a", "fa-cash-register", agrupar(D.fac, function (f) { return f.creadoPor || "—"; }, function (f) { return f.total; })) +
    barrasH("Ventas por hora del día", "fa-clock", agrupar(D.fac, function (f) { const x = aFecha(f.fecha); return x ? String(x.getHours()).padStart(2, "0") + ":00" : "—"; }, function (f) { return f.total; }).sort(function (a, b) { return a.k < b.k ? -1 : 1; }), null, 24) +
    barrasH("Devoluciones por motivo", "fa-rotate-left", agrupar(D.nc || [], function (n) { return n.motivo; }, function (n) { return n.total; })) +
    barrasH("Cobros por medio de pago", "fa-credit-card", agrupar(D.caja.filter(function (m) { return m.tipo === "ingreso"; }), function (m) { return nombreMetodo(m.metodo); }, function (m) { return m.monto; })) +
    barrasH("Motivos de consulta frecuentes", "fa-notes-medical", agrupar(D.cons, function (c) { return String(c.motivo || "").split(/[,.\n]/)[0].trim().slice(0, 40); }, function () { return 1; }), cnt) +
    '<div class="card"><h3><i class="fa-solid fa-scale-unbalanced"></i> Resumen de caja</h3><ul class="lista"><li><div class="info">Ingresos</div><b>' + fmtMoneda(suma(D.caja.filter(function (m) { return m.tipo === "ingreso"; }), function (m) { return m.monto; })) +
    '</b></li><li><div class="info">Egresos</div><b class="texto-danger">' + fmtMoneda(egresos) + '</b></li><li><div class="info">Facturas anuladas</div><b>' + D.anuladas.length + " (" + fmtMoneda(suma(D.anuladas, function (f) { return f.total; })) + ")</b></li></ul></div>";
  document.getElementById("r-prod").innerHTML = productividadHTML();
  pintarGrafico();
}
/* Productividad y comisiones por veterinario.
 * Facturado atribuido: facturas que vienen de una consulta, cirugia o
 * internacion de ese veterinario (servicios, sin contar productos). */
function productividad() {
  const D = R.d, porId = {};
  D.cons.forEach(function (c) { porId[c.id] = c; });
  const filas = {};
  function fila(uid, nombre) {
    const k = uid || ("n:" + (nombre || "Sin asignar"));
    if (!filas[k]) { const u = uid ? Datos.porId("usuarios", uid) : null; filas[k] = { k: k, nombre: (u && u.nombre) || nombre || "Sin asignar", comision: u ? Number(u.comision) || 0 : 0, consultas: 0, cirugias: 0, servicios: 0, productos: 0 }; }
    return filas[k];
  }
  D.cons.forEach(function (c) { fila(c.veterinarioUid, c.veterinario).consultas++; });
  D.cir.forEach(function (c) { fila(c.veterinarioUid, c.veterinario).cirugias++; });
  D.fac.forEach(function (f) {
    let uid = f.veterinarioUid, nom = f.veterinario;
    if (!uid && f.consultaId && porId[f.consultaId]) { uid = porId[f.consultaId].veterinarioUid; nom = porId[f.consultaId].veterinario; }
    if (!uid && !nom) return;
    const r = fila(uid, nom);
    (f.items || []).forEach(function (i) { const t = i.total != null ? i.total : i.cantidad * i.precio; if (i.tipo === "producto") r.productos += t; else r.servicios += t; });
  });
  return Object.keys(filas).map(function (k) { const r = filas[k]; r.comisionMonto = Math.round(r.servicios * r.comision / 100); return r; })
    .sort(function (a, b) { return (b.servicios + b.productos) - (a.servicios + a.productos) || b.consultas - a.consultas; });
}
function productividadHTML() {
  const l = productividad();
  if (!l.length) return '<div class="card"><h3><i class="fa-solid fa-user-doctor"></i> Productividad por veterinario</h3><p class="muted">Sin atenciones en el período.</p></div>';
  return '<div class="card"><h3><i class="fa-solid fa-user-doctor"></i> Productividad por veterinario <small class="muted acc">La comisión se configura en Usuarios</small></h3><div class="table-wrap"><table class="tabla tabla-resp"><thead><tr><th>Veterinario/a</th><th class="num">Consultas</th><th class="num">Cirugías</th><th class="num">Servicios facturados</th><th class="num">Productos</th><th class="num">Comisión</th></tr></thead><tbody>' +
    l.map(function (r) {
      return '<tr><td data-label="Veterinario/a"><b>' + escHTML(r.nombre) + '</b></td><td class="num" data-label="Consultas">' + r.consultas + '</td><td class="num" data-label="Cirugías">' + r.cirugias + '</td><td class="num" data-label="Servicios">' + fmtMoneda(r.servicios) +
        '</td><td class="num" data-label="Productos">' + fmtMoneda(r.productos) + '</td><td class="num" data-label="Comisión">' + (r.comision ? "<b>" + fmtMoneda(r.comisionMonto) + "</b> <small>(" + r.comision + "%)</small>" : "—") + "</td></tr>";
    }).join("") + "</tbody></table></div></div>";
}
async function pintarGrafico() {
  const D = R.d;
  const dias = [];
  for (let x = inicioDelDia(D.desde); x <= D.hasta && dias.length < 400; x = sumarDias(x, 1)) dias.push(fechaInput(x));
  const porDia = {}; D.fac.forEach(function (f) { const k = fechaInput(f.fecha); porDia[k] = (porDia[k] || 0) + (f.total || 0); });
  try {
    await cargarLib("chart");
    const css = getComputedStyle(document.documentElement);
    const c = function (v) { return css.getPropertyValue(v).trim(); };
    if (R.chart) R.chart.destroy();
    R.chart = new Chart(document.getElementById("ch-dia"), {
      type: "bar",
      data: { labels: dias.map(function (d) { const p = d.split("-"); return p[2] + "/" + p[1]; }), datasets: [{ label: "Facturado", data: dias.map(function (d) { return porDia[d] || 0; }), backgroundColor: c("--verde"), borderRadius: 4, maxBarThickness: 28 }] },
      options: {
        maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) { return " " + fmtMoneda(x.raw); } } } },
        scales: { x: { grid: { display: false }, ticks: { color: c("--texto-suave"), maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, grid: { color: c("--borde") }, border: { display: false }, ticks: { color: c("--texto-suave"), callback: function (v) { return v >= 1e6 ? (v / 1e6).toLocaleString("es-PY") + " M" : v >= 1e3 ? (v / 1e3) + " k" : v; } } } }
      }
    });
  } catch (e) { toast(mensajeError(e), "error"); }
}
function exportarReportes() {
  const D = R.d; if (!D) return;
  const its = itemsDe(D.fac);
  exportarLibro([
    { nombre: "Facturas", datos: D.fac, columnas: [{ k: "numero", t: "Número" }, { k: "fecha", t: "Fecha", f: fmtFecha }, { k: "cliente", t: "Cliente" }, { k: "mascota", t: "Paciente" }, { k: "estado", t: "Estado" }, { k: "total", t: "Total" }, { k: "pagado", t: "Pagado" }, { k: "saldo", t: "Saldo", f: function (v, f) { return saldoFactura(f); } }, { k: "iva10", t: "IVA 10%" }, { k: "iva5", t: "IVA 5%" }] },
    { nombre: "Detalle de ventas", datos: its, columnas: [{ k: "_f", t: "Factura", f: function (f) { return f.numero; } }, { k: "tipo", t: "Tipo" }, { k: "concepto", t: "Concepto" }, { k: "cantidad", t: "Cant." }, { k: "precio", t: "Precio" }, { k: "total", t: "Total" }, { k: "costo", t: "Costo unit." }, { k: "categoria", t: "Categoría", f: function (v, i) { return categoriaItem(i); } }] },
    { nombre: "Consultas", datos: D.cons, columnas: [{ k: "fecha", t: "Fecha", f: fmtFecha }, { k: "mascota", t: "Paciente" }, { k: "dueno", t: "Dueño" }, { k: "veterinario", t: "Veterinario" }, { k: "motivo", t: "Motivo" }, { k: "diagnostico", t: "Diagnóstico" }] },
    { nombre: "Cirugías", datos: D.cir, columnas: [{ k: "fecha", t: "Fecha", f: fmtFechaCorta }, { k: "paciente", t: "Paciente" }, { k: "tipo", t: "Tipo" }, { k: "veterinario", t: "Cirujano" }, { k: "estado", t: "Estado" }, { k: "costo", t: "Costo" }] },
    { nombre: "Caja", datos: D.caja, columnas: [{ k: "fecha", t: "Fecha", f: fmtFecha }, { k: "tipo", t: "Tipo" }, { k: "concepto", t: "Concepto" }, { k: "metodo", t: "Medio", f: nombreMetodo }, { k: "monto", t: "Monto" }, { k: "usuario", t: "Usuario" }] },
    { nombre: "Productividad", datos: productividad(), columnas: [{ k: "nombre", t: "Veterinario" }, { k: "consultas", t: "Consultas" }, { k: "cirugias", t: "Cirugías" }, { k: "servicios", t: "Servicios facturados" }, { k: "productos", t: "Productos" }, { k: "comision", t: "Comisión %" }, { k: "comisionMonto", t: "Comisión Gs" }] },
    { nombre: "Deudores", datos: D.deud, columnas: [{ k: "numero", t: "Factura" }, { k: "fecha", t: "Fecha", f: fmtFechaCorta }, { k: "cliente", t: "Cliente" }, { k: "clienteTelefono", t: "Teléfono" }, { k: "total", t: "Total" }, { k: "saldo", t: "Saldo", f: function (v, f) { return saldoFactura(f); } }] }
  ], "reporte_" + document.getElementById("r-desde").value + "_a_" + document.getElementById("r-hasta").value);
}
document.addEventListener("DOMContentLoaded", initReportes);
