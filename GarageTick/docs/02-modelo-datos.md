# Modelo de datos y lógica de tiempos

## Los tres conceptos que NO son lo mismo

Acá es donde estos proyectos se hunden. Hay que separar:

| Concepto | Qué es | Vive en |
|---|---|---|
| **Sesión de trabajo** | Un mecánico fichado en una OT. Minutos de mano de obra | `work_session` |
| **Operación** | Tarea dentro de la OT (cambio de embrague, service 10.000) | `operation` |
| **Estado de la OT** | Dónde está el vehículo | `work_order.status` |

**El caso de la garantía que queda días en el taller no es una sesión de 3
días.** Es una OT abierta, con sesiones cortas cerradas, y períodos de espera en
el medio. Si se modela como sesión larga, los números de productividad salen
basura y el sistema pierde credibilidad.

Dos relojes distintos, ambos necesarios:

- **Mano de obra** = suma de sesiones. Lo que costó el trabajo.
- **Lead time** = desde que entró el auto hasta que salió. Lo que el cliente
  percibió. La diferencia entre ambos es el tiempo muerto — y eso es
  normalmente lo que la concesionaria más quiere ver.

---

## Esquema

Postgres. **Identificadores en inglés; los textos que ve el taller, en español.**
Todas las tablas con `created_at` / `updated_at`. Bajas lógicas, nada se borra.

Dos nombres esquivan palabras reservadas de Postgres a propósito: `app_user`
(no `user`) y `work_order` (no `order`), así una consulta escrita a mano nunca
necesita comillas.

### Organización

```
tenant          id, name, slug (unique), active
branch          id, tenant_id, name, address, active
setting         (tenant_id, key) PK, value, updated_at
feature         (tenant_id, key) PK, enabled, note, updated_by, updated_at
```

`setting` arranca con:
- `work_order_concurrency` = `single` | `multiple` | `multiple_prorated`
- `auto_close_time` = `18:30`
- `scan_timeout_seconds` = `25`
- `timezone` = `America/Argentina/Buenos_Aires`

> `work_order_concurrency` está en `setting` y no hardcodeado porque **todavía no
> está definido** (relevamiento A2). El esquema soporta los tres modos; solo
> cambia la validación al abrir sesión.

`feature` está separada de `setting` a propósito, aunque las dos sean
clave/valor por tenant: **`setting` son preferencias del taller** y las cambia
el administrador del cliente, mientras que **`feature` es lo que el cliente
contrató** y solo la toca un `super_admin`. Si vivieran juntas, el admin del
cliente podría habilitarse una funcionalidad paga.

Claves de `feature`: `dms_read`, `remote_access`, `roi_report`, `offline_queue`,
`thermal_label`, `flat_rate`, `attendance`.

### Personas y acceso

```
app_user        id, tenant_id, branch_id, employee_number (unique por tenant),
                first_name, last_name, email, password_hash, role, active
                role ∈ {super_admin, admin, shop_manager, front_desk, mechanic}

credential      id, tenant_id, user_id, code (unique),
                issued_at, revoked_at, revocation_reason
```

`credential` separada de `app_user`: se pierde o se rompe una tarjeta, se revoca
y se emite otra sin tocar el historial de sesiones.

`password_hash` es NULL para los mecánicos: fichan por QR y nunca inician sesión
en la web.

```
device          id, tenant_id, branch_id, name, type ∈ {kiosk, desktop},
                token_hash, last_seen_at, active
```

El kiosco no loguea una persona: se autentica como **dispositivo**. La identidad
del mecánico viene de cada escaneo. Con el servidor en una máquina distinta del
kiosco, esto es además lo que impide que cualquier PC de la red abra la pantalla
de fichaje y fiche por otro.

### Trabajo

```
vehicle         id, tenant_id, license_plate, vin, make, model, year,
                customer_name, customer_phone

work_order      id, tenant_id, branch_id, number (unique por branch), dms_number,
                qr_code (unique), charge, dms_charge_raw, vehicle_id,
                description, status, priority,
                opened_at, finished_at, finished_by_id,
                closed_at, closed_by_id,
                created_by_id, source ∈ {manual, dms, import}

                charge ∈ {customer, warranty, internal, other}
                status ∈ {open, in_progress, on_hold, finished, invoiced, cancelled}
```

