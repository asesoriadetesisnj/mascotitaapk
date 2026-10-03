/* =====================================================================
 * main.js — Nucleo compartido por todas las paginas internas
 * ---------------------------------------------------------------------
 *  1. Roles y permisos (admin / veterinario / recepcion)
 *  2. Formato (moneda, fechas sin desfase de zona horaria, texto)
 *  3. Escrituras con soporte offline + indicador de sincronizacion
 *  4. UI: toasts, modales (pila + Esc), formularios con anti doble-clic,
 *     tablas ordenables/paginadas, selector con autocompletado
 *  5. Layout (menu lateral agrupado, barra superior, menu inferior movil)
 *  6. Guard de pagina (sesion + rol), cierre por inactividad, PWA
 *  7. Carga diferida de librerias pesadas (PDF, Excel, graficos, escaner)
 * ===================================================================== */

window.MASCOTITA = window.MASCOTITA || {};
window.MASCOTITA.usuario = null;
const FS = firebase.firestore.FieldValue;
const TS = firebase.firestore.Timestamp;

/* =====================================================================
 * 1. ROLES Y PERMISOS
 * La seguridad real esta en firestore.rules; esto solo adapta la interfaz.
 * ===================================================================== */
const ROLES = {
  admin:       { nombre: "Administrador", permisos: "*" },
  veterinario: { nombre: "Veterinario",   permisos: ["pacientes", "clinica", "agenda", "stock", "recordatorios"] },
  recepcion:   { nombre: "Recepción",     permisos: ["pacientes", "agenda", "stock", "recordatorios", "facturar", "caja"] },
  cajero:      { nombre: "Cajero/a",      permisos: ["facturar", "caja", "stock"] }
};
/* "user" (version anterior) equivale a veterinario. */
function rolNormalizado(r) { return r === "admin" || r === "recepcion" || r === "cajero" ? r : "veterinario"; }
/* Pantalla de inicio segun el rol (la cajera entra directo al punto de venta). */
function paginaInicio() { const u = window.MASCOTITA.usuario; return u && rolNormalizado(u.role) === "cajero" ? "venta.html" : "dashboard.html"; }
function nombreRol(r) { return ROLES[rolNormalizado(r)].nombre; }
function puede(permiso) {
  const u = window.MASCOTITA.usuario;
  if (!u) return false;
  const rol = ROLES[rolNormalizado(u.role)];
  if (rol.permisos === "*") return true;
  if (permiso === "clinica_ver") return rolNormalizado(u.role) !== "cajero";   // todos (menos caja) ven la historia clinica
  if (permiso === "admin") return false;
  return rol.permisos.indexOf(permiso) !== -1;
}
function esAdmin() { return puede("admin"); }

/* =====================================================================
 * 2. FORMATO
 * ===================================================================== */
