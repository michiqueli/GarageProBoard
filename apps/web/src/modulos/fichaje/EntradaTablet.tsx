import { leerQr } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { LectorQr } from '../../componentes/LectorQr.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { apiEstacion } from './estacion.ts'
import { beepError, beepOk } from './sonido.ts'

/** Lo que queda a la vista el motivo de un rechazo, antes de volver a esperar una tarjeta. */
const MS_RECHAZO = 5_000

/**
 * La tablet de recepción, sin nadie adentro: «Pasá tu credencial».
 *
 * Es la puerta de la recepción en tablet (`docs/tecnicos/recepcion-en-tablet.md`): la tablet
 * ya está registrada como estación, y la persona entra con la misma credencial con la que
 * ficha, por la cámara o por un lector. Sin teclado, y sin un cliente esperando a que alguien
 * termine de tipear una contraseña.
 */
export function EntradaTablet({
  estacion,
}: {
  estacion: { nombre: string; concesionaria: string }
}) {
  const navegar = useNavigate()
  const entrarConDatos = usarSesion((e) => e.entrar)
  const [estado, setEstado] = useState<
    { fase: 'esperando' } | { fase: 'entrando' } | { fase: 'rechazo'; texto: string }
  >({ fase: 'esperando' })
  const ocupado = useRef(false)

  async function probar(codigo: string) {
    if (ocupado.current) return
    ocupado.current = true
    setEstado({ fase: 'entrando' })
    try {
      const datos = await apiEstacion.auth.entrarConCredencial({ codigo })
      beepOk()
      entrarConDatos(datos)
      await navegar({ to: '/recepcion', replace: true })
    } catch (error) {
      beepError()
      setEstado({
        fase: 'rechazo',
        texto:
          error instanceof ORPCError
            ? error.message
            : 'Sin conexión con el servidor. Probá de nuevo en un momento.',
      })
      setTimeout(() => {
        ocupado.current = false
        setEstado({ fase: 'esperando' })
      }, MS_RECHAZO)
    }
  }

  // El lector de tarjetas tipea el código y manda Enter, como un teclado.
  const probarRef = useRef(probar)
  probarRef.current = probar
  useEffect(() => {
    let buffer = ''
    function alPresionar(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        const leido = buffer.trim()
        buffer = ''
        if (leerQr(leido)) void probarRef.current(leido)
        return
      }
      if (e.key.length === 1) buffer = (buffer + e.key).slice(-64)
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [])

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-fondo text-texto">
      <header className="flex items-baseline justify-between px-8 py-6 text-[1.05rem] text-texto-tenue">
        <span>{estacion.nombre}</span>
        <span>{estacion.concesionaria}</span>
      </header>

      <section className="grid content-center justify-items-center gap-6 px-8 text-center">
        <h1 className="text-[clamp(1.8rem,5vw,3rem)] leading-tight font-semibold">
          {estado.fase === 'entrando' ? 'Entrando…' : 'Pasá tu credencial'}
        </h1>
        {estado.fase === 'rechazo' ? (
          <p role="alert" className="max-w-xl text-[clamp(1.1rem,3vw,1.6rem)] text-critico">
            {estado.texto}
          </p>
        ) : (
          <p className="text-[1.1rem] text-texto-suave">
            Acercá el código de tu tarjeta a la cámara.
          </p>
        )}
        <LectorQr activo={estado.fase === 'esperando'} alLeer={(texto) => void probar(texto)} />
      </section>

      <footer className="px-8 py-6 text-center">
        <Link to="/entrar" className="text-dato text-texto-tenue underline">
          Entrar con correo y contraseña
        </Link>
      </footer>
    </main>
  )
}
