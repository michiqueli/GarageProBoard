import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte, plata } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { BotonCopiar } from '../../componentes/Copiar.tsx'
import { EstadoOT } from '../../componentes/EstadoOT.tsx'
import { EstadoPedido } from '../../componentes/EstadoPedido.tsx'
import {
  IconoAgregar,
  IconoAnular,
  IconoBorrar,
  IconoEditar,
  IconoImprimir,
  IconoVolver,
} from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { type RepuestoElegido, SelectorRepuesto } from '../../componentes/SelectorRepuesto.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo } from '../../teclado/index.ts'
import { ALICUOTAS, abrirPdf, nombreComprobante } from '../caja/comprobantes.ts'
import {
  COMBUSTIBLES,
  type Combustible,
  ESTADOS_EN_TALLER,
  imprimirOrden,
  nombreOrden,
} from './ordenes.ts'
import { Texto } from './PantallaRecepcion.tsx'

const ruta = getRouteApi('/con-sesion/ordenes/$id')

type Orden = Awaited<ReturnType<typeof api.ordenes.ficha>>
type EstadoTaller = (typeof ESTADOS_EN_TALLER)[number]['valor']

interface Item {
  clave: number
  tipo: 'trabajo' | 'repuesto'
  /** La pieza del catálogo: cargarla descuenta el stock, quitarla lo devuelve. */
  repuestoId: string | null
  codigo: string | null
  descripcion: string
  cantidad: string
  precioUnitario: string
  codigoAlicuota: (typeof ALICUOTAS)[number]['valor']
}

let proxima = 1
const itemNuevo = (tipo: Item['tipo']): Item => ({
  clave: proxima++,
  tipo,
  repuestoId: null,
  codigo: null,
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  codigoAlicuota: 5,
})

/** «1.234,50» o «1234.50» → «1234.50». */
function aDecimal(texto: string): string {
  const limpio = texto.trim().replace(/\s/g, '')
  return limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio
}
const esNumero = (t: string) => /^[0-9]+(\.[0-9]{1,4})?$/.test(aDecimal(t))
const sinCeros = (t: string) => t.replace(/\.?0+$/, '')

const EN_TALLER = ['recibida', 'en_proceso', 'esperando_repuesto', 'esperando_autorizacion']

/**
 * La ficha de la orden: donde se trabaja. Lo que se le hace al auto se carga en la lista de
 * trabajos y repuestos y se guarda con `F2`; `F4` termina la orden y la manda a caja —con
 * confirmación, porque desde ahí ya no se cambia qué se cobra sin reabrirla—; `F7` la imprime.
 */
