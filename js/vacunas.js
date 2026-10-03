/* =====================================================================
 * vacunas.js — Vacunas y desparasitaciones
 * CORREGIDO: antes una vacuna quedaba "vencida" para siempre aunque se
 * aplicara el refuerzo. Ahora solo la ultima dosis de cada tipo por
 * mascota esta "vigente" y es la que cuenta para el semaforo y avisos.
 * ===================================================================== */
let _vacs = [], _vacUnsub = null;

async function initVacunas() {
  await protegerPagina({ permiso: "clinica_ver", pagina: "vacunas.html" });
  Datos.suscribir("mascotas"); Datos.suscribir("propietarios");
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-shield-virus"></i> Vacunas y desparasitación</h1><div class="head-actions">' +
    '<a class="btn btn-ghost" href="recordatorios.html"><i class="fa-brands fa-whatsapp"></i> Avisar vencimientos</a>' +
    (puede("clinica") ? '<button class="btn btn-primary" id="v-nueva"><i class="fa-solid fa-plus"></i> Registrar</button>' : "") + "</div></div>" +
    '<div class="chips" id="v-resumen"></div>' +
    '<div class="filtros card"><input type="search" id="v-buscar" placeholder="Paciente, dueño o vacuna...">' +
    '<select id="v-filtro"><option value="vigentes">Estado actual (última dosis)</option><option value="vencida">Vencidas</option><option value="proxima">Vencen en 30 días</option><option value="aldia">Al día</option><option value="todas">Historial completo</option></select>' +
    '<select id="v-tipo"><option value="">Todos los tipos</option>' + TIPOS_VACUNA.map(function (t) { return "<option>" + escHTML(t) + "</option>"; }).join("") + "</select></div>" +
    '<div id="v-tabla">' + skeleton(8) + "</div>";
  document.getElementById("v-buscar").value = paramQ();
  const bn = document.getElementById("v-nueva"); if (bn) bn.onclick = function () { abrirFormVacuna({}); };
  document.getElementById("v-buscar").oninput = debounce(pintarVacunas, 150);
  document.getElementById("v-filtro").onchange = escucharVacunas;
  document.getElementById("v-tipo").onchange = pintarVacunas;
  if (paramURL("nueva") && puede("clinica")) abrirFormVacuna({ mascotaId: paramURL("mascota") });
  escucharVacunas();
}
function escucharVacunas() {
  if (_vacUnsub) _vacUnsub();
  const f = document.getElementById("v-filtro").value;
  const q = f === "todas" ? db.collection("vacunas").orderBy("fecha", "desc").limit(1000) : db.collection("vacunas").where("vigente", "==", true);
  _vacUnsub = q.onSnapshot(function (s) { _vacs = docsDe(s).filter(function (v) { return !v.eliminado; }); pintarVacunas(); },
    function (e) { console.error(e); toast(mensajeError(e), "error"); });
}
function pintarVacunas() {
  const q = document.getElementById("v-buscar").value, f = document.getElementById("v-filtro").value, t = document.getElementById("v-tipo").value;
  const vig = _vacs.filter(function (v) { return v.vigente; });
  const cuenta = function (e) { return vig.filter(function (v) { return estadoVacuna(v) === e; }).length; };
  document.getElementById("v-resumen").innerHTML =
    '<div class="chip-resumen"><small>Vencidas</small><b class="texto-danger">' + cuenta("vencida") + '</b></div><div class="chip-resumen"><small>Vencen en 30 días</small><b class="texto-warn">' + cuenta("proxima") +
    '</b></div><div class="chip-resumen"><small>Al día</small><b class="texto-ok">' + cuenta("aldia") + "</b></div>";
  const l = _vacs.filter(function (v) {
    if (["vencida", "proxima", "aldia"].indexOf(f) !== -1 && estadoVacuna(v) !== f) return false;
    return (!t || v.tipo === t) && coincide([v.mascota, v.dueno, v.tipo, v.producto].join(" "), q);
  });
  tabla("v-tabla", {
    filas: l, orden: f === "todas" ? "fecha" : "proximaDosis", dir: f === "todas" ? -1 : 1, vacio: "Sin registros", vacioIcono: "fa-shield-virus",
    alClic: function (v) { location.href = "paciente.html?id=" + v.mascotaId; },
    columnas: [
      { k: "mascota", t: "Paciente", r: function (v) { return "<b>" + escHTML(v.mascota) + "</b><br><small>" + escHTML(v.dueno || "") + "</small>"; } },
      { k: "tipo", t: "Vacuna", r: function (v) { return escHTML(v.tipo) + (v.producto ? "<br><small>" + escHTML(v.producto) + (v.lote ? " · lote " + escHTML(v.lote) : "") + "</small>" : ""); } },
      { k: "fecha", t: "Aplicada", r: function (v) { return fmtFechaCorta(v.fecha); }, v: function (v) { return aFecha(v.fecha); } },
      { k: "proximaDosis", t: "Próxima", r: function (v) { return fmtFechaCorta(v.proximaDosis) || "—"; }, v: function (v) { return aFecha(v.proximaDosis); } },
      { k: "estado", t: "Estado", v: function (v) { return ["vencida", "proxima", "aldia", "sin"].indexOf(estadoVacuna(v)); }, r: function (v) { return v.vigente ? pillVacuna(v) : pill("Reemplazada", "neutral"); } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (v) {
        return (v.telefono && v.vigente && v.proximaDosis ? btnIcono("fa-brands fa-whatsapp", "Recordar", "waVacuna('" + v.id + "')", "wa") : "") +
          (puede("clinica") ? btnIcono("fa-pen", "Editar", "abrirFormVacuna({id:'" + v.id + "'})") : "") +
          (esAdmin() ? btnIcono("fa-trash", "Eliminar", "eliminarVacuna('" + v.id + "')", "danger") : "");
      } }
    ]
  });
}
function estadoVacuna(v) {
  if (!v.proximaDosis) return "sin";
  const d = aFecha(v.proximaDosis), hoy = inicioDelDia();
  if (d < hoy) return "vencida";
  return d <= sumarDias(hoy, 30) ? "proxima" : "aldia";
}
function pillVacuna(v) { const e = estadoVacuna(v); return pill({ vencida: "Vencida", proxima: "Vence pronto", aldia: "Al día", sin: "Sin refuerzo" }[e], e); }
function waVacuna(id) {
  const v = _vacs.find(function (x) { return x.id === id; }); if (!v) return;
  const d = Datos.dueno(v.propietarioId);
  waPlantilla("vacuna", (d && d.telefono) || v.telefono, { nombre: String((d && d.nombre) || v.dueno || "").split(" ")[0], mascota: v.mascota, vacuna: v.tipo, fecha: fmtFechaCorta(v.proximaDosis) });
  db.collection("vacunas").doc(id).update({ avisadoEn: FS.serverTimestamp(), avisadoPor: window.MASCOTITA.usuario.nombre }).catch(function () {});
}
async function eliminarVacuna(id) {
  const v = _vacs.find(function (x) { return x.id === id; });
  if (!(await confirmar("¿Enviar el registro de " + v.tipo + " de " + v.mascota + " a la papelera?"))) return;
  await Datos.aPapelera("vacunas", id, v);
  await recalcularVigencia(v.mascotaId);
}
window.waVacuna = waVacuna; window.eliminarVacuna = eliminarVacuna;
document.addEventListener("DOMContentLoaded", initVacunas);
