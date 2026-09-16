# Módulos del sistema

Estado: **borrador**. El mapa de abajo es la propuesta del 16/09/2026 y tiene preguntas
abiertas marcadas como tales. Lo que sí está decidido es lo de la primera sección.

## La decisión: los módulos se prenden y se apagan, desde el día cero

GaragePro se vende por partes. Una concesionaria contrata taller y repuestos y no quiere
ventas de 0km; otra suma garantías en marzo. **Cada módulo se activa y se desactiva por
tenant**, y eso no es una función para agregar cuando haya clientes: es cómo se cobra el
producto.

Va desde ahora por la misma razón que el aislamiento por RLS y los permisos: meterlo
después obliga a revisar cada pantalla, cada ruta y cada operación de la API ya escritas.
Cuanto más código haya, más caro es — y nunca vuelve a haber menos código que hoy.

### No es lo mismo que un permiso

Son dos filtros distintos sobre la misma lista de secciones, y el usuario tiene que poder
distinguirlos:

| Situación | Qué ve | Por qué |
| --- | --- | --- |
| Módulo **no contratado** | Nada. La sección no existe. | No es de esta concesionaria. Que aparezca invita a pedirle al gerente algo que no se compró. |
| **Sin permiso** | Nada en el menú; si llega por un enlace, el aviso de permiso. | Existe, pero no es para este usuario. El aviso dice a quién pedírselo. |
| Pantalla **no construida** | La sección atenuada, sin enlace. | Todavía no está — para nadie. El menú tiene su forma definitiva desde ahora. |

El orden en que se evalúan también importa: **primero el módulo, después el permiso.** A
quien no tiene el módulo no se le habla de permisos, porque no hay permiso que le sirva.

### Dónde se aplica

Igual que los permisos, en tres lugares y con una sola declaración:

- **La API**, que es la que decide. Una operación de un módulo apagado se rechaza,
  aunque el usuario tenga el permiso.
- **El menú y las rutas**, que ocultan.
- **El contrato**, que es donde se declara a qué módulo pertenece cada ruta — al lado
  del permiso que ya declara hoy.

## El panel de administración

Los tenants, sus módulos, sus planes y el estado de la cuenta se manejan desde un
**back-office aparte**, que usamos nosotros y no la concesionaria. Posiblemente en otro
dominio; eso se decide cuando se construya. Lo que ya está decidido es que **no es una
pantalla más de la aplicación**: un menú de «administrar tenants» adentro del sistema que
usa el cliente es un accidente esperando pasar.

## El mapa de módulos

Cerrado el 16/09/2026, salvo lo que diga «pendiente».

| Módulo | Qué incluye |
| --- | --- |
| **núcleo** | Clientes, vehículos, usuarios y roles, empresas, sucursales, puntos de venta, configuración personal. **Es el piso, no un módulo más** — pero igual tiene flag (ver abajo). |
| **contable** | Facturación, cobros, Mercado Pago, pagos, órdenes de compra (la generación), certificados de AFIP |
| **servicios** | Recepción —donde nacen las OT—, control de tiempos de taller, preentrega |
| **repuestos** | Mostrador y depósito, proveedores, órdenes de compra (la ejecución) |
| **cartera** | 0km y usados: el stock de vehículos |
| **ventas** | Planes de ahorro, venta directa |
| **rrhh** | Nómina de empleados, sueldos, control horario |

### El flag es de la pantalla, no de la entidad

La orden de compra **pasa por dos módulos**: se genera en contable y se ejecuta en
repuestos —el repuestero pide, el contable paga— y probablemente aparezca en más lados.
De ahí sale la regla general, que vale para todo el sistema:

> **Lo que pertenece a un módulo es la pantalla y la operación, no el dato.**

Una `orden_compra` es una sola tabla, del núcleo. La pantalla de generación declara
`contable`; la de recepción de mercadería declara `repuestos`. Una concesionaria que
contrató contable y no repuestos genera órdenes de compra y no las recibe por sistema,
y eso es una combinación vendible, no un error.

Si el flag colgara de la entidad habría que elegir un dueño, y cualquier elección sería
falsa: la orden de compra no es «de contable» ni «de repuestos».

