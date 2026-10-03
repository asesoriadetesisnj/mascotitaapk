/* =====================================================================
 * whatsapp.js — Integracion por enlaces wa.me (sin API de pago)
 * Plantillas en la coleccion "plantillas_whatsapp" (editables en
 * Configuracion). Variables: {nombre} {mascota} {fecha} {hora}
 * {clinica} {vacuna} {monto} {telefono_clinica}
 * ===================================================================== */

/* Normaliza a formato internacional (Paraguay 595 por defecto). */
function normalizarTelefono(tel) {
  let t = String(tel || "").replace(/[^0-9+]/g, "");
  if (!t) return "";
  if (t.indexOf("+") === 0) return t.slice(1);
  if (t.indexOf("00") === 0) return t.slice(2);
  if (t.indexOf("595") === 0 && t.length >= 11) return t;
  if (t.indexOf("0") === 0) t = t.slice(1);
  return "595" + t;
}
function telefonoValido(tel) { return normalizarTelefono(tel).length >= 11; }

function aplicarPlantilla(texto, vars) {
  const c = cfg();
  const v = Object.assign({ clinica: c.clinicaNombre || "Mascotita", telefono_clinica: c.clinicaTelefono || "" }, vars || {});
  return String(texto || "").replace(/\{(\w+)\}/g, function (_, k) { return v[k] != null ? v[k] : ""; }).replace(/\s{2,}/g, " ").trim();
}

function enviarWhatsApp(telefono, mensaje) {
  const t = normalizarTelefono(telefono);
  if (!t) { toast("No hay teléfono registrado.", "warn"); return false; }
  window.open("https://wa.me/" + t + "?text=" + encodeURIComponent(mensaje), "_blank", "noopener");
  return true;
}

const PLANTILLAS_WA_DEF = {
  recordatorio_cita: "Hola {nombre}! Te recordamos el turno de {mascota} el {fecha} a las {hora} en {clinica}. Si no podés asistir, avisanos por este medio. ¡Gracias!",
  vacuna: "Hola {nombre}! A {mascota} le corresponde su {vacuna} el {fecha}. Agendá tu turno en {clinica}. ¡Te esperamos!",
  control: "Hola {nombre}! Es momento del control de {mascota} ({fecha}). Te esperamos en {clinica}.",
  saldo: "Hola {nombre}, te recordamos que tenés un saldo pendiente de {monto} en {clinica}. Cualquier consulta, escribinos. ¡Gracias!",
  factura: "Hola {nombre}! Gracias por confiar en {clinica}. Detalle de tu comprobante {numero}: total {monto}.",
  alta: "Hola {nombre}! {mascota} ya puede volver a casa. Indicaciones: {indicaciones}. Ante cualquier duda, escribinos. {clinica}",
  carnet: "Hola {nombre}! Este es el carnet digital de vacunas de {mascota}: {enlace} . Lo podés abrir cuando quieras desde tu celular. {clinica}",
  cumple: "¡Hola {nombre}! El {fecha} {mascota} cumple {edad} 🎉 Desde {clinica} le mandamos un abrazo enorme. ¡Feliz cumple!"
};
let _plantillasWA = null;
async function obtenerPlantillaWA(clave) {
  if (!_plantillasWA) {
    _plantillasWA = {};
    try { (await db.collection("plantillas_whatsapp").get()).forEach(function (d) { _plantillasWA[d.id] = d.data().texto; }); } catch (e) { /* defaults */ }
  }
  return _plantillasWA[clave] || PLANTILLAS_WA_DEF[clave] || "Hola {nombre}, te contactamos desde {clinica}.";
}
async function waPlantilla(clave, telefono, vars) {
  const p = await obtenerPlantillaWA(clave);
  return enviarWhatsApp(telefono, aplicarPlantilla(p, vars));
}
window.enviarWhatsApp = enviarWhatsApp;
window.aplicarPlantilla = aplicarPlantilla;
window.obtenerPlantillaWA = obtenerPlantillaWA;
