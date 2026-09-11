---
name: ui-garagetick
description: Sistema de diseño de GarageTick. Usar SIEMPRE al crear o modificar cualquier pantalla, componente, formulario, listado, tabla o estilo de apps/web, al tocar index.css o los tokens, y al agregar atajos de teclado. Cubre tokens, densidad, el mapa global de teclas F1-F10, el patrón de listado responsive y las reglas de redacción de la interfaz.
---

# Sistema de diseño de GarageTick

Antes de escribir UI, leé `docs/tecnicos/sistema-de-diseno.md`. Ese documento es la
fuente de verdad; esto es el resumen operativo con lo que no se negocia.

## Lo que estamos construyendo

Un sistema que un operador de Oversoft use **más rápido** que Oversoft desde el primer
día, y que alguien que nunca lo vio pueda usar sin un mes de entrenamiento. Las dos
mitades son obligatorias, y no se resuelven con un punto medio tibio: se resuelven con
potencia de teclado y las teclas a la vista.

## Reglas que no se negocian

**1. Cero valores visuales escritos a mano.** Todo color, espaciado, radio y tamaño sale
de un token del `@theme` en `apps/web/src/index.css`. Si necesitás un valor que no
existe, agregás el token — no escribís `#3b82f6` ni `p-[13px]` en un componente. Va a
haber una pasada de UX/UI con un especialista al final, y sale barata solo si cambiar un
token mueve la aplicación entera.

**2. Denso, no apretado.** Fila de tabla 32px, campo 32px, texto de tabla 13px, texto de
interfaz 14px, radio 4px, escala de espaciado de 4px. Casi nada de sombras: un borde de
1px separa igual y no ensucia. Nada de `rounded-lg` en todos lados — si todo parece un
objeto separado, nada resalta. La referencia es Linear, no una landing page.

**3. El atajo se muestra.** La tecla va escrita en el botón: `Guardar F2`. Y la barra de
estado inferior lista siempre las teclas activas del contexto. Las que no aplican van
atenuadas, no se esconden.

**4. Nunca F11 ni F12.** Chrome no las deja interceptar y el atajo no falla con error:
simplemente no pasa nada y el usuario concluye que el sistema está roto. En `F1`, `F3` y
`F5` hay que llamar a `preventDefault()` o gana el navegador.

**5. Todo listado tiene sus dos formas.** Tabla densa en escritorio y tarjetas por
debajo de `md`. Se diseñan juntas. Una tabla con scroll horizontal en el teléfono es una
tabla rota, no una versión móvil.

**6. Los importes**: alineados a la derecha, dos decimales siempre,
`font-variant-numeric: tabular-nums`. Nunca un `number` de JavaScript — son strings
decimales y se operan con `decimal.js` desde `@garagetick/core`.

**7. Estado en forma y color, nunca solo color.** Píldora llena = alguien tiene que
hacer algo. Contorneada = en curso normal. Sin píldora = cerrado. Uno de cada doce
varones no distingue rojo de verde, y en un taller son casi todos varones.

**8. El teclado nunca se queda sin salida.** Toda acción del mouse alcanzable con
teclado, foco siempre visible, `Tab` en orden visual. Si un flujo obliga a agarrar el
mouse, ese flujo está roto.

## Mapa global de teclas

Se registra en **un solo lugar** (`apps/web/src/teclado/`). Si cada pantalla escucha
`keydown` por su cuenta, en tres meses F2 hace dos cosas distintas.

| | | | |
| --- | --- | --- | --- |
| `F1` Ayuda | `F2` Guardar | `F3` Buscar | `F4` Desplegar selector |
| `F5` Refrescar | `F6` Cambiar sucursal | `F7` Imprimir | `F8` **Acción del módulo** |
| `F9` Totales | `F10` Paleta | `Ins` Nuevo | `Supr` Baja |
| `Esc` Cancelar | `Ctrl+Enter` Confirmar | | |

`F8` es el verbo de la pantalla: factura en caja, cierra la orden en taller, entrega en
entregas. Es la única contextual, y por eso siempre va escrita en la barra de estado.

## Redacción

Castellano rioplatense con voseo, sin solemnidad: «Guardá los cambios». El nombre que
usa el usuario, no el del sistema: es una *orden de reparación*, no una entidad. El
botón dice lo que va a pasar y el aviso confirma que pasó. Los errores dicen **cómo
arreglarlo**: «El CUIT son 11 dígitos sin guiones», no «Formato inválido». Sin signos de
admiración y sin «¡Ups!» — el que usa esto está trabajando.

Estados vacíos: explicar y ofrecer la acción. Cargando: esqueletos con la forma del
contenido, no un spinner. Error: qué pasó y qué hacer, sin códigos sueltos.

## La excepción del taller

El piso de taller es lo único que no sigue la regla de densidad: ahí el mecánico tiene
guantes y usa el dedo. Objetivos táctiles de 44px mínimo. Teclado en escritorio, dedo en
el taller — las dos son correctas en su lugar.

## Antes de dar por terminada una pantalla

- ¿Se puede completar el flujo entero sin tocar el mouse?
- ¿Funciona en 375px de ancho, con las filas convertidas en tarjetas?
- ¿Se lee bien en tema oscuro? (En un taller la pantalla se mira todo el día.)
- ¿Hay algún color, espaciado o tamaño escrito a mano?
- ¿La barra de estado muestra las teclas correctas de este contexto?
- ¿Los estados vacío, cargando y con error están resueltos, o solo el caso feliz?
