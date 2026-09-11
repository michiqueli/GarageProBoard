import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Levantar Postgres y montar Nest tarda; el punto es probar contra lo real.
    testTimeout: 60_000,
    hookTimeout: 240_000,
    pool: 'forks',
    fileParallelism: false,
  },
  // No hay configuración de decoradores acá a propósito: Vitest 5 transpila con oxc y
  // no emite `emitDecoratorMetadata`. En vez de perseguir al transpilador, el código
  // usa `@Inject()` explícito en cada dependencia, que funciona igual en los dos lados.
})
