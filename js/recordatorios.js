/* =====================================================================
 * recordatorios.js — Centro de recordatorios por WhatsApp
 * Cola de avisos de vacunas, controles y citas de manana. Cada envio
 * queda marcado (quien y cuando) para no avisar dos veces.
 * Sin servidor no se puede enviar solo: el boton "Enviar siguiente"
 * abre WhatsApp mensaje por mensaje, lo mas rapido posible.
 * ===================================================================== */
const RC = { tab: "vacunas", vacunas: [], controles: [], citas: [], cumples: [], unsubs: [] };

async function initRecordatorios() {
  await protegerPagina({ permiso: "recordatorios", pagina: "recordatorios.html" });
  Datos.suscribir("propietarios", pintarRec); Datos.suscribir("mascotas", function () { calcularCumples(); pintarRec(); });
  RC.tab = paramURL("tab") || "vacunas";
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-bell"></i> Recordatorios</h1><div class="head-actions">' +
    '<select id="rc-dias" class="input" style="width:auto"><option value="7">Próximos 7 días</option><option value="15" selected>Próximos 15 días</option><option value="30">Próximos 30 días</option></select>' +
    '<button class="btn btn-wa" id="rc-sig"><i class="fa-brands fa-whatsapp"></i> Enviar siguiente</button></div></div>' +
    '<p class="lead">Incluye vencidos de los últimos 60 días. Los ya avisados en la última semana se marcan en verde.</p>' +
    '<div class="tabs" id="rc-tabs"></div><div class="filtros"><input type="search" id="rc-buscar" placeholder="Filtrar por paciente o dueño..."><label class="chk-inline"><input type="checkbox" id="rc-pend" checked> Solo sin avisar</label></div><div id="rc-cuerpo">' + skeleton(6) + "</div>";
  document.getElementById("rc-dias").onchange = function () { escucharRec(); calcularCumples(); pintarRec(); };
  document.getElementById("rc-buscar").oninput = debounce(pintarRec, 150);
  document.getElementById("rc-pend").onchange = pintarRec;
  document.getElementById("rc-sig").onclick = enviarSiguiente;
  escucharRec();
  Datos.listo("mascotas").then(function () { calcularCumples(); pintarRec(); });
}
function escucharRec() {
  RC.unsubs.forEach(function (u) { u(); }); RC.unsubs = [];
  const n = Number(document.getElementById("rc-dias").value);
  const hoy = inicioDelDia(), desde = TS.fromDate(sumarDias(hoy, -60)), hasta = TS.fromDate(finDelDia(sumarDias(hoy, n)));
  RC.unsubs.push(db.collection("vacunas").where("vigente", "==", true).where("proximaDosis", ">=", desde).where("proximaDosis", "<=", hasta).orderBy("proximaDosis").onSnapshot(function (s) {
    RC.vacunas = docsDe(s).filter(function (v) { return !v.eliminado; }).map(function (v) {
      return { col: "vacunas", id: v.id, fecha: v.proximaDosis, mascotaId: v.mascotaId, mascota: v.mascota, propietarioId: v.propietarioId, dueno: v.dueno, tel: v.telefono, det: v.tipo, avisadoEn: v.avisadoEn, avisadoPor: v.avisadoPor, plantilla: "vacuna", vacuna: v.tipo };
    }); pintarRec();
  }, function (e) { toast(mensajeError(e), "error"); }));
  RC.unsubs.push(db.collection("consultas").where("proximoControl", ">=", TS.fromDate(sumarDias(hoy, -15))).where("proximoControl", "<=", hasta).orderBy("proximoControl").onSnapshot(function (s) {
    RC.controles = docsDe(s).filter(function (c) { return !c.eliminado; }).map(function (c) {
      return { col: "consultas", id: c.id, fecha: c.proximoControl, mascotaId: c.mascotaId, mascota: c.mascota, propietarioId: c.propietarioId, dueno: c.dueno, det: c.diagnostico || c.motivo, avisadoEn: c.avisadoEn, avisadoPor: c.avisadoPor, plantilla: "control" };
    }); pintarRec();
  }, function (e) { toast(mensajeError(e), "error"); }));
  const m = sumarDias(hoy, 1);
  RC.unsubs.push(db.collection("citas").where("fecha", ">=", TS.fromDate(m)).where("fecha", "<=", TS.fromDate(finDelDia(m))).orderBy("fecha").onSnapshot(function (s) {
    RC.citas = docsDe(s).filter(function (c) { return !c.eliminado && ["pendiente", "confirmada"].indexOf(c.estado || "pendiente") !== -1; }).map(function (c) {
      return { col: "citas", id: c.id, fecha: c.fecha, mascotaId: c.mascotaId, mascota: c.mascota, propietarioId: c.propietarioId, dueno: c.dueno, tel: c.telefono, det: c.servicio, avisadoEn: c.avisadoEn, avisadoPor: c.avisadoPor, plantilla: "recordatorio_cita", conHora: true };
    }); pintarRec();
  }, function (e) { toast(mensajeError(e), "error"); }));
}
function calcularCumples() {
  const sel = document.getElementById("rc-dias"); if (!sel) return;
  const n = Number(sel.value), hoy = inicioDelDia(), anio = hoy.getFullYear();
  RC.cumples = [];
  Datos.lista("mascotas").forEach(function (m) {
    const fn = aFecha(m.fechaNacimiento); if (!fn || m.estadoVital === "fallecido") return;
    [anio, anio + 1].forEach(function (a) {
      const f = new Date(a, fn.getMonth(), fn.getDate());
      const d = diasEntre(hoy, f);
      if (d < -3 || d > n || a - fn.getFullYear() < 1) return;
      RC.cumples.push({ col: "mascotas", id: m.id, fecha: TS.fromDate(f), mascotaId: m.id, mascota: m.nombre, propietarioId: m.propietarioId, det: "Cumple " + (a - fn.getFullYear()) + " año" + (a - fn.getFullYear() > 1 ? "s" : ""),
        edad: (a - fn.getFullYear()) + " año" + (a - fn.getFullYear() > 1 ? "s" : ""), avisadoEn: m.cumpleAvisado === String(a) ? m.cumpleAvisadoEn || TS.now() : null, avisadoPor: m.cumpleAvisado === String(a) ? m.cumpleAvisadoPor : "", plantilla: "cumple", anio: a });
    });
  });
}
function telDe(x) { const d = Datos.dueno(x.propietarioId); return (d && d.telefono) || x.tel || ""; }
function duenoDe(x) { const d = Datos.dueno(x.propietarioId); return (d && d.nombre) || x.dueno || ""; }
function avisadoReciente(x) { const a = aFecha(x.avisadoEn); return a && a > sumarDias(new Date(), -7); }
function listaRec() {
  const q = document.getElementById("rc-buscar").value, pend = document.getElementById("rc-pend").checked;
  return RC[RC.tab].filter(function (x) {
    const m = x.mascotaId ? Datos.mascota(x.mascotaId) : null;
    if (m && (m.eliminado || m.estadoVital === "fallecido")) return false;
    return (!pend || !avisadoReciente(x)) && coincide([x.mascota, duenoDe(x), x.det].join(" "), q);
  });
}
function pintarRec() {
  if (!document.getElementById("rc-tabs")) return;
  const cnt = function (k) { return RC[k].filter(function (x) { return !avisadoReciente(x); }).length; };
  document.getElementById("rc-tabs").innerHTML = [["vacunas", "Vacunas", "fa-shield-virus"], ["controles", "Controles", "fa-notes-medical"], ["citas", "Citas de mañana", "fa-calendar-day"], ["cumples", "Cumpleaños", "fa-cake-candles"]].map(function (t) {
    return '<button class="tab' + (RC.tab === t[0] ? " activo" : "") + '" data-t="' + t[0] + '"><i class="fa-solid ' + t[2] + '"></i> ' + t[1] + ' <span class="cnt">' + cnt(t[0]) + "</span></button>";
  }).join("");
  document.querySelectorAll("#rc-tabs .tab").forEach(function (b) { b.onclick = function () { RC.tab = b.dataset.t; pintarRec(); }; });
  const hoy = inicioDelDia();
  tabla("rc-cuerpo", {
    filas: listaRec(), orden: "fecha", vacio: "No hay recordatorios pendientes acá. ¡Bien!", vacioIcono: "fa-circle-check",
    columnas: [
      { k: "fecha", t: RC.tab === "citas" ? "Cita" : "Fecha", v: function (x) { return aFecha(x.fecha); }, r: function (x) {
        const d = aFecha(x.fecha); const venc = d < hoy;
        return (x.conHora ? fmtFecha(d) : fmtFechaCorta(d)) + (venc && !x.conHora ? " " + pill("hace " + diasEntre(d, hoy) + " d", "danger") : "");
      } },
      { k: "mascota", t: "Paciente", r: function (x) { return x.mascotaId ? '<a class="link" href="paciente.html?id=' + x.mascotaId + '">' + escHTML(x.mascota) + "</a>" : escHTML(x.mascota); } },
      { k: "det", t: "Detalle" },
      { k: "dueno", t: "Dueño", v: duenoDe, r: function (x) { const t = telDe(x); return escHTML(duenoDe(x)) + "<br><small>" + (t ? escHTML(t) : '<span class="texto-danger">sin teléfono</span>') + "</small>"; } },
      { k: "avisadoEn", t: "Aviso", v: function (x) { return aFecha(x.avisadoEn); }, r: function (x) { return x.avisadoEn ? pill(fmtFechaCorta(x.avisadoEn), avisadoReciente(x) ? "ok" : "neutral") + "<br><small>" + escHTML(x.avisadoPor || "") + "</small>" : "—"; } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (x) { return telDe(x) ? '<button class="btn btn-wa btn-sm" onclick="avisar(\'' + x.col + "','" + x.id + '\')"><i class="fa-brands fa-whatsapp"></i> Avisar</button>' : ""; } }
    ]
  });
}
async function avisar(col, id) {
  const x = RC[RC.tab].find(function (r) { return r.col === col && r.id === id; }) || RC.vacunas.concat(RC.controles, RC.citas, RC.cumples).find(function (r) { return r.id === id; });
  if (!x) return;
  const ok = await waPlantilla(x.plantilla, telDe(x), { nombre: duenoDe(x).split(" ")[0], mascota: x.mascota, fecha: fmtFechaCorta(x.fecha), hora: fmtHora(x.fecha), vacuna: x.vacuna || "", edad: x.edad || "" });
  if (ok) {
    x.avisadoEn = new Date(); x.avisadoPor = window.MASCOTITA.usuario.nombre;
    const up = col === "mascotas" ? { cumpleAvisado: String(x.anio), cumpleAvisadoEn: FS.serverTimestamp(), cumpleAvisadoPor: window.MASCOTITA.usuario.nombre } : { avisadoEn: FS.serverTimestamp(), avisadoPor: window.MASCOTITA.usuario.nombre };
    escribir(db.collection(col).doc(id).update(up)).catch(function () {});
    registrarAuditoria("editar", "recordatorios", "Avisó por WhatsApp: " + x.mascota + " (" + (x.det || col) + ")");
    pintarRec();
  }
}
function enviarSiguiente() {
  const l = listaRec().filter(function (x) { return telDe(x) && !avisadoReciente(x); }).sort(function (a, b) { return aFecha(a.fecha) - aFecha(b.fecha); });
  if (!l.length) { toast("No quedan avisos pendientes en esta pestaña.", "ok"); return; }
  avisar(l[0].col, l[0].id);
  if (l.length > 1) toast("Quedan " + (l.length - 1) + ". Volvé a esta pestaña y tocá \"Enviar siguiente\".", "info");
}
window.avisar = avisar;
document.addEventListener("DOMContentLoaded", initRecordatorios);
