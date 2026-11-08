#!/bin/bash
# Los backups de producción. Lo llama el cron del VPS; ver backup.cron.
#
#   respaldar.sh iniciar    La primera vez: crea el repositorio y hace el primer backup completo.
#   respaldar.sh completo   Backup completo de la base.
#   respaldar.sh diario     Backup diferencial de la base.
#   respaldar.sh archivos   Copia firmas, fotos y dibujos a R2, cifrados.
#   respaldar.sh probar     Restaura el último backup en un volumen descartable y lo comprueba.
set -euo pipefail
cd "$(dirname "$0")"
set -a; source ./.env; set +a

RCLONE=rclone/rclone:1.71
pg() { docker exec -u postgres gpb-prod-pg pgbackrest "$@"; }

archivos() {
  local clave
  clave="$(docker run --rm "$RCLONE" obscure "$ARCHIVOS_CIFRADO_PASS")"
  # Una carpeta por concesionaria, con su slug: archivos/demo/… Los nombres de carpeta quedan a
  # la vista para poder encontrar a un cliente; los de los archivos y su contenido van cifrados.
  local hay id slug
  hay="$(docker exec gpb-prod-pg psql -U gpb -d gpb -Atc "select to_regclass('public.tenant') is not null")"
  [ "$hay" = "t" ] || { echo "Todavía no hay concesionarias: nada que copiar."; return 0; }
  while IFS='|' read -r id slug; do
    copiar_tenant "$clave" "$id" "$slug"
  done < <(docker exec gpb-prod-pg psql -U gpb -d gpb -Atc "select id, slug from tenant order by slug")
}

copiar_tenant() {
  local clave="$1" id="$2" slug="$3"
  # `copy` y no `sync`: lo que se borre del almacén no se borra de la copia.
  docker run --rm --network host \
    -e RCLONE_CONFIG_ORIGEN_TYPE=s3 \
    -e RCLONE_CONFIG_ORIGEN_PROVIDER=Minio \
    -e RCLONE_CONFIG_ORIGEN_ENDPOINT="$ALMACEN_ENDPOINT" \
    -e RCLONE_CONFIG_ORIGEN_ACCESS_KEY_ID="$ALMACEN_ACCESS_KEY" \
    -e RCLONE_CONFIG_ORIGEN_SECRET_ACCESS_KEY="$ALMACEN_SECRET_KEY" \
    -e RCLONE_CONFIG_R2_TYPE=s3 \
    -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ENDPOINT" \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
    -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    -e RCLONE_CONFIG_CIFRADO_TYPE=crypt \
    -e RCLONE_CONFIG_CIFRADO_REMOTE="r2:$R2_BUCKET_BACKUPS/archivos" \
    -e RCLONE_CONFIG_CIFRADO_PASSWORD="$clave" \
    -e RCLONE_CONFIG_CIFRADO_DIRECTORY_NAME_ENCRYPTION=false \
    "$RCLONE" copy "origen:$ALMACEN_BUCKET/t/$id" "cifrado:$slug" --fast-list --transfers 8
}

probar() {
  docker volume rm -f gpb-prod-restauracion >/dev/null 2>&1 || true
  docker run --rm \
    -v gpb-prod-restauracion:/var/lib/postgresql \
    -e PGBACKREST_STANZA=gpb \
    -e PGBACKREST_PG1_PATH=/var/lib/postgresql/18/docker \
    -e PGBACKREST_REPO1_TYPE=s3 \
    -e PGBACKREST_REPO1_PATH=/postgres \
    -e PGBACKREST_REPO1_S3_ENDPOINT="$R2_ENDPOINT" \
    -e PGBACKREST_REPO1_S3_REGION=auto \
    -e PGBACKREST_REPO1_S3_BUCKET="$R2_BUCKET_BACKUPS" \
    -e PGBACKREST_REPO1_S3_KEY="$R2_ACCESS_KEY" \
    -e PGBACKREST_REPO1_S3_KEY_SECRET="$R2_SECRET_KEY" \
    -e PGBACKREST_REPO1_S3_URI_STYLE=path \
    -e PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc \
    -e PGBACKREST_REPO1_CIPHER_PASS="$PGBACKREST_CIPHER_PASS" \
    -e PGBACKREST_LOG_LEVEL_FILE=off \
    --entrypoint gpb-probar-restauracion \
    gpb-postgres:18
  docker volume rm -f gpb-prod-restauracion >/dev/null
}

case "${1:-}" in
  iniciar)
    pg stanza-create
    pg check
    pg --type=full backup
    ;;
  completo) pg --type=full backup ;;
  diario) pg --type=diff backup ;;
  archivos) archivos ;;
  probar) probar ;;
  *)
    echo "Uso: $0 iniciar|completo|diario|archivos|probar" >&2
    exit 2
    ;;
esac
