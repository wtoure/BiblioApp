import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import type { Book } from '@/lib/types'

const PAGE = 1000 // Supabase plafonne chaque requête à 1000 lignes → pagination obligatoire

async function fetchBooks(spaceId: string): Promise<Book[]> {
  const all: Book[] = []
  let from = 0
  // Boucle de pagination : récupère TOUTES les lignes (1800+), pas seulement les 1000 premières.
  for (;;) {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .eq('space_code', spaceId)
      .order('titre', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data as Book[]) ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return all
}

export function useBooks(spaceId: string = SPACE_ID) {
  return useQuery({
    queryKey: ['books', spaceId],
    queryFn: () => fetchBooks(spaceId),
    staleTime: 60_000,
  })
}

async function fetchBook(id: number, spaceId: string): Promise<Book | null> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('space_code', spaceId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Book) ?? null
}

export function useBook(id: number, spaceId: string = SPACE_ID) {
  return useQuery({
    queryKey: ['book', spaceId, id],
    queryFn: () => fetchBook(id, spaceId),
    enabled: Number.isFinite(id),
  })
}
