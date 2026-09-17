import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte, plata } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { BotonCopiar, copiarConAviso } from '../../componentes/Copiar.tsx'
import { EstadoPedido } from '../../componentes/EstadoPedido.tsx'
import {
  IconoAgregar,
  IconoAnular,
  IconoBorrar,
  IconoImprimir,
  IconoVolver,
} from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { CampoRepuesto, type RepuestoElegido } from '../../componentes/SelectorRepuesto.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo, useCambiosSinGuardar, useVolver } from '../../teclado/index.ts'
import { ALICUOTAS, abrirPdf, nombreComprobante } from '../caja/comprobantes.ts'
import { Dato, Seccion } from './PantallaFichaRepuesto.tsx'
import { destinoPedido } from './PantallaPedidos.tsx'
import {
  aDecimal,
  cantidad,
  esNumero,
  nombrePedido,
  type Pedido,
  seis,
  sinCeros,
} from './repuestos.ts'

const ruta = getRouteApi('/con-sesion/repuestos/pedidos/$id')

interface Item {
  clave: number
  repuestoId: string | null
  codigo: string
  descripcion: string
  cantidad: string
  precioUnitario: string
  codigoAlicuota: (typeof ALICUOTAS)[number]['valor']
  /** Lo que hay en la sucursal, si es del catálogo. */
  stock: string | null
}

let proxima = 1

/**
 * La ficha de un pedido: el chasis a mano para copiarlo en la base de la marca, y la lista de
 * repuestos que se arma pegando los códigos que devuelve. `F2` guarda; `F4` lo despacha:
 * lo entrega al taller si va a una orden, o lo manda a caja si es de mostrador.
 */
