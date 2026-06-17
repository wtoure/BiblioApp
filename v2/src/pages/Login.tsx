import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Nom de la bibliothèque courante (résolue depuis l'URL / mémorisée), pour
  // l'afficher au lieu du code. La sélection se fait uniquement via le lien
  // partagé — aucune autre bibliothèque n'est exposée à l'utilisateur.
  const { data: space } = useQuery({
    queryKey: ['space-name', SPACE_ID],
    queryFn: async () => {
      const { data } = await supabase.from('spaces').select('name').eq('code', SPACE_ID).maybeSingle()
      return (data as { name?: string } | null)?.name ?? null
    },
    staleTime: 300_000,
  })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      navigate('/catalogue', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-navy-dark via-navy to-comoe px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/[0.07] p-8 shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
        <div className="mb-8 text-center">
          <div className="mb-3 text-4xl">📚</div>
          <h1 className="font-serif text-3xl font-bold text-white">
            Comoé<span className="text-comoe-light">Biblio</span>
          </h1>
          <p className="mt-1 text-sm text-white/50">{space ?? 'Bibliothèque'}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              placeholder="vous@exemple.com"
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder-white/40 focus:border-comoe-light focus:outline-none focus:ring-2 focus:ring-comoe/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder-white/40 focus:border-comoe-light focus:outline-none focus:ring-2 focus:ring-comoe/40"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-200">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-comoe py-3 font-semibold text-white shadow-soft transition active:scale-[.98] disabled:opacity-60"
          >
            {busy ? 'Connexion…' : 'Se connecter →'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link to="/forgot-password" className="text-sm text-white/60 underline-offset-2 hover:text-white hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
      </div>
      <p className="mt-6 text-xs text-white/30">Version mobile · v2</p>
    </div>
  )
}
