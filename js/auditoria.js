/* =====================================================================
 * auditoria.js
 * 1) registrarAuditoria(): GLOBAL, usada por todos los modulos. No bloquea
 *    la pantalla (antes esperaba a un servicio externo de IP en cada accion).
 * 2) Pagina auditoria.html (solo ADMIN): consulta por rango de fechas en el
 *    servidor, paginada, con filtros y exportacion a Excel.
 * ===================================================================== */

function _dispositivo() {
  const ua = navigator.userAgent;
  const so = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Otro";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return nav + " / " + so;
}

function registrarAuditoria(accion, modulo, detalle) {
  try {
    const u = window.MASCOTITA.usuario || {};
    if (!u.uid) return Promise.resolve();
    const p = db.collection("auditoria").doc().set({
      usuario: u.nombre || u.email || "", usuarioUid: u.uid, rol: u.role || "",
      accion: accion, modulo: modulo, detalle: String(detalle || "").slice(0, 500),
      dispositivo: _dispositivo(), fecha: FS.serverTimestamp()
    });
    p.catch(function (e) { console.warn("Auditoría no registrada:", e.code); });
    return Promise.race([p, esperar(1500)]);
  } catch (e) { console.warn(e); return Promise.resolve(); }
}
window.registrarAuditoria = registrarAuditoria;

/* ---------------- Pagina auditoria.html ---------------- */
let _aud = [], _audUltimo = null, _audFin = false;
const _AUD_LOTE = 200;

async function initAuditoria() {
  await protegerPagina({ permiso: "admin", pagina: "auditoria.html" });
  const hoy = hoyISO();
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-clipboard-list"></i> Auditoría</h1>' +
    '<div class="head-actions"><button class="btn btn-ghost" id="aud-export"><i class="fa-solid fa-file-excel"></i> Exportar</button></div></div>' +
    '<p class="lead">Registro inalterable de las acciones del sistema (nadie puede editarlo ni borrarlo).</p>' +
    '<div class="filtros card">' +
    '<label class="fl">Desde <input type="date" id="a-desde" value="' + fechaInput(sumarDias(new Date(), -7)) + '"></label>' +
    '<label class="fl">Hasta <input type="date" id="a-hasta" value="' + hoy + '"></label>' +
    '<input type="search" id="a-texto" placeholder="Usuario o detalle...">' +
    '<select id="a-modulo"><option value="">Todos los módulos</option></select>' +
    '<select id="a-accion"><option value="">Todas las acciones</option></select></div>' +
    '<div id="a-tabla">' + skeleton(8) + '</div><div class="mas-wrap" id="a-mas"></div>';
  ["a-desde", "a-hasta"].forEach(function (id) { document.getElementById(id).onchange = function () { cargarAud(true); }; });
  document.getElementById("a-texto").oninput = debounce(pintarAud, 200);
  document.getElementById("a-modulo").onchange = pintarAud;
  document.getElementById("a-accion").onchange = pintarAud;
  document.getElementById("aud-export").onclick = function () {
    exportarAExcel(filtrarAud(), [
      { k: "fecha", t: "Fecha", f: fmtFecha }, { k: "usuario", t: "Usuario" }, { k: "rol", t: "Rol" }, { k: "accion", t: "Acción" },
      { k: "modulo", t: "Módulo" }, { k: "detalle", t: "Detalle" }, { k: "dispositivo", t: "Dispositivo" }], "auditoria");
  };
  await cargarAud(true);
}

async function cargarAud(reiniciar) {
  const desde = parseFechaLocal(document.getElementById("a-desde").value) || sumarDias(new Date(), -7);
  const hasta = finDelDia(parseFechaLocal(document.getElementById("a-hasta").value) || new Date());
  if (reiniciar) { _aud = []; _audUltimo = null; _audFin = false; }
  mostrarLoading(true);
  try {
    let q = db.collection("auditoria").where("fecha", ">=", TS.fromDate(desde)).where("fecha", "<=", TS.fromDate(hasta)).orderBy("fecha", "desc").limit(_AUD_LOTE);
    if (_audUltimo) q = q.startAfter(_audUltimo);
    const s = await q.get();
    _aud = _aud.concat(docsDe(s));
    _audUltimo = s.docs[s.docs.length - 1] || _audUltimo;
    _audFin = s.size < _AUD_LOTE;
    poblarFiltrosAud(); pintarAud();
  } catch (e) { console.error(e); toast(mensajeError(e), "error"); }
  finally { mostrarLoading(false); }
}

function poblarFiltrosAud() {
  [["a-modulo", "modulo"], ["a-accion", "accion"]].forEach(function (x) {
    const s = document.getElementById(x[0]), actual = s.value;
    const vals = Array.from(new Set(_aud.map(function (r) { return r[x[1]]; }).filter(Boolean))).sort();
    s.innerHTML = '<option value="">' + (x[1] === "modulo" ? "Todos los módulos" : "Todas las acciones") + "</option>" +
      vals.map(function (v) { return "<option" + (v === actual ? " selected" : "") + ">" + escHTML(v) + "</option>"; }).join("");
  });
}
function filtrarAud() {
  const t = document.getElementById("a-texto").value, m = document.getElementById("a-modulo").value, a = document.getElementById("a-accion").value;
  return _aud.filter(function (r) {
    return (!m || r.modulo === m) && (!a || r.accion === a) && coincide((r.usuario || "") + " " + (r.detalle || ""), t);
  });
}
const _AUD_COLOR = { login: "ok", crear: "ok", restaurar: "ok", cobrar: "ok", logout: "neutral", editar: "info", eliminar: "danger", anular: "danger", entrada_stock: "info", salida_stock: "warn" };
function pintarAud() {
  tabla("a-tabla", {
    filas: filtrarAud(), orden: "fecha", dir: -1, porPagina: 100, vacio: "Sin registros en este rango", vacioIcono: "fa-clipboard",
    columnas: [
      { k: "fecha", t: "Fecha", r: function (r) { return fmtFecha(r.fecha); }, v: function (r) { return aFecha(r.fecha); } },
      { k: "usuario", t: "Usuario", r: function (r) { return escHTML(r.usuario) + (r.rol ? '<br><small class="muted">' + escHTML(nombreRol(r.rol)) + "</small>" : ""); } },
      { k: "accion", t: "Acción", r: function (r) { return pill(r.accion, _AUD_COLOR[r.accion] || "neutral"); } },
      { k: "modulo", t: "Módulo" },
      { k: "detalle", t: "Detalle" },
      { k: "dispositivo", t: "Dispositivo", r: function (r) { return '<small class="muted">' + escHTML(r.dispositivo || r.ip || "") + "</small>"; } }
    ]
  });
  document.getElementById("a-mas").innerHTML = _audFin ? "" : '<button class="btn btn-ghost" id="a-cargar">Cargar registros más antiguos</button>';
  const b = document.getElementById("a-cargar"); if (b) b.onclick = function () { cargarAud(false); };
}

if (/auditoria\.html$/.test(location.pathname)) document.addEventListener("DOMContentLoaded", initAuditoria);
