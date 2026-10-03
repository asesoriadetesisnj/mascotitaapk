/* =====================================================================
 * form-clinica.js — Formularios clinicos compartidos
 * Se usan desde Pacientes, Ficha del paciente, Consultas, Agenda,
 * Vacunas y Cirugias. Requieren Datos.suscribir("mascotas"/"propietarios").
 * ===================================================================== */

const ESPECIES = ["Perro", "Gato", "Ave", "Conejo", "Hámster", "Cobayo", "Hurón", "Reptil", "Equino", "Bovino", "Otro"];
const TIPOS_VACUNA = ["Antirrábica", "Quíntuple / Polivalente", "Séxtuple", "Triple felina", "Leucemia felina", "Tos de las perreras", "Desparasitación interna", "Desparasitación externa", "Otra"];
const TIPOS_CIRUGIA = ["Castración", "Esterilización (OVH)", "Tejidos blandos", "Traumatología", "Odontología", "Oftalmología", "Cesárea", "Biopsia / exéresis", "Otra"];
const ESTADOS_CIRUGIA = ["programada", "en proceso", "finalizada", "cancelada"];
const ESTADOS_CITA = ["pendiente", "confirmada", "en espera", "atendida", "cancelada", "no asistió"];
const CHECK_PRE = ["Ayuno confirmado", "Examen prequirúrgico / laboratorio", "Consentimiento firmado", "Vía venosa colocada", "Peso registrado"];
const CHECK_POST = ["Recuperación anestésica", "Analgesia indicada", "Herida controlada", "Indicaciones entregadas", "Alta coordinada"];
window.CHECK_PRE = CHECK_PRE; window.CHECK_POST = CHECK_POST;

function veterinarios() {
  return Datos.lista("usuarios").filter(function (u) { return u.active !== false && rolNormalizado(u.role) !== "recepcion"; });
}
function opcionesVet(actualUid) {
  const lista = veterinarios().map(function (u) { return { value: u.id, texto: u.nombre }; });
  return { lista: lista, sel: actualUid || (puede("clinica") ? window.MASCOTITA.usuario.uid : "") };
}
function nombreUsuario(uid) { const u = Datos.porId("usuarios", uid); return u ? u.nombre : ""; }
function colorVet(uid) {
  const u = Datos.porId("usuarios", uid);
  if (u && u.color) return u.color;
  const pal = ["#0f9d68", "#2d7dd2", "#e38b2c", "#8e5bd1", "#d9534f", "#16a2b8", "#b5832b", "#5b7083"];
  let h = 0; String(uid || "x").split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
  return pal[h % pal.length];
}
async function prepararDatosClinicos() {
  Datos.suscribir("mascotas"); Datos.suscribir("propietarios"); Datos.suscribir("usuarios"); Datos.suscribir("plantillas");
  await Promise.all([Datos.listo("mascotas"), Datos.listo("propietarios"), Datos.listo("plantillas")]);
}
function alertaMascotaHTML(m) {
  if (!m) return "";
  let h = "";
  if (m.alergias) h += '<span class="etiqueta-alerta"><i class="fa-solid fa-triangle-exclamation"></i> Alergias: ' + escHTML(m.alergias) + "</span>";
  if (m.condiciones) h += '<span class="etiqueta-alerta" style="background:var(--warn-suave);color:var(--warn)"><i class="fa-solid fa-notes-medical"></i> ' + escHTML(m.condiciones) + "</span>";
  return h;
}
function datalist(id, valores) { return '<datalist id="' + id + '">' + valores.map(function (v) { return '<option value="' + escHTML(v) + '">'; }).join("") + "</datalist>"; }

/* =====================================================================
 * DUENO
 * ===================================================================== */
function camposDueno(d, pref) {
  pref = pref || "d";
  return '<div class="grid-2">' +
    campo(pref + "nombre", "Nombre y apellido", d.nombre, "text", { req: true }) +
    campo(pref + "telefono", "Teléfono / WhatsApp", d.telefono, "tel", { ph: "0981 123 456" }) +
    campo(pref + "dni", "CI", d.dni) + campo(pref + "ruc", "RUC (para facturar)", d.ruc, "text", { ph: "80012345-6" }) +
    campo(pref + "email", "Email", d.email, "email") + campo(pref + "direccion", "Dirección / barrio", d.direccion) +
    "</div>";
}
function leerDueno(pref) {
  pref = pref || "d";
  return { nombre: val(pref + "nombre"), telefono: val(pref + "telefono"), dni: val(pref + "dni"), ruc: val(pref + "ruc"), email: val(pref + "email"), direccion: val(pref + "direccion") };
}
function abrirFormDueno(id, op) {
  op = op || {};
  const d = id ? Datos.dueno(id) || {} : Object.assign({}, op.prefill || {});
  setTimeout(function () { validarEnVivo(el("druc"), "ruc"); }, 0);
  return modalForm((id ? "Editar" : "Nuevo") + " dueño", camposDueno(d) + areaCampo("dnotas", "Notas", d.notas), {
    onGuardar: async function () {
      const datos = leerDueno(); datos.notas = val("dnotas");
      const dup = Datos.lista("propietarios").find(function (x) { return x.id !== id && ((datos.dni && x.dni === datos.dni) || (datos.telefono && normalizarTelefono(x.telefono) === normalizarTelefono(datos.telefono))); });
      if (dup && !(await confirmar("Ya existe " + dup.nombre + " con el mismo CI o teléfono. ¿Guardar igual?", { peligro: false }))) return false;
      let nid = id;
      if (id) await actualizarDoc("propietarios", id, datos);
      else { const b = db.batch(); nid = await crearDoc("propietarios", datos, b); Datos.stat(b, "propietarios", 1); await escribir(b.commit()); }
      registrarAuditoria(id ? "editar" : "crear", "propietarios", (id ? "Editó" : "Creó") + " dueño " + datos.nombre);
      toast("Dueño guardado.", "ok");
      if (op.onGuardado) op.onGuardado(nid);
    }
  });
}

/* =====================================================================
 * MASCOTA (con foto en Storage; borra la foto anterior al reemplazar)
 * ===================================================================== */
