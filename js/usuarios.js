/* =====================================================================
 * usuarios.js (solo ADMIN) — Usuarios y roles
 *  Roles: Administrador / Veterinario / Recepcion / Cajero.
 *  Se crea la cuenta con una app secundaria de Firebase para no cerrar
 *  la sesion del admin. Nunca se puede quedar el sistema sin admins.
 * ===================================================================== */
const COLORES_AGENDA = ["#0f9d68", "#2d7dd2", "#e38b2c", "#8e5bd1", "#d9534f", "#16a2b8", "#b5832b", "#5b7083"];
const DESC_ROLES = {
  admin: "Acceso total: usuarios, precios, reportes, anulaciones, compras, auditoría y configuración.",
  veterinario: "Pacientes, consultas, vacunas, cirugías, agenda, stock (movimientos) y recordatorios.",
  recepcion: "Agenda, pacientes, facturación, cobros y caja, stock (movimientos) y recordatorios. Ve la historia clínica sin editarla.",
  cajero: "Solo punto de venta, comprobantes, caja y stock. Entra directo a la caja. Descuentos grandes, precios y devoluciones con clave del administrador."
};

async function initUsuarios() {
  await protegerPagina({ permiso: "admin", pagina: "usuarios.html" });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-users"></i> Usuarios</h1><button class="btn btn-primary" id="u-nuevo"><i class="fa-solid fa-user-plus"></i> Nuevo usuario</button></div>' +
    '<div class="grid-cards mb">' + Object.keys(ROLES).map(function (r) { return '<div class="card"><h3><i class="fa-solid ' + (r === "admin" ? "fa-user-shield" : r === "veterinario" ? "fa-user-doctor" : r === "cajero" ? "fa-cash-register" : "fa-headset") + '"></i> ' + ROLES[r].nombre + '</h3><p class="muted">' + DESC_ROLES[r] + "</p></div>"; }).join("") + "</div>" +
    '<div id="u-tabla">' + skeleton(5) + "</div>";
  document.getElementById("u-nuevo").onclick = function () { abrirFormUsuario(null); };
  Datos.suscribir("usuarios", pintarUsuarios);
}
function pintarUsuarios() {
  tabla("u-tabla", {
    filas: Datos.lista("usuarios"), orden: "nombre", vacio: "Sin usuarios", alClic: function (u) { abrirFormUsuario(u.id); },
    columnas: [
      { k: "nombre", t: "Nombre", r: function (u) { return '<div class="celda-m"><span class="avatar" style="background:' + escHTML(u.color || colorVet(u.id)) + '">' + escHTML(iniciales(u.nombre)) + "</span><div><b>" + escHTML(u.nombre) + "</b>" + (u.id === window.MASCOTITA.usuario.uid ? " <small>(vos)</small>" : "") + "<br><small>" + escHTML(u.email) + "</small></div></div>"; } },
      { k: "role", t: "Rol", v: function (u) { return nombreRol(u.role); }, r: function (u) { const r = rolNormalizado(u.role); return pill(nombreRol(r), r === "admin" ? "info" : r === "veterinario" ? "ok" : "warn"); } },
      { k: "active", t: "Estado", r: function (u) { return u.active !== false ? pill("Activo", "ok") : pill("Inactivo", "danger"); } },
      { k: "lastLogin", t: "Último acceso", v: function (u) { return aFecha(u.lastLogin); }, r: function (u) { return u.lastLogin ? fmtFecha(u.lastLogin) : '<span class="muted">nunca</span>'; } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (u) {
        return btnIcono("fa-pen", "Editar", "abrirFormUsuario('" + u.id + "')") +
          (!/@mascotita\.local$/.test(u.email || "") ? btnIcono("fa-key", "Enviar email para restablecer contraseña", "resetUsuario('" + u.id + "')") : "") +
          btnIcono("fa-power-off", u.active !== false ? "Desactivar" : "Activar", "toggleUsuario('" + u.id + "')", u.active !== false ? "danger" : "");
      } }
    ]
  });
}
function adminsActivos(exceptoId) { return Datos.lista("usuarios").filter(function (u) { return u.id !== exceptoId && u.active !== false && rolNormalizado(u.role) === "admin"; }).length; }

