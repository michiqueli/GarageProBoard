import { accesoDeRuta, contrato } from '@gpb/contracts'
import { ORPCError } from '@orpc/client'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoEditar } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { formatearDominio, formatearFecha } from '../vehiculos/datos-vehiculo.tsx'
import { Formulario, formatearDocumento, IIBB, Marcas, nombreTipo } from './PantallaClientes.tsx'

const ruta = getRouteApi('/con-sesion/clientes/$id')

/**
 * La ficha de un cliente: sus datos, los vehículos que tiene y los que tuvo, y lo que se
 * le cambió.
 *
 * Los vehículos se piden aparte y sólo si quien mira puede ver vehículos: el repuestero
 * atiende clientes en el mostrador, pero el parque no es asunto suyo.
 */
export function PantallaFichaCliente() {
  const { id } = ruta.useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.clientes.ficha)
  const puedeEditar = usePuedeUsar(contrato.clientes.editar)
  const puedeVerVehiculos = usePuedeUsar(contrato.vehiculos.delCliente)
  const [modificando, setModificando] = useState(false)

  const consulta = useQuery({
    queryKey: ['clientes', tenantId, 'ficha', id],
    queryFn: () => api.clientes.ficha({ id }),
    enabled: puedeVer,
  })
  const catalogos = useQuery({
    queryKey: ['catalogos', 'organizacion'],
    queryFn: () => api.organizacion.catalogos(),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: puedeVer,
  })
  const vehiculos = useQuery({
    queryKey: ['vehiculos', tenantId, 'del-cliente', id],
    queryFn: () => api.vehiculos.delCliente({ clienteId: id }),
    enabled: puedeVerVehiculos,
  })

  const c = consulta.data
  const condicion = catalogos.data?.condicionesIva.find((x) => x.codigo === c?.condicionIva)
  const provincia = catalogos.data?.provincias.find((x) => x.codigo === c?.provinciaCodigo)
  const actuales = vehiculos.data?.datos.filter((v) => !v.hasta) ?? []
  const anteriores = vehiculos.data?.datos.filter((v) => v.hasta) ?? []

  return (
    <Shell titulo={c?.razonSocial ?? 'Cliente'} requiere={accesoDeRuta(contrato.clientes.ficha)}>
      <Link to="/clientes" className="w-fit text-etiqueta text-marca hover:underline">
        ← Todos los clientes
      </Link>

      {consulta.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}

      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {consulta.error instanceof ORPCError && consulta.error.code === 'NO_ENCONTRADO'
            ? 'Ese cliente no existe. Puede ser un enlace viejo: buscalo desde el listado.'
            : consulta.error instanceof ORPCError && consulta.error.code === 'SIN_PERMISO'
              ? consulta.error.message
              : 'No se pudo traer la ficha. Probá refrescar con F5.'}
        </p>
      )}

      {c && modificando && catalogos.data && (
        <Formulario
          cliente={c}
          catalogos={catalogos.data}
          alTerminar={() => setModificando(false)}
        />
      )}

      {c && (
        <div className="grid gap-3 md:grid-cols-2">
          <Seccion
            titulo="Datos"
            accion={
              puedeEditar && !modificando ? (
                <Boton tamano="chico" icono={<IconoEditar />} onClick={() => setModificando(true)}>
                  Modificar
                </Boton>
              ) : undefined
            }
          >
            <div className="flex flex-wrap gap-2 px-3 pt-2.5">
              <Marcas cliente={c} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3 py-2.5 text-dato">
              <Dato nombre={nombreTipo(c.tipoDocumento)} mono>
                {formatearDocumento(c.tipoDocumento, c.numeroDocumento)}
              </Dato>
              <Dato nombre="Condición frente al IVA">{condicion?.descripcion}</Dato>
              <Dato nombre="Domicilio">
                {[c.domicilio, c.localidad, provincia?.nombre, c.codigoPostal]
                  .filter(Boolean)
                  .join(', ')}
              </Dato>
              <Dato nombre="Teléfono">{c.telefono}</Dato>
              <Dato nombre="Correo">{c.email}</Dato>
              <Dato nombre="Ingresos Brutos">
                {[IIBB[c.condicionIibb], c.numeroIibb].filter(Boolean).join(' · ')}
              </Dato>
              <Dato nombre="Observaciones">{c.observaciones}</Dato>
            </dl>
          </Seccion>

          {puedeVerVehiculos && (
            <Seccion titulo="Vehículos">
              {vehiculos.isPending && (
                <div className="m-3 h-16 animate-pulse rounded-base bg-superficie-2" />
              )}
              {vehiculos.isError && (
                <p role="alert" className="px-3 py-4 text-dato text-critico">
                  No se pudieron traer sus vehículos. Probá refrescar con F5.
                </p>
              )}
              {vehiculos.data?.datos.length === 0 && (
                <p className="px-3 py-4 text-dato text-texto-suave">
                  No tiene vehículos a su nombre. Se le asignan desde la ficha de cada vehículo.
                </p>
              )}
              {actuales.length > 0 && <ListaVehiculos titulo="A su nombre" vehiculos={actuales} />}
              {anteriores.length > 0 && <ListaVehiculos titulo="Tuvo" vehiculos={anteriores} />}
            </Seccion>
          )}

          <section
            aria-label="Historia"
            className="overflow-hidden rounded-base border border-borde bg-superficie md:col-span-2"
          >
            <header className="border-b border-borde px-3 py-2">
              <h2 className="font-display text-dato font-semibold">Historia</h2>
            </header>
            <ol className="divide-y divide-borde-suave">
              {c.historia.map((h) => (
                <li
                  key={`${h.fecha}-${h.detalle}`}
                  className="grid gap-0.5 px-3 py-2 md:grid-cols-[9rem_1fr_auto] md:gap-3"
                >
                  <span className="font-mono text-etiqueta text-texto-tenue">
                    {new Date(h.fecha).toLocaleString('es-AR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                  <span className="text-dato">{h.detalle}</span>
                  <span className="text-etiqueta text-texto-suave">{h.autor ?? '—'}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Shell>
  )
}

type VehiculoDelCliente = Awaited<ReturnType<typeof api.vehiculos.delCliente>>['datos'][number]

function ListaVehiculos({
  titulo,
  vehiculos,
}: {
  titulo: string
  vehiculos: VehiculoDelCliente[]
}) {
  return (
    <section aria-label={titulo}>
      <h3 className="px-3 pt-2.5 text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase">
        {titulo}
      </h3>
      <ul className="divide-y divide-borde-suave">
        {vehiculos.map((v) => (
          <li
            key={`${v.id}-${v.desde}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2"
          >
            <Link
              to="/vehiculos/$id"
              params={{ id: v.id }}
              className="font-mono text-dato text-marca hover:underline focus-visible:underline"
            >
              {v.dominio ? formatearDominio(v.dominio) : 'sin patentar'}
            </Link>
            <span className="text-dato">
              {[v.marca && `${v.marca} ${v.modelo ?? ''}`.trim(), v.anio]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className="ml-auto text-etiqueta text-texto-tenue">
              {v.hasta
                ? `Del ${formatearFecha(v.desde)} al ${formatearFecha(v.hasta)}`
                : `Desde el ${formatearFecha(v.desde)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Seccion({
  titulo,
  accion,
  children,
}: {
  titulo: string
  accion?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-label={titulo}
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="flex items-baseline gap-2 border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">{titulo}</h2>
        {accion && <span className="ml-auto">{accion}</span>}
      </header>
      {children}
    </section>
  )
}

function Dato({ nombre, mono, children }: { nombre: string; mono?: boolean; children: ReactNode }) {
  return (
    <>
      <dt className="text-etiqueta text-texto-tenue">{nombre}</dt>
      <dd className={mono ? 'font-mono' : ''}>
        {children || <span className="text-texto-tenue">—</span>}
      </dd>
    </>
  )
}
