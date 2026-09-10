# Modelo de datos del núcleo

Las entidades sobre las que se apoya todo lo demás: quién factura, desde dónde se
factura, y de quién es el auto.

Versión visual con diagramas:
<https://claude.ai/code/artifact/b376f34c-f8d4-4cd7-813c-95b249dc414c>

Estado al 10/09/2026: las cuatro decisiones estructurales están cerradas. Lo marcado
como *supuesto* sale de conocimiento general del rubro y espera un piloto.

---

## 1. Cuatro niveles, no dos

    tenant                  la concesionaria que contrata el sistema
      └── empresa           razón social: CUIT, condición IVA, certificado, libros
            ├── sucursal    lugar físico: taller, depósito, caja, gente
            │     └── punto de venta
            └── (otra sucursal…)

Un tenant puede tener **más de una razón social**. No es un caso raro: es lo normal
cuando el taller y el negocio de repuestos se separan en dos SAS por conveniencia
impositiva.

### El punto de venta tiene dos padres y los dos mandan

- **`empresa_id`** porque AFIP lo registra bajo un CUIT.
- **`sucursal_id`** porque es desde ahí que se factura. Sin ese vínculo, una empresa
  con seis puntos de venta no tiene forma de saber cuál le toca a cada boca.

Al facturar, la resolución es `(sucursal, uso)` → PDV predeterminado, garantizada por
un índice único parcial:

    create unique index punto_venta_predeterminado_uq
      on punto_venta (sucursal_id, uso) where predeterminado;

Y para que una sucursal de la SAS A no pueda facturar con el punto de venta de la
SAS B, la integridad la garantiza la base y no el código:

    -- en sucursal
    unique (id, empresa_id)

    -- en punto_venta
    foreign key (sucursal_id, empresa_id) references sucursal (id, empresa_id)

Esto obliga a que `empresa_id` viva en `punto_venta` aunque sea derivable de la
sucursal. Es desnormalización deliberada al servicio de dos constraints: esa FK
compuesta y el `unique (empresa_id, numero)`.

### El número de PDV es único por CUIT, nunca por tenant

Dos SAS del mismo grupo pueden tener las dos su PDV 0001. Un índice único sobre
`(tenant_id, numero)` sería un bug esperando a que el segundo cliente abra su segunda
razón social.

### Qué vive en cada nivel

| Del tenant | De la empresa |
| --- | --- |
| Clientes, proveedores y personas | Cuenta corriente y saldos |
| Vehículos y su titularidad | Certificado de AFIP y credenciales |
| Historial de service completo | Numeración de comprobantes |
| Catálogo de marcas y modelos | Libros de IVA compras y ventas |
| Usuarios y roles | Padrón de Ingresos Brutos |

El auto se muda de ciudad, va a otra sucursal, y su historia entera lo acompaña. Pero
la cuenta corriente **no** puede ser del tenant: si las razones sociales tienen CUITs
distintos son personas jurídicas distintas, y el cliente le debe plata a una SAS, no
al grupo.

---

## 2. El auto, no el dueño

«Un vehículo tiene un solo dueño» es cierto **en un momento dado**, y es eso lo que lo
convierte en una relación con vigencia y no en una clave foránea. Una columna
`cliente_id` en `vehiculo` se pisa el día de la venta, y con ella se va la respuesta a
la única pregunta que el historial existe para contestar: a quién se le hizo cada
trabajo.

    create table titularidad (
      vehiculo_id  uuid not null references vehiculo(id),
      cliente_id   uuid not null references cliente(id),
      desde        date not null,
      hasta        date,
      check (hasta is null or hasta >= desde)
    );

    -- un solo titular vigente, sin impedir que existan los anteriores
    create unique index titularidad_vigente_uq
      on titularidad (vehiculo_id) where hasta is null;

### Identidad: el chasis

La identidad del vehículo es el número de chasis, único por tenant. **Las patentes no
se historizan**: en la Argentina de hoy la patente no se recambia, y solo hay dos
formatos vigentes.

