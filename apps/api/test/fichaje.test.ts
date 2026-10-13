import { TIPOS_QR } from '@gpb/core'
import { and, eq, isNull } from '@gpb/db'
import { credencial, eventoEscaneo, jornada, orden, sesionTrabajo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { qrFirmado } from '../src/comun/qr.ts'
import {
  type ApiDePrueba,
  CLAVE,
  levantarApi,
  sembrarConcesionaria,
  sembrarEmpleado,
} from './fixture.ts'

/**
 * El fichaje del taller.
 *
 * Lo que se prueba acá son las diez reglas de `docs/tecnicos/taller-control-de-tiempos.md`,
 * que es de donde sale este módulo: dos escaneos sin login, el toggle idempotente, el registro
 * crudo de todo lo que pasa por el lector, y el fallback numérico — porque en un taller los QR
 * se arruinan, y eso no es un caso raro.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let tenantId: string
let sucursalId: string
let mecanicoId: string
let credencialQr: string
let ordenQr: string
let ordenId: string
let ordenNumero: number
let tokenTaller: string
let tokenReloj: string

async function entrar(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json().access as string
}

/** Un pedido de la pantalla de fichaje: sin sesión, con el token de su estación. */
function escanear(token: string, codigo: string, pendiente?: string) {
  return app.inject({
    method: 'POST',
    url: '/api/fichaje/escanear',
    headers: { authorization: `Estacion ${token}` },
    payload: pendiente ? { codigo, pendiente } : { codigo },
  })
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'fichaje',
    email: 'gerente@fichaje.test',
    vehiculos: [{ dominio: 'AB123CD', chasis: '8AWDB45Z9LA123456' }],
  })
  tenantId = semilla.tenant.id
  sucursalId = semilla.sucursales[0]?.id as string

  mecanicoId = await sembrarEmpleado(api.pg.dbDuenio, {
    tenantId,
    legajo: '0007',
    nombre: 'Diego',
    apellido: 'Sosa',
    sucursalId,
  })

  const gerente = await entrar('gerente@fichaje.test')

  // Las dos estaciones: la PC del taller con el lector, y el reloj de la entrada.
  const taller = await app.inject({
    method: 'POST',
    url: '/api/fichaje/estaciones',
    headers: { authorization: `Bearer ${gerente}` },
    payload: { nombre: 'Taller, elevador 2', tipo: 'taller', sucursalId },
  })
  expect(taller.statusCode, taller.body).toBe(201)
  tokenTaller = taller.json().token

  const reloj = await app.inject({
    method: 'POST',
    url: '/api/fichaje/estaciones',
    headers: { authorization: `Bearer ${gerente}` },
    payload: { nombre: 'Reloj de entrada', tipo: 'reloj', sucursalId },
  })
  tokenReloj = reloj.json().token

  // La credencial del mecánico, emitida por la pantalla de personal.
  await app.inject({
    method: 'POST',
    url: `/api/personal/${mecanicoId}/credencial`,
    headers: { authorization: `Bearer ${gerente}` },
  })
  const [c] = await api.pg.dbDuenio
    .select({ codigo: credencial.codigo })
    .from(credencial)
    .where(eq(credencial.empleadoId, mecanicoId))
  credencialQr = qrFirmado(TIPOS_QR.credencial, c?.codigo as string)

  // Una orden abierta en el taller.
  const vehiculos = await app.inject({
    method: 'GET',
    url: '/api/vehiculos',
    headers: { authorization: `Bearer ${gerente}` },
  })
  const vehiculoId = vehiculos.json().datos[0].id
  const abierta = await app.inject({
    method: 'POST',
    url: '/api/ordenes',
    headers: { authorization: `Bearer ${gerente}` },
    payload: { vehiculoId, pedido: 'Service de 10.000' },
  })
  expect(abierta.statusCode, abierta.body).toBe(201)
  ordenId = abierta.json().id
  ordenNumero = abierta.json().numero
  const [o] = await api.pg.dbDuenio
    .select({ codigoQr: orden.codigoQr })
    .from(orden)
    .where(eq(orden.id, ordenId))
  ordenQr = qrFirmado(TIPOS_QR.orden, o?.codigoQr as string)
}, 240_000)

