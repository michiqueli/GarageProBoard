# Sistema de diseño

Las reglas visuales y de interacción de GarageProBoard. Este documento se escribe **antes
de la primera pantalla** a propósito: es lo que evita que cada una invente lo suyo.

Cuando llegue el especialista de UX/UI a hacer la pasada final, este es el archivo que
va a corregir. Por eso todo lo visual está expresado como tokens y no desparramado en
componentes: se cambian los valores de acá y se mueve la aplicación entera.

---

## 1. Qué estamos haciendo, en una frase

Un sistema que un operador de Oversoft pueda usar **más rápido** que Oversoft desde el
primer día, y que alguien que nunca lo vio pueda usar sin un mes de entrenamiento.

Las dos mitades están en tensión y las dos son obligatorias. La forma de resolverla no
es un punto medio tibio: es **potencia de teclado con las teclas a la vista**.

### Los tres principios que salen de ahí

**Denso, no apretado.** El que carga cien órdenes por día no quiere aire, quiere ver
veinte filas sin scrollear. La referencia de densidad es Linear o Bloomberg, no una
landing page. Pero denso no es amontonado: la jerarquía se hace con peso tipográfico y
alineación, no con separación.

**El atajo se muestra.** La tecla va escrita en el botón que dispara la acción
(`Guardar F2`). Así el que recién entra usa el mouse, ve la tecla cada vez, y a la
semana ya no usa el mouse. Nadie leyó nunca un manual de atajos.

**El teclado nunca se queda sin salida.** Toda acción alcanzable con el mouse tiene que
ser alcanzable con el teclado, y el foco tiene que verse siempre. Si en algún flujo hay
que agarrar el mouse porque no hay alternativa, ese flujo está roto.

---

## 2. Mapa global de teclas

Esta es la parte más importante del documento y la más cara de cambiar después. Si F2
guarda en una pantalla y busca en otra, la memoria muscular no se forma nunca y todo el
esfuerzo se pierde.

Las teclas se reparten por **alcance**: F1 a F4 son el primer bloque y se llegan sin
mirar el teclado, así que ahí van las cuatro acciones que más se repiten en el día.

| Tecla | Acción | Siempre disponible |
| --- | --- | --- |
| `F1` | Ayuda contextual de la pantalla | Sí |
| `F2` | Guardar | Si hay algo que guardar |
| `F3` | Buscar — lleva el foco al buscador | Sí |
| `F4` | **Acción principal del módulo** — contextual | Depende de la pantalla |
| `F5` | Refrescar los datos de la pantalla | Sí |
| `F6` | Cambiar de sucursal | Sí |
| `F7` | Imprimir o vista previa | Si hay algo imprimible |
| `F8` | Totales y resumen | En pantallas con importes |
| `F10` | Paleta de comandos | Sí |
| `Alt` + `↓` | Desplegar el selector del campo activo (cliente, vehículo, repuesto) | Sobre un campo con búsqueda |
| `Ins` | Nuevo registro | En listados y fichas |
| `Supr` | Dar de baja, con confirmación | Sobre un registro seleccionado |
| `Esc` | Cancelar, cerrar el modal, salir del campo | Sí |
| `Ctrl` + `Enter` | Confirmar el formulario activo | En formularios |

**`F4` es el verbo de la pantalla.** En caja factura, en taller cierra la orden, en
entregas entrega. Es la única tecla cuyo significado cambia según el contexto, y
justamente por eso **siempre tiene que estar escrita en la barra de estado**.

Está en el primer bloque porque es, junto con guardar y buscar, lo que más se toca en el
día. Que la acción más frecuente quede a dos teclas de distancia es medio segundo por
operación, y son cientos de operaciones por jornada.

### F4 abre la confirmación, nunca ejecuta

Consecuencia directa de moverla al primer bloque: queda **pegada a F3**, que se usa
todo el tiempo. Alguien le va a errar. Así que F4 abre el diálogo de confirmación con el
resumen de lo que va a pasar, y recién ahí `Enter` ejecuta.

Emitir una factura porque se te fue un dedo es un comprobante fiscal que hay que anular
con nota de crédito. El medio segundo que cuesta la confirmación se paga solo.

**`F9` queda sin asignar** a propósito. Las teclas libres se dejan libres: llenarlas
por simetría produce atajos que nadie usa y que se disparan sin querer.

### Por qué el selector se fue a `Alt` + `↓`

