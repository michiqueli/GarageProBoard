import { COMBUSTIBLES } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { Campo } from '../../componentes/Campo.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'

export type Combustible = (typeof COMBUSTIBLES)[number]

export const COMBUSTIBLE: Record<Combustible, string> = {
  nafta: 'Nafta',
  diesel: 'Diésel',
  gnc: 'GNC',
  electrico: 'Eléctrico',
  hibrido: 'Híbrido',
}

/** «ab 123 cd» → «AB123CD». La patente se escribe como se lee y se guarda compacta. */
export function normalizarDominio(texto: string): string {
  return texto.replace(/[\s-]/g, '').toUpperCase()
}

export function dominioValido(dominio: string): boolean {
  return /^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$/.test(dominio)
}

/** «AB 123 CD» o «ABC 123», como está en la chapa. */
export function formatearDominio(dominio: string): string {
  return dominio.length === 7
    ? `${dominio.slice(0, 2)} ${dominio.slice(2, 5)} ${dominio.slice(5)}`
    : `${dominio.slice(0, 3)} ${dominio.slice(3)}`
}

/** Hoy en la Argentina, como AAAA-MM-DD: lo que espera un `<input type="date">`. */
export function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(),
  )
}

/** «15/06/2025». */
export function formatearFecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Los datos editables de un vehículo, como strings de formulario. */
export interface Datos {
  dominio: string
  marca: string
  modelo: string
  anio: string
  color: string
  motor: string
  combustible: Combustible | null
  kilometraje: string
  observaciones: string
}

export const DATOS_VACIOS: Datos = {
  dominio: '',
  marca: '',
  modelo: '',
  anio: '',
  color: '',
  motor: '',
  combustible: null,
  kilometraje: '',
  observaciones: '',
}

/** Lo que falta arreglar antes de mandar, campo por campo. Vacío si está todo bien. */
export function problemas(d: Datos): Partial<Record<keyof Datos, string>> {
  const dominio = normalizarDominio(d.dominio)
  return {
    ...(dominio && !dominioValido(dominio) ? { dominio: 'La patente es ABC 123 o AB 123 CD' } : {}),
    ...(Boolean(d.marca.trim()) !== Boolean(d.modelo.trim())
      ? { modelo: 'Marca y modelo van juntos: completá los dos, o ninguno' }
      : {}),
    ...(d.anio && !/^(19|20|21)[0-9]{2}$/.test(d.anio)
      ? { anio: 'El año son cuatro dígitos' }
      : {}),
    ...(d.kilometraje && !/^[0-9]+$/.test(d.kilometraje.replace(/\./g, ''))
      ? { kilometraje: 'Sólo números' }
      : {}),
  }
}

/** Para la API: vacío es `null`, y los números van como números. */
export function paraEnviar(d: Datos) {
  return {
    dominio: normalizarDominio(d.dominio) || null,
    marca: d.marca.trim() || null,
    modelo: d.modelo.trim() || null,
    anio: d.anio ? Number(d.anio) : null,
    color: d.color,
    motor: d.motor,
    combustible: d.combustible,
    kilometraje: d.kilometraje ? Number(d.kilometraje.replace(/\./g, '')) : null,
    observaciones: d.observaciones,
  }
}

/**
 * Los campos del vehículo, compartidos entre el alta y la modificación. La marca y el
 * modelo sugieren los que ya están cargados, pero aceptan cualquiera: si no existe, se crea.
 */
export function CamposVehiculo({
  datos,
  cambiar,
  errores,
}: {
  datos: Datos
  cambiar: (parcial: Partial<Datos>) => void
  errores: Partial<Record<keyof Datos, string>>
}) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const idMarcas = useId()
  const idModelos = useId()
  const marcas = useQuery({
    queryKey: ['vehiculos', 'marcas', tenantId],
    queryFn: () => api.vehiculos.marcas(),
  })
  const modelos =
    marcas.data?.datos.find((m) => m.marca.toLowerCase() === datos.marca.trim().toLowerCase())
      ?.modelos ?? []

  return (
    <>
      <Campo
        etiqueta="Patente"
        value={datos.dominio}
        onChange={(e) => cambiar({ dominio: e.target.value.toUpperCase() })}
        aria-invalid={Boolean(errores.dominio)}
        ayuda={errores.dominio ?? 'Vacía si es un 0km sin patentar'}
      />
      <Campo
        etiqueta="Marca"
        list={idMarcas}
        value={datos.marca}
        onChange={(e) => cambiar({ marca: e.target.value })}
      />
      <datalist id={idMarcas}>
        {marcas.data?.datos.map((m) => (
          <option key={m.marca} value={m.marca} />
        ))}
      </datalist>
      <Campo
        etiqueta="Modelo"
        list={idModelos}
        value={datos.modelo}
        onChange={(e) => cambiar({ modelo: e.target.value })}
        aria-invalid={Boolean(errores.modelo)}
        ayuda={errores.modelo}
      />
      <datalist id={idModelos}>
        {modelos.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <Campo
        etiqueta="Año"
        inputMode="numeric"
        value={datos.anio}
        onChange={(e) => cambiar({ anio: e.target.value })}
        aria-invalid={Boolean(errores.anio)}
        ayuda={errores.anio}
      />
      <Campo
        etiqueta="Color"
        value={datos.color}
        onChange={(e) => cambiar({ color: e.target.value })}
      />
      <Selector
        etiqueta="Combustible"
        valor={datos.combustible}
        vacio="Sin especificar"
        onChange={(v) => cambiar({ combustible: v })}
        opciones={COMBUSTIBLES.map((c) => ({ valor: c, texto: COMBUSTIBLE[c] }))}
      />
      <Campo
        etiqueta="Número de motor"
        value={datos.motor}
        onChange={(e) => cambiar({ motor: e.target.value.toUpperCase() })}
      />
      <Campo
        etiqueta="Kilómetros"
        inputMode="numeric"
        value={datos.kilometraje}
        onChange={(e) => cambiar({ kilometraje: e.target.value })}
        aria-invalid={Boolean(errores.kilometraje)}
        ayuda={errores.kilometraje ?? 'La última lectura conocida'}
      />
      <Campo
        etiqueta="Observaciones"
        value={datos.observaciones}
        onChange={(e) => cambiar({ observaciones: e.target.value })}
      />
    </>
  )
}
