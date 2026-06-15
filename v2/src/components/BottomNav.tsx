import { NavLink } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { bottomNavItems } from '@/lib/nav'

interface Props {
  onMore: () => void
}

/** Barre de navigation fixe en bas — contrôles natifs, tap toujours fiable. */
export function BottomNav({ onMore }: Props) {
  const { user } = useAuth()
  if (!user) return null
  const items = bottomNavItems(user.role, user.tabs)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white shadow-[0_-2px_16px_rgba(28,67,112,.10)] safe-bottom"
      aria-label="Navigation principale"
    >
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) =>
            `flex min-h-[58px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-semibold transition-colors active:bg-slate-50 ${
              isActive ? 'text-navy' : 'text-slate-500'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`text-[22px] leading-none ${isActive ? '-translate-y-0.5 scale-110' : ''} transition-transform`}>
                {it.icon}
              </span>
              <span className="tracking-tight">{it.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={onMore}
        className="flex min-h-[58px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-semibold text-slate-500 active:bg-slate-50"
      >
        <span className="text-[22px] leading-none">⋯</span>
        <span className="tracking-tight">Plus</span>
      </button>
    </nav>
  )
}
