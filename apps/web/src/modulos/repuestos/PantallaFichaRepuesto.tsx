import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { BotonCopiar } from '../../componentes/Copiar.tsx'
import { IconoEditar, IconoTransferir, IconoVolver } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo } from '../../teclado/index.ts'
import { ALICUOTAS } from '../caja/comprobantes.ts'
import { FormularioRepuesto, Stock } from './PantallaRepuestos.tsx'
import { aDecimal, cantidad, esNumero, TIPOS_MOVIMIENTO } from './repuestos.ts'

const ruta = getRouteApi('/con-sesion/repuestos/$id')

type Detalle = Awaited<ReturnType<typeof api.repuestos.ficha>>
type Panel = null | 'modificar' | 'ajustar' | 'transferir' | 'ubicar'

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * La ficha de un repuesto: qué es, cuánto hay en cada sucursal, y cada pieza que entró o salió
 * con quién la movió. Desde acá se corrige el stock con lo que se contó y se manda a otra
 * sucursal (`F9` muestra el stock de las demás).
 */
export function PantallaFichaRepuesto() {
  const { id } = ruta.useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursal = usarSesion((e) => e.datos?.sucursalActiva)
  const cache = useQueryClient()
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const puedeEditar = usePuedeUsar(contrato.repuestos.editar)
  const [panel, setPanel] = useState<Panel>(null)

  const clave = ['repuestos', tenantId, sucursal?.id, 'ficha', id]
  const consulta = useQuery({ queryKey: clave, queryFn: () => api.repuestos.ficha({ id }) })
  const r = consulta.data

  const guardado = async (nuevo?: Detalle) => {
    if (nuevo) cache.setQueryData(clave, nuevo)
    await cache.invalidateQueries({ queryKey: ['repuestos', tenantId], exact: false })
    setPanel(null)
  }

  useAtajo(
    'repuestos.verStock',
    () => document.getElementById('stock-sucursales')?.scrollIntoView({ block: 'start' }),
    Boolean(r),
  )

  return (
    <Shell
      titulo={r ? `${r.codigo} · ${r.descripcion}` : 'Repuesto'}
      requiere={accesoDeRuta(contrato.repuestos.ficha)}
      acciones={
        r && puedeEditar && !panel ? (
          <>
            <Boton icono={<IconoEditar />} onClick={() => setPanel('modificar')}>
              Modificar
            </Boton>
            <Boton onClick={() => setPanel('ajustar')}>Ajustar stock</Boton>
            <Boton icono={<IconoTransferir />} onClick={() => setPanel('transferir')}>
              Mandar a otra sucursal
            </Boton>
          </>
        ) : undefined
      }
    >
      <Link to="/repuestos" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todo el catálogo
      </Link>

      {consulta.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {consulta.error instanceof ORPCError && consulta.error.code === 'NO_ENCONTRADO'
            ? 'Ese repuesto no existe. Buscalo desde el catálogo.'
            : mensajeGeneral(consulta.error)}
        </p>
      )}

      {r && (
        <>
          {panel === 'modificar' && (
            <FormularioRepuesto
              repuesto={r}
              alTerminar={(n) => void (n ? guardado(n) : setPanel(null))}
            />
          )}
          {panel === 'ajustar' && <Ajustar repuesto={r} alTerminar={guardado} />}
          {panel === 'transferir' && <Transferir repuesto={r} alTerminar={guardado} />}
          {panel === 'ubicar' && <Ubicar repuesto={r} alTerminar={guardado} />}

          <div className="grid gap-3 md:grid-cols-2">
            <Seccion titulo="Datos">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3 py-2.5 text-dato">
                <Dato nombre="Código">
                  <span className="inline-flex items-center gap-1 font-mono">
                    {r.codigo}
                    <BotonCopiar valor={r.codigo} que="Código" />
                  </span>
                </Dato>
                <Dato nombre="Descripción">
                  {r.descripcion}
                  {!r.activo && (
                    <span className="ml-2 text-etiqueta text-atencion">Desactivado</span>
                  )}
                </Dato>
                <Dato nombre="Marca">{r.marca}</Dato>
                <Dato nombre="Rubro">{r.rubro}</Dato>
                <Dato nombre="Aplicación">{r.aplicacion}</Dato>
                <Dato nombre="Precio final">
                  <span className="tabular font-mono">$ {formatearImporte(r.precioVenta)}</span>{' '}
                  <span className="text-etiqueta text-texto-tenue">
                    IVA {ALICUOTAS.find((a) => a.valor === r.codigoAlicuota)?.texto}
                  </span>
                </Dato>
                <Dato nombre="Costo">
                  {r.costo && (
                    <span className="tabular font-mono">$ {formatearImporte(r.costo)} sin IVA</span>
                  )}
                </Dato>
                <Dato nombre="Proveedor">{r.proveedor?.razonSocial}</Dato>
                <Dato nombre="Observaciones">{r.observaciones}</Dato>
              </dl>
            </Seccion>

            <Seccion
              titulo={`En ${sucursal?.nombre ?? 'esta sucursal'}`}
              accion={
                puedeEditar && !panel ? (
                  <Boton tamano="chico" onClick={() => setPanel('ubicar')}>
                    Ubicación y mínimo
                  </Boton>
                ) : undefined
              }
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3 py-2.5 text-dato">
                <Dato nombre="Stock">
                  <b className="tabular font-mono text-lg">
                    <Stock repuesto={r} />
                  </b>
                </Dato>
                <Dato nombre="Ubicación">{r.ubicacion}</Dato>
                <Dato nombre="Mínimo">{r.minimo}</Dato>
              </dl>
              <div id="stock-sucursales" className="border-t border-borde-suave px-3 py-2">
                <h3 className="mb-1 text-etiqueta font-medium text-texto-tenue">
                  Todas las sucursales
                </h3>
                <ul className="grid gap-1 text-dato">
                  {r.stocks.map((s) => (
                    <li key={s.sucursalId} className="flex items-baseline gap-2">
                      <span className={s.sucursalId === sucursal?.id ? 'font-semibold' : ''}>
                        {s.sucursal}
                      </span>
                      {s.ubicacion && (
                        <span className="text-etiqueta text-texto-tenue">{s.ubicacion}</span>
                      )}
                      <span
                        className={`tabular ml-auto font-mono ${Number(s.cantidad) <= 0 ? 'text-texto-tenue' : ''}`}
                      >
                        {cantidad(s.cantidad)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Seccion>
          </div>

          <Seccion titulo="Movimientos">
            {r.movimientos.length === 0 && (
              <p className="px-3 py-4 text-dato text-texto-suave">
                Todavía no entró ni salió nada en esta sucursal.
              </p>
            )}
            {r.movimientos.length > 0 && esEscritorio && (
              <table className="w-full text-dato">
                <thead>
                  <tr className="text-left text-etiqueta text-texto-tenue">
                    {['Fecha', 'Qué', 'Detalle', 'Quién', 'Cantidad', 'Queda'].map((c) => (
                      <th
                        key={c}
                        className={`border-b border-borde px-3 py-1.5 font-medium ${['Cantidad', 'Queda'].includes(c) ? 'text-right' : ''}`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.movimientos.map((m) => (
                    <tr key={m.id}>
                      <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                        {fechaHora(m.fecha)}
                      </td>
                      <td className="h-fila border-b border-borde-suave px-3">
                        {TIPOS_MOVIMIENTO[m.tipo]}
                      </td>
                      <td className="h-fila border-b border-borde-suave px-3">
                        <Referencia movimiento={m} />
                        {m.motivo && <span className="text-texto-tenue"> · {m.motivo}</span>}
                      </td>
                      <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                        {m.usuario}
                      </td>
                      <td
                        className={`tabular h-fila border-b border-borde-suave px-3 text-right font-mono ${Number(m.cantidad) < 0 ? 'text-critico' : 'text-ok'}`}
                      >
                        {Number(m.cantidad) > 0 ? '+' : ''}
                        {cantidad(m.cantidad)}
                      </td>
                      <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                        {cantidad(m.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.movimientos.length > 0 && !esEscritorio && (
              <ul className="divide-y divide-borde-suave">
                {r.movimientos.map((m) => (
                  <li key={m.id} className="grid gap-0.5 px-3 py-2">
                    <div className="flex items-baseline gap-2 text-dato">
                      <Referencia movimiento={m} />
                      <span
                        className={`tabular ml-auto font-mono ${Number(m.cantidad) < 0 ? 'text-critico' : 'text-ok'}`}
                      >
                        {Number(m.cantidad) > 0 ? '+' : ''}
                        {cantidad(m.cantidad)}
                      </span>
                    </div>
                    <span className="text-etiqueta text-texto-tenue">
                      {fechaHora(m.fecha)} · {m.usuario} · queda {cantidad(m.saldo)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        </>
      )}
    </Shell>
  )
}

function Referencia({ movimiento: m }: { movimiento: Detalle['movimientos'][number] }) {
  if (m.referencia?.tipo === 'orden') {
    return (
      <Link
        to="/ordenes/$id"
        params={{ id: m.referencia.id }}
        className="text-marca hover:underline"
      >
        {m.detalle}
      </Link>
    )
  }
  if (m.referencia?.tipo === 'pedido') {
    return (
      <Link
        to="/repuestos/pedidos/$id"
        params={{ id: m.referencia.id }}
        className="text-marca hover:underline"
      >
        {m.detalle}
      </Link>
    )
  }
  if (m.referencia?.tipo === 'compra') {
    return (
      <Link
        to="/repuestos/compras/$id"
        params={{ id: m.referencia.id }}
        className="text-marca hover:underline"
      >
        {m.detalle}
      </Link>
    )
  }
  return <span>{m.detalle}</span>
}

export function Seccion({
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

export function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-etiqueta text-texto-tenue">{nombre}</dt>
      <dd>{children || <span className="text-texto-tenue">—</span>}</dd>
    </>
  )
}

function Panel({
  titulo,
  children,
  alGuardar,
  alCancelar,
  ocupado,
}: {
  titulo: string
  children: ReactNode
  alGuardar: () => void
  alCancelar: () => void
  ocupado: boolean
}) {
  useAtajo('global.guardar', alGuardar)
  useAtajo('global.cancelar', alCancelar)
  return (
    <section
      aria-label={titulo}
      className="grid gap-3 rounded-base border border-marca bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">{titulo}</h2>
      {children}
      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={ocupado}
          onClick={alGuardar}
        >
          Guardar
        </Boton>
        <Boton accion="global.cancelar" onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>
    </section>
  )
}

function Ajustar({
  repuesto: r,
  alTerminar,
}: {
  repuesto: Detalle
  alTerminar: (n?: Detalle) => Promise<void>
}) {
  const [contado, setContado] = useState('')
  const [motivo, setMotivo] = useState('')
  const [tocado, setTocado] = useState(false)
  const ajustar = useMutation({
    mutationFn: () => api.repuestos.ajustar({ id: r.id, contado: aDecimal(contado), motivo }),
    onSuccess: (n) => alTerminar(n),
    meta: { exito: 'Stock corregido' },
  })
  const diferencia = esNumero(contado) ? Number(aDecimal(contado)) - Number(r.stock) : null

  async function guardar() {
    setTocado(true)
    if (!esNumero(contado) || motivo.trim().length < 3) return
    if (
      await confirmar({
        titulo: `¿Dejar el stock de ${r.codigo} en ${contado}?`,
        texto: `El sistema dice ${r.stock}. La diferencia (${diferencia !== null && diferencia > 0 ? '+' : ''}${diferencia}) queda en los movimientos, a tu nombre, con el motivo.`,
        confirmar: 'Corregir el stock',
      })
    ) {
      ajustar.mutate()
    }
  }

  return (
    <Panel
      titulo="Ajustar el stock con lo que se contó"
      alGuardar={() => void guardar()}
      alCancelar={() => void alTerminar()}
      ocupado={ajustar.isPending}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Campo
          etiqueta="Lo que hay de verdad"
          inputMode="decimal"
          autoFocus
          value={contado}
          onChange={(e) => setContado(e.target.value)}
          ayuda={`El sistema dice ${r.stock}`}
          aria-invalid={tocado && !esNumero(contado)}
        />
        <div className="md:col-span-2">
          <Campo
            etiqueta="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            ayuda={
              tocado && motivo.trim().length < 3
                ? 'Anotá por qué: recuento, rotura, devolución…'
                : 'Queda en los movimientos'
            }
            aria-invalid={tocado && motivo.trim().length < 3}
          />
        </div>
      </div>
    </Panel>
  )
}

function Transferir({
  repuesto: r,
  alTerminar,
}: {
  repuesto: Detalle
  alTerminar: (n?: Detalle) => Promise<void>
}) {
  const actual = usarSesion((e) => e.datos?.sucursalActiva.id)
  const otras = r.stocks.filter((s) => s.sucursalId !== actual)
  const [destino, setDestino] = useState<string | null>(otras[0]?.sucursalId ?? null)
  const [cuantas, setCuantas] = useState('1')
  const [motivo, setMotivo] = useState('')
  const transferir = useMutation({
    mutationFn: () =>
      api.repuestos.transferir({
        id: r.id,
        sucursalId: destino as string,
        cantidad: aDecimal(cuantas),
        motivo,
      }),
    onSuccess: (n) => alTerminar(n),
    meta: { exito: 'Repuestos enviados' },
  })
  const listo = Boolean(destino) && esNumero(cuantas) && Number(aDecimal(cuantas)) > 0

  if (!otras.length) {
    return (
      <Panel
        titulo="Mandar a otra sucursal"
        alGuardar={() => undefined}
        alCancelar={() => void alTerminar()}
        ocupado
      >
        <p className="text-dato text-texto-suave">
          La concesionaria tiene una sola sucursal activa.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      titulo="Mandar a otra sucursal"
      alGuardar={() => listo && transferir.mutate()}
      alCancelar={() => void alTerminar()}
      ocupado={transferir.isPending || !listo}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Selector
          etiqueta="A qué sucursal"
          valor={destino}
          onChange={setDestino}
          opciones={otras.map((s) => ({
            valor: s.sucursalId,
            texto: `${s.sucursal} (tiene ${cantidad(s.cantidad)})`,
          }))}
        />
        <Campo
          etiqueta="Cuántas"
          inputMode="decimal"
          value={cuantas}
          onChange={(e) => setCuantas(e.target.value)}
          ayuda={`Acá hay ${r.stock}`}
        />
        <Campo
          etiqueta="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          ayuda="Opcional: «para la OT 123 de Rafaela»"
        />
      </div>
    </Panel>
  )
}

function Ubicar({
  repuesto: r,
  alTerminar,
}: {
  repuesto: Detalle
  alTerminar: (n?: Detalle) => Promise<void>
}) {
  const [ubicacion, setUbicacion] = useState(r.ubicacion ?? '')
  const [minimo, setMinimo] = useState(r.minimo ?? '')
  const ubicar = useMutation({
    mutationFn: () =>
      api.repuestos.ubicar({
        id: r.id,
        ubicacion,
        minimo: minimo.trim() ? aDecimal(minimo) : null,
      }),
    onSuccess: (n) => alTerminar(n),
    meta: { exito: 'Guardado' },
  })
  return (
    <Panel
      titulo="Ubicación y mínimo en esta sucursal"
      alGuardar={() => ubicar.mutate()}
      alCancelar={() => void alTerminar()}
      ocupado={ubicar.isPending}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Campo
          etiqueta="Ubicación"
          autoFocus
          value={ubicacion}
          onChange={(e) => setUbicacion(e.target.value)}
          ayuda="Estante 4, cajón B"
        />
        <Campo
          etiqueta="Mínimo"
          inputMode="decimal"
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
          ayuda="Vacío: no avisa"
        />
      </div>
    </Panel>
  )
}