function fmtMoneda(n) { return "Gs\u00a0" + Math.round(Number(n || 0)).toLocaleString("es-PY"); }
function fmtNum(n, dec) { return Number(n || 0).toLocaleString("es-PY", { maximumFractionDigits: dec == null ? 2 : dec }); }
function aFecha(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && ts.seconds != null) return new Date(ts.seconds * 1000);
  const d = new Date(ts); return isNaN(d) ? null : d;
}
function fmtFecha(ts) {
  const d = aFecha(ts); if (!d) return "";
  return d.toLocaleDateString("es-PY") + " " + d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtFechaCorta(ts) { const d = aFecha(ts); return d ? d.toLocaleDateString("es-PY") : ""; }
function fmtHora(ts) { const d = aFecha(ts); return d ? String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : ""; }
function fmtFechaLarga(ts) { const d = aFecha(ts); return d ? d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""; }
/* Fechas "solo dia" SIEMPRE en hora local (evita el desfase de UTC-3). */
function fechaInput(ts) {
  const d = aFecha(ts); if (!d) return "";
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function horaInput(ts) { const d = aFecha(ts); return d ? String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : ""; }
function parseFechaLocal(str, hora) {
  if (!str) return null;
  const p = str.split("-").map(Number);
  const h = (hora || "00:00").split(":").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2], h[0] || 0, h[1] || 0, 0, 0);
  return isNaN(d) ? null : d;
}
function tsDeInput(str, hora) { const d = parseFechaLocal(str, hora); return d ? TS.fromDate(d) : null; }
function hoyISO() { return fechaInput(new Date()); }
function inicioDelDia(d) { const x = new Date(d || new Date()); x.setHours(0, 0, 0, 0); return x; }
function finDelDia(d) { const x = new Date(d || new Date()); x.setHours(23, 59, 59, 999); return x; }
function sumarDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function diasEntre(a, b) { return Math.round((inicioDelDia(b) - inicioDelDia(a)) / 86400000); }
function edadDesde(fn) {
  const d = aFecha(fn); if (!d) return "";
  const hoy = new Date();
  let meses = (hoy.getFullYear() - d.getFullYear()) * 12 + hoy.getMonth() - d.getMonth();
  if (hoy.getDate() < d.getDate()) meses--;
  if (meses < 0) return "";
  if (meses < 1) return Math.max(0, diasEntre(d, hoy)) + " días";
  if (meses < 24) return meses + (meses === 1 ? " mes" : " meses");
  const a = Math.floor(meses / 12), m = meses % 12;
  return a + " años" + (m ? " " + m + (m === 1 ? " mes" : " meses") : "");
}
/* Texto sin tildes y en minusculas, para buscar "Perez" = "pérez". */
function normalizar(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
function coincide(texto, q) {
  if (!q) return true;
  const t = normalizar(texto);
  return normalizar(q).split(/\s+/).every(function (p) { return t.indexOf(p) !== -1; });
}
function paramURL(nombre) { try { return new URLSearchParams(location.search).get(nombre) || ""; } catch (e) { return ""; } }
function paramQ() { return paramURL("q"); }
function escHTML(str) {
  return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function debounce(fn, ms) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function docsDe(snap) { return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
function iniciales(n) { return String(n || "?").trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase(); }

/* =====================================================================
 * Mensajes de error comprensibles
 * ===================================================================== */
function mensajeError(e) {
  const c = e && e.code;
  if (e && e.mensaje) return e.mensaje;
  if (c === "permission-denied") return "No tenés permiso para esta acción.";
  if (c === "unavailable") return "No hay conexión con el servidor. Probá de nuevo.";
  if (c === "failed-precondition" && /index/i.test(e.message || "")) { console.warn("Falta un índice:", e.message); return "Falta un índice en Firestore (ver README, paso de índices)."; }
  if (c === "storage/unauthorized") return "Sin permiso para subir archivos.";
  if (c === "storage/canceled") return "Subida cancelada.";
  if (c === "aborted") return "Otro usuario modificó el registro al mismo tiempo. Probá de nuevo.";
  return (e && e.message) ? "Error: " + e.message : "Ocurrió un error inesperado.";
}
function errorUsuario(msg) { return { mensaje: msg }; }

/* =====================================================================
 * 3. ESCRITURAS CON SOPORTE OFFLINE
 * Firestore resuelve la promesa de escritura SOLO cuando el servidor
 * confirma. Sin internet eso nunca pasa, la pantalla quedaria colgada.
 * escribir() aplica el cambio localmente (las listas se actualizan al
 * instante) y no bloquea: si esta offline o lento, sigue y queda
 * "pendiente de sincronizar" en el indicador.
 * ===================================================================== */
const Sync = { pendientes: 0 };
function escribir(promesa) {
  let manejado = false;
  Sync.pendientes++; pintarSync();
  promesa.then(function () {}, function (e) {
    if (!manejado) { console.error(e); toast("Un cambio no se pudo guardar en el servidor: " + mensajeError(e), "error", 8000); }
  }).then(function () { Sync.pendientes = Math.max(0, Sync.pendientes - 1); pintarSync(); });
  if (!navigator.onLine) return Promise.resolve("offline");
  return Promise.race([promesa.then(function () { return "ok"; }), esperar(7000).then(function () { return "pendiente"; })])
    .catch(function (e) { manejado = true; throw e; });
}
function requiereConexion(accion) {
  if (!navigator.onLine) throw errorUsuario((accion || "Esta operación") + " necesita conexión a internet (para no descuadrar números ni stock).");
}
function metaCrear() {
  const u = window.MASCOTITA.usuario || {};
  return { creadoEn: FS.serverTimestamp(), creadoPor: u.nombre || "", creadoPorUid: u.uid || "" };
}
function metaEditar() {
  const u = window.MASCOTITA.usuario || {};
  return { actualizadoEn: FS.serverTimestamp(), actualizadoPor: u.nombre || "" };
}
/* Crea un documento con ID generado en el cliente (funciona offline). */
async function crearDoc(col, datos, batch) {
  const ref = db.collection(col).doc();
  const d = Object.assign({}, datos, metaCrear());
  if (batch) { batch.set(ref, d); return ref.id; }
  await escribir(ref.set(d));
  return ref.id;
}
async function actualizarDoc(col, id, datos, batch) {
  const ref = db.collection(col).doc(id);
  const d = Object.assign({}, datos, metaEditar());
  if (batch) { batch.update(ref, d); return id; }
  await escribir(ref.update(d));
  return id;
}

/* =====================================================================
 * 4. UI — Toasts
 * ===================================================================== */
function toast(msg, tipo, ms, accion) {
  tipo = tipo || "info";
  let cont = document.getElementById("toast-container");
  if (!cont) { cont = document.createElement("div"); cont.id = "toast-container"; cont.setAttribute("aria-live", "polite"); document.body.appendChild(cont); }
  const iconos = { ok: "fa-circle-check", error: "fa-circle-xmark", warn: "fa-triangle-exclamation", info: "fa-circle-info" };
  const el = document.createElement("div");
  el.className = "toast toast-" + tipo;
  el.innerHTML = '<i class="fa-solid ' + (iconos[tipo] || iconos.info) + '"></i><span>' + escHTML(msg) + "</span>" +
    (accion ? '<button class="toast-accion">' + escHTML(accion.texto) + "</button>" : "");
  if (accion) el.querySelector(".toast-accion").onclick = function () { accion.fn(); quitar(); };
  cont.appendChild(el);
  requestAnimationFrame(function () { el.classList.add("show"); });
  function quitar() { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 300); }
  setTimeout(quitar, ms || (tipo === "error" ? 6000 : 3500));
}

/* Barra de progreso superior (no bloquea la pantalla como el spinner viejo). */
let _cargas = 0;
function mostrarLoading(mostrar) {
  _cargas = Math.max(0, _cargas + (mostrar ? 1 : -1));
  let el = document.getElementById("barra-carga");
  if (!el) { el = document.createElement("div"); el.id = "barra-carga"; document.body.appendChild(el); }
  el.classList.toggle("activa", _cargas > 0);
}

/* =====================================================================
 * Modales (pila). Esc o clic en el fondo cierran el de arriba.
 * ===================================================================== */
const _pilaModales = [];
function abrirModal(op) {
  op = op || {};
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML =
    '<div class="modal-box ' + (op.ancho || "") + '" role="dialog" aria-modal="true">' +
    '<div class="modal-head"><h3>' + (op.tituloHTML || escHTML(op.titulo || "")) + '</h3>' +
    '<button type="button" class="icon-btn" data-cerrar aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
    '<div class="modal-body">' + (op.cuerpo || "") + "</div>" +
    (op.pie ? '<div class="modal-actions">' + op.pie + "</div>" : "") + "</div>";
  document.body.appendChild(ov);
  document.body.classList.add("con-modal");
  const m = {
    el: ov, abierto: true,
    cerrar: function (motivo) {
      if (!m.abierto) return;
      if (op.antesDeCerrar && op.antesDeCerrar(motivo) === false) return;
      m.abierto = false;
      const i = _pilaModales.indexOf(m); if (i !== -1) _pilaModales.splice(i, 1);
      ov.classList.remove("show");
      setTimeout(function () { ov.remove(); if (!_pilaModales.length) document.body.classList.remove("con-modal"); }, 160);
      if (op.alCerrar) op.alCerrar(motivo);
    },
    q: function (sel) { return ov.querySelector(sel); }
  };
  _pilaModales.push(m);
  ov.querySelectorAll("[data-cerrar]").forEach(function (b) { b.onclick = function () { m.cerrar("cancelar"); }; });
  let downEnFondo = false;
  ov.addEventListener("mousedown", function (e) { downEnFondo = e.target === ov; });
  ov.addEventListener("click", function (e) { if (downEnFondo && e.target === ov) m.cerrar("fondo"); });
  requestAnimationFrame(function () { ov.classList.add("show"); });
  if (op.foco !== false) {
    const primero = ov.querySelector(".modal-body input:not([type=hidden]):not([readonly]), .modal-body select, .modal-body textarea");
    if (primero && window.innerWidth > 700) setTimeout(function () { if (!ov.contains(document.activeElement)) primero.focus(); }, 60);
  }
  return m;
}
function cerrarModales() { _pilaModales.slice().forEach(function (m) { m.cerrar("todos"); }); }
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && _pilaModales.length) { e.preventDefault(); _pilaModales[_pilaModales.length - 1].cerrar("esc"); }
});

/* Confirmacion (Esc / fondo / Cancelar => false). */
function confirmar(mensaje, op) {
  op = op || {};
  return new Promise(function (resolve) {
    let resp = false;
    const m = abrirModal({
      titulo: op.titulo || "Confirmar", ancho: "modal-sm", foco: false,
      cuerpo: '<p class="confirm-txt">' + escHTML(mensaje) + "</p>",
      pie: '<button type="button" class="btn btn-ghost" data-cerrar>' + escHTML(op.textoNo || "Cancelar") + '</button>' +
        '<button type="button" class="btn ' + (op.peligro === false ? "btn-primary" : "btn-danger") + '" data-si>' + escHTML(op.textoSi || "Sí, continuar") + "</button>",
      alCerrar: function () { resolve(resp); }
    });
    m.q("[data-cerrar]").onclick = function () { m.cerrar("cancelar"); };
    const si = m.q("[data-si]"); si.focus();
    si.onclick = function () { resp = true; m.cerrar("ok"); };
  });
}