`dms_number` guarda el número de Oversoft cuando exista integración. `number` es
el propio, por si arrancan sin DMS.

`charge` es **quién paga**: cliente, garantía o interno. Es el corte con el que
la concesionaria mide el taller, y el que hace que el reporte de ROI signifique
algo. `dms_charge_raw` guarda el valor crudo que devolvió el DMS: si el mapeo a
`charge` queda mal, se recalcula sobre lo ya importado en vez de reimportar.

> Arranca con el conjunto mínimo que seguro es correcto. Agregar un valor
> después es una migración de una línea y no destructiva; fusionar valores
> cuando ya hay filas usándolos es la dirección cara. La preentrega (PDI) va
> dentro de `internal` hasta que el taller pida medirla aparte.

```
operation       id, tenant_id, work_order_id, code, description, status,
                flat_rate_minutes,        -- NULL en MVP, se llena en fase 2
                display_order
```

```
work_session    id, tenant_id, work_order_id, operation_id (nullable), user_id,
                started_at, ended_at,
                duration_seconds  GENERATED ALWAYS AS
                  (EXTRACT(EPOCH FROM (ended_at - started_at))::int) STORED,
                closed_by ∈ {mechanic, auto, manager},
                start_device_id, end_device_id,
                deferred boolean,          -- entró por cola offline
                note
```

```
work_order_hold id, tenant_id, work_order_id, reason, started_at, ended_at,
                note, recorded_by_id, resolved_by_id
                reason ∈ {parts, customer_approval, warranty_approval,
                          diagnosis, lift, customer_appointment, other}
```

`work_order_hold` es lo que convierte esto de "un cronómetro" en una herramienta
de gestión. Sin motivos de espera no se puede explicar por qué un auto estuvo 6
días.

Cada cambio de estado guarda **quién lo hizo**, no solo cuándo: `finished_by_id`,
`closed_by_id`, `recorded_by_id` y `resolved_by_id`. Es la misma regla que la de
las correcciones de tiempo (decisión 7): el día que un mecánico discuta por qué
su orden figura cerrada, la respuesta tiene que estar en la base.

### Auditoría

```
session_adjustment  id, tenant_id, session_id, user_id, field,
                    old_value, new_value, reason (NOT NULL), created_at
```

```
scan_event      id, tenant_id, device_id, raw_code, detected_type,
                user_id?, work_order_id?, outcome, action, message,
                latency_ms, deferred, idempotency_key, created_at
                outcome ∈ {ok, rejected, error}
```

**Todo escaneo se loguea, resuelva o falle.** Cuando un mecánico diga "yo fiché
y no quedó", esta tabla es la respuesta. Cuesta nada y vale oro. También alimenta
el panel de latencia, que es criterio de aceptación de la Fase 1.

### Fase 2

```
attendance      id, tenant_id, user_id, date, clock_in, clock_out, source
                -- necesaria para calcular productividad (fichadas / presentes)
```

### Índices clave

```sql
-- sesión abierta de un mecánico: la consulta más caliente del sistema
CREATE INDEX ix_work_session_open ON work_session (user_id)
  WHERE ended_at IS NULL;

-- si work_order_concurrency = 'single', esto lo garantizaría a nivel base.
-- NO está creado: la regla todavía no está definida y se valida en la app.
-- CREATE UNIQUE INDEX ux_one_session_per_mechanic ON work_session (user_id)
--   WHERE ended_at IS NULL;

CREATE INDEX ix_work_order_status ON work_order (tenant_id, branch_id, status);
CREATE INDEX ix_work_session_work_order ON work_session (work_order_id);
CREATE INDEX ix_work_session_range ON work_session (tenant_id, user_id, started_at);
```

## Formato del QR

**No encodear el ID pelado.** Con `12345` cualquiera genera un QR desde el
celular y ficha por otro, o abre una OT que no existe.

```
Credencial:  GT1:M:<code8>:<hmac10>
Orden:       GT1:O:<code8>:<hmac10>
```

