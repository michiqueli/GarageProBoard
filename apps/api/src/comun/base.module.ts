import { crearFacturacionArca, type Entorno, type ServicioFiscal } from '@gpb/afip'
import { crearDb, crearPool, type Db, type Pool } from '@gpb/db'
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import { DatosDelTenant } from './datos.ts'
import { CajaFuerte } from './secretos.ts'
import { DB, FISCAL, POOL } from './simbolos.ts'

export { DB, FISCAL, POOL }

/**
 * La facturación de AFIP, una instancia por entorno y creada recién cuando se usa. Cada
 * instancia guarda los tickets de acceso de todos los CUIT que pasan por ella.
 */
function crearFiscal(): (entorno: Entorno) => ServicioFiscal {
  const instancias = new Map<Entorno, ServicioFiscal>()
  return (entorno) => {
    let fiscal = instancias.get(entorno)
    if (!fiscal) {
      fiscal = crearFacturacionArca({
        produccion: entorno === 'produccion',
        carpetaTickets: process.env.AFIP_TICKETS,
      })
      instancias.set(entorno, fiscal)
    }
    return fiscal
  }
}

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
    DatosDelTenant,
    { provide: CajaFuerte, useFactory: () => new CajaFuerte(process.env.SECRETOS_MASTER_KEY) },
    { provide: FISCAL, useFactory: crearFiscal },
  ],
  exports: [POOL, DB, DatosDelTenant, CajaFuerte, FISCAL],
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
