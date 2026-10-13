# La recepción en tablet: quién opera, dónde corre y cómo se llega

Decidido el 18/09/2026, antes de escribir una línea. La pregunta que lo disparó fue si la
recepción de vehículos tenía que ser una app para tablet, unas pantallas de kiosco con un
usuario `TabRecepcion1`, o una sección más del sistema con un botón «Recepcionar».

Las tres parecen la misma pregunta y son tres:

| | |
| --- | --- |
| **Quién opera** | Cuenta compartida del dispositivo, o persona identificada |
| **Dónde corre** | Una app nativa, o la web que ya existe |
| **Cómo se llega** | Un modo dedicado, o una acción adentro del sistema |

La app nativa contesta la segunda, el usuario de kiosco contesta la primera y la tercera, y
la sección con botón contesta la tercera. Por eso no son excluyentes como parecen, y por eso
se pueden combinar las respuestas buenas de cada una.

## Lo decidido

**La recepción es una sección del sistema, operada por una persona identificada, en la web
que ya tenemos.** Con dos agregados que le sacan a la idea del kiosco lo que tenía de bueno:

1. **El modo lo pone el dispositivo, no la cuenta.** La tablet se registra como
   `dispositivo` —la tabla existe desde el principio, en `packages/db/src/schema/sesion.ts`—
   y en ese dispositivo la aplicación arranca en modo táctil y con la recepción como
   pantalla de entrada.
2. **La persona entra con su credencial QR**, la misma `GT1:M:…` del fichaje
   (`packages/core/src/qr.ts`). Pasa la credencial por la cámara y está adentro, como él, sin
   teclado y sin un cliente esperando que termine de tipear una contraseña.

## Por qué no el usuario compartido

Es la opción que más tienta y la única que rompe algo que ya está construido.

**Se lleva puesta la auditoría.** Cada fila de `auditoria` y de `auditoria_cambio` lleva el
`usuario_id` de la sesión. Con `TabRecepcion1`, la respuesta a «¿quién recibió este auto, y
quién le dijo al cliente que el presupuesto era de tanto?» es *la tablet*. Y es justamente la
peor pantalla donde perderlo: la recepción es donde se carga **quién autoriza, con nombre y
teléfono**, que es el dato del que después depende que un trabajo se cobre o no se cobre.

**Los permisos por persona dejan de significar nada.** El modelo tiene condiciones que se
resuelven contra quién está usando el sistema —`{ mecanicoId: '${usuarioId}' }`, en
`packages/core/src/permisos.ts`—. Con una cuenta compartida, «sus propias órdenes» son las de
todos.

**Y lo operativo, que pasa siempre.** La contraseña compartida termina escrita atrás de la
tablet, no se rota nunca, y sigue sirviendo el día que el recepcionista renuncia.

### Pero la intuición de atrás era correcta

Nadie quiere tipear mail y contraseña en una tablet con un cliente parado adelante, ni que la
tablet quede abierta en el mostrador. Eso no se arregla con una cuenta compartida: se arregla
**separando la identidad del dispositivo de la identidad de la persona**, que es textualmente
la regla 10 de [control de tiempos de taller](taller-control-de-tiempos.md) —«autenticación
del dispositivo, no del mecánico»—.

El matiz que importa, y que hace que la regla del taller no se copie tal cual: **en el kiosco
del taller no hay login porque el presupuesto es de tres segundos**. La recepción es una
conversación de varios minutos. Ahí sí hay una persona identificada; lo único que tiene que
ser rápido es cómo entra.

## Por qué no la app nativa, todavía

Lo que justifica ir a nativo es cámara, firma y sobre todo **cola offline**. Cámara y firma
andan bien en web: `getUserMedia` y un canvas con eventos de puntero. Offline en web es
service worker más IndexedDB — se puede, pero es de lo más difícil de hacer bien.

Sólo que la diferencia real es **dónde**: la recepción está en la puerta, con wifi, y ahí la
cola offline es un lujo. En el fondo del taller no lo es, y por eso está anotada en
`apps/mobile` y no acá.

Arrancar la app ahora cuesta segundo stack, segundo despliegue, segunda autenticación y
segundo sistema de diseño, todo antes de tener un piloto que diga si la recepción con tablet
se usa. Si al final reciben con una notebook en el mostrador —que es como reciben hoy con
Oversoft— ese trabajo se tira entero.

