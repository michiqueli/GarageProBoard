#!/bin/bash
# Restaura el último backup en un volumen descartable, levanta Postgres sobre él y mira que tenga
# datos. Un backup que nunca se restauró es una suposición.
#
# Corre en un contenedor aparte, con su volumen vacío: no toca la base de producción. Arranca con
# archive_mode=off para que esta copia no escriba en el repositorio de la verdadera.
#
# Si CONSULTA_DE_PRUEBA está definida, tiene que devolver una fila; su resultado se imprime.
set -euo pipefail

DATOS="${PGBACKREST_PG1_PATH:?falta PGBACKREST_PG1_PATH}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATOS" /var/run/postgresql
  chown -R postgres:postgres /var/lib/postgresql /var/run/postgresql
  exec gosu postgres "$0" "$@"
fi

[ -z "$(ls -A "$DATOS" 2>/dev/null)" ] || {
  echo "ERROR: $DATOS no está vacío. Esto se corre sólo sobre un volumen descartable." >&2
  exit 1
}

echo "== Restaurando el último backup"
pgbackrest --stanza="${PGBACKREST_STANZA:-gpb}" --archive-mode=off restore

echo "== Levantando Postgres sobre la copia"
pg_ctl -D "$DATOS" -w -t 600 \
  -o "-c archive_mode=off -c listen_addresses=''" start

hasta=$((SECONDS + 300))
until [ "$(psql -U gpb -d postgres -Atc 'select not pg_is_in_recovery()')" = "t" ]; do
  [ "$SECONDS" -lt "$hasta" ] || { echo "ERROR: la recuperación no terminó" >&2; exit 1; }
  sleep 2
done

echo "== Comprobando los datos"
psql -U gpb -d gpb -Atc 'select count(*) || $$ tablas$$ from information_schema.tables where table_schema = $$public$$'
if [ -n "${CONSULTA_DE_PRUEBA:-}" ]; then
  resultado="$(psql -U gpb -d gpb -Atc "$CONSULTA_DE_PRUEBA")"
  [ -n "$resultado" ] || { echo "ERROR: la consulta de prueba no devolvió nada" >&2; exit 1; }
  echo "Consulta de prueba: $resultado"
fi

pg_ctl -D "$DATOS" -m fast stop
echo "== RESTAURACION OK"
