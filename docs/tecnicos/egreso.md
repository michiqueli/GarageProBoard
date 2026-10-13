# El egreso: devolverle el auto al cliente

Decidido el 13/10/2026, antes de construirlo. Es la otra punta de la recepción
([la recepción en tablet](recepcion-en-tablet.md), [la hoja de recepción](hoja-de-recepcion.md)):
lo que se anotó cuando el auto entró se mira de nuevo cuando sale, con el cliente adelante.

## Por qué hace falta

Hasta hoy «entregar» es un botón: la orden facturada pasa a entregada y nada más. Pero en el
mostrador, en el momento de la entrega, pasan cuatro cosas que el sistema no acompaña:

- **Se explica qué se hizo**, y el cliente quiere ver que lo que se cobró es lo que se puso.
- **Se dice qué no se hizo.** Lo rechazado del presupuesto y lo que quedó en ámbar o en rojo
  en la revisión es lo que protege al taller el día que al cliente le fallan los frenos, y lo
  que trae al cliente de vuelta. Hoy queda en la memoria del asesor.
- **Se devuelve lo que vino con el auto**: el auxilio, el gato, los papeles. Y se mira que el
  auto salga como entró.
- **Se firma.** Hoy no se firma nada al salir.

## Lo decidido

Michi decidió cinco cosas:

1. **Se entrega facturada, o autorizada.** Una orden sin factura se entrega sólo si alguien con
   permiso lo autoriza, con motivo: un cliente de confianza, una garantía que se factura
   después. Queda en la auditoría.
2. **La firma es en la pantalla**, con el dedo, y queda en el PDF del egreso. La misma pieza
   sirve después para el ingreso, que hoy se firma en papel.
3. **Lo que el cliente no autorizó queda como pendiente del vehículo.** En el próximo ingreso,
   la recepción lo muestra y se suma a la orden con un toque.
4. **El código de barras de la caja queda en la orden.** En palabras de Michi: el mecánico va
   a repuestos y pide el repuesto para la orden X; ese repuesto figura en la orden con su
   código de barras. Quien se lleva el auto ve las cajas —que por lo general se las dan— y el
   código de la caja es el mismo que el de la orden, «así uno está seguro de que no lo están
   estafando».
5. **El cupo de la agenda lo elige cada taller**, en la configuración.

### Lo que garantiza el código de barras, y lo que no

La mayoría de las cajas trae el código del **producto** (EAN-13): todas las pastillas de ese
modelo tienen el mismo. No identifica *esa* caja, sino *esa pieza*. Alcanza para lo que se
busca —que lo que se puso es la pieza que figura en la orden y no otra más barata—, y si una
terminal imprime número de serie o de lote, se guarda igual: es un texto más.

Por eso el código se guarda **en el renglón de la orden, tal como se escaneó**, y no sólo en el
catálogo. El catálogo dice qué códigos tiene una pieza; la orden dice qué caja se le dio a este
auto.

## Cómo encaja con lo que ya existe

- **El pedido de repuestos a una orden ya existe** (`pedido_repuestos`): al entregarlo, las
  piezas pasan a la orden y salen del stock. El escaneo va ahí, cuando el repuestero entrega:
  escanea cada caja, el sistema encuentra el repuesto por su código y lo carga con ese código.
  No es un circuito nuevo, es el mismo con un lector.
- **La revisión ya manda lo ámbar y lo rojo a la orden** como trabajos sin precio, para
  presupuestar (`pasarAPresupuesto`). Lo que el cliente rechaza queda en `orden_item` con
  `autorizacion = 'rechazado'`. Lo que no se pasó a presupuesto sigue en `orden.revision`.
  Los pendientes salen de esas dos fuentes; no se cargan a mano.
- **La hoja de entrada está en la orden**: `danios`, `inventario`, `kilometraje`,
  `combustible` y la imagen exacta con la que se firmó (`hoja_imagen_id`).

## El modelo

- **`repuesto_codigo_barras`**: los códigos de una pieza, uno o varios. La misma pastilla de
  dos marcas es el mismo repuesto con dos códigos. Únicos por concesionaria: un código que
  apunta a dos piezas no sirve para buscar.
- **`orden_item.codigo_barras`**: el que se escaneó al entregar esa caja. Vacío si se cargó a
  mano.
- **`vehiculo_pendiente`**: lo que se le recomendó y no autorizó. Qué es, de qué orden salió,
  su semáforo si vino de la revisión, cuándo se informó y cómo se resolvió: se hizo en otra
  orden, o se descartó con motivo.
- **El egreso, en la orden**: km y combustible de salida, el inventario devuelto, los daños
  nuevos marcados sobre el mismo dibujo, quién entregó, la firma, y —si salió sin factura—
  quién lo autorizó y por qué.
- **La firma** es una imagen en el almacén de archivos (Garage), como los dibujos de la hoja,
  y la orden guarda su referencia. El PDF la incrusta.
- **El cupo**, por sucursal: el largo de la franja y cuántos turnos entran en ella. Sin cupo
  configurado, la agenda funciona como hoy: cuenta y no tope.

## Las pantallas

**Para entregar** (tablet y escritorio, el mismo flujo, como el ingreso). Arranca en una cola
de las órdenes terminadas o facturadas de la sucursal, y se busca por patente o pasando el QR
de la orden. Después, cinco pasos:

1. **Lo que se hizo.** Trabajos y repuestos autorizados; cada repuesto con su código de barras
   en grande, para compararlo con la caja.
2. **Lo que no se hizo.** Lo rechazado y lo que quedó en ámbar o rojo sin autorizar, con su
   color. Sale en el comprobante como «Le informamos y no lo autorizó».
3. **Cómo sale.** El inventario de entrada con un tilde por ítem, los km y el combustible de
   salida, y el dibujo de entrada con sus daños: si aparece uno nuevo, se marca y queda
   distinguido de los que el auto traía.
4. **El cobro.** Facturada, o el pedido de autorización con motivo.
5. **La firma**, el comprobante de egreso en PDF y Entregar. Entregar cierra la orden y la
   visita, si el cliente vino por la puerta.

La tecla del módulo ya existe en el catálogo de atajos: `entregas.entregar` (F4, que abre la
confirmación y no entrega) y `entregas.checklist` (F9).

**En la recepción**, al elegir el vehículo: «Quedaron pendientes», con cada uno y un toque para
sumarlo a la orden nueva.

**En el mostrador de repuestos**, al entregar un pedido a una orden: el lector escanea las
cajas. Un código que no está en el catálogo se puede asociar ahí mismo a la pieza, que es como
se va llenando el catálogo de códigos sin cargarlo a mano.

## En qué orden se construye

1. El cupo por franja en la configuración.
2. Los códigos de barras: en el catálogo y al entregar un pedido a una orden.
3. La firma en pantalla.
4. Los pendientes del vehículo.
5. El egreso.

Antes de todo eso va el juego de dibujos por omisión de la hoja: las capturas de la hoja de VW
que Michi subió, «después vemos de cambiarlas».

## Lo que no es esto

- **No es la recepción de 0km**, que también lee códigos de barras (el chasis) y fotografía
  averías: está en `apps/mobile`, en el roadmap.
- **No verifica el stock contra las cajas al entregar.** Escanear las cajas en el momento del
  egreso, con el cliente esperando, se pensó y se descartó: el control va donde la caja sale
  del depósito, y el cliente compara con la lista.
