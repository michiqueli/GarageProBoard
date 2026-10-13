import { accesoDeRuta, contrato } from '@gpb/contracts'
import {
  type ControlInventario,
  ELEMENTOS_INVENTARIO,
  formatearImporte,
  INVENTARIO,
} from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { Firma } from '../../componentes/Firma.tsx'
import { IconoImprimir, IconoVolver } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuede } from '../../sesion/permisos.ts'
import { useAtajo, useVolver } from '../../teclado/index.ts'
import { nombreComprobante } from '../caja/comprobantes.ts'
import { type Danio, DiagramaDanios, describirDanio } from './DiagramaDanios.tsx'
import { type Combustible, imprimirEgreso, nombreOrden } from './ordenes.ts'
import { ElegirCombustible } from './PantallaRecepcion.tsx'
import { Semaforo } from './RevisionRecepcion.tsx'
import { quienRetira, useRetiros } from './retiros.tsx'

const ruta = getRouteApi('/con-sesion/entregas/$id')

type Orden = Awaited<ReturnType<typeof api.ordenes.ficha>>

/**
 * El egreso: devolverle el auto al cliente, con todo lo que se anotó al recibirlo a la vista.
 * Ver `docs/tecnicos/egreso.md`.
 *
 * Cinco cosas, en el orden en que se le cuentan al cliente: lo que se hizo —con el código de
 * barras de cada caja—, lo que no se hizo, cómo sale contra cómo entró, el cobro y la firma.
 * `F4` entrega, después de confirmar.
 */
export function PantallaEgreso() {
  const { id } = ruta.useParams()
  const { visita: visitaId } = ruta.useSearch()
  const navegar = useNavigate()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  // Volver lleva la visita de vuelta: quien vino a retirar sigue esperando su auto.
  const deVuelta = visitaId ? { visita: visitaId } : {}
  useVolver(() => void navegar({ to: '/entregas', search: deVuelta }))

  const consulta = useQuery({
    queryKey: ['ordenes', tenantId, 'ficha', id],
    queryFn: () => api.ordenes.ficha({ id }),
  })
  const o = consulta.data

  return (
    <Shell
      titulo={o ? `Entregar la ${nombreOrden(o.numero)}` : 'Entregar'}
      requiere={accesoDeRuta(contrato.ordenes.entregar)}
    >
      <Link to="/entregas" search={deVuelta} className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Para entregar
      </Link>
      {consulta.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeGeneral(consulta.error)}
        </p>
      )}
      {o &&
        (o.estado === 'entregada' ? (
          <Entregada orden={o} />
        ) : (
          <Egreso key={o.id} orden={o} visitaId={visitaId} />
        ))}
    </Shell>
  )
}

