import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { SectionPicker, type Section } from '@/components/SectionPicker'
import { useBooks } from '@/features/catalogue/useBooks'
import { useAuth } from '@/lib/auth'
import type { CatType } from '@/lib/types'

const SECTIONS: Section[] = [
  { key: 'all', label: '📚 Tous les catalogues' },
  { key: 'academique', label: '🎓 Académique' },
  { key: 'spirituel', label: '✝️ Spirituel' },
]

export function Catalogue() {
  const { user } = useAuth()
  const { data: books, isLoading, error } = useBooks()
  const [section, setSection] = useState('all')
  const [q, setQ] = useState('')

  // Accès au spirituel : admin/commission/enrol ou flag spiritualAccess
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
          placeholder="🔍 Rechercher un titre ou un auteur…"
          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] shadow-card focus:border-navy focus:outline-none"
        />

        {isLoading && <p className="py-10 text-center text-slate-400">Chargement…</p>}
        {error && (
          <p className="py-10 text-center text-red-600">
            Erreur : {(error as Error).message}
          </p>
        )}

        {!isLoading && !error && (
          <ul className="space-y-2 pb-4">
            {filtered.map((b) => (
              <li
                key={b.id}
                className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-card"
              >
                <span className="text-2xl">{b.emoji || '📖'}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-800">{b.titre}</div>
                  <div className="truncate text-sm text-slate-500">{b.auteur || '—'}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge>
                      {b.catType === 'spirituel' ? '✝️ Spirituel' : '🎓 Académique'}
                    </Badge>
                    {b.salle && <Badge>📍 {b.salle}</Badge>}
                    <StatusBadge status={b.status} />
                  </div>
                </div>
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { t: string; c: string }> = {
    available: { t: '✓ Disponible', c: 'bg-green-100 text-green-700' },
    borrowed: { t: 'Emprunté', c: 'bg-amber-100 text-amber-700' },
    retired: { t: 'Retiré', c: 'bg-slate-100 text-slate-500' },
    missing: { t: 'Manquant', c: 'bg-red-100 text-red-700' },
  }
  const s = map[status] ?? map.available
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.c}`}>{s.t}</span>
}
