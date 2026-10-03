/* =====================================================================
 * stock.js — Inventario en tiempo real
 *  - Productos con IVA, costo, margen, lote, vencimiento, proveedor.
 *  - Codigo de barras VALIDADO (digito verificador) + autocompletar desde
 *    bases publicas + codigos internos para productos sin codigo.
 *  - Lectura de lote/vencimiento de codigos GS1 (cajas de medicamentos).
 *  - Movimientos (entrada / salida / ajuste) SIEMPRE en transaccion.
 *  - Modo inventario: conteo con lector o camara y ajuste de diferencias.
 *  - Etiquetas con codigo de barras y precio (A4 o rollo termico).
 * ===================================================================== */
const CATEGORIAS_PROD = ["Medicamento", "Antiparasitario", "Vacuna", "Alimento", "Alimento suelto", "Snack", "Accesorio", "Juguete", "Higiene", "Insumo clínico", "Otro"];
const UNIDADES = ["unidad", "comprimido", "blíster", "caja", "frasco", "ampolla", "ml", "litro", "kg", "g", "bolsa"];
const MOTIVOS_MOV = { entrada: ["Compra", "Devolución de cliente", "Ajuste de inventario", "Otro"], salida: ["Uso interno / consultorio", "Vencido / descartado", "Rotura", "Devolución a proveedor", "Ajuste de inventario", "Otro"] };
const CONTEO_KEY = "mascotita-conteo";
let _tabStock = "productos", _movs = [], _movUnsub = null, _conteo = {};

async function initStock() {
  await protegerPagina({ permiso: "stock", pagina: "stock.html" });
  const adm = esAdmin();
  _tabStock = paramURL("tab") || "productos";
  try { _conteo = JSON.parse(localStorage.getItem(CONTEO_KEY) || "{}"); } catch (e) { _conteo = {}; }
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-boxes-stacked"></i> Productos y stock</h1><div class="head-actions">' +
    '<button class="btn btn-ghost" id="s-scan" title="Buscar con la cámara"><i class="fa-solid fa-camera"></i> Escanear</button>' +
    '<button class="btn btn-ghost" id="s-etiq"><i class="fa-solid fa-barcode"></i> Etiquetas</button>' +
    (adm ? '<button class="btn btn-ghost" id="s-exp"><i class="fa-solid fa-file-excel"></i> Exportar</button><a class="btn btn-ghost" href="compras.html"><i class="fa-solid fa-truck-field"></i> Cargar compra</a>' +
      '<button class="btn btn-primary" id="s-nuevo"><i class="fa-solid fa-plus"></i> Producto</button>' : "") + "</div></div>" +
    '<div id="scan-zona"></div><div class="chips" id="s-resumen"></div>' +
    '<div class="tabs"><button class="tab" data-t="productos"><i class="fa-solid fa-box"></i> Productos</button><button class="tab" data-t="movimientos"><i class="fa-solid fa-right-left"></i> Movimientos</button>' +
    '<button class="tab" data-t="inventario"><i class="fa-solid fa-clipboard-check"></i> Inventario (conteo)</button></div>' +
    '<div id="s-filtros" class="filtros card"><input type="search" id="s-buscar" placeholder="Nombre, categoría o código de barras...">' +
    '<select id="s-cat"><option value="">Todas las categorías</option>' + CATEGORIAS_PROD.map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select>" +
    '<select id="s-filtro"><option value="">Todos</option><option value="bajo">Stock bajo</option><option value="sin">Sin stock</option><option value="vence">Vencen en 60 días</option><option value="sincodigo">Sin código de barras</option><option value="codmal">Código inválido</option></select></div>' +
    '<div id="s-cuerpo">' + skeleton(8) + "</div>";
  document.getElementById("s-buscar").value = paramQ();
  const f = paramURL("filtro"); if (f) document.getElementById("s-filtro").value = f;
  document.getElementById("s-buscar").oninput = debounce(pintarStock, 150);
  ["s-cat", "s-filtro"].forEach(function (id) { document.getElementById(id).onchange = pintarStock; });
  document.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { _tabStock = t.dataset.t; if (_tabStock === "movimientos") escucharMovs(); pintarStock(); }; });
  document.getElementById("s-scan").onclick = function () { abrirEscaner("scan-zona", procesarEscaneoStock); };
  document.getElementById("s-etiq").onclick = function () { abrirEtiquetas(); };
  if (adm) {
    document.getElementById("s-nuevo").onclick = function () { abrirFormProducto(null); };
    document.getElementById("s-exp").onclick = function () {
      exportarAExcel(Datos.lista("productos"), [{ k: "nombre", t: "Producto" }, { k: "categoria", t: "Categoría" }, { k: "codigoBarras", t: "Código" }, { k: "cantidad", t: "Stock" }, { k: "unidad", t: "Unidad" },
        { k: "minimoStock", t: "Mínimo" }, { k: "precioCompra", t: "Costo" }, { k: "precioVenta", t: "Precio venta" }, { k: "iva", t: "IVA %" }, { k: "lote", t: "Lote" },
        { k: "fechaVencimiento", t: "Vence", f: fmtFechaCorta }, { k: "proveedor", t: "Proveedor" }, { k: "valor", t: "Valor stock (costo)", f: function (v, p) { return (Number(p.cantidad) || 0) * (Number(p.precioCompra) || 0); } }], "inventario");
    };
  }
  // Lector USB fuera de un campo: en la pestana inventario suma al conteo; si no, abre el producto.
  window.alEscanear = procesarEscaneoStock;
  Datos.suscribir("proveedores");
  Datos.suscribir("productos", pintarStock);
  if (paramURL("escaneo") && paramQ()) Datos.listo("productos").then(function () { procesarEscaneoStock(paramQ()); });
  // desde el punto de venta: "cargar producto" con el codigo que no existia
  if (adm && paramURL("nuevo")) Datos.listo("productos").then(function () { abrirFormProducto(null, paramURL("codigo") ? { codigoBarras: paramURL("codigo"), buscar: true } : {}); });
}

