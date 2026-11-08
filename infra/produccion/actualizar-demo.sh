#!/bin/bash
# Pone en demo lo que haya en /var/www/garageproboard-demo/repo. Lo llama `publicar-demo.sh`, y se
# puede correr todas las veces que haga falta: los secretos se generan una sola vez.
set -euo pipefail

BASE=/var/www/garageproboard-demo
cd "$BASE/repo/infra/produccion"

if [ ! -e "$BASE/.env.demo" ]; then
  g() { openssl rand -base64 48 | tr -d '\n/+='; }
  pg="$(g)"; app="$(g)"
  umask 077
  cat > "$BASE/.env.demo" <<FIN
NODE_ENV=production
TZ=America/Argentina/Buenos_Aires
POSTGRES_PASSWORD=$pg
DATABASE_URL=postgres://gpb:$pg@postgres:5432/gpb
DATABASE_URL_APP=postgres://gpb_app:$app@postgres:5432/gpb
APP_DB_PASSWORD=$app
REDIS_URL=redis://redis:6379
API_PORT=3080
API_HOST=0.0.0.0
URL_FRONT=https://demo.garageproboard.com
JWT_SECRET=$(g)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
ARCA_ENTORNO=homologacion
SECRETOS_MASTER_KEY=$(openssl rand -base64 32)
QR_SECRET=$(g)
S3_ENDPOINT=http://garage:3900
S3_ACCESS_KEY=GK1a2b3c4d5e6f708192a3b4c5
S3_SECRET_KEY=3f8c1d7b2e5a9046c8b1f3d7e2a5c904b6d8f1e3a7c250b9d4f6e8a1c3b5d709
S3_BUCKET=gpb
S3_REGION=garage
ADMIN_PASSWORD=$(g | cut -c1-20)
FIN
fi

compose=(docker compose -f docker-compose.demo.yml)
"${compose[@]}" build api
"${compose[@]}" up -d --wait postgres redis garage
GARAGE_CONTENEDOR=gpb-demo-garage node ../preparar-s3.mjs

tsx() { "${compose[@]}" run --rm --no-deps "$@"; }
tsx -w /app/packages/db api ./node_modules/.bin/tsx scripts/migrate.ts
tsx -w /app/packages/db api ./node_modules/.bin/tsx scripts/app-role.ts
# NODE_ENV=development sólo para esto: en producción no se siembran datos de ejemplo.
tsx -w /app/packages/db -e NODE_ENV=development api ./node_modules/.bin/tsx scripts/sembrar.ts

"${compose[@]}" up -d --wait --no-build api

# La web son archivos: los sirve el nginx del VPS.
rm -rf "$BASE/web.nueva"
mkdir -p "$BASE/web.nueva"
docker run --rm -v "$BASE/web.nueva:/salida" gpb-demo-api sh -c 'cp -r /app/apps/web/dist/. /salida/'
rm -rf "$BASE/web"
mv "$BASE/web.nueva" "$BASE/web"
chown -R www-data:www-data "$BASE/web"
echo "== DEMO ACTUALIZADA"
