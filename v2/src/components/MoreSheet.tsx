import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

interface Props {
  open: boolean
  onClose: () => void
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrateur',
  commission: 'Commission',
  enrol: 'Enrôleur',
  member: 'Membre',
  resident: 'Résident',
  validator: 'Validateur',
}

/** Feuille modale (bottom sheet) : navigation secondaire + déconnexion. */
export function MoreSheet({ open, onClose }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  const links: { to: string; label: string; icon: string }[] = [
    { to: '/catalogue', label: 'Catalogue', icon: '📚' },
    { to: '/profil', label: 'Mon profil', icon: '👤' },
    { to: '/guide', label: 'Guide', icon: '❓' },
    { to: '/installer', label: "Installer l'app", icon: '📲' },
  ]

  return (
    <>
      {/* Voile */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Feuille */}
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-soft transition-transform duration-200 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300" />
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
            {(user.prenom[0] || '') + (user.nom[0] || '')}
          </div>
          <div>
            <div className="font-semibold text-slate-800">
              {user.prenom} {user.nom}
            </div>
            <div className="text-xs text-slate-500">{ROLE_LABEL[user.role] ?? user.role}</div>
          </div>
        </div>
        <div className="px-3 pb-2">
          {links.map((l) => (
            <button
              key={l.to}
              onClick={() => go(l.to)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium text-slate-700 active:bg-slate-100"
            >
              <span className="text-xl">{l.icon}</span>
              {l.label}
            </button>
          ))}
          <button
            onClick={() => {
              onClose()
              logout()
            }}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-semibold text-red-600 active:bg-red-50"
          >
            <span className="text-xl">🚪</span>
            Déconnexion
          </button>
        </div>
      </div>
    </>
  )
}
