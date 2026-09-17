import { notificar } from '../../componentes/avisos.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'

/** «Factura B 00005-00000042», como se nombra un comprobante en la calle. */
export function nombreComprobante(c: { nombre: string; puntoVenta: number; numero: number }) {
  return `${c.nombre} ${String(c.puntoVenta).padStart(5, '0')}-${String(c.numero).padStart(8, '0')}`
}

/**
 * Trae el PDF y lo abre en otra pestaña, donde el visor del navegador lo imprime o lo
 * guarda. Se abre la pestaña antes de pedirlo: si se abre después de esperar, el navegador
 * lo toma como una ventana emergente y la bloquea.
 */
export async function abrirPdf(id: string) {
  const ventana = window.open('', '_blank')
  try {
    const archivo = (await api.comprobantes.pdf({ id })) as Blob
    const url = URL.createObjectURL(archivo)
    if (ventana) ventana.location.href = url
    else window.location.href = url
    // Se libera cuando la otra pestaña ya lo cargó.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    ventana?.close()
    notificar.error(`No se pudo abrir el PDF. ${mensajeGeneral(error)}`)
  }
}

export const ALICUOTAS = [
  { valor: 5, texto: '21%' },
  { valor: 4, texto: '10,5%' },
  { valor: 6, texto: '27%' },
  { valor: 8, texto: '5%' },
  { valor: 9, texto: '2,5%' },
  { valor: 3, texto: '0%' },
] as const

export const CONDICIONES_VENTA = [
  'Contado',
  'Tarjeta de débito',
  'Tarjeta de crédito',
  'Transferencia',
  'Cuenta corriente',
  'Otra',
] as const
