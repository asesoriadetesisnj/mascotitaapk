/* =====================================================================
 * pacientes.js — Mascotas y duenos (listas en tiempo real)
 *  - Tarjetas de mascotas con filtros (especie, estado) y busqueda sin tildes
 *  - Tabla de duenos con ficha: datos, mascotas, cuenta corriente, WhatsApp
 * ===================================================================== */
let _tabPac = "mascotas";

async function initPacientes() {
  await protegerPagina({ permiso: "pacientes", pagina: "pacientes.html" });
  _tabPac = paramURL("tab") === "duenos" ? "duenos" : "mascotas";
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-paw"></i> Pacientes</h1><div class="head-actions">' +
    '<button class="btn btn-ghost" id="p-dueno"><i class="fa-solid fa-user-plus"></i> Dueño</button>' +
    '<button class="btn btn-primary" id="p-nuevo"><i class="fa-solid fa-plus"></i> Nuevo paciente</button></div></div>' +
    '<div class="tabs"><button class="tab" data-tab="mascotas"><i class="fa-solid fa-paw"></i> Mascotas <span class="cnt" id="cnt-m">…</span></button>' +
    '<button class="tab" data-tab="duenos"><i class="fa-solid fa-users"></i> Dueños <span class="cnt" id="cnt-d">…</span></button></div>' +
    '<div class="filtros"><input type="search" id="p-buscar" placeholder="Buscar por nombre, raza, chip, dueño, CI o teléfono...">' +
    '<select id="p-especie"><option value="">Todas las especies</option></select>' +
    '<select id="p-estado"><option value="activo">Activos</option><option value="fallecido">Fallecidos</option><option value="">Todos</option></select>' +
    '<select id="p-orden"><option value="nombre">A-Z</option><option value="reciente">Más recientes</option></select></div>' +
    '<div id="p-lista">' + skeleton(6, "sk-card") + "</div>";
  document.getElementById("p-buscar").value = paramQ();
  document.getElementById("p-nuevo").onclick = function () { abrirFormPacienteNuevo({ onGuardado: function (mid) { location.href = "paciente.html?id=" + mid; } }); };
  document.getElementById("p-dueno").onclick = function () { abrirFormDueno(null); };
  document.getElementById("p-buscar").oninput = debounce(pintarPac, 150);
  ["p-especie", "p-estado", "p-orden"].forEach(function (id) { document.getElementById(id).onchange = pintarPac; });
  document.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { _tabPac = t.dataset.tab; pintarPac(); }; });
  Datos.suscribir("mascotas", pintarPac);
  Datos.suscribir("propietarios", pintarPac);
  if (paramURL("nuevo")) abrirFormPacienteNuevo({ onGuardado: function (mid) { location.href = "paciente.html?id=" + mid; } });
  const du = paramURL("dueno");
  if (du) Datos.listo("propietarios").then(function () { verDueno(du); });
}

