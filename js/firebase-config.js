/* =====================================================================
 * firebase-config.js
 * ---------------------------------------------------------------------
 * Inicializacion del SDK de Firebase (version compat, cargada por CDN).
 *
 * NOVEDAD v3: PERSISTENCIA OFFLINE + SINCRONIZACION
 *  - Firestore guarda una copia local (IndexedDB) de los datos que se usan.
 *  - Las pantallas cargan al instante desde esa copia y luego se actualizan
 *    solas en tiempo real cuando otro equipo cambia algo.
 *  - Sin internet, los cambios se guardan localmente y se suben solos al
 *    volver la conexion (las operaciones de dinero/stock piden conexion).
 *
 * Las claves de abajo son publicas por diseno: la seguridad real esta en
 * firestore.rules y storage.rules.
 * ===================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyBRmSqv38XQg3yVu0tT7CE-7Q7cakueqvU",
  authDomain: "mascotita-ba796.firebaseapp.com",
  projectId: "mascotita-ba796",
  storageBucket: "mascotita-ba796.firebasestorage.app",
  messagingSenderId: "247981868021",
  appId: "1:247981868021:web:b05ce095aedf0dd04996bc"
};

// "Admin" -> "admin@mascotita.local" (Firebase Auth trabaja con email).
const DOMINIO_INTERNO = "mascotita.local";

// ---- EmailJS (opcional, alertas de stock bajo por email) ----
const EMAILJS_CONFIG = {
  publicKey: "TU_EMAILJS_PUBLIC_KEY",
  serviceId: "TU_EMAILJS_SERVICE_ID",
  templateId: "TU_EMAILJS_TEMPLATE_ID"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Solo para pruebas locales con el Emulador de Firebase (nunca activo en produccion).
const USAR_EMULADOR = !!window.MASCOTITA_EMULADOR;
if (USAR_EMULADOR) {
  auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
  db.useEmulator("127.0.0.1", 8080);
}

// Persistencia local compartida entre pestanas. Debe ir ANTES de cualquier lectura.
db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
  // failed-precondition: otra pestana vieja la tiene tomada; unimplemented: navegador sin soporte.
  console.warn("Persistencia offline no disponible:", e && e.code);
});

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});

if (window.emailjs && EMAILJS_CONFIG.publicKey.indexOf("TU_") !== 0) {
  try { emailjs.init(EMAILJS_CONFIG.publicKey); } catch (e) { /* opcional */ }
}
