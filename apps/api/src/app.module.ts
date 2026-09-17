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
import { ControladorOrdenes } from './ordenes/ordenes.controller.ts'
import { ServicioOrdenes } from './ordenes/ordenes.service.ts'
import { ControladorOrganizacion } from './organizacion/organizacion.controller.ts'
import { ServicioOrganizacion } from './organizacion/organizacion.service.ts'
import { ModuloPadron } from './padron/padron.module.ts'
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
    ControladorRepuestos,
    ControladorPedidosRepuestos,
    ControladorCompras,
    ControladorProveedores,
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
    ServicioRepuestos,
    ServicioPedidosRepuestos,
    ServicioCompras,
    ServicioProveedores,
  ],
})
export class ModuloPrincipal {}
