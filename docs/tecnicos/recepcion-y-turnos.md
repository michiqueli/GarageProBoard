# La recepción: turnos, la puerta y la cola de las tablets

Decidido el 09/10/2026, antes de escribir una línea. Es el Hito 6 del roadmap —«entra alguien
a la concesionaria, saca su turno solo, y queda registrado aunque se vaya sin comprar nada»—
más la agenda de turnos del Hito 2, que se juntan porque son la misma puerta.

La pregunta que lo disparó: la chica de recepción, ¿qué pantalla mira? Ve los turnos del día,
recibe al que llega, lo manda a la tablet si viene al taller o a un vendedor si viene a
consultar, y de todos tiene que quedar el nombre de quién lo atendió.

## Lo decidido

| | |
| --- | --- |
| **De dónde salen los turnos** | Los carga el taller, en una agenda nuestra. Ni portal de la terminal ni pedido web por ahora |
| **Cómo llega un auto a la tablet** | Una **cola compartida**: todas las tablets ven a los que esperan y el que toca uno se lo lleva |
| **Qué queda del que vino a consultar** | Una **visita mínima**: nombre, teléfono, a qué vino, a quién se derivó y cuánto esperó |
| **El tótem** | Se hace junto con esto, no después |

### Por qué una cola y no «mandárselo a la tablet 2»

Repartir obliga a alguien a saber qué tablet está libre, y si la que eligió se queda sin
batería el cliente queda colgado ahí sin que nadie lo vea. Con la cola, el que se libera
agarra al siguiente; con dos tablets o con cinco es lo mismo, y la recepcionista no tiene que
hacer de despachante. Cuando uno lo agarra, en las demás aparece **«lo tiene Juan»** y
deja de ofrecerse: nadie recibe el mismo auto dos veces.

### Por qué la visita mínima y no el CRM entero

El prospecto con modelo de interés, forma de pago y seguimiento programado es el CRM, y es un
hito propio. Lo que no puede esperar es el registro: **hoy el que vino a preguntar por un plan
de ahorro y se fue no existe en ningún sistema**. Con nombre, teléfono, motivo y a quién se
derivó ya se sabe cuántos vinieron, a quién le tocaron y cuántos esperaron más de veinte
minutos. El CRM, cuando llegue, arranca desde las visitas en vez de desde cero.

## Las piezas

Hay una sola cosa que se mueve —**la visita**: alguien que está en la concesionaria— y dos
que la alimentan: el turno, que dice quién va a venir, y el tótem, que es la visita anotándose
sola.

```
turno (agendado) ──llegó──▶ visita ◀── tótem / recepcionista
                              │
                ┌─────────────┴──────────────┐
           motivo servicio              cualquier otro
                │                             │
         cola de las tablets          derivada a una persona
                │                             │
        recepción → orden              atendida → cerrada
```

### La visita

| Campo | |
| --- | --- |
| `sucursal_id` | La puerta por la que entró |
| `numero` | El número del día —`S-014`, `V-003`— con la letra del motivo. Es lo que se llama por pantalla y lo que el cliente tiene en la mano |
| `llego_en` | Cuando se anotó. Desde acá se mide la espera |
| `origen` | `totem` o `recepcion` |
| `motivo` | `servicio`, `venta`, `plan_ahorro`, `usados`, `repuestos`, `administracion`, `otro` |
| `entidad_id` | La persona, si existe. Puede no existir: el que viene a preguntar no tiene por qué darnos el documento |
| `nombre`, `telefono` | Lo que dijo. Se copian aunque haya `entidad_id`, por lo mismo que la orden copia quién trae el auto: es lo que se anotó ese día |
| `turno_id` | Si venía con turno |
| `derivada_a` | El **empleado** que lo tiene que atender. Empleado y no usuario: un vendedor puede no tener usuario, y el nombre tiene que quedar igual |
| `atendida_por`, `atendida_en` | Quién la agarró y cuándo. En servicio lo pone la tablet al tocar; en el resto, el derivado o la recepcionista |
| `cerrada_en`, `resultado` | `atendida`, `se_fue` o `orden` (con `orden_id`) |
| `nota` | Una línea: «pregunta por el Taos, financiado» |

