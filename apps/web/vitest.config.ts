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
    // Uno por núcleo menos uno —lo de fábrica— son 19 jsdom peleándose la máquina: todo
    // andaba diez veces más lento y el primer test de algún archivo fallaba de a ratos. Con
    // la mitad no falla y la suite tarda menos.
    maxWorkers: '50%',
  },
})
