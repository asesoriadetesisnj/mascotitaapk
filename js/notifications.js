/* =====================================================================
 * notifications.js
 *  1) Campana de avisos en la barra superior, EN TIEMPO REAL:
 *     stock bajo, productos por vencer, vacunas vencidas, citas de hoy,
 *     consultas pendientes de cobro, caja sin cerrar.
 *  2) Email de stock bajo con EmailJS (opcional, max 1 por producto y dia).
 * ===================================================================== */

(function () {
  const grupos = {};   // clave -> { titulo, icono, href, items: [] , tipo }
  let iniciada = false;

  function pintar() {
    const total = Object.keys(grupos).reduce(function (s, k) { return s + grupos[k].items.length; }, 0);
    const num = document.getElementById("campana-num");
    if (num) { num.hidden = !total; num.textContent = total > 99 ? "99+" : total; }
    const panel = document.getElementById("campana-panel");
    if (!panel || panel.hidden) return;
    const orden = ["caja", "cobro", "citas", "vacunas", "stock", "vence"];
    const html = orden.filter(function (k) { return grupos[k] && grupos[k].items.length; }).map(function (k) {
      const g = grupos[k];
      return '<a class="cp-grupo cp-' + g.tipo + '" href="' + g.href + '"><i class="fa-solid ' + g.icono + '"></i><div><b>' + escHTML(g.titulo(g.items.length)) + "</b>" +
        '<small>' + escHTML(g.items.slice(0, 3).join(", ")) + (g.items.length > 3 ? "…" : "") + "</small></div></a>";
    }).join("");
    panel.innerHTML = '<div class="cp-head">Avisos</div>' + (html || '<div class="cp-vacio"><i class="fa-solid fa-circle-check"></i> Todo en orden</div>');
  }
  function grupo(clave, def, items) { grupos[clave] = Object.assign(grupos[clave] || {}, def, { items: items }); pintar(); }
  function escuchar(q, fn) { try { q.onSnapshot(function (s) { fn(docsDe(s)); }, function (e) { console.warn("campana:", e.code, e.message); }); } catch (e) { console.warn(e); } }

  window.iniciarCampana = function () {
    const btn = document.getElementById("btn-campana"), panel = document.getElementById("campana-panel");
    if (!btn) return;
    btn.onclick = function (e) { e.stopPropagation(); panel.hidden = !panel.hidden; pintar(); };
    document.addEventListener("click", function (e) { if (!e.target.closest(".campana-wrap")) panel.hidden = true; });
    if (iniciada) { pintar(); return; }
    iniciada = true;
    const hoy0 = inicioDelDia(), hoy1 = finDelDia();

    if (puede("stock")) {
      escuchar(db.collection("productos").where("stockBajo", "==", true).limit(50), function (l) {
        grupo("stock", { tipo: "warn", icono: "fa-boxes-stacked", href: "stock.html?filtro=bajo", titulo: function (n) { return n + " producto(s) con stock bajo"; } },
          l.filter(function (p) { return !p.eliminado; }).map(function (p) { return p.nombre; }));
      });
      escuchar(db.collection("productos").where("fechaVencimiento", "<=", TS.fromDate(sumarDias(hoy1, 30))).limit(50), function (l) {
        grupo("vence", { tipo: "warn", icono: "fa-hourglass-half", href: "stock.html?filtro=vence", titulo: function (n) { return n + " producto(s) vencen en 30 días"; } },
          l.filter(function (p) { return !p.eliminado && (Number(p.cantidad) || 0) > 0; }).map(function (p) { return p.nombre; }));
      });
    }
    if (puede("agenda")) {
      escuchar(db.collection("citas").where("fecha", ">=", TS.fromDate(hoy0)).where("fecha", "<=", TS.fromDate(hoy1)), function (l) {
        grupo("citas", { tipo: "info", icono: "fa-calendar-check", href: "citas.html?vista=dia", titulo: function (n) { return n + " cita(s) pendientes hoy"; } },
          l.filter(function (c) { return !c.eliminado && ["pendiente", "confirmada", "en espera"].indexOf(c.estado || "pendiente") !== -1; })
            .sort(function (a, b) { return aFecha(a.fecha) - aFecha(b.fecha); }).map(function (c) { return fmtHora(c.fecha) + " " + (c.mascota || ""); }));
      });
    }
    escuchar(db.collection("vacunas").where("vigente", "==", true).where("proximaDosis", "<", TS.fromDate(hoy0)).limit(50), function (l) {
      grupo("vacunas", { tipo: "danger", icono: "fa-shield-virus", href: "recordatorios.html", titulo: function (n) { return n + " vacuna(s) vencida(s)"; } },
        l.filter(function (v) { return !v.eliminado; }).map(function (v) { return (v.mascota || "") + " · " + (v.tipo || ""); }));
    });
    if (puede("facturar")) {
      escuchar(db.collection("consultas").where("porCobrar", "==", true).limit(50), function (l) {
        grupo("cobro", { tipo: "info", icono: "fa-hand-holding-dollar", href: "facturas.html?tab=pendientes", titulo: function (n) { return n + " atención(es) pendiente(s) de cobro"; } },
          l.filter(function (c) { return !c.eliminado; }).map(function (c) { return c.mascota || ""; }));
      });
    }
    if (puede("caja")) {
      escuchar(db.collection("cajas").where("estado", "==", "abierta").limit(1), function (l) {
        grupo("caja", { tipo: "danger", icono: "fa-cash-register", href: "caja.html", titulo: function () { return "Caja abierta desde otro día: hay que cerrarla"; } },
          l.filter(function (c) { const f = aFecha(c.fechaApertura); return f && f < hoy0; }).map(function (c) { return "Abierta el " + fmtFecha(c.fechaApertura); }));
      });
    }
  };
})();

/* ---------- Email de stock bajo (EmailJS, opcional) ---------- */
async function notificarStockBajo(producto) {
  try {
    if (typeof EMAILJS_CONFIG === "undefined" || EMAILJS_CONFIG.serviceId.indexOf("TU_") === 0) return;
    const clave = "mascotita-mail-" + producto.id + "-" + hoyISO();
    if (localStorage.getItem(clave)) return;               // 1 aviso por producto por dia
    const c = await cargarConfig();
    const dest = (c.emailsNotificacion || "").trim();
    if (!dest) return;
    await cargarLib("emailjs");
    emailjs.init(EMAILJS_CONFIG.publicKey);
    const plantilla = c.plantillaStockBajo || "ALERTA: el producto {producto} tiene stock bajo. Cantidad actual: {cantidad} (mínimo: {minimo}).";
    const cuerpo = plantilla.replace(/\{producto\}/g, producto.nombre).replace(/\{cantidad\}/g, producto.cantidad).replace(/\{minimo\}/g, producto.minimoStock);
    await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_email: dest, subject: nombreClinica() + " - Stock bajo: " + producto.nombre, message: cuerpo,
      producto: producto.nombre, cantidad: producto.cantidad, minimo: producto.minimoStock
    });
    localStorage.setItem(clave, "1");
  } catch (e) { console.warn("Aviso de stock por email no enviado:", e); }
}
window.notificarStockBajo = notificarStockBajo;
