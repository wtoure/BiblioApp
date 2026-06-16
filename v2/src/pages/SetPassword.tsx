import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

/**
 * Page d'atterrissage des liens d'invitation et de réinitialisation.
 * Le client Supabase (detectSessionInUrl) établit une session de
 * récupération/invitation à partir du fragment d'URL ; on demande alors
 * à l'utilisateur de définir son mot de passe.
 */
export function SetPassword() {
  const { updatePassword, refresh } = useAuth()
  const navigate = useNavigate()
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setReady(session ? 'ok' : 'invalid')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) setReady('ok')
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      const u = await refresh()
      navigate(u ? '/catalogue' : '/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-navy-dark via-navy to-comoe px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/[0.07] p-8 shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
        <h1 className="mb-1 text-center font-serif text-2xl font-bold text-white">Définir mon mot de passe</h1>

        {ready === 'checking' && (
          <p className="mt-6 text-center text-sm text-white/60">Vérification du lien…</p>
        )}

        {ready === 'invalid' && (
          <>
            <p className="mt-4 rounded-lg bg-red-500/15 px-4 py-3 text-center text-sm text-red-200">
              Lien invalide ou expiré. Demandez un nouveau lien depuis « Mot de passe oublié ».
            </p>
            <Link to="/forgot-password" className="mt-5 block w-full rounded-xl bg-comoe py-3 text-center font-semibold text-white">
              Renvoyer un lien
            </Link>
          </>
        )}

        {ready === 'ok' && (
          <>
            <p className="mt-1 mb-5 text-center text-sm text-white/50">
              Choisissez un mot de passe (8 caractères minimum).
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Nouveau mot de passe"
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder-white/40 focus:border-comoe-light focus:outline-none focus:ring-2 focus:ring-comoe/40"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="Confirmer le mot de passe"
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder-white/40 focus:border-comoe-light focus:outline-none focus:ring-2 focus:ring-comoe/40"
              />
              {error && (
                <p className="rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-200">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-comoe py-3 font-semibold text-white shadow-soft disabled:opacity-60"
              >
                {busy ? 'Enregistrement…' : 'Valider'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
