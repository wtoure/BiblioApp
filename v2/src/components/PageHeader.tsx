interface Props {
  title: string
  subtitle?: string
}

/** En-tête de page (collant en haut). */
export function PageHeader({ title, subtitle }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-navy-dark px-4 py-3 text-white shadow-soft">
      <h1 className="font-serif text-xl font-semibold leading-tight">{title}</h1>
      {subtitle && <p className="text-xs text-white/60">{subtitle}</p>}
    </header>
  )
}
