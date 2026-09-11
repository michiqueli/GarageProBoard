# GarageTick

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
    pnpm db:app-role       # habilita el login del rol de la aplicación

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

El Postgres del contenedor va al **5433** a propósito: el 5432 suele estar ocupado por
una instalación nativa, y su `psql` sirve igual como cliente de línea de comandos.

## Estructura

    apps/api             NestJS 12 + Fastify
    apps/web             Vite 8 + React 19 + Tailwind 4
    packages/contracts   Contrato oRPC + Zod, compartido por todos los consumidores
    packages/db          Esquema Drizzle, migraciones y políticas de RLS
    packages/core        Dominio puro: plata, IVA, reglas. Sin I/O.
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
| `pnpm test` | Corre todos los tests |
| `pnpm typecheck` | Chequea tipos en todo el workspace |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm db:generate` | Genera una migración a partir del esquema |
| `pnpm db:migrate` | Aplica migraciones y políticas |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm infra:up` / `infra:down` / `infra:reset` | Contenedores de desarrollo |

## Cómo se trabaja acá

Cuatro reglas que ya están metidas en el código y conviene conocer antes de tocarlo.

**La plata nunca es un número de punto flotante.** `numeric(18,4)` en la base, string
en la API, `decimal.js` para operar. Cuatro decimales porque los precios unitarios de
repuestos los necesitan. Un float en una factura es un error de auditoría esperando
fecha.

**Ninguna consulta sale sin tenant.** Todo acceso a datos de un cliente pasa por
`conTenant()`. Fuera de ahí la consulta revienta con un mensaje explícito, porque el
aislamiento no puede depender de que nadie se olvide un `WHERE`. Si agregás una tabla
con `tenant_id`, sumala a `TABLAS_CON_TENANT` — hay un test que lo verifica y va a
fallar si no.

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

La carpeta `.claude/skills/` también se versiona: la skill `ui-garagetick` hace que
cualquier cambio de interfaz siga el sistema de diseño sin que haya que recordarlo.