/* Formulario en modal con anti doble-clic.
 * onGuardar(m) puede ser async; si devuelve false el modal queda abierto. */
function modalForm(titulo, html, op) {
  op = op || {};
  const m = abrirModal({
    titulo: titulo, tituloHTML: op.tituloHTML, ancho: op.ancho,
    cuerpo: '<form class="form-modal" novalidate>' + html + '<button type="submit" hidden></button></form>',
    pie: (op.pieExtra || "") + '<button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>' +
      '<button type="button" class="btn btn-primary" data-guardar><i class="fa-solid ' + (op.icono || "fa-floppy-disk") + '"></i> ' + escHTML(op.textoGuardar || "Guardar") + "</button>",
    antesDeCerrar: op.antesDeCerrar, alCerrar: op.alCerrar
  });
  const btn = m.q("[data-guardar]");
  let enCurso = false;
  async function guardar() {
    if (enCurso || !op.onGuardar) return;
    if (!validarRequeridos(m.el)) return;
    enCurso = true; btn.disabled = true;
    const htmlOrig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Guardando...';
    try {
      const r = await op.onGuardar(m);
      if (r !== false) m.cerrar("guardado");
    } catch (e) { console.error(e); toast(mensajeError(e), e && e.mensaje ? "warn" : "error"); }
    finally { enCurso = false; btn.disabled = false; btn.innerHTML = htmlOrig; }
  }
  btn.onclick = guardar;
  m.q("form").onsubmit = function (e) { e.preventDefault(); guardar(); };
  m.guardar = guardar;
  return m;
}
function validarRequeridos(raiz) {
  let ok = true, primero = null;
  raiz.querySelectorAll("[data-req]").forEach(function (el) {
    const vacio = !String(el.value || "").trim();
    el.closest(".form-field") && el.closest(".form-field").classList.toggle("con-error", vacio);
    if (vacio) { ok = false; primero = primero || el; }
  });
  if (!ok) { toast("Completá los campos marcados.", "warn"); primero.focus(); }
  return ok;
}

/* ---------- Helpers de campos (id = "f-<clave>") ---------- */
function _attrs(op) {
  let a = "";
  if (op.req) a += " data-req required";
  if (op.min != null) a += ' min="' + op.min + '"';
  if (op.max != null) a += ' max="' + op.max + '"';
  if (op.step != null) a += ' step="' + op.step + '"';
  if (op.ph) a += ' placeholder="' + escHTML(op.ph) + '"';
  if (op.lista) a += ' list="' + op.lista + '"';
  if (op.ro) a += " readonly";
  if (op.attrs) a += " " + op.attrs;
  return a;
}
function _envolver(clave, label, control, op) {
  return '<div class="form-field' + (op.full ? " full" : "") + (op.clase ? " " + op.clase : "") + '">' +
    '<label for="f-' + clave + '">' + escHTML(label) + (op.req ? ' <span class="req">*</span>' : "") + "</label>" + control +
    (op.ayuda ? '<small class="hint">' + escHTML(op.ayuda) + "</small>" : "") + "</div>";
}
function campo(clave, label, valor, tipo, op) {
  op = op || {}; tipo = tipo || "text";
  if (tipo === "number" && op.step == null) op.step = "any";
  const inputmode = tipo === "number" ? ' inputmode="decimal"' : (tipo === "tel" ? ' inputmode="tel"' : "");
  return _envolver(clave, label, '<input id="f-' + clave + '" type="' + tipo + '"' + inputmode + ' value="' + escHTML(valor == null ? "" : valor) + '"' + _attrs(op) + ">", op);
}
function areaCampo(clave, label, valor, op) {
  op = op || {}; if (op.full !== false) op.full = true;
  return _envolver(clave, label, '<textarea id="f-' + clave + '" rows="' + (op.filas || 2) + '"' + _attrs(op) + ">" + escHTML(valor || "") + "</textarea>", op);
}
function selectCampo(clave, label, opciones, seleccion, op) {
  op = op || {};
  const ops = (op.vacio ? '<option value="">' + escHTML(op.vacio) + "</option>" : "") + opciones.map(function (o) {
    const v = typeof o === "object" ? o.value : o, t = typeof o === "object" ? o.texto : o;
    return '<option value="' + escHTML(v) + '"' + (String(v) === String(seleccion == null ? "" : seleccion) ? " selected" : "") + ">" + escHTML(t) + "</option>";
  }).join("");
  return _envolver(clave, label, '<select id="f-' + clave + '"' + _attrs(op) + ">" + ops + "</select>", op);
}
function checkCampo(clave, label, marcado, op) {
  op = op || {};
  return '<label class="check' + (op.full ? " full" : "") + '"><input type="checkbox" id="f-' + clave + '"' + (marcado ? " checked" : "") + "> " + escHTML(label) + "</label>";
}
function el(clave) { return document.getElementById("f-" + clave); }
function val(clave) { const e = el(clave); return e ? String(e.value).trim() : ""; }
function num(clave) { const v = val(clave).replace(",", "."); const n = Number(v); return v === "" || isNaN(n) ? 0 : n; }
function numONull(clave) { const v = val(clave).replace(",", "."); return v === "" || isNaN(Number(v)) ? null : Number(v); }
function chk(clave) { const e = el(clave); return !!(e && e.checked); }

/* Boton protegido contra doble clic fuera de modales. */
async function conBoton(btn, fn) {
  if (!btn || btn.disabled) return;
  const h = btn.innerHTML; btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-sm"></span>' + (btn.dataset.cargando ? " " + escHTML(btn.dataset.cargando) : "");
  try { return await fn(); }
  catch (e) { console.error(e); toast(mensajeError(e), e && e.mensaje ? "warn" : "error"); }
  finally { btn.disabled = false; btn.innerHTML = h; }
}

/* =====================================================================
 * Tabla ordenable + paginada + responsive (en movil se ve como tarjetas)
 * columnas: [{ k, t, r(fila)->html, v(fila)->valorOrden, cls, sort:false }]
 * ===================================================================== */
