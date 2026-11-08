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
| **1** | **Stock de unidades**: 0km, usados, consignación, traslados y reservas | cartera |
| 2 | Compra de la unidad, y gastos y bonificaciones pegados a ella | cartera |
| 3 | La operación de venta, con financiación, y su rentabilidad | ventas |
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

## Lo que todavía no está

- Generar el comprobante del traslado: por ahora se anota su número.
- Vender: la unidad pasa a vendida con el paso 3.
