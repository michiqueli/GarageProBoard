# Producción y backups

Producción corre en el VPS; el desarrollo sigue en cada PC. Los archivos están en
`infra/produccion`. Desde el 08/11/2026.

Vamos a guardar comprobantes fiscales de terceros, con obligación legal de conservación, y firmas
de sus clientes. **Un backup que nunca se restauró es una suposición.**

## Dos copias del sistema en el VPS

| | Producción | Demo |
| --- | --- | --- |
| Rama | `main` | `developer` |
| Dirección | `app.garageproboard.com` | `demo.garageproboard.com` |
| Base y archivos | Los reales | Propios, con datos de prueba |
| Backups | Sí | No: se puede rehacer |

Lo nuevo se trabaja en `developer`, se prueba en demo y recién ahí pasa a `main`. Son dos copias
y no una concesionaria de prueba dentro de producción porque el código y los cambios de la base
les llegan a todas las concesionarias a la vez.

Demo se publica desde la PC con `infra/produccion/publicar-demo.sh`: copia lo versionado de
`developer` a `/var/www/garageproboard-demo/repo`, compila, migra y reemplaza la web. Los secretos
están en `/var/www/garageproboard-demo/.env.demo` y se generan una sola vez.

## Qué se respalda y a dónde

Todo va a **Cloudflare R2**, en otro proveedor: una copia dentro del VPS se pierde con el VPS.

| Qué | Cómo | Se puede perder, como mucho |
| --- | --- | --- |
| **La base** | pgBackRest: completo los domingos, diferencial el resto, y el WAL continuo | Cinco minutos (`archive_timeout`) |
| **Firmas, fotos y dibujos** | `rclone copy`, cada hora | Una hora |

- **Se puede volver a cualquier momento** del último mes: quedan cuatro backups completos con su WAL.
- **Todo sale cifrado.** La base con AES-256 de pgBackRest, los archivos con `rclone crypt`.
- **Los archivos son `copy` y no `sync`**: lo que se borre del almacén sigue en la copia.

Dentro del bucket `garageproboard`:

    postgres/          La base entera: es una sola, con todas las concesionarias adentro.
    archivos/demo/     Los archivos de cada concesionaria, en la carpeta de su slug.

Las carpetas se ven con el nombre del cliente; los nombres de los archivos y su contenido van
cifrados. Una carpeta aparece con su primer archivo. Cambiarle el slug a una concesionaria abre
una carpeta nueva.

## Lo que hay que guardar afuera del VPS

En un gestor de contraseñas, porque **sin esto los backups no sirven**:

- `PGBACKREST_CIPHER_PASS` y `ARCHIVOS_CIFRADO_PASS`.
- `SECRETOS_MASTER_KEY`: sin ella la base restaurada no puede descifrar los certificados de AFIP.
- `QR_SECRET`: sin ella dejan de valer las credenciales y las órdenes impresas.

## Poner en marcha

1. En R2, una clave con permiso sólo sobre el bucket `garageproboard`.
2. En el VPS, clonar el repositorio en `/var/www/garageproboard`, copiar `.env.example` a `.env`
   (`chmod 600`) y completarlo.
3. `docker compose up -d --build postgres redis`.
4. `./respaldar.sh iniciar`, y después `./respaldar.sh archivos`.
5. `./respaldar.sh probar`, que tiene que terminar en `RESTAURACION OK`.
6. Copiar `backup.cron` a `/etc/cron.d/gpb-backup`.

## Probarlo

- `ensayar-backup.sh` hace el circuito entero en cualquier máquina con Docker, sin R2: backup, datos
  escritos **después** del backup y restauración en un volumen descartable que tiene que traer los
  dos. Lo segundo es lo que prueba el WAL.
- `respaldar.sh probar` hace lo mismo contra R2, sin tocar la base de producción, y corre solo el
  primero de cada mes. **Hay que mirar ese resultado**: todavía no avisa si falla.

## Si hay que restaurar de verdad

Con la base detenida y su volumen vacío:

    docker compose stop postgres
    docker run --rm -v gpb-prod_pgdata:/var/lib/postgresql --env-file <variables de pgBackRest> \
      --user postgres gpb-postgres:18 pgbackrest --stanza=gpb restore

Para volver a un momento anterior: `--type=time --target="2026-11-08 14:30:00-03" --target-action=promote`.

## La landing

El VPS ya atiende los puertos 80 y 443 con nginx para otros proyectos: la landing es un sitio más,
en `/var/www/garageproboard/landing`, con `infra/produccion/nginx/garageproboard.conf`.

## El almacén de archivos

En producción es el **MinIO que ya está en el VPS**, y en desarrollo Garage: a la API le da igual,
habla S3. Hay que crearle un bucket y una clave propios: el VPS lo comparte con otros proyectos.

## Lo que queda

- El aviso cuando un backup o la prueba mensual fallan.
- Publicar la API y la web: hoy el compose trae la base y Redis.