**Los estados salen de las fechas**, no de una columna aparte: esperando es sin
`atendida_en`, atendiendo es con `atendida_en` y sin `cerrada_en`. Así no hay forma de que el
estado diga una cosa y las horas otra, y las dos esperas —hasta que lo atienden y hasta que
se va— se calculan sin más datos.

**«Se fue» es un resultado, no una baja.** El que se cansó de esperar es exactamente el dato
que esto viene a capturar; borrarlo sería esconder el problema que se quiere medir.

### El turno

| Campo | |
| --- | --- |
| `sucursal_id`, `fecha_hora` | Cuándo y dónde |
| `vehiculo_id` o `dominio` | El auto, si está cargado; si no, la patente como texto. Cargar un vehículo entero para agendar por teléfono es lo que hace que la gente anote turnos en un cuaderno |
| `entidad_id` o `nombre` + `telefono` | Igual que el auto |
| `pedido` | Qué le pasa o qué service es. Pasa a la orden como «qué pide» |
| `asesor_id` | Opcional: si el cliente pidió a alguien |
| `estado` | `agendado`, `llego`, `ausente`, `cancelado` |

**Sin cupos en la primera versión.** La agenda muestra cuántos hay por franja y avisa cuando
una pasa del número que el taller configure, pero no impide: el que atiende el teléfono sabe
que el jueves hay un mecánico menos, y un sistema que no lo deja anotar se reemplaza por un
cuaderno. La capacidad real llega con el catálogo de services, que trae los tiempos.

Marcar **«llegó»** crea la visita con el turno, el vehículo y la persona ya puestos. Un turno
sin «llegó» al final del día pasa a `ausente` cuando alguien abre la agenda del día siguiente
—colgado de un pedido, como el auto-cierre del fichaje, por lo mismo: RLS no deja a un proceso
recorrer todas las concesionarias—.

### Quién recibe

Hace falta una lista de **a quién se le puede derivar**: asesores para servicio, vendedores
para venta, plan de ahorro y usados, repuesteros para repuestos. Sale de `empleado.puesto`,
que ya existe y es independiente del rol.

No se puede usar `personal.listar`: pide ver `Empleado`, que el asesor no tiene a propósito
porque ahí están los sueldos. Va un endpoint propio, **`recepcion.receptores`**, que devuelve
id, nombre y puesto de los activos de la sucursal y nada más.

### Permisos y módulos

- **`Visita`** y **`Turno`** son sujetos nuevos. La recepcionista tiene los dos; el asesor
  ve las visitas y agarra las de servicio; el vendedor ve y cierra las que le derivaron.
- **La visita es de `nucleo`**: toda concesionaria tiene una puerta, venda autos o no. **El
  turno es de `servicios`.** Es la regla del mapa de módulos —lo que pertenece al módulo es
  la pantalla, no el dato—: sin `ventas` contratado los motivos de venta siguen estando,
  porque al que entra a preguntar por un 0km igual hay que anotarlo.
- Una rol **«Recepcionista»** predefinido, con la recepción como primera pantalla.

## Las pantallas

**Recepción** (escritorio, la recepcionista). Una sección del menú, con tres bloques en la
misma pantalla, porque es lo que se mira todo el día:

- **Turnos de hoy**, por hora, con «Llegó» y «No vino».
- **Esperando**, con el número, el motivo, a quién se derivó y **cuánto lleva** —en ámbar
  pasados los quince minutos y en rojo pasados los treinta, con forma además de color—.
- **Atendiendo**, con quién lo tiene.

`Ins` anota a alguien que llegó sin turno: nombre, teléfono, motivo y a quién. Si da un
documento se busca en las personas; si no, se anota igual. `F4` es el verbo: «Llegó» sobre
el turno elegido.

