import { contrato } from '@gpb/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { preguntar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { nombreOrden } from './ordenes.ts'
import { Semaforo } from './RevisionRecepcion.tsx'

type Pendiente = Awaited<ReturnType<typeof api.ordenes.pendientes>>['datos'][number]

const FECHA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' })

/**
 * «Quedaron pendientes»: lo que se le recomendó al auto la vez anterior y el cliente no
 * autorizó. Se muestra apenas se elige el auto, que es cuando el asesor todavía está hablando
 * con el cliente. Cada uno se suma a la orden nueva —como trabajo sin precio, para
 * presupuestarlo— o se descarta con motivo.
 */
export function PendientesDelVehiculo({
  pendientes,
  elegidos,
  alternar,
}: {
  pendientes: Pendiente[]
  elegidos: string[]
  alternar: (id: string) => void
}) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeDescartar = usePuedeUsar(contrato.ordenes.descartarPendiente)

  const descartar = useMutation({
    mutationFn: (v: { id: string; motivo: string }) => api.ordenes.descartarPendiente(v),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['pendientes', tenantId], exact: false }),
    meta: { exito: 'Pendiente descartado', error: mensajeGeneral },
  })

  async function preguntarMotivo(p: Pendiente) {
    const motivo = await preguntar({
      titulo: `¿Descartar «${p.descripcion}»?`,
      texto: 'Deja de ofrecerse en las próximas recepciones. Queda anotado con el motivo.',
      confirmar: 'Descartar',
      peligro: true,
      campo: {
        etiqueta: 'Por qué',
        valor: '',
        validar: (v) =>
          v.trim().length < 3 ? 'Decí por qué: lo hizo en otro lado, vendió el auto' : null,
      },
    })
    if (motivo) descartar.mutate({ id: p.id, motivo })
  }

  if (!pendientes.length) return null
  return (
    <section
      aria-label="Quedaron pendientes"
      className="grid gap-2 rounded-base border border-atencion px-3 py-2.5"
    >
      <h3 className="text-dato font-semibold">Quedaron pendientes de la última vez</h3>
      <ul className="grid gap-1.5">
        {pendientes.map((p) => {
          const sumado = elegidos.includes(p.id)
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-dato">
              {p.semaforo && <Semaforo estado={p.semaforo} />}
              <span className="flex-1">
                {p.descripcion}
                <span className="block text-etiqueta text-texto-tenue">
                  {p.origen === 'presupuesto' ? 'No lo autorizó' : 'Se le avisó en la revisión'} en
                  la {nombreOrden(p.orden.numero)}, el {FECHA.format(new Date(p.informadoEn))}
                </span>
              </span>
              <Boton
                tamano="chico"
                variante={sumado ? 'principal' : 'normal'}
                presionado={sumado}
                onClick={() => alternar(p.id)}
              >
                {sumado ? 'Se suma a esta orden' : 'Sumar a esta orden'}
              </Boton>
              {puedeDescartar && (
                <Boton tamano="chico" variante="sutil" onClick={() => void preguntarMotivo(p)}>
                  Descartar
                </Boton>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
