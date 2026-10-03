/* =====================================================================
 * caja.js — Caja diaria: apertura, ingresos/egresos, arqueo y cierre
 * Los cobros de facturas entran solos. Totales por medio de pago se
 * mantienen con contadores atomicos en el documento de la caja.
 * ===================================================================== */
const CATEG_EGRESO = ["Pago a proveedor", "Sueldos / adelantos", "Servicios (luz, agua, internet)", "Insumos / limpieza", "Retiro del dueño", "Otro"];
let _movsCaja = [], _movCajaUnsub = null;

async function initCaja() {
  await protegerPagina({ permiso: "caja", pagina: "caja.html" });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-cash-register"></i> Caja</h1><div class="head-actions" id="cj-acc"></div></div>' +
    '<div id="cj-estado">' + skeleton(3, "sk-card") + '</div><div id="cj-movs" class="mt"></div>' +
    '<div class="card mt"><h3><i class="fa-solid fa-clock-rotate-left"></i> Cajas anteriores</h3><div id="cj-hist">' + skeleton(3) + "</div></div>";
  Caja.escuchar(pintarCaja);
  db.collection("cajas").orderBy("fechaApertura", "desc").limit(60).onSnapshot(function (s) {
    const l = docsDe(s).filter(function (c) { return c.estado === "cerrada"; });
    tabla("cj-hist", {
      filas: l, orden: "fechaApertura", dir: -1, vacio: "Sin cajas cerradas todavía.", porPagina: 15,
      columnas: [
        { k: "fechaApertura", t: "Apertura", r: function (c) { return fmtFecha(c.fechaApertura) + "<br><small>" + escHTML(c.abiertaPor || "") + "</small>"; }, v: function (c) { return aFecha(c.fechaApertura); } },
        { k: "fechaCierre", t: "Cierre", r: function (c) { return fmtFecha(c.fechaCierre) + "<br><small>" + escHTML(c.cerradaPor || "") + "</small>"; }, v: function (c) { return aFecha(c.fechaCierre); } },
        { k: "totalIngresos", t: "Ingresos", cls: "num", r: function (c) { return fmtMoneda(c.totalIngresos); } },
        { k: "totalEgresos", t: "Egresos", cls: "num", r: function (c) { return fmtMoneda(c.totalEgresos); } },
        { k: "diferencia", t: "Diferencia", cls: "num", r: function (c) { const d = Number(c.diferencia) || 0; return '<b class="' + (d < 0 ? "texto-danger" : d > 0 ? "texto-warn" : "texto-ok") + '">' + fmtMoneda(d) + "</b>"; } },
        { k: "a", t: "", sort: false, cls: "acciones", r: function (c) { return btnIcono("fa-file-pdf", "PDF del cierre", "pdfCajaId('" + c.id + "')"); } }
      ]
    });
  }, function (e) { document.getElementById("cj-hist").innerHTML = '<p class="muted">' + escHTML(mensajeError(e)) + "</p>"; });
}

