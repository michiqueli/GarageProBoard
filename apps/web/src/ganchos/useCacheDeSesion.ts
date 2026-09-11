import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

/**
 * Tira la caché de consultas cuando cambia quién está usando el sistema.
 *
 * Sin esto, cerrar sesión y entrar con otro usuario muestra los datos del anterior
 * hasta que las consultas se refresquen — y con `staleTime` de treinta segundos, eso es
 * medio minuto de una pantalla mostrando información de otra concesionaria.
 *
 * No es un problema teórico: la computadora del mostrador es compartida y el cambio de
 * turno es exactamente este caso. Aunque el servidor nunca entregue un dato ajeno, una
 * pantalla que lo muestra por caché **parece** una fuga, y el que la ve no tiene forma
 * de distinguir una cosa de la otra.
 *
 * Va acá, en un solo lugar, y no como una clave de consulta por pantalla: así una
 * pantalla nueva queda cubierta sin que nadie se acuerde de nada.
 */
export function useCacheDeSesion(usuarioId: string | undefined): void {
  const consultas = useQueryClient()
  const anterior = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (anterior.current !== undefined && anterior.current !== usuarioId) {
      consultas.clear()
    }
    anterior.current = usuarioId
  }, [usuarioId, consultas])
}
