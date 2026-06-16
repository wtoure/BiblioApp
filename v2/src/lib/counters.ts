import { supabase } from './supabase'
import { SPACE_ID } from './space'

export type CounterField = 'nxB' | 'nxU' | 'nxR' | 'nxS' | 'nxL' | 'nxSC' | 'nxReg'

/**
 * Réserve le prochain identifiant pour un compteur (cf. `nxR++` desktop).
 * Lit la valeur courante dans space_counters, renvoie cette valeur comme ID,
 * et persiste l'incrément. ⚠️ Lecture-modification-écriture non atomique
 * (comme le desktop) — acceptable en faible concurrence.
 */
export async function nextId(field: CounterField, spaceId: string = SPACE_ID): Promise<number> {
  const { data, error } = await supabase
    .from('space_counters')
    .select('*')
    .eq('space_code', spaceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const current = (data?.[field] as number | undefined) ?? 1
  const { error: upErr } = await supabase
    .from('space_counters')
    .upsert({ space_code: spaceId, [field]: current + 1 })
  if (upErr) throw new Error(upErr.message)
  return current
}