Estaba en F4 y hubo que moverlo. Terminó mejor de donde estaba: `Alt` + `↓` es la
convención de Windows para desplegar cualquier combo, así que no hay que enseñarla, y
queda más a mano que cualquier tecla de función para algo que se usa constantemente
mientras se carga un dato.

### Lo que no se toca

`F11` y `F12` **no se usan nunca**. Chrome no permite interceptarlas — son pantalla
completa y devtools — y un atajo ahí no falla con un error: simplemente no pasa nada, y
el usuario concluye que el sistema está roto.

`F1`, `F3` y `F5` tienen comportamiento propio del navegador (ayuda, buscar en la
página, recargar). Se pueden capturar, pero hay que llamar a `preventDefault()`
explícitamente o el navegador gana.

Las teclas de función son el atajo **primario y único**: no hace falta un equivalente
`Ctrl+algo` para cada una. En una concesionaria las estaciones son de escritorio, y
quien trabaje en notebook invierte el comportamiento de `Fn` desde la BIOS. No hay que
diseñar alrededor de un problema que se arregla con una casilla de configuración.

### Barra de estado

Fija abajo, siempre visible, mostrando **las teclas activas en este contexto**. Es la
convención que esta gente ya conoce de los sistemas de caracteres, y resuelve el
descubrimiento sin ocupar lugar:

    F1 Ayuda   F2 Guardar   F3 Buscar   F4 Facturar   Esc Cancelar

**Las principales siempre; el resto, sólo cuando se puede usar.** F1 Ayuda, F2 Guardar,
F3 Buscar, Esc Cancelar y el verbo de la pantalla (F4) están siempre, atenuadas si ahora
no aplican: son el lugar fijo donde mirar. Las demás aparecen sólo cuando funcionan. Al
principio se mostraban todas, y con el catálogo creciendo las apagadas tapaban a las
útiles. Qué es principal se marca en el catálogo con `principal: true`. Si aun así no entra, la barra pasa a dos filas y
publica su altura en `--spacing-barra-estado`, que descuentan el menú, el contenido y las
notificaciones.

### Todo esto es configurable por usuario

Los valores de arriba son el punto de partida, no una imposición. Cada usuario puede
reasignar sus teclas desde **Configuración → Teclas rápidas**, agrupadas por módulo:

    Configuración → Teclas rápidas → Generales
                                   → Órdenes de trabajo
                                   → Entregas
                                   → Repuestos
                                   → Caja y facturación
                                   → Clientes
                                   → Vehículos

Eso vuelve barato el riesgo del mapa: si el operador que viene de Oversoft tiene otra
tecla en los dedos, se la acomoda en dos minutos en vez de pelearse un año.

#### El verbo de la pantalla es una acción por módulo

`F4` no es una acción sola con significado variable: son `caja.facturar`,
`ordenes.cerrar`, `entregas.entregar`, cada una configurable por separado. Comparten
tecla por omisión porque **nunca coexisten** — o estás en caja o estás en taller — y así
el operador aprende una sola posición para «la acción de esta pantalla».

De ahí sale la regla de unicidad: **dos módulos pueden compartir una tecla, un módulo y
lo global no**. Una acción de caja en F7 choca con Imprimir aunque el usuario nunca haya
tocado Imprimir.

#### Reglas de la configuración

- Las **teclas prohibidas** se rechazan con el motivo escrito: F11, F12, `Ctrl+W`,
  `Ctrl+T`, `Ctrl+N` y sus variantes con Shift. El navegador se las queda y el atajo
  nunca llegaría a la aplicación.
- `Esc`, `Tab` y `Shift+Tab` están **reservadas** y no se pueden asignar. `Esc` cancela
  en todos lados o los modales se vuelven trampas.
- Los modificadores se guardan en **orden canónico** `Ctrl+Alt+Shift+Tecla`. Sin eso,
  `Alt+Ctrl+K` y `Ctrl+Alt+K` serían dos teclas distintas y la unicidad no serviría.
- La tecla Windows se trata como `Ctrl`, para que un mapa configurado en una máquina no
  se rompa en otra.

#### La consecuencia para el código

**Ninguna pantalla escribe `F2` a mano.** Ni en un botón, ni en la barra de estado, ni
en un texto de ayuda. Todo sale del mapa resuelto del usuario:

    <Boton accion="global.guardar">Guardar</Boton>

