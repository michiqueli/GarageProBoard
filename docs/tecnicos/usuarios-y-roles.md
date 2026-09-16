# Usuarios y roles

Estado: **construido**. Desde el 16/09/2026 hay alta, modificación, baja y contraseña nueva
de usuarios, y crear, clonar y modificar roles, en la API y en la pantalla, con las reglas
de abajo aplicadas por el servidor.

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

| | Qué es | De qué módulo |
| --- | --- | --- |
| **Usuario** | El acceso al sistema: correo, contraseña, rol, sucursales | Núcleo |
| **Empleado** | El legajo: datos personales, categoría, convenio, sueldo | RRHH |

Hay empleados que nunca van a entrar al sistema —un lavador, un cadete— y usuarios que
no son empleados —el contador externo—. Si RRHH hace las dos cosas, es porque su rol
tiene los dos permisos, no porque sean la misma pantalla. Y quien administra usuarios
**no ve sueldos** por eso: el legajo está en otra tabla, con otro permiso.

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
botones de la pantalla se actualizan cuando se renueva la sesión (a lo sumo quince minutos):
hasta entonces puede ver algo que ya no puede usar, y la API se lo dice.

## Preguntas abiertas

- **Comparar reglas con condiciones.** «Cubierta por» es fácil con reglas simples
  (`ver Vehiculo` ⊂ `administrar all`). Con condiciones —el mecánico edita *sus*
  órdenes— hay que decidir si una regla con condición cubre a otra sin ella. La
  respuesta segura es que no, y se ve si molesta en la práctica.
- **La sucursal.** ¿El administrador de usuarios de Rafaela puede dar acceso a Casa
  Central? Probablemente no: la misma regla de «no dar lo que no tenés», aplicada a
  sucursales.
