/* =====================================================================
 * importar.js (solo ADMIN) — Importar datos desde Excel / CSV
 *  - Productos (nombre, codigo, precios, stock, IVA...)
 *  - Clientes y mascotas (una fila por mascota; el dueno se agrupa)
 * Detecta las columnas por su titulo, muestra una vista previa, evita
 * duplicados y escribe en lotes.
 * ===================================================================== */
const MAPEOS = {
  productos: {
    nombre: ["nombre", "producto", "descripcion", "articulo", "item"], codigoBarras: ["codigo de barras", "codigo", "ean", "barcode", "cod barras", "gtin"],
    categoria: ["categoria", "rubro", "tipo", "familia"], marca: ["marca", "laboratorio"], unidad: ["unidad", "presentacion"],
    cantidad: ["stock", "cantidad", "existencia", "inventario"], minimoStock: ["minimo", "stock minimo", "min"],
    precioCompra: ["costo", "precio compra", "precio de compra", "compra"], precioVenta: ["precio venta", "precio de venta", "precio", "pvp", "venta"],
    iva: ["iva", "tasa iva"], proveedor: ["proveedor"], lote: ["lote"], fechaVencimiento: ["vencimiento", "vence", "fecha vencimiento"]
  },
  clientes: {
    nombre: ["dueno", "propietario", "cliente", "nombre dueno", "nombre del dueno", "nombre cliente", "nombre"], telefono: ["telefono", "celular", "whatsapp", "tel", "movil"],
    dni: ["ci", "cedula", "documento", "dni", "c.i."], ruc: ["ruc"], email: ["email", "correo", "mail"], direccion: ["direccion", "domicilio", "barrio"],
    mascota: ["mascota", "paciente", "nombre mascota", "nombre de la mascota"], especie: ["especie", "animal"], raza: ["raza"], sexo: ["sexo"],
    fechaNacimiento: ["nacimiento", "fecha nacimiento", "fecha de nacimiento", "nacio"], peso: ["peso", "peso kg"], color: ["color", "pelaje"], chip: ["chip", "microchip"]
  }
};
const ETQ_CAMPO = { nombre: "Nombre", codigoBarras: "Código", categoria: "Categoría", marca: "Marca", unidad: "Unidad", cantidad: "Stock", minimoStock: "Mínimo", precioCompra: "Costo",
  precioVenta: "Precio venta", iva: "IVA", proveedor: "Proveedor", lote: "Lote", fechaVencimiento: "Vence", telefono: "Teléfono", dni: "CI", ruc: "RUC", email: "Email",
  direccion: "Dirección", mascota: "Mascota", especie: "Especie", raza: "Raza", sexo: "Sexo", fechaNacimiento: "Nacimiento", peso: "Peso", color: "Color", chip: "Chip" };

function detectarColumnas(encabezados, tipo) {
  const map = {}, usados = {};
  const enc = encabezados.map(function (h) { return normalizar(h).replace(/[^a-z0-9. ]/g, " ").replace(/\s+/g, " ").trim(); });
  Object.keys(MAPEOS[tipo]).forEach(function (campo) {
    // Primero coincidencia exacta, despues "contiene"
    const sin = MAPEOS[tipo][campo];
    let i = enc.findIndex(function (h, k) { return !usados[k] && sin.indexOf(h) !== -1; });
    if (i === -1) i = enc.findIndex(function (h, k) { return !usados[k] && sin.some(function (s) { return s.length > 3 && h.indexOf(s) !== -1; }); });
    if (i !== -1) { map[campo] = i; usados[i] = 1; }
  });
  return map;
}
function _numeroExcel(v) {
  if (typeof v === "number") return v;
  const s = String(v || "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  // "1.234.567" o "1.234,5" (formato PY) -> numero
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
function _fechaExcel(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000);
  const m = String(v).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return new Date(a, Number(m[2]) - 1, Number(m[1])); }
  const d = new Date(v); return isNaN(d) ? null : d;
}

