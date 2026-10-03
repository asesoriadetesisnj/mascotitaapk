/* =====================================================================
 * paciente.js — Ficha completa del paciente (paciente.html?id=...)
 * Datos, alertas, linea de tiempo unificada (consultas, vacunas,
 * cirugias, citas, facturas), curva de peso, archivos y documentos PDF.
 * Todo en tiempo real.
 * ===================================================================== */
const P = { id: "", m: null, consultas: [], vacunas: [], cirugias: [], citas: [], facturas: [], tab: "historia", chart: null };

async function initPaciente() {
  await protegerPagina({ permiso: "clinica_ver", pagina: "paciente.html" });
  P.id = paramURL("id");
  if (!P.id) { location.replace("pacientes.html"); return; }
  Datos.suscribir("usuarios");
  Datos.suscribir("propietarios", pintarCabecera);
  Datos.suscribir("mascotas", function () {
    P.m = Datos.porId("mascotas", P.id);
    if (!P.m) { document.getElementById("content").innerHTML = vacio("Paciente no encontrado.", "fa-paw", '<a class="btn btn-ghost" href="pacientes.html">Volver</a>'); return; }
    pintarCabecera();
  });
  const q = function (col) { return db.collection(col).where("mascotaId", "==", P.id); };
  const escuchar = function (col, clave) {
    q(col).onSnapshot(function (s) {
      P[clave] = docsDe(s).filter(function (x) { return !x.eliminado; }).sort(function (a, b) { return (aFecha(b.fecha) || 0) - (aFecha(a.fecha) || 0); });
      pintarTab();
    }, function (e) { console.warn(col, e.code); });
  };
  escuchar("consultas", "consultas"); escuchar("vacunas", "vacunas"); escuchar("cirugias", "cirugias"); escuchar("citas", "citas");
  if (puede("facturar")) escuchar("facturas", "facturas");
}