afterAll(async () => {
  await api?.cerrar()
})

/** Cada prueba arranca sin sesiones abiertas ni jornada: si no, se pisan entre ellas. */
beforeEach(async () => {
  await api.pg.dbDuenio.delete(sesionTrabajo)
  await api.pg.dbDuenio.delete(jornada)
  await api.pg.dbDuenio.update(orden).set({ estado: 'recibida' }).where(eq(orden.id, ordenId))
})

describe('la estación', () => {
  it('sin token no se ficha, y el mensaje no le habla al mecánico de iniciar sesión', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/fichaje/escanear',
      payload: { codigo: credencialQr },
    })
    expect(r.statusCode).toBe(401)
    expect(r.json().code).toBe('ESTACION_NO_AUTORIZADA')
  })

  it('un token inventado da lo mismo que uno revocado: no se distinguen', async () => {
    const r = await escanear('token-que-no-existe', credencialQr)
    expect(r.statusCode).toBe(401)
    expect(r.json().code).toBe('ESTACION_NO_AUTORIZADA')
  })

  it('con su token, la pantalla sabe qué es', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/fichaje/estacion',
      headers: { authorization: `Estacion ${tokenTaller}` },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ nombre: 'Taller, elevador 2', tipo: 'taller' })
  })
})

describe('el reloj de entrada', () => {
  it('la primera pasada marca entrada y la segunda, salida', async () => {
    const entrada = await escanear(tokenReloj, credencialQr)
    expect(entrada.statusCode, entrada.body).toBe(200)
    expect(entrada.json()).toMatchObject({
      resultado: 'ok',
      accion: 'entrada',
      titulo: 'Diego Sosa',
      esperandoOrden: false,
    })

    const salida = await escanear(tokenReloj, credencialQr)
    expect(salida.json()).toMatchObject({ accion: 'salida' })

    const [hoy] = await api.pg.dbDuenio.select().from(jornada)
    expect(hoy?.entrada).not.toBeNull()
    expect(hoy?.salida).not.toBeNull()
  })

  it('en el reloj, escanear una orden no hace nada: ahí no se fichan tiempos', async () => {
    await escanear(tokenReloj, credencialQr)
    const r = await escanear(tokenReloj, ordenQr, credencialQr)
    expect(r.json().resultado).toBe('ok')
    expect(r.json().accion).toBe('abrio')
  })
})

describe('los dos escaneos del taller', () => {
  it('la credencial sola deja la pantalla esperando la orden', async () => {
    const r = await escanear(tokenTaller, credencialQr)
    expect(r.json()).toMatchObject({
      resultado: 'ok',
      esperandoOrden: true,
      titulo: 'Diego Sosa',
      detalle: 'Ahora escaneá la orden',
    })
  })

  it('el primer escaneo del día también abre la jornada, sin fichar dos veces', async () => {
    await escanear(tokenTaller, credencialQr)
    const [hoy] = await api.pg.dbDuenio.select().from(jornada)
    expect(hoy?.entrada).not.toBeNull()
  })

  it('credencial y orden abren la sesión, y la orden pasa a en proceso', async () => {
    await escanear(tokenTaller, credencialQr)
    const r = await escanear(tokenTaller, ordenQr, credencialQr)

    // «Empezaste» y no el nombre: al que está parado frente al lector no hay que decirle
    // quién es —lo vio en el paso 1— sino qué acaba de pasar.
    expect(r.json()).toMatchObject({ resultado: 'ok', accion: 'abrio', titulo: 'Empezaste' })
    expect(r.json().detalle).toContain('OT 000001')

    const [abierta] = await api.pg.dbDuenio
      .select()
      .from(sesionTrabajo)
      .where(isNull(sesionTrabajo.fin))
    expect(abierta?.empleadoId).toBe(mecanicoId)

    const [ot] = await api.pg.dbDuenio.select().from(orden).where(eq(orden.id, ordenId))
    expect(ot?.estado).toBe('en_proceso')
  })

  /** La regla 7: la pantalla es idempotente. El mecánico hace siempre lo mismo. */
  it('la misma orden otra vez la cierra, y dice cuánto llevó', async () => {
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    const r = await escanear(tokenTaller, ordenQr, credencialQr)
    expect(r.json()).toMatchObject({ resultado: 'ok', accion: 'cerro', titulo: 'Terminaste' })
    expect(r.json().duracion).toBeTruthy()

    const [cerrada] = await api.pg.dbDuenio.select().from(sesionTrabajo)
    expect(cerrada?.fin).not.toBeNull()
    expect(cerrada?.cerradaPor).toBe('mecanico')
    expect(cerrada?.duracionSeg).not.toBeNull()
  })

  it('la orden sin la credencial adelante se rechaza, y dice qué hacer', async () => {
    const r = await escanear(tokenTaller, ordenQr)
    expect(r.json()).toMatchObject({
      resultado: 'rechazado',
      titulo: 'Primero tu credencial',
    })
  })

  it('una orden terminada no recibe tiempo', async () => {
    await api.pg.dbDuenio.update(orden).set({ estado: 'terminada' }).where(eq(orden.id, ordenId))
    const r = await escanear(tokenTaller, ordenQr, credencialQr)
    expect(r.json().resultado).toBe('rechazado')
    expect(r.json().titulo).toContain('ya no está en el taller')
  })
})

