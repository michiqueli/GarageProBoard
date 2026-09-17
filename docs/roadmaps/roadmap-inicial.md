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
- ✅ **Buscador del sistema en la barra lateral**, la misma cosa que la paleta de `F10`:
      «afip» lista certificados, padrón, puntos de venta y facturación. Índice en
      `apps/web/src/indice.ts`, con palabras clave por entrada y filtrado por permiso
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

- ✅ ABM de empresas, sucursales y puntos de venta: una SAS por sucursal, CUIT con
      dígito verificador, número de punto de venta único por CUIT, nada se borra
- ✅ ABM de usuarios, con el rol predefinido «Administrador de usuarios» y las reglas
      que impiden que se convierta en gerente: nadie da lo que no tiene, y nadie modifica a
      quien tiene más permisos. En [usuarios y roles](../tecnicos/usuarios-y-roles.md)
- ✅ Administrador de sistema: asigna cualquier rol y modifica a cualquiera, con cada
      ingreso asociado a su computadora, aviso al afectado y pantalla de Auditoría
- ✅ Crear, clonar y editar roles: con casillas, conservando las reglas con condiciones, sin
      que nadie edite el suyo ni el que puede todo
- ✅ Registrar Usuarios en el índice del buscador del sistema
- ✅ Consulta al padrón de AFIP por CUIT: constancia de inscripción y A13 de respaldo,
      condición frente al IVA informada o deducida, probada contra AFIP
- 🔨 ABM de entidades comerciales, usando la consulta al padrón: clientes ✅, con el
      documento validado según su tipo y sin duplicar al que ya es proveedor. Proveedores ✅,
      en Repuestos
- ✅ ABM de vehículos: alta con marca, modelo y titular, edición sin tocar el chasis, y
      transferencia de titular que cierra la anterior sin borrarla
- ✅ Búsqueda única en el encabezado (`F3`): por patente, por chasis, por cliente, por CUIT,
      cada grupo según los permisos de quien busca
- 🔨 Ficha del vehículo con su historia: titulares anteriores con sus fechas y los cambios
      contados en palabras. Faltan las órdenes de trabajo, que llegan con el Hito 4
- ✅ **Patrón de listado responsive** resuelto en la pantalla de OT: tabla densa en
      escritorio, tarjetas en teléfono, eligiendo cuál renderizar en vez de ocultar
      una con CSS.

**Criterio de terminado:** se puede cargar una concesionaria entera desde cero.

---

## Hito 3 — Facturación electrónica ⬜

La barrera de entrada más alta. Nada se vende sin esto.

- ✅ Adaptador de `@arcasdk/core` detrás del puerto `ServicioFiscal`: comprobante armado
      desde el precio final con el IVA cerrado al centavo, rechazos interpretados y QR
- ✅ Asistente de certificados por razón social: el sistema genera la clave y el pedido,
      guía los pasos en ARCA y verifica el certificado contra AFIP antes de aceptarlo. Ver
      [certificados de AFIP](../tecnicos/afip-certificados.md)
- ✅ Almacenamiento cifrado de certificados por empresa, en Postgres con AES-256-GCM
- ✅ WSAA: token y sign, con caché hasta el vencimiento (lo hace el SDK, un ticket por CUIT)
- ✅ Numeración sin huecos: el número se le pide a AFIP y un índice único impide dos
      comprobantes en vuelo por serie, sin transacciones abiertas mientras AFIP contesta. Si
      AFIP no contesta, el comprobante queda incierto y se verifica con `FECompConsultar`
- ✅ Matriz emisor × receptor como tabla de reglas, con el control de la RG 5.616. Con
      CUIT, la condición del receptor sale del padrón al emitir
- ✅ PDF del comprobante con QR (`@gpb/pdf`: el formato de «Comprobantes en línea»; sin
      código de barras, que la RG 4.892 reemplazó por el QR), conectado a la emisión
- ✅ Mandar el PDF por mail al receptor (SMTP; Mailpit en desarrollo)
- 🔨 Notas de crédito ✅, con el comprobante asociado: anular una factura la devuelve a caja.
      Faltan las notas de débito
- ✅ Pantalla de Caja: facturar a consumidor final, a un cliente o a un CUIT; últimos
      comprobantes con PDF y verificación de inciertos
