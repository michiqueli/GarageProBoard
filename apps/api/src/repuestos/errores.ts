/**
 * Los errores de repuestos, pedidos, compras y proveedores. El controlador los traduce al
 * error del contrato con el mismo código; uno que el contrato no declara sale como 500.
 */
export class ErrorRepuestos extends Error {
  constructor(
    readonly codigo: string,
    readonly datos?: Record<string, unknown>,
  ) {
    super(codigo)
  }
}

export function traducir(error: unknown, errores: object): never {
  if (error instanceof ErrorRepuestos) {
    const fabricar = (errores as Record<string, unknown>)[error.codigo] as
      | ((opciones?: { data?: unknown }) => Error)
      | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}