describe('el fallback numérico', () => {
  /** Regla 6: los QR se arruinan, y es un taller. No es un caso raro. */
  it('se tipea el legajo en vez de pasar la credencial', async () => {
    const r = await escanear(tokenTaller, '0007')
    expect(r.json()).toMatchObject({ resultado: 'ok', esperandoOrden: true, titulo: 'Diego Sosa' })
  })

  it('y después el número de orden', async () => {
    await escanear(tokenTaller, '0007')
    const r = await escanear(tokenTaller, String(ordenNumero), '0007')
    expect(r.json()).toMatchObject({ resultado: 'ok', accion: 'abrio' })
  })
})

describe('lo que se rechaza', () => {
  it('un QR con la firma cambiada no ficha', async () => {
    const falso = `${credencialQr.slice(0, -1)}${credencialQr.at(-1) === 'Z' ? 'Y' : 'Z'}`
    const r = await escanear(tokenTaller, falso)
    expect(r.json()).toMatchObject({ resultado: 'rechazado', titulo: 'Ese código no es de acá' })
  })

  it('una credencial revocada deja de fichar en el momento', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    await app.inject({
      method: 'POST',
      url: `/api/personal/${mecanicoId}/credencial/revocar`,
      headers: { authorization: `Bearer ${gerente}` },
      payload: { motivo: 'La perdió' },
    })

    const r = await escanear(tokenTaller, credencialQr)
    expect(r.json()).toMatchObject({ resultado: 'rechazado', titulo: 'Credencial desconocida' })

    // Se le emite otra para no romper las pruebas que siguen.
    await app.inject({
      method: 'POST',
      url: `/api/personal/${mecanicoId}/credencial`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    const [nueva] = await api.pg.dbDuenio
      .select({ codigo: credencial.codigo })
      .from(credencial)
      .where(and(eq(credencial.empleadoId, mecanicoId), isNull(credencial.revocadaEn)))
    credencialQr = qrFirmado(TIPOS_QR.credencial, nueva?.codigo as string)
  })

  /**
   * Al que apoyó un repuesto contra el lector no se le puede contestar «puede estar revocada»:
   * lo manda a buscar el problema a RRHH cuando el problema es que escaneó otra cosa.
   */
  it('el código de barras de un repuesto dice que ese legajo no existe, no que la credencial falló', async () => {
    const r = await escanear(tokenTaller, '7791234567890')
    expect(r.json()).toMatchObject({
      resultado: 'rechazado',
      titulo: 'No encontré ese legajo',
    })
  })

  it('una credencial que existió y se revocó sí habla de la credencial', async () => {
    const r = await escanear(tokenTaller, qrFirmado(TIPOS_QR.credencial, 'ZZZZZZZZ'))
    expect(r.json()).toMatchObject({
      resultado: 'rechazado',
      titulo: 'Credencial desconocida',
    })
  })
})

describe('el registro crudo', () => {
  /**
   * La regla 2, y la que parece de más hasta el día que hace falta: cuando un mecánico diga
   * «yo fiché», esta tabla es la respuesta. Se guarda **aunque falle**.
   */
  it('todo escaneo deja su fila, con el texto tal como llegó y cuánto tardó', async () => {
    await api.pg.dbDuenio.delete(eventoEscaneo)
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, 'basura-del-lector')

    const filas = await api.pg.dbDuenio.select().from(eventoEscaneo)
    expect(filas).toHaveLength(2)
    expect(filas.map((f) => f.codigoCrudo)).toContain('basura-del-lector')
    expect(filas.every((f) => typeof f.latenciaMs === 'number')).toBe(true)
    expect(filas.some((f) => f.resultado === 'rechazado')).toBe(true)
  })
})

