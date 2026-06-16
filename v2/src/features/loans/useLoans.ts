import { useQuery } from '@tanstack/react-query'
import { fetchAll } from '@/lib/db'
import { SPACE_ID } from '@/lib/space'
import type { Loan } from '@/lib/types'

export function useLoans() {
  return useQuery({
    queryKey: ['loans', SPACE_ID],
    queryFn: () => fetchAll<Loan>('loans'),
    staleTime: 30_000,
  })
}