function abrirImportar() {
  let tipo = "productos", filas = [], enc = [], map = {};
  const ov = modalForm("Importar desde Excel",
    '<div class="segmentado mb" id="imp-tipo"><button type="button" class="activo" data-t="productos">Productos</button><button type="button" data-t="clientes">Clientes y mascotas</button></div>' +
    '<p class="muted" id="imp-ayuda"></p>' +
    '<div class="fila-flex mt"><input type="file" id="imp-arch" accept=".xlsx,.xls,.csv,.ods"><button type="button" class="btn btn-ghost btn-sm" id="imp-plantilla"><i class="fa-solid fa-download"></i> Descargar planilla de ejemplo</button></div>' +
    '<div id="imp-opc" class="mt"></div><div id="imp-prev" class="mt"></div>', {
      ancho: "modal-xl", textoGuardar: "Importar", icono: "fa-file-import",
      onGuardar: async function () {
        if (!filas.length) throw errorUsuario("Elegí un archivo con datos.");
        if (map.nombre == null) throw errorUsuario("No se encontró la columna de nombre" + (tipo === "clientes" ? " del dueño" : "") + ".");
        requiereConexion("Importar datos");
        const r = tipo === "productos" ? await importarProductos(filas, map, chk("impact")) : await importarClientes(filas, map);
        registrarAuditoria("crear", "importacion", "Importó " + tipo + ": " + JSON.stringify(r));
        toast("Importación lista: " + Object.keys(r).map(function (k) { return r[k] + " " + k; }).join(", ") + ".", "ok", 9000);
      }
    });
  function ayuda() {
    document.getElementById("imp-ayuda").textContent = tipo === "productos"
      ? "Columnas que se reconocen: nombre, código de barras, categoría, marca, stock, mínimo, costo, precio de venta, IVA, proveedor, lote, vencimiento. Los productos que ya existen (mismo código o nombre) no se duplican."
      : "Una fila por mascota. Columnas: dueño, teléfono, CI, RUC, email, dirección, mascota, especie, raza, sexo, nacimiento, peso. Los dueños se agrupan por CI o teléfono y no se duplican.";
    document.getElementById("imp-opc").innerHTML = tipo === "productos" ? checkCampo("impact", "Si el producto ya existe, actualizar sus precios", false) : "";
  }
  ov.el.querySelectorAll("#imp-tipo button").forEach(function (b) {
    b.onclick = function () { tipo = b.dataset.t; ov.el.querySelectorAll("#imp-tipo button").forEach(function (x) { x.classList.toggle("activo", x === b); }); ayuda(); if (enc.length) { map = detectarColumnas(enc, tipo); vista(); } };
  });
  document.getElementById("imp-plantilla").onclick = function () {
    exportarLibro([tipo === "productos"
      ? { nombre: "Productos", datos: [{ a: "Meloxicam 2 mg x 10 comp", b: "7791234567893", c: "Medicamento", d: 20, e: 5, f: 12000, g: 25000, h: 5, i: "Distribuidora Vet" }], columnas: [{ k: "a", t: "Nombre" }, { k: "b", t: "Código de barras" }, { k: "c", t: "Categoría" }, { k: "d", t: "Stock" }, { k: "e", t: "Mínimo" }, { k: "f", t: "Costo" }, { k: "g", t: "Precio venta" }, { k: "h", t: "IVA" }, { k: "i", t: "Proveedor" }] }
      : { nombre: "Clientes", datos: [{ a: "María González", b: "0981 555 111", c: "4567890", d: "Luna", e: "Gato", f: "Siamés", g: "Hembra", h: "10/05/2022" }, { a: "María González", b: "0981 555 111", c: "4567890", d: "Toby", e: "Perro", f: "Mestizo", g: "Macho", h: "" }],
        columnas: [{ k: "a", t: "Dueño" }, { k: "b", t: "Teléfono" }, { k: "c", t: "CI" }, { k: "d", t: "Mascota" }, { k: "e", t: "Especie" }, { k: "f", t: "Raza" }, { k: "g", t: "Sexo" }, { k: "h", t: "Nacimiento" }] }], "planilla_" + tipo);
  };
  document.getElementById("imp-arch").onchange = async function () {
    const f = this.files[0]; if (!f) return;
    try {
      mostrarLoading(true); await cargarLib("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const datos = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: true });
      const ini = datos.findIndex(function (r) { return r.filter(function (c) { return String(c).trim(); }).length >= 2; });
      if (ini === -1) throw errorUsuario("El archivo está vacío.");
      enc = datos[ini].map(String);
      filas = datos.slice(ini + 1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
      map = detectarColumnas(enc, tipo);
      vista();
    } catch (e) { toast(mensajeError(e), "error"); } finally { mostrarLoading(false); }
  };
  function vista() {
    const campos = Object.keys(MAPEOS[tipo]);
    const sel = function (campo) {
      return '<select data-campo="' + campo + '" class="input" style="min-width:120px"><option value="">— no importar —</option>' + enc.map(function (h, i) { return '<option value="' + i + '"' + (map[campo] === i ? " selected" : "") + ">" + escHTML(h || "Columna " + (i + 1)) + "</option>"; }).join("") + "</select>";
    };
    document.getElementById("imp-prev").innerHTML =
      '<div class="alerta alerta-info"><i class="fa-solid fa-table"></i> ' + filas.length + " fila(s) encontradas. Revisá qué columna corresponde a cada dato.</div>" +
      '<div class="grid-4">' + campos.map(function (c) { return '<div class="form-field"><label>' + ETQ_CAMPO[c] + "</label>" + sel(c) + "</div>"; }).join("") + "</div>" +
      '<div class="seccion-form">Vista previa (primeras 8 filas)</div><div class="table-wrap"><table class="tabla"><thead><tr>' +
      campos.filter(function (c) { return map[c] != null; }).map(function (c) { return "<th>" + ETQ_CAMPO[c] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      filas.slice(0, 8).map(function (r) { return "<tr>" + campos.filter(function (c) { return map[c] != null; }).map(function (c) { const v = r[map[c]]; return "<td>" + escHTML(v instanceof Date ? fmtFechaCorta(v) : v) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div>";
    document.querySelectorAll("#imp-prev select[data-campo]").forEach(function (s) {
      s.onchange = function () { if (s.value === "") delete map[s.dataset.campo]; else map[s.dataset.campo] = Number(s.value); vista(); };
    });
  }
  ayuda();
}

async function _commitLotes(ops) {
  for (let i = 0; i < ops.length; i += 200) {
    const b = db.batch();
    ops.slice(i, i + 200).forEach(function (fn) { fn(b); });
    await b.commit();
  }
}
async function importarProductos(filas, map, actualizar) {
  const existentes = docsDe(await db.collection("productos").get()).filter(function (p) { return !p.eliminado; });
  const porCod = {}, porNom = {};
  existentes.forEach(function (p) { if (p.codigoBarras) porCod[p.codigoBarras] = p; porNom[normalizar(p.nombre)] = p; });
  const provs = docsDe(await db.collection("proveedores").get());
  const u = window.MASCOTITA.usuario;
  const ops = []; const r = { nuevos: 0, actualizados: 0, omitidos: 0, "códigos inválidos": 0 };
  const get = function (row, c) { return map[c] != null ? row[map[c]] : ""; };
  filas.forEach(function (row) {
    const nombre = String(get(row, "nombre") || "").trim(); if (!nombre) { r.omitidos++; return; }
    let cod = String(get(row, "codigoBarras") || "").trim().replace(/\.0$/, "");
    const v = validarCodigo(cod);
    if (cod && /^\d+$/.test(cod) && !v.valido) r["códigos inválidos"]++;
    if (v.valido && v.normalizado) cod = v.normalizado;
    const ex = (cod && porCod[cod]) || porNom[normalizar(nombre)];
    const pc = _numeroExcel(get(row, "precioCompra")), pv = _numeroExcel(get(row, "precioVenta"));
    if (ex) {
      if (actualizar && (pc != null || pv != null)) {
        const up = {}; if (pc != null) up.precioCompra = pc; if (pv != null) up.precioVenta = pv;
        ops.push(function (b) { b.update(db.collection("productos").doc(ex.id), up); }); r.actualizados++;
      } else r.omitidos++;
      return;
    }
    const cant = Math.max(0, _numeroExcel(get(row, "cantidad")) || 0), min = Math.max(0, _numeroExcel(get(row, "minimoStock")) || 0);
    let iva = _numeroExcel(get(row, "iva")); if (iva != null && iva < 1) iva = Math.round(iva * 100); iva = [0, 5, 10].indexOf(iva) !== -1 ? iva : 10;
    const provNom = String(get(row, "proveedor") || "").trim(), prov = provs.find(function (p) { return normalizar(p.nombre) === normalizar(provNom); });
    const venc = _fechaExcel(get(row, "fechaVencimiento"));
    const ref = db.collection("productos").doc();
    const d = Object.assign({ nombre: nombre, codigoBarras: cod, categoria: String(get(row, "categoria") || "").trim(), marca: String(get(row, "marca") || "").trim(), unidad: String(get(row, "unidad") || "unidad").trim() || "unidad",
      cantidad: cant, minimoStock: min, stockBajo: cant <= min, precioCompra: pc || 0, precioVenta: pv || 0, iva: iva, proveedorId: prov ? prov.id : "", proveedor: prov ? prov.nombre : provNom,
      lote: String(get(row, "lote") || "").trim(), fechaVencimiento: venc ? TS.fromDate(venc) : null, importado: true }, metaCrear());
    ops.push(function (b) {
      b.set(ref, d);
      if (cant > 0) b.set(db.collection("movimientos_stock").doc(), { productoId: ref.id, producto: nombre, tipo: "entrada", cantidad: cant, cantidadAnterior: 0, cantidadNueva: cant, motivo: "Stock inicial (importación)", origen: "importacion", usuario: u.nombre, usuarioUid: u.uid, fecha: FS.serverTimestamp() });
    });
    if (cod) porCod[cod] = { id: ref.id }; porNom[normalizar(nombre)] = { id: ref.id };
    r.nuevos++;
  });
  await _commitLotes(ops);
  return r;
}
async function importarClientes(filas, map) {
  const duenos = docsDe(await db.collection("propietarios").get()).filter(function (d) { return !d.eliminado; });
  const mascotas = docsDe(await db.collection("mascotas").get()).filter(function (m) { return !m.eliminado; });
  const porCI = {}, porTel = {}, porNom = {};
  duenos.forEach(function (d) { if (d.dni) porCI[String(d.dni).replace(/\D/g, "")] = d; if (d.telefono) porTel[normalizarTelefono(d.telefono)] = d; porNom[normalizar(d.nombre)] = d; });
  const mascDe = {}; mascotas.forEach(function (m) { (mascDe[m.propietarioId] = mascDe[m.propietarioId] || {})[normalizar(m.nombre)] = 1; });
  const ops = []; const r = { "dueños nuevos": 0, "mascotas nuevas": 0, omitidas: 0 };
  let nd = 0, nm = 0;
  const get = function (row, c) { return map[c] != null ? String(row[map[c]] instanceof Date ? "" : row[map[c]] || "").trim() : ""; };
  filas.forEach(function (row) {
    const nombre = get(row, "nombre"); if (!nombre) { r.omitidas++; return; }
    const ci = get(row, "dni").replace(/\D/g, ""), tel = get(row, "telefono");
    let d = (ci && porCI[ci]) || (tel && porTel[normalizarTelefono(tel)]) || porNom[normalizar(nombre)];
    if (!d) {
      const ref = db.collection("propietarios").doc();
      const datos = Object.assign({ nombre: nombre, telefono: tel, dni: ci, ruc: get(row, "ruc"), email: get(row, "email"), direccion: get(row, "direccion"), importado: true }, metaCrear());
      ops.push(function (b) { b.set(ref, datos); });
      d = { id: ref.id }; if (ci) porCI[ci] = d; if (tel) porTel[normalizarTelefono(tel)] = d; porNom[normalizar(nombre)] = d;
      r["dueños nuevos"]++; nd++;
    }
    const mn = get(row, "mascota");
    if (!mn) return;
    if ((mascDe[d.id] || {})[normalizar(mn)]) { r.omitidas++; return; }
    const fn = _fechaExcel(map.fechaNacimiento != null ? row[map.fechaNacimiento] : null);
    const sx = normalizar(get(row, "sexo"));
    const datosM = Object.assign({ nombre: mn, propietarioId: d.id, especie: get(row, "especie"), raza: get(row, "raza"), sexo: /^h|^f/.test(sx) ? "Hembra" : /^m/.test(sx) ? "Macho" : "",
      fechaNacimiento: fn ? TS.fromDate(fn) : null, peso: _numeroExcel(map.peso != null ? row[map.peso] : null), color: get(row, "color"), chip: get(row, "chip"), estadoVital: "activo", importado: true }, metaCrear());
    ops.push(function (b) { b.set(db.collection("mascotas").doc(), datosM); });
    (mascDe[d.id] = mascDe[d.id] || {})[normalizar(mn)] = 1;
    r["mascotas nuevas"]++; nm++;
  });
  ops.push(function (b) { Datos.stat(b, "propietarios", nd); Datos.stat(b, "mascotas", nm); });
  await _commitLotes(ops);
  return r;
}
