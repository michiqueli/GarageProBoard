import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte, plata } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { EstadoPedido } from '../../componentes/EstadoPedido.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { IconoAgregar, IconoBorrar } from '../../componentes/iconos.tsx'
import { type ProveedorElegido, SelectorProveedor } from '../../componentes/SelectorProveedor.tsx'
import { SelectorRepuesto } from '../../componentes/SelectorRepuesto.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { PestanasRepuestos } from './Pestanas.tsx'
import { aDecimal, esNumero, nombreCompra, seis } from './repuestos.ts'

type Filtro = 'pedida' | 'recibida' | 'todas'

const FILTROS: Array<{ valor: Filtro; texto: string }> = [
  { valor: 'pedida', texto: 'Esperando que lleguen' },
  { valor: 'recibida', texto: 'Recibidas' },
  { valor: 'todas', texto: 'Todas' },
]

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR')

/**
 * Lo que se le pidió a los proveedores y lo que llegó. `Ins` carga una compra nueva: un pedido
 * a fábrica, o la mercadería que ya está en el depósito con su factura.
 */
export function PantallaCompras() {
  const navegar = useNavigate()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const puedeVer = usePuedeUsar(contrato.compras.listar)
  const puedeCrear = usePuedeUsar(contrato.compras.crear)
  const [filtro, setFiltro] = useState<Filtro>('pedida')
  const [buscar, setBuscar] = useState('')
  const [nueva, setNueva] = useState(false)
  const texto = buscar.trim()

  const consulta = useQuery({
    queryKey: ['compras', tenantId, sucursalId, filtro, texto],
    queryFn: () =>
      api.compras.listar({
        pagina: 1,
        porPagina: 100,
        estado: filtro,
        ...(texto ? { buscar: texto } : {}),
      }),
    enabled: puedeVer,
  })
  const datos = consulta.data?.datos ?? []

  return (
    <Shell
      titulo="Compras de repuestos"
      requiere={accesoDeRuta(contrato.compras.listar)}
      acciones={
        puedeCrear && !nueva ? (
          <Boton
            accion="global.nuevo"
            variante="principal"
            icono={<IconoAgregar />}
            onClick={() => setNueva(true)}
          >
            Nueva compra
          </Boton>
        ) : undefined
      }
    >
      <PestanasRepuestos />
      {nueva && <NuevaCompra alTerminar={() => setNueva(false)} />}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2 border-b border-borde px-3 py-2">
          <div role="radiogroup" aria-label="Qué compras" className="flex flex-wrap gap-1">
            {FILTROS.map((f) => (
              <label
                key={f.valor}
                className={`inline-flex h-7 cursor-pointer items-center rounded-base border px-2.5 text-etiqueta ${
                  filtro === f.valor
                    ? 'border-marca bg-marca-suave font-semibold text-marca'
                    : 'border-borde text-texto-suave'
                }`}
              >
                <input
                  type="radio"
                  name="filtro-compras"
                  className="sr-only"
                  checked={filtro === f.valor}
                  onChange={() => setFiltro(f.valor)}
                />
                {f.texto}
              </label>
            ))}
          </div>
          <input
            type="search"
            aria-label="Buscar compras"
            placeholder="Número, proveedor o factura"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="h-7 w-full rounded-base border border-borde bg-superficie-2 px-2 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca md:ml-auto md:w-64"
          />
        </header>

        {consulta.isPending && (
          <div className="m-3 h-24 animate-pulse rounded-base bg-superficie-2" />
        )}
        {consulta.isError && (
          <p role="alert" className="px-3 py-3 text-dato text-critico">
            {mensajeGeneral(consulta.error)}
          </p>
        )}
        {consulta.data && datos.length === 0 && (
          <p className="px-3 py-4 text-dato text-texto-suave">
            {texto
              ? `Ninguna compra coincide con «${texto}».`
              : filtro === 'pedida'
                ? 'No hay nada pedido esperando que llegue.'
                : 'No hay compras.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {[
                  'Compra',
                  'Proveedor',
                  'Factura o remito',
                  'Fecha',
                  'Estado',
                  'Total sin IVA',
                ].map((c) => (
                  <th
                    key={c}
                    className={`border-b border-borde px-3 py-1.5 font-medium ${c === 'Total sin IVA' ? 'text-right' : ''}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((c) => (
                <tr
                  key={c.id}
                  className={FILA_CLICABLE}
                  onClick={clicEnFila(
                    () => void navegar({ to: '/repuestos/compras/$id', params: { id: c.id } }),
                  )}
                >
                  <td className="h-fila border-b border-borde-suave px-3 font-mono">
                    <Link
                      to="/repuestos/compras/$id"
                      params={{ id: c.id }}
                      className="text-marca hover:underline focus-visible:underline"
                    >
                      {nombreCompra(c.numero)}
                    </Link>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    {c.proveedor.razonSocial}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta text-texto-suave">
                    {c.comprobanteProveedor ?? '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {fecha(c.recibidaEn ?? c.creadoEn)}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <EstadoPedido estado={c.estado} />
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                    $ {formatearImporte(c.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((c) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se entra por el enlace de la fila
              <li
                key={c.id}
                className={`grid gap-1 px-3 py-2.5 ${FILA_CLICABLE}`}
                onClick={clicEnFila(
                  () => void navegar({ to: '/repuestos/compras/$id', params: { id: c.id } }),
                )}
              >
                <div className="flex items-center gap-2">
                  <Link
                    to="/repuestos/compras/$id"
                    params={{ id: c.id }}
                    className="font-mono text-dato text-marca"
                  >
                    {nombreCompra(c.numero)}
                  </Link>
                  <span className="ml-auto">
                    <EstadoPedido estado={c.estado} />
                  </span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  {c.proveedor.razonSocial} · $ {formatearImporte(c.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

interface Renglon {
  repuestoId: string
  codigo: string
  descripcion: string
  cantidad: string
  costoUnitario: string
}

function NuevaCompra({ alTerminar }: { alTerminar: () => void }) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const navegar = useNavigate()
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(null)
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [nota, setNota] = useState('')
  const [yaLlego, setYaLlego] = useState(false)
  const [comprobante, setComprobante] = useState('')
  const [fechaComprobante, setFechaComprobante] = useState('')
  const [tocado, setTocado] = useState(false)

  const total = useMemo(
    () =>
      renglones.reduce(
        (a, r) =>
          esNumero(r.cantidad) && esNumero(r.costoUnitario)
            ? a.plus(
                plata(aDecimal(r.cantidad))
                  .times(plata(aDecimal(r.costoUnitario)))
                  .toDecimalPlaces(2),
              )
            : a,
        plata('0'),
      ),
    [renglones],
  )

  const falta = !proveedor
    ? 'Elegí el proveedor.'
    : !renglones.length
      ? 'Agregá los repuestos.'
      : renglones.some(
            (r) =>
              !esNumero(r.cantidad) ||
              Number(aDecimal(r.cantidad)) <= 0 ||
              !esNumero(r.costoUnitario),
          )
        ? 'Cada repuesto necesita cantidad y costo.'
        : yaLlego && comprobante.trim().length < 3
          ? 'Anotá la factura o el remito del proveedor.'
          : null

  const crear = useMutation({
    mutationFn: () =>
      api.compras.crear({
        proveedorId: proveedor?.id as string,
        nota,
        renglones: renglones.map((r) => ({
          repuestoId: r.repuestoId,
          cantidad: aDecimal(r.cantidad),
          costoUnitario: aDecimal(r.costoUnitario),
        })),
        recepcion: yaLlego
          ? { comprobanteProveedor: comprobante, fechaComprobante: fechaComprobante || null }
          : null,
      }),
    onSuccess: async (c) => {
      await cache.invalidateQueries({ queryKey: ['compras', tenantId] })
      await cache.invalidateQueries({ queryKey: ['repuestos', tenantId] })
      alTerminar()
      void navegar({ to: '/repuestos/compras/$id', params: { id: c.id } })
    },
    meta: {
      exito: (c) => {
        const x = c as { numero: number; estado: string }
        return x.estado === 'recibida'
          ? `Compra ${seis(x.numero)} recibida: entró al stock`
          : `Compra ${seis(x.numero)} cargada`
      },
    },
  })

  async function guardar() {
    setTocado(true)
    if (falta) return
    if (
      yaLlego &&
      !(await confirmar({
        titulo: `¿Recibir ${renglones.length} repuestos de ${proveedor?.razonSocial}?`,
        texto: `Entran al stock de esta sucursal con ${comprobante}, por $ ${formatearImporte(total.toFixed(2))} sin IVA. El costo de cada repuesto pasa a ser el de esta compra.`,
        confirmar: 'Recibir',
      }))
    ) {
      return
    }
    crear.mutate()
  }

  return (
    <section
      aria-label="Nueva compra"
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">Nueva compra</h2>
      <div className="grid gap-3 md:grid-cols-[20rem_1fr]">
        <SelectorProveedor
          etiqueta="Proveedor"
          valor={proveedor}
          onChange={setProveedor}
          autoFocus
        />
        <SelectorRepuesto
          etiqueta="Agregar del catálogo"
          alElegir={(r) =>
            setRenglones((xs) =>
              xs.some((x) => x.repuestoId === r.id)
                ? xs
                : [
                    ...xs,
                    {
                      repuestoId: r.id,
                      codigo: r.codigo,
                      descripcion: r.descripcion,
                      cantidad: '1',
                      costoUnitario: '',
                    },
                  ],
            )
          }
        />
      </div>

      {renglones.length > 0 && (
        <ol aria-label="Repuestos de la compra" className="grid gap-2">
          {renglones.map((r, n) => (
            <li
              key={r.repuestoId}
              className="grid items-end gap-2 md:grid-cols-[8rem_1fr_6rem_9rem_auto]"
            >
              <span className="flex h-campo items-center font-mono text-etiqueta">{r.codigo}</span>
              <span className="flex h-campo items-center text-dato">{r.descripcion}</span>
              <Campo
                etiqueta="Cantidad"
                inputMode="decimal"
                value={r.cantidad}
                onChange={(e) =>
                  setRenglones((xs) =>
                    xs.map((x, i) => (i === n ? { ...x, cantidad: e.target.value } : x)),
                  )
                }
              />
              <Campo
                etiqueta="Costo sin IVA"
                inputMode="decimal"
                value={r.costoUnitario}
                onChange={(e) =>
                  setRenglones((xs) =>
                    xs.map((x, i) => (i === n ? { ...x, costoUnitario: e.target.value } : x)),
                  )
                }
              />
              <Boton
                tamano="chico"
                variante="sutil"
                icono={<IconoBorrar />}
                onClick={() => setRenglones((xs) => xs.filter((_, i) => i !== n))}
              >
                Quitar
              </Boton>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex items-center gap-2 self-end pb-2 text-dato">
          <input
            type="checkbox"
            className="accent-marca"
            checked={yaLlego}
            onChange={(e) => setYaLlego(e.target.checked)}
          />
          Ya llegó: entra al stock
        </label>
        {yaLlego && (
          <>
            <Campo
              etiqueta="Factura o remito"
              value={comprobante}
              onChange={(e) => setComprobante(e.target.value)}
              ayuda="FA A 0003-00012345"
            />
            <Campo
              etiqueta="Fecha"
              type="date"
              value={fechaComprobante}
              onChange={(e) => setFechaComprobante(e.target.value)}
            />
          </>
        )}
        <div className={yaLlego ? '' : 'md:col-span-3'}>
          <Campo etiqueta="Nota" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={crear.isPending}
          onClick={() => void guardar()}
        >
          {yaLlego ? 'Recibir' : 'Guardar el pedido'}
        </Boton>
        <Boton accion="global.cancelar" onClick={alTerminar}>
          Cancelar
        </Boton>
        <span className="tabular font-mono text-dato">
          Total $ {formatearImporte(total.toFixed(2))} sin IVA
        </span>
        {tocado && falta && <span className="text-etiqueta text-critico">{falta}</span>}
      </div>
    </section>
  )
}
