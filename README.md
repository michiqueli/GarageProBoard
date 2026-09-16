# GaragePro

Sistema de gestión integral para concesionarias argentinas: órdenes de trabajo,
tiempos de taller, repuestos, garantías, facturación electrónica, RRHH y ventas.

SaaS multi-tenant. Una sola instalación, todas las concesionarias en la misma base con
aislamiento por Row Level Security de Postgres.

## Requisitos

- Node 24 o superior
- pnpm 10
- Docker (para Postgres y Redis de desarrollo, y para los tests)

## Puesta en marcha

    pnpm install
    cp .env.example .env

    pnpm infra:up          # Postgres 18 en el 5433 + Redis 8
    pnpm db:migrate        # migraciones + políticas de aislamiento
    pnpm db:app-role       # habilita el login de los roles de la API y del back-office

    pnpm dev               # API en :3080, front en :5173

Con eso arriba:

| | |
| --- | --- |
| API | <http://localhost:3080/api> |
| **Swagger** | <http://localhost:3080/api/docs> |
| Spec OpenAPI | <http://localhost:3080/api/openapi.json> |
| Front | <http://localhost:5173> |

El spec se genera del mismo contrato que implementa la API y consume el front, así
que no hay una segunda fuente de verdad que se desactualice.

### El back-office

Es otro sitio, para nosotros: da de alta concesionarias y maneja sus módulos. Corre
aparte y con su propio rol de Postgres, así que `pnpm dev` no lo levanta.

    pnpm db:operador ops@garagepro.test "Operaciones"   # muestra la contraseña una vez
    pnpm dev:backoffice    # API en :3090, panel en :5174

Necesita `DATABASE_URL_BACKOFFICE` y `BACKOFFICE_DB_PASSWORD` en el `.env` (están en
`.env.example`). El panel se abre en <http://localhost:5174>.

El Postgres del contenedor va al **5433** a propósito: el 5432 suele estar ocupado por
una instalación nativa, y su `psql` sirve igual como cliente de línea de comandos.

## Estructura

    apps/api             NestJS 12 + Fastify
    apps/web             Vite 8 + React 19 + Tailwind 4
    apps/backoffice/     El panel nuestro: api (NestJS, :3090) y web (Vite, :5174)
    packages/contracts   Contrato oRPC + Zod, compartido por todos los consumidores
    packages/db          Esquema Drizzle, migraciones y políticas de RLS
    packages/core        Dominio puro: plata, IVA, reglas. Sin I/O.
    packages/ui-tokens   Los tokens de diseño, compartidos por las dos aplicaciones
    packages/afip        Puerto contra ARCA, sobre @arcasdk/core
    infra/               docker compose
    docs/                Bitácoras de sesión, roadmaps e informes técnicos

`packages/contracts` y `packages/core` existen para que sumar `apps/mobile` más
adelante sea agregar un consumidor y no una migración. Nada de lógica de dominio dentro
de `apps/web`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Levanta API (:3080) y front (:5173) |
| `pnpm dev:backoffice` | Levanta el back-office: API (:3090) y panel (:5174) |
| `pnpm db:operador` | Da de alta un operador del back-office |
| `pnpm test` | Corre todos los tests |
| `pnpm typecheck` | Chequea tipos en todo el workspace |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm db:generate` | Genera una migración a partir del esquema |
| `pnpm db:migrate` | Aplica migraciones y políticas |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm infra:up` / `infra:down` / `infra:reset` | Contenedores de desarrollo |

## Cómo se trabaja acá

Cinco reglas que ya están metidas en el código y conviene conocer antes de tocarlo.

**La plata nunca es un número de punto flotante.** `numeric(18,4)` en la base, string
en la API, `decimal.js` para operar. Cuatro decimales porque los precios unitarios de
repuestos los necesitan. Un float en una factura es un error de auditoría esperando
fecha.

**Ninguna consulta sale sin tenant.** Los controladores leen datos con
`DatosDelTenant.transaccion()`, que toma el tenant de la sesión del pedido: no hay
parámetro que equivocar. Fuera de un pedido con sesión revienta con un mensaje
explícito, porque el aislamiento no puede depender de que nadie se olvide un `WHERE`.
Si agregás una tabla con `tenant_id`, sumala a `TABLAS_CON_TENANT` — hay un test que lo
verifica y va a fallar si no.

**Quién puede usar cada ruta lo dice el contrato.** Se arma con `publico`, `conSesion` o
`conPermiso('nucleo', 'crear', 'Vehiculo')` —el módulo que la concesionaria tiene que
tener contratado y el permiso que tiene que tener la persona— y se implementa con
`@Operacion()`. La API lo aplica, primero el módulo y después el permiso; Swagger
documenta el 401 y los dos 403, y una ruta que no lo declara no deja arrancar la API.
La pantalla lee **esa misma declaración** con `usePuedeUsar(contrato.vehiculos.crear)`, y
toda pantalla dice qué pide en su `Shell`: el botón aparece exactamente cuando la API lo
va a aceptar. Ojo con la asimetría — el front oculta, la API decide.

**Los módulos contratados no los escribe la aplicación.** Viven en `tenant_modulo`, que
el rol de la API sólo puede leer. Si creás una concesionaria a mano, dale sus módulos:
sin fila, el módulo está apagado.

**Responsive desde el diseño, no como parche.** El gerente mira facturación del
celular y el asesor consulta una orden desde una tablet en la playa de entrega. Los
listados densos son tabla en escritorio y tarjetas en teléfono: las dos formas se
diseñan juntas o la segunda nunca llega.

**Teclado en escritorio, dedo en el taller.** El operador de Oversoft es rapidísimo
con el teclado, y el asesor de servicios no va a aceptar algo más lento aunque sea más
lindo: el flujo de recepción se completa sin tocar el mouse, con atajos en F1 a F10 que
van escritos en los propios botones. En el piso de taller es al revés — objetivos
grandes, porque el mecánico tiene guantes. Todo eso está en
[el sistema de diseño](docs/tecnicos/sistema-de-diseno.md).

## Documentación

Las decisiones viven en [`docs/`](docs/), versionadas con el código:

- [`docs/sessions/`](docs/sessions/) — bitácora por sesión: qué se decidió y por qué
- [`docs/roadmaps/`](docs/roadmaps/) — planes por hitos, con estado
- [`docs/tecnicos/`](docs/tecnicos/) — modelo de datos, integraciones, arquitectura

Arrancá por [el modelo del núcleo](docs/tecnicos/nucleo-modelo-datos.md), seguí por
[el sistema de diseño](docs/tecnicos/sistema-de-diseno.md) y mirá
[el roadmap](docs/roadmaps/roadmap-inicial.md).

La carpeta `.claude/skills/` también se versiona: la skill `ui-garagepro` hace que
cualquier cambio de interfaz siga el sistema de diseño sin que haya que recordarlo.