function camposMascota(m) {
  return '<div class="grid-2">' +
    campo("mnombre", "Nombre", m.nombre, "text", { req: true }) +
    campo("mespecie", "Especie", m.especie, "text", { lista: "dl-especies", req: true }) +
    campo("mraza", "Raza", m.raza) +
    selectCampo("msexo", "Sexo", ["Macho", "Hembra"], m.sexo, { vacio: "—" }) +
    campo("mnac", "Fecha de nacimiento", fechaInput(m.fechaNacimiento), "date", { ayuda: m.edad && !m.fechaNacimiento ? "Edad registrada antes: " + m.edad : "Si no se sabe, poné una fecha aproximada." }) +
    campo("mpeso", "Peso (kg)", m.peso || "", "number", { min: 0 }) +
    campo("mcolor", "Color / señas", m.color) + campo("mchip", "Microchip", m.chip) +
    '<div class="form-field">' + checkCampo("mcastrado", "Castrado/a", m.castrado) + "</div>" +
    selectCampo("mestado", "Estado", [{ value: "activo", texto: "Activo" }, { value: "fallecido", texto: "Fallecido" }], m.estadoVital || "activo") +
    areaCampo("malergias", "Alergias", m.alergias, { ph: "Ej: penicilina" }) +
    areaCampo("mcondiciones", "Condiciones crónicas / alertas", m.condiciones, { ph: "Ej: cardiópata, agresivo" }) +
    areaCampo("mobs", "Observaciones", m.observaciones) +
    "</div>" + datalist("dl-especies", ESPECIES) +
    '<div class="form-field full"><label>Foto (cámara o galería)</label><input type="file" id="f-foto" accept="image/*">' +
    '<img class="preview-foto" id="preview-foto"' + (m.fotoMini || m.fotoURL ? ' src="' + escHTML(m.fotoMini || m.fotoURL) + '"' : " hidden") + "></div>";
}
function leerMascota() {
  const fn = val("mnac");
  return {
    nombre: val("mnombre"), especie: val("mespecie"), raza: val("mraza"), sexo: val("msexo"),
    fechaNacimiento: fn ? tsDeInput(fn) : null, peso: numONull("mpeso"), color: val("mcolor"), chip: val("mchip"),
    castrado: chk("mcastrado"), estadoVital: val("mestado"), alergias: val("malergias"), condiciones: val("mcondiciones"), observaciones: val("mobs")
  };
}
function engancharFoto() {
  const inp = document.getElementById("f-foto");
  inp.onchange = function () {
    if (!inp.files[0]) return;
    const pv = document.getElementById("preview-foto"); pv.src = URL.createObjectURL(inp.files[0]); pv.hidden = false;
  };
  return inp;
}
/* Fotos de mascotas GRATIS dentro de Firestore (sin Storage):
 *  - miniatura de 112 px en la propia mascota (fotoMini) para listas y avatares
 *  - foto de 640 px en fotos/{mascotaId}, que se carga solo en la ficha. */
