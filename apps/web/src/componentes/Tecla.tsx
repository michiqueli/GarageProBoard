import { mostrarTecla } from '@gpb/core'

/**
 * La representación visual de una tecla. Recibe la forma canónica (`Alt+ArrowDown`) y
 * la escribe como la lee una persona (`Alt + ↓`).
 */
export function Tecla({ tecla, tono = 'normal' }: { tecla: string; tono?: 'normal' | 'marca' }) {
  return (
    <kbd
      className={[
        'rounded-[3px] border px-[5px] py-[1px] font-mono text-[10px] font-semibold leading-normal',
        tono === 'marca'
          ? 'border-marca text-marca'
          : 'border-borde bg-superficie text-texto-suave',
      ].join(' ')}
    >
      {mostrarTecla(tecla)}
    </kbd>
  )
}