export function PantallaPedido() {
  const irAlListado = useNavigate()
  // Esc o ⌫, sin estar escribiendo, vuelven a donde se venía.
  useVolver(() => void irAlListado({ to: '/repuestos/pedidos' }))
  const { id } = ruta.useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const puedeEditar = usePuedeUsar(contrato.pedidosRepuestos.editar)
  const puedeAnular = usePuedeUsar(contrato.pedidosRepuestos.anular)

  const clave = ['pedidos-repuestos', tenantId, 'ficha', id]
  const consulta = useQuery({ queryKey: clave, queryFn: () => api.pedidosRepuestos.ficha({ id }) })
  const p = consulta.data
  // Alt+C y Alt+P: el chasis y la patente del vehículo, sin buscar el botón.
  useAtajo(
    'repuestos.copiarChasis',
    () => void copiarConAviso(p?.chasis as string, 'Chasis'),
    Boolean(p),
  )
  useAtajo(
    'repuestos.copiarPatente',
    () => void copiarConAviso(p?.vehiculo?.dominio as string, 'Patente'),
    Boolean(p?.vehiculo?.dominio),
  )

  const actualizar = async (nuevo: Pedido) => {
    cache.setQueryData(clave, nuevo)
    await cache.invalidateQueries({ queryKey: ['pedidos-repuestos', tenantId], exact: false })
    await cache.invalidateQueries({ queryKey: ['repuestos', tenantId], exact: false })
    if (nuevo.orden)
      await cache.invalidateQueries({ queryKey: ['ordenes', tenantId], exact: false })
  }

  const accion = useMutation({
    mutationFn: (hacer: () => Promise<Pedido>) => hacer(),
    onSuccess: actualizar,
    meta: {
      error: (error) =>
        error instanceof ORPCError && (error.data as { motivo?: string } | undefined)?.motivo
          ? String((error.data as { motivo: string }).motivo)
          : mensajeGeneral(error),
    },
  })

  async function anular() {
    if (!p) return
    if (
      await confirmar({
        titulo: `¿Anular el ${nombrePedido(p.numero)}?`,
        texto:
          p.estado === 'en_caja'
            ? 'Sale de caja y los repuestos vuelven al stock.'
            : 'No se entrega ni se cobra. No mueve stock.',
        confirmar: 'Anular el pedido',
        peligro: true,
      })
    ) {
      accion.mutate(() => api.pedidosRepuestos.anular({ id }))
    }
  }

  return (
    <Shell
      titulo={p ? `${nombrePedido(p.numero)} · ${destinoPedido(p)}` : 'Pedido de repuestos'}
      requiere={accesoDeRuta(contrato.pedidosRepuestos.ficha)}
    >
      <Link to="/repuestos/pedidos" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todos los pedidos
      </Link>

      {consulta.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {consulta.error instanceof ORPCError && consulta.error.code === 'NO_ENCONTRADO'
            ? 'Ese pedido no existe. Buscalo desde el listado.'
            : mensajeGeneral(consulta.error)}
        </p>
      )}

      {p && (
        <>
          <section
            aria-label="Estado"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-base border border-borde bg-superficie px-3 py-2.5"
          >
            <EstadoPedido estado={p.estado} />
            {p.estado === 'en_caja' && (
              <span className="text-dato text-texto-suave">
                Los repuestos ya salieron del stock: falta facturarlo.
              </span>
            )}
            {p.estado === 'entregado' && p.orden && (
              <span className="text-dato text-texto-suave">
                Pasó a la{' '}
                <Link
                  to="/ordenes/$id"
                  params={{ id: p.orden.id }}
                  className="text-marca hover:underline"
                >
                  OT {seis(p.orden.numero)}
                </Link>
                : se cobra con la orden.
              </span>
            )}
            {p.factura && (
              <span className="inline-flex items-center gap-2 text-dato">
                Facturado con la <b className="font-mono">{nombreComprobante(p.factura)}</b>
                <Boton
                  tamano="chico"
                  icono={<IconoImprimir />}
                  onClick={() => void abrirPdf(p.factura?.id as string)}
                >
                  PDF
                </Boton>
              </span>
            )}
            <span className="ml-auto flex flex-wrap gap-2">
              {puedeEditar && p.estado === 'en_caja' && (
                <Boton
                  tamano="chico"
                  onClick={() => accion.mutate(() => api.pedidosRepuestos.reabrir({ id }))}
                >
                  Sacar de caja
                </Boton>
              )}
              {puedeAnular && ['abierto', 'en_caja'].includes(p.estado) && (
                <Boton
                  tamano="chico"
                  variante="peligro"
                  icono={<IconoAnular />}
                  onClick={() => void anular()}
                >
                  Anular
                </Boton>
              )}
            </span>
          </section>

          <Seccion titulo="Para quién">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3 py-2.5 text-dato md:grid-cols-[auto_1fr_auto_1fr]">
              <Dato nombre="Chasis">
                <span className="inline-flex items-center gap-1 font-mono">
                  {p.chasis}
                  <BotonCopiar valor={p.chasis} que="Chasis" />
                </span>
              </Dato>
              <Dato nombre="Vehículo">
                {p.vehiculo && (
                  <span className="inline-flex items-center gap-2">
                    <Link
                      to="/vehiculos/$id"
                      params={{ id: p.vehiculo.id }}
                      className="inline-flex"
                    >
                      <Patente dominio={p.vehiculo.dominio} />
                    </Link>
                    {[p.vehiculo.marca, p.vehiculo.modelo].filter(Boolean).join(' ')}
                  </span>
                )}
              </Dato>
              <Dato nombre="Va a">
                {p.orden ? (
                  <Link
                    to="/ordenes/$id"
                    params={{ id: p.orden.id }}
                    className="text-marca hover:underline"
                  >
                    OT {seis(p.orden.numero)}
                  </Link>
                ) : (
                  (p.cliente?.razonSocial ?? 'Mostrador · consumidor final')
                )}
              </Dato>
              <Dato nombre="Lo pidió">{p.solicitante}</Dato>
              <Dato nombre="Lo cargó">{p.creadoPor}</Dato>
              <Dato nombre="Nota">{p.nota}</Dato>
            </dl>
          </Seccion>

          <Items
            key={p.id}
            pedido={p}
            editable={puedeEditar && p.estado === 'abierto'}
            guardado={actualizar}
            despachar={(hacer) => accion.mutate(hacer)}
            ocupado={accion.isPending}
          />
        </>
      )}
    </Shell>
  )
}

const renglonVacio = (): Item => ({
  clave: proxima++,
  repuestoId: null,
  codigo: '',
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  codigoAlicuota: 5,
  stock: null,
})

/** Los renglones del pedido. Uno vacío si no tiene y se puede editar: se pega el código y listo. */
function desdePedido(p: Pedido, editable = false): Item[] {
  if (!p.items.length && editable) return [renglonVacio()]
  return p.items.map((i) => ({
    clave: proxima++,
    repuestoId: i.repuestoId,
    codigo: i.codigo ?? '',
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    precioUnitario: sinCeros(i.precioUnitario),
    codigoAlicuota: i.codigoAlicuota as Item['codigoAlicuota'],
    stock: i.stock,
  }))
}

