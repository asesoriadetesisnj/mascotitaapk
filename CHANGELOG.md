# Cambios v3.2

## Punto de venta (antes "Venta rápida")
- Pantalla de caja para cajera con lector: escaneo siempre listo, multiplicador `3*`, búsqueda por nombre/marca/principio activo, catálogo táctil por categoría.
- Teclas F2/F3/F4/F6/F7/F8/F9, Supr, flechas y +/−.
- Ventas en espera (varias a la vez, se guardan en el equipo).
- Pago mixto, vuelto con billetes sugeridos, efectivo "justo" con Enter, cuenta corriente para clientes registrados.
- Presentaciones con código propio (caja, blíster), códigos alternativos, etiquetas de balanza (peso o importe) y venta suelta con decimales.
- Farmacia: receta y controlados (queda en el comprobante), vencidos con autorización, control de stock en el momento.
- Ofertas con fecha; descuentos por línea y generales con límite configurable.
- Autorización de supervisor (usuario y clave de un administrador sin cerrar la sesión de la cajera), registrada en la factura y en auditoría.
- Cobros de la clínica (consultas, cirugías, internaciones) en la misma venta, con aviso de deuda del cliente.
- Consultar precio, ventas de hoy con reimpresión, pantalla completa, barra de cobro en el celular.
- Ticket con código de barras del comprobante; impresión directa sin diálogo en el programa de Windows (impresora por equipo).

## Devoluciones
- Notas de crédito parciales o totales (escaneando el ticket), reposición de stock opcional, reintegro por el medio elegido o baja del saldo. Pestaña "Devoluciones" en Comprobantes. Reportes netos de devoluciones.

## Roles y menú
- Nuevo rol Cajero/a (entra directo a la caja, sin parte clínica).
- Menú unificado: Atención clínica (consultas, vacunas, cirugías, internación), Ventas (punto de venta, comprobantes, caja), Inventario (productos, servicios, compras), Auditoría y papelera, con pestañas arriba.

## Reportes
- Facturado neto, ventas por cajero/a, ventas por hora, devoluciones por motivo.

## Reglas
- Rol cajero, colección `notas_credito`, contador `notaCredito`. **Hay que volver a publicar `firestore.rules`.**

---

# Cambios v3.1

## Códigos de barras
- Validación del dígito verificador (EAN-13, EAN-8, UPC-A, GTIN-14) en vivo, con país de origen.
- Lectura GS1-128 / DataMatrix: lote y vencimiento se cargan solos.
- Búsqueda del producto por código en Open Pet Food Facts, Open Food Facts, Open Products Facts y UPCitemdb (resultado guardado en `codigos_cache`).
- Códigos internos EAN-13 (prefijo 20) para productos sin código; etiquetas en PDF (A4 y rollo térmico).
- Lector USB en cualquier pantalla: abre el producto, lo agrega a la factura, a la compra o al conteo.
- Inventario por conteo con escáner (continuo por cámara o lector) y ajuste en bloque.
- Stock: filtros "sin código" y "código inválido", campo Marca.

## Clínica
- Internación con hoja de tratamiento, dosis atrasadas, evolución, alta y cobro por días.
- Plantillas clínicas para consultas frecuentes.
- Carnet digital con QR/enlace para el dueño (`carnet.html`).
- Fotos de mascotas guardadas en Firestore (ya no requieren Storage ni plan pago).
- Cumpleaños de pacientes en Recordatorios con mensaje de WhatsApp.

## Ventas y gestión
- Venta rápida de mostrador con vuelto y billetes sugeridos.
- Presupuestos con PDF, WhatsApp y facturación con un clic.
- Ticket 80 / 58 mm y opción de imprimir al emitir.
- Sugerido de compra según consumo, con pedido por WhatsApp al proveedor.
- Importar productos y clientes desde Excel con vista previa.
- Productividad y comisión por veterinario en Reportes.
- Validación de RUC (aviso).

## Interfaz
- Atajos de teclado (Alt+N, Alt+1…6, ?), guía de inicio en el panel, imágenes rotas reemplazadas por íconos, barra de total en la venta desde el celular.

## Reglas
- Nuevas colecciones: internaciones, internacion_registros, presupuestos, plantillas_clinicas, fotos, carnets, codigos_cache. **Hay que volver a publicar `firestore.rules`.**

---

# Cambios v3.0

## Errores corregidos
- Vacunas: una vacuna quedaba "vencida" para siempre aunque se aplicara el refuerzo. Ahora solo cuenta la última dosis de cada tipo.
- Doble clic en "Guardar" creaba registros duplicados (consultas, citas, cirugías, mascotas, dueños). Todos los formularios están protegidos.
- Filtro de fecha de Auditoría desfasado un día (usaba UTC).
- La cámara del escáner quedaba encendida al cerrar con Esc o clic afuera.
- Cerrar una confirmación con Esc dejaba la acción colgada.
- El historial clínico se cortaba en las últimas 300 consultas de toda la clínica; ahora la ficha trae todo el historial del paciente.
- La agenda solo cargaba las últimas 500 citas; ahora carga exactamente el rango que se ve.
- Reportes: "Ingresos por servicio" solo sumaba cirugías; ahora usa lo facturado real.
- Cada acción esperaba a un servicio externo de IP antes de registrarse en auditoría.
- Las fotos reemplazadas o de mascotas eliminadas quedaban ocupando espacio en Storage.
- Después de publicar una versión, el usuario seguía con código viejo hasta recargar dos veces (service worker).
- El auto-foco de los formularios podía robar el foco mientras se escribía (o se usaba un lector de códigos).

## Sincronización y rendimiento
- Persistencia offline de Firestore + listas en tiempo real en todas las pantallas.
- Indicador de sincronización; trabajar sin conexión sin que la pantalla se cuelgue.
- Panel con estadísticas agregadas (antes descargaba colecciones completas para contar).
- Búsqueda global sin descargas por tecla, sin tildes y navegable con teclado.
- Consultas acotadas por rango (reportes, agenda, auditoría, consultas) y paginación.
- Librerías pesadas cargadas solo cuando se usan; librerías de CDN cacheadas para abrir sin internet.

## Funciones nuevas
- Ficha completa del paciente, consulta clínica profesional, adjuntos, curva de peso.
- Agenda Mes/Semana/Día/Lista con duración, colores por veterinario y "Atender".
- Catálogo de servicios, facturación con IVA Paraguay por ítem, pagos parciales, cuenta corriente, anulación con reposición de stock.
- Caja diaria con arqueo; compras y proveedores.
- Centro de recordatorios por WhatsApp; campana de avisos.
- Reportes con comparación de períodos y Excel de varias hojas.
- Roles Administrador / Veterinario / Recepción; papelera; respaldo JSON; consentimiento informado PDF.

## Seguridad
- Reglas reescritas por rol; números y totales de facturas inalterables; contador que solo avanza de a uno.
- Movimientos de stock y caja inalterables; Storage verifica que el usuario esté activo.
- Desactivar un usuario o cambiarle el rol se aplica al instante.

## Diseño
- Interfaz renovada, modo oscuro completo, navegación inferior y tablas tipo tarjeta en el celular.
