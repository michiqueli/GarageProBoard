import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { IconoAgregar } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ProveedorElegido, SelectorProveedor } from '../../componentes/SelectorProveedor.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { ALICUOTAS } from '../caja/comprobantes.ts'
import { PestanasRepuestos } from './Pestanas.tsx'
import { aDecimal, esNumero, type RepuestoResumen, sinCeros } from './repuestos.ts'

type Filtro = 'todos' | 'con_stock' | 'reponer'
type Detalle = Awaited<ReturnType<typeof api.repuestos.ficha>>

const FILTROS: Array<{ valor: Filtro; texto: string }> = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'con_stock', texto: 'Con stock' },
  { valor: 'reponer', texto: 'Para reponer' },
]

/**
 * El catálogo de repuestos con el stock de la sucursal. Se busca como se busca en el
 * mostrador: pegando el código que devolvió la base de la marca, o por descripción o modelo.
 * `Ins` da de alta una pieza.
 */
export function PantallaRepuestos() {
  const navegar = useNavigate()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const puedeVer = usePuedeUsar(contrato.repuestos.listar)
  const puedeCrear = usePuedeUsar(contrato.repuestos.crear)
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [conInactivos, setConInactivos] = useState(false)
  const [alta, setAlta] = useState(false)
  const texto = buscar.trim()

  const consulta = useQuery({
    queryKey: ['repuestos', tenantId, sucursalId, 'listado', texto, filtro, conInactivos],
    queryFn: () =>
      api.repuestos.listar({
        pagina: 1,
        porPagina: 100,
        stock: filtro,
        estado: conInactivos ? 'todos' : 'activos',
        ...(texto ? { buscar: texto } : {}),
      }),
    enabled: puedeVer,
  })
  const datos = consulta.data?.datos ?? []

  return (
    <Shell
      titulo="Repuestos"
      requiere={accesoDeRuta(contrato.repuestos.listar)}
      acciones={
        puedeCrear && !alta ? (
          <Boton
            accion="global.nuevo"
            variante="principal"
            icono={<IconoAgregar />}
            onClick={() => setAlta(true)}
          >
            Nuevo repuesto
          </Boton>
        ) : undefined
      }
    >
      <PestanasRepuestos />

      {alta && <FormularioRepuesto alTerminar={() => setAlta(false)} />}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2 border-b border-borde px-3 py-2">
          <div role="radiogroup" aria-label="Qué repuestos" className="flex gap-1">
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
                  name="filtro-repuestos"
                  className="sr-only"
                  checked={filtro === f.valor}
                  onChange={() => setFiltro(f.valor)}
                />
                {f.texto}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-etiqueta text-texto-suave">
            <input
              type="checkbox"
              className="accent-marca"
              checked={conInactivos}
              onChange={(e) => setConInactivos(e.target.checked)}
            />
            Incluir desactivados
          </label>
          <input
            type="search"
            aria-label="Buscar repuestos"
            placeholder="Código, descripción, marca o modelo"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="h-campo w-full rounded-base border border-borde bg-superficie-2 px-2.5 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca md:ml-auto md:w-72"
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
          <p className="px-3 py-6 text-center text-dato text-texto-suave">
            {texto
              ? `Ningún repuesto coincide con «${texto}».`
              : filtro === 'reponer'
                ? 'No hay nada por debajo del mínimo.'
                : puedeCrear
                  ? 'Todavía no hay repuestos cargados. Dá de alta el primero con Nuevo repuesto.'
                  : 'Todavía no hay repuestos cargados.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {['Código', 'Descripción', 'Marca', 'Ubicación', 'Stock', 'Precio'].map((c) => (
                  <th
                    key={c}
                    className={`border-b border-borde px-3 py-1.5 font-medium ${['Stock', 'Precio'].includes(c) ? 'text-right' : ''}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((r) => (
                <tr
                  key={r.id}
                  className={`${FILA_CLICABLE} ${r.activo ? '' : 'text-texto-tenue'}`}
                  onClick={clicEnFila(
                    () => void navegar({ to: '/repuestos/$id', params: { id: r.id } }),
                  )}
                >
                  <td className="h-fila border-b border-borde-suave px-3 font-mono">
                    <Link
                      to="/repuestos/$id"
                      params={{ id: r.id }}
                      className="text-marca hover:underline focus-visible:underline"
                    >
                      {r.codigo}
                    </Link>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    {r.descripcion}
                    {!r.activo && <span className="ml-2 text-etiqueta">Desactivado</span>}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {r.marca ?? '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {r.ubicacion ?? '—'}
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                    <Stock repuesto={r} />
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                    $ {formatearImporte(r.precioVenta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((r) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se entra por el enlace de la fila
              <li
                key={r.id}
                className={`grid gap-0.5 px-3 py-2.5 ${FILA_CLICABLE}`}
                onClick={clicEnFila(
                  () => void navegar({ to: '/repuestos/$id', params: { id: r.id } }),
                )}
              >
                <div className="flex items-baseline gap-2">
                  <Link
                    to="/repuestos/$id"
                    params={{ id: r.id }}
                    className="font-mono text-dato text-marca"
                  >
                    {r.codigo}
                  </Link>
                  <span className="tabular ml-auto font-mono text-dato">
                    <Stock repuesto={r} />
                  </span>
                </div>
                <span className="text-dato">{r.descripcion}</span>
                <span className="text-etiqueta text-texto-suave">
                  {[r.marca, r.ubicacion, `$ ${formatearImporte(r.precioVenta)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

/** El stock en palabras además del color: «Sin stock», «Reponer». */
export function Stock({ repuesto: r }: { repuesto: Pick<RepuestoResumen, 'stock' | 'reponer'> }) {
  const n = Number(r.stock)
  if (n < 0) return <span className="text-critico">{r.stock} · falta contar</span>
  if (n === 0) return <span className="text-critico">Sin stock</span>
  if (r.reponer) return <span className="text-atencion">{r.stock} · reponer</span>
  return <span>{r.stock}</span>
}

/** Alta y modificación de un repuesto. En el alta, además, el stock inicial y dónde está. */
export function FormularioRepuesto({
  repuesto,
  alTerminar,
}: {
  repuesto?: Detalle
  alTerminar: (guardado?: Detalle) => void
}) {
  const cache = useQueryClient()
  const navegar = useNavigate()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const primerCampo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const [codigo, setCodigo] = useState(repuesto?.codigo ?? '')
  const [descripcion, setDescripcion] = useState(repuesto?.descripcion ?? '')
  const [marca, setMarca] = useState(repuesto?.marca ?? '')
  const [rubro, setRubro] = useState(repuesto?.rubro ?? '')
  const [aplicacion, setAplicacion] = useState(repuesto?.aplicacion ?? '')
  const [precioVenta, setPrecio] = useState(repuesto ? sinCeros(repuesto.precioVenta) : '')
  const [costo, setCosto] = useState(repuesto?.costo ? sinCeros(repuesto.costo) : '')
  const [codigoAlicuota, setAlicuota] = useState<(typeof ALICUOTAS)[number]['valor']>(
    (repuesto?.codigoAlicuota as (typeof ALICUOTAS)[number]['valor'] | undefined) ?? 5,
  )
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(repuesto?.proveedor ?? null)
  const [observaciones, setObservaciones] = useState(repuesto?.observaciones ?? '')
  const [activo, setActivo] = useState(repuesto?.activo ?? true)
  const [stockInicial, setStockInicial] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [minimo, setMinimo] = useState('')
  const [tocado, setTocado] = useState(false)

  const precioMal = tocado && !esNumero(precioVenta)
  const costoMal = Boolean(costo.trim()) && !esNumero(costo)

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        codigo,
        descripcion,
        marca,
        rubro,
        aplicacion,
        precioVenta: aDecimal(precioVenta),
        costo: costo.trim() ? aDecimal(costo) : null,
        codigoAlicuota,
        proveedorId: proveedor?.id ?? null,
        observaciones,
      }
      return repuesto
        ? api.repuestos.editar({ ...datos, id: repuesto.id, activo })
        : api.repuestos.crear({
            ...datos,
            stockInicial: stockInicial.trim() ? aDecimal(stockInicial) : null,
            ubicacion,
            minimo: minimo.trim() ? aDecimal(minimo) : null,
          })
    },
    onSuccess: async (r) => {
      await cache.invalidateQueries({ queryKey: ['repuestos', tenantId] })
      alTerminar(r)
    },
    meta: {
      exito: () => (repuesto ? `${codigo} guardado` : `${descripcion} dado de alta`),
      error: (error) => {
        if (error instanceof ORPCError && error.code === 'CODIGO_DUPLICADO') {
          const d = error.data as { id: string; descripcion: string }
          return {
            texto: `Ya hay un repuesto con ese código: ${d.descripcion}.`,
            accion: {
              texto: 'Abrir su ficha',
              alHacer: () => {
                alTerminar()
                void navegar({ to: '/repuestos/$id', params: { id: d.id } })
              },
            },
          }
        }
        return mensajeGeneral(error)
      },
    },
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (!codigo.trim() || descripcion.trim().length < 2 || !esNumero(precioVenta) || costoMal)
      return
    guardar.mutate()
  }

  const titulo = repuesto ? `Modificar ${repuesto.codigo}` : 'Nuevo repuesto'
  return (
    <section
      aria-label={titulo}
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">{titulo}</h2>
      <form id="formulario-repuesto" onSubmit={enviar} className="grid gap-3 md:grid-cols-4">
        <Campo
          ref={primerCampo}
          etiqueta="Código de fábrica"
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          ayuda="Como viene de la base de la marca: los espacios y guiones no cuentan"
          aria-invalid={tocado && !codigo.trim()}
        />
        <div className="md:col-span-2">
          <Campo
            etiqueta="Descripción"
            required
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <Campo
          etiqueta="Marca"
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          ayuda="Renault, Bosch, SKF…"
        />
        <Campo
          etiqueta="Rubro"
          value={rubro}
          onChange={(e) => setRubro(e.target.value)}
          ayuda="Filtros, frenos, embrague…"
        />
        <div className="md:col-span-3">
          <Campo
            etiqueta="Aplicación"
            value={aplicacion}
            onChange={(e) => setAplicacion(e.target.value)}
            ayuda="A qué modelos le va: se busca por esto también"
          />
        </div>
        <Campo
          etiqueta="Precio de venta final"
          required
          inputMode="decimal"
          value={precioVenta}
          onChange={(e) => setPrecio(e.target.value)}
          ayuda={
            precioMal ? 'Escribí el precio, con coma para los centavos' : 'Con IVA, como se cobra'
          }
          aria-invalid={precioMal}
        />
        <Selector
          etiqueta="IVA"
          valor={codigoAlicuota}
          onChange={(v) => setAlicuota(v ?? 5)}
          opciones={ALICUOTAS.map((a) => ({ valor: a.valor, texto: a.texto }))}
        />
        <Campo
          etiqueta="Costo"
          inputMode="decimal"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
          ayuda={
            costoMal ? 'Ese costo no es un número' : 'Sin IVA. Se actualiza solo al recibir compras'
          }
          aria-invalid={costoMal}
        />
        <SelectorProveedor
          etiqueta="Proveedor habitual"
          valor={proveedor}
          onChange={setProveedor}
        />
        {!repuesto && (
          <>
            <Campo
              etiqueta="Stock inicial"
              inputMode="decimal"
              value={stockInicial}
              onChange={(e) => setStockInicial(e.target.value)}
              ayuda="Lo que hay hoy en esta sucursal"
            />
            <Campo
              etiqueta="Ubicación"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              ayuda="Estante 4, cajón B"
            />
            <Campo
              etiqueta="Mínimo"
              inputMode="decimal"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              ayuda="Por debajo de esto avisa que hay que reponer"
            />
          </>
        )}
        <div className="md:col-span-3">
          <Campo
            etiqueta="Observaciones"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
        {repuesto && (
          <label className="flex items-center gap-2 self-end pb-2 text-dato">
            <input
              type="checkbox"
              className="accent-marca"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Activo
            {!activo && (
              <span className="text-etiqueta text-atencion">no se ofrece al cargar pedidos</span>
            )}
          </label>
        )}
      </form>
      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={guardar.isPending}
          onClick={() =>
            (
              document.getElementById('formulario-repuesto') as HTMLFormElement | null
            )?.requestSubmit()
          }
        >
          Guardar
        </Boton>
        <Boton accion="global.cancelar" onClick={() => alTerminar()}>
          Cancelar
        </Boton>
      </div>
    </section>
  )
}
