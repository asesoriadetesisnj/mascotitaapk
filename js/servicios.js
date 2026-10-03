/* =====================================================================
 * servicios.js — Catalogo de servicios con precio, IVA y duracion
 * (la duracion se usa en la agenda; el precio en la facturacion).
 * Editable solo por el ADMIN; el resto lo consulta.
 * ===================================================================== */
const CATEGORIAS_SERV = ["Consulta", "Vacunación", "Desparasitación", "Cirugía", "Laboratorio", "Imagenología", "Peluquería / baño", "Internación", "Procedimiento", "Domicilio", "Otro"];
const SERVICIOS_SUGERIDOS = [
  ["Consulta general", "Consulta", 30], ["Consulta de urgencia", "Consulta", 30], ["Control / reconsulta", "Consulta", 20],
  ["Aplicación de vacuna", "Vacunación", 15], ["Desparasitación", "Desparasitación", 15], ["Castración canino", "Cirugía", 90], ["Castración felino", "Cirugía", 60],
  ["Hemograma", "Laboratorio", 15], ["Ecografía", "Imagenología", 30], ["Radiografía", "Imagenología", 20], ["Baño y corte", "Peluquería / baño", 60], ["Internación (día)", "Internación", 0]
];

async function initServicios() {
  await protegerPagina({ pagina: "servicios.html" });
  const adm = esAdmin();
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-tags"></i> Catálogo de servicios</h1><div class="head-actions">' +
    (adm ? '<button class="btn btn-primary" id="sv-nuevo"><i class="fa-solid fa-plus"></i> Servicio</button>' : "") + "</div></div>" +
    '<p class="lead">Precios con IVA incluido. La duración se usa para reservar el tiempo en la agenda.</p>' +
    '<div class="filtros card"><input type="search" id="sv-buscar" placeholder="Buscar servicio..."><select id="sv-cat"><option value="">Todas las categorías</option>' +
    CATEGORIAS_SERV.map(function (c) { return "<option>" + c + "</option>"; }).join("") + '</select><label class="chk-inline"><input type="checkbox" id="sv-inact"> Ver inactivos</label></div><div id="sv-tabla">' + skeleton(6) + "</div>";
  document.getElementById("sv-buscar").value = paramQ();
  if (adm) document.getElementById("sv-nuevo").onclick = function () { abrirFormServicio(null); };
  document.getElementById("sv-buscar").oninput = debounce(pintarServicios, 150);
  ["sv-cat", "sv-inact"].forEach(function (id) { document.getElementById(id).onchange = pintarServicios; });
  Datos.suscribir("servicios", pintarServicios);
}
function pintarServicios() {
  const q = document.getElementById("sv-buscar").value, cat = document.getElementById("sv-cat").value, inact = document.getElementById("sv-inact").checked;
  const todos = Datos.lista("servicios");
  const l = todos.filter(function (s) { return (inact || s.activo !== false) && (!cat || s.categoria === cat) && coincide(s.nombre + " " + (s.categoria || ""), q); });
  const adm = esAdmin();
  const cont = document.getElementById("sv-tabla");
  if (!todos.length && adm) {
    cont.innerHTML = '<div class="card">' + vacio("El catálogo está vacío.", "fa-tags", '<button class="btn btn-primary" id="sv-sug">Cargar servicios sugeridos</button>') + "</div>";
    document.getElementById("sv-sug").onclick = function () { conBoton(this, cargarSugeridos); };
    return;
  }
  tabla(cont, {
    filas: l, orden: "nombre", vacio: "Sin servicios", vacioIcono: "fa-tags", alClic: adm ? function (s) { abrirFormServicio(s.id); } : null,
    columnas: [
      { k: "nombre", t: "Servicio", r: function (s) { return "<b>" + escHTML(s.nombre) + "</b>" + (s.activo === false ? " " + pill("Inactivo", "neutral") : "") + (s.descripcion ? "<br><small>" + escHTML(s.descripcion) + "</small>" : ""); } },
      { k: "categoria", t: "Categoría" },
      { k: "precio", t: "Precio", cls: "num", r: function (s) { return s.precio ? fmtMoneda(s.precio) : '<span class="texto-warn">Sin precio</span>'; } },
      { k: "iva", t: "IVA", r: function (s) { return s.iva === 0 ? "Exenta" : (s.iva || 10) + "%"; } },
      { k: "duracion", t: "Duración", r: function (s) { return s.duracion ? s.duracion + " min" : "—"; } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (s) { return adm ? btnIcono("fa-pen", "Editar", "abrirFormServicio('" + s.id + "')") + btnIcono("fa-trash", "Eliminar", "eliminarServicio('" + s.id + "')", "danger") : ""; } }
    ]
  });
}
function abrirFormServicio(id) {
  const s = id ? Datos.porId("servicios", id) || {} : { iva: Number(cfg().ivaServicios != null ? cfg().ivaServicios : 10), activo: true };
  modalForm((id ? "Editar" : "Nuevo") + " servicio",
    '<div class="grid-2">' + campo("snombre", "Nombre", s.nombre, "text", { req: true, full: true }) +
    selectCampo("scat", "Categoría", CATEGORIAS_SERV, s.categoria || "Consulta") +
    campo("sprecio", "Precio (IVA incluido)", s.precio || "", "number", { min: 0 }) +
    selectCampo("siva", "IVA", IVA_OPCIONES, String(s.iva != null ? s.iva : 10)) +
    campo("sdur", "Duración en agenda (min)", s.duracion || "", "number", { min: 0, step: 5 }) +
    areaCampo("sdesc", "Descripción", s.descripcion) +
    '<div class="form-field">' + checkCampo("sact", "Activo (aparece al facturar)", s.activo !== false) + "</div></div>", {
      onGuardar: async function () {
        const d = { nombre: val("snombre"), categoria: val("scat"), precio: num("sprecio"), iva: Number(val("siva")), duracion: num("sdur") || null, descripcion: val("sdesc"), activo: chk("sact") };
        const dup = Datos.lista("servicios").find(function (x) { return x.id !== id && normalizar(x.nombre) === normalizar(d.nombre); });
        if (dup) throw errorUsuario("Ya existe un servicio con ese nombre.");
        if (id) await actualizarDoc("servicios", id, d); else await crearDoc("servicios", d);
        registrarAuditoria(id ? "editar" : "crear", "servicios", (id ? "Editó" : "Creó") + " servicio " + d.nombre + " (" + fmtMoneda(d.precio) + ")");
        toast("Servicio guardado.", "ok");
      }
    });
}
async function eliminarServicio(id) {
  const s = Datos.porId("servicios", id);
  if (await confirmar("¿Enviar \"" + s.nombre + "\" a la papelera? (Si solo querés ocultarlo, desactivalo)")) await Datos.aPapelera("servicios", id, s);
}
async function cargarSugeridos() {
  const b = db.batch();
  for (const x of SERVICIOS_SUGERIDOS) await crearDoc("servicios", { nombre: x[0], categoria: x[1], duracion: x[2] || null, precio: 0, iva: 10, activo: true }, b);
  await escribir(b.commit());
  toast("Servicios cargados. Completá los precios.", "ok");
}
window.abrirFormServicio = abrirFormServicio; window.eliminarServicio = eliminarServicio;
document.addEventListener("DOMContentLoaded", initServicios);
