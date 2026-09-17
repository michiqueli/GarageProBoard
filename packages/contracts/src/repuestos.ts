import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { CODIGOS_ALICUOTA } from './comprobantes.ts'
import { chasis, importe, paginado } from './comunes.ts'

const TAG = 'Repuestos'
const TAG_PEDIDOS = 'Pedidos de repuestos'
const TAG_COMPRAS = 'Compras de repuestos'

/** Un texto opcional: vacío es «no tiene», no una cadena vacía guardada. */
const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullish()

/**
 * El código de fábrica, como lo devuelve la base de la marca, normalizado: «7701 208 174» y
 * «7701-208-174» son la misma pieza.
 */
export const codigoRepuesto = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^[A-Z0-9./]{2,40}$/, 'El código son letras y números, de 2 a 40, sin símbolos raros'),
  )

const alicuota = z.union(CODIGOS_ALICUOTA.map((c) => z.literal(c)))
const cantidadPositiva = importe.refine(
  (v) => Number(v) > 0,
  'La cantidad tiene que ser mayor a cero',
)
const precio = importe.refine((v) => Number(v) >= 0, 'El precio no puede ser negativo')
const conId = z.object({ id: z.uuid() })
const persona = z.object({ id: z.uuid(), razonSocial: z.string() })

// ── catálogo y stock ──────────────────────────────────────────────────────────

export const TIPOS_MOVIMIENTO_STOCK = [
  'inicial',
  'ajuste',
  'compra',
  'orden',
  'mostrador',
  'transferencia',
] as const

export const repuestoResumen = z.object({
  id: z.uuid(),
  codigo: z.string(),
  descripcion: z.string(),
  marca: z.string().nullable(),
  rubro: z.string().nullable(),
  /** Final, con IVA. */
  precioVenta: z.string(),
  codigoAlicuota: z.number().int(),
  activo: z.boolean(),
  /** En la sucursal activa. Puede ser negativo: el depósito estaba mal contado. */
  stock: z.string(),
  minimo: z.string().nullable(),
  ubicacion: z.string().nullable(),
  /** Hay mínimo y el stock está en él o por debajo. */
  reponer: z.boolean(),
})

export const movimientoStock = z.object({
  id: z.uuid(),
  fecha: z.iso.datetime(),
  tipo: z.enum(TIPOS_MOVIMIENTO_STOCK),
  cantidad: z.string(),
  saldo: z.string(),
  /** «OT 000123», «Pedido 000045 · mostrador», «Compra 000012 · Distribuidora Norte»… */
  detalle: z.string(),
  motivo: z.string().nullable(),
  usuario: z.string(),
  referencia: z.object({ tipo: z.enum(['orden', 'pedido', 'compra']), id: z.uuid() }).nullable(),
})

export const repuestoDetalle = repuestoResumen.extend({
  aplicacion: z.string().nullable(),
  /** El de la última compra, sin IVA. */
  costo: z.string().nullable(),
  proveedor: persona.nullable(),
  observaciones: z.string().nullable(),
  /** Todas las sucursales de la concesionaria, con lo que hay en cada una. */
  stocks: z.array(
    z.object({
      sucursalId: z.uuid(),
      sucursal: z.string(),
      cantidad: z.string(),
      minimo: z.string().nullable(),
      ubicacion: z.string().nullable(),
    }),
  ),
  /** Los últimos de la sucursal activa, los más nuevos primero. */
  movimientos: z.array(movimientoStock),
})

const datosRepuesto = z.object({
  codigo: codigoRepuesto,
  descripcion: z.string().trim().min(2, 'Falta la descripción').max(200),
  marca: opcional,
  rubro: opcional,
  aplicacion: opcional,
  precioVenta: precio,
  costo: precio.nullish(),
  codigoAlicuota: alicuota.default(5),
  proveedorId: z.uuid().nullish(),
  observaciones: opcional,
})

const NO_ENCONTRADO = {
  NO_ENCONTRADO: { status: 404, message: 'Ese repuesto no existe en la concesionaria' },
} as const
const CODIGO_DUPLICADO = {
  CODIGO_DUPLICADO: {
    status: 409,
    message: 'Ya hay un repuesto con ese código',
    data: z.object({ id: z.uuid(), descripcion: z.string() }),
  },
} as const
const PROVEEDOR_INVALIDO = {
  PROVEEDOR_INVALIDO: { status: 422, message: 'Ese proveedor no existe o está desactivado' },
} as const

