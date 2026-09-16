import { ORPCError } from '@orpc/client'
import type { api } from '../sesion/cliente.ts'

type Contribuyente = Awaited<ReturnType<typeof api.padron.consultar>>

/**
 * Lo que contestó AFIP, con lo que hay que mirar antes de guardar: si la condición frente
 * al IVA es una deducción, si es un CUIL o si está inactivo.
 *
 * `avisarCuil` apaga el aviso del CUIL donde no importa: una persona sin inscripción no
 * puede facturar, pero sí puede ser cliente.
 */
export function ResultadoPadron({
  consulta,
  avisarCuil = true,
}: {
  consulta: { isError: boolean; error: unknown; data?: Contribuyente | undefined }
  avisarCuil?: boolean
}) {
  if (consulta.isError) {
    return (
      <p role="alert" className="text-etiqueta text-critico">
        {consulta.error instanceof ORPCError
          ? consulta.error.message
          : 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'}
      </p>
    )
  }
  const c = consulta.data
  if (!c) return null

  const avisos = [
    avisarCuil &&
      c.tipoClave === 'CUIL' &&
      'Es un CUIL, no un CUIT: una persona sin inscripción en AFIP no puede facturar.',
    !c.activo && 'AFIP lo informa inactivo.',
    c.condicionIva.fuente === 'inferida' && c.condicionIva.motivo,
  ].filter((a): a is string => Boolean(a))

  return (
    <div role="status" className="grid gap-0.5 text-etiqueta">
      <span className="text-ok">
        Datos completados con lo que informa AFIP. Revisalos antes de guardar.
      </span>
      {avisos.map((a) => (
        <span key={a} className="text-atencion">
          {a}
        </span>
      ))}
    </div>
  )
}
