import { accesoDeRuta, contrato } from '@gpb/contracts'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { BotonCopiar } from '../../componentes/Copiar.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import {
  CamposVehiculo,
  DATOS_VACIOS,
  type Datos,
  hoy,
  paraEnviar,
  problemas,
} from './datos-vehiculo.tsx'

// Por id y no importando la ruta: `rutas.tsx` importa esta pantalla, y el camino
// inverso armaría un ciclo. El id igual está tipado — uno que no existe no compila.
const ruta = getRouteApi('/con-sesion/vehiculos')

type Vehiculo = Awaited<ReturnType<typeof api.vehiculos.listar>>['datos'][number]

/**
 * El parque de vehículos de la concesionaria, contra la base de verdad.
 *
 * Cada usuario ve solamente los suyos, y el filtro no lo pone esta consulta sino Row Level
 * Security. Si mañana alguien escribe una consulta y se olvida de acotarla, no se filtran
 * datos ajenos — revienta.
 */
export function PantallaVehiculos() {
  const navegar = ruta.useNavigate()
  const inicial = ruta.useSearch({ select: (s) => s.buscar ?? '' })

  // Lo tipeado vive en estado local y la URL lo copia, no al revés. Si el campo leyera
  // directo de la URL, cada tecla esperaría a que el router termine de navegar y el
  // cursor saltaría al final en medio de una patente.
  const [buscar, setBuscarLocal] = useState(inicial)
  const [dandoDeAlta, setDandoDeAlta] = useState(false)
  const esEscritorio = useMedia(ES_ESCRITORIO)

  function setBuscar(valor: string) {
    setBuscarLocal(valor)
    // `replace`: una búsqueda no es un lugar al que se vuelve con Atrás. Sin esto, tipear
    // una patente dejaría siete entradas en el historial, una por letra.
    void navegar({ search: { buscar: valor || undefined }, replace: true })
  }
  const tenant = usarSesion((e) => e.datos?.tenant.nombre)
  const tenantId = usarSesion((e) => e.datos?.tenant.id)

  // Los dos permisos salen del mismo contrato que aplica la API: el listado decide si
  // la pantalla se dibuja, el alta si aparece el botón. Nada de repetir la regla acá.
  const puedeVer = usePuedeUsar(contrato.vehiculos.listar)
  const puedeCrear = usePuedeUsar(contrato.vehiculos.crear)

  const consulta = useQuery({
    // El tenant va en la clave aunque la caché ya se limpie al cambiar de usuario:
    // dos defensas para el mismo problema, porque el costo es una palabra y el error
    // se ve como una fuga de datos.
    queryKey: ['vehiculos', tenantId, buscar],
    queryFn: () => api.vehiculos.listar({ pagina: 1, porPagina: 50, buscar: buscar || undefined }),
    // Sin permiso no se pide: el 403 ya lo sabemos de antemano y el `Shell` va a mostrar
    // el aviso en lugar del listado.
    enabled: puedeVer,
  })

  const datos = consulta.data?.datos ?? []

  return (
    <Shell
      titulo="Vehículos"
      requiere={accesoDeRuta(contrato.vehiculos.listar)}
      acciones={
        puedeCrear && !dandoDeAlta ? (
          <Boton accion="global.nuevo" variante="principal" onClick={() => setDandoDeAlta(true)}>
            Nuevo vehículo
          </Boton>
        ) : undefined
      }
    >
      {dandoDeAlta && <FormAlta alTerminar={() => setDandoDeAlta(false)} />}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">Parque de {tenant}</h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {consulta.data ? `${consulta.data.total} vehículos` : '…'}
          </span>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Patente, chasis o titular"
            aria-label="Buscar"
            className="h-campo w-full rounded-base border border-borde bg-superficie-2 px-2.5 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca md:ml-auto md:w-64"
          />
        </header>

        {consulta.isPending && <Esqueleto />}

        {consulta.isError && (
          <p role="alert" className="px-3 py-6 text-dato text-critico">
            {mensajeDeError(consulta.error)}
          </p>
        )}

        {consulta.data?.datos.length === 0 && (
          <p className="px-3 py-8 text-center text-dato text-texto-suave">
            {buscar
              ? `Ningún vehículo coincide con «${buscar}».`
              : 'Todavía no hay vehículos cargados.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-dato">
              <thead>
                <tr>
                  {['Patente', 'Vehículo', 'Año', 'Titular', 'Chasis'].map((c) => (
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
                {datos.map((v) => (
                  <tr key={v.id} className="hover:bg-superficie-2">
                    <td className="h-fila border-b border-borde-suave px-3 py-1">
                      <EnlaceFicha vehiculo={v} />
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3">
                      {nombreVehiculo(v) ?? '—'}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 font-mono">
                      {v.anio ?? '—'}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                      {v.titular?.razonSocial ?? <SinTitular />}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta text-texto-suave">
                      <span className="inline-flex items-center gap-1">
                        {v.chasis}
                        <BotonCopiar valor={v.chasis} que="Chasis" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((v) => (
              <li key={v.id} className="grid gap-0.5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <EnlaceFicha vehiculo={v} />
                  <span className="ml-auto text-etiqueta text-texto-suave">
                    {[nombreVehiculo(v), v.anio].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  {v.titular?.razonSocial ?? <SinTitular />}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-etiqueta text-texto-tenue">
                  {v.chasis}
                  <BotonCopiar valor={v.chasis} que="Chasis" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

export function nombreVehiculo(v: { marca: string | null; modelo: string | null }) {
  return v.marca ? `${v.marca} ${v.modelo ?? ''}`.trim() : null
}

/** La chapa lleva a la ficha, y al lado, copiarla. */
function EnlaceFicha({ vehiculo }: { vehiculo: Vehiculo }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Link
        to="/vehiculos/$id"
        params={{ id: vehiculo.id }}
        className="inline-flex rounded-[3px] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Patente dominio={vehiculo.dominio} />
      </Link>
      {vehiculo.dominio && <BotonCopiar valor={vehiculo.dominio} que="Patente" />}
    </span>
  )
}

function FormAlta({ alTerminar }: { alTerminar: () => void }) {
  const cache = useQueryClient()
  const navegar = ruta.useNavigate()
  const primerCampo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const [chasis, setChasis] = useState('')
  const [datos, setDatos] = useState<Datos>(DATOS_VACIOS)
  const [titular, setTitular] = useState<ClienteElegido | null>(null)
  const [desde, setDesde] = useState(hoy())
  const [tocado, setTocado] = useState(false)

  const errores = tocado ? problemas(datos) : {}
  const chasisMal = tocado && !/^[A-HJ-NPR-Z0-9]{6,17}$/.test(chasis)

  const guardar = useMutation({
    mutationFn: () =>
      api.vehiculos.crear({
        chasis,
        ...paraEnviar(datos),
        titular: titular ? { clienteId: titular.id, desde } : null,
      }),
    onSuccess: async (creado) => {
      await cache.invalidateQueries({ queryKey: ['vehiculos'] })
      alTerminar()
      void navegar({ to: '/vehiculos/$id', params: { id: creado.id } })
    },
    meta: { exito: 'Vehículo dado de alta', error: mensajeDeGuardar },
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    setTocado(true)
    if (!/^[A-HJ-NPR-Z0-9]{6,17}$/.test(chasis) || Object.keys(problemas(datos)).length) return
    guardar.mutate()
  }

  return (
    <section
      aria-label="Nuevo vehículo"
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">Nuevo vehículo</h2>
      <form id="formulario-vehiculo" onSubmit={enviar} className="grid gap-3 md:grid-cols-3">
        <Campo
          ref={primerCampo}
          etiqueta="Chasis"
          required
          value={chasis}
          onChange={(e) => setChasis(e.target.value.toUpperCase().replace(/\s/g, ''))}
          aria-invalid={chasisMal}
          ayuda={
            chasisMal
              ? 'De 6 a 17 letras y números, sin I, O ni Q'
              : 'Es la identidad del vehículo: no se cambia después'
          }
        />
        <CamposVehiculo
          datos={datos}
          cambiar={(parcial) => setDatos((d) => ({ ...d, ...parcial }))}
          errores={errores}
        />
        <div className="md:col-span-2">
          <SelectorCliente etiqueta="Titular" valor={titular} onChange={setTitular} />
        </div>
        {titular ? (
          <Campo
            etiqueta="Titular desde"
            type="date"
            max={hoy()}
            required
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        ) : (
          <p className="self-end pb-2 text-etiqueta text-texto-tenue">
            Sin titular si está en stock.
          </p>
        )}
      </form>

      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={guardar.isPending}
          onClick={() =>
            (
              document.getElementById('formulario-vehiculo') as HTMLFormElement | null
            )?.requestSubmit()
          }
        >
          Guardar
        </Boton>
        <Boton accion="global.cancelar" onClick={alTerminar}>
          Cancelar
        </Boton>
      </div>
    </section>
  )
}

/** Un error al guardar dice qué hacer; la patente repetida, además, de qué vehículo es. */
export function mensajeDeGuardar(error: unknown): string {
  if (error instanceof ORPCError) {
    if (error.code === 'DOMINIO_DUPLICADO') {
      const chasis = (error.data as { chasis?: string } | undefined)?.chasis
      return `Esa patente ya la tiene el vehículo con chasis ${chasis}. Revisá cuál de los dos está mal.`
    }
    return error.message
  }
  return 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'
}

/**
 * Un error dice qué hacer. «Probá refrescar» es un buen consejo ante un corte de red y
 * uno malo ante un permiso: refrescar no le da permisos a nadie, y quien lo intenta
 * cinco veces termina pensando que el sistema está roto.
 */
function mensajeDeError(error: Error): string {
  if (error instanceof ORPCError && error.code === 'SIN_PERMISO') return error.message
  return 'No se pudo traer el listado. Probá refrescar con F5.'
}

/** Un 0km existe con chasis desde que la terminal lo factura, y sin chapa por semanas. */
function SinTitular() {
  return <span className="text-etiqueta text-texto-tenue">sin titular</span>
}

/** Esqueletos con la forma de lo que viene, no un spinner que hace saltar la pantalla. */
function Esqueleto() {
  return (
    <div className="grid gap-px p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
      ))}
    </div>
  )
}
