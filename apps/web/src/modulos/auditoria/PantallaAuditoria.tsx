import { accesoDeRuta, contrato } from '@gpb/contracts'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

type Pestania = 'ingresos' | 'cambios' | 'computadoras'
type Dispositivo = { id: string; nombre: string | null; agente: string | null }

const FECHA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * «Chrome en Windows», a partir de lo que informa el navegador.
 *
 * Alcanza con reconocer los de siempre: lo que importa no es el detalle de la versión sino
 * poder decir «ésta es la PC con Firefox» cuando todavía no tiene nombre.
 */
export function describirNavegador(agente: string | null): string {
  if (!agente) return 'Navegador desconocido'

  const navegador = /Edg\//.test(agente)
    ? 'Edge'
    : /OPR\//.test(agente)
      ? 'Opera'
      : /Chrome\//.test(agente)
        ? 'Chrome'
        : /Firefox\//.test(agente)
          ? 'Firefox'
          : /Safari\//.test(agente)
            ? 'Safari'
            : 'Otro navegador'
  const sistema = /Windows/.test(agente)
    ? 'Windows'
    : /Android/.test(agente)
      ? 'Android'
      : /iPhone|iPad/.test(agente)
        ? 'iPhone'
        : /Mac OS X/.test(agente)
          ? 'Mac'
          : /Linux/.test(agente)
            ? 'Linux'
            : null

  return sistema ? `${navegador} en ${sistema}` : navegador
}

function nombreDe(d: Dispositivo): string {
  return d.nombre ?? describirNavegador(d.agente)
}

function mensajeDe(error: unknown): string {
  if (error instanceof ORPCError) return error.message
  return 'No se pudo traer el registro. Probá refrescar con F5.'
}

/**
 * El registro de la concesionaria: quién entró, desde qué computadora, y quién cambió qué.
 *
 * Es lo que controla a quien administra usuarios. Lo que hay que mirar está marcado: una
 * **computadora nueva** en la cuenta de alguien —el gerente entrando desde la PC de
 * sistemas— es el aviso de que otra persona usó su cuenta.
 */