**Agenda** (escritorio). La semana por sucursal, con el día por franjas. `Ins` agenda un
turno buscando por patente, como la recepción.

**La cola en la tablet.** La recepción en tablet arranca mostrando **a quién esperan**: las
visitas de servicio sin atender, con el tiempo que llevan. Tocar una la agarra y abre el
asistente con el vehículo, quien lo trae y lo que pide ya cargados. Abrir la orden cierra la
visita con resultado `orden`. Sigue estando «Recibir sin turno» para el que entró directo al
taller.

**Lo que le derivaron.** El vendedor o el asesor ve en el menú cuántos lo esperan, y una
lista corta para marcar que lo atendió y cerrar con una línea. Sin esto la derivación es un
grito por el salón.

**El tótem.** Una estación de tipo `totem`, con el mismo mecanismo que el televisor del
tablero: token del dispositivo, sin sesión, densidad táctil.

1. «¿A qué venís?» con los motivos como botones grandes.
2. El documento, opcional para todo lo que no es servicio.
3. El número, grande, y «te llamamos por pantalla».

## Los tres cuidados del tótem

Razonados en [contra qué competimos](competencia-dms.md); acá queda cómo se resuelven.

1. **El documento no devuelve el nombre.** Un banco te saluda porque ya te identificaste; acá
   cualquiera tipea el DNI de otro y se entera de quién es cliente. El tótem **no muestra
   nombres nunca**. Si la persona existe, la visita sale con ella y es la recepcionista la que
   ve el nombre. Lo único que dice es «tenés turno a las 10:30», que no revela nada que el que
   lo tipea no sepa si es el dueño, y no alcanza para nada si no lo es.
2. **Es dedo**: 44px de objetivo, como el piso del taller.
3. **Emite el número aunque se caiga la red.** La visita se crea con un id generado en el
   tótem y el número sale de un contador local del día, con la letra del tótem si hay más de
   uno. Si no hay red queda en una cola local y se manda cuando vuelve; el servidor la acepta
   una sola vez por id. El número que el cliente tiene en la mano no cambia.

## Lo que no es esto

- **El llamador** —el televisor que muestra «S-014 → Mostrador 2»— usa los mismos datos y
  va al final del orden. Primero que funcione la cola; después, que se vea en la pared.
- **El ticket impreso.** La primera versión muestra el número en pantalla. Una impresora
  térmica en un tótem web es otro problema, y se decide con el tótem real enfrente.
- **El CRM.** La visita es su semilla, no su reemplazo.
- **La cola en tiempo real.** No hay nada que empuje datos todavía: el tablero de piso
  consulta cada veinte segundos. La cola consulta cada cinco, que en una recepción alcanza;
  si en el piloto no alcanza, se pasa a SSE con el mismo contrato.

## Cómo se construye

Por orden, y cada paso se prueba en local de punta a punta. El 1 y el 2 están hechos desde el
09/10/2026:
la pantalla es **Recepción** en el menú (`/puerta`), y el asistente de la tablet pasó a llamarse
**Tablet de recepción** para que las dos entradas no arranquen igual.

1. **Las visitas y la pantalla de la recepcionista.** La tabla, `Visita`, los receptores, y
   la pantalla con «Esperando» y «Atendiendo»: anotar, derivar, atender, cerrar y «se fue».
2. **La cola en la tablet.** Las visitas de servicio al entrar a la recepción en tablet,
   agarrar con «lo tiene Juan», el asistente precargado, y la orden que cierra la visita.
3. **Los turnos.** La agenda, el alta por patente, los de hoy en la recepción, «Llegó» que
   crea la visita, y los ausentes.
4. **Lo que le derivaron**, con el contador en el menú.
5. **El tótem**: la estación `totem`, los tres pasos, y la cola local para cuando no hay red.
6. **El llamador y la medición**: el televisor, y la espera por motivo y por hora.
