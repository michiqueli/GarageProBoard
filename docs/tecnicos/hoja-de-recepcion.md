# La hoja de recepción: el dibujo y la revisión

Decidido el 29/09/2026, después de construir el dibujo equivocado y tirarlo.

La pregunta arrancó como «¿no se puede usar la imagen de la hoja de VW?» y terminó siendo
otra: **quién dibuja el auto**. La respuesta es que no lo dibujamos nosotros.

Y mirando bien esa hoja apareció lo demás: el dibujo es el cuarto de abajo. Los otros tres
cuartos son **una revisión de veintitrés puntos** que no teníamos. Son las dos mitades de este
documento, y son la misma hoja.

---

# Primera mitad: el dibujo

## Lo que había, y por qué no servía

La primera versión dibujaba el vehículo con rectángulos: cada pieza —capot, techo, puerta
delantera izquierda— era a la vez lo que se veía y lo que se tocaba, en una sola vista de
arriba con los costados desplegados. Eso último es el invento de la hoja de Autopack.

Tenía una ventaja real: como el sistema sabía dónde estaba cada chapa, la marca salía escrita
sola —«Rayón · Puerta delantera izquierda»— sin que nadie eligiera nada.

Y un problema que se la comió: **se ve mal**. No «mejorable»: mal. Un esquema de cajas
redondeadas al lado de la hoja de VW no lo elige nadie, y la hoja de recepción es lo que el
cliente se lleva y mira.

Se intentó el paso intermedio —contorno lindo, piezas invisibles que se encienden al tocarlas—
y no alcanzó. Dibujar un auto que se vea bien no es un problema de más curvas: es un trabajo de
alguien que dibuja.

## Lo decidido

**Cinco vistas por tipo de carrocería, y las imágenes las carga cada concesionaria.**

| | |
| --- | --- |
| **Vistas** | Frente, atrás, lado izquierdo, lado derecho, arriba |
| **Tipos** | Sedán, hatchback, pickup |
| **Quién las pone** | Cada taller sube las suyas; el sistema trae un juego por omisión |

Son las cinco de la hoja de VW, que es la que el rubro reconoce. Quince imágenes por
concesionaria.

### La marca deja de saber en qué pieza cayó

Es la consecuencia que hay que aceptar, y conviene decirla fuerte: sobre una imagen que sube
cada taller, **el sistema no puede saber qué chapa es ese punto**. No hay mapa de zonas que
sirva para un dibujo que todavía no existe.

Entonces la marca dice **la vista y el detalle**: «Golpe · Lado izquierdo — a la altura de la
manija». Que es, exactamente, lo que dice la hoja de papel de hoy. Lo preciso lo da el dibujo
con la letra encima, que es para lo que está.

Se descartó agregar un desplegable de piezas después de cada marca: es un paso más por cada
rayón, con un cliente parado adelante, y la recepción se mide en cuánto tarda.

### Las coordenadas van en fracción, no en píxeles

Una marca se guarda como `{ vista, x, y }` con **x e y entre 0 y 1**, relativas al alto y al
ancho de la imagen. Así el taller puede reemplazar su dibujo por uno de otro tamaño y las
marcas siguen cayendo donde caían. Guardar píxeles ataría cada marca a la resolución del
archivo que había ese día.

### La orden se queda con la hoja que firmó

Mismo razonamiento que la silueta: **las marcas son puntos de un dibujo**. Si un taller sube
una imagen nueva, las órdenes viejas no pueden redibujarse encima de ella — un golpe en el
paragolpes terminaría sobre una puerta.

Por eso las imágenes **no se modifican**: subir una nueva crea una versión, la anterior queda,
y cada orden apunta a la versión con la que se recibió. Una hoja firmada se puede volver a
imprimir dentro de dos años y sale igual.

## Dónde se guardan: en MinIO

Por el tamaño solo, estas quince imágenes irían en `bytea`: son dos megas por concesionaria,
entran en el `pg_dump` que ya existe y quedan adentro del aislamiento por tenant que ya está
probado con RLS.

