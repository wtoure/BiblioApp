import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { SectionPicker, type Section } from '@/components/SectionPicker'
import { useUsers, useRequests } from '@/features/requests/useRequests'
import { useLoans } from '@/features/loans/useLoans'
import { useBooks } from '@/features/catalogue/useBooks'
import { useRegistrations } from '@/features/admin/useAdmin'
import { ROLE_LABEL } from '@/lib/capabilities'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import type { User } from '@/lib/types'

const SECTIONS: Section[] = [
  { key: 'users', label: 'Utilisateurs' },
  { key: 'registrations', label: 'Inscriptions' },
  { key: 'stats', label: 'Statistiques' },
]

export function Admin() {
  const [section, setSection] = useState('users')
  return (
    <div>
      <PageHeader title="Administration" />
      <SectionPicker sections={SECTIONS} value={section} onChange={setSection} />
      {section === 'users' && <UsersSection />}
      {section === 'registrations' && <RegistrationsSection />}
      {section === 'stats' && <StatsSection />}
    </div>
  )
}

function UsersSection() {
  const qc = useQueryClient()
  const { data: users, isLoading } = useUsers()
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    let l = [...(users ?? [])].sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'))
    const t = q.trim().toLowerCase()
    if (t) l = l.filter((u) => `${u.prenom} ${u.nom} ${u.abbrev}`.toLowerCase().includes(t))
    return l
  }, [users, q])

  // Écriture (à relire) — activer/désactiver un compte (cf. togUser app.js)
  async function toggle(u: User) {
    const { error } = await supabase
      .from('users')
      .update({ disabled: !u.disabled })
      .eq('id', u.id)
      .eq('space_code', SPACE_ID)
    if (error) return alert('Erreur : ' + error.message)
    qc.invalidateQueries({ queryKey: ['users', SPACE_ID] })
  }

  return (
    <div className="px-3 pt-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un membre…"
        className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] shadow-card focus:border-navy focus:outline-none"
      />
      {isLoading && <p className="py-10 text-center text-slate-400">Chargement…</p>}
      <ul className="space-y-2 pb-4">
        {list.map((u) => (
          <li
            key={u.id}
            className={`rounded-xl border border-slate-100 bg-white p-3 shadow-card ${u.disabled ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-800">
                  {u.prenom} {u.nom}
                </div>
                <div className="text-xs text-slate-400">
                  {ROLE_LABEL[u.role] ?? u.role} · {u.abbrev}
                </div>
              </div>
              <button
                onClick={() => toggle(u)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  u.disabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {u.disabled ? 'Activer' : 'Désactiver'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RegistrationsSection() {
  const { data: regs, isLoading } = useRegistrations()
  const list = useMemo(
    () => [...(regs ?? [])].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')),
    [regs],
  )
  return (
    <div className="px-3 pt-3">
      {isLoading && <p className="py-10 text-center text-slate-400">Chargement…</p>}
      <ul className="space-y-2 pb-4">
        {list.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-card">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-800">
                {r.prenom} {r.nom}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  r.status === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : r.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {r.status === 'approved' ? 'Validée' : r.status === 'rejected' ? 'Rejetée' : 'En attente'}
              </span>
            </div>
            <div className="mt-0.5 text-sm text-slate-500">
              {r.whatsapp} · {r.commune}
              {r.profession ? ` · ${r.profession}` : ''}
            </div>
          </li>
        ))}
        {!isLoading && list.length === 0 && (
          <li className="py-10 text-center text-slate-400">Aucune inscription.</li>
        )}
      </ul>
      <p className="pb-6 text-center text-xs text-slate-400">
        La validation d'une inscription (création de compte) sera ajoutée après relecture.
      </p>
    </div>
  )
}

function StatsSection() {
  const { data: books } = useBooks()
  const { data: users } = useUsers()
  const { data: loans } = useLoans()
  const { data: requests } = useRequests()

  const stats = [
    { label: 'Livres', value: books?.length ?? 0 },
    { label: 'Membres actifs', value: (users ?? []).filter((u) => !u.disabled).length },
    { label: 'Emprunts en cours', value: (loans ?? []).filter((l) => l.status === 'active').length },
    { label: 'Emprunts à valider', value: (loans ?? []).filter((l) => l.status === 'pending').length },
    { label: 'Demandes en attente', value: (requests ?? []).filter((r) => r.status === 'pending').length },
    { label: 'Demandes totales', value: requests?.length ?? 0 },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 px-3 pt-3 pb-6">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl bg-white p-4 shadow-card">
          <div className="text-3xl font-bold text-navy">{s.value}</div>
          <div className="mt-1 text-sm text-slate-500">{s.label}</div>
        </div>
      ))}
    </div>
  )
}
