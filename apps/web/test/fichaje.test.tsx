import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { montarApp } from './montar.tsx'

/**
 * El puesto de fichaje del taller.
 *
 * Es la excepción a todo el resto del sistema: sin sesión, sin menú, sin teclas de función. Un
 * mecánico con guantes, a dos metros, que apoya dos cosas contra un lector.
 *
 * La entrada es el **teclado entero** y no un campo, porque el lector USB es un teclado: tipea
 * el código y manda Enter. Lo que se prueba acá es lo que decide el cliente y no el servidor —
 * sobre todo el antirrebote, que es lo que evita la peor falla posible.
 */

const estacion = { estacion: vi.fn(), escanear: vi.fn() }
const token = vi.fn()

vi.mock('../src/modulos/fichaje/estacion.ts', () => ({
  apiEstacion: {
    fichaje: {
      estacion: () => estacion.estacion(),
      escanear: (x: unknown) => estacion.escanear(x),
      tableroEstacion: vi.fn(),
    },
  },
  tomarTokenDeLaUrl: () => undefined,
  tokenDeLaEstacion: () => token(),
  olvidarEstacion: vi.fn(),
}))

// El alfabeto es el de Crockford y **no tiene I, L, O ni U**, que se leen y se tipean mal.
const CREDENCIAL = 'GT1:M:A7K2P9QX:4F8B2C1D9E'
const ORDEN = 'GT1:O:B8K3Q1RY:5G9C3D2E0F'

const SIN_ABIERTAS = {
  resultado: 'ok',
  accion: null,
  titulo: 'Diego Sosa',
  detalle: 'Ahora escaneá la orden',
  esperandoOrden: true,
  empleado: { nombre: 'Diego Sosa', legajo: '0001' },
  orden: null,
  duracion: null,
  abiertas: [],
  otros: [],
}

const CON_ABIERTA = {
  ...SIN_ABIERTAS,
  abiertas: [
    {
      numero: 6,
      dominio: 'AB123CD',
      vehiculo: 'Volkswagen Amarok',
      desde: '2026-09-20T12:00:00.000Z',
      hace: '2 h 14 min',
    },
  ],
}

const EMPEZO = {
  resultado: 'ok',
  accion: 'abrio',
  titulo: 'Empezaste',
  detalle: 'OT 000006 · AB123CD',
  esperandoOrden: false,
  empleado: { nombre: 'Diego Sosa', legajo: '0001' },
  orden: { numero: 6, dominio: 'AB123CD' },
  duracion: null,
  abiertas: [],
  otros: [],
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  for (const f of [estacion.estacion, estacion.escanear, token]) f.mockReset()
  token.mockReturnValue('un-token')
  estacion.estacion.mockResolvedValue({
    id: 'e1',
    nombre: 'Taller, elevador 2',
    tipo: 'taller',
    sucursal: 'Casa Central',
    concesionaria: 'Automotores Litoral SAS',
  })
})

afterEach(cleanup)

