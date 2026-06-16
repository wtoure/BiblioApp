import { useQuery } from '@tanstack/react-query'
import { fetchAll } from '@/lib/db'
import { SPACE_ID } from '@/lib/space'
import type { Registration } from '@/lib/types'

export function useRegistrations() {
  return useQuery({
    queryKey: ['registrations', SPACE_ID],
    queryFn: () => fetchAll<Registration>('registrations'),
    staleTime: 30_000,
  })
}
