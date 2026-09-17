import { type Acceso, type Autorizacion, accesoDeRuta, contrato, permite } from '@gpb/contracts'
import type { LinkProps } from '@tanstack/react-router'

/**
 * El índice del buscador del sistema: pantallas, acciones y configuraciones, con dónde
 * viven y **las palabras con las que la gente las busca**. Ver «Buscador del sistema» en
 * `docs/tecnicos/sistema-de-diseno.md`.
 *
 * Las palabras clave son el trabajo de verdad: nadie busca con el nombre que le pusimos a
 * la pantalla. El que escribe «afip» tiene que encontrar los certificados, el padrón y los
 * puntos de venta, aunque ninguno se llame así.
 *
 * **Una pantalla nueva se registra acá igual que en el menú.** Si no está, no existe para
 * quien la busca.
 */

export interface EntradaIndice {
  id: string
  titulo: string
  /** La miga: enseña el mapa, y quien busca dos veces la tercera va directo por el menú. */
  donde: string
  claves: string[]
  /** Sin destino: todavía no está construida. Aparece atenuada y dice dónde va a estar. */
  destino?: {
    to: NonNullable<LinkProps['to']>
    params?: Record<string, string>
    /** Para las entradas que caen en una pestaña, como `?ver=teclas`. */
    search?: Record<string, string>
  }
  requiere?: Acceso
}

