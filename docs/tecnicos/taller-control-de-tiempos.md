# Control de tiempos de taller — lo que traemos de GarageTick

**GarageTick** es la aplicación anterior del autor: control de tiempos de OT para el
taller de una concesionaria, con fichaje por QR. Está relevada **con una concesionaria
de verdad** y por eso vale más que todo lo que venimos razonando sin piloto: es la única
parte de GarageProBoard que se apoya en observación directa y no en conocimiento general del
dominio.

La copia está en `para_sacar_codigo/GarageTick/`, fuera de git, con sus documentos completos (relevamiento,
arquitectura, modelo de datos, plan por fases, investigación sobre Oversoft, presupuesto
y licencia). **No es parte del monorepo** — tiene su propio `.git` y su propio stack —;
se conserva como material de referencia hasta que el módulo de servicios esté escrito.

## El requisito que manda, y sigue mandando

> **No compite en funcionalidad. Compite en que fichar sean 2 escaneos, 3 segundos, sin
> buscar nada, sin teclado y sin login.**

La concesionaria **ya tenía** el módulo de tiempos de Oversoft y no lo usaba: no era
práctico, no era rápido y se lo cobraban caro. Esa frase no es una aspiración de
experiencia de usuario, es una restricción de ingeniería con números:

| Tramo | Presupuesto |
| --- | --- |
| Lector → feedback en pantalla | **< 50 ms**, contra caché local, sin esperar al servidor |
| Confirmación del servidor | < 200 ms, y **no bloquea la pantalla** |
| Total percibido | < 500 ms |
| En producción | mediana de fichaje < 3 s, p95 < 5 s |

**Anti-features del kiosco**, que es literalmente lo que mató al módulo del competidor:
login, buscar la OT en una grilla, tipear el número, combos de operación, notas
obligatorias, «¿está seguro?», y cualquier pantalla intermedia entre los dos escaneos.

> **Si una interacción del kiosco no es un escaneo, es un bug de diseño.**

Ojo con la tentación de GarageProBoard: el resto del sistema es denso, con teclas de función
y mucha información en pantalla. **El kiosco es al revés** — es la excepción del taller
que ya está escrita en el sistema de diseño: objetivos grandes, el mecánico tiene
guantes y está a dos metros.

## Los tres conceptos que no son lo mismo

Es donde estos proyectos se hunden, y viene resuelto:

| Concepto | Qué es |
| --- | --- |
| **Sesión de trabajo** | Un mecánico fichado en una OT. Son los minutos de mano de obra. |
| **Operación** | La tarea adentro de la OT: cambio de embrague, service de 10.000. |
| **Estado de la OT** | Dónde está el vehículo. |

Una garantía que queda cinco días en el taller **no es una sesión de cinco días**: es una
OT abierta, con sesiones cortas cerradas y esperas en el medio. Modelarlo mal hace que
todos los números de productividad salgan basura y el sistema pierda credibilidad la
primera semana.

De ahí salen **dos relojes, los dos necesarios**: la mano de obra (suma de sesiones, lo
que costó el trabajo) y el *lead time* (de que entró el auto a que salió, lo que el
cliente percibió). La diferencia es el tiempo muerto, y es normalmente lo que la
concesionaria más quiere ver.

Por eso existe `work_order_hold` con motivo —repuestos, autorización del cliente,
autorización de garantía, diagnóstico, elevador—: sin motivos de espera no hay forma de
explicar por qué un auto estuvo seis días.

## Las reglas que se traen tal cual

1. **Los timestamps los pone el servidor**, nunca el cliente: los relojes de las PC del
   taller están siempre mal.
2. **Todo escaneo se loguea crudo**, resuelva o falle. Cuando un mecánico diga «yo
   fiché», esa tabla es la respuesta.
3. **Ninguna corrección de tiempo sin auditoría**, con motivo obligatorio.
4. **Auto-cierre de fin de turno**, y no sólo con un job a las 20:00: también **al
   arrancar**, poniéndose al día con lo que quedó abierto. Si el servidor se reinició
   antes de las 20:00, el job no corrió nunca. Se marca como cierre automático para que
   el jefe lo corrija; nunca se descarta en silencio.
