# Roadmap inicial

Estado al 17/09/2026. Los hitos están ordenados por dependencia, no por deseo: cada uno
necesita el anterior. Lo que no está acá no está decidido todavía.

Del 5 en adelante se escribieron ese mismo día, después de relevar a la competencia: el
objetivo es **la aplicación más completa del rubro**, sin apurar el lanzamiento. Ver
[contra qué competimos](../tecnicos/competencia-dms.md).

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
- ✅ Al crear un usuario desde la aplicación, sembrar su config y su mapa de atajos —y al
      crear una concesionaria desde el back-office, la de su gerente
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
- ✅ Pantalla **Configuración → Teclas rápidas**, agrupada por módulo, con captura de
      la combinación apretándola y los motivos de rechazo escritos: la que se queda el
      navegador, la reservada y la que ya está en otra acción, con el nombre de esa acción.
      Se guardan las **diferencias** contra el valor por omisión, no el mapa entero
- ✅ Enrutado con TanStack Router: guardias de sesión y sucursal, `volver` al entrar,
      búsqueda en la URL y el módulo del teclado declarado por la ruta. 21 tests nuevos.
- ✅ Barra de estado inferior con las teclas activas del contexto
- ✅ **Todo con teclado**: listados con ↑ ↓ y Enter (también desde el buscador), pestañas con
      ← →, fichas que vuelven con Esc o ⌫ sin estar escribiendo, caja que marca y carga con F4,
      Alt+C y Alt+P para copiar chasis y patente. Registro de atajos en pila
- ✅ Menú y buscador del sistema en el teléfono
- ✅ Pantallas con carga diferida y librerías en archivos aparte
- ✅ Cookie httpOnly para el refresco, con entrega por cuerpo para clientes sin cookies
- ✅ Login sólo con correo y contraseña: el tenant sale del usuario
- ✅ **Auditoría automática de altas, modificaciones y bajas**, en dos mitades que no se
      esconden: `auditoria` la narra —un solo lugar la escribe, con un test que recorre el
      contrato y falla si una ruta que muta no está clasificada— y **`auditoria_cambio` la
      garantiza**, llenada por un trigger de Postgres por tabla, que la aplicación lee y no
      puede escribir. Las listas se aplican como estado convergente, así que la tabla de un
      módulo nuevo queda cubierta con clasificarla. En [auditoría](../tecnicos/auditoria.md)
- ✅ Pantalla de configuración: tema, densidad, filas por página y a qué sucursal entrar.
      Va con `conSesion` y **sin permiso**: es lo propio de cada uno. El cambio se ve en el
      momento, sin recargar
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
- 🔨 Pantalla de configuración **adentro de cada módulo**, más un índice que las liste. La
      primera es la hoja de recepción, en `/hoja-recepcion`: los dibujos del vehículo sobre los
      que marca el que recibe, y los puntos de la revisión
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

- ✅ **Turnos y agenda**: se agenda por teléfono con la patente, un nombre y qué le pasa; la
      semana con cuántos tiene cada día, y el cupo por franja que elige cada taller, que pregunta
      por el sobreturno en vez de impedir. El turno que llega entra a la
      cola de las tablets con su auto y su pedido, y el que nadie marcó pasa solo a «no vino».
      Desde el 09/10/2026, en [la recepción](../tecnicos/recepcion-y-turnos.md)
- ✅ Apertura de OT con los cuatro roles: titular, quien trae, quien autoriza y quien paga
- ⬜ Operaciones con tiempos de referencia por terminal
- ✅ **Fichaje de mecánicos por QR**: dos escaneos, tres segundos, sin login. La PC del taller
      se registra como estación y se autentica sola; la credencial abre y cierra la sesión de
      trabajo sobre la orden, con fallback numérico y todo escaneo registrado. Falta comparar
      contra el tiempo de referencia, que llega con el catálogo de services
- ✅ **Reloj de entrada y salida** para todo el personal, con la misma credencial, y la
      asistencia del día en RRHH
- ✅ QR firmado impreso en la propia OT (`GT1:O:…`), con el número para tipear. Copia taller y
      copia cliente con firma de conformidad
- ✅ **Credenciales del personal** (`GT1:M:…`): cada empleado con su legajo y su QR firmado, que
      se emite, se reemplaza y se revoca **con motivo**, y se imprime de a diez por hoja para
      recortar. Es la mitad del fichaje que no es el kiosco, y el legajo grande en la tarjeta es
      lo que se tipea cuando el QR se ensucia. En RRHH → Personal