async function procesarEscaneoStock(texto) {
  await Datos.listo("productos");
  const e = interpretarEscaneo(texto);
  const v = validarCodigo(e.codigo);
  if (v.tipo && /^\d+$/.test(e.codigo) && !v.valido) { toast("Código " + e.codigo + " inválido: " + v.mensaje, "error", 6000); return; }
  const p = productoPorCodigo(v.normalizado || e.codigo);
  if (_tabStock === "inventario") {
    if (!p) { toast("No hay producto con el código " + e.codigo + ".", "warn"); return; }
    contar(p.id, 1); return;
  }
  if (p) {
    document.getElementById("s-buscar").value = p.nombre; _tabStock = "productos"; pintarStock();
    if (e.gs1 && (e.lote || e.vencimiento)) toast("Leído del código: " + [e.lote && "lote " + e.lote, e.vencimiento && "vence " + fmtFechaCorta(e.vencimiento)].filter(Boolean).join(" · "), "info", 6000);
    abrirMovimiento(p.id);
  } else if (esAdmin()) {
    if (await confirmar("No existe un producto con el código " + e.codigo + ". ¿Crearlo? (se buscan sus datos en internet)", { peligro: false, textoSi: "Crear producto" }))
      abrirFormProducto(null, { codigoBarras: v.normalizado || e.codigo, lote: e.lote, fechaVencimiento: e.vencimiento, buscar: true });
  } else toast("Código " + e.codigo + " no encontrado.", "warn");
}

function filtrarProductos() {
  const q = document.getElementById("s-buscar").value, cat = document.getElementById("s-cat").value, f = document.getElementById("s-filtro").value;
  const lim = sumarDias(new Date(), 60);
  return Datos.lista("productos").filter(function (p) {
    const cant = Number(p.cantidad) || 0;
    if (f === "bajo" && !(cant <= (Number(p.minimoStock) || 0))) return false;
    if (f === "sin" && cant > 0) return false;
    if (f === "vence" && !(p.fechaVencimiento && aFecha(p.fechaVencimiento) <= lim && cant > 0)) return false;
    if (f === "sincodigo" && p.codigoBarras) return false;
    if (f === "codmal" && (!p.codigoBarras || validarCodigo(p.codigoBarras).valido)) return false;
    return (!cat || normalizar(p.categoria) === normalizar(cat)) && coincide([p.nombre, p.marca, p.categoria, p.codigoBarras, p.proveedor, p.principioActivo, (p.codigosAlternos || []).join(" "), (p.presentaciones || []).map(function (x) { return x.codigo + " " + x.nombre; }).join(" ")].join(" "), q);
  });
}
function pintarStock() {
  document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("activo", t.dataset.t === _tabStock); });
  document.getElementById("s-filtros").hidden = _tabStock !== "productos";
  const ps = Datos.lista("productos"), adm = esAdmin();
  const bajos = ps.filter(function (p) { return (Number(p.cantidad) || 0) <= (Number(p.minimoStock) || 0); }).length;
  const malos = ps.filter(function (p) { return p.codigoBarras && !validarCodigo(p.codigoBarras).valido; }).length;
  const valor = ps.reduce(function (a, p) { return a + Math.max(0, Number(p.cantidad) || 0) * (Number(p.precioCompra) || 0); }, 0);
  document.getElementById("s-resumen").innerHTML = '<div class="chip-resumen"><small>Productos</small><b>' + ps.length + '</b></div><div class="chip-resumen"><small>Stock bajo</small><b class="' + (bajos ? "texto-warn" : "") + '">' + bajos + "</b></div>" +
    (malos ? '<a class="chip-resumen" href="stock.html?filtro=codmal"><small>Códigos inválidos</small><b class="texto-danger">' + malos + "</b></a>" : "") +
    (adm ? '<div class="chip-resumen"><small>Valor del inventario (costo)</small><b>' + fmtMoneda(valor) + "</b></div>" : "");
  const cont = document.getElementById("s-cuerpo");
  if (_tabStock === "movimientos") return pintarMovs(cont);
  if (_tabStock === "inventario") return pintarConteo(cont);
  const hoy = inicioDelDia(), lim = sumarDias(hoy, 60);
  const cols = [
    { k: "nombre", t: "Producto", r: function (p) {
      const v = p.codigoBarras ? validarCodigo(p.codigoBarras) : null;
      return '<div class="celda-m">' + (p.imagenURL ? '<img class="avatar-m sm" style="border-radius:8px;object-fit:contain;background:#fff" src="' + escHTML(p.imagenURL) + '" alt="" loading="lazy">' : '<span class="avatar-m ph sm" style="border-radius:8px"><i class="fa-solid fa-box"></i></span>') +
        "<div><b>" + escHTML(p.nombre) + "</b>" + (precioVigente(p).oferta ? ' <span class="pill pill-ok">Oferta ' + fmtMoneda(p.precioOferta) + "</span>" : "") +
        (p.controlado ? ' <span class="pill pill-danger">Controlado</span>' : p.requiereReceta ? ' <span class="pill pill-warn">Receta</span>' : "") + (p.fraccionable ? ' <span class="pill pill-info">Suelto</span>' : "") +
        ((p.presentaciones || []).length ? ' <span class="pill pill-neutral" title="' + escHTML(p.presentaciones.map(function (x) { return x.nombre; }).join(", ")) + '">' + p.presentaciones.length + " presentación(es)</span>" : "") +
        "<br><small>" + escHTML([p.marca, p.categoria, p.principioActivo].filter(Boolean).join(" · ")) +
        (p.codigoBarras ? ' · <span class="' + (v.valido ? "" : "texto-danger") + '" title="' + escHTML(v.mensaje) + '">' + (v.valido ? "" : '<i class="fa-solid fa-triangle-exclamation"></i> ') + escHTML(p.codigoBarras) + "</span>" : "") + "</small></div></div>";
    } },
    { k: "cantidad", t: "Stock", cls: "num", v: function (p) { return Number(p.cantidad) || 0; }, r: function (p) {
      const c = Number(p.cantidad) || 0, bajo = c <= (Number(p.minimoStock) || 0);
      return '<b class="' + (c <= 0 ? "texto-danger" : bajo ? "texto-warn" : "") + '">' + fmtNum(c) + "</b> <small>" + escHTML(p.unidad || "") + "</small>" + (bajo ? "<br><small>mín. " + fmtNum(p.minimoStock || 0) + "</small>" : "");
    } },
    { k: "precioVenta", t: "Precio", cls: "num", r: function (p) { return fmtMoneda(p.precioVenta) + '<br><small>IVA ' + (p.iva === 0 ? "exenta" : (p.iva || 10) + "%") + "</small>"; } }
  ];
  if (adm) cols.push({ k: "margen", t: "Margen", cls: "num", v: function (p) { return p.precioCompra ? (p.precioVenta - p.precioCompra) / p.precioCompra : -1; }, r: function (p) {
    if (!p.precioCompra) return "—";
    const m = Math.round(((p.precioVenta || 0) - p.precioCompra) / p.precioCompra * 100);
    return '<span class="' + (m < 15 ? "texto-danger" : "") + '">' + m + "%</span><br><small>costo " + fmtMoneda(p.precioCompra) + "</small>";
  } });
  cols.push({ k: "fechaVencimiento", t: "Vence", v: function (p) { return aFecha(p.fechaVencimiento); }, r: function (p) {
    if (!p.fechaVencimiento) return "—";
    const d = aFecha(p.fechaVencimiento);
    return fmtFechaCorta(d) + (d < hoy ? " " + pill("Vencido", "danger") : d <= lim ? " " + pill("Pronto", "warn") : "") + (p.lote ? "<br><small>lote " + escHTML(p.lote) + "</small>" : "");
  } });
  cols.push({ k: "proveedor", t: "Proveedor", r: function (p) { const pr = Datos.porId("proveedores", p.proveedorId); return escHTML(pr ? pr.nombre : p.proveedor || ""); } });
  cols.push({ k: "a", t: "", sort: false, cls: "acciones", r: function (p) {
    return btnIcono("fa-right-left", "Movimiento de stock", "abrirMovimiento('" + p.id + "')") + btnIcono("fa-clock-rotate-left", "Historial", "verMovsProducto('" + p.id + "')") +
      (adm ? btnIcono("fa-pen", "Editar", "abrirFormProducto('" + p.id + "')") + btnIcono("fa-trash", "Eliminar", "eliminarProducto('" + p.id + "')", "danger") : "");
  } });
  tabla(cont, { filas: filtrarProductos(), columnas: cols, orden: "nombre", vacio: ps.length ? "Ningún producto coincide con el filtro." : "Todavía no hay productos.", vacioIcono: "fa-box",
    claseFila: function (p) { return (Number(p.cantidad) || 0) <= (Number(p.minimoStock) || 0) ? "fila-alerta" : ""; } });
}