5. **El QR no lleva el id pelado.** `GT1:O:<code8>:<hmac10>`, con HMAC del servidor.
   Con un `12345` cualquiera ficha por otro desde el celular. Límite honesto: un QR se
   fotocopia — esto evita la falsificación casual, no la suplantación deliberada.
6. **Fallback numérico obligatorio**: tipear legajo y número de OT cuando el QR esté
   arruinado. Se van a arruinar; es un taller.
7. **La pantalla del kiosco es orden-agnóstica e idempotente.** Escaneás credencial,
   escaneás OT: si estaba abierta para vos la cierra, si no la abre. No hay modos que
   recordar, el mecánico hace siempre lo mismo.
8. **Feedback grande y con sonido**: pantalla entera verde y un beep, o roja y dos. El
   texto es secundario — manos sucias, dos metros de distancia.
9. **Concurrencia de OT por mecánico configurable** (`unica` | `multiple`), porque el
   jefe de taller de cada concesionaria la define distinto.
10. **Autenticación del dispositivo, no del mecánico.** Si la pantalla de fichaje es una
    URL de la red, cualquier PC la abre y ficha por otro. No se arregla con login —es el
    anti-feature número uno—: la PC del kiosco se registra con su propio token.

## Lo que cambia ahora que el DMS es nuestro

Acá está la ganancia, y es grande:

- **Se cae toda la integración con Oversoft.** Era lo más caro y lo más frágil del
  proyecto: leer órdenes por SQL Server, sobre una vista que tenía que habilitar el
  proveedor, sincronizando a Postgres para que el escaneo nunca dependiera de una consulta
  al DMS ajeno. **La OT nace acá.** Se borran el adaptador, el sync, el mapeo de `charge`
  y la dependencia de que un competidor nos abra una vista.
- **El QR se imprime en nuestra propia OT.** No hay que etiquetar nada aparte ni pegarle
  un código a una orden que imprimió otro sistema: sale impreso cuando recepción genera
  la orden. Era una fricción entera que desaparece.
- **El kiosco deja de ser una aplicación aparte**: es una ruta de `apps/web` con su
  propio layout, sin el armazón denso del resto.
- **`charge` ya está resuelto, y mejor**: el modelo del núcleo tiene los cuatro roles de
  la OT —titular, quien trae, quien autoriza y **quien paga**—, que es lo que hace que
  entren garantía, seguro y leasing sin rehacer nada.
- **Los cinco roles de GarageTick se mapean a los nuestros** de CASL. Se conserva la
  distinción que importa: **recepción no es administración**. Abre órdenes e imprime
  etiquetas, pero no da de alta mecánicos ni corrige tiempos — que es justo lo que el
  sistema existe para evitar.
- **Vuelve a haber red entre el lector y la API**, ahora de verdad: GarageProBoard es SaaS, no
  una PC en el taller. La caché local del kiosco y la cola offline dejan de ser un lujo.
  El fondo de un taller no tiene wifi.
- **Identificadores en inglés → castellano**, con un atajo inesperado: GarageTick arrancó
  en castellano y se renombró a inglés en septiembre. La versión vieja quedó en
  `packages/db/migrations_es_respaldo/`, y **es la que sirve para copiar**: `orden`,
  `sesion_trabajo`, `orden_espera`, `evento_escaneo`, `ajuste_sesion`, `credencial`,
  `dispositivo`. Ya está en el idioma en que nombramos acá.

## Lo que no se trae

El relevamiento tiene preguntas que nunca se contestaron con la concesionaria. Siguen
siendo preguntas: se marcan como supuestos y se validan cuando haya piloto, igual que
todo lo demás que modelamos sin observación directa.

El baremo —tiempo de referencia por operación, para medir eficiencia real contra
tiempo estimado— estaba fuera del alcance pero con el esquema preparado. Acá entra en el
Hito 4, y es de las cosas que una terminal exige.
