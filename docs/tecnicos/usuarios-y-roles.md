# Usuarios y roles

Estado: **construido**. Desde el 16/09/2026 hay alta, modificación, baja y contraseña nueva
de usuarios, y crear, clonar y modificar roles, en la API y en la pantalla, con las reglas
de abajo aplicadas por el servidor. Desde el 18/09/2026 está también el **personal**, con su
legajo y su credencial para fichar, en RRHH.

## Quién da de alta a los usuarios

No siempre el gerente. Llega un mecánico nuevo y alguien tiene que crearle el usuario,
asignarle la sucursal y darle un rol; un gerente que no sabe o no quiere hacerlo lo va a
delegar. En una concesionaria será alguien de sistemas, en otra alguien de RRHH o el
administrativo.

Por eso va **un rol predefinido más, «Administrador de usuarios»**, y no una persona
fija en el código. Como el resto de los roles predefinidos, es un punto de partida: cada
concesionaria decide quién lo tiene, y si prefiere que lo haga el gerente, no lo usa.

    administrar Usuario   → alta, baja, roles y sucursales de cada usuario
    ver Empresa           → para elegir a qué sucursales entra

## Usuario no es empleado

Son dos cosas, y se dan de alta por separado:

| | Qué es | Dónde se carga |
| --- | --- | --- |
| **Usuario** | El acceso al sistema: correo, contraseña, rol, sucursales | Usuarios |
| **Empleado** | El legajo: documento, puesto, categoría, convenio, y la credencial para fichar | RRHH → Personal |

Hay empleados que nunca van a entrar al sistema —un lavador, un cadete— y usuarios que
no son empleados —el contador externo—. Si RRHH hace las dos cosas, es porque su rol
tiene los dos permisos, no porque sean la misma pantalla. Y quien administra usuarios
**no ve sueldos** por eso: el legajo está en otra tabla, con otro permiso.

### Y sin embargo son la misma persona

`usuario.empleado_id` las une, y es opcional en los dos sentidos. Lo que ese vínculo
resuelve no es cosmético: **la orden de trabajo apunta al empleado, no al usuario**, porque
el mecánico que la ficha con su credencial y el que la tiene asignada tienen que ser el
mismo. Si el mecánico fuera un usuario, el que ficha y no entra al sistema no podría tener
una orden a su nombre; y si fueran dos identidades, «mis órdenes» dependería de cuál se mire.

De ahí sale un detalle que estuvo mal hasta el 18/09/2026. La regla del rol Mecánico es
`{ mecanicoId: '${empleadoId}' }`, y el marcador lo resuelve `resolverCondiciones()` al
iniciar sesión. Cuando no había valor —una cuenta sin legajo— se resolvía a `null`, y CASL
lo leía literal: «las órdenes cuyo mecánico es nadie», que en un taller son **las que se
acaban de recibir**. Ahora un marcador sin valor no da permiso: una regla condicional que no
se puede evaluar se descarta, y una prohibición condicional que no se puede evaluar pasa a
prohibir todo. Los dos casos caen del lado de negar.

### Módulo: el personal es núcleo, RRHH todavía no

La pantalla vive en la sección RRHH porque es donde va a crecer —asistencia, liquidación de
sueldos, recibos—, pero el permiso pide el módulo **núcleo** y no `rrhh`. Sin la lista de
personal no se le asigna una orden a un mecánico ni se imprime una credencial para fichar, y
las dos son cosas del taller: detrás del módulo de RRHH, una concesionaria que no lo contrató
se quedaría sin fichaje. `rrhh` se va a pedir cuando llegue la liquidación.

El permiso es `Empleado`, que ya existía y que el rol de asesor de servicios **prohíbe**
explícitamente: el legajo lleva convenio y categoría, y va a llevar sueldos.

### La credencial

Cuelga del empleado, no de la cuenta, por lo mismo: la mayoría de los que fichan no entran al
sistema, y pedirles un correo único y una contraseña para que puedan apoyar una tarjeta sobre
un lector sería inventarles una identidad que no usan.

Guarda el **código** de ocho caracteres y no el QR entero: el texto impreso es
`GT1:M:<codigo>:<firma>` y la firma la calcula el servidor al imprimir. Guardar la firma
haría que rotar `QR_SECRET` obligara a reescribir la tabla en vez de reimprimir tarjetas.

No se borra: se revoca, **con motivo obligatorio**, y una sola puede estar vigente por
empleado —un índice parcial lo garantiza—. Emitir una nueva revoca la anterior en la misma
transacción. Dar de baja a un empleado también le revoca la credencial: el que se fue el
viernes no ficha el lunes, y eso no puede depender de que alguien se acuerde.

