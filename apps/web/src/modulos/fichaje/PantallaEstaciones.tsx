import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoBorrar, IconoCopiar } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

type Estacion = Awaited<ReturnType<typeof api.fichaje.estaciones>>['datos'][number]
type Registro = Awaited<ReturnType<typeof api.fichaje.registrarEstacion>>

const FECHA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

/** Cómo se lee cada tipo en la tabla, en dos palabras. */
const QUE_ES: Record<'taller' | 'reloj' | 'tablero', string> = {
  taller: 'Credencial y orden',
  reloj: 'Entrada y salida',
  tablero: 'Muestra el tablero',
}

const TIPOS = [
  { valor: 'taller' as const, texto: 'Taller: credencial y orden' },
  { valor: 'reloj' as const, texto: 'Reloj: entrada y salida' },
  { valor: 'tablero' as const, texto: 'Tablero: el televisor del piso' },
]

const QUE_HACE: Record<(typeof TIPOS)[number]['valor'], string> = {
  taller:
    'Dos escaneos: la credencial del mecánico y después la orden. Si esa orden estaba abierta para él, se cierra.',
  reloj: 'Un escaneo: la credencial marca entrada, y la siguiente vez, salida.',
  tablero:
    'No ficha nada. Muestra qué autos hay en el taller, quién los tiene y cuánto llevan, con letra grande y refrescándose sola. Es para colgar, no para tocar.',
}

/**
 * Las PC que fichan.
 *
 * Cada una se registra una vez y se queda con su token. Es lo que hace que la pantalla del
 * taller abra sin login —el anti-feature número uno— sin que cualquiera con la dirección
 * pueda fichar por otro: lo que se autentica es el aparato, no la persona
 * (`docs/tecnicos/taller-control-de-tiempos.md`, regla 10).
 */
