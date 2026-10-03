/* Ajustes del proyecto Android generado por "npx cap add android":
 * permisos (camara para el lector de codigos), icono, pantalla de inicio
 * y numero de version. */
const fs = require("fs"), path = require("path");
const AND = path.join(__dirname, "android", "app");
const RES = path.join(AND, "src", "main", "res");
// 1) Permisos
const man = path.join(AND, "src", "main", "AndroidManifest.xml");
let m = fs.readFileSync(man, "utf8");
if (m.indexOf("android.permission.CAMERA") === -1) {
  m = m.replace('<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />');
}
fs.writeFileSync(man, m);
// 2) Iconos y pantalla de inicio propios (se borran los de Capacitor)
for (const d of fs.readdirSync(RES)) {
  const p = path.join(RES, d, "splash.png");
  if (/^drawable/.test(d) && fs.existsSync(p)) fs.rmSync(p);
}
fs.cpSync(path.join(__dirname, "res"), RES, { recursive: true });
// 3) Version: versionCode = numero de compilacion de GitHub
const gr = path.join(AND, "build.gradle");
const code = Number(process.env.GITHUB_RUN_NUMBER || 1);
const nombre = require("./package.json").version + "." + code;
let g = fs.readFileSync(gr, "utf8").replace(/versionCode \d+/, "versionCode " + code).replace(/versionName "[^"]*"/, 'versionName "' + nombre + '"');
fs.writeFileSync(gr, g);
console.log("Android ajustado: version", nombre);