function pintarPac() {
  const ms = Datos.lista("mascotas"), ds = Datos.lista("propietarios");
  document.getElementById("cnt-m").textContent = ms.filter(function (m) { return m.estadoVital !== "fallecido"; }).length;
  document.getElementById("cnt-d").textContent = ds.length;
  document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("activo", t.dataset.tab === _tabPac); });
  const esp = document.getElementById("p-especie");
  const especies = Array.from(new Set(ms.map(function (m) { return m.especie; }).filter(Boolean))).sort();
  if (esp.options.length - 1 !== especies.length) {
    const a = esp.value;
    esp.innerHTML = '<option value="">Todas las especies</option>' + especies.map(function (e) { return "<option" + (e === a ? " selected" : "") + ">" + escHTML(e) + "</option>"; }).join("");
  }
  esp.hidden = document.getElementById("p-estado").hidden = _tabPac !== "mascotas";
  const q = document.getElementById("p-buscar").value;
  const cont = document.getElementById("p-lista");
  if (_tabPac === "mascotas") {
    const fe = esp.value, fs = document.getElementById("p-estado").value, ord = document.getElementById("p-orden").value;
    let l = ms.filter(function (m) {
      return (!fe || m.especie === fe) && (!fs || (m.estadoVital || "activo") === fs) && coincide(Datos.buscarMascota(m), q);
    });
    if (ord === "reciente") l.sort(function (a, b) { return (aFecha(b.creadoEn || b.createdAt) || 0) - (aFecha(a.creadoEn || a.createdAt) || 0); });
    if (!l.length) { cont.innerHTML = vacio(q ? "Sin resultados para esa búsqueda." : "Todavía no hay pacientes.", "fa-paw", '<button class="btn btn-primary" onclick="document.getElementById(\'p-nuevo\').click()">Registrar paciente</button>'); return; }
    const max = cont._max || 60;
    cont.innerHTML = '<div class="cards-grid">' + l.slice(0, max).map(function (m) {
      const d = Datos.duenoDe(m);
      return '<a class="card-paciente" href="paciente.html?id=' + m.id + '">' + Datos.avatarMascota(m) +
        '<div class="info"><h3>' + escHTML(m.nombre) + (m.estadoVital === "fallecido" ? ' <small class="muted">†</small>' : "") + (m.alergias ? ' <i class="fa-solid fa-triangle-exclamation texto-danger" title="Alergias: ' + escHTML(m.alergias) + '"></i>' : "") + "</h3>" +
        "<p>" + escHTML([m.especie, m.raza, m.sexo].filter(Boolean).join(" · ")) + "</p>" +
        "<p>" + escHTML(m.fechaNacimiento ? edadDesde(m.fechaNacimiento) : (m.edad || "")) + (m.peso ? " · " + fmtNum(m.peso) + " kg" : "") + "</p>" +
        '<p class="muted"><i class="fa-solid fa-user"></i> ' + escHTML(d ? d.nombre : "Sin dueño") + "</p></div></a>";
    }).join("") + "</div>" + (l.length > max ? '<div class="mas-wrap"><button class="btn btn-ghost" id="p-mas">Mostrar más (' + (l.length - max) + ")</button></div>" : "");
    const mb = document.getElementById("p-mas"); if (mb) mb.onclick = function () { cont._max = max + 60; pintarPac(); };
  } else {
    const cuenta = {}; ms.forEach(function (m) { cuenta[m.propietarioId] = (cuenta[m.propietarioId] || []).concat(m.nombre); });
    const l = ds.filter(function (d) { return coincide([d.nombre, d.telefono, d.dni, d.ruc, d.email, (cuenta[d.id] || []).join(" ")].join(" "), q); });
    tabla(cont, {
      filas: l, orden: "nombre", vacio: "Sin dueños", vacioIcono: "fa-users", alClic: function (d) { verDueno(d.id); },
      columnas: [
        { k: "nombre", t: "Nombre", r: function (d) { return "<b>" + escHTML(d.nombre) + "</b>" + (d.dni ? "<br><small>CI " + escHTML(d.dni) + "</small>" : ""); } },
        { k: "telefono", t: "Teléfono" },
        { k: "mascotas", t: "Mascotas", v: function (d) { return (cuenta[d.id] || []).length; }, r: function (d) { return escHTML((cuenta[d.id] || []).join(", ")); } },
        { k: "email", t: "Email" },
        { k: "acc", t: "", sort: false, cls: "acciones", r: function (d) {
          return (d.telefono ? btnIcono("fa-brands fa-whatsapp", "WhatsApp", "waDueno('" + d.id + "')", "wa") : "") +
            btnIcono("fa-pen", "Editar", "abrirFormDueno('" + d.id + "')") +
            (esAdmin() ? btnIcono("fa-trash", "Eliminar", "eliminarDueno('" + d.id + "')", "danger") : "");
        } }
      ]
    });
  }
}

