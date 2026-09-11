import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // El front habla con la API por el mismo origen en desarrollo: así no hay
    // CORS en el medio y las cookies de sesión se comportan como en producción.
    proxy: {
      '/api': { target: 'http://localhost:3080', changeOrigin: true },
    },
  },
})