| Formato | Ejemplo | Expresión regular |
| --- | --- | --- |
| Vieja | ABC 123 | `^[A-Z]{3}[0-9]{3}$` |
| Mercosur | AB 123 CD | `^[A-Z]{2}[0-9]{3}[A-Z]{2}$` |

La columna igual es **nullable**, y no por descuido: un 0km existe en el sistema con
su chasis desde que la terminal lo factura y puede pasar semanas sin chapa mientras se
patenta. Por eso el índice único es parcial:

    create unique index vehiculo_dominio_uq
      on vehiculo (tenant_id, dominio) where dominio is not null;

**Supuesto a validar:** el `CHECK` del chasis acepta de 6 a 17 caracteres en vez de
exigir un VIN ISO de 17. Los vehículos nacionales anteriores a los noventa traen
chasis que no siguen la norma, y un taller multimarca los recibe. Un check demasiado
estricto bloquea la carga de un auto real, que es peor que aceptar un dato raro.

### Cuatro roles en una orden, no uno

**Supuesto a validar con un piloto.** En una orden intervienen cuatro roles que la
mayoría de los sistemas colapsan en uno solo:

| Rol | Quién suele ser | De dónde sale |
| --- | --- | --- |
| Titular | El dueño registral | Derivado de la titularidad vigente |
| Quien trae | Pareja, empleado, chofer de flota | Contacto elegido en la recepción |
| Quien autoriza | Jefe de flota, perito de la aseguradora | Requerido si supera un tope |
| Quien paga | Aseguradora, leasing, la terminal en garantía | Receptor de la factura, editable |

Si la OR asume «se le factura al titular», el módulo de garantías y el de siniestros
no entran nunca.

---

## 3. Identidad fiscal compartida, roles separados

    entidad_comercial     identidad fiscal: documento, razón social,
      │                   condición IVA, domicilio, IIBB
      ├── cliente         lista de precios, límite de crédito
      ├── proveedor       condiciones de pago, cuenta contable
      └── empleado        legajo, convenio, categoría

Los roles **sí** son tablas aparte, cada una con sus campos y sus permisos: el legajo
con sueldos no lo ve el asesor de servicios. Lo único compartido es la identidad que
AFIP trata como única.

Se evaluó la separación total y se descartó. El caso que lo decide: Transportes del Sur
SRL hace el service de sus doce utilitarios *y además* vende neumáticos. Con tablas
independientes, ese CUIT vive dos veces, y el costo no es el espacio duplicado:

1. El domicilio fiscal se desincroniza en silencio.
2. La consulta al padrón se hace dos veces.
3. Se pierde la compensación de saldos entre deudor y acreedor, que la administración
   hace todo el tiempo.

Lo mismo con el mecánico que compra un usado en la concesionaria: mismo CUIL, dos
fichas.

La clave primaria de cada rol **es la misma que la de la entidad**: un solo uuid
identifica a la persona y a su rol. Las tablas de rol arrancan casi vacías y engordan
cuando cada módulo pide sus campos. Sumar una columna es barato; deduplicar CUITs a los
dos años, no.

---

## 4. Lo fiscal es una tabla, no un `if`

La condición frente al IVA es un código de una tabla de AFIP, no texto libre. Desde la
RG 5.616 la condición *del receptor* viaja obligatoriamente en el comprobante, así que
ese campo del cliente dejó de ser informativo.

| Cód | Condición |
| --- | --- |
| 1 | IVA Responsable Inscripto |
| 4 | IVA Sujeto Exento |
| 5 | Consumidor Final |
| 6 | Responsable Monotributo |
| 7 | Sujeto No Categorizado |
| 8 | Proveedor del Exterior |
| 9 | Cliente del Exterior |
| 10 | IVA Liberado · Ley 19.640 |
| 13 | Monotributista Social |

No se escribe a mano en una migración: se trae de `FEParamGetCondicionIvaReceptor` del
WSFEv1 y se cachea. Cuando AFIP agrega una condición, la tabla se actualiza sin un
deploy.

### Matriz emisor × receptor

