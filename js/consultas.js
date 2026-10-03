/* =====================================================================
 * consultas.js — Listado de consultas por rango de fechas (tiempo real)
 * La historia completa de cada paciente esta en su ficha (paciente.html).
 * ===================================================================== */
let _cons = [], _consUnsub = null, _consLimite = 300;

async function initConsultas() {
  await protegerPagina({ permiso: "clinica_ver", pagina: "consultas.html" });
  Datos.suscribir("mascotas"); Datos.suscribir("propietarios"); Datos.suscribir("usuarios", function () { pintarFiltroVet(); });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-stethoscope"></i> Consultas</h1><div class="head-actions">' +
    (esAdmin() ? '<button class="btn btn-ghost" id="c-exp"><i class="fa-solid fa-file-excel"></i> Exportar</button>' : "") +
    (puede("clinica") ? '<button class="btn btn-primary" id="c-nueva"><i class="fa-solid fa-plus"></i> Nueva consulta</button>' : "") + "</div></div>" +
    '<div class="filtros card"><input type="search" id="c-buscar" placeholder="Paciente, dueño, motivo o diagnóstico...">' +
    '<select id="c-rango"><option value="0">Hoy</option><option value="7">Últimos 7 días</option><option value="30" selected>Últimos 30 días</option><option value="90">Últimos 3 meses</option><option value="365">Último año</option></select>' +
    '<select id="c-vet"><option value="">Todos los veterinarios</option></select>' +
    '<label class="chk-inline"><input type="checkbox" id="c-pend"> Pendientes de cobro</label></div>' +
    '<div id="c-tabla">' + skeleton(8) + "</div>";
  document.getElementById("c-buscar").value = paramQ();
  document.getElementById("c-buscar").oninput = debounce(pintarConsultas, 150);
  document.getElementById("c-rango").onchange = function () { _consLimite = 300; escucharConsultas(); };
  document.getElementById("c-vet").onchange = pintarConsultas;
  document.getElementById("c-pend").onchange = pintarConsultas;
  const bn = document.getElementById("c-nueva"); if (bn) bn.onclick = function () { abrirFormConsulta({}); };
  const be = document.getElementById("c-exp");
  if (be) be.onclick = function () {
    exportarAExcel(filtrarConsultas(), [{ k: "fecha", t: "Fecha", f: fmtFecha }, { k: "mascota", t: "Paciente" }, { k: "especie", t: "Especie" }, { k: "dueno", t: "Dueño" }, { k: "veterinario", t: "Veterinario" },
      { k: "motivo", t: "Motivo" }, { k: "diagnostico", t: "Diagnóstico" }, { k: "tratamiento", t: "Tratamiento" }, { k: "vitales", t: "Peso (kg)", f: function (v) { return v && v.peso || ""; } }], "consultas");
  };
  if (paramURL("nueva") && puede("clinica")) abrirFormConsulta({ mascotaId: paramURL("mascota"), citaId: paramURL("cita") });
  escucharConsultas();
}

function escucharConsultas() {
  if (_consUnsub) _consUnsub();
  const dias = Number(document.getElementById("c-rango").value);
  const desde = inicioDelDia(sumarDias(new Date(), -dias));
  _consUnsub = db.collection("consultas").where("fecha", ">=", TS.fromDate(desde)).orderBy("fecha", "desc").limit(_consLimite).onSnapshot(function (s) {
    _cons = docsDe(s).filter(function (c) { return !c.eliminado; });
    _cons._lleno = s.size >= _consLimite;
    pintarConsultas();
  }, function (e) { console.error(e); toast(mensajeError(e), "error"); });
}
function pintarFiltroVet() {
  const s = document.getElementById("c-vet"); if (!s) return;
  const a = s.value;
  s.innerHTML = '<option value="">Todos los veterinarios</option>' + veterinarios().map(function (u) { return '<option value="' + u.id + '"' + (u.id === a ? " selected" : "") + ">" + escHTML(u.nombre) + "</option>"; }).join("");
}
function filtrarConsultas() {
  const q = document.getElementById("c-buscar").value, v = document.getElementById("c-vet").value, p = document.getElementById("c-pend").checked;
  return _cons.filter(function (c) {
    return (!v || c.veterinarioUid === v) && (!p || c.porCobrar) && coincide([c.mascota, c.dueno, c.motivo, c.diagnostico, c.veterinario].join(" "), q);
  });
}
function pintarConsultas() {
  tabla("c-tabla", {
    filas: filtrarConsultas(), orden: "fecha", dir: -1, vacio: "Sin consultas en este período", vacioIcono: "fa-stethoscope",
    alClic: function (c) { location.href = "paciente.html?id=" + c.mascotaId; },
    pie: _cons._lleno ? '<div class="mas-wrap"><button class="btn btn-ghost" onclick="_consLimite+=300;escucharConsultas()">Cargar más antiguas</button></div>' : "",
    columnas: [
      { k: "fecha", t: "Fecha", r: function (c) { return '<span class="nowrap">' + fmtFecha(c.fecha) + "</span>"; }, v: function (c) { return aFecha(c.fecha); } },
      { k: "mascota", t: "Paciente", r: function (c) { const m = Datos.mascota(c.mascotaId); return '<div class="celda-m">' + Datos.avatarMascota(m || { especie: c.especie }, "sm") + "<div><b>" + escHTML(c.mascota) + "</b><br><small>" + escHTML(c.dueno || "") + "</small></div></div>"; } },
      { k: "motivo", t: "Motivo", r: function (c) { return escHTML(c.motivo || ""); } },
      { k: "diagnostico", t: "Diagnóstico", r: function (c) { return escHTML(c.diagnostico || "—"); } },
      { k: "veterinario", t: "Veterinario/a" },
      { k: "porCobrar", t: "Cobro", r: function (c) { return c.porCobrar ? pill("Pendiente", "warn") : (c.facturaId ? pill("Cobrada", "ok") : pill("—", "neutral")); } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (c) {
        return btnIcono("fa-file-pdf", "Receta PDF", "pdfConsultaLista('" + c.id + "')") +
          (puede("clinica") ? btnIcono("fa-pen", "Editar", "abrirFormConsulta({id:'" + c.id + "'})") : "") +
          (c.porCobrar && puede("facturar") ? btnIcono("fa-hand-holding-dollar", "Cobrar", "abrirFormFactura({consultaId:'" + c.id + "'})") : "") +
          (esAdmin() ? btnIcono("fa-trash", "Eliminar", "eliminarConsulta('" + c.id + "')", "danger") : "");
      } }
    ]
  });
}
function pdfConsultaLista(id) {
  const c = _cons.find(function (x) { return x.id === id; }); if (!c) return;
  const m = Datos.mascota(c.mascotaId);
  generarPDF(function () { return pdfConsulta(c, m, Datos.duenoDe(m)); });
}
async function eliminarConsulta(id) {
  const c = _cons.find(function (x) { return x.id === id; });
  if (await confirmar("¿Enviar la consulta de " + c.mascota + " (" + fmtFechaCorta(c.fecha) + ") a la papelera?")) await Datos.aPapelera("consultas", id, c);
}
window.pdfConsultaLista = pdfConsultaLista; window.eliminarConsulta = eliminarConsulta; window.escucharConsultas = escucharConsultas;
document.addEventListener("DOMContentLoaded", initConsultas);
