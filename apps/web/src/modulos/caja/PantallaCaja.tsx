import { accesoDeRuta, contrato } from '@gpb/contracts'
import { cuitValido, formatearCuit, formatearImporte, normalizarCuit, plata } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { confirmar, notificar, preguntar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import {
  IconoAgregar,
  IconoAnular,
  IconoBorrar,
  IconoCertificado,
  IconoImprimir,
  IconoMail,
  IconoVerificar,
} from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo } from '../../teclado/index.ts'
import { ALICUOTAS, abrirPdf, CONDICIONES_VENTA, nombreComprobante } from './comprobantes.ts'

type Opciones = Awaited<ReturnType<typeof api.comprobantes.opciones>>
type PuntoVenta = Opciones['puntosVenta'][number]
type Receptor = Awaited<ReturnType<typeof api.comprobantes.receptor>>
type Resumen = Awaited<ReturnType<typeof api.comprobantes.listar>>['datos'][number]

type Modo = 'consumidor' | 'cliente' | 'cuit'

interface Renglon {
  clave: number
  descripcion: string
  cantidad: string
  precioUnitario: string
  bonificacionPorcentaje: string
  codigoAlicuota: (typeof ALICUOTAS)[number]['valor']
}

let proximaClave = 1
const renglonVacio = (): Renglon => ({
  clave: proximaClave++,
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  bonificacionPorcentaje: '0',
  codigoAlicuota: 5,
})

/** Un número escrito como se escribe acá, «1.234,50», a la forma de la API, «1234.50». */
function aDecimal(texto: string): string {
  const limpio = texto.trim().replace(/\s/g, '')
  if (!limpio) return ''
  const conComa = limpio.includes(',')
  return conComa ? limpio.replace(/\./g, '').replace(',', '.') : limpio
}

function esNumero(texto: string) {
  return /^[0-9]+(\.[0-9]{1,4})?$/.test(aDecimal(texto))
}

function totalDe(r: Renglon) {
  if (!esNumero(r.cantidad) || !esNumero(r.precioUnitario)) return null
  const bonif = esNumero(r.bonificacionPorcentaje) ? aDecimal(r.bonificacionPorcentaje) : '0'
  return plata(aDecimal(r.cantidad))
    .times(plata(aDecimal(r.precioUnitario)))
    .times(plata('1').minus(plata(bonif).dividedBy(100)))
    .toDecimalPlaces(2)
}

/**
 * La caja: facturar y ver lo facturado.
 *
 * El recorrido del mostrador, con teclado: elegir a quién (consumidor final, un cliente o
 * un CUIT), cargar lo que se cobra, `F4`, confirmar. La letra no la elige nadie: con CUIT
 * sale de lo que informa AFIP hoy, y se muestra antes de confirmar.
 *
 * `F4` abre la confirmación y nunca emite directo: una factura emitida por un dedo de más
 * sólo se anula con una nota de crédito.
 */
export function PantallaCaja() {
  const puedeFacturar = usePuedeUsar(contrato.comprobantes.emitir)

  return (
    <Shell titulo="Caja" requiere={accesoDeRuta(contrato.comprobantes.listar)}>
      {puedeFacturar && <Facturar />}
      <Ultimos />
    </Shell>
  )
}

