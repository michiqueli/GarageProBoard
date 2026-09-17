import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearCuit } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { BotonCopiar, copiarConAviso } from '../../componentes/Copiar.tsx'
import { IconoEditar, IconoTransferir, IconoVolver } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo, useVolver } from '../../teclado/index.ts'
import {
  CamposVehiculo,
  COMBUSTIBLE,
  type Datos,
  formatearDominio,
  formatearFecha,
  hoy,
  paraEnviar,
  problemas,
} from './datos-vehiculo.tsx'
import { mensajeDeGuardar, nombreVehiculo } from './PantallaVehiculos.tsx'

const ruta = getRouteApi('/con-sesion/vehiculos/$id')

type Ficha = Awaited<ReturnType<typeof api.vehiculos.ficha>>

/** Qué se está haciendo. Uno por vez: el formulario abierto es el único lugar de F2 y Esc. */
type Edicion = null | 'datos' | 'transferir'

/**
 * La ficha de un vehículo: sus datos, quién lo tiene, quiénes lo tuvieron y qué se le
 * cambió.
 *
 * Los titulares anteriores están a la vista y no escondidos en un historial: cuando
 * existan las órdenes de trabajo, la pregunta «¿de quién era cuando se le hizo esto?» se
 * contesta mirando esta lista.
 */
