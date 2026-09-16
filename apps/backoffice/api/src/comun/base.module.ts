import { crearDb, crearPool, type Db, type Pool } from '@garagepro/db'
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import { DB, POOL } from './simbolos.ts'

/**
 * El back-office se conecta con `DATABASE_URL_BACKOFFICE`: el rol `garagepro_backoffice`,
 * que ve todas las concesionarias pero sólo en `tenant` y `tenant_modulo`, y que no puede
 * leer un vehículo ni un comprobante.
 *
 * Nunca con la del dueño del esquema. Andaría igual, y por eso mismo nadie lo notaría.
 */
@Global()
@Module({
  providers: [
    {
      provide: POOL,
      useFactory: (): Pool => {
        const url = process.env.DATABASE_URL_BACKOFFICE
        if (!url) throw new Error('Falta DATABASE_URL_BACKOFFICE')
        // Pocas conexiones: lo usan un par de personas, y cada una que sobra es una que
        // le falta a la API de los clientes en el mismo Postgres.
        return crearPool(url, { max: 5 })
      },
    },
    { provide: DB, inject: [POOL], useFactory: (pool: Pool): Db => crearDb(pool) },
  ],
  exports: [POOL, DB],
})
export class ModuloBase implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}
