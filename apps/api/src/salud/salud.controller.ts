import { contrato } from '@gpb/contracts'
import { type Db, sql } from '@gpb/db'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { DB } from '../comun/simbolos.ts'

@Controller()
export class ControladorSalud {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Operacion(contrato.salud)
  salud() {
    return implement(contrato.salud).handler(async () => {
      // Toca la base a propósito: un servicio que responde 200 sin poder consultar
      // no está sano, sólo está encendido.
      await this.db.execute(sql`select 1`)
      return { estado: 'ok' as const, version: '0.0.0' }
    })
  }
}