**Pero MinIO va a estar igual**, en el VPS, para las fotos del vehículo y para el logo de la
concesionaria. Y entre dos megas de más en la base y **dos historias distintas de dónde vive un
archivo**, lo caro a la larga es lo segundo: dos formas de subir, dos de servir, dos de borrar
y dos de restaurar. Entonces estas son las primeras que van, y estrenan el camino.

### Lo que hay que resolver por estrenarlo

**El aislamiento deja de ser de Postgres.** Un bucket no tiene RLS. La clave lleva el tenant
adelante —`t/<tenantId>/hojas/<hojaId>/<vista>.webp`— y **el tenant sale siempre de la sesión,
nunca del pedido**. Es la misma regla que ya aplica `DatosDelTenant`, movida al almacén, y es
lo que hay que cuidar con tests como se cuidó la de la base.

**La fila de Postgres es la que manda.** Si existe la fila, existe la imagen: se sube primero el
objeto y recién después se escribe la fila, así un corte en el medio deja un huérfano en el
bucket y no una hoja rota en la pantalla. Los huérfanos los junta una limpieza aparte.

**Los bytes los sirve la API**, no se le dan URLs firmadas al navegador. Una URL firmada que
alguien reenvía sigue abriendo la hoja de un cliente hasta que vence. Son quince imágenes
chicas: con `ETag` y `Cache-Control` el navegador no las vuelve a pedir, y el permiso se sigue
evaluando en cada pedido como en todo lo demás.

**Y el backup deja de ser un `pg_dump`.** Es la consecuencia operativa de esta decisión y
conviene anotarla acá: desde este momento, restaurar la base sola deja las hojas firmadas sin
su dibujo.

### Atrás de una interfaz

El resto del sistema no conoce MinIO: ve un almacén con guardar, leer y borrar, y una clave.
Eso es lo que permite que en desarrollo sea el MinIO del `docker compose` y que mañana sea otra
cosa sin tocar la recepción. Y que un test pueda correr con un almacén en memoria, sin levantar
un contenedor más de los que ya hay.

## El juego por omisión

Un taller que recién entra tiene que poder recibir un auto el primer día. Así que el sistema
trae las quince imágenes: sedán, hatchback y pickup, genéricas, y el que quiere las suyas las
reemplaza.

**Tienen que ser dibujos con licencia comercial**, compradas o encargadas. Las de VW y las de
Renault son de VW y de Renault; que estén impresas en una hoja que circula por los talleres no
las hace de nadie.

## Lo que sobrevive de lo anterior

**La carrocería del modelo**, entera. `modelo.carroceria` sigue siendo lo que decide qué juego
de imágenes le toca a un vehículo, se sigue aprendiendo del primero que recibe uno de ese
modelo, y se sigue sin poder sacar del dominio ni del chasis. Lo único que cambia es a qué
apunta: antes elegía una silueta dibujada, ahora elige un juego de imágenes.

También sobreviven los cuatro tipos de marca con su letra —R, G, X, F—, el inventario de lo que
vino con el auto, y que la recepción de escritorio y la de tablet sean dos vistas del mismo
flujo.

---

# Segunda mitad: la revisión

El dibujo dice **en qué estado vino**. La revisión dice **qué le falta**, y son dos cosas
distintas: el dibujo existe para no comerse un reclamo, la revisión para encontrar trabajo.
Por eso la hoja de VW la tiene y la de Autopack no — una es de una terminal que quiere vender
servicio, la otra es un formulario de taller.

## Veintitrés puntos, un semáforo y una nota

Cada punto se contesta con **verde, ámbar o rojo**, más un renglón de texto:

| | |
| --- | --- |
| 🟢 Verde | Está bien |
| 🟠 Ámbar | Necesita reparación |
| 🔴 Rojo | Reparación urgente |

Los de VW, agrupados como los agrupa ella:

- **Exterior**: ópticas y luces delanteras, ópticas y luces traseras, limpieza exterior
- **Interior**: testigos e indicadores, escobillas y eyectores delanteros, escobillas y
  eyectores traseros, luces de interior y guantera/baúl, freno de mano, bocina, alzacristales
  delanteros, alzacristales traseros, cierre centralizado, estado de butacas, limpieza interior
- **Motor**: nivel de refrigerante, nivel de líquido de freno, estado de batería, correas
- **Inspección dinámica**: pérdida de fluidos, estado de escape y fijaciones, daños de bajo
  carrocería, pastillas y discos de freno, otros daños
- **Neumáticos**: los cuatro, el auxilio y la llave antirrobo

### Sin revisar no es verde

Misma regla que el inventario de lo que vino con el auto, y por el mismo motivo: si la casilla
vacía contara como «está bien», una revisión que nadie hizo diría que el auto está impecable —y
esa es justo la que después no se puede defender—. El cuarto estado es **no se revisó**, y es
el que traen todos hasta que alguien los toca.

## Cada taller arma la suya

**Los puntos son un catálogo del tenant, no una lista escrita en el código.** Vienen sembrados
con los de VW, y desde la configuración del módulo cada concesionaria **apaga los que no hace,
cambia el orden y agrega los propios**. Un taller de GNC revisa cosas que a VW no le importan.

Lo que no se hace nunca es **borrar** un punto: se desactiva. Una revisión firmada hace ocho
meses tiene que poder leerse con el nombre que tenía el punto ese día, aunque hoy no se use más.

## Dos momentos, no uno

La «inspección dinámica» pide prueba de ruta. Esa parte **no se llena en el mostrador con el
cliente adelante**: se llena después, en el taller. Así que la revisión no es un paso de la
recepción que se termina y se cierra — es una planilla de la orden que se completa en dos
momentos y queda registrada con quién contestó cada punto y cuándo.

## Lo ámbar y lo rojo es trabajo para vender

Ahí está el sentido comercial de la hoja: cada punto en ámbar o rojo es un trabajo que el auto
necesita y que todavía nadie cotizó.

**No se convierte solo en un renglón de la orden.** Que marcar un punto agregue algo que se
cobra es la clase de automatismo que termina en una discusión en el mostrador. Lo que va es un
botón: con la revisión hecha, «pasar a presupuesto» lista lo que está en ámbar y en rojo y
deja elegir qué se presupuesta. La decisión sigue siendo de una persona.

## Las dos firmas

La hoja de VW cierra con firma del asesor y firma con aclaración del cliente. Eso es lo mismo
que ya estaba anotado como pendiente para el peritaje, así que es una sola cosa y va una vez
para las dos mitades.

---

## Cómo se implementa

Por orden, porque cada paso deja el sistema andando:

1. **El modelo de datos del dibujo**: la tabla de hojas con sus versiones y sus imágenes, y las
   marcas que pasan de `{ zona, x, y }` a `{ vista, x, y }` en fracción. Con la migración de
   las que ya están cargadas.
2. **El almacén y la subida**: MinIO en el `docker compose`, la interfaz que lo tapa, multipart
   en la API, límite de tamaño y de tipo, y la conversión a un formato único. Es la primera
   subida de archivos del sistema, así que lo que se decida acá lo van a heredar las fotos del
   vehículo y el logo de la concesionaria — y los tests de aislamiento del almacén se escriben
   ahora, no cuando haya tres módulos usándolo.
3. **El catálogo de puntos de revisión**, con su semilla y sus respuestas por orden.
4. **La pantalla de configuración**, adentro del módulo de servicios, con sus dos partes: las
   quince imágenes y los puntos que se revisan.
5. **La recepción**: las cinco vistas con la marca donde se toca, y la revisión por secciones.
   En tablet se toca; con teclado se cambia de vista con las flechas y se marca con la letra.
6. **La orden impresa**: las cinco vistas con sus marcas y la revisión con su semáforo, que en
   blanco y negro es forma además de color.
7. **Pasar a presupuesto** lo que quedó en ámbar y en rojo.