const ESTATICAS: EntradaIndice[] = [
  {
    id: 'repuestos',
    titulo: 'Repuestos: catálogo y stock',
    donde: 'Principal → Repuestos',
    claves: [
      'repuestos',
      'stock',
      'deposito',
      'piezas',
      'codigo de fabrica',
      'inventario',
      'existencias',
      'precios',
      'lista de precios',
    ],
    destino: { to: '/repuestos' },
    requiere: accesoDeRuta(contrato.repuestos.listar),
  },
  {
    id: 'repuestos.nuevo',
    titulo: 'Dar de alta un repuesto',
    donde: 'Repuestos → Nuevo repuesto (Ins)',
    claves: ['nuevo repuesto', 'cargar pieza', 'alta', 'agregar al catalogo', 'stock inicial'],
    destino: { to: '/repuestos' },
    requiere: accesoDeRuta(contrato.repuestos.crear),
  },
  {
    id: 'repuestos.ajuste',
    titulo: 'Ajustar el stock con un recuento',
    donde: 'Repuestos → ficha del repuesto → Ajustar stock',
    claves: [
      'recuento',
      'inventario',
      'faltante',
      'sobrante',
      'rotura',
      'corregir stock',
      'ajuste',
    ],
    destino: { to: '/repuestos' },
    requiere: accesoDeRuta(contrato.repuestos.ajustar),
  },
  {
    id: 'repuestos.transferir',
    titulo: 'Mandar repuestos a otra sucursal',
    donde: 'Repuestos → ficha del repuesto → Mandar a otra sucursal',
    claves: ['transferencia', 'traspaso', 'mover stock', 'otra sucursal', 'deposito central'],
    destino: { to: '/repuestos' },
    requiere: accesoDeRuta(contrato.repuestos.transferir),
  },
  {
    id: 'repuestos.pedidos',
    titulo: 'Pedidos de repuestos',
    donde: 'Repuestos → Pedidos',
    claves: [
      'pedido',
      'mostrador',
      'venta de repuestos',
      'chasis',
      'taller pide',
      'despachar',
      'entregar repuestos',
    ],
    destino: { to: '/repuestos/pedidos' },
    requiere: accesoDeRuta(contrato.pedidosRepuestos.listar),
  },
  {
    id: 'repuestos.pedidos.nuevo',
    titulo: 'Abrir un pedido de repuestos',
    donde: 'Repuestos → Pedidos → Nuevo pedido (Ins)',
    claves: ['nuevo pedido', 'pedir repuestos', 'vender repuesto', 'mostrador', 'chasis'],
    destino: { to: '/repuestos/pedidos/nuevo' },
    requiere: accesoDeRuta(contrato.pedidosRepuestos.abrir),
  },
  {
    id: 'repuestos.compras',
    titulo: 'Compras a proveedores',
    donde: 'Repuestos → Compras',
    claves: [
      'compras',
      'pedido a fabrica',
      'orden de compra',
      'recibir mercaderia',
      'remito',
      'factura de proveedor',
      'reponer',
    ],
    destino: { to: '/repuestos/compras' },
    requiere: accesoDeRuta(contrato.compras.listar),
  },
  {
    id: 'repuestos.proveedores',
    titulo: 'Proveedores',
    donde: 'Repuestos → Proveedores',
    claves: ['proveedores', 'fabrica', 'distribuidor', 'terminal', 'cuit', 'condicion de pago'],
    destino: { to: '/repuestos/proveedores' },
    requiere: accesoDeRuta(contrato.proveedores.listar),
  },
  {
    id: 'caja.repuestos',
    titulo: 'Facturar repuestos de mostrador',
    donde: 'Caja → Repuestos de mostrador para facturar',
    claves: ['facturar repuestos', 'venta mostrador', 'cobrar repuestos'],
    destino: { to: '/caja' },
    requiere: accesoDeRuta(contrato.pedidosRepuestos.listar),
  },
  {
    id: 'vehiculos',
    titulo: 'Vehículos',
    donde: 'Principal',
    claves: [
      'autos',
      'unidades',
      'parque',
      'patentes',
      'chasis',
      'dominio',
      '0km',
      'cero kilometro',
    ],
    destino: { to: '/vehiculos' },
    requiere: accesoDeRuta(contrato.vehiculos.listar),
  },
  {
    id: 'vehiculos.nuevo',
    titulo: 'Dar de alta un vehículo',
    donde: 'Vehículos → Nuevo vehículo (Ins)',
    claves: ['nuevo vehiculo', 'cargar auto', 'alta', 'agregar', '0km', 'stock'],
    destino: { to: '/vehiculos' },
    requiere: accesoDeRuta(contrato.vehiculos.crear),
  },
  {
    id: 'vehiculos.transferir',
    titulo: 'Transferir un vehículo',
    donde: 'Vehículos → ficha del vehículo → Transferir (F4)',
    claves: ['titular', 'titularidad', 'cambio de dueño', 'vender', 'venta', 'transferencia'],
    destino: { to: '/vehiculos' },
    requiere: accesoDeRuta(contrato.vehiculos.transferir),
  },
  {
    id: 'clientes',
    titulo: 'Clientes',
    donde: 'Principal',
    claves: ['titulares', 'compradores', 'cuit', 'cuil', 'dni', 'razon social', 'contactos'],
    destino: { to: '/clientes' },
    requiere: accesoDeRuta(contrato.clientes.listar),
  },
  {
    id: 'clientes.nuevo',
    titulo: 'Dar de alta un cliente con los datos de AFIP',
    donde: 'Clientes → Nuevo cliente (Ins) → Completar con AFIP',
    claves: [
      'afip',
      'arca',
      'padron',
      'constancia',
      'cuit',
      'nuevo cliente',
      'alta',
      'condicion iva',
    ],
    destino: { to: '/clientes' },
    requiere: accesoDeRuta(contrato.clientes.crear),
  },
  {
    id: 'empresas',
    titulo: 'Empresas y sucursales',
    donde: 'Administración',
    claves: [
      'razon social',
      'razones sociales',
      'sas',
      'sucursal',
      'cuit',
      'ingresos brutos',
      'iibb',
      'convenio multilateral',
      'inicio de actividades',
    ],
    destino: { to: '/empresas' },
    requiere: accesoDeRuta(contrato.organizacion.listar),
  },
  {
    id: 'empresas.padron',
    titulo: 'Cargar una razón social con los datos de AFIP',
    donde: 'Empresas y sucursales → Nueva razón social → Completar con AFIP',
    claves: ['afip', 'arca', 'padron', 'nueva empresa', 'alta'],
    destino: { to: '/empresas' },
    requiere: accesoDeRuta(contrato.organizacion.crearEmpresa),
  },
  {
    id: 'empresas.puntosVenta',
    titulo: 'Puntos de venta',
    donde: 'Empresas y sucursales → cada sucursal',
    claves: ['afip', 'arca', 'pdv', 'punto de venta', 'numeracion', 'facturacion', 'cae', 'caea'],
    destino: { to: '/empresas' },
    requiere: accesoDeRuta(contrato.organizacion.listar),
  },
  {
    id: 'usuarios',
    titulo: 'Usuarios',
    donde: 'Administración',
    claves: [
      'personas',
      'empleados',
      'acceso',
      'contraseña',
      'clave',
      'dar de baja',
      'alta usuario',
    ],
    destino: { to: '/usuarios' },
    requiere: accesoDeRuta(contrato.usuarios.listar),
  },
  {
    id: 'roles',
    titulo: 'Roles y permisos',
    donde: 'Administración',
    claves: ['permisos', 'perfiles', 'accesos', 'que puede ver', 'clonar rol'],
    destino: { to: '/roles' },
    requiere: accesoDeRuta(contrato.roles.listar),
  },
  {
    id: 'auditoria',
    titulo: 'Auditoría: ingresos, cambios y computadoras',
    donde: 'Administración',
    claves: [
      'quien entro',
      'sesiones',
      'login',
      'historial',
      'quien cambio',
      'registro',
      'log',
      'dispositivos',
      'pc',
    ],
    destino: { to: '/auditoria' },
    requiere: accesoDeRuta(contrato.auditoria.ingresos),
  },
  {
    id: 'ordenes',
    titulo: 'Órdenes de trabajo',
    donde: 'Principal',
    claves: ['ot', 'taller', 'reparacion', 'service', 'mecanico', 'trabajos', 'estado del auto'],
    destino: { to: '/ordenes' },
    requiere: accesoDeRuta(contrato.ordenes.listar),
  },
  {
    id: 'ordenes.recepcion',
    titulo: 'Recibir un vehículo',
    donde: 'Órdenes de trabajo → Recibir un vehículo (Ins)',
    claves: [
      'recepcion',
      'abrir orden',
      'nueva orden',
      'ingreso',
      'entra un auto',
      'ot nueva',
      'turno',
    ],
    destino: { to: '/ordenes/nueva' },
    requiere: accesoDeRuta(contrato.ordenes.abrir),
  },
  {
    id: 'caja.ordenes',
    titulo: 'Órdenes para facturar',
    donde: 'Caja → Órdenes para facturar',
    claves: ['cobrar orden', 'facturar orden', 'ot terminada', 'taller', 'cobrar'],
    destino: { to: '/caja' },
    requiere: accesoDeRuta(contrato.ordenes.listar),
  },
  {
    id: 'caja.facturar',
    titulo: 'Facturar',
    donde: 'Caja',
    destino: { to: '/caja' },
    claves: [
      'afip',
      'arca',
      'factura electronica',
      'comprobante',
      'nota de credito',
      'cobrar',
      'cae',
    ],
    requiere: accesoDeRuta(contrato.comprobantes.emitir),
  },
  {
    id: 'caja.comprobantes',
    titulo: 'Comprobantes emitidos',
    donde: 'Caja → Últimos comprobantes',
    claves: ['facturas', 'pdf', 'imprimir', 'cae', 'reimprimir', 'verificar', 'afip', 'arca'],
    destino: { to: '/caja' },
    requiere: accesoDeRuta(contrato.comprobantes.listar),
  },
  {
    id: 'configuracion',
    titulo: 'Configuración: tema, densidad y sucursal al entrar',
    donde: 'Configuración',
    claves: [
      'preferencias',
      'tema',
      'oscuro',
      'claro',
      'modo noche',
      'densidad',
      'filas',
      'sucursal predeterminada',
      'al entrar',
      'mi cuenta',
    ],
    destino: { to: '/configuracion' },
  },
  {
    id: 'configuracion.teclas',
    titulo: 'Teclas rápidas',
    donde: 'Configuración → Teclas rápidas',
    claves: [
      'atajos',
      'teclado',
      'f2',
      'f4',
      'teclas',
      'combinaciones',
      'reasignar',
      'cambiar teclas',
      'shortcuts',
    ],
    destino: { to: '/configuracion', search: { ver: 'teclas' } },
  },
  // Sin construir: aparecen atenuadas y dicen dónde van a estar. «¿Dónde va a estar el
  // fichaje?» se contesta igual antes de que la pantalla exista, y es mejor respuesta que
  // el silencio.
  {
    id: 'ordenes.fichaje',
    titulo: 'Fichaje de mecánicos por QR',
    donde: 'Órdenes de trabajo → ficha de la orden',
    claves: [
      'fichar',
      'fichada',
      'reloj',
      'tiempos',
      'mecanico',
      'qr',
      'escanear',
      'mano de obra',
      'tiempo real',
    ],
    requiere: accesoDeRuta(contrato.ordenes.listar),
  },
  {
    id: 'tablero',
    titulo: 'Tablero de piso en tiempo real',
    donde: 'Principal → Tablero',
    claves: ['tablero', 'piso', 'taller', 'que auto', 'quien lo tiene', 'demoras', 'pantalla'],
    requiere: accesoDeRuta(contrato.ordenes.listar),
  },
]

