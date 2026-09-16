# Oversoft — investigación y estrategia de integración

Investigación al 2026-08-27, sobre fuentes públicas.

## Qué es

- DMS dominante en Argentina. Nace de la fusión de **Sistemas Bianchi** y
  **Sorzana**.
- ~14.000 usuarios habituales; según su propio material, **6 de cada 10
  vehículos comercializados en Argentina** pasan por alguno de sus sistemas.
- Presencia en 7 países de Latinoamérica, ~15.000 usuarios únicos por día.
- Módulos: vehículos, administración, **taller**, repuestos, marketing, BI.
  Multi-concesionario y multi-sucursal.

## Ya tienen módulo de tiempos — y por qué no lo usan

La documentación de Oversoft menciona un **"Tablero de Mano de Obra"** que
monitorea y gestiona el tiempo de trabajo de los técnicos, define tiempos
planificados por OT y sigue el rendimiento individual. También mencionan
planificación de tareas de taller con asignación de mecánicos y visualización
gráfica del avance en tiempo real.

**El cliente lo tiene disponible y no lo usa: no es práctico, no es cómodo, no
es rápido. Y encima se lo cobran caro.**

Esto define el producto entero. GarageTick **no compite en funcionalidad** —
Oversoft ya la tiene, y encima integrada al resto del DMS. Compite en una sola
cosa:

> **Fichar tarda 3 segundos, son 2 escaneos, y no hay que buscar nada.**

Consecuencias directas:

1. **La velocidad es el requisito, no una optimización.** Hay presupuesto de
   latencia con números concretos en `01-arquitectura.md`, y es criterio de
   aceptación de la fase 1.
2. **Cada feature que agregue un paso al fichaje es una amenaza al proyecto.**
   Selectores de operación, confirmaciones, notas obligatorias, login: todo eso
   es lo que mató al módulo de Oversoft. Va en la pantalla del jefe o en la del
   asesor, nunca en el kiosco.
3. **Integrarse con Oversoft es menos urgente todavía.** El valor no está en los
   datos que ya tienen; está en capturar el tiempo real, que hoy no capturan.
4. **El riesgo político se reduce mucho.** No estás reemplazando algo que
   funciona, estás llenando un hueco que ellos mismos reconocen.
5. **Hay ancla de precio.** Lo que Oversoft cotiza por ese módulo es el techo
   contra el que se compara GarageTick. Conseguir ese número (relevamiento A1)
   antes de cotizar.
6. **Todo lo que dependa de Oversoft va a salir caro también.** Refuerza las
   decisiones ya tomadas: etiqueta térmica propia en vez de QR impreso por
   ellos, y acceso read-only a la base antes que una interfaz oficial.

## Superficie de integración

**No existe API pública ni documentación técnica abierta.** Ninguna.

Lo que sí ofrecen comercialmente es un servicio de **"Desarrollo de Interfaces"**
— conexiones con aplicaciones de terceros, sistemas de fábrica e importadores —
y **"Desarrollo a medida"**. O sea: integrarse con Oversoft es un **proyecto
comercial con ellos**, con presupuesto y plazo, no un endpoint documentado.

Terceros se integran (p. ej. Tecnom, un CRM automotor, publica que intercambia
turnos de taller, órdenes de reparación, datos de clientes, unidades y fechas de
entrega), pero el mecanismo no es público.

## Estrategia adoptada

**El MVP no depende de Oversoft.** El sistema funciona aislado desde el día 1 y
la integración entra como un **adaptador enchufable** detrás de una interfaz
única:

```ts
interface WorkOrderSource {
  findByNumber(number: string): Promise<ExternalWorkOrder | null>
  listOpen(since: Date): Promise<ExternalWorkOrder[]>
}
```

Implementaciones, en orden de esfuerzo:

| # | Vía | Esfuerzo | Viabilidad |
|---|---|---|---|
| 1 | **Manual** — el asesor tipea el nro de OT | Nula | Funciona el día 1. Es el MVP |
| 2 | **Import CSV/Excel** — export periódico del DMS | Baja | Muy probable que se pueda |
| 3 | **Lectura read-only de la BD del DMS** — usuario o vista restringida | Media | Vía más común en la práctica. **Pedir esto primero.** Depende de si el DMS es on-premise y de qué diga el IT del grupo |
| 4 | **Interfaz oficial con Oversoft** | Alta (costo + plazo + terceros) | Requiere presupuesto y probablemente involucrar al grupo/terminal |

## El QR en la OT impresa

La idea original era que Oversoft imprimiera el QR directamente en la OT.

**Es técnicamente plausible** (modificar el formulario de impresión entra dentro
de su servicio de desarrollo a medida) **pero no es recomendable como camino
principal**: costo, plazo, y no lo controlás vos. Cada cambio futuro depende de
un tercero.

Alternativas, en orden de preferencia:

1. **Verificar si la OT impresa ya trae código de barras con el número.**
   Varios DMS lo hacen. Si es así: el lector lo lee, cero desarrollo, cero
   hardware extra. **Esto es lo primero a chequear con una OT real en la mano.**
2. **Etiqueta térmica impresa por GarageTick en recepción.** Imprimís una tira
   de 3: una va a la OT, una al llavero, una al pedido de repuestos. Queda mejor
   que la opción de Oversoft y es 100% tuyo.
3. Pedirle el QR a Oversoft. Solo si el cliente lo banca y no hay apuro.

## Fuentes

- [Oversoft — Quiénes somos](https://oversoft.com.ar/institucional/quienes-somos2)
- [Oversoft — Módulos](https://oversoft.com.ar/modulos)
- [Oversoft — Servicios](https://oversoft.net/servicios/)
- [Oversoft — Departamento de Consultoría](https://oversoft.com.ar/departamento03)
- [Oversoft DMS Business Intelligence](https://www.oversoft.com.ar/productos/oversoft-dms-business-intelligence)
- [Tecnom — Integración con Oversoft](https://tecnom.ai/blog/integracion-con-oversoft)
