import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contrato, nombreDeRuta, type RutaDelContrato } from '@gpb/contracts'
import { describe, expect, it } from 'vitest'
import { sobreQue } from '../src/auditoria/auditoria.service.ts'
import type { TablaAuditada } from '../src/comun/auditoria.ts'

/**
 * Que la auditoría no se olvide de nada.
 *
 * No levanta Postgres: es todo estático, y por eso corre en un segundo y se puede mirar en
 * cada commit.
 *
 * **Qué garantiza y qué no.** Garantiza que nadie escriba la tabla por su cuenta, que toda
 * ruta que muta esté clasificada a mano —y que agregar una sin decidir rompa el test—, y que
 * cada tabla auditada tenga su frase en la pantalla. No garantiza que el código de una ruta
 * clasificada como «audita» efectivamente audite: eso lo va a garantizar el trigger de
 * Postgres, que es el paso siguiente. Mientras tanto, esto obliga a detenerse y decidir, que
 * es lo que no pasaba antes.
 */

const SRC = join(import.meta.dirname, '..', 'src')

function* archivos(directorio: string): Generator<string> {
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name)
    if (entrada.isDirectory()) yield* archivos(ruta)
    else if (entrada.name.endsWith('.ts')) yield ruta
  }
}

/** Cada ruta del contrato con su identificador, recorriendo los submódulos. */
function* rutas(nodo: object, camino: string[] = []): Generator<[string, RutaDelContrato]> {
  for (const [clave, valor] of Object.entries(nodo)) {
    if (!valor || typeof valor !== 'object') continue
    if ('~orpc' in valor) yield [[...camino, clave].join('.'), valor as RutaDelContrato]
    else yield* rutas(valor, [...camino, clave])
  }
}

const MUTAN = ['POST', 'PUT', 'PATCH', 'DELETE']

function rutasQueMutan(): Array<[string, string]> {
  return [...rutas(contrato)]
    .filter(([, r]) => MUTAN.includes(r['~orpc'].route?.method ?? ''))
    .map(([id, r]) => [id, nombreDeRuta(r)])
}

/**
 * Las que dejan huella en la auditoría.
 *
 * Agregar una ruta que muta obliga a sumarla acá o a la lista de abajo con su motivo. No
 * hay tercera opción: un `expect` más abajo se encarga.
 */
const AUDITAN: readonly string[] = [
  'auditoria.nombrarDispositivo',
  'certificados.pedir',
  'certificados.cargar',
  'certificados.importar',
  'certificados.probar',
  'clientes.crear',
  'clientes.editar',
  'compras.crear',
  'compras.editar',
  'compras.recibir',
  'compras.anular',
  'comprobantes.emitir',
  'comprobantes.anular',
  'comprobantes.enviar',
  'comprobantes.verificar',
  'ordenes.abrir',
  'ordenes.editar',
  'ordenes.items',
  'ordenes.cambiarEstado',
  'ordenes.terminar',
  'ordenes.entregar',
  'ordenes.reabrir',
  'ordenes.anular',
  'ordenes.presupuestar',
  'ordenes.enviarPresupuesto',
  'ordenes.responderPresupuesto',
  'organizacion.crearEmpresa',
  'organizacion.editarEmpresa',
  'organizacion.crearSucursal',
  'organizacion.editarSucursal',
  'organizacion.crearPuntoVenta',
  'organizacion.editarPuntoVenta',
  'pedidosRepuestos.abrir',
  'pedidosRepuestos.editar',
  'pedidosRepuestos.entregar',
  'pedidosRepuestos.aCaja',
  'pedidosRepuestos.reabrir',
  'pedidosRepuestos.anular',
  'proveedores.crear',
  'proveedores.editar',
  'repuestos.crear',
  'repuestos.editar',
  'repuestos.ubicar',
  'repuestos.ajustar',
  'repuestos.transferir',
  'roles.crear',
  'roles.editar',
  'usuarios.crear',
  'usuarios.editar',
  'usuarios.nuevaPassword',
  'vehiculos.crear',
  'vehiculos.editar',
  'vehiculos.transferir',
]