### El núcleo también se apaga, aunque casi nunca convenga

Cada módulo tiene su flag, el núcleo incluido: el plan mínimo lo deja prendido, pero la
posibilidad existe. Nada de una excepción escrita en el código para un caso que mañana
alguien va a querer.

Lo que sí hace falta es **declarar las dependencias entre módulos**: servicios no puede
abrir una OT sin vehículos, ni contable facturar sin clientes. Apagar algo de lo que
cuelga un módulo prendido se rechaza en el back-office, con el motivo escrito. Un
sistema que te deja apagar el piso y recién te avisa cuando el usuario abre la pantalla
es peor que uno que no te deja apagarlo.

### Un módulo apagado no se ve, y punto

El que no paga el módulo no ve nada de ese módulo: ni la sección, ni un cartel que lo
ofrezca. La consulta al padrón de AFIP es parte del módulo que la usa; quien no lo
contrató, la busca por su cuenta.

**Los datos no se borran**, y eso no es negociable ni contradice lo anterior: un
comprobante fiscal se conserva diez años por ley, y la obligación es nuestra mientras
seamos nosotros los que guardamos la base. Si vuelven a contratar el módulo, está todo;
si se dan de baja del sistema, hay que poder entregarles una exportación. Lo que se
apaga es el acceso, no el registro.

## La configuración vive adentro de cada módulo

En vez de un módulo «Configuración» con todo adentro —que es lo que hacen todos— cada
módulo tiene **su** pantalla de configuración: la cuenta de Mercado Pago y los
certificados de AFIP en contable, los motivos de espera en servicios.

Tres razones, en orden de peso:

1. **Se apaga con el módulo.** Con una Configuración global quedarían seis secciones
   muertas que no se pueden apagar de a una.
2. **Se configura donde se usa.** La persona ya está parada en el módulo.
3. **Se entiende sin aprender el mapa del sistema.** Nadie tiene que saber que «lo de
   Mercado Pago está en Configuración → Cobros → Medios».

Con un **índice** que liste los módulos y linkee a la pantalla de cada uno, para el que
busca sin acordarse dónde estaba. Es una lista de enlaces, no una segunda fuente de
verdad.

### Tres clases de configuración, y sólo una es del módulo

| Qué | Dónde | De quién es |
| --- | --- | --- |
| Tema, densidad, teclas, sucursal predeterminada | Una pantalla sola, siempre accesible | Del usuario |
| Cuenta de MP, certificados de AFIP, motivos de espera | Adentro de su módulo | De la concesionaria |
| Razones sociales, sucursales, PDV, usuarios y roles | Administración, en el núcleo | De la concesionaria |

Los **certificados de AFIP cuelgan de la `empresa`**, no del tenant ni del módulo: una
concesionaria con dos razones sociales tiene dos certificados. La pantalla vive en
contable; el dato, donde dice el modelo del núcleo.

### Entrar al módulo no es poder configurarlo

La cuenta de Mercado Pago y los certificados de AFIP **son credenciales, no
preferencias**: quien las toca puede facturar con el CUIT de la empresa o mandar la
cobranza a otra cuenta.

Se resuelve con una acción más en el catálogo de permisos — **`configurar`** — y no con
un rol nuevo escrito en el código:

    configurar Comprobante   → el engranaje de contable
    configurar Orden         → el de servicios

El Gerente lo tiene gratis, porque `administrar all` cubre todo. Y si una concesionaria
quiere un «Contador encargado» que configure y un «Contador» que no, **lo arma ella**
clonando el rol: el organigrama de cada concesionaria no lo decidimos nosotros.

Toda modificación de una credencial va con auditoría: quién, cuándo y qué cambió. El día
que una factura salga con los datos equivocados, esa es la respuesta.

### La configuración del módulo no es el flag del módulo

Son dos cosas distintas y se guardan separadas:

| | Quién lo toca | Dónde |
| --- | --- | --- |
| **Configuración** del módulo | La concesionaria | Adentro del módulo |
| **Flag** del módulo | Nosotros | El back-office |

Es la decisión 14 de GarageTick (`setting` vs `feature`), y el motivo es el mismo: si
vivieran juntas, el administrador del cliente se habilitaría solo el módulo que no pagó.
