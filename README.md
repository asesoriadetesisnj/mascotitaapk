# 🐾 Mascotita v3.2 — Sistema de gestión veterinaria

Aplicación web para clínicas veterinarias: agenda, pacientes, historia clínica,
vacunas, cirugías, recordatorios por WhatsApp, facturación con IVA Paraguay,
caja diaria, stock, compras, reportes, usuarios con roles y auditoría.

**Stack:** HTML + CSS + JavaScript puro (sin compilar) y **Firebase** (Firestore,
Authentication, Storage). Se publica gratis en **Netlify**. No hay servidor propio.

Librerías por CDN, **cargadas solo cuando se usan**: jsPDF + AutoTable (PDF),
SheetJS (Excel), Chart.js (gráficos), html5-qrcode (escáner), JsBarcode (etiquetas),
qrcode-generator (QR del carnet), EmailJS (opcional), Font Awesome (íconos).

> **Novedades v3.2:** **Punto de venta** profesional para farmacia y petshop (lector de códigos,
> teclas F, ventas en espera, pago mixto, presentaciones caja/blíster, balanza, receta y
> controlados, ofertas, devoluciones con nota de crédito, cobros de la clínica desde la caja),
> rol **Cajero/a**, autorización de supervisor y menú unificado con pestañas.
> Ver **[Actualizar a v3.2](#-actualizar-a-v32-desde-v31)**.
>
> **v3.1:** códigos de barras validados + búsqueda del producto en bases
> públicas, etiquetas, inventario por conteo, venta rápida de mostrador, presupuestos,
> internación con hoja de tratamiento, carnet digital con QR, plantillas clínicas,
> cumpleaños, sugerido de compra, importar Excel, productividad por veterinario,
> ticket 80/58 mm y atajos de teclado. Ver **[Actualizar a v3.1](#-actualizar-a-v31-desde-v30)**.

---

## ✨ Qué incluye

| Área | Funciones |
|---|---|
| **Sincronización** | Tiempo real entre todos los equipos. **Modo sin conexión**: pacientes, consultas, citas y vacunas se siguen cargando y se suben solos al volver internet (facturar, cobrar y mover stock piden conexión para no descuadrar números). Indicador "Sincronizado / Guardando / Sin conexión". |
| **Panel** | Agenda del día con botón *Atender*, pendientes de cobro, controles y vacunas próximas, alertas de stock, KPIs del día. |
| **Pacientes** | Alta rápida dueño + mascota en un paso. Fecha de nacimiento (edad automática), sexo, castrado, alergias y condiciones (alerta roja en todos los formularios), fallecido, foto. |
| **Ficha del paciente** | Línea de tiempo con consultas, vacunas, cirugías, citas y facturas; curva de peso; archivos adjuntos; historia clínica y carnet de vacunas en PDF. |
| **Consultas** | Signos vitales (peso, T°, FC, FR, condición corporal, mucosas, TLLC, hidratación), examen físico, receta con medicamentos del stock, adjuntos (análisis, radiografías, PDF), próximo control, notas internas. Al guardar: "¿Cobrar ahora?". |
| **Agenda** | Vistas Mes / Semana / Día / Lista, clic en horario libre para agendar, duración por servicio, color por veterinario, aviso de choque de horario, recordatorio masivo de citas de mañana. |
| **Vacunas** | Solo la última dosis de cada tipo cuenta ("vigente"): se acabaron las vacunas vencidas para siempre. Refuerzo sugerido, descuento del stock. |
| **Cirugías** | Vinculadas al paciente, riesgo ASA, anestesista, checklist, **ficha + consentimiento informado en PDF**, pasa a cobro al finalizar. |
| **Recordatorios** | Cola de avisos por WhatsApp (vacunas, controles, citas de mañana) con botón *Enviar siguiente* y marca de "avisado". |
| **Facturación** | Precios con IVA incluido y tasa por ítem (10% / 5% / exenta), liquidación de IVA, descuentos, contado o crédito, pagos parciales, cuenta corriente por cliente, anulación que repone stock y devuelve por el mismo medio de pago. Numeración atómica (`FAC-0001` o `001-001-0000001` con timbrado). Lector de código de barras. |
| **Caja** | Apertura, ingresos/egresos, totales por medio de pago, arqueo con diferencia y PDF de cierre. |
| **Stock** | IVA, costo, margen, lote, vencimiento, proveedor, ubicación. La cantidad solo cambia con movimientos (entrada, salida, ajuste por conteo) registrados en transacción. |
| **Compras** | Proveedores y carga de compras que suma stock, actualiza costo/lote/vencimiento y puede pagarse desde caja. |
| **Catálogo** | Servicios con precio, IVA y duración en agenda. |
| **Reportes** | Rango libre y comparación con el período anterior: facturado, cobrado, ticket promedio, margen, ingresos por categoría, productos/servicios/clientes top, consultas por veterinario, medios de pago, deudores. Excel con varias hojas. |
| **Administración** | 3 roles, color de agenda por usuario, nunca queda el sistema sin administrador, auditoría inalterable por rango de fechas, **papelera** con restaurar, **respaldo completo en JSON**. |
| **Códigos de barras** | Validación real del dígito verificador (EAN-13, EAN-8, UPC-A, GTIN-14) y país de origen; lectura GS1-128/DataMatrix (carga lote y vencimiento solos). Al escanear un código nuevo busca nombre, marca e imagen en Open Pet Food Facts / Open Food Facts / Open Products Facts / UPCitemdb (lo encontrado queda guardado). Códigos internos EAN-13 (prefijo 20) para productos sin código. Lector USB en cualquier pantalla. |
| **Etiquetas e inventario** | PDF de etiquetas con código de barras y precio (A4 24/40 o rollo térmico 50×25 / 40×30). Inventario por conteo escaneando: compara con el sistema y aplica los ajustes registrados. |
| **Punto de venta** | Caja para cajera con lector: el campo de escaneo siempre listo, `3*` + código para cantidad, búsqueda por nombre/marca/principio activo, catálogo táctil por categoría. **Presentaciones** con su propio código (caja x10, blíster x5) que descuentan las unidades correctas; **otros códigos** del mismo producto; **balanza** (etiquetas de peso o importe por PLU) y venta **suelta** con decimales. **Farmacia:** aviso y registro de receta, medicamentos controlados, vencidos (con autorización), sin stock. **Ofertas** con fecha. **Descuentos** por línea o generales con límite; arriba del límite, bajar un precio o vender vencido piden **usuario y clave de un administrador** sin cerrar la sesión de la cajera. Varias **ventas en espera**. **Pago mixto** (efectivo + tarjeta, etc.), vuelto con billetes sugeridos, cuenta corriente. **Cobros de la clínica** (consultas, cirugías, internación) se agregan a la misma venta. **Consultar precio** sin vender, **ventas de hoy** con reimpresión, **devoluciones** con nota de crédito. Ticket 80/58 mm con código de barras del comprobante; en el programa de Windows, impresión directa sin diálogo. Teclas: F2 buscar · F3 espera · F4 cliente · F6 precio · F7 editar línea · F8 descuento · F9 cobrar · Supr quitar · ↑↓ elegir · +/− cantidad. |
| **Devoluciones** | Nota de crédito (`NC-0001`) parcial o total desde el ticket escaneado: repone stock (salvo vencido/dañado), baja el saldo si era a crédito y devuelve el dinero por el medio elegido desde la caja. Reportes netos de devoluciones. |
| **Presupuestos** | Numeración `P-0001`, PDF con validez y firma, envío por WhatsApp, estados (pendiente/aceptado/rechazado) y facturar con un clic. |
| **Internación** | Ingreso con plan de medicación (c/4-24 h o a demanda), hoja de tratamiento diaria con dosis dadas/omitidas/atrasadas y quién las dio, evolución con signos vitales, alta con aviso por WhatsApp y cobro de los días. |
| **Carnet digital** | Enlace/QR para el dueño con las vacunas al día (página pública `carnet.html`, sin login, solo con el enlace). |
| **Más** | Plantillas clínicas, cumpleaños de pacientes, sugerido de compra por consumo, importación desde Excel (productos y clientes), productividad y comisión por veterinario, guía de inicio en el panel. |
| **Interfaz** | Diseño nuevo, modo oscuro, menú inferior en el celular, tablas que se ven como tarjetas en el celular, búsqueda global Ctrl+K sin tildes y con teclado, atajos (Alt+N, Alt+1…6, ? para ver todos), campana de avisos en tiempo real, PWA instalable. |

### Roles

| Rol | Puede |
|---|---|
| **Administrador** | Todo: usuarios, precios, catálogo, compras, reportes, anular facturas, auditoría, papelera, configuración. |
| **Veterinario** | Pacientes, consultas, vacunas, cirugías, agenda, recordatorios y movimientos de stock. No ve dinero. |
| **Recepción** | Agenda, pacientes, facturación, cobros, caja, recordatorios y movimientos de stock. Ve la historia clínica sin editarla. No anula. |
| **Cajero/a** | Solo punto de venta, comprobantes, caja y stock. Entra directo a la caja. No ve la parte clínica. Descuentos grandes, bajar precios, vender vencidos y devoluciones necesitan la clave de un administrador. |

Los usuarios con el rol antiguo `user` pasan automáticamente a **Veterinario**.

---

## 🚀 Actualizar a v3.2 (desde v3.1)

1. **Subí los archivos** al repositorio.
2. **Volvé a publicar `firestore.rules`** (hay rol Cajero/a, devoluciones y contador de notas de crédito).
3. **No hacen falta índices nuevos.**
4. En **Configuración → Punto de venta**: formato del ticket, descuento máximo sin autorización (10% por defecto), mensaje al pie y, si usás balanza, el prefijo de sus etiquetas.
5. En cada producto de farmacia/petshop podés cargar: oferta, venta suelta, PLU de balanza, receta/controlado, otros códigos y presentaciones (caja, blíster...).
6. Creá el usuario de la cajera en **Usuarios** con el rol **Cajero/a**.
7. Programa de Windows: instalá el nuevo `.exe` y, en el punto de venta, tocá el ícono 🖨️ para elegir la impresora de tickets de esa PC (imprime sin preguntar).

## 🚀 Actualizar a v3.1 (desde v3.0)

1. **Subí los archivos** al repositorio (Netlify publica solo).
2. **Volvé a publicar `firestore.rules`** (Firestore → Reglas → pegar todo → Publicar). Hay colecciones nuevas; sin este paso, internación, presupuestos, carnet y fotos dan "sin permiso".
3. **No hacen falta índices nuevos.**
4. En **Configuración** completá **Dirección pública** con la URL de Netlify (ej. `https://mascotita.netlify.app`): es la que va en el QR del carnet digital.
5. **Fotos de mascotas**: ahora se guardan comprimidas en Firestore (gratis, sin Storage). Storage solo hace falta para **adjuntos** de consultas; activalo en Configuración cuando tengas el plan Blaze.
6. Si usás la app de escritorio, instalá el `.exe` nuevo encima del anterior.

## 🚀 Actualizar desde la versión anterior (v2 → v3)

Los datos existentes **se conservan**. Seguí estos pasos en orden:

1. **Subí los archivos nuevos** al repositorio de GitHub (Netlify publica solo).
2. **Publicá las reglas de Firestore**: Firebase Console → Firestore → *Reglas* → pegá todo `firestore.rules` → **Publicar**.
3. **Publicá las reglas de Storage**: Storage → *Reglas* → pegá `storage.rules` → **Publicar**.
   Firebase va a pedir permiso para que Storage consulte Firestore (para verificar que el usuario esté activo): **aceptalo**.
4. **Creá los 2 índices compuestos**: Firestore → *Índices* → *Compuesto* → *Crear índice*:
   - Colección `vacunas`: `vigente` Ascendente + `proximaDosis` Ascendente.
   - Colección `facturas`: `propietarioId` Ascendente + `fecha` Descendente.

   (Alternativa con la CLI: `npm i -g firebase-tools`, `firebase login`, `firebase deploy --only firestore,storage` desde la carpeta del proyecto: publica reglas e índices juntos.)
   Si falta un índice, la app avisa "Falta un índice" y la consola del navegador trae el enlace directo para crearlo.
5. **Entrá como administrador.** La primera vez la app migra los datos sola (vacunas vigentes, saldos de facturas viejas, roles, contadores). Ves el aviso "Datos actualizados".
6. En **Catálogo**, tocá *Cargar servicios sugeridos* y poné los precios. En **Configuración** completá los datos de la clínica, el timbrado (si corresponde) y el servicio que se cobra por consulta.
7. En **Usuarios**, revisá el rol de cada persona (Veterinario o Recepción).

---

## 🆕 Instalación desde cero

1. **Firebase Console** → *Agregar proyecto*.
2. *Authentication* → *Sign-in method* → habilitá **Correo electrónico/contraseña**.
3. *Firestore Database* → *Crear base de datos* (modo producción).
4. *Storage* → *Comenzar*.
5. *Configuración del proyecto* → *Tus apps* → **</>** → copiá el `firebaseConfig` en `js/firebase-config.js`.
6. Publicá reglas e índices (pasos 2 a 4 de la sección anterior).
7. Subí el proyecto a GitHub y conectalo en **Netlify** (*Add new site → Import from GitHub*). No necesita comando de build.
8. Firebase → Authentication → *Settings* → *Authorized domains*: agregá tu dominio de Netlify.
9. **Primer administrador**: abrí `tools/crear-admin.html` en local (`python3 -m http.server 8080` → `http://localhost:8080/tools/crear-admin.html`); en producción `/tools/*` está bloqueado. Después borrá la carpeta `tools/`.
10. *(Opcional)* EmailJS para avisos de stock bajo: completá `EMAILJS_CONFIG` en `js/firebase-config.js` y los destinatarios en Configuración.

> El usuario escribe `admin`; internamente es `admin@mascotita.local` (Firebase Auth usa emails).
> Si al crear un usuario ponés un email real, esa persona puede recuperar su contraseña sola.

---

## 🗂️ Colecciones de Firestore

| Colección | Contenido |
|---|---|
| `users` | Perfil: `nombre`, `email`, `role` (admin/veterinario/recepcion), `active`, `color`, `lastLogin`. |
| `propietarios` | Dueños: nombre, teléfono, CI, RUC, email, dirección, notas. |
| `mascotas` | `propietarioId`, especie, raza, sexo, `fechaNacimiento`, `castrado`, `alergias`, `condiciones`, `peso`, `estadoVital`, `fotoMini`, `cumpleAvisado`. |
| `consultas` | `mascotaId`, veterinario, motivo, `vitales{}`, examen, diagnóstico, tratamiento, `receta[]`, `adjuntos[]`, `proximoControl`, `porCobrar`, `facturaId`. |
| `vacunas` | `mascotaId`, `tipo`, producto, lote, `fecha`, `proximaDosis`, **`vigente`**, `avisadoEn`. |
| `cirugias` | `mascotaId`, tipo, estado, cirujano, anestesista, ASA, checklist, costo, `porCobrar`. |
| `citas` | `mascotaId` (o texto libre), `fecha` (con hora), `duracion`, `veterinarioUid`, estado, `avisadoEn`. |
| `servicios` | Catálogo: nombre, categoría, precio, IVA, duración, activo. |
| `productos` | Stock: cantidad, mínimo, `stockBajo`, costo, precio, IVA, lote, vencimiento, proveedor, `precioOferta`/`ofertaHasta`, `fraccionable`, `plu`, `requiereReceta`, `controlado`, `principioActivo`, `codigosAlternos[]`, `presentaciones[]` {nombre, codigo, factor, precio}. |
| `movimientos_stock` | Entradas/salidas inalterables con usuario, origen (factura, compra, ajuste...). |
| `proveedores`, `compras` | Proveedores y compras cargadas. |
| `facturas` | Número, cliente, ítems con IVA por línea (y `factor`/`presentacion`/`receta`), gravadas/IVA 10 y 5/exentas, `pagos[]` (pago mixto), `pagado`, `saldo`, estado, `origenes[]` (cargos de la clínica), `canal`, `recibido`/`vuelto`, `autorizaciones[]`, `devuelto`/`itemsDevueltos`/`notasCredito[]`. |
| `cajas`, `caja_movimientos` | Turnos de caja y sus movimientos (inalterables). |
| `estadisticas` | Contadores del panel (evitan descargar colecciones enteras). |
| `auditoria` | Registro de acciones (solo crear). |
| `config` | `general` (clínica, facturación, agenda...), `contadores`, `sistema` (versión de datos). |
| `plantillas_whatsapp` | `recordatorio_cita`, `vacuna`, `control`, `saldo`, `factura`, `alta`, `carnet`, `cumple`. |
| `internaciones` | Paciente, jaula, precio/día, `tratamientos[]` (medicamento, dosis, vía, cada cuántas horas, desde), estado internado/alta, días a cobrar, `porCobrar`. |
| `internacion_registros` | Dosis dadas u omitidas y notas de evolución (solo crear, a nombre de quien las cargó). |
| `presupuestos` | `P-0001`, ítems, total, validez, estado, `facturaId`. |
| `notas_credito` | Devoluciones `NC-0001`: factura, ítems devueltos, total, a cuenta / reintegro, medio, motivo, quién registró y quién autorizó (solo crear). |
| `plantillas_clinicas` | Motivo, examen, diagnóstico, tratamiento y receta reutilizables. |
| `fotos` | Foto de cada mascota comprimida (la miniatura va en `mascotas.fotoMini`). |
| `carnets` | Copia pública del carnet de vacunas; el id es un token largo (nadie puede listarlos). |
| `codigos_cache` | Datos de productos encontrados por código de barras. |

Los registros borrados quedan con `eliminado: true` (papelera) hasta que el administrador los elimine definitivamente.

---

## 📁 Estructura

```
index.html            Ingreso
dashboard.html        Panel
pacientes.html        Mascotas y dueños        paciente.html   Ficha del paciente
internacion.html      Internados               venta.html      Punto de venta (caja)
carnet.html           Carnet digital público (sin login)
consultas.html  vacunas.html  cirugias.html  citas.html (agenda)  recordatorios.html
facturas.html   caja.html  stock.html  servicios.html (catálogo)  compras.html
reportes.html   usuarios.html  auditoria.html  papelera.html  configuracion.html
css/styles.css, css/dark-mode.css
js/
  firebase-config.js   Claves + persistencia offline
  main.js              Núcleo: roles, formato, modales, tablas, selector, layout, sincronización
  data.js              Listas en tiempo real compartidas, estadísticas, papelera, inventario, caja, migración
  form-clinica.js      Formularios: dueño, mascota, paciente nuevo, consulta, vacuna, cirugía, cita
  form-factura.js      Factura, cobros, anulación, apertura de caja, escáner
  pdf-generator.js     Receta, historia, carnet, cirugía + consentimiento, factura, cierre de caja
  notifications.js     Campana de avisos + email de stock bajo
  global-search.js     Búsqueda Ctrl+K
  codigos.js           Validación GS1, búsqueda por código en bases públicas, códigos internos, etiquetas, RUC, lector USB
  importar.js          Importación desde Excel (Configuración)
  whatsapp.js  excel-export.js  auditoria.js  theme.js  auth.js
  <una por página>.js
firestore.rules  firestore.indexes.json  storage.rules  firebase.json
sw.js  manifest.json  netlify.toml  tools/crear-admin.html
```

---

## 🔒 Seguridad

- La seguridad real está en `firestore.rules` y `storage.rules` (no en la interfaz).
- Facturas: nadie puede cambiar número ni total después de emitir; solo el administrador anula. El contador de facturas solo puede avanzar de a uno.
- Auditoría, movimientos de stock y de caja no se pueden editar ni borrar.
- Recepción no puede cambiar precios ni productos; solo mueve cantidades.
- Cierre de sesión por inactividad (30 min) y al desactivar un usuario (en el momento).
- Recomendado: activar **App Check** y restringir la API key a tu dominio en Google Cloud.

## ⚠️ Límites (sin servidor propio)

- Los recordatorios por WhatsApp se envían con un clic cada uno (enlaces `wa.me`). Para que salgan solos haría falta el plan Blaze de Firebase con Cloud Functions y la API de WhatsApp Business.
- El comprobante no es factura electrónica SIFEN: con timbrado configurado sirve como factura preimpresa/autoimpresor según tu habilitación.
- **Bases de códigos de barras**: son públicas y gratuitas; tienen muchos alimentos y accesorios, pero pocos medicamentos veterinarios. Si no encuentra el producto, se carga a mano una vez y queda guardado. UPCitemdb gratis permite ~100 consultas por día.
- **RUC**: el dígito verificador se revisa con el algoritmo módulo 11 de la SET solo como **aviso** (no bloquea). No consulta el padrón de la SET.
- Pensado para una clínica de hasta unos 10.000 pacientes: las listas de mascotas, dueños y productos se sincronizan completas para buscar al instante.

## 🧪 Probar en local

```bash
python3 -m http.server 8080      # luego abrí http://localhost:8080
```

MIT. Uso libre para tu veterinaria.