function pintarCabecera() {
  const m = P.m; if (!m) return;
  const d = Datos.duenoDe(m) || {};
  document.title = m.nombre + " - Mascotita";
  const cont = document.getElementById("content");
  if (!document.getElementById("pac-head")) {
    cont.innerHTML = '<div class="migas"><a href="pacientes.html">Pacientes</a> / <span id="miga-nom"></span></div><div class="card" id="pac-head"></div>' +
      '<div class="tabs mt" id="pac-tabs"></div><div id="pac-tab"></div>';
  }
  document.getElementById("miga-nom").textContent = m.nombre;
  const dato = function (l, v) { return v ? "<div><small>" + l + "</small>" + v + "</div>" : ""; };
  document.getElementById("pac-head").innerHTML =
    '<div class="ficha-head">' + Datos.avatarMascota(m, "xl") +
    '<div class="datos"><h1>' + escHTML(m.nombre) + " " + (m.estadoVital === "fallecido" ? pill("Fallecido", "neutral") : "") + (m.castrado ? pill("Castrado/a", "info") : "") + "</h1>" +
    '<div style="margin-top:6px">' + alertaMascotaHTML(m) + "</div>" +
    '<div class="ficha-datos">' +
    dato("Especie / raza", escHTML([m.especie, m.raza].filter(Boolean).join(" · "))) + dato("Sexo", escHTML(m.sexo)) +
    dato("Edad", escHTML(m.fechaNacimiento ? edadDesde(m.fechaNacimiento) + " (" + fmtFechaCorta(m.fechaNacimiento) + ")" : m.edad)) +
    dato("Peso", m.peso ? fmtNum(m.peso) + " kg" + (m.pesoActualizado ? ' <small class="muted">' + fmtFechaCorta(m.pesoActualizado) + "</small>" : "") : "") +
    dato("Color", escHTML(m.color)) + dato("Microchip", escHTML(m.chip)) +
    dato("Dueño", d.nombre ? '<a class="link" href="pacientes.html?dueno=' + d.id + '">' + escHTML(d.nombre) + "</a>" : "") +
    dato("Teléfono", escHTML(d.telefono)) + "</div>" +
    (m.observaciones ? '<p class="muted mt">' + escHTML(m.observaciones) + "</p>" : "") +
    '<div class="ficha-acciones">' +
    (puede("clinica") ? '<button class="btn btn-primary" id="a-cons"><i class="fa-solid fa-stethoscope"></i> Consulta</button><button class="btn btn-ghost" id="a-vac"><i class="fa-solid fa-shield-virus"></i> Vacuna</button><button class="btn btn-ghost" id="a-cir"><i class="fa-solid fa-syringe"></i> Cirugía</button>' : "") +
    (puede("agenda") ? '<button class="btn btn-ghost" id="a-cita"><i class="fa-solid fa-calendar-plus"></i> Cita</button>' : "") +
    (puede("facturar") ? '<button class="btn btn-ghost" id="a-fac"><i class="fa-solid fa-file-invoice-dollar"></i> Cobrar</button>' : "") +
    (d.telefono ? '<button class="btn btn-wa" id="a-wa"><i class="fa-brands fa-whatsapp"></i></button>' : "") +
    '<button class="btn btn-ghost" id="a-hist" title="Historia clínica PDF"><i class="fa-solid fa-file-pdf"></i> Historia</button>' +
    '<button class="btn btn-ghost" id="a-carnet" title="Carnet de vacunas PDF"><i class="fa-solid fa-id-card"></i> Carnet</button>' +
    '<button class="btn btn-ghost" id="a-qr" title="Carnet digital para el celular del dueño (enlace / QR)"><i class="fa-solid fa-qrcode"></i> Carnet digital</button>' +
    (puede("pacientes") ? '<button class="btn btn-ghost" id="a-edit" title="Editar"><i class="fa-solid fa-pen"></i></button>' : "") +
    (esAdmin() ? '<button class="btn btn-ghost" id="a-del" title="Eliminar"><i class="fa-solid fa-trash"></i></button>' : "") +
    "</div></div></div>";
  const on = function (id, fn) { const b = document.getElementById(id); if (b) b.onclick = fn; };
  on("a-cons", function () { abrirFormConsulta({ mascotaId: P.id }); });
  on("a-vac", function () { abrirFormVacuna({ mascotaId: P.id }); });
  on("a-cir", function () { abrirFormCirugia({ mascotaId: P.id }); });
  on("a-cita", function () { abrirFormCita({ mascotaId: P.id }); });
  on("a-fac", function () { abrirFormFactura({ mascotaId: P.id, propietarioId: m.propietarioId }); });
  on("a-wa", function () { enviarWhatsApp(d.telefono, "Hola " + String(d.nombre).split(" ")[0] + "! Te escribimos de " + nombreClinica() + " por " + m.nombre + ". "); });
  on("a-edit", function () { abrirFormMascota(P.id); });
  on("a-qr", function () { abrirCarnetDigital(P.id); });
  // Foto en tamano grande (guardada aparte para no cargarla en las listas)
  const aplicarFoto = function () {
    const img = document.querySelector("#pac-head .avatar-m");
    if (!img || img.tagName !== "IMG" || !P._fotoGrande) return;
    img.src = P._fotoGrande; img.style.cursor = "zoom-in";
    img.onclick = function () { abrirModal({ titulo: m.nombre, cuerpo: '<img src="' + P._fotoGrande + '" style="width:100%;border-radius:12px" alt="">' }); };
  };
  if (m.fotoMini) {
    if (P._fotoDe === m.fotoMini) aplicarFoto();
    else { P._fotoDe = m.fotoMini; P._fotoGrande = null; db.collection("fotos").doc(P.id).get().then(function (f) { if (f.exists) { P._fotoGrande = f.data().data; aplicarFoto(); } }).catch(function () {}); }
  }
  on("a-hist", function () { generarPDF(function () { return pdfHistoria(m, d, P.consultas, P.vacunas, P.cirugias); }); });
  on("a-carnet", function () { generarPDF(function () { return pdfCarnet(m, d, P.vacunas); }); });
  on("a-del", async function () { if (await confirmar("¿Enviar a " + m.nombre + " a la papelera? Su historia clínica se conserva y se puede restaurar.")) { await Datos.aPapelera("mascotas", P.id, m); location.href = "pacientes.html"; } });
  pintarTab();
}

