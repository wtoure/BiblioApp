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
import type { Registration, Role, User } from '@/lib/types'

const SECTIONS: Section[] = [
  { key: 'users', label: 'Utilisateurs' },
  { key: 'registrations', label: 'Inscriptions' },
  { key: 'stats', label: 'Statistiques' },
]

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'member', label: 'Membre' },
  { value: 'resident', label: 'Résident' },
  { value: 'commission', label: 'Commission' },
  { value: 'enrol', label: 'Enrôleur' },
  { value: 'validator', label: 'Validateur' },
]

// Miroir de _genAbbrev (app.js) : 3 chars prénom + 2 chars nom, anti-collision
function genAbbrev(prenom: string, nom: string, existingUsers: User[]): string {
  let base = (prenom.substring(0, 3) + nom.substring(0, 2)).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (base.length < 3) base = (base + 'usr').substring(0, 4)
  let code = base
  let i = 1
  while (existingUsers.some((u) => u.abbrev === code)) {
    code = base + i
    i++
  }
  return code
}

// Miroir de calcExpiresAt (app.js) : fin d'année courante (janv–sept) ou suivante (oct–déc)
function calcExpiresAt(): string {
  const d = new Date()
  const year = d.getFullYear()
  return d.getMonth() < 9 ? `${year}-12-31` : `${year + 1}-12-31`
}

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
  const qc = useQueryClient()
  const { data: regs, isLoading } = useRegistrations()
  const { data: users } = useUsers()
  const [roles, setRoles] = useState<Record<string, Role>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const list = useMemo(
    () => [...(regs ?? [])].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')),
    [regs],
  )

  function getRoleFor(id: string): Role {
    return roles[id] ?? 'member'
  }

  // Écriture — valider une inscription → création de compte (cf. approveRegistration app.js)
  async function approve(r: Registration) {
    const role = getRoleFor(r.id)
    const abbrev = genAbbrev(r.prenom, r.nom, users ?? [])
    if (
      !window.confirm(
        `Créer le compte de ${r.prenom} ${r.nom} ?\n\nRôle : ${ROLE_LABEL[role] ?? role}\nCode de connexion : ${abbrev}\n\nLe membre utilisera ce code pour se connecter.`,
      )
    )
      return
    setBusy(r.id)
    try {
      // Lire le compteur frais depuis Supabase (anti-collision entre sessions) — cf. approveRegistration desktop
      const { data: ctr } = await supabase
        .from('space_counters')
        .select('nxU')
        .eq('space_code', SPACE_ID)
        .maybeSingle()
      const freshNxU = (ctr?.nxU as number | undefined) ?? 1
      const maxExisting = (users ?? []).reduce((m, u) => Math.max(m, u.id), 0)
      const newId = Math.max(freshNxU, maxExisting + 1)

      // 1. Réserver l'ID en sauvegardant le compteur EN PREMIER
      const { error: cErr } = await supabase
        .from('space_counters')
        .upsert({ space_code: SPACE_ID, nxU: newId + 1 })
      if (cErr) throw new Error(cErr.message)

      // 2. Créer l'utilisateur
      const neverExp = ['resident', 'commission', 'admin'].includes(role)
      const nu = {
        id: newId,
        space_code: SPACE_ID,
        abbrev,
        prenom: r.prenom,
        nom: r.nom,
        role,
        canPropose: true,
        canLoan: false,
        propUntil: null,
        disabled: false,
        expiresAt: neverExp ? null : calcExpiresAt(),
        neverExpires: neverExp,
        whatsapp: r.whatsapp || '',
        commune: r.commune || '',
        profession: r.profession || '',
        email: r.email || '',
        tabs: [],
        createdAt: new Date().toISOString(),
      }
      const { error: uErr } = await supabase.from('users').insert(nu)
      if (uErr) throw new Error(uErr.message)

      // 3. Marquer l'inscription comme approuvée
      const processedAt = new Date().toISOString()
      const { error: rErr } = await supabase
        .from('registrations')
        .update({ status: 'approved', assignedRole: role, createdAbbrev: abbrev, createdUserId: newId, processedAt })
        .eq('id', r.id)
        .eq('space_code', SPACE_ID)
      if (rErr) throw new Error(rErr.message)

      qc.invalidateQueries({ queryKey: ['registrations', SPACE_ID] })
      qc.invalidateQueries({ queryKey: ['users', SPACE_ID] })
      alert(`✅ Compte créé !\n\n${r.prenom} ${r.nom}\nRôle : ${ROLE_LABEL[role] ?? role}\nCode de connexion : ${abbrev}`)
    } catch (e) {
      alert('❌ Erreur : ' + (e instanceof Error ? e.message : String(e)) + '\n\nAucun compte n\'a été créé.')
    } finally {
      setBusy(null)
    }
  }

  async function reject(r: Registration) {
    if (!window.confirm(`Rejeter l'inscription de ${r.prenom} ${r.nom} ?`)) return
    setBusy(r.id)
    try {
      const { error } = await supabase
        .from('registrations')
        .update({ status: 'rejected', processedAt: new Date().toISOString() })
        .eq('id', r.id)
        .eq('space_code', SPACE_ID)
      if (error) throw new Error(error.message)
      qc.invalidateQueries({ queryKey: ['registrations', SPACE_ID] })
    } catch (e) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(null)
    }
  }

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
            {r.status === 'approved' && r.createdAbbrev && (
              <div className="mt-1 text-xs font-medium text-green-700">
                Code : {r.createdAbbrev} · {ROLE_LABEL[r.assignedRole as Role] ?? r.assignedRole}
              </div>
            )}
            {r.status === 'pending' && (
              <div className="mt-2 space-y-2">
                <select
                  value={getRoleFor(r.id)}
                  onChange={(e) => setRoles((prev) => ({ ...prev, [r.id]: e.target.value as Role }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[15px] focus:border-navy focus:outline-none"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(r)}
                    disabled={busy === r.id}
                    className="flex-1 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy === r.id ? '…' : '✅ Valider'}
                  </button>
                  <button
                    onClick={() => reject(r)}
                    disabled={busy === r.id}
                    className="flex-1 rounded-xl bg-red-50 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                  >
                    Rejeter
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {!isLoading && list.length === 0 && (
          <li className="py-10 text-center text-slate-400">Aucune inscription.</li>
        )}
      </ul>
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
