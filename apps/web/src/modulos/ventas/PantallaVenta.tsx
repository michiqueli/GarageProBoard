import { accesoDeRuta, contrato } from '@gpb/contracts'
import { MINIMO_MOTIVO_CARTERA, numeroDeHoja, totalesDeVenta } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import { confirmar, notificar, preguntar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoAgregar, IconoBorrar, IconoVolver } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo, useCambiosSinGuardar, useVolver } from '../../teclado/index.ts'
import { fechaCorta, importeUnidad, nombreUnidad } from '../stock/stock.tsx'
import { EstadoVenta } from './PantallaVentas.tsx'
import { MEDIO_PAGO, nombreVenta, opcionesDe, TIPO_CONCEPTO, type Venta } from './ventas.ts'

type Moneda = Venta['moneda']
type Tipo = Venta['conceptos'][number]['tipo']
type Medio = Venta['pagos'][number]['medio']

interface Concepto {
  clave: number
  tipo: Tipo
  descripcion: string
  importe: string
  moneda: Moneda
  cotizacion: string
}

interface Pago {
  clave: number
  medio: Medio
  importe: string
  moneda: Moneda
  cotizacion: string
  detalle: string
  entidad: string
  cuotas: string
  unidadUsadaId: string | null
  reservaId: string | null
}

let proxima = 1
const sinCeros = (t: string | null) => (t ? (t.includes('.') ? t.replace(/\.?0+$/, '') : t) : '')
const MONEDAS = [
  { valor: 'ARS' as const, texto: 'Pesos' },
  { valor: 'USD' as const, texto: 'Dólares' },
]
const validarMotivo = (v: string) =>
  v.trim().length < MINIMO_MOTIVO_CARTERA ? 'Decí por qué: queda escrito' : null
const numero = (t: string) => numeroDeHoja(t)
const malo = (t: string, obligatorio = true) =>
  t.trim() ? numero(t) === null || Number(numero(t)) <= 0 : obligatorio

export function PantallaVenta() {
  const { id } = getRouteApi('/con-sesion/ventas/$id').useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const consulta = useQuery({
    queryKey: ['ventas', tenantId, 'ficha', id],
    queryFn: () => api.ventas.ficha({ id }),
  })
  const v = consulta.data

  return (
    <Shell
      titulo={v ? `${nombreVenta(v.numero)} · ${v.unidad.nombre}` : 'Venta'}
      requiere={accesoDeRuta(contrato.ventas.ficha)}
    >
      <Link to="/ventas" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todas las ventas
      </Link>
      {consulta.isPending && <div className="h-48 animate-pulse rounded-base bg-superficie" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeGeneral(consulta.error)}
        </p>
      )}
      {v && <Formulario key={`${v.id}-${v.estado}`} venta={v} />}
    </Shell>
  )
}

