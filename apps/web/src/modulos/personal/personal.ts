import { PUESTOS, type Puesto } from '@gpb/contracts'
import { ORPCError } from '@orpc/client'
import { notificar } from '../../componentes/avisos.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'

export const OPCIONES_PUESTO = (Object.keys(PUESTOS) as Puesto[]).map((valor) => ({
  valor,
  texto: PUESTOS[valor],
}))

export const nombrePuesto = (puesto: Puesto) => PUESTOS[puesto]

/**
 * Un error dice qué hacer. El del legajo repetido trae de quién es: «ya lo tiene otro» a secas
 * obliga a salir a buscarlo a mano por una lista de cuarenta.
 */
export function mensajeDe(error: unknown): string {
  if (error instanceof ORPCError) {
    const datos = error.data as { razonSocial?: string; legajo?: string } | undefined
    if (error.code === 'LEGAJO_DUPLICADO' && datos?.razonSocial) {
      return `Ese legajo ya lo tiene ${datos.razonSocial}. Poné otro.`
    }
    if (error.code === 'EMPLEADO_DUPLICADO' && datos?.razonSocial) {
      return `${datos.razonSocial} ya está en el personal${datos.legajo ? `, con el legajo ${datos.legajo}` : ''}.`
    }
    return error.message
  }
  return mensajeGeneral(error)
}

/**
 * Las credenciales en otra pestaña, donde se imprimen. La pestaña se abre **antes** de pedir el
 * PDF: si se abriera después de la espera, el navegador la toma por una ventana emergente y la
 * bloquea.
 */
export async function imprimirCredenciales(ids: readonly string[]) {
  const ventana = window.open('', '_blank')
  try {
    const archivo = (await api.personal.pdfCredenciales({ ids: [...ids] })) as Blob
    const url = URL.createObjectURL(archivo)
    if (ventana) ventana.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    ventana?.close()
    notificar.error(`No se pudieron abrir las credenciales para imprimir. ${mensajeDe(error)}`)
  }
}