function pintarTab() {
  if (!P.m || !document.getElementById("pac-tabs")) return;
  const adj = [];
  P.consultas.forEach(function (c) { (c.adjuntos || []).forEach(function (a) { adj.push(Object.assign({ consulta: c }, a)); }); });
  const tabs = [["historia", "Línea de tiempo", "fa-timeline"], ["consultas", "Consultas", "fa-stethoscope", P.consultas.length], ["vacunas", "Vacunas", "fa-shield-virus", P.vacunas.length],
    ["cirugias", "Cirugías", "fa-syringe", P.cirugias.length], ["peso", "Peso", "fa-weight-scale"], ["archivos", "Archivos", "fa-paperclip", adj.length]];
  if (puede("facturar")) tabs.push(["facturas", "Facturas", "fa-receipt", P.facturas.length]);
  document.getElementById("pac-tabs").innerHTML = tabs.map(function (t) {
    return '<button class="tab' + (P.tab === t[0] ? " activo" : "") + '" data-t="' + t[0] + '"><i class="fa-solid ' + t[2] + '"></i> ' + t[1] + (t[3] != null ? ' <span class="cnt">' + t[3] + "</span>" : "") + "</button>";
  }).join("");
  document.querySelectorAll("#pac-tabs .tab").forEach(function (b) { b.onclick = function () { P.tab = b.dataset.t; pintarTab(); }; });
  const cont = document.getElementById("pac-tab");
  if (P.chart && P.tab !== "peso") { P.chart.destroy(); P.chart = null; }
  if (P.tab === "historia") cont.innerHTML = timelineHTML(eventos());
  else if (P.tab === "consultas") cont.innerHTML = timelineHTML(eventos().filter(function (e) { return e.t === "consulta"; }));
  else if (P.tab === "cirugias") cont.innerHTML = timelineHTML(eventos().filter(function (e) { return e.t === "cirugia"; }));
  else if (P.tab === "vacunas") pintarVacunasPac(cont);
  else if (P.tab === "peso") pintarPeso(cont);
  else if (P.tab === "archivos") cont.innerHTML = adj.length ? '<div class="adjuntos">' + adj.map(function (a) {
    return '<a class="adjunto" href="' + escHTML(a.url) + '" target="_blank" rel="noopener">' + (/^image/.test(a.tipo) ? '<img src="' + escHTML(a.url) + '" loading="lazy" alt="">' : '<div class="ic"><i class="fa-solid fa-file-pdf"></i></div>') +
      "<span>" + escHTML(a.nombre) + '</span><span class="muted">' + fmtFechaCorta(a.consulta.fecha) + "</span></a>";
  }).join("") + "</div>" : vacio("Sin archivos. Se adjuntan desde una consulta.", "fa-paperclip");
  else if (P.tab === "facturas") tabla(cont, {
    filas: P.facturas, orden: "fecha", dir: -1, vacio: "Sin facturas",
    columnas: [{ k: "numero", t: "N°" }, { k: "fecha", t: "Fecha", r: function (f) { return fmtFechaCorta(f.fecha); }, v: function (f) { return aFecha(f.fecha); } },
      { k: "total", t: "Total", cls: "num", r: function (f) { return fmtMoneda(f.total); } }, { k: "saldo", t: "Saldo", cls: "num", r: function (f) { return fmtMoneda(saldoFactura(f)); } },
      { k: "estado", t: "Estado", r: function (f) { return pill(f.estado, f.estado); } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (f) { return btnIcono("fa-file-pdf", "PDF", "pdfFacturaPorId('" + f.id + "')") + (saldoFactura(f) > 0 ? btnIcono("fa-hand-holding-dollar", "Cobrar", "abrirCobro('" + f.id + "')") : ""); } }]
  });
}

