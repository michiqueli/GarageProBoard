import { accesoDeRuta, contrato } from '@gpb/contracts'
import { ORPCError } from '@orpc/client'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { BotonCopiar, copiarConAviso } from '../../componentes/Copiar.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { Patente } from '../../componentes/Patente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo, useFilasConTeclado } from '../../teclado/index.ts'
import { AltaVehiculo, mensajeDeGuardar } from './AltaVehiculo.tsx'

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
  // ↑ ↓ marcan una fila y Enter la abre, también desde el buscador.
  const { activa, propsFila } = useFilasConTeclado(
    datos,
    (x) => void navegar({ to: '/vehiculos/$id', params: { id: x.id } }),
  )
  // Alt+C y Alt+P copian el chasis y la patente de la fila marcada, sin entrar a la ficha.
  const marcado = activa === null ? undefined : datos[activa]
  useAtajo(
    'vehiculos.copiarChasis',
    () => marcado && void copiarConAviso(marcado.chasis, 'Chasis'),
    Boolean(marcado),
  )
  useAtajo(
    'vehiculos.copiarPatente',
    () => marcado?.dominio && void copiarConAviso(marcado.dominio, 'Patente'),
    Boolean(marcado?.dominio),
  )

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
            data-lista
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
                {datos.map((v, i) => (
                  <tr
                    key={v.id}
                    {...propsFila(i)}
                    className={FILA_CLICABLE}
                    onClick={clicEnFila(
                      () => void navegar({ to: '/vehiculos/$id', params: { id: v.id } }),
                    )}
                  >
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
            {datos.map((v, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se entra por el enlace de la fila
              <li
                key={v.id}
                {...propsFila(i)}
                className={`grid gap-0.5 px-3 py-2.5 ${FILA_CLICABLE}`}
                onClick={clicEnFila(
                  () => void navegar({ to: '/vehiculos/$id', params: { id: v.id } }),
                )}
              >
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
  const navegar = ruta.useNavigate()
  return (
    <AltaVehiculo
      alCancelar={alTerminar}
      alCrear={(creado) => {
        alTerminar()
        void navegar({ to: '/vehiculos/$id', params: { id: creado.id } })
      }}
    />
  )
}

export { mensajeDeGuardar }

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
