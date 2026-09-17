import { describe, expect, it } from 'vitest'
import {
  atajosParaSembrar,
  CATALOGO,
  catalogoPorAmbito,
  definicionDe,
  mostrarTecla,
  PANTALLAS,
  resolverAtajos,
  soloDiferencias,
  TECLAS_PROHIBIDAS,
  teclaDesdeEvento,
  validarAtajos,
} from '../src/atajos.ts'

describe('catálogo por omisión', () => {
  it('no tiene choques en ninguna pantalla', () => {
    // Éste es el test que importa de todos: si alguien agrega una acción nueva y le
    // pone una tecla que ya usa una global, se entera acá y no en producción.
    expect(validarAtajos({})).toEqual([])
  })

  it('cada acción tiene identificador único', () => {
    const ids = CATALOGO.map((d) => d.accion)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ninguna usa una tecla que el navegador se queda', () => {
    const enConflicto = CATALOGO.filter((d) => TECLAS_PROHIBIDAS.includes(d.porOmision))
    expect(enConflicto).toEqual([])
  })

  it('todas las pantallas tienen su verbo en F4', () => {
    // El verbo de la pantalla comparte tecla entre pantallas a propósito: nunca
    // coexisten, y así el operador aprende una sola posición.
    for (const pantalla of PANTALLAS) {
      const deLaPantalla = CATALOGO.filter((d) => d.ambito === pantalla)
      expect(
        deLaPantalla.some((d) => d.porOmision === 'F4'),
        `${pantalla} sin verbo en F4`,
      ).toBe(true)
    }
  })

  it('se agrupa para la pantalla de configuración', () => {
    const grupos = catalogoPorAmbito()
    expect(grupos[0]?.etiqueta).toBe('Generales')
    expect(grupos.map((g) => g.etiqueta)).toContain('Órdenes de trabajo')
    expect(grupos.every((g) => g.acciones.length > 0)).toBe(true)
  })
})

describe('resolución del mapa', () => {
  it('sin diferencias devuelve los valores por omisión', () => {
    expect(resolverAtajos({}, 'caja')['global.guardar']).toBe('F2')
    expect(resolverAtajos({}, 'caja')['caja.facturar']).toBe('F4')
  })

  it('sólo trae las acciones de la pantalla pedida', () => {
    const mapa = resolverAtajos({}, 'entregas')
    expect(mapa['entregas.entregar']).toBe('F4')
    expect(mapa['caja.facturar']).toBeUndefined()
  })

  it('aplica la diferencia del usuario', () => {
    expect(resolverAtajos({ 'global.guardar': 'F12' })['global.guardar']).toBe('F12')
  })

  it('ignora la diferencia sobre una acción estructural', () => {
    // Esc cancela siempre. Si un usuario se la saca sin querer, queda encerrado en
    // un diálogo sin entender por qué.
    expect(resolverAtajos({ 'global.cancelar': 'F7' })['global.cancelar']).toBe('Escape')
  })

  it('una acción agregada después le funciona a un usuario que ya existía', () => {
    // Con las diferencias de un usuario viejo, que no tiene fila para nada nuevo.
    const viejo = { 'global.buscar': 'Ctrl+B' }
    const mapa = resolverAtajos(viejo, 'repuestos')
    expect(mapa['global.buscar']).toBe('Ctrl+B')
    expect(mapa['repuestos.despachar']).toBe('F4')
  })
})

describe('validación', () => {
  it('rechaza las teclas que el navegador intercepta', () => {
    const problemas = validarAtajos({ 'global.guardar': 'F12' })
    expect(problemas[0]?.motivo).toMatch(/navegador/)
  })

  it('rechaza reasignar una acción estructural', () => {
    const problemas = validarAtajos({ 'global.cancelar': 'F7' })
    expect(problemas[0]?.motivo).toMatch(/tecla fija/)
  })

  it('rechaza una acción inexistente', () => {
    expect(validarAtajos({ 'taller.volar': 'F7' })[0]?.motivo).toMatch(/no existe/)
  })

  it('detecta el choque contra el valor por omisión de una global', () => {
    // El usuario nunca tocó "Imprimir", que está en F7, pero pone facturar ahí.
    const problemas = validarAtajos({ 'caja.facturar': 'F7' })
    expect(problemas.some((p) => /Imprimir/.test(p.motivo))).toBe(true)
  })

  it('permite que dos pantallas compartan una tecla', () => {
    const problemas = validarAtajos({
      'caja.cobrar': 'Alt+K',
      'entregas.checklist': 'Alt+K',
    })
    expect(problemas).toEqual([])
  })

  it('acepta un cambio sano', () => {
    expect(validarAtajos({ 'ordenes.fichar': 'Alt+F' })).toEqual([])
  })
})