| Emisor | Receptor | Comprobante | Cód |
| --- | --- | --- | --- |
| Responsable Inscripto | Responsable Inscripto | Factura A | 1 |
| Responsable Inscripto | Monotributo · Exento · Consumidor Final | Factura B | 6 |
| Responsable Inscripto | Cliente del exterior | Factura E | 19 |
| Responsable Inscripto | RI observado por AFIP | Factura M | 51 |
| Monotributo | Cualquiera | Factura C | 11 |

Vive en la base como `regla_comprobante`, no como condicionales en el código: cambia
por normativa y no queremos desplegar la aplicación para adaptarnos a una resolución
general. Las notas de crédito y débito siguen la misma letra — 2 y 3 para A, 7 y 8
para B, 12 y 13 para C.

### Numeración sin huecos

Una fila por punto de venta y tipo, porque cada combinación lleva su propia secuencia
en AFIP. Se toma con `select ... for update` **dentro de la misma transacción que pide
el CAE**. Nunca `max(numero) + 1`: AFIP rechaza los saltos, y recuperarse de un hueco
cuesta pedidos de disponibilidad comprobante por comprobante.

### Ingresos Brutos

Si las sucursales cruzan provincia, entra **Convenio Multilateral**, con coeficientes y
regímenes de retención y percepción por jurisdicción. La lógica no está construida,
pero los campos de IIBB están en `entidad_comercial` y en `empresa` desde el esquema
inicial.

---

## 5. Aislamiento multi-tenant

Dos mitades, y hacen falta las dos:

**Postgres.** RLS habilitado y **forzado** en las 18 tablas con datos de clientes, más
la tabla `tenant` misma. La política compara contra una función que chequea
explícitamente:

    create or replace function app_tenant_id() returns uuid
    language plpgsql stable parallel safe as $$
    declare valor text := current_setting('app.tenant_id', true);
    begin
      if valor is null or valor = '' then
        raise exception 'Consulta sin tenant en la sesión: envolvela en conTenant()';
      end if;
      return valor::uuid;
    end $$;

    create policy aislamiento_tenant on vehiculo
      using      (tenant_id = (select app_tenant_id()))
      with check (tenant_id = (select app_tenant_id()));

Dos detalles que no son cosméticos:

- **La función existe en vez de comparar directo contra `current_setting`** porque
  `set_config(..., true)` no borra el parámetro al terminar la transacción: lo revierte
  a cadena vacía. Sin la función, la primera consulta sin tenant falla con `42704` y
  las siguientes con `22P02`. Las dos fallan cerradas, pero depender de cuál toca es
  frágil y ninguna dice qué se hizo mal.
- **El `(select ...)`** hace que la función se evalúe una vez por consulta en lugar de
  una vez por fila. Sobre una tabla de órdenes con años de historia, se nota.

**El rol de conexión.** La API se conecta como `garagetick_app`: sin `BYPASSRLS`, sin
ser superusuario y sin ser dueño de ninguna tabla. Usar el rol dueño anularía el
aislamiento entero sin que ningún test lo notara, porque las consultas seguirían
andando.

**La puerta única.** Todo acceso pasa por `conTenant()`, que abre transacción y fija el
tenant. Fuera de ahí, cualquier consulta revienta.

### Los nueve tests

En `packages/db/test/aislamiento.test.ts`, contra un Postgres real levantado con
Testcontainers. Verifican que cada tenant vea solo lo suyo, que no encuentre lo ajeno
ni sabiendo la patente, que sin tenant la consulta falle en vez de devolver todo, que
no se pueda insertar ni modificar a nombre de otro, y que el tenant no quede pegado a
la conexión cuando vuelve al pool — la peor fuga posible, porque es intermitente y
depende de la carga.

Dos son de configuración y valen tanto como los otros: que el rol de la aplicación no
pueda saltearse RLS, y que **toda tabla con `tenant_id` esté declarada en
`TABLAS_CON_TENANT`**. El agujero realista no es una política mal escrita: es una tabla
nueva que se sumó al esquema y a nadie se le ocurrió agregarla a la lista.