/* ---------- Producto (solo ADMIN) ---------- */
function abrirFormProducto(id, pre) {
  pre = pre || {};
  const p = id ? Datos.porId("productos", id) || {} : Object.assign({ iva: 10, unidad: "unidad" }, pre);
  const provs = Datos.lista("proveedores").map(function (x) { return { value: x.id, texto: x.nombre }; });
  const ov = modalForm((id ? "Editar" : "Nuevo") + " producto",
    '<div class="seccion-form"><i class="fa-solid fa-barcode"></i> Código de barras</div>' +
    '<div class="form-field"><div class="input-con-boton"><input id="f-pcod" value="' + escHTML(p.codigoBarras || "") + '" placeholder="Escaneá con el lector o escribí el número" inputmode="numeric" autocomplete="off">' +
    '<button type="button" class="btn btn-ghost" id="p-scan" title="Escanear con la cámara"><i class="fa-solid fa-camera"></i></button>' +
    '<button type="button" class="btn btn-ghost" id="p-buscar" title="Buscar datos del producto en internet"><i class="fa-solid fa-cloud-arrow-down"></i> Buscar datos</button>' +
    '<button type="button" class="btn btn-ghost" id="p-gen" title="Generar un código interno para productos sin código"><i class="fa-solid fa-wand-magic-sparkles"></i></button></div><div id="p-info"></div></div>' +
    '<div id="scan-prod"></div>' +
    '<div class="seccion-form"><i class="fa-solid fa-box"></i> Datos</div>' +
    '<div class="grid-2">' +
    campo("pnombre", "Nombre", p.nombre, "text", { req: true }) + campo("pmarca", "Marca", p.marca) +
    campo("pcat", "Categoría", p.categoria, "text", { lista: "dl-cat" }) +
    selectCampo("punidad", "Unidad", UNIDADES, p.unidad || "unidad") +
    (id ? '<div class="form-field"><label>Stock actual</label><input readonly value="' + fmtNum(p.cantidad) + '"><small class="hint">Para cambiarlo usá "Movimiento" (queda registrado).</small></div>'
      : campo("pcant", "Stock inicial", "0", "number", { min: 0 })) +
    campo("pmin", "Stock mínimo (alerta)", p.minimoStock || 0, "number", { min: 0 }) +
    campo("pcompra", "Costo (precio de compra)", p.precioCompra || "", "number", { min: 0 }) +
    campo("pventa", "Precio de venta (IVA incluido)", p.precioVenta || "", "number", { min: 0, req: true }) +
    selectCampo("piva", "IVA", IVA_OPCIONES, String(p.iva != null ? p.iva : 10)) +
    '<div class="form-field"><label>Margen</label><input id="f-pmargen" readonly></div>' +
    campo("pvenc", "Vencimiento", fechaInput(p.fechaVencimiento), "date") + campo("plote", "Lote", p.lote) +
    selectCampo("pprov", "Proveedor", provs, p.proveedorId, { vacio: provs.length ? "—" : "Cargá proveedores en Compras" }) +
    campo("pubic", "Ubicación (estante)", p.ubicacion) +
    '<div class="seccion-form full"><i class="fa-solid fa-cash-register"></i> Venta en mostrador y farmacia</div>' +
    campo("pof", "Precio de oferta", p.precioOferta || "", "number", { min: 0, ayuda: "Vacío = sin oferta" }) + campo("pofh", "Oferta hasta", fechaInput(p.ofertaHasta), "date") +
    campo("pplu", "PLU de balanza", p.plu || "", "text", { ph: "Ej: 125", ayuda: "Para alimento suelto pesado en la balanza" }) + campo("pactivo", "Principio activo / droga", p.principioActivo || "", "text", { ph: "Ej: Meloxicam" }) +
    '<div class="form-field full">' + checkCampo("pfrac", "Se vende suelto / fraccionado (pide cantidad con decimales, ej: 0,750 kg)", p.fraccionable) + "<br>" +
    checkCampo("preceta", "Venta bajo receta (pide N° de receta al vender)", p.requiereReceta) + "<br>" + checkCampo("pcontrol", "Medicamento controlado (psicotrópico / estupefaciente)", p.controlado) + "</div>" +
    campo("palt", "Otros códigos de barras del mismo producto", (p.codigosAlternos || []).join(", "), "text", { full: true, ph: "Separados por coma (ej: otro proveedor, código viejo)" }) +
    '<div class="form-field full"><label>Presentaciones con su propio código <small class="muted">(ej: caja x10 de un producto que se vende por comprimido)</small></label><div class="lineas" id="p-pres"></div>' +
    '<button type="button" class="btn btn-ghost btn-sm mt" id="p-pres-add"><i class="fa-solid fa-plus"></i> Agregar presentación</button></div>' +
    '<div class="form-field full"><label for="f-pimg">Imagen (URL)</label><div class="input-con-boton"><input id="f-pimg" type="url" value="' + escHTML(p.imagenURL || "") + '"><img id="p-img-prev" class="avatar-m" style="border-radius:8px;object-fit:contain;background:#fff' + (p.imagenURL ? "" : ";display:none") + '" src="' + escHTML(p.imagenURL || "") + '" alt=""></div></div>' +
    "</div>" + datalist("dl-cat", CATEGORIAS_PROD), {
      ancho: "modal-lg", antesDeCerrar: function () { detenerScanner(); },
      onGuardar: async function () {
        const pv = Datos.porId("proveedores", val("pprov"));
        const cod = val("pcod");
        const vc = validarCodigo(cod);
        if (cod && /^\d+$/.test(cod) && !vc.valido && !(await confirmar("El código " + cod + " no pasa la verificación (" + vc.mensaje + "). ¿Guardarlo igual?", { peligro: false }))) return false;
        const datos = {
          nombre: val("pnombre"), marca: val("pmarca"), categoria: val("pcat"), codigoBarras: vc.valido && vc.normalizado ? vc.normalizado : cod, unidad: val("punidad"),
          minimoStock: num("pmin"), precioCompra: num("pcompra"), precioVenta: num("pventa"), iva: Number(val("piva")),
          fechaVencimiento: tsDeInput(val("pvenc")), lote: val("plote"), proveedorId: pv ? pv.id : "", proveedor: pv ? pv.nombre : (p.proveedor || ""),
          ubicacion: val("pubic"), imagenURL: val("pimg"),
          precioOferta: num("pof") || 0, ofertaHasta: tsDeInput(val("pofh")), plu: val("pplu").replace(/\D/g, ""), principioActivo: val("pactivo"),
          fraccionable: chk("pfrac"), requiereReceta: chk("preceta") || chk("pcontrol"), controlado: chk("pcontrol"),
          codigosAlternos: val("palt").split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean),
          presentaciones: leerPresentaciones()
        };
        if (datos.precioOferta && datos.precioOferta >= datos.precioVenta) throw errorUsuario("El precio de oferta tiene que ser menor al precio de venta.");
        const propios = [datos.codigoBarras].concat(datos.codigosAlternos, datos.presentaciones.map(function (x) { return x.codigo; })).filter(Boolean);
        if (new Set(propios).size !== propios.length) throw errorUsuario("Hay códigos repetidos dentro del mismo producto.");
        for (let k = 0; k < propios.length; k++) {
          const r = resolverCodigo(propios[k]);
          if (r && r.producto.id !== id) throw errorUsuario("El código " + propios[k] + " ya lo usa \"" + r.producto.nombre + "\".");
        }
        if (datos.plu) {
          const dp = Datos.lista("productos").find(function (x) { return x.id !== id && x.plu && String(Number(x.plu)) === String(Number(datos.plu)); });
          if (dp) throw errorUsuario("El PLU " + datos.plu + " ya lo usa \"" + dp.nombre + "\".");
        }
        if (datos.precioCompra && datos.precioVenta < datos.precioCompra && !(await confirmar("El precio de venta es menor al costo. ¿Guardar igual?", { peligro: false }))) return false;
        if (id) {
          datos.stockBajo = (Number(p.cantidad) || 0) <= datos.minimoStock;
          await actualizarDoc("productos", id, datos);
        } else {
          const ini = num("pcant");
          datos.cantidad = ini; datos.stockBajo = ini <= datos.minimoStock;
          const b = db.batch();
          const nid = await crearDoc("productos", datos, b);
          if (ini > 0) b.set(db.collection("movimientos_stock").doc(), { productoId: nid, producto: datos.nombre, tipo: "entrada", cantidad: ini, cantidadAnterior: 0, cantidadNueva: ini, motivo: "Stock inicial", origen: "alta", usuario: window.MASCOTITA.usuario.nombre, usuarioUid: window.MASCOTITA.usuario.uid, fecha: FS.serverTimestamp() });
          await escribir(b.commit());
        }
        registrarAuditoria(id ? "editar" : "crear", "stock", (id ? "Editó" : "Creó") + " producto " + datos.nombre + " (" + fmtMoneda(datos.precioVenta) + ")");
        toast("Producto guardado.", "ok");
      }
    });
  // ---- presentaciones ----
  const presC = document.getElementById("p-pres");
  function lineaPres(x) {
    x = x || {};
    return '<div class="linea" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1.4fr) 90px 130px 34px"><input class="pr-nom" placeholder="Nombre (ej: Caja x10)" value="' + escHTML(x.nombre || "") + '">' +
      '<input class="pr-cod" placeholder="Código de barras" inputmode="numeric" value="' + escHTML(x.codigo || "") + '"><input class="pr-fac" type="number" min="1" step="any" title="Unidades de stock que contiene" placeholder="Contiene" value="' + escHTML(x.factor || "") + '">' +
      '<input class="pr-pre" type="number" min="0" placeholder="Precio" value="' + escHTML(x.precio || "") + '"><button type="button" class="btn-icono danger pr-del"><i class="fa-solid fa-trash"></i></button></div>';
  }
  function engPres() { presC.querySelectorAll(".pr-del").forEach(function (b) { b.onclick = function () { b.closest(".linea").remove(); }; }); }
  presC.innerHTML = (p.presentaciones || []).map(lineaPres).join("");
  document.getElementById("p-pres-add").onclick = function () { presC.insertAdjacentHTML("beforeend", lineaPres()); engPres(); presC.lastElementChild.querySelector(".pr-nom").focus(); };
  engPres();
  function leerPresentaciones() {
    return Array.from(presC.querySelectorAll(".linea")).map(function (l) {
      return { nombre: l.querySelector(".pr-nom").value.trim(), codigo: l.querySelector(".pr-cod").value.trim(), factor: Number(l.querySelector(".pr-fac").value) || 1, precio: Math.round(Number(l.querySelector(".pr-pre").value) || 0) };
    }).filter(function (x) { return x.nombre || x.codigo; }).map(function (x) {
      if (!x.nombre) throw errorUsuario("Poné nombre a cada presentación.");
      if (!(x.factor > 0)) throw errorUsuario("Indicá cuántas unidades trae \"" + x.nombre + "\".");
      return x;
    });
  }
  if (el("pcant")) el("pcant").step = "any";
  function margen() { const c = num("pcompra"), v = num("pventa"); el("pmargen").value = c ? Math.round((v - c) / c * 100) + "% · ganancia " + fmtMoneda(v - c) : "—"; }
  el("pcompra").oninput = margen; el("pventa").oninput = margen; margen();
  const info = document.getElementById("p-info");
  function pintarInfo() { info.innerHTML = htmlValidacionCodigo(val("pcod")); }
  el("pcod").addEventListener("input", pintarInfo);
  // Enter en el campo (lector USB) => validar y buscar datos si el producto es nuevo.
  el("pcod").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault(); e.stopPropagation();
    const r = interpretarEscaneo(val("pcod"));
    aplicarEscaneo(r);
  });
  function aplicarEscaneo(r) {
    el("pcod").value = r.codigo;
    if (r.lote) el("plote").value = r.lote;
    if (r.vencimiento) el("pvenc").value = fechaInput(r.vencimiento);
    pintarInfo();
    if (r.gs1) toast("Código GS1: se cargaron " + [r.lote && "lote", r.vencimiento && "vencimiento"].filter(Boolean).join(" y ") + ".", "ok");
    if (!val("pnombre") && validarCodigo(r.codigo).valido) buscarDatos();
  }
  el("pimg").addEventListener("input", function () { const i = document.getElementById("p-img-prev"); i.src = val("pimg"); i.style.display = val("pimg") ? "" : "none"; });
  async function buscarDatos() {
    const b = document.getElementById("p-buscar");
    await conBoton(b, async function () {
      const cod = val("pcod");
      if (!cod) throw errorUsuario("Primero escaneá o escribí el código.");
      const r = await buscarProductoPorCodigo(cod);
      if (!r.encontrado) { info.innerHTML = htmlValidacionCodigo(cod) + '<small class="hint texto-warn"><i class="fa-solid fa-circle-info"></i> ' + escHTML(r.motivo || "Sin datos.") + "</small>"; return; }
      if (!val("pnombre") || await confirmar("Encontrado en " + r.fuente + ": \"" + r.nombre + "\". ¿Reemplazar el nombre actual?", { peligro: false, textoSi: "Usar estos datos" })) {
        el("pnombre").value = r.nombre;
        if (r.marca) el("pmarca").value = r.marca;
        if (r.categoria && !val("pcat")) el("pcat").value = r.categoria;
        if (r.imagen) { el("pimg").value = r.imagen; el("pimg").dispatchEvent(new Event("input")); }
      }
      info.innerHTML = htmlValidacionCodigo(cod) + '<small class="hint texto-ok"><i class="fa-solid fa-cloud"></i> Datos de ' + escHTML(r.fuente) + (r.cache ? " (guardados)" : "") + "</small>";
    });
  }
  document.getElementById("p-buscar").onclick = buscarDatos;
  document.getElementById("p-gen").onclick = function () {
    conBoton(this, async function () {
      if (val("pcod") && !(await confirmar("Ya tiene un código. ¿Reemplazarlo por uno interno nuevo?", { peligro: false }))) return;
      el("pcod").value = await generarCodigoInterno(); pintarInfo();
      toast("Código interno generado. Imprimí la etiqueta desde \"Etiquetas\".", "ok");
    });
  };
  document.getElementById("p-scan").onclick = function () { abrirEscaner("scan-prod", function (c) { aplicarEscaneo(interpretarEscaneo(c)); }); };
  pintarInfo();
  if (pre.buscar) setTimeout(buscarDatos, 100);
  return ov;
}
async function eliminarProducto(id) {
  const p = Datos.porId("productos", id);
  if (await confirmar("¿Enviar \"" + p.nombre + "\" a la papelera?")) await Datos.aPapelera("productos", id, p);
}

