# Repuestos: catálogo, stock, pedidos, compras y proveedores

El módulo `repuestos` cierra el circuito del taller: la orden consume piezas, el mostrador las
vende, las compras las reponen. Todo lo que mueve una pieza pasa por **un solo lugar**
(`moverStock`, en `apps/api/src/repuestos/stock.ts`), y deja un movimiento con quién, por qué
y cuánto quedó.

## Las tablas

| Tabla | Qué es | De quién |
| --- | --- | --- |
| `repuesto` | El catálogo: código de fábrica, descripción, marca, precio final con IVA, costo sin IVA, proveedor habitual | Del tenant |
| `repuesto_stock` | Cuántas hay en cada sucursal, dónde están y el mínimo | De la sucursal |
| `movimiento_stock` | El libro: cada entrada y salida con signo, saldo, motivo y referencia (OT, pedido, compra, otra sucursal) | De la sucursal |
| `pedido_repuestos` + `_item` | Alguien necesita piezas: siempre con chasis, a una orden, a un cliente o a nadie | De la sucursal |
| `compra` + `compra_renglon` | Lo que se le pide a un proveedor y lo que llegó | De la sucursal |
| `repuestos_secuencia` | Numeración de pedidos y compras, por sucursal | De la sucursal |

El proveedor es un **rol** de `entidad_comercial`, igual que el cliente: el mismo CUIT puede
ser las dos cosas y se edita en un solo lugar.

## Decisiones

**El código se normaliza.** «7701 208-174» y «7701208174» son la misma pieza. Es lo que
devuelve la base de datos de la marca y se pega tal cual; el buscador pone el código exacto
primero.

**El pedido lleva chasis sí o sí.** Es con lo que se busca la pieza en la base de la marca.
Si va a una orden, sale del auto de la orden y no se tipea. A quién va es opcional y
excluyente (lo garantiza un `check`):

- **A una orden de trabajo.** Al *entregarlo*, las piezas pasan a la orden como renglones de
  repuesto y salen del stock. Se cobran con la orden.
- **A un cliente o a nadie** (mostrador, consumidor final). Al *mandarlo a caja* salen del
  stock; caja lo factura como a una orden terminada, y la nota de crédito lo devuelve a caja.
  Sacarlo de caja o anularlo devuelve las piezas.

**El stock se mueve cuando la pieza sale del mostrador, no cuando se anota.** Un pedido
abierto es una lista que se cambia sin rastro en el depósito.

**La orden sigue a sus renglones.** Guardar los renglones de una orden mueve la
*diferencia* por pieza del catálogo: agregar una la saca, cambiar la cantidad mueve lo que
cambió, quitarla la devuelve. Anular la orden devuelve todo. Por eso la ficha de la orden
tiene que conservar el `repuestoId` al guardar: si lo perdiera, la pieza volvería al stock
(hay un test en la web que lo cuida).

**El stock puede quedar negativo.** Si el depósito está mal contado y el mecánico tiene la
pieza en la mano, el sistema no frena el taller. Se muestra en rojo («falta contar») y se
avisa antes de despachar, pero no se bloquea. Se corrige con un **ajuste**, que pide motivo
(un `check` en la base) porque es la forma de tapar un faltante.

**Las compras entran al recibir**, con lo que llegó de verdad de cada renglón y a qué costo.
Lo que no llegó no entra. El costo recibido pasa a ser el costo del repuesto, y si la pieza
no tenía proveedor habitual, queda ese. Se puede cargar una compra ya recibida en un paso.

**Transferir** entre sucursales son dos movimientos en la misma transacción, cada uno con la
otra punta anotada.

## Permisos

Todo es del módulo `repuestos`, sujeto `Repuesto` (catálogo, pedidos y compras) o
`Proveedor`. Se sumó `anular Repuesto` a la grilla de roles: anular un pedido o una compra.
El Repuestero lo trae; el Mecánico ve repuestos pero no abre pedidos.

Caja lista los pedidos de mostrador con `ver Repuesto`: un cajero sin ese permiso no ve el
panel «Repuestos de mostrador para facturar».

## Pantallas

`/repuestos` con pestañas: Catálogo y stock, Pedidos, Compras y Proveedores. La ficha del
repuesto muestra el stock de todas las sucursales (`F9`) y los movimientos con enlace a la
OT, el pedido o la compra. En el pedido, `F4` (`repuestos.despachar`) entrega al taller o
manda a caja, siempre con confirmación. La ficha de la orden busca en el catálogo y lista
sus pedidos, con «Pedir repuestos».

## Datos de prueba

    pnpm --filter @gpb/db ordenes-prueba
    pnpm --filter @gpb/db repuestos-prueba

## Pendiente

- Importar la lista de precios de la terminal (miles de códigos, actualización de precios).
- Reservar piezas de un pedido abierto sin sacarlas del stock.
- Pedido a fábrica armado desde lo que está por debajo del mínimo.
- Devoluciones a proveedor y notas de crédito de compras (con contable).
