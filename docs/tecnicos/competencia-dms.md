# Contra qué competimos

Relevamiento de los DMS con los que nos vamos a cruzar, módulo por módulo, para saber qué
tenemos que tener antes de sentarnos a vender.

**Lo de acá es lo que ellos dicen de sí mismos**, leído de sus páginas públicas el
17/09/2026. No vimos ninguno de los tres funcionando. Vale como mapa de lo que el rubro da
por sentado —que es para lo que sirve— y no como relevamiento: un módulo que ellos nombran
en una lista puede ser una pantalla completa o una promesa. Cuando aparezca una
concesionaria dispuesta a mostrarnos cómo trabaja, esto se corrige con lo que se vea.

Es el mismo cuidado que el [sistema de diseño](sistema-de-diseno.md) se toma con el mapa de
teclas: está razonado sobre convenciones, no sobre observar a un operador.

## Quiénes son

| | Dónde | Por qué nos importa |
| --- | --- | --- |
| **Oversoft** | Argentina | El que está instalado en la concesionaria a la que vayamos. Es contra quien se mide la velocidad de un operador, y es la razón de que todo se maneje con teclado |
| **AutoPack** (Informix Sys) | Argentina | El competidor directo y el mejor documentado. Ocho módulos, treinta años de rubro |
| **ACK** (XAUTO DMS) | España | Otro mercado, pero el discurso es distinto y vale robárselo: se venden como **núcleo de un ecosistema**, no como sistema cerrado |

---

## Módulo por módulo

### Ventas de unidades

**Ellos**: stock de 0km, usados y rodados con pedidos, reservas, asignaciones,
consignaciones, ventas directas, entregas, transferencias, patentamientos, entradas al
taller, pagos, facturación, costos, gastos y bonificaciones. Monitoreo de unidades **en
producción** (interfaz con la fábrica), operaciones con su financiación, agenda de turnos de
preparación y entrega, entrega con autorización, formularios de gestoría asignados con
**cuenta corriente por trámite**, liquidación de comisiones a vendedores, cuestionario de
satisfacción y rentabilidad por operación.

**Nosotros**: nada. Está en el roadmap sin desarrollar.

**Lo que no habíamos pensado**: la **gestoría con cuenta corriente de trámites** y la
**liquidación de comisiones**. Las dos son plata que hoy se lleva una planilla aparte, y las
dos son de las que el dueño mira.

### Plan de ahorro

**Ellos**: cartera propia y de clientes, con suscripciones, agrupamientos, adjudicaciones,
transferencias, renuncias y rescisiones. Scoring documentado, facturación de incentivos y
comisiones, cuenta corriente por contrato, cobranza de la primera cuota, memos de pago y
recepción de fondos para licitaciones.

**Nosotros**: nada.

**Nota**: en Argentina un porcentaje enorme de los 0km se vende por plan. Un DMS sin esto no
entra en una concesionaria de marca masiva.

### Compras

**Ellos**: cuenta corriente de proveedores con análisis de vencimientos y pagos, compra de
0km y usados, gastos y bonificaciones **asociados al vehículo**, débitos y créditos en
planes, impuestos internos vinculados automáticamente.

**Nosotros**: compras de repuestos con recepción ✅. Falta la compra de vehículos y toda la
cuenta corriente.

**Lo que importa**: que el gasto se pegue al vehículo es lo que después permite saber la
rentabilidad de la operación. Si el flete y la patente viven en otro lado, el margen es un
número inventado.

### Contabilidad

**Ellos**: **todo movimiento de la empresa asienta solo, en tiempo real**. Plan de cuentas
jerárquico, imputación por centros de costo, plantillas de asientos periódicos, diario,
mayor, balance, IVA, retenciones, percepciones, Ingresos Brutos, exportación a SIAP,
conciliaciones.

**Nosotros**: nada, y **no estaba en el roadmap**.

**Es el agujero más grande de los nueve.** Sin esto, el contador de la concesionaria sigue
cargando todo de nuevo en otro sistema, y dejamos de ser *el* sistema para ser *un* sistema
más. Es además lo que justifica el precio: un DMS que reemplaza al software contable se
paga solo.

### CRM — «Laboratorio Comercial»

**Ellos**: prospecciones, agenda del vendedor, programación de contactos, contactos
levantados en eventos, seguimiento de demandas, perfiles por usuario, filtros por profesión,
actividad, sexo, edad y cantidad de hijos, y verificación de que las tareas programadas se
hayan cumplido.

**Nosotros**: nada.

