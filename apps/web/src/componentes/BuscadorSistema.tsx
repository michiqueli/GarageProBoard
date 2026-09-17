import { contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  type FocusEvent,
  type KeyboardEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { buscarEnIndice, entradasDeCertificados, indiceEstatico } from '../indice.ts'
import { usarSesion } from '../sesion/almacen.ts'
import { api } from '../sesion/cliente.ts'
import { useAutorizacion, usePuedeUsar } from '../sesion/permisos.ts'
import { useAtajo, useTeclado } from '../teclado/index.ts'
import { Tecla } from './Tecla.tsx'

const MAXIMO = 8

/**
 * El buscador del sistema, en la barra lateral (`F10`): pantallas, acciones y
 * configuraciones. Escribir «afip» lista todos los lugares donde AFIP tiene que ver;
 * «certificados», el certificado de cada razón social. Resuelve la pregunta más frecuente
 * de un sistema grande: *¿dónde estaba esto?*
 *
 * No confundir con el del encabezado (`F3`), que busca **datos**: patentes, clientes.
 */
/** 22rem: lo que ocupa la lista cuando hay lugar. */
const ANCHO_PANEL = 352

export function BuscadorSistema() {
  const { teclaDe } = useTeclado()
  const autorizacion = useAutorizacion()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeCertificados = usePuedeUsar(contrato.certificados.estado)
  const puedeEmpresas = usePuedeUsar(contrato.organizacion.listar)

  const campo = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLUListElement>(null)
  const volverA = useRef<HTMLElement | null>(null)
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)

  useAtajo('global.paletaComandos', () => {
    if (document.activeElement !== campo.current) {
      volverA.current = document.activeElement as HTMLElement | null
    }
    campo.current?.focus()
    campo.current?.select()
  })

  // Las razones sociales, para ofrecer el certificado de cada una. Es la misma consulta
  // que la pantalla de Empresas: si ya se abrió, no se vuelve a pedir.
  const empresas = useQuery({
    queryKey: ['empresas', tenantId],
    queryFn: () => api.organizacion.listar(),
    enabled: abierto && puedeCertificados && puedeEmpresas,
    staleTime: 60_000,
  })

  const resultados = useMemo(() => {
    const entradas = [...indiceEstatico(), ...entradasDeCertificados(empresas.data?.datos ?? [])]
    return buscarEnIndice(entradas, texto, autorizacion).slice(0, MAXIMO)
  }, [texto, autorizacion, empresas.data])

  const mostrar = abierto && texto.trim().length > 0

  // La lista va fija a la pantalla, al lado del campo: la barra lateral scrollea, y una
  // lista posicionada adentro quedaría recortada por ella.
  const caja = useRef<HTMLLabelElement>(null)
  const [posicion, setPosicion] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )
  useLayoutEffect(() => {
    if (!mostrar) return
    const ubicar = () => {
      const r = caja.current?.getBoundingClientRect()
      if (!r) return
      const ancho = Math.min(ANCHO_PANEL, window.innerWidth - 16)
      // Al costado del campo si entra; si no —en el teléfono—, abajo y adentro de la pantalla.
      setPosicion(
        r.right + 8 + ancho <= window.innerWidth
          ? { top: r.top, left: r.right + 8, width: ancho }
          : {
              top: r.bottom + 4,
              left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
              width: ancho,
            },
      )
    }
    ubicar()
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', ubicar, true)
    return () => {
      window.removeEventListener('resize', ubicar)
      window.removeEventListener('scroll', ubicar, true)
    }
  }, [mostrar])

  function cerrar() {
    setAbierto(false)
    setTexto('')
    const destino = volverA.current
    volverA.current = null
    if (destino?.isConnected) destino.focus()
    else campo.current?.blur()
  }

  function opciones() {
    return [...(panel.current?.querySelectorAll<HTMLElement>('[data-opcion]') ?? [])]
  }

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Que no llegue a los atajos de la pantalla: Esc cerraría un formulario abierto.
      e.stopPropagation()
      e.preventDefault()
      cerrar()
      return
    }
    const todas = opciones()
    const actual = todas.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Enter' && e.target === campo.current) {
      e.preventDefault()
      // El primero viene elegido: escribir y Enter alcanza.
      todas[0]?.click()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAbierto(true)
      todas[Math.min(actual + 1, todas.length - 1)]?.focus()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (actual <= 0) campo.current?.focus()
      else todas[actual - 1]?.focus()
    }
  }

  function alSalir(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAbierto(false)
  }

  function elegido() {
    setAbierto(false)
    setTexto('')
    volverA.current = null
  }

  const tecla = teclaDe('global.paletaComandos')

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: el contenedor sólo reparte flechas y Esc entre el campo y los resultados
    <div className="relative px-0.5 pb-3" onKeyDown={alTeclear} onBlur={alSalir}>
      <label
        ref={caja}
        className="flex h-campo items-center gap-2 rounded-base border border-borde bg-superficie-2 px-2 focus-within:border-marca"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="shrink-0 text-texto-tenue"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          ref={campo}
          type="search"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          aria-label="Buscar pantallas y configuraciones"
          aria-expanded={mostrar}
          aria-controls="resultados-sistema"
          role="combobox"
          placeholder="Ir a…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-dato outline-none placeholder:text-texto-tenue [&::-webkit-search-cancel-button]:hidden"
        />
        {tecla && <Tecla tecla={tecla} />}
      </label>

      {mostrar && (
        <ul
          ref={panel}
          id="resultados-sistema"
          aria-label="Lugares del sistema"
          style={posicion ?? undefined}
          className="fixed z-[60] grid animate-emerger gap-px overflow-hidden rounded-base border border-borde bg-superficie py-1 shadow-flotante"
        >
          {resultados.length === 0 && (
            <li className="px-3 py-2 text-dato text-texto-suave">
              Nada coincide con «{texto.trim()}». Probá con otra palabra: «afip», «usuarios»,
              «permisos».
            </li>
          )}
          {resultados.map((r) => (
            <li key={r.id}>
              {r.destino ? (
                <Link
                  data-opcion
                  to={r.destino.to}
                  params={r.destino.params as never}
                  search={r.destino.search as never}
                  onClick={elegido}
                  className="grid gap-0.5 px-3 py-1.5 hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none"
                >
                  <span className="text-dato text-texto">{r.titulo}</span>
                  <span className="text-etiqueta text-texto-tenue">{r.donde}</span>
                </Link>
              ) : (
                <span
                  data-opcion
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: se recorre con las flechas aunque no navegue, para leer dónde va a estar
                  tabIndex={0}
                  aria-disabled="true"
                  className="grid gap-0.5 px-3 py-1.5 opacity-60 focus-visible:bg-superficie-2 focus-visible:outline-none"
                >
                  <span className="text-dato text-texto">{r.titulo}</span>
                  <span className="text-etiqueta text-texto-tenue">
                    Todavía no está disponible · va a estar en {r.donde}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
