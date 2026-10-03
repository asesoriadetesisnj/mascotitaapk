/* =====================================================================
 * excel-export.js — Exportacion a Excel con SheetJS (carga diferida)
 * columnas: ["campo", ...] o [{ k: "campo", t: "Titulo", f: fn(valor, fila) }]
 * ===================================================================== */

function _filasExcel(datos, columnas) {
  const cols = columnas.map(function (c) { return typeof c === "string" ? { k: c, t: c } : c; });
  return datos.map(function (d) {
    const fila = {};
    cols.forEach(function (c) {
      let v = d[c.k];
      if (c.f) v = c.f(v, d);
      else if (v && v.toDate) v = fmtFecha(v);
      else if (Array.isArray(v)) v = v.join(", ");
      fila[c.t || c.k] = v == null ? "" : v;
    });
    return fila;
  });
}
async function exportarAExcel(datos, columnas, nombreArchivo) {
  if (!datos || !datos.length) { toast("No hay datos para exportar.", "warn"); return; }
  return exportarLibro([{ nombre: "Datos", datos: datos, columnas: columnas }], nombreArchivo);
}
/* Varias hojas en un mismo archivo: [{ nombre, datos, columnas }] */
async function exportarLibro(hojas, nombreArchivo) {
  try {
    mostrarLoading(true);
    await cargarLib("xlsx");
    const wb = XLSX.utils.book_new();
    hojas.forEach(function (h) {
      const filas = _filasExcel(h.datos || [], h.columnas);
      const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ "": "Sin datos" }]);
      const claves = filas.length ? Object.keys(filas[0]) : [""];
      ws["!cols"] = claves.map(function (k) {
        const max = Math.max(k.length, ...filas.slice(0, 200).map(function (f) { return String(f[k]).length; }));
        return { wch: Math.min(50, Math.max(8, max + 2)) };
      });
      XLSX.utils.book_append_sheet(wb, ws, String(h.nombre).slice(0, 31));
    });
    const bin = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    await guardarArchivo(new Blob([bin], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivo + "_" + hoyISO() + ".xlsx");
    toast("Archivo Excel generado.", "ok");
  } catch (e) { console.error(e); toast(mensajeError(e), "error"); }
  finally { mostrarLoading(false); }
}
window.exportarAExcel = exportarAExcel;
window.exportarLibro = exportarLibro;