El botón consulta el mapa y dibuja la tecla que ese usuario tenga puesta. Un `F2`
escrito en el JSX es un botón que va a mentir apenas alguien configure otra cosa — y
mentir sobre un atajo es peor que no mostrarlo.

El catálogo de acciones vive en `packages/core/src/atajos.ts` y es la única fuente de
verdad. Agregar una acción es sumarla ahí; el test verifica que su tecla por omisión no
choque con ninguna existente.

#### Qué guarda la base

`usuario_config` para tema, densidad, filas por página y sucursal predeterminada.
`usuario_atajo` para el mapa, **sembrado completo al crear el usuario** y con dos
índices únicos: una tecla por acción, y una acción por tecla dentro de cada ámbito.

El mapa va en su propia tabla y no dentro de un JSON justamente por esos índices: un
mapa con F3 duplicado no es un dato feo, es un usuario cuyo teclado hace cosas al azar
según el orden en que se recorra el objeto.

### ⚠ Lo primero a validar con un piloto

Este mapa está razonado sobre convenciones del rubro y de Windows, **no sobre observar
Oversoft**. Si el operador real ya tiene otra tecla en los dedos para guardar, **gana
Oversoft y cambiamos nosotros**: el objetivo es cero reentrenamiento, no tener razón.

Es lo primero que hay que mirar cuando aparezca una concesionaria dispuesta a mostrar
cómo trabaja.

---

## 3. Tokens

Todo vive en el bloque `@theme` de Tailwind 4, en `packages/ui-tokens/tokens.css`. **Ningún
componente escribe un color, un espaciado o un tamaño a mano.**

### Color

Neutros con sesgo frío, un color de marca y los semánticos aparte. El color de marca
**no** se usa para indicar estado: si el azul significa a la vez «nuestra marca» y
«en proceso», deja de significar cualquiera de las dos.

    --color-fondo            fondo de la aplicación
    --color-superficie       tarjetas, tablas, modales
    --color-superficie-alt   filas alternas, encabezados de tabla
    --color-borde            divisiones
    --color-texto            texto principal
    --color-texto-suave      secundario, etiquetas
    --color-texto-tenue      deshabilitado, marcas de agua

    --color-marca            acción principal, foco, elemento activo
    --color-marca-suave      fondo de lo seleccionado

    --color-ok               confirmado, terminado, al día
    --color-atencion         esperando algo, por vencer
    --color-critico          error, vencido, anulado
    --color-info             informativo, en curso

Cada uno con su variante para tema oscuro. **El tema oscuro no es opcional**: en un
taller la pantalla se mira todo el día.

### Estado de la orden de trabajo

Los estados de la OT son el dato que más se lee en todo el sistema, así que se codifican
en **forma y color a la vez** —  nunca solo en color, porque uno de cada doce varones
no distingue rojo de verde y en un taller son casi todos varones.

| Estado | Color | Forma |
| --- | --- | --- |
| Recibido | neutro | píldora contorneada |
| Presupuestado | info | píldora contorneada |
| Esperando autorización | atención | píldora **llena** — reclama acción |
| Esperando repuesto | atención | píldora contorneada + ícono de reloj |
| En proceso | marca | píldora llena |
| Terminado | ok | píldora llena |
| Entregado | neutro tenue | texto sin píldora — ya no requiere nada |
| Anulado | crítico tenue | texto tachado |

La regla detrás: **píldora llena = alguien tiene que hacer algo**. Contorneada = está en
curso normal. Sin píldora = cerrado. Se lee de un vistazo a tres metros del monitor.

### Fondos: dónde sí y dónde no

Se evaluó el patrón de paneles flotando sobre una foto (referencia: CAR XPERT en
`docs/ideas/`). Es lindo y diferencia mucho frente a Oversoft, pero tiene un costo que
sólo se paga en algunos lugares. Decisión:

| Pantalla | Fondo |
| --- | --- |
| Login y selección de sucursal | **Imagen plena y nítida.** La marca de la concesionaria. |
| Tablero | Plano hoy. A futuro, opcional con imagen muy atenuada. |
| OT, caja, repuestos, clientes, vehículos | **Plano. Siempre.** |

Por qué se corta ahí: para que una tabla densa se lea sobre una foto hay que ponerle un
velo del 78% y catorce píxeles de desenfoque, y entonces **la foto ya no se ve** —
queda como atmósfera en los bordes. Se paga el costo (legibilidad, GPU en la máquina
del mostrador, licencia de las imágenes de la terminal) sin cobrar el beneficio.