## La trampa: quien reparte roles puede darse cualquiera

Si alguien puede crear usuarios y asignarles roles, puede crear uno con rol Gerente, o
ponérselo a sí mismo. En la práctica, «Administrador de usuarios» sería gerente con un
paso de más. Y como es el rol que se le da a alguien con menos responsabilidad que el
gerente, es justo el lugar por donde se entra.

Dos reglas lo cierran, y las aplica **la API**, no la pantalla:

1. **Nadie puede dar lo que no tiene.** Un rol se puede asignar sólo si cada una de sus
   reglas ya está cubierta por las de quien lo asigna. El administrador de usuarios da
   de alta al mecánico nuevo; no puede crear otro gerente, porque él no administra todo.
   Lo mismo vale para **editar** un rol: no se le puede agregar a un rol un permiso que
   uno no tiene.
2. **Nadie toca sus propios roles.** Ni para agregarse ni para sacarse: sacarse el último
   rol de administrador deja a la concesionaria sin nadie que pueda arreglarlo.

Consecuencia que hay que aceptar: sólo quien tiene `administrar all` puede crear un
gerente. Si el único gerente se va, ese problema se resuelve desde el back-office, con
auditoría, y no abriendo un camino dentro de la aplicación.

Toda alta, baja y cambio de rol va a `auditoria`: quién, a quién y qué cambió.

## Lo que salió al construirlo

### El administrador de sistema puede todo, y queda registrado

La primera versión aplicaba «nadie da lo que no tiene» a todos, y la consecuencia era que
el administrador de usuarios solo no podía asignar ni un mecánico. **Se cambió por decisión
del producto**: la concesionaria confía en quien administra el sistema, y lo que lo
controla no es un bloqueo sino que todo quede a la vista.

- **Administrador de sistema** (`administrar Usuario`) y **gerente** (`administrar all`)
  asignan cualquier rol y modifican a cualquier usuario. Nadie cambia sus propios roles,
  sucursales ni estado: eso lo hace otra persona, así queda la firma de dos.
- **Quien sólo da de alta usuarios** —un rol armado con `crear` y `editar Usuario`, sin
  `administrar`— sigue con la regla estricta: no da lo que no tiene ni toca a quien tiene
  más.

`faltaParaAsignar()` en `core` decide cuál de las dos se aplica.

### Lo que controla al administrador

**La IP no alcanza.** Todas las PC de una concesionaria salen por el mismo router, y el
servidor ve la misma dirección para todos. Por eso:

1. **Cada computadora se reconoce.** La primera vez que un navegador entra recibe un
   identificador en una cookie, y cada ingreso queda asociado a esa computadora. Se les
   puede poner nombre —«PC del mostrador»—, y el cambio de nombre también queda
   registrado: renombrar la PC de sistemas como «PC del gerente» es borrar huellas.
2. **El afectado se entera.** Si otra persona le cambia la contraseña, los roles o las
   sucursales, recibe un aviso con quién y cuándo, arriba de cualquier pantalla, apenas
   vuelve a entrar. Y con la contraseña, además, se le cierran las sesiones.
3. **La pantalla de Auditoría** muestra los ingresos, los cambios y las computadoras. Un
   ingreso desde una **computadora nueva para ese usuario** va marcado: el gerente
   entrando desde la PC de sistemas es exactamente eso.

No es infalible —quien borra las cookies aparece como computadora nueva, que igual queda
marcada— y no pretende serlo: es trazabilidad, no un candado.

### Tocar a alguien con más permisos también es escalar

La regla escrita al principio era «nadie toca sus propios roles». Al construirlo
apareció el hueco: generarle una contraseña nueva al gerente es quedarse con su cuenta, y
darlo de baja es dejar la concesionaria sin quien la administra. La regla completa es
**nadie modifica a un usuario que tiene algún permiso que él no tiene**, y la pantalla
muestra a esos usuarios como «Tiene más permisos», sin botón.

### Qué hace cada operación

| | |
| --- | --- |
| Alta | Genera la contraseña (se muestra una vez), las preferencias y el mapa de teclas |
| Baja | No borra. Deja de entrar en el próximo pedido y se anulan sus sesiones |
| Contraseña nueva | Se muestra una vez y cierra todas sus sesiones |
| Sobre sí mismo | Puede corregir su nombre; roles, sucursales y estado, no |

Todo va a `auditoria`, sin la contraseña ni su hash.

## Roles: crear, clonar y modificar

### Casillas, y lo que no cabe en ellas

