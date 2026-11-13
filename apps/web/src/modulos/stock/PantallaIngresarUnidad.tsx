import { accesoDeRuta, contrato } from '@gpb/contracts'
import { numeroDeHoja } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { notificar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoVolver } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo, useVolver } from '../../teclado/index.ts'
import { dominioValido, normalizarDominio } from '../vehiculos/datos-vehiculo.tsx'
import { CONDICION, ORIGEN, TENENCIA, type Unidad } from './stock.tsx'

const opciones = <T extends string>(textos: Record<T, string>) =>
  (Object.entries(textos) as Array<[T, string]>).map(([valor, texto]) => ({ valor, texto }))

/**
 * Una unidad entra al stock con sus datos: los de la factura de la fábrica en un 0km, los de la
 * cédula en un usado. No se busca en Vehículos: si el chasis ya lo conoce el taller, la API usa
 * esa ficha y le completa lo que falte. La tenencia se elige acá, unidad por unidad.
 */
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

  const idMarcas = useId()
  const idModelos = useId()
  const [chasis, setChasis] = useState('')
  const [motor, setMotor] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [anio, setAnio] = useState('')
  const [color, setColor] = useState('')
  const [dominio, setDominio] = useState('')
  const [kilometraje, setKilometraje] = useState('')
  const puedeVerMarcas = usePuedeUsar(contrato.vehiculos.marcas)
  const marcas = useQuery({
    queryKey: ['vehiculos', 'marcas', tenantId],
    queryFn: () => api.vehiculos.marcas(),
    enabled: puedeVerMarcas,
  })
  const modelos =
    marcas.data?.datos.find((m) => m.marca.toLowerCase() === marca.trim().toLowerCase())?.modelos ??
    []
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
  const patente = normalizarDominio(dominio)
  const faltaVehiculo = !/^[A-HJ-NPR-Z0-9]{6,17}$/.test(chasis)
    ? chasis
      ? 'El chasis son de 6 a 17 letras y números, sin I, O ni Q'
      : 'Falta el chasis'
    : Boolean(marca.trim()) !== Boolean(modelo.trim())
      ? 'Marca y modelo van juntos'
      : anio && !/^(19|20|21)[0-9]{2}$/.test(anio)
        ? 'El año son cuatro dígitos'
        : condicion === 'usado' && patente && !dominioValido(patente)
          ? 'La patente es ABC 123 o AB 123 CD'
          : condicion === 'usado' && kilometraje && !/^[0-9]+$/.test(kilometraje.replace(/\./g, ''))
            ? 'Los kilómetros son sólo números'
            : null
  const falta = faltaVehiculo
    ? faltaVehiculo
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
        vehiculo: {
          chasis,
          motor: motor.trim() || null,
          marca: marca.trim() || null,
          modelo: modelo.trim() || null,
          anio: anio ? Number(anio) : null,
          color: color.trim() || null,
          dominio: condicion === 'usado' ? patente || null : null,
          kilometraje:
            condicion === 'usado' && kilometraje ? Number(kilometraje.replace(/\./g, '')) : null,
        },
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

      <section
        aria-label="Datos de la unidad"
        className="grid max-w-4xl gap-3 rounded-base border border-borde bg-superficie p-3 md:grid-cols-3"
      >
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
        <Campo
          etiqueta="Chasis"
          required
          // biome-ignore lint/a11y/noAutofocus: es lo primero que se carga
          autoFocus
          value={chasis}
          onChange={(e) => setChasis(e.target.value.toUpperCase().replace(/[\s*]/g, ''))}
          ayuda={condicion === '0km' ? 'Está en la factura de la fábrica' : 'Está en la cédula'}
        />
        <Campo
          etiqueta="Número de motor"
          value={motor}
          onChange={(e) => setMotor(e.target.value.toUpperCase())}
        />
        <Campo etiqueta="Color" value={color} onChange={(e) => setColor(e.target.value)} />
        <Campo
          etiqueta="Marca"
          list={idMarcas}
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
        />
        <datalist id={idMarcas}>
          {marcas.data?.datos.map((m) => (
            <option key={m.marca} value={m.marca} />
          ))}
        </datalist>
        <Campo
          etiqueta="Modelo"
          list={idModelos}
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
        />
        <datalist id={idModelos}>
          {modelos.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Campo
          etiqueta="Año"
          inputMode="numeric"
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
        />
        {condicion === 'usado' && (
          <>
            <Campo
              etiqueta="Patente"
              value={dominio}
              onChange={(e) => setDominio(e.target.value.toUpperCase())}
            />
            <Campo
              etiqueta="Kilómetros"
              inputMode="numeric"
              value={kilometraje}
              onChange={(e) => setKilometraje(e.target.value)}
            />
            <div className="hidden md:block" />
          </>
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