describe('teclas y eventos', () => {
  it('normaliza los modificadores en orden fijo', () => {
    // Sin orden canónico, Alt+Ctrl+K y Ctrl+Alt+K serían dos teclas distintas y el
    // índice único de la base no serviría de nada.
    const evento = { key: 'k', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }
    expect(teclaDesdeEvento(evento)).toBe('Ctrl+Alt+K')
  })

  it('trata la tecla Windows como Ctrl', () => {
    const evento = { key: 'g', ctrlKey: false, altKey: false, shiftKey: false, metaKey: true }
    expect(teclaDesdeEvento(evento)).toBe('Ctrl+G')
  })

  it('conserva el nombre de las teclas especiales', () => {
    const evento = { key: 'F4', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }
    expect(teclaDesdeEvento(evento)).toBe('F4')
  })

  it('se muestra en castellano y con flechas', () => {
    expect(mostrarTecla('Alt+ArrowDown')).toBe('Alt + ↓')
    expect(mostrarTecla('Insert')).toBe('Ins')
    expect(mostrarTecla('Delete')).toBe('Supr')
  })
})

describe('sembrado al crear el usuario', () => {
  it('trae una fila por acción del catálogo', () => {
    const filas = atajosParaSembrar()
    expect(filas).toHaveLength(CATALOGO.length)
  })

  it('el ámbito coincide con el prefijo de la acción', () => {
    // La base tiene un CHECK que exige lo mismo: si esto se desincroniza, el
    // sembrado revienta al insertar.
    for (const fila of atajosParaSembrar()) {
      expect(fila.accion.startsWith(`${fila.ambito}.`), fila.accion).toBe(true)
    }
  })

  it('lo sembrado no dispara ninguna validación', () => {
    const diferencias = Object.fromEntries(atajosParaSembrar().map((f) => [f.accion, f.tecla]))
    // Las estructurales no se pueden reasignar ni siquiera a su propio valor.
    delete diferencias['global.cancelar']
    expect(validarAtajos(diferencias)).toEqual([])
  })
})

describe('de un mapa completo a las diferencias', () => {
  it('descarta todo lo que está en su valor de fábrica', () => {
    // Lo que la sesión trae es el catálogo entero sembrado: si se guardara así, el día que
    // cambiemos una tecla por omisión quedaría congelada en la base de cada usuario.
    const completo = Object.fromEntries(atajosParaSembrar().map((f) => [f.accion, f.tecla]))
    expect(soloDiferencias(completo)).toEqual({})
  })

  it('deja sólo lo que el usuario movió', () => {
    const completo = Object.fromEntries(atajosParaSembrar().map((f) => [f.accion, f.tecla]))
    const mapa = { ...completo, 'global.guardar': 'Ctrl+G' }
    expect(soloDiferencias(mapa)).toEqual({ 'global.guardar': 'Ctrl+G' })
  })

  it('descarta las no reasignables aunque vengan con otra tecla', () => {
    // Esc no es del usuario. Si se colara acá, la API la rechazaría con un error que la
    // pantalla no puede explicar, porque nadie la eligió.
    expect(soloDiferencias({ 'global.cancelar': 'F7' })).toEqual({})
  })

  it('ignora una acción que ya no existe en el catálogo', () => {
    // Un mapa guardado antes de sacar una pantalla: se deja pasar en silencio, porque el
    // usuario no tiene nada que arreglar.
    expect(soloDiferencias({ 'entregas.loQueSea': 'Ctrl+K' })).toEqual({})
  })

  it('lo que sale de acá siempre pasa la validación, si el mapa era válido', () => {
    const completo = Object.fromEntries(atajosParaSembrar().map((f) => [f.accion, f.tecla]))
    expect(validarAtajos(soloDiferencias(completo))).toEqual([])
  })
})

describe('la definición de una acción', () => {
  it('se encuentra por su identificador', () => {
    expect(definicionDe('caja.facturar')?.etiqueta).toBe('Facturar')
  })

  it('no existe la que no está en el catálogo', () => {
    expect(definicionDe('caja.inventada')).toBeUndefined()
  })
})
