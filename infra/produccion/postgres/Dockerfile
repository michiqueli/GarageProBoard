# Postgres con pgBackRest adentro: archive_command tiene que encontrarlo en el mismo contenedor.
# Es la imagen Debian y no la alpine de desarrollo porque pgBackRest viene del repositorio de PGDG,
# que la imagen oficial ya trae configurado, con la versión que soporta este Postgres.
FROM postgres:18

RUN apt-get update \
  && apt-get install -y --no-install-recommends pgbackrest ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY probar-restauracion.sh /usr/local/bin/gpb-probar-restauracion
RUN sed -i 's/\r$//' /usr/local/bin/gpb-probar-restauracion \
  && chmod +x /usr/local/bin/gpb-probar-restauracion
