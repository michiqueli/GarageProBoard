# Auditoría

Un sistema que maneja comprobantes fiscales y legajos tiene que poder responder **quién
cambió qué y cuándo**, aunque nadie lo pregunte hasta el día que lo pregunta. La auditoría
no bloquea nada: deja la historia a la vista de quien tiene que mirarla.

Son dos cosas distintas, en la misma pantalla:

| Pestaña | De dónde sale | Qué contesta |
| --- | --- | --- |
| Ingresos | La tabla `sesion` | Quién entró, cuándo, desde qué computadora y con qué IP |
| Cambios | La tabla `auditoria` | Qué quiso contar la operación: «le agregó el rol Mecánico» |
| Cambios en la base | La tabla `auditoria_cambio` | Todo lo que cambió, lo haya contado alguien o no |
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
justamente lo que después dispara un pedido a fábrica—, pero la garantía de verdad la da el
trigger, que es de lo que habla la sección siguiente.

## La otra mitad: lo que escribe Postgres

`auditoria_cambio` la llena un **trigger por tabla**, con la fila entera antes y después. No
depende de que nadie llame a nada: es la misma idea que RLS y por el mismo motivo —vamos a
seguir sumando módulos, y la disciplina no escala—.

**La aplicación la lee y no la escribe.** El rol `gpb_app` no tiene `insert`, `update` ni
`delete` sobre esa tabla; la única forma de que entre una fila es cambiando un dato de
verdad. Una bitácora que el mismo proceso auditado puede reescribir no prueba nada.

Quién y desde dónde salen de dos variables de sesión (`app.usuario_id`, `app.ip`) que fija
`conTenant()`, igual que el tenant. Si no hay —una migración, una semilla—, **la fila se
escribe igual, sin autor**: perder el cambio porque no sabemos quién fue sería exactamente
al revés.

Las claves vienen en el vocabulario de la aplicación y no en el de Postgres —`razonSocial`,
no `razon_social`—, así la pantalla cuenta con las mismas frases lo que escribió el trigger
y lo que escribió la API.

### Ninguna esconde a la otra

El primer intento fue fundirlas: que el trigger escriba la fila y que `auditar()` le pegue
encima la narración. Se cae con el caso más común. **«El cliente» son dos tablas**
—`entidad_comercial` y `cliente`—, así que no hay *una* fila del trigger a la que pegarle la
frase, y elegir «la más parecida» es adivinar. Un registro de auditoría no se arma
adivinando.

Así que son dos, con una pestaña cada una: **Cambios** (lo que la operación quiso contar) y
**Cambios en la base** (todo, lo haya contado alguien o no). Las dos filas firman la
transacción que las produjo, así que la cruda muestra la frase al lado cuando la hubo —pero
aparece igual cuando no la hay, que es justo el caso que hay que poder ver.

### Qué se audita y qué no

Las listas viven en `packages/db/src/rls/auditoria.ts` y se aplican como **estado
convergente** al final de cada corrida de migraciones, igual que las políticas de
aislamiento. La tabla de un módulo nuevo queda cubierta con sólo clasificarla, y un test
falla si queda alguna sin clasificar. Eso es lo que hace que esto escale.

Tres decisiones que no son obvias:

- **Los secretos no entran.** `usuario.hash_password` y
  `certificado_afip.clave_privada_cifrada` se excluyen por nombre. Hay un test que recorre
  las columnas de toda tabla auditada y se planta si aparece una nueva con pinta de secreto:
  el día que alguien agregue `token_mercadopago` se entera ahí, y no cuando un volcado de la
  auditoría valga más que la base.
- **Guardar no es cambiar.** Un `update` que deja la fila igual no escribe nada. Sin eso,
  `actualizado_en` ensuciaría el registro con cambios que no son cambios, y se vuelve
  ilegible justo el día que hay que leerlo.
- **Hay tablas donde interesa lo que no debería pasar.** De `movimiento_stock` sólo se
  registra el `delete`: es un libro de sólo agregar, y el dato es que alguien borre una
  línea. De `comprobante_renglon`, el `update` y el `delete`: un renglón de un comprobante
  emitido no se toca.

Y una que sí es una concesión: **los renglones no se auditan uno por uno**. La orden, el
pedido y la compra se guardan enteros en cada edición, así que auditar cada renglón sería
una fila por renglón en cada guardado. Lo material —el total y el estado— cambia en la
cabecera, y lo presupuestado queda en `orden_presupuesto`. Está escrito en la lista, con el
motivo, para poder revisarlo cuando haga falta.
