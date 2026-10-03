/* =====================================================================
 * data.js — Capa de datos compartida
 * ---------------------------------------------------------------------
 *  - Datos.suscribir(): listas EN TIEMPO REAL compartidas (un solo
 *    listener por coleccion aunque varios modulos la usen). Con la
 *    persistencia offline la primera carga sale del cache local al instante.
 *  - Estadisticas agregadas (estadisticas/general) para no descargar
 *    colecciones enteras solo para contar.
 *  - Papelera (borrado logico + restaurar).
 *  - Inventario: movimientos de stock dentro de transacciones.
 *  - Caja: caja abierta actual.
 *  - Migracion automatica de datos de versiones anteriores (solo admin).
 * ===================================================================== */

const Datos = (function () {
  const COLS = {
    mascotas:     function () { return db.collection("mascotas").orderBy("nombre"); },
    propietarios: function () { return db.collection("propietarios").orderBy("nombre"); },
    productos:    function () { return db.collection("productos").orderBy("nombre"); },
    servicios:    function () { return db.collection("servicios").orderBy("nombre"); },
    proveedores:  function () { return db.collection("proveedores").orderBy("nombre"); },
    usuarios:     function () { return db.collection("users").orderBy("nombre"); },
    plantillas:   function () { return db.collection("plantillas_clinicas").orderBy("nombre"); }
  };
  const subs = {};

  function suscribir(nombre, cb) {
    let s = subs[nombre];
    if (!s) {
      s = subs[nombre] = { datos: [], porId: {}, cbs: [], listo: false, esperando: [] };
      s.unsub = COLS[nombre]().onSnapshot(function (snap) {
        s.datos = docsDe(snap);
        s.porId = {};
        s.datos.forEach(function (d) { s.porId[d.id] = d; });
        s.listo = true;
        s.esperando.splice(0).forEach(function (r) { r(); });
        s.cbs.slice().forEach(function (f) { try { f(lista(nombre), snap); } catch (e) { console.error(e); } });
      }, function (e) {
        console.error("Datos." + nombre, e);
        s.listo = true; s.esperando.splice(0).forEach(function (r) { r(); });
        if (e.code === "permission-denied") toast("Sin permiso para leer " + nombre + ".", "error");
      });
    }
    if (cb) { s.cbs.push(cb); if (s.listo) cb(lista(nombre)); }
    return function () { const i = s.cbs.indexOf(cb); if (i !== -1) s.cbs.splice(i, 1); };
  }
  function listo(nombre) {
    suscribir(nombre);
    const s = subs[nombre];
    return s.listo ? Promise.resolve() : new Promise(function (r) { s.esperando.push(r); });
  }
  /* Lista sin los registros enviados a la papelera. */
  function lista(nombre, conEliminados) {
    const s = subs[nombre]; if (!s) return [];
    return conEliminados ? s.datos : s.datos.filter(function (d) { return !d.eliminado; });
  }
  function porId(nombre, id) { const s = subs[nombre]; return s && id ? s.porId[id] || null : null; }

  /* ---------- Helpers de dominio ---------- */
  function dueno(id) { return porId("propietarios", id); }
  function mascota(id) { return porId("mascotas", id); }
  function duenoDe(m) { return m ? dueno(m.propietarioId) : null; }
  function textoMascota(m) { const d = duenoDe(m); return m.nombre + (m.especie ? " (" + m.especie + ")" : "") + (d ? " — " + d.nombre : ""); }
  function buscarMascota(m) { const d = duenoDe(m); return [m.nombre, m.especie, m.raza, m.chip, d && d.nombre, d && d.telefono, d && d.dni].join(" "); }
  function avatarMascota(m, clase) {
    const ic = /gat|felin/i.test(m && m.especie || "") ? "fa-cat" : (/ave|pajar|loro/i.test(m && m.especie || "") ? "fa-dove" : (/conej|roedor|hamster|cobayo/i.test(m && m.especie || "") ? "fa-carrot" : "fa-dog"));
    const src = m && (m.fotoMini || m.fotoURL);
    return src ? '<img class="avatar-m ' + (clase || "") + '" src="' + escHTML(src) + '" alt="" loading="lazy">'
      : '<span class="avatar-m ph ' + (clase || "") + '"><i class="fa-solid ' + ic + '"></i></span>';
  }
  /* Selector de mascota reutilizable. */
  function selectorMascota(cont, op) {
    op = op || {};
    return selector(cont, Object.assign({
      items: function () { return lista("mascotas"); },
      texto: function (m) { return m.nombre + (m.especie ? " (" + m.especie + ")" : ""); },
      sub: function (m) { const d = duenoDe(m); return d ? d.nombre + (d.telefono ? " · " + d.telefono : "") : "Sin dueño"; },
      buscar: buscarMascota,
      icono: function (m) { return avatarMascota(m, "sm"); },
      placeholder: "Buscar mascota o dueño..."
    }, op));
  }
  function selectorDueno(cont, op) {
    op = op || {};
    return selector(cont, Object.assign({
      items: function () { return lista("propietarios"); },
      texto: function (d) { return d.nombre; },
      sub: function (d) { return [d.telefono, d.dni ? "CI " + d.dni : "", d.ruc ? "RUC " + d.ruc : ""].filter(Boolean).join(" · "); },
      buscar: function (d) { return [d.nombre, d.telefono, d.dni, d.ruc, d.email].join(" "); },
      placeholder: "Buscar dueño por nombre, CI o teléfono..."
    }, op));
  }

  /* ---------- Estadisticas agregadas ---------- */
  const STATS_REF = function () { return db.collection("estadisticas").doc("general"); };
  function stat(batch, campo, delta) {
    const o = {}; o[campo] = FS.increment(delta);
    batch.set(STATS_REF(), o, { merge: true });
  }
  function escucharStats(cb) {
    return STATS_REF().onSnapshot(function (s) { cb(s.exists ? s.data() : {}); }, function () { cb({}); });
  }
  const STATS_COLS = ["mascotas", "propietarios", "consultas", "cirugias", "vacunas"];
  async function recalcularStats() {
    const r = {};
    for (const c of STATS_COLS) {
      const s = await db.collection(c).get();
      r[c] = s.docs.filter(function (d) { return !d.data().eliminado; }).length;
    }
    r.recalculadoEn = FS.serverTimestamp();
    await db.collection("estadisticas").doc("general").set(r);
    return r;
  }

  /* ---------- Papelera (borrado logico) ---------- */
  const ETIQUETAS = {
    mascotas: function (d) { return "Mascota " + d.nombre; },
    propietarios: function (d) { return "Dueño " + d.nombre; },
    consultas: function (d) { return "Consulta de " + (d.mascota || "") + " (" + fmtFechaCorta(d.fecha) + ")"; },
    vacunas: function (d) { return (d.tipo || "Vacuna") + " de " + (d.mascota || ""); },
    cirugias: function (d) { return "Cirugía de " + (d.paciente || d.mascota || ""); },
    citas: function (d) { return "Cita de " + (d.mascota || "") + " (" + fmtFecha(d.fecha) + ")"; },
    productos: function (d) { return "Producto " + d.nombre; },
    servicios: function (d) { return "Servicio " + d.nombre; },
    proveedores: function (d) { return "Proveedor " + d.nombre; }
  };
  async function aPapelera(col, id, datos) {
    const u = window.MASCOTITA.usuario;
    const b = db.batch();
    const etiqueta = (ETIQUETAS[col] ? ETIQUETAS[col](datos || {}) : col + " " + id);
    b.update(db.collection(col).doc(id), { eliminado: true, eliminadoEn: FS.serverTimestamp(), eliminadoPor: u.nombre, eliminadoEtiqueta: etiqueta });
    if (STATS_COLS.indexOf(col) !== -1) stat(b, col, -1);
    // Las vacunas de una mascota eliminada dejan de generar avisos.
    if (col === "mascotas") {
      const vs = await db.collection("vacunas").where("mascotaId", "==", id).get();
      vs.docs.filter(function (d) { return d.data().vigente === true; }).forEach(function (d) { b.update(d.ref, { vigente: false, vigenteSuspendida: true }); });
    }
    if (col === "vacunas" && datos && datos.vigente) b.update(db.collection(col).doc(id), { vigente: false });
    await escribir(b.commit());
    registrarAuditoria("eliminar", col, "Envió a la papelera: " + etiqueta);
    toast("Enviado a la papelera. El administrador puede restaurarlo.", "ok", 5000);
  }
  async function restaurar(col, id) {
    const b = db.batch();
    b.update(db.collection(col).doc(id), { eliminado: false, eliminadoEn: FS.delete(), eliminadoPor: FS.delete() });
    if (STATS_COLS.indexOf(col) !== -1) stat(b, col, 1);
    if (col === "mascotas") {
      const vs = await db.collection("vacunas").where("mascotaId", "==", id).get();
      vs.docs.filter(function (d) { return d.data().vigenteSuspendida; }).forEach(function (d) { b.update(d.ref, { vigente: true, vigenteSuspendida: FS.delete() }); });
    }
    await escribir(b.commit());
    registrarAuditoria("restaurar", col, "Restauró " + id);
  }

  /* ---------- Vacunas: solo la ultima dosis de cada tipo esta "vigente" ---------- */
  function claveVacuna(v) { return (v.mascotaId || "") + "|" + normalizar(v.tipo); }

  return {
    suscribir: suscribir, listo: listo, lista: lista, porId: porId,
    dueno: dueno, mascota: mascota, duenoDe: duenoDe, textoMascota: textoMascota, buscarMascota: buscarMascota,
    avatarMascota: avatarMascota, selectorMascota: selectorMascota, selectorDueno: selectorDueno,
    stat: stat, escucharStats: escucharStats, recalcularStats: recalcularStats,
    aPapelera: aPapelera, restaurar: restaurar, claveVacuna: claveVacuna, ETIQUETAS: ETIQUETAS
  };
})();

