# Auditoría

Un sistema que maneja comprobantes fiscales y legajos tiene que poder responder **quién
cambió qué y cuándo**, aunque nadie lo pregunte hasta el día que lo pregunta. La auditoría
no bloquea nada: deja la historia a la vista de quien tiene que mirarla.

Son dos cosas distintas, en la misma pantalla:

| Pestaña | De dónde sale | Qué contesta |
| --- | --- | --- |
| Ingresos | La tabla `sesion` | Quién entró, cuándo, desde qué computadora y con qué IP |
| Cambios | La tabla `auditoria` | Quién modificó qué |
| Computadoras | La tabla `dispositivo` | Desde qué máquinas se entra, con el nombre que les puso la concesionaria |

Los **ingresos no pasan por `auditoria`** y es a propósito: `sesion` ya guarda más —la
computadora, la IP, la sucursal— y sabe distinguir un ingreso de las renovaciones
automáticas de cada quince minutos, que son la misma persona en la misma silla.

## La frase se arma al leer, no al escribir

`auditoria` guarda los datos tal cual (`datos_antes`, `datos_despues`) y **no la oración**.
`describirCambio()` la compone al mostrarla. La razón: cómo se cuenta un cambio puede
mejorar sin reescribir la historia, y los nombres de roles y sucursales que se muestran son
los de hoy y no los del día del cambio.

La excepción son los módulos donde la operación sabe mejor que nadie qué pasó —repuestos,
pedidos, compras— que anotan la frase en `datos_despues.texto`. «Ajustó el stock a 12 (−3):
«rotura en depósito»» no se deduce de mirar dos fotos de la fila.

## Un solo lugar escribe la tabla

`auditar()`, en `apps/api/src/comun/auditoria.ts`. **Es el único `insert` a `auditoria` de
todo el sistema**, y hay un test que lo verifica recorriendo el código fuente
(`test/auditoria-cobertura.test.ts`).

Antes había once copias del mismo `insert`, una por servicio, con siete parámetros
posicionales y dos `unknown` pegados —`datosAntes` y `datosDespues`—, que es una invitación
a intercambiarlos sin que nada se queje. Ahora van con nombre.

`TablaAuditada` es una unión cerrada: la tabla que no esté ahí no compila, porque
`sobreQue()` no tendría una frase para ella y la pantalla mostraría el nombre pelado de una
tabla de Postgres. Hay un test que verifica que ninguna quedó sin frase.

## La cobertura: qué garantiza y qué no

`test/auditoria-cobertura.test.ts` recorre el contrato, junta las rutas que mutan (hoy 60) y
exige que **cada una esté clasificada a mano**: o audita, o está en la lista de excepciones
**con el motivo escrito**. Agregar una ruta que muta sin decidir rompe el test.

Las excepciones de hoy son el inicio de sesión y sus parientes —que se registran en
`sesion`— y la configuración personal: el tema y el mapa de teclas de cada uno no son un
cambio que alguien tenga que auditar.

Lo que el test **no** garantiza: que una ruta clasificada como «audita» efectivamente
audite. Obliga a detenerse y decidir, que es lo que antes no pasaba —así apareció
`repuestos.ubicar`, la única ruta que mutaba sin dejar huella, y el mínimo de un repuesto es
justamente lo que después dispara un pedido a fábrica—, pero la garantía de verdad tiene que
venir de la base.

## Por qué todavía no son triggers de Postgres

El plan es un trigger por tabla que escriba la fila sola, como RLS: la disciplina del
programador no es una garantía, el trigger sí. El lugar está listo —`ddlAislamiento()` se
aplica al final de cada corrida de migraciones como estado convergente derivado de una
lista, así que una tabla nueva quedaría cubierta sin acordarse de nada—.

**El obstáculo es que la fila que escribe un trigger no alcanza para contar el cambio**, y
no por comodidad: hay datos en `datos_despues` que un trigger sobre una sola tabla no puede
ver.

- El alta de un usuario se cuenta «lo dio de alta con el rol Mecánico, en Casa Central».
  `rolIds` y `sucursalIds` salen de `usuario_rol` y `usuario_sucursal`. Un trigger sobre
  `usuario` no los tiene; triggers sobre las dos tablas de relación convertirían «le agregó
  el rol Mecánico y le quitó Cajero» en tres filas sueltas.
- El certificado de AFIP se cuenta por **evento** —pedido, importado, activado—, y varios de
  esos eventos no son un `update` a ninguna fila.
- Mandar un comprobante por mail no cambia una sola columna, y es de lo que más se consulta.

De ahí que la idea de «el trigger escribe y el servicio deja una nota con `set_config`» no
cierre tal cual: **la nota tendría que fijarse antes del `update`**, y hoy los treinta y
pico de llamadas anotan después del cambio, que es el orden natural de leer el código.

Las salidas que quedan, para decidir:

1. **Triggers sólo sobre las tablas de ABM plano** —empresa, sucursal, punto de venta,
   cliente, proveedor, vehículo, repuesto, rol— donde la foto cruda alcanza, y dejar las
   curadas para los eventos. Cubre la mayoría con poco riesgo, al precio de que la garantía
   sea parcial y haya que saber cuál es cuál.
2. **El trigger escribe siempre la foto cruda y `auditar()` pasa a ser un `update`** que le
   pega la narración y los datos derivados a la fila que el trigger acaba de escribir en esta
   misma transacción. Una fila por cambio, garantizada por la base, sin invertir ninguna
   llamada. Hay que resolver cómo encontrar esa fila sin adivinar —la última de esta
   transacción para esa tabla y ese registro—, y «casi siempre la correcta» no sirve para un
   registro de auditoría.
3. **Invertir el orden en las llamadas**: anotar la nota antes de escribir. Es el diseño más
   simple del lado de la base y el más incómodo del lado del código.

Mientras no esté decidido, la garantía es el punto único de escritura más el test de
cobertura, y queda anotado acá para que no se redescubra en marzo.
