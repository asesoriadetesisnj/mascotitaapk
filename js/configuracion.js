/* =====================================================================
 * configuracion.js (solo ADMIN)
 * Datos de la clinica, facturacion (timbrado / numeracion / IVA),
 * agenda, plantillas de WhatsApp, avisos por email, consentimiento,
 * mantenimiento (estadisticas) y respaldo completo en JSON.
 * ===================================================================== */
const COLS_RESPALDO = ["users", "propietarios", "mascotas", "consultas", "vacunas", "cirugias", "citas", "productos", "movimientos_stock", "servicios", "proveedores", "compras", "facturas", "cajas", "caja_movimientos", "config", "plantillas_whatsapp", "estadisticas"];
const PLANTILLAS_INFO = [["recordatorio_cita", "Recordatorio de cita", "{nombre} {mascota} {fecha} {hora} {clinica}"], ["vacuna", "Vacuna por vencer", "{nombre} {mascota} {vacuna} {fecha} {clinica}"],
  ["control", "Control", "{nombre} {mascota} {fecha} {clinica}"], ["saldo", "Saldo pendiente", "{nombre} {monto} {clinica}"], ["factura", "Envío de comprobante", "{nombre} {numero} {monto} {clinica}"], ["alta", "Alta (cirugía / internación)", "{nombre} {mascota} {indicaciones} {clinica}"],
  ["carnet", "Carnet digital", "{nombre} {mascota} {enlace} {clinica}"], ["cumple", "Cumpleaños", "{nombre} {mascota} {edad} {fecha} {clinica}"]];

