import { contrato } from '@gpb/contracts'
import { MINIMO_MOTIVO_CARTERA, numeroDeHoja } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { preguntar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoAgregar } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { fechaCorta, importeUnidad } from './stock.tsx'

type Costos = Awaited<ReturnType<typeof api.costosUnidad.ver>>
type Tipo = Costos['conceptos'][number]['tipo']
type Moneda = Costos['moneda']

const TIPO: Record<Tipo, string> = {
  compra: 'Compra',
  gasto: 'Gasto',
  bonificacion: 'Bonificación',
}

/**
 * Lo que costó la unidad y lo que deja. Es optativo: quien no carga nada, no ve números. Y es de
 * quien tenga el permiso: el que vende no tiene por qué saber cuánto se pagó.
 */
export function CostosDeUnidad({ id }: { id: string }) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const puedeVer = usePuedeUsar(contrato.costosUnidad.ver)
  const puedeAgregar = usePuedeUsar(contrato.costosUnidad.agregar)
  const puedeAnular = usePuedeUsar(contrato.costosUnidad.anular)
  const [cargando, setCargando] = useState(false)
  const clave = ['stock', tenantId, 'costos', id]

  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => api.costosUnidad.ver({ id }),
    enabled: puedeVer,
  })
  const anular = useMutation({
    mutationFn: (v: { conceptoId: string; motivo: string }) =>
      api.costosUnidad.anular({ id, ...v }),
    onSuccess: (r) => cache.setQueryData(clave, r),
    meta: { exito: 'Concepto anulado: ya no suma', error: mensajeGeneral },
  })

  async function pedirAnular(conceptoId: string, descripcion: string) {
    const motivo = await preguntar({
      titulo: `¿Anular «${descripcion}»?`,
      texto: 'Deja de sumar. Sigue a la vista, tachado y con el motivo.',
      confirmar: 'Anular',
      peligro: true,
      campo: {
        etiqueta: 'Por qué',
        valor: '',
        validar: (v) =>
          v.trim().length < MINIMO_MOTIVO_CARTERA ? 'Decí por qué: queda escrito' : null,
      },
    })
    if (motivo) anular.mutate({ conceptoId, motivo: motivo.trim() })
  }

  if (!puedeVer) return null
  const d = consulta.data

  return (
    <section
      aria-label="Costos y margen"
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="flex items-center justify-between border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">Costos y margen</h2>
        {puedeAgregar && !cargando && (
          <Boton tamano="chico" icono={<IconoAgregar />} onClick={() => setCargando(true)}>
            Agregar
          </Boton>
        )}
      </header>

      {consulta.isPending && (
        <div className="m-3 h-16 animate-pulse rounded-base bg-superficie-2" />
      )}
      {consulta.isError && (
        <p role="alert" className="px-3 py-3 text-dato text-critico">
          {mensajeGeneral(consulta.error)}
        </p>
      )}

      {cargando && d && (
        <FormConcepto
          id={id}
          moneda={d.moneda}
          alTerminar={() => setCargando(false)}
          guardado={(r) => cache.setQueryData(clave, r)}
        />
      )}

      {d && d.conceptos.length === 0 && !cargando && (
        <p className="px-3 py-4 text-dato text-texto-suave">
          Todavía no se cargó lo que costó. Sumá la compra, los gastos y las bonificaciones para ver
          cuánto deja esta unidad.
        </p>
      )}

      {d && d.conceptos.length > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-borde-suave px-3 py-2.5 text-dato sm:grid-cols-4">
            <Total nombre="Compra" valor={importeUnidad(d.totales.compra, d.moneda)} />
            <Total nombre="Gastos" valor={importeUnidad(d.totales.gastos, d.moneda)} />
            <Total
              nombre="Bonificaciones"
              valor={importeUnidad(d.totales.bonificaciones, d.moneda)}
            />
            <Total nombre="Costo total" valor={importeUnidad(d.totales.costo, d.moneda)} />
            <Total
              nombre="Margen"
              valor={
                d.totales.margen === null
                  ? 'Falta el precio'
                  : `${importeUnidad(d.totales.margen, d.moneda)}${d.totales.margenPorcentaje ? ` · ${d.totales.margenPorcentaje} %` : ''}`
              }
            />
          </dl>
          {d.totales.sinConvertir > 0 && (
            <p className="border-b border-borde-suave px-3 py-2 text-etiqueta text-atencion">
              {d.totales.sinConvertir === 1
                ? 'Un concepto está en otra moneda y no tiene cotización: no entra en la suma.'
                : `${d.totales.sinConvertir} conceptos están en otra moneda y no tienen cotización: no entran en la suma.`}
            </p>
          )}
          <ul className="divide-y divide-borde-suave">
            {d.conceptos.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-dato"
              >
                <span className={c.anulacionMotivo ? 'text-texto-tenue line-through' : ''}>
                  {c.descripcion}
                </span>
                <span className="text-etiqueta text-texto-suave">
                  {[TIPO[c.tipo], c.categoria, c.proveedor, fechaCorta(c.fecha), c.comprobante]
                    .filter(Boolean)
                    .join(' · ')}
                  {c.anulacionMotivo ? ` · anulado: ${c.anulacionMotivo}` : ''}
                </span>
                <span
                  className={`tabular ml-auto font-mono ${c.anulacionMotivo ? 'text-texto-tenue line-through' : ''}`}
                >
                  {c.tipo === 'bonificacion' ? '− ' : ''}
                  {importeUnidad(c.importe, c.moneda)}
                </span>
                {puedeAnular && !c.anulacionMotivo && (
                  <Boton
                    tamano="chico"
                    deshabilitado={anular.isPending}
                    onClick={() => void pedirAnular(c.id, c.descripcion)}
                  >
                    Anular
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Total({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div>
      <dt className="text-etiqueta text-texto-tenue">{nombre}</dt>
      <dd className="tabular font-mono">{valor}</dd>
    </div>
  )
}

function FormConcepto({
  id,
  moneda: monedaUnidad,
  alTerminar,
  guardado,
}: {
  id: string
  moneda: Moneda
  alTerminar: () => void
  guardado: (c: Costos) => void
}) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const categorias = useQuery({
    queryKey: ['stock', tenantId, 'categorias'],
    queryFn: () => api.costosUnidad.categorias(),
  })
  const [tipo, setTipo] = useState<Tipo>('compra')
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [comprobante, setComprobante] = useState('')
  const [importe, setImporte] = useState('')
  const [moneda, setMoneda] = useState<Moneda>(monedaUnidad)
  const [cotizacion, setCotizacion] = useState('')

  const numero = numeroDeHoja(importe)
  const cotizacionMala = cotizacion.trim() !== '' && numeroDeHoja(cotizacion) === null
  const valido =
    descripcion.trim() !== '' && numero !== null && Number(numero) > 0 && !cotizacionMala

  const agregar = useMutation({
    mutationFn: () =>
      api.costosUnidad.agregar({
        id,
        tipo,
        categoriaId: tipo === 'gasto' ? categoriaId : null,
        descripcion: descripcion.trim(),
        comprobante: comprobante.trim() || null,
        importe: numero as string,
        moneda,
        cotizacion: cotizacion.trim() ? numeroDeHoja(cotizacion) : null,
      }),
    onSuccess: (r) => {
      guardado(r)
      alTerminar()
    },
    meta: { exito: 'Concepto agregado', error: mensajeGeneral },
  })

  return (
    <div className="grid gap-3 border-b border-borde p-3 md:grid-cols-3">
      <Selector
        etiqueta="Qué es"
        valor={tipo}
        onChange={(v) => v && setTipo(v)}
        opciones={(Object.keys(TIPO) as Tipo[]).map((valor) => ({ valor, texto: TIPO[valor] }))}
      />
      {tipo === 'gasto' && (
        <Selector
          etiqueta="Categoría"
          valor={categoriaId}
          vacio="Sin categoría"
          onChange={setCategoriaId}
          opciones={(categorias.data?.datos ?? [])
            .filter((c) => c.activo)
            .map((c) => ({ valor: c.id, texto: c.nombre }))}
        />
      )}
      <Campo
        etiqueta="Descripción"
        value={descripcion}
        maxLength={200}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <Campo
        etiqueta="Importe"
        inputMode="decimal"
        value={importe}
        onChange={(e) => setImporte(e.target.value)}
      />
      <Selector
        etiqueta="Moneda"
        valor={moneda}
        onChange={(v) => v && setMoneda(v)}
        opciones={[
          { valor: 'ARS' as const, texto: 'Pesos' },
          { valor: 'USD' as const, texto: 'Dólares' },
        ]}
      />
      {moneda !== monedaUnidad && (
        <Campo
          etiqueta="Cotización"
          ayuda="Pesos por dólar. Sin ella no entra en la suma"
          inputMode="decimal"
          value={cotizacion}
          onChange={(e) => setCotizacion(e.target.value)}
        />
      )}
      <Campo
        etiqueta="Comprobante (opcional)"
        value={comprobante}
        maxLength={60}
        onChange={(e) => setComprobante(e.target.value)}
      />
      <span className="flex gap-2 md:col-span-3">
        <Boton
          variante="principal"
          deshabilitado={!valido || agregar.isPending}
          onClick={() => agregar.mutate()}
        >
          Agregar
        </Boton>
        <Boton onClick={alTerminar}>Cancelar</Boton>
      </span>
    </div>
  )
}