export function PantallaFichaOrden() {
  const { id } = ruta.useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const puedeEditar = usePuedeUsar(contrato.ordenes.items)
  const puedeAnular = usePuedeUsar(contrato.ordenes.anular)
  const [modificando, setModificando] = useState(false)

  const consulta = useQuery({
    queryKey: ['ordenes', tenantId, 'ficha', id],
    queryFn: () => api.ordenes.ficha({ id }),
  })
  const o = consulta.data
  const enTaller = o ? EN_TALLER.includes(o.estado) : false

  const actualizar = async (nueva: Orden) => {
    cache.setQueryData(['ordenes', tenantId, 'ficha', id], nueva)
    await cache.invalidateQueries({ queryKey: ['ordenes', tenantId], exact: false })
  }

  const accion = useMutation({
    mutationFn: (hacer: () => Promise<Orden>) => hacer(),
    onSuccess: actualizar,
    meta: {
      error: (error) =>
        error instanceof ORPCError && (error.data as { motivo?: string } | undefined)?.motivo
          ? String((error.data as { motivo: string }).motivo)
          : mensajeGeneral(error),
    },
  })

  async function terminar() {
    if (!o || !enTaller) return
    if (
      await confirmar({
        titulo: `¿Terminar la ${nombreOrden(o.numero)} y mandarla a caja?`,
        texto: `Se cobra $ ${formatearImporte(o.total)}. Desde caja ya no se cambia qué se cobra sin reabrirla.`,
        confirmar: 'Terminar y mandar a caja',
      })
    ) {
      accion.mutate(() => api.ordenes.terminar({ id }))
    }
  }

  async function anular() {
    if (!o) return
    if (
      await confirmar({
        titulo: `¿Anular la ${nombreOrden(o.numero)}?`,
        texto:
          'La orden queda anulada y no se factura. El auto puede volver a entrar con otra orden.',
        confirmar: 'Anular la orden',
        peligro: true,
      })
    ) {
      accion.mutate(() => api.ordenes.anular({ id }))
    }
  }

  useAtajo('global.imprimir', () => void imprimirOrden(id), Boolean(o))
  useAtajo('ordenes.cerrar', () => void terminar(), Boolean(o && enTaller && puedeEditar))

  const titulo = o
    ? [
        nombreOrden(o.numero),
        o.vehiculo.dominio,
        [o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Orden de trabajo'

  return (
    <Shell
      titulo={titulo}
      requiere={accesoDeRuta(contrato.ordenes.ficha)}
      acciones={
        o ? (
          <>
            <Boton
              accion="global.imprimir"
              icono={<IconoImprimir />}
              onClick={() => void imprimirOrden(id)}
            >
              Imprimir
            </Boton>
            {puedeEditar && enTaller && (
              <Boton
                accion="ordenes.cerrar"
                variante="principal"
                deshabilitado={accion.isPending}
                onClick={() => void terminar()}
              >
                Terminar y mandar a caja
              </Boton>
            )}
          </>
        ) : undefined
      }
    >
      <Link to="/ordenes" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todas las órdenes
      </Link>

      {consulta.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {consulta.error instanceof ORPCError && consulta.error.code === 'NO_ENCONTRADA'
            ? 'Esa orden no existe. Buscala desde el listado.'
            : mensajeGeneral(consulta.error)}
        </p>
      )}

      {o && (
        <>
          <section
            aria-label="Estado"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-base border border-borde bg-superficie px-3 py-2.5"
          >
            <EstadoOT estado={o.estado} />
            {puedeEditar && enTaller && (
              <div className="w-56">
                <Selector
                  etiqueta="Dónde está el auto"
                  valor={o.estado as EstadoTaller}
                  onChange={(v) =>
                    v &&
                    v !== o.estado &&
                    accion.mutate(() => api.ordenes.cambiarEstado({ id, estado: v }))
                  }
                  opciones={ESTADOS_EN_TALLER.map((e) => ({ valor: e.valor, texto: e.texto }))}
                />
              </div>
            )}
            {o.estado === 'terminada' && (
              <span className="text-dato text-texto-suave">
                Está en caja, esperando que la facturen.
              </span>
            )}
            {o.factura && (
              <span className="inline-flex items-center gap-2 text-dato">
                Facturada con la <b className="font-mono">{nombreComprobante(o.factura)}</b>
                <Boton
                  tamano="chico"
                  icono={<IconoImprimir />}
                  onClick={() => void abrirPdf(o.factura?.id as string)}
                >
                  PDF
                </Boton>
              </span>
            )}
            <span className="ml-auto flex flex-wrap gap-2">
              {puedeEditar && o.estado === 'terminada' && (
                <Boton
                  tamano="chico"
                  onClick={() => accion.mutate(() => api.ordenes.reabrir({ id }))}
                >
                  Volver al taller
                </Boton>
              )}
              {puedeEditar && o.estado === 'facturada' && (
                <Boton
                  tamano="chico"
                  variante="principal"
                  onClick={() => accion.mutate(() => api.ordenes.entregar({ id }))}
                >
                  Entregar el vehículo
                </Boton>
              )}
              {puedeAnular && (enTaller || o.estado === 'terminada') && (
                <Boton
                  tamano="chico"
                  variante="sutil"
                  icono={<IconoAnular />}
                  onClick={() => void anular()}
                >
                  Anular
                </Boton>
              )}
            </span>
          </section>

          {modificando ? (
            <FormRecepcion
              orden={o}
              alTerminar={() => setModificando(false)}
              guardada={actualizar}
            />
          ) : (
            <Recepcion
              orden={o}
              accion={
                puedeEditar && !['facturada', 'entregada', 'anulada'].includes(o.estado) ? (
                  <Boton
                    tamano="chico"
                    icono={<IconoEditar />}
                    onClick={() => setModificando(true)}
                  >
                    Modificar
                  </Boton>
                ) : undefined
              }
            />
          )}

          <Items orden={o} editable={puedeEditar && enTaller} guardada={actualizar} />
          <PedidosDeLaOrden orden={o} />
        </>
      )}
    </Shell>
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
      <header className="flex items-center gap-2 border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">{titulo}</h2>
        {accion && <span className="ml-auto">{accion}</span>}
      </header>
      {children}
    </section>
  )
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-etiqueta text-texto-tenue">{nombre}</dt>
      <dd>{children || <span className="text-texto-tenue">—</span>}</dd>
    </>
  )
}