/* ---------- Movimiento (todos los roles con stock) ---------- */
function abrirMovimiento(id) {
  const p = Datos.porId("productos", id); if (!p) return;
  const ov = modalForm("Movimiento · " + p.nombre,
    '<div class="chips"><div class="chip-resumen"><small>Stock actual</small><b>' + fmtNum(p.cantidad) + " " + escHTML(p.unidad || "") + "</b></div></div>" +
    '<div class="segmentado mb" id="mv-tipo"><button type="button" class="activo" data-t="salida">Salida</button><button type="button" data-t="entrada">Entrada</button><button type="button" data-t="ajuste">Ajuste (conteo)</button></div>' +
    '<div class="grid-2">' + campo("mcant", "Cantidad", "", "number", { min: 0, req: true }) + selectCampo("mmot", "Motivo", MOTIVOS_MOV.salida) + "</div>" +
    campo("mdet", "Detalle (opcional)", "", "text", { ph: "Ej: paciente, N° de remito..." }), {
      ancho: "modal-sm", textoGuardar: "Registrar",
      onGuardar: async function () {
        const cant = num("mcant");
        if (tipo !== "ajuste" && cant <= 0) throw errorUsuario("La cantidad debe ser mayor a 0.");
        if (tipo === "ajuste" && cant < 0) throw errorUsuario("El conteo no puede ser negativo.");
        const motivo = (tipo === "ajuste" ? "Ajuste por conteo" : val("mmot")) + (val("mdet") ? " · " + val("mdet") : "");
        requiereConexion("Mover stock");
        let delta, nuevo;
        await db.runTransaction(async function (tx) {
          const inv = await Inventario.leer(tx, [id]);
          const actual = Number(inv[id].cantidad) || 0;
          delta = tipo === "entrada" ? cant : tipo === "salida" ? -cant : cant - actual;
          if (!delta) throw errorUsuario("El conteo coincide con el stock: no hay nada que ajustar.");
          nuevo = Inventario.mover(tx, inv, [{ productoId: id, delta: delta, motivo: motivo }], { origen: tipo === "ajuste" ? "ajuste" : "manual" })[id];
        });
        registrarAuditoria(delta > 0 ? "entrada_stock" : "salida_stock", "stock", (delta > 0 ? "+" : "") + fmtNum(delta) + " " + p.nombre + " (" + motivo + ")");
        toast("Stock de " + p.nombre + ": " + fmtNum(nuevo), "ok");
        if (nuevo <= (Number(p.minimoStock) || 0)) notificarStockBajo(Object.assign({}, p, { cantidad: nuevo }));
      }
    });
  let tipo = "salida";
  ov.el.querySelectorAll("#mv-tipo button").forEach(function (b) {
    b.onclick = function () {
      tipo = b.dataset.t;
      ov.el.querySelectorAll("#mv-tipo button").forEach(function (x) { x.classList.toggle("activo", x === b); });
      el("mmot").closest(".form-field").hidden = tipo === "ajuste";
      el("mcant").closest(".form-field").querySelector("label").innerHTML = tipo === "ajuste" ? "Cantidad contada (real)" : "Cantidad";
      if (tipo !== "ajuste") el("mmot").innerHTML = MOTIVOS_MOV[tipo].map(function (m) { return "<option>" + m + "</option>"; }).join("");
    };
  });
}

