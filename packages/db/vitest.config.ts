import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Levantar un Postgres de verdad tarda más que un mock, y es el punto: las
    // políticas de RLS sólo se pueden verificar contra el motor que las aplica.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    pool: 'forks',
    fileParallelism: false,
  },
})
