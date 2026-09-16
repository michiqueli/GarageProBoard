import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { crearRouter } from './rutas.tsx'
import { crearConsultas } from './sesion/consultas.ts'
import './index.css'

// Un taller trabaja con datos que cambian seguido pero no cada segundo.
const cliente = crearConsultas({ frescura: 30_000, reintentos: 1 })

const router = crearRouter()

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el div#root en index.html')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
