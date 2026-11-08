# La API y la web, compiladas desde el monorepo. Se construye con la raíz del repo como contexto.
# Se dejan las dependencias de desarrollo: las migraciones y las semillas corren con tsx.
FROM node:24-bookworm-slim

WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@gpb/api... --filter=@gpb/web...

WORKDIR /app/apps/api
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
