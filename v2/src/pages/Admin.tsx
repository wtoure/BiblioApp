import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { SectionPicker, type Section } from '@/components/SectionPicker'
import { useUsers, useRequests } from '@/features/requests/useRequests'
import { useLoans } from '@/features/loans/useLoans'
import { useBooks } from '@/features/catalogue/useBooks'
import { useRegistrations } from '@/features/admin/useAdmin'
import { useShelfChecks } from '@/features/admin/useShelfChecks'
import { useConfig } from '@/features/config/useConfig'
import { ROLE_LABEL } from '@/lib/capabilities'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import type { CatType, Registration, Role, SpaceConfig, User } from '@/lib/types'

const SECTIONS: Section[] = [
  { key: 'users', label: 'Utilisateurs' },
  { key: 'registrations', label: 'Inscriptions' },
  { key: 'etageres', label: 'Étagères' },
  { key: 'parametres', label: 'Paramètres' },
  { key: 'stats', label: 'Stats' },
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
      {section === 'etageres' && <EtageresAdminSection />}
      {section === 'parametres' && <ParametresSection />}
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

/* ─── Étagères admin : vue de toutes les étagères + dernier contrôle ─── */
function EtageresAdminSection() {
  const { data: books } = useBooks()
  const { data: checks } = useShelfChecks()

  const shelves = useMemo(() => {
    const map = new Map<string, { salle: string; placard: string; etagere: string; count: number; missing: number }>()
    for (const b of books ?? []) {
      const key = `${b.salle}|${b.placard}|${b.etagere}`
      if (!map.has(key)) map.set(key, { salle: b.salle, placard: b.placard, etagere: b.etagere, count: 0, missing: 0 })
      const e = map.get(key)!
      e.count++
      if (b.status === 'missing') e.missing++
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => `${a.salle}${a.placard}${a.etagere}`.localeCompare(`${b.salle}${b.placard}${b.etagere}`))
  }, [books])

  const lastCheckMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of checks ?? []) {
      if (!m[c.shelfKey] || c.checkedAt > m[c.shelfKey]) m[c.shelfKey] = c.checkedAt
    }
    return m
  }, [checks])

  if (!shelves.length) {
    return <p className="py-10 text-center text-slate-400 text-sm">Aucune étagère définie.</p>
  }

  const today = new Date().toISOString().split('T')[0]
  const week = new Date(Date.now() - 7 * 86400000).toISOString()

  return (
    <div className="px-3 py-3 space-y-2 pb-10">
      {shelves.map(({ key, salle, placard, etagere, count, missing }) => {
        const last = lastCheckMap[key]
        const checkedToday = !!last?.startsWith(today)
        const checkedRecently = !!last && last > week
        const icon = checkedToday ? '✅' : missing > 0 ? '⚠️' : checkedRecently ? '📚' : '⏳'
        const lastLabel = last
          ? new Date(last).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
          : 'Jamais'
        return (
          <div key={key} className={`flex items-center gap-3 rounded-xl border bg-white p-3 shadow-card ${
            missing > 0 ? 'border-red-200' : 'border-slate-100'
          }`}>
            <div className="text-2xl w-8 text-center shrink-0">{icon}</div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-800 text-sm">{salle} · {placard} · {etagere}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {count} livre(s)
                {missing > 0 && <span className="ml-1 text-red-600 font-semibold">· {missing} manquant(s)</span>}
              </div>
            </div>
            <div className="text-xs text-slate-400 shrink-0 text-right">
              <div>Ctrl.</div>
              <div>{lastLabel}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Paramètres espace ─── */
const ROLES_WITH_ACCESS: Role[] = ['member', 'resident', 'commission', 'enrol', 'admin']
const CAT_TYPES: { key: CatType; label: string }[] = [
  { key: 'academique', label: '📚 Académique' },
  { key: 'spirituel', label: '✝️ Spirituel' },
]

function ParametresSection() {
  const qc = useQueryClient()
  const { data: cfg, isLoading } = useConfig()
  const [form, setForm] = useState<Partial<SpaceConfig>>({})
  const [catAccess, setCatAccess] = useState<Record<Role, CatType[]> | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Initialiser le formulaire quand cfg charge
  const effective = { ...cfg, ...form }
  const effectiveCatAccess: Record<Role, CatType[]> =
    catAccess ?? (cfg?.catAccess as Record<Role, CatType[]> | undefined) ?? ({} as Record<Role, CatType[]>)

  function setField(field: keyof SpaceConfig) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  function toggleCat(role: Role, cat: CatType) {
    setCatAccess((prev) => {
      const base = prev ?? (cfg?.catAccess as Record<Role, CatType[]> | undefined) ?? ({} as Record<Role, CatType[]>)
      const current = base[role] ?? []
      const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat]
      return { ...base, [role]: next }
    })
  }

  async function save() {
    setBusy(true)
    setDone(false)
    const patch: Record<string, unknown> = {
      contact: effective.contact ?? null,
      contactName: effective.contactName ?? null,
      meetingPlace: effective.meetingPlace ?? null,
      meetingTime: effective.meetingTime ?? null,
      countryCode: effective.countryCode ?? '+225',
      shortLink: effective.shortLink ?? null,
      loanOpen: effective.loanOpen ?? false,
      catAccess: effectiveCatAccess,
    }
    const { error } = await supabase
      .from('space_config')
      .update(patch)
      .eq('space_code', SPACE_ID)
    if (error) {
      alert('Erreur : ' + error.message)
    } else {
      qc.invalidateQueries({ queryKey: ['config', SPACE_ID] })
      setDone(true)
    }
    setBusy(false)
  }

  if (isLoading) return <p className="py-10 text-center text-slate-400">Chargement…</p>

  return (
    <div className="px-4 py-4 space-y-4 pb-12">
      {done && (
        <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          ✅ Paramètres enregistrés.
        </div>
      )}

      {/* Contact */}
      <div className="rounded-2xl bg-white p-4 shadow-card space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Contact</h3>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Nom du contact</span>
          <input value={effective.contactName ?? ''} onChange={setField('contactName')}
            className="field-input" placeholder="ex. Jean Kouadio" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Téléphone</span>
          <input value={effective.contact ?? ''} onChange={setField('contact')}
            className="field-input" placeholder="ex. +22507XXXXXXXX" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Indicatif pays</span>
          <input value={effective.countryCode ?? '+225'} onChange={setField('countryCode')}
            className="field-input" placeholder="+225" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Lien court (partage)</span>
          <input value={effective.shortLink ?? ''} onChange={setField('shortLink')}
            className="field-input" placeholder="ex. comoe.link/biblio" />
        </label>
      </div>

      {/* Réunion */}
      <div className="rounded-2xl bg-white p-4 shadow-card space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Réunion</h3>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Lieu</span>
          <input value={effective.meetingPlace ?? ''} onChange={setField('meetingPlace')}
            className="field-input" placeholder="ex. Salle polyvalente" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Horaire</span>
          <input value={effective.meetingTime ?? ''} onChange={setField('meetingTime')}
            className="field-input" placeholder="ex. Sam. 9h-11h" />
        </label>
      </div>

      {/* Prêts ouverts */}
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Prêts</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={effective.loanOpen ?? false}
              onChange={(e) => setForm((prev) => ({ ...prev, loanOpen: e.target.checked }))}
              className="sr-only"
            />
            <div className={`w-11 h-6 rounded-full transition-colors ${effective.loanOpen ? 'bg-navy' : 'bg-slate-200'}`} />
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${effective.loanOpen ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm font-medium text-slate-700">Prêts ouverts (membres peuvent emprunter)</span>
        </label>
      </div>

      {/* Accès catalogue par rôle */}
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Accès catalogue par rôle</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="pb-2 text-left text-xs font-medium text-slate-400 w-24">Rôle</th>
                {CAT_TYPES.map((ct) => (
                  <th key={ct.key} className="pb-2 text-center text-xs font-medium text-slate-400">{ct.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ROLES_WITH_ACCESS.map((role) => (
                <tr key={role}>
                  <td className="py-2 text-slate-700 font-medium">{ROLE_LABEL[role] ?? role}</td>
                  {CAT_TYPES.map((ct) => {
                    const hasAccess = (effectiveCatAccess[role] ?? []).includes(ct.key)
                    return (
                      <td key={ct.key} className="py-2 text-center">
                        <button
                          onClick={() => toggleCat(role, ct.key)}
                          className={`w-6 h-6 rounded-md text-sm font-bold transition-colors ${
                            hasAccess ? 'bg-navy text-white' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {hasAccess ? '✓' : '○'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="w-full rounded-xl bg-comoe py-3.5 font-semibold text-white shadow-soft disabled:opacity-60"
      >
        {busy ? 'Enregistrement…' : '💾 Enregistrer les paramètres'}
      </button>
    </div>
  )
}
