import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { SPACE_ID } from './space'

const WATCHED: Record<string, string> = {
  books: 'books',
  loans: 'loans',
  users: 'users',
  book_requests: 'requests',
  request_sessions: 'sessions',
  registrations: 'registrations',
  shelf_checks: 'shelfChecks',
}

/**
 * Branche Supabase Realtime sur les tables principales de l'espace.
 * Quand Postgres notifie un changement, on invalide la clé TanStack Query
 * correspondante → les composants abonnés se rafraîchissent automatiquement.
 *
 * Coût : 1 connexion WebSocket par onglet ouvert (plan free = 200 connexions).
 */
export function useRealtime() {
  const qc = useQueryClient()

  useEffect(() => {
    const channel = supabase.channel(`space-${SPACE_ID}`)

    Object.entries(WATCHED).forEach(([table, queryKey]) => {
      channel.on(
        'postgres_changes' as Parameters<typeof channel.on>[0],
        { event: '*', schema: 'public', table, filter: `space_code=eq.${SPACE_ID}` },
        () => {
          qc.invalidateQueries({ queryKey: [queryKey, SPACE_ID] })
        },
      )
    })

    // space_config : pas de space_code dans le filtre Realtime (PK = space_code)
    channel.on(
      'postgres_changes' as Parameters<typeof channel.on>[0],
      { event: 'UPDATE', schema: 'public', table: 'space_config' },
      () => {
        qc.invalidateQueries({ queryKey: ['config', SPACE_ID] })
      },
    )

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])
}