function imagenADataURL(archivo, maxLado, calidad) {
  return comprimirImagen(archivo, maxLado, calidad).then(function (blob) {
    return new Promise(function (res, rej) { const fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  });
}
async function subirFotoMascota(mascotaId, archivo) {
  const grande = await imagenADataURL(archivo, 640, 0.78);
  const mini = await imagenADataURL(archivo, 112, 0.72);
  if (grande.length > 900000) throw errorUsuario("La foto es demasiado pesada incluso comprimida.");
  const b = db.batch();
  b.set(db.collection("fotos").doc(mascotaId), { data: grande, fecha: FS.serverTimestamp() });
  b.update(db.collection("mascotas").doc(mascotaId), { fotoMini: mini, fotoURL: FS.delete(), fotoPath: FS.delete() });
  await escribir(b.commit());
  return mini;
}
function abrirFormMascota(id, op) {
  op = op || {};
  const m = id ? Datos.mascota(id) || {} : Object.assign({}, op.prefill || {});
  const ov = modalForm((id ? "Editar" : "Nueva") + " mascota",
    '<div class="form-field"><label>Dueño <span class="req">*</span></label><div id="sel-dueno"></div></div>' + camposMascota(m), {
      ancho: "modal-lg",
      onGuardar: async function () {
        const due = selD.get();
        if (!due) throw errorUsuario("Elegí el dueño de la mascota.");
        const datos = leerMascota(); datos.propietarioId = due.id;
        const archivo = inpFoto.files[0];
        let nid = id;
        if (id) await actualizarDoc("mascotas", id, datos);
        else { const b = db.batch(); nid = await crearDoc("mascotas", datos, b); Datos.stat(b, "mascotas", 1); await escribir(b.commit()); }
        registrarAuditoria(id ? "editar" : "crear", "mascotas", (id ? "Editó" : "Creó") + " mascota " + datos.nombre);
        if (archivo) {
          try { await subirFotoMascota(nid, archivo); }
          catch (e) { toast("La mascota se guardó, pero la foto no: " + mensajeError(e), "warn", 7000); }
        }
        toast("Mascota guardada.", "ok");
        if (op.onGuardado) op.onGuardado(nid);
      }
    });
  const selD = Datos.selectorDueno("sel-dueno", { valor: m.propietarioId || op.propietarioId, req: true,
    nuevo: { texto: "Crear dueño nuevo", fn: function (txt) { abrirFormDueno(null, { prefill: { nombre: txt }, onGuardado: function (did) { setTimeout(function () { selD.set(did); }, 50); } }); } } });
  const inpFoto = engancharFoto();
  return ov;
}

/* Alta rapida: dueno + mascota en un solo paso. */
function abrirFormPacienteNuevo(op) {
  op = op || {};
  const pre = op.prefill || {};
  const ov = modalForm("Nuevo paciente",
    '<div class="seccion-form"><i class="fa-solid fa-user"></i> Dueño</div>' +
    '<div class="segmentado mb" id="modo-dueno"><button type="button" class="activo" data-m="nuevo">Dueño nuevo</button><button type="button" data-m="existente">Ya registrado</button></div>' +
    '<div id="dueno-nuevo">' + camposDueno({ nombre: pre.dueno, telefono: pre.telefono }) + "</div>" +
    '<div id="dueno-existente" hidden><div class="form-field"><div id="sel-dueno-ex"></div></div></div>' +
    '<div class="seccion-form"><i class="fa-solid fa-paw"></i> Mascota</div>' + camposMascota({ nombre: pre.mascota }), {
      ancho: "modal-lg", textoGuardar: "Registrar paciente",
      onGuardar: async function () {
        const b = db.batch();
        let did;
        if (modo === "existente") { const d = selEx.get(); if (!d) throw errorUsuario("Elegí el dueño registrado."); did = d.id; }
        else {
          const dd = leerDueno(); if (!dd.nombre) throw errorUsuario("Falta el nombre del dueño.");
          did = await crearDoc("propietarios", dd, b); Datos.stat(b, "propietarios", 1);
        }
        const dm = leerMascota(); dm.propietarioId = did;
        const mid = await crearDoc("mascotas", dm, b); Datos.stat(b, "mascotas", 1);
        await escribir(b.commit());
        registrarAuditoria("crear", "mascotas", "Registró paciente " + dm.nombre);
        const archivo = inpFoto.files[0];
        if (archivo) { try { await subirFotoMascota(mid, archivo); } catch (e) { toast("Paciente creado, pero la foto no se subió: " + mensajeError(e), "warn"); } }
        toast("Paciente registrado.", "ok");
        if (op.onGuardado) op.onGuardado(mid, did);
      }
    });
  let modo = "nuevo";
  validarEnVivo(el("druc"), "ruc");
  const selEx = Datos.selectorDueno("sel-dueno-ex", {});
  ov.el.querySelectorAll("#modo-dueno button").forEach(function (b) {
    b.onclick = function () {
      modo = b.dataset.m;
      ov.el.querySelectorAll("#modo-dueno button").forEach(function (x) { x.classList.toggle("activo", x === b); });
      document.getElementById("dueno-nuevo").hidden = modo !== "nuevo";
      document.getElementById("dueno-existente").hidden = modo === "nuevo";
      // el nombre del dueno solo es obligatorio en modo "nuevo"
      const n = el("dnombre"); if (modo === "nuevo") n.setAttribute("data-req", ""); else n.removeAttribute("data-req");
    };
  });
  const inpFoto = engancharFoto();
  return ov;
}

/* =====================================================================
 * CONSULTA (signos vitales, examen, receta, adjuntos, cobro)
 * ===================================================================== */
const MUCOSAS = ["Rosadas", "Pálidas", "Congestivas", "Ictéricas", "Cianóticas"];
function lineaRecetaHTML(r) {
  r = r || {};
  return '<div class="linea linea-rec">' +
    '<input class="r-med" list="dl-productos" placeholder="Medicamento" value="' + escHTML(r.medicamento || "") + '">' +
    '<input class="r-ind" placeholder="Dosis / frecuencia / duración" value="' + escHTML(r.indicaciones || "") + '">' +
    '<input class="r-cant" type="number" min="0" step="any" placeholder="Cant." value="' + escHTML(r.cantidad || "") + '">' +
    '<label class="check" title="Se cobra y descuenta del stock al facturar"><input type="checkbox" class="r-disp"' + (r.dispensar ? " checked" : "") + "> Dispensar</label>" +
    '<button type="button" class="btn-icono danger r-del" title="Quitar"><i class="fa-solid fa-trash"></i></button></div>';
}
function leerReceta(raiz) {
  return Array.from(raiz.querySelectorAll(".linea-rec:not(.linea-head)")).map(function (row) {
    const med = row.querySelector(".r-med").value.trim();
    const prod = Datos.lista("productos").find(function (p) { return normalizar(p.nombre) === normalizar(med); });
    return { medicamento: med, indicaciones: row.querySelector(".r-ind").value.trim(), cantidad: Number(row.querySelector(".r-cant").value) || 0,
      dispensar: row.querySelector(".r-disp").checked, productoId: prod ? prod.id : "" };
  }).filter(function (r) { return r.medicamento; });
}

async function abrirFormConsulta(op) {
  op = op || {};
  await prepararDatosClinicos();
  Datos.suscribir("productos");
  let c = {};
  if (op.id) {
    const s = await db.collection("consultas").doc(op.id).get();
    if (!s.exists) { toast("La consulta no existe.", "error"); return; }
    c = Object.assign({ id: s.id }, s.data());
  }
  if (op.id && !puede("clinica")) { toast("Solo el personal clínico puede editar consultas.", "warn"); return; }
  const v = c.vitales || {};
  const vet = opcionesVet(c.veterinarioUid);
  const plantillas = Datos.lista("plantillas");
  const ov = modalForm(op.id ? "Editar consulta" : "Nueva consulta",
    (plantillas.length ? '<div class="alerta alerta-info" style="padding:8px 12px"><i class="fa-solid fa-wand-magic-sparkles"></i><select id="c-plantilla" class="input" style="max-width:320px"><option value="">Usar una plantilla clínica...</option>' +
      plantillas.map(function (t) { return '<option value="' + t.id + '">' + escHTML(t.nombre) + "</option>"; }).join("") + "</select></div>" : "") +
    '<div class="form-field"><label>Paciente <span class="req">*</span></label><div id="sel-masc"></div><div id="alerta-masc" class="mt" style="margin-top:6px"></div></div>' +
    '<div class="grid-2">' +
    (vet.lista.length ? selectCampo("cvet", "Veterinario/a", vet.lista, vet.sel, { vacio: "—" }) : campo("cvetTxt", "Veterinario/a", c.veterinario || window.MASCOTITA.usuario.nombre)) +
    campo("cfecha", "Fecha y hora", c.fecha ? fechaInput(c.fecha) + "T" + horaInput(c.fecha) : "", "datetime-local", { ayuda: op.id ? "" : "Vacío = ahora" }) +
    "</div>" +
    areaCampo("cmotivo", "Motivo de consulta", c.motivo || op.motivo, { req: true }) +
    areaCampo("csintomas", "Anamnesis / síntomas", c.sintomas, { filas: 3 }) +
    '<div class="seccion-form"><i class="fa-solid fa-heart-pulse"></i> Signos vitales</div>' +
    '<div class="grid-4">' +
    campo("vpeso", "Peso (kg)", v.peso || "", "number", { min: 0 }) + campo("vtemp", "Temp. (°C)", v.temperatura || "", "number", { min: 30, max: 45 }) +
    campo("vfc", "FC (lpm)", v.fc || "", "number", { min: 0 }) + campo("vfr", "FR (rpm)", v.fr || "", "number", { min: 0 }) +
    selectCampo("vcc", "Cond. corporal (1-9)", ["1", "2", "3", "4", "5", "6", "7", "8", "9"], v.cc, { vacio: "—" }) +
    selectCampo("vmuc", "Mucosas", MUCOSAS, v.mucosas, { vacio: "—" }) +
    campo("vtllc", "TLLC (seg)", v.tllc || "", "number", { min: 0 }) +
    selectCampo("vhid", "Hidratación", ["Normal", "Deshidratación leve (5%)", "Moderada (8%)", "Severa (10%+)"], v.hidratacion, { vacio: "—" }) +
    "</div>" +
    areaCampo("cexamen", "Examen físico", c.examenFisico, { filas: 3 }) +
    areaCampo("cdiagnostico", "Diagnóstico (presuntivo / definitivo)", c.diagnostico) +
    areaCampo("ctratamiento", "Tratamiento realizado", c.tratamiento) +
    '<div class="seccion-form"><i class="fa-solid fa-prescription"></i> Receta</div>' +
    '<div class="lineas" id="receta"><div class="linea linea-rec linea-head"><span>Medicamento</span><span>Indicaciones</span><span>Cant.</span><span></span><span></span></div>' +
    (c.receta || []).map(lineaRecetaHTML).join("") + "</div>" +
    '<button type="button" class="btn btn-ghost btn-sm mt" id="add-rec"><i class="fa-solid fa-plus"></i> Agregar medicamento</button>' +
    datalist("dl-productos", Datos.lista("productos").map(function (p) { return p.nombre; })) +
    '<div style="margin-top:14px"></div>' + areaCampo("cmed", "Indicaciones generales para el dueño", c.medicamentos) +
    '<div class="grid-2">' +
    '<div class="form-field"><label for="f-cprox">Próximo control</label><input type="date" id="f-cprox" value="' + fechaInput(c.proximoControl) + '">' +
    '<div class="fila-flex" style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" data-dias="7">7 días</button><button type="button" class="btn btn-ghost btn-sm" data-dias="15">15 días</button><button type="button" class="btn btn-ghost btn-sm" data-dias="30">30 días</button></div></div>' +
    (cfg().storageActivo ? '<div class="form-field"><label>Adjuntos (análisis, radiografías, PDF)</label><input type="file" id="f-adj" multiple accept="image/*,application/pdf">' +
    ((c.adjuntos || []).length ? '<small class="hint">' + c.adjuntos.length + " archivo(s) ya adjunto(s)</small>" : "") + "</div>" : "") +
    "</div>" + areaCampo("cnotas", "Notas internas (no salen en la receta)", c.notasInternas), {
      ancho: "modal-lg", textoGuardar: op.id ? "Guardar cambios" : "Guardar consulta",
      pieExtra: '<button type="button" class="btn btn-ghost izq" id="c-guardar-pl" title="Guarda motivo, examen, diagnóstico, tratamiento y receta para reutilizarlos"><i class="fa-solid fa-bookmark"></i> Guardar como plantilla</button>',
      onGuardar: async function () {
        const m = selM.get();
        if (!m) throw errorUsuario("Elegí el paciente.");
        const vitales = { peso: numONull("vpeso"), temperatura: numONull("vtemp"), fc: numONull("vfc"), fr: numONull("vfr"), cc: val("vcc"), mucosas: val("vmuc"), tllc: numONull("vtllc"), hidratacion: val("vhid") };
        Object.keys(vitales).forEach(function (k) { if (vitales[k] === null || vitales[k] === "") delete vitales[k]; });
        if (vitales.temperatura && (vitales.temperatura < 30 || vitales.temperatura > 45)) throw errorUsuario("La temperatura parece incorrecta (" + vitales.temperatura + " °C).");
        const due = Datos.duenoDe(m);
        const vetUid = val("cvet");
        const fh = val("cfecha");
        const datos = {
          mascotaId: m.id, mascota: m.nombre, especie: m.especie || "", propietarioId: m.propietarioId || "", dueno: due ? due.nombre : "",
          veterinarioUid: vetUid || "", veterinario: vetUid ? nombreUsuario(vetUid) : (val("cvetTxt") || ""),
          motivo: val("cmotivo"), sintomas: val("csintomas"), vitales: vitales, examenFisico: val("cexamen"),
          diagnostico: val("cdiagnostico"), tratamiento: val("ctratamiento"), receta: leerReceta(ov.el), medicamentos: val("cmed"),
          proximoControl: tsDeInput(val("cprox")), notasInternas: val("cnotas")
        };
        if (fh) datos.fecha = TS.fromDate(new Date(fh)); else if (!op.id) datos.fecha = FS.serverTimestamp();
        const b = db.batch();
        let cid = op.id;
        if (op.id) await actualizarDoc("consultas", op.id, datos, b);
        else {
          datos.porCobrar = !op.sinCobro;
          if (op.citaId) datos.citaId = op.citaId;
          cid = await crearDoc("consultas", datos, b);
          Datos.stat(b, "consultas", 1);
          if (op.citaId) b.update(db.collection("citas").doc(op.citaId), { estado: "atendida", consultaId: cid });
        }
        if (vitales.peso && (!m.peso || Number(m.peso) !== vitales.peso)) b.update(db.collection("mascotas").doc(m.id), { peso: vitales.peso, pesoActualizado: FS.serverTimestamp() });
        await escribir(b.commit());
        registrarAuditoria(op.id ? "editar" : "crear", "consultas", (op.id ? "Editó" : "Registró") + " consulta de " + datos.mascota);
        // Adjuntos (necesitan conexion)
        const archivos = document.getElementById("f-adj") ? Array.from(document.getElementById("f-adj").files || []) : [];
        if (archivos.length) {
          try { await subirAdjuntos(cid, m.id, archivos); } catch (e) { toast("Consulta guardada, pero los adjuntos no: " + mensajeError(e), "warn", 7000); }
        }
        toast("Consulta guardada.", "ok");
        if (!op.id && datos.porCobrar && puede("facturar") && window.abrirFormFactura) {
          setTimeout(async function () {
            if (await confirmar("¿Cobrar esta consulta ahora?", { titulo: "Cobro", textoSi: "Cobrar ahora", textoNo: "Más tarde", peligro: false })) {
              abrirFormFactura({ consultaId: cid });
            }
          }, 250);
        }
        if (op.onGuardado) op.onGuardado(cid);
      }
    });
  const selM = Datos.selectorMascota("sel-masc", { valor: c.mascotaId || op.mascotaId, req: true,
    onChange: function (m) {
      document.getElementById("alerta-masc").innerHTML = alertaMascotaHTML(m);
      if (m && m.peso && !el("vpeso").value) el("vpeso").placeholder = "Último: " + m.peso;
    },
    nuevo: puede("pacientes") ? { texto: "Registrar paciente nuevo", fn: function (txt) { abrirFormPacienteNuevo({ prefill: { mascota: txt }, onGuardado: function (mid) { setTimeout(function () { selM.set(mid); }, 60); } }); } } : null });
  document.getElementById("alerta-masc").innerHTML = alertaMascotaHTML(selM.get());
  const rec = document.getElementById("receta");
  function engancharLineas() { rec.querySelectorAll(".r-del").forEach(function (b) { b.onclick = function () { b.closest(".linea").remove(); }; }); }
  document.getElementById("add-rec").onclick = function () { rec.insertAdjacentHTML("beforeend", lineaRecetaHTML()); engancharLineas(); rec.querySelector(".linea:last-child .r-med").focus(); };
  engancharLineas();
  ov.el.querySelectorAll("[data-dias]").forEach(function (b) { b.onclick = function () { el("cprox").value = fechaInput(sumarDias(new Date(), Number(b.dataset.dias))); }; });
  const sp = document.getElementById("c-plantilla");
  if (sp) sp.onchange = function () {
    const t = Datos.porId("plantillas", sp.value); if (!t) return;
    [["cmotivo", "motivo"], ["cexamen", "examenFisico"], ["cdiagnostico", "diagnostico"], ["ctratamiento", "tratamiento"], ["cmed", "medicamentos"]].forEach(function (x) {
      if (t[x[1]] && (!val(x[0]) || x[0] !== "cmotivo")) el(x[0]).value = t[x[1]];
    });
    if (t.diasControl) el("cprox").value = fechaInput(sumarDias(new Date(), t.diasControl));
    (t.receta || []).forEach(function (r) { rec.insertAdjacentHTML("beforeend", lineaRecetaHTML(r)); });
    engancharLineas();
    toast("Plantilla \"" + t.nombre + "\" aplicada. Revisá y ajustá.", "info");
  };
  document.getElementById("c-guardar-pl").onclick = function () {
    modalForm("Guardar como plantilla", campo("plnom", "Nombre de la plantilla", val("cdiagnostico") || val("cmotivo"), "text", { req: true, ph: "Ej: Gastroenteritis leve" }) +
      campo("pldias", "Control a los (días)", "", "number", { min: 0, ayuda: "Opcional" }), {
      ancho: "modal-sm", onGuardar: async function () {
        const d = { nombre: val("plnom"), motivo: el("cmotivo").value.trim(), examenFisico: el("cexamen").value.trim(), diagnostico: el("cdiagnostico").value.trim(),
          tratamiento: el("ctratamiento").value.trim(), medicamentos: el("cmed").value.trim(), receta: leerReceta(ov.el), diasControl: num("pldias") || null };
        await crearDoc("plantillas_clinicas", d);
        toast("Plantilla guardada.", "ok");
      }
    });
  };
  return ov;
}

async function subirAdjuntos(consultaId, mascotaId, archivos) {
  requiereConexion("Subir adjuntos");
  const st = await obtenerStorage();
  const nuevos = [];
  for (const f of archivos) {
    if (f.size > 10 * 1024 * 1024) { toast(f.name + " supera 10 MB y no se subió.", "warn"); continue; }
    let blob = f, tipo = f.type || "application/octet-stream";
    if (/^image\//.test(tipo) && f.size > 600 * 1024) { blob = await comprimirImagen(f, 1600, 0.85); tipo = "image/jpeg"; }
    const path = "adjuntos/" + mascotaId + "/" + consultaId + "_" + Date.now() + "_" + nombreSeguro(f.name);
    const snap = await st.ref(path).put(blob, { contentType: tipo });
    nuevos.push({ nombre: f.name, url: await snap.ref.getDownloadURL(), path: path, tipo: tipo, fecha: TS.now() });
  }
  if (nuevos.length) await db.collection("consultas").doc(consultaId).update({ adjuntos: FS.arrayUnion.apply(null, nuevos) });
}

/* =====================================================================
 * VACUNAS — solo la ultima dosis de cada tipo queda "vigente"
 * ===================================================================== */
const REFUERZO_SUGERIDO = { "Antirrábica": 365, "Quíntuple / Polivalente": 365, "Séxtuple": 365, "Triple felina": 365, "Leucemia felina": 365, "Tos de las perreras": 365, "Desparasitación interna": 90, "Desparasitación externa": 30 };
async function recalcularVigencia(mascotaId) {
  if (!mascotaId) return;
  const s = await db.collection("vacunas").where("mascotaId", "==", mascotaId).get();
  const vs = docsDe(s);
  const ult = {};
  vs.forEach(function (v) {
    if (v.eliminado) return;
    const k = Datos.claveVacuna(v), f = aFecha(v.fecha) || new Date(0);
    if (!ult[k] || f > ult[k].f) ult[k] = { id: v.id, f: f };
  });
  const b = db.batch(); let n = 0;
  vs.forEach(function (v) {
    const vig = !v.eliminado && !!ult[Datos.claveVacuna(v)] && ult[Datos.claveVacuna(v)].id === v.id;
    if (v.vigente !== vig) { b.update(db.collection("vacunas").doc(v.id), { vigente: vig }); n++; }
  });
  if (n) await escribir(b.commit());
}
async function abrirFormVacuna(op) {
  op = op || {};
  await prepararDatosClinicos();
  Datos.suscribir("productos");
  let v = {};
  if (op.id) { const s = await db.collection("vacunas").doc(op.id).get(); v = s.exists ? Object.assign({ id: s.id }, s.data()) : {}; }
  const tipoIni = v.tipo || op.tipo || "";
  const ov = modalForm(op.id ? "Editar vacuna / desparasitación" : "Registrar vacuna / desparasitación",
    '<div class="form-field"><label>Paciente <span class="req">*</span></label><div id="sel-masc-v"></div></div>' +
    '<div class="grid-2">' +
    campo("vtipo", "Tipo", tipoIni, "text", { req: true, lista: "dl-tipos-vac" }) +
    '<div class="form-field"><label>Producto (del stock, opcional)</label><div id="sel-prod-v"></div></div>' +
    campo("vprodtxt", "Marca / producto (texto)", v.producto) + campo("vlote", "Lote", v.lote) +
    campo("vfecha", "Fecha de aplicación", fechaInput(v.fecha) || hoyISO(), "date", { req: true }) +
    '<div class="form-field"><label for="f-vprox">Próxima dosis</label><input type="date" id="f-vprox" value="' + fechaInput(v.proximaDosis) + '"><div class="fila-flex" style="margin-top:6px">' +
    '<button type="button" class="btn btn-ghost btn-sm" data-meses="1">1 mes</button><button type="button" class="btn btn-ghost btn-sm" data-meses="3">3 meses</button><button type="button" class="btn btn-ghost btn-sm" data-meses="12">1 año</button></div></div>' +
    "</div>" + datalist("dl-tipos-vac", TIPOS_VACUNA) +
    (!op.id && puede("stock") ? '<label class="check" id="wrap-desc" hidden><input type="checkbox" id="f-vdesc" checked> Descontar 1 unidad del stock</label>' : "") +
    areaCampo("vnotas", "Notas", v.notas), {
      onGuardar: async function () {
        const m = selM.get(); if (!m) throw errorUsuario("Elegí el paciente.");
        const fAp = parseFechaLocal(val("vfecha")), fPr = parseFechaLocal(val("vprox"));
        if (!fAp) throw errorUsuario("Indicá la fecha de aplicación.");
        if (fPr && fPr < fAp) throw errorUsuario("La próxima dosis no puede ser anterior a la aplicación.");
        const due = Datos.duenoDe(m), prod = selP.get();
        const datos = {
          mascotaId: m.id, mascota: m.nombre, propietarioId: m.propietarioId || "", dueno: due ? due.nombre : "", telefono: due ? due.telefono || "" : "",
          tipo: val("vtipo"), productoId: prod ? prod.id : "", producto: val("vprodtxt") || (prod ? prod.nombre : ""), lote: val("vlote"), notas: val("vnotas"),
          fecha: TS.fromDate(fAp), proximaDosis: fPr ? TS.fromDate(fPr) : null, vigente: true
        };
        if (op.id) await actualizarDoc("vacunas", op.id, datos);
        else {
          datos.aplicadaPor = window.MASCOTITA.usuario.nombre;
          const b = db.batch(); await crearDoc("vacunas", datos, b); Datos.stat(b, "vacunas", 1); await escribir(b.commit());
        }
        await recalcularVigencia(m.id);
        if (op.id && v.mascotaId && v.mascotaId !== m.id) await recalcularVigencia(v.mascotaId);
        actualizarCarnet(m.id).catch(function (e) { console.warn("carnet:", e); });
        registrarAuditoria(op.id ? "editar" : "crear", "vacunas", (op.id ? "Editó " : "Registró ") + datos.tipo + " de " + datos.mascota);
        if (!op.id && prod && chk("vdesc")) {
          try { await Inventario.movimientoSimple(prod.id, -1, "Aplicación " + datos.tipo + " a " + m.nombre, "vacuna"); }
          catch (e) { toast("Vacuna guardada, pero no se descontó el stock: " + mensajeError(e), "warn", 7000); }
        }
        toast("Registro guardado.", "ok");
        if (op.onGuardado) op.onGuardado();
      }
    });
  const selM = Datos.selectorMascota("sel-masc-v", { valor: v.mascotaId || op.mascotaId, req: true });
  const selP = selector("sel-prod-v", {
    items: function () { return Datos.lista("productos").filter(function (p) { return /vacun|antiparas|desparas|pipeta|biol/i.test((p.categoria || "") + " " + p.nombre) || true; }); },
    texto: function (p) { return p.nombre; }, sub: function (p) { return "Stock: " + fmtNum(p.cantidad); }, placeholder: "Buscar producto...",
    valor: v.productoId, onChange: function (p) { const w = document.getElementById("wrap-desc"); if (w) w.hidden = !p; if (p && !val("vprodtxt")) el("vprodtxt").value = p.nombre; }
  });
  function sugerir() {
    if (el("vprox").value) return;
    const dias = REFUERZO_SUGERIDO[val("vtipo")];
    const fa = parseFechaLocal(val("vfecha"));
    if (dias && fa) el("vprox").value = fechaInput(sumarDias(fa, dias));
  }
  el("vtipo").addEventListener("change", sugerir);
  ov.el.querySelectorAll("[data-meses]").forEach(function (b) {
    b.onclick = function () { const fa = parseFechaLocal(val("vfecha")) || new Date(); const d = new Date(fa); d.setMonth(d.getMonth() + Number(b.dataset.meses)); el("vprox").value = fechaInput(d); };
  });
  return ov;
}

/* =====================================================================
 * CIRUGIA
 * ===================================================================== */
function checklistHTML(prefijo, lista, marcados) {
  marcados = marcados || [];
  return '<div class="checklist">' + lista.map(function (it, i) {
    return '<label class="check"><input type="checkbox" id="' + prefijo + i + '"' + (marcados.indexOf(it) !== -1 ? " checked" : "") + "> " + escHTML(it) + "</label>";
  }).join("") + "</div>";
}
function leerChecklist(prefijo, lista) { return lista.filter(function (_, i) { const e = document.getElementById(prefijo + i); return e && e.checked; }); }

async function abrirFormCirugia(op) {
  op = op || {};
  await prepararDatosClinicos();
  let c = {};
  if (op.id) { const s = await db.collection("cirugias").doc(op.id).get(); c = s.exists ? Object.assign({ id: s.id }, s.data()) : {}; }
  const vet = opcionesVet(c.veterinarioUid);
  const ov = modalForm(op.id ? "Editar cirugía" : "Programar cirugía",
    '<div class="form-field"><label>Paciente <span class="req">*</span></label><div id="sel-masc-c"></div>' +
    (c.paciente && !c.mascotaId ? '<small class="hint">Registro anterior: "' + escHTML(c.paciente) + '". Elegí la mascota para vincularla.</small>' : "") + '<div id="alerta-masc-c"></div></div>' +
    '<div class="grid-3">' +
    campo("ctipo", "Tipo", c.tipo, "text", { req: true, lista: "dl-tipos-cir" }) +
    selectCampo("cestado", "Estado", ESTADOS_CIRUGIA, c.estado || "programada") +
    campo("cfecha", "Fecha", fechaInput(c.fecha) || fechaInput(op.fecha) || hoyISO(), "date", { req: true }) +
    (vet.lista.length ? selectCampo("cvet", "Cirujano/a", vet.lista, vet.sel, { vacio: "—" }) : campo("cvetTxt", "Cirujano/a", c.veterinario)) +
    campo("canest", "Anestesista", c.anestesista) +
    selectCampo("casa", "Riesgo ASA", ["I", "II", "III", "IV", "V"], c.asa, { vacio: "—" }) +
    campo("cin", "Hora entrada", c.horaEntrada, "time") + campo("cout", "Hora salida", c.horaSalida, "time") +
    campo("cpeso", "Peso (kg)", c.peso || "", "number", { min: 0 }) +
    "</div>" + datalist("dl-tipos-cir", TIPOS_CIRUGIA) +
    areaCampo("canestesia", "Protocolo anestésico", c.anestesia) +
    areaCampo("cproc", "Descripción del procedimiento", c.procedimiento) +
    areaCampo("cobs", "Observaciones / complicaciones", c.observaciones) +
    areaCampo("cind", "Indicaciones post-operatorias", c.indicaciones) +
    '<div class="grid-2">' + campo("ccosto", "Costo a cobrar (Gs, IVA incluido)", c.costo || "", "number", { min: 0 }) + "</div>" +
    '<div class="seccion-form">Checklist pre-operatorio</div>' + checklistHTML("pre", CHECK_PRE, c.checkPre) +
    '<div class="seccion-form">Checklist post-operatorio</div>' + checklistHTML("post", CHECK_POST, c.checkPost), {
      ancho: "modal-lg",
      onGuardar: async function () {
        const m = selM.get(); if (!m) throw errorUsuario("Elegí el paciente.");
        if (val("cin") && val("cout") && val("cout") < val("cin")) throw errorUsuario("La hora de salida no puede ser anterior a la de entrada.");
        const due = Datos.duenoDe(m), vetUid = val("cvet");
        const datos = {
          mascotaId: m.id, paciente: m.nombre, mascota: m.nombre, propietarioId: m.propietarioId || "", dueno: due ? due.nombre : "",
          tipo: val("ctipo"), estado: val("cestado"), fecha: tsDeInput(val("cfecha")),
          veterinarioUid: vetUid || "", veterinario: vetUid ? nombreUsuario(vetUid) : val("cvetTxt"), anestesista: val("canest"), asa: val("casa"),
          horaEntrada: val("cin"), horaSalida: val("cout"), peso: numONull("cpeso"), anestesia: val("canestesia"), procedimiento: val("cproc"),
          observaciones: val("cobs"), indicaciones: val("cind"), costo: num("ccosto"),
          checkPre: leerChecklist("pre", CHECK_PRE), checkPost: leerChecklist("post", CHECK_POST)
        };
        if (datos.estado === "finalizada" && datos.costo > 0 && !c.facturaId) datos.porCobrar = true;
        if (datos.estado === "cancelada") datos.porCobrar = false;
        if (op.id) await actualizarDoc("cirugias", op.id, datos);
        else { const b = db.batch(); await crearDoc("cirugias", datos, b); Datos.stat(b, "cirugias", 1); await escribir(b.commit()); }
        registrarAuditoria(op.id ? "editar" : "crear", "cirugias", (op.id ? "Editó" : "Programó") + " cirugía de " + m.nombre);
        toast("Cirugía guardada.", "ok");
        if (op.onGuardado) op.onGuardado();
      }
    });
  const selM = Datos.selectorMascota("sel-masc-c", { valor: c.mascotaId || op.mascotaId, req: true, textoInicial: !c.mascotaId ? c.paciente : "",
    onChange: function (m) { document.getElementById("alerta-masc-c").innerHTML = alertaMascotaHTML(m); if (m && m.peso && !el("cpeso").value) el("cpeso").value = m.peso; } });
  document.getElementById("alerta-masc-c").innerHTML = alertaMascotaHTML(selM.get());
  return ov;
}

/* =====================================================================
 * CITA (agenda)
 * ===================================================================== */
async function abrirFormCita(op) {
  op = op || {};
  await prepararDatosClinicos();
  Datos.suscribir("servicios");
  let c = {};
  if (op.id) { const s = await db.collection("citas").doc(op.id).get(); c = s.exists ? Object.assign({ id: s.id }, s.data()) : {}; }
  const vet = opcionesVet(c.veterinarioUid || op.veterinarioUid);
  if (!op.id && !c.veterinarioUid && !puede("clinica")) vet.sel = op.veterinarioUid || "";
  const intervalo = Number(cfg().agendaIntervalo) || 30;
  const libre = !!(op.id && !c.mascotaId);
  const ov = modalForm(op.id ? "Cita de " + (c.mascota || "") : "Nueva cita",
    '<div class="segmentado mb" id="modo-cita"><button type="button" data-m="reg" class="' + (libre ? "" : "activo") + '">Paciente registrado</button><button type="button" data-m="libre" class="' + (libre ? "activo" : "") + '">Cliente nuevo / sin registrar</button></div>' +
    '<div id="cita-reg"' + (libre ? " hidden" : "") + '><div class="form-field"><label>Paciente</label><div id="sel-masc-cita"></div></div></div>' +
    '<div id="cita-libre"' + (libre ? "" : " hidden") + '><div class="grid-2">' + campo("cmascota", "Mascota", c.mascota) + campo("cdueno", "Dueño", c.dueno) + "</div></div>" +
    '<div class="grid-2">' +
    campo("ctel", "Teléfono / WhatsApp", c.telefono, "tel") +
    campo("cserv", "Servicio / motivo", c.servicio, "text", { lista: "dl-servicios", req: true }) +
    (vet.lista.length ? selectCampo("cvet", "Veterinario/a", vet.lista, vet.sel, { vacio: "Sin asignar" }) : campo("cvetTxt", "Veterinario/a", c.veterinario)) +
    selectCampo("cestado", "Estado", ESTADOS_CITA, c.estado || "pendiente") +
    campo("cfecha", "Fecha", fechaInput(c.fecha) || op.fecha || hoyISO(), "date", { req: true }) +
    '<div class="grid-2" style="column-gap:10px">' + campo("chora", "Hora", horaInput(c.fecha) || c.hora || op.hora || "", "time", { req: true, step: 300 }) +
    campo("cdur", "Duración (min)", c.duracion || intervalo, "number", { min: 5, step: 5 }) + "</div>" +
    "</div>" + datalist("dl-servicios", Datos.lista("servicios").map(function (s) { return s.nombre; })) +
    areaCampo("cnotas", "Notas", c.notas) +
    '<div id="cita-aviso"></div>', {
      tituloHTML: op.id ? 'Cita de ' + escHTML(c.mascota || "") + " " + pill(c.estado || "pendiente", (c.estado || "pendiente").replace(/\s/g, "-").replace("ó", "o")) : "",
      pieExtra: op.id ? '<div class="izq fila-flex">' +
        '<button type="button" class="btn btn-wa btn-sm" id="cita-wa"><i class="fa-brands fa-whatsapp"></i> Recordar</button>' +
        (puede("clinica") && c.estado !== "atendida" ? '<button type="button" class="btn btn-secundario btn-sm" id="cita-atender"><i class="fa-solid fa-stethoscope"></i> Atender</button>' : "") +
        (c.consultaId ? '<a class="btn btn-ghost btn-sm" href="paciente.html?id=' + c.mascotaId + '">Ver ficha</a>' : "") +
        (esAdmin() ? '<button type="button" class="btn btn-ghost btn-sm" id="cita-del" title="Eliminar"><i class="fa-solid fa-trash"></i></button>' : "") + "</div>" : "",
      onGuardar: async function () {
        const reg = modo === "reg";
        const m = reg ? selM.get() : null;
        if (reg && !m) throw errorUsuario("Elegí el paciente o cambiá a \"Cliente nuevo\".");
        if (!reg && !val("cmascota")) throw errorUsuario("Indicá el nombre de la mascota.");
        const due = m ? Datos.duenoDe(m) : null;
        const fecha = parseFechaLocal(val("cfecha"), val("chora"));
        if (!fecha) throw errorUsuario("Fecha u hora inválida.");
        const dur = Math.max(5, num("cdur") || intervalo);
        const vetUid = val("cvet");
        const datos = {
          mascotaId: m ? m.id : "", mascota: m ? m.nombre : val("cmascota"), propietarioId: m ? m.propietarioId || "" : "",
          dueno: m ? (due ? due.nombre : "") : val("cdueno"), telefono: val("ctel") || (due ? due.telefono || "" : ""),
          servicio: val("cserv"), veterinarioUid: vetUid || "", veterinario: vetUid ? nombreUsuario(vetUid) : (val("cvetTxt") || ""),
          estado: val("cestado"), fecha: TS.fromDate(fecha), hora: val("chora"), duracion: dur, notas: val("cnotas")
        };
        // Choque de horario con el mismo veterinario (avisa, no bloquea).
        if (datos.veterinarioUid || datos.veterinario) {
          const s = await db.collection("citas").where("fecha", ">=", TS.fromDate(inicioDelDia(fecha))).where("fecha", "<=", TS.fromDate(finDelDia(fecha))).get();
          const ini = fecha.getTime(), fin = ini + dur * 60000;
          const choque = docsDe(s).find(function (x) {
            if (x.id === op.id || x.eliminado || ["cancelada", "no asistió"].indexOf(x.estado) !== -1) return false;
            const mismo = datos.veterinarioUid ? x.veterinarioUid === datos.veterinarioUid : normalizar(x.veterinario) === normalizar(datos.veterinario);
            if (!mismo) return false;
            const xi = aFecha(x.fecha).getTime(), xf = xi + (Number(x.duracion) || intervalo) * 60000;
            return ini < xf && xi < fin;
          });
          if (choque && !(await confirmar((datos.veterinario || "El veterinario") + " ya tiene una cita a las " + fmtHora(choque.fecha) + " (" + (choque.mascota || "") + "). ¿Guardar igual?", { peligro: false }))) return false;
        }
        if (op.id) await actualizarDoc("citas", op.id, datos);
        else await crearDoc("citas", datos);
        registrarAuditoria(op.id ? "editar" : "crear", "citas", (op.id ? "Editó" : "Agendó") + " cita de " + datos.mascota + " " + fmtFecha(fecha));
        toast("Cita guardada.", "ok");
        if (op.onGuardado) op.onGuardado();
      }
    });
  let modo = libre ? "libre" : "reg";
  const selM = Datos.selectorMascota("sel-masc-cita", { valor: c.mascotaId || op.mascotaId,
    onChange: function (m) { const d = Datos.duenoDe(m); if (d && d.telefono && !val("ctel")) el("ctel").value = d.telefono; const a = document.getElementById("cita-aviso"); a.innerHTML = alertaMascotaHTML(m); },
    nuevo: puede("pacientes") ? { texto: "Registrar paciente nuevo", fn: function (txt) { abrirFormPacienteNuevo({ prefill: { mascota: txt }, onGuardado: function (mid) { setTimeout(function () { selM.set(mid); }, 60); } }); } } : null });
  ov.el.querySelectorAll("#modo-cita button").forEach(function (b) {
    b.onclick = function () {
      modo = b.dataset.m;
      ov.el.querySelectorAll("#modo-cita button").forEach(function (x) { x.classList.toggle("activo", x === b); });
      document.getElementById("cita-reg").hidden = modo !== "reg"; document.getElementById("cita-libre").hidden = modo === "reg";
    };
  });
  el("cserv").addEventListener("change", function () {
    const s = Datos.lista("servicios").find(function (x) { return normalizar(x.nombre) === normalizar(val("cserv")); });
    if (s && s.duracion) el("cdur").value = s.duracion;
  });
  if (op.id) {
    document.getElementById("cita-wa").onclick = function () {
      waPlantilla("recordatorio_cita", val("ctel") || c.telefono, { nombre: c.dueno || "", mascota: c.mascota || "", fecha: fmtFechaCorta(c.fecha), hora: fmtHora(c.fecha) });
      db.collection("citas").doc(op.id).update({ avisadoEn: FS.serverTimestamp(), avisadoPor: window.MASCOTITA.usuario.nombre }).catch(function () {});
    };
    const at = document.getElementById("cita-atender");
    if (at) at.onclick = function () {
      const mid = c.mascotaId || (selM.get() && selM.get().id);
      if (!mid) { toast("Primero registrá al paciente (opción \"Paciente registrado\").", "warn"); return; }
      ov.cerrar(); abrirFormConsulta({ mascotaId: mid, citaId: op.id, motivo: c.servicio });
    };
    const del = document.getElementById("cita-del");
    if (del) del.onclick = async function () {
      if (!(await confirmar("¿Eliminar esta cita? (va a la papelera)"))) return;
      ov.cerrar(); await Datos.aPapelera("citas", op.id, c);
    };
  }
  return ov;
}

/* =====================================================================
 * CARNET DIGITAL PUBLICO (enlace / QR para el dueno, sin usuario)
 * Copia de solo lectura en carnets/{token}: nombre de la mascota, vacunas
 * y datos de la clinica (sin telefono ni direccion del dueno).
 * ===================================================================== */
function _tokenCarnet() { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a).map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
function urlBasePublica() {
  const c = cfg();
  if (c.urlPublica) return c.urlPublica.replace(/\/+$/, "");
  return /^https?:/.test(location.protocol) && !esApp() ? location.origin : "";
}
async function actualizarCarnet(mascotaId, crear) {
  const ms = await db.collection("mascotas").doc(mascotaId).get(); if (!ms.exists) return null;
  const m = ms.data();
  let token = m.carnetToken;
  if (!token && !crear) return null;
  if (!token) { token = _tokenCarnet(); await db.collection("mascotas").doc(mascotaId).update({ carnetToken: token }); }
  const vs = docsDe(await db.collection("vacunas").where("mascotaId", "==", mascotaId).get()).filter(function (v) { return !v.eliminado; })
    .sort(function (a, b) { return aFecha(b.fecha) - aFecha(a.fecha); });
  const c = cfg();
  await db.collection("carnets").doc(token).set({
    mascotaId: mascotaId, nombre: m.nombre || "", especie: m.especie || "", raza: m.raza || "", sexo: m.sexo || "", fechaNacimiento: m.fechaNacimiento || null, foto: m.fotoMini || "",
    vacunas: vs.map(function (v) { return { tipo: v.tipo || "", fecha: v.fecha || null, proximaDosis: v.proximaDosis || null, producto: v.producto || "", vigente: !!v.vigente }; }),
    clinica: { nombre: c.clinicaNombre || "Mascotita", telefono: c.clinicaTelefono || "", direccion: c.clinicaDireccion || "" },
    activo: true, actualizado: FS.serverTimestamp()
  });
  return token;
}
async function abrirCarnetDigital(mascotaId) {
  const base = urlBasePublica();
  if (!base) { toast("Configurá la dirección pública del sistema (Configuración → Datos de la clínica) para compartir el carnet.", "warn", 7000); return; }
  mostrarLoading(true);
  let token;
  try { token = await actualizarCarnet(mascotaId, true); await cargarLib("qr"); }
  catch (e) { toast(mensajeError(e), "error"); return; } finally { mostrarLoading(false); }
  const url = base + "/carnet.html?t=" + token;
  const qr = qrcode(0, "M"); qr.addData(url); qr.make();
  const m = Datos.mascota(mascotaId) || {}, d = Datos.duenoDe(m) || {};
  const md = abrirModal({
    titulo: "Carnet digital de " + (m.nombre || ""), ancho: "modal-sm",
    cuerpo: '<p class="muted" style="margin-bottom:12px">El dueño abre este enlace en su celular y ve las vacunas al día, sin usuario ni contraseña. Se actualiza solo cuando se registra una vacuna.</p>' +
      '<div style="text-align:center"><img src="' + qr.createDataURL(6, 8) + '" alt="QR del carnet" style="width:220px;height:220px;background:#fff;border-radius:12px;padding:6px"></div>' +
      '<div class="input-con-boton mt"><input class="input" readonly value="' + escHTML(url) + '" id="cd-url"><button class="btn btn-ghost" id="cd-copiar" title="Copiar"><i class="fa-solid fa-copy"></i></button></div>',
    pie: '<button class="btn btn-ghost izq" id="cd-off"><i class="fa-solid fa-link-slash"></i> Desactivar enlace</button>' +
      (d.telefono ? '<button class="btn btn-wa" id="cd-wa"><i class="fa-brands fa-whatsapp"></i> Enviar al dueño</button>' : "") +
      '<a class="btn btn-ghost" href="' + escHTML(url) + '" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> Ver</a>'
  });
  md.q("#cd-copiar").onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Enlace copiado.", "ok"); }, function () { md.q("#cd-url").select(); }); };
  const w = md.q("#cd-wa"); if (w) w.onclick = function () { waPlantilla("carnet", d.telefono, { nombre: String(d.nombre || "").split(" ")[0], mascota: m.nombre, enlace: url }); };
  md.q("#cd-off").onclick = async function () {
    if (!(await confirmar("¿Desactivar el enlace? El dueño ya no podrá verlo (podés generar uno nuevo después)."))) return;
    const b = db.batch(); b.delete(db.collection("carnets").doc(token)); b.update(db.collection("mascotas").doc(mascotaId), { carnetToken: FS.delete() });
    await escribir(b.commit()); md.cerrar(); toast("Enlace desactivado.", "ok");
  };
}
