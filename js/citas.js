/* =====================================================================
 * citas.js — Agenda con vistas Mes / Semana / Dia / Lista
 *  - Solo se descargan las citas del rango visible (antes: ultimas 500).
 *  - Tiempo real: lo que agenda recepcion aparece al instante en el consultorio.
 *  - Clic en un horario libre = nueva cita; color por veterinario;
 *    recordatorio masivo por WhatsApp de las citas de manana.
 * ===================================================================== */
const AG = { vista: "semana", ref: new Date(), citas: [], unsub: null, vet: "" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_C = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LUN = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

async function initCitas() {
  await protegerPagina({ permiso: "agenda", pagina: "citas.html" });
  await cargarConfig();
  Datos.suscribir("mascotas"); Datos.suscribir("propietarios");
  Datos.suscribir("usuarios", function () { pintarFiltroVetAg(); pintarAgenda(); });
  AG.vista = paramURL("vista") || (window.innerWidth < 700 ? "dia" : "semana");
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-calendar-days"></i> Agenda</h1><div class="head-actions">' +
    '<button class="btn btn-ghost" id="ag-manana"><i class="fa-brands fa-whatsapp"></i> Recordar citas de mañana</button>' +
    '<button class="btn btn-primary" id="ag-nueva"><i class="fa-solid fa-plus"></i> Nueva cita</button></div></div>' +
    '<div class="cal-barra"><div class="fila-flex"><button class="btn btn-ghost" id="ag-prev" aria-label="Anterior"><i class="fa-solid fa-chevron-left"></i></button>' +
    '<button class="btn btn-ghost" id="ag-hoy">Hoy</button><button class="btn btn-ghost" id="ag-next" aria-label="Siguiente"><i class="fa-solid fa-chevron-right"></i></button></div>' +
    '<h2 id="ag-titulo"></h2><span class="espaciador"></span>' +
    '<select id="ag-vet" class="input" style="width:auto"><option value="">Todos los veterinarios</option></select>' +
    '<div class="segmentado" id="ag-vistas"><button data-v="mes">Mes</button><button data-v="semana">Semana</button><button data-v="dia">Día</button><button data-v="lista">Lista</button></div></div>' +
    '<div id="ag-cuerpo">' + skeleton(8) + '</div><div class="leyenda" id="ag-leyenda"></div>';
  document.getElementById("ag-nueva").onclick = function () { abrirFormCita({}); };
  document.getElementById("ag-prev").onclick = function () { mover(-1); };
  document.getElementById("ag-next").onclick = function () { mover(1); };
  document.getElementById("ag-hoy").onclick = function () { AG.ref = new Date(); escucharRango(); };
  document.getElementById("ag-vet").onchange = function () { AG.vet = this.value; pintarAgenda(); };
  document.getElementById("ag-manana").onclick = recordarManana;
  document.querySelectorAll("#ag-vistas button").forEach(function (b) { b.onclick = function () { AG.vista = b.dataset.v; escucharRango(); }; });
  if (paramURL("nueva")) abrirFormCita({ mascotaId: paramURL("mascota") });
  escucharRango();
  setInterval(function () { if (AG.vista === "dia" || AG.vista === "semana") pintarAgenda(); }, 60000);   // linea de "ahora"
}
function mover(n) {
  const r = new Date(AG.ref);
  if (AG.vista === "mes") r.setMonth(r.getMonth() + n, 1);
  else if (AG.vista === "semana") r.setDate(r.getDate() + 7 * n);
  else if (AG.vista === "lista") r.setDate(r.getDate() + 14 * n);
  else r.setDate(r.getDate() + n);
  AG.ref = r; escucharRango();
}
function rango() {
  const r = new Date(AG.ref);
  if (AG.vista === "mes") {
    const ini = new Date(r.getFullYear(), r.getMonth(), 1); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7));
    return [ini, finDelDia(sumarDias(ini, 41))];
  }
  if (AG.vista === "semana") { const ini = inicioDelDia(sumarDias(r, -((r.getDay() + 6) % 7))); return [ini, finDelDia(sumarDias(ini, 6))]; }
  if (AG.vista === "lista") { const ini = inicioDelDia(r); return [ini, finDelDia(sumarDias(ini, 13))]; }
  return [inicioDelDia(r), finDelDia(r)];
}
function escucharRango() {
  if (AG.unsub) AG.unsub();
  const rg = rango();
  document.querySelectorAll("#ag-vistas button").forEach(function (b) { b.classList.toggle("activo", b.dataset.v === AG.vista); });
  const t = document.getElementById("ag-titulo");
  if (AG.vista === "mes") t.textContent = MESES[AG.ref.getMonth()] + " " + AG.ref.getFullYear();
  else if (AG.vista === "dia") t.textContent = fmtFechaLarga(AG.ref);
  else t.textContent = rg[0].getDate() + " " + MESES[rg[0].getMonth()].slice(0, 3) + " – " + rg[1].getDate() + " " + MESES[rg[1].getMonth()].slice(0, 3) + " " + rg[1].getFullYear();
  AG.unsub = db.collection("citas").where("fecha", ">=", TS.fromDate(rg[0])).where("fecha", "<=", TS.fromDate(rg[1])).orderBy("fecha").onSnapshot(function (s) {
    AG.citas = docsDe(s).filter(function (c) { return !c.eliminado; }); pintarAgenda();
  }, function (e) { console.error(e); toast(mensajeError(e), "error"); });
}
function pintarFiltroVetAg() {
  const s = document.getElementById("ag-vet"); if (!s) return;
  s.innerHTML = '<option value="">Todos los veterinarios</option>' + veterinarios().map(function (u) { return '<option value="' + u.id + '"' + (u.id === AG.vet ? " selected" : "") + ">" + escHTML(u.nombre) + "</option>"; }).join("");
  document.getElementById("ag-leyenda").innerHTML = veterinarios().map(function (u) { return '<span style="--c:' + colorVet(u.id) + '">' + escHTML(u.nombre) + "</span>"; }).join("") +
    '<span style="--c:var(--texto-tenue)">Sin asignar</span>';
}
function citasFiltradas() { return AG.citas.filter(function (c) { return !AG.vet || c.veterinarioUid === AG.vet; }); }
function colorCita(c) { return c.veterinarioUid ? colorVet(c.veterinarioUid) : "var(--texto-tenue)"; }
function claseEstado(c) { return (c.estado || "pendiente").replace(/\s/g, "-").replace("ó", "o"); }
function abrirCita(id) { abrirFormCita({ id: id }); }
window.abrirCita = abrirCita;