function tabla(cont, op) {
  if (typeof cont === "string") cont = document.getElementById(cont);
  if (!cont) return;
  const st = cont._tabla = cont._tabla || { orden: op.orden || null, dir: op.dir || 1, mostrar: op.porPagina || 50 };
  if (op.reiniciar) st.mostrar = op.porPagina || 50;
  let filas = (op.filas || []).slice();
  const col = op.columnas.find(function (c) { return c.k === st.orden; });
  if (col) {
    const getv = col.v || function (f) { return f[col.k]; };
    filas.sort(function (a, b) {
      let x = getv(a), y = getv(b);
      if (x && x.toDate) x = x.toDate(); if (y && y.toDate) y = y.toDate();
      if (x instanceof Date) x = x.getTime(); if (y instanceof Date) y = y.getTime();
      if (x == null || x === "") return 1; if (y == null || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * st.dir;
      return String(x).localeCompare(String(y), "es", { numeric: true }) * st.dir;
    });
  }
  const total = filas.length;
  const visibles = filas.slice(0, st.mostrar);
  const th = op.columnas.map(function (c) {
    const ord = c.sort !== false && c.k;
    const flecha = st.orden === c.k ? (st.dir === 1 ? " fa-sort-up" : " fa-sort-down") : " fa-sort";
    return "<th" + (ord ? ' class="ordenable" data-k="' + c.k + '"' : "") + (c.cls ? ' style="' + (c.cls === "num" ? "text-align:right" : "") + '"' : "") + ">" +
      escHTML(c.t) + (ord ? ' <i class="fa-solid' + flecha + '"></i>' : "") + "</th>";
  }).join("");
  const body = visibles.length ? visibles.map(function (f, i) {
    return '<tr' + (op.claseFila ? ' class="' + (op.claseFila(f) || "") + '"' : "") + (op.alClic ? ' data-i="' + i + '" tabindex="0"' : "") + ">" +
      op.columnas.map(function (c) {
        const v = c.r ? c.r(f) : escHTML(f[c.k] == null ? "" : f[c.k]);
        return '<td data-label="' + escHTML(c.t) + '"' + (c.cls ? ' class="' + c.cls + '"' : "") + '><span class="td-v">' + v + "</span></td>";
      }).join("") + "</tr>";
  }).join("") : '<tr class="fila-vacia"><td colspan="' + op.columnas.length + '">' + vacio(op.vacio || "Sin registros", op.vacioIcono) + "</td></tr>";
  cont.innerHTML = '<div class="table-wrap"><table class="tabla tabla-resp"><thead><tr>' + th + "</tr></thead><tbody>" + body + "</tbody></table></div>" +
    (total > st.mostrar ? '<div class="mas-wrap"><button class="btn btn-ghost btn-mas">Mostrar más (' + (total - st.mostrar) + " restantes)</button></div>" : "") +
    (op.pie ? op.pie : "");
  cont.querySelectorAll("th.ordenable").forEach(function (h) {
    h.onclick = function () {
      if (st.orden === h.dataset.k) st.dir = -st.dir; else { st.orden = h.dataset.k; st.dir = 1; }
      tabla(cont, Object.assign({}, op, { reiniciar: false }));
    };
  });
  const mas = cont.querySelector(".btn-mas");
  if (mas) mas.onclick = function () { st.mostrar += op.porPagina || 50; tabla(cont, Object.assign({}, op, { reiniciar: false })); };
  if (op.alClic) cont.querySelectorAll("tbody tr[data-i]").forEach(function (tr) {
    tr.addEventListener("click", function (e) { if (e.target.closest("button, a, input, select")) return; op.alClic(visibles[Number(tr.dataset.i)]); });
    tr.addEventListener("keydown", function (e) { if (e.key === "Enter") op.alClic(visibles[Number(tr.dataset.i)]); });
  });
}
function vacio(texto, icono, accionHTML) {
  return '<div class="estado-vacio"><i class="fa-solid ' + (icono || "fa-inbox") + '"></i><p>' + escHTML(texto) + "</p>" + (accionHTML || "") + "</div>";
}
function skeleton(n, tipo) {
  let h = "";
  for (let i = 0; i < (n || 5); i++) h += '<div class="sk ' + (tipo || "sk-fila") + '"></div>';
  return '<div class="sk-wrap">' + h + "</div>";
}
function pill(texto, tipo) { return '<span class="pill pill-' + (tipo || "neutral") + '">' + escHTML(texto) + "</span>"; }
function btnIcono(icono, titulo, onclick, clase) {
  return '<button type="button" class="btn-icono ' + (clase || "") + '" title="' + escHTML(titulo) + '" aria-label="' + escHTML(titulo) + '" onclick="' + onclick + '"><i class="' + (icono.indexOf("fa-brands") === 0 ? icono : "fa-solid " + icono) + '"></i></button>';
}

/* =====================================================================
 * Selector con autocompletado (mascotas, duenos, productos, servicios...)
 * selector(contenedor, { items: fn->array, texto: fn(item), sub: fn(item),
 *   valor, placeholder, onChange(item), libre: bool, nuevo: {texto, fn} })
 * ===================================================================== */
function selector(cont, op) {
  if (typeof cont === "string") cont = document.getElementById(cont);
  const id = "sel" + Math.random().toString(36).slice(2, 8);
  cont.classList.add("selector");
  cont.innerHTML = '<div class="sel-input"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="' + id + '" autocomplete="off" placeholder="' + escHTML(op.placeholder || "Buscar...") + '"' + (op.req ? " data-req" : "") + '>' +
    '<button type="button" class="sel-limpiar" title="Quitar" hidden><i class="fa-solid fa-xmark"></i></button></div><div class="sel-lista" hidden></div>';
  const inp = cont.querySelector("input"), lista = cont.querySelector(".sel-lista"), limpiar = cont.querySelector(".sel-limpiar");
  let actual = null, resultados = [], idx = -1;
  function textoDe(it) { return it ? op.texto(it) : ""; }
  function set(item, silencio) {
    actual = item || null;
    inp.value = actual ? textoDe(actual) : (op.libre ? inp.value : "");
    limpiar.hidden = !actual;
    cont.classList.toggle("con-valor", !!actual);
    lista.hidden = true;
    if (!silencio && op.onChange) op.onChange(actual);
  }
  function pintar() {
    const q = inp.value;
    const todos = op.items() || [];
    resultados = todos.filter(function (it) { return coincide((op.buscar ? op.buscar(it) : textoDe(it)), q); }).slice(0, 30);
    idx = resultados.length ? 0 : -1;
    lista.innerHTML = resultados.map(function (it, i) {
      return '<div class="sel-item' + (i === idx ? " activo" : "") + '" data-i="' + i + '">' +
        (op.icono ? op.icono(it) : "") + '<div><b>' + escHTML(textoDe(it)) + "</b>" + (op.sub ? '<small>' + escHTML(op.sub(it) || "") + "</small>" : "") + "</div></div>";
    }).join("") + (op.nuevo ? '<div class="sel-item sel-nuevo" data-nuevo><i class="fa-solid fa-plus"></i><div><b>' + escHTML(op.nuevo.texto) + "</b></div></div>" : "") +
      (!resultados.length && !op.nuevo ? '<div class="sel-vacio">Sin resultados</div>' : "");
    lista.hidden = false;
  }
  inp.addEventListener("focus", pintar);
  inp.addEventListener("input", function () { if (actual) { actual = null; limpiar.hidden = true; cont.classList.remove("con-valor"); if (op.onChange) op.onChange(null); } pintar(); });
  inp.addEventListener("keydown", function (e) {
    if (lista.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); idx = Math.max(0, Math.min(resultados.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)));
      lista.querySelectorAll(".sel-item[data-i]").forEach(function (x, i) { x.classList.toggle("activo", i === idx); if (i === idx) x.scrollIntoView({ block: "nearest" }); });
    } else if (e.key === "Enter") { if (idx >= 0 && resultados[idx]) { e.preventDefault(); set(resultados[idx]); } }
    else if (e.key === "Escape") { e.stopPropagation(); lista.hidden = true; }
  });
  lista.addEventListener("mousedown", function (e) {
    e.preventDefault();
    const it = e.target.closest(".sel-item"); if (!it) return;
    if (it.hasAttribute("data-nuevo")) { lista.hidden = true; op.nuevo.fn(inp.value); return; }
    set(resultados[Number(it.dataset.i)]);
  });
  inp.addEventListener("blur", function () { setTimeout(function () { lista.hidden = true; if (!actual && !op.libre) inp.value = ""; }, 150); });
  limpiar.onclick = function () { inp.value = ""; set(null); inp.focus(); };
  if (op.valor) { const it = (op.items() || []).find(function (x) { return x.id === op.valor; }); if (it) set(it, true); }
  else if (op.textoInicial) inp.value = op.textoInicial;
  return {
    get: function () { return actual; },
    texto: function () { return inp.value.trim(); },
    set: function (idOItem) { const it = typeof idOItem === "string" ? (op.items() || []).find(function (x) { return x.id === idOItem; }) : idOItem; set(it); },
    input: inp, refrescar: function () { if (!lista.hidden) pintar(); }
  };
}