**Y no se cierra la puerta.** Si el piloto pide nativo, el flujo ya va a estar modelado y la
API ya lo va a servir: `apps/mobile` es otro consumidor del mismo contrato. Es el motivo por
el que el contrato vive en `packages/contracts` y no adentro de la API.

## Cómo se implementa, cuando toque

- **A dónde cae cada uno al entrar ya está resuelto.** `primeraPantalla()` en
  `apps/web/src/navegacion.tsx` manda a cada usuario a la primera sección que puede ver, en
  el orden del menú. Un rol «Recepcionista» con la sección Recepción arriba cae ahí al
  iniciar sesión, que es el efecto que se buscaba con el usuario de kiosco.
- **La densidad táctil es un valor más, no una rama por pantalla.** Hoy `usuario_config`
  acepta `compacta` y `comoda`; falta `tactil`. Como `useDensidad` estampa el atributo en la
  raíz del documento, alcanza con los tokens: 44px de objetivo mínimo, igual que el tótem.
- **Una vista, no un flujo aparte.** La recepción con teclado que ya existe —patente, Enter,
  Tab, F2— y la de tablet tienen que ser **dos vistas del mismo flujo**: patente → vehículo →
  cliente → qué le pasa → fotos → firma. Dos flujos separados se desincronizan, y el de menos
  uso queda viejo sin que nadie se entere.
- **La sesión en un dispositivo táctil vence por inactividad** y se vuelve a abrir con la
  credencial. Una tablet en un mostrador no se cierra sola de otra forma.

## Lo que no es esto

**El tótem de la puerta sí es el kiosco bien hecho.** Ahí no hay nadie con sesión porque el
que lo toca es el cliente: la identidad es del dispositivo y de nadie más. Está en el roadmap
como cosa aparte y conviene que siga separado — confundirlos es lo que lleva a querer resolver
los dos con el mismo usuario compartido.

## Lo que salió al construirlo (13/10/2026)

- **La tablet es una estación más, no un `dispositivo`.** La tabla `dispositivo` sirve para
  la trazabilidad: es la cookie de un navegador, sin token y sin forma de revocarse. Las
  estaciones ya tenían todo lo que hacía falta: el alta con un link de una sola vez, el token
  en el aparato, la sucursal y la revocación. Se sumó el tipo «Recepción», y en esa tablet
  `/fichaje` muestra «Pasá tu credencial» en vez del lector del taller.
- **Faltaba el vínculo entre la cuenta y el legajo.** `usuario.empleado_id` existía y sólo lo
  llenaban las semillas. Ahora se elige en Usuarios. Sin ese vínculo, la credencial no tiene
  a qué cuenta abrir, y la tablet lo dice: «Tu legajo no tiene una cuenta del sistema».
- **La credencial sola no abre nada fuera de una tablet registrada.** `POST /auth/credencial`
  pide el token de una estación de recepción, y después verifica la firma del QR, que la
  credencial esté vigente, que el legajo tenga una cuenta activa y que esa cuenta entre a la
  sucursal de la tablet. Se decidió no pedir PIN: con el cliente parado adelante, la tablet
  registrada y la credencial revocable desde Personal alcanzan.
- **La inactividad se corta en dos lados.** La pantalla cierra la sesión a los quince
  minutos sin que nadie la toque, y avisa en el último minuto. Del lado del servidor, la
  sesión de una tablet (`sesion.estacion_id`) vence a la media hora sin renovarse en vez de a
  los treinta días, y se corta si revocan la tablet: es el respaldo para cuando la pantalla no
  puede cerrarla.
- **La cámara es la de adelante**, y lee con el lector que trae el navegador
  (`BarcodeDetector`). Donde no existe, como en Safari del iPad, usa `jsqr`, que se descarga
  recién ahí. Un lector de tarjetas por USB o Bluetooth también sirve: tipea el código y
  manda Enter.
- **Una estación que no ficha ya no puede fichar.** La API aceptaba escaneos de cualquier
  estación, también del tótem o del llamador, cuyo token está en un aparato a la vista de
  todos. Ahora fichan sólo el taller y el reloj.
