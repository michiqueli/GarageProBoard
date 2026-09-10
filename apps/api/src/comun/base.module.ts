import { crearDb, crearPool, type Db, type Pool } from '@garagetick/db'
import { Global, Module, type OnApplicationShutdown } from '@nestjs/common'

export const POOL = Symbol('POOL')
export const DB = Symbol('DB')

/**
 * La API se conecta con `DATABASE_URL_APP`, que es el rol sin BYPASSRLS y que no es
 * dueño de ninguna tabla. Usar acá la URL del dueño anularía el aislamiento entero
 * sin que ningún test lo note, porque las consultas seguirían andando.
 */
@Global()
@Module({
  providers: [
    {
      provide: POOL,
      useFactory: (): Pool => {
        const url = process.env.DATABASE_URL_APP
        if (!url) throw new Error('Falta DATABASE_URL_APP')
        return crearPool(url, { max: 20 })
      },
    },
    {
      provide: DB,
      inject: [POOL],
      useFactory: (pool: Pool): Db => crearDb(pool),
    },
  ],
  exports: [POOL, DB],
})
export class ModuloBase implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    // El pool se cierra explícitamente para que un redeploy no deje conexiones
    // colgadas contra Postgres.
  }
}