En login sí se cobra entero: no hay contenido que proteger, y es el momento en que el
gerente ve «su» sistema.

Si algún día el tablero lleva imagen, **los KPIs y los paneles van más separados**: es
la densidad `cómoda`, no la `compacta`. Un fondo con forma necesita respiro entre
bloques o pelea con ellos.

### Las imágenes las sube la concesionaria, no las traemos nosotros

Las fotos de Toyota, VW o Ford son marcas registradas. Si el producto las distribuye,
es un problema de licencia nuestro; si las carga el cliente, es su elección y su
responsabilidad. Va como configuración del tenant, junto con el logo y el color.

### El color fuerte es el del cliente, no el nuestro

Hay tres marcas apiladas: GarageProBoard, la concesionaria, y la terminal que la
concesionaria representa. Si nuestro acento grita, le pelea a la marca de cada cliente
en cada pantalla.

Por eso `--color-marca` es un **token por tenant**, configurable, con un valor por
omisión sobrio. La concesionaria sube su logo, su color y sus imágenes, y el sistema se
pone su piel. Es una función de SaaS que se vende sola y cuesta poco.

### Espaciado

Escala de 4 px. Nada de valores sueltos:

    1 = 4px    2 = 8px    3 = 12px    4 = 16px    6 = 24px    8 = 32px

### Tipografía

| Rol | Tamaño | Peso |
| --- | --- | --- |
| Título de pantalla | 18px | 600 |
| Título de sección | 14px | 600 |
| Texto de interfaz | 14px | 400 |
| Tabla y formularios | 13px | 400 |
| Etiquetas y barra de estado | 12px | 500 |

**Los números que se comparan van en tabular.** Importes, kilometrajes, números de
comprobante: `font-variant-numeric: tabular-nums`, o las columnas no alinean y el ojo no
puede escanear. Esto no es estética, es legibilidad de una columna de plata.

Los importes van **alineados a la derecha**, siempre, con dos decimales, siempre. Un
importe sin decimales al lado de uno con decimales es un error de lectura esperando
suceder.

### Densidad

| Elemento | Alto |
| --- | --- |
| Fila de tabla (compacta, por defecto) | 32px |
| Fila de tabla (cómoda, opcional por usuario) | 40px |
| Campo de formulario | 32px |
| Botón | 32px |
| Objetivo táctil en el piso de taller | **44px mínimo** |

El taller es la excepción deliberada: ahí el usuario tiene guantes y usa el dedo, no el
teclado. Es la única parte del sistema donde la densidad cede ante el tamaño.

### Radio y sombra

Radio 4px. Sombra: **casi ninguna**. Un borde de 1px separa igual de bien y no ensucia.
La sombra se reserva para lo que flota de verdad — modales y menús desplegables — donde
comunica algo real.

Nada de `rounded-lg` en todo. Un radio grande y una sombra en cada bloque aplanan la
jerarquía: si todo parece un objeto separado, nada resalta.

---

## 4. Patrones

### Listado

**El patrón más repetido del sistema.** Tabla densa en escritorio, tarjetas en teléfono.
Las dos formas se diseñan juntas o la segunda no llega nunca.

- Los filtros viven en la URL, validados por Zod en la ruta de TanStack Router. Un
  listado filtrado tiene que poder mandarse por mail.
- Más de 200 filas: virtualización con `@tanstack/react-virtual`.
- La fila entera se abre con un clic (`clicEnFila`, cursor de ojo) y es navegable con
  flechas: `↑` `↓` marcan una fila —también desde el buscador del listado, con `data-lista`—,
  `Enter` la abre y `Esc` suelta la marca (`useFilasConTeclado`). Las pestañas y los filtros
  que se usan como pestañas se recorren con `←` `→` (`useFlechasPestanas`). Ninguna de las dos
  actúa con el foco en un campo, y la barra de estado las anuncia como ayudas.
- Columna de importes a la derecha y en tabular.
- Por debajo del breakpoint `md`, cada fila pasa a tarjeta con las tres o cuatro
  columnas que importan. **No** una tabla con scroll horizontal: eso es una tabla rota,
  no una versión móvil.

### Formulario

- Una sola columna en pantallas angostas; dos como máximo en anchas. Tres columnas de
  campos no se leen, se escanean mal y se completan peor.
