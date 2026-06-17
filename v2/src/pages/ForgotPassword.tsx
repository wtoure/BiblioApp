import { Link } from 'react-router-dom'
import { useConfig } from '@/features/config/useConfig'

export function ForgotPassword() {
  const { data: config } = useConfig()
  const contactName = config?.contactName ?? ''
  const contact = config?.contact ?? ''
  const wa = contact.replace(/[^0-9+]/g, '').replace(/^\+/, '')
  const waMsg = encodeURIComponent(
    "Bonjour, j'ai oublié mon mot de passe et je souhaite le réinitialiser. Merci.",
  )

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-navy-dark via-navy to-comoe px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/[0.07] p-8 shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
        <h1 className="mb-2 text-center font-serif text-2xl font-bold text-white">Mot de passe oublié</h1>
        <p className="mt-1 mb-5 text-center text-sm text-white/60">
          Contactez l'administrateur de la bibliothèque : il vous communiquera un nouveau mot de passe.
        </p>

        {(contactName || contact) && (
          <div className="mb-4 rounded-xl bg-white/10 px-4 py-3 text-center text-sm text-white">
            {contactName && <div className="font-semibold">{contactName}</div>}
            {contact && <div className="text-white/70">{contact}</div>}
          </div>
        )}

        {wa && (
          <a
            href={`https://wa.me/${wa}?text=${waMsg}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 block w-full rounded-xl bg-green-600 py-3 text-center font-semibold text-white active:opacity-90"
          >
            📲 Contacter par WhatsApp
          </a>
        )}

        <Link
          to="/login"
          className="block w-full rounded-xl bg-comoe py-3 text-center font-semibold text-white"
        >
          Retour à la connexion
        </Link>
      </div>
    </div>
  )
}
