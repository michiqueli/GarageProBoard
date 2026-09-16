# Certificados de AFIP

Estado: **decidido, sin construir**. Se construye con la facturación (Hito 3).

## Dos credenciales, dos dueños

| | De quién | Para qué |
| --- | --- | --- |
| **Padrón** | De GarageProBoard, una sola | Autocompletar un CUIT. Configurada en el servidor (`AFIP_PADRON_*`); los clientes no la ven |
| **Facturación** | De cada razón social | Emitir comprobantes con **su** CUIT. La carga la concesionaria |

Una factura sale con el CUIT de la SAS que vende. Si una concesionaria tiene dos razones
sociales, tiene dos certificados.

## Camino elegido: el certificado de cada cliente, con un asistente

Se evaluó también la **delegación** —el cliente delega el servicio de factura electrónica
en el CUIT de GarageProBoard y un solo certificado factura por todos— y se descartó: si ese
certificado vence o se revoca, dejan de facturar todas las concesionarias a la vez.

Lo difícil del camino A es generar el certificado: pedir un CSR con OpenSSL no es algo que
un contador haga seguido. **Eso lo hace el sistema**, y el cliente sólo sigue pasos en ARCA.

### El asistente, por razón social

Seis pasos, en el orden en que se hacen en ARCA. Cada uno con capturas y con lo que suele
salir mal.

1. **Crear el pedido.** El sistema genera la clave privada y el pedido de certificado
   (CSR) con los datos de la empresa: `C=AR`, `O=<razón social>`, `CN=<alias>`,
   `serialNumber=CUIT <cuit>`. Se descarga **el pedido**. La clave privada se guarda
   cifrada en el momento y **no hace falta descargarla**: ARCA no la pide, y cada copia
   que anda suelta en una PC es una forma de facturar con ese CUIT.
2. **Crear el computador en ARCA.** Con la clave fiscal del representante de la SAS:
   *Administración de Certificados Digitales* → agregar alias → cargar el pedido →
   descargar el `.crt`. Si el servicio no aparece, se habilita antes desde el
   *Administrador de Relaciones de Clave Fiscal*.
3. **Subir el `.crt`.** El sistema verifica antes de aceptarlo:
   - que corresponda a la clave que generó (si suben el de otro pedido, lo dice);
   - que el CUIT del certificado sea el de la empresa;
   - que esté vigente, y si es de producción o de homologación.
4. **Activar la facturación electrónica.** *Administrador de Relaciones de Clave Fiscal* →
   nueva relación → ARCA → WebServices → *Facturación Electrónica*. **El representante es
   el computador creado en el paso 2, no el CUIT.** Es el error más común, y el asistente lo
   dice en grande: asociado al CUIT, todo parece hecho y AFIP rechaza igual.
5. **Crear el punto de venta.** *Administración de puntos de venta y domicilios* → nuevo
   punto de venta, con el sistema que corresponda a la condición de la empresa, que el
   asistente ya conoce:
   - Responsable Inscripto o Exento → **RECE para aplicativo y web services**.
   - Monotributo → **Factura Electrónica - Monotributo - Web Services**.

   El número que dé ARCA es el que se carga en *Empresas y sucursales*.
6. **Probar.** Contra AFIP, sin emitir nada: inicio de sesión real en WSAA para `wsfe`
   —si falla, casi siempre es el paso 4— y la lista de puntos de venta habilitados para ese
   CUIT, comparada con los cargados en el sistema. Si falta uno, se vuelve al paso 5. Una
   factura de prueba real es un paso aparte, opcional y confirmado a mano: en producción
   queda emitida.

Al terminar, el certificado queda activo. Se avisa **treinta días antes del vencimiento**
(duran dos años), y renovar es repetir el asistente sin cortar la facturación: el viejo
sigue activo hasta que el nuevo pasa la prueba.

### Quién lo usa

La pantalla vive en la configuración del módulo contable y pide `configurar Comprobante`.
Cada paso queda en la auditoría: quién generó el pedido, quién subió el certificado, cuándo.

## Dónde se guarda

**En Postgres, cifrado. No en un almacén de archivos.**

Un certificado y su clave son unos 3 KB. En la base quedan detrás de la misma RLS que el
resto de la concesionaria, se guardan en la misma transacción que la verificación, y se
respaldan con la base, que se respalda igual.

- Tabla `certificado_afip`, colgando de `empresa`: estado (`pendiente`, `activo`,
  `reemplazado`, `vencido`), alias, CSR, certificado, entorno, vencimiento.
- La clave privada, con **AES-256-GCM** y la clave maestra de `SECRETOS_MASTER_KEY`.
  Perder esa clave maestra es perder la capacidad de facturar de todos los clientes: se
  respalda aparte de la base.
- Para generar el CSR hace falta una biblioteca: `node:crypto` genera la clave pero no el
  pedido. Candidata: `@peculiar/x509`.

## Almacén de archivos: no ahora, sí pronto

Los certificados no lo necesitan, pero el sistema sí va a necesitarlo:

- Fotos del vehículo en la recepción del taller (Hito 4).
- Documentación escaneada: cédula, título, DNI, formulario 08.
- Adjuntos de órdenes de trabajo y firmas de conformidad.
- Logos de cada concesionaria.
- La exportación completa al darse de baja.

Se programa contra **la API de S3** y no contra un producto: un puerto `AlmacenArchivos` en
`packages/`, con un contenedor S3-compatible en `infra/` para desarrollo. Qué se usa en
producción —propio en el VPS o administrado, como Cloudflare R2 o Backblaze B2— se decide
en el Hito 4. MinIO cambió en 2025 cómo distribuye su edición comunitaria: revisar su
estado antes de elegirlo.
