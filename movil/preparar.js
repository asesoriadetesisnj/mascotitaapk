/* Copia la app web (la carpeta de arriba) a movil/www para empaquetarla,
 * y agrega capacitor.js (puente con Android) a cada pagina. */
const fs = require("fs"), path = require("path");
const RAIZ = path.join(__dirname, ".."), WWW = path.join(__dirname, "www");
const INCLUIR = ["assets", "css", "js", "manifest.json", "LICENSE"];
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
for (const x of INCLUIR) { const o = path.join(RAIZ, x); if (fs.existsSync(o)) fs.cpSync(o, path.join(WWW, x), { recursive: true }); }
fs.copyFileSync(require.resolve("@capacitor/core/dist/capacitor.js"), path.join(WWW, "js", "capacitor.js"));
let n = 0;
for (const f of fs.readdirSync(RAIZ).filter((x) => x.endsWith(".html"))) {
  let h = fs.readFileSync(path.join(RAIZ, f), "utf8");
  h = h.replace(/<head>/i, '<head>\n  <script src="js/capacitor.js"></script>');
  fs.writeFileSync(path.join(WWW, f), h); n++;
}
console.log("www listo:", n, "páginas");