export const contratoRepuestos = {
  listar: conPermiso('repuestos', 'ver', 'Repuesto')
    .route({
      method: 'GET',
      path: '/repuestos',
      tags: [TAG],
      operationId: 'listarRepuestos',
      summary: 'El catálogo, con el stock de la sucursal activa',
      description:
        'El buscador acepta el código con o sin espacios ni guiones, la descripción, la marca o ' +
        'la aplicación.',
    })
    .input(
      paginado.extend({
        buscar: z.string().trim().max(80).optional(),
        estado: z.enum(['activos', 'todos']).default('activos'),
        stock: z.enum(['todos', 'con_stock', 'reponer']).default('todos'),
      }),
    )
    .output(z.object({ datos: z.array(repuestoResumen), total: z.number().int() })),

  ficha: conPermiso('repuestos', 'ver', 'Repuesto')
    .route({
      method: 'GET',
      path: '/repuestos/{id}',
      tags: [TAG],
      operationId: 'fichaRepuesto',
      summary: 'Un repuesto, con el stock de cada sucursal y sus movimientos',
    })
    .input(conId)
    .errors(NO_ENCONTRADO)
    .output(repuestoDetalle),

  crear: conPermiso('repuestos', 'crear', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos',
      tags: [TAG],
      operationId: 'crearRepuesto',
      summary: 'Alta de un repuesto en el catálogo',
      successStatus: 201,
      description:
        'Con el stock inicial de la sucursal activa, si se sabe: queda como primer movimiento.',
    })
    .input(
      datosRepuesto.extend({
        stockInicial: importe
          .refine((v) => Number(v) >= 0, 'El stock inicial no puede ser negativo')
          .nullish(),
        ubicacion: opcional,
        minimo: importe.refine((v) => Number(v) >= 0, 'El mínimo no puede ser negativo').nullish(),
      }),
    )
    .errors({ ...CODIGO_DUPLICADO, ...PROVEEDOR_INVALIDO })
    .output(repuestoDetalle),

  editar: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'PUT',
      path: '/repuestos/{id}',
      tags: [TAG],
      operationId: 'editarRepuesto',
      summary: 'Modificar un repuesto, o desactivarlo',
      description: 'No se borra: tiene movimientos. Desactivado no se ofrece al cargar pedidos.',
    })
    .input(datosRepuesto.extend({ id: z.uuid(), activo: z.boolean() }))
    .errors({ ...NO_ENCONTRADO, ...CODIGO_DUPLICADO, ...PROVEEDOR_INVALIDO })
    .output(repuestoDetalle),

  ubicar: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'PUT',
      path: '/repuestos/{id}/stock',
      tags: [TAG],
      operationId: 'ubicarRepuesto',
      summary: 'Dónde está y cuál es el mínimo, en la sucursal activa',
    })
    .input(
      conId.extend({
        ubicacion: opcional,
        minimo: importe.refine((v) => Number(v) >= 0, 'El mínimo no puede ser negativo').nullish(),
      }),
    )
    .errors(NO_ENCONTRADO)
    .output(repuestoDetalle),

  ajustar: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/{id}/ajuste',
      tags: [TAG],
      operationId: 'ajustarStock',
      summary: 'Corregir el stock de la sucursal activa con lo que se contó',
      description:
        'Se manda lo que hay de verdad; la diferencia queda como movimiento, con el motivo. ' +
        'Es la forma de tapar un faltante, así que el motivo es obligatorio.',
    })
    .input(
      conId.extend({
        contado: importe.refine((v) => Number(v) >= 0, 'Lo contado no puede ser negativo'),
        motivo: z.string().trim().min(3, 'Anotá por qué se corrige: «recuento», «rotura»…'),
      }),
    )
    .errors({
      ...NO_ENCONTRADO,
      SIN_DIFERENCIA: { status: 422, message: 'Lo contado es lo mismo que dice el sistema' },
    })
    .output(repuestoDetalle),

  transferir: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/{id}/transferencia',
      tags: [TAG],
      operationId: 'transferirStock',
      summary: 'Mandar piezas de la sucursal activa a otra',
    })
    .input(conId.extend({ sucursalId: z.uuid(), cantidad: cantidadPositiva, motivo: opcional }))
    .errors({
      ...NO_ENCONTRADO,
      SUCURSAL_INVALIDA: {
        status: 422,
        message: 'Esa sucursal no existe, está desactivada o es la misma de la que sale',
      },
    })
    .output(repuestoDetalle),
}

// ── pedidos de repuestos ──────────────────────────────────────────────────────

export const ESTADOS_PEDIDO_REPUESTOS = [
  'abierto',
  'en_caja',
  'facturado',
  'entregado',
  'anulado',
] as const

