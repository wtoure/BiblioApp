import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { SectionPicker, type Section } from '@/components/SectionPicker'
import { useRequests, useSessions, useUsers } from '@/features/requests/useRequests'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import { useAuth } from '@/lib/auth'
import type { BookRequest, RequestStatus } from '@/lib/types'

const SECTIONS: Section[] = [
  { key: 'demandes', label: 'Demandes' },
  { key: 'sessions', label: 'Sessions' },
]

const STATUS_BADGE: Record<RequestStatus, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approuvée', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejetée', cls: 'bg-red-100 text-red-700' },
}

export function Demandes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: requests, isLoading } = useRequests()
  const { data: sessions } = useSessions()
  const { data: users } = useUsers()
  const [section, setSection] = useState('demandes')
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all')

  const isManager = user?.role === 'commission' || user?.role === 'admin'
  const readOnly = user?.role === 'resident'

  const userName = useMemo(() => {
    const m = new Map<number, string>()
    ;(users ?? []).forEach((u) => m.set(u.id, `${u.prenom} ${u.nom}`))
    return m
  }, [users])

  const list = useMemo(() => {
    let l = requests ?? []
    if (filter !== 'all') l = l.filter((r) => r.status === filter)
    return [...l].sort((a, b) => b.id - a.id)
  }, [requests, filter])

  const counts = useMemo(() => {
    const r = requests ?? []
    return {
      total: r.length,
      pending: r.filter((x) => x.status === 'pending').length,
      approved: r.filter((x) => x.status === 'approved').length,
      rejected: r.filter((x) => x.status === 'rejected').length,
    }
  }, [requests])

  // Écriture (à relire) : changement de statut d'une demande — cf. chgSt (app.js)
  async function changeStatus(r: BookRequest, status: RequestStatus) {
    const { error } = await supabase
      .from('book_requests')
      .update({ status })
      .eq('id', r.id)
      .eq('space_code', SPACE_ID)
    if (error) {
      alert('Erreur : ' + error.message)
      return
    }
    qc.invalidateQueries({ queryKey: ['requests', SPACE_ID] })
  }

  return (
    <div>
      <PageHeader title="Demandes" subtitle={readOnly ? 'Consultation' : undefined} />
      <SectionPicker sections={SECTIONS} value={section} onChange={setSection} />

      {section === 'demandes' && (
        <div className="px-3">
          {/* Stats */}
          <div className="mb-3 grid grid-cols-4 gap-2">
            <Stat label="Total" value={counts.total} />
            <Stat label="Attente" value={counts.pending} color="text-amber-600" />
            <Stat label="OK" value={counts.approved} color="text-green-600" />
            <Stat label="Rejet" value={counts.rejected} color="text-red-600" />
          </div>

          {/* Filtres */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  filter === f ? 'bg-navy text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {f === 'all' ? 'Toutes' : STATUS_BADGE[f].label}
              </button>
            ))}
          </div>

          {isLoading && <p className="py-10 text-center text-slate-400">Chargement…</p>}
          <ul className="space-y-2 pb-4">
            {list.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">{r.titre}</div>
                    {r.auteur && <div className="text-sm text-slate-500">{r.auteur}</div>}
                    <div className="mt-0.5 text-xs text-slate-400">
                      {r.dem != null ? userName.get(r.dem) ?? 'Demandeur inconnu' : '—'} · {r.date}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[r.status].cls}`}>
                    {STATUS_BADGE[r.status].label}
                  </span>
                </div>
                {isManager && r.status === 'pending' && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => changeStatus(r, 'approved')}
                      className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white active:opacity-90"
                    >
                      Approuver
                    </button>
                    <button
                      onClick={() => changeStatus(r, 'rejected')}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white active:opacity-90"
                    >
                      Rejeter
                    </button>
                  </div>
                )}
              </li>
            ))}
            {!isLoading && list.length === 0 && (
              <li className="py-10 text-center text-slate-400">Aucune demande.</li>
            )}
          </ul>
        </div>
      )}

      {section === 'sessions' && (
        <div className="px-3 pb-4">
          <ul className="space-y-2">
            {[...(sessions ?? [])].sort((a, b) => b.id - a.id).map((s) => {
              const cnt = (requests ?? []).filter((r) => r.sessionId === s.id).length
              return (
                <li key={s.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-card">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-800">Session N°{s.id}</div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.closed ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                      {s.closed ? 'Fermée' : 'En cours'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500">{s.motif}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    Ouverte le {s.openDate} · {cnt} demande(s)
                  </div>
                </li>
              )
            })}
            {(sessions ?? []).length === 0 && (
              <li className="py-10 text-center text-slate-400">Aucune session.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-navy' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-white p-2 text-center shadow-card">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}
