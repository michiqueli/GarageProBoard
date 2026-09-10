import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
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

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el div#root en index.html')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