async function initConfig() {
  await protegerPagina({ permiso: "admin", pagina: "configuracion.html" });
  const c = await cargarConfig(true);
  Datos.suscribir("servicios");
  await Datos.listo("servicios");
  const wa = {};
  try { (await db.collection("plantillas_whatsapp").get()).forEach(function (d) { wa[d.id] = d.data().texto; }); } catch (e) {}
  const servs = Datos.lista("servicios").map(function (s) { return { value: s.id, texto: s.nombre + " (" + fmtMoneda(s.precio) + ")" }; });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-gear"></i> Configuración</h1><button class="btn btn-primary" id="cf-guardar"><i class="fa-solid fa-floppy-disk"></i> Guardar cambios</button></div>' +
    '<div class="grid-cards" style="grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))">' +
    '<div class="card"><h3><i class="fa-solid fa-hospital"></i> Datos de la clínica <small class="muted">(aparecen en los PDF y mensajes)</small></h3><div class="grid-2">' +
    campo("cnombre", "Nombre", c.clinicaNombre || "Mascotita") + campo("cruc", "RUC", c.clinicaRuc) + campo("ctel", "Teléfono / WhatsApp", c.clinicaTelefono) +
    campo("cemail", "Email", c.clinicaEmail) + campo("cdir", "Dirección", c.clinicaDireccion, "text", { full: true }) +
    campo("curl", "Dirección pública del sistema (Netlify)", c.urlPublica, "url", { full: true, ph: "https://tu-sitio.netlify.app", ayuda: "Se usa para los enlaces del carnet digital (QR). Si abrís el sistema desde ese sitio, se detecta solo." }) + "</div></div>" +
    '<div class="card"><h3><i class="fa-solid fa-file-invoice-dollar"></i> Facturación</h3><div class="grid-2">' +
    campo("ctimb", "N° de timbrado (opcional)", c.timbrado, "text", { ayuda: "Si lo completás, el PDF sale como \"Factura\"; si no, como comprobante interno." }) +
    campo("ctimbv", "Vigencia del timbrado", c.timbradoVigencia, "text", { ph: "01/01/2026 al 31/12/2026" }) +
    campo("cest", "Establecimiento", c.establecimiento, "text", { ph: "001", ayuda: "Con establecimiento y punto: 001-001-0000123" }) + campo("cpto", "Punto de expedición", c.puntoExpedicion, "text", { ph: "001" }) +
    selectCampo("civa", "IVA por defecto en servicios", IVA_OPCIONES, String(c.ivaServicios != null ? c.ivaServicios : 10)) +
    selectCampo("cserv", "Servicio que se cobra al facturar una consulta", servs, c.servicioConsultaId, { vacio: servs.length ? "Buscar uno que diga \"consulta\"" : "Cargá el catálogo primero" }) +
    '<div class="form-field full">' + checkCampo("cneg", "Permitir vender productos sin stock suficiente", c.permitirStockNegativo) + "<br>" + checkCampo("cprecio", "Recepción puede modificar precios al facturar", c.permitirCambiarPrecio) + "</div>" +
    selectCampo("cformato", "Formato de impresión de comprobantes", [{ value: "a4", texto: "Hoja A4 (PDF)" }, { value: "ticket80", texto: "Ticket térmico 80 mm" }, { value: "ticket58", texto: "Ticket térmico 58 mm" }], c.formatoComprobante || "a4") +
    campo("cvalidez", "Validez de presupuestos (días)", c.validezPresupuesto || 15, "number", { min: 1 }) +
    '<div class="form-field full">' + checkCampo("cimpr", "Imprimir automáticamente al cobrar", c.imprimirAlEmitir) + "</div></div></div>" +
    '<div class="card"><h3><i class="fa-solid fa-cash-register"></i> Punto de venta</h3><div class="grid-2">' +
    selectCampo("ctpos", "Ticket del punto de venta", [{ value: "ticket80", texto: "Ticket térmico 80 mm" }, { value: "ticket58", texto: "Ticket térmico 58 mm" }, { value: "a4", texto: "Hoja A4 (PDF)" }], c.formatoTicketPOS || "ticket80") +
    campo("cdmax", "Descuento máximo sin autorización (%)", c.descuentoMaxCajero != null && c.descuentoMaxCajero !== "" ? c.descuentoMaxCajero : 10, "number", { min: 0, max: 100, ayuda: "Arriba de esto (o para bajar un precio) la cajera necesita la clave de un administrador." }) +
    campo("cpie", "Mensaje al pie del ticket", c.ticketPie || "", "text", { ph: "¡Gracias por su compra!" }) +
    '<div class="form-field">' + checkCampo("ctauto", "Imprimir el ticket automáticamente al cobrar", c.imprimirTicketPOS) + "<br>" + checkCampo("cdevsup", "Devoluciones sin clave del administrador", c.devolucionSinSupervisor) + "</div>" +
    '<div class="seccion-form full"><i class="fa-solid fa-weight-scale"></i> Balanza (etiquetas de peso o importe)</div>' +
    campo("cbpref", "Prefijo de la etiqueta", c.balanzaPrefijo || "", "text", { ph: "Ej: 21", ayuda: "Los 2 primeros dígitos del código que imprime la balanza. Vacío = sin balanza." }) +
    selectCampo("cbmodo", "La etiqueta trae", [{ value: "peso", texto: "Peso (PLU 5 dígitos + gramos)" }, { value: "precio", texto: "Importe (PLU 4 dígitos + Gs 6 dígitos)" }], c.balanzaModo || "peso") +
    "</div></div>" +
    '<div class="card"><h3><i class="fa-solid fa-calendar-days"></i> Agenda</h3><div class="grid-3">' +
    campo("ainicio", "Abre", c.agendaInicio || "07:00", "time") + campo("afin", "Cierra", c.agendaFin || "20:00", "time") +
    selectCampo("aint", "Turnos cada", [{ value: "15", texto: "15 min" }, { value: "20", texto: "20 min" }, { value: "30", texto: "30 min" }, { value: "60", texto: "60 min" }], String(c.agendaIntervalo || 30)) + "</div></div>" +
    '<div class="card"><h3><i class="fa-solid fa-envelope"></i> Aviso de stock bajo por email (EmailJS)</h3>' +
    campo("cemails", "Destinatarios (separados por coma)", c.emailsNotificacion, "text", { ph: "admin@correo.com, encargado@correo.com" }) +
    areaCampo("cplant", "Plantilla (variables: {producto} {cantidad} {minimo})", c.plantillaStockBajo || "ALERTA: el producto {producto} tiene stock bajo. Cantidad actual: {cantidad} (mínimo: {minimo}).") +
    '<small class="hint">Requiere completar las claves de EmailJS en js/firebase-config.js. Se envía como máximo un aviso por producto por día.</small></div>' +
    '<div class="card" style="grid-column:1/-1"><h3><i class="fa-brands fa-whatsapp"></i> Plantillas de WhatsApp</h3><div class="grid-2">' +
    PLANTILLAS_INFO.map(function (p) { return areaCampo("wa_" + p[0], p[1], wa[p[0]] || PLANTILLAS_WA_DEF[p[0]], { full: false, filas: 3, ayuda: "Variables: " + p[2] }); }).join("") + "</div></div>" +
    '<div class="card" style="grid-column:1/-1"><h3><i class="fa-solid fa-file-signature"></i> Texto del consentimiento informado (cirugías)</h3>' +
    areaCampo("ccons", "Variables: {dueno} {mascota} {clinica} {procedimiento}", c.textoConsentimiento || "", { filas: 5, ph: "Vacío = texto estándar" }) + "</div>" +
    '<div class="card"><h3><i class="fa-solid fa-database"></i> Respaldo</h3><p class="muted">Descarga TODOS los datos en un archivo JSON. Guardalo en un lugar seguro (contiene datos personales).</p>' +
    '<button class="btn btn-ghost mt" id="cf-backup"><i class="fa-solid fa-download"></i> Descargar respaldo completo</button><p class="hint" id="cf-ult">' + (c.ultimoRespaldo ? "Último respaldo: " + fmtFecha(c.ultimoRespaldo) : "Nunca se hizo un respaldo desde la app.") + "</p></div>" +
    '<div class="card"><h3><i class="fa-solid fa-screwdriver-wrench"></i> Mantenimiento</h3><p class="muted">Si los contadores del panel no coinciden, recalculalos (lee todas las colecciones una vez).</p>' +
    '<button class="btn btn-ghost mt" id="cf-stats"><i class="fa-solid fa-calculator"></i> Recalcular estadísticas</button></div>' +
    '<div class="card"><h3><i class="fa-solid fa-file-import"></i> Importar datos</h3><p class="muted">Cargá productos o clientes con sus mascotas desde un Excel o CSV. Se detectan las columnas solas y no se duplican registros.</p>' +
    '<button class="btn btn-ghost mt" id="cf-imp"><i class="fa-solid fa-file-excel"></i> Importar desde Excel</button></div>' +
    '<div class="card"><h3><i class="fa-solid fa-cloud"></i> Archivos adjuntos (Storage)</h3><p class="muted">Las fotos de mascotas se guardan gratis dentro de la base de datos. Los adjuntos de consultas (análisis, radiografías, PDF) necesitan Firebase Storage, que requiere el plan Blaze.</p>' +
    '<div class="mt">' + checkCampo("cstorage", "Tengo Storage activado: mostrar adjuntos en las consultas", c.storageActivo) + "</div></div>" +
    "</div>";
  document.getElementById("cf-guardar").onclick = function () { conBoton(this, guardarConfig); };
  document.getElementById("cf-backup").onclick = function () { this.dataset.cargando = "Descargando..."; conBoton(this, respaldo); };
  document.getElementById("cf-imp").onclick = abrirImportar;
  document.getElementById("cf-stats").onclick = function () { conBoton(this, async function () { requiereConexion("Recalcular"); const r = await Datos.recalcularStats(); toast("Listo: " + r.mascotas + " mascotas, " + r.consultas + " consultas.", "ok"); }); };
}
async function guardarConfig() {
  requiereConexion("Guardar la configuración");
  const iva = Number(val("civa"));
  await db.collection("config").doc("general").set({
    clinicaNombre: val("cnombre") || "Mascotita", clinicaRuc: val("cruc"), clinicaTelefono: val("ctel"), clinicaEmail: val("cemail"), clinicaDireccion: val("cdir"),
    timbrado: val("ctimb"), timbradoVigencia: val("ctimbv"), establecimiento: val("cest").replace(/\D/g, ""), puntoExpedicion: val("cpto").replace(/\D/g, ""),
    ivaServicios: iva, iva: iva, servicioConsultaId: val("cserv"), permitirStockNegativo: chk("cneg"), permitirCambiarPrecio: chk("cprecio"),
    urlPublica: val("curl").replace(/\/+$/, ""), formatoComprobante: val("cformato"), validezPresupuesto: Math.max(1, num("cvalidez") || 15), imprimirAlEmitir: chk("cimpr"), storageActivo: chk("cstorage"),
    formatoTicketPOS: val("ctpos"), descuentoMaxCajero: Math.min(100, Math.max(0, num("cdmax"))), ticketPie: val("cpie"), imprimirTicketPOS: chk("ctauto"), devolucionSinSupervisor: chk("cdevsup"),
    balanzaPrefijo: val("cbpref").replace(/\D/g, "").slice(0, 2), balanzaModo: val("cbmodo"),
    agendaInicio: val("ainicio") || "07:00", agendaFin: val("afin") || "20:00", agendaIntervalo: Number(val("aint")) || 30,
    emailsNotificacion: val("cemails"), plantillaStockBajo: val("cplant"), textoConsentimiento: val("ccons")
  }, { merge: true });
  const b = db.batch();
  PLANTILLAS_INFO.forEach(function (p) { b.set(db.collection("plantillas_whatsapp").doc(p[0]), { texto: val("wa_" + p[0]) || PLANTILLAS_WA_DEF[p[0]] }); });
  await b.commit();
  await cargarConfig(true);
  registrarAuditoria("editar", "configuracion", "Actualizó la configuración general");
  toast("Configuración guardada.", "ok");
}
async function respaldo() {
  requiereConexion("Descargar el respaldo");
  const out = { app: "Mascotita", version: 3, fecha: new Date().toISOString(), colecciones: {} };
  for (const c of COLS_RESPALDO) {
    const s = await db.collection(c).get();
    out.colecciones[c] = {};
    s.forEach(function (d) {
      out.colecciones[c][d.id] = JSON.parse(JSON.stringify(d.data(), function (k, v) { return v && typeof v === "object" && v.seconds != null && v.nanoseconds != null ? { _ts: new Date(v.seconds * 1000).toISOString() } : v; }));
    });
  }
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
  await guardarArchivo(blob, "mascotita_respaldo_" + hoyISO() + ".json");
  await db.collection("config").doc("general").set({ ultimoRespaldo: FS.serverTimestamp() }, { merge: true });
  document.getElementById("cf-ult").textContent = "Último respaldo: " + fmtFecha(new Date());
  registrarAuditoria("exportar", "sistema", "Descargó un respaldo completo");
  toast("Respaldo descargado.", "ok");
}
document.addEventListener("DOMContentLoaded", initConfig);
