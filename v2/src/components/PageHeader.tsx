import { useNavigate } from 'react-router-dom'

interface Props {
  title: string
  subtitle?: string
  back?: boolean
}

/** En-tête de page (collant en haut), avec bouton retour optionnel. */
export function PageHeader({ title, subtitle, back }: Props) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-navy-dark px-4 py-3 text-white shadow-soft">
      {back && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Retour"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl active:bg-white/10"
        >
          ←
        </button>
      )}
      <div className="min-w-0">
        <h1 className="truncate font-serif text-xl font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-white/60">{subtitle}</p>}
      </div>
    </header>
  )
}
