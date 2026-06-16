import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import type { SpaceConfig } from '@/lib/types'

async function fetchConfig(): Promise<SpaceConfig | null> {
  const { data, error } = await supabase
    .from('space_config')
    .select('*')
    .eq('space_code', SPACE_ID)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as SpaceConfig) ?? null
}

export function useConfig() {
  return useQuery({
    queryKey: ['config', SPACE_ID],
    queryFn: fetchConfig,
    staleTime: 60_000,
  })
}
