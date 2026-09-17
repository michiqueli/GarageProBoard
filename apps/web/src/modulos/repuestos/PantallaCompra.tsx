import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { EstadoPedido } from '../../componentes/EstadoPedido.tsx'
import { IconoAnular, IconoVolver } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { Dato, Seccion } from './PantallaFichaRepuesto.tsx'
import { aDecimal, type Compra, esNumero, nombreCompra, sinCeros } from './repuestos.ts'

const ruta = getRouteApi('/con-sesion/repuestos/compras/$id')

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : null

/**
 * Una compra a un proveedor. Mientras no llegó se recibe desde acá (`F4`): se anota la factura
 * y, renglón por renglón, lo que llegó de verdad y a qué costo.
 */
export function PantallaCompra() {
  const { id } = ruta.useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const puedeRecibir = usePuedeUsar(contrato.compras.recibir)
  const puedeAnular = usePuedeUsar(contrato.compras.anular)
  const [recibiendo, setRecibiendo] = useState(false)

  const clave = ['compras', tenantId, 'ficha', id]
  const consulta = useQuery({ queryKey: clave, queryFn: () => api.compras.ficha({ id }) })
  const c = consulta.data

  const actualizar = async (nueva: Compra) => {
    cache.setQueryData(clave, nueva)
    await cache.invalidateQueries({ queryKey: ['compras', tenantId], exact: false })
    await cache.invalidateQueries({ queryKey: ['repuestos', tenantId], exact: false })
    setRecibiendo(false)
  }

  const anular = useMutation({
    mutationFn: () => api.compras.anular({ id }),
    onSuccess: actualizar,
    meta: { exito: 'Compra anulada' },
  })

  return (
    <Shell
      titulo={c ? `${nombreCompra(c.numero)} · ${c.proveedor.razonSocial}` : 'Compra'}
      requiere={accesoDeRuta(contrato.compras.ficha)}
    >
      <Link to="/repuestos/compras" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todas las compras
      </Link>

      {consulta.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {consulta.error instanceof ORPCError && consulta.error.code === 'NO_ENCONTRADA'
            ? 'Esa compra no existe.'
            : mensajeGeneral(consulta.error)}
        </p>
      )}

      {c && (
        <>
          <section
            aria-label="Estado"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-base border border-borde bg-superficie px-3 py-2.5"
          >
            <EstadoPedido estado={c.estado} />
            <span className="ml-auto flex flex-wrap gap-2">
              {puedeRecibir && c.estado === 'pedida' && !recibiendo && (
                <Boton
                  accion="repuestos.despachar"
                  variante="principal"
                  onClick={() => setRecibiendo(true)}
                >
                  Recibir la mercadería
                </Boton>
              )}
              {puedeAnular && c.estado === 'pedida' && !recibiendo && (
                <Boton
                  tamano="chico"
                  variante="sutil"
                  icono={<IconoAnular />}
                  onClick={async () => {
                    if (
                      await confirmar({
                        titulo: `¿Anular la ${nombreCompra(c.numero)}?`,
                        texto: 'No llegó y no va a llegar. No mueve stock.',
                        confirmar: 'Anular la compra',
                        peligro: true,
                      })
                    ) {
                      anular.mutate()
                    }
                  }}
                >
                  Anular
                </Boton>
              )}
            </span>
          </section>

          {recibiendo ? (
            <Recibir compra={c} alTerminar={actualizar} alCancelar={() => setRecibiendo(false)} />
          ) : (
            <>
              <Seccion titulo="Datos">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3 py-2.5 text-dato md:grid-cols-[auto_1fr_auto_1fr]">
                  <Dato nombre="Proveedor">{c.proveedor.razonSocial}</Dato>
                  <Dato nombre="Factura o remito">
                    {c.comprobanteProveedor && (
                      <span className="font-mono">{c.comprobanteProveedor}</span>
                    )}
                  </Dato>
                  <Dato nombre="La cargó">{`${c.creadoPor} · ${fecha(c.creadoEn)}`}</Dato>
                  <Dato nombre="La recibió">
                    {c.recibidaPor && `${c.recibidaPor} · ${fecha(c.recibidaEn)}`}
                  </Dato>
                  <Dato nombre="Nota">{c.nota}</Dato>
                </dl>
              </Seccion>
              <Seccion
                titulo="Repuestos"
                accion={
                  <span className="tabular font-mono text-dato">
                    Total <b>$ {formatearImporte(c.total)}</b> sin IVA
                  </span>
                }
              >
                <table className="w-full text-dato">
                  <thead>
                    <tr className="text-left text-etiqueta text-texto-tenue">
                      {['Código', 'Descripción', 'Pedido', 'Llegó', 'Costo', 'Total'].map((x) => (
                        <th
                          key={x}
                          className={`border-b border-borde px-3 py-1.5 font-medium ${['Pedido', 'Llegó', 'Costo', 'Total'].includes(x) ? 'text-right' : ''}`}
                        >
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.renglones.map((r) => (
                      <tr key={r.id}>
                        <td className="h-fila border-b border-borde-suave px-3 font-mono">
                          <Link
                            to="/repuestos/$id"
                            params={{ id: r.repuesto.id }}
                            className="text-marca hover:underline"
                          >
                            {r.repuesto.codigo}
                          </Link>
                        </td>
                        <td className="h-fila border-b border-borde-suave px-3">
                          {r.repuesto.descripcion}
                        </td>
                        <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                          {r.cantidad}
                        </td>
                        <td
                          className={`tabular h-fila border-b border-borde-suave px-3 text-right font-mono ${r.cantidadRecibida !== null && Number(r.cantidadRecibida) < Number(r.cantidad) ? 'text-atencion' : ''}`}
                        >
                          {r.cantidadRecibida ?? '—'}
                        </td>
                        <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                          $ {formatearImporte(r.costoUnitario)}
                        </td>
                        <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                          $ {formatearImporte(r.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Seccion>
            </>
          )}
        </>
      )}
    </Shell>
  )
}

function Recibir({
  compra: c,
  alTerminar,
  alCancelar,
}: {
  compra: Compra
  alTerminar: (c: Compra) => Promise<void>
  alCancelar: () => void
}) {
  const [comprobante, setComprobante] = useState('')
  const [fechaComprobante, setFecha] = useState('')
  const [renglones, setRenglones] = useState(
    c.renglones.map((r) => ({
      id: r.id,
      codigo: r.repuesto.codigo,
      descripcion: r.repuesto.descripcion,
      pedido: r.cantidad,
      llego: r.cantidad,
      costo: sinCeros(r.costoUnitario),
    })),
  )
  const [tocado, setTocado] = useState(false)

  const recibir = useMutation({
    mutationFn: () =>
      api.compras.recibir({
        id: c.id,
        comprobanteProveedor: comprobante,
        fechaComprobante: fechaComprobante || null,
        renglones: renglones.map((r) => ({
          id: r.id,
          cantidadRecibida: aDecimal(r.llego) || '0',
          costoUnitario: aDecimal(r.costo),
        })),
      }),
    onSuccess: alTerminar,
    meta: { exito: 'Mercadería recibida: entró al stock' },
  })

  const falta =
    comprobante.trim().length < 3
      ? 'Anotá la factura o el remito del proveedor.'
      : renglones.some((r) => !esNumero(r.llego || '0') || !esNumero(r.costo))
        ? 'Cada renglón necesita lo que llegó (0 si no vino) y el costo.'
        : renglones.every((r) => Number(aDecimal(r.llego || '0')) === 0)
          ? 'No llegó nada: si no va a llegar, anulala.'
          : null

  async function guardar() {
    setTocado(true)
    if (falta) return
    const incompletos = renglones.filter((r) => Number(aDecimal(r.llego || '0')) < Number(r.pedido))
    if (
      await confirmar({
        titulo: `¿Recibir la ${nombreCompra(c.numero)}?`,
        texto: `Entra al stock con ${comprobante}.${incompletos.length ? ` De ${incompletos.length} repuestos llegó menos de lo pedido: lo que falta no entra.` : ''}`,
        confirmar: 'Recibir',
      })
    ) {
      recibir.mutate()
    }
  }

  return (
    <section
      aria-label="Recibir la mercadería"
      className="grid gap-3 rounded-base border border-marca bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">Recibir la mercadería</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Campo
          etiqueta="Factura o remito"
          autoFocus
          value={comprobante}
          onChange={(e) => setComprobante(e.target.value)}
          ayuda="FA A 0003-00012345"
          aria-invalid={tocado && comprobante.trim().length < 3}
        />
        <Campo
          etiqueta="Fecha"
          type="date"
          value={fechaComprobante}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>
      <ol aria-label="Lo que llegó" className="grid gap-2">
        {renglones.map((r, n) => (
          <li key={r.id} className="grid items-end gap-2 md:grid-cols-[8rem_1fr_5rem_6rem_9rem]">
            <span className="flex h-campo items-center font-mono text-etiqueta">{r.codigo}</span>
            <span className="flex h-campo items-center text-dato">{r.descripcion}</span>
            <span className="flex h-campo items-center justify-end font-mono text-etiqueta text-texto-suave">
              pidió {r.pedido}
            </span>
            <Campo
              etiqueta="Llegó"
              inputMode="decimal"
              value={r.llego}
              onChange={(e) =>
                setRenglones((xs) =>
                  xs.map((x, i) => (i === n ? { ...x, llego: e.target.value } : x)),
                )
              }
            />
            <Campo
              etiqueta="Costo sin IVA"
              inputMode="decimal"
              value={r.costo}
              onChange={(e) =>
                setRenglones((xs) =>
                  xs.map((x, i) => (i === n ? { ...x, costo: e.target.value } : x)),
                )
              }
            />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={recibir.isPending}
          onClick={() => void guardar()}
        >
          Recibir
        </Boton>
        <Boton accion="global.cancelar" onClick={alCancelar}>
          Cancelar
        </Boton>
        {tocado && falta && <span className="text-etiqueta text-critico">{falta}</span>}
      </div>
    </section>
  )
}
