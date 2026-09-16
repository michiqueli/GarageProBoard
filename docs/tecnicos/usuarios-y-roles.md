# Usuarios y roles

Estado: **usuarios construidos; edición de roles pendiente**. Desde el 16/09/2026 hay
alta, modificación, baja y contraseña nueva, en la API y en la pantalla, con las dos reglas
de abajo aplicadas por el servidor. Crear, clonar y editar roles todavía no.

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

### El administrador de usuarios solo no puede repartir casi nada

Es la consecuencia directa de «nadie da lo que no tiene», y es correcta: quien crea un
mecánico genera su contraseña y puede entrar como él, así que asignar «ver órdenes» es,
en la práctica, verlas.

Por eso el rol predefinido **se combina** con los roles que esa persona va a repartir. La
de sistemas que da de alta mecánicos y asesores tiene «Administrador de usuarios» +
«Mecánico» + «Asesor de servicios». El gerente no necesita nada más: `administrar all`
cubre todo.

La pantalla lo dice en cada rol que no se puede asignar —«te falta ver órdenes de
trabajo»— en vez de dejar descubrirlo con un rechazo.

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

## Preguntas abiertas

- **Comparar reglas con condiciones.** «Cubierta por» es fácil con reglas simples
  (`ver Vehiculo` ⊂ `administrar all`). Con condiciones —el mecánico edita *sus*
  órdenes— hay que decidir si una regla con condición cubre a otra sin ella. La
  respuesta segura es que no, y se ve si molesta en la práctica.
- **La sucursal.** ¿El administrador de usuarios de Rafaela puede dar acceso a Casa
  Central? Probablemente no: la misma regla de «no dar lo que no tenés», aplicada a
  sucursales.
