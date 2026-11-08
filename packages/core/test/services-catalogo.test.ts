import { describe, expect, it } from 'vitest'
import {
  armarServices,
  columnaDeEncabezado,
  erroresDeFilas,
  type FilaImportacion,
  numeroDeHoja,
  type ProblemasDeFila,
  tipoDeHoja,
} from '../src/services-catalogo.ts'

const fila = (parcial: Partial<FilaImportacion> = {}): FilaImportacion => ({
  marca: 'Renault',
  modelo: 'Kangoo',
  service: 'Service 10.000 km',
  kilometros: '10000',
  tipo: 'Trabajo',
  descripcion: 'Cambio de aceite',
  codigo: '',
  cantidad: '1',
  minutos: '30',
  precio: '',
  ...parcial,
})

describe('los números de una planilla', () => {
  it.each([
    ['1.234,50', '1234.50'],
    ['1,5', '1.5'],
    ['1,234.50', '1234.50'],
    ['1500', '1500'],
    ['1.500', '1500'],
    ['$ 15.000', '15000'],
    ['2.5', '2.5'],
  ])('%s es %s', (texto, numero) => {
    expect(numeroDeHoja(texto)).toBe(numero)
  })

  it('lo que no es un número no se adivina', () => {
    expect(numeroDeHoja('dos')).toBeNull()
    expect(numeroDeHoja('1,2,3')).toBeNull()
  })
})

describe('los encabezados y los tipos', () => {
  it('reconoce el encabezado como lo haya escrito cada uno', () => {
    expect(columnaDeEncabezado('  KILÓMETROS ')).toBe('kilometros')
    expect(columnaDeEncabezado('Código de repuesto')).toBe('codigo')
    expect(columnaDeEncabezado('Observaciones')).toBeNull()
  })

  it('entiende cómo se escribe el tipo en un taller', () => {
    expect(tipoDeHoja('Mano de obra')).toBe('trabajo')
    expect(tipoDeHoja('PIEZA')).toBe('repuesto')
    expect(tipoDeHoja('otra cosa')).toBeNull()
  })
})

describe('los errores de cada fila', () => {
  const errores = (f: Partial<FilaImportacion>) => erroresDeFilas([fila(f)])[0] as ProblemasDeFila

  it('una fila completa no tiene nada que decir', () => {
    expect(errores({})).toEqual({})
  })

  it('marca la columna exacta, y dice cómo arreglarlo', () => {
    expect(errores({ service: '' }).service).toMatch(/Falta el nombre/)
    expect(errores({ tipo: 'xx' }).tipo).toMatch(/Trabajo.*Repuesto/)
    expect(errores({ cantidad: '0' }).cantidad).toMatch(/mayor a cero/)
    expect(errores({ minutos: '1,5' }).minutos).toMatch(/enteros/)
    expect(errores({ precio: 'gratis' }).precio).toMatch(/número/)
  })

  it('un repuesto puede venir sólo con el código, un trabajo no', () => {
    expect(errores({ tipo: 'Repuesto', descripcion: '', codigo: 'ABC', minutos: '' })).toEqual({})
    expect(errores({ descripcion: '', codigo: 'ABC' }).descripcion).toBeDefined()
  })

  it('los minutos van en los trabajos', () => {
    expect(errores({ tipo: 'Repuesto' }).minutos).toMatch(/trabajos/)
  })

  it('dos filas del mismo service no pueden decir kilómetros distintos', () => {
    const [primera, segunda] = erroresDeFilas([fila(), fila({ kilometros: '20000' })])
    expect(primera).toEqual({})
    expect(segunda?.kilometros).toMatch(/10000/)
  })
})

describe('armar los services', () => {
  it('junta las filas por marca, modelo y service, sin mirar mayúsculas', () => {
    const filas = [
      fila(),
      fila({ service: 'SERVICE 10.000 KM', descripcion: 'Filtro', tipo: 'Repuesto', minutos: '' }),
      fila({ modelo: 'Clio' }),
    ]
    const services = armarServices(filas, erroresDeFilas(filas))

    expect(services).toHaveLength(2)
    expect(services[0]).toMatchObject({ marca: 'Renault', kilometros: 10000 })
    expect(services[0]?.renglones).toHaveLength(2)
  })

  it('deja afuera las filas con error, y sin marca es un service genérico', () => {
    const filas = [fila({ marca: '', modelo: '' }), fila({ service: 'Otro', tipo: 'x' })]
    const services = armarServices(filas, erroresDeFilas(filas))

    expect(services).toHaveLength(1)
    expect(services[0]).toMatchObject({ marca: null, modelo: null })
  })

  it('la cantidad vacía es uno', () => {
    const filas = [fila({ cantidad: '' })]
    expect(armarServices(filas, erroresDeFilas(filas))[0]?.renglones[0]?.cantidad).toBe('1')
  })
})
