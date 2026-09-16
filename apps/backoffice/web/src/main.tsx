import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { crearRouter } from './rutas.tsx'
import './index.css'

// Sin caché larga: lo que se ve acá tiene que ser lo que hay. Decidir apagar un módulo
// mirando un estado de hace cinco minutos es decidir sobre otra cosa.
const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: 0, retry: 1 } } })

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el div#root en index.html')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <RouterProvider router={crearRouter()} />
    </QueryClientProvider>
  </StrictMode>,
)
