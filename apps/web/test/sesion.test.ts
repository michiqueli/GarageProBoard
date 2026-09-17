import { beforeEach, describe, expect, it } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { EN_NORTE, OTRA_PERSONA, SESION, SESION_VARIAS } from './montar.tsx'

beforeEach(() => usarSesion.getState().limpiar())

/**
 * Si falta elegir sucursal lo dice el servidor (`sucursalPendiente`): tiene varias, ninguna
 * predeterminada y todavía no eligió. La pestaña no lo recalcula, y por eso recargar la página
 * en la pantalla de elección vuelve a preguntar en vez de entrar a la primera.
 */
describe('cuándo se pregunta la sucursal', () => {
  it('al entrar, si el servidor dice que falta elegir', () => {
    usarSesion.getState().entrar(SESION_VARIAS)
    expect(usarSesion.getState().eligiendoSucursal).toBe(true)
  })

  it('no, al entrar con una sola o con una predeterminada guardada', () => {
    usarSesion.getState().entrar(SESION)
    expect(usarSesion.getState().eligiendoSucursal).toBe(false)
  })

  /**
   * La regresión de antes: `establecer` recalculaba la pregunta en cada llamada, y la llama
   * también la renovación del acceso. Quien tenía varias sucursales rebotaba a la pantalla
   * de elección cada quince minutos. Ya elegida, el servidor la manda confirmada.
   */
  it('no vuelve a preguntar cuando se renueva el acceso después de elegir', () => {
    const sesion = usarSesion.getState()
    sesion.entrar(SESION_VARIAS)
    sesion.establecer(EN_NORTE)
    sesion.sucursalElegida()

    usarSesion.getState().establecer({ ...EN_NORTE, access: 'otro-access' })

    expect(usarSesion.getState().eligiendoSucursal).toBe(false)
    expect(usarSesion.getState().access).toBe('otro-access')
  })

  it('no pregunta al recargar con la sucursal ya elegida', () => {
    usarSesion.getState().establecer(EN_NORTE)
    expect(usarSesion.getState().eligiendoSucursal).toBe(false)
  })

  it('sí pregunta al recargar en la pantalla de elección, sin haber elegido', () => {
    usarSesion.getState().establecer(SESION_VARIAS)
    expect(usarSesion.getState().eligiendoSucursal).toBe(true)
  })

  it('quien apretó «Cambiar sucursal» sigue eligiendo aunque se renueve el acceso', () => {
    const sesion = usarSesion.getState()
    sesion.entrar(EN_NORTE)
    sesion.elegirSucursal()

    usarSesion.getState().establecer({ ...EN_NORTE, access: 'otro-access' })

    expect(usarSesion.getState().eligiendoSucursal).toBe(true)
  })

  it('sí pregunta si la renovación trae a otra persona que tiene que elegir', () => {
    // Otra pestaña cerró sesión y entró alguien más: la cookie ya es de otro.
    const sesion = usarSesion.getState()
    sesion.entrar(EN_NORTE)
    sesion.sucursalElegida()

    usarSesion.getState().establecer(OTRA_PERSONA)

    expect(usarSesion.getState().eligiendoSucursal).toBe(true)
  })
})
