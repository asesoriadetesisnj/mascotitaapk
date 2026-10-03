/* =====================================================================
 * papelera.js (solo ADMIN) — Registros enviados a la papelera
 * Restaurar o eliminar definitivamente. Antes, borrar una mascota era
 * irreversible.
 * ===================================================================== */
const COLS_PAPELERA = ["mascotas", "propietarios", "consultas", "vacunas", "cirugias", "citas", "productos", "servicios", "proveedores"];
const NOMBRES_COL = { mascotas: "Mascota", propietarios: "Dueño", consultas: "Consulta", vacunas: "Vacuna", cirugias: "Cirugía", citas: "Cita", productos: "Producto", servicios: "Servicio", proveedores: "Proveedor" };
let _pap = [];

async function initPapelera() {
  await protegerPagina({ permiso: "admin", pagina: "papelera.html" });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-trash-can-arrow-up"></i> Papelera</h1></div>' +
    '<p class="lead">Lo que se elimina en el sistema llega acá. Restaurarlo lo devuelve tal cual estaba.</p>' +
    '<div class="filtros card"><input type="search" id="pp-buscar" placeholder="Buscar..."><select id="pp-col"><option value="">Todo</option>' +
    COLS_PAPELERA.map(function (c) { return '<option value="' + c + '">' + NOMBRES_COL[c] + "</option>"; }).join("") + "</select></div><div id=\"pp-tabla\">" + skeleton(5) + "</div>";
  document.getElementById("pp-buscar").oninput = debounce(pintarPap, 150);
  document.getElementById("pp-col").onchange = pintarPap;
  await cargarPap();
}
async function cargarPap() {
  const r = await Promise.all(COLS_PAPELERA.map(function (c) {
    return db.collection(c).where("eliminado", "==", true).get().then(function (s) { return docsDe(s).map(function (d) { return Object.assign({ _col: c }, d); }); }).catch(function () { return []; });
  }));
  _pap = [].concat.apply([], r);
  pintarPap();
}
function pintarPap() {
  const q = document.getElementById("pp-buscar").value, c = document.getElementById("pp-col").value;
  tabla("pp-tabla", {
    filas: _pap.filter(function (x) { return (!c || x._col === c) && coincide((x.eliminadoEtiqueta || "") + " " + (x.nombre || x.mascota || ""), q); }),
    orden: "eliminadoEn", dir: -1, vacio: "La papelera está vacía.", vacioIcono: "fa-trash-can",
    columnas: [
      { k: "_col", t: "Tipo", r: function (x) { return pill(NOMBRES_COL[x._col], "neutral"); } },
      { k: "eliminadoEtiqueta", t: "Registro", r: function (x) { return escHTML(x.eliminadoEtiqueta || x.nombre || x.id); } },
      { k: "eliminadoEn", t: "Eliminado", v: function (x) { return aFecha(x.eliminadoEn); }, r: function (x) { return fmtFecha(x.eliminadoEn) + "<br><small>" + escHTML(x.eliminadoPor || "") + "</small>"; } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (x) {
        return '<button class="btn btn-secundario btn-sm" onclick="restaurarPap(\'' + x._col + "','" + x.id + '\')"><i class="fa-solid fa-rotate-left"></i> Restaurar</button> ' +
          btnIcono("fa-fire", "Eliminar definitivamente", "borrarDefinitivo('" + x._col + "','" + x.id + "')", "danger");
      } }
    ]
  });
}
async function restaurarPap(col, id) {
  await Datos.restaurar(col, id);
  if (col === "vacunas") { const x = _pap.find(function (p) { return p.id === id; }); if (x) await recalcularVigenciaPap(x.mascotaId); }
  toast("Restaurado.", "ok"); cargarPap();
}
async function recalcularVigenciaPap(mascotaId) {
  if (!mascotaId) return;
  const vs = docsDe(await db.collection("vacunas").where("mascotaId", "==", mascotaId).get());
  const ult = {};
  vs.forEach(function (v) { if (v.eliminado) return; const k = Datos.claveVacuna(v), f = aFecha(v.fecha) || new Date(0); if (!ult[k] || f > ult[k].f) ult[k] = { id: v.id, f: f }; });
  const b = db.batch(); let n = 0;
  vs.forEach(function (v) { const vig = !v.eliminado && ult[Datos.claveVacuna(v)] && ult[Datos.claveVacuna(v)].id === v.id; if (!!v.vigente !== !!vig) { b.update(db.collection("vacunas").doc(v.id), { vigente: !!vig }); n++; } });
  if (n) await b.commit();
}
async function borrarDefinitivo(col, id) {
  const x = _pap.find(function (p) { return p.id === id; });
  if (!(await confirmar("Eliminar DEFINITIVAMENTE \"" + (x.eliminadoEtiqueta || id) + "\". Esto no se puede deshacer. ¿Continuar?", { textoSi: "Eliminar para siempre" }))) return;
  try {
    requiereConexion("Eliminar definitivamente");
    if (col === "mascotas") {
      await db.collection("fotos").doc(id).delete().catch(function () {});
      if (x.carnetToken) await db.collection("carnets").doc(x.carnetToken).delete().catch(function () {});
    }
    if (col === "mascotas" && (x.fotoPath || x.fotoURL)) {
      try { const st = await obtenerStorage(); await (x.fotoPath ? st.ref(x.fotoPath) : st.refFromURL(x.fotoURL)).delete(); } catch (e) { console.warn("foto:", e.code); }
    }
    if (col === "consultas" && (x.adjuntos || []).length) {
      const st = await obtenerStorage();
      for (const a of x.adjuntos) { try { await st.ref(a.path).delete(); } catch (e) { console.warn(e.code); } }
    }
    await db.collection(col).doc(id).delete();
    registrarAuditoria("eliminar", col, "Eliminó definitivamente: " + (x.eliminadoEtiqueta || id));
    toast("Eliminado definitivamente.", "ok"); cargarPap();
  } catch (e) { toast(mensajeError(e), "error"); }
}
window.restaurarPap = restaurarPap; window.borrarDefinitivo = borrarDefinitivo;
document.addEventListener("DOMContentLoaded", initPapelera);