/** Una entrada por razón social: los certificados son de cada una. */
export function entradasDeCertificados(
  empresas: Array<{ id: string; razonSocial: string }>,
): EntradaIndice[] {
  return empresas.map((e) => ({
    id: `certificado.${e.id}`,
    titulo: empresas.length > 1 ? `Certificado de AFIP de ${e.razonSocial}` : 'Certificado de AFIP',
    donde: `Empresas y sucursales → ${e.razonSocial}`,
    claves: [
      'afip',
      'arca',
      'certificado',
      'certificados',
      'certificado digital',
      'factura electronica',
      'facturacion electronica',
      'csr',
      'crt',
      'clave fiscal',
      'computador',
      'web services',
      'wsfe',
      'renovar',
      'vencimiento',
    ],
    destino: { to: '/empresas/$id/certificado-afip', params: { id: e.id } },
    requiere: accesoDeRuta(contrato.certificados.estado),
  }))
}

export function indiceEstatico(): EntradaIndice[] {
  return ESTATICAS
}

/** Sin acentos ni mayúsculas: «Auditoría» y «auditoria» son lo mismo para quien busca. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Qué entradas coinciden, y en qué orden. **Por palabras sueltas en cualquier orden**:
 * «pago mercado» encuentra lo mismo que «mercado pago». Cada palabra tiene que estar en el
 * título, la miga o las claves. Primero las que coinciden en el título, después el resto.
 *
 * Lo que el usuario no puede ver no aparece; lo que no está construido, sí (atenuado).
 */
export function buscarEnIndice(
  entradas: EntradaIndice[],
  texto: string,
  autorizacion: Autorizacion,
): EntradaIndice[] {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return []

  return entradas
    .filter((e) => !e.requiere || permite(autorizacion, e.requiere))
    .map((e) => {
      const titulo = normalizar(e.titulo)
      const todo = `${titulo} ${normalizar(e.donde)} ${e.claves.map(normalizar).join(' ')}`
      if (!palabras.every((p) => todo.includes(p))) return null
      const enTitulo = palabras.filter((p) => titulo.includes(p)).length
      return { e, puntos: enTitulo * 2 + (e.destino ? 1 : 0) }
    })
    .filter((x): x is { e: EntradaIndice; puntos: number } => x !== null)
    .sort((a, b) => b.puntos - a.puntos)
    .map((x) => x.e)
}