function pintarCaja(caja) {
  const acc = document.getElementById("cj-acc"), est = document.getElementById("cj-estado");
  if (_movCajaUnsub) { _movCajaUnsub(); _movCajaUnsub = null; }
  if (!caja) {
    acc.innerHTML = '<button class="btn btn-primary" id="cj-abrir"><i class="fa-solid fa-lock-open"></i> Abrir caja</button>';
    document.getElementById("cj-abrir").onclick = function () { abrirCajaModal(); };
    est.innerHTML = '<div class="card">' + vacio("La caja está cerrada. Abrila al comenzar el turno para poder cobrar.", "fa-lock") + "</div>";
    document.getElementById("cj-movs").innerHTML = "";
    return;
  }
  acc.innerHTML = '<button class="btn btn-ghost" id="cj-ing"><i class="fa-solid fa-arrow-down"></i> Ingreso</button><button class="btn btn-ghost" id="cj-egr"><i class="fa-solid fa-arrow-up"></i> Egreso</button>' +
    '<button class="btn btn-ghost" id="cj-pdf"><i class="fa-solid fa-file-pdf"></i> Parcial</button><button class="btn btn-danger" id="cj-cerrar"><i class="fa-solid fa-lock"></i> Cerrar caja</button>';
  document.getElementById("cj-ing").onclick = function () { movManual("ingreso", caja); };
  document.getElementById("cj-egr").onclick = function () { movManual("egreso", caja); };
  document.getElementById("cj-cerrar").onclick = function () { cerrarCaja(caja); };
  document.getElementById("cj-pdf").onclick = function () { generarPDF(function () { return pdfCaja(caja, _movsCaja.slice().reverse()); }); };
  const t = caja.totales || {};
  const efectivo = (Number(caja.montoInicial) || 0) + (Number(t.efectivo) || 0);
  const vieja = aFecha(caja.fechaApertura) && aFecha(caja.fechaApertura) < inicioDelDia();
  est.innerHTML = (vieja ? '<div class="alerta alerta-danger"><i class="fa-solid fa-triangle-exclamation"></i> Esta caja está abierta desde el ' + fmtFecha(caja.fechaApertura) + ". Cerrala y abrí una nueva para el día de hoy.</div>" : "") +
    '<div class="kpis"><div class="kpi"><i class="fa-solid fa-money-bill-wave"></i><div><span class="kpi-valor">' + fmtMoneda(efectivo) + '</span><span class="kpi-label">Efectivo esperado en caja</span></div></div>' +
    '<div class="kpi azul"><i class="fa-solid fa-arrow-down"></i><div><span class="kpi-valor">' + fmtMoneda(caja.totalIngresos) + '</span><span class="kpi-label">Ingresos del turno</span></div></div>' +
    '<div class="kpi rojo"><i class="fa-solid fa-arrow-up"></i><div><span class="kpi-valor">' + fmtMoneda(caja.totalEgresos) + '</span><span class="kpi-label">Egresos del turno</span></div></div>' +
    '<div class="kpi naranja"><i class="fa-solid fa-user-clock"></i><div><span class="kpi-valor" style="font-size:15px">' + escHTML(caja.abiertaPor || "") + '</span><span class="kpi-label">Abrió ' + fmtFecha(caja.fechaApertura) + " · inicial " + fmtMoneda(caja.montoInicial) + "</span></div></div></div>" +
    '<div class="chips">' + METODOS_PAGO.filter(function (m) { return t[m.value]; }).map(function (m) { return '<div class="chip-resumen"><small>' + m.texto + "</small><b>" + fmtMoneda(t[m.value]) + "</b></div>"; }).join("") + "</div>";
  _movCajaUnsub = db.collection("caja_movimientos").where("cajaId", "==", caja.id).onSnapshot(function (s) {
    _movsCaja = docsDe(s).sort(function (a, b) { return (aFecha(b.fecha) || new Date()) - (aFecha(a.fecha) || new Date()); });
    tabla("cj-movs", {
      filas: _movsCaja, orden: "fecha", dir: -1, vacio: "Sin movimientos todavía.", vacioIcono: "fa-receipt",
      columnas: [
        { k: "fecha", t: "Hora", r: function (m) { return m.fecha ? fmtHora(m.fecha) : "…"; }, v: function (m) { return aFecha(m.fecha) || new Date(); } },
        { k: "tipo", t: "Tipo", r: function (m) { return pill(m.tipo, m.tipo === "ingreso" ? "ok" : "danger"); } },
        { k: "concepto", t: "Concepto", r: function (m) { return escHTML(m.concepto || "") + (m.categoria ? "<br><small>" + escHTML(m.categoria) + "</small>" : ""); } },
        { k: "metodo", t: "Medio", r: function (m) { return escHTML(nombreMetodo(m.metodo)); } },
        { k: "usuario", t: "Usuario" },
        { k: "monto", t: "Monto", cls: "num", r: function (m) { return '<b class="' + (m.tipo === "egreso" ? "texto-danger" : "") + '">' + (m.tipo === "egreso" ? "− " : "") + fmtMoneda(m.monto) + "</b>"; } }
      ]
    });
  }, function (e) { toast(mensajeError(e), "error"); });
}