export function PantallaEstaciones() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const puedeVer = usePuedeUsar(contrato.fichaje.estaciones)
  const [alta, setAlta] = useState(false)
  const [reciente, setReciente] = useState<Registro | null>(null)

  const listado = useQuery({
    queryKey: ['estaciones', tenantId],
    queryFn: () => api.fichaje.estaciones(),
    enabled: puedeVer,
  })

  const cache = useQueryClient()
  const invalidar = () => cache.invalidateQueries({ queryKey: ['estaciones', tenantId] })

  const revocar = useMutation({
    mutationFn: (id: string) => api.fichaje.revocarEstacion({ id }),
    onSuccess: invalidar,
    meta: { exito: 'La estación quedó fuera de servicio', error: mensajeGeneral },
  })

  async function darDeBaja(e: Estacion) {
    const si = await confirmar({
      titulo: `¿Dar de baja «${e.nombre}»?`,
      texto:
        'Su token deja de servir en el momento y esa pantalla no ficha más. Lo que ya fichó ' +
        'queda. Para volver a usarla hay que registrarla de nuevo.',
      confirmar: 'Dar de baja',
      peligro: true,
    })
    if (si) revocar.mutate(e.id)
  }

  const activas = listado.data?.datos.filter((e) => e.activa) ?? []
  const dadasDeBaja = listado.data?.datos.filter((e) => !e.activa) ?? []

  return (
    <Shell
      titulo="Estaciones de fichaje"
      requiere={accesoDeRuta(contrato.fichaje.estaciones)}
      acciones={
        !alta ? (
          <Boton accion="global.nuevo" variante="principal" onClick={() => setAlta(true)}>
            Registrar una PC
          </Boton>
        ) : undefined
      }
    >
      {reciente && <TokenNuevo registro={reciente} alCerrar={() => setReciente(null)} />}

      {alta && (
        <Formulario
          alTerminar={(r) => {
            setAlta(false)
            if (r) setReciente(r)
          }}
        />
      )}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">Las PC que fichan</h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {listado.data ? `${activas.length} en servicio` : '…'}
          </span>
        </header>

        {listado.isPending && <Esqueleto />}
        {listado.isError && (
          <p role="alert" className="px-3 py-6 text-dato text-critico">
            {mensajeGeneral(listado.error)}
          </p>
        )}
        {listado.data && listado.data.datos.length === 0 && (
          <div className="grid justify-items-start gap-2 px-3 py-6">
            <p className="text-dato text-texto-suave">
              Todavía no hay ninguna. Registrá la PC del taller —la que tiene el lector al lado— y
              abrí en ella la dirección que sale acá.
            </p>
            <Boton variante="principal" onClick={() => setAlta(true)}>
              Registrar la primera
            </Boton>
          </div>
        )}

        {listado.data && listado.data.datos.length > 0 && esEscritorio && (
          <table className="w-full border-collapse text-dato">
            <thead>
              <tr>
                {['Nombre', 'Qué hace', 'Sucursal', 'Último escaneo', 'Estado', ''].map((c) => (
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
              {[...activas, ...dadasDeBaja].map((e) => (
                <tr key={e.id} className="hover:bg-superficie-2">
                  <td className="h-fila border-b border-borde-suave px-3 font-medium">
                    {e.nombre}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {QUE_ES[e.tipo]}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {e.sucursal ?? '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta text-texto-suave">
                    {e.ultimoVistoEn ? FECHA.format(new Date(e.ultimoVistoEn)) : 'Nunca'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <Estado activa={e.activa} />
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 py-1 text-right">
                    {e.activa && (
                      <Boton
                        tamano="chico"
                        variante="peligro"
                        icono={<IconoBorrar />}
                        onClick={() => void darDeBaja(e)}
                      >
                        Dar de baja
                      </Boton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {listado.data && listado.data.datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {[...activas, ...dadasDeBaja].map((e) => (
              <li key={e.id} className="grid gap-1 px-3 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{e.nombre}</span>
                  <span className="ml-auto">
                    <Estado activa={e.activa} />
                  </span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  {QUE_ES[e.tipo]}
                  {e.sucursal ? ` · ${e.sucursal}` : ''}
                </span>
                <span className="text-etiqueta text-texto-tenue">
                  Último escaneo:{' '}
                  {e.ultimoVistoEn ? FECHA.format(new Date(e.ultimoVistoEn)) : 'nunca'}
                </span>
                {e.activa && (
                  <div className="mt-1.5">
                    <Boton
                      tamano="chico"
                      variante="peligro"
                      icono={<IconoBorrar />}
                      onClick={() => void darDeBaja(e)}
                    >
                      Dar de baja
                    </Boton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

/**
 * La dirección con el token, que se muestra **una sola vez**.
 *
 * De la base sale su hash, así que ni nosotros la podemos volver a leer: si se pierde, se
 * registra la PC de nuevo. Es a propósito, y el aviso lo dice con todas las letras.
 */
function TokenNuevo({ registro, alCerrar }: { registro: Registro; alCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(registro.url)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <section
      role="status"
      className="grid gap-2 rounded-base border border-ok bg-superficie px-3 py-3"
    >
      <p className="text-dato">
        <b>{registro.estacion.nombre}</b> quedó registrada. Abrí esta dirección{' '}
        <b>en esa misma PC</b>: la pantalla se queda con el token y no lo vuelve a pedir.
      </p>
      <output className="w-full rounded-base border border-borde bg-superficie-2 px-3 py-1.5 font-mono text-etiqueta break-all select-all">
        {registro.url}
      </output>
      <p className="text-etiqueta text-atencion">
        No se vuelve a mostrar: de la base sale sólo su huella. Si se pierde, registrá la PC de
        nuevo.
      </p>
      <div className="flex gap-2">
        <Boton icono={<IconoCopiar />} onClick={() => void copiar()}>
          {copiado ? 'Copiada' : 'Copiar la dirección'}
        </Boton>
        <Boton variante="sutil" onClick={alCerrar}>
          Listo, ya la guardé
        </Boton>
      </div>
    </section>
  )
}

function Formulario({ alTerminar }: { alTerminar: (registro?: Registro) => void }) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const primerCampo = useRef<HTMLInputElement>(null)

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'taller' | 'reloj' | 'tablero'>('taller')
  const [sucursalId, setSucursalId] = useState<string | null>(null)

  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const sucursales = usarSesion((e) => e.datos?.sucursales ?? [])
  const unica = sucursales.length === 1 ? sucursales[0] : null
  useEffect(() => {
    if (unica && sucursalId === null) setSucursalId(unica.id)
  }, [unica, sucursalId])

  const guardar = useMutation({
    mutationFn: () => api.fichaje.registrarEstacion({ nombre, tipo, sucursalId: sucursalId ?? '' }),
    onSuccess: async (registro) => {
      await cache.invalidateQueries({ queryKey: ['estaciones', tenantId] })
      alTerminar(registro)
    },
    meta: { error: mensajeGeneral },
  })

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    if (!guardar.isPending && nombre.trim() && sucursalId) guardar.mutate()
  }

  return (
    <form
      onSubmit={enviar}
      aria-label="Registrar una estación de fichaje"
      className="grid gap-4 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">Registrar una PC</h2>

      <div className="grid gap-3 md:grid-cols-3">
        <Campo
          ref={primerCampo}
          etiqueta="Nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          ayuda="Dónde está: «Taller, al lado del elevador 2»"
        />
        <Selector
          etiqueta="Qué hace"
          valor={tipo}
          onChange={(v) => setTipo(v ?? 'taller')}
          opciones={TIPOS}
        />
        <Selector
          etiqueta="Sucursal"
          valor={sucursalId}
          vacio="Elegí una"
          onChange={setSucursalId}
          opciones={sucursales.map((s) => ({ valor: s.id, texto: s.nombre }))}
        />
      </div>

      <p className="text-etiqueta text-texto-suave">{QUE_HACE[tipo]}</p>

      <div className="flex flex-wrap gap-2">
        <Boton accion="global.guardar" variante="principal" onClick={() => enviar()}>
          Registrar
        </Boton>
        <Boton accion="global.cancelar" onClick={() => alTerminar()}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}

function Estado({ activa }: { activa: boolean }) {
  return activa ? (
    <span className="inline-flex rounded-full border border-ok px-2 text-etiqueta font-semibold text-ok">
      En servicio
    </span>
  ) : (
    <span className="text-etiqueta text-texto-tenue">Dada de baja</span>
  )
}

function Esqueleto() {
  return (
    <div className="grid gap-px p-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
      ))}
    </div>
  )
}
