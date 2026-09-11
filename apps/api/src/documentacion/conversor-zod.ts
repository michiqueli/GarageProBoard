import type { ConditionalSchemaConverter, JSONSchema, SchemaConvertOptions } from '@orpc/openapi'
import { z } from 'zod'

/**
 * Conversor de esquemas Zod a JSON Schema para el documento OpenAPI.
 *
 * Existe porque el `ZodToJsonSchemaConverter` de `@orpc/zod/zod4` descarta los
 * refinamientos: `chasis` sale como `string` a secas, sin el patrón, y `anio` pierde
 * el rango y hasta el `integer`. Zod 4 trae su propio `z.toJSONSchema()` que sí los
 * emite completos, así que delegamos en él.
 *
 * No es un detalle cosmético. El documento OpenAPI es lo único que va a tener quien
 * integre desde afuera — la app mobile, una terminal consultando garantías, el taller
 * que quiere volcar sus turnos. Un spec que dice «mandá un string» donde en realidad
 * hay que mandar `AB123CD` no documenta nada: traslada el trabajo de adivinar.
 */
export class ConversorZod implements ConditionalSchemaConverter {
  condition(schema: unknown): boolean {
    return esEsquemaZod(schema)
  }

  convert(schema: unknown, opciones: SchemaConvertOptions): [required: boolean, JSONSchema] {
    const esquema = schema as z.ZodType

    const json = z.toJSONSchema(esquema, {
      target: 'draft-2020-12',
      // 'input' describe lo que el cliente manda; 'output', lo que recibe. Con
      // coerciones y valores por defecto no son la misma forma.
      io: opciones.strategy,
      // Sin esto, un tipo que JSON Schema no sabe expresar hace fallar la generación
      // entera en vez de degradar ese campo solo.
      unrepresentable: 'any',
      cycles: 'ref',
      reused: 'inline',
    })

    // El generador arma el documento; el $schema de cada fragmento sobra.
    delete (json as { $schema?: unknown }).$schema

    // Requerido es lo que no acepta undefined: cubre optional y también default,
    // que sí acepta que no venga.
    const requerido = !esquema.safeParse(undefined).success

    // El casteo va por unknown por una discrepancia menor entre los dos tipos de
    // JSON Schema: zod declara $vocabulary como Record<string, boolean> (que es lo
    // que dice la especificación) y oRPC como Record<string, string>. Es un campo
    // que no usamos y que zod no emite.
    return [requerido, json as unknown as JSONSchema]
  }
}

/**
 * Se detecta por el protocolo Standard Schema y no con `instanceof z.ZodType`:
 * si en el árbol de dependencias hubiera dos copias de zod, el `instanceof` fallaría
 * en silencio y el spec saldría vacío sin que nadie se entere.
 */
function esEsquemaZod(schema: unknown): boolean {
  const posible = schema as { '~standard'?: { vendor?: string } } | null | undefined
  return posible?.['~standard']?.vendor === 'zod'
}