function abrirFormUsuario(id) {
  const u = id ? Datos.porId("usuarios", id) || {} : { role: "veterinario" };
  const colores = '<div class="form-field"><label>Color en la agenda</label><div class="fila-flex" id="u-colores">' + COLORES_AGENDA.map(function (c) {
    return '<label style="cursor:pointer"><input type="radio" name="ucolor" value="' + c + '"' + ((u.color || "") === c ? " checked" : "") + ' hidden><span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:' + c + ';border:3px solid ' + ((u.color || "") === c ? "var(--texto)" : "transparent") + '"></span></label>';
  }).join("") + "</div></div>";
  const m = modalForm((id ? "Editar" : "Nuevo") + " usuario",
    '<div class="grid-2">' + campo("unombre", "Nombre completo", u.nombre, "text", { req: true }) +
    selectCampo("urol", "Rol", Object.keys(ROLES).map(function (r) { return { value: r, texto: ROLES[r].nombre }; }), rolNormalizado(u.role)) + "</div>" +
    '<p class="hint" id="u-desc" style="margin:-6px 0 12px"></p>' +
    '<div class="grid-2">' + campo("ucom", "Comisión sobre servicios (%)", u.comision || "", "number", { min: 0, max: 100, ayuda: "Opcional. Se calcula en Reportes → Productividad." }) + "</div>" +
    (id ? "" : '<div class="grid-2">' + campo("uusuario", "Usuario o email", "", "text", { req: true, ayuda: "Si escribís solo un usuario (ej: maria), se guarda como maria@" + DOMINIO_INTERNO, attrs: 'autocomplete="off"' }) +
      campo("upass", "Contraseña inicial (mínimo 8)", "", "password", { req: true, attrs: 'autocomplete="new-password"' }) + "</div>") +
    colores, {
      onGuardar: async function () {
        const rol = val("urol");
        const color = (m.el.querySelector("input[name=ucolor]:checked") || {}).value || "";
        if (id) {
          if (rolNormalizado(u.role) === "admin" && rol !== "admin" && adminsActivos(id) === 0) throw errorUsuario("Tiene que quedar al menos un administrador activo.");
          await actualizarDoc("users", id, { nombre: val("unombre"), role: rol, color: color, comision: Math.min(100, Math.max(0, num("ucom"))) });
          registrarAuditoria("editar", "usuarios", "Editó usuario " + val("unombre") + " (rol " + nombreRol(rol) + ")");
          toast("Usuario actualizado.", "ok");
          return;
        }
        requiereConexion("Crear usuarios");
        const entrada = val("uusuario"), pass = el("upass").value;
        if (pass.length < 8) throw errorUsuario("La contraseña debe tener al menos 8 caracteres.");
        const email = entrada.indexOf("@") !== -1 ? entrada.toLowerCase() : normalizar(entrada).replace(/[^a-z0-9._-]/g, "") + "@" + DOMINIO_INTERNO;
        let appSec;
        try {
          appSec = firebase.initializeApp(firebase.app().options, "sec_" + Date.now());
          const authSec = appSec.auth();
          if (USAR_EMULADOR) authSec.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
          const cred = await authSec.createUserWithEmailAndPassword(email, pass);
          await db.collection("users").doc(cred.user.uid).set({ nombre: val("unombre"), email: email, role: rol, color: color, comision: Math.min(100, Math.max(0, num("ucom"))), active: true, createdAt: FS.serverTimestamp(), lastLogin: null });
          await authSec.signOut();
        } catch (e) {
          if (e.code === "auth/email-already-in-use") throw errorUsuario("Ese usuario ya existe.");
          if (e.code === "auth/invalid-email") throw errorUsuario("Usuario o email inválido.");
          if (e.code === "auth/weak-password") throw errorUsuario("La contraseña es muy débil.");
          throw e;
        } finally { if (appSec) appSec.delete().catch(function () {}); }
        registrarAuditoria("crear", "usuarios", "Creó usuario " + val("unombre") + " (" + email + ", " + nombreRol(rol) + ")");
        toast("Usuario creado. Ingresa con: " + email.replace("@" + DOMINIO_INTERNO, ""), "ok", 7000);
      }
    });
  const desc = function () { document.getElementById("u-desc").textContent = DESC_ROLES[val("urol")]; };
  el("urol").onchange = desc; desc();
  m.el.querySelectorAll("input[name=ucolor]").forEach(function (r) {
    r.onchange = function () { m.el.querySelectorAll("#u-colores span").forEach(function (s) { s.style.borderColor = "transparent"; }); r.nextElementSibling.style.borderColor = "var(--texto)"; };
  });
}
async function toggleUsuario(id) {
  const u = Datos.porId("usuarios", id);
  if (id === window.MASCOTITA.usuario.uid) { toast("No podés desactivarte a vos mismo.", "warn"); return; }
  const activar = u.active === false;
  if (!activar && rolNormalizado(u.role) === "admin" && adminsActivos(id) === 0) { toast("Tiene que quedar al menos un administrador activo.", "warn"); return; }
  if (!(await confirmar((activar ? "¿Activar" : "¿Desactivar") + " a " + u.nombre + "?" + (activar ? "" : " Se le cierra la sesión al instante."), { peligro: !activar }))) return;
  await actualizarDoc("users", id, { active: activar });
  registrarAuditoria("editar", "usuarios", (activar ? "Activó" : "Desactivó") + " a " + u.nombre);
  toast("Hecho.", "ok");
}
async function resetUsuario(id) {
  const u = Datos.porId("usuarios", id);
  if (!(await confirmar("¿Enviar a " + u.email + " un email para restablecer la contraseña?", { peligro: false }))) return;
  try { await auth.sendPasswordResetEmail(u.email); toast("Email enviado.", "ok"); registrarAuditoria("editar", "usuarios", "Envió reset de contraseña a " + u.email); }
  catch (e) { toast(mensajeError(e), "error"); }
}
window.abrirFormUsuario = abrirFormUsuario; window.toggleUsuario = toggleUsuario; window.resetUsuario = resetUsuario;
document.addEventListener("DOMContentLoaded", initUsuarios);
