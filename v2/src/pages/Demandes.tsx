import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { SectionPicker, type Section } from '@/components/SectionPicker'
import { useRequests, useSessions, useUsers } from '@/features/requests/useRequests'
import { useConfig } from '@/features/config/useConfig'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import { nextId } from '@/lib/counters'
import { useAuth } from '@/lib/auth'
import type { BookRequest, RequestSession, RequestStatus } from '@/lib/types'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

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
        <SessionsManager
          sessions={sessions ?? []}
          requests={requests ?? []}
          isManager={isManager}
        />
      )}
    </div>
  )
}

/** Gestion des sessions de demandes (commission/admin) : ouvrir, fermer, supprimer. */
function SessionsManager({
  sessions,
  requests,
  isManager,
}: {
  sessions: RequestSession[]
  requests: BookRequest[]
  isManager: boolean
}) {
  const qc = useQueryClient()
  const { data: config } = useConfig()
  const [motif, setMotif] = useState('')
  const [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const isOpen =
    !!config?.openAll &&
    (!config.openUntil || new Date() <= new Date(config.openUntil + 'T23:59:59'))

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['sessions', SPACE_ID] })
    qc.invalidateQueries({ queryKey: ['requests', SPACE_ID] })
    qc.invalidateQueries({ queryKey: ['config', SPACE_ID] })
  }

  // Ouvrir une session — cf. opPropCom (app.js)
  async function openSession() {
    if (!motif.trim()) {
      setErr('Le motif est obligatoire.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const id = await nextId('nxS')
      const sess = {
        id,
        space_code: SPACE_ID,
        motif: motif.trim(),
        openDate: todayStr(),
        openUntil: until || null,
        closed: false,
        closedDate: null,
      }
      const { error: sErr } = await supabase.from('request_sessions').insert(sess)
      if (sErr) throw new Error(sErr.message)
      const { error: cErr } = await supabase
        .from('space_config')
        .update({
          openAll: true,
          openUntil: until || null,
          propMotif: motif.trim(),
          currentSessionId: id,
        })
        .eq('space_code', SPACE_ID)
      if (cErr) throw new Error(cErr.message)
      setMotif('')
      setUntil('')
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  // Fermer la session courante — cf. clPropCom (app.js)
  async function closeSession() {
    setBusy(true)
    setErr('')
    try {
      const sessId = config?.currentSessionId
      if (sessId) {
        const { error: sErr } = await supabase
          .from('request_sessions')
          .update({ closed: true, closedDate: todayStr() })
          .eq('id', sessId)
          .eq('space_code', SPACE_ID)
        if (sErr) throw new Error(sErr.message)
      }
      const { error: cErr } = await supabase
        .from('space_config')
        .update({ openAll: false, openUntil: null, currentSessionId: null })
        .eq('space_code', SPACE_ID)
      if (cErr) throw new Error(cErr.message)
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  // Supprimer une session + ses demandes — cf. delSess (app.js)
  async function deleteSession(s: RequestSession) {
    const cnt = requests.filter((r) => r.sessionId === s.id).length
    if (
      !window.confirm(
        `Supprimer la Session N°${s.id} « ${s.motif} » et ses ${cnt} demande(s) ?\nCette action est irréversible.`,
      )
    )
      return
    setBusy(true)
    setErr('')
    try {
      const { error: rErr } = await supabase
        .from('book_requests')
        .delete()
        .eq('sessionId', s.id)
        .eq('space_code', SPACE_ID)
      if (rErr) throw new Error(rErr.message)
      const { error: sErr } = await supabase
        .from('request_sessions')
        .delete()
        .eq('id', s.id)
        .eq('space_code', SPACE_ID)
      if (sErr) throw new Error(sErr.message)
      // Si on supprime la session courante, refermer la config
      if (config?.currentSessionId === s.id) {
        await supabase
          .from('space_config')
          .update({ openAll: false, openUntil: null, currentSessionId: null })
          .eq('space_code', SPACE_ID)
      }
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-3 pb-4">
      {isManager && (
        <div className="mb-3 rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">État des propositions</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {isOpen ? '● Ouvert' : '● Fermé'}
            </span>
          </div>

          {isOpen ? (
            <button
              onClick={closeSession}
              disabled={busy}
              className="w-full rounded-xl bg-red-600 py-3 font-semibold text-white disabled:opacity-60"
            >
              {busy ? '…' : 'Fermer la session en cours'}
            </button>
          ) : (
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Motif / thème de la session *
                </span>
                <input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[15px] focus:border-navy focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Ouvert jusqu'au (optionnel)
                </span>
                <input
                  type="date"
                  min={todayStr()}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[15px] focus:border-navy focus:outline-none"
                />
              </label>
              <button
                onClick={openSession}
                disabled={busy}
                className="w-full rounded-xl bg-comoe py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? '…' : 'Ouvrir une session'}
              </button>
            </div>
          )}
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
      )}

      <ul className="space-y-2">
        {[...sessions]
          .sort((a, b) => b.id - a.id)
          .map((s) => {
            const cnt = requests.filter((r) => r.sessionId === s.id).length
            return (
              <li key={s.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-card">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-800">Session N°{s.id}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.closed ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {s.closed ? 'Fermée' : 'En cours'}
                  </span>
                </div>
                <div className="text-sm text-slate-500">{s.motif}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  Ouverte le {s.openDate} · {cnt} demande(s)
                </div>
                {isManager && (
                  <button
                    onClick={() => deleteSession(s)}
                    disabled={busy}
                    className="mt-2 w-full rounded-lg bg-red-50 py-2 text-sm font-semibold text-red-600 active:bg-red-100 disabled:opacity-60"
                  >
                    Supprimer
                  </button>
                )}
              </li>
            )
          })}
        {sessions.length === 0 && (
          <li className="py-10 text-center text-slate-400">Aucune session.</li>
        )}
      </ul>
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