function Formulario({ venta: v }: { venta: Venta }) {
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeEditar = usePuedeUsar(contrato.ventas.guardar) && v.estado === 'borrador'
  const puedeAnular = usePuedeUsar(contrato.ventas.anular) && v.estado !== 'anulada'

  const [cliente, setCliente] = useState<ClienteElegido | null>({
    id: v.cliente.id,
    razonSocial: v.cliente.nombre,
  })
  const [precio, setPrecio] = useState(sinCeros(v.precio))
  const [moneda, setMoneda] = useState<Moneda>(v.moneda)
  const [observaciones, setObservaciones] = useState(v.observaciones ?? '')
  const [conceptos, setConceptos] = useState<Concepto[]>(() =>
    v.conceptos.map((c) => ({
      clave: proxima++,
      tipo: c.tipo,
      descripcion: c.descripcion,
      importe: sinCeros(c.importe),
      moneda: c.moneda,
      cotizacion: sinCeros(c.cotizacion),
    })),
  )
  const [pagos, setPagos] = useState<Pago[]>(() =>
    v.pagos.map((p) => ({
      clave: proxima++,
      medio: p.medio,
      importe: sinCeros(p.importe),
      moneda: p.moneda,
      cotizacion: sinCeros(p.cotizacion),
      detalle: p.detalle ?? '',
      entidad: p.entidad ?? '',
      cuotas: p.cuotas?.toString() ?? '',
      unidadUsadaId: p.unidadUsada?.id ?? null,
      reservaId: p.reservaId,
    })),
  )
  const [cambios, setCambios] = useState(false)
  useCambiosSinGuardar(cambios)
  useVolver(() => void navegar({ to: '/ventas' }))

  const usados = useQuery({
    queryKey: ['stock', tenantId, 'usados-para-pago'],
    queryFn: () =>
      api.cartera.listar({ pagina: 1, porPagina: 200, estado: 'en_stock', condicion: 'usado' }),
    enabled: puedeEditar,
  })

  const tocar = () => setCambios(true)
  const cambiarConcepto = (clave: number, parcial: Partial<Concepto>) => {
    tocar()
    setConceptos((xs) => xs.map((x) => (x.clave === clave ? { ...x, ...parcial } : x)))
  }
  const cambiarPago = (clave: number, parcial: Partial<Pago>) => {
    tocar()
    setPagos((xs) => xs.map((x) => (x.clave === clave ? { ...x, ...parcial } : x)))
  }

  // Los totales se recalculan acá al tipear; al guardar manda lo que diga el servidor.
  const costoUnidad = v.totales.rentabilidad?.costoUnidad ?? null
  const totales = useMemo(() => {
    const valido = (t: string) => (numero(t) !== null && Number(numero(t)) > 0 ? numero(t) : null)
    return totalesDeVenta({
      precio: numero(precio) ?? '0',
      moneda,
      conceptos: conceptos.flatMap((c) =>
        valido(c.importe)
          ? [
              {
                tipo: c.tipo,
                importe: valido(c.importe) as string,
                moneda: c.moneda,
                cotizacion: valido(c.cotizacion),
              },
            ]
          : [],
      ),
      pagos: pagos.flatMap((p) =>
        valido(p.importe)
          ? [
              {
                importe: valido(p.importe) as string,
                moneda: p.moneda,
                cotizacion: valido(p.cotizacion),
              },
            ]
          : [],
      ),
      costoUnidad: moneda === v.moneda ? costoUnidad : null,
    })
  }, [precio, moneda, conceptos, pagos, costoUnidad, v.moneda])

  const problema = !cliente
    ? 'Falta el comprador'
    : numero(precio) === null
      ? 'El precio tiene que ser un número'
      : conceptos.some((c) => !c.descripcion.trim() || malo(c.importe) || malo(c.cotizacion, false))
        ? 'Revisá los conceptos: descripción e importe'
        : pagos.some(
              (p) =>
                malo(p.importe) ||
                malo(p.cotizacion, false) ||
                (p.medio === 'usado' && !p.unidadUsadaId),
            )
          ? 'Revisá los pagos: importe, y el usado si es en parte de pago'
          : null

  const poner = async (f: Venta) => {
    cache.setQueryData(['ventas', tenantId, 'ficha', v.id], f)
    setCambios(false)
    await cache.invalidateQueries({ queryKey: ['ventas', tenantId] })
    await cache.invalidateQueries({ queryKey: ['stock', tenantId] })
  }

  const guardar = useMutation({
    mutationFn: () =>
      api.ventas.guardar({
        id: v.id,
        clienteId: cliente?.id as string,
        precio: numero(precio) as string,
        moneda,
        observaciones: observaciones.trim() || null,
        conceptos: conceptos.map((c) => ({
          tipo: c.tipo,
          descripcion: c.descripcion.trim(),
          importe: numero(c.importe) as string,
          moneda: c.moneda,
          cotizacion: c.cotizacion.trim() ? numero(c.cotizacion) : null,
        })),
        pagos: pagos.map((p) => ({
          medio: p.medio,
          importe: numero(p.importe) as string,
          moneda: p.moneda,
          cotizacion: p.cotizacion.trim() ? numero(p.cotizacion) : null,
          detalle: p.detalle.trim() || null,
          entidad: p.medio === 'financiacion' ? p.entidad.trim() || null : null,
          cuotas: p.medio === 'financiacion' && p.cuotas.trim() ? Number(p.cuotas) : null,
          unidadUsadaId: p.medio === 'usado' ? p.unidadUsadaId : null,
          reservaId: p.reservaId,
        })),
      }),
    onSuccess: poner,
    meta: { exito: 'Venta guardada', error: mensajeGeneral },
  })

  const confirmarVenta = useMutation({
    mutationFn: (autorizacion: string | null) => api.ventas.confirmar({ id: v.id, autorizacion }),
    onSuccess: poner,
    onError: async (error) => {
      if (
        error instanceof ORPCError &&
        (error.code === 'REQUIERE_AUTORIZACION' || error.code === 'RESERVADA_PARA_OTRO')
      ) {
        const datos = error.data as { descuento?: string; maximo?: number; cliente?: string }
        const motivo = await preguntar({
          titulo:
            error.code === 'REQUIERE_AUTORIZACION'
              ? `El descuento es del ${datos.descuento} %, y el máximo es ${datos.maximo} %`
              : `La unidad está reservada para ${datos.cliente}`,
          texto:
            error.code === 'REQUIERE_AUTORIZACION'
              ? 'Confirmarla igual queda autorizado a tu nombre, con el motivo.'
              : 'Esa reserva se libera, y queda escrito por qué.',
          confirmar: 'Autorizar y confirmar',
          peligro: true,
          campo: { etiqueta: 'Por qué', valor: '', validar: validarMotivo },
        })
        if (motivo) confirmarVenta.mutate(motivo.trim())
        return
      }
      notificar.error(mensajeGeneral(error))
    },
    meta: { exito: 'Venta confirmada: la unidad quedó vendida', error: false },
  })

  const anular = useMutation({
    mutationFn: (motivo: string) => api.ventas.anular({ id: v.id, motivo }),
    onSuccess: poner,
    meta: { exito: 'Venta anulada', error: mensajeGeneral },
  })

  async function pedirConfirmar() {
    if (problema || guardar.isPending || confirmarVenta.isPending) return
    if (cambios) await guardar.mutateAsync()
    const si = await confirmar({
      titulo: `¿Confirmar la ${nombreVenta(v.numero).toLowerCase()}?`,
      texto: `La unidad queda vendida a ${cliente?.razonSocial} y sus reservas se cierran. Después sólo se puede anular.`,
      confirmar: 'Confirmar la venta',
    })
    if (si) confirmarVenta.mutate(null)
  }

  async function pedirAnular() {
    const motivo = await preguntar({
      titulo: `¿Anular la ${nombreVenta(v.numero).toLowerCase()}?`,
      texto:
        v.estado === 'confirmada'
          ? 'La unidad vuelve a estar disponible en el stock.'
          : 'El borrador deja de valer.',
      confirmar: 'Anular',
      peligro: true,
      campo: { etiqueta: 'Por qué', valor: '', validar: validarMotivo },
    })
    if (motivo) anular.mutate(motivo.trim())
  }

  useAtajo(
    'global.guardar',
    () => !problema && !guardar.isPending && guardar.mutate(),
    puedeEditar && cambios,
  )

  const opcionesUsados = (usados.data?.datos ?? [])
    .filter((u) => u.id !== v.unidad.id)
    .map((u) => ({
      valor: u.id,
      texto: `${nombreUnidad(u)} · ${u.vehiculo.dominio ?? u.vehiculo.chasis}`,
    }))

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
      <div className="grid content-start gap-3">
        <Bloque titulo="La venta" accion={<EstadoVenta estado={v.estado} />}>
          <div className="grid gap-3 p-3 md:grid-cols-3">
            <div className="md:col-span-3">
              <p className="text-dato">
                <b>{v.unidad.nombre}</b>{' '}
                <span className="font-mono text-etiqueta text-texto-suave">
                  {v.unidad.dominio ?? v.unidad.chasis}
                </span>
              </p>
              <p className="text-etiqueta text-texto-suave">
                {fechaCorta(v.fecha)} · {v.sucursal} · Vendedor: {v.vendedor ?? '—'}
              </p>
            </div>
            {puedeEditar ? (
              <>
                <div className="md:col-span-3">
                  <SelectorCliente
                    etiqueta="Comprador"
                    valor={cliente}
                    onChange={(c) => {
                      tocar()
                      setCliente(c)
                    }}
                  />
                </div>
                <Campo
                  etiqueta="Precio"
                  inputMode="decimal"
                  value={precio}
                  onChange={(e) => {
                    tocar()
                    setPrecio(e.target.value)
                  }}
                />
                <Selector
                  etiqueta="Moneda"
                  valor={moneda}
                  opciones={MONEDAS}
                  onChange={(m) => {
                    tocar()
                    if (m) setMoneda(m)
                  }}
                />
                <Campo
                  etiqueta="Observaciones"
                  value={observaciones}
                  maxLength={1000}
                  onChange={(e) => {
                    tocar()
                    setObservaciones(e.target.value)
                  }}
                />
              </>
            ) : (
              <p className="text-dato md:col-span-3">
                Comprador: <b>{v.cliente.nombre}</b>
                {v.observaciones ? ` · ${v.observaciones}` : ''}
                {v.autorizacionMotivo ? ` · Autorizada: ${v.autorizacionMotivo}` : ''}
                {v.anulacionMotivo ? ` · Anulada: ${v.anulacionMotivo}` : ''}
              </p>
            )}
          </div>
        </Bloque>

        <Bloque
          titulo="Gastos, descuentos y costos"
          accion={
            puedeEditar && (
              <Boton
                tamano="chico"
                icono={<IconoAgregar />}
                onClick={() => {
                  tocar()
                  setConceptos((xs) => [
                    ...xs,
                    {
                      clave: proxima++,
                      tipo: 'gasto_cliente',
                      descripcion: '',
                      importe: '',
                      moneda,
                      cotizacion: '',
                    },
                  ])
                }}
              >
                Agregar
              </Boton>
            )
          }
        >
          {conceptos.length === 0 && (
            <p className="px-3 py-3 text-dato text-texto-suave">
              Sin gastos ni descuentos. Patentamiento, flete o un descuento se cargan acá.
            </p>
          )}
          <ul className="divide-y divide-borde-suave">
            {conceptos.map((c, n) =>
              puedeEditar ? (
                <li
                  key={c.clave}
                  aria-label={`Concepto ${n + 1}`}
                  className="grid items-end gap-2 px-3 py-2.5 md:grid-cols-[12rem_1fr_8rem_7rem_7rem_auto]"
                >
                  <Selector
                    etiqueta="Qué es"
                    valor={c.tipo}
                    opciones={opcionesDe(TIPO_CONCEPTO)}
                    onChange={(t) => t && cambiarConcepto(c.clave, { tipo: t })}
                  />
                  <Campo
                    etiqueta="Descripción"
                    value={c.descripcion}
                    maxLength={200}
                    onChange={(e) => cambiarConcepto(c.clave, { descripcion: e.target.value })}
                  />
                  <Campo
                    etiqueta="Importe"
                    inputMode="decimal"
                    value={c.importe}
                    onChange={(e) => cambiarConcepto(c.clave, { importe: e.target.value })}
                  />
                  <Selector
                    etiqueta="Moneda"
                    valor={c.moneda}
                    opciones={MONEDAS}
                    onChange={(m) => m && cambiarConcepto(c.clave, { moneda: m })}
                  />
                  {c.moneda !== moneda ? (
                    <Campo
                      etiqueta="Cotización"
                      inputMode="decimal"
                      value={c.cotizacion}
                      onChange={(e) => cambiarConcepto(c.clave, { cotizacion: e.target.value })}
                    />
                  ) : (
                    <span />
                  )}
                  <Boton
                    tamano="chico"
                    variante="sutil"
                    icono={<IconoBorrar />}
                    onClick={() => {
                      tocar()
                      setConceptos((xs) => xs.filter((x) => x.clave !== c.clave))
                    }}
                  >
                    Quitar
                  </Boton>
                </li>
              ) : (
                <li key={c.clave} className="flex flex-wrap gap-x-3 px-3 py-2 text-dato">
                  <span>{c.descripcion}</span>
                  <span className="text-etiqueta text-texto-suave">{TIPO_CONCEPTO[c.tipo]}</span>
                  <span className="tabular ml-auto font-mono">
                    {c.tipo === 'descuento' ? '− ' : ''}
                    {importeUnidad(numero(c.importe) ?? '0', c.moneda)}
                  </span>
                </li>
              ),
            )}
          </ul>
        </Bloque>

        <Bloque
          titulo="Pagos"
          accion={
            puedeEditar && (
              <Boton
                tamano="chico"
                icono={<IconoAgregar />}
                onClick={() => {
                  tocar()
                  setPagos((xs) => [
                    ...xs,
                    {
                      clave: proxima++,
                      medio: 'efectivo',
                      importe: '',
                      moneda,
                      cotizacion: '',
                      detalle: '',
                      entidad: '',
                      cuotas: '',
                      unidadUsadaId: null,
                      reservaId: null,
                    },
                  ])
                }}
              >
                Agregar
              </Boton>
            )
          }
        >
          {pagos.length === 0 && (
            <p className="px-3 py-3 text-dato text-texto-suave">Todavía no se cargó ningún pago.</p>
          )}
          <ul className="divide-y divide-borde-suave">
            {pagos.map((p, n) =>
              puedeEditar ? (
                <li
                  key={p.clave}
                  aria-label={`Pago ${n + 1}`}
                  className="grid items-end gap-2 px-3 py-2.5 md:grid-cols-[12rem_8rem_7rem_7rem_1fr_auto]"
                >
                  <Selector
                    etiqueta="Medio"
                    valor={p.medio}
                    opciones={opcionesDe(MEDIO_PAGO)}
                    onChange={(m) => m && cambiarPago(p.clave, { medio: m })}
                  />
                  <Campo
                    etiqueta="Importe"
                    inputMode="decimal"
                    value={p.importe}
                    onChange={(e) => cambiarPago(p.clave, { importe: e.target.value })}
                  />
                  <Selector
                    etiqueta="Moneda"
                    valor={p.moneda}
                    opciones={MONEDAS}
                    onChange={(m) => m && cambiarPago(p.clave, { moneda: m })}
                  />
                  {p.moneda !== moneda ? (
                    <Campo
                      etiqueta="Cotización"
                      inputMode="decimal"
                      value={p.cotizacion}
                      onChange={(e) => cambiarPago(p.clave, { cotizacion: e.target.value })}
                    />
                  ) : (
                    <span />
                  )}
                  {p.medio === 'usado' ? (
                    <Selector
                      etiqueta="Qué usado"
                      valor={p.unidadUsadaId}
                      vacio={
                        opcionesUsados.length ? 'Elegí el usado' : 'Ingresalo primero al stock'
                      }
                      opciones={opcionesUsados}
                      onChange={(u) => cambiarPago(p.clave, { unidadUsadaId: u })}
                    />
                  ) : p.medio === 'financiacion' ? (
                    <div className="grid grid-cols-[1fr_5rem] gap-2">
                      <Campo
                        etiqueta="Entidad"
                        value={p.entidad}
                        maxLength={100}
                        onChange={(e) => cambiarPago(p.clave, { entidad: e.target.value })}
                      />
                      <Campo
                        etiqueta="Cuotas"
                        inputMode="numeric"
                        value={p.cuotas}
                        onChange={(e) => cambiarPago(p.clave, { cuotas: e.target.value })}
                      />
                    </div>
                  ) : (
                    <Campo
                      etiqueta="Detalle"
                      value={p.detalle}
                      maxLength={200}
                      onChange={(e) => cambiarPago(p.clave, { detalle: e.target.value })}
                    />
                  )}
                  <Boton
                    tamano="chico"
                    variante="sutil"
                    icono={<IconoBorrar />}
                    onClick={() => {
                      tocar()
                      setPagos((xs) => xs.filter((x) => x.clave !== p.clave))
                    }}
                  >
                    Quitar
                  </Boton>
                </li>
              ) : (
                <li key={p.clave} className="flex flex-wrap gap-x-3 px-3 py-2 text-dato">
                  <span>{MEDIO_PAGO[p.medio]}</span>
                  <span className="text-etiqueta text-texto-suave">
                    {[p.entidad, p.cuotas && `${p.cuotas} cuotas`, p.detalle]
                      .filter(Boolean)
                      .join(' · ')}
                    {v.pagos[n]?.unidadUsada?.nombre ?? ''}
                  </span>
                  <span className="tabular ml-auto font-mono">
                    {importeUnidad(numero(p.importe) ?? '0', p.moneda)}
                  </span>
                </li>
              ),
            )}
          </ul>
        </Bloque>
      </div>

      <aside className="grid content-start gap-3">
        <Bloque titulo="Totales">
          <dl className="grid gap-1.5 px-3 py-2.5 text-dato">
            <Total nombre="Precio" valor={importeUnidad(totales.precio, moneda)} />
            <Total
              nombre="Gastos del cliente"
              valor={importeUnidad(totales.gastosCliente, moneda)}
            />
            <Total
              nombre={`Descuentos (${totales.descuentoPorcentaje} %)`}
              valor={`− ${importeUnidad(totales.descuentos, moneda)}`}
            />
            <Total nombre="Total" valor={importeUnidad(totales.total, moneda)} fuerte />
            <Total nombre="Pagado" valor={importeUnidad(totales.pagado, moneda)} />
            <Total
              nombre="Saldo"
              valor={importeUnidad(totales.saldo, moneda)}
              fuerte
              atencion={Number(totales.saldo) > 0}
            />
          </dl>
          {totales.sinConvertir > 0 && (
            <p className="border-t border-borde-suave px-3 py-2 text-etiqueta text-atencion">
              Hay importes en otra moneda sin cotización: no entran en la suma.
            </p>
          )}
          {totales.rentabilidad && (
            <dl className="grid gap-1.5 border-t border-borde px-3 py-2.5 text-dato">
              <Total
                nombre="Costo de la unidad"
                valor={importeUnidad(totales.rentabilidad.costoUnidad, moneda)}
              />
              <Total
                nombre="Costos de la venta"
                valor={importeUnidad(totales.rentabilidad.costosVenta, moneda)}
              />
              <Total
                nombre="Margen"
                valor={`${importeUnidad(totales.rentabilidad.margen, moneda)}${totales.rentabilidad.margenPorcentaje ? ` · ${totales.rentabilidad.margenPorcentaje} %` : ''}`}
                fuerte
              />
            </dl>
          )}
        </Bloque>

        {(puedeEditar || puedeAnular) && (
          <div className="grid gap-2">
            {problema && puedeEditar && <p className="text-etiqueta text-critico">{problema}</p>}
            {v.requiereAutorizacion && puedeEditar && !cambios && (
              <p className="text-etiqueta text-atencion">
                El descuento pasa el máximo: confirmarla pide autorización.
              </p>
            )}
            {puedeEditar && (
              <>
                <Boton
                  accion="global.guardar"
                  deshabilitado={!cambios || Boolean(problema) || guardar.isPending}
                  onClick={() => guardar.mutate()}
                >
                  Guardar
                </Boton>
                <Boton
                  variante="principal"
                  deshabilitado={Boolean(problema) || confirmarVenta.isPending}
                  onClick={() => void pedirConfirmar()}
                >
                  Confirmar la venta
                </Boton>
              </>
            )}
            {puedeAnular && (
              <Boton
                variante="peligro"
                deshabilitado={anular.isPending}
                onClick={() => void pedirAnular()}
              >
                Anular
              </Boton>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Bloque({
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
      <header className="flex items-center justify-between gap-2 border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">{titulo}</h2>
        {accion}
      </header>
      {children}
    </section>
  )
}

function Total({
  nombre,
  valor,
  fuerte = false,
  atencion = false,
}: {
  nombre: string
  valor: string
  fuerte?: boolean
  atencion?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-etiqueta text-texto-suave">{nombre}</dt>
      <dd
        className={`tabular font-mono ${fuerte ? 'font-semibold' : ''} ${atencion ? 'text-atencion' : ''}`}
      >
        {valor}
      </dd>
    </div>
  )
}