- ⬜ Esperas con motivo: sin eso no se explica por qué un auto estuvo seis días
- ✅ Auto-cierre de fin de turno, colgado del primer escaneo del día: un trabajo programado
      no sirve si el proceso se reinició antes de la hora, y además tendría que recorrer todas
      las concesionarias, que es justo lo que RLS le impide al rol de la aplicación
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
- ✅ **Tablero de piso en tiempo real**: qué auto, quién lo tiene, cuánto lleva. En dos vistas
      del mismo tablero: la del jefe de taller, con sesión y desde donde se abre la orden, y el
      televisor colgado en el piso, que se autentica con el token de una estación de tipo
      `tablero` y no se toca. Con los **dos relojes** —mano de obra y tiempo en taller— y el
      tiempo muerto, que es la diferencia
- ✅ Flujo de recepción **sin tocar el mouse**: patente, Enter, Tab, F2

**Criterio de terminado:** una orden entra, se trabaja, se factura y se cobra.

---

## Después del piso: el sistema entero

Hasta acá llega lo que hace falta para mostrarle el taller a alguien. De acá en adelante está
lo que hace falta para que una concesionaria **no necesite ningún otro sistema**, que es el
objetivo declarado: vamos por la aplicación más completa del rubro, sin apurar el
lanzamiento.

Qué tiene cada competidor y qué nos falta contra ellos, en
[contra qué competimos](../tecnicos/competencia-dms.md). Lo de abajo sale de ahí, ordenado
por dependencia como el resto: cada hito necesita el anterior.

---

### Hito 5 — Contabilidad y tesorería ⬜

**El agujero más grande que teníamos**, y no estaba escrito en ningún lado hasta el
17/09/2026. Sin esto el contador de la concesionaria sigue cargando todo de nuevo en otro
sistema, y dejamos de ser *el* sistema para ser *uno más*. Es además lo que justifica el
precio: un DMS que reemplaza al software contable se paga solo.

- ⬜ Plan de cuentas jerárquico, con imputación por **centro de costo** (taller, repuestos,
      ventas: es la única forma de saber cuál de los tres gana plata)
- ⬜ **Asiento automático desde cada movimiento**, en el momento: la factura, el pago, la
      compra, el ajuste de stock. Asentar después a mano es tener dos verdades
- ⬜ Plantillas de asientos periódicos
- ⬜ Libros: diario, mayor, balance general, IVA compras y ventas, retenciones,
      percepciones, Ingresos Brutos
- ⬜ Exportación a SIAP y al aplicativo del contable
- ⬜ **Convenio Multilateral**: coeficientes y retenciones por jurisdicción (los campos ya
      están en el esquema desde el Hito 2; falta la lógica, y se decide con un contable)
- ⬜ **Tesorería**: caja y bancos, recibos, órdenes de pago, canjes, transferencias entre
      cajas, cierre de caja
- ⬜ **Cheques de terceros y chequeras.** Acá el cheque se endosa y circula: una
      concesionaria que recibe uno a 90 días y con eso le paga a un proveedor necesita saber
      dónde está cada uno. Sin esto la administración vuelve al Excel
- ⬜ Retenciones con su comprobante generado solo, e impresión de cheques
- ⬜ **Conciliación bancaria**
- ⬜ Cuenta corriente de clientes y de proveedores, con vencimientos, cobranzas y
      compensación de saldos

**Criterio de terminado:** el contador cierra un mes sin abrir otro programa.

---

### Hito 6 — La recepción y el cliente ⬜

Lo que pasa antes de que alguien sea una orden o una factura. Es la parte que ningún
competidor de los tres relevados tiene resuelta, y donde se pierde la mayor cantidad de
plata sin que nadie lo vea.

Diseñado el 09/10/2026 junto con la agenda de turnos del Hito 2, porque son la misma puerta:
la visita, la cola de las tablets, la derivación a una persona y el tótem, en
[la recepción](../tecnicos/recepcion-y-turnos.md).

- ✅ **Tótem de recepción**, la pantalla en la puerta como la de un banco: ponés tu
      documento, si ya existís te saluda por tu nombre y si no te lo pide, elegís a qué
      viniste —ventas, servicios, repuestos, administración— y te llevás tu turno. Llamado
      por pantalla y medición de la espera por sector y por hora.
      **Es el único lugar donde se captura al que no compró**: el que vino a preguntar por un
      usado y se fue hoy no existe en ningún sistema
- ✅ Tres cuidados del tótem, razonados en [contra qué competimos](../tecnicos/competencia-dms.md)
      y resueltos en [la recepción](../tecnicos/recepcion-y-turnos.md): el documento **no
      devuelve el nombre de nadie, nunca** —sólo la hora del turno—; es dedo; y da el número
      **aunque se caiga la red**, en su propia serie, y lo manda cuando vuelve. Desde el
      09/10/2026, con el llamador de la sala de espera y la espera por motivo y por hora
- ⬜ **CRM**: prospectos, agenda del vendedor, contactos programados, demandas, contactos
      levantados en eventos. Y lo que de verdad compra un gerente comercial: **la
      verificación de que el vendedor hizo lo que tenía que hacer**
