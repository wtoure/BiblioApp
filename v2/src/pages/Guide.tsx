import { PageHeader } from '@/components/PageHeader'
import { useAuth } from '@/lib/auth'
import { userCapabilities, ROLE_LABEL } from '@/lib/capabilities'

export function Guide() {
  const { user } = useAuth()
  if (!user) return null
  const caps = userCapabilities(user)

  return (
    <div>
      <PageHeader title="Guide" />
      <div className="px-4 py-4">
        <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-5 text-white shadow-soft">
          <div className="text-lg font-bold">❓ Guide d'utilisation</div>
          <p className="mt-1 text-sm text-white/85">
            Bonjour {user.prenom} · vous êtes connecté en tant que{' '}
            <strong>{ROLE_LABEL[user.role] ?? user.role}</strong>
          </p>
        </div>

        <p className="mb-2 mt-4 text-sm text-slate-500">
          Voici tout ce que vous pouvez faire avec l'application :
        </p>
        <ul className="space-y-2">
          {caps.map((c) => (
            <li key={c.title} className="flex gap-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-card">
              <span className="text-2xl leading-none">{c.icon}</span>
              <div>
                <div className="font-semibold text-slate-800">{c.title}</div>
                <div className="text-sm text-slate-500">{c.desc}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-700">
          💡 <strong>Astuce :</strong> utilisez la barre en bas de l'écran pour naviguer entre les
          sections, et le bouton « Plus » pour accéder à votre profil, au guide et à la déconnexion.
        </div>
      </div>
    </div>
  )
}