function Facturar() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva.id)
  const cache = useQueryClient()

  const opciones = useQuery({
    queryKey: ['facturacion', tenantId, sucursalId, 'opciones'],
    queryFn: () => api.comprobantes.opciones(),
  })

  const [puntoVentaId, setPuntoVentaId] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>('consumidor')
  const [cliente, setCliente] = useState<ClienteElegido | null>(null)
  const [cuit, setCuit] = useState('')
  const [nombreCf, setNombreCf] = useState('')
  const [dniCf, setDniCf] = useState('')
  const [concepto, setConcepto] = useState<1 | 2 | 3>(1)
  const [servicio, setServicio] = useState({ desde: '', hasta: '', vencimientoPago: '' })
  const [condicionVenta, setCondicionVenta] = useState<string>('Contado')
  const [renglones, setRenglones] = useState<Renglon[]>([renglonVacio()])
  const [tocado, setTocado] = useState(false)

  const pv: PuntoVenta | undefined =
    opciones.data?.puntosVenta.find((p) => p.id === puntoVentaId) ?? opciones.data?.puntosVenta[0]

  const cuitListo = modo === 'cuit' && cuitValido(cuit)
  const receptorPedido =
    modo === 'cliente'
      ? cliente
        ? { clienteId: cliente.id }
        : null
      : modo === 'cuit'
        ? cuitListo
          ? { cuit: normalizarCuit(cuit) }
          : null
        : {}

  // Qué comprobante corresponde, antes de confirmar: con CUIT, según el padrón.
  const receptor = useQuery({
    queryKey: ['facturacion', tenantId, 'receptor', pv?.id, receptorPedido],
    queryFn: () => api.comprobantes.receptor({ puntoVentaId: pv?.id as string, ...receptorPedido }),
    enabled: Boolean(pv && receptorPedido && pv.certificado === 'vigente'),
    retry: false,
    staleTime: 60_000,
  })

  const totales = useMemo(() => {
    const cargados = renglones.map(totalDe)
    const total = cargados.reduce<ReturnType<typeof plata>>(
      (a, t) => (t ? a.plus(t) : a),
      plata('0'),
    )
    return { total, completos: cargados.every((t) => t !== null) }
  }, [renglones])

  const problemas = (() => {
    const lista: string[] = []
    if (renglones.some((r) => !r.descripcion.trim()))
      lista.push('Cada renglón necesita su descripción.')
    if (!totales.completos) lista.push('Revisá cantidades y precios: son números, como 1.234,50.')
    if (concepto !== 1 && (!servicio.desde || !servicio.hasta || !servicio.vencimientoPago))
      lista.push('Facturar servicios pide el período y el vencimiento del pago.')
    if (modo === 'cuit' && !cuitListo) lista.push('El CUIT no es válido: revisá los números.')
    if (modo === 'cliente' && !cliente) lista.push('Elegí el cliente.')
    if (modo === 'consumidor' && dniCf && !/^[0-9]{7,8}$/.test(dniCf))
      lista.push('El DNI son 7 u 8 números.')
    return lista
  })()

  const emitir = useMutation({
    mutationFn: () =>
      api.comprobantes.emitir({
        puntoVentaId: pv?.id as string,
        receptor:
          modo === 'consumidor'
            ? { consumidorFinal: { nombre: nombreCf || null, dni: dniCf || null } }
            : (receptorPedido as { clienteId: string } | { cuit: string }),
        concepto,
        servicio: concepto === 1 ? null : servicio,
        condicionVenta,
        renglones: renglones.map((r) => ({
          descripcion: r.descripcion.trim(),
          cantidad: aDecimal(r.cantidad),
          unidad: 'unidades',
          precioUnitario: aDecimal(r.precioUnitario),
          bonificacionPorcentaje: aDecimal(r.bonificacionPorcentaje) || '0',
          codigoAlicuota: r.codigoAlicuota,
        })),
      }),
    onSuccess: async (d) => {
      notificar.ok(`${nombreComprobante(d)} emitida, CAE ${d.cae}`, {
        accion: { texto: 'Abrir el PDF', alHacer: () => void abrirPdf(d.id) },
      })
      await cache.invalidateQueries({ queryKey: ['comprobantes', tenantId] })
      setRenglones([renglonVacio()])
      setNombreCf('')
      setDniCf('')
      setTocado(false)
    },
    meta: {
      error: (error) => {
        if (error instanceof ORPCError) {
          const datos = error.data as
            | { comprobanteId?: string; errores?: Array<{ codigo: number; mensaje: string }> }
            | undefined
          void cache.invalidateQueries({ queryKey: ['comprobantes', tenantId] })
          if (error.code === 'RECHAZADO') {
            return {
              texto: 'AFIP rechazó la factura. No quedó emitida y el número sigue libre.',
              detalle: datos?.errores?.map((e) => `${e.codigo}: ${e.mensaje}`).join(' · '),
            }
          }
          if (
            (error.code === 'AFIP_NO_RESPONDE' || error.code === 'SERIE_OCUPADA') &&
            datos?.comprobanteId
          ) {
            const id = datos.comprobanteId
            return {
              texto: error.message,
              accion: {
                texto: 'Verificar con AFIP',
                alHacer: () => void verificar(id, cache, tenantId),
              },
            }
          }
        }
        return mensajeGeneral(error)
      },
    },
  })

  async function facturar() {
    setTocado(true)
    if (!pv || !receptor.data || problemas.length || emitir.isPending) return
    const r = receptor.data
    const enProduccion = pv.entorno === 'produccion'
    const si = await confirmar({
      titulo: `¿Emitir ${r.nombreComprobante} por $ ${formatearImporte(totales.total.toFixed(2))}?`,
      texto: [
        `A ${r.nombre}${r.tipoDocReceptor === 80 ? ` (CUIT ${formatearCuit(r.numeroDocReceptor)})` : ''}.`,
        `Punto de venta ${String(pv.numero).padStart(5, '0')} de ${pv.empresa.razonSocial}.`,
        enProduccion
          ? 'Queda emitida en AFIP: sólo se anula con una nota de crédito.'
          : 'Es de homologación: una prueba, sin valor fiscal.',
      ].join(' '),
      confirmar: 'Emitir',
    })
    if (si) emitir.mutate()
  }

  useAtajo('caja.facturar', () => void facturar(), Boolean(pv))
  useAtajo('global.nuevo', () => setRenglones((rs) => [...rs, renglonVacio()]), Boolean(pv))

  async function quitar(r: Renglon) {
    const conDatos = r.descripcion.trim() || r.precioUnitario.trim()
    if (
      conDatos &&
      !(await confirmar({
        titulo: `¿Quitar el renglón «${r.descripcion.trim() || 'sin descripción'}»?`,
        confirmar: 'Quitar',
        peligro: true,
      }))
    ) {
      return
    }
    setRenglones((rs) =>
      rs.length === 1 ? [renglonVacio()] : rs.filter((x) => x.clave !== r.clave),
    )
  }

  const cambiar = (clave: number, parcial: Partial<Renglon>) =>
    setRenglones((rs) => rs.map((x) => (x.clave === clave ? { ...x, ...parcial } : x)))

  if (opciones.isPending) return <div className="h-48 animate-pulse rounded-base bg-superficie-2" />
  if (opciones.isError) {
    return (
      <p role="alert" className="text-dato text-critico">
        {mensajeGeneral(opciones.error)}
      </p>
    )
  }

  if (!pv) {
    return (
      <section className="grid gap-2 rounded-base border border-borde bg-superficie px-3 py-3">
        <p className="text-dato">
          Esta sucursal no tiene un punto de venta de facturación. Se carga en Empresas y
          sucursales, con el número que dio AFIP.
        </p>
        <Link to="/empresas" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
          Ir a Empresas y sucursales
        </Link>
      </section>
    )
  }

  const errorReceptor =
    receptor.error instanceof ORPCError
      ? receptor.error.message
      : receptor.isError
        ? mensajeGeneral(receptor.error)
        : null

  return (
    <section
      aria-label="Facturar"
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-display text-dato font-semibold">Facturar</h2>
        {(opciones.data?.puntosVenta.length ?? 0) > 1 ? (
          <div className="w-72">
            <Selector
              etiqueta="Punto de venta"
              valor={pv.id}
              onChange={(v) => setPuntoVentaId(v)}
              opciones={(opciones.data?.puntosVenta ?? []).map((p) => ({
                valor: p.id,
                texto: `${String(p.numero).padStart(5, '0')} · ${p.empresa.razonSocial}`,
              }))}
            />
          </div>
        ) : (
          <span className="text-etiqueta text-texto-suave">
            Punto de venta <b className="font-mono">{String(pv.numero).padStart(5, '0')}</b> ·{' '}
            {pv.empresa.razonSocial}
          </span>
        )}
        {pv.entorno === 'homologacion' && (
          <span className="rounded-full border border-info px-2 text-etiqueta font-semibold text-info">
            Homologación: sin valor fiscal
          </span>
        )}
      </header>

      {pv.certificado !== 'vigente' ? (
        <div className="grid gap-2">
          <p className="text-dato text-atencion">
            {pv.certificado === 'falta'
              ? `${pv.empresa.razonSocial} todavía no tiene el certificado de AFIP: sin él no se puede facturar.`
              : `El certificado de AFIP de ${pv.empresa.razonSocial} está vencido: hay que renovarlo.`}
          </p>
          <Link
            to="/empresas/$id/certificado-afip"
            params={{ id: pv.empresa.id }}
            className={`w-fit ${clasesBoton('normal', 'chico')}`}
          >
            <IconoCertificado />
            Certificado de AFIP
          </Link>
        </div>
      ) : (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-etiqueta font-medium text-texto-suave">A quién</legend>
            <div role="radiogroup" aria-label="A quién" className="flex flex-wrap gap-1">
              {(
                [
                  ['consumidor', 'Consumidor final'],
                  ['cliente', 'Cliente'],
                  ['cuit', 'Otro CUIT'],
                ] as const
              ).map(([valor, texto]) => (
                <label
                  key={valor}
                  className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-base border px-2.5 text-etiqueta ${
                    modo === valor
                      ? 'border-marca bg-marca-suave font-semibold text-marca'
                      : 'border-borde text-texto-suave'
                  }`}
                >
                  <input
                    type="radio"
                    name="modo-receptor"
                    className="sr-only"
                    checked={modo === valor}
                    onChange={() => setModo(valor)}
                  />
                  {texto}
                </label>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {modo === 'consumidor' && (
                <>
                  <Campo
                    etiqueta="Nombre"
                    value={nombreCf}
                    onChange={(e) => setNombreCf(e.target.value)}
                    ayuda="Opcional"
                  />
                  <Campo
                    etiqueta="DNI"
                    inputMode="numeric"
                    value={dniCf}
                    onChange={(e) => setDniCf(e.target.value.replace(/\D/g, ''))}
                    ayuda="Opcional: sin puntos"
                  />
                </>
              )}
              {modo === 'cliente' && (
                <div className="md:col-span-2">
                  <SelectorCliente etiqueta="Cliente" valor={cliente} onChange={setCliente} />
                </div>
              )}
              {modo === 'cuit' && (
                <Campo
                  etiqueta="CUIT"
                  inputMode="numeric"
                  value={cuit}
                  onChange={(e) => setCuit(e.target.value)}
                  aria-invalid={cuit.length > 0 && !cuitListo}
                  ayuda={
                    cuit.length > 0 && !cuitListo
                      ? 'Ese CUIT no existe: revisá los números'
                      : 'Se consulta al padrón de AFIP'
                  }
                />
              )}
            </div>

            <VistaReceptor
              consultando={receptor.isFetching}
              receptor={receptor.data}
              error={errorReceptor}
              esperando={!receptorPedido}
            />
          </fieldset>

          <div className="grid gap-3 md:grid-cols-4">
            <Selector
              etiqueta="Concepto"
              valor={concepto}
              onChange={(v) => setConcepto(v ?? 1)}
              opciones={[
                { valor: 1 as const, texto: 'Productos' },
                { valor: 2 as const, texto: 'Servicios' },
                { valor: 3 as const, texto: 'Productos y servicios' },
              ]}
            />
            <Selector
              etiqueta="Condición de venta"
              valor={condicionVenta}
              onChange={(v) => setCondicionVenta(v ?? 'Contado')}
              opciones={CONDICIONES_VENTA.map((c) => ({ valor: c as string, texto: c }))}
            />
            {concepto !== 1 && (
              <>
                <Campo
                  etiqueta="Período desde"
                  type="date"
                  value={servicio.desde}
                  onChange={(e) => setServicio((s) => ({ ...s, desde: e.target.value }))}
                />
                <Campo
                  etiqueta="Período hasta"
                  type="date"
                  value={servicio.hasta}
                  onChange={(e) => setServicio((s) => ({ ...s, hasta: e.target.value }))}
                />
                <Campo
                  etiqueta="Vencimiento del pago"
                  type="date"
                  value={servicio.vencimientoPago}
                  onChange={(e) => setServicio((s) => ({ ...s, vencimientoPago: e.target.value }))}
                />
              </>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-etiqueta font-medium text-texto-suave">
              Qué se cobra · precios finales, con IVA
            </legend>
            <ol aria-label="Renglones" className="grid gap-2">
              {renglones.map((r, i) => {
                const total = totalDe(r)
                return (
                  <li
                    key={r.clave}
                    aria-label={`Renglón ${i + 1}`}
                    className="grid items-end gap-2 md:grid-cols-[1fr_5rem_8rem_5rem_6rem_7rem_auto]"
                  >
                    <Campo
                      etiqueta="Descripción"
                      value={r.descripcion}
                      onChange={(e) => cambiar(r.clave, { descripcion: e.target.value })}
                      aria-invalid={tocado && !r.descripcion.trim()}
                    />
                    <Campo
                      etiqueta="Cantidad"
                      inputMode="decimal"
                      value={r.cantidad}
                      onChange={(e) => cambiar(r.clave, { cantidad: e.target.value })}
                      aria-invalid={tocado && !esNumero(r.cantidad)}
                    />
                    <Campo
                      etiqueta="Precio unitario"
                      inputMode="decimal"
                      value={r.precioUnitario}
                      onChange={(e) => cambiar(r.clave, { precioUnitario: e.target.value })}
                      aria-invalid={tocado && !esNumero(r.precioUnitario)}
                    />
                    <Campo
                      etiqueta="Bonif. %"
                      inputMode="decimal"
                      value={r.bonificacionPorcentaje}
                      onChange={(e) => cambiar(r.clave, { bonificacionPorcentaje: e.target.value })}
                    />
                    <Selector
                      etiqueta="IVA"
                      valor={r.codigoAlicuota}
                      onChange={(v) => cambiar(r.clave, { codigoAlicuota: v ?? 5 })}
                      opciones={ALICUOTAS.map((a) => ({ valor: a.valor, texto: a.texto }))}
                    />
                    <div className="grid gap-1">
                      <span className="text-etiqueta font-medium text-texto-suave">Total</span>
                      <span className="tabular flex h-campo items-center justify-end font-mono text-dato">
                        {total ? formatearImporte(total.toFixed(2)) : '—'}
                      </span>
                    </div>
                    <Boton
                      tamano="chico"
                      variante="sutil"
                      icono={<IconoBorrar />}
                      onClick={() => void quitar(r)}
                    >
                      Quitar
                    </Boton>
                  </li>
                )
              })}
            </ol>
            <div>
              <Boton
                tamano="chico"
                accion="global.nuevo"
                icono={<IconoAgregar />}
                onClick={() => setRenglones((rs) => [...rs, renglonVacio()])}
              >
                Agregar renglón
              </Boton>
            </div>
          </fieldset>

          {tocado && problemas.length > 0 && (
            <ul role="alert" className="grid gap-0.5 text-dato text-critico">
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-borde-suave pt-3">
            <span className="text-dato text-texto-suave">
              Total{' '}
              <b className="tabular font-mono text-ui text-texto">
                $ {formatearImporte(totales.total.toFixed(2))}
              </b>
            </span>
            <Boton
              accion="caja.facturar"
              variante="principal"
              deshabilitado={emitir.isPending || !receptor.data}
              onClick={() => void facturar()}
            >
              {emitir.isPending
                ? 'Emitiendo…'
                : receptor.data
                  ? `Emitir ${receptor.data.nombreComprobante}`
                  : 'Emitir'}
            </Boton>
          </footer>
        </>
      )}
    </section>
  )
}

/** Qué se va a emitir y a quién, antes de confirmar. */
function VistaReceptor({
  consultando,
  receptor,
  error,
  esperando,
}: {
  consultando: boolean
  receptor: Receptor | undefined
  error: string | null
  esperando: boolean
}) {
  if (esperando) return null
  if (consultando && !receptor) {
    return <p className="text-dato text-texto-suave">Consultando al padrón de AFIP…</p>
  }
  if (error) {
    return (
      <p role="alert" className="text-dato text-critico">
        {error}
      </p>
    )
  }
  if (!receptor) return null
  return (
    <section
      aria-label="Comprobante que corresponde"
      className="grid gap-1 rounded-base border border-borde-suave bg-superficie-2 px-3 py-2"
    >
      <p className="flex flex-wrap items-center gap-x-2 text-dato">
        <span className="inline-flex size-6 items-center justify-center rounded-[3px] border border-texto font-display text-dato font-bold">
          {receptor.letra}
        </span>
        <b>{receptor.nombreComprobante}</b>
        <span className="text-texto-suave">a</span>
        <b>{receptor.nombre}</b>
        {receptor.tipoDocReceptor === 80 && (
          <span className="font-mono text-etiqueta text-texto-suave">
            {formatearCuit(receptor.numeroDocReceptor)}
          </span>
        )}
      </p>
      {receptor.domicilio && <p className="text-etiqueta text-texto-suave">{receptor.domicilio}</p>}
      {receptor.avisos.map((a) => (
        <p key={a} className="text-etiqueta text-atencion">
          {a}
        </p>
      ))}
    </section>
  )
}

async function verificar(
  id: string,
  cache: ReturnType<typeof useQueryClient>,
  tenantId: string | undefined,
) {
  try {
    const d = await api.comprobantes.verificar({ id })
    await cache.invalidateQueries({ queryKey: ['comprobantes', tenantId] })
    if (d.estado === 'autorizado') {
      notificar.ok(`${nombreComprobante(d)} estaba emitida: CAE ${d.cae}`, {
        accion: { texto: 'Abrir el PDF', alHacer: () => void abrirPdf(d.id) },
      })
    } else {
      notificar.info(`${nombreComprobante(d)} no quedó emitida en AFIP. Podés volver a facturar.`)
    }
  } catch (error) {
    notificar.error(mensajeGeneral(error))
  }
}

/** Facturas A, B y C: lo único que se anula con una nota de crédito. */
const esFactura = (c: { tipoComprobante: number }) => [1, 6, 11].includes(c.tipoComprobante)

const ESTADOS: Record<Resumen['estado'], { texto: string; clase: string } | null> = {
  // Autorizada es lo normal: no reclama nada.
  autorizado: null,
  rechazado: { texto: 'Rechazada', clase: 'border border-critico text-critico' },
  // Sin confirmar hay que resolverla: píldora llena.
  incierto: { texto: 'Sin confirmar', clase: 'bg-atencion text-fondo' },
  emitiendo: { texto: 'Emitiendo', clase: 'border border-info text-info' },
}

function Ultimos() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const puedeFacturar = usePuedeUsar(contrato.comprobantes.verificar)
  const puedeAnular = usePuedeUsar(contrato.comprobantes.anular)

  const anular = useMutation({
    mutationFn: (c: Resumen) => api.comprobantes.anular({ id: c.id }),
    onSuccess: async (nota) => {
      notificar.ok(`${nombreComprobante(nota)} emitida, CAE ${nota.cae}`, {
        accion: { texto: 'Abrir el PDF', alHacer: () => void abrirPdf(nota.id) },
      })
      await cache.invalidateQueries({ queryKey: ['comprobantes', tenantId] })
    },
    meta: {
      error: (error) => {
        void cache.invalidateQueries({ queryKey: ['comprobantes', tenantId] })
        if (error instanceof ORPCError) {
          const datos = error.data as
            | { motivo?: string; errores?: Array<{ codigo: number; mensaje: string }> }
            | undefined
          if (error.code === 'NO_ANULABLE' && datos?.motivo) return datos.motivo
          if (error.code === 'RECHAZADO') {
            return {
              texto: 'AFIP rechazó la nota de crédito. La factura sigue sin anular.',
              detalle: datos?.errores?.map((e) => `${e.codigo}: ${e.mensaje}`).join(' · '),
            }
          }
        }
        return mensajeGeneral(error)
      },
    },
  })

  const enviar = useMutation({
    mutationFn: (x: { id: string; email: string }) => api.comprobantes.enviar(x),
    meta: { exito: (r) => `Mandada por mail a ${(r as { enviadoA: string }).enviadoA}` },
  })

  async function pedirMail(c: Resumen) {
    // El correo del cliente, si lo tiene cargado: se ofrece, y se puede cambiar.
    const ficha = await api.comprobantes.ficha({ id: c.id }).catch(() => null)
    const email = await preguntar({
      titulo: `¿A qué correo mando la ${nombreComprobante(c)}?`,
      texto: `Va el PDF adjunto, a nombre de ${c.receptorNombre}.`,
      confirmar: 'Mandar',
      campo: {
        etiqueta: 'Correo',
        tipo: 'email',
        valor: ficha?.receptorEmail ?? '',
        validar: (v) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
            ? null
            : 'Escribí un correo, como nombre@dominio.com',
      },
    })
    if (email) enviar.mutate({ id: c.id, email })
  }

  async function pedirAnular(c: Resumen) {
    if (
      await confirmar({
        titulo: `¿Anular la ${nombreComprobante(c)}?`,
        texto: `Se emite una nota de crédito por $ ${formatearImporte(c.importeTotal)} a ${c.receptorNombre}${
          c.entorno === 'produccion' ? ', que queda registrada en AFIP y no se puede deshacer' : ''
        }.`,
        confirmar: 'Emitir la nota de crédito',
        peligro: true,
      })
    ) {
      anular.mutate(c)
    }
  }
  const consulta = useQuery({
    queryKey: ['comprobantes', tenantId, 'ultimos'],
    queryFn: () => api.comprobantes.listar({ pagina: 1, porPagina: 20 }),
  })
  const datos = consulta.data?.datos ?? []

  const acciones = (c: Resumen) => (
    <span className="inline-flex gap-1.5">
      {c.estado === 'autorizado' && (
        <Boton tamano="chico" icono={<IconoImprimir />} onClick={() => void abrirPdf(c.id)}>
          PDF
        </Boton>
      )}
      {c.estado === 'autorizado' && (
        <Boton
          tamano="chico"
          icono={<IconoMail />}
          deshabilitado={enviar.isPending}
          onClick={() => void pedirMail(c)}
        >
          Mail
        </Boton>
      )}
      {puedeAnular && esFactura(c) && c.estado === 'autorizado' && !c.anulado && (
        <Boton
          tamano="chico"
          variante="sutil"
          icono={<IconoAnular />}
          deshabilitado={anular.isPending}
          onClick={() => void pedirAnular(c)}
        >
          Anular
        </Boton>
      )}
      {puedeFacturar && (c.estado === 'incierto' || c.estado === 'emitiendo') && (
        <Boton
          tamano="chico"
          icono={<IconoVerificar />}
          onClick={() => void verificar(c.id, cache, tenantId)}
        >
          Verificar
        </Boton>
      )}
    </span>
  )

  const estado = (c: Resumen) => {
    // Anulada ya no reclama nada: se dice con palabras, sin píldora.
    if (c.anulado) return <span className="text-etiqueta text-texto-tenue">Anulada</span>
    const e = ESTADOS[c.estado]
    return e ? (
      <span className={`inline-flex rounded-full px-2 text-etiqueta font-semibold ${e.clase}`}>
        {e.texto}
      </span>
    ) : null
  }

  return (
    <section
      aria-label="Últimos comprobantes"
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">Últimos comprobantes</h2>
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
          Todavía no se emitió ningún comprobante.
        </p>
      )}
      {datos.length > 0 && esEscritorio && (
        <table className="w-full text-dato">
          <thead>
            <tr className="text-left text-etiqueta text-texto-tenue">
              {['Fecha', 'Comprobante', 'A quién', 'Total', 'Estado', 'Acciones'].map((t) => (
                <th
                  key={t}
                  className={`border-b border-borde px-3 py-1.5 font-medium ${t === 'Total' ? 'text-right' : ''}`}
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.map((c) => (
              <tr key={c.id} className={c.estado === 'rechazado' ? 'text-texto-tenue' : ''}>
                <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta">
                  {c.fecha.split('-').reverse().join('/')}
                </td>
                <td className="h-fila border-b border-borde-suave px-3">
                  <span className="font-mono">{nombreComprobante(c)}</span>
                  {c.entorno === 'homologacion' && (
                    <span className="ml-2 text-etiqueta text-info">prueba</span>
                  )}
                </td>
                <td className="h-fila border-b border-borde-suave px-3">{c.receptorNombre}</td>
                <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                  $ {formatearImporte(c.importeTotal)}
                </td>
                <td className="h-fila border-b border-borde-suave px-3">{estado(c)}</td>
                <td className="h-fila border-b border-borde-suave px-3 py-1 text-right">
                  {acciones(c)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {datos.length > 0 && !esEscritorio && (
        <ul className="divide-y divide-borde-suave">
          {datos.map((c) => (
            <li key={c.id} className="grid gap-1 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-dato">{nombreComprobante(c)}</span>
                {estado(c)}
                <span className="tabular ml-auto font-mono text-dato">
                  $ {formatearImporte(c.importeTotal)}
                </span>
              </div>
              <span className="text-etiqueta text-texto-suave">
                {c.fecha.split('-').reverse().join('/')} · {c.receptorNombre}
              </span>
              <div>{acciones(c)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
