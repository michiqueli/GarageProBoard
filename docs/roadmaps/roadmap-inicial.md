# Roadmap inicial

Estado al 10/09/2026. Los hitos están ordenados por dependencia, no por deseo: cada
uno necesita el anterior. Lo que no está acá no está decidido todavía.

Leyenda: ✅ hecho · 🔨 en curso · ⬜ pendiente

---

## Hito 0 — Cimientos ✅

Monorepo, entorno reproducible y aislamiento multi-tenant probado.

- ✅ Monorepo pnpm + Turborepo + Biome
- ✅ `docker compose` con Postgres 18 (puerto 5433) y Redis 8
- ✅ Esquema del núcleo: 22 tablas
- ✅ RLS forzado en 18 tablas, con `app_tenant_id()` y política por tabla
- ✅ Rol de aplicación sin `BYPASSRLS` y sin ser dueño de nada
- ✅ 9 tests de aislamiento con Testcontainers contra Postgres real
- ✅ API que arranca y responde, front que la consulta
- ✅ Contrato oRPC compartido
- ✅ Documento OpenAPI y Swagger UI generados desde el contrato
- ✅ Catálogo de acciones con atajo configurable y sus tablas (`usuario_config`,
  `usuario_atajo`), con 26 tests en `@garagetick/core`

---

## Hito 1 — Entrar al sistema ⬜

Sin esto no hay pantalla que mostrar a nadie.

- ✅ Login con argon2, access de 15 min y refresco rotativo de 30 días con detección
      de reuso. 14 tests de integración.
- ✅ Semillas: catálogos y una concesionaria de ejemplo con dos razones sociales
- ⬜ Al crear un usuario desde la aplicación, sembrar su config y su mapa de atajos
- ⬜ Resolución del tenant desde el token y `conTenant()` como interceptor de Nest,
      para que ninguna consulta pueda salir sin tenant por olvido
- ✅ Roles y permisos con CASL, compartidos entre API y front (falta aplicarlos en
      las pantallas y como guardia por operación)
- ✅ Elección de sucursal al entrar, y cambio de sucursal sin volver a autenticarse
- ⬜ Semilla de datos: provincias, condiciones de IVA y tipos de comprobante desde
      los web services de AFIP, no escritos a mano
- ✅ **Sistema de diseño escrito** (`docs/tecnicos/sistema-de-diseno.md`) y skill
      `ui-garagetick` que lo aplica sola. Falta implementar los tokens en
      `index.css` y el registro de atajos en `apps/web/src/teclado/`.
- ✅ Tokens del `@theme` en `index.css`, con tema claro y oscuro
- ✅ Registro único de atajos en `apps/web/src/teclado/` + barra de estado, leyendo
      del mapa del usuario. 11 tests contra un DOM real.
- ✅ Shell: navegación, encabezado, barra de estado
- ✅ Patrón de listado responsive, aplicado en la pantalla de OT
- ⬜ Pantalla **Configuración → Teclas rápidas**, agrupada por módulo, con captura de
      la combinación y los motivos de rechazo escritos
- ⬜ Enrutado con TanStack Router y sesión (el shell ya está, falta el router)
- ⬜ Barra de estado inferior con las teclas activas del contexto
- ✅ Cookie httpOnly para el refresco, con entrega por cuerpo para clientes sin cookies
- ✅ Login sólo con correo y contraseña: el tenant sale del usuario
- ⬜ Auditoría automática de altas, modificaciones y bajas
- ⬜ Pantalla de configuración: sucursal predeterminada, tema, densidad y teclas
- ⬜ Aplicar CASL en las pantallas y como guardia por operación

**Criterio de terminado:** un usuario entra, elige sucursal, y lo que ve depende de
sus permisos.

---

## Hito 2 — El núcleo, con pantallas ⬜

Las entidades ya están modeladas; falta poder operarlas.

