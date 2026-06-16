import { useQuery } from '@tanstack/react-query'
import { fetchAll } from '@/lib/db'
import { SPACE_ID } from '@/lib/space'
import type { ShelfCheck } from '@/lib/types'

export function useShelfChecks() {
  return useQuery({
    queryKey: ['shelfChecks', SPACE_ID],
    queryFn: () => fetchAll<ShelfCheck>('shelf_checks'),
    staleTime: 30_000,
  })
}
