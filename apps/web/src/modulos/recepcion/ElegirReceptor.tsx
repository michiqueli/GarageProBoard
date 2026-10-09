import { PUESTOS, type Puesto } from '@gpb/contracts'
import { type MotivoVisita, PUESTOS_POR_MOTIVO } from '@gpb/core'
import { Selector } from '../../componentes/Selector.tsx'
import type { api } from '../../sesion/cliente.ts'

export type Receptor = Awaited<ReturnType<typeof api.recepcion.receptores>>['datos'][number]

export /**
 * Los que pueden atender este motivo primero —vendedores para un plan de ahorro, asesores
 * para servicio— y después el resto, porque el gerente atiende a cualquiera.
 */
function ElegirReceptor({
  motivo,
  valor,
  receptores,
  onChange,
  actual,
  compacto = false,
}: {
  motivo: MotivoVisita
  valor: string | null
  receptores: Receptor[]
  onChange: (id: string | null) => void
  actual?: { id: string; nombre: string } | null
  compacto?: boolean
}) {
  const propios = PUESTOS_POR_MOTIVO[motivo]
  const ordenados = [...receptores].sort(
    (a, b) => Number(!propios.includes(a.puesto)) - Number(!propios.includes(b.puesto)),
  )
  const opciones = ordenados.map((r) => ({
    valor: r.id,
    texto: `${r.nombre} · ${PUESTOS[r.puesto as Puesto]}`,
  }))
  if (actual && !opciones.some((o) => o.valor === actual.id)) {
    opciones.unshift({ valor: actual.id, texto: actual.nombre })
  }

  if (compacto) {
    return (
      <select
        aria-label="Lo atiende"
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-7 max-w-56 rounded-base border border-borde bg-superficie-2 px-1.5 text-etiqueta text-texto"
      >
        <option value="">Sin asignar</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    )
  }
  return (
    <Selector
      etiqueta="Lo atiende"
      valor={valor}
      vacio="Sin asignar"
      onChange={onChange}
      opciones={opciones}
    />
  )
}
