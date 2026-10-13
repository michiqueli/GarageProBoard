import { accesoDeRuta, contrato } from '@gpb/contracts'
import { DANIOS, ELEMENTOS_INVENTARIO, INVENTARIO } from '@gpb/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoImprimir } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { SelectorVehiculo } from '../../componentes/SelectorVehiculo.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar, useVeredicto } from '../../sesion/permisos.ts'
import { salir } from '../../sesion/salir.ts'
import { ColaTablet } from '../recepcion/ColaTablet.tsx'
import { AltaVehiculo } from '../vehiculos/AltaVehiculo.tsx'
import { pareceDominio } from '../vehiculos/datos-vehiculo.tsx'
import { DiagramaDanios, describirDanio, ElegirCarroceria } from './DiagramaDanios.tsx'
import { InventarioRecepcion } from './InventarioRecepcion.tsx'
import { COMBUSTIBLES, imprimirOrden, nombreOrden } from './ordenes.ts'
import { ElegirCombustible, Texto } from './PantallaRecepcion.tsx'
import { PendientesDelVehiculo } from './PendientesDelVehiculo.tsx'
import { type PuntoRevisado, RevisionRecepcion } from './RevisionRecepcion.tsx'
import { type OrdenAbierta, useRecepcion } from './useRecepcion.ts'

const PASOS = [
  { id: 'vehiculo', titulo: 'Vehículo' },
  { id: 'personas', titulo: 'Quién' },
  { id: 'pedido', titulo: 'Qué pide' },
  { id: 'estado', titulo: 'Cómo está' },
  { id: 'inventario', titulo: 'Qué trae' },
  { id: 'revision', titulo: 'Revisión' },
  { id: 'revisar', titulo: 'Repasar' },
] as const
type Paso = (typeof PASOS)[number]['id']

/**
 * La recepción en tablet: el mostrador con el cliente parado adelante.
 *
 * **Es el mismo flujo que la de escritorio, en otra vista** —ver
 * `docs/tecnicos/recepcion-en-tablet.md`—: los datos, lo que falta y cómo se abre la orden
 * viven en `useRecepcion`, que usan las dos. Lo que cambia es la forma: un paso por pantalla,
 * objetivos de 44px para el dedo y el auto dibujado grande, que en una tablet es lo que más se
 * usa, porque se da la vuelta al auto con ella en la mano.
 *
 * No usa el armazón del sistema: en una tablet, el menú lateral y la barra de teclas F ocupan
 * lugar y no sirven. Pero pide el mismo permiso que la de escritorio, que es el que aplica
 * la API al abrir la orden.
 *
 * **Arranca en la cola** —quién espera para el taller, ver `docs/tecnicos/recepcion-y-turnos.md`—
 * si quien la usa puede ver la puerta. Si no, directo al primer paso, como antes.
 *
 * Registrada como estación de recepción, la tablet arranca acá: se entra con la credencial
 * —`EntradaTablet`— y la sesión se cierra sola a los quince minutos sin tocarla. Lo que falta
 * de lo decidido en ese documento son las fotos y la firma en pantalla.
 */