- `Tab` sigue el orden visual. Sin excepciones ni `tabIndex` creativos.
- Validación **al salir del campo**, no en cada tecla: marcar en rojo mientras alguien
  todavía está escribiendo el CUIT es hostil.
- El error va debajo del campo y dice **cómo arreglarlo**, no qué falló. «El CUIT son 11
  dígitos sin guiones», no «Formato inválido».
- `F2` guarda desde cualquier campo. `Esc` cancela y, si hay cambios sin guardar,
  pregunta.

### Ficha

Para el vehículo, el cliente, la orden. Encabezado con la identidad y el estado, y
debajo las secciones. El historial va en orden cronológico inverso: lo último primero,
porque es lo que se consulta.

### Buscador del sistema

Un campo en la barra lateral que busca **el sistema**: pantallas, acciones y
configuraciones. Escribir «mercado pago» lleva a la configuración de Mercado Pago;
escribir «certificados», a los certificados de AFIP. Lo que resuelve es la pregunta más
frecuente de cualquier sistema grande: *¿dónde estaba esto?*

**No se confunde con el buscador del encabezado**, y por eso cada uno dice qué busca:

| | Busca | Ejemplo |
| --- | --- | --- |
| Encabezado, `F3` | **Datos** | Una patente, un chasis, un cliente |
| Barra lateral, `F10` | **El sistema** | Una pantalla, una configuración, una acción |

**Es la misma cosa que la paleta.** El campo es la puerta visible y `F10` el atajo; no
son dos índices ni dos búsquedas. Quien no sabe que existe la tecla lo encuentra igual,
que es todo el punto de que esté a la vista.

#### El índice

Cada entrada declara su título, **dónde vive** y sus palabras clave:

    Mercado Pago · Contable → Configuración
    claves: mp, mercadopago, cobros, medios de pago, pasarela

    Certificados de AFIP · Contable → Configuración
    claves: afip, arca, certificado digital, factura electrónica, csr, clave fiscal

Las palabras clave son el trabajo de verdad: **nadie busca con el nombre que le pusimos
a la pantalla.** El que busca «factura electrónica» tiene que llegar a los certificados
aunque la pantalla se llame de otra forma.

**Una pantalla nueva se registra en el índice igual que se registra en el menú.** Si no
está, no existe para quien la busca.

El resultado muestra la miga —«Contable → Configuración»— porque enseña el mapa: quien
busca dos veces, la tercera va directo por el menú.

#### Qué aparece y qué no

Los mismos tres estados del menú, por los mismos motivos:

- **Sin permiso, o con el módulo apagado**: no aparece. No es para este usuario, o no es
  de esta concesionaria.
- **Sin construir**: aparece atenuada, no navega, y dice dónde va a estar. La pregunta
  «¿dónde va a estar Mercado Pago?» se contesta igual antes de que la pantalla exista, y
  es mejor respuesta que el silencio.
- **Lista**: `Enter` y ya está.

#### Reglas de la coincidencia y del teclado

- Sin acentos ni mayúsculas, y **por palabras sueltas en cualquier orden**: «pago
  mercado» encuentra lo mismo que «mercado pago».
- El primer resultado viene seleccionado; `↑` `↓` recorren, `Enter` abre, `Esc` cierra y
  devuelve el foco a donde estaba.
- Nunca hace falta el mouse, como todo lo demás.

### Notificaciones, confirmaciones y botones de acción

Tres piezas compartidas en `apps/web/src/componentes/`, montadas una sola vez en la raíz.
Ninguna pantalla arma las suyas.

**Notificaciones** (`notificar.ok/error/info` en `avisos.ts`). Abajo a la derecha, arriba de
la barra de estado; en el teléfono, a todo el ancho.

- Lo que se guardó se avisa: la operación declara `meta: { exito: 'Cliente guardado' }`.
- **Lo que falla al guardar se avisa solo**: la caché de consultas (`sesion/consultas.ts`)
  manda todo error de una operación a una notificación. Una pantalla nueva no puede
  olvidarse. Si el error necesita otras palabras, `meta.error` las da, con una acción si
  hace falta («Abrir su ficha»). `meta: { error: false }` sólo donde el error se muestra en
  su lugar: el inicio de sesión y la consulta al padrón.
