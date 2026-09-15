import { beforeEach, describe, expect, it } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { OTRA_PERSONA, SESION, SESION_VARIAS } from './montar.tsx'

beforeEach(() => usarSesion.getState().limpiar())

describe('cuándo se pregunta la sucursal', () => {
  it('al entrar con varias sucursales y ninguna predeterminada', () => {
    usarSesion.getState().entrar(SESION_VARIAS)
    expect(usarSesion.getState().eligiendoSucursal).toBe(true)
  })

  it('no, al entrar con una sola', () => {
    usarSesion.getState().entrar(SESION)
    expect(usarSesion.getState().eligiendoSucursal).toBe(false)
  })

  it('no, al entrar con una predeterminada guardada', () => {
    usarSesion.getState().entrar({
      ...SESION_VARIAS,
      config: { ...SESION_VARIAS.config, sucursalPredeterminadaId: 's1' },
    })
    expect(usarSesion.getState().eligiendoSucursal).toBe(false)
  })

  /**
   * La regresión: `establecer` recalculaba la pregunta en cada llamada, y la llama
   * también la renovación del acceso. Quien tenía varias sucursales rebotaba a la
   * pantalla de elección cada quince minutos, en medio de lo que estuviera cargando.
   */
  it('no vuelve a preguntar cuando se renueva el acceso', () => {
    const sesion = usarSesion.getState()
    sesion.entrar(SESION_VARIAS)
    sesion.sucursalElegida()

    usarSesion.getState().establecer({ ...SESION_VARIAS, access: 'otro-access' })

    expect(usarSesion.getState().eligiendoSucursal).toBe(false)
    expect(usarSesion.getState().access).toBe('otro-access')
  })

  it('no pregunta al recuperar la sesión con la cookie después de recargar', () => {
    // El servidor conserva la sucursal elegida en la familia de tokens.
    usarSesion.getState().establecer(SESION_VARIAS)
    expect(usarSesion.getState().eligiendoSucursal).toBe(false)
  })

  it('sí pregunta si la renovación trae a otra persona', () => {
    // Otra pestaña cerró sesión y entró alguien más: la cookie ya es de otro.
    const sesion = usarSesion.getState()
    sesion.entrar(SESION_VARIAS)
    sesion.sucursalElegida()

    usarSesion.getState().establecer(OTRA_PERSONA)

    expect(usarSesion.getState().eligiendoSucursal).toBe(true)
  })
})
