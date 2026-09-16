import {
  dependenciasRotas,
  describirDependencia,
  ETIQUETA_MODULO,
  MODULOS,
  type Modulo,
} from '@garagepro/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { api, mensajeDe } from '../cliente.ts'
import { Aviso, Boton, Campo } from '../componentes.tsx'

/**
 * Las condiciones frente al IVA que puede tener una concesionaria. No todo el catálogo
 * de AFIP: nadie da de alta una concesionaria «Consumidor final» ni «Cliente del
 * exterior». El servidor valida el código contra el catálogo igual.
 */
const CONDICIONES_IVA = [
  { codigo: 1, descripcion: 'Responsable Inscripto' },
  { codigo: 6, descripcion: 'Monotributo' },
  { codigo: 4, descripcion: 'Exento' },
] as const

export function PantallaNueva() {
  const cache = useQueryClient()
  const [datos, setDatos] = useState({
    nombre: '',
    slug: '',
    razonSocial: '',
    cuit: '',
    condicionIva: 1,
    sucursal: 'Casa Central',
    email: '',
    nombreGerente: '',
    apellidoGerente: '',
  })
  // El núcleo marcado de entrada: sin él no funciona ningún otro.
  const [modulos, setModulos] = useState<Set<Modulo>>(new Set(['nucleo']))

  const campo = (clave: keyof typeof datos) => ({
    value: String(datos[clave]),
    onChange: (e: { target: { value: string } }) =>
      setDatos((d) => ({ ...d, [clave]: e.target.value })),
  })

  // Se avisa mientras se elige, no al enviar: el servidor lo rechazaría igual, pero
  // enterarse después de completar todo el formulario es peor.
  const rotas = dependenciasRotas(modulos)

  const crear = useMutation({
    mutationFn: () =>
      api.concesionarias.crear({
        nombre: datos.nombre,
        slug: datos.slug,
        modulos: MODULOS.filter((m) => modulos.has(m)),
        empresa: {
          razonSocial: datos.razonSocial,
          cuit: datos.cuit.replaceAll('-', ''),
          condicionIva: Number(datos.condicionIva),
        },
        sucursal: datos.sucursal,
        gerente: {
          email: datos.email,
          nombre: datos.nombreGerente,
          apellido: datos.apellidoGerente,
        },
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['backoffice', 'concesionarias'] }),
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    crear.mutate()
  }

  if (crear.data) {
    const { concesionaria, passwordInicial } = crear.data
    return (
      <section className="grid max-w-lg gap-3 rounded-base border border-ok bg-superficie p-4">
        <h1 className="font-display text-lg font-semibold">
          {concesionaria.nombre} ya está dada de alta
        </h1>
        <p className="text-dato text-texto-suave">
          El gerente entra con <b className="text-texto">{datos.email.toLowerCase()}</b> y esta
          contraseña. Pasásela por un canal aparte del correo:
        </p>
        <output className="rounded-base border border-borde bg-superficie-2 px-3 py-2 font-mono text-ui select-all">
          {passwordInicial}
        </output>
        <Aviso tono="critico">No se vuelve a mostrar. Si se pierde, hay que generar otra.</Aviso>
        <div className="flex gap-2">
          <Boton onClick={() => navigator.clipboard?.writeText(passwordInicial)}>
            Copiar contraseña
          </Boton>
          <Link
            to="/concesionarias/$id"
            params={{ id: concesionaria.id }}
            className="flex h-campo items-center rounded-base border border-marca bg-marca-suave px-3 text-dato font-semibold text-marca"
          >
            Ver la concesionaria
          </Link>
        </div>
      </section>
    )
  }

  return (
    <form onSubmit={enviar} className="grid max-w-2xl gap-5">
      <h1 className="font-display text-lg font-semibold">Nueva concesionaria</h1>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-etiqueta font-semibold text-texto-suave uppercase">
          La concesionaria
        </legend>
        <Campo etiqueta="Nombre" required {...campo('nombre')} />
        <Campo
          etiqueta="Identificador"
          ayuda="Minúsculas, números y guiones: automotores-litoral"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          {...campo('slug')}
        />
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-etiqueta font-semibold text-texto-suave uppercase">
          Módulos contratados
        </legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {MODULOS.map((m) => (
            <label key={m} className="flex h-campo items-center gap-2 text-dato">
              <input
                type="checkbox"
                checked={modulos.has(m)}
                onChange={(e) =>
                  setModulos((actuales) => {
                    const nuevos = new Set(actuales)
                    if (e.target.checked) nuevos.add(m)
                    else nuevos.delete(m)
                    return nuevos
                  })
                }
                className="accent-marca"
              />
              {ETIQUETA_MODULO[m]}
            </label>
          ))}
        </div>
        {rotas.length > 0 && (
          <Aviso tono="critico">{rotas.map(describirDependencia).join('; ')}.</Aviso>
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-etiqueta font-semibold text-texto-suave uppercase">
          Primera razón social y sucursal
        </legend>
        <Campo etiqueta="Razón social" required {...campo('razonSocial')} />
        <Campo
          etiqueta="CUIT"
          ayuda="11 dígitos; los guiones se sacan solos"
          required
          inputMode="numeric"
          {...campo('cuit')}
        />
        <label className="grid gap-1">
          <span className="text-etiqueta font-medium text-texto-suave">
            Condición frente al IVA
          </span>
          <select
            {...campo('condicionIva')}
            className="h-campo rounded-base border border-borde bg-superficie-2 px-2 text-dato text-texto"
          >
            {CONDICIONES_IVA.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.descripcion}
              </option>
            ))}
          </select>
        </label>
        <Campo etiqueta="Sucursal" required {...campo('sucursal')} />
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-etiqueta font-semibold text-texto-suave uppercase">
          Gerente
        </legend>
        <Campo etiqueta="Correo" type="email" required {...campo('email')} />
        <span className="hidden sm:block" />
        <Campo etiqueta="Nombre" required {...campo('nombreGerente')} />
        <Campo etiqueta="Apellido" required {...campo('apellidoGerente')} />
      </fieldset>

      {crear.isError && <Aviso tono="critico">{mensajeDe(crear.error)}</Aviso>}

      <div className="flex gap-2">
        <Boton type="submit" variante="principal" disabled={crear.isPending || rotas.length > 0}>
          {crear.isPending ? 'Dando de alta…' : 'Dar de alta'}
        </Boton>
        <Link
          to="/"
          className="flex h-campo items-center rounded-base border border-borde px-3 text-dato text-texto-suave hover:text-texto"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