/* =====================================================================
 * 5. LAYOUT
 * ===================================================================== */
const MENU = [
  { grupo: "Clínica" },
  { href: "dashboard.html",     icon: "fa-gauge-high",          texto: "Panel",              p: "clinica_ver" },
  { href: "citas.html",         icon: "fa-calendar-days",       texto: "Agenda",             p: "agenda" },
  { href: "pacientes.html",     icon: "fa-paw",                 texto: "Pacientes",          p: "pacientes", extra: ["paciente.html"] },
  { href: "consultas.html",     icon: "fa-stethoscope",         texto: "Atención clínica",   p: "clinica_ver", sub: "clinica" },
  { href: "recordatorios.html", icon: "fa-bell",                texto: "Recordatorios",      p: "recordatorios" },
  { grupo: "Ventas" },
  { href: "venta.html",         icon: "fa-cash-register",       texto: "Punto de venta",     p: "facturar", sub: "ventas" },
  { href: "facturas.html",      icon: "fa-file-invoice-dollar", texto: "Comprobantes",       p: "facturar", sub: "ventas" },
  { href: "caja.html",          icon: "fa-vault",               texto: "Caja",               p: "caja", sub: "ventas" },
  { grupo: "Inventario" },
  { href: "stock.html",         icon: "fa-boxes-stacked",       texto: "Productos y stock",  p: "stock", sub: "inventario" },
  { href: "servicios.html",     icon: "fa-tags",                texto: "Servicios y precios", p: "clinica_ver", sub: "inventario" },
  { href: "compras.html",       icon: "fa-truck-field",         texto: "Compras",            p: "admin", sub: "inventario" },
  { grupo: "Administración", p: "admin" },
  { href: "reportes.html",      icon: "fa-chart-line",          texto: "Reportes",           p: "admin" },
  { href: "usuarios.html",      icon: "fa-users",               texto: "Usuarios",           p: "admin" },
  { href: "auditoria.html",     icon: "fa-clipboard-list",      texto: "Auditoría y papelera", p: "admin", sub: "admin" },
  { href: "configuracion.html", icon: "fa-gear",                texto: "Configuración",      p: "admin" }
];
/* Pestanas superiores: secciones que antes eran items sueltos del menu. */
const SUBNAV = {
  clinica: [
    { href: "consultas.html", icon: "fa-stethoscope", texto: "Consultas", p: "clinica_ver" },
    { href: "vacunas.html", icon: "fa-shield-virus", texto: "Vacunas", p: "clinica_ver" },
    { href: "cirugias.html", icon: "fa-syringe", texto: "Cirugías", p: "clinica_ver" },
    { href: "internacion.html", icon: "fa-bed-pulse", texto: "Internación", p: "clinica_ver" }
  ],
  ventas: [
    { href: "venta.html", icon: "fa-cash-register", texto: "Punto de venta", p: "facturar" },
    { href: "facturas.html", icon: "fa-file-invoice-dollar", texto: "Comprobantes", p: "facturar" },
    { href: "caja.html", icon: "fa-vault", texto: "Caja", p: "caja" }
  ],
  inventario: [
    { href: "stock.html", icon: "fa-boxes-stacked", texto: "Productos y stock", p: "stock" },
    { href: "servicios.html", icon: "fa-tags", texto: "Servicios", p: "clinica_ver" },
    { href: "compras.html", icon: "fa-truck-field", texto: "Compras", p: "admin" }
  ],
  admin: [
    { href: "auditoria.html", icon: "fa-clipboard-list", texto: "Auditoría", p: "admin" },
    { href: "papelera.html", icon: "fa-trash-can-arrow-up", texto: "Papelera", p: "admin" }
  ]
};
function grupoSubnav(pagina) {
  return Object.keys(SUBNAV).find(function (k) { return SUBNAV[k].some(function (x) { return x.href === pagina; }); }) || "";
}
function subnavHTML(pagina) {
  const g = grupoSubnav(pagina); if (!g) return "";
  const its = SUBNAV[g].filter(function (x) { return puede(x.p); });
  if (its.length < 2) return "";
  return '<nav class="subnav" aria-label="Secciones">' + its.map(function (x) {
    const a = x.href === pagina;
    return '<a href="' + x.href + '"' + (a ? ' class="activo" aria-current="page"' : "") + '><i class="fa-solid ' + x.icon + '"></i><span>' + x.texto + "</span></a>";
  }).join("") + "</nav>";
}