- Las de éxito se van solas a los cinco segundos, salvo con el mouse o el foco encima. **Los
  errores quedan hasta que alguien los cierra**: un error que se va solo es un error que
  nadie leyó.
- Ícono, borde de color y palabra: nunca sólo color.
- Lo que **no** va en una notificación: la validación de un campo, que va al lado del campo,
  y el error al *cargar* una pantalla, que va en el lugar de lo que no se pudo mostrar.

**Confirmación** (`confirmar()` en `avisos.ts`, que devuelve una promesa). **Nada se da de
baja, desactiva, descarta ni invalida sin preguntar**: desactivar un cliente, una sucursal o
un punto de venta, dar de baja un usuario, generarle una contraseña nueva, descartar un
pedido de certificado. Una acción así sin confirmación es un bug.

- El título es la pregunta con el nombre de lo que se toca: «¿Dar de baja a Pedro Sosa?».
  El texto dice qué implica y si se puede volver atrás. El botón dice lo que va a pasar:
  «Dar de baja», nunca «Aceptar».
- `peligro: true` en las bajas: botón crítico y **el foco arranca en Cancelar**, para que un
  `Enter` de más no dé de baja a nadie. `Esc` cancela; `Tab` no se escapa del diálogo.
- Con la pregunta abierta los atajos de la pantalla no disparan: F2 no puede guardar lo que
  la pregunta está protegiendo.

**Botones de acción.** Las acciones de una fila, una tarjeta o una sección son botones
`<Boton tamano="chico" icono={…}>`, no palabras subrayadas: se ven como algo que se aprieta.
El ícono acompaña a la palabra, nunca la reemplaza (`componentes/iconos.tsx`, mismo trazo
que el menú). Lo que **lleva a otra pantalla** sigue siendo un enlace —el nombre del
cliente, la patente, «← Todos los clientes»—, y si tiene que verse como botón usa
`clasesBoton()` sin dejar de ser un `<a>`.

### Patentes y chasis

Una patente se dibuja siempre con `<Patente>`, como la chapa de la calle: Mercosur, anterior, o
la de «sin patentar» para los 0 km. **Toda patente y todo chasis a la vista llevan
`<BotonCopiar>` al lado**: copiar el chasis para pegarlo en el buscador de repuestos o en el
sistema de la terminal es de lo que más se hace en el mostrador. Se copia sin espacios. En
la ficha del vehículo, además, con teclado: `Alt + C` el chasis y `Alt + P` la patente.

### Estados vacíos, cargando y con error

- **Vacío**: decir qué es esto y ofrecer la acción. «Todavía no hay órdenes en esta
  sucursal» + botón `Nueva orden Ins`. Nunca una tabla vacía sin explicación.
- **Cargando**: esqueletos con la forma del contenido que viene, no un spinner centrado.
  El spinner hace que la pantalla salte cuando llegan los datos.
- **Error**: qué pasó y qué hacer. «No se pudo conectar con AFIP. La factura quedó
  guardada como pendiente y se reintenta sola.» Nunca un código de error suelto ni una
  disculpa.

---

## 5. Cómo se escribe

- **Castellano rioplatense, voseo, sin solemnidad.** «Guardá los cambios», no «Guarde
  los cambios» ni «Guardar cambios del formulario».
- **El nombre que usa el usuario, no el del sistema.** Es una *orden de trabajo*, no
  una `OrdenReparacionEntity`. Es el *dominio*, no la `patente_id`.
- **El botón dice lo que va a pasar**, y el aviso posterior confirma que pasó:
  `Facturar` → «Factura B 0001-00001234 emitida».
- Sin signos de admiración. Sin «¡Ups!». El que está usando esto está trabajando.

---

## 6. Estructura del código

    apps/web/src/
      index.css              importa los tokens de packages/ui-tokens
      ui/                    componentes de shadcn — no saben nada del dominio
      componentes/           componentes propios y transversales (barra de estado,
                             listado responsive, píldora de estado)
      modulos/<modulo>/       pantallas y componentes de cada módulo
      teclado/               el mapa global y el hook de atajos

**Un solo lugar registra los atajos.** Si cada pantalla escucha `keydown` por su cuenta,
en tres meses hay dos pantallas donde F2 hace cosas distintas y nadie sabe por qué.

### La prueba de fuego

> Si el especialista de UX cambia un token y hay una sola pantalla que no se entera,
> ese token estaba escrito a mano en algún lado. Eso es un bug.