async function verDueno(id) {
  const d = Datos.dueno(id); if (!d) { toast("Dueño no encontrado.", "warn"); return; }
  const ms = Datos.lista("mascotas").filter(function (m) { return m.propietarioId === id; });
  const m = abrirModal({
    titulo: d.nombre, ancho: "modal-lg",
    cuerpo: '<div class="ficha-datos" style="margin-top:0">' +
      [["Teléfono", d.telefono], ["CI", d.dni], ["RUC", d.ruc], ["Email", d.email], ["Dirección", d.direccion]].filter(function (x) { return x[1]; })
        .map(function (x) { return "<div><small>" + x[0] + "</small>" + escHTML(x[1]) + "</div>"; }).join("") + "</div>" +
      (d.notas ? '<p class="mt">' + escHTML(d.notas) + "</p>" : "") +
      '<div class="seccion-form mt"><i class="fa-solid fa-paw"></i> Mascotas</div>' +
      (ms.length ? '<ul class="lista">' + ms.map(function (x) { return '<li>' + Datos.avatarMascota(x, "sm") + '<div class="info"><a class="link" href="paciente.html?id=' + x.id + '">' + escHTML(x.nombre) + "</a><small>" + escHTML([x.especie, x.raza].filter(Boolean).join(" · ")) + "</small></div></li>"; }).join("") + "</ul>" : '<p class="muted">Sin mascotas.</p>') +
      (puede("facturar") ? '<div class="seccion-form mt"><i class="fa-solid fa-file-invoice-dollar"></i> Cuenta corriente</div><div id="dc-cuenta">' + skeleton(2) + "</div>" : ""),
    pie: '<div class="izq fila-flex">' + (d.telefono ? '<button class="btn btn-wa btn-sm" id="dc-wa"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>' : "") + "</div>" +
      '<button class="btn btn-ghost" id="dc-masc"><i class="fa-solid fa-plus"></i> Mascota</button><button class="btn btn-ghost" id="dc-edit"><i class="fa-solid fa-pen"></i> Editar</button>'
  });
  m.q("#dc-edit").onclick = function () { m.cerrar(); abrirFormDueno(id); };
  m.q("#dc-masc").onclick = function () { m.cerrar(); abrirFormMascota(null, { propietarioId: id, onGuardado: function (mid) { location.href = "paciente.html?id=" + mid; } }); };
  const wa = m.q("#dc-wa"); if (wa) wa.onclick = function () { enviarWhatsApp(d.telefono, "Hola " + d.nombre.split(" ")[0] + "! "); };
  if (puede("facturar")) {
    try {
      const fs = docsDe(await db.collection("facturas").where("propietarioId", "==", id).orderBy("fecha", "desc").limit(50).get());
      const saldo = fs.reduce(function (a, f) { return a + saldoFactura(f); }, 0);
      const cont = m.q("#dc-cuenta"); if (!cont) return;
      cont.innerHTML = '<div class="chips"><div class="chip-resumen"><small>Saldo pendiente</small><b class="' + (saldo ? "texto-danger" : "texto-ok") + '">' + fmtMoneda(saldo) + "</b></div>" +
        '<div class="chip-resumen"><small>Comprobantes</small><b>' + fs.length + "</b></div>" +
        (saldo && d.telefono ? '<button class="btn btn-wa btn-sm" id="dc-saldo"><i class="fa-brands fa-whatsapp"></i> Recordar saldo</button>' : "") + "</div>" +
        (fs.length ? '<div class="table-wrap"><table class="tabla"><thead><tr><th>N°</th><th>Fecha</th><th class="num">Total</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>' +
          fs.map(function (f) {
            return "<tr><td>" + escHTML(f.numero) + "</td><td>" + fmtFechaCorta(f.fecha) + '</td><td class="num">' + fmtMoneda(f.total) + '</td><td class="num">' + fmtMoneda(saldoFactura(f)) + "</td><td>" + pill(f.estado, f.estado) + '</td><td class="acciones">' +
              (saldoFactura(f) > 0 ? '<button class="btn btn-primary btn-sm" data-cobrar="' + f.id + '">Cobrar</button>' : "") + "</td></tr>";
          }).join("") + "</tbody></table></div>" : '<p class="muted">Sin comprobantes.</p>');
      cont.querySelectorAll("[data-cobrar]").forEach(function (b) { b.onclick = function () { m.cerrar(); abrirCobro(b.dataset.cobrar, function () { verDueno(id); }); }; });
      const bs = cont.querySelector("#dc-saldo"); if (bs) bs.onclick = function () { waPlantilla("saldo", d.telefono, { nombre: d.nombre.split(" ")[0], monto: fmtMoneda(saldo) }); };
    } catch (e) { console.warn(e); const c = m.q("#dc-cuenta"); if (c) c.innerHTML = '<p class="muted">' + escHTML(mensajeError(e)) + "</p>"; }
  }
}

async function eliminarDueno(id) {
  const d = Datos.dueno(id);
  const ms = Datos.lista("mascotas").filter(function (m) { return m.propietarioId === id; });
  if (ms.length) { toast("Tiene " + ms.length + " mascota(s). Reasignalas o eliminalas primero.", "warn"); return; }
  if (!(await confirmar("¿Enviar a " + d.nombre + " a la papelera?"))) return;
  await Datos.aPapelera("propietarios", id, d);
}

function waDueno(id) { const d = Datos.dueno(id); if (d) enviarWhatsApp(d.telefono, "Hola " + String(d.nombre).split(" ")[0] + "! "); }
window.verDueno = verDueno; window.eliminarDueno = eliminarDueno; window.waDueno = waDueno;
document.addEventListener("DOMContentLoaded", initPacientes);