function Items({
  pedido: p,
  editable,
  guardado,
  despachar,
  ocupado,
}: {
  pedido: Pedido
  editable: boolean
  guardado: (p: Pedido) => Promise<void>
  despachar: (hacer: () => Promise<Pedido>) => void
  ocupado: boolean
}) {
  const [items, setItems] = useState<Item[]>(() => desdePedido(p, editable))
  const [nuevo, setNuevo] = useState<number | null>(() => items0(p, editable))
  const [cliente, setCliente] = useState<ClienteElegido | null>(p.cliente)
  const [cambios, setCambios] = useState(false)
  useCambiosSinGuardar(cambios)

  // Al montar ya están los renglones del pedido: rearmarlos cambiaría las claves y el renglón
  // vacío perdería el foco.
  const ultimoGuardado = useRef(p)
  // biome-ignore lint/correctness/useExhaustiveDependencies: se resincroniza sólo cuando cambia el pedido guardado
  useEffect(() => {
    if (ultimoGuardado.current === p) return
    ultimoGuardado.current = p
    if (!cambios) {
      setItems(desdePedido(p, editable))
      setCliente(p.cliente)
    }
  }, [p])

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
    (i) =>
      !i.descripcion.trim() ||
      !esNumero(i.cantidad) ||
      !esNumero(i.precioUnitario) ||
      Number(aDecimal(i.cantidad)) <= 0,
  )

  const guardar = useMutation({
    mutationFn: () =>
      api.pedidosRepuestos.editar({
        id: p.id,
        clienteId: p.orden ? null : (cliente?.id ?? null),
        solicitante: p.solicitante,
        nota: p.nota,
        items: items.map((i) => ({
          repuestoId: i.repuestoId,
          codigo: i.codigo,
          descripcion: i.descripcion.trim(),
          cantidad: aDecimal(i.cantidad),
          precioUnitario: aDecimal(i.precioUnitario),
          codigoAlicuota: i.codigoAlicuota,
        })),
      }),
    onSuccess: async (nuevo) => {
      setCambios(false)
      await guardado(nuevo)
    },
    meta: { exito: 'Pedido guardado' },
  })

  const cambiar = (clave: number, parcial: Partial<Item>) => {
    setCambios(true)
    setItems((xs) => xs.map((x) => (x.clave === clave ? { ...x, ...parcial } : x)))
  }

  /** Engancha el renglón a la pieza del catálogo, con su código, precio, IVA y stock. */
  const elegirDelCatalogo = (clave: number, r: RepuestoElegido) =>
    cambiar(clave, {
      repuestoId: r.id,
      codigo: r.codigo,
      descripcion: r.descripcion,
      precioUnitario: sinCeros(r.precioVenta),
      codigoAlicuota: r.codigoAlicuota as Item['codigoAlicuota'],
      stock: r.stock,
    })

  function agregar() {
    setCambios(true)
    const item = renglonVacio()
    setNuevo(item.clave)
    setItems((xs) => [...xs, item])
  }

  async function quitar(i: Item) {
    if (
      i.descripcion.trim() &&
      !(await confirmar({
        titulo: `¿Quitar «${i.descripcion.trim()}» del pedido?`,
        texto: 'Se quita cuando guardes.',
        confirmar: 'Quitar',
        peligro: true,
      }))
    ) {
      return
    }
    setCambios(true)
    setItems((xs) => xs.filter((x) => x.clave !== i.clave))
  }

  async function despacharPedido() {
    if (cambios || invalidos || !items.length) return
    const faltan = items.filter(
      (i) => i.repuestoId && i.stock !== null && Number(i.stock) < Number(aDecimal(i.cantidad)),
    )
    const aviso = faltan.length
      ? ` Ojo: según el sistema no alcanza el stock de ${faltan.map((f) => f.codigo || f.descripcion).join(', ')}; va a quedar en negativo hasta que se corrija.`
      : ''
    if (p.orden) {
      if (
        await confirmar({
          titulo: `¿Entregar el ${nombrePedido(p.numero)} a la OT ${seis(p.orden.numero)}?`,
          texto: `Los ${items.length} repuestos pasan a la orden por $ ${formatearImporte(total.toFixed(2))} y salen del stock.${aviso}`,
          confirmar: 'Entregar al taller',
        })
      ) {
        despachar(() => api.pedidosRepuestos.entregar({ id: p.id }))
      }
      return
    }
    if (
      await confirmar({
        titulo: `¿Mandar el ${nombrePedido(p.numero)} a caja?`,
        texto: `Se cobra $ ${formatearImporte(total.toFixed(2))} a ${p.cliente?.razonSocial ?? 'consumidor final'}. Los repuestos salen del stock.${aviso}`,
        confirmar: 'Mandar a caja',
      })
    ) {
      despachar(() => api.pedidosRepuestos.aCaja({ id: p.id }))
    }
  }

  const listo = editable && !cambios && !invalidos && items.length > 0

  return (
    <Seccion
      titulo="Repuestos"
      accion={
        <span className="tabular font-mono text-dato">
          Total <b>$ {formatearImporte(total.toFixed(2))}</b>
        </span>
      }
    >
      {editable && !p.orden && (
        <div className="grid gap-3 border-b border-borde-suave px-3 py-2.5 md:grid-cols-[20rem]">
          {
            <SelectorCliente
              etiqueta="Cliente (vacío: consumidor final)"
              valor={cliente}
              onChange={(c) => {
                setCambios(true)
                setCliente(c)
              }}
            />
          }
        </div>
      )}

      {items.length === 0 && (
        <p className="px-3 py-4 text-dato text-texto-suave">
          Todavía no tiene repuestos.
          {editable && ' Agregá uno y pegá el código que devuelve la base de la marca.'}
        </p>
      )}

      {items.length > 0 && (
        <ol aria-label="Repuestos del pedido" className="grid gap-2 px-3 py-2.5">
          {items.map((i, n) => {
            const subtotal =
              esNumero(i.cantidad) && esNumero(i.precioUnitario)
                ? plata(aDecimal(i.cantidad))
                    .times(plata(aDecimal(i.precioUnitario)))
                    .toDecimalPlaces(2)
                    .toFixed(2)
                : null
            const alcanza =
              i.stock === null ||
              !esNumero(i.cantidad) ||
              Number(i.stock) >= Number(aDecimal(i.cantidad))
            const stock =
              i.stock === null ? (
                <span className="text-texto-tenue">Fuera del catálogo</span>
              ) : (
                <span className={alcanza ? 'text-texto-suave' : 'text-critico'}>
                  Stock {cantidad(i.stock)}
                  {!alcanza && ' · no alcanza'}
                </span>
              )
            if (!editable) {
              return (
                <li key={i.clave} className="flex flex-wrap items-baseline gap-x-3 text-dato">
                  <span className="w-28 font-mono text-etiqueta">{i.codigo || '—'}</span>
                  <span className="flex-1">{i.descripcion}</span>
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
                aria-label={`Repuesto ${n + 1}`}
                className="grid items-end gap-2 md:grid-cols-[8rem_1fr_5rem_8rem_6rem_7rem_auto]"
              >
                <Campo
                  etiqueta="Código"
                  value={i.codigo}
                  disabled={Boolean(i.repuestoId)}
                  onChange={(e) => cambiar(i.clave, { codigo: e.target.value })}
                />
                <CampoRepuesto
                  etiqueta="Descripción"
                  valor={i.descripcion}
                  onChange={(texto) => cambiar(i.clave, { descripcion: texto })}
                  codigo={i.codigo || null}
                  vinculado={Boolean(i.repuestoId)}
                  alElegir={(r) => elegirDelCatalogo(i.clave, r)}
                  alSoltar={() => cambiar(i.clave, { repuestoId: null, stock: null })}
                  autoFocus={nuevo === i.clave}
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
                  <span className="text-etiqueta">{stock}</span>
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
          <Boton tamano="chico" accion="global.nuevo" icono={<IconoAgregar />} onClick={agregar}>
            Agregar repuesto
          </Boton>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {invalidos && (
              <span className="text-etiqueta text-critico">
                Cada repuesto necesita descripción, cantidad y precio.
              </span>
            )}
            {cambios && (
              <Boton
                accion="global.guardar"
                variante="principal"
                deshabilitado={invalidos || guardar.isPending}
                onClick={() => guardar.mutate()}
              >
                Guardar
              </Boton>
            )}
            {!cambios && (
              <Boton
                accion="repuestos.despachar"
                variante="principal"
                deshabilitado={!listo || ocupado}
                onClick={() => void despacharPedido()}
              >
                {p.orden ? 'Entregar al taller' : 'Mandar a caja'}
              </Boton>
            )}
          </span>
        </footer>
      )}
    </Seccion>
  )
}

/** El foco va al renglón vacío con el que arranca un pedido nuevo. */
function items0(p: Pedido, editable: boolean) {
  return !p.items.length && editable ? proxima - 1 : null
}
