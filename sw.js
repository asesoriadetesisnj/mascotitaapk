/* =====================================================================
 * sw.js — Service Worker de Mascotita v3
 *  - Archivos propios (HTML/CSS/JS): RED PRIMERO con copia de respaldo.
 *    Antes era "cache primero": despues de publicar una version nueva,
 *    el usuario seguia con el codigo viejo hasta recargar dos veces.
 *  - Librerias de CDN versionadas (Firebase SDK, iconos, PDF, Excel...):
 *    CACHE PRIMERO (no cambian nunca) => la app abre aun sin internet.
 *  - Los DATOS no pasan por aca: los maneja la persistencia de Firestore.
 * ===================================================================== */
const VERSION = "mascotita-v3.2.0";
const SHELL = ["index.html", "dashboard.html", "pacientes.html", "paciente.html", "consultas.html", "vacunas.html", "cirugias.html", "citas.html",
  "recordatorios.html", "facturas.html", "caja.html", "stock.html", "servicios.html", "compras.html", "reportes.html", "usuarios.html", "auditoria.html",
  "papelera.html", "configuracion.html", "internacion.html", "venta.html", "carnet.html", "css/styles.css", "css/dark-mode.css", "manifest.json", "assets/logo.svg", "assets/logo.png",
  "js/firebase-config.js", "js/main.js", "js/data.js", "js/auditoria.js", "js/whatsapp.js", "js/excel-export.js", "js/pdf-generator.js", "js/notifications.js",
  "js/global-search.js", "js/form-clinica.js", "js/form-factura.js", "js/theme.js", "js/auth.js", "js/dashboard.js", "js/pacientes.js", "js/paciente.js",
  "js/consultas.js", "js/vacunas.js", "js/cirugias.js", "js/citas.js", "js/recordatorios.js", "js/facturas.js", "js/caja.js", "js/stock.js", "js/servicios.js",
  "js/compras.js", "js/reportes.js", "js/usuarios.js", "js/papelera.js", "js/configuracion.js",
  "js/codigos.js", "js/internacion.js", "js/venta.js", "js/importar.js"];
const CDN = ["www.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== "mascotita-cdn"; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (CDN.indexOf(url.hostname) !== -1 && /\.(js|css|woff2?|ttf)$/.test(url.pathname)) {
    e.respondWith(caches.open("mascotita-cdn").then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (r) { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(function (r) {
    if (r && r.ok) { const copia = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); }
    return r;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("dashboard.html"); });
  }));
});
