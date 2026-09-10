import { defineConfig } from 'drizzle-kit'

// 'generate' no toca la base: sólo compara el esquema TypeScript contra las
// migraciones ya escritas. El placeholder evita exigir un .env para generarlas.
const url = process.env.DATABASE_URL ?? 'postgres://sin-conexion/generate'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  // Los nombres de tablas y columnas van en castellano y en snake_case: el dominio
  // se habla en castellano y traducir a mitad de camino sólo genera ambigüedad.
  casing: 'snake_case',
  verbose: true,
  strict: true,
})
