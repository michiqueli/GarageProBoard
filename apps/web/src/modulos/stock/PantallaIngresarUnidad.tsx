import { accesoDeRuta, contrato } from '@gpb/contracts'
import { numeroDeHoja } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { notificar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoVolver } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { SelectorVehiculo, type VehiculoElegido } from '../../componentes/SelectorVehiculo.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo, useVolver } from '../../teclado/index.ts'
import { AltaVehiculo } from '../vehiculos/AltaVehiculo.tsx'
import { CONDICION, ORIGEN, TENENCIA, type Unidad } from './stock.tsx'

const opciones = <T extends string>(textos: Record<T, string>) =>
  (Object.entries(textos) as Array<[T, string]>).map(([valor, texto]) => ({ valor, texto }))

/** Un vehículo entra al stock. La tenencia se elige acá, unidad por unidad. */
export function PantallaIngresarUnidad() {
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursales = usarSesion((e) => e.datos?.sucursales ?? [])
  const activa = usarSesion((e) => e.datos?.sucursalActiva.id ?? '')
  useVolver(() => void navegar({ to: '/stock' }))

  const config = useQuery({
    queryKey: ['stock', tenantId, 'config'],
    queryFn: () => api.cartera.config(),
  })

  const [alta, setAlta] = useState<string | null>(null)
  const [vehiculo, setVehiculo] = useState<VehiculoElegido | null>(null)
  const [condicion, setCondicion] = useState<Unidad['condicion']>('usado')
  const [tenenciaElegida, setTenencia] = useState<Unidad['tenencia'] | null>(null)
  const [origenElegido, setOrigen] = useState<Unidad['origen'] | null>(null)
  const [consignante, setConsignante] = useState<ClienteElegido | null>(null)
  const [sucursalId, setSucursalId] = useState(activa)
  const [precio, setPrecio] = useState('')
  const [monedaElegida, setMoneda] = useState<Unidad['moneda'] | null>(null)
  const [observaciones, setObservaciones] = useState('')
  // La factura con la que se compró: la de la fábrica en un 0km. Queda como el costo de compra.
  const puedeCargarCompra = usePuedeUsar(contrato.costosUnidad.agregar)
  const [factura, setFactura] = useState('')
  const [fechaFactura, setFechaFactura] = useState('')
  const [importeCompra, setImporteCompra] = useState('')

  // La configuración sólo pone el valor inicial: lo que se elige acá, manda.
  const tenencia =
    tenenciaElegida ?? (condicion === 'usado' ? (config.data?.tenenciaUsado ?? 'propia') : 'propia')
  const origen =
    origenElegido ??
    (tenencia === 'consignacion' ? 'consignacion' : condicion === '0km' ? 'fabrica' : 'compra')
  const moneda = monedaElegida ?? config.data?.moneda ?? 'ARS'

  const precioMalo = precio.trim() !== '' && numeroDeHoja(precio) === null
  const conCompra = puedeCargarCompra && tenencia === 'propia'
  const importeCompraMalo =
    importeCompra.trim() !== '' &&
    (numeroDeHoja(importeCompra) === null || Number(numeroDeHoja(importeCompra)) <= 0)
  const compraIncompleta =
    conCompra && !importeCompra.trim() && Boolean(factura.trim() || fechaFactura)
  const falta = !vehiculo
    ? 'Elegí el vehículo'
    : tenencia === 'consignacion' && !consignante
      ? 'Falta de quién es la unidad'
      : precioMalo
        ? 'El precio tiene que ser un número: 15000000'
        : importeCompraMalo
          ? 'El importe de la factura tiene que ser un número'
          : compraIncompleta
            ? 'Falta el importe de la factura de compra'
            : null

  const ingresar = useMutation({
    mutationFn: () =>
      api.cartera.ingresar({
        vehiculoId: vehiculo?.id as string,
        condicion,
        tenencia,
        origen,
        consignanteId: tenencia === 'consignacion' ? (consignante?.id ?? null) : null,
        sucursalId,
        precio: precio.trim() ? numeroDeHoja(precio) : null,
        moneda,
        observaciones: observaciones.trim() || null,
      }),
    onSuccess: async (u) => {
      if (conCompra && importeCompra.trim()) {
        try {
          await api.costosUnidad.agregar({
            id: u.id,
            tipo: 'compra',
            descripcion: condicion === '0km' ? 'Compra a fábrica' : 'Compra',
            comprobante: factura.trim() || null,
            fecha: fechaFactura || null,
            importe: numeroDeHoja(importeCompra) as string,
            moneda,
          })
        } catch (error) {
          notificar.error(`La unidad entró, pero la factura de compra no: ${mensajeGeneral(error)}`)
        }
      }
      await cache.invalidateQueries({ queryKey: ['stock', tenantId] })
      void navegar({ to: '/stock/$id', params: { id: u.id } })
    },
    meta: { exito: 'Unidad ingresada al stock', error: mensajeGeneral },
  })
  const guardable = !falta && !ingresar.isPending
  useAtajo('global.guardar', () => guardable && ingresar.mutate())

  return (
    <Shell titulo="Ingresar unidad" requiere={accesoDeRuta(contrato.cartera.ingresar)}>
      <Link to="/stock" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todo el stock
      </Link>

      {alta !== null && (
        <AltaVehiculo
          dominio={alta}
          alCrear={(v) => {
            setVehiculo(v as VehiculoElegido)
            setAlta(null)
          }}
          alCancelar={() => setAlta(null)}
        />
      )}

      <section
        aria-label="Datos de la unidad"
        className="grid max-w-4xl gap-3 rounded-base border border-borde bg-superficie p-3 md:grid-cols-3"
      >
        <div className="md:col-span-3">
          <SelectorVehiculo
            etiqueta="Vehículo"
            valor={vehiculo}
            onChange={setVehiculo}
            autoFocus
            alNoEncontrar={setAlta}
          />
        </div>
        <Selector
          etiqueta="Condición"
          valor={condicion}
          opciones={opciones(CONDICION)}
          onChange={(v) => v && setCondicion(v)}
        />
        <Selector
          etiqueta="Tenencia"
          valor={tenencia}
          opciones={opciones(TENENCIA)}
          onChange={(v) => v && setTenencia(v)}
        />
        <Selector
          etiqueta="Origen"
          valor={origen}
          opciones={opciones(ORIGEN)}
          onChange={(v) => v && setOrigen(v)}
        />
        {tenencia === 'consignacion' && (
          <div className="md:col-span-3">
            <SelectorCliente
              etiqueta="De quién es (consignante)"
              valor={consignante}
              onChange={setConsignante}
            />
          </div>
        )}
        <Selector
          etiqueta="Sucursal"
          valor={sucursalId}
          opciones={sucursales.map((s) => ({ valor: s.id, texto: s.nombre }))}
          onChange={(v) => v && setSucursalId(v)}
        />
        <Campo
          etiqueta="Precio (opcional)"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />
        <Selector
          etiqueta="Moneda"
          valor={moneda}
          opciones={[
            { valor: 'ARS' as const, texto: 'Pesos' },
            { valor: 'USD' as const, texto: 'Dólares' },
          ]}
          onChange={(v) => v && setMoneda(v)}
        />
        {conCompra && (
          <fieldset className="grid gap-3 border-t border-borde-suave pt-3 md:col-span-3 md:grid-cols-3">
            <legend className="text-etiqueta font-medium text-texto-suave">
              Factura de compra (opcional)
            </legend>
            <Campo
              etiqueta="Número de factura"
              value={factura}
              maxLength={60}
              onChange={(e) => setFactura(e.target.value)}
              ayuda={condicion === '0km' ? 'La de la fábrica: 0065-00710617' : undefined}
            />
            <Campo
              etiqueta="Fecha de la factura"
              type="date"
              value={fechaFactura}
              onChange={(e) => setFechaFactura(e.target.value)}
            />
            <Campo
              etiqueta={`Importe (${moneda === 'USD' ? 'dólares' : 'pesos'})`}
              inputMode="decimal"
              value={importeCompra}
              onChange={(e) => setImporteCompra(e.target.value)}
              ayuda="Queda como el costo de compra de la unidad"
            />
          </fieldset>
        )}
        <div className="md:col-span-3">
          <Campo
            etiqueta="Observaciones"
            value={observaciones}
            maxLength={500}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:col-span-3">
          <Boton
            accion="global.guardar"
            variante="principal"
            deshabilitado={!guardable}
            onClick={() => ingresar.mutate()}
          >
            Ingresar al stock
          </Boton>
          {falta && <span className="text-etiqueta text-texto-suave">{falta}</span>}
        </div>
      </section>
    </Shell>
  )
}
