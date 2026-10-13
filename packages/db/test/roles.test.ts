import { type ReglaPermiso, ROLES_PREDEFINIDOS } from '@gpb/core'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rolesPredefinidosPara, sincronizarRolesPredefinidos } from '../src/index.ts'
import { aviso, rol, usuario, usuarioRol } from '../src/schema/index.ts'
import { type EntornoPrueba, levantarEntorno, sembrar, TENANT_A, TENANT_B } from './entorno.ts'

/**
 * Lo que el sistema cambia en un rol predefinido llega a las concesionarias que ya lo
 * tenían, salvo que lo hayan editado: eso lo deciden ellas.
 */

let e: EntornoPrueba
let resultado: Awaited<ReturnType<typeof sincronizarRolesPredefinidos>>

function predefinido(clave: string) {
  const r = ROLES_PREDEFINIDOS.find((p) => p.clave === clave)
  if (!r) throw new Error(`No existe el predefinido ${clave}`)
  return r
}

/** Una versión anterior del sistema: sin la recepción. */
const sinRecepcion = (reglas: ReglaPermiso[]) =>
  reglas.flatMap((r): ReglaPermiso[] => {
    const sujetos = (Array.isArray(r.subject) ? r.subject : [r.subject]).filter(
      (s) => s !== 'Visita' && s !== 'Turno',
    )
    return sujetos.length ? [{ ...r, subject: sujetos }] : []
  })

const asesorViejo = sinRecepcion(predefinido('asesor').habilidades)
const cajeroViejo = sinRecepcion(predefinido('cajero').habilidades)
const cajeroEditado: ReglaPermiso[] = [...cajeroViejo, { action: 'ver', subject: 'Proveedor' }]

async function rolDe(tenantId: string, clave: string) {
  const [fila] = await e.dbDuenio
    .select()
    .from(rol)
    .where(and(eq(rol.tenantId, tenantId), eq(rol.predefinido, clave)))
  return fila
}

beforeAll(async () => {
  e = await levantarEntorno()
  await sembrar(e.poolDuenio)
  const db = e.dbDuenio

  // Automotores Litoral se dio de alta con la versión anterior, sin Recepcionista ni
  // Vendedor. El asesor quedó como vino; al cajero le dieron «ver proveedores».
  const viejos = rolesPredefinidosPara(TENANT_A)
    .filter((r) => r.predefinido !== 'recepcionista' && r.predefinido !== 'vendedor')
    .map((r) => {
      if (r.predefinido === 'asesor') {
        return { ...r, habilidades: asesorViejo, versionSistema: asesorViejo }
      }
      if (r.predefinido === 'cajero') {
        return { ...r, habilidades: cajeroEditado, versionSistema: cajeroViejo }
      }
      return r
    })
  const roles = await db.insert(rol).values(viejos).returning()
  const asesor = roles.find((r) => r.predefinido === 'asesor')
  if (!asesor) throw new Error('sin asesor')

  const [u] = await db
    .insert(usuario)
    .values({
      tenantId: TENANT_A,
      email: 'asesor@litoral.test',
      hashPassword: 'x',
      nombre: 'Ana',
      apellido: 'Asesora',
    })
    .returning()
  if (!u) throw new Error('sin usuario')
  await db.insert(usuarioRol).values({ tenantId: TENANT_A, usuarioId: u.id, rolId: asesor.id })

  // Concesionaria del Norte no tiene ninguno, y ya se armó un «Vendedor» propio.
  await db.insert(rol).values({
    tenantId: TENANT_B,
    nombre: 'Vendedor',
    habilidades: [{ action: 'ver', subject: 'Vehiculo' }],
  })

  resultado = await sincronizarRolesPredefinidos(db)
})

afterAll(async () => {
  await e?.cerrar()
})

describe('sincronizar los roles predefinidos', () => {
  it('el que nadie tocó queda en la versión nueva', async () => {
    const asesor = await rolDe(TENANT_A, 'asesor')
    expect(asesor?.habilidades).toEqual(predefinido('asesor').habilidades)
    expect(asesor?.versionSistema).toEqual(predefinido('asesor').habilidades)
    expect(resultado.actualizados).toEqual(['Automotores Litoral: Asesor de servicios'])
  })

  it('a quien lo tiene le llega un aviso con lo que ganó', async () => {
    const avisos = await e.dbDuenio.select().from(aviso).where(eq(aviso.tenantId, TENANT_A))
    expect(avisos).toHaveLength(1)
    expect(avisos[0]?.texto).toMatch(
      /^El sistema actualizó el rol Asesor de servicios: ahora podés ver las visitas de la recepción, .* y modificar los turnos del taller\.$/,
    )
  })

  it('el que editó la concesionaria no se toca, y queda pendiente', async () => {
    const cajero = await rolDe(TENANT_A, 'cajero')
    expect(cajero?.habilidades).toEqual(cajeroEditado)
    expect(cajero?.versionSistema).toEqual(cajeroViejo)
    expect(resultado.pendientes).toEqual(['Automotores Litoral: Cajero'])
  })

  it('el que falta se crea, ya en la versión del sistema', async () => {
    const recepcionista = await rolDe(TENANT_A, 'recepcionista')
    expect(recepcionista?.habilidades).toEqual(predefinido('recepcionista').habilidades)
    expect(resultado.creados).toContain('Automotores Litoral: Recepcionista')
    expect(resultado.creados).toContain('Automotores Litoral: Vendedor')
  })

  it('un rol propio con el mismo nombre no se pisa', async () => {
    const norte = await e.dbDuenio.select().from(rol).where(eq(rol.tenantId, TENANT_B))
    const vendedor = norte.filter((r) => r.nombre === 'Vendedor')
    expect(vendedor).toHaveLength(1)
    expect(vendedor[0]?.predefinido).toBeNull()
    expect(norte).toHaveLength(ROLES_PREDEFINIDOS.length)
    expect(resultado.omitidos).toEqual(['Concesionaria del Norte: Vendedor'])
  })

  it('correrla otra vez no cambia nada', async () => {
    const otraVez = await sincronizarRolesPredefinidos(e.dbDuenio)
    expect(otraVez).toEqual({
      creados: [],
      actualizados: [],
      pendientes: ['Automotores Litoral: Cajero'],
      omitidos: ['Concesionaria del Norte: Vendedor'],
    })
  })
})
