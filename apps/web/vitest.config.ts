import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/preparar.ts'],
    globals: false,
    // Tailwind no corre en los tests: lo que se verifica es el comportamiento
    // (qué se muestra, qué dispara cada tecla), no cómo se ve.
    css: false,
    // Ver asyncUtilTimeout en test/preparar.ts: bajo carga, la primera pantalla tarda.
    testTimeout: 15_000,
  },
})
