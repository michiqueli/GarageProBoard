import 'reflect-metadata'
import { eq } from '@gpb/db'
import { cliente, entidadComercial, vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Repuestos: el catálogo, el stock que sigue a cada pieza, los pedidos (al taller y de
 * mostrador), las compras y los proveedores. La factura de un pedido de mostrador se prueba
 * en comprobantes.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let repuestero: string
let mecanico: string
let vehiculoId: string
let clienteId: string
let activa: string
let otra: string

const CHASIS = '8AJFB8CD5N1234567'

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'repuestos',
    email: 'gerente@repuestos.test',
    sucursales: ['Casa Central', 'Rafaela'],
    otros: [
      { email: 'repuestero@repuestos.test', rol: 'Repuestero' },
      { email: 'mecanico@repuestos.test', rol: 'Mecánico' },
    ],
    vehiculos: [{ chasis: CHASIS, dominio: 'AE123BC' }],
  })
  const db = api.pg.dbDuenio
  const tenantId = semilla.tenant.id
  const [auto] = await db.select().from(vehiculo).where(eq(vehiculo.tenantId, tenantId))
  vehiculoId = auto?.id as string
  const [e] = await db
    .insert(entidadComercial)
    .values({
      tenantId,
      tipoDocumento: 96,
      numeroDocumento: '28456123',
      tipoPersona: 'fisica',
      razonSocial: 'López, María Fernanda',
      condicionIva: 5,
    })
    .returning()
  clienteId = e?.id as string
  await db.insert(cliente).values({ id: clienteId, tenantId })

  gerente = await entrar('gerente@repuestos.test')
  repuestero = await entrar('repuestero@repuestos.test')
  mecanico = await entrar('mecanico@repuestos.test')
  const yo = (await pedir(gerente, 'GET', '/auth/yo')).json()
  activa = yo.sucursalActiva.id
  otra = semilla.sucursales.find((s) => s.id !== activa)?.id as string
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

async function entrar(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json().access as string
}

