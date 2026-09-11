import { ORPCError } from '@orpc/client'
import { useMutation } from '@tanstack/react-query'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'

/**
 * A qué sucursal entra el usuario.
 *
 * Sólo aparece cuando hace falta: con una sola sucursal no hay nada que elegir, y con
 * una predeterminada guardada ya eligió una vez. Preguntar todas las mañanas algo que
 * la respuesta va a ser siempre la misma es exactamente el tipo de fricción que hace
 * que un sistema se sienta pesado.
 *
 * La sucursal no es cosmética: define desde qué punto de venta se factura y qué caja se
 * abre. Entrar a la equivocada y facturar es un comprobante que hay que anular con nota
 * de crédito, así que la pantalla muestra la razón social de cada una y no sólo el
 * nombre — «Casa Central» de una SAS no es «Casa Central» de la otra.
 */
export function PantallaSucursal() {
  const datos = usarSesion((e) => e.datos)
  const establecer = usarSesion((e) => e.establecer)
  const sucursalElegida = usarSesion((e) => e.sucursalElegida)

  const elegir = useMutation({
    mutationFn: async (sucursalId: string) => {
      try {
        return await api.auth.cambiarSucursal({ sucursalId })
      } catch (error) {
        if (error instanceof ORPCError) throw new Error(error.message)
        throw new Error('No se pudo conectar con el servidor. Revisá tu conexión.')
      }
    },
    onSuccess: (nueva) => {
      establecer(nueva)
      sucursalElegida()
    },
  })

  if (!datos) return null

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <main className="w-full max-w-md">
        <div className="mb-6">
          <p className="text-etiqueta text-texto-suave">
            Hola, {datos.usuario.nombre}. {datos.tenant.nombre}.
          </p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">
            ¿A qué sucursal entrás?
          </h1>
        </div>

        <ul className="grid gap-2">
          {datos.sucursales.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => elegir.mutate(s.id)}
                disabled={elegir.isPending}
                className="flex w-full items-center gap-3 rounded-base border border-borde bg-superficie px-4 py-3 text-left transition-colors hover:border-marca disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-ui font-semibold">{s.nombre}</span>
                  <span className="block truncate text-etiqueta text-texto-tenue">
                    {s.razonSocial}
                  </span>
                </span>
                <span aria-hidden="true" className="text-texto-tenue">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>

        {elegir.isError && (
          <p role="alert" className="mt-3 text-dato text-critico">
            {elegir.error.message}
          </p>
        )}

        <p className="mt-4 text-[11px] text-texto-tenue">
          Podés cambiar de sucursal en cualquier momento sin volver a entrar.
        </p>
      </main>
    </div>
  )
}