/* =====================================================================
 * INVENTARIO — movimientos de stock en transaccion
 * Uso dentro de db.runTransaction:
 *   const inv = await Inventario.leer(tx, [ids]);   // 1) TODAS las lecturas primero
 *   Inventario.mover(tx, inv, lineas, ctx);           // 2) luego las escrituras
 * lineas: [{ productoId, delta (+entrada / -salida), motivo }]
 * ===================================================================== */
const Inventario = {
  async leer(tx, ids) {
    const unicos = Array.from(new Set(ids.filter(Boolean)));
    const snaps = await Promise.all(unicos.map(function (id) { return tx.get(db.collection("productos").doc(id)); }));
    const r = {};
    snaps.forEach(function (s) { if (s.exists) r[s.id] = Object.assign({ id: s.id }, s.data()); });
    return r;
  },
  mover(tx, inv, lineas, ctx) {
    ctx = ctx || {};
    const u = window.MASCOTITA.usuario;
    const acumulado = {};
    lineas.forEach(function (l) {
      if (!l.productoId || !l.delta) return;
      const p = inv[l.productoId];
      if (!p) throw errorUsuario("Un producto ya no existe en el stock.");
      const anterior = acumulado[l.productoId] != null ? acumulado[l.productoId] : Number(p.cantidad) || 0;
      const nueva = Math.round((anterior + l.delta) * 1000) / 1000;
      if (nueva < 0 && !ctx.permitirNegativo) throw errorUsuario("Stock insuficiente de " + p.nombre + " (disponible: " + fmtNum(anterior) + ").");
      acumulado[l.productoId] = nueva;
      tx.set(db.collection("movimientos_stock").doc(), {
        productoId: l.productoId, producto: p.nombre, tipo: l.delta > 0 ? "entrada" : "salida",
        cantidad: Math.abs(l.delta), cantidadAnterior: anterior, cantidadNueva: nueva,
        motivo: l.motivo || ctx.motivo || "", origen: ctx.origen || "manual", refId: ctx.refId || "",
        usuario: u.nombre, usuarioUid: u.uid, fecha: FS.serverTimestamp()
      });
    });
    Object.keys(acumulado).forEach(function (id) {
      const p = inv[id];
      tx.update(db.collection("productos").doc(id), { cantidad: acumulado[id], stockBajo: acumulado[id] <= (Number(p.minimoStock) || 0) });
    });
    return acumulado;
  },
  /* Atajo: un movimiento simple en su propia transaccion. */
  async movimientoSimple(productoId, delta, motivo, origen) {
    requiereConexion("Mover stock");
    let res;
    await db.runTransaction(async function (tx) {
      const inv = await Inventario.leer(tx, [productoId]);
      res = Inventario.mover(tx, inv, [{ productoId: productoId, delta: delta, motivo: motivo }], { origen: origen || "manual" });
    });
    const p = Datos.porId("productos", productoId);
    if (p && res[productoId] <= (Number(p.minimoStock) || 0) && window.notificarStockBajo) notificarStockBajo(Object.assign({}, p, { cantidad: res[productoId] }));
    return res[productoId];
  }
};

