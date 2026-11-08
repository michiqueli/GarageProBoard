import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import { mensajeGeneral } from '../src/sesion/consultas.ts'

describe('el mensaje de un error', () => {
  it('si la API dice el motivo, muestra el motivo', () => {
    const error = new ORPCError('SIN_REGLA', {
      status: 422,
      message: 'No hay un comprobante previsto para esa combinación',
      data: { motivo: 'Una empresa no se factura a sí misma.' },
    })
    expect(mensajeGeneral(error)).toBe('Una empresa no se factura a sí misma.')
  })

  it('sin motivo, el mensaje del error', () => {
    expect(mensajeGeneral(new ORPCError('X', { status: 409, message: 'No se pudo' }))).toBe(
      'No se pudo',
    )
  })
})
