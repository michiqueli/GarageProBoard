# Roadmap inicial

Estado al 16/09/2026. Los hitos están ordenados por dependencia, no por deseo: cada
uno necesita el anterior. Lo que no está acá no está decidido todavía.

Leyenda: ✅ hecho · 🔨 en curso · ⬜ pendiente

---

## Hito 0 — Cimientos ✅

Monorepo, entorno reproducible y aislamiento multi-tenant probado.

- ✅ Monorepo pnpm + Turborepo + Biome
- ✅ `docker compose` con Postgres 18 (puerto 5433) y Redis 8
- ✅ Esquema del núcleo: 25 tablas
- ✅ RLS forzado en 21 tablas, con `app_tenant_id()` y política por tabla
- ✅ Rol de aplicación sin `BYPASSRLS` y sin ser dueño de nada
- ✅ 9 tests de aislamiento con Testcontainers contra Postgres real
- ✅ API que arranca y responde, front que la consulta
- ✅ Contrato oRPC compartido
- ✅ Documento OpenAPI y Swagger UI generados desde el contrato
- ✅ Catálogo de acciones con atajo configurable y sus tablas (`usuario_config`,
  `usuario_atajo`), con 26 tests en `@gpb/core`

---

## Hito 1 — Entrar al sistema ⬜

Sin esto no hay pantalla que mostrar a nadie.

- ✅ Login con argon2, access de 15 min y refresco rotativo de 30 días con detección
      de reuso. 14 tests de integración.
- ✅ Semillas: catálogos y una concesionaria de ejemplo con dos razones sociales
- ⬜ Al crear un usuario desde la aplicación, sembrar su config y su mapa de atajos
- ✅ Resolución del tenant desde el token: un interceptor deja la sesión en el contexto
      del pedido y `DatosDelTenant.transaccion()` la toma sola, sin parámetro de tenant
- ✅ Roles y permisos con CASL, compartidos entre API y front
- ✅ Permiso por operación **declarado en el contrato** y aplicado por una guardia
      única, con las reglas leídas de la base en cada pedido. Una ruta sin acceso
      declarado no deja arrancar la API. 28 tests nuevos.
- ✅ Elección de sucursal al entrar, y cambio de sucursal sin volver a autenticarse
- ⬜ Semilla de datos: provincias, condiciones de IVA y tipos de comprobante desde
      los web services de AFIP, no escritos a mano
- ✅ **Sistema de diseño escrito** (`docs/tecnicos/sistema-de-diseno.md`) y skill
      `ui-gpb` que lo aplica sola. Falta implementar los tokens en
      `index.css` y el registro de atajos en `apps/web/src/teclado/`.
- ✅ Tokens del `@theme` en `index.css`, con tema claro y oscuro
- ✅ Registro único de atajos en `apps/web/src/teclado/` + barra de estado, leyendo
      del mapa del usuario. 11 tests contra un DOM real.
- ✅ Shell: navegación, encabezado, barra de estado
- ✅ Patrón de listado responsive, aplicado en la pantalla de OT
- ⬜ Pantalla **Configuración → Teclas rápidas**, agrupada por módulo, con captura de
      la combinación y los motivos de rechazo escritos
- ✅ Enrutado con TanStack Router: guardias de sesión y sucursal, `volver` al entrar,
      búsqueda en la URL y el módulo del teclado declarado por la ruta. 21 tests nuevos.
- ✅ Barra de estado inferior con las teclas activas del contexto
- ✅ Cookie httpOnly para el refresco, con entrega por cuerpo para clientes sin cookies
- ✅ Login sólo con correo y contraseña: el tenant sale del usuario
- ⬜ Auditoría automática de altas, modificaciones y bajas
- ⬜ Pantalla de configuración: sucursal predeterminada, tema, densidad y teclas
- ✅ CASL aplicado **en las pantallas**: el menú esconde lo que el usuario no puede
      ver, los botones con atajo no se dibujan sin permiso —y así tampoco registran su
      tecla—, el inicio lleva a la primera pantalla que le toque, y una pantalla sin
      permiso dice qué falta sin sacarlo del sistema. Todo leyendo la misma declaración
      del contrato que aplica la API, con `accesoDeRuta()` y `permite()` compartidos.
      10 tests nuevos

**Criterio de terminado:** un usuario entra, elige sucursal, y lo que ve depende de
sus permisos.

---

## Hito 1.5 — Módulos activables y back-office ⬜

