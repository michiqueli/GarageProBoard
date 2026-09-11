import { crearDb, crearPool, type Db, type Pool } from '@garagepro/db'
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'

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
  // Inyección explícita en todo el proyecto: ver la nota en auth.service.ts. Nest
  // podría deducirla del tipo, pero eso ata el código a que cada transpilador emita
  // la metadata igual, y no lo hacen.
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    // Cerrar de verdad: un redeploy que deja conexiones colgadas va agotando el
    // límite de Postgres hasta que un despliegue cualquiera no puede conectarse.
    await this.pool.end()
  }
}