export const itemPedido = z.object({
  id: z.uuid(),
  repuestoId: z.uuid().nullable(),
  codigo: z.string().nullable(),
  descripcion: z.string(),
  cantidad: z.string(),
  precioUnitario: z.string(),
  codigoAlicuota: z.number().int(),
  total: z.string(),
  /** Lo que hay en la sucursal, si es del catálogo. */
  stock: z.string().nullable(),
})

export const pedidoResumen = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  estado: z.enum(ESTADOS_PEDIDO_REPUESTOS),
  chasis: z.string(),
  vehiculo: z
    .object({
      id: z.uuid(),
      dominio: z.string().nullable(),
      marca: z.string().nullable(),
      modelo: z.string().nullable(),
    })
    .nullable(),
  orden: z.object({ id: z.uuid(), numero: z.number().int() }).nullable(),
  cliente: persona.nullable(),
  solicitante: z.string().nullable(),
  creadoPor: z.string(),
  creadoEn: z.iso.datetime(),
  /** Con IVA. */
  total: z.string(),
  items: z.number().int(),
})

export const pedidoDetalle = pedidoResumen.omit({ items: true }).extend({
  nota: z.string().nullable(),
  enCajaEn: z.iso.datetime().nullable(),
  entregadoEn: z.iso.datetime().nullable(),
  items: z.array(itemPedido),
  factura: z
    .object({
      id: z.uuid(),
      nombre: z.string(),
      puntoVenta: z.number().int(),
      numero: z.number().int(),
    })
    .nullable(),
})

export const itemPedidoEntrada = z.object({
  repuestoId: z.uuid().nullish(),
  codigo: opcional,
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500),
  cantidad: cantidadPositiva,
  precioUnitario: precio,
  codigoAlicuota: alicuota.default(5),
})

const NO_ENCONTRADO_PEDIDO = {
  NO_ENCONTRADO: { status: 404, message: 'Ese pedido no existe' },
} as const
const ESTADO_INVALIDO = {
  ESTADO_INVALIDO: {
    status: 409,
    message: 'El pedido no está en un estado que permita eso',
    data: z.object({ motivo: z.string() }),
  },
} as const
const SIN_ITEMS = {
  SIN_ITEMS: { status: 422, message: 'El pedido no tiene repuestos' },
} as const