Un rol se edita con una casilla por permiso, y sólo los que tienen sentido: `ACCIONES_POR_SUJETO`
en `core` dice que un vehículo se ve, se da de alta y se modifica, pero no se factura.

Hay reglas que una casilla no puede expresar: «edita **sus** órdenes» (una condición), «no
ve legajos» (una prohibición). `separarReglas()` las aparta como **especiales**: la pantalla
las muestra en palabras y la API las conserva tal cual al guardar. Clonar un rol las copia.
Así la grilla no puede romper, sin querer, lo que no sabe mostrar.

### Quién, y qué no

- Ver roles pide `ver Usuario`; crearlos y modificarlos, `administrar Usuario`.
- **Nadie modifica un rol que tiene él mismo.** Es la firma de dos de los propios roles,
  aplicada a lo que esos roles dan: sin esto, el administrador de sistema se agregaba
  permisos editando el suyo.
- **El rol que puede todo (`administrar all`) no se modifica desde la aplicación**, ni
  siquiera por el gerente. Sacarle un permiso puede dejar a la concesionaria sin nadie que
  lo arregle. Se clona: el clon arranca con todas las casillas marcadas.
- Vale «nadie da lo que no tiene», con la misma `faltaParaAsignar()` que al asignar. Con
  los roles de hoy no se alcanza nunca —quien puede editar roles administra usuarios, y a
  ése la regla no lo limita—, pero queda del lado del servidor por si eso cambia.

### El cambio vale en el acto, y se avisa

Los permisos se leen de la base en cada pedido, así que la API aplica el rol modificado en
el próximo pedido de cada usuario que lo tiene, sin volver a entrar. A cada uno le llega un
aviso: «Martín Gutiérrez cambió el rol Mecánico: ahora podés ver clientes». El menú y los
botones de la pantalla se actualizan cuando la sesión renueva el acceso —vence a los quince
minutos y se renueva en el primer pedido que sigue— o al recargar la página. Hasta entonces
puede ver algo que ya no puede usar, y la API se lo dice.

## Cuando el sistema cambia un rol predefinido

Los predefinidos se copian a cada concesionaria cuando se da de alta, y desde ahí son
suyos. Pero el sistema también los cambia: con la recepción, el Asesor de servicios
necesitó Visita y Turno. Antes del 13/10/2026, ese cambio no llegaba nunca a las
concesionarias que ya existían. Como no había forma de saber si una concesionaria había
tocado su rol, tampoco se lo podía pisar sin riesgo.

Ahora cada rol sabe dos cosas: **de qué predefinido salió** (`rol.predefinido`, una clave que
no cambia aunque lo renombren) y **qué versión del sistema conoce** (`rol.version_sistema`).
Si sus permisos son los de esa versión, nadie lo tocó. Se comparan como conjuntos: guardarlo
desde la pantalla sin cambiar nada no cuenta como editarlo.

Después de las migraciones, `pnpm db:migrate` lleva cada concesionaria a la versión del
sistema:

- **El predefinido que falta se crea.** Si la concesionaria ya tiene un rol propio con ese
  nombre, ése es suyo y no se pisa: el resumen lo informa.
- **El que nadie tocó se actualiza solo**, y a quien lo tiene le llega el aviso: «El sistema
  actualizó el rol Asesor de servicios: ahora podés…».
- **El que la concesionaria editó no se toca.** Quien lo editó sabía algo que el sistema no
  sabe. Roles le muestra **«Versión nueva»** con lo que agrega y lo que saca, y dos opciones:
  - **Aplicar.** Suma y saca sólo lo que cambió el sistema; lo que la concesionaria había
    cambiado queda como estaba.
  - **Dejarlo como está.** Se da la versión por conocida, así que, si el sistema vuelve a
    cambiar el rol, se ofrece sólo lo nuevo.

  Las dos opciones siguen las reglas de modificar un rol: nadie decide sobre uno que tiene,
  ni se da un permiso que no tiene.

Las bases que ya existían se reconocieron por el nombre, y se tomaron como intactas: todavía
no hay ninguna concesionaria de verdad.

## Preguntas abiertas

- **Comparar reglas con condiciones.** «Cubierta por» es fácil con reglas simples
  (`ver Vehiculo` ⊂ `administrar all`). Con condiciones —el mecánico edita *sus*
  órdenes— hay que decidir si una regla con condición cubre a otra sin ella. La
  respuesta segura es que no, y se ve si molesta en la práctica.
- **La sucursal.** ¿El administrador de usuarios de Rafaela puede dar acceso a Casa
  Central? Probablemente no: la misma regla de «no dar lo que no tenés», aplicada a
  sucursales.