describe('la pantalla en reposo', () => {
  it('sin token no ficha, y el aviso le habla a quien lo tiene que arreglar', async () => {
    token.mockReturnValue(null)
    await montarApp('/fichaje')

    expect(await screen.findByText(/no está registrada como estación/)).toBeDefined()
  })

  /**
   * La regresión que más dolió: un corte de red hacía que el puesto **borrara su token** y
   * quedara desautorizado para siempre. Con la API reiniciándose por un despliegue, todas las
   * PC del taller se olvidaban su token a la vez y había que ir a buscar la dirección a cada
   * una. El token sólo se borra con un rechazo definitivo.
   */
  it('un corte de red no desautoriza el puesto: reintenta y se recupera', async () => {
    const olvidar = vi.mocked((await import('../src/modulos/fichaje/estacion.ts')).olvidarEstacion)
    olvidar.mockClear()
    estacion.estacion.mockRejectedValueOnce(new Error('sin red')).mockResolvedValue({
      id: 'e1',
      nombre: 'Taller, elevador 2',
      tipo: 'taller',
      sucursal: 'Casa Central',
      concesionaria: 'Automotores Litoral SAS',
    })

    await montarApp('/fichaje')

    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeDefined()
    expect(olvidar).not.toHaveBeenCalled()
    // Y cuando el servidor vuelve, la pantalla sigue sola.
    expect(await screen.findByText('Escaneá tu credencial', {}, { timeout: 8000 })).toBeDefined()
  }, 15_000)

  /** Un rechazo definitivo sí: la estación se dio de baja y el token no tiene que quedar. */
  it('una estación revocada sí borra el token', async () => {
    const olvidar = vi.mocked((await import('../src/modulos/fichaje/estacion.ts')).olvidarEstacion)
    olvidar.mockClear()
    estacion.estacion.mockRejectedValue(
      new ORPCError('ESTACION_NO_AUTORIZADA', { status: 401, message: 'no' }),
    )

    await montarApp('/fichaje')

    expect(await screen.findByText(/ya no está habilitada/)).toBeDefined()
    expect(olvidar).toHaveBeenCalled()
  })

  /** La guía 1-2 enseña mientras nadie la usa: nadie tiene que explicarle nada a nadie. */
  it('muestra los dos pasos, en orden, con el primero prendido', async () => {
    await montarApp('/fichaje')

    expect(await screen.findByText('Escaneá tu credencial')).toBeDefined()
    expect(screen.getByText('Escaneá la orden')).toBeDefined()
    expect(screen.getByText('La tarjeta con tu QR')).toBeDefined()
  })

  it('el reloj de entrada tiene un solo paso: ahí no hay orden que escanear', async () => {
    estacion.estacion.mockResolvedValue({
      id: 'e2',
      nombre: 'Reloj de la entrada',
      tipo: 'reloj',
      sucursal: 'Casa Central',
      concesionaria: 'Automotores Litoral SAS',
    })
    await montarApp('/fichaje')

    expect(await screen.findByText('Pasá tu credencial')).toBeDefined()
    expect(screen.queryByText('Escaneá la orden')).toBeNull()
  })
})

describe('el primer escaneo', () => {
  it('saluda por el nombre y prende el segundo paso', async () => {
    estacion.escanear.mockResolvedValue(SIN_ABIERTAS)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)

    // Dos veces: el saludo grande y el paso 1, que ahora dice de quién es.
    expect(await screen.findAllByText('Diego Sosa')).toHaveLength(2)
    expect(screen.getByText('No tenés ninguna orden abierta')).toBeDefined()
    expect(screen.getByText('Escaneá el QR de una orden para empezar')).toBeDefined()
  })

  /**
   * Lo que hace que la pantalla enseñe sola: el que ve «OT 000006 abierta hace 2 h» entiende sin
   * que nadie le explique que escanearla le frena el reloj.
   */
  it('si ya tiene una orden abierta, se la muestra y le dice qué hacer', async () => {
    estacion.escanear.mockResolvedValue(CON_ABIERTA)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)

    expect(await screen.findByText('OT 000006')).toBeDefined()
    expect(screen.getByText('abierta hace 2 h 14 min')).toBeDefined()
    expect(screen.getByText('Escaneá su QR para frenar tu reloj')).toBeDefined()
  })

  it('muestra la cuenta regresiva: si el que escaneó se fue, la pantalla se limpia sola', async () => {
    estacion.escanear.mockResolvedValue(SIN_ABIERTAS)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)

    expect(await screen.findByText(/Se cancela solo en \d+ s/)).toBeDefined()
  })
})

describe('el antirrebote', () => {
  /**
   * La peor falla posible, y la razón de que este archivo tenga un antirrebote.
   *
   * El lector suele disparar el mismo código dos veces cuando alguien apoya la credencial. Sin
   * esto, la orden se abre y se cierra en el mismo movimiento: el mecánico se va convencido de
   * que fichó y queda con cero minutos. No se nota hasta fin de mes.
   */
  it('el mismo código dos veces seguidas se manda una sola vez', async () => {
    estacion.escanear.mockResolvedValue(SIN_ABIERTAS)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)
    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)
    await esperar(150)

    expect(estacion.escanear).toHaveBeenCalledTimes(1)
  })

  /**
   * Y el disparo automático no puede duplicar: un lector que manda el código **y** el Enter
   * dispararía dos veces si el antirrebote no cubriera los dos caminos.
   */
  it('el código completo más el Enter del lector tampoco duplican', async () => {
    estacion.escanear.mockResolvedValue(SIN_ABIERTAS)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard(CREDENCIAL)
    await esperar(120)
    await userEvent.keyboard('{Enter}')
    await esperar(120)

    expect(estacion.escanear).toHaveBeenCalledTimes(1)
  })
})

