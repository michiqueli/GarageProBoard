import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { crearRouter } from './rutas.tsx'
import './index.css'

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // Un taller trabaja con datos que cambian seguido pero no cada segundo.
      staleTime: 30_000,
      retry: 1,
    },
  },
})

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