/* =====================================================================
 * CAJA — caja abierta actual (una a la vez)
 * ===================================================================== */
const Caja = {
  actual: null,
  escuchar(cb) {
    return db.collection("cajas").where("estado", "==", "abierta").limit(1).onSnapshot(function (s) {
      Caja.actual = s.empty ? null : Object.assign({ id: s.docs[0].id }, s.docs[0].data());
      cb && cb(Caja.actual);
    }, function (e) { console.warn("caja:", e.code); cb && cb(null); });
  },
  async obtener() {
    const s = await db.collection("cajas").where("estado", "==", "abierta").limit(1).get();
    Caja.actual = s.empty ? null : Object.assign({ id: s.docs[0].id }, s.docs[0].data());
    return Caja.actual;
  }
};
const METODOS_PAGO = [
  { value: "efectivo", texto: "Efectivo" }, { value: "transferencia", texto: "Transferencia" },
  { value: "tarjeta_debito", texto: "Tarjeta de débito" }, { value: "tarjeta_credito", texto: "Tarjeta de crédito" },
  { value: "qr", texto: "QR / billetera" }, { value: "otro", texto: "Otro" }
];
function nombreMetodo(m) { const x = METODOS_PAGO.find(function (o) { return o.value === m; }); return x ? x.texto : (m || ""); }