export function PantallaFichaVehiculo() {
  const irAlListado = useNavigate()
  // Esc o ⌫, sin estar escribiendo, vuelven a donde se venía.
  useVolver(() => void irAlListado({ to: '/vehiculos' }))
  const { id } = ruta.useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.vehiculos.ficha)
  const puedeEditar = usePuedeUsar(contrato.vehiculos.editar)
  const [edicion, setEdicion] = useState<Edicion>(null)
  const historia = useRef<HTMLElement>(null)

  const consulta = useQuery({
    queryKey: ['vehiculos', tenantId, 'ficha', id],
    queryFn: () => api.vehiculos.ficha({ id }),
    enabled: puedeVer,
  })
  const f = consulta.data

  // Copiar el chasis para pegarlo en el buscador de repuestos es de lo que más se hace en
  // el mostrador: va con tecla, sin buscar el botón con el mouse.
  useAtajo('vehiculos.copiarChasis', () => f && void copiarConAviso(f.chasis, 'Chasis'), Boolean(f))
  useAtajo(
    'vehiculos.copiarPatente',
    () => f?.dominio && void copiarConAviso(f.dominio, 'Patente'),
    Boolean(f?.dominio),
  )

  const titulo = f
    ? [f.dominio ? formatearDominio(f.dominio) : 'Sin patentar', nombreVehiculo(f)]
        .filter(Boolean)
        .join(' · ')
    : 'Vehículo'

  return (
    <Shell
      titulo={titulo}
      requiere={accesoDeRuta(contrato.vehiculos.ficha)}
      acciones={
        f && !edicion ? (
          <>
            <Boton
              accion="vehiculos.historial"
              onClick={() => {
                historia.current?.scrollIntoView({ block: 'start' })
                historia.current?.focus()
              }}
            >
              Historia
            </Boton>
            {puedeEditar && (
              <Boton
                accion="vehiculos.transferir"
                icono={<IconoTransferir />}
                onClick={() => setEdicion('transferir')}
              >
                {f.titular ? 'Transferir' : 'Asignar titular'}
              </Boton>
            )}
          </>
        ) : undefined
      }
    >
      {/* Un enlace con forma de botón: sigue abriéndose en otra pestaña con el clic del medio. */}
      <Link to="/vehiculos" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todos los vehículos
      </Link>

      {consulta.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}

      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {consulta.error instanceof ORPCError && consulta.error.code === 'NO_ENCONTRADO'
            ? 'Ese vehículo no existe. Puede ser un enlace viejo: buscalo desde el listado.'
            : consulta.error instanceof ORPCError && consulta.error.code === 'SIN_PERMISO'
              ? consulta.error.message
              : 'No se pudo traer la ficha. Probá refrescar con F5.'}
        </p>
      )}

      {f && edicion === 'transferir' && (
        <FormTransferir ficha={f} alTerminar={() => setEdicion(null)} />
      )}
      {f && edicion === 'datos' && <FormDatos ficha={f} alTerminar={() => setEdicion(null)} />}

      {f && (
        <div className="grid gap-3 md:grid-cols-2">
          <Seccion
            titulo="Datos"
            accion={
              puedeEditar && !edicion ? (
                <Boton tamano="chico" icono={<IconoEditar />} onClick={() => setEdicion('datos')}>
                  Modificar
                </Boton>
              ) : undefined
            }
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3 py-2.5 text-dato">
              <Dato nombre="Patente">
                <span className="inline-flex items-center gap-1.5">
                  <Patente dominio={f.dominio} tamano="grande" />
                  {f.dominio && <BotonCopiar valor={f.dominio} que="Patente" />}
                </span>
              </Dato>
              <Dato nombre="Chasis" mono>
                <span className="inline-flex items-center gap-1">
                  {f.chasis}
                  <BotonCopiar valor={f.chasis} que="Chasis" />
                </span>
              </Dato>
              <Dato nombre="Marca y modelo">{nombreVehiculo(f)}</Dato>
              <Dato nombre="Año" mono>
                {f.anio}
              </Dato>
              <Dato nombre="Color">{f.color}</Dato>
              <Dato nombre="Combustible">{f.combustible && COMBUSTIBLE[f.combustible]}</Dato>
              <Dato nombre="Motor" mono>
                {f.motor}
              </Dato>
              <Dato nombre="Kilómetros" mono>
                {f.kilometraje?.toLocaleString('es-AR')}
              </Dato>
              <Dato nombre="Observaciones">{f.observaciones}</Dato>
            </dl>
          </Seccion>

          <Seccion titulo="Titulares">
            {f.titulares.length === 0 ? (
              <p className="px-3 py-4 text-dato text-texto-suave">
                Sin titular: está en stock o todavía no se cargó de quién es.
                {puedeEditar && ' Asignalo con el botón de arriba.'}
              </p>
            ) : (
              <ul className="divide-y divide-borde-suave">
                {f.titulares.map((t) => (
                  <li key={t.id} className="grid gap-0.5 px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`text-dato ${t.hasta ? 'text-texto-suave' : 'font-semibold'}`}
                      >
                        <Link
                          to="/clientes/$id"
                          params={{ id: t.cliente.id }}
                          className="hover:text-marca hover:underline focus-visible:underline"
                        >
                          {t.cliente.razonSocial}
                        </Link>
                      </span>
                      {!t.hasta && (
                        <span className="rounded-full border border-ok px-2 text-etiqueta font-semibold text-ok">
                          Actual
                        </span>
                      )}
                      <span className="ml-auto font-mono text-etiqueta text-texto-tenue">
                        {t.cliente.tipoDocumento === 96
                          ? t.cliente.numeroDocumento
                          : formatearCuit(t.cliente.numeroDocumento)}
                      </span>
                    </div>
                    <span className="text-etiqueta text-texto-tenue">
                      {t.hasta
                        ? `Del ${formatearFecha(t.desde)} al ${formatearFecha(t.hasta)}`
                        : `Desde el ${formatearFecha(t.desde)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <section
            ref={historia}
            tabIndex={-1}
            aria-label="Historia"
            className="overflow-hidden rounded-base border border-borde bg-superficie outline-none focus-visible:border-marca md:col-span-2"
          >
            <header className="border-b border-borde px-3 py-2">
              <h2 className="font-display text-dato font-semibold">Historia</h2>
            </header>
            <ol className="divide-y divide-borde-suave">
              {f.historia.map((h) => (
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
            <p className="border-t border-borde-suave px-3 py-2 text-etiqueta text-texto-tenue">
              Las órdenes de trabajo se van a sumar a esta historia cuando esté el taller.
            </p>
          </section>
        </div>
      )}
    </Shell>
  )
}

function FormDatos({ ficha, alTerminar }: { ficha: Ficha; alTerminar: () => void }) {
  const cache = useQueryClient()
  const [datos, setDatos] = useState<Datos>({
    dominio: ficha.dominio ?? '',
    marca: ficha.marca ?? '',
    modelo: ficha.modelo ?? '',
    anio: ficha.anio ? String(ficha.anio) : '',
    color: ficha.color ?? '',
    motor: ficha.motor ?? '',
    combustible: ficha.combustible,
    kilometraje: ficha.kilometraje !== null ? String(ficha.kilometraje) : '',
    observaciones: ficha.observaciones ?? '',
  })
  const [tocado, setTocado] = useState(false)
  const errores = tocado ? problemas(datos) : {}

  const guardar = useMutation({
    mutationFn: () => api.vehiculos.editar({ id: ficha.id, ...paraEnviar(datos) }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['vehiculos'] })
      alTerminar()
    },
    meta: { exito: 'Datos del vehículo guardados', error: mensajeDeGuardar },
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    setTocado(true)
    if (Object.keys(problemas(datos)).length === 0) guardar.mutate()
  }

  return (
    <Formulario
      titulo="Modificar los datos"
      id="formulario-datos"
      onSubmit={enviar}
      error={null}
      ocupado={guardar.isPending}
      alTerminar={alTerminar}
    >
      <Campo
        etiqueta="Chasis"
        disabled
        value={ficha.chasis}
        ayuda="Es la identidad del vehículo: no se cambia"
      />
      <CamposVehiculo
        datos={datos}
        cambiar={(parcial) => setDatos((d) => ({ ...d, ...parcial }))}
        errores={errores}
      />
    </Formulario>
  )
}

function FormTransferir({ ficha, alTerminar }: { ficha: Ficha; alTerminar: () => void }) {
  const cache = useQueryClient()
  const [nuevo, setNuevo] = useState<ClienteElegido | null>(null)
  const [desde, setDesde] = useState(hoy())
  const [faltaCliente, setFaltaCliente] = useState(false)
  const actual = ficha.titulares.find((t) => !t.hasta)

  const guardar = useMutation({
    mutationFn: (clienteId: string) => api.vehiculos.transferir({ id: ficha.id, clienteId, desde }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['vehiculos'] })
      alTerminar()
    },
    meta: {
      exito: () =>
        actual
          ? `Vehículo transferido a ${nuevo?.razonSocial}`
          : `Titular asignado: ${nuevo?.razonSocial}`,
      error: (e) => {
        if (e instanceof ORPCError && e.code === 'FECHA_ANTERIOR') {
          const d = (e.data as { desde: string }).desde
          return `${actual?.cliente.razonSocial ?? 'El titular actual'} lo tiene desde el ${formatearFecha(d)}: la fecha tiene que ser ésa o posterior.`
        }
        return mensajeDeGuardar(e)
      },
    },
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    setFaltaCliente(!nuevo)
    if (nuevo) guardar.mutate(nuevo.id)
  }

  // Lo que falta completar va en el formulario; lo que rechazó el servidor, en una notificación.
  const error = faltaCliente && !nuevo ? 'Elegí a quién pasa el vehículo.' : null

  return (
    <Formulario
      titulo={actual ? `Transferir: hoy es de ${actual.cliente.razonSocial}` : 'Asignar titular'}
      id="formulario-transferir"
      onSubmit={enviar}
      error={error}
      ocupado={guardar.isPending}
      alTerminar={alTerminar}
    >
      <div className="md:col-span-2">
        <SelectorCliente etiqueta="Nuevo titular" valor={nuevo} onChange={setNuevo} autoFocus />
      </div>
      <Campo
        etiqueta="Desde"
        type="date"
        required
        max={hoy()}
        min={actual?.desde}
        value={desde}
        onChange={(e) => setDesde(e.target.value)}
        ayuda={actual ? 'Ese mismo día termina la titularidad actual' : undefined}
      />
    </Formulario>
  )
}

function Formulario({
  titulo,
  id,
  onSubmit,
  error,
  ocupado,
  alTerminar,
  children,
}: {
  titulo: string
  id: string
  onSubmit: (e: FormEvent) => void
  error: string | null
  ocupado: boolean
  alTerminar: () => void
  children: ReactNode
}) {
  return (
    <section
      aria-label={titulo}
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">{titulo}</h2>
      <form id={id} onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
        {children}
      </form>
      {error && (
        <p role="alert" className="text-dato text-critico">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={ocupado}
          onClick={() => (document.getElementById(id) as HTMLFormElement | null)?.requestSubmit()}
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