function Recepcion({ orden: o, accion }: { orden: Orden; accion?: ReactNode }) {
  const combustible = COMBUSTIBLES.find((c) => c.valor === o.combustible)?.texto
  return (
    <Seccion titulo="Recepción" accion={accion}>
      <div className="grid gap-4 px-3 py-2.5 md:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-dato">
          <Dato nombre="Vehículo">
            <span className="inline-flex items-center gap-2">
              <Link to="/vehiculos/$id" params={{ id: o.vehiculo.id }} className="inline-flex">
                <Patente dominio={o.vehiculo.dominio} />
              </Link>
              {[o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(' ')}
            </span>
          </Dato>
          <Dato nombre="Chasis">
            <span className="inline-flex items-center gap-1 font-mono">
              {o.vehiculo.chasis}
              <BotonCopiar valor={o.vehiculo.chasis} que="Chasis" />
            </span>
          </Dato>
          <Dato nombre="Kilómetros">{o.kilometraje?.toLocaleString('es-AR')}</Dato>
          <Dato nombre="Combustible">{combustible}</Dato>
          <Dato nombre="Titular">{o.titular?.razonSocial}</Dato>
          <Dato nombre="Paga">{o.paga?.razonSocial}</Dato>
          <Dato nombre="Lo trajo">
            {[o.traeNombre, o.traeTelefono].filter(Boolean).join(' · ')}
          </Dato>
        </dl>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-1.5 text-dato">
          <Dato nombre="Pedido">{o.pedido}</Dato>
          <Dato nombre="Estado al recibirlo">{o.observaciones}</Dato>
          <Dato nombre="Prometida para">{o.prometidaPara?.split('-').reverse().join('/')}</Dato>
          <Dato nombre="Asesor">{o.asesor}</Dato>
          <Dato nombre="Mecánico">{o.mecanico?.nombre}</Dato>
        </dl>
      </div>
    </Seccion>
  )
}

function FormRecepcion({
  orden: o,
  alTerminar,
  guardada,
}: {
  orden: Orden
  alTerminar: () => void
  guardada: (o: Orden) => Promise<void>
}) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const [paga, setPaga] = useState<ClienteElegido | null>(o.paga)
  const [traeNombre, setTraeNombre] = useState(o.traeNombre ?? '')
  const [traeTelefono, setTraeTelefono] = useState(o.traeTelefono ?? '')
  const [kilometraje, setKilometraje] = useState(o.kilometraje != null ? String(o.kilometraje) : '')
  const [combustible, setCombustible] = useState<Combustible | null>(o.combustible)
  const [pedido, setPedido] = useState(o.pedido)
  const [observaciones, setObservaciones] = useState(o.observaciones ?? '')
  const [prometidaPara, setPrometidaPara] = useState(o.prometidaPara ?? '')
  const [mecanicoId, setMecanicoId] = useState<string | null>(o.mecanico?.id ?? null)

  const personal = useQuery({
    queryKey: ['ordenes', tenantId, 'personal'],
    queryFn: () => api.ordenes.personal(),
    staleTime: 5 * 60_000,
  })

  const guardar = useMutation({
    mutationFn: () =>
      api.ordenes.editar({
        id: o.id,
        pagaId: paga?.id ?? null,
        traeNombre,
        traeTelefono,
        kilometraje: kilometraje ? Number(kilometraje) : null,
        combustible,
        pedido,
        observaciones,
        prometidaPara: prometidaPara || null,
        mecanicoId,
      }),
    onSuccess: async (nueva) => {
      await guardada(nueva)
      alTerminar()
    },
    meta: { exito: 'Recepción guardada' },
  })

  useAtajo('global.guardar', () => pedido.trim().length >= 3 && guardar.mutate())
  useAtajo('global.cancelar', alTerminar)

  return (
    <Seccion titulo="Modificar la recepción">
      <div className="grid gap-3 px-3 py-3">
        <div className="grid gap-3 md:grid-cols-3">
          <SelectorCliente etiqueta="Paga" valor={paga} onChange={setPaga} />
          <Campo
            etiqueta="Lo trae"
            value={traeNombre}
            onChange={(e) => setTraeNombre(e.target.value)}
          />
          <Campo
            etiqueta="Teléfono de quien lo trae"
            value={traeTelefono}
            onChange={(e) => setTraeTelefono(e.target.value)}
          />
          <Campo
            etiqueta="Kilómetros"
            inputMode="numeric"
            value={kilometraje}
            onChange={(e) => setKilometraje(e.target.value.replace(/\D/g, ''))}
          />
          <Selector
            etiqueta="Combustible"
            valor={combustible}
            vacio="Sin anotar"
            onChange={setCombustible}
            opciones={COMBUSTIBLES.map((c) => ({ valor: c.valor, texto: c.texto }))}
          />
          <Selector
            etiqueta="Mecánico"
            valor={mecanicoId}
            vacio="Sin asignar"
            onChange={setMecanicoId}
            opciones={(personal.data?.datos ?? []).map((p) => ({ valor: p.id, texto: p.nombre }))}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Texto etiqueta="Qué pide el cliente" valor={pedido} onChange={setPedido} />
          <Texto
            etiqueta="Estado del vehículo al recibirlo"
            valor={observaciones}
            onChange={setObservaciones}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Campo
            etiqueta="Prometida para"
            type="date"
            value={prometidaPara}
            onChange={(e) => setPrometidaPara(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Boton
            accion="global.guardar"
            variante="principal"
            deshabilitado={guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            Guardar
          </Boton>
          <Boton accion="global.cancelar" onClick={alTerminar}>
            Cancelar
          </Boton>
        </div>
      </div>
    </Seccion>
  )
}

function Items({
  orden: o,
  editable,
  guardada,
}: {
  orden: Orden
  editable: boolean
  guardada: (o: Orden) => Promise<void>
}) {
  const desdeOrden = () =>
    o.items.map((i) => ({
      clave: proxima++,
      tipo: i.tipo,
      repuestoId: i.repuestoId,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad: sinCeros(i.cantidad),
      precioUnitario: sinCeros(i.precioUnitario),
      codigoAlicuota: i.codigoAlicuota as Item['codigoAlicuota'],
    }))
  const [items, setItems] = useState<Item[]>(desdeOrden)
  const [cambios, setCambios] = useState(false)

  // Si la orden cambia desde afuera (otro puesto, un estado), se toma la nueva versión
  // mientras no haya cambios sin guardar acá.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se resincroniza sólo cuando cambia la orden guardada
  useEffect(() => {
    if (!cambios) setItems(desdeOrden())
  }, [o.items])

  const total = useMemo(
    () =>
      items.reduce(
        (a, i) =>
          esNumero(i.cantidad) && esNumero(i.precioUnitario)
            ? a.plus(
                plata(aDecimal(i.cantidad))
                  .times(plata(aDecimal(i.precioUnitario)))
                  .toDecimalPlaces(2),
              )
            : a,
        plata('0'),
      ),
    [items],
  )
  const invalidos = items.some(
    (i) => !i.descripcion.trim() || !esNumero(i.cantidad) || !esNumero(i.precioUnitario),
  )

  const guardar = useMutation({
    mutationFn: () =>
      api.ordenes.items({
        id: o.id,
        items: items.map((i) => ({
          tipo: i.tipo,
          repuestoId: i.repuestoId,
          codigo: i.codigo,
          descripcion: i.descripcion.trim(),
          cantidad: aDecimal(i.cantidad),
          precioUnitario: aDecimal(i.precioUnitario),
          codigoAlicuota: i.codigoAlicuota,
        })),
      }),
    onSuccess: async (nueva) => {
      setCambios(false)
      await guardada(nueva)
    },
    meta: { exito: 'Trabajos y repuestos guardados' },
  })

  const cambiar = (clave: number, parcial: Partial<Item>) => {
    setCambios(true)
    setItems((xs) => xs.map((x) => (x.clave === clave ? { ...x, ...parcial } : x)))
  }
  const agregar = (tipo: Item['tipo']) => {
    setCambios(true)
    setItems((xs) => [...xs, itemNuevo(tipo)])
  }
  function agregarDelCatalogo(r: RepuestoElegido) {
    setCambios(true)
    setItems((xs) => {
      const ya = xs.find((x) => x.repuestoId === r.id)
      if (ya && esNumero(ya.cantidad)) {
        return xs.map((x) =>
          x === ya ? { ...x, cantidad: String(Number(aDecimal(x.cantidad)) + 1) } : x,
        )
      }
      return [
        ...xs,
        {
          clave: proxima++,
          tipo: 'repuesto',
          repuestoId: r.id,
          codigo: r.codigo,
          descripcion: r.descripcion,
          cantidad: '1',
          precioUnitario: sinCeros(r.precioVenta),
          codigoAlicuota: r.codigoAlicuota as Item['codigoAlicuota'],
        },
      ]
    })
  }

  async function quitar(i: Item) {
    if (
      (i.descripcion.trim() || i.precioUnitario.trim()) &&
      !(await confirmar({
        titulo: `¿Quitar «${i.descripcion.trim() || 'sin descripción'}»?`,
        texto: 'Se quita de la orden cuando guardes.',
        confirmar: 'Quitar',
        peligro: true,
      }))
    ) {
      return
    }
    setCambios(true)
    setItems((xs) => xs.filter((x) => x.clave !== i.clave))
  }

  useAtajo('global.guardar', () => !invalidos && guardar.mutate(), editable && cambios)
  useAtajo('global.nuevo', () => agregar('trabajo'), editable)
  useAtajo('ordenes.agregarRepuesto', () => agregar('repuesto'), editable)

  return (
    <Seccion
      titulo="Trabajos y repuestos"
      accion={
        <span className="tabular font-mono text-dato">
          Total <b>$ {formatearImporte(total.toFixed(2))}</b>
        </span>
      }
    >
      {editable && (
        <div className="border-b border-borde-suave px-3 py-2.5">
          <SelectorRepuesto etiqueta="Repuesto del catálogo" alElegir={agregarDelCatalogo} />
        </div>
      )}
      {items.length === 0 && (
        <p className="px-3 py-4 text-dato text-texto-suave">
          Todavía no se cargó nada para cobrar.
          {editable && ' Agregá los trabajos y repuestos a medida que se hacen.'}
        </p>
      )}
      {items.length > 0 && (
        <ol aria-label="Items" className="grid gap-2 px-3 py-2.5">
          {items.map((i, n) => {
            const subtotal =
              esNumero(i.cantidad) && esNumero(i.precioUnitario)
                ? plata(aDecimal(i.cantidad))
                    .times(plata(aDecimal(i.precioUnitario)))
                    .toDecimalPlaces(2)
                    .toFixed(2)
                : null
            if (!editable) {
              return (
                <li key={i.clave} className="flex items-baseline gap-3 text-dato">
                  <span className="w-20 text-etiqueta text-texto-tenue">
                    {i.tipo === 'trabajo' ? 'Trabajo' : 'Repuesto'}
                  </span>
                  <span className="flex-1">
                    {i.codigo && (
                      <span className="mr-2 font-mono text-etiqueta text-texto-suave">
                        {i.codigo}
                      </span>
                    )}
                    {i.descripcion}
                  </span>
                  <span className="font-mono text-texto-suave">× {i.cantidad}</span>
                  <span className="tabular w-32 text-right font-mono">
                    {subtotal ? `$ ${formatearImporte(subtotal)}` : '—'}
                  </span>
                </li>
              )
            }
            return (
              <li
                key={i.clave}
                aria-label={`Item ${n + 1}`}
                className="grid items-end gap-2 md:grid-cols-[7rem_1fr_5rem_8rem_6rem_7rem_auto]"
              >
                <Selector
                  etiqueta={i.codigo ? `Tipo · ${i.codigo}` : 'Tipo'}
                  valor={i.tipo}
                  onChange={(v) => cambiar(i.clave, { tipo: v ?? 'trabajo' })}
                  opciones={[
                    { valor: 'trabajo' as const, texto: 'Trabajo' },
                    { valor: 'repuesto' as const, texto: 'Repuesto' },
                  ]}
                />
                <Campo
                  etiqueta="Descripción"
                  value={i.descripcion}
                  onChange={(e) => cambiar(i.clave, { descripcion: e.target.value })}
                />
                <Campo
                  etiqueta="Cantidad"
                  inputMode="decimal"
                  value={i.cantidad}
                  onChange={(e) => cambiar(i.clave, { cantidad: e.target.value })}
                />
                <Campo
                  etiqueta="Precio final"
                  inputMode="decimal"
                  value={i.precioUnitario}
                  onChange={(e) => cambiar(i.clave, { precioUnitario: e.target.value })}
                />
                <Selector
                  etiqueta="IVA"
                  valor={i.codigoAlicuota}
                  onChange={(v) => cambiar(i.clave, { codigoAlicuota: v ?? 5 })}
                  opciones={ALICUOTAS.map((a) => ({ valor: a.valor, texto: a.texto }))}
                />
                <div className="grid gap-1">
                  <span className="text-etiqueta font-medium text-texto-suave">Total</span>
                  <span className="tabular flex h-campo items-center justify-end font-mono text-dato">
                    {subtotal ? formatearImporte(subtotal) : '—'}
                  </span>
                </div>
                <Boton
                  tamano="chico"
                  variante="sutil"
                  icono={<IconoBorrar />}
                  onClick={() => void quitar(i)}
                >
                  Quitar
                </Boton>
              </li>
            )
          })}
        </ol>
      )}
      {editable && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-borde-suave px-3 py-2">
          <Boton
            tamano="chico"
            accion="global.nuevo"
            icono={<IconoAgregar />}
            onClick={() => agregar('trabajo')}
          >
            Trabajo
          </Boton>
          <Boton
            tamano="chico"
            accion="ordenes.agregarRepuesto"
            icono={<IconoAgregar />}
            onClick={() => agregar('repuesto')}
          >
            Repuesto
          </Boton>
          {cambios && (
            <span className="ml-auto flex items-center gap-2">
              {invalidos && (
                <span className="text-etiqueta text-critico">
                  Cada item necesita descripción, cantidad y precio.
                </span>
              )}
              <Boton
                accion="global.guardar"
                variante="principal"
                deshabilitado={invalidos || guardar.isPending}
                onClick={() => guardar.mutate()}
              >
                Guardar
              </Boton>
            </span>
          )}
        </footer>
      )}
    </Seccion>
  )
}

/**
 * Los pedidos de repuestos de la orden: lo que el taller le pidió al mostrador. Los entregados
 * ya están en la lista de arriba; los abiertos, todavía no.
 */
function PedidosDeLaOrden({ orden: o }: { orden: Orden }) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.pedidosRepuestos.listar)
  const puedeAbrir = usePuedeUsar(contrato.pedidosRepuestos.abrir)
  const enTaller = EN_TALLER.includes(o.estado)
  const consulta = useQuery({
    queryKey: ['pedidos-repuestos', tenantId, 'orden', o.id],
    queryFn: () =>
      api.pedidosRepuestos.listar({ pagina: 1, porPagina: 50, estado: 'todos', ordenId: o.id }),
    enabled: puedeVer,
  })
  if (!puedeVer) return null
  const datos = consulta.data?.datos ?? []
  if (!datos.length && !(puedeAbrir && enTaller)) return null

  return (
    <Seccion
      titulo="Pedidos de repuestos"
      accion={
        puedeAbrir && enTaller ? (
          <Link
            to="/repuestos/pedidos/nuevo"
            search={{ ordenId: o.id }}
            className={clasesBoton('normal', 'chico')}
          >
            <IconoAgregar />
            Pedir repuestos
          </Link>
        ) : undefined
      }
    >
      {datos.length === 0 ? (
        <p className="px-3 py-3 text-dato text-texto-suave">
          No se pidió nada al mostrador para esta orden.
        </p>
      ) : (
        <ul className="divide-y divide-borde-suave">
          {datos.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-dato"
            >
              <Link
                to="/repuestos/pedidos/$id"
                params={{ id: p.id }}
                className="font-mono text-marca hover:underline"
              >
                Pedido {String(p.numero).padStart(6, '0')}
              </Link>
              <EstadoPedido estado={p.estado} />
              <span className="text-texto-suave">
                {p.items} {p.items === 1 ? 'repuesto' : 'repuestos'}
                {p.solicitante ? ` · ${p.solicitante}` : ''}
              </span>
              <span className="tabular ml-auto font-mono">$ {formatearImporte(p.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}
