# Sistema de diseño

Las reglas visuales y de interacción de GarageTick. Este documento se escribe **antes
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

| Tecla | Acción | Siempre disponible |
| --- | --- | --- |
| `F1` | Ayuda contextual de la pantalla | Sí |
| `F2` | Guardar | Si hay algo que guardar |
| `F3` | Buscar — lleva el foco al buscador | Sí |
| `F4` | Desplegar el selector del campo activo (cliente, vehículo, repuesto) | Sobre un campo con búsqueda |
| `F5` | Refrescar los datos de la pantalla | Sí |
| `F6` | Cambiar de sucursal | Sí |
| `F7` | Imprimir o vista previa | Si hay algo imprimible |
| `F8` | **Acción principal del módulo** — contextual | Depende de la pantalla |
| `F9` | Totales y resumen | En pantallas con importes |
| `F10` | Paleta de comandos | Sí |
| `Ins` | Nuevo registro | En listados y fichas |
| `Supr` | Dar de baja, con confirmación | Sobre un registro seleccionado |
| `Esc` | Cancelar, cerrar el modal, salir del campo | Sí |
| `Ctrl` + `Enter` | Confirmar el formulario activo | En formularios |

**`F8` es el verbo de la pantalla.** En caja factura, en taller cierra la orden, en
entregas entrega. Es la única tecla cuyo significado cambia según el contexto, y
justamente por eso **siempre tiene que estar escrita en la barra de estado**.

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

    F1 Ayuda   F2 Guardar   F3 Buscar   F8 Facturar   Esc Cancelar

Las teclas que en ese momento no aplican se muestran atenuadas, no se esconden: que
desaparezcan y reaparezcan hace que la barra se lea distinta en cada pantalla.

### ⚠ Lo primero a validar con un piloto

Este mapa está razonado sobre convenciones del rubro y de Windows, **no sobre observar
Oversoft**. Si el operador real ya tiene otra tecla en los dedos para guardar, **gana
Oversoft y cambiamos nosotros**: el objetivo es cero reentrenamiento, no tener razón.

Es lo primero que hay que mirar cuando aparezca una concesionaria dispuesta a mostrar
cómo trabaja.

---

## 3. Tokens

Todo vive en el bloque `@theme` de Tailwind 4, en `apps/web/src/index.css`. **Ningún
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

### Estado de la orden de reparación

Los estados de la OR son el dato que más se lee en todo el sistema, así que se codifican
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
- La fila entera es navegable con flechas; `Enter` abre.
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
- **El nombre que usa el usuario, no el del sistema.** Es una *orden de reparación*, no
  una `OrdenReparacionEntity`. Es el *dominio*, no la `patente_id`.
- **El botón dice lo que va a pasar**, y el aviso posterior confirma que pasó:
  `Facturar` → «Factura B 0001-00001234 emitida».
- Sin signos de admiración. Sin «¡Ups!». El que está usando esto está trabajando.

---

## 6. Estructura del código

    apps/web/src/
      index.css              @theme: acá viven TODOS los tokens
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
