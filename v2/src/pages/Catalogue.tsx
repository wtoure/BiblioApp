import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { SectionPicker, type Section } from '@/components/SectionPicker'
import { BookCard } from '@/components/BookCard'
import { useBooks } from '@/features/catalogue/useBooks'
import { useAuth } from '@/lib/auth'
import type { CatType } from '@/lib/types'

const SECTIONS: Section[] = [
  { key: 'all', label: 'Tous les catalogues' },
  { key: 'academique', label: 'Académique' },
  { key: 'spirituel', label: 'Spirituel' },
]

// Rendu incrémental : on n'affiche pas les ~1 800 cartes d'un coup (lag mobile).
const PAGE = 30

export function Catalogue() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: books, isLoading, error } = useBooks()
  const [section, setSection] = useState('all')
  const [q, setQ] = useState('')
  const [lang, setLang] = useState('')
  const [salle, setSalle] = useState('')
  const [newOnly, setNewOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const canSpiritual =
    user?.role === 'admin' ||
    user?.role === 'commission' ||
    user?.role === 'enrol' ||
    !!user?.spiritualAccess

  const sections = useMemo(
    () => SECTIONS.filter((s) => s.key !== 'spirituel' || canSpiritual),
    [canSpiritual],
  )

  // Options de filtres dérivées des livres visibles (triées)
  const { langs, salles } = useMemo(() => {
    const base = (books ?? []).filter((b) => canSpiritual || b.catType !== 'spirituel')
    const uniq = (xs: (string | undefined)[]) =>
      [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'fr'))
    return { langs: uniq(base.map((b) => b.lang)), salles: uniq(base.map((b) => b.salle)) }
  }, [books, canSpiritual])

  const filtered = useMemo(() => {
    let list = books ?? []
    if (!canSpiritual) list = list.filter((b) => b.catType !== 'spirituel')
    if (section !== 'all') list = list.filter((b) => b.catType === (section as CatType))
    if (lang) list = list.filter((b) => b.lang === lang)
    if (salle) list = list.filter((b) => b.salle === salle)
    if (newOnly) list = list.filter((b) => b.ancienNouv === 'Nouveau')
    const term = q.trim().toLowerCase()
    if (term)
      list = list.filter(
        (b) =>
          b.titre?.toLowerCase().includes(term) || b.auteur?.toLowerCase().includes(term),
      )
    return list
  }, [books, section, q, lang, salle, newOnly, canSpiritual])

  const activeFilters = (lang ? 1 : 0) + (salle ? 1 : 0) + (newOnly ? 1 : 0)

  // Réinitialise le rendu incrémental dès qu'un filtre change.
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => {
    setLimit(PAGE)
  }, [section, q, lang, salle, newOnly, canSpiritual])

  const visible = filtered.slice(0, limit)
  const remaining = filtered.length - visible.length

  return (
    <div>
      <PageHeader title="Catalogue" subtitle={`${filtered.length} livre(s)`} />
      <SectionPicker sections={sections} value={section} onChange={setSection} />

      <div className="px-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un titre ou un auteur…"
          className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] shadow-card focus:border-navy focus:outline-none"
        />

        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              activeFilters || showFilters
                ? 'border-navy bg-navy text-white'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            ⚙ Filtres{activeFilters ? ` (${activeFilters})` : ''}
          </button>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setLang('')
                setSalle('')
                setNewOnly(false)
              }}
              className="text-sm font-medium text-slate-500 underline"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-card">
            <div className="grid grid-cols-2 gap-2">
              <FilterSelect label="Langue" value={lang} onChange={setLang} options={langs} />
              <FilterSelect label="Salle" value={salle} onChange={setSalle} options={salles} />
            </div>
            <label className="flex items-center gap-2 px-1 py-1 text-[15px] text-slate-700">
              <input
                type="checkbox"
                checked={newOnly}
                onChange={(e) => setNewOnly(e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 text-navy focus:ring-navy"
              />
              Nouveautés uniquement
            </label>
          </div>
        )}

        {isLoading && <p className="py-10 text-center text-slate-400">Chargement…</p>}
        {error && (
          <p className="py-10 text-center text-red-600">Erreur : {(error as Error).message}</p>
        )}

        {!isLoading && !error && (
          <>
            <ul className="space-y-2 pb-2">
              {visible.map((b) => (
                <li key={b.id}>
                  <BookCard book={b} onClick={() => navigate(`/livre/${b.id}`)} />
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="py-10 text-center text-slate-400">Aucun livre trouvé.</li>
              )}
            </ul>
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className="mb-4 w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-navy shadow-card active:bg-slate-50"
              >
                Afficher plus ({remaining} restant{remaining > 1 ? 's' : ''})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[15px] focus:border-navy focus:outline-none"
      >
        <option value="">Toutes</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
