#!/bin/bash
# Ensaya el circuito entero sin R2: backup completo, datos escritos DESPUÉS del backup, y
# restauración en un volumen descartable que tiene que traer los dos. Lo segundo es lo que prueba
# el WAL: sin él, se perdería todo lo posterior al último backup.
set -euo pipefail
cd "$(dirname "$0")"

export POSTGRES_PASSWORD=ensayo PGBACKREST_CIPHER_PASS=ensayo-cifrado
compose=(docker compose -f docker-compose.yml -f docker-compose.prueba.yml)
sql() { docker exec gpb-ensayo-pg psql -U gpb -d gpb -v ON_ERROR_STOP=1 -Atc "$1"; }
limpiar() { "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; docker volume rm -f gpb-ensayo-restauracion >/dev/null 2>&1 || true; }
trap limpiar EXIT
limpiar

"${compose[@]}" up -d --build --wait postgres
docker exec -u root gpb-ensayo-pg chown postgres:postgres /repo

docker exec -u postgres gpb-ensayo-pg pgbackrest stanza-create
docker exec -u postgres gpb-ensayo-pg pgbackrest check

sql "create table ensayo (cuando text primary key); insert into ensayo values ('antes del backup')"
docker exec -u postgres gpb-ensayo-pg pgbackrest --type=full backup
sql "insert into ensayo values ('despues del backup')"
sql "select pg_switch_wal()" >/dev/null
sleep 3
docker exec -u postgres gpb-ensayo-pg pgbackrest info

docker stop gpb-ensayo-pg >/dev/null

docker run --rm \
  -v gpb-ensayo-restauracion:/var/lib/postgresql \
  -v gpb-ensayo_repo:/repo \
  -e PGBACKREST_STANZA=gpb \
  -e PGBACKREST_PG1_PATH=/var/lib/postgresql/18/docker \
  -e PGBACKREST_REPO1_TYPE=posix \
  -e PGBACKREST_REPO1_PATH=/repo \
  -e PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc \
  -e PGBACKREST_REPO1_CIPHER_PASS=ensayo-cifrado \
  -e PGBACKREST_LOG_LEVEL_FILE=off \
  -e CONSULTA_DE_PRUEBA="select string_agg(cuando, ', ' order by cuando) from ensayo having count(*) = 2" \
  --entrypoint gpb-probar-restauracion \
  gpb-postgres:18
