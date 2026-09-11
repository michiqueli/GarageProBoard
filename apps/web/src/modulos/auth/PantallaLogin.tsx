import { ORPCError } from '@orpc/client'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'

/**
 * El inicio de sesión.
 *
 * Es una de las dos pantallas donde el fondo con imagen sí tiene sentido: no hay tabla
 * densa que proteger, y es el momento en que la concesionaria ve «su» sistema. La
 * imagen la sube cada cliente — su logo, un auto, la fachada del local — así que acá
 * queda el lugar preparado y un degradado mientras tanto.
 */
export function PantallaLogin() {
  const establecer = usarSesion((e) => e.establecer)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const primerCampo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // El foco arranca en el correo: se entra tipeando, sin tocar el mouse.
    primerCampo.current?.focus()
  }, [])

  const entrar = useMutation({
    mutationFn: async () => {
      try {
        return await api.auth.iniciar({ email, password })
      } catch (error) {
        // Un error declarado en el contrato trae un mensaje pensado para el usuario.
        // Cualquier otro es un problema de red o del servidor, y ahí el mensaje del
        // sistema no le sirve a nadie.
        if (error instanceof ORPCError) throw new Error(error.message)
        throw new Error('No se pudo conectar con el servidor. Revisá tu conexión.')
      }
    },
    onSuccess: (datos) => establecer(datos),
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    entrar.mutate()
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden p-4">
      <Fondo />

      <main className="relative w-full max-w-sm">
        <div className="mb-7 flex items-center gap-3">
          <span className="size-5 rotate-45 rounded-[3px] bg-marca" />
          <span className="font-display text-xl font-bold tracking-tight">GaragePro</span>
        </div>

        <form
          onSubmit={enviar}
          className="grid gap-4 rounded-base border border-borde bg-superficie/90 p-6 backdrop-blur-sm"
        >
          <div>
            <h1 className="font-display text-lg font-semibold">Entrar</h1>
            <p className="mt-1 text-etiqueta text-texto-suave">
              Gestión integral para concesionarias.
            </p>
          </div>

          <Campo id="email" etiqueta="Correo">
            {(props) => (
              <input
                {...props}
                ref={primerCampo}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                className={CLASES_CAMPO}
              />
            )}
          </Campo>

          <Campo id="password" etiqueta="Contraseña">
            {(props) => (
              <input
                {...props}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={CLASES_CAMPO}
              />
            )}
          </Campo>

          {entrar.isError && (
            <p role="alert" className="text-dato text-critico">
              {entrar.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={entrar.isPending}
            className="h-campo rounded-base border border-marca bg-marca-suave font-semibold text-dato text-marca disabled:opacity-50"
          >
            {entrar.isPending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  )
}

const CLASES_CAMPO =
  'h-campo w-full rounded-base border border-borde bg-superficie-2 px-2.5 text-dato outline-none focus-visible:border-marca'

/**
 * Etiqueta y ayuda asociadas por id.
 *
 * El `label` no envuelve la ayuda: si la envolviera, el nombre accesible del campo
 * sería «Concesionaria El nombre corto del sistema…» y un lector de pantalla leería el
 * párrafo entero cada vez que el foco entra. La ayuda va por `aria-describedby`, que
 * es lo que existe justamente para eso.
 */
function Campo({
  id,
  etiqueta,
  ayuda,
  children,
}: {
  id: string
  etiqueta: string
  ayuda?: string
  children: (props: { id: string; 'aria-describedby'?: string }) => React.ReactNode
}) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-etiqueta font-medium text-texto-suave">
        {etiqueta}
      </label>
      {children({ id, ...(idAyuda ? { 'aria-describedby': idAyuda } : {}) })}
      {ayuda && (
        <span id={idAyuda} className="text-[11px] text-texto-tenue">
          {ayuda}
        </span>
      )}
    </div>
  )
}

/**
 * El lugar de la imagen del cliente. Hasta que la suba, un degradado.
 *
 * Es de las pocas partes del sistema donde el fondo puede ser protagonista: acá no hay
 * veinte filas de datos que tengan que leerse encima.
 */
function Fondo() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'radial-gradient(900px 520px at 78% 22%, color-mix(in srgb, var(--color-marca) 22%, transparent), transparent 62%),' +
          'radial-gradient(700px 460px at 15% 80%, color-mix(in srgb, var(--color-info) 18%, transparent), transparent 60%)',
      }}
    />
  )
}