function eventos() {
  const ev = [];
  P.consultas.forEach(function (c) { ev.push({ t: "consulta", f: aFecha(c.fecha), d: c }); });
  P.vacunas.forEach(function (v) { ev.push({ t: "vacuna", f: aFecha(v.fecha), d: v }); });
  P.cirugias.forEach(function (c) { ev.push({ t: "cirugia", f: aFecha(c.fecha), d: c }); });
  P.citas.forEach(function (c) { if (aFecha(c.fecha) > new Date() || c.estado === "no asistió") ev.push({ t: "cita", f: aFecha(c.fecha), d: c }); });
  P.facturas.forEach(function (f) { ev.push({ t: "factura", f: aFecha(f.fecha), d: f }); });
  return ev.sort(function (a, b) { return (b.f || 0) - (a.f || 0); });
}
function _vit(v) {
  if (!v) return "";
  const x = [v.peso && fmtNum(v.peso) + " kg", v.temperatura && fmtNum(v.temperatura, 1) + " °C", v.fc && "FC " + v.fc, v.fr && "FR " + v.fr, v.cc && "CC " + v.cc + "/9", v.mucosas && "Mucosas " + v.mucosas.toLowerCase(), v.tllc && "TLLC " + v.tllc + "s", v.hidratacion && v.hidratacion].filter(Boolean);
  return x.length ? '<div class="vitales">' + x.map(function (s) { return "<span>" + escHTML(s) + "</span>"; }).join("") + "</div>" : "";
}
function _p(l, t) { return t ? "<p><b>" + l + ":</b> " + escHTML(t) + "</p>" : ""; }
function timelineHTML(ev) {
  if (!ev.length) return vacio("Sin registros todavía.", "fa-clock-rotate-left");
  const ICON = { consulta: "fa-stethoscope", vacuna: "fa-syringe", cirugia: "fa-scissors", cita: "fa-calendar", factura: "fa-dollar-sign" };
  return '<div class="timeline">' + ev.map(function (e) {
    const d = e.d; let h = "";
    if (e.t === "consulta") {
      h = '<div class="tl-top"><b>Consulta · ' + fmtFecha(d.fecha) + "</b><span>" + (d.porCobrar ? pill("Pendiente de cobro", "warn") + " " : "") +
        btnIcono("fa-file-pdf", "Receta PDF", "pdfConsultaId('" + d.id + "')") + (puede("clinica") ? btnIcono("fa-pen", "Editar", "abrirFormConsulta({id:'" + d.id + "'})") : "") + "</span></div>" +
        (d.veterinario ? '<small class="muted">' + escHTML(d.veterinario) + "</small>" : "") + _vit(d.vitales) +
        _p("Motivo", d.motivo) + _p("Anamnesis", d.sintomas) + _p("Examen", d.examenFisico) + _p("Diagnóstico", d.diagnostico) + _p("Tratamiento", d.tratamiento) +
        ((d.receta || []).length ? "<p><b>Receta:</b> " + escHTML(d.receta.map(function (r) { return r.medicamento + (r.indicaciones ? " (" + r.indicaciones + ")" : ""); }).join("; ")) + "</p>" : "") +
        _p("Indicaciones", d.medicamentos) + (d.proximoControl ? "<p><b>Próximo control:</b> " + fmtFechaCorta(d.proximoControl) + "</p>" : "") +
        (d.notasInternas ? '<p class="muted"><i class="fa-solid fa-lock"></i> ' + escHTML(d.notasInternas) + "</p>" : "") +
        ((d.adjuntos || []).length ? '<p><i class="fa-solid fa-paperclip"></i> ' + d.adjuntos.map(function (a) { return '<a class="link" target="_blank" rel="noopener" href="' + escHTML(a.url) + '">' + escHTML(a.nombre) + "</a>"; }).join(", ") + "</p>" : "");
    } else if (e.t === "vacuna") {
      h = '<div class="tl-top"><b>' + escHTML(d.tipo) + " · " + fmtFechaCorta(d.fecha) + "</b>" + (puede("clinica") ? btnIcono("fa-pen", "Editar", "abrirFormVacuna({id:'" + d.id + "'})") : "") + "</div>" +
        _p("Producto", [d.producto, d.lote && "lote " + d.lote].filter(Boolean).join(" · ")) + (d.proximaDosis ? "<p><b>Próxima dosis:</b> " + fmtFechaCorta(d.proximaDosis) + " " + (d.vigente ? pillVacuna(d) : '<small class="muted">(reemplazada por una dosis posterior)</small>') + "</p>" : "");
    } else if (e.t === "cirugia") {
      h = '<div class="tl-top"><b>Cirugía: ' + escHTML(d.tipo) + " · " + fmtFechaCorta(d.fecha) + "</b><span>" + pill(d.estado, (d.estado || "").replace(/\s/g, "-")) + " " +
        btnIcono("fa-file-pdf", "Ficha PDF", "pdfCirugiaId('" + d.id + "')") + (puede("clinica") ? btnIcono("fa-pen", "Editar", "abrirFormCirugia({id:'" + d.id + "'})") : "") + "</span></div>" +
        (d.veterinario ? '<small class="muted">' + escHTML(d.veterinario) + "</small>" : "") + _p("Procedimiento", d.procedimiento) + _p("Observaciones", d.observaciones) + _p("Indicaciones", d.indicaciones);
    } else if (e.t === "cita") {
      h = '<div class="tl-top"><b>Cita · ' + fmtFecha(d.fecha) + "</b>" + pill(d.estado || "pendiente", (d.estado || "pendiente").replace(/\s/g, "-").replace("ó", "o")) + "</div>" + _p("Servicio", d.servicio) + _p("Veterinario/a", d.veterinario);
    } else if (e.t === "factura") {
      h = '<div class="tl-top"><b>' + escHTML(d.numero) + " · " + fmtMoneda(d.total) + "</b><span>" + pill(d.estado, d.estado) + " " + btnIcono("fa-file-pdf", "PDF", "pdfFacturaPorId('" + d.id + "')") + "</span></div>" +
        "<p>" + escHTML((d.items || []).map(function (i) { return i.concepto; }).join(", ")) + "</p>";
    }
    return '<div class="tl-item"><div class="tl-dot ' + e.t + '"><i class="fa-solid ' + ICON[e.t] + '"></i></div><div class="tl-card">' + h + "</div></div>";
  }).join("") + "</div>";
}
function estadoVacuna(v) {
  if (!v.proximaDosis) return "sin";
  const d = aFecha(v.proximaDosis), hoy = inicioDelDia();
  if (d < hoy) return "vencida";
  return d <= sumarDias(hoy, 30) ? "proxima" : "aldia";
}
const ETQ_VAC = { vencida: "Vencida", proxima: "Vence pronto", aldia: "Al día", sin: "Sin refuerzo" };
function pillVacuna(v) { const e = estadoVacuna(v); return pill(ETQ_VAC[e], e); }
function pintarVacunasPac(cont) {
  const vig = P.vacunas.filter(function (v) { return v.vigente; });
  cont.innerHTML = '<div class="card"><h3><i class="fa-solid fa-shield-virus"></i> Estado actual</h3>' +
    (vig.length ? '<ul class="lista">' + vig.map(function (v) {
      const d = Datos.duenoDe(P.m) || {};
      return '<li><div class="info"><b>' + escHTML(v.tipo) + "</b><small>Aplicada " + fmtFechaCorta(v.fecha) + (v.proximaDosis ? " · próxima " + fmtFechaCorta(v.proximaDosis) : "") + "</small></div>" + pillVacuna(v) +
        (d.telefono && v.proximaDosis ? btnIcono("fa-brands fa-whatsapp", "Recordar por WhatsApp", "waVacunaPac('" + v.id + "')", "wa") : "") + "</li>";
    }).join("") + "</ul>" : vacio("Sin vacunas registradas.", "fa-shield-virus")) + "</div>" +
    '<div class="mt">' + timelineHTML(eventos().filter(function (e) { return e.t === "vacuna"; })) + "</div>";
}
async function pintarPeso(cont) {
  const pts = P.consultas.filter(function (c) { return c.vitales && c.vitales.peso; }).map(function (c) { return { f: aFecha(c.fecha), p: c.vitales.peso }; })
    .concat(P.cirugias.filter(function (c) { return c.peso; }).map(function (c) { return { f: aFecha(c.fecha), p: c.peso }; }))
    .filter(function (x) { return x.f; }).sort(function (a, b) { return a.f - b.f; });
  if (pts.length < 1) { cont.innerHTML = vacio("Sin registros de peso. Se cargan en los signos vitales de cada consulta.", "fa-weight-scale"); return; }
  cont.innerHTML = '<div class="card"><h3><i class="fa-solid fa-weight-scale"></i> Evolución del peso (kg)</h3><div class="chart-box"><canvas id="ch-peso"></canvas></div></div>';
  try {
    await cargarLib("chart");
    if (P.chart) P.chart.destroy();
    const css = getComputedStyle(document.documentElement);
    P.chart = new Chart(document.getElementById("ch-peso"), {
      type: "line",
      data: { labels: pts.map(function (x) { return x.f.toLocaleDateString("es-PY"); }), datasets: [{ label: "Peso (kg)", data: pts.map(function (x) { return x.p; }), borderColor: css.getPropertyValue("--verde").trim(), backgroundColor: "rgba(15,157,104,.12)", fill: true, tension: .3, pointRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: css.getPropertyValue("--texto-suave").trim() } }, y: { ticks: { color: css.getPropertyValue("--texto-suave").trim() } } } }
    });
  } catch (e) { toast(mensajeError(e), "error"); }
}
function pdfConsultaId(id) { const c = P.consultas.find(function (x) { return x.id === id; }); if (c) generarPDF(function () { return pdfConsulta(c, P.m, Datos.duenoDe(P.m)); }); }
function pdfCirugiaId(id) { const c = P.cirugias.find(function (x) { return x.id === id; }); if (c) generarPDF(function () { return pdfCirugia(c, P.m, Datos.duenoDe(P.m)); }); }
function waVacunaPac(id) {
  const v = P.vacunas.find(function (x) { return x.id === id; }); const d = Datos.duenoDe(P.m) || {};
  waPlantilla("vacuna", d.telefono, { nombre: String(d.nombre || "").split(" ")[0], mascota: P.m.nombre, vacuna: v.tipo, fecha: fmtFechaCorta(v.proximaDosis) });
  db.collection("vacunas").doc(id).update({ avisadoEn: FS.serverTimestamp(), avisadoPor: window.MASCOTITA.usuario.nombre }).catch(function () {});
}
window.pdfConsultaId = pdfConsultaId; window.pdfCirugiaId = pdfCirugiaId; window.waVacunaPac = waVacunaPac;
document.addEventListener("DOMContentLoaded", initPaciente);
