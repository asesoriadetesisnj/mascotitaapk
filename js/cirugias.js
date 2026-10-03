/* =====================================================================
 * cirugias.js — Cirugias vinculadas al paciente, con checklist,
 * consentimiento informado en PDF y pase a cobro al finalizar.
 * ===================================================================== */
let _cirs = [];

async function initCirugias() {
  await protegerPagina({ permiso: "clinica_ver", pagina: "cirugias.html" });
  Datos.suscribir("mascotas"); Datos.suscribir("propietarios"); Datos.suscribir("usuarios");
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-syringe"></i> Cirugías</h1><div class="head-actions">' +
    (puede("clinica") ? '<button class="btn btn-primary" id="ci-nueva"><i class="fa-solid fa-plus"></i> Programar cirugía</button>' : "") + "</div></div>" +
    '<div class="chips" id="ci-resumen"></div>' +
    '<div class="filtros card"><input type="search" id="ci-buscar" placeholder="Paciente, dueño, tipo o cirujano...">' +
    '<select id="ci-estado"><option value="">Todos los estados</option>' + ESTADOS_CIRUGIA.map(function (e) { return "<option>" + e + "</option>"; }).join("") + "</select>" +
    '<select id="ci-rango"><option value="proximas">Próximas y en curso</option><option value="30">Últimos 30 días</option><option value="365" selected>Último año</option><option value="todas">Todas</option></select></div>' +
    '<div id="ci-tabla">' + skeleton(6) + "</div>";
  const bn = document.getElementById("ci-nueva"); if (bn) bn.onclick = function () { abrirFormCirugia({}); };
  document.getElementById("ci-buscar").oninput = debounce(pintarCirugias, 150);
  ["ci-estado", "ci-rango"].forEach(function (id) { document.getElementById(id).onchange = pintarCirugias; });
  db.collection("cirugias").orderBy("fecha", "desc").limit(1000).onSnapshot(function (s) {
    _cirs = docsDe(s).filter(function (c) { return !c.eliminado; }); pintarCirugias();
  }, function (e) { toast(mensajeError(e), "error"); });
}
function pintarCirugias() {
  const q = document.getElementById("ci-buscar").value, est = document.getElementById("ci-estado").value, r = document.getElementById("ci-rango").value;
  const hoy = inicioDelDia();
  document.getElementById("ci-resumen").innerHTML = ["programada", "en proceso", "finalizada"].map(function (e) {
    return '<div class="chip-resumen"><small>' + e[0].toUpperCase() + e.slice(1) + "s</small><b>" + _cirs.filter(function (c) { return c.estado === e; }).length + "</b></div>";
  }).join("") + '<div class="chip-resumen"><small>Pendientes de cobro</small><b class="texto-warn">' + _cirs.filter(function (c) { return c.porCobrar; }).length + "</b></div>";
  const l = _cirs.filter(function (c) {
    const f = aFecha(c.fecha);
    if (r === "proximas" && !(f >= hoy || c.estado === "programada" || c.estado === "en proceso")) return false;
    if (r !== "proximas" && r !== "todas" && f && f < sumarDias(hoy, -Number(r))) return false;
    return (!est || c.estado === est) && coincide([c.paciente, c.dueno, c.tipo, c.veterinario].join(" "), q);
  });
  tabla("ci-tabla", {
    filas: l, orden: "fecha", dir: r === "proximas" ? 1 : -1, vacio: "Sin cirugías", vacioIcono: "fa-syringe",
    alClic: function (c) { if (puede("clinica")) abrirFormCirugia({ id: c.id }); else if (c.mascotaId) location.href = "paciente.html?id=" + c.mascotaId; },
    columnas: [
      { k: "fecha", t: "Fecha", r: function (c) { return fmtFechaCorta(c.fecha) + (c.horaEntrada ? "<br><small>" + escHTML(c.horaEntrada) + "</small>" : ""); }, v: function (c) { return aFecha(c.fecha); } },
      { k: "paciente", t: "Paciente", r: function (c) { return (c.mascotaId ? '<a class="link" href="paciente.html?id=' + c.mascotaId + '">' + escHTML(c.paciente) + "</a>" : escHTML(c.paciente)) + "<br><small>" + escHTML(c.dueno || "") + "</small>"; } },
      { k: "tipo", t: "Tipo" },
      { k: "veterinario", t: "Cirujano/a" },
      { k: "estado", t: "Estado", r: function (c) { return pill(c.estado || "", (c.estado || "").replace(/\s/g, "-")) + (c.porCobrar ? " " + pill("Por cobrar", "warn") : ""); } },
      { k: "costo", t: "Costo", cls: "num", r: function (c) { return c.costo ? fmtMoneda(c.costo) : "—"; } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (c) {
        return btnIcono("fa-file-pdf", "Ficha + consentimiento PDF", "pdfCirugiaLista('" + c.id + "')") +
          (c.porCobrar && puede("facturar") ? btnIcono("fa-hand-holding-dollar", "Cobrar", "abrirFormFactura({cirugiaId:'" + c.id + "'})") : "") +
          (esAdmin() ? btnIcono("fa-trash", "Eliminar", "eliminarCirugia('" + c.id + "')", "danger") : "");
      } }
    ]
  });
}
function pdfCirugiaLista(id) {
  const c = _cirs.find(function (x) { return x.id === id; }); const m = Datos.mascota(c.mascotaId);
  generarPDF(function () { return pdfCirugia(c, m, Datos.duenoDe(m)); });
}
async function eliminarCirugia(id) {
  const c = _cirs.find(function (x) { return x.id === id; });
  if (await confirmar("¿Enviar la cirugía de " + c.paciente + " a la papelera?")) await Datos.aPapelera("cirugias", id, c);
}
window.pdfCirugiaLista = pdfCirugiaLista; window.eliminarCirugia = eliminarCirugia;
document.addEventListener("DOMContentLoaded", initCirugias);
