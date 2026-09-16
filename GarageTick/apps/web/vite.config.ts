import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Puerto fijo: el kiosco arranca contra una URL que no cambia.
    port: 5173,
    strictPort: true,
  },
})
