/* =====================================================================
 * internacion.js — Pacientes internados
 *  - Ingreso con motivo, jaula, precio por dia y plan de tratamiento
 *    (medicamento, dosis, via, cada X horas).
 *  - Hoja de tratamiento del dia: cada toma programada se marca como dada
 *    u omitida (quien y cuando). Atrasadas en rojo.
 *  - Evolucion con signos vitales.
 *  - Alta: calcula dias, pasa a cobro y avisa al dueno por WhatsApp.
 * Colecciones: internaciones, internacion_registros (inalterable).
 * ===================================================================== */
const VIAS = ["Oral", "SC", "IM", "IV", "Tópica", "Oftálmica", "Ótica", "Inhalatoria", "Rectal"];
const INT = { activos: [], altas: [], registros: {}, unsubs: {}, tab: "activos" };

async function initInternacion() {
  await protegerPagina({ permiso: "clinica_ver", pagina: "internacion.html" });
  await cargarConfig();
  Datos.suscribir("mascotas"); Datos.suscribir("propietarios"); Datos.suscribir("usuarios"); Datos.suscribir("servicios"); Datos.suscribir("productos");
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-bed-pulse"></i> Internación</h1><div class="head-actions">' +
    (puede("clinica") ? '<button class="btn btn-primary" id="in-nuevo"><i class="fa-solid fa-plus"></i> Nuevo ingreso</button>' : "") + "</div></div>" +
    '<div class="kpis" id="in-kpis"></div>' +
    '<div class="tabs"><button class="tab" data-t="activos"><i class="fa-solid fa-bed"></i> Internados</button><button class="tab" data-t="altas"><i class="fa-solid fa-house-medical-circle-check"></i> Altas recientes</button></div>' +
    '<div id="in-cuerpo">' + skeleton(4, "sk-card") + "</div>";
  const bn = document.getElementById("in-nuevo"); if (bn) bn.onclick = function () { abrirFormInternacion({}); };
  document.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { INT.tab = t.dataset.t; pintarInternacion(); }; });
  db.collection("internaciones").where("estado", "==", "internado").onSnapshot(function (s) {
    INT.activos = docsDe(s).filter(function (x) { return !x.eliminado; }).sort(function (a, b) { return aFecha(a.ingreso) - aFecha(b.ingreso); });
    // registros de cada internado (para calcular pendientes y atrasadas)
    const ids = INT.activos.map(function (x) { return x.id; });
    Object.keys(INT.unsubs).forEach(function (id) { if (ids.indexOf(id) === -1) { INT.unsubs[id](); delete INT.unsubs[id]; delete INT.registros[id]; } });
    ids.forEach(function (id) {
      if (INT.unsubs[id]) return;
      INT.unsubs[id] = db.collection("internacion_registros").where("internacionId", "==", id).onSnapshot(function (r) { INT.registros[id] = docsDe(r); pintarInternacion(); refrescarHoja(id); }, function (e) { console.warn(e); });
    });
    pintarInternacion();
  }, function (e) { toast(mensajeError(e), "error"); });
  db.collection("internaciones").orderBy("ingreso", "desc").limit(60).onSnapshot(function (s) {
    INT.altas = docsDe(s).filter(function (x) { return x.estado === "alta" && !x.eliminado; }); if (INT.tab === "altas") pintarInternacion();
  }, function () {});
  if (paramURL("nuevo") && puede("clinica")) abrirFormInternacion({ mascotaId: paramURL("mascota") });
  setInterval(pintarInternacion, 60000);
}

