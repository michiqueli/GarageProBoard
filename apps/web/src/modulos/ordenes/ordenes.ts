import { notificar } from '../../componentes/avisos.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'

export const COMBUSTIBLES = [
  { valor: 'vacio', texto: 'Vacío' },
  { valor: 'cuarto', texto: '1/4' },
  { valor: 'medio', texto: '1/2' },
  { valor: 'tres_cuartos', texto: '3/4' },
  { valor: 'lleno', texto: 'Lleno' },
] as const

export type Combustible = (typeof COMBUSTIBLES)[number]['valor']

export const ESTADOS_EN_TALLER = [
  { valor: 'recibida', texto: 'Recibida' },
  { valor: 'en_proceso', texto: 'En proceso' },
  { valor: 'esperando_repuesto', texto: 'Esperando repuesto' },
  { valor: 'esperando_autorizacion', texto: 'Esperando autorización' },
] as const

/** «OT 000123». */
export const nombreOrden = (numero: number) => `OT ${String(numero).padStart(6, '0')}`

/**
 * La orden impresa, en otra pestaña donde se imprime. La pestaña se abre antes de pedir el
 * PDF: si se abre después de esperar, el navegador la toma por una ventana emergente.
 */
export async function imprimirOrden(id: string) {
  const ventana = window.open('', '_blank')
  try {
    const archivo = (await api.ordenes.pdf({ id })) as Blob
    const url = URL.createObjectURL(archivo)
    if (ventana) ventana.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    ventana?.close()
    notificar.error(`No se pudo abrir la orden para imprimir. ${mensajeGeneral(error)}`)
  }
}
