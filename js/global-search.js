/* =====================================================================
 * global-search.js — Busqueda global (Ctrl+K)
 * Antes descargaba hasta 1.500 documentos por cada tecla. Ahora carga
 * una sola vez (primero del cache local, luego del servidor), busca en
 * memoria sin tildes y se navega con el teclado.
 * ===================================================================== */
(function () {
  let ov = null, datos = null, cargando = null, sel = 0, resultados = [];

  const ACCIONES = [
    { t: "Nueva cita", sub: "Agenda", icon: "fa-calendar-plus", href: "citas.html?nueva=1", p: "agenda" },
    { t: "Nueva consulta", sub: "Clínica", icon: "fa-stethoscope", href: "consultas.html?nueva=1", p: "clinica" },
    { t: "Nuevo paciente", sub: "Dueño + mascota", icon: "fa-paw", href: "pacientes.html?nuevo=1", p: "pacientes" },
    { t: "Nueva factura / cobrar", sub: "Facturación", icon: "fa-file-invoice-dollar", href: "facturas.html?nueva=1", p: "facturar" },
    { t: "Caja", sub: "Abrir, movimientos, cierre", icon: "fa-cash-register", href: "caja.html", p: "caja" },
    { t: "Punto de venta", sub: "Caja: escanear y cobrar", icon: "fa-cash-register", href: "venta.html", p: "facturar" },
    { t: "Devoluciones", sub: "Notas de crédito", icon: "fa-rotate-left", href: "facturas.html?tab=devoluciones", p: "facturar" },
    { t: "Internación", sub: "Internados y hoja de tratamiento", icon: "fa-bed-pulse", href: "internacion.html", p: "clinica_ver" },
    { t: "Nuevo presupuesto", sub: "Facturación", icon: "fa-file-signature", href: "facturas.html?tab=presupuestos", p: "facturar" },
    { t: "Inventario (conteo)", sub: "Stock", icon: "fa-clipboard-check", href: "stock.html?tab=inventario", p: "stock" },
    { t: "Sugerido de compra", sub: "Compras", icon: "fa-lightbulb", href: "compras.html?tab=sugerido", p: "admin" },
    { t: "Registrar vacuna", sub: "Clínica", icon: "fa-shield-virus", href: "vacunas.html?nueva=1", p: "clinica" },
    { t: "Recordatorios por WhatsApp", sub: "Vacunas, controles, citas", icon: "fa-brands fa-whatsapp", href: "recordatorios.html", p: "recordatorios" },
    { t: "Reportes", sub: "Administración", icon: "fa-chart-line", href: "reportes.html", p: "admin" }
  ];

  async function obtener(col) {
    let s;
    try { s = await db.collection(col).get({ source: "cache" }); } catch (e) { s = null; }
    if (!s || s.empty) { try { s = await db.collection(col).get(); } catch (e) { return []; } }
    return docsDe(s).filter(function (d) { return !d.eliminado; });
  }
  function cargar() {
    if (!cargando) {
      cargando = Promise.all(["mascotas", "propietarios", "productos", "servicios"].map(obtener)).then(function (r) {
        datos = { mascotas: r[0], propietarios: r[1], productos: r[2], servicios: r[3] };
        datos.duenos = {}; r[1].forEach(function (d) { datos.duenos[d.id] = d; });
      });
    }
    return cargando;
  }

  function crear() {
    ov = document.createElement("div");
    ov.className = "search-overlay";
    ov.innerHTML = '<div class="search-box" role="dialog" aria-label="Búsqueda"><div class="search-input"><i class="fa-solid fa-magnifying-glass"></i>' +
      '<input type="text" id="gs-input" placeholder="Paciente, dueño, CI, teléfono, producto, N° de factura o acción..." autocomplete="off"><kbd>Esc</kbd></div>' +
      '<div class="search-results" id="gs-results"></div><div class="gs-pie"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) cerrar(); });
    const inp = ov.querySelector("#gs-input");
    inp.addEventListener("input", debounce(function () { buscar(inp.value.trim()); }, 120));
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); cerrar(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, Math.min(resultados.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1))); marcar(); }
      else if (e.key === "Enter" && resultados[sel]) { e.preventDefault(); location.href = resultados[sel].href; }
    });
  }
  function abrir() {
    if (!ov) crear();
    ov.classList.add("show");
    const inp = ov.querySelector("#gs-input"); inp.value = ""; inp.focus();
    buscar("");
    cargar().then(function () { if (ov.classList.contains("show")) buscar(inp.value.trim()); });
  }
  function cerrar() { if (ov) ov.classList.remove("show"); }

  function buscar(q) {
    const cont = document.getElementById("gs-results");
    const grupos = [];
    const acc = ACCIONES.filter(function (a) { return puede(a.p) && (!q || coincide(a.t + " " + a.sub, q)); }).slice(0, q ? 4 : 8);
    if (acc.length) grupos.push({ t: q ? "Acciones" : "Accesos rápidos", items: acc });
    if (q.length >= 2) {
      if (!datos) { cont.innerHTML = '<p class="gs-hint"><span class="spinner spinner-sm"></span> Cargando índice...</p>'; resultados = []; return; }
      const d = datos;
      const verPac = puede("pacientes") || puede("clinica_ver");
      const masc = !verPac ? [] : d.mascotas.filter(function (m) { const du = d.duenos[m.propietarioId]; return coincide([m.nombre, m.especie, m.raza, m.chip, du && du.nombre, du && du.telefono, du && du.dni].join(" "), q); }).slice(0, 6)
        .map(function (m) { const du = d.duenos[m.propietarioId]; return { t: m.nombre, sub: [m.especie, m.raza, du && du.nombre].filter(Boolean).join(" · "), icon: "fa-paw", href: "paciente.html?id=" + m.id }; });
      if (masc.length) grupos.push({ t: "Pacientes", items: masc });
      const due = !verPac ? [] : d.propietarios.filter(function (x) { return coincide([x.nombre, x.telefono, x.dni, x.ruc, x.email].join(" "), q); }).slice(0, 5)
        .map(function (x) { return { t: x.nombre, sub: [x.telefono, x.dni && "CI " + x.dni].filter(Boolean).join(" · "), icon: "fa-user", href: "pacientes.html?dueno=" + x.id }; });
      if (due.length) grupos.push({ t: "Dueños", items: due });
      if (puede("stock")) {
        const pr = d.productos.filter(function (p) { return coincide([p.nombre, p.categoria, p.codigoBarras].join(" "), q); }).slice(0, 5)
          .map(function (p) { return { t: p.nombre, sub: "Stock: " + fmtNum(p.cantidad) + " · " + fmtMoneda(p.precioVenta), icon: "fa-box", href: "stock.html?q=" + encodeURIComponent(p.nombre) }; });
        if (pr.length) grupos.push({ t: "Productos", items: pr });
      }
      const sv = d.servicios.filter(function (s) { return coincide(s.nombre + " " + (s.categoria || ""), q); }).slice(0, 4)
        .map(function (s) { return { t: s.nombre, sub: (s.categoria || "Servicio") + " · " + fmtMoneda(s.precio), icon: "fa-tag", href: "servicios.html?q=" + encodeURIComponent(s.nombre) }; });
      if (sv.length) grupos.push({ t: "Servicios", items: sv });
      if (puede("facturar") && /\d/.test(q)) grupos.push({ t: "Facturas", items: [{ t: "Buscar comprobante \"" + q + "\"", sub: "Facturación", icon: "fa-file-invoice", href: "facturas.html?q=" + encodeURIComponent(q) }] });
    }
    resultados = []; sel = 0;
    let html = "";
    grupos.forEach(function (g) {
      html += '<div class="gs-group"><h4>' + escHTML(g.t) + "</h4>";
      g.items.forEach(function (it) {
        const i = resultados.length; resultados.push(it);
        html += '<a class="gs-item" data-i="' + i + '" href="' + it.href + '"><i class="' + (it.icon.indexOf("fa-brands") === 0 ? it.icon : "fa-solid " + it.icon) + '"></i><span><span class="gs-title">' + escHTML(it.t) + '</span><span class="gs-sub">' + escHTML(it.sub || "") + "</span></span></a>";
      });
      html += "</div>";
    });
    cont.innerHTML = html || '<p class="gs-hint">Sin resultados para "' + escHTML(q) + '".</p>';
    cont.querySelectorAll(".gs-item").forEach(function (a) { a.onmouseenter = function () { sel = Number(a.dataset.i); marcar(); }; });
    marcar();
  }
  function marcar() {
    document.querySelectorAll("#gs-results .gs-item").forEach(function (a) {
      const on = Number(a.dataset.i) === sel; a.classList.toggle("activo", on); if (on) a.scrollIntoView({ block: "nearest" });
    });
  }
  window.abrirBusquedaGlobal = abrir;
})();