function renderLayout(paginaActiva) {
  const u = window.MASCOTITA.usuario;
  const visibles = MENU.filter(function (m) { return !m.p || puede(m.p); });
  // Quitar grupos sin items
  const items = visibles.filter(function (m, i) { return !m.grupo || (visibles[i + 1] && !visibles[i + 1].grupo); }).map(function (m) {
    if (m.grupo) return '<div class="nav-grupo">' + escHTML(m.grupo) + "</div>";
    // Un item con pestanas (sub) queda activo en todas sus paginas, salvo que la pagina tenga item propio.
    const propio = visibles.some(function (x) { return x.href === paginaActiva; });
    const activo = m.href === paginaActiva || (m.extra && m.extra.indexOf(paginaActiva) !== -1) || (!propio && m.sub && m.sub === grupoSubnav(paginaActiva));
    return '<a class="nav-item' + (activo ? " activo" : "") + '" href="' + m.href + '"' + (activo ? ' aria-current="page"' : "") + '><i class="fa-solid ' + m.icon + '"></i><span>' + m.texto + "</span></a>";
  }).join("");
  const cfg = window.MASCOTITA.config || {};
  const shell = document.getElementById("app-shell");
  if (!shell) return;
  shell.innerHTML =
    '<aside class="sidebar" id="sidebar">' +
    '  <a class="brand" href="' + paginaInicio() + '"><img src="assets/logo.svg" alt="" class="brand-logo"><span class="brand-name">' + escHTML(cfg.clinicaNombre || "Mascotita") + "</span></a>" +
    '  <nav class="nav" aria-label="Menú principal">' + items + "</nav>" +
    '  <div class="sidebar-pie"><span class="version">v3.2 · <a href="#" onclick="mostrarAtajos();return false" class="link">atajos</a></span></div>' +
    "</aside>" +
    '<div class="sidebar-fondo" id="sidebar-fondo"></div>' +
    '<div class="main-wrap">' +
    '  <header class="topbar">' +
    '    <button class="icon-btn only-mobile" id="btn-menu" aria-label="Menú"><i class="fa-solid fa-bars"></i></button>' +
    '    <button class="search-trigger" id="btn-search"><i class="fa-solid fa-magnifying-glass"></i><span>Buscar paciente, dueño, producto...</span><kbd>Ctrl K</kbd></button>' +
    '    <div class="topbar-right">' +
    '      <span class="sync-chip" id="sync-chip" title="Estado de sincronización"></span>' +
    '      <div class="campana-wrap"><button class="icon-btn" id="btn-campana" aria-label="Avisos"><i class="fa-solid fa-bell"></i><span class="badge-num" id="campana-num" hidden>0</span></button><div class="campana-panel" id="campana-panel" hidden></div></div>' +
    '      <button class="icon-btn" id="btn-theme" title="Modo claro / oscuro" aria-label="Cambiar tema"><i class="fa-solid fa-moon"></i></button>' +
    '      <div class="user-menu-wrap"><button class="user-chip" id="btn-user"><span class="avatar">' + escHTML(iniciales(u.nombre)) + '</span><span class="user-txt"><b>' + escHTML(u.nombre) + "</b><small>" + escHTML(nombreRol(u.role)) + '</small></span><i class="fa-solid fa-chevron-down"></i></button>' +
    '        <div class="user-menu" id="user-menu" hidden><div class="um-head"><b>' + escHTML(u.nombre) + "</b><small>" + escHTML(u.email) + '</small></div>' +
    '        <button id="um-pass"><i class="fa-solid fa-key"></i> Cambiar contraseña</button>' +
    '        <button id="um-tema"><i class="fa-solid fa-circle-half-stroke"></i> Modo claro / oscuro</button>' +
    '        <button id="um-atajos"><i class="fa-solid fa-keyboard"></i> Atajos de teclado</button>' +
    '        <button id="btn-logout" class="danger"><i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión</button></div></div>' +
    "    </div>" +
    "  </header>" +
    subnavHTML(paginaActiva) +
    '  <main class="content" id="content">' + skeleton(6) + "</main>" +
    "</div>" +
    '<nav class="bottom-nav" aria-label="Navegación rápida">' +
    navInferior(paginaActiva) +
    "</nav>";

  document.getElementById("btn-logout").onclick = cerrarSesion;
  document.getElementById("um-pass").onclick = cambiarMiContrasena;
  document.getElementById("um-tema").onclick = function () { if (window.toggleTema) window.toggleTema(); };
  document.getElementById("um-atajos").onclick = mostrarAtajos;
  const sb = document.getElementById("sidebar"), fondo = document.getElementById("sidebar-fondo");
  function toggleMenu(abrir) { sb.classList.toggle("abierto", abrir); fondo.classList.toggle("show", abrir); }
  document.getElementById("btn-menu").onclick = function () { toggleMenu(!sb.classList.contains("abierto")); };
  fondo.onclick = function () { toggleMenu(false); };
  const bm = document.getElementById("bn-menu"); if (bm) bm.onclick = function (e) { e.preventDefault(); toggleMenu(true); };
  const bb = document.getElementById("bn-buscar"); if (bb) bb.onclick = function (e) { e.preventDefault(); if (window.abrirBusquedaGlobal) window.abrirBusquedaGlobal(); };
  const bu = document.getElementById("btn-user"), um = document.getElementById("user-menu");
  bu.onclick = function (e) { e.stopPropagation(); um.hidden = !um.hidden; };
  document.addEventListener("click", function (e) { if (!e.target.closest(".user-menu-wrap")) um.hidden = true; });
  document.getElementById("btn-search").onclick = function () { if (window.abrirBusquedaGlobal) window.abrirBusquedaGlobal(); };
  pintarSync();
  if (window.iniciarCampana) window.iniciarCampana();
}
function navInferior(activa) {
  const it = [
    { href: paginaInicio(), icon: "fa-house", t: "Inicio" },
    { href: "venta.html", icon: "fa-cash-register", t: "Vender", p: "facturar", solo: "cajero" },
    { href: "citas.html", icon: "fa-calendar-days", t: "Agenda", p: "agenda" },
    { href: "pacientes.html", icon: "fa-paw", t: "Pacientes", p: "pacientes" },
    { href: "#", icon: "fa-magnifying-glass", t: "Buscar", id: "bn-buscar" },
    { href: "#", icon: "fa-bars", t: "Menú", id: "bn-menu" }
  ];
  const rol = rolNormalizado(window.MASCOTITA.usuario.role);
  return it.filter(function (x) { return (!x.p || puede(x.p)) && (!x.solo || x.solo === rol) && !(rol === "cajero" && x.href === "venta.html" && !x.solo); }).map(function (x) {
    return '<a href="' + x.href + '"' + (x.id ? ' id="' + x.id + '"' : "") + (x.href === activa ? ' class="activo"' : "") + '><i class="fa-solid ' + x.icon + '"></i><span>' + x.t + "</span></a>";
  }).join("");
}