/* ---------- Modo inventario (conteo fisico) ----------
 * El conteo se guarda en este equipo mientras se hace (no se pierde si se
 * recarga). Al terminar, "Aplicar ajustes" registra un movimiento por
 * cada diferencia. */
function guardarConteo() { try { localStorage.setItem(CONTEO_KEY, JSON.stringify(_conteo)); } catch (e) {} }
function contar(pid, delta, absoluto) {
  const p = Datos.porId("productos", pid); if (!p) return;
  _conteo[pid] = absoluto != null ? Math.max(0, absoluto) : Math.max(0, (_conteo[pid] || 0) + delta);
  guardarConteo();
  if (delta > 0 && absoluto == null) {
    toast(p.nombre + ": " + fmtNum(_conteo[pid]), "ok", 1500);
    try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.07); } catch (e) {}
  }
  if (_tabStock === "inventario") pintarStock();
}
function pintarConteo(cont) {
  const ids = Object.keys(_conteo).filter(function (id) { return Datos.porId("productos", id); });
  const filas = ids.map(function (id) { const p = Datos.porId("productos", id); return { id: id, p: p, contado: _conteo[id], sistema: Number(p.cantidad) || 0 }; });
  const difs = filas.filter(function (f) { return f.contado !== f.sistema; });
  if (!cont.querySelector("#cv-entrada")) {
    cont.innerHTML = '<div class="card"><h3><i class="fa-solid fa-clipboard-check"></i> Conteo de inventario</h3>' +
      '<p class="muted">Escaneá cada unidad con el lector (o la cámara): cada lectura suma 1. También podés buscar el producto y escribir la cantidad.</p>' +
      '<div class="agregar-linea"><div id="cv-sel"></div><input id="cv-entrada" class="input" style="max-width:220px" placeholder="Código (lector USB) + Enter" autocomplete="off" inputmode="numeric">' +
      '<button class="btn btn-ghost" id="cv-cam"><i class="fa-solid fa-camera"></i> Cámara continua</button></div><div id="cv-scan"></div></div>' +
      '<div class="chips mt" id="cv-res"></div><div id="cv-tabla"></div>' +
      '<div class="fila-flex mt"><button class="btn btn-primary" id="cv-aplicar"><i class="fa-solid fa-check-double"></i> Aplicar ajustes</button><button class="btn btn-ghost" id="cv-faltan"><i class="fa-solid fa-list-check"></i> Ver no contados</button>' +
      '<span class="espaciador"></span><button class="btn btn-ghost" id="cv-borrar"><i class="fa-solid fa-eraser"></i> Empezar de nuevo</button></div>';
    const sel = selector("cv-sel", { items: function () { return Datos.lista("productos"); }, texto: function (p) { return p.nombre; }, sub: function (p) { return "Sistema: " + fmtNum(p.cantidad) + (p.codigoBarras ? " · " + p.codigoBarras : ""); },
      buscar: function (p) { return p.nombre + " " + (p.codigoBarras || ""); }, placeholder: "Buscar producto para contar...",
      onChange: function (p) { if (!p) return; setTimeout(function () { sel.set(null); }, 0); pedirCantidad(p); } });
    const inp = cont.querySelector("#cv-entrada");
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); const v = inp.value.trim(); inp.value = ""; if (v) procesarEscaneoStock(v); } });
    cont.querySelector("#cv-cam").onclick = function () { escaneoContinuo(); };
    cont.querySelector("#cv-borrar").onclick = async function () { if (await confirmar("¿Borrar todo el conteo en curso?")) { _conteo = {}; guardarConteo(); pintarStock(); } };
    cont.querySelector("#cv-aplicar").onclick = function () { conBoton(this, aplicarConteo); };
    cont.querySelector("#cv-faltan").onclick = function () {
      const falt = Datos.lista("productos").filter(function (p) { return _conteo[p.id] == null; });
      abrirModal({ titulo: "Productos sin contar (" + falt.length + ")", ancho: "modal-lg", cuerpo: falt.length ? '<ul class="lista">' + falt.map(function (p) { return '<li><div class="info"><b>' + escHTML(p.nombre) + "</b><small>Sistema: " + fmtNum(p.cantidad) + "</small></div><button class=\"btn btn-ghost btn-sm\" onclick=\"cerrarModales();pedirCantidad(Datos.porId('productos','" + p.id + "'))\">Contar</button></li>"; }).join("") + "</ul>" : vacio("Todos contados.", "fa-circle-check") });
    };
    setTimeout(function () { inp.focus(); }, 50);
  }
  cont.querySelector("#cv-res").innerHTML = '<div class="chip-resumen"><small>Productos contados</small><b>' + filas.length + " / " + Datos.lista("productos").length + '</b></div><div class="chip-resumen"><small>Con diferencia</small><b class="' + (difs.length ? "texto-warn" : "texto-ok") + '">' + difs.length + "</b></div>";
  tabla(cont.querySelector("#cv-tabla"), {
    filas: filas, orden: "dif", dir: -1, vacio: "Todavía no contaste nada. Escaneá un producto para empezar.", vacioIcono: "fa-barcode",
    columnas: [
      { k: "nombre", t: "Producto", v: function (f) { return f.p.nombre; }, r: function (f) { return "<b>" + escHTML(f.p.nombre) + "</b>" + (f.p.codigoBarras ? "<br><small>" + escHTML(f.p.codigoBarras) + "</small>" : ""); } },
      { k: "sistema", t: "Sistema", cls: "num", r: function (f) { return fmtNum(f.sistema); } },
      { k: "contado", t: "Contado", cls: "num", r: function (f) { return '<input type="number" min="0" step="any" class="input" style="width:90px;text-align:right" value="' + f.contado + "\" onchange=\"contar('" + f.id + "',0,Number(this.value)||0)\">"; } },
      { k: "dif", t: "Diferencia", cls: "num", v: function (f) { return Math.abs(f.contado - f.sistema); }, r: function (f) { const d = f.contado - f.sistema; return d ? '<b class="' + (d < 0 ? "texto-danger" : "texto-warn") + '">' + (d > 0 ? "+" : "") + fmtNum(d) + "</b>" : '<span class="texto-ok">✓</span>'; } },
      { k: "a", t: "", sort: false, cls: "acciones", r: function (f) { return btnIcono("fa-xmark", "Quitar del conteo", "contar('" + f.id + "',0,null);delete _conteo['" + f.id + "'];guardarConteo();pintarStock()"); } }
    ]
  });
}
function pedirCantidad(p) {
  modalForm("Contar · " + p.nombre, '<p class="muted" style="margin:0 0 10px">Sistema: ' + fmtNum(p.cantidad) + " " + escHTML(p.unidad || "") + "</p>" + campo("ccant", "Cantidad contada", _conteo[p.id] != null ? _conteo[p.id] : "", "number", { min: 0, req: true }), {
    ancho: "modal-sm", textoGuardar: "Listo", onGuardar: function () { contar(p.id, 0, num("ccant")); }
  });
}
async function escaneoContinuo() {
  const zona = document.getElementById("cv-scan");
  if (zona.innerHTML) { detenerScanner(); zona.innerHTML = ""; return; }
  let ultimo = "", t = 0;
  await abrirEscanerContinuo("cv-scan", function (c) {
    const ahora = Date.now();
    if (c === ultimo && ahora - t < 1500) return;      // evitar contar dos veces la misma lectura
    ultimo = c; t = ahora; procesarEscaneoStock(c);
  });
}
async function aplicarConteo() {
  const difs = Object.keys(_conteo).map(function (id) { const p = Datos.porId("productos", id); return p ? { id: id, p: p, d: _conteo[id] - (Number(p.cantidad) || 0) } : null; }).filter(function (x) { return x && x.d; });
  if (!difs.length) { toast("No hay diferencias para ajustar.", "info"); return; }
  if (!(await confirmar("Se registrarán " + difs.length + " ajuste(s) de stock según el conteo. ¿Continuar?", { peligro: false, textoSi: "Aplicar" }))) return;
  requiereConexion("Aplicar el conteo");
  for (let i = 0; i < difs.length; i += 20) {
    const grupo = difs.slice(i, i + 20);
    await db.runTransaction(async function (tx) {
      const inv = await Inventario.leer(tx, grupo.map(function (x) { return x.id; }));
      Inventario.mover(tx, inv, grupo.map(function (x) { return { productoId: x.id, delta: _conteo[x.id] - (Number(inv[x.id].cantidad) || 0), motivo: "Inventario (conteo físico)" }; }).filter(function (l) { return l.delta; }), { origen: "inventario", permitirNegativo: true });
    });
  }
  registrarAuditoria("editar", "stock", "Aplicó inventario físico: " + difs.length + " ajustes");
  _conteo = {}; guardarConteo();
  toast("Inventario aplicado: " + difs.length + " ajuste(s).", "ok");
  pintarStock();
}

