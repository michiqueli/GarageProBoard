import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { Campo } from './Campo.tsx'

type PorProvincia = Record<string, string[]>

/**
 * La localidad, con las de la provincia elegida como sugerencia. Sugiere y no obliga: si no
 * está en la lista, se escribe igual.
 *
 * El listado es el oficial de Georef (datos.gob.ar), guardado con la aplicación: no depende de
 * que ese servicio ande. Se baja recién cuando se abre un domicilio. Se actualiza con
 * `apps/web/scripts/localidades.mjs`.
 */
export function CampoLocalidad({
  provinciaCodigo,
  value,
  onChange,
}: {
  provinciaCodigo: number | null
  value: string
  onChange: (valor: string) => void
}) {
  const id = useId()
  const listado = useQuery({
    queryKey: ['localidades'],
    queryFn: async () => (await import('../datos/localidades.json')).default as PorProvincia,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const opciones = provinciaCodigo === null ? [] : (listado.data?.[provinciaCodigo] ?? [])

  return (
    <>
      <Campo
        etiqueta="Localidad"
        list={opciones.length ? id : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        ayuda={
          provinciaCodigo === null ? 'Elegí la provincia y te sugiere sus localidades' : undefined
        }
      />
      {opciones.length > 0 && (
        <datalist id={id}>
          {opciones.map((nombre) => (
            <option key={nombre} value={nombre} />
          ))}
        </datalist>
      )}
    </>
  )
}
