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
  destino?: { to: NonNullable<LinkProps['to']>; params?: Record<string, string> }
  requiere?: Acceso
}

const ESTATICAS: EntradaIndice[] = [
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
    claves: ['ot', 'taller', 'reparacion', 'service', 'mecanico', 'trabajos'],
    destino: { to: '/ordenes' },
    requiere: { modulo: 'servicios', accion: 'ver', sujeto: 'Orden' },
  },
  // Sin construir: aparecen atenuadas y dicen dónde van a estar.
  {
    id: 'caja.facturar',
    titulo: 'Facturar',
    donde: 'Caja',
    claves: [
      'afip',
      'arca',
      'factura electronica',
      'comprobante',
      'nota de credito',
      'cobrar',
      'cae',
    ],
    requiere: { modulo: 'contable', accion: 'ver', sujeto: 'Comprobante' },
  },
  {
    id: 'configuracion.teclas',
    titulo: 'Teclas rápidas',
    donde: 'Configuración',
    claves: ['atajos', 'teclado', 'f2', 'f4', 'teclas'],
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