/* Indicador de sincronizacion */
function pintarSync() {
  const c = document.getElementById("sync-chip"); if (!c) return;
  const off = !navigator.onLine;
  let cls = "ok", ico = "fa-cloud", txt = "Sincronizado";
  if (off) { cls = "off"; ico = "fa-cloud-arrow-up"; txt = Sync.pendientes ? "Sin conexión · " + Sync.pendientes + " pendiente(s)" : "Sin conexión"; }
  else if (Sync.pendientes) { cls = "sync"; ico = "fa-rotate"; txt = "Guardando..."; }
  c.className = "sync-chip " + cls;
  c.innerHTML = '<i class="fa-solid ' + ico + '"></i><span>' + txt + "</span>";
  c.title = off ? "Trabajando sin conexión: los cambios se guardan en este equipo y se suben solos al volver internet." : (Sync.pendientes ? "Subiendo cambios al servidor..." : "Todos los cambios están guardados en la nube.");
}
window.addEventListener("online", function () { pintarSync(); toast("Conexión restablecida. Sincronizando cambios...", "ok"); });
window.addEventListener("offline", function () { pintarSync(); toast("Sin conexión. Podés seguir trabajando: los cambios se suben solos al volver internet.", "warn", 6000); });

/* =====================================================================
 * 6. GUARD DE PAGINA
 * El perfil se guarda en sessionStorage para pintar la pantalla al
 * instante; luego un listener en tiempo real lo valida (si un admin
 * desactiva al usuario o le cambia el rol, se aplica al momento).
 * ===================================================================== */
const _PERFIL_KEY = "mascotita-perfil";
function _perfilCache(uid) { try { const p = JSON.parse(sessionStorage.getItem(_PERFIL_KEY) || "null"); return p && p.uid === uid ? p : null; } catch (e) { return null; } }
function _guardarPerfil(p) { try { sessionStorage.setItem(_PERFIL_KEY, JSON.stringify(p)); } catch (e) {} }
function _msgLogin(m) { try { sessionStorage.setItem("mascotita-msg", m); } catch (e) {} }

function protegerPagina(op) {
  op = op || {};
  return new Promise(function (resolve) {
    let resuelto = false;
    const unsubAuth = auth.onAuthStateChanged(function (user) {
      unsubAuth();
      if (!user) { location.replace("index.html"); return; }
      function entrar(perfil) {
        window.MASCOTITA.usuario = perfil;
        if (op.permiso && !puede(op.permiso)) {
          _msgLogin("");
          toast("No tenés permiso para esta sección.", "error");
          setTimeout(function () { location.replace(paginaInicio()); }, 600);
          return;
        }
        if (op.pagina === "dashboard.html" && paginaInicio() !== "dashboard.html") { location.replace(paginaInicio()); return; }
        resuelto = true;
        renderLayout(op.pagina || "");
        resolve(perfil);
      }
      const cache = _perfilCache(user.uid);
      if (cache) { cargarConfigLocal(); entrar(cache); }
      db.collection("users").doc(user.uid).onSnapshot(function (snap) {
        if (snap.metadata.fromCache && !snap.exists) return;    // esperar al servidor
        if (!snap.exists || snap.data().active === false) {
          _msgLogin(!snap.exists ? "Tu cuenta no tiene perfil en Firestore (users/<UID>)." : "Usuario desactivado. Contactá al administrador.");
          try { sessionStorage.removeItem(_PERFIL_KEY); } catch (e) {}
          auth.signOut().then(function () { location.replace("index.html"); });
          return;
        }
        const d = snap.data();
        const perfil = { uid: user.uid, email: user.email, nombre: d.nombre || user.email, role: rolNormalizado(d.role), color: d.color || "", active: true };
        const antes = _perfilCache(user.uid);
        _guardarPerfil(perfil);
        if (!resuelto) { cargarConfig().then(function () { entrar(perfil); }); }
        else if (antes && antes.role !== perfil.role && !snap.metadata.fromCache) { toast("Tu rol cambió. Recargando...", "info"); setTimeout(function () { location.reload(); }, 1200); }
      }, function (e) {
        console.error("perfil:", e);
        if (!resuelto) { toast(e.code === "permission-denied" ? "Sin permiso para leer tu perfil. Revisá las reglas de Firestore." : "Error cargando tu perfil.", "error"); }
      });
    });
  });
}

async function cerrarSesion() {
  registrarAuditoria("logout", "auth", "Cierre de sesión");
  try { sessionStorage.removeItem(_PERFIL_KEY); } catch (e) {}
  await esperar(150);
  await auth.signOut();
  location.replace("index.html");
}

function cambiarMiContrasena() {
  modalForm("Cambiar mi contraseña",
    campo("pa", "Contraseña actual", "", "password", { req: true, attrs: 'autocomplete="current-password"' }) +
    campo("pn", "Nueva contraseña (mínimo 8)", "", "password", { req: true, attrs: 'autocomplete="new-password"' }) +
    campo("pn2", "Repetir nueva contraseña", "", "password", { req: true, attrs: 'autocomplete="new-password"' }),
    { ancho: "modal-sm", onGuardar: async function () {
      requiereConexion("Cambiar la contraseña");
      if (val("pn").length < 8) throw errorUsuario("La nueva contraseña debe tener al menos 8 caracteres.");
      if (val("pn") !== val("pn2")) throw errorUsuario("Las contraseñas nuevas no coinciden.");
      const u = auth.currentUser;
      try {
        await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, el("pa").value));
      } catch (e) { throw errorUsuario("La contraseña actual no es correcta."); }
      await u.updatePassword(el("pn").value);
      registrarAuditoria("editar", "usuarios", "Cambió su contraseña");
      toast("Contraseña actualizada.", "ok");
    } });
}

/* ---------- Configuracion general (cache 60 s + copia local) ---------- */
let _cfgCache = null, _cfgCacheTs = 0;
function cargarConfigLocal() {
  try { const c = JSON.parse(localStorage.getItem("mascotita-cfg") || "null"); if (c) { window.MASCOTITA.config = c; _cfgCache = _cfgCache || c; } } catch (e) {}
}
async function cargarConfig(forzar) {
  if (!forzar && _cfgCache && _cfgCacheTs && Date.now() - _cfgCacheTs < 60000) return _cfgCache;
  try {
    const snap = await db.collection("config").doc("general").get();
    _cfgCache = snap.exists ? snap.data() : {};
    _cfgCacheTs = Date.now();
    window.MASCOTITA.config = _cfgCache;
    try { localStorage.setItem("mascotita-cfg", JSON.stringify(_cfgCache)); } catch (e) {}
    return _cfgCache;
  } catch (e) { console.warn("No se pudo leer config:", e); }
  return _cfgCache || window.MASCOTITA.config || {};
}
function cfg() { return window.MASCOTITA.config || {}; }
function nombreClinica() { return cfg().clinicaNombre || "Mascotita"; }