/* ---------- Calculo de tomas ---------- */
function tomasDelDia(t, dia) {
  const step = (Number(t.cadaHoras) || 0) * 3600000;
  if (!step || t.activo === false && !t.suspendidoEn) return [];
  const ini = aFecha(t.desde); if (!ini) return [];
  const d0 = inicioDelDia(dia).getTime(), d1 = d0 + 86400000;
  let fin = t.hasta ? aFecha(t.hasta).getTime() : Infinity;
  if (t.activo === false && t.suspendidoEn) fin = Math.min(fin, aFecha(t.suspendidoEn).getTime());
  const r = [];
  let k = Math.max(0, Math.ceil((d0 - ini.getTime()) / step));
  for (let x = ini.getTime() + k * step; x < d1 && x <= fin; x += step) if (x >= d0) r.push(new Date(x));
  return r;
}
function registroDe(intId, tratId, fecha) {
  return (INT.registros[intId] || []).find(function (r) { return r.tipo === "dosis" && r.tratamientoId === tratId && aFecha(r.programada) && aFecha(r.programada).getTime() === fecha.getTime(); });
}
function resumenTomas(it) {
  const ahora = new Date(), en2h = new Date(ahora.getTime() + 2 * 3600000);
  let atrasadas = 0, proximas = [], hechasHoy = 0;
  (it.tratamientos || []).forEach(function (t) {
    [sumarDias(ahora, -1), ahora].forEach(function (dia) {
      tomasDelDia(t, dia).forEach(function (f) {
        const r = registroDe(it.id, t.id, f);
        if (r) { if (fechaInput(f) === hoyISO()) hechasHoy++; return; }
        if (f < ahora && f > sumarDias(ahora, -1) && aFecha(it.ingreso).getTime() - 3600000 <= f) atrasadas++;
        else if (f >= ahora && f <= en2h) proximas.push({ t: t, f: f });
      });
    });
  });
  proximas.sort(function (a, b) { return a.f - b.f; });
  return { atrasadas: atrasadas, proximas: proximas, hechasHoy: hechasHoy };
}
function diasInternado(it, hasta) {
  const ms = (aFecha(hasta || it.egreso) || new Date()) - (aFecha(it.ingreso) || new Date());
  return Math.max(1, Math.ceil(ms / 86400000));
}

function pintarInternacion() {
  if (!document.getElementById("in-cuerpo")) return;
  document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("activo", t.dataset.t === INT.tab); });
  let atr = 0, prox = 0;
  INT.activos.forEach(function (it) { const r = resumenTomas(it); atr += r.atrasadas; prox += r.proximas.length; });
  document.getElementById("in-kpis").innerHTML =
    '<div class="kpi"><i class="fa-solid fa-bed-pulse"></i><div><span class="kpi-valor">' + INT.activos.length + '</span><span class="kpi-label">Internados ahora</span></div></div>' +
    '<div class="kpi ' + (atr ? "rojo" : "") + '"><i class="fa-solid fa-clock"></i><div><span class="kpi-valor">' + atr + '</span><span class="kpi-label">Dosis atrasadas</span></div></div>' +
    '<div class="kpi azul"><i class="fa-solid fa-syringe"></i><div><span class="kpi-valor">' + prox + '</span><span class="kpi-label">Dosis en las próximas 2 h</span></div></div>';
  const cont = document.getElementById("in-cuerpo");
  if (INT.tab === "altas") {
    tabla(cont, { filas: INT.altas, orden: "egreso", dir: -1, vacio: "Sin altas recientes.", alClic: function (it) { abrirHoja(it.id, true); },
      columnas: [
        { k: "mascota", t: "Paciente", r: function (it) { return "<b>" + escHTML(it.mascota) + "</b><br><small>" + escHTML(it.dueno || "") + "</small>"; } },
        { k: "ingreso", t: "Ingreso", r: function (it) { return fmtFecha(it.ingreso); }, v: function (it) { return aFecha(it.ingreso); } },
        { k: "egreso", t: "Alta", r: function (it) { return fmtFecha(it.egreso); }, v: function (it) { return aFecha(it.egreso); } },
        { k: "dias", t: "Días", cls: "num", v: function (it) { return diasInternado(it); }, r: function (it) { return diasInternado(it); } },
        { k: "motivo", t: "Motivo" },
        { k: "porCobrar", t: "Cobro", r: function (it) { return it.porCobrar ? pill("Pendiente", "warn") : it.facturaId ? pill("Cobrada", "ok") : pill("—", "neutral"); } }
      ] });
    return;
  }
  if (!INT.activos.length) { cont.innerHTML = '<div class="card">' + vacio("No hay pacientes internados.", "fa-bed", puede("clinica") ? '<button class="btn btn-primary" onclick="abrirFormInternacion({})">Registrar ingreso</button>' : "") + "</div>"; return; }
  cont.innerHTML = '<div class="grid-cards">' + INT.activos.map(function (it) {
    const r = resumenTomas(it), m = Datos.mascota(it.mascotaId);
    return '<div class="card" style="cursor:pointer" onclick="abrirHoja(\'' + it.id + '\')"><div class="celda-m">' + Datos.avatarMascota(m || {}, "") +
      '<div style="flex:1"><b style="font-size:16px">' + escHTML(it.mascota) + "</b>" + (it.jaula ? " " + pill("Jaula " + it.jaula, "info") : "") +
      "<br><small class=\"muted\">" + escHTML((it.dueno || "") + " · día " + diasInternado(it) + " · " + (it.veterinario || "")) + "</small></div></div>" +
      '<p style="margin:10px 0 6px">' + escHTML(it.motivo || "") + "</p>" + alertaMascotaHTML(m) +
      '<div class="fila-flex" style="margin-top:8px">' + (r.atrasadas ? pill(r.atrasadas + " atrasada(s)", "danger") : pill("Al día", "ok")) +
      (r.proximas.length ? pill("Próx: " + fmtHora(r.proximas[0].f) + " " + r.proximas[0].t.medicamento, "warn") : "") + pill(r.hechasHoy + " dadas hoy", "neutral") + "</div></div>";
  }).join("") + "</div>";
}

