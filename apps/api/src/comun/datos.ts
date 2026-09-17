import { conTenant, type Db } from '@gpb/db'
import { Inject, Injectable } from '@nestjs/common'
import { contextoDelPedido, type Sesion } from './contexto.ts'
import { DB } from './simbolos.ts'

/**
 * El acceso a los datos de la concesionaria que está pidiendo.
 *
 * Es la puerta que usan los controladores de negocio, y **no recibe el tenant**: lo
 * toma de la sesión del pedido. Antes cada operación hacía
 * `conTenant(this.db, sesion.tenantId, …)`, y cualquiera de esas llamadas podía pasar
 * otro valor — uno que vino en el cuerpo, el de una variable mal copiada. RLS evitaba
 * la fuga, pero la operación igual quedaba escrita contra la concesionaria equivocada
 * de intención. Ahora no hay parámetro que equivocar.
 *
 * Una transacción **por operación** y no por pedido: cuando llegue la facturación, un
 * pedido va a esperar a AFIP durante segundos, y una transacción abierta durante esa
 * espera retiene una conexión del pool. Con veinte conexiones y AFIP lenta, el sistema
 * entero se queda sin base por una demora ajena.
 */
@Injectable()
export class DatosDelTenant {
  constructor(@Inject(DB) private readonly db: Db) {}

  transaccion<T>(fn: (tx: Db, sesion: Sesion) => Promise<T>): Promise<T> {
    const { sesion } = contextoDelPedido()
    // Quién y desde dónde van a la sesión de Postgres, no a cada consulta: es lo que lee
    // el trigger de auditoría para firmar el cambio. Por el mismo motivo que el tenant,
    // acá no hay parámetro que equivocar ni llamada que olvidar.
    return conTenant(this.db, sesion.tenantId, (tx) => fn(tx, sesion), {
      usuarioId: sesion.usuarioId,
      ip: sesion.ip,
    })
  }
}