function pintarAgenda() {
  const cont = document.getElementById("ag-cuerpo"); if (!cont) return;
  const l = citasFiltradas();
  if (AG.vista === "mes") return pintarMes(cont, l);
  if (AG.vista === "lista") return pintarLista(cont, l);
  pintarGrilla(cont, l, AG.vista === "dia" ? 1 : 7);
}
function pintarMes(cont, l) {
  const rg = rango(); const mes = AG.ref.getMonth(); const hoy = hoyISO();
  let h = DIAS_LUN.map(function (d) { return '<div class="cal-head">' + d + "</div>"; }).join("");
  for (let i = 0; i < 42; i++) {
    const d = sumarDias(rg[0], i), iso = fechaInput(d);
    const del = l.filter(function (c) { return fechaInput(c.fecha) === iso; });
    h += '<div class="cal-cell' + (d.getMonth() !== mes ? " otro-mes" : "") + (iso === hoy ? " hoy" : "") + '" data-fecha="' + iso + '"><span class="cal-dia">' + d.getDate() + "</span>" +
      del.slice(0, 4).map(function (c) { return '<div class="cal-evento ' + claseEstado(c) + '" style="--c:' + colorCita(c) + '" data-id="' + c.id + '" title="' + escHTML(fmtHora(c.fecha) + " " + c.mascota + " · " + (c.servicio || "")) + '">' + fmtHora(c.fecha) + " " + escHTML(c.mascota || "") + "</div>"; }).join("") +
      (del.length > 4 ? '<div class="cal-mas">+' + (del.length - 4) + " más</div>" : "") + "</div>";
  }
  cont.innerHTML = '<div class="calendario">' + h + "</div>";
  cont.querySelectorAll(".cal-evento").forEach(function (e) { e.onclick = function (ev) { ev.stopPropagation(); abrirCita(e.dataset.id); }; });
  cont.querySelectorAll(".cal-cell").forEach(function (c) {
    c.onclick = function () {
      if (window.innerWidth < 700 || c.querySelector(".cal-evento")) { AG.ref = parseFechaLocal(c.dataset.fecha); AG.vista = "dia"; escucharRango(); }
      else abrirFormCita({ fecha: c.dataset.fecha });
    };
  });
}
function pintarGrilla(cont, l, ndias) {
  const c = cfg();
  const hIni = parseInt(c.agendaInicio || "07:00", 10), hFin = parseInt(c.agendaFin || "20:00", 10);
  const paso = Number(c.agendaIntervalo) || 30;
  const slotH = 44, pxMin = slotH / paso;
  const rg = rango(); const hoy = hoyISO();
  let cols = '<div class="ag-col-head"></div>';
  const dias = [];
  for (let i = 0; i < ndias; i++) { const d = sumarDias(rg[0], i); dias.push(d); cols += '<div class="ag-col-head' + (fechaInput(d) === hoy ? " hoy" : "") + '">' + DIAS_C[d.getDay()] + " " + d.getDate() + "</div>"; }
  let horas = '<div class="ag-horas">';
  for (let m = hIni * 60; m < hFin * 60; m += paso) horas += '<div class="ag-hora">' + (m % 60 === 0 ? String(Math.floor(m / 60)).padStart(2, "0") + ":00" : "") + "</div>";
  horas += "</div>";
  let cuerpo = "";
  dias.forEach(function (d) {
    const iso = fechaInput(d);
    let slots = "";
    for (let m = hIni * 60; m < hFin * 60; m += paso) slots += '<div class="ag-slot" data-f="' + iso + '" data-h="' + String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0") + '"></div>';
    const del = l.filter(function (x) { return fechaInput(x.fecha) === iso; });
    // Distribuir citas superpuestas en columnas
    const ev = del.map(function (x) { const f = aFecha(x.fecha); const ini = f.getHours() * 60 + f.getMinutes(); return { c: x, ini: ini, fin: ini + (Number(x.duracion) || paso), col: 0 }; })
      .sort(function (a, b) { return a.ini - b.ini; });
    ev.forEach(function (e, i) { const usadas = ev.slice(0, i).filter(function (o) { return o.fin > e.ini; }).map(function (o) { return o.col; }); while (usadas.indexOf(e.col) !== -1) e.col++; });
    const ncol = Math.max(1, ...ev.map(function (e) { return e.col + 1; }));
    const evH = ev.map(function (e) {
      const top = Math.max(0, (e.ini - hIni * 60) * pxMin), alto = Math.max(22, (e.fin - e.ini) * pxMin - 2);
      const w = 100 / ncol;
      return '<div class="ag-ev ' + claseEstado(e.c) + '" data-id="' + e.c.id + '" style="--c:' + colorCita(e.c) + ";top:" + top + "px;height:" + alto + "px;left:calc(" + (e.col * w) + "% + 2px);width:calc(" + w + '% - 4px);right:auto" title="' + escHTML(e.c.mascota + " · " + (e.c.servicio || "") + " · " + (e.c.veterinario || "")) + '">' +
        "<b>" + fmtHora(e.c.fecha) + " " + escHTML(e.c.mascota || "") + "</b><small>" + escHTML([e.c.servicio, e.c.estado !== "pendiente" ? e.c.estado : ""].filter(Boolean).join(" · ")) + "</small></div>";
    }).join("");
    let ahora = "";
    if (iso === hoy) { const n = new Date(); const mm = n.getHours() * 60 + n.getMinutes(); if (mm >= hIni * 60 && mm <= hFin * 60) ahora = '<div class="ag-ahora" style="top:' + ((mm - hIni * 60) * pxMin) + 'px"></div>'; }
    cuerpo += '<div class="ag-dia">' + slots + evH + ahora + "</div>";
  });
  cont.innerHTML = '<div class="agenda-grid" style="--slot-h:' + slotH + "px;grid-template-columns:54px repeat(" + ndias + ', minmax(' + (ndias === 1 ? 200 : 110) + 'px, 1fr))">' + cols + horas + cuerpo + "</div>";
  cont.querySelectorAll(".ag-slot").forEach(function (s) { s.onclick = function () { abrirFormCita({ fecha: s.dataset.f, hora: s.dataset.h, veterinarioUid: AG.vet }); }; });
  cont.querySelectorAll(".ag-ev").forEach(function (e) { e.onclick = function () { abrirCita(e.dataset.id); }; });
  // Llevar la vista a la hora actual / primera cita
  const g = cont.querySelector(".agenda-grid");
  const primera = l.length ? Math.min.apply(null, l.map(function (x) { const f = aFecha(x.fecha); return f.getHours() * 60 + f.getMinutes(); })) : new Date().getHours() * 60;
  const clave = AG.vista + fechaInput(rg[0]);
  if (AG._sk !== clave) { g.scrollTop = Math.max(0, (primera - hIni * 60 - 30) * pxMin); AG._sk = clave; }
  else g.scrollTop = AG._st || 0;
  g.onscroll = function () { AG._st = g.scrollTop; };
}
function pintarLista(cont, l) {
  if (!l.length) { cont.innerHTML = '<div class="card">' + vacio("No hay citas en estas dos semanas.", "fa-calendar", '<button class="btn btn-primary" onclick="abrirFormCita({})">Agendar</button>') + "</div>"; return; }
  let h = '<div class="card lista-citas" style="padding:0;overflow:hidden">', dia = "";
  l.forEach(function (c) {
    const iso = fechaInput(c.fecha);
    if (iso !== dia) { dia = iso; h += '<div class="dia-sep">' + escHTML(fmtFechaLarga(c.fecha)) + "</div>"; }
    h += '<div class="cita-item" style="--c:' + colorCita(c) + '" data-id="' + c.id + '"><span class="hora">' + fmtHora(c.fecha) + '</span><div class="info"><b>' + escHTML(c.mascota || "") + "</b> <small class=\"muted\">" + escHTML(c.dueno || "") + "</small><br><small>" +
      escHTML([c.servicio, c.veterinario, c.duracion ? c.duracion + " min" : ""].filter(Boolean).join(" · ")) + "</small></div>" + pill(c.estado || "pendiente", claseEstado(c)) + "</div>";
  });
  cont.innerHTML = h + "</div>";
  cont.querySelectorAll(".cita-item").forEach(function (e) { e.onclick = function () { abrirCita(e.dataset.id); }; });
}