- `hmac10` = primeros 10 chars en base32 de `HMAC-SHA256(QR_SECRET, "<tipo>:<code8>")`.
- La clave vive solo en el servidor, se genera en la instalación.
- Total ~28-32 chars → QR versión 2-3, lee rápido y con poca luz.
- El codec vive en `packages/shared` y se usa igual del lado del front (parseo)
  y del back (validación).

**Límite honesto**: un QR se fotocopia. Esto evita la falsificación casual, no
la suplantación deliberada. Si el sistema alimenta sueldos o incentivos
(relevamiento A3), la credencial QR sola no alcanza — hay que sumar PIN.

**Fallback numérico obligatorio**: campo para tipear legajo y número de OT
cuando el QR esté arruinado. Se van a arruinar; es un taller.

---

## Máquina de estados del kiosco

```
                    escanea credencial
        ┌──────┐ ─────────────────────► ┌──────────────┐
        │ IDLE │                        │ ESPERANDO_OT │
        └──────┘ ◄───────────────────── └──────────────┘
            ▲       timeout 25s  /  ESC        │
            │                                  │ escanea OT
            │        3 s                       ▼
            └────────────────────────── ┌─────────────┐
                                        │  FEEDBACK   │
                                        └─────────────┘
```

**Orden-agnóstico e idempotente.** Escaneás credencial → la pantalla dice:

> **Hola Juan Pérez**
> Tenés la **OT 4471** abierta hace **1h 23m**
> Escaneá una orden para iniciar o cerrar

Escaneás una OT → si esa OT estaba abierta para vos, la cierra. Si no, la abre
(y cierra la anterior si `work_order_concurrency = single`). **No hay modos que
recordar.** El mecánico hace siempre lo mismo.

Casos borde ya resueltos:
- Escanear OT en `IDLE` → "Primero escaneá tu credencial" (rojo, doble beep).
- Escanear otra credencial en `ESPERANDO_OT` → cambia de mecánico, no error.
- Escanear la misma credencial dos veces → vuelve a `IDLE` (cancelar).
- Credencial revocada / mecánico inactivo → rechaza con mensaje claro.
- OT ya terminada → pregunta "¿reabrir?" y requiere confirmación del jefe.

### Diseño de la pantalla

- **Feedback visual grande + sonido.** El mecánico tiene las manos sucias, está
  a 2 metros y no lee texto chico. Pantalla entera verde + beep simple = OK.
  Roja + doble beep = error. El texto es secundario.
- Sin teclado ni mouse visibles. Todo entra por el lector.
- Reloj grande y nombre del taller: convierte el monitor en algo útil aunque
  esté en `IDLE`.

---

## Reglas de negocio

### Cierre automático de fin de turno

Los mecánicos **se van a olvidar** de fichar la salida. No es un caso borde, es
el escenario normal.

A la hora configurada (`auto_close_time`), toda sesión abierta se cierra con
`closed_by = 'auto'`. Aparecen destacadas en el panel del jefe al día
siguiente para que las corrija. Nunca se descartan en silencio.

### Correcciones del jefe

Pantalla dedicada para editar inicio/fin de una sesión, con **motivo
obligatorio**, todo registrado en `session_adjustment`. Sin esto el sistema pierde
credibilidad la primera semana que un tiempo salga mal.

### Cola offline

Si el kiosco no llega al servidor, el escaneo se guarda en IndexedDB con su
timestamp local y se marca. Al reconectar, se envía con
`deferred = true` y el servidor **conserva el timestamp del cliente para ese
caso puntual**, marcándolo como no confiable. El jefe ve cuáles fueron
diferidas.

---

## Los KPI que van a pedir (aunque hoy no los pidan)

Los tres de toda postventa. El esquema los soporta desde el día 1 aunque los
reportes salgan en fase 2:

- **Productividad** = horas fichadas en OT ÷ horas presentes → necesita `attendance`
- **Eficiencia** = horas baremo vendidas ÷ horas fichadas → necesita
  `operation.flat_rate_minutes`
- **Utilización** = productividad × eficiencia
