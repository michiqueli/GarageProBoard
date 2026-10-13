import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ORPCModule } from '@orpc/nest'
import { LoggerModule } from 'nestjs-pino'
import { ControladorAuditoria } from './auditoria/auditoria.controller.ts'
import { ServicioAuditoria } from './auditoria/auditoria.service.ts'
import { ModuloAuth } from './auth/auth.module.ts'
import { ControladorCertificados } from './certificados/certificados.controller.ts'
import { ServicioCertificados } from './certificados/certificados.service.ts'
import { ControladorClientes } from './clientes/clientes.controller.ts'
import { ServicioClientes } from './clientes/clientes.service.ts'
import { ControladorComprobantes } from './comprobantes/comprobantes.controller.ts'
import { ServicioComprobantes } from './comprobantes/comprobantes.service.ts'
import { ModuloBase } from './comun/base.module.ts'
import { ControladorConfiguracion } from './configuracion/configuracion.controller.ts'
import { ServicioConfiguracion } from './configuracion/configuracion.service.ts'
import { DatosDeLaEstacion } from './fichaje/estacion.ts'
import { ServicioEstaciones } from './fichaje/estaciones.service.ts'
import { ControladorFichaje } from './fichaje/fichaje.controller.ts'
import { ServicioFichaje } from './fichaje/fichaje.service.ts'
import { ControladorHojas } from './hojas/hojas.controller.ts'
import { ServicioHojas } from './hojas/hojas.service.ts'
import { ControladorFirmas } from './ordenes/firmas.controller.ts'
import { ServicioFirmas } from './ordenes/firmas.service.ts'
import { ControladorOrdenes } from './ordenes/ordenes.controller.ts'
import { ServicioOrdenes } from './ordenes/ordenes.service.ts'
import { ControladorPendientes } from './ordenes/pendientes.controller.ts'
import { ServicioPendientes } from './ordenes/pendientes.service.ts'
import { ControladorOrganizacion } from './organizacion/organizacion.controller.ts'
import { ServicioOrganizacion } from './organizacion/organizacion.service.ts'
import { ModuloPadron } from './padron/padron.module.ts'
import { ControladorPersonal } from './personal/personal.controller.ts'
import { ServicioPersonal } from './personal/personal.service.ts'
import { ControladorEsperas } from './recepcion/esperas.controller.ts'
import { ServicioEsperas } from './recepcion/esperas.service.ts'
import { ControladorLlamador } from './recepcion/llamador.controller.ts'
import { ServicioLlamador } from './recepcion/llamador.service.ts'
import { ControladorRecepcion } from './recepcion/recepcion.controller.ts'
import { ServicioRecepcion } from './recepcion/recepcion.service.ts'
import { ControladorTotem } from './recepcion/totem.controller.ts'
import { ServicioTotem } from './recepcion/totem.service.ts'
import { ControladorTurnos } from './recepcion/turnos.controller.ts'
import { ServicioTurnos } from './recepcion/turnos.service.ts'
import { ServicioCompras } from './repuestos/compras.service.ts'
import { ServicioPedidosRepuestos } from './repuestos/pedidos.service.ts'
import { ServicioProveedores } from './repuestos/proveedores.service.ts'
import {
  ControladorCompras,
  ControladorPedidosRepuestos,
  ControladorProveedores,
  ControladorRepuestos,
} from './repuestos/repuestos.controller.ts'
import { ServicioRepuestos } from './repuestos/repuestos.service.ts'
import { ControladorRevision } from './revision/revision.controller.ts'
import { ServicioRevision } from './revision/revision.service.ts'
import { ControladorRoles } from './roles/roles.controller.ts'
import { ServicioRoles } from './roles/roles.service.ts'
import { ControladorSalud } from './salud/salud.controller.ts'
import { ControladorUsuarios } from './usuarios/usuarios.controller.ts'
import { ServicioUsuarios } from './usuarios/usuarios.service.ts'
import { ControladorVehiculos } from './vehiculos/vehiculos.controller.ts'
import { ServicioVehiculos } from './vehiculos/vehiculos.service.ts'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env'] }),
    LoggerModule.forRoot({
      pinoHttp: {
        // El tenant en cada línea de log: sin eso, diagnosticar un incidente en
        // producción implica adivinar de qué concesionaria era el request.
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        // La clave se omite en producción en vez de ir en undefined: con
        // exactOptionalPropertyTypes no es lo mismo.
        ...(process.env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
      },
    }),
    ORPCModule.forRoot({
      // Los errores de validación salen con el detalle del campo: un 400 opaco
      // obliga al del front a adivinar qué mandó mal.
      interceptors: [],
    }),
    ModuloBase,
    ModuloAuth,
    ModuloPadron,
  ],
  controllers: [
    ControladorSalud,
    ControladorVehiculos,
    ControladorUsuarios,
    ControladorAuditoria,
    ControladorOrganizacion,
    ControladorClientes,
    ControladorRoles,
    ControladorCertificados,
    ControladorConfiguracion,
    ControladorComprobantes,
    ControladorOrdenes,
    ControladorFirmas,
    ControladorPendientes,
    ControladorRepuestos,
    ControladorPedidosRepuestos,
    ControladorCompras,
    ControladorProveedores,
    ControladorPersonal,
    ControladorFichaje,
    ControladorHojas,
    ControladorRevision,
    ControladorRecepcion,
    ControladorTurnos,
    ControladorTotem,
    ControladorLlamador,
    ControladorEsperas,
  ],
  providers: [
    ServicioUsuarios,
    ServicioAuditoria,
    ServicioOrganizacion,
    ServicioClientes,
    ServicioVehiculos,
    ServicioRoles,
    ServicioCertificados,
    ServicioConfiguracion,
    ServicioComprobantes,
    ServicioOrdenes,
    ServicioFirmas,
    ServicioPendientes,
    ServicioRepuestos,
    ServicioPedidosRepuestos,
    ServicioCompras,
    ServicioProveedores,
    ServicioPersonal,
    ServicioFichaje,
    ServicioHojas,
    ServicioRevision,
    ServicioRecepcion,
    ServicioTurnos,
    ServicioTotem,
    ServicioLlamador,
    ServicioEsperas,
    ServicioEstaciones,
    DatosDeLaEstacion,
  ],
})
export class ModuloPrincipal {}