- ⬜ **Gestor de eventos**: notificaciones por mail, SMS y WhatsApp — recordatorio de turno,
      **«su auto está listo»**, vencimiento del service, cumpleaños. Lo más barato que más se
      nota, y el caño del mail ya está andando desde el Hito 3. **WhatsApp depende de la
      landing**: Meta no da credenciales sin una URL del producto con su política de
      privacidad
- ⬜ **Cuestionarios de satisfacción** en venta y en posventa. Las terminales los exigen y
      los miden
- ⬜ **Quejas y reclamos** centralizados, con alerta al responsable y seguimiento hasta que
      se cierran

**Criterio de terminado:** entra alguien a la concesionaria, saca su turno solo, y queda
registrado aunque se vaya sin comprar nada.

---

### Hito 7 — Repuestos completo ⬜

La base está hecha en el Hito 4. Falta lo que convierte el módulo en una herramienta de
compra en vez de un inventario.

- ⬜ **Ventas perdidas**: registrar lo que alguien vino a buscar y no había. Es el dato que
      dice qué comprar, y no lo tiene nadie porque no se registra solo
- ⬜ **Rotación y stock muerto**: clasificar el stock por movimiento, para dejar de tener
      plata inmovilizada en el estante
- ⬜ Reservas y **pedido a fábrica desde el mínimo**
- ✅ **Códigos de barras**: los de la caja de cada pieza, en el catálogo; se escanean al preparar
      el pedido para una orden, y el de cada caja queda en la orden, para que el cliente lo
      compare con las cajas que se lleva. Desde el 13/10/2026, en [el egreso](../tecnicos/egreso.md)
- ⬜ Reemplazos y códigos alternativos
- ⬜ Importar la lista de precios de la terminal
- ⬜ Valorización múltiple del stock e inventarios
- ⬜ Presupuestos, remitos y vales de salida

---

### Hito 8 — Ventas de unidades ⬜

- ⬜ Stock de 0km, usados y rodados: pedidos, reservas, asignaciones, consignaciones,
      transferencias entre sucursales y entre concesionarias
- ⬜ Unidades **en producción**, por interfaz con la fábrica
- ⬜ La operación de venta con su financiación, sus gastos y sus bonificaciones **pegados al
      vehículo**: si el flete y la patente viven en otro lado, el margen es un número
      inventado
- ⬜ **Gestoría**: formularios asignados, trámites y su cuenta corriente
- ⬜ Patentamiento y prenda
- ⬜ Agenda de preparación y entrega, con autorización de entrega
- ⬜ **Liquidación de comisiones a vendedores**
- ⬜ Rentabilidad por operación
- ⬜ **Plan de ahorro**: suscripciones, agrupamientos, adjudicaciones, transferencias,
      renuncias, rescisiones, scoring, cuenta corriente por contrato, cobranza de la primera
      cuota y licitaciones. En Argentina un porcentaje enorme de los 0km se vende por plan:
      sin esto no entramos en una concesionaria de marca masiva

---

### Hito 9 — Garantías y campañas ⬜

- ⬜ Reclamos de garantía a la terminal, cada una con su formato y su portal
- ⬜ **Campañas de la terminal**: qué vehículos las tienen pendientes, y avisar cuando uno
      entra al taller

---

### Hito 10 — RRHH, con liquidación de sueldos ⬜

**Ninguno de los competidores relevados lo tiene** — AutoPack ni siquiera menciona RRHH—, y
es de las cosas que más atan a un cliente. Con contabilidad, tesorería y sueldos adentro no
queda nada afuera que justifique un segundo proveedor.

- 🔨 Legajo del empleado: documento, legajo, puesto, sucursal, convenio, categoría y fechas
      de ingreso y egreso, desde el 18/09/2026. Falta lo que depende de la liquidación
- ✅ **La credencial** (`GT1:M:…`, en `packages/core/src/qr.ts`) ya está emitida e impresa para
      **todos** los empleados, no sólo los mecánicos: es la misma para el fichaje del taller y
      para la asistencia
- ✅ **Asistencia**: la credencial marca entrada y salida en el reloj de la puerta, y la
      jornada del día se ve en RRHH → Asistencia. Falta corregirla a mano, que lleva motivo y
      auditoría
- ⬜ **Liquidación de sueldos** con convenio SMATA y el personal fuera de convenio
- ⬜ Recibos, cargas sociales, libro de sueldos digital, F.931
- ⬜ ART, obra social y sindicato
- ⬜ El asiento de la liquidación, contra el Hito 5

---

### Transversal — `apps/mobile` ⬜

La app nativa, que se integra con todo lo anterior en vez de ser un sistema aparte.

