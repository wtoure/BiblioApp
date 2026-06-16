import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-navy-dark via-navy to-comoe px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/[0.07] p-8 shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
        <h1 className="mb-2 text-center font-serif text-2xl font-bold text-white">Mot de passe oublié</h1>
        {sent ? (
          <>
            <p className="mt-4 rounded-lg bg-green-500/15 px-4 py-3 text-center text-sm text-green-100">
              Si un compte existe pour cet e-mail, un lien de réinitialisation vient d'être envoyé.
              Vérifiez votre boîte mail (et les spams).
            </p>
            <Link
              to="/login"
              className="mt-5 block w-full rounded-xl bg-comoe py-3 text-center font-semibold text-white"
            >
              Retour à la connexion
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 mb-5 text-center text-sm text-white/50">
              Entrez votre e-mail : nous vous enverrons un lien pour définir un nouveau mot de passe.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
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
              {error && (
                <p className="rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-200">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-comoe py-3 font-semibold text-white shadow-soft disabled:opacity-60"
              >
                {busy ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </form>
            <Link
              to="/login"
              className="mt-4 block text-center text-sm text-white/60 hover:text-white"
            >
              ← Retour
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
