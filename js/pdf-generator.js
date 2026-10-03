/* =====================================================================
 * pdf-generator.js — Documentos PDF (jsPDF + AutoTable, carga diferida)
 *  - Receta / ficha de consulta       - Historia clinica completa
 *  - Carnet de vacunacion             - Ficha quirurgica + consentimiento
 *  - Factura / comprobante (IVA PY)   - Cierre de caja
 * Los datos de la clinica salen de Configuracion.
 * ===================================================================== */

const PDF_VERDE = [15, 157, 104];
let _logoData = null;
async function _logo() {
  if (_logoData !== null) return _logoData;
  try {
    const r = await fetch("assets/logo.png");
    const b = await r.blob();
    _logoData = await new Promise(function (res) { const fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(""); }; fr.readAsDataURL(b); });
  } catch (e) { _logoData = ""; }
  return _logoData;
}
async function _nuevoPDF() {
  await cargarLib("pdf");
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J) throw errorUsuario("La librería de PDF no se cargó.");
  const doc = new J({ unit: "pt", format: "a4" });
  doc._logo = await _logo();
  return doc;
}
/* Encabezado comun con datos de la clinica. Devuelve la Y donde seguir. */
function _encabezado(doc, titulo, subtitulo) {
  const c = cfg();
  doc.setFillColor.apply(doc, PDF_VERDE); doc.rect(0, 0, 595, 78, "F");
  let x = 40;
  if (doc._logo) { try { doc.addImage(doc._logo, "PNG", 36, 14, 50, 50); x = 98; } catch (e) {} }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(19);
  doc.text(c.clinicaNombre || "Mascotita", x, 38);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text("Clínica Veterinaria" + (c.clinicaRuc ? "  ·  RUC " + c.clinicaRuc : ""), x, 53);
  const l2 = [c.clinicaDireccion, c.clinicaTelefono, c.clinicaEmail].filter(Boolean).join("  ·  ");
  if (l2) doc.text(l2, x, 65);
  doc.setTextColor(20, 30, 36);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(titulo, 40, 108);
  if (subtitulo) { doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(100); doc.text(subtitulo, 555, 108, { align: "right" }); doc.setTextColor(20, 30, 36); }
  doc.setFont("helvetica", "normal");
  return 124;
}
function _pie(doc) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140);
    doc.text(nombreClinica() + " · Generado el " + fmtFecha(new Date()) + " por " + ((window.MASCOTITA.usuario || {}).nombre || ""), 40, 820);
    doc.text("Página " + i + " de " + n, 555, 820, { align: "right" });
  }
  doc.setTextColor(0);
}
function _tablaDatos(doc, y, filas, op) {
  doc.autoTable(Object.assign({
    startY: y, theme: "plain", styles: { fontSize: 9.5, cellPadding: 3 }, margin: { left: 40, right: 40 },
    columnStyles: { 0: { fontStyle: "bold", textColor: [95, 111, 120], cellWidth: 90 }, 2: { fontStyle: "bold", textColor: [95, 111, 120], cellWidth: 90 } },
    body: filas
  }, op || {}));
  return doc.lastAutoTable.finalY;
}
function _seccion(doc, y, titulo) {
  if (y > 740) { doc.addPage(); y = 50; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor.apply(doc, PDF_VERDE);
  doc.text(titulo.toUpperCase(), 40, y + 16);
  doc.setDrawColor(220); doc.line(40, y + 21, 555, y + 21);
  doc.setFont("helvetica", "normal"); doc.setTextColor(20, 30, 36); doc.setFontSize(10);
  return y + 30;
}
function _parrafo(doc, y, etiqueta, texto) {
  if (!texto) return y;
  const lineas = doc.splitTextToSize(String(texto), 400);
  if (y + lineas.length * 13 > 790) { doc.addPage(); y = 50; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(95, 111, 120);
  doc.text(etiqueta, 40, y + 10);
  doc.setFont("helvetica", "normal"); doc.setTextColor(20, 30, 36); doc.setFontSize(10);
  doc.text(lineas, 150, y + 10);
  return y + Math.max(16, lineas.length * 13) + 4;
}
function _firma(doc, y, textos) {
  y = Math.max(y + 50, 700); if (y > 780) { doc.addPage(); y = 120; }
  doc.setDrawColor(150);
  textos.forEach(function (t, i) {
    const x = 60 + i * 260;
    doc.line(x, y, x + 200, y); doc.setFontSize(9); doc.setTextColor(90); doc.text(t, x + 100, y + 13, { align: "center" });
  });
  doc.setTextColor(0);
}
function _datosPaciente(doc, y, m, d) {
  m = m || {}; d = d || {};
  return _tablaDatos(doc, y, [
    ["Paciente", m.nombre || "", "Dueño", d.nombre || ""],
    ["Especie / raza", [m.especie, m.raza].filter(Boolean).join(" / "), "Teléfono", d.telefono || ""],
    ["Sexo", [m.sexo, m.castrado ? "castrado/a" : ""].filter(Boolean).join(", "), "CI / RUC", d.dni || d.ruc || ""],
    ["Edad", m.fechaNacimiento ? edadDesde(m.fechaNacimiento) : (m.edad || ""), "Dirección", d.direccion || ""],
    ["Peso", m.peso ? fmtNum(m.peso) + " kg" : "", "Chip", m.chip || ""]
  ]);
}
function _archivo(base, extra) { return nombreSeguro(base + "_" + (extra || "")) + ".pdf"; }
async function _guardar(doc, nombre) { _pie(doc); await guardarArchivo(doc.output("blob"), nombre); }
function _vitalesTexto(v) {
  if (!v) return "";
  return [v.peso && "Peso " + fmtNum(v.peso) + " kg", v.temperatura && "T° " + fmtNum(v.temperatura, 1) + " °C", v.fc && "FC " + v.fc + " lpm", v.fr && "FR " + v.fr + " rpm",
    v.cc && "CC " + v.cc + "/9", v.mucosas && "Mucosas " + v.mucosas, v.tllc && "TLLC " + v.tllc + " s", v.hidratacion && "Hidratación " + v.hidratacion].filter(Boolean).join("   ·   ");
}

/* ---------- Receta / ficha de consulta ---------- */
async function pdfConsulta(c, m, d) {
  const doc = await _nuevoPDF();
  let y = _encabezado(doc, "Ficha de consulta y receta", fmtFecha(c.fecha));
  y = _datosPaciente(doc, y, m || { nombre: c.mascota }, d || { nombre: c.dueno });
  y = _seccion(doc, y + 6, "Consulta");
  y = _parrafo(doc, y, "Veterinario/a", c.veterinario);
  y = _parrafo(doc, y, "Motivo", c.motivo);
  y = _parrafo(doc, y, "Anamnesis", c.sintomas);
  y = _parrafo(doc, y, "Signos vitales", _vitalesTexto(c.vitales));
  y = _parrafo(doc, y, "Examen físico", c.examenFisico);
  y = _parrafo(doc, y, "Diagnóstico", c.diagnostico);
  y = _parrafo(doc, y, "Tratamiento", c.tratamiento);
  const receta = (c.receta || []).filter(function (r) { return r.medicamento; });
  if (receta.length || c.medicamentos) {
    y = _seccion(doc, y + 4, "Receta");
    if (receta.length) {
      doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 10, cellPadding: 5 }, headStyles: { fillColor: PDF_VERDE },
        head: [["Medicamento", "Indicaciones / dosis", "Cant."]],
        body: receta.map(function (r) { return [r.medicamento, r.indicaciones || "", r.cantidad || ""]; }) });
      y = doc.lastAutoTable.finalY + 8;
    }
    y = _parrafo(doc, y, "Indicaciones", c.medicamentos);
  }
  if (c.proximoControl) y = _parrafo(doc, y + 4, "Próximo control", fmtFechaCorta(c.proximoControl));
  _firma(doc, y, ["Firma y sello del veterinario/a"]);
  await _guardar(doc, _archivo("consulta_" + (c.mascota || ""), fechaInput(c.fecha)));
}