- ✅ Importar un certificado que ya se usa en otro sistema
- ⬜ Cola de reintentos en BullMQ para cuando AFIP no responde
- 🔨 Circuito probado contra AFIP: una Factura B real en producción (16/09/2026, punto de
      venta 8). Falta hacerlo desde la aplicación, con numeración, comprobante guardado y PDF

**Criterio de terminado:** se emite una factura A y una B en homologación, con CAE,
y el PDF valida contra el QR.

---

## Hito 4 — Taller: la orden de trabajo ⬜

El corazón del producto y lo que el nombre promete. **La base no se arranca de cero:**
sale de GarageTick, la aplicación anterior del autor, relevada con una concesionaria de
verdad. Qué se trae y qué cambia ahora que el DMS es nuestro, en
[control de tiempos de taller](../tecnicos/taller-control-de-tiempos.md).

- ⬜ Turnos y agenda
- ✅ Apertura de OT con los cuatro roles: titular, quien trae, quien autoriza y quien paga
- ⬜ Operaciones con tiempos de referencia por terminal
- ⬜ Fichaje de mecánicos por QR: dos escaneos, tres segundos, sin login. Tiempo real
      contra tiempo de referencia
- ✅ QR firmado impreso en la propia OT (`GT1:O:…`), con el número para tipear. Copia taller y
      copia cliente con firma de conformidad
- ⬜ Esperas con motivo: sin eso no se explica por qué un auto estuvo seis días
- ⬜ Auto-cierre de fin de turno, también al arrancar el servidor
- ⬜ Correcciones de tiempo con auditoría y motivo obligatorio
- ✅ Repuestos consumidos, con descuento de stock: la orden busca en el catálogo y el stock
      sigue a sus renglones; los pedidos de repuestos del taller pasan a la orden al entregarlos.
      Ver [repuestos](../tecnicos/repuestos.md)
- ✅ Trabajos y repuestos con precio final, estados del taller y cierre (terminar → caja)
- ✅ **Presupuesto y autorización**: se arma con los renglones elegidos (PDF con una casilla por
      renglón, por mail), la orden espera autorización y lo presupuestado no se toca. La respuesta
      dice quién autorizó y por qué medio; lo rechazado no se cobra y sus repuestos vuelven al
      stock. Sin respuesta, la orden no se termina
- ⬜ **Catálogo de services**: los services de cada marca (10.000, 20.000, …) con sus trabajos,
      repuestos y **tiempo estipulado**, más un service genérico que se completa a mano. Cargarlos
      en una OT la completa de un toque, y el tiempo estipulado sirve para comparar con el real.
      Hay un Excel de Renault con los tiempos para importar como primer catálogo
- ✅ Facturación de la OT: panel «Órdenes para facturar» en caja; anular la factura la devuelve
- ⬜ **Tablero de piso en tiempo real**: qué auto, quién lo tiene, cuánto lleva.
      Es la pantalla que vende el producto en una demo.
- ✅ Flujo de recepción **sin tocar el mouse**: patente, Enter, Tab, F2

**Criterio de terminado:** una orden entra, se trabaja, se factura y se cobra.

---

## Más adelante, sin fecha

- **Control de asistencia en RRHH con el mismo QR del taller**: la credencial firmada
      (`GT1:M:…`, en `packages/core/src/qr.ts`) marca la entrada y la salida de todos los
      empleados, no sólo el fichaje de los mecánicos en las órdenes

- **Repuestos** 🔨: catálogo, stock por sucursal con movimientos, ajustes y transferencias,
      pedidos (con chasis; a una orden, a un cliente o de mostrador) facturados en caja, compras
      a proveedores con recepción, y proveedores ✅. Falta importar la lista de precios de la
      terminal, reservas y el pedido a fábrica desde el mínimo
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

- **Backups de Postgres antes del primer cliente en producción.** Vamos a guardar
  comprobantes fiscales de terceros con obligación legal de conservación. `pgBackRest`
  o `wal-g` contra un bucket S3-compatible, con restauración **probada**, no solo
  configurada. Un VPS autogestionado sin backup probado es la forma de perder el
  negocio en una tarde.
- **Convenio Multilateral de Ingresos Brutos**: los campos están en el esquema, la
  lógica de coeficientes y retenciones por jurisdicción no.
