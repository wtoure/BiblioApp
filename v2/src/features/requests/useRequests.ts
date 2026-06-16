import { useQuery } from '@tanstack/react-query'
import { fetchAll } from '@/lib/db'
import { SPACE_ID } from '@/lib/space'
import type { BookRequest, RequestSession, User } from '@/lib/types'

export function useRequests() {
  return useQuery({
    queryKey: ['requests', SPACE_ID],
    queryFn: () => fetchAll<BookRequest>('book_requests'),
    staleTime: 30_000,
  })
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions', SPACE_ID],
    queryFn: () => fetchAll<RequestSession>('request_sessions'),
    staleTime: 30_000,
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users', SPACE_ID],
    queryFn: () => fetchAll<User>('users'),
    staleTime: 30_000,
  })
}
