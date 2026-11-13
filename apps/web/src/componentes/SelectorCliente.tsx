import { contrato } from '@gpb/contracts'
import { cuitValido, formatearCuit, normalizarCuit } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useQuery } from '@tanstack/react-query'
import { type KeyboardEvent, useId, useRef, useState } from 'react'
import { Formulario, type TipoDocumento } from '../modulos/clientes/PantallaClientes.tsx'
import { usarSesion } from '../sesion/almacen.ts'
import { api } from '../sesion/cliente.ts'
import { usePuedeUsar } from '../sesion/permisos.ts'
import { Modal } from './Modal.tsx'

export interface ClienteElegido {
  id: string
  razonSocial: string
}

/** Lo tipeado, si es un CUIT o un DNI que se puede buscar en AFIP. */
function documentoDe(texto: string): { tipo: TipoDocumento; numero: string } | null {
  if (!/^[0-9.\s-]+$/.test(texto)) return null
  const numero = normalizarCuit(texto)
  if (/^[0-9]{7,8}$/.test(numero)) return { tipo: 96, numero }
  if (cuitValido(numero)) return { tipo: /^2[0347]/.test(numero) ? 86 : 80, numero }
  return null
}

/**
 * Elegir un cliente escribiendo su nombre, CUIT o DNI.
 *
 * Si no es cliente y lo tipeado es un CUIT o un DNI, lo busca en AFIP (constancia de inscripción
 * y padrón) y ofrece darlo de alta ahí mismo, en un modal con los datos ya completados.
 *
 * Todo con teclado: se escribe, `↓` baja a los resultados, `↑` y `↓` los recorren y
 * `Enter` elige. Busca desde la segunda letra: con una sola, la lista es la base entera.
 */