function movManual(tipo, caja) {
  modalForm(tipo === "ingreso" ? "Ingreso de dinero" : "Egreso de dinero",
    '<div class="grid-2">' + campo("mmonto", "Monto (Gs)", "", "number", { min: 1, req: true }) + selectCampo("mmet", "Medio", METODOS_PAGO, "efectivo") +
    (tipo === "egreso" ? selectCampo("mcat", "Categoría", CATEG_EGRESO, "") : "") + campo("mcon", "Concepto", "", "text", { req: true, full: tipo !== "egreso" }) + "</div>", {
      ancho: "modal-sm", textoGuardar: "Registrar",
      onGuardar: async function () {
        requiereConexion("Registrar movimientos de caja");
        const monto = Math.round(num("mmonto")); if (monto <= 0) throw errorUsuario("Monto inválido.");
        await db.runTransaction(async function (tx) {
          const s = await tx.get(db.collection("cajas").doc(caja.id));
          if (!s.exists || s.data().estado !== "abierta") throw errorUsuario("La caja ya no está abierta.");
          _movCajaTx(tx, caja, { tipo: tipo, monto: monto, metodo: val("mmet"), concepto: val("mcon"), categoria: tipo === "egreso" ? val("mcat") : "" });
        });
        registrarAuditoria("crear", "caja", (tipo === "ingreso" ? "Ingreso " : "Egreso ") + fmtMoneda(monto) + ": " + val("mcon"));
        toast("Movimiento registrado.", "ok");
      }
    });
}

function cerrarCaja(caja) {
  const t = caja.totales || {};
  const esperado = (Number(caja.montoInicial) || 0) + (Number(t.efectivo) || 0);
  const ov = modalForm("Cerrar caja",
    '<div class="chips"><div class="chip-resumen"><small>Efectivo esperado</small><b>' + fmtMoneda(esperado) + "</b></div>" +
    METODOS_PAGO.filter(function (m) { return m.value !== "efectivo" && t[m.value]; }).map(function (m) { return '<div class="chip-resumen"><small>' + m.texto + "</small><b>" + fmtMoneda(t[m.value]) + "</b></div>"; }).join("") + "</div>" +
    campo("ccont", "Efectivo contado en caja (Gs)", "", "number", { min: 0, req: true }) +
    '<div id="cc-dif" class="mb"></div>' + areaCampo("cnota", "Observaciones del cierre", ""), {
      ancho: "modal-sm", textoGuardar: "Cerrar caja", icono: "fa-lock",
      onGuardar: async function () {
        requiereConexion("Cerrar la caja");
        const contado = Math.round(num("ccont"));
        const dif = contado - esperado;
        if (dif !== 0 && !(await confirmar("Hay una diferencia de " + fmtMoneda(dif) + ". ¿Cerrar igual?", { peligro: false }))) return false;
        const u = window.MASCOTITA.usuario;
        await db.collection("cajas").doc(caja.id).update({ estado: "cerrada", fechaCierre: FS.serverTimestamp(), cerradaPor: u.nombre, cerradaPorUid: u.uid, montoContado: contado, esperado: esperado, diferencia: dif, notaCierre: val("cnota") });
        registrarAuditoria("editar", "caja", "Cerró caja. Esperado " + fmtMoneda(esperado) + ", contado " + fmtMoneda(contado) + ", diferencia " + fmtMoneda(dif));
        toast("Caja cerrada.", "ok", 6000, { texto: "PDF", fn: function () { pdfCajaId(caja.id); } });
      }
    });
  el("ccont").oninput = function () {
    const d = Math.round(num("ccont")) - esperado;
    document.getElementById("cc-dif").innerHTML = val("ccont") === "" ? "" : '<div class="alerta ' + (d === 0 ? "alerta-ok" : "alerta-warn") + '" style="margin:0">' + (d === 0 ? "Cuadra perfecto." : (d > 0 ? "Sobran " : "Faltan ") + fmtMoneda(Math.abs(d))) + "</div>";
  };
}
async function pdfCajaId(id) {
  const c = await db.collection("cajas").doc(id).get();
  const ms = docsDe(await db.collection("caja_movimientos").where("cajaId", "==", id).get()).sort(function (a, b) { return aFecha(a.fecha) - aFecha(b.fecha); });
  generarPDF(function () { return pdfCaja(Object.assign({ id: id }, c.data()), ms); });
}
window.pdfCajaId = pdfCajaId;
document.addEventListener("DOMContentLoaded", initCaja);
