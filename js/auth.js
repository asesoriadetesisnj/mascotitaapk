/* =====================================================================
 * auth.js — Pantalla de ingreso (index.html)
 * El usuario escribe "Admin" o un email; internamente "admin@mascotita.local".
 * ===================================================================== */
function normalizarEmail(entrada) {
  const v = (entrada || "").trim();
  return v.indexOf("@") !== -1 ? v.toLowerCase() : v.toLowerCase() + "@" + DOMINIO_INTERNO;
}
function mostrarErrorLogin(texto, tipo) {
  const pintar = function () {
    const box = document.getElementById("login-error"); if (!box) return;
    box.textContent = texto; box.style.display = texto ? "block" : "none";
    box.style.background = tipo === "ok" ? "var(--ok-suave)" : ""; box.style.color = tipo === "ok" ? "var(--ok)" : "";
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar); else pintar();
}
(function () { try { const m = sessionStorage.getItem("mascotita-msg"); if (m) { sessionStorage.removeItem("mascotita-msg"); mostrarErrorLogin(m); } } catch (e) {} })();

let loginEnCurso = false;
auth.onAuthStateChanged(async function (user) {
  if (!user || loginEnCurso) return;
  try {
    const snap = await db.collection("users").doc(user.uid).get();
    if (snap.exists && snap.data().active !== false) { location.replace(rolNormalizado(snap.data().role) === "cajero" ? "venta.html" : "dashboard.html"); return; }
    await auth.signOut();
    mostrarErrorLogin(mensajeErrorAuth(snap.exists ? "auth/cuenta-inactiva" : "auth/sin-perfil"));
  } catch (e) {
    await auth.signOut().catch(function () {});
    mostrarErrorLogin(mensajeErrorAuth(e && e.code === "permission-denied" ? "auth/permiso" : e && e.code));
  }
});

function initLogin() {
  const form = document.getElementById("login-form"); if (!form) return;
  const inpUser = document.getElementById("login-user"), inpPass = document.getElementById("login-pass"), btn = document.getElementById("login-btn");
  try { const u = localStorage.getItem("mascotita-ultimo-usuario"); if (u) { inpUser.value = u; inpPass.focus(); } else inpUser.focus(); } catch (e) {}
  document.getElementById("toggle-pass").onclick = function () {
    const t = inpPass.type === "password" ? "text" : "password"; inpPass.type = t;
    this.innerHTML = t === "password" ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
  };
  document.getElementById("olvide").onclick = async function (e) {
    e.preventDefault();
    const v = inpUser.value.trim();
    if (!v || v.indexOf("@") === -1) { mostrarErrorLogin("Si tu usuario no es un email, pedile al administrador que te asigne una contraseña nueva."); return; }
    try { await auth.sendPasswordResetEmail(v.toLowerCase()); mostrarErrorLogin("Te enviamos un email para restablecer la contraseña.", "ok"); }
    catch (er) { mostrarErrorLogin(mensajeErrorAuth(er.code)); }
  };
  form.onsubmit = async function (e) {
    e.preventDefault();
    mostrarErrorLogin("");
    if (!inpUser.value.trim() || !inpPass.value) { mostrarErrorLogin("Ingresá usuario y contraseña."); return; }
    btn.disabled = true; loginEnCurso = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Ingresando...';
    try {
      const cred = await auth.signInWithEmailAndPassword(normalizarEmail(inpUser.value), inpPass.value);
      const snap = await db.collection("users").doc(cred.user.uid).get();
      if (!snap.exists || snap.data().active === false) { await auth.signOut(); throw { code: snap.exists ? "auth/cuenta-inactiva" : "auth/sin-perfil" }; }
      const d = snap.data();
      window.MASCOTITA.usuario = { uid: cred.user.uid, email: cred.user.email, nombre: d.nombre || cred.user.email, role: rolNormalizado(d.role) };
      try { sessionStorage.setItem("mascotita-perfil", JSON.stringify(Object.assign({ active: true, color: d.color || "" }, window.MASCOTITA.usuario))); localStorage.setItem("mascotita-ultimo-usuario", inpUser.value.trim()); } catch (x) {}
      db.collection("users").doc(cred.user.uid).update({ lastLogin: FS.serverTimestamp() }).catch(function () {});
      await registrarAuditoria("login", "auth", "Inicio de sesión");
      location.replace(paginaInicio());
    } catch (err) {
      console.error(err);
      mostrarErrorLogin(mensajeErrorAuth(err.code));
      loginEnCurso = false; btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Ingresar';
    }
  };
}
function mensajeErrorAuth(code) {
  switch (code) {
    case "auth/invalid-credential": case "auth/wrong-password": case "auth/user-not-found": case "auth/invalid-email": return "Usuario o contraseña incorrectos.";
    case "auth/too-many-requests": return "Demasiados intentos. Esperá unos minutos.";
    case "auth/cuenta-inactiva": return "Tu cuenta está desactivada. Contactá al administrador.";
    case "auth/sin-perfil": return "Tu cuenta existe pero no tiene perfil en Firestore (colección users, ID = tu UID).";
    case "auth/permiso": return "Sin permiso para leer tu perfil. Revisá que las reglas de Firestore estén publicadas.";
    case "auth/network-request-failed": return "Error de red. Revisá tu conexión.";
    default: return "No se pudo iniciar sesión. Intentá de nuevo.";
  }
}
document.addEventListener("DOMContentLoaded", initLogin);