/* ---------- Etiquetas ---------- */
function abrirEtiquetas() {
  let lista = [];
  const filtrados = filtrarProductos().filter(function (p) { return p.codigoBarras; });
  const ov = modalForm("Imprimir etiquetas",
    '<div class="grid-2">' + selectCampo("efmt", "Formato", Object.keys(FORMATOS_ETIQUETA).map(function (k) { return { value: k, texto: FORMATOS_ETIQUETA[k].nombre }; }), "a4-24") +
    '<div class="form-field">' + checkCampo("eprecio", "Mostrar precio", true) + "<br>" + checkCampo("eclin", "Mostrar nombre de la clínica", true) + "</div></div>" +
    '<div class="agregar-linea"><div id="e-sel"></div>' + (filtrados.length ? '<button type="button" class="btn btn-ghost" id="e-todos">Agregar los ' + filtrados.length + " de la lista</button>" : "") + "</div>" +
    '<div class="lineas mt" id="e-lista"></div><small class="hint">Los productos sin código no se pueden etiquetar: generales uno interno desde su ficha (botón ✨).</small>', {
      ancho: "modal-lg", textoGuardar: "Generar PDF", icono: "fa-print",
      onGuardar: async function () {
        if (!lista.length) throw errorUsuario("Agregá al menos un producto.");
        await pdfEtiquetas(lista, val("efmt"), { precio: chk("eprecio"), clinica: chk("eclin") });
        return false;
      }
    });
  function pintar() {
    const c = document.getElementById("e-lista");
    c.innerHTML = lista.length ? lista.map(function (x, i) {
      return '<div class="linea" style="grid-template-columns:1fr 90px 34px"><div class="concepto"><b>' + escHTML(x.producto.nombre) + "</b><small>" + escHTML(x.producto.codigoBarras) + " · " + fmtMoneda(x.producto.precioVenta) + '</small></div><input type="number" min="1" value="' + x.cantidad + '" data-i="' + i + '"><button type="button" class="btn-icono danger" data-del="' + i + '"><i class="fa-solid fa-trash"></i></button></div>';
    }).join("") : '<div class="linea" style="display:block"><p class="muted" style="text-align:center;padding:6px">Agregá productos con el buscador.</p></div>';
    c.querySelectorAll("input[data-i]").forEach(function (inp) { inp.oninput = function () { lista[Number(inp.dataset.i)].cantidad = Math.max(1, Number(inp.value) || 1); }; });
    c.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { lista.splice(Number(b.dataset.del), 1); pintar(); }; });
  }
  const sel = selector("e-sel", { items: function () { return Datos.lista("productos").filter(function (p) { return p.codigoBarras; }); }, texto: function (p) { return p.nombre; }, sub: function (p) { return p.codigoBarras + " · " + fmtMoneda(p.precioVenta); },
    buscar: function (p) { return p.nombre + " " + p.codigoBarras; }, placeholder: "Agregar producto...",
    onChange: function (p) { if (!p) return; const ex = lista.find(function (x) { return x.producto.id === p.id; }); if (ex) ex.cantidad++; else lista.push({ producto: p, cantidad: 1 }); pintar(); setTimeout(function () { sel.set(null); }, 0); } });
  const bt = document.getElementById("e-todos"); if (bt) bt.onclick = function () { filtrados.forEach(function (p) { if (!lista.find(function (x) { return x.producto.id === p.id; })) lista.push({ producto: p, cantidad: 1 }); }); pintar(); };
  pintar();
  return ov;
}

