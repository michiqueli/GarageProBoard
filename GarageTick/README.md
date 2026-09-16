# GarageTick — referencia para el módulo de taller

Esta carpeta **no es parte del monorepo**: no se compila, no se instala y no tiene
`package.json` raíz. Es la aplicación anterior del autor —control de tiempos de taller
con fichaje por QR, relevada con una concesionaria de verdad— **podada a lo que sirve
para copiar cuando se escriba el módulo de servicios**, en vez de escribirlo de cero.

Qué mirar y por qué está en
[`docs/tecnicos/taller-control-de-tiempos.md`](../docs/tecnicos/taller-control-de-tiempos.md)
del repositorio. Leé ese documento primero: dice qué se trae, qué cambia ahora que el DMS
es nuestro, y qué se cae entero (toda la integración con Oversoft).

## Lo que quedó

| Qué | Por qué se guardó |
| --- | --- |
| `packages/shared/src/qr.ts` | El codec del QR. Parsea sin `node:crypto`, para que el kiosco resuelva contra su caché local sin red. |
| `packages/shared/src/signature.ts` | La firma HMAC, que sólo se valida en el servidor. Sin esto, cualquiera ficha por otro con un QR hecho en el celular. |
| `packages/shared/src/constants.ts`, `schemas.ts` | Constantes del dominio y validación Zod: motivos de espera, estados, roles. |
| `packages/db/src/schema.ts` + `migrations/0000_initial.sql` | Las 15 tablas, con la separación entre sesión, operación y estado de la OT. Es el corazón del modelo. |
| `packages/db/migrations_es_respaldo/0000_inicial.sql` | **El mismo esquema, con los identificadores en castellano** — `orden`, `sesion_trabajo`, `orden_espera`, `evento_escaneo`. Es el que sirve para copiar: GaragePro nombra en castellano. Estaba `gitignore`ado, así que no existía en ningún repositorio. |
| `apps/web/src/screens/Kiosco.tsx` | La pantalla de fichaje, con su máquina de estados y el feedback grande. La pieza que define el producto. |
| `apps/web/src/screens/Tablero.tsx` | El tablero de piso en tiempo real: qué auto, quién lo tiene, cuánto lleva. |
| `apps/web/src/screens/Horas.tsx`, `Ordenes.tsx`, `Reportes.tsx` | Vistas del jefe de taller y el reporte mensual. |
| `apps/web/src/sonido.ts` | Los beeps del kiosco. El mecánico escucha antes de leer. |
| `docs/00-relevamiento.md` | Las preguntas abiertas de la concesionaria. **Supuestos sin validar**, marcados como tales. |
| `docs/02-modelo-datos.md` | El esquema explicado, el formato del QR y la máquina de estados del kiosco. |
| `docs/04-oversoft.md` | Investigación sobre el competidor. La integración murió; el conocimiento del rival, no. |
| `docs/ref-kiosco-existente.png` | Cómo es hoy la pantalla que los mecánicos no usan. Es contra esto que se compite. |

**Ojo con el idioma de los identificadores.** GarageTick arrancó en castellano y en
septiembre se renombró todo a inglés, así que `schema.ts` y `migrations/` están en inglés
y `migrations_es_respaldo/` conserva la versión anterior en castellano. **Para copiar a
GaragePro sirve la de castellano**, que es como nombramos acá: `orden`, `sesion_trabajo`,
`orden_espera`, `evento_escaneo`, `ajuste_sesion`, `credencial`, `dispositivo`. El código
de `packages/shared` y `apps/web` sigue en inglés y se traduce al absorberlo.

## De dónde salió esto, y qué pasó en el camino

El original vive en `C:/Programacion/Trabajo/Propios/GarageTick`. La copia que llegó acá
**venía incompleta**, y al revisarla aparecieron tres cosas:

1. **`packages/shared` y `packages/db` estaban borrados** en la copia — faltaban el codec
   de QR, la firma HMAC y el esquema, o sea justo lo que se quería guardar. Se
   recuperaron del historial.
2. **La copia se llevó el `.git` del original**, que quedó sin repositorio. Se devolvió a
   su lugar: `Trabajo/Propios/GarageTick` vuelve a ser un repo, con su historia entera.
3. **`migrations_es_respaldo/` nunca se copió, y estaba `gitignore`ada**: no estaba en
   ningún commit ni en GitHub. Existía en un solo disco, en una sola carpeta. Ahora está
   acá también.

**Tres commits nunca se pushearon** a `github.com/michiqueli/garagetick` —entre ellos el
que agrega la aplicación web entera—. Conviene pushearlos. Mientras tanto hay un respaldo
de la historia completa en `C:/Programacion/Proyectos/garagetick-historia.bundle`:

    git clone C:/Programacion/Proyectos/garagetick-historia.bundle garagetick-completo

Lo que se sacó de esta carpeta —`node_modules`, la configuración del monorepo viejo, el
`.env`, y los documentos que ya no aplican: arquitectura on-premise, plan por fases,
presupuesto, deploy en Windows, licencia y bitácora— se movió a
`C:/Programacion/Proyectos/garagetick-descartado`. Todo eso sigue en el original y en
el repositorio; si no lo querés duplicado, borrá esa carpeta.
