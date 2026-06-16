import { supabase } from './supabase'
import { SPACE_ID } from './space'

const PAGE = 1000

/** Lit toutes les lignes d'une table filtrées par espace (pagination incluse). */
export async function fetchAll<T>(table: string, spaceId: string = SPACE_ID): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('space_code', spaceId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data as T[]) ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return all
}
