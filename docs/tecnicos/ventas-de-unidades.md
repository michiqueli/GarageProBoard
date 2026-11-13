# Ventas de unidades

El Hito 8, escrito antes de construirlo. Desde el 08/11/2026.

## El principio

Michi lo dijo así: «deben trabajar todos distintos, por lo tanto debemos contemplar todo pero a la
vez hacerlo configurable y opcional». Vamos por todas las concesionarias, así que **ninguna regla de
negocio que varíe queda fija**: se contemplan las variantes, cada una es una opción por
concesionaria con un valor por omisión razonable, y lo optativo no le estorba a quien no lo usa.

Los valores por omisión son supuestos, sin observar una concesionaria real: se revisan con el piloto.

Son dos módulos, ya separados en [el mapa](modulos-del-sistema.md): **cartera** es el stock y
**ventas** es la operación y el plan de ahorro. Se pueden contratar por separado.

## Los pasos

| Paso | Qué | Módulo |
| --- | --- | --- |
| ✅ 1 | Stock de unidades: 0km, usados, consignación, traslados y reservas | cartera |
| ✅ 2 | Compra de la unidad, y gastos y bonificaciones pegados a ella | cartera |
| ✅ 3 | La operación de venta, con financiación, y su rentabilidad | ventas |
| 4 | Preparación y entrega, con autorización | ventas |
| 5 | Gestoría, patentamiento y prenda | ventas |
| 6 | Comisiones de los vendedores | ventas |
| 7 | Plan de ahorro | ventas |
| 8 | Unidades en producción, por interfaz con la fábrica | cartera |

## Paso 1: el stock

Una **unidad** es el paso de un vehículo por el stock. El vehículo es el de siempre, con su chasis y
su historia: un auto que se vendió y vuelve como usado es la misma ficha y una unidad nueva.

| Dato | Valores |
| --- | --- |
| Condición | 0km, usado |
| Tenencia | Propia, o en consignación con su consignante |
| Origen | Fábrica, compra, parte de pago, consignación, otro |
| Estado | Disponible, reservada, vendida, retirada |
| Dueña | La razón social, en las propias. Por omisión, la de la sucursal donde entra |
| Ubicación | La sucursal donde está |
| Precio | Opcional, en pesos o en dólares: los usados suelen publicarse en dólares |

El stock se ve entre sucursales: al que vende le sirve saber qué hay en la otra.

### Las opciones

En Stock → Configuración, con la acción `configurar Unidad`.

| Opción | Variantes | Por omisión |
| --- | --- | --- |
| **Traslado entre razones sociales** | Sólo cambia dónde está, o cambia la dueña y pide el comprobante | Sólo cambia dónde está |
| **Si una reserva traba** | La unidad queda bloqueada, o se avisa y se puede reservar igual | Bloquea |
| **Vencimiento de la reserva** | Una cantidad de días, o nunca | 7 días |
| **Seña** | Obligatoria u optativa | Optativa |
| **Tenencia de un usado** | Con cuál arranca el alta: propia o consignación | Propia |
| **Moneda** | Con cuál arranca el precio | Pesos |

La tenencia se elige **unidad por unidad**: la opción sólo pone el valor inicial. En una misma
concesionaria un usado entra propio y otro en consignación.

Con una reserva que bloquea, **pasarla por encima** es una excepción: pide la acción
`autorizar Unidad` y un motivo, y la reserva anterior queda como desplazada, a la vista.

Las reservas vencen solas al consultarlas, con la fecha de Argentina: un trabajo programado tendría
que recorrer todas las concesionarias, que es lo que RLS le impide al rol de la aplicación.

## Paso 2: lo que costó

Cada unidad junta su compra, sus gastos y sus bonificaciones, renglón por renglón. Si el flete y la
patente vivieran en otro lado, el margen sería un número inventado.

- **Es optativo.** Quien no carga nada no ve números.
- **Es un permiso aparte**, `CostoUnidad`: el que vende no tiene por qué saber cuánto se pagó. El
  gerente lo tiene; a los demás se lo da cada concesionaria en Roles.
- **Las categorías de gasto** se apagan y se suman en Stock → Configuración.
- **Cada renglón tiene su moneda.** Si no es la de la unidad, lleva cotización en pesos por dólar;
  sin ella no entra en la suma, y la ficha lo dice. Un total inventado es peor que uno incompleto.
- **No se modifica ni se borra**: se anula con motivo, y sigue a la vista.
- **La factura de compra se carga al ingresar la unidad**: número, fecha e importe, y queda como el
  renglón de compra. En un 0km es la de la fábrica; el chasis, el motor y el color salen de ella, y
  el vehículo se busca y se da de alta por chasis porque todavía no tiene patente.

## Paso 3: la venta

Se empieza desde la unidad (**Vender**, en su ficha) o desde Ventas. Nace en **borrador** con el
precio de la unidad y, si el comprador la tenía reservada, con la seña como primer pago.

- **El borrador se guarda entero**: comprador, precio y moneda, y los renglones. Hasta confirmar se
  cambia todo; después, sólo se anula con motivo.
- **Tres clases de concepto**: gastos que paga el cliente (patentamiento, flete) suman al total;
  descuentos restan; **costos de la venta** (una comisión externa, un regalo) no los ve el cliente
  pero restan del margen.
- **Los pagos** dicen el medio: efectivo, transferencia, cheque, tarjeta, financiación (entidad y
  cuotas), seña, otro, o un **usado en parte de pago**, que tiene que estar ingresado en el stock.
- **Cada renglón tiene su moneda**, con cotización si no es la de la venta; sin ella no suma, como
  en los costos.
- **Confirmar** deja la unidad vendida: la reserva del comprador queda «se vendió» y las de otros se
  liberan, con el motivo. Venderla estando reservada para otro pide motivo y el permiso de
  autorizar sobre unidades.
- **La rentabilidad** —precio menos descuentos, menos lo que costó la unidad (paso 2), menos los
  costos de la venta— sólo la ve quien ve los costos, y si la venta está en la moneda de la unidad.
- **Anular** una confirmada devuelve la unidad al stock y lo deja en su historia.
- Numeración propia por concesionaria; la venta queda en la sucursal y con el vendedor de quien la
  empezó.

### Las opciones

En Ventas → Configuración.

| Opción | Por omisión | Qué cambia |
| --- | --- | --- |
| Descuento máximo sin autorización | Sin límite | Pasarlo pide motivo y el permiso `autorizar Venta` |
| Confirmar sólo con todo pagado | No | Con saldo, no confirma |

El rol Vendedor ve, empieza y completa ventas; anular, autorizar y configurar quedan para el gerente
o quien cada concesionaria elija en Roles.

## Lo que todavía no está

- Generar el comprobante del traslado: por ahora se anota su número.
- La factura de la venta y la entrega: paso 4.
- El boleto de compraventa impreso.