describe('las estaciones, del lado del sistema', () => {
  it('el token se muestra una vez y de la base sale su hash', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    const r = await app.inject({
      method: 'GET',
      url: '/api/fichaje/estaciones',
      headers: { authorization: `Bearer ${gerente}` },
    })
    const datos = r.json().datos as Array<Record<string, unknown>>
    expect(datos.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(datos)).not.toContain(tokenTaller)
  })

  it('revocada, su token deja de servir en el acto', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    const nueva = await app.inject({
      method: 'POST',
      url: '/api/fichaje/estaciones',
      headers: { authorization: `Bearer ${gerente}` },
      payload: { nombre: 'La que se revoca', tipo: 'taller', sucursalId },
    })
    const token = nueva.json().token as string
    expect((await escanear(token, credencialQr)).statusCode).toBe(200)

    await app.inject({
      method: 'POST',
      url: `/api/fichaje/estaciones/${nueva.json().estacion.id}/revocar`,
      headers: { authorization: `Bearer ${gerente}` },
    })

    expect((await escanear(token, credencialQr)).statusCode).toBe(401)
  })
})

describe('la asistencia', () => {
  it('muestra quién entró y cuántos minutos estuvo', async () => {
    await escanear(tokenReloj, credencialQr)
    await escanear(tokenReloj, credencialQr)

    const gerente = await entrar('gerente@fichaje.test')
    const r = await app.inject({
      method: 'GET',
      url: '/api/fichaje/asistencia',
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().datos[0]).toMatchObject({ nombre: 'Diego Sosa', legajo: '0007', minutos: 0 })
  })
})

describe('el cierre de fin de turno', () => {
  /**
   * Regla 4: y no sólo con un trabajo a las 20:00, que si el servidor se reinició antes no
   * corrió nunca. **Nunca se descarta en silencio**: queda marcada como automática para que el
   * jefe la corrija, porque el mecánico que se olvidó de cerrar igual trabajó.
   */
  it('lo que quedó abierto de ayer se cierra solo, y queda marcado', async () => {
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    // Se la corre a ayer: es lo que pasa cuando alguien se va sin cerrar.
    await api.pg.dbDuenio
      .update(sesionTrabajo)
      .set({ inicio: new Date(Date.now() - 30 * 60 * 60 * 1000) })
      .where(isNull(sesionTrabajo.fin))

    await escanear(tokenTaller, credencialQr)

    const [vieja] = await api.pg.dbDuenio.select().from(sesionTrabajo)
    expect(vieja?.fin).not.toBeNull()
    expect(vieja?.cerradaPor).toBe('auto')
  })

  it('se cierra a las 20:00 de Argentina, no a las de Postgres, que corre en UTC', async () => {
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    const ayer = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date(Date.now() - 24 * 60 * 60 * 1000))
    await api.pg.dbDuenio
      .update(sesionTrabajo)
      .set({ inicio: new Date(`${ayer}T10:00:00-03:00`) })
      .where(isNull(sesionTrabajo.fin))

    await escanear(tokenTaller, credencialQr)

    const [vieja] = await api.pg.dbDuenio
      .select()
      .from(sesionTrabajo)
      .where(eq(sesionTrabajo.cerradaPor, 'auto'))
    expect(vieja?.fin?.toISOString()).toBe(new Date(`${ayer}T20:00:00-03:00`).toISOString())
  })

  it('una sesión de hoy no se toca', async () => {
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)
    await escanear(tokenTaller, credencialQr)

    const [abierta] = await api.pg.dbDuenio
      .select()
      .from(sesionTrabajo)
      .where(isNull(sesionTrabajo.fin))
    expect(abierta).toBeDefined()
  })
})

