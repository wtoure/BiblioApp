import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import type { Book } from '@/lib/types'

async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('space_code', SPACE_ID)
    .order('titre', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as Book[]) ?? []
}

export function useBooks() {
  return useQuery({
    queryKey: ['books', SPACE_ID],
    queryFn: fetchBooks,
    staleTime: 60_000,
  })
}
