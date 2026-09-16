import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://garagetick:garagetick@localhost:5432/garagetick',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
})