**Va después de un piloto, y está razonado**: la recepción en tablet se hace primero como
una sección más de la web, con la persona identificada por su credencial y el modo táctil
puesto por el dispositivo. Por qué no una app ahora y por qué no un usuario compartido, en
[la recepción en tablet](../tecnicos/recepcion-en-tablet.md).

- 🔨 **Peritaje digital** en recepción. Hecho: los daños marcados sobre el dibujo del vehículo
      y el inventario de lo que vino con él, los dos impresos en la orden. El dibujo lo carga
      cada concesionaria, y la orden se queda con la imagen exacta con la que se firmó —ver
      [la hoja de recepción](../tecnicos/hoja-de-recepcion.md)—, con los dibujos de VW por omisión
      desde el 13/10/2026. Faltan las **fotos del vehículo** y la **firma del cliente en pantalla**
- ✅ **La revisión de la hoja**: los puntos de VW con semáforo —veintinueve con los
      neumáticos—, que cada taller apaga, ordena y completa con los suyos. Se contesta en la
      recepción y se completa en la orden después de la prueba de ruta, firmado punto por punto;
      sale impresa con el semáforo como forma, y lo ámbar y lo rojo pasa a la orden como trabajos
      para presupuestar. Desde el 06/10/2026
- ⬜ Fichaje del piso de taller y escaneo de chasis por código de barras
- ⬜ **Recepción de 0km**: leer el chasis del código de barras y fotodocumentar las averías
      de transporte antes de aceptar la unidad
- 🔨 Ingreso y egreso de vehículos en tablet, viendo los turnos del día: el ingreso está, con la
      cola de la puerta y los turnos que llegan; falta el egreso
- ✅ **La tablet como estación de recepción**: se registra en Estaciones, arranca pidiendo la
      credencial, abre la sesión de la cuenta vinculada con ese legajo en la sucursal de la
      tablet, y se cierra sola a los quince minutos sin tocarla. Desde el 13/10/2026
- ⬜ **Cola offline**: el fondo del taller no tiene wifi, y una app que necesita señal para
      fichar no se usa

---

### Landing y presencia pública ⬜

**Va antes de lo que parece.** No es sólo hacer ruido: Mercado Pago y Meta —y casi cualquier
plataforma donde haya que registrar una aplicación— piden una **URL del producto** con
política de privacidad y términos antes de darte credenciales. O sea que el gestor de
eventos por WhatsApp del Hito 6 y cualquier cobro por Mercado Pago **están bloqueados por
esto**, no por código.

Y cuanto antes esté, antes empieza a indexar: la competencia lleva treinta años de dominio.

- ⬜ Landing de **GarageProBoard** con qué es, para quién y los módulos. La marca se presentó
      en el INPI el 16/09/2026
- ⬜ Dominio propio y correo de contacto en ese dominio
- ⬜ **Política de privacidad y términos y condiciones.** Es el requisito formal de Meta y de
      Mercado Pago, y además vamos a tratar datos de terceros —clientes de la concesionaria—
      con obligación de conservación
- ⬜ Capturas de verdad del sistema. Las tres pantallas que más venden hoy: la orden de
      trabajo, la caja facturando contra AFIP y el presupuesto con su PDF
- ⬜ Formulario de contacto y pedido de demo
- ⬜ Novedades o blog: los tres competidores tienen uno, y es por donde se entra buscando

**Criterio de terminado:** se puede registrar una aplicación en Meta y en Mercado Pago sin
que falte ningún dato.

### Integraciones: no ser una isla ⬜

De ACK, que se vende como núcleo de un ecosistema y publica con quién se integra. Hoy no
tenemos ninguna pensada más allá de AFIP.

- ⬜ Interfaces con la fábrica: listas de precios, vehículos en producción, facturas y planes
- ⬜ Catálogo de piezas de terceros
- ⬜ Peritaje de daños (tipo GT Motive o Audatex)
- ⬜ Gestión documental
- ⬜ Una API pública documentada — el contrato oRPC ya publica OpenAPI desde el Hito 0, así
      que el trabajo es de política y de credenciales, no de código

## Deuda técnica registrada

Cosas que sabemos que faltan, para que no se descubran de golpe:


- **Backups de Postgres antes del primer cliente en producción.** Pendiente de decidir dónde
  corre producción; si no, se arma y se prueba el circuito en local primero. Vamos a guardar
  comprobantes fiscales de terceros con obligación legal de conservación. `pgBackRest`
  o `wal-g` contra un bucket S3-compatible, con restauración **probada**, no solo
  configurada. Un VPS autogestionado sin backup probado es la forma de perder el
  negocio en una tarde.
- **Convenio Multilateral de Ingresos Brutos**: los campos están en el esquema, la lógica de
  coeficientes y retenciones por jurisdicción no. Dejó de ser deuda suelta: es parte del
  Hito 5, y se decide con un contable.
