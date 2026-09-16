---
name: ui-gpb
description: Sistema de diseño de GarageProBoard. Usar SIEMPRE al crear o modificar cualquier pantalla, componente, formulario, listado, tabla o estilo de apps/web o apps/backoffice/web, al tocar los tokens, y al agregar atajos de teclado. Cubre tokens, densidad, el mapa global de teclas F1-F10, el patrón de listado responsive y las reglas de redacción de la interfaz.
---

# Sistema de diseño de GarageProBoard

Antes de escribir UI, leé `docs/tecnicos/sistema-de-diseno.md`. Ese documento es la
fuente de verdad; esto es el resumen operativo con lo que no se negocia.

## Lo que estamos construyendo

Un sistema que un operador de Oversoft use **más rápido** que Oversoft desde el primer
día, y que alguien que nunca lo vio pueda usar sin un mes de entrenamiento. Las dos
mitades son obligatorias, y no se resuelven con un punto medio tibio: se resuelven con
potencia de teclado y las teclas a la vista.

## Reglas que no se negocian

**1. Cero valores visuales escritos a mano.** Todo color, espaciado, radio y tamaño sale
de un token del `@theme` en `packages/ui-tokens/tokens.css`. Si necesitás un valor que no
existe, agregás el token — no escribís `#3b82f6` ni `p-[13px]` en un componente. Va a
haber una pasada de UX/UI con un especialista al final, y sale barata solo si cambiar un
token mueve la aplicación entera.

**2. Denso, no apretado.** Fila de tabla 32px, campo 32px, texto de tabla 13px, texto de
interfaz 14px, radio 4px, escala de espaciado de 4px. Casi nada de sombras: un borde de
1px separa igual y no ensucia. Nada de `rounded-lg` en todos lados — si todo parece un
objeto separado, nada resalta. La referencia es Linear, no una landing page.

**3. El atajo se muestra, y sale del mapa del usuario.** La tecla va escrita en el
botón y la barra de estado lista siempre las teclas activas del contexto (las que no
aplican, atenuadas, no escondidas). Pero **nunca se escribe `F2` a mano**: los atajos
son configurables por usuario, así que todo sale del mapa resuelto.

    <Boton accion="global.guardar">Guardar</Boton>

Un `F2` escrito en el JSX es un botón que va a mentir apenas alguien configure otra
cosa, y mentir sobre un atajo es peor que no mostrarlo.

**4. Nunca F11 ni F12.** Chrome no las deja interceptar y el atajo no falla con error:
simplemente no pasa nada y el usuario concluye que el sistema está roto. En `F1`, `F3` y
`F5` hay que llamar a `preventDefault()` o gana el navegador.

**5. Todo listado tiene sus dos formas.** Tabla densa en escritorio y tarjetas por
debajo de `md`. Se diseñan juntas. Una tabla con scroll horizontal en el teléfono es una
tabla rota, no una versión móvil.

**6. Los importes**: alineados a la derecha, dos decimales siempre,
`font-variant-numeric: tabular-nums`. Nunca un `number` de JavaScript — son strings
decimales y se operan con `decimal.js` desde `@gpb/core`.

**7. Estado en forma y color, nunca solo color.** Píldora llena = alguien tiene que
hacer algo. Contorneada = en curso normal. Sin píldora = cerrado. Uno de cada doce
varones no distingue rojo de verde, y en un taller son casi todos varones.

**8. El teclado nunca se queda sin salida.** Toda acción del mouse alcanzable con
teclado, foco siempre visible, `Tab` en orden visual. Si un flujo obliga a agarrar el
mouse, ese flujo está roto.

**9. Toda pantalla nueva se registra en el índice del buscador.** La barra lateral tiene
un campo que busca el sistema —pantallas, acciones y configuraciones—, y es la misma cosa
que la paleta de `F10`. Se registra con sus **palabras clave**, no sólo con su nombre:
nadie busca «Certificados» cuando lo que tiene en la cabeza es «factura electrónica». Si
no está en el índice, no existe para quien la busca. Es distinto del buscador del
encabezado (`F3`), que busca datos: patente, chasis, cliente.

## Mapa global de teclas