describe('los dos escaneos', () => {
  it('la orden viaja con la credencial que quedó pendiente', async () => {
    estacion.escanear.mockResolvedValueOnce(SIN_ABIERTAS).mockResolvedValueOnce(EMPEZO)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)
    await screen.findAllByText('Diego Sosa')
    await userEvent.keyboard(`${ORDEN}{Enter}`)

    await waitFor(() =>
      expect(estacion.escanear).toHaveBeenLastCalledWith({
        codigo: ORDEN,
        pendiente: CREDENCIAL,
      }),
    )
    expect(await screen.findByText('Empezaste')).toBeDefined()
    expect(screen.getByText('OT 000006 · AB123CD')).toBeDefined()
  })

  it('y le dice qué hacer cuando termine', async () => {
    estacion.escanear.mockResolvedValueOnce(SIN_ABIERTAS).mockResolvedValueOnce(EMPEZO)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')
    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)
    await screen.findAllByText('Diego Sosa')
    await userEvent.keyboard(`${ORDEN}{Enter}`)

    expect(
      await screen.findByText('Cuando termines, escaneá de nuevo tu credencial y la orden'),
    ).toBeDefined()
  })

  it('avisa si hay otro en el mismo auto: si no, los dos relojes corren', async () => {
    estacion.escanear
      .mockResolvedValueOnce(SIN_ABIERTAS)
      .mockResolvedValueOnce({ ...EMPEZO, otros: ['Ramón Quiroga'] })
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')
    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)
    await screen.findAllByText('Diego Sosa')
    await userEvent.keyboard(`${ORDEN}{Enter}`)

    expect(await screen.findByText(/Ramón Quiroga.*también está/)).toBeDefined()
  })
})

describe('salir del paso intermedio', () => {
  /** Pasar la misma credencial otra vez cancela, y no va al servidor: no hay nada que registrar. */
  it('la misma credencial de nuevo vuelve al principio, sin pedirle nada al servidor', async () => {
    estacion.escanear.mockResolvedValue(SIN_ABIERTAS)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')
    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)
    await screen.findAllByText('Diego Sosa')

    // Pasado el antirrebote, el segundo escaneo de la misma tarjeta es deliberado.
    await esperar(1300)
    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)

    await waitFor(() => expect(screen.queryAllByText('Diego Sosa')).toHaveLength(0))
    expect(estacion.escanear).toHaveBeenCalledTimes(1)
  })

  it('Escape también', async () => {
    estacion.escanear.mockResolvedValue(SIN_ABIERTAS)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')
    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)
    await screen.findAllByText('Diego Sosa')

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryAllByText('Diego Sosa')).toHaveLength(0))
  })
})

describe('el fallback numérico y los rechazos', () => {
  /**
   * Lo tipeado espera el Enter: alguien escribiendo un legajo dígito por dígito no quiere que se
   * dispare a mitad de camino, con la mitad del número.
   */
  it('un legajo tipeado no se manda hasta el Enter', async () => {
    estacion.escanear.mockResolvedValue(SIN_ABIERTAS)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard('0001')
    await esperar(120)
    expect(estacion.escanear).not.toHaveBeenCalled()

    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(estacion.escanear).toHaveBeenCalledWith({ codigo: '0001' }))
  })

  /** Un código con una letra que el alfabeto no tiene no es uno nuestro: no dispara solo. */
  it('algo con forma de QR pero con una L no dispara sin Enter', async () => {
    estacion.escanear.mockResolvedValue(SIN_ABIERTAS)
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard('GT1:O:B8L3Q1RY:5G9C3D2E0F')
    await esperar(150)

    expect(estacion.escanear).not.toHaveBeenCalled()
  })

  it('lo que el servidor rechaza se muestra igual de grande, con la cruz', async () => {
    estacion.escanear.mockResolvedValue({
      resultado: 'rechazado',
      accion: null,
      titulo: 'No encontré ese legajo',
      detalle: 'Pasá tu credencial, o fijate el número.',
      esperandoOrden: false,
      empleado: null,
      orden: null,
      duracion: null,
      abiertas: [],
      otros: [],
    })
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard('7791234567890{Enter}')

    expect(await screen.findByText('No encontré ese legajo')).toBeDefined()
    expect(screen.getByText('✕')).toBeDefined()
  })

  it('si el servidor no contesta, la pantalla lo dice en vez de quedarse muda', async () => {
    estacion.escanear.mockRejectedValue(new Error('sin red'))
    await montarApp('/fichaje')
    await screen.findByText('Escaneá tu credencial')

    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)

    expect(await screen.findByText('No se pudo avisar al servidor')).toBeDefined()
  })
})