/* ---------- Historia clinica completa ---------- */
async function pdfHistoria(m, d, consultas, vacunas, cirugias) {
  const doc = await _nuevoPDF();
  let y = _encabezado(doc, "Historia clínica", m.nombre);
  y = _datosPaciente(doc, y, m, d);
  if (m.alergias || m.condiciones) {
    y = _seccion(doc, y + 4, "Alertas");
    y = _parrafo(doc, y, "Alergias", m.alergias);
    y = _parrafo(doc, y, "Condiciones", m.condiciones);
  }
  if (vacunas.length) {
    y = _seccion(doc, y + 4, "Vacunas y desparasitaciones");
    doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 9 }, headStyles: { fillColor: PDF_VERDE },
      head: [["Fecha", "Tipo", "Producto / lote", "Próxima"]],
      body: vacunas.map(function (v) { return [fmtFechaCorta(v.fecha), v.tipo || "", [v.producto, v.lote].filter(Boolean).join(" / "), fmtFechaCorta(v.proximaDosis)]; }) });
    y = doc.lastAutoTable.finalY + 6;
  }
  if (cirugias.length) {
    y = _seccion(doc, y + 4, "Cirugías");
    doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 9 }, headStyles: { fillColor: PDF_VERDE },
      head: [["Fecha", "Tipo", "Cirujano/a", "Observaciones"]],
      body: cirugias.map(function (c) { return [fmtFechaCorta(c.fecha), c.tipo || "", c.veterinario || "", c.observaciones || ""]; }) });
    y = doc.lastAutoTable.finalY + 6;
  }
  y = _seccion(doc, y + 4, "Consultas (" + consultas.length + ")");
  consultas.forEach(function (c) {
    if (y > 700) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(fmtFecha(c.fecha) + (c.veterinario ? "  ·  " + c.veterinario : ""), 40, y + 10);
    doc.setFont("helvetica", "normal"); y += 18;
    y = _parrafo(doc, y, "Motivo", c.motivo);
    y = _parrafo(doc, y, "Signos vitales", _vitalesTexto(c.vitales));
    y = _parrafo(doc, y, "Diagnóstico", c.diagnostico);
    y = _parrafo(doc, y, "Tratamiento", c.tratamiento);
    doc.setDrawColor(235); doc.line(40, y + 2, 555, y + 2); y += 8;
  });
  await _guardar(doc, _archivo("historia_clinica_" + m.nombre, hoyISO()));
}