Lleva medio número porque no estaba en el plan y entra antes que las pantallas del
núcleo: cada pantalla que se escriba sin el filtro de módulo es una más para revisar
después. El mapa, la configuración por módulo y quién puede tocarla, en
[módulos del sistema](../tecnicos/modulos-del-sistema.md).

- ✅ Mapa de módulos cerrado: núcleo, contable, servicios, repuestos, cartera, ventas
      y rrhh, con el flag colgando de la pantalla y no de la entidad
- ✅ Dependencias declaradas entre módulos, con `dependenciasRotas()` lista para el back-office
- ✅ El back-office no deja un módulo prendido sin su piso: apagar arrastra a los que
      dependen, con aviso, y prender sin lo necesario se rechaza
- ✅ Acción `configurar` en el catálogo de permisos: entrar a un módulo no es poder
      tocar sus credenciales. Ningún rol predefinido la trae salvo el gerente
- ⬜ Pantalla de configuración **adentro de cada módulo**, más un índice que las liste
- ⬜ **Buscador del sistema en la barra lateral**, la misma cosa que la paleta de `F10`:
      «mercado pago» lleva a su configuración y «certificados» a los de AFIP. Con
      palabras clave por entrada, y filtrado por permiso y por módulo como el menú
- ✅ Módulos contratados por tenant en el esquema, con su flag y su vigencia — y el rol
      de la API sin permiso para escribirlos
- ✅ El contrato declara a qué módulo pertenece cada ruta, al lado del permiso
- ✅ La API rechaza la operación de un módulo apagado, antes de mirar permisos
- ✅ El menú y las rutas filtran por módulo **y** por permiso, con mensajes distintos
- ✅ Back-office aparte, en `apps/backoffice`: operadores propios, alta de
      concesionarias, módulos con vigencia, suspensión y auditoría. Con su propio rol de
      Postgres, que no lee datos de las concesionarias
- ⬜ Planes y estado de cuenta en el back-office
- ⬜ Segundo factor (TOTP) para los operadores
- ⬜ Exportación al darse de baja: el acceso se apaga, el registro se conserva — un
      comprobante fiscal se guarda diez años y la obligación es nuestra

**Criterio de terminado:** se le apaga un módulo a una concesionaria de prueba y
desaparece de su sistema, sin tocar código y sin que se pierda un dato.

---

## Hito 2 — El núcleo, con pantallas ⬜

Las entidades ya están modeladas; falta poder operarlas.

- ⬜ ABM de empresas, sucursales y puntos de venta
- ⬜ ABM de usuarios y roles, con el rol predefinido «Administrador de usuarios» y las
      dos reglas que impiden que se convierta en gerente: nadie da lo que no tiene, y
      nadie toca sus propios roles. En [usuarios y roles](../tecnicos/usuarios-y-roles.md)
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

El corazón del producto y lo que el nombre promete. **La base no se arranca de cero:**
sale de GarageTick, la aplicación anterior del autor, relevada con una concesionaria de
verdad. Qué se trae y qué cambia ahora que el DMS es nuestro, en
[control de tiempos de taller](../tecnicos/taller-control-de-tiempos.md).

- ⬜ Turnos y agenda
- ⬜ Apertura de OT con los cuatro roles (titular, quien trae, quien autoriza,
      quien paga)
- ⬜ Operaciones con tiempos de referencia por terminal
- ⬜ Fichaje de mecánicos por QR: dos escaneos, tres segundos, sin login. Tiempo real
      contra tiempo de referencia
- ⬜ QR firmado impreso en la propia OT, con fallback numérico
- ⬜ Esperas con motivo: sin eso no se explica por qué un auto estuvo seis días
- ⬜ Auto-cierre de fin de turno, también al arrancar el servidor
- ⬜ Correcciones de tiempo con auditoría y motivo obligatorio
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

- **El bundle del front pesa 518 kB.** Con el router puesto, partirlo por ruta es
  declarar las pantallas como carga diferida; conviene hacerlo antes de que crezca.
- **Recargar antes de elegir sucursal entra a la primera.** Si alguien recarga la página
  justo en «¿A qué sucursal entrás?», la sesión recuperada no sabe que faltaba elegir.
  Cerrarlo del todo requiere que el servidor recuerde que la elección está pendiente.

- **En teléfono no hay menú.** La barra lateral está oculta por debajo de `md` y no hay
  todavía una puerta que la reemplace: en un teléfono se llega a las pantallas por la URL
  y nada más. Cuando entre el buscador del sistema hay que resolver las dos cosas juntas,
  porque comparten el lugar.

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
