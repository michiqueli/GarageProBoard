# El catálogo de services

Qué es un service para el taller, cómo se carga y cómo llega a una orden. Desde el 08/11/2026.

## Qué es

Un service es **«10.000 km de la Kangoo»**: unos trabajos, unos repuestos y cuánto debería llevar.
Se define por marca, modelo y nombre. Sin marca es **genérico** y se ofrece para cualquier auto.

- **La orden copia los renglones.** Cambiar el catálogo no le cambia nada a un auto que ya se
  recibió. Por eso reimportar reemplaza sin miedo, y por eso no hay baja: uno que no se usa se apaga.
- **El precio de una pieza de Repuestos es el de ese día**, no el del día que se importó. Sí se
  guardan el precio de los trabajos y el de los repuestos que no están en el catálogo.
- **El tiempo va por renglón de trabajo**, en minutos. La orden lo guarda en `minutos_estipulados`
  y suma lo que no se rechazó: eso es contra lo que se compara la mano de obra.

## Dónde se configura

Taller → Catálogo de services. Verlo es `ver Orden`, como el resto del taller; cargarlo e
importarlo es `configurar Orden`, igual que los motivos de espera.

## El wizard de importación

Tres pasos en `/taller/services/importar`, y **no se guarda nada hasta el final**:

1. **La plantilla**, en Excel o CSV. La de Excel deja el ejemplo en otra hoja: con el ejemplo en la
   primera, lo que alguien se olvida de borrar se importa como un service de verdad.
2. **El archivo**: `.xlsx` o `.csv`, hasta 3.000 filas. Los títulos de la primera fila mandan y
   aceptan variantes («Km», «Código de repuesto»); si falta una obligatoria se dice cuál, y las
   columnas que no se usan se avisan. El CSV se lee en UTF-8 o en Windows-1252, que es como lo
   guarda Excel en castellano.
3. **El preview**: cada celda se edita ahí mismo.

La planilla tiene una fila por renglón, y las filas con igual marca, modelo y service son el mismo
service.

### Errores y avisos

| | Qué es | Ejemplos |
| --- | --- | --- |
| **Error** | Frena la importación entera | Falta el service, un tipo que no existe, minutos con decimales, dos filas del mismo service con kilómetros distintos, un código desconocido sin descripción |
| **Aviso** | Se puede importar igual | Repuesto sin código o que no está en Repuestos (va como texto y no descuenta stock), trabajo sin tiempo, precio ignorado porque manda el de Repuestos |

**Es todo o nada.** Importar a medias deja un catálogo que nadie sabe qué tiene.

La validación de formato vive en `@gpb/core` (`erroresDeFilas`) y la corren los dos lados: el
navegador para marcar el error al tipear, y la API porque no le cree al navegador. Lo que necesita
mirar la base —si el código existe, si el service ya estaba— lo contesta `previsualizar`, que
espera a que se deje de tipear y no guarda nada. `importar` vuelve a validar todo.

Un service que ya estaba **se reemplaza entero** y queda prendido; el preview lo dice antes.

## Los números de una planilla

`numeroDeHoja` entiende «1.234,50» y «1,234.50». «1.500» son mil quinientos, porque acá el punto
separa miles. Por eso las celdas numéricas de Excel se pasan a texto **con coma**: un `1.234` en
una celda numérica es uno coma doscientos treinta y cuatro.

## Auditoría

`service_catalogo` se audita; sus renglones no, porque importar serían miles de filas de ruido. Cada
service importado queda anotado con quién y cuándo.

## En la orden

En Trabajos y repuestos, «Cargar un service» ofrece los de la marca del auto y los genéricos. Suma
los renglones sin guardar, para revisarlos antes, y los repuestos del catálogo descuentan stock al
guardar, como cualquier otro. En Tiempos de taller aparece lo estipulado al lado de la mano de obra,
resaltada si se pasó.

## Lo que queda

- Comparar lo estipulado con lo real en el tablero del piso.
- Sumarlo en la recepción: hoy se carga desde la ficha de la orden.
