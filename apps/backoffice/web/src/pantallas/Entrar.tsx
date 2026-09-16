import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { api, CLAVE_OPERADOR, mensajeDe } from '../cliente.ts'
import { Aviso, Boton, Campo } from '../componentes.tsx'

export function PantallaEntrar() {
  const cache = useQueryClient()
  const navegar = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const entrar = useMutation({
    mutationFn: () => api.auth.iniciar({ email, password }),
    onSuccess: async (operador) => {
      cache.setQueryData(CLAVE_OPERADOR, operador)
      await navegar({ to: '/', replace: true })
    },
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    entrar.mutate()
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-5 p-4">
      <div className="flex items-center gap-2.5">
        <span className="size-4 rotate-45 rounded-[3px] bg-marca" />
        <b className="font-display text-xl font-bold tracking-tight">GarageProBoard</b>
        <span className="rounded-base border border-marca px-1.5 font-mono text-etiqueta text-marca uppercase">
          Back-office
        </span>
      </div>

      <form
        onSubmit={enviar}
        className="grid gap-3 rounded-base border border-borde bg-superficie p-4"
      >
        <Campo
          etiqueta="Correo"
          type="email"
          autoComplete="username"
          // Se entra tipeando, sin tocar el mouse.
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {entrar.isError && <Aviso tono="critico">{mensajeDe(entrar.error)}</Aviso>}
        <Boton type="submit" variante="principal" disabled={entrar.isPending}>
          {entrar.isPending ? 'Entrando…' : 'Entrar'}
        </Boton>
      </form>

      <p className="text-etiqueta text-texto-tenue">
        Sólo para el equipo de GarageProBoard. Los usuarios se crean con{' '}
        <code className="font-mono">pnpm db:operador</code>.
      </p>
    </main>
  )
}
