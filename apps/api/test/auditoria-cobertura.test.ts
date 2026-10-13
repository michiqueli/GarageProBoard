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
  'ordenes.revisar',
  'ordenes.pasarAPresupuesto',
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
  'personal.crear',
  'personal.editar',
  'personal.emitirCredencial',
  'personal.revocarCredencial',
  'fichaje.registrarEstacion',
  'fichaje.revocarEstacion',
  'proveedores.crear',
  'proveedores.editar',
  'repuestos.crear',
  'repuestos.editar',
  'repuestos.ubicar',
  'repuestos.ajustar',
  'repuestos.transferir',
  'roles.crear',
  'roles.editar',
  'roles.aplicarNovedad',
  'roles.descartarNovedad',
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
  'auth.entrarConCredencial':
    'Como el ingreso con contraseña: queda en `sesion`, con la tablet en la que se abrió.',
  'auth.cerrar': 'Salir no cambia ningún dato de la concesionaria.',
  'auth.cambiarSucursal': 'Queda en la familia de sesiones, junto con el ingreso.',
  'auth.leerAvisos': 'Marcar como leído un aviso propio no es un cambio que nadie audite.',
  'hojas.subir':
    'El trigger de hoja_imagen ya guarda la fila entera, con quien y cuando, y no se modifican: ' +
    'subir inserta una y marca la anterior. La narracion diria lo mismo que las dos filas.',
  'hojas.quitar':
    'Marca la imagen propia como reemplazada, y eso es una sola columna que el trigger ya cuenta.',
  'revision.crear':
    'El trigger de revision_punto guarda el punto entero con quién y cuándo; la narración ' +
    'repetiría el nombre y la sección, que es todo lo que tiene.',
  'revision.editar':
    'Cambiar el nombre o apagar un punto son dos columnas que el trigger ya cuenta con su ' +
    'antes y su después.',
  'revision.mover':
    'Es el lugar del punto en la lista: el trigger registra el cambio de orden, y no hay nada ' +
    'del negocio que contar además.',
  'recepcion.anotar':
    'Anotar a quien llega es lo de todos los días: la visita misma dice quién la anotó y a ' +
    'qué hora, y auditar el alta sería una fila por cada persona que cruza la puerta.',
  'recepcion.derivar':
    'Es una columna de la visita, y el trigger guarda su antes y su después con quién lo cambió.',
  'recepcion.atender':
    'Quién la agarró y cuándo son dos columnas de la visita que el trigger ya cuenta.',
  'turnos.crear': 'El trigger de turno guarda el turno entero con quién lo agendó y cuándo.',
  'turnos.editar':
    'Cambiarlo de día o de pedido son columnas del turno, con su antes y su después en el trigger.',
  'turnos.cancelar': 'Es el estado del turno, que el trigger guarda con quién lo cambió.',
  'turnos.fijarCupo': 'El trigger de agenda_cupo guarda el cupo con quién lo cambió.',
  'turnos.quitarCupo': 'El trigger de agenda_cupo guarda la baja con el cupo que había.',
  'turnos.noVino': 'Es el estado del turno, que el trigger guarda con quién lo cambió.',
  'turnos.llego':
    'Cambia el estado del turno, que el trigger cuenta, y anota la visita, que dice quién la anotó.',
  'totem.anotar':
    'Es alguien que cruza la puerta: la visita dice que la anotó el tótem y a qué hora. Si se ' +
    'llevó un turno, el trigger de turno guarda el cambio de estado.',
  'recepcion.soltar':
    'Vacía quién la agarró y cuándo: el trigger guarda el antes, que es lo que importa saber.',
  'recepcion.cerrar':
    'Cómo terminó queda en la visita, y el trigger guarda el cambio con quién y cuándo.',
  'configuracion.guardar': 'Son las preferencias propias: el tema de cada uno no es del resto.',
  'configuracion.guardarAtajos': 'El mapa de teclas es de quien lo usa, y de nadie más.',
  'fichaje.escanear':
    'Cada escaneo deja su propia fila en evento_escaneo, con el texto crudo, el resultado y la ' +
    'latencia. Auditarlo además sería contar dos veces lo mismo, y en la tabla equivocada.',
  'personal.pdfCredenciales':
    'Es POST porque lleva la lista de a quiénes imprimir, pero no cambia un solo dato: arma ' +
    'un PDF con credenciales que ya existen. Lo que sí queda auditado es haberlas emitido.',
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
    'empleado',
    'credencial',
    'estacion_fichaje',
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

  /**
   * La regresión: `sobreQue` la llaman **las dos pestañas**, y las filas no tienen la misma
   * forma. La narrada trae lo que la operación anotó —«la credencial de Pérez, Jorge»—; la
   * cruda trae la fila que escribió el trigger, con un `empleadoId` y ningún nombre. Leer sólo
   * la primera hacía que la pestaña de cambios dijera «la credencial de undefined».
   */
  describe('con la fila cruda del trigger, que no tiene los nombres', () => {
    it('la credencial se identifica por su código', () => {
      const cruda = {
        codigo: 'WXCK4CTP',
        empleadoId: 'a3df1520-6461-4a8c-adfb-688c2d601007',
        emitidaEn: '2026-09-18T11:41:34-03:00',
      }
      expect(sobreQue('credencial', null, cruda)).toBe('la credencial WXCK4CTP')
    })

    it('y con la narrada sigue diciendo de quién es', () => {
      expect(sobreQue('credencial', null, { empleado: 'Pérez, Jorge' })).toBe(
        'la credencial de Pérez, Jorge',
      )
    })

    it('ninguna tabla del fichaje sale con su nombre de Postgres', () => {
      const crudas = ['credencial', 'estacion_fichaje', 'jornada', 'sesion_trabajo'].filter(
        (tabla) =>
          sobreQue(tabla, null, { nombre: 'x', codigo: 'x', fecha: '2026-09-18' }) === tabla,
      )
      expect(crudas).toEqual([])
    })
  })

  it('ninguna se muestra como el nombre pelado de una tabla de Postgres', () => {
    // `usuario` y `dispositivo` los arma la consulta de la pantalla, con el correo y el
    // nombre de la computadora, así que no pasan por `sobreQue`.
    const propias = TABLAS.filter((t) => t !== 'usuario' && t !== 'dispositivo')
    const crudas = propias.filter((tabla) => sobreQue(tabla, null, { nombre: 'x' }) === tabla)

    expect(crudas).toEqual([])
  })
})
