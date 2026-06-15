import { useMemo, useState } from 'react'
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

export function Catalogue() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: books, isLoading, error } = useBooks()
  const [section, setSection] = useState('all')
  const [q, setQ] = useState('')

  const canSpiritual =
    user?.role === 'admin' ||
    user?.role === 'commission' ||
    user?.role === 'enrol' ||
    !!user?.spiritualAccess

  const sections = useMemo(
    () => SECTIONS.filter((s) => s.key !== 'spirituel' || canSpiritual),
    [canSpiritual],
  )

  const filtered = useMemo(() => {
    let list = books ?? []
    if (!canSpiritual) list = list.filter((b) => b.catType !== 'spirituel')
    if (section !== 'all') list = list.filter((b) => b.catType === (section as CatType))
    const term = q.trim().toLowerCase()
    if (term)
      list = list.filter(
        (b) =>
          b.titre?.toLowerCase().includes(term) || b.auteur?.toLowerCase().includes(term),
      )
    return list
  }, [books, section, q, canSpiritual])

  return (
    <div>
      <PageHeader title="Catalogue" subtitle={`${filtered.length} livre(s)`} />
      <SectionPicker sections={sections} value={section} onChange={setSection} />

      <div className="px-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un titre ou un auteur…"
          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] shadow-card focus:border-navy focus:outline-none"
        />

        {isLoading && <p className="py-10 text-center text-slate-400">Chargement…</p>}
        {error && (
          <p className="py-10 text-center text-red-600">Erreur : {(error as Error).message}</p>
        )}

        {!isLoading && !error && (
          <ul className="space-y-2 pb-4">
            {filtered.map((b) => (
              <li key={b.id}>
                <BookCard book={b} onClick={() => navigate(`/livre/${b.id}`)} />
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-10 text-center text-slate-400">Aucun livre trouvé.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