/* Recordatorio de las citas de manana: cola de envio por WhatsApp. */
async function recordarManana() {
  const m = sumarDias(new Date(), 1);
  const s = await db.collection("citas").where("fecha", ">=", TS.fromDate(inicioDelDia(m))).where("fecha", "<=", TS.fromDate(finDelDia(m))).orderBy("fecha").get();
  const l = docsDe(s).filter(function (c) { return !c.eliminado && ["pendiente", "confirmada"].indexOf(c.estado || "pendiente") !== -1; });
  if (!l.length) { toast("No hay citas pendientes para mañana.", "info"); return; }
  const md = abrirModal({
    titulo: "Recordar citas de mañana (" + l.length + ")", ancho: "modal-lg",
    cuerpo: '<p class="lead" style="margin:0 0 12px">Cada botón abre WhatsApp con el mensaje listo. Se marcan como avisadas.</p><ul class="lista">' + l.map(function (c) {
      return '<li data-id="' + c.id + '"><span class="hora">' + fmtHora(c.fecha) + '</span><div class="info"><b>' + escHTML(c.mascota) + "</b><small>" + escHTML((c.dueno || "") + " · " + (c.telefono || "sin teléfono")) + "</small></div>" +
        (c.avisadoEn ? pill("Avisado", "ok") : "") + (c.telefono ? '<button class="btn btn-wa btn-sm" data-wa="' + c.id + '"><i class="fa-brands fa-whatsapp"></i> Enviar</button>' : "") + "</li>";
    }).join("") + "</ul>"
  });
  md.el.querySelectorAll("[data-wa]").forEach(function (b) {
    b.onclick = async function () {
      const c = l.find(function (x) { return x.id === b.dataset.wa; });
      await waPlantilla("recordatorio_cita", c.telefono, { nombre: String(c.dueno || "").split(" ")[0], mascota: c.mascota, fecha: fmtFechaCorta(c.fecha), hora: fmtHora(c.fecha) });
      db.collection("citas").doc(c.id).update({ avisadoEn: FS.serverTimestamp(), avisadoPor: window.MASCOTITA.usuario.nombre }).catch(function () {});
      b.outerHTML = pill("Avisado", "ok");
    };
  });
}
document.addEventListener("DOMContentLoaded", initCitas);