Se registra en **un solo lugar** (`apps/web/src/teclado/`). Si cada pantalla escucha
`keydown` por su cuenta, en tres meses F2 hace dos cosas distintas.

Repartidas por alcance: F1 a F4 es el primer bloque del teclado, se llega sin mirar, y
ahí van las cuatro acciones que más se repiten en el día.

| | | | |
| --- | --- | --- | --- |
| `F1` Ayuda | `F2` Guardar | `F3` Buscar | `F4` **Acción del módulo** |
| `F5` Refrescar | `F6` Cambiar sucursal | `F7` Imprimir | `F8` Totales |
| `F10` Paleta | `Alt+↓` Desplegar selector | `Ins` Nuevo | `Supr` Baja |
| `Esc` Cancelar | `Ctrl+Enter` Confirmar | | |

`F4` es el verbo de la pantalla: factura en caja, cierra la orden en taller, entrega en
entregas. Es la única contextual, y por eso siempre va escrita en la barra de estado.

**F4 abre la confirmación, nunca ejecuta.** Está pegada a F3, que se usa todo el tiempo,
y emitir una factura por un dedo errado es un comprobante fiscal que hay que anular con
nota de crédito.

`F9` no tiene global: cada módulo lo usa para su segunda acción.

### Son valores por omisión, no imposiciones

Cada usuario reasigna los suyos en **Configuración → Teclas rápidas**, agrupadas por
módulo (Generales, Órdenes de trabajo, Entregas, Repuestos, Caja, Clientes, Vehículos).

El catálogo de acciones vive en `packages/core/src/atajos.ts` y es la única fuente de
verdad. Agregar una acción nueva es sumarla ahí con su ámbito y su tecla por omisión;
hay un test que falla si esa tecla choca con alguna existente.

**El verbo de la pantalla es una acción por módulo** — `caja.facturar`,
`ordenes.cerrar`, `entregas.entregar` — que comparten F4 por omisión porque nunca
coexisten. De ahí la regla de choques: dos módulos pueden compartir una tecla, un módulo
y lo global no.

Nunca asignar F11, F12, `Ctrl+W`, `Ctrl+T` ni `Ctrl+N`: el navegador se las queda.
`Esc`, `Tab` y `Shift+Tab` están reservadas.

## Redacción

Castellano rioplatense con voseo, sin solemnidad: «Guardá los cambios». El nombre que
usa el usuario, no el del sistema: es una *orden de trabajo*, no una entidad. El
botón dice lo que va a pasar y el aviso confirma que pasó. Los errores dicen **cómo
arreglarlo**: «El CUIT son 11 dígitos sin guiones», no «Formato inválido». Sin signos de
admiración y sin «¡Ups!» — el que usa esto está trabajando.

Estados vacíos: explicar y ofrecer la acción. Cargando: esqueletos con la forma del
contenido, no un spinner. Error: qué pasó y qué hacer, sin códigos sueltos.

## La excepción del taller

El piso de taller es lo único que no sigue la regla de densidad: ahí el mecánico tiene
guantes y usa el dedo. Objetivos táctiles de 44px mínimo. Teclado en escritorio, dedo en
el taller — las dos son correctas en su lugar.

**10. Nada se borra de una, y todo resultado se avisa.** Toda baja, desactivación o
descarte pasa por `confirmar()` con `peligro: true`. Lo que se guarda declara
`meta: { exito }`; los errores al guardar llegan solos a una notificación. Nada de
`<p role="alert">` propios para eso. Las acciones de filas y tarjetas son
`<Boton tamano="chico" icono={…}>`, no texto subrayado. Detalle en la sección
«Notificaciones, confirmaciones y botones de acción» del sistema de diseño.

## Antes de dar por terminada una pantalla

- ¿Se puede completar el flujo entero sin tocar el mouse?
- ¿Funciona en 375px de ancho, con las filas convertidas en tarjetas?
- ¿Se lee bien en tema oscuro? (En un taller la pantalla se mira todo el día.)
- ¿Hay algún color, espaciado o tamaño escrito a mano?
- ¿La barra de estado muestra las teclas correctas de este contexto?
- ¿Los estados vacío, cargando y con error están resueltos, o solo el caso feliz?
- ¿Toda baja pregunta antes, y todo lo que se guarda avisa que se guardó?
