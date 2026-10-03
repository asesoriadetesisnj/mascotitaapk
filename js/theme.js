/* =====================================================================
 * theme.js — Modo oscuro (preferencia guardada en este equipo)
 * ===================================================================== */
(function () {
  const KEY = "mascotita-theme";
  function leer() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function temaActual() {
    const t = leer(); if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function aplicar(tema) {
    document.documentElement.classList.toggle("dark", tema === "dark");
    const btn = document.getElementById("btn-theme");
    if (btn) btn.innerHTML = tema === "dark" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", tema === "dark" ? "#172229" : "#0f9d68");
  }
  aplicar(temaActual());
  window.toggleTema = function () {
    const nuevo = document.documentElement.classList.contains("dark") ? "light" : "dark";
    try { localStorage.setItem(KEY, nuevo); } catch (e) {}
    aplicar(nuevo);
    document.dispatchEvent(new CustomEvent("tema-cambiado", { detail: nuevo }));
  };
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#btn-theme")) window.toggleTema(); });
  // Re-pintar el icono cuando el layout se dibuja.
  new MutationObserver(function () {
    const b = document.getElementById("btn-theme");
    if (b && !b.dataset.listo) { b.dataset.listo = "1"; aplicar(temaActual()); }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