/**
 * Las que no dejan huella, **con el motivo escrito**.
 *
 * El motivo importa más que la lista: dentro de un año, «¿por qué el login no está en la
 * auditoría de cambios?» se contesta acá y no releyendo código.
 */
const NO_AUDITAN: Readonly<Record<string, string>> = {
  'auth.iniciar':
    'Los ingresos salen de la tabla `sesion`, que es más completa: trae la computadora y la IP.',
  'auth.refrescar': 'Es la misma persona en la misma silla, cada quince minutos.',
  'auth.cerrar': 'Salir no cambia ningún dato de la concesionaria.',
  'auth.cambiarSucursal': 'Queda en la familia de sesiones, junto con el ingreso.',
  'auth.leerAvisos': 'Marcar como leído un aviso propio no es un cambio que nadie audite.',
  'configuracion.guardar': 'Son las preferencias propias: el tema de cada uno no es del resto.',
  'configuracion.guardarAtajos': 'El mapa de teclas es de quien lo usa, y de nadie más.',
}

describe('quién escribe la auditoría', () => {
  it('nadie inserta en la tabla salvo el ayudante compartido', () => {
    // Con un solo lugar que escribe, pasar la auditoría a triggers de Postgres es cambiar un
    // archivo. Con dieciséis, es dieciséis oportunidades de dejar una atrás.
    const culpables = [...archivos(SRC)]
      .filter((ruta) => readFileSync(ruta, 'utf8').includes('insert(auditoria)'))
      .map((ruta) => ruta.slice(SRC.length + 1).replaceAll('\\', '/'))

    expect(culpables).toEqual(['comun/auditoria.ts'])
  })
})

describe('cobertura de las rutas que mutan', () => {
  const mutantes = rutasQueMutan()

  it('hay rutas que mutar: si esto da cero, el recorrido del contrato se rompió', () => {
    expect(mutantes.length).toBeGreaterThan(50)
  })

  it('toda ruta que muta está clasificada', () => {
    const sinClasificar = mutantes
      .filter(([id]) => !AUDITAN.includes(id) && !(id in NO_AUDITAN))
      .map(([id, nombre]) => `${id} (${nombre})`)

    expect(
      sinClasificar,
      'Agregá la ruta a AUDITAN, o a NO_AUDITAN con el motivo, en este archivo.',
    ).toEqual([])
  })

  it('no quedan clasificadas rutas que ya no existen', () => {
    const existen = new Set(mutantes.map(([id]) => id))
    const fantasmas = [...AUDITAN, ...Object.keys(NO_AUDITAN)].filter((id) => !existen.has(id))

    expect(fantasmas).toEqual([])
  })

  it('ninguna está en las dos listas', () => {
    expect(AUDITAN.filter((id) => id in NO_AUDITAN)).toEqual([])
  })

  it('cada excepción dice por qué', () => {
    for (const [id, motivo] of Object.entries(NO_AUDITAN)) {
      expect(motivo.length, id).toBeGreaterThan(20)
    }
  })
})

describe('la pantalla sabe contar cada tabla auditada', () => {
  // La unión de TypeScript no existe en tiempo de ejecución: se repite acá, y el `satisfies`
  // hace que sacar una de la unión sin sacarla de esta lista no compile.
  const TABLAS = [
    'empresa',
    'sucursal',
    'punto_venta',
    'cliente',
    'proveedor',
    'certificado_afip',
    'comprobante',
    'orden',
    'repuesto',
    'pedido_repuestos',
    'compra',
    'rol',
    'usuario',
    'vehiculo',
    'titularidad',
    'dispositivo',
  ] as const satisfies readonly TablaAuditada[]

  it('ninguna se muestra como el nombre pelado de una tabla de Postgres', () => {
    // `usuario` y `dispositivo` los arma la consulta de la pantalla, con el correo y el
    // nombre de la computadora, así que no pasan por `sobreQue`.
    const propias = TABLAS.filter((t) => t !== 'usuario' && t !== 'dispositivo')
    const crudas = propias.filter((tabla) => sobreQue(tabla, null, { nombre: 'x' }) === tabla)

    expect(crudas).toEqual([])
  })
})
