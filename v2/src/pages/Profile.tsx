import { PageHeader } from '@/components/PageHeader'
import { useAuth } from '@/lib/auth'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrateur',
  commission: 'Commission',
  enrol: 'Enrôleur',
  member: 'Membre',
  resident: 'Résident',
  validator: 'Validateur',
}

export function Profile() {
  const { user, logout } = useAuth()
  if (!user) return null

  const initials = ((user.prenom[0] || '') + (user.nom[0] || '')).toUpperCase()
  const infos: { label: string; value?: string | null }[] = [
    { label: 'Code de connexion', value: user.abbrev },
    { label: 'WhatsApp', value: user.whatsapp },
    { label: 'Commune', value: user.commune },
    { label: 'Profession', value: user.profession },
    { label: 'E-mail', value: user.email },
  ]

  return (
    <div>
      <PageHeader title="Mon profil" />
      <div className="px-4 py-5">
        {/* Carte identité */}
        <div className="flex flex-col items-center rounded-2xl bg-white p-6 shadow-card">
          {user.photoB64 ? (
            <img
              src={user.photoB64}
              alt={`${user.prenom} ${user.nom}`}
              className="h-24 w-24 rounded-full object-cover ring-2 ring-navy/10"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-navy text-2xl font-bold text-white">
              {initials || '?'}
            </div>
          )}
          <h2 className="mt-3 font-serif text-2xl font-semibold text-navy">
            {user.prenom} {user.nom}
          </h2>
          <span className="mt-1 rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold text-slate-600">
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
        </div>

        {/* Informations */}
        <dl className="mt-4 divide-y divide-slate-100 rounded-2xl bg-white shadow-card">
          {infos.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-slate-500">{row.label}</dt>
              <dd className="text-right font-medium text-slate-800">{row.value || '—'}</dd>
            </div>
          ))}
        </dl>

        <button
          onClick={logout}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-3.5 font-semibold text-red-600 active:bg-red-100"
        >
          🚪 Déconnexion
        </button>
      </div>
    </div>
  )
}
