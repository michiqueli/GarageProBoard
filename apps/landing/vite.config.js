import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
  // Sin JavaScript en la página: el CSS y las fuentes cargan solos, y un buscador la lee entera.
  build: {
    rolldownOptions: {
      input: {
        index: 'index.html',
        privacidad: 'privacidad.html',
        terminos: 'terminos.html',
        404: '404.html',
      },
    },
  },
  server: { port: 5180 },
})