**Lo que se roba**: lo último. No es el CRM, es el **control de que el vendedor hizo lo que
tenía que hacer**. Eso es lo que compra un gerente comercial.

### Repuestos

**Ellos**: seguimiento de códigos, reemplazos y **códigos alternativos**, cantidades
pendientes, **ventas perdidas**, precios y promociones, **clasificación de stock por
rotación** (el discurso es «eliminar el stock muerto»), rubros y fabricantes, valorización
múltiple, inventarios, importación de listas de precios, análisis compras-ventas,
presupuestos, remitos, vales de salida y facturación.

**Nosotros**: catálogo, stock por sucursal con movimientos, ajustes, transferencias, pedidos
(a una orden, a un cliente o de mostrador) facturados en caja, compras con recepción y
proveedores ✅.

**Falta**: ventas perdidas, rotación y stock muerto, reemplazos y alternativos, valorización
múltiple, importación de listas de la terminal, reservas y pedido a fábrica desde el mínimo.

**Lo que no habíamos pensado**: **ventas perdidas**. Registrar lo que alguien vino a buscar y
no había es el dato que dice qué comprar, y no lo tiene nadie porque no se registra solo.

### Servicios — el taller

**Ellos**: agenda de turnos para repartir tareas, **tiempo facturado contra horas
invertidas**, utilización de horas por operario, rentabilidad del taller, monitoreo del
vehículo desde que entra, **control de campañas y garantía**, cuestionario de satisfacción y
facturación.

**Nosotros**: es nuestro Hito 4 y es lo más avanzado que tenemos. Apertura de OT con los
cuatro roles, repuestos con descuento de stock, presupuesto y autorización, cierre a caja,
facturación, QR firmado impreso en la OT ✅.

**Falta**: turnos y agenda, tiempos de referencia por terminal, fichaje por QR, esperas con
motivo, tablero de piso, catálogo de services, y las campañas.

**Coincidimos en lo que importa**: ellos también miden **tiempo real contra tiempo
estipulado**. Es el corazón del módulo y es lo que ya teníamos decidido en
[control de tiempos de taller](taller-control-de-tiempos.md).

### Tesorería

**Ellos**: caja y bancos diarios —recibos, órdenes de pago, canjes, transferencias entre
cajas, transacciones bancarias—, estados de cuenta, pagos de clientes, cancelaciones a
proveedores, **chequeras y cheques de terceros**, retenciones con su comprobante generado
solo, impresión de cheques, **conciliación bancaria**, perfiles por usuario y cierre de caja.

**Nosotros**: la pantalla de Caja factura y cobra ✅. Bancos, cheques y conciliación, no.

**Lo que importa acá**: el **cheque de terceros**. En Argentina el cheque se endosa y circula,
y una concesionaria que recibe un cheque a 90 días y lo usa para pagarle a un proveedor
necesita saber dónde está cada uno. Sin esto la administración vuelve al Excel.

---

## Lo que ellos publican como novedad

Es la lista más útil de las tres, porque es lo que consideran que los diferencia hoy:

- **Taller Digital 2.0**: peritaje en el celular, fotos, **firma del cliente en pantalla**, y
  la orden de reparación se abre sola desde ahí.
- **Ingreso y egreso con tablet** en la puerta del taller, viendo los turnos del día.
- **Recepción de 0km leyendo el código de barras del chasis**, con fotodocumentación de las
  averías de transporte.
- **Gestor de eventos**: notificaciones por mail y SMS — cumpleaños, recordatorio de turno,
  **estado de la reparación**.
- **Quejas y reclamos** centralizados, con alerta al responsable.
- **Interfaces con fábrica**: listas de precios, vehículos en producción, facturas y planes.

El **gestor de eventos** es el de mejor relación entre lo que cuesta y lo que se nota. Ya
tenemos SMTP andando para mandar el PDF de un comprobante y el de un presupuesto: «su auto
está listo» es el mismo caño.

## Lo que ACK hace distinto

La página de producto es flaca, pero el posicionamiento vale. Se venden como **núcleo de un
ecosistema** y publican con quién se integran: GT Motive y Audatex (peritaje de daños),
Recambio Fácil (catálogo de piezas), gestión documental, dosificadores de pintura, control de
fluidos, CRM de terceros, inteligencia de negocio. Y machacan con multimarca / multisede y
con el cumplimiento normativo del momento (VeriFactu, Ley Antifraude).

**La lección**: el DMS no gana por tener todo adentro, gana por no ser una isla. Nosotros
todavía no tenemos ni una integración de terceros pensada más allá de AFIP.

---

## Lo que tenemos nosotros y ellos no publican

