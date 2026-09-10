export * from './puerto.ts'

/**
 * El adaptador sobre `@arcasdk/core` se implementa junto con el módulo de
 * facturación, no acá: sin certificados de homologación cargados no hay forma de
 * verificar que ande, y un adaptador que nadie probó contra AFIP es peor que
 * ninguno porque parece que funciona.
 *
 * Lo que sí queda fijado ahora es el puerto de `puerto.ts`, que es la decisión
 * arquitectónica: el resto del sistema depende de esa interfaz y nunca del SDK.
 */
