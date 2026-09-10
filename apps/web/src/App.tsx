import { useQuery } from '@tanstack/react-query'

interface Salud {
  estado: string
  version: string
}

export function App() {
  const { data, isPending, isError } = useQuery<Salud>({
    queryKey: ['salud'],
    queryFn: async () => {
      const respuesta = await fetch('/api/salud')
      if (!respuesta.ok) throw new Error('La API no responde')
      return respuesta.json()
    },
  })

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">GarageTick</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Gestión integral para concesionarias.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Estado de la API
        </p>
        <p className="mt-1 text-lg">
          {isPending && 'Consultando…'}
          {isError && 'Sin respuesta. ¿Está levantada la API?'}
          {data && `${data.estado} · v${data.version}`}
        </p>
      </div>
    </main>
  )
}