No es vanidad: es lo que hay que cuidar de no perder mientras corremos atrás de los nueve
puntos que faltan.

- **Todo con teclado, y el atajo a la vista.** Ninguno de los tres lo menciona. Es lo único
  que puede hacer que un operador de Oversoft nos prefiera el primer día.
- **Atajos configurables por usuario**, con la pantalla para reasignarlos.
- **Aislamiento multi-tenant forzado en la base** (RLS), no en el código de la aplicación.
- **Auditoría que no depende de que nadie se acuerde**: un trigger por tabla, en una tabla
  que la aplicación lee y no puede escribir. Ver [auditoría](auditoria.md).
- **Módulos activables por concesionaria**, con su back-office. Ver
  [módulos del sistema](modulos-del-sistema.md).
- **Tema oscuro y densidad configurable.** Suena menor hasta que alguien mira la pantalla
  nueve horas.

Y tres que vamos a tener y ellos no: el tótem de recepción, RRHH con liquidación de sueldos
y la app del piso de taller. Están abajo.

---

## Por dónde los pasamos

Tres cosas que no tiene ninguno de los tres, y que no son adornos.

### El tótem de recepción

Una pantalla en la puerta, como la de un banco. El que entra pone su documento: si ya existe
lo saluda por su nombre, y si no, se lo pide. Después elige a qué vino —ventas, servicios,
repuestos, administración— y se lleva su turno.

Por qué importa más de lo que parece:

- **La concesionaria deja de perder gente en el mostrador.** Hoy el que entra espera parado
  a que alguien lo mire.
- **Es el único lugar donde se captura al que no compró.** Un tipo que vino a preguntar por
  un usado y se fue no existe en ningún sistema. Acá existe, y alimenta el CRM y las
  ventas perdidas de repuestos.
- **Mide la espera de verdad**, por sector y por hora, que es lo que después permite discutir
  cuánta gente hace falta en el mostrador un sábado.
- **Empalma con lo que ya tenemos**: el documento busca contra `entidad_comercial`, y si el
  que llega tiene una orden abierta, la recepción lo sabe antes de que hable.

Tres decisiones que hay que tomar con cuidado cuando se construya:

- **Tipear un documento no puede devolver el nombre de nadie.** En el banco funciona porque
  antes te autenticaste; acá, cualquiera que tipee un DNI ajeno se entera de cómo se llama su
  dueño. La salida probable es saludar sólo con el nombre de pila, o pedir una confirmación
  más (la patente, los últimos dígitos del teléfono) antes de mostrar algo.
- **Es la otra excepción a la densidad**, como el piso de taller: dedo, no teclado, y
  objetivos táctiles de 44px para arriba. Ver [sistema de diseño](sistema-de-diseno.md).
- **Tiene que emitir el turno aunque se caiga la red.** Una pantalla negra en la puerta es
  peor que no tener nada.

### RRHH con liquidación de sueldos

**Ninguno de los tres la tiene.** AutoPack ni siquiera menciona RRHH.

Y es de las que más atan a un cliente: legajo, asistencia —con el mismo QR firmado del
fichaje del taller—, convenio SMATA y el personal fuera de convenio, liquidación, recibos,
cargas sociales, libro de sueldos digital, F.931, ART y obra social.

Es la pata que convierte al sistema en el único que la concesionaria necesita: con
contabilidad, tesorería y sueldos adentro, no queda nada afuera para justificar un segundo
proveedor.

### Todo con teclado

Lo de siempre, pero vale repetirlo acá: es lo único de esta lista que se nota **el primer
día**, y es lo que puede hacer que un operador de Oversoft nos prefiera antes de que
tengamos la mitad de los módulos.

---

## Los nueve que faltan, en orden de importancia

Están volcados al [roadmap](../roadmaps/roadmap-inicial.md), en la sección de después del
piso. Acá quedan con el motivo:

1. **Contabilidad.** Sin esto no reemplazamos al sistema contable y no somos el sistema.
2. **Tesorería con bancos y cheques de terceros.** El cheque mueve el rubro.
3. **Gestor de eventos (mail, SMS, WhatsApp).** Lo más barato que más se nota.
4. **Cuestionarios de satisfacción.** Las terminales los exigen y los miden.
5. **Ventas perdidas y rotación en repuestos.** El dato que justifica el módulo.
6. **Liquidación de comisiones a vendedores.**
7. **Campañas de la terminal**, aparte de las garantías.
8. **Quejas y reclamos** con alerta al responsable.
9. **Gestoría: formularios y cuenta corriente de trámites.**
