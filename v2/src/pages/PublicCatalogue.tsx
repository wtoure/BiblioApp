import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookCard } from '@/components/BookCard'
import { useBooks } from '@/features/catalogue/useBooks'
import { supabase } from '@/lib/supabase'
import type { Space } from '@/lib/types'

function useSpace(code: string) {
  return useQuery({
    queryKey: ['space', code],
    queryFn: async (): Promise<Space | null> => {
      const { data, error } = await supabase.from('spaces').select('*').eq('code', code).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Space) ?? null
    },
  })
}

export function PublicCatalogue() {
  const { code = '' } = useParams()
  const space = useSpace(code)
  const { data: books, isLoading, error } = useBooks(code)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    // Vue publique : uniquement le catalogue académique, hors livres retirés.
    let list = (books ?? []).filter((b) => b.catType !== 'spirituel' && b.status !== 'retired')
    const term = q.trim().toLowerCase()
    if (term)
      list = list.filter(
        (b) => b.titre?.toLowerCase().includes(term) || b.auteur?.toLowerCase().includes(term),
      )
    return list
  }, [books, q])

  if (space.data === null && !space.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 text-5xl">📚</div>
        <p className="font-semibold text-slate-700">Bibliothèque introuvable</p>
        <p className="mt-1 text-sm text-slate-500">Le code « {code} » ne correspond à aucune bibliothèque active.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-30 bg-navy-dark px-4 py-4 text-white shadow-soft">
        <h1 className="font-serif text-2xl font-semibold leading-tight">
          {space.data?.name ?? 'Catalogue'}
        </h1>
        <p className="text-xs text-white/60">Catalogue public · {filtered.length} livre(s)</p>
      </header>

      <div className="px-3 pt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un titre ou un auteur…"
          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] shadow-card focus:border-navy focus:outline-none"
        />

        {isLoading && <p className="py-10 text-center text-slate-400">Chargement du catalogue…</p>}
        {error && (
          <p className="py-10 text-center text-red-600">Erreur : {(error as Error).message}</p>
        )}

        {!isLoading && !error && (
          <ul className="space-y-2">
            {filtered.map((b) => (
              <li key={b.id}>
                <BookCard book={b} />
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