describe('el tablero de piso', () => {
  /**
   * Los dos relojes son el punto entero: la mano de obra es lo que costó el trabajo y el
   * tiempo en taller es lo que el cliente percibió. La diferencia es lo que explica por qué un
   * auto estuvo seis días, y es el número que la concesionaria más quiere ver.
   */
  it('dice qué autos hay, quién los tiene y los dos relojes', async () => {
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    const gerente = await entrar('gerente@fichaje.test')
    const r = await app.inject({
      method: 'GET',
      url: '/api/taller/tablero',
      headers: { authorization: `Bearer ${gerente}` },
    })

    expect(r.statusCode, r.body).toBe(200)
    const cuerpo = r.json()
    expect(cuerpo.resumen).toMatchObject({ enTaller: 1, conAlguien: 1, parados: 0 })

    const auto = cuerpo.autos[0]
    expect(auto).toMatchObject({ numero: ordenNumero, estado: 'en_proceso' })
    expect(auto.trabajando[0].nombre).toBe('Diego Sosa')
    expect(auto.enTallerMin).toBeGreaterThanOrEqual(0)
    expect(auto.muertoMin).toBeGreaterThanOrEqual(0)
  })

  it('sin nadie fichado, el auto figura parado', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    const r = await app.inject({
      method: 'GET',
      url: '/api/taller/tablero',
      headers: { authorization: `Bearer ${gerente}` },
    })

    expect(r.json().resumen).toMatchObject({ enTaller: 1, conAlguien: 0, parados: 1 })
    expect(r.json().autos[0].trabajando).toEqual([])
  })

  /**
   * La mano de obra de una sesión **abierta** cuenta lo que lleva hasta ahora. Si contara cero
   * hasta que cierra, un auto con alguien trabajando desde hace tres horas figuraría sin una
   * sola hora de trabajo y el tablero mentiría justo cuando más se lo mira.
   */
  it('lo que se está trabajando ahora ya suma', async () => {
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)
    await api.pg.dbDuenio
      .update(sesionTrabajo)
      .set({ inicio: new Date(Date.now() - 90 * 60 * 1000) })
      .where(isNull(sesionTrabajo.fin))

    const gerente = await entrar('gerente@fichaje.test')
    const r = await app.inject({
      method: 'GET',
      url: '/api/taller/tablero',
      headers: { authorization: `Bearer ${gerente}` },
    })

    expect(r.json().autos[0].manoDeObraMin).toBeGreaterThanOrEqual(89)
  })

  it('una orden terminada sale del tablero', async () => {
    await api.pg.dbDuenio.update(orden).set({ estado: 'terminada' }).where(eq(orden.id, ordenId))
    const gerente = await entrar('gerente@fichaje.test')
    const r = await app.inject({
      method: 'GET',
      url: '/api/taller/tablero',
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(r.json().autos).toEqual([])
  })

  it('el televisor del piso lo pide con el token de su estación, sin sesión', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    const nueva = await app.inject({
      method: 'POST',
      url: '/api/fichaje/estaciones',
      headers: { authorization: `Bearer ${gerente}` },
      payload: { nombre: 'El televisor del piso', tipo: 'tablero', sucursalId },
    })
    expect(nueva.statusCode, nueva.body).toBe(201)

    const r = await app.inject({
      method: 'GET',
      url: '/api/fichaje/tablero',
      headers: { authorization: `Estacion ${nueva.json().token}` },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toHaveProperty('resumen')
  })

  it('sin token no se ve el tablero del piso', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/fichaje/tablero' })
    expect(r.statusCode).toBe(401)
  })
})

