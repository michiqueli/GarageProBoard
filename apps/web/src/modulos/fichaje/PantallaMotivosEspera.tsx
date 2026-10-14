import { accesoDeRuta, contrato } from '@gpb/contracts'
import { MAXIMO_NOMBRE_MOTIVO } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmar, preguntar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoAgregar, IconoEditar } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

type Listado = Awaited<ReturnType<typeof api.motivosEspera.listar>>
type Motivo = Listado['datos'][number]

const validarNombre = (v: string) =>
  !v.trim()
    ? 'Escribí por qué espera el auto'
    : v.trim().length > MAXIMO_NOMBRE_MOTIVO
      ? `El nombre es corto: hasta ${MAXIMO_NOMBRE_MOTIVO} letras`
      : null

/**
 * Por qué puede estar parado un auto en el taller. Ver
 * `docs/tecnicos/taller-control-de-tiempos.md`.
 *
 * Vienen los del sistema, y cada taller **apaga los que no usa y agrega los suyos**. No se
 * borran: uno apagado deja de ofrecerse al poner un auto en espera, pero las esperas que lo
 * usaron lo siguen mostrando.
 */
export function PantallaMotivosEspera() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeConfigurar = usePuedeUsar(contrato.motivosEspera.crear)
  const cache = useQueryClient()
  const clave = ['motivos-espera', tenantId]

  const listado = useQuery({ queryKey: clave, queryFn: () => api.motivosEspera.listar() })
  const poner = (datos: Listado) => cache.setQueryData(clave, datos)

  const crear = useMutation({
    mutationFn: (nombre: string) => api.motivosEspera.crear({ nombre }),
    onSuccess: poner,
    meta: { exito: 'Motivo agregado', error: mensajeGeneral },
  })
  const editar = useMutation({
    mutationFn: async (v: { id: string; nombre: string; activo: boolean; aviso: string }) => ({
      datos: await api.motivosEspera.editar({ id: v.id, nombre: v.nombre, activo: v.activo }),
      aviso: v.aviso,
    }),
    onSuccess: (r) => poner(r.datos),
    meta: { exito: (r) => (r as { aviso: string }).aviso, error: mensajeGeneral },
  })
  const ocupado = crear.isPending || editar.isPending

  async function agregar() {
    const nombre = await preguntar({
      titulo: '¿Por qué más puede esperar un auto?',
      texto: 'Va al final de la lista.',
      confirmar: 'Agregar',
      campo: { etiqueta: 'Motivo', valor: '', validar: validarNombre },
    })
    if (nombre) crear.mutate(nombre.trim())
  }

  async function renombrar(m: Motivo) {
    const nombre = await preguntar({
      titulo: `¿Cómo se llama «${m.nombre}»?`,
      texto: 'Las esperas que ya lo usaron lo muestran con el nombre nuevo.',
      confirmar: 'Cambiar el nombre',
      campo: { etiqueta: 'Motivo', valor: m.nombre, validar: validarNombre },
    })
    if (nombre && nombre.trim() !== m.nombre) {
      editar.mutate({ id: m.id, nombre: nombre.trim(), activo: m.activo, aviso: 'Nombre cambiado' })
    }
  }

  async function prenderOApagar(m: Motivo) {
    if (
      m.activo &&
      !(await confirmar({
        titulo: `¿Dejar de usar «${m.nombre}»?`,
        texto:
          'No se ofrece más al poner un auto en espera. Las esperas que ya lo usaron lo siguen ' +
          'mostrando, y lo podés volver a prender cuando quieras.',
        confirmar: 'Dejar de usarlo',
        peligro: true,
      }))
    ) {
      return
    }
    editar.mutate({
      id: m.id,
      nombre: m.nombre,
      activo: !m.activo,
      aviso: m.activo ? 'El motivo dejó de usarse' : 'El motivo vuelve a usarse',
    })
  }

  return (
    <Shell titulo="Motivos de espera" requiere={accesoDeRuta(contrato.motivosEspera.listar)}>
      <p className="max-w-3xl text-dato text-texto-suave">
        Por qué puede estar parado un auto. Con ellos el tablero y la orden explican el tiempo
        muerto: lo que estuvo en el taller sin que nadie lo trabajara. Repuestos y autorización del
        cliente los abre el estado de la orden solo.
      </p>

      {listado.isPending && (
        <div aria-hidden="true" className="h-48 animate-pulse rounded-base bg-superficie" />
      )}
      {listado.isError && (
        <p role="alert" className="text-dato text-critico">
          No se pudieron cargar los motivos. {mensajeGeneral(listado.error)}
        </p>
      )}

      {listado.data && (
        <section
          aria-label="Motivos"
          className="grid max-w-2xl content-start overflow-hidden rounded-base border border-borde bg-superficie"
        >
          <header className="flex items-center gap-3 border-b border-borde px-3 py-2">
            <h2 className="font-display text-dato font-semibold">Motivos</h2>
            {puedeConfigurar && (
              <span className="ml-auto">
                <Boton
                  tamano="chico"
                  icono={<IconoAgregar />}
                  deshabilitado={ocupado}
                  onClick={() => void agregar()}
                >
                  Agregar
                </Boton>
              </span>
            )}
          </header>
          <ul className="divide-y divide-borde-suave">
            {listado.data.datos.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 text-dato"
              >
                <span className={`flex-1 ${m.activo ? '' : 'text-texto-tenue line-through'}`}>
                  {m.nombre}
                  {m.propio && (
                    <span className="ml-2 text-etiqueta text-texto-tenue no-underline">
                      · propio
                    </span>
                  )}
                </span>
                {!m.activo && <span className="text-etiqueta text-texto-tenue">No se usa</span>}
                {puedeConfigurar && (
                  <span className="flex flex-wrap gap-1">
                    <Boton
                      tamano="chico"
                      icono={<IconoEditar />}
                      deshabilitado={ocupado}
                      onClick={() => void renombrar(m)}
                    >
                      Cambiar el nombre
                    </Boton>
                    <Boton
                      tamano="chico"
                      variante={m.activo ? 'peligro' : 'normal'}
                      deshabilitado={ocupado}
                      onClick={() => void prenderOApagar(m)}
                    >
                      {m.activo ? 'Dejar de usar' : 'Volver a usar'}
                    </Boton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  )
}
