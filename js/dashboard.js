/* =====================================================================
 * dashboard.js — Panel principal (todo en tiempo real)
 * Antes descargaba colecciones enteras solo para contarlas; ahora usa
 * estadisticas agregadas + consultas acotadas al dia.
 * ===================================================================== */

async function initDashboard() {
  const u = await protegerPagina({ pagina: "dashboard.html" });
  const h = new Date().getHours();
  const saludo = h < 12 ? "Buenos días" : (h < 19 ? "Buenas tardes" : "Buenas noches");
  const acc = [
    { p: "agenda", href: "citas.html?nueva=1", i: "fa-calendar-plus", t: "Nueva cita" },
    { p: "clinica", href: "consultas.html?nueva=1", i: "fa-stethoscope", t: "Nueva consulta" },
    { p: "pacientes", href: "pacientes.html?nuevo=1", i: "fa-paw", t: "Nuevo paciente" },
    { p: "clinica", href: "vacunas.html?nueva=1", i: "fa-shield-virus", t: "Vacuna" },
    { p: "facturar", href: "facturas.html?nueva=1", i: "fa-file-invoice-dollar", t: "Cobrar / facturar" },
    { p: "facturar", href: "venta.html", i: "fa-cash-register", t: "Punto de venta" },
    { p: "caja", href: "caja.html", i: "fa-cash-register", t: "Caja" }
  ].filter(function (a) { return puede(a.p); });
  document.getElementById("content").innerHTML =
    '<div class="bienvenida"><h1>' + saludo + ", " + escHTML(u.nombre.split(" ")[0]) + "</h1><p>" + escHTML(fmtFechaLarga(new Date())) + "</p></div>" +
    '<div class="accesos">' + acc.map(function (a) { return '<a class="acceso" href="' + a.href + '"><i class="fa-solid ' + a.i + '"></i>' + a.t + "</a>"; }).join("") + "</div>" +
    '<div class="kpis" id="d-kpis">' + skeleton(4, "sk-card").replace('class="sk-wrap"', 'style="display:contents"') + "</div>" +
    '<div id="d-guia"></div>' +
    '<div class="cols-2"><div>' +
    (puede("agenda") ? '<div class="card"><h3><i class="fa-solid fa-calendar-day"></i> Agenda de hoy <a class="acc link" href="citas.html?vista=dia">Abrir agenda</a></h3><div id="d-agenda">' + skeleton(3) + "</div></div>" : "") +
    (puede("facturar") ? '<div class="card"><h3><i class="fa-solid fa-hand-holding-dollar"></i> Pendientes de cobro <a class="acc link" href="facturas.html?tab=pendientes">Ver todo</a></h3><div id="d-cobro">' + skeleton(2) + "</div></div>" : "") +
    '<div class="card"><h3><i class="fa-solid fa-notes-medical"></i> Controles de los próximos 7 días <a class="acc link" href="recordatorios.html?tab=controles">Recordatorios</a></h3><div id="d-controles">' + skeleton(2) + "</div></div>" +
    "</div><div>" +
    '<div class="card"><h3><i class="fa-solid fa-triangle-exclamation"></i> Requiere atención</h3><div id="d-alertas">' + skeleton(3) + "</div></div>" +
    '<div class="card"><h3><i class="fa-solid fa-shield-virus"></i> Vacunas a vencer (15 días) <a class="acc link" href="recordatorios.html">Avisar</a></h3><div id="d-vacunas">' + skeleton(2) + "</div></div>" +
    "</div></div>";

  migrarSiHaceFalta();
  Datos.suscribir("usuarios");
  const hoy0 = inicioDelDia(), hoy1 = finDelDia();
  const kpi = { stats: {}, citas: null, consultasHoy: null, cobrado: null, porCobrar: null, internados: 0 };
  function pintarKpis() {
    const k = [
      { i: "fa-paw", l: "Pacientes activos", v: kpi.stats.mascotas != null ? fmtNum(kpi.stats.mascotas, 0) : "—", href: "pacientes.html" },
      { i: "fa-calendar-check", l: "Citas hoy", v: kpi.citas != null ? kpi.citas : "—", href: "citas.html?vista=dia", c: "azul" },
      { i: "fa-stethoscope", l: "Consultas hoy", v: kpi.consultasHoy != null ? kpi.consultasHoy : "—", href: "consultas.html" }
    ];
    if (puede("caja")) k.push({ i: "fa-sack-dollar", l: "Cobrado hoy", v: kpi.cobrado != null ? fmtMoneda(kpi.cobrado) : "—", href: "caja.html", c: "naranja" });
    else k.push({ i: "fa-users", l: "Clientes", v: kpi.stats.propietarios != null ? fmtNum(kpi.stats.propietarios, 0) : "—", href: "pacientes.html?tab=duenos", c: "naranja" });
    if (kpi.internados) k.push({ i: "fa-bed-pulse", l: "Internados", v: kpi.internados, href: "internacion.html", c: "rojo" });
    if (puede("facturar")) k.push({ i: "fa-file-invoice", l: "Por cobrar (cuentas)", v: kpi.porCobrar != null ? fmtMoneda(kpi.porCobrar) : "—", href: "facturas.html?tab=deudores", c: "rojo" });
    document.getElementById("d-kpis").innerHTML = k.map(function (x) {
      return '<a class="kpi ' + (x.c || "") + '" href="' + x.href + '"><i class="fa-solid ' + x.i + '"></i><div><span class="kpi-valor">' + x.v + '</span><span class="kpi-label">' + x.l + "</span></div></a>";
    }).join("");
  }
  pintarKpis();
  Datos.escucharStats(function (s) { kpi.stats = s; pintarKpis(); });

  db.collection("internaciones").where("estado", "==", "internado").onSnapshot(function (s) { kpi.internados = s.docs.filter(function (d) { return !d.data().eliminado; }).length; pintarKpis(); }, function () {});
  if (esAdmin()) guiaInicial();
  // Agenda de hoy
  if (puede("agenda")) {
    db.collection("citas").where("fecha", ">=", TS.fromDate(hoy0)).where("fecha", "<=", TS.fromDate(hoy1)).orderBy("fecha").onSnapshot(function (s) {
      const l = docsDe(s).filter(function (c) { return !c.eliminado; });
      kpi.citas = l.filter(function (c) { return ["cancelada", "no asistió"].indexOf(c.estado) === -1; }).length; pintarKpis();
      document.getElementById("d-agenda").innerHTML = l.length ? '<ul class="lista">' + l.map(function (c) {
        const est = c.estado || "pendiente";
        return '<li><span class="hora">' + fmtHora(c.fecha) + '</span><div class="info"><b>' + escHTML(c.mascota || "") + "</b> " +
          '<small>' + escHTML([c.servicio, c.dueno, c.veterinario].filter(Boolean).join(" · ")) + "</small></div>" +
          pill(est, est.replace(/\s/g, "-").replace("ó", "o")) +
          (puede("clinica") && c.mascotaId && ["atendida", "cancelada", "no asistió"].indexOf(est) === -1 ? '<a class="btn btn-secundario btn-sm" href="consultas.html?nueva=1&mascota=' + c.mascotaId + "&cita=" + c.id + '">Atender</a>' : "") + "</li>";
      }).join("") + "</ul>" : vacio("No hay citas para hoy.", "fa-calendar", '<a class="btn btn-ghost btn-sm" href="citas.html?nueva=1">Agendar</a>');
    }, function (e) { console.warn(e); });
  }
  // Consultas de hoy (conteo)
  db.collection("consultas").where("fecha", ">=", TS.fromDate(hoy0)).onSnapshot(function (s) {
    kpi.consultasHoy = s.docs.filter(function (d) { return !d.data().eliminado; }).length; pintarKpis();
  }, function () {});
  // Cobrado hoy (movimientos de caja)
  if (puede("caja")) {
    db.collection("caja_movimientos").where("fecha", ">=", TS.fromDate(hoy0)).onSnapshot(function (s) {
      kpi.cobrado = docsDe(s).reduce(function (a, m) { return a + (m.tipo === "ingreso" && m.facturaId ? m.monto : 0); }, 0); pintarKpis();
    }, function () {});
  }
  // Saldo por cobrar y pendientes de cobro
  if (puede("facturar")) {
    db.collection("facturas").where("saldo", ">", 0).onSnapshot(function (s) {
      kpi.porCobrar = docsDe(s).filter(function (f) { return f.estado !== "anulada"; }).reduce(function (a, f) { return a + (f.saldo || 0); }, 0); pintarKpis();
    }, function () { kpi.porCobrar = 0; pintarKpis(); });
    db.collection("consultas").where("porCobrar", "==", true).limit(20).onSnapshot(function (s) {
      const l = docsDe(s).filter(function (c) { return !c.eliminado; });
      document.getElementById("d-cobro").innerHTML = l.length ? '<ul class="lista">' + l.slice(0, 6).map(function (c) {
        return '<li><div class="info"><b>' + escHTML(c.mascota) + "</b><small>" + escHTML((c.dueno || "") + " · " + fmtFecha(c.fecha) + " · " + (c.veterinario || "")) + '</small></div><a class="btn btn-primary btn-sm" href="facturas.html?nueva=1&consulta=' + c.id + '">Cobrar</a></li>';
      }).join("") + "</ul>" : vacio("Nada pendiente de cobro.", "fa-circle-check");
    }, function () {});
  }
  // Controles proximos
  db.collection("consultas").where("proximoControl", ">=", TS.fromDate(hoy0)).where("proximoControl", "<=", TS.fromDate(finDelDia(sumarDias(hoy0, 7)))).orderBy("proximoControl").limit(30).onSnapshot(function (s) {
    const l = docsDe(s).filter(function (c) { return !c.eliminado; });
    document.getElementById("d-controles").innerHTML = l.length ? '<ul class="lista">' + l.slice(0, 8).map(function (c) {
      return '<li><div class="info"><a class="link" href="paciente.html?id=' + c.mascotaId + '">' + escHTML(c.mascota) + "</a><small>" + escHTML((c.dueno || "") + " · " + (c.diagnostico || c.motivo || "")) + "</small></div>" + pill(fmtFechaCorta(c.proximoControl), diasEntre(new Date(), aFecha(c.proximoControl)) === 0 ? "warn" : "info") + "</li>";
    }).join("") + "</ul>" : vacio("Sin controles programados.", "fa-notes-medical");
  }, function (e) { console.warn(e); });
  // Vacunas por vencer
  db.collection("vacunas").where("vigente", "==", true).where("proximaDosis", ">=", TS.fromDate(sumarDias(hoy0, -30))).where("proximaDosis", "<=", TS.fromDate(finDelDia(sumarDias(hoy0, 15)))).orderBy("proximaDosis").limit(40).onSnapshot(function (s) {
    const l = docsDe(s).filter(function (v) { return !v.eliminado; });
    document.getElementById("d-vacunas").innerHTML = l.length ? '<ul class="lista">' + l.slice(0, 8).map(function (v) {
      const venc = aFecha(v.proximaDosis) < hoy0;
      return '<li><div class="info"><a class="link" href="paciente.html?id=' + v.mascotaId + '">' + escHTML(v.mascota) + "</a><small>" + escHTML(v.tipo + " · " + (v.dueno || "")) + "</small></div>" + pill(fmtFechaCorta(v.proximaDosis), venc ? "danger" : "warn") + "</li>";
    }).join("") + "</ul>" : vacio("Ninguna vacuna por vencer.", "fa-shield-virus");
  }, function (e) { console.warn(e); });
  // Alertas
  const alertas = { stock: [], vence: [] };
  function pintarAlertas() {
    const a = [];
    if (alertas.stock.length) a.push('<a class="alerta alerta-warn" href="stock.html?filtro=bajo"><i class="fa-solid fa-boxes-stacked"></i><span><b>' + alertas.stock.length + " producto(s) con stock bajo</b><br><small>" + escHTML(alertas.stock.slice(0, 4).join(", ")) + "</small></span></a>");
    if (alertas.vence.length) a.push('<a class="alerta alerta-danger" href="stock.html?filtro=vence"><i class="fa-solid fa-hourglass-half"></i><span><b>' + alertas.vence.length + " producto(s) vencen en 30 días</b><br><small>" + escHTML(alertas.vence.slice(0, 4).join(", ")) + "</small></span></a>");
    document.getElementById("d-alertas").innerHTML = a.join("") || vacio("Todo en orden.", "fa-circle-check");
  }
  if (puede("stock")) {
    db.collection("productos").where("stockBajo", "==", true).limit(50).onSnapshot(function (s) { alertas.stock = docsDe(s).filter(function (p) { return !p.eliminado; }).map(function (p) { return p.nombre; }); pintarAlertas(); }, function () {});
    db.collection("productos").where("fechaVencimiento", "<=", TS.fromDate(sumarDias(hoy1, 30))).limit(50).onSnapshot(function (s) { alertas.vence = docsDe(s).filter(function (p) { return !p.eliminado && (Number(p.cantidad) || 0) > 0; }).map(function (p) { return p.nombre; }); pintarAlertas(); }, function () {});
  } else pintarAlertas();
}
/* Guia de primera configuracion (solo admin, hasta completarla u ocultarla). */
async function guiaInicial() {
  const c = await cargarConfig();
  if (c.guiaOculta) return;
  Datos.suscribir("servicios"); Datos.suscribir("usuarios");
  await Promise.all([Datos.listo("servicios"), Datos.listo("usuarios")]);
  let stats = {}, cajas = 0, prods = 0;
  try { const s = await db.collection("estadisticas").doc("general").get(); stats = s.exists ? s.data() : {}; } catch (e) {}
  try { cajas = (await db.collection("cajas").limit(1).get()).size; } catch (e) {}
  try { prods = (await db.collection("productos").limit(1).get()).size; } catch (e) {}
  const pasos = [
    ["Datos de la clínica (nombre, teléfono, dirección)", !!(c.clinicaNombre && c.clinicaTelefono), "configuracion.html"],
    ["Catálogo de servicios con precios", Datos.lista("servicios").some(function (x) { return x.precio > 0; }), "servicios.html"],
    ["Usuarios del equipo (veterinarios, recepción)", Datos.lista("usuarios").length > 1, "usuarios.html"],
    ["Productos en stock (o importarlos desde Excel)", prods > 0, "stock.html"],
    ["Primer paciente registrado", (stats.mascotas || 0) > 0, "pacientes.html?nuevo=1"],
    ["Abrir la caja por primera vez", cajas > 0, "caja.html"],
    ["Dirección pública para el carnet digital (QR)", !!(c.urlPublica || /^https:/.test(location.protocol)), "configuracion.html"]
  ];
  const hechos = pasos.filter(function (p) { return p[1]; }).length;
  if (hechos === pasos.length) return;
  document.getElementById("d-guia").innerHTML = '<div class="card mb"><h3><i class="fa-solid fa-list-check"></i> Puesta en marcha · ' + hechos + " de " + pasos.length +
    ' <button class="btn btn-ghost btn-sm acc" id="g-ocultar">Ocultar</button></h3><ol class="guia-pasos">' + pasos.map(function (p, i) {
      return '<li class="' + (p[1] ? "hecho" : "") + '"><span class="n">' + (p[1] ? '<i class="fa-solid fa-check"></i>' : i + 1) + '</span><span class="info">' + escHTML(p[0]) + "</span>" + (p[1] ? "" : '<a class="btn btn-ghost btn-sm" href="' + p[2] + '">Ir</a>') + "</li>";
    }).join("") + "</ol></div>";
  document.getElementById("g-ocultar").onclick = async function () {
    await db.collection("config").doc("general").set({ guiaOculta: true }, { merge: true }).catch(function () {});
    document.getElementById("d-guia").innerHTML = "";
  };
}
document.addEventListener("DOMContentLoaded", initDashboard);