function pedir(access: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${access}` },
    ...(payload ? { payload } : {}),
  })
}

async function stockDe(id: string) {
  const r = await pedir(gerente, 'GET', `/repuestos/${id}`)
  expect(r.statusCode).toBe(200)
  return r.json().stock as string
}

let filtro: { id: string }
let pastillas: { id: string }
let proveedorId: string

describe('proveedores', () => {
  it('el repuestero da de alta un proveedor; el mecánico ni los ve', async () => {
    const r = await pedir(repuestero, 'POST', '/proveedores', {
      tipoDocumento: 80,
      numeroDocumento: '30500010912',
      razonSocial: 'Distribuidora Norte SA',
      condicionIva: 1,
      domicilio: null,
      provinciaCodigo: null,
      localidad: null,
      codigoPostal: null,
      email: '',
      telefono: '342 400-1000',
      numeroIibb: null,
      condicionIibb: 'local',
      condicionPago: 'Cuenta corriente 30 días',
    })
    expect(r.statusCode, r.body).toBe(201)
    proveedorId = r.json().id
    expect(r.json()).toMatchObject({ esCliente: false, condicionPago: 'Cuenta corriente 30 días' })

    expect((await pedir(mecanico, 'GET', '/proveedores')).statusCode).toBe(403)
  })

  it('un cliente que también vende se suma como proveedor sin duplicar la identidad', async () => {
    const r = await pedir(gerente, 'POST', '/proveedores', {
      tipoDocumento: 96,
      numeroDocumento: '28456123',
      razonSocial: 'López, María Fernanda',
      condicionIva: 5,
      domicilio: null,
      provinciaCodigo: null,
      localidad: null,
      codigoPostal: null,
      email: null,
      telefono: null,
      numeroIibb: null,
      condicionIibb: 'no_inscripto',
      condicionPago: null,
    })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json()).toMatchObject({ id: clienteId, esCliente: true })

    const otra = await pedir(gerente, 'POST', '/proveedores', {
      ...r.json(),
      id: undefined,
      esCliente: undefined,
      activo: undefined,
      tipoPersona: undefined,
    })
    expect(otra.statusCode).toBe(409)
    expect(otra.json().code).toBe('PROVEEDOR_DUPLICADO')
  })
})

describe('el catálogo', () => {
  it('alta con el código normalizado y stock inicial, que queda como primer movimiento', async () => {
    const r = await pedir(repuestero, 'POST', '/repuestos', {
      codigo: '7701 208-174',
      descripcion: 'Filtro de aceite',
      marca: 'Renault',
      rubro: 'Filtros',
      aplicacion: 'Kangoo, Clio, Logan 1.6',
      precioVenta: '18500',
      costo: '9000',
      proveedorId,
      stockInicial: '10',
      ubicacion: 'Estante 4',
      minimo: '3',
    })
    expect(r.statusCode, r.body).toBe(201)
    filtro = r.json()
    expect(r.json()).toMatchObject({
      codigo: '7701208174',
      precioVenta: '18500.00',
      stock: '10',
      minimo: '3',
      ubicacion: 'Estante 4',
      reponer: false,
      proveedor: { id: proveedorId },
      movimientos: [{ tipo: 'inicial', cantidad: '10', saldo: '10', detalle: 'Stock inicial' }],
    })
    // Rafaela también aparece, en cero.
    expect(r.json().stocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ sucursalId: otra, cantidad: '0' })]),
    )

    const p = await pedir(repuestero, 'POST', '/repuestos', {
      codigo: 'PAST-001',
      descripcion: 'Pastillas de freno delanteras',
      precioVenta: '45000',
    })
    expect(p.statusCode, p.body).toBe(201)
    pastillas = p.json()
  })

  it('el mismo código dos veces no: dice cuál es el que ya existe', async () => {
    const r = await pedir(repuestero, 'POST', '/repuestos', {
      codigo: '7701208174',
      descripcion: 'Otro filtro',
      precioVenta: '1',
    })
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({
      code: 'CODIGO_DUPLICADO',
      data: { id: filtro.id, descripcion: 'Filtro de aceite' },
    })
  })

  it('busca por código pegado con espacios, y el exacto sale primero', async () => {
    const r = await pedir(gerente, 'GET', '/repuestos?buscar=7701%20208%20174')
    expect(r.json().datos[0]).toMatchObject({ id: filtro.id })
    const f = await pedir(gerente, 'GET', '/repuestos?buscar=kangoo')
    expect(f.json().total).toBe(1)
  })

  it('el ajuste pide motivo, deja la diferencia y avisa cuando hay que reponer', async () => {
    const sinMotivo = await pedir(repuestero, 'POST', `/repuestos/${filtro.id}/ajuste`, {
      contado: '2',
      motivo: '',
    })
    expect(sinMotivo.statusCode).toBe(400)

    const r = await pedir(repuestero, 'POST', `/repuestos/${filtro.id}/ajuste`, {
      contado: '8',
      motivo: 'Recuento: dos rotos',
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().movimientos[0]).toMatchObject({
      tipo: 'ajuste',
      cantidad: '-2',
      saldo: '8',
      motivo: 'Recuento: dos rotos',
    })

    const igual = await pedir(repuestero, 'POST', `/repuestos/${filtro.id}/ajuste`, {
      contado: '8',
      motivo: 'otra vez',
    })
    expect(igual.json().code).toBe('SIN_DIFERENCIA')
  })

  it('transferir saca de una sucursal y pone en la otra', async () => {
    const r = await pedir(repuestero, 'POST', `/repuestos/${filtro.id}/transferencia`, {
      sucursalId: otra,
      cantidad: '3',
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().stock).toBe('5')
    expect(
      r.json().stocks.find((s: { sucursalId: string }) => s.sucursalId === otra).cantidad,
    ).toBe('3')
    expect(r.json().movimientos[0].detalle).toBe('Enviado a Rafaela')

    const misma = await pedir(repuestero, 'POST', `/repuestos/${filtro.id}/transferencia`, {
      sucursalId: activa,
      cantidad: '1',
    })
    expect(misma.json().code).toBe('SUCURSAL_INVALIDA')
  })
})

describe('la orden de trabajo mueve el stock', () => {
  let ordenId: string

  it('cargar la pieza la saca, cambiar la cantidad mueve la diferencia, sacarla la devuelve', async () => {
    const abierta = await pedir(gerente, 'POST', '/ordenes', {
      vehiculoId,
      pedido: 'Service',
      items: [
        {
          tipo: 'repuesto',
          repuestoId: filtro.id,
          codigo: '7701208174',
          descripcion: 'Filtro de aceite',
          cantidad: '1',
          precioUnitario: '18500',
        },
      ],
    })
    expect(abierta.statusCode, abierta.body).toBe(201)
    ordenId = abierta.json().id
    expect(abierta.json().items[0].repuestoId).toBe(filtro.id)
    expect(await stockDe(filtro.id)).toBe('4')

    const item = {
      tipo: 'repuesto',
      repuestoId: filtro.id,
      descripcion: 'Filtro de aceite',
      precioUnitario: '18500',
    }
    await pedir(gerente, 'PUT', `/ordenes/${ordenId}/items`, {
      items: [{ ...item, cantidad: '3' }],
    })
    expect(await stockDe(filtro.id)).toBe('2')

    await pedir(gerente, 'PUT', `/ordenes/${ordenId}/items`, {
      items: [{ tipo: 'trabajo', descripcion: 'Mano de obra', cantidad: '1', precioUnitario: '1' }],
    })
    expect(await stockDe(filtro.id)).toBe('5')

    const ficha = (await pedir(gerente, 'GET', `/repuestos/${filtro.id}`)).json()
    expect(ficha.movimientos.slice(0, 3).map((m: { cantidad: string }) => m.cantidad)).toEqual([
      '3',
      '-2',
      '-1',
    ])
    expect(ficha.movimientos[0].detalle).toBe('OT 000001')
  })

  it('un repuesto que no es del catálogo no entra a la orden', async () => {
    const r = await pedir(gerente, 'PUT', `/ordenes/${ordenId}/items`, {
      items: [
        {
          tipo: 'repuesto',
          repuestoId: '00000000-0000-4000-8000-000000000000',
          descripcion: 'x',
          cantidad: '1',
          precioUnitario: '1',
        },
      ],
    })
    expect(r.json().code).toBe('REPUESTO_INVALIDO')
  })

  it('el pedido para la orden toma el chasis del auto; al entregarlo pasa a la orden y sale del stock', async () => {
    const r = await pedir(repuestero, 'POST', '/repuestos/pedidos', {
      ordenId,
      solicitante: 'Diego, box 3',
      items: [
        {
          repuestoId: pastillas.id,
          codigo: 'PAST001',
          descripcion: 'Pastillas de freno delanteras',
          cantidad: '1',
          precioUnitario: '45000',
        },
      ],
    })
    expect(r.statusCode, r.body).toBe(201)
    const pedido = r.json()
    expect(pedido).toMatchObject({
      numero: 1,
      estado: 'abierto',
      chasis: CHASIS,
      vehiculo: { id: vehiculoId, dominio: 'AE123BC' },
      orden: { id: ordenId, numero: 1 },
      total: '45000.00',
    })
    // Todavía no salió del depósito.
    expect(await stockDe(pastillas.id)).toBe('0')

    const aCaja = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedido.id}/caja`)
    expect(aCaja.json().code).toBe('ESTADO_INVALIDO')

    const entregado = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedido.id}/entregar`)
    expect(entregado.statusCode, entregado.body).toBe(200)
    expect(entregado.json().estado).toBe('entregado')
    // Sin stock cargado queda negativo: el taller no se frena.
    expect(await stockDe(pastillas.id)).toBe('-1')

    const orden = (await pedir(gerente, 'GET', `/ordenes/${ordenId}`)).json()
    expect(orden.items.at(-1)).toMatchObject({ repuestoId: pastillas.id, tipo: 'repuesto' })

    // Un segundo pedido, todavía abierto cuando se anula la orden.
    const abierto = (
      await pedir(repuestero, 'POST', '/repuestos/pedidos', { ordenId, items: [] })
    ).json()

    // Anular la orden devuelve todo lo que tenía cargado.
    const anulada = await pedir(gerente, 'POST', `/ordenes/${ordenId}/anular`)
    expect(anulada.statusCode, anulada.body).toBe(200)
    expect(await stockDe(pastillas.id)).toBe('0')

    // El pedido que no se había entregado ya no hace falta: se anula con la orden.
    const despues = (await pedir(gerente, 'GET', `/repuestos/pedidos/${abierto.id}`)).json()
    expect(despues.estado).toBe('anulado')
  })

  it('a una orden cerrada no se le piden repuestos', async () => {
    const r = await pedir(repuestero, 'POST', '/repuestos/pedidos', { ordenId, items: [] })
    expect(r.json().code).toBe('ORDEN_CERRADA')
  })
})

describe('el mostrador', () => {
  it('sin chasis no hay pedido; con orden y cliente a la vez, tampoco', async () => {
    const sin = await pedir(repuestero, 'POST', '/repuestos/pedidos', { items: [] })
    expect(sin.statusCode).toBe(400)
    const dos = await pedir(repuestero, 'POST', '/repuestos/pedidos', {
      chasis: CHASIS,
      ordenId: '00000000-0000-4000-8000-000000000000',
      clienteId,
    })
    expect(dos.statusCode).toBe(400)
  })

  it('a caja saca del stock, reabrir lo devuelve, anular desde caja también', async () => {
    const ok = await pedir(repuestero, 'POST', '/repuestos/pedidos', {
      // Pegado como venga: con espacios y en minúsculas.
      chasis: '93y bb 0000 12345',
      clienteId,
      items: [
        {
          repuestoId: filtro.id,
          descripcion: 'Filtro de aceite',
          cantidad: '2',
          precioUnitario: '18500',
        },
        { descripcion: 'Lámpara H4', cantidad: '1', precioUnitario: '6000' },
      ],
    })
    expect(ok.statusCode, ok.body).toBe(201)
    const pedido = ok.json()
    expect(pedido).toMatchObject({
      chasis: '93YBB000012345',
      vehiculo: null,
      cliente: { id: clienteId },
      total: '43000.00',
    })

    const antes = await stockDe(filtro.id)
    const enCaja = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedido.id}/caja`)
    expect(enCaja.statusCode, enCaja.body).toBe(200)
    expect(enCaja.json().estado).toBe('en_caja')
    expect(await stockDe(filtro.id)).toBe(String(Number(antes) - 2))

    const editar = await pedir(repuestero, 'PUT', `/repuestos/pedidos/${pedido.id}`, { items: [] })
    expect(editar.json().code).toBe('ESTADO_INVALIDO')

    await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedido.id}/reabrir`)
    expect(await stockDe(filtro.id)).toBe(antes)

    await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedido.id}/caja`)
    const anulado = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedido.id}/anular`)
    expect(anulado.json().estado).toBe('anulado')
    expect(await stockDe(filtro.id)).toBe(antes)

    const pendientes = (await pedir(gerente, 'GET', '/repuestos/pedidos')).json()
    expect(pendientes.datos.find((p: { id: string }) => p.id === pedido.id)).toBeUndefined()
  })

  it('el mecánico ve repuestos pero no abre pedidos', async () => {
    expect((await pedir(mecanico, 'GET', '/repuestos')).statusCode).toBe(200)
    const r = await pedir(mecanico, 'POST', '/repuestos/pedidos', { chasis: CHASIS })
    expect(r.statusCode).toBe(403)
  })
})

describe('las compras', () => {
  it('pedida no mueve stock; recibida entra lo que llegó, con su costo', async () => {
    const r = await pedir(repuestero, 'POST', '/repuestos/compras', {
      proveedorId,
      renglones: [
        { repuestoId: pastillas.id, cantidad: '4', costoUnitario: '20000' },
        { repuestoId: filtro.id, cantidad: '10', costoUnitario: '9000' },
      ],
    })
    expect(r.statusCode, r.body).toBe(201)
    const compra = r.json()
    expect(compra).toMatchObject({ numero: 1, estado: 'pedida', total: '170000.00' })
    const filtroAntes = await stockDe(filtro.id)
    expect(await stockDe(pastillas.id)).toBe('0')

    const nada = await pedir(repuestero, 'POST', `/repuestos/compras/${compra.id}/recibir`, {
      comprobanteProveedor: 'FA A 0003-00012345',
      renglones: compra.renglones.map((x: { id: string }) => ({
        id: x.id,
        cantidadRecibida: '0',
        costoUnitario: '1',
      })),
    })
    expect(nada.json().code).toBe('NADA_RECIBIDO')

    // Las pastillas llegaron todas y más caras; los filtros no vinieron.
    const [renglonPastillas] = compra.renglones
    const recibida = await pedir(repuestero, 'POST', `/repuestos/compras/${compra.id}/recibir`, {
      comprobanteProveedor: 'FA A 0003-00012345',
      fechaComprobante: '2026-09-16',
      renglones: [{ id: renglonPastillas.id, cantidadRecibida: '4', costoUnitario: '21500' }],
    })
    expect(recibida.statusCode, recibida.body).toBe(200)
    expect(recibida.json()).toMatchObject({
      estado: 'recibida',
      comprobanteProveedor: 'FA A 0003-00012345',
      total: '86000.00',
    })
    expect(await stockDe(pastillas.id)).toBe('4')
    expect(await stockDe(filtro.id)).toBe(filtroAntes)

    const ficha = (await pedir(gerente, 'GET', `/repuestos/${pastillas.id}`)).json()
    expect(ficha).toMatchObject({ costo: '21500.00', proveedor: { id: proveedorId } })
    expect(ficha.movimientos[0].detalle).toBe('Compra 000001 · Distribuidora Norte SA')

    const anular = await pedir(repuestero, 'POST', `/repuestos/compras/${compra.id}/anular`)
    expect(anular.json().code).toBe('ESTADO_INVALIDO')
  })

  it('cargar lo que ya llegó lo recibe en el mismo paso', async () => {
    const r = await pedir(repuestero, 'POST', '/repuestos/compras', {
      proveedorId,
      renglones: [{ repuestoId: pastillas.id, cantidad: '2', costoUnitario: '21500' }],
      recepcion: { comprobanteProveedor: 'Remito 0001-00000456' },
    })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().estado).toBe('recibida')
    expect(await stockDe(pastillas.id)).toBe('6')
  })

  it('la auditoría cuenta lo que pasó en palabras', async () => {
    const r = await pedir(gerente, 'GET', '/auditoria/cambios?pagina=1&porPagina=100')
    expect(r.statusCode).toBe(200)
    expect(r.body).toContain('Ajustó el stock a 8 (-2): «Recuento: dos rotos»')
  })
})