/* ---------- Atajos de teclado ---------- */
const ATAJOS = [
  ["Ctrl + K", "Buscar paciente, dueño, producto o acción", null],
  ["Alt + N", "Nuevo (el botón principal de la pantalla)", function () { const b = document.querySelector(".page-head .btn-primary"); if (b) b.click(); else if (window.abrirBusquedaGlobal) window.abrirBusquedaGlobal(); }],
  ["Alt + 1", "Panel", "dashboard.html"], ["Alt + 2", "Agenda", "citas.html"], ["Alt + 3", "Pacientes", "pacientes.html"],
  ["Alt + 4", "Consultas", "consultas.html"], ["Alt + 5", "Punto de venta", "venta.html"], ["Alt + 6", "Stock", "stock.html"],
  ["Esc", "Cerrar la ventana abierta", null], ["?", "Ver esta ayuda", null],
  ["Lector de códigos", "Escanear en cualquier pantalla abre el producto", null]
];
function mostrarAtajos() {
  abrirModal({ titulo: "Atajos de teclado", ancho: "modal-sm", cuerpo: '<div class="atajos">' + ATAJOS.map(function (a) { return "<kbd>" + escHTML(a[0]) + "</kbd><span>" + escHTML(a[1]) + "</span>"; }).join("") + "</div>" });
}
document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (window.abrirBusquedaGlobal) window.abrirBusquedaGlobal(); return; }
  const t = e.target, enCampo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  if (!window.MASCOTITA.usuario) return;
  if (e.key === "?" && !enCampo && !_pilaModales.length) { e.preventDefault(); mostrarAtajos(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    // e.code: en Mac Option+N escribe "˜", pero el código físico sigue siendo KeyN.
    const m = /^(?:Key([A-Z])|Digit(\d))$/.exec(e.code || "");
    const k = m ? (m[1] || m[2]) : String(e.key).toUpperCase();
    const a = ATAJOS.find(function (x) { return x[0] === "Alt + " + k; });
    if (!a || _pilaModales.length) return;
    e.preventDefault();
    if (typeof a[2] === "function") a[2](); else if (a[2]) location.href = a[2];
  }
});

/* ---------- Imagenes rotas (URL externa caida): icono en lugar del cuadro roto ---------- */
document.addEventListener("error", function (e) {
  const img = e.target;
  if (!img || img.tagName !== "IMG" || img.dataset.roto) return;
  img.dataset.roto = "1";
  if (img.dataset.fb) { const i = document.createElement("i"); i.className = "fa-solid " + img.dataset.fb; img.replaceWith(i); }
  else img.style.visibility = "hidden";
}, true);

/* ---------- Cierre de sesion por inactividad (30 min) ---------- */
const MINUTOS_INACTIVIDAD = 30;
(function () {
  if (!MINUTOS_INACTIVIDAD || /index\.html$|\/$/.test(location.pathname)) return;
  let t;
  function reiniciar() {
    clearTimeout(t);
    t = setTimeout(async function () {
      _msgLogin("Sesión cerrada por inactividad.");
      try { sessionStorage.removeItem(_PERFIL_KEY); await auth.signOut(); } catch (x) {}
      location.replace("index.html");
    }, MINUTOS_INACTIVIDAD * 60 * 1000);
  }
  const r = debounce(reiniciar, 1000);
  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach(function (ev) { window.addEventListener(ev, r, { passive: true }); });
  reiniciar();
})();

/* ---------- PWA ---------- */
/* =====================================================================
 * APP ANDROID (Capacitor): descargas -> compartir/guardar, enlaces
 * externos (WhatsApp) en la app correspondiente, sin service worker.
 * ===================================================================== */
function esApp() { const C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform()); }
function _blobABase64(blob) {
  return new Promise(function (res, rej) { const r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1] || ""); }; r.onerror = rej; r.readAsDataURL(blob); });
}
/* Guarda un archivo generado (PDF, Excel, respaldo). En la PC lo descarga;
 * en el celular (app) abre "Compartir" para guardarlo o enviarlo. */
function _pluginApp(n) {
  const C = window.Capacitor; if (!C) return null;
  if (C.Plugins && C.Plugins[n]) return C.Plugins[n];
  if (C.registerPlugin) { C.Plugins = C.Plugins || {}; return (C.Plugins[n] = C.registerPlugin(n)); }
  return null;
}
async function guardarArchivo(blob, nombre) {
  const FS_ = esApp() && _pluginApp("Filesystem"), SH = esApp() && _pluginApp("Share");
  if (FS_ && SH) {
    try {
      const r = await FS_.writeFile({ path: nombre, data: await _blobABase64(blob), directory: "CACHE" });
      await SH.share({ title: nombre, url: r.uri, dialogTitle: "Guardar o compartir " + nombre });
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast("No se pudo guardar el archivo: " + mensajeError(e), "error"); }
    return;
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}
if (esApp()) {
  document.documentElement.classList.add("app-movil");
  const _open = window.open;
  window.open = function (u) {
    if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(String(u || "")) && String(u).indexOf(location.origin) !== 0) { location.href = u; return null; }
    return _open.apply(window, arguments);
  };
}
if (!esApp() && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost") && !window.MASCOTITA_EMULADOR) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("SW:", e); }); });
}

/* =====================================================================
 * 7. CARGA DIFERIDA DE LIBRERIAS (solo cuando se usan)
 * ===================================================================== */
const LIBS = {
  pdf: ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"],
  xlsx: ["https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"],
  chart: ["https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"],
  scanner: ["https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"],
  storage: ["https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"],
  emailjs: ["https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"],
  barcode: ["https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"],
  qr: ["https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"]
};
const _libsCargadas = {};
function _script(src) {
  return new Promise(function (res, rej) {
    const s = document.createElement("script"); s.src = src; s.async = false;
    s.onload = res; s.onerror = function () { rej(errorUsuario("No se pudo cargar un componente (" + src.split("/").pop() + "). Revisá tu conexión.")); };
    document.head.appendChild(s);
  });
}
function cargarLib(nombre) {
  if (!_libsCargadas[nombre]) {
    _libsCargadas[nombre] = LIBS[nombre].reduce(function (p, src) { return p.then(function () { return _script(src); }); }, Promise.resolve())
      .catch(function (e) { delete _libsCargadas[nombre]; throw e; });
  }
  return _libsCargadas[nombre];
}
let _storage = null;
async function obtenerStorage() {
  if (_storage) return _storage;
  await cargarLib("storage");
  _storage = firebase.storage();
  if (USAR_EMULADOR) _storage.useEmulator("127.0.0.1", 9199);
  return _storage;
}

/* Compresion de imagenes en el navegador antes de subir. */
function comprimirImagen(file, maxLado, calidad) {
  return new Promise(function (resolve, reject) {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      let w = img.width, h = img.height;
      if (w > h && w > maxLado) { h = h * maxLado / w; w = maxLado; } else if (h > maxLado) { w = w * maxLado / h; h = maxLado; }
      const c = document.createElement("canvas"); c.width = Math.round(w); c.height = Math.round(h);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { b ? resolve(b) : reject(errorUsuario("No se pudo procesar la imagen.")); }, "image/jpeg", calidad || 0.8);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(errorUsuario("El archivo no es una imagen válida.")); };
    img.src = url;
  });
}
function nombreSeguro(s) { return normalizar(s).replace(/[^a-z0-9._-]+/g, "_").slice(0, 60) || "archivo"; }
