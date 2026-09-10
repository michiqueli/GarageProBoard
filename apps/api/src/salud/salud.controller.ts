import { contrato } from '@garagetick/contracts'
import { type Db, sql } from '@garagetick/db'
import { Controller, Inject } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { DB } from '../comun/base.module.ts'

@Controller()
export class ControladorSalud {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Implement(contrato.salud)
  salud() {
    return implement(contrato.salud).handler(async () => {
      // Toca la base a propósito: un servicio que responde 200 sin poder consultar
      // no está sano, sólo está encendido.
      await this.db.execute(sql`select 1`)
      return { estado: 'ok' as const, version: '0.0.0' }
    })
  }
}