export function PantallaRecepcionTablet() {
  const veredicto = useVeredicto(accesoDeRuta(contrato.ordenes.abrir))
  const [abierta, setAbierta] = useState<OrdenAbierta | null>(null)
  const [paso, setPaso] = useState<Paso>('vehiculo')
  const [intento, setIntento] = useState<Partial<Record<Paso, boolean>>>({})
  const r = useRecepcion(setAbierta)
  const { datos: d, poner } = r
  const conCola = usePuedeUsar(contrato.recepcion.hoy)
  /** Lo buscado que no estaba, mientras se da de alta el auto. */
  const [alta, setAlta] = useState<string | null>(null)
  const [enCola, setEnCola] = useState(true)
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()

  /** Devolverla a la cola: vuelve a esperar, y la tablet vuelve a la lista. */
  const soltar = useMutation({
    mutationFn: (id: string) => api.recepcion.soltar({ id }),
    onSettled: () => cache.invalidateQueries({ queryKey: ['visitas', tenantId] }),
    onSuccess: () => {
      r.empezarOtra()
      setIntento({})
      setPaso('vehiculo')
      setEnCola(true)
    },
    meta: { exito: 'Volvió a la cola', error: mensajeGeneral },
  })
  const cuerpo = useRef<HTMLElement>(null)

  const indice = PASOS.findIndex((p) => p.id === paso)
  const faltaEn: Partial<Record<Paso, string>> = {
    ...(d.vehiculo ? {} : { vehiculo: 'Elegí el vehículo que entra.' }),
    ...(d.pedido.trim().length >= 3
      ? {}
      : { pedido: 'Anotá qué pide el cliente, con sus palabras.' }),
  }

  // Al cambiar de paso, arriba de todo y con el foco en el paso: en una tablet no hay otra
  // forma de saber que cambió la pantalla si el paso nuevo es más corto que el anterior.
  // Al entrar no: ahí el foco es de la patente.
  const primerPaso = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: se mueve cuando cambia el paso
  useEffect(() => {
    if (primerPaso.current) {
      primerPaso.current = false
      return
    }
    cuerpo.current?.scrollIntoView?.({ block: 'start' })
    cuerpo.current?.focus({ preventScroll: true })
  }, [paso])

  function ir(destino: Paso) {
    setPaso(destino)
  }

  function siguiente() {
    if (faltaEn[paso]) {
      setIntento((i) => ({ ...i, [paso]: true }))
      return
    }
    const proximo = PASOS[indice + 1]
    if (proximo) ir(proximo.id)
  }

  function abrir() {
    const falta = r.enviar()
    if (falta) {
      setIntento((i) => ({ ...i, [falta]: true }))
      ir(falta)
    }
  }

  function otra() {
    r.empezarOtra()
    setAbierta(null)
    setIntento({})
    ir('vehiculo')
    setEnCola(true)
  }

  if (veredicto !== 'permitido') {
    return (
      <Marco>
        <section className="grid justify-items-center gap-3 rounded-base border border-borde bg-superficie px-4 py-10 text-center">
          <h1 className="font-display text-ui font-semibold">
            {veredicto === 'modulo-apagado'
              ? 'La recepción no está habilitada en la concesionaria'
              : 'No tenés permiso para recibir vehículos'}
          </h1>
          <p className="max-w-sm text-dato text-texto-suave">
            Pedíselo a quien administra los usuarios de la concesionaria.
          </p>
          <Link
            to="/"
            className="flex h-campo items-center rounded-base border border-marca bg-marca-suave px-4 font-semibold text-dato text-marca"
          >
            Ir al inicio
          </Link>
        </section>
      </Marco>
    )
  }

  if (conCola && enCola && !abierta) {
    return (
      <Marco>
        <ColaTablet
          alElegir={(v) => {
            r.desdeVisita(v)
            setIntento({})
            setPaso('vehiculo')
            setEnCola(false)
          }}
          sinTurno={() => {
            r.empezarOtra()
            setIntento({})
            setPaso('vehiculo')
            setEnCola(false)
          }}
        />
      </Marco>
    )
  }

  if (abierta) {
    return (
      <Marco>
        <section
          aria-label="Orden abierta"
          className="grid justify-items-center gap-4 rounded-base border border-borde bg-superficie px-4 py-10 text-center"
        >
          <p className="text-etiqueta font-semibold text-ok">Orden abierta</p>
          <h1 className="font-display text-3xl font-bold tabular">{nombreOrden(abierta.numero)}</h1>
          {abierta.vehiculo.dominio && <Patente dominio={abierta.vehiculo.dominio} />}
          <p className="max-w-md text-dato text-texto-suave">
            Imprimila para que el cliente firme la copia con el estado del vehículo, y la del taller
            vaya con el auto.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Boton
              variante="principal"
              icono={<IconoImprimir />}
              onClick={() => void imprimirOrden(abierta.id)}
            >
              Imprimir la orden
            </Boton>
            <Boton onClick={otra}>{conCola ? 'Volver a la cola' : 'Recibir otro vehículo'}</Boton>
            <Link
              to="/ordenes/$id"
              params={{ id: abierta.id }}
              className="inline-flex h-campo items-center rounded-base border border-borde px-3 text-dato text-texto-suave"
            >
              Ver la orden
            </Link>
          </div>
        </section>
      </Marco>
    )
  }

  return (
    <Marco>
      {d.visita && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-base border border-marca bg-marca-suave px-4 py-2">
          <span className="font-mono font-bold">{d.visita.numero}</span>
          <span className="text-dato">{d.traeNombre || 'Sin nombre'}</span>
          <span className="ml-auto">
            <Boton
              variante="sutil"
              deshabilitado={soltar.isPending}
              onClick={() => d.visita && soltar.mutate(d.visita.id)}
            >
              Devolver a la cola
            </Boton>
          </span>
        </div>
      )}
      <nav aria-label="Pasos de la recepción">
        <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {PASOS.map((p, i) => {
            const actual = p.id === paso
            const hecho = i < indice
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => ir(p.id)}
                  aria-current={actual ? 'step' : undefined}
                  className={`flex h-campo w-full items-center gap-2 rounded-base border px-2.5 text-etiqueta ${
                    actual
                      ? 'border-marca bg-marca-suave font-semibold text-texto'
                      : 'border-borde text-texto-suave'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${
                      actual
                        ? 'border-marca text-marca'
                        : hecho
                          ? 'border-ok text-ok'
                          : 'border-borde'
                    }`}
                  >
                    {hecho ? '✓' : i + 1}
                  </span>
                  <span className="truncate">{p.titulo}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <section
        ref={cuerpo}
        tabIndex={-1}
        aria-label={PASOS[indice]?.titulo}
        className="grid gap-4 rounded-base border border-borde bg-superficie p-4 outline-none"
      >
        {paso === 'vehiculo' && (
          <>
            <Titulo>¿Qué vehículo entra?</Titulo>
            <div className="grid gap-1">
              {alta === null ? (
                <SelectorVehiculo
                  key={d.visita?.id ?? 'sin-visita'}
                  etiqueta="Patente o chasis"
                  valor={d.vehiculo}
                  onChange={r.elegirVehiculo}
                  inicial={d.dominioSugerido}
                  alNoEncontrar={setAlta}
                  autoFocus
                />
              ) : (
                <AltaVehiculo
                  dominio={pareceDominio(alta)}
                  alCrear={(v) => {
                    r.elegirVehiculo(v)
                    setAlta(null)
                  }}
                  alCancelar={() => setAlta(null)}
                />
              )}
              {intento.vehiculo && faltaEn.vehiculo && <Falta>{faltaEn.vehiculo}</Falta>}
              {d.vehiculo && (
                <span className="text-etiqueta text-texto-suave">
                  Titular: {d.vehiculo.titular?.razonSocial ?? 'sin titular cargado'}
                </span>
              )}
            </div>
            <SelectorCliente etiqueta="Paga" valor={d.paga} onChange={(v) => poner('paga', v)} />
            <PendientesDelVehiculo
              pendientes={r.pendientes}
              elegidos={d.pendienteIds}
              alternar={r.alternarPendiente}
            />
          </>
        )}

        {paso === 'personas' && (
          <>
            <Titulo>¿Quién lo trae y quién autoriza?</Titulo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Lo trae"
                value={d.traeNombre}
                onChange={(e) => poner('traeNombre', e.target.value)}
                ayuda="Si no es el titular"
              />
              <Campo
                etiqueta="Teléfono de quien lo trae"
                inputMode="tel"
                value={d.traeTelefono}
                onChange={(e) => poner('traeTelefono', e.target.value)}
              />
              <Campo
                etiqueta="Quién autoriza"
                value={d.autorizaNombre}
                onChange={(e) => poner('autorizaNombre', e.target.value)}
                ayuda="A quién se le consultan los presupuestos"
              />
              <Campo
                etiqueta="Teléfono de quien autoriza"
                inputMode="tel"
                value={d.autorizaTelefono}
                onChange={(e) => poner('autorizaTelefono', e.target.value)}
              />
            </div>
          </>
        )}

        {paso === 'pedido' && (
          <>
            <Titulo>¿Qué pide el cliente?</Titulo>
            <Texto
              etiqueta="Qué pide el cliente"
              valor={d.pedido}
              onChange={(v) => poner('pedido', v)}
              filas={5}
              invalido={Boolean(intento.pedido && faltaEn.pedido)}
              ayuda={
                intento.pedido && faltaEn.pedido
                  ? faltaEn.pedido
                  : 'Con sus palabras: «hace ruido al frenar»'
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Entrega estimada"
                type="date"
                value={d.entregaEstimada}
                onChange={(e) => poner('entregaEstimada', e.target.value)}
              />
            </div>
          </>
        )}

        {paso === 'estado' && (
          <>
            <Titulo>¿Cómo está el vehículo?</Titulo>
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <Campo
                etiqueta="Kilómetros"
                inputMode="numeric"
                value={d.kilometraje}
                onChange={(e) => poner('kilometraje', e.target.value.replace(/\D/g, ''))}
              />
              <ElegirCombustible valor={d.combustible} onChange={(c) => poner('combustible', c)} />
            </div>
            <p className="text-dato text-texto-suave">
              Elegí qué marcar y tocá el auto donde está. Si está impecable, seguí de largo.
            </p>
            {r.faltaCarroceria && (
              <ElegirCarroceria valor={d.carroceria} onChange={r.elegirCarroceria} />
            )}
            <DiagramaDanios
              danios={d.danios}
              hojaTipo={r.hojaTipo}
              imagenId={r.hojaImagenId}
              onChange={(v) => poner('danios', v)}
              tactil
            />
          </>
        )}

        {paso === 'inventario' && (
          <>
            <Titulo>¿Qué vino con el auto?</Titulo>
            <InventarioRecepcion
              inventario={d.inventario}
              onChange={(v) => poner('inventario', v)}
            />
            <Texto
              etiqueta="Otras observaciones"
              valor={d.observaciones}
              onChange={(v) => poner('observaciones', v)}
              ayuda="Testigos prendidos, olor a quemado, objetos adentro"
            />
          </>
        )}

        {paso === 'revision' && (
          <>
            <Titulo>¿Qué le falta?</Titulo>
            <p className="text-dato text-texto-suave">
              Un color por punto. Lo que quede en ámbar o en rojo se le puede presupuestar desde la
              orden.
            </p>
            <RevisionRecepcion
              puntos={r.puntosRevision}
              onChange={r.contestar}
              tactil
              enRecepcion
            />
          </>
        )}

        {paso === 'revisar' && <Revisar datos={d} puntos={r.puntosRevision} ir={ir} />}
      </section>

      <div className="flex items-center gap-2">
        <Boton onClick={() => ir(PASOS[indice - 1]?.id ?? 'vehiculo')} deshabilitado={indice === 0}>
          Anterior
        </Boton>
        <span className="ml-auto" />
        {paso === 'revisar' ? (
          <Boton
            accion="global.guardar"
            variante="principal"
            deshabilitado={r.abriendo}
            onClick={abrir}
          >
            {r.abriendo ? 'Abriendo…' : 'Abrir la orden'}
          </Boton>
        ) : (
          <Boton variante="principal" onClick={siguiente}>
            Siguiente
          </Boton>
        )}
      </div>
    </Marco>
  )
}

/** El marco de la tablet: quién está, dónde, y la salida a la vista de escritorio. */
function Marco({ children }: { children: ReactNode }) {
  const datos = usarSesion((e) => e.datos)
  const sucursal = datos?.sucursalActiva.nombre
  return (
    <div className="min-h-dvh bg-fondo text-texto">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-borde bg-superficie px-4 py-2">
        <span className="font-display text-ui font-semibold">Recibir un vehículo</span>
        <span className="text-etiqueta text-texto-suave">
          {[sucursal, datos?.usuario && `${datos.usuario.nombre} ${datos.usuario.apellido}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <Link
          to="/ordenes/nueva"
          className="ml-auto inline-flex h-campo items-center rounded-base border border-borde px-3 text-etiqueta text-texto-suave"
        >
          Vista de escritorio
        </Link>
        <Link
          to="/entregas"
          className="inline-flex h-campo items-center rounded-base border border-borde px-3 text-etiqueta text-texto-suave"
        >
          Entregar un auto
        </Link>
        <Boton onClick={() => void salir()}>Salir</Boton>
      </header>
      <main className="mx-auto grid max-w-4xl gap-4 px-4 py-4">{children}</main>
    </div>
  )
}

function Titulo({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-ui font-semibold">{children}</h1>
}

function Falta({ children }: { children: ReactNode }) {
  return <span className="text-etiqueta text-critico">{children}</span>
}

/** Todo lo cargado, con el paso donde se cambia: se repasa con el cliente antes de abrir. */
function Revisar({
  datos: d,
  puntos,
  ir,
}: {
  datos: ReturnType<typeof useRecepcion>['datos']
  puntos: PuntoRevisado[]
  ir: (p: Paso) => void
}) {
  const contar = (estado: string) => puntos.filter((p) => p.estado === estado).length
  const semaforo = [
    contar('rojo') && `${contar('rojo')} ${contar('rojo') === 1 ? 'urgente' : 'urgentes'}`,
    contar('ambar') && `${contar('ambar')} para reparar`,
    contar('verde') && `${contar('verde')} bien`,
  ]
    .filter(Boolean)
    .join(' · ')
  const faltan = ELEMENTOS_INVENTARIO.filter((e) => d.inventario[e] === 'falta')
  const sinRevisar = ELEMENTOS_INVENTARIO.filter((e) => !d.inventario[e]).length
  const combustible = COMBUSTIBLES.find((c) => c.valor === d.combustible)?.texto

  const filas: Array<{ paso: Paso; nombre: string; valor: ReactNode }> = [
    {
      paso: 'vehiculo',
      nombre: 'Vehículo',
      valor: d.vehiculo ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Patente dominio={d.vehiculo.dominio} />
          {[d.vehiculo.marca, d.vehiculo.modelo].filter(Boolean).join(' ')}
        </span>
      ) : null,
    },
    { paso: 'vehiculo', nombre: 'Paga', valor: d.paga?.razonSocial },
    {
      paso: 'personas',
      nombre: 'Lo trae',
      valor: [d.traeNombre, d.traeTelefono].filter(Boolean).join(' · '),
    },
    {
      paso: 'personas',
      nombre: 'Autoriza',
      valor: [d.autorizaNombre, d.autorizaTelefono].filter(Boolean).join(' · '),
    },
    { paso: 'pedido', nombre: 'Qué pide', valor: d.pedido.trim() },
    {
      paso: 'pedido',
      nombre: 'Entrega estimada',
      valor: d.entregaEstimada.split('-').reverse().join('/'),
    },
    {
      paso: 'estado',
      nombre: 'Kilómetros y combustible',
      valor: [d.kilometraje && Number(d.kilometraje).toLocaleString('es-AR'), combustible]
        .filter(Boolean)
        .join(' · '),
    },
    {
      paso: 'estado',
      nombre: 'Marcas',
      valor: d.danios.length
        ? d.danios.map((x) => `${DANIOS[x.tipo].letra} ${describirDanio(x)}`).join(' · ')
        : 'Sin marcas',
    },
    {
      paso: 'inventario',
      nombre: 'Vino con el auto',
      valor: faltan.length
        ? `Falta: ${faltan.map((e) => INVENTARIO[e].toLowerCase()).join(', ')}`
        : sinRevisar === ELEMENTOS_INVENTARIO.length
          ? 'Sin revisar'
          : 'Todo lo revisado está',
    },
    { paso: 'inventario', nombre: 'Observaciones', valor: d.observaciones.trim() },
    { paso: 'revision', nombre: 'Revisión', valor: semaforo || 'Sin revisar' },
  ]

  return (
    <>
      <Titulo>Repasalo con el cliente</Titulo>
      <dl className="grid gap-2">
        {filas.map((f) => (
          <div
            key={f.nombre}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-borde-suave pb-2 sm:grid-cols-[auto_1fr_auto]"
          >
            <dt className="text-etiqueta text-texto-tenue">{f.nombre}</dt>
            <dd className="col-span-2 row-start-2 text-dato sm:col-span-1 sm:row-start-auto">
              {f.valor || <span className="text-texto-tenue">—</span>}
            </dd>
            <dd className="row-start-1 sm:row-start-auto">
              <button
                type="button"
                onClick={() => ir(f.paso)}
                aria-label={`Cambiar ${f.nombre.toLowerCase()}`}
                className="inline-flex h-campo items-center rounded-base px-2.5 text-etiqueta text-marca"
              >
                Cambiar
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
}