- ⬜ ABM de empresas, sucursales y puntos de venta
- ⬜ ABM de entidades comerciales con consulta al padrón de AFIP por CUIT
- 🔨 ABM de vehículos: listado y alta contra la API; falta edición y titularidad
- ⬜ Búsqueda única: por patente, por chasis, por cliente, por CUIT
- ⬜ Ficha del vehículo con su historia completa, incluidos los titulares anteriores
- ✅ **Patrón de listado responsive** resuelto en la pantalla de OT: tabla densa en
      escritorio, tarjetas en teléfono, eligiendo cuál renderizar en vez de ocultar
      una con CSS.

**Criterio de terminado:** se puede cargar una concesionaria entera desde cero.

---

## Hito 3 — Facturación electrónica ⬜

La barrera de entrada más alta. Nada se vende sin esto.

- ⬜ Adaptador de `@arcasdk/core` detrás del puerto `ServicioFiscal`
- ⬜ Almacenamiento cifrado de certificados por empresa
- ⬜ WSAA: token y sign, con caché hasta el vencimiento
- ⬜ Numeración sin huecos: `select ... for update` en la misma transacción que el CAE
- ⬜ Matriz emisor × receptor como tabla de reglas
- ⬜ PDF del comprobante con QR y código de barras
- ⬜ Cola de reintentos en BullMQ para cuando AFIP no responde
- ⬜ Circuito completo probado en homologación

**Criterio de terminado:** se emite una factura A y una B en homologación, con CAE,
y el PDF valida contra el QR.

---

## Hito 4 — Taller: la orden de trabajo ⬜

El corazón del producto y lo que el nombre promete.

- ⬜ Turnos y agenda
- ⬜ Apertura de OT con los cuatro roles (titular, quien trae, quien autoriza,
      quien paga)
- ⬜ Operaciones con tiempos de referencia por terminal
- ⬜ Fichaje de mecánicos: tiempo real contra tiempo de referencia
- ⬜ Repuestos consumidos, con descuento de stock
- ⬜ Presupuesto, autorización y cierre
- ⬜ Facturación de la OT
- ⬜ **Tablero de piso en tiempo real**: qué auto, quién lo tiene, cuánto lleva.
      Es la pantalla que vende el producto en una demo.
- ⬜ Flujo de recepción **sin tocar el mouse**: el asesor compite con la velocidad
      del operador de Oversoft y esto no se puede agregar después

**Criterio de terminado:** una orden entra, se trabaja, se factura y se cobra.

---

## Más adelante, sin fecha

- **Repuestos**: stock, pedidos a fábrica, mostrador
- **Garantías**: reclamos a terminal, cada una con su formato y su portal
- **Cuenta corriente y cobranzas**: recibos, retenciones, compensación de saldos
- **Ventas 0km y usados**: prospectos, planes de ahorro, patentamiento, prenda
- **RRHH**: legajo, asistencia, liquidación con convenio SMATA
- **`apps/mobile`**: app nativa para el piso de taller — fichaje, fotos de daño para
  garantía, escaneo de chasis, y cola offline porque el fondo del taller no tiene wifi

## Deuda técnica registrada

Cosas que sabemos que faltan, para que no se descubran de golpe:

- **Enrutado.** La navegación es estado local, no URL. Con dos pantallas alcanza; con
  cinco no. TanStack Router entra antes de que se note.

- **Backups de Postgres antes del primer cliente en producción.** Vamos a guardar
  comprobantes fiscales de terceros con obligación legal de conservación. `pgBackRest`
  o `wal-g` contra un bucket S3-compatible, con restauración **probada**, no solo
  configurada. Un VPS autogestionado sin backup probado es la forma de perder el
  negocio en una tarde.
- **Convenio Multilateral de Ingresos Brutos**: los campos están en el esquema, la
  lógica de coeficientes y retenciones por jurisdicción no.
- El adaptador de AFIP está pendiente a propósito: sin certificados de homologación
  cargados no hay forma de verificar que ande, y un adaptador que nadie probó contra
  AFIP es peor que ninguno porque parece que funciona.