export const contratoPedidosRepuestos = {
  listar: conPermiso('repuestos', 'ver', 'Repuesto')
    .route({
      method: 'GET',
      path: '/repuestos/pedidos',
      tags: [TAG_PEDIDOS],
      operationId: 'listarPedidosRepuestos',
      summary: 'Pedidos de repuestos de la sucursal activa, los más nuevos primero',
      description: 'Por omisión, los pendientes: abiertos y en caja.',
    })
    .input(
      paginado.extend({
        buscar: z.string().trim().max(60).optional(),
        estado: z.enum([...ESTADOS_PEDIDO_REPUESTOS, 'pendientes', 'todos']).default('pendientes'),
        ordenId: z.uuid().optional(),
      }),
    )
    .output(z.object({ datos: z.array(pedidoResumen), total: z.number().int() })),

  ficha: conPermiso('repuestos', 'ver', 'Repuesto')
    .route({
      method: 'GET',
      path: '/repuestos/pedidos/{id}',
      tags: [TAG_PEDIDOS],
      operationId: 'fichaPedidoRepuestos',
      summary: 'Un pedido, con sus repuestos',
    })
    .input(conId)
    .errors(NO_ENCONTRADO_PEDIDO)
    .output(pedidoDetalle),

  abrir: conPermiso('repuestos', 'crear', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/pedidos',
      tags: [TAG_PEDIDOS],
      operationId: 'abrirPedidoRepuestos',
      summary: 'Abrir un pedido de repuestos',
      successStatus: 201,
      description:
        'Siempre con chasis: es con lo que se busca en la base de la marca. Si va a una orden ' +
        'de trabajo, el chasis sale del auto de la orden. Orden o cliente, uno solo o ninguno.',
    })
    .input(
      z
        .object({
          chasis: z
            .string()
            .trim()
            .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
            .pipe(chasis)
            .nullish(),
          ordenId: z.uuid().nullish(),
          clienteId: z.uuid().nullish(),
          solicitante: opcional,
          nota: opcional,
          items: z.array(itemPedidoEntrada).default([]),
        })
        .refine((d) => d.chasis || d.ordenId, {
          message: 'Falta el chasis: con eso se buscan las piezas',
          path: ['chasis'],
        })
        .refine((d) => !(d.ordenId && d.clienteId), {
          message: 'El pedido va a una orden o a un cliente, no a los dos',
          path: ['clienteId'],
        }),
    )
    .errors({
      NO_ENCONTRADO: { status: 404, message: 'Esa orden, cliente o repuesto no existe' },
      ORDEN_CERRADA: {
        status: 409,
        message: 'Esa orden ya no está en el taller: no se le pueden pedir repuestos',
      },
    })
    .output(pedidoDetalle),

  editar: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'PUT',
      path: '/repuestos/pedidos/{id}',
      tags: [TAG_PEDIDOS],
      operationId: 'editarPedidoRepuestos',
      summary: 'Modificar un pedido abierto: quién lo pide, a qué cliente va y sus repuestos',
      description: 'Reemplaza la lista de repuestos entera. A qué orden va no se cambia.',
    })
    .input(
      conId.extend({
        clienteId: z.uuid().nullish(),
        solicitante: opcional,
        nota: opcional,
        items: z.array(itemPedidoEntrada),
      }),
    )
    .errors({
      ...NO_ENCONTRADO_PEDIDO,
      ...ESTADO_INVALIDO,
      REFERENCIA_INVALIDA: { status: 422, message: 'Ese cliente o repuesto no existe' },
    })
    .output(pedidoDetalle),

  entregar: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/pedidos/{id}/entregar',
      tags: [TAG_PEDIDOS],
      operationId: 'entregarPedidoRepuestos',
      summary: 'Entregar al taller: los repuestos pasan a la orden y salen del stock',
    })
    .input(conId)
    .errors({
      ...NO_ENCONTRADO_PEDIDO,
      ...ESTADO_INVALIDO,
      ...SIN_ITEMS,
      ORDEN_CERRADA: {
        status: 409,
        message: 'La orden ya no está en el taller: reabrila para sumarle repuestos',
      },
    })
    .output(pedidoDetalle),

  aCaja: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/pedidos/{id}/caja',
      tags: [TAG_PEDIDOS],
      operationId: 'pedidoRepuestosACaja',
      summary: 'Mandar a caja un pedido de mostrador: los repuestos salen del stock',
    })
    .input(conId)
    .errors({ ...NO_ENCONTRADO_PEDIDO, ...ESTADO_INVALIDO, ...SIN_ITEMS })
    .output(pedidoDetalle),

  reabrir: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/pedidos/{id}/reabrir',
      tags: [TAG_PEDIDOS],
      operationId: 'reabrirPedidoRepuestos',
      summary: 'Sacar de caja un pedido que no se facturó: los repuestos vuelven al stock',
    })
    .input(conId)
    .errors({ ...NO_ENCONTRADO_PEDIDO, ...ESTADO_INVALIDO })
    .output(pedidoDetalle),

  anular: conPermiso('repuestos', 'anular', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/pedidos/{id}/anular',
      tags: [TAG_PEDIDOS],
      operationId: 'anularPedidoRepuestos',
      summary: 'Anular un pedido que no se entregó ni se facturó',
      description: 'Si estaba en caja, los repuestos vuelven al stock.',
    })
    .input(conId)
    .errors({ ...NO_ENCONTRADO_PEDIDO, ...ESTADO_INVALIDO })
    .output(pedidoDetalle),
}

// ── compras ───────────────────────────────────────────────────────────────────

export const ESTADOS_COMPRA = ['pedida', 'recibida', 'anulada'] as const

export const renglonCompra = z.object({
  id: z.uuid(),
  repuesto: z.object({ id: z.uuid(), codigo: z.string(), descripcion: z.string() }),
  cantidad: z.string(),
  costoUnitario: z.string(),
  cantidadRecibida: z.string().nullable(),
  /** Sin IVA. */
  total: z.string(),
})

export const compraResumen = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  estado: z.enum(ESTADOS_COMPRA),
  proveedor: persona,
  comprobanteProveedor: z.string().nullable(),
  creadoPor: z.string(),
  creadoEn: z.iso.datetime(),
  recibidaEn: z.iso.datetime().nullable(),
  /** Sin IVA: lo recibido si ya llegó, lo pedido si no. */
  total: z.string(),
  renglones: z.number().int(),
})

export const compraDetalle = compraResumen.omit({ renglones: true }).extend({
  fechaComprobante: z.iso.date().nullable(),
  nota: z.string().nullable(),
  recibidaPor: z.string().nullable(),
  renglones: z.array(renglonCompra),
})

const renglonCompraEntrada = z.object({
  repuestoId: z.uuid(),
  cantidad: cantidadPositiva,
  costoUnitario: precio,
})

