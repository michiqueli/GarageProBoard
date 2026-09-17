import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Las pantallas ya van cada una en su archivo (ver rutas.tsx). Lo que comparten se parte
        // por cuánto cambia: React y el router casi nunca, así que quedan cacheados entre
        // versiones; el contrato y los paquetes propios cambian con cada entrega.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[/](react|react-dom|scheduler)[/]/ },
            { name: 'librerias', test: /node_modules/ },
            { name: 'gpb', test: /packages[/](contracts|core)[/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    // El front habla con la API por el mismo origen en desarrollo: así no hay
    // CORS en el medio y las cookies de sesión se comportan como en producción.
    proxy: {
      '/api': { target: 'http://localhost:3080', changeOrigin: true },
    },
  },
})