export function PantallaAuditoria() {
  const [pestania, setPestania] = useState<Pestania>('ingresos')

  const pestanias: Array<{ id: Pestania; etiqueta: string }> = [
    { id: 'ingresos', etiqueta: 'Ingresos' },
    { id: 'cambios', etiqueta: 'Cambios' },
    { id: 'computadoras', etiqueta: 'Computadoras' },
  ]

  return (
    <Shell titulo="Auditoría" requiere={accesoDeRuta(contrato.auditoria.ingresos)}>
      <div role="tablist" aria-label="Registro" className="flex gap-1 border-b border-borde">
        {pestanias.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestania === p.id}
            onClick={() => setPestania(p.id)}
            className={`-mb-px h-campo border-b-2 px-3 text-dato ${
              pestania === p.id
                ? 'border-marca font-semibold text-marca'
                : 'border-transparent text-texto-suave hover:text-texto'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <section
        role="tabpanel"
        className="overflow-hidden rounded-base border border-borde bg-superficie"
      >
        {pestania === 'ingresos' && <Ingresos />}
        {pestania === 'cambios' && <Cambios />}
        {pestania === 'computadoras' && <Computadoras />}
      </section>
    </Shell>
  )
}

function Ingresos() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const consulta = useQuery({
    queryKey: ['auditoria', tenantId, 'ingresos'],
    queryFn: () => api.auditoria.ingresos({ pagina: 1, porPagina: 100 }),
  })

  return (
    <Listado
      consulta={consulta}
      vacio="Todavía no entró nadie."
      columnas={['Fecha', 'Usuario', 'Computadora', 'IP', 'Sucursal']}
      filas={(consulta.data?.datos ?? []).map((i) => ({
        clave: `${i.fecha}-${i.usuario.id}`,
        celdas: [
          <span key="f" className="font-mono text-etiqueta">
            {FECHA.format(new Date(i.fecha))}
          </span>,
          <span key="u">
            {i.usuario.nombre}
            <span className="ml-2 text-etiqueta text-texto-tenue">{i.usuario.email}</span>
          </span>,
          <span key="c" className="flex flex-wrap items-center gap-2">
            {i.dispositivo ? nombreDe(i.dispositivo) : <Tenue>Sin computadora (app)</Tenue>}
            {/* Llena: alguien tiene que mirarlo. Es el caso que justifica esta pantalla. */}
            {i.computadoraNueva && (
              <span className="rounded-full bg-atencion px-2 text-etiqueta font-semibold text-fondo">
                Computadora nueva
              </span>
            )}
          </span>,
          <span key="i" className="font-mono text-etiqueta text-texto-suave">
            {i.ip ?? '—'}
          </span>,
          <span key="s" className="text-texto-suave">
            {i.sucursal ?? '—'}
          </span>,
        ],
      }))}
    />
  )
}

function Cambios() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const consulta = useQuery({
    queryKey: ['auditoria', tenantId, 'cambios'],
    queryFn: () => api.auditoria.cambios({ pagina: 1, porPagina: 100 }),
  })

  return (
    <Listado
      consulta={consulta}
      vacio="Todavía no hay cambios registrados."
      columnas={['Fecha', 'Quién', 'Sobre qué', 'Qué cambió', 'IP']}
      filas={(consulta.data?.datos ?? []).map((c, i) => ({
        clave: `${c.fecha}-${i}`,
        celdas: [
          <span key="f" className="font-mono text-etiqueta">
            {FECHA.format(new Date(c.fecha))}
          </span>,
          <span key="q">{c.autor ?? <Tenue>Sin autor</Tenue>}</span>,
          <span key="s" className="text-texto-suave">
            {c.sobre}
          </span>,
          // El detalle ya dice qué pasó —«Lo dio de baja», «Le agregó el rol…»—: anteponerle
          // «Modificación» sólo lo alarga.
          <span key="d">{c.detalle}</span>,
          <span key="i" className="font-mono text-etiqueta text-texto-suave">
            {c.ip ?? '—'}
          </span>,
        ],
      }))}
    />
  )
}

function Computadoras() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeNombrar = usePuedeUsar(contrato.auditoria.nombrarDispositivo)
  const [editando, setEditando] = useState<string | null>(null)
  const consulta = useQuery({
    queryKey: ['auditoria', tenantId, 'computadoras'],
    queryFn: () => api.auditoria.dispositivos(),
  })

  return (
    <Listado
      consulta={consulta}
      vacio="Todavía no se entró desde ninguna computadora."
      columnas={['Nombre', 'Navegador', 'Quiénes entraron', 'Último uso']}
      filas={(consulta.data?.datos ?? []).map((d) => ({
        clave: d.id,
        celdas: [
          editando === d.id ? (
            <Renombrar key="n" dispositivo={d} alTerminar={() => setEditando(null)} />
          ) : (
            <span key="n" className="flex flex-wrap items-center gap-2">
              {d.nombre ?? <Tenue>Sin nombre</Tenue>}
              {puedeNombrar && (
                <button
                  type="button"
                  onClick={() => setEditando(d.id)}
                  className="text-etiqueta text-marca hover:underline"
                >
                  {d.nombre ? 'Cambiar nombre' : 'Ponerle nombre'}
                </button>
              )}
            </span>
          ),
          <span key="a" className="text-texto-suave">
            {describirNavegador(d.agente)}
          </span>,
          <span key="u" className="text-texto-suave">
            {d.usuarios.join(', ') || '—'}
          </span>,
          <span key="f" className="font-mono text-etiqueta text-texto-suave">
            {FECHA.format(new Date(d.ultimoUsoEn))}
          </span>,
        ],
      }))}
    />
  )
}

function Renombrar({
  dispositivo,
  alTerminar,
}: {
  dispositivo: Dispositivo
  alTerminar: () => void
}) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const [nombre, setNombre] = useState(dispositivo.nombre ?? '')

  const guardar = useMutation({
    mutationFn: () =>
      api.auditoria.nombrarDispositivo({ id: dispositivo.id, nombre: nombre.trim() || null }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['auditoria', tenantId] })
      alTerminar()
    },
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    guardar.mutate()
  }

  return (
    <form
      onSubmit={enviar}
      onKeyDown={(e) => e.key === 'Escape' && alTerminar()}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: se abre para escribir el nombre
        autoFocus
        aria-label="Nombre de la computadora"
        placeholder="PC del mostrador"
        maxLength={60}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="h-campo w-44 rounded-base border border-borde bg-superficie-2 px-2 text-dato outline-none focus-visible:border-marca"
      />
      <button type="submit" className="text-etiqueta font-semibold text-marca">
        Guardar
      </button>
      {guardar.isError && (
        <span role="alert" className="text-etiqueta text-critico">
          {mensajeDe(guardar.error)}
        </span>
      )}
    </form>
  )
}

/** Tabla en escritorio y tarjetas en teléfono, con los estados de carga, error y vacío. */
function Listado({
  consulta,
  vacio,
  columnas,
  filas,
}: {
  consulta: { isPending: boolean; isError: boolean; error: unknown }
  vacio: string
  columnas: string[]
  filas: Array<{ clave: string; celdas: ReactNode[] }>
}) {
  const esEscritorio = useMedia(ES_ESCRITORIO)

  if (consulta.isPending) {
    return (
      <div className="grid gap-px p-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
        ))}
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <p role="alert" className="px-3 py-6 text-dato text-critico">
        {mensajeDe(consulta.error)}
      </p>
    )
  }
  if (filas.length === 0) {
    return <p className="px-3 py-8 text-center text-dato text-texto-suave">{vacio}</p>
  }

  if (!esEscritorio) {
    return (
      <ul className="divide-y divide-borde-suave">
        {filas.map((f) => (
          <li key={f.clave} className="grid gap-1 px-3 py-2.5 text-dato">
            {f.celdas.map((c, i) => (
              <div key={columnas[i]} className="flex gap-2">
                <span className="w-24 shrink-0 text-etiqueta text-texto-tenue">{columnas[i]}</span>
                <span className="min-w-0">{c}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <table className="w-full border-collapse text-dato">
      <thead>
        <tr>
          {columnas.map((c) => (
            <th
              key={c}
              className="border-b border-borde bg-superficie-2 px-3 py-1.5 text-left text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase"
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.clave} className="hover:bg-superficie-2">
            {f.celdas.map((c, i) => (
              <td key={columnas[i]} className="h-fila border-b border-borde-suave px-3">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Tenue({ children }: { children: ReactNode }) {
  return <span className="text-etiqueta text-texto-tenue italic">{children}</span>
}