const datosRecepcionCompra = z.object({
  comprobanteProveedor: z.string().trim().min(3, 'Anotá el número de la factura o el remito'),
  fechaComprobante: z.iso.date().nullish(),
})

const NO_ENCONTRADA_COMPRA = {
  NO_ENCONTRADA: { status: 404, message: 'Esa compra no existe' },
} as const
const ESTADO_INVALIDO_COMPRA = {
  ESTADO_INVALIDO: {
    status: 409,
    message: 'La compra no está en un estado que permita eso',
    data: z.object({ motivo: z.string() }),
  },
} as const
const REFERENCIA_INVALIDA_COMPRA = {
  REFERENCIA_INVALIDA: {
    status: 422,
    message: 'Ese proveedor o alguno de los repuestos no existe',
  },
} as const

export const contratoCompras = {
  listar: conPermiso('repuestos', 'ver', 'Repuesto')
    .route({
      method: 'GET',
      path: '/repuestos/compras',
      tags: [TAG_COMPRAS],
      operationId: 'listarCompras',
      summary: 'Compras de la sucursal activa, las más nuevas primero',
    })
    .input(
      paginado.extend({
        buscar: z.string().trim().max(60).optional(),
        estado: z.enum([...ESTADOS_COMPRA, 'todas']).default('pedida'),
      }),
    )
    .output(z.object({ datos: z.array(compraResumen), total: z.number().int() })),

  ficha: conPermiso('repuestos', 'ver', 'Repuesto')
    .route({
      method: 'GET',
      path: '/repuestos/compras/{id}',
      tags: [TAG_COMPRAS],
      operationId: 'fichaCompra',
      summary: 'Una compra, con sus renglones',
    })
    .input(conId)
    .errors(NO_ENCONTRADA_COMPRA)
    .output(compraDetalle),

  crear: conPermiso('repuestos', 'crear', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/compras',
      tags: [TAG_COMPRAS],
      operationId: 'crearCompra',
      summary: 'Pedirle repuestos a un proveedor, o cargar lo que ya llegó',
      successStatus: 201,
      description:
        'Con `recepcion`, la mercadería ya está en el depósito: se recibe entera en el mismo ' +
        'paso y entra al stock.',
    })
    .input(
      z.object({
        proveedorId: z.uuid(),
        nota: opcional,
        renglones: z.array(renglonCompraEntrada).min(1, 'Una compra sin repuestos no se carga'),
        recepcion: datosRecepcionCompra.nullish(),
      }),
    )
    .errors(REFERENCIA_INVALIDA_COMPRA)
    .output(compraDetalle),

  editar: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'PUT',
      path: '/repuestos/compras/{id}',
      tags: [TAG_COMPRAS],
      operationId: 'editarCompra',
      summary: 'Modificar una compra que todavía no llegó',
    })
    .input(
      conId.extend({
        nota: opcional,
        renglones: z.array(renglonCompraEntrada).min(1, 'Una compra sin repuestos no se carga'),
      }),
    )
    .errors({ ...NO_ENCONTRADA_COMPRA, ...ESTADO_INVALIDO_COMPRA, ...REFERENCIA_INVALIDA_COMPRA })
    .output(compraDetalle),

  recibir: conPermiso('repuestos', 'editar', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/compras/{id}/recibir',
      tags: [TAG_COMPRAS],
      operationId: 'recibirCompra',
      summary: 'Recibir la mercadería: entra al stock con su costo',
      description:
        'Cada renglón con lo que llegó de verdad y a qué costo. Lo que no llegó va en cero y no ' +
        'entra. El costo recibido pasa a ser el costo del repuesto.',
    })
    .input(
      conId.merge(datosRecepcionCompra).extend({
        renglones: z.array(
          z.object({
            id: z.uuid(),
            cantidadRecibida: importe.refine((v) => Number(v) >= 0, 'No puede ser negativo'),
            costoUnitario: precio,
          }),
        ),
      }),
    )
    .errors({
      ...NO_ENCONTRADA_COMPRA,
      ...ESTADO_INVALIDO_COMPRA,
      NADA_RECIBIDO: { status: 422, message: 'No llegó nada: si no va a llegar, anulala' },
    })
    .output(compraDetalle),

  anular: conPermiso('repuestos', 'anular', 'Repuesto')
    .route({
      method: 'POST',
      path: '/repuestos/compras/{id}/anular',
      tags: [TAG_COMPRAS],
      operationId: 'anularCompra',
      summary: 'Anular una compra que todavía no llegó',
    })
    .input(conId)
    .errors({ ...NO_ENCONTRADA_COMPRA, ...ESTADO_INVALIDO_COMPRA })
    .output(compraDetalle),
}