/* ---------- Carnet de vacunacion ---------- */
async function pdfCarnet(m, d, vacunas) {
  const doc = await _nuevoPDF();
  let y = _encabezado(doc, "Carnet de vacunación", m.nombre);
  y = _datosPaciente(doc, y, m, d);
  y = _seccion(doc, y + 6, "Registro");
  doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 9.5, cellPadding: 6 }, headStyles: { fillColor: PDF_VERDE },
    head: [["Fecha", "Vacuna / desparasitación", "Producto", "Lote", "Próxima dosis", "Firma"]],
    body: vacunas.slice().sort(function (a, b) { return aFecha(a.fecha) - aFecha(b.fecha); })
      .map(function (v) { return [fmtFechaCorta(v.fecha), v.tipo || "", v.producto || "", v.lote || "", fmtFechaCorta(v.proximaDosis), ""]; }) });
  await _guardar(doc, _archivo("carnet_" + m.nombre, hoyISO()));
}

/* ---------- Ficha quirurgica + consentimiento ---------- */
async function pdfCirugia(c, m, d, conConsentimiento) {
  const doc = await _nuevoPDF();
  let y = _encabezado(doc, "Ficha quirúrgica", fmtFechaCorta(c.fecha));
  y = _datosPaciente(doc, y, m || { nombre: c.paciente }, d || { nombre: c.dueno });
  y = _seccion(doc, y + 6, "Procedimiento");
  y = _tablaDatos(doc, y, [
    ["Tipo", c.tipo || "", "Estado", c.estado || ""],
    ["Cirujano/a", c.veterinario || "", "Anestesista", c.anestesista || ""],
    ["Hora entrada", c.horaEntrada || "", "Hora salida", c.horaSalida || ""],
    ["Riesgo ASA", c.asa || "", "Peso", c.peso ? fmtNum(c.peso) + " kg" : ""],
    ["Anestesia", c.anestesia || "", "Costo", c.costo ? fmtMoneda(c.costo) : ""]
  ]);
  y = _parrafo(doc, y + 6, "Procedimiento", c.procedimiento);
  y = _parrafo(doc, y, "Observaciones", c.observaciones);
  y = _parrafo(doc, y, "Indicaciones post-op", c.indicaciones);
  y = _seccion(doc, y + 4, "Checklist");
  doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 9.5 }, headStyles: { fillColor: PDF_VERDE },
    head: [["Pre-operatorio", "OK", "Post-operatorio", "OK"]],
    body: (window.CHECK_PRE || []).map(function (it, i) {
      const post = (window.CHECK_POST || [])[i] || "";
      return [it, (c.checkPre || []).indexOf(it) !== -1 ? "Sí" : "—", post, post ? ((c.checkPost || []).indexOf(post) !== -1 ? "Sí" : "—") : ""];
    }) });
  _firma(doc, doc.lastAutoTable.finalY, ["Cirujano/a", "Anestesista"]);
  if (conConsentimiento !== false) {
    doc.addPage();
    y = _encabezado(doc, "Consentimiento informado", fmtFechaCorta(c.fecha));
    y = _datosPaciente(doc, y, m || { nombre: c.paciente }, d || { nombre: c.dueno });
    const texto = (cfg().textoConsentimiento || "Yo, {dueno}, en mi carácter de propietario/a o responsable del paciente {mascota}, autorizo al equipo de {clinica} a realizar el procedimiento de {procedimiento} y la anestesia que sea necesaria. Declaro haber sido informado/a de los beneficios, riesgos y posibles complicaciones del procedimiento y de la anestesia, incluyendo el riesgo de muerte, y que he podido realizar todas las preguntas que consideré necesarias. Me comprometo a cumplir las indicaciones post-operatorias y asumo los costos del tratamiento.")
      .replace(/\{dueno\}/g, (d && d.nombre) || c.dueno || "__________").replace(/\{mascota\}/g, (m && m.nombre) || c.paciente || "")
      .replace(/\{clinica\}/g, nombreClinica()).replace(/\{procedimiento\}/g, c.tipo || "cirugía");
    doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(texto, 515), 40, y + 20, { lineHeightFactor: 1.5 });
    _firma(doc, y + 200, ["Firma del propietario/a · CI", "Veterinario/a"]);
  }
  await _guardar(doc, _archivo("cirugia_" + (c.paciente || ""), fechaInput(c.fecha)));
}