function Egreso({ orden: o, visitaId }: { orden: Orden; visitaId?: string | undefined }) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  /** Quien vino a buscarlo, si se tomó su visita de la puerta: entregar la cierra. */
  const { visita } = useRetiros(visitaId)
  const puedeAutorizar = usePuede({ modulo: 'servicios', accion: 'autorizar', sujeto: 'Orden' })

  const [kilometraje, setKilometraje] = useState(o.kilometraje ? String(o.kilometraje) : '')
  const [combustible, setCombustible] = useState<Combustible | null>(o.combustible)
  const [inventario, setInventario] = useState<Partial<Record<string, ControlInventario>>>(
    o.inventario,
  )
  const [conDanio, setConDanio] = useState(false)
  const [danios, setDanios] = useState<Danio[]>([])
  const [motivo, setMotivo] = useState('')
  const [aclaracion, setAclaracion] = useState(o.traeNombre ?? o.titular?.razonSocial ?? '')
  const [firma, setFirma] = useState<Blob | null>(null)

  const sinFacturar = o.estado !== 'facturada'
  const km = kilometraje.trim() ? Number(kilometraje.replace(/\D/g, '')) : null
  const kmMenor = km !== null && o.kilometraje !== null && km < o.kilometraje
  const faltan = [
    sinFacturar && !puedeAutorizar && 'facturarla en caja',
    sinFacturar && puedeAutorizar && motivo.trim().length < 5 && 'decir por qué sale sin factura',
    kmMenor && 'corregir los kilómetros',
    !firma && 'la firma del cliente',
    aclaracion.trim().length < 3 && 'el nombre de quien firma',
  ].filter((x): x is string => Boolean(x))

  const entregar = useMutation({
    mutationFn: async () => {
      // Primero la firma: sin ella no se entrega, y si la entrega fallara, firmar de nuevo
      // reemplaza a la anterior sin perderla.
      await api.ordenes.firmar({
        id: o.id,
        momento: 'egreso',
        aclaracion: aclaracion.trim(),
        imagen: new File([firma as Blob], 'firma.png', { type: 'image/png' }),
      })
      return api.ordenes.entregar({
        id: o.id,
        kilometraje: km,
        combustible,
        inventario,
        danios: conDanio ? danios.map(({ tipo, x, y, nota }) => ({ tipo, x, y, nota })) : [],
        sinFactura: sinFacturar ? { motivo: motivo.trim() } : null,
        visitaId: visita?.id ?? null,
      })
    },
    onSuccess: async (nueva) => {
      cache.setQueryData(['ordenes', tenantId, 'ficha', o.id], nueva)
      await cache.invalidateQueries({ queryKey: ['ordenes', tenantId] })
      await cache.invalidateQueries({ queryKey: ['tablero', tenantId], exact: false })
      // Su visita terminó con la entrega: deja de estar en la puerta.
      if (visita) await cache.invalidateQueries({ queryKey: ['visitas', tenantId] })
    },
    meta: {
      exito: `${nombreOrden(o.numero)} entregada`,
      error: (error) => {
        if (error instanceof ORPCError && error.code === 'VISITA_INVALIDA') {
          return 'La visita de quien vino a buscarlo ya terminó o la tiene otra persona. Volvé a Para entregar y entregalo sin ella.'
        }
        return error instanceof ORPCError && (error.data as { motivo?: string } | undefined)?.motivo
          ? String((error.data as { motivo: string }).motivo)
          : mensajeGeneral(error)
      },
    },
  })

  async function preguntarYEntregar() {
    if (faltan.length || entregar.isPending) return
    const si = await confirmar({
      titulo: `¿Entregar ${o.vehiculo.dominio ?? 'el auto'} a ${aclaracion.trim()}?`,
      texto: [
        sinFacturar ? `Sale sin factura: ${motivo.trim()}.` : null,
        o.noSeHizo.length
          ? `Lo que no autorizó queda pendiente para la próxima vez (${o.noSeHizo.length}).`
          : null,
        'La orden queda cerrada.',
      ]
        .filter(Boolean)
        .join(' '),
      confirmar: 'Entregar',
    })
    if (si) entregar.mutate()
  }

  useAtajo('entregas.entregar', () => void preguntarYEntregar(), !entregar.isPending)

  const hecho = o.items.filter((i) => i.autorizacion !== 'rechazado')
  const elementos = ELEMENTOS_INVENTARIO.filter((e) => o.inventario[e])

  return (
    <>
      {visita && (
        <p className="rounded-base border border-marca bg-marca-suave px-3 py-2 text-dato">
          Se lo lleva <span className="font-mono font-semibold">{quienRetira(visita)}</span>.
          Entregarlo cierra su visita de la puerta.
        </p>
      )}
      <Seccion titulo="El vehículo">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-dato">
          <Patente dominio={o.vehiculo.dominio} />
          <span>{[o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(' ')}</span>
          <span className="text-texto-suave">{o.titular?.razonSocial ?? 'Sin titular'}</span>
          <Link
            to="/ordenes/$id"
            params={{ id: o.id }}
            className="ml-auto font-mono text-etiqueta text-marca hover:underline"
          >
            Ver la {nombreOrden(o.numero)}
          </Link>
        </div>
      </Seccion>

      <Seccion titulo="Lo que se hizo">
        <ul className="grid gap-2 px-3 py-2.5">
          {hecho.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 text-dato">
              <span className="w-20 text-etiqueta text-texto-tenue">
                {i.tipo === 'trabajo' ? 'Trabajo' : 'Repuesto'}
              </span>
              <span className="flex-1">
                {i.descripcion}
                {i.codigosBarras.length > 0 && (
                  // En grande: el cliente lo compara con la caja que tiene en la mano.
                  <span className="block font-mono text-ui font-semibold">
                    {i.codigosBarras.length === 1 ? 'Caja' : 'Cajas'}: {i.codigosBarras.join(' · ')}
                  </span>
                )}
              </span>
              <span className="font-mono text-texto-suave">× {i.cantidad}</span>
              <span className="tabular w-32 text-right font-mono">
                $ {formatearImporte(i.total)}
              </span>
            </li>
          ))}
        </ul>
        <p className="tabular border-t border-borde-suave px-3 py-2 text-right font-mono text-dato">
          Total <b>$ {formatearImporte(o.total)}</b>
        </p>
      </Seccion>

      {o.noSeHizo.length > 0 && (
        <Seccion titulo="Lo que no se hizo">
          <div className="grid gap-1.5 px-3 py-2.5">
            <p className="text-etiqueta text-texto-suave">
              Se le recomendó y no lo autorizó. Sale así en el comprobante, y queda pendiente para
              la próxima vez que traiga el auto.
            </p>
            <ul className="grid gap-1">
              {o.noSeHizo.map((p) => (
                <li key={p.descripcion} className="flex items-center gap-2 text-dato">
                  {p.semaforo && <Semaforo estado={p.semaforo} />}
                  {p.descripcion}
                </li>
              ))}
            </ul>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Cómo sale">
        <div className="grid gap-3 px-3 py-2.5">
          <div className="grid gap-3 md:grid-cols-2">
            <Campo
              etiqueta="Kilómetros"
              inputMode="numeric"
              value={kilometraje}
              onChange={(e) => setKilometraje(e.target.value)}
              ayuda={
                kmMenor
                  ? `Entró con ${o.kilometraje?.toLocaleString('es-AR')}: no puede salir con menos`
                  : `Entró con ${o.kilometraje === null ? '—' : o.kilometraje.toLocaleString('es-AR')}`
              }
              aria-invalid={kmMenor}
            />
            <div className="grid gap-1">
              <span className="text-etiqueta font-medium text-texto-suave">
                Combustible{o.combustible ? ' (entró con el que está marcado)' : ''}
              </span>
              <ElegirCombustible valor={combustible} onChange={setCombustible} />
            </div>
          </div>

          {elementos.length > 0 && (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-etiqueta font-medium text-texto-suave">
                Lo que vino con el auto
              </legend>
              {elementos.map((e) => (
                <div key={e} className="flex flex-wrap items-center gap-2 text-dato">
                  <span className="w-44">{INVENTARIO[e]}</span>
                  <span className="w-24 text-etiqueta text-texto-tenue">
                    Entró: {o.inventario[e] === 'esta' ? 'está' : 'falta'}
                  </span>
                  {(['esta', 'falta'] as const).map((c) => (
                    <Boton
                      key={c}
                      tamano="chico"
                      variante={inventario[e] === c ? 'principal' : 'normal'}
                      presionado={inventario[e] === c}
                      onClick={() => setInventario((x) => ({ ...x, [e]: c }))}
                    >
                      {c === 'esta' ? 'Sale' : 'No está'}
                    </Boton>
                  ))}
                </div>
              ))}
            </fieldset>
          )}

          <div className="grid gap-2">
            {o.danios.length > 0 && (
              <p className="text-etiqueta text-texto-suave">
                Al recibirlo tenía: {o.danios.map(describirDanio).join(', ')}.
              </p>
            )}
            <label className="flex items-center gap-2 text-dato">
              <input
                type="checkbox"
                className="accent-marca"
                checked={conDanio}
                onChange={(e) => setConDanio(e.target.checked)}
              />
              Tiene un daño que no estaba al recibirlo
            </label>
            {conDanio && (
              <DiagramaDanios
                danios={danios}
                imagenId={o.hojaImagenId}
                hojaTipo={o.hojaTipo}
                onChange={setDanios}
              />
            )}
          </div>
        </div>
      </Seccion>

      <Seccion titulo="El cobro">
        <div className="grid gap-2 px-3 py-2.5 text-dato">
          {o.factura ? (
            <p>
              Facturada con la <b className="font-mono">{nombreComprobante(o.factura)}</b>.
            </p>
          ) : puedeAutorizar ? (
            <>
              <p className="text-atencion">
                Todavía no se facturó. Se puede entregar sin factura si decís por qué: queda anotado
                con tu nombre.
              </p>
              <div className="max-w-xl">
                <Campo
                  etiqueta="Por qué sale sin factura"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  ayuda="Una garantía que se factura a la terminal, un cliente de confianza"
                />
              </div>
            </>
          ) : (
            <p className="text-atencion">
              Todavía no se facturó. Facturala en{' '}
              <Link to="/caja" className="text-marca underline">
                caja
              </Link>
              , o pedile a quien pueda autorizarlo que la entregue sin factura.
            </p>
          )}
        </div>
      </Seccion>

      <Seccion titulo="La firma">
        <div className="grid gap-3 px-3 py-2.5">
          <div className="max-w-md">
            <Campo
              etiqueta="Quién se lo lleva"
              value={aclaracion}
              onChange={(e) => setAclaracion(e.target.value)}
              ayuda="La aclaración de la firma"
            />
          </div>
          <div className="max-w-xl">
            <Firma etiqueta="Firma de quien se lo lleva" alCambiar={setFirma} />
          </div>
        </div>
      </Seccion>

      <div className="flex flex-wrap items-center gap-3">
        <Boton
          accion="entregas.entregar"
          variante="principal"
          deshabilitado={faltan.length > 0 || entregar.isPending}
          onClick={() => void preguntarYEntregar()}
        >
          Entregar
        </Boton>
        {faltan.length > 0 && (
          <span className="text-etiqueta text-texto-suave">Falta {faltan.join(', ')}.</span>
        )}
      </div>
    </>
  )
}

/** Ya entregada: cómo salió y el comprobante para imprimir. */
function Entregada({ orden: o }: { orden: Orden }) {
  const e = o.egreso
  return (
    <Seccion titulo="Entregada">
      <div className="grid gap-2 px-3 py-2.5 text-dato">
        <p>
          {o.vehiculo.dominio ? <Patente dominio={o.vehiculo.dominio} /> : 'El auto'} se entregó
          {e?.entregadaPor ? `; lo entregó ${e.entregadaPor}` : ''}
          {o.firmas.egreso ? `, y lo firmó ${o.firmas.egreso.aclaracion}` : ''}.
        </p>
        {e?.sinFactura && (
          <p className="text-atencion">
            Salió sin factura: {e.sinFactura.motivo}. Lo autorizó {e.sinFactura.autorizadoPor}.
          </p>
        )}
        <span>
          <Boton icono={<IconoImprimir />} onClick={() => void imprimirEgreso(o.id)}>
            Imprimir el comprobante
          </Boton>
        </span>
      </div>
    </Seccion>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      aria-label={titulo}
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">{titulo}</h2>
      </header>
      {children}
    </section>
  )
}