/* =====================================================================
 * MIGRACION AUTOMATICA a v3 (la ejecuta el ADMIN una sola vez)
 * ===================================================================== */
const VERSION_DATOS = 3;
async function migrarSiHaceFalta() {
  if (!esAdmin() || !navigator.onLine) return;
  let ver = 0;
  try { const s = await db.collection("config").doc("sistema").get(); ver = s.exists ? Number(s.data().versionDatos) || 0 : 0; } catch (e) { return; }
  if (ver >= VERSION_DATOS) return;
  toast("Actualizando datos a la nueva versión (una sola vez)...", "info", 6000);
  try {
    const ops = [];
    // 1) Vacunas: marcar vigente solo la ultima dosis de cada mascota+tipo.
    const vac = docsDe(await db.collection("vacunas").get());
    const ult = {};
    vac.forEach(function (v) {
      if (v.eliminado) return;
      const k = Datos.claveVacuna(v), f = aFecha(v.fecha) || new Date(0);
      if (!ult[k] || f > ult[k].f) ult[k] = { id: v.id, f: f };
    });
    vac.forEach(function (v) {
      const vig = !v.eliminado && ult[Datos.claveVacuna(v)] && ult[Datos.claveVacuna(v)].id === v.id;
      if (v.vigente !== vig) ops.push([db.collection("vacunas").doc(v.id), { vigente: vig }]);
    });
    // 2) Productos: indicador stockBajo + IVA por defecto.
    docsDe(await db.collection("productos").get()).forEach(function (p) {
      const bajo = (Number(p.cantidad) || 0) <= (Number(p.minimoStock) || 0);
      const up = {};
      if (p.stockBajo !== bajo) up.stockBajo = bajo;
      if (p.iva == null) up.iva = 10;
      if (Object.keys(up).length) ops.push([db.collection("productos").doc(p.id), up]);
    });
    // 3) Facturas antiguas: pagado / saldo.
    docsDe(await db.collection("facturas").get()).forEach(function (f) {
      if (f.saldo != null) return;
      const total = Number(f.total) || 0;
      const pagado = f.estado === "pagada" ? total : 0;
      ops.push([db.collection("facturas").doc(f.id), { pagado: pagado, saldo: f.estado === "pendiente" ? total : 0, condicion: f.estado === "pendiente" ? "credito" : "contado" }]);
    });
    // 4) Usuarios con rol antiguo "user" -> veterinario.
    docsDe(await db.collection("users").get()).forEach(function (u) {
      if (u.role === "user") ops.push([db.collection("users").doc(u.id), { role: "veterinario" }]);
    });
    for (let i = 0; i < ops.length; i += 400) {
      const b = db.batch();
      ops.slice(i, i + 400).forEach(function (o) { b.update(o[0], o[1]); });
      await b.commit();
    }
    await Datos.recalcularStats();
    await db.collection("config").doc("sistema").set({ versionDatos: VERSION_DATOS, migradoEn: FS.serverTimestamp() }, { merge: true });
    registrarAuditoria("editar", "sistema", "Migración de datos a v" + VERSION_DATOS + " (" + ops.length + " registros)");
    toast("Datos actualizados (" + ops.length + " registros).", "ok");
  } catch (e) { console.error("migracion", e); toast("No se pudo completar la actualización de datos: " + mensajeError(e), "error"); }
}