/* ---------- Factura / comprobante con IVA Paraguay ---------- */
async function pdfPresupuesto(p) { return pdfFactura(p, { presupuesto: true }); }
async function pdfFactura(f, op) {
  op = op || {};
  const doc = await _nuevoPDF();
  const c = cfg();
  const legal = !op.presupuesto && !!(f.timbrado || c.timbrado);
  let y = _encabezado(doc, (op.presupuesto ? "Presupuesto " : legal ? "Factura " : "Comprobante ") + (f.numero || ""), fmtFecha(f.fecha));
  const vence = op.presupuesto && aFecha(f.fecha) ? fmtFechaCorta(sumarDias(aFecha(f.fecha), f.validezDias || 15)) : "";
  const filas = op.presupuesto ? [
    ["Cliente", f.cliente || "", "Válido hasta", vence],
    ["RUC / CI", f.clienteRuc || "", "Estado", (f.estado || "").toUpperCase()]
  ] : [
    ["Cliente", f.cliente || "", "Condición", f.condicion === "credito" ? "Crédito" : "Contado"],
    ["RUC / CI", f.clienteRuc || "", "Estado", (f.estado || "").toUpperCase()]
  ];
  if (f.mascota) filas.push(["Paciente", f.mascota, "", ""]);
  if (legal) filas.push(["Timbrado", f.timbrado || c.timbrado, "Vigencia", f.timbradoVigencia || c.timbradoVigencia || ""]);
  y = _tablaDatos(doc, y, filas);
  const items = f.items || [];
  doc.autoTable({
    startY: y + 10, margin: { left: 40, right: 40 }, styles: { fontSize: 9.5, cellPadding: 5 }, headStyles: { fillColor: PDF_VERDE },
    head: [["Cant.", "Descripción", "Precio unit.", "Exenta", "IVA 5%", "IVA 10%"]],
    columnStyles: { 0: { halign: "right", cellWidth: 40 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    body: items.map(function (it) {
      const tot = it.total != null ? it.total : (it.cantidad || 0) * (it.precio || 0);
      const iva = it.iva == null ? (f.ivaPorcentaje != null ? 10 : 10) : Number(it.iva);
      return [fmtNum(it.cantidad), it.concepto + (it.descuento ? " (desc. " + it.descuento + "%)" : ""), fmtMoneda(it.precio).replace(/^Gs\s/, ""),
        iva === 0 ? fmtMoneda(tot).replace(/^Gs\s/, "") : "", iva === 5 ? fmtMoneda(tot).replace(/^Gs\s/, "") : "", iva === 10 ? fmtMoneda(tot).replace(/^Gs\s/, "") : ""];
    })
  });
  y = doc.lastAutoTable.finalY + 14;
  const t = f.gravada10 != null ? f : { gravada10: f.subtotal || 0, iva10: f.iva || 0, gravada5: 0, iva5: 0, exenta: 0, total: f.total };
  const lin = [["Total exentas", t.exenta], ["Total gravadas 5%", t.gravada5], ["Total gravadas 10%", t.gravada10],
    ["Liquidación IVA 5%", t.iva5], ["Liquidación IVA 10%", t.iva10], ["Total IVA", (t.iva5 || 0) + (t.iva10 || 0)]];
  doc.setFontSize(9.5);
  lin.forEach(function (l) { doc.setTextColor(95, 111, 120); doc.text(l[0], 360, y); doc.setTextColor(20, 30, 36); doc.text(fmtMoneda(l[1] || 0), 555, y, { align: "right" }); y += 14; });
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("TOTAL", 360, y + 8); doc.text(fmtMoneda(f.total), 555, y + 8, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); y += 26;
  if (op.presupuesto) {
    if (f.notas) { doc.setFontSize(9.5); doc.setTextColor(60); doc.text(doc.splitTextToSize("Condiciones: " + f.notas, 515), 40, y + 6); }
    doc.setTextColor(120); doc.setFontSize(8.5); doc.text("Presupuesto sin valor fiscal. Precios con IVA incluido, sujetos a cambios después de la fecha de validez.", 40, 790);
    _firma(doc, y + 40, ["Aceptado por el cliente", nombreClinica()]);
    await _guardar(doc, _archivo("presupuesto_" + (f.numero || ""), "")); return;
  }
  if (f.pagado != null) {
    doc.text("Pagado: " + fmtMoneda(f.pagado) + "    Saldo: " + fmtMoneda(f.saldo || 0), 555, y, { align: "right" }); y += 14;
  }
  (f.pagos || []).forEach(function (p) { doc.setTextColor(110); doc.text(fmtFecha(p.fecha) + " · " + nombreMetodo(p.metodo) + " · " + fmtMoneda(p.monto), 555, y, { align: "right" }); y += 12; });
  doc.setTextColor(120); doc.setFontSize(8.5);
  if (!legal) doc.text("Comprobante interno, no válido como factura legal. Configurá el timbrado en Configuración si corresponde.", 40, 790);
  if (f.estado === "anulada") { doc.setTextColor(217, 83, 79); doc.setFontSize(60); doc.text("ANULADA", 297, 450, { align: "center", angle: 30 }); }
  await _guardar(doc, _archivo(f.numero || "factura", ""));
}

/* ---------- Cierre de caja ---------- */
async function pdfCaja(caja, movs) {
  const doc = await _nuevoPDF();
  let y = _encabezado(doc, "Cierre de caja", fmtFecha(caja.fechaApertura) + (caja.fechaCierre ? " al " + fmtFecha(caja.fechaCierre) : ""));
  y = _tablaDatos(doc, y, [
    ["Abrió", caja.abiertaPor || "", "Cerró", caja.cerradaPor || "—"],
    ["Monto inicial", fmtMoneda(caja.montoInicial), "Efectivo esperado", fmtMoneda(caja.esperado || 0)],
    ["Efectivo contado", caja.montoContado != null ? fmtMoneda(caja.montoContado) : "—", "Diferencia", caja.diferencia != null ? fmtMoneda(caja.diferencia) : "—"]
  ]);
  const porMetodo = {};
  movs.forEach(function (m) { const k = m.metodo || "efectivo"; porMetodo[k] = (porMetodo[k] || 0) + (m.tipo === "egreso" ? -m.monto : m.monto); });
  y = _seccion(doc, y + 6, "Totales por medio de pago");
  doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 10 }, headStyles: { fillColor: PDF_VERDE }, head: [["Medio", "Neto"]],
    columnStyles: { 1: { halign: "right" } }, body: Object.keys(porMetodo).map(function (k) { return [nombreMetodo(k), fmtMoneda(porMetodo[k])]; }) });
  y = _seccion(doc, doc.lastAutoTable.finalY + 6, "Movimientos (" + movs.length + ")");
  doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 8.5 }, headStyles: { fillColor: PDF_VERDE },
    head: [["Hora", "Tipo", "Concepto", "Medio", "Usuario", "Monto"]], columnStyles: { 5: { halign: "right" } },
    body: movs.map(function (m) { return [fmtHora(m.fecha), m.tipo, m.concepto || "", nombreMetodo(m.metodo), m.usuario || "", (m.tipo === "egreso" ? "-" : "") + fmtMoneda(m.monto)]; }) });
  _firma(doc, doc.lastAutoTable.finalY, ["Responsable de caja", "Supervisor/a"]);
  await _guardar(doc, _archivo("caja", fechaInput(caja.fechaApertura)));
}

/* Envoltorio con indicador de carga y manejo de errores. */
async function generarPDF(fn) {
  mostrarLoading(true);
  try { await fn(); } catch (e) { console.error(e); toast(mensajeError(e), "error"); } finally { mostrarLoading(false); }
}