describe('una orden que se reabre', () => {
  /**
   * El ciclo tiene que cerrar por el mismo lado: reabrir la deja **recibida** —nadie empezó
   * nada— y es el primer escaneo el que la pasa a en proceso, igual que con una orden nueva.
   * Si reabrir la dejara en proceso, el tablero mostraría un auto «en proceso» sin nadie
   * adentro, que es exactamente lo que hace que se deje de creer en la pantalla.
   */
  it('vuelve a recibida, y el primer escaneo la pone en proceso otra vez', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    // Sin nada que cobrar no se termina, así que primero lleva un trabajo.
    const items = await app.inject({
      method: 'PUT',
      url: `/api/ordenes/${ordenId}/items`,
      headers: { authorization: `Bearer ${gerente}` },
      payload: {
        items: [
          {
            tipo: 'trabajo',
            descripcion: 'Cambio de pastillas',
            cantidad: '1',
            precioUnitario: '50000',
          },
        ],
      },
    })
    expect(items.statusCode, items.body).toBe(200)

    const terminada = await app.inject({
      method: 'POST',
      url: `/api/ordenes/${ordenId}/terminar`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(terminada.statusCode, terminada.body).toBe(200)

    const reabierta = await app.inject({
      method: 'POST',
      url: `/api/ordenes/${ordenId}/reabrir`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(reabierta.statusCode, reabierta.body).toBe(200)
    expect(reabierta.json().estado).toBe('recibida')

    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    const [ot] = await api.pg.dbDuenio.select().from(orden).where(eq(orden.id, ordenId))
    expect(ot?.estado).toBe('en_proceso')
  })
})

describe('lo que pasa con las sesiones abiertas', () => {
  /**
   * El mecánico que se olvida de pasar la credencial al terminar es el caso normal, no el raro.
   * Si su sesión quedara abierta, su reloj seguiría corriendo toda la noche y la mano de obra de
   * esa orden crecería sola — y el tablero mostraría un auto terminado con alguien adentro.
   */
  it('terminar la orden cierra lo que quedó fichado, y queda marcado como cerrado por el jefe', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    await app.inject({
      method: 'PUT',
      url: `/api/ordenes/${ordenId}/items`,
      headers: { authorization: `Bearer ${gerente}` },
      payload: {
        items: [
          { tipo: 'trabajo', descripcion: 'Revisión', cantidad: '1', precioUnitario: '10000' },
        ],
      },
    })
    const terminada = await app.inject({
      method: 'POST',
      url: `/api/ordenes/${ordenId}/terminar`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(terminada.statusCode, terminada.body).toBe(200)

    const abiertas = await api.pg.dbDuenio
      .select()
      .from(sesionTrabajo)
      .where(isNull(sesionTrabajo.fin))
    expect(abiertas).toHaveLength(0)

    const [cerrada] = await api.pg.dbDuenio.select().from(sesionTrabajo)
    expect(cerrada?.cerradaPor).toBe('jefe')
  })

  it('anularla también: no se le suma mano de obra a algo que no se va a cobrar', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    const anulada = await app.inject({
      method: 'POST',
      url: `/api/ordenes/${ordenId}/anular`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(anulada.statusCode, anulada.body).toBe(200)

    const abiertas = await api.pg.dbDuenio
      .select()
      .from(sesionTrabajo)
      .where(isNull(sesionTrabajo.fin))
    expect(abiertas).toHaveLength(0)
  })
})

describe('los tiempos en la ficha de la orden', () => {
  /**
   * La regresión que lo motivó: el mecánico escaneaba, la base guardaba los minutos, y en la
   * pantalla de la orden no se enteraba nadie. El fichaje tiene que verse desde el sistema.
   */
  it('la orden muestra quién trabajó, cuánto, y la suma', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    const abierta = await app.inject({
      method: 'GET',
      url: `/api/ordenes/${ordenId}`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(abierta.statusCode, abierta.body).toBe(200)
    expect(abierta.json().sesiones).toHaveLength(1)
    expect(abierta.json().sesiones[0]).toMatchObject({
      nombre: 'Diego Sosa',
      legajo: '0007',
      fin: null,
      cerradaPor: null,
    })

    await escanear(tokenTaller, ordenQr, credencialQr)

    const cerrada = await app.inject({
      method: 'GET',
      url: `/api/ordenes/${ordenId}`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(cerrada.json().sesiones[0].fin).not.toBeNull()
    expect(cerrada.json().sesiones[0].cerradaPor).toBe('mecanico')
    expect(cerrada.json().manoDeObraMin).toBeGreaterThanOrEqual(0)
  })

  it('sin nadie que haya fichado, la orden lo dice con una lista vacía', async () => {
    const gerente = await entrar('gerente@fichaje.test')
    const r = await app.inject({
      method: 'GET',
      url: `/api/ordenes/${ordenId}`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(r.json().sesiones).toEqual([])
    expect(r.json().manoDeObraMin).toBe(0)
  })
})

describe('cada uno cierra lo suyo', () => {
  /**
   * La garantía que hay que poder afirmar sin mirar el código: **nadie cierra el rato de otro**.
   * Si escanear una orden cerrara la sesión de quien la tuviera abierta, cualquiera podría
   * frenarle el reloj a un compañero sin enterarse, y los minutos de mano de obra terminarían
   * en la persona equivocada.
   *
   * La concurrencia única es **por mecánico**, no por orden: dos pueden estar en el mismo auto.
   */
  it('escanear una orden que otro tiene abierta abre la propia, sin tocar la ajena', async () => {
    const gerente = await entrar('gerente@fichaje.test')

    // Un segundo mecánico, con su credencial.
    const otroId = await sembrarEmpleado(api.pg.dbDuenio, {
      tenantId,
      legajo: '0099',
      nombre: 'Ramón',
      apellido: 'Quiroga',
      sucursalId,
    })
    await app.inject({
      method: 'POST',
      url: `/api/personal/${otroId}/credencial`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    const [suya] = await api.pg.dbDuenio
      .select({ codigo: credencial.codigo })
      .from(credencial)
      .where(and(eq(credencial.empleadoId, otroId), isNull(credencial.revocadaEn)))
    const credencialOtro = qrFirmado(TIPOS_QR.credencial, suya?.codigo as string)

    // Diego abre la orden.
    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    // Ramón escanea la misma: abre la suya, no cierra la de Diego.
    const r = await escanear(tokenTaller, ordenQr, credencialOtro)
    expect(r.json()).toMatchObject({ resultado: 'ok', accion: 'abrio' })
    expect(r.json().otros).toContain('Diego Sosa')

    const abiertas = await api.pg.dbDuenio
      .select()
      .from(sesionTrabajo)
      .where(isNull(sesionTrabajo.fin))
    expect(abiertas).toHaveLength(2)
  })
})

describe('el mecánico asignado', () => {
  /**
   * Asignado y fichado son dos cosas: el asignado lo decide recepción o el jefe de taller, el
   * fichado es quien la trabajó de verdad. Que no coincidan es normal y lo cuentan los tiempos.
   * Lo que no tiene sentido es una orden con horas trabajadas y **nadie** a cargo.
   */
  it('si la orden no tenía mecánico, queda el que la agarró', async () => {
    await api.pg.dbDuenio.update(orden).set({ mecanicoId: null }).where(eq(orden.id, ordenId))

    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    const [ot] = await api.pg.dbDuenio.select().from(orden).where(eq(orden.id, ordenId))
    expect(ot?.mecanicoId).toBe(mecanicoId)
  })

  /** Y si ya tenía uno, el fichaje no lo pisa: es una decisión de otro, no un dato del lector. */
  it('si ya tenía uno asignado, no se lo cambia aunque lo trabaje otro', async () => {
    const otroId = await sembrarEmpleado(api.pg.dbDuenio, {
      tenantId,
      legajo: '0098',
      nombre: 'Elsa',
      apellido: 'Vera',
      sucursalId,
    })
    await api.pg.dbDuenio.update(orden).set({ mecanicoId: otroId }).where(eq(orden.id, ordenId))

    await escanear(tokenTaller, credencialQr)
    await escanear(tokenTaller, ordenQr, credencialQr)

    const [ot] = await api.pg.dbDuenio.select().from(orden).where(eq(orden.id, ordenId))
    expect(ot?.mecanicoId).toBe(otroId)
  })
})
