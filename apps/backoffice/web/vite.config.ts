import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Otro puerto que la aplicación de los clientes: son dos sitios, y en producción
    // dos dominios.
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3090', changeOrigin: true },
    },
  },
})