/* ---------- Historial de movimientos ---------- */
function escucharMovs() {
  if (_movUnsub) return;
  _movUnsub = db.collection("movimientos_stock").orderBy("fecha", "desc").limit(400).onSnapshot(function (s) { _movs = docsDe(s); if (_tabStock === "movimientos") pintarStock(); },
    function (e) { toast(mensajeError(e), "error"); });
}
function columnasMov() {
  return [
    { k: "fecha", t: "Fecha", r: function (m) { return '<span class="nowrap">' + fmtFecha(m.fecha) + "</span>"; }, v: function (m) { return aFecha(m.fecha); } },
    { k: "producto", t: "Producto" },
    { k: "tipo", t: "Tipo", r: function (m) { return pill(m.tipo === "entrada" ? "+ entrada" : "− salida", m.tipo === "entrada" ? "ok" : "warn"); } },
    { k: "cantidad", t: "Cant.", cls: "num", r: function (m) { return fmtNum(m.cantidad); } },
    { k: "cantidadNueva", t: "Queda", cls: "num", r: function (m) { return fmtNum(m.cantidadAnterior) + " → <b>" + fmtNum(m.cantidadNueva) + "</b>"; } },
    { k: "motivo", t: "Motivo", r: function (m) { return escHTML(m.motivo || "") + (m.origen && m.origen !== "manual" ? ' <small class="muted">(' + escHTML(m.origen) + ")</small>" : ""); } },
    { k: "usuario", t: "Usuario" }
  ];
}
function pintarMovs(cont) {
  tabla(cont, { filas: _movs, columnas: columnasMov(), orden: "fecha", dir: -1, vacio: "Sin movimientos", vacioIcono: "fa-right-left" });
}
async function verMovsProducto(id) {
  const p = Datos.porId("productos", id);
  const m = abrirModal({ titulo: "Historial · " + p.nombre, ancho: "modal-lg", cuerpo: '<div id="mv-hist">' + skeleton(5) + "</div>" });
  try {
    const s = await db.collection("movimientos_stock").where("productoId", "==", id).limit(300).get();
    tabla(m.q("#mv-hist"), { filas: docsDe(s), columnas: columnasMov().filter(function (c) { return c.k !== "producto"; }), orden: "fecha", dir: -1, vacio: "Sin movimientos" });
  } catch (e) { m.q("#mv-hist").innerHTML = '<p class="muted">' + escHTML(mensajeError(e)) + "</p>"; }
}
window.abrirFormProducto = abrirFormProducto; window.eliminarProducto = eliminarProducto; window.abrirMovimiento = abrirMovimiento; window.verMovsProducto = verMovsProducto;
window.contar = contar; window.pedirCantidad = pedirCantidad; window.guardarConteo = guardarConteo;
document.addEventListener("DOMContentLoaded", initStock);