export function SelectorCliente({
  etiqueta,
  valor,
  onChange,
  autoFocus = false,
}: {
  etiqueta: string
  valor: ClienteElegido | null
  onChange: (cliente: ClienteElegido | null) => void
  autoFocus?: boolean
}) {
  const id = useId()
  const [buscar, setBuscar] = useState('')
  const lista = useRef<HTMLUListElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.clientes.listar)
  const puedeCrear = usePuedeUsar(contrato.clientes.crear)
  const [alta, setAlta] = useState(false)
  const texto = buscar.trim()
  const documento = documentoDe(texto)

  const consulta = useQuery({
    queryKey: ['clientes', tenantId, texto, 'activos', 'selector'],
    queryFn: () =>
      api.clientes.listar({ pagina: 1, porPagina: 8, buscar: texto, estado: 'activos' }),
    enabled: puedeVer && !valor && texto.length >= 2,
  })
  const noEsCliente = consulta.data?.datos.length === 0
  const afip = useQuery({
    queryKey: ['padron', documento?.numero],
    queryFn: () =>
      documento?.tipo === 96
        ? api.padron.porDocumento({ dni: documento.numero })
        : api.padron.consultar({ cuit: documento?.numero as string }),
    enabled: puedeCrear && !valor && noEsCliente && documento !== null,
    retry: false,
    staleTime: 10 * 60_000,
  })
  const catalogos = useQuery({
    queryKey: ['catalogos', 'organizacion'],
    queryFn: () => api.organizacion.catalogos(),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: alta,
  })

  if (!puedeVer) {
    return (
      <div className="grid gap-1">
        <span className="text-etiqueta font-medium text-texto-suave">{etiqueta}</span>
        <span className="text-etiqueta text-texto-tenue">
          Para elegir un cliente hace falta permiso para ver clientes.
        </span>
      </div>
    )
  }

  if (valor) {
    return (
      <div className="grid gap-1">
        <span className="text-etiqueta font-medium text-texto-suave">{etiqueta}</span>
        <div className="flex h-campo items-center gap-2 rounded-base border border-borde bg-superficie-2 px-2.5 text-dato">
          <span className="truncate">{valor.razonSocial}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setBuscar('')
              // Al cambiar, el foco vuelve al campo: si no, quedaría en un botón que ya no está.
              requestAnimationFrame(() => campo.current?.focus())
            }}
            className="ml-auto text-etiqueta text-marca hover:underline"
          >
            Cambiar
          </button>
        </div>
      </div>
    )
  }

  function botones() {
    return [...(lista.current?.querySelectorAll('button') ?? [])]
  }

  function moverDesdeCampo(e: KeyboardEvent<HTMLInputElement>) {
    // Adentro de un formulario, Enter lo mandaría a medio cargar: acá elige el primero.
    if (e.key === 'Enter') {
      e.preventDefault()
      const primero = consulta.data?.datos[0]
      if (primero) onChange({ id: primero.id, razonSocial: primero.razonSocial })
      else if (noEsCliente && puedeCrear) setAlta(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      botones()[0]?.focus()
    }
  }

  function moverEnLista(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const todos = botones()
    const actual = todos.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowUp' && actual <= 0) {
      campo.current?.focus()
      return
    }
    todos[actual + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
  }

  const resultados = consulta.data?.datos ?? []

  return (
    <div className="relative grid gap-1">
      <label htmlFor={id} className="text-etiqueta font-medium text-texto-suave">
        {etiqueta}
      </label>
      <input
        id={id}
        ref={campo}
        // biome-ignore lint/a11y/noAutofocus: el selector se abre a pedido y el foco tiene que caer acá
        autoFocus={autoFocus}
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        onKeyDown={moverDesdeCampo}
        placeholder="Nombre, CUIT o DNI"
        autoComplete="off"
        className="h-campo rounded-base border border-borde bg-superficie-2 px-2.5 text-dato text-texto outline-none placeholder:text-texto-tenue focus-visible:border-marca"
      />
      {texto.length >= 2 && consulta.data && (
        <ul
          ref={lista}
          aria-label={`Clientes que coinciden con ${texto}`}
          onKeyDown={moverEnLista}
          className="grid divide-y divide-borde-suave overflow-hidden rounded-base border border-borde bg-superficie"
        >
          {resultados.length === 0 && !puedeCrear && (
            <li className="px-2.5 py-2 text-etiqueta text-texto-suave">
              Ningún cliente coincide con «{texto}». Si es nuevo, hay que darlo de alta en Clientes.
            </li>
          )}
          {resultados.length === 0 && puedeCrear && (
            <li className="grid gap-1.5 px-2.5 py-2">
              <span className="text-etiqueta text-texto-suave">
                {!documento
                  ? `Ningún cliente coincide con «${texto}».`
                  : afip.isPending
                    ? 'No es cliente. Buscándolo en AFIP…'
                    : afip.data
                      ? 'No es cliente. En AFIP figura como:'
                      : afip.error instanceof ORPCError
                        ? `No es cliente. ${afip.error.message}`
                        : 'No es cliente, y AFIP no contestó.'}
              </span>
              {afip.data && (
                <span className="text-dato">
                  <b>{afip.data.razonSocial}</b>{' '}
                  <span className="font-mono text-etiqueta text-texto-tenue">
                    {formatearCuit(afip.data.cuit)}
                  </span>
                  {!afip.data.activo && (
                    <span className="ml-2 text-etiqueta text-atencion">inactivo en AFIP</span>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={() => setAlta(true)}
                className="w-fit text-etiqueta font-medium text-marca hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {afip.data ? 'Darlo de alta con estos datos' : 'Dar de alta un cliente nuevo'}
              </button>
            </li>
          )}
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChange({ id: c.id, razonSocial: c.razonSocial })}
                className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-dato hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none"
              >
                {c.razonSocial}
                <span className="ml-auto font-mono text-etiqueta text-texto-tenue">
                  {c.tipoDocumento === 96 ? c.numeroDocumento : formatearCuit(c.numeroDocumento)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {alta && catalogos.data && (
        <Modal titulo="Nuevo cliente" onCerrar={() => setAlta(false)}>
          <Formulario
            cliente={undefined}
            catalogos={catalogos.data}
            alTerminar={() => setAlta(false)}
            inicial={
              documento
                ? {
                    tipoDocumento: documento.tipo,
                    numero:
                      documento.tipo === 96 ? documento.numero : formatearCuit(documento.numero),
                    afip: afip.data,
                  }
                : undefined
            }
            alCrear={(c) => {
              setAlta(false)
              onChange(c)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