/* ---------- Ingreso / edicion ---------- */
function _horaRedonda() { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, "0"); }
function lineaTratHTML(t) {
  t = t || {};
  return '<div class="linea" style="grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) 100px 90px 120px 34px" data-id="' + escHTML(t.id || "") + '">' +
    '<input class="t-med" list="dl-productos-int" placeholder="Medicamento / indicación" value="' + escHTML(t.medicamento || "") + '">' +
    '<input class="t-dosis" placeholder="Dosis (ej: 0,5 ml)" value="' + escHTML(t.dosis || "") + '">' +
    '<select class="t-via">' + VIAS.map(function (v) { return "<option" + (v === (t.via || "Oral") ? " selected" : "") + ">" + v + "</option>"; }).join("") + "</select>" +
    '<select class="t-cada" title="Frecuencia">' + [[0, "A demanda"], [4, "c/4 h"], [6, "c/6 h"], [8, "c/8 h"], [12, "c/12 h"], [24, "c/24 h"]].map(function (o) { return '<option value="' + o[0] + '"' + (Number(t.cadaHoras || 8) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
    '<input class="t-desde" type="time" title="Primera toma" value="' + (t.desde ? horaInput(t.desde) : _horaRedonda()) + '">' +
    '<button type="button" class="btn-icono danger t-del" title="Quitar"><i class="fa-solid fa-trash"></i></button></div>';
}
function leerTratamientos(raiz, previos, fechaBase) {
  return Array.from(raiz.querySelectorAll(".linea[data-id]")).map(function (row) {
    const id = row.dataset.id || Math.random().toString(36).slice(2, 10);
    const prev = (previos || []).find(function (x) { return x.id === id; });
    const hora = row.querySelector(".t-desde").value || "08:00";
    let desde;
    if (prev && horaInput(prev.desde) === hora) desde = prev.desde;
    else { const d = new Date(fechaBase || new Date()); const h = hora.split(":"); d.setHours(Number(h[0]), Number(h[1]), 0, 0); desde = TS.fromDate(d); }
    return { id: id, medicamento: row.querySelector(".t-med").value.trim(), dosis: row.querySelector(".t-dosis").value.trim(), via: row.querySelector(".t-via").value,
      cadaHoras: Number(row.querySelector(".t-cada").value), desde: desde, activo: prev ? prev.activo !== false : true, suspendidoEn: prev && prev.suspendidoEn || null };
  }).filter(function (t) { return t.medicamento; });
}
async function abrirFormInternacion(op) {
  op = op || {};
  await prepararDatosClinicos();
  let it = {};
  if (op.id) { const s = await db.collection("internaciones").doc(op.id).get(); it = Object.assign({ id: s.id }, s.data()); }
  const sDia = Datos.lista("servicios").find(function (x) { return /internaci/i.test(x.nombre); });
  const vet = opcionesVet(it.veterinarioUid);
  const ov = modalForm(op.id ? "Editar internación" : "Nuevo ingreso a internación",
    '<div class="form-field"><label>Paciente <span class="req">*</span></label><div id="sel-masc-in"></div><div id="in-alerta"></div></div>' +
    '<div class="grid-3">' + (vet.lista.length ? selectCampo("ivet", "Veterinario/a responsable", vet.lista, vet.sel, { vacio: "—" }) : campo("ivetTxt", "Veterinario/a", it.veterinario)) +
    campo("ijaula", "Jaula / box", it.jaula) + campo("iprecio", "Precio por día (Gs)", it.precioDia != null ? it.precioDia : (sDia ? sDia.precio : ""), "number", { min: 0 }) +
    campo("iingreso", "Ingreso", it.ingreso ? fechaInput(it.ingreso) + "T" + horaInput(it.ingreso) : "", "datetime-local", { ayuda: op.id ? "" : "Vacío = ahora" }) +
    campo("ipeso", "Peso al ingreso (kg)", it.peso || "", "number", { min: 0 }) + campo("idieta", "Dieta / ayuno", it.dieta) + "</div>" +
    areaCampo("imotivo", "Motivo de internación", it.motivo, { req: true }) + areaCampo("idiag", "Diagnóstico", it.diagnostico) +
    '<div class="seccion-form"><i class="fa-solid fa-prescription-bottle-medical"></i> Plan de tratamiento</div>' +
    '<div class="lineas" id="in-trat">' + (it.tratamientos || []).map(lineaTratHTML).join("") + "</div>" +
    '<button type="button" class="btn btn-ghost btn-sm mt" id="in-add"><i class="fa-solid fa-plus"></i> Agregar medicación</button>' +
    datalist("dl-productos-int", Datos.lista("productos").map(function (p) { return p.nombre; })) +
    '<div style="margin-top:14px"></div>' + areaCampo("inotas", "Notas / cuidados", it.notas), {
      ancho: "modal-xl",
      onGuardar: async function () {
        const m = selM.get(); if (!m) throw errorUsuario("Elegí el paciente.");
        if (!op.id && INT.activos.find(function (x) { return x.mascotaId === m.id; })) throw errorUsuario(m.nombre + " ya está internado/a.");
        const due = Datos.duenoDe(m), vetUid = val("ivet"), fi = val("iingreso");
        const ingreso = fi ? TS.fromDate(new Date(fi)) : (it.ingreso || TS.now());
        const datos = {
          mascotaId: m.id, mascota: m.nombre, propietarioId: m.propietarioId || "", dueno: due ? due.nombre : "", telefono: due ? due.telefono || "" : "",
          veterinarioUid: vetUid || "", veterinario: vetUid ? nombreUsuario(vetUid) : val("ivetTxt"), jaula: val("ijaula"), precioDia: num("iprecio"),
          ingreso: ingreso, peso: numONull("ipeso"), dieta: val("idieta"), motivo: val("imotivo"), diagnostico: val("idiag"), notas: val("inotas"),
          tratamientos: leerTratamientos(ov.el, it.tratamientos, aFecha(ingreso) > new Date() ? aFecha(ingreso) : new Date())
        };
        if (op.id) await actualizarDoc("internaciones", op.id, datos);
        else { datos.estado = "internado"; datos.egreso = null; await crearDoc("internaciones", datos); }
        registrarAuditoria(op.id ? "editar" : "crear", "internacion", (op.id ? "Editó internación de " : "Internó a ") + m.nombre);
        toast(op.id ? "Internación actualizada." : m.nombre + " internado/a.", "ok");
      }
    });
  const selM = Datos.selectorMascota("sel-masc-in", { valor: it.mascotaId || op.mascotaId, req: true, onChange: function (m) { document.getElementById("in-alerta").innerHTML = alertaMascotaHTML(m); if (m && m.peso && !el("ipeso").value) el("ipeso").value = m.peso; } });
  document.getElementById("in-alerta").innerHTML = alertaMascotaHTML(selM.get());
  const tc = document.getElementById("in-trat");
  function eng() { tc.querySelectorAll(".t-del").forEach(function (b) { b.onclick = function () { b.closest(".linea").remove(); }; }); }
  document.getElementById("in-add").onclick = function () { tc.insertAdjacentHTML("beforeend", lineaTratHTML()); tc.lastElementChild.dataset.id = ""; eng(); tc.querySelector(".linea:last-child .t-med").focus(); };
  if (!(it.tratamientos || []).length) { tc.insertAdjacentHTML("beforeend", lineaTratHTML()); tc.lastElementChild.dataset.id = ""; }
  eng();
  // las filas nuevas llevan data-id vacio => se les asigna un id al guardar
  tc.querySelectorAll(".linea").forEach(function (l) { if (!l.hasAttribute("data-id")) l.setAttribute("data-id", ""); });
}

/* ---------- Hoja de tratamiento ---------- */
let _hoja = null;
function abrirHoja(id, soloLectura) {
  const it = INT.activos.concat(INT.altas).find(function (x) { return x.id === id; }); if (!it) return;
  if (!INT.registros[id] && !INT.unsubs[id]) INT.unsubs[id] = db.collection("internacion_registros").where("internacionId", "==", id).onSnapshot(function (r) { INT.registros[id] = docsDe(r); refrescarHoja(id); });
  const clin = puede("clinica") && it.estado === "internado";
  const m = abrirModal({
    tituloHTML: '<i class="fa-solid fa-bed-pulse"></i> ' + escHTML(it.mascota) + (it.jaula ? " " + pill("Jaula " + it.jaula, "info") : "") + " " + pill(it.estado === "alta" ? "Alta" : "Día " + diasInternado(it), it.estado === "alta" ? "ok" : "warn"),
    ancho: "modal-xl", cuerpo: '<div id="hoja-cuerpo"></div>',
    pie: clin ? '<div class="izq fila-flex"><button class="btn btn-ghost" id="h-edit"><i class="fa-solid fa-pen"></i> Editar plan</button><button class="btn btn-ghost" id="h-evo"><i class="fa-solid fa-notes-medical"></i> Evolución</button></div>' +
      '<button class="btn btn-primary" id="h-alta"><i class="fa-solid fa-house-medical-circle-check"></i> Dar de alta</button>' : "",
    alCerrar: function () { _hoja = null; }
  });
  _hoja = { id: id, m: m, dia: new Date(), solo: soloLectura || !clin };
  if (clin) {
    m.q("#h-edit").onclick = function () { m.cerrar(); abrirFormInternacion({ id: id }); };
    m.q("#h-evo").onclick = function () { abrirEvolucion(it); };
    m.q("#h-alta").onclick = function () { darAlta(it, m); };
  }
  refrescarHoja(id);
}
function refrescarHoja(id) {
  if (!_hoja || _hoja.id !== id) return;
  const it = INT.activos.concat(INT.altas).find(function (x) { return x.id === id; }); if (!it) return;
  const cont = _hoja.m.q("#hoja-cuerpo"); if (!cont) return;
  const dia = _hoja.dia, ahora = new Date(), regs = INT.registros[id] || [];
  const trats = it.tratamientos || [];
  let filas = trats.map(function (t) {
    const tomas = tomasDelDia(t, dia).filter(function (f) { return f >= aFecha(it.ingreso).getTime() - 3600000 && (!it.egreso || f <= aFecha(it.egreso)); });
    const celdas = tomas.map(function (f) {
      const r = registroDe(id, t.id, f);
      if (r) return '<span class="toma ' + (r.omitida ? "omitida" : "dada") + '" title="' + escHTML((r.omitida ? "Omitida: " + (r.texto || "") : "Dada") + " · " + (r.usuario || "") + " " + fmtHora(r.fecha)) + '"><i class="fa-solid ' + (r.omitida ? "fa-ban" : "fa-check") + '"></i> ' + fmtHora(f) + "</span>";
      const tarde = f < ahora;
      return '<button class="toma ' + (tarde ? "atrasada" : "pendiente") + '"' + (_hoja.solo ? " disabled" : "") + ' data-t="' + t.id + '" data-f="' + f.getTime() + '">' + (tarde ? '<i class="fa-solid fa-clock"></i> ' : "") + fmtHora(f) + "</button>";
    }).join("");
    const extra = Number(t.cadaHoras) ? "" : (_hoja.solo ? "" : '<button class="toma pendiente" data-t="' + t.id + '" data-f="ahora"><i class="fa-solid fa-plus"></i> Registrar dosis</button>') +
      regs.filter(function (r) { return r.tratamientoId === t.id && fechaInput(r.fecha) === fechaInput(dia); }).map(function (r) { return '<span class="toma dada"><i class="fa-solid fa-check"></i> ' + fmtHora(r.fecha) + "</span>"; }).join("");
    return '<tr><td><b>' + escHTML(t.medicamento) + "</b>" + (t.activo === false ? " " + pill("Suspendido", "neutral") : "") + "<br><small>" + escHTML([t.dosis, t.via, Number(t.cadaHoras) ? "c/" + t.cadaHoras + " h" : "a demanda"].filter(Boolean).join(" · ")) + "</small></td>" +
      '<td><div class="tomas">' + (celdas || extra || '<span class="muted">Sin tomas este día</span>') + "</div></td>" +
      (_hoja.solo ? "" : '<td class="acciones">' + (t.activo === false ? "" : btnIcono("fa-pause", "Suspender", "suspenderTrat('" + id + "','" + t.id + "')")) + "</td>") + "</tr>";
  }).join("");
  const evos = regs.filter(function (r) { return r.tipo === "evolucion"; }).sort(function (a, b) { return aFecha(b.fecha) - aFecha(a.fecha); });
  cont.innerHTML =
    '<div class="ficha-datos" style="margin-top:0"><div><small>Dueño</small>' + escHTML(it.dueno || "") + "</div><div><small>Ingreso</small>" + fmtFecha(it.ingreso) + "</div><div><small>Responsable</small>" + escHTML(it.veterinario || "—") +
    "</div><div><small>Peso</small>" + (it.peso ? fmtNum(it.peso) + " kg" : "—") + "</div><div><small>Dieta</small>" + escHTML(it.dieta || "—") + "</div><div><small>Precio/día</small>" + fmtMoneda(it.precioDia) + "</div></div>" +
    '<p class="mt"><b>Motivo:</b> ' + escHTML(it.motivo || "") + (it.diagnostico ? " · <b>Dx:</b> " + escHTML(it.diagnostico) : "") + "</p>" + alertaMascotaHTML(Datos.mascota(it.mascotaId)) +
    '<div class="cal-barra mt"><div class="fila-flex"><button class="btn btn-ghost btn-sm" id="h-prev"><i class="fa-solid fa-chevron-left"></i></button><button class="btn btn-ghost btn-sm" id="h-hoy">Hoy</button><button class="btn btn-ghost btn-sm" id="h-next"><i class="fa-solid fa-chevron-right"></i></button></div>' +
    "<h2 style=\"font-size:16px\">Hoja de tratamiento · " + escHTML(fmtFechaLarga(dia)) + "</h2></div>" +
    (trats.length ? '<div class="table-wrap"><table class="tabla"><thead><tr><th>Medicación</th><th>Tomas del día</th>' + (_hoja.solo ? "" : "<th></th>") + "</tr></thead><tbody>" + filas + "</tbody></table></div>" : vacio("Sin plan de tratamiento cargado.", "fa-prescription-bottle-medical")) +
    '<div class="seccion-form mt"><i class="fa-solid fa-notes-medical"></i> Evolución (' + evos.length + ")</div>" +
    (evos.length ? '<div class="timeline">' + evos.map(function (r) {
      const v = r.vitales || {};
      return '<div class="tl-item"><div class="tl-dot"><i class="fa-solid fa-notes-medical"></i></div><div class="tl-card"><div class="tl-top"><b>' + fmtFecha(r.fecha) + "</b><small>" + escHTML(r.usuario || "") + "</small></div>" +
        _vitTexto(v) + (r.texto ? "<p>" + escHTML(r.texto) + "</p>" : "") + "</div></div>";
    }).join("") + "</div>" : '<p class="muted">Sin notas de evolución.</p>') +
    (it.estado === "alta" ? '<div class="alerta alerta-ok mt"><i class="fa-solid fa-house-medical-circle-check"></i> Alta el ' + fmtFecha(it.egreso) + " · " + diasInternado(it) + " día(s)" + (it.indicacionesAlta ? "<br>" + escHTML(it.indicacionesAlta) : "") + "</div>" : "");
  cont.querySelector("#h-prev").onclick = function () { _hoja.dia = sumarDias(_hoja.dia, -1); refrescarHoja(id); };
  cont.querySelector("#h-next").onclick = function () { _hoja.dia = sumarDias(_hoja.dia, 1); refrescarHoja(id); };
  cont.querySelector("#h-hoy").onclick = function () { _hoja.dia = new Date(); refrescarHoja(id); };
  cont.querySelectorAll("button.toma").forEach(function (b) { b.onclick = function () { marcarToma(it, b.dataset.t, b.dataset.f); }; });
}
function _vitTexto(v) {
  const x = [v.temperatura && fmtNum(v.temperatura, 1) + " °C", v.fc && "FC " + v.fc, v.fr && "FR " + v.fr, v.peso && fmtNum(v.peso) + " kg", v.mucosas && "Mucosas " + v.mucosas.toLowerCase(), v.dolor && "Dolor " + v.dolor + "/10"].filter(Boolean);
  return x.length ? '<div class="vitales">' + x.map(function (s) { return "<span>" + escHTML(s) + "</span>"; }).join("") + "</div>" : "";
}
function marcarToma(it, tratId, f) {
  const t = (it.tratamientos || []).find(function (x) { return x.id === tratId; }); if (!t) return;
  const programada = f === "ahora" ? new Date() : new Date(Number(f));
  const m = modalForm(t.medicamento + " · " + fmtHora(programada),
    '<p style="margin:0 0 12px">' + escHTML([t.dosis, t.via].filter(Boolean).join(" · ")) + " para <b>" + escHTML(it.mascota) + "</b></p>" + campo("tnota", "Nota (opcional)", "", "text", { ph: "Ej: vomitó, se repite" }), {
      ancho: "modal-sm", textoGuardar: "Dada", icono: "fa-check",
      pieExtra: f === "ahora" ? "" : '<button type="button" class="btn btn-ghost izq" id="t-omitir"><i class="fa-solid fa-ban"></i> Omitir</button>',
      onGuardar: async function () { await registrarToma(it, t, programada, false, val("tnota")); }
    });
  const om = m.q("#t-omitir");
  if (om) om.onclick = async function () {
    if (!val("tnota")) { toast("Escribí el motivo en la nota para omitir la dosis.", "warn"); el("tnota").focus(); return; }
    await registrarToma(it, t, programada, true, val("tnota")); m.cerrar();
  };
}
async function registrarToma(it, t, programada, omitida, nota) {
  const u = window.MASCOTITA.usuario;
  await crearDoc("internacion_registros", { internacionId: it.id, mascotaId: it.mascotaId, tipo: "dosis", tratamientoId: t.id, medicamento: t.medicamento,
    programada: TS.fromDate(programada), fecha: FS.serverTimestamp(), omitida: !!omitida, texto: nota || "", usuario: u.nombre, usuarioUid: u.uid });
  toast(omitida ? "Dosis omitida registrada." : "Dosis registrada.", "ok", 1500);
}
async function suspenderTrat(intId, tratId) {
  const it = INT.activos.find(function (x) { return x.id === intId; }); if (!it) return;
  if (!(await confirmar("¿Suspender esta medicación desde ahora?", { peligro: false }))) return;
  const tr = (it.tratamientos || []).map(function (t) { return t.id === tratId ? Object.assign({}, t, { activo: false, suspendidoEn: TS.now() }) : t; });
  await actualizarDoc("internaciones", intId, { tratamientos: tr });
  registrarAuditoria("editar", "internacion", "Suspendió medicación en " + it.mascota);
}
function abrirEvolucion(it) {
  modalForm("Evolución · " + it.mascota,
    '<div class="grid-3">' + campo("etemp", "Temp. (°C)", "", "number") + campo("efc", "FC (lpm)", "", "number") + campo("efr", "FR (rpm)", "", "number") +
    campo("epeso", "Peso (kg)", "", "number") + selectCampo("emuc", "Mucosas", MUCOSAS, "", { vacio: "—" }) + selectCampo("edolor", "Dolor (0-10)", ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], "", { vacio: "—" }) + "</div>" +
    areaCampo("etexto", "Evolución / observaciones", "", { filas: 4, req: true }), {
      onGuardar: async function () {
        const v = { temperatura: numONull("etemp"), fc: numONull("efc"), fr: numONull("efr"), peso: numONull("epeso"), mucosas: val("emuc"), dolor: val("edolor") };
        Object.keys(v).forEach(function (k) { if (v[k] === null || v[k] === "") delete v[k]; });
        const u = window.MASCOTITA.usuario;
        await crearDoc("internacion_registros", { internacionId: it.id, mascotaId: it.mascotaId, tipo: "evolucion", texto: val("etexto"), vitales: v, fecha: FS.serverTimestamp(), usuario: u.nombre, usuarioUid: u.uid });
        toast("Evolución registrada.", "ok");
      }
    });
}
function darAlta(it, hojaModal) {
  modalForm("Alta de " + it.mascota,
    '<div class="grid-2">' + campo("aegreso", "Fecha y hora de alta", fechaInput(new Date()) + "T" + horaInput(new Date()), "datetime-local", { req: true }) +
    '<div class="form-field"><label>Días a cobrar</label><input id="f-adias" type="number" min="1" value="' + diasInternado(it) + '"></div></div>' +
    areaCampo("aind", "Indicaciones para casa", "", { filas: 4 }) +
    '<div class="chips" id="a-total"></div>' +
    (it.telefono ? checkCampo("awa", "Avisar al dueño por WhatsApp", true) : ""), {
      textoGuardar: "Dar de alta", icono: "fa-house-medical-circle-check",
      onGuardar: async function () {
        const egreso = new Date(val("aegreso"));
        const dias = Math.max(1, Math.round(num("adias")) || 1);
        await actualizarDoc("internaciones", it.id, { estado: "alta", egreso: TS.fromDate(egreso), diasCobrar: dias, indicacionesAlta: val("aind"), porCobrar: (Number(it.precioDia) || 0) > 0 });
        registrarAuditoria("editar", "internacion", "Alta de " + it.mascota + " (" + dias + " días)");
        toast(it.mascota + " fue dado/a de alta.", "ok");
        if (chk("awa")) waPlantilla("alta", it.telefono, { nombre: String(it.dueno || "").split(" ")[0], mascota: it.mascota, indicaciones: val("aind") || "las indicadas en la clínica" });
        if (hojaModal) hojaModal.cerrar();
        if ((Number(it.precioDia) || 0) > 0 && puede("facturar") && await confirmar("¿Cobrar la internación ahora?", { peligro: false, textoSi: "Cobrar", textoNo: "Más tarde" })) abrirFormFactura({ internacionId: it.id });
      }
    });
  const tot = function () { document.getElementById("a-total").innerHTML = '<div class="chip-resumen"><small>Total internación</small><b>' + fmtMoneda((Number(it.precioDia) || 0) * (num("adias") || 1)) + "</b></div>"; };
  el("adias").oninput = tot; tot();
}
window.abrirFormInternacion = abrirFormInternacion; window.abrirHoja = abrirHoja; window.suspenderTrat = suspenderTrat;
document.addEventListener("DOMContentLoaded", initInternacion);
