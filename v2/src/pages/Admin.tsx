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
import { useAuth } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/capabilities'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import { inviteMember } from '@/lib/invite'
import type { CatType, Registration, Role, SpaceConfig, User } from '@/lib/types'

// Rôles assignables à l'édition (inclut admin, contrairement à la validation d'inscription).
const EDIT_ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'member', label: 'Membre' },
  { value: 'resident', label: 'Résident' },
  { value: 'commission', label: 'Commission' },
  { value: 'enrol', label: 'Enrôleur' },
  { value: 'validator', label: 'Validateur' },
  { value: 'admin', label: 'Administrateur' },
]

// Onglets/droits délégables (cf. tabKeys desktop) — sans objet pour les admins.
const TAB_OPTIONS: { key: string; label: string }[] = [
  { key: 'loans_validator', label: 'Valider les emprunts' },
  { key: 'stats', label: 'Voir les statistiques' },
  { key: 'members', label: 'Gérer les membres' },
  { key: 'shelf_mgr', label: 'Vérifier les étagères' },
]

const PERMANENT_ROLES: Role[] = ['admin', 'resident', 'commission']

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
  const [editing, setEditing] = useState<User | null>(null)

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
              <button onClick={() => setEditing(u)} className="min-w-0 flex-1 text-left">
                <div className="truncate font-semibold text-slate-800">
                  {u.prenom} {u.nom}
                </div>
                <div className="text-xs text-slate-400">
                  {ROLE_LABEL[u.role] ?? u.role} · {u.abbrev}
                  {(u.tabs?.length ?? 0) > 0 && <span className="ml-1 text-navy">· +{u.tabs!.length} droit(s)</span>}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => setEditing(u)}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Modifier
                </button>
                <button
                  onClick={() => toggle(u)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    u.disabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {u.disabled ? 'Activer' : 'Désactiver'}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <UserEditModal
          user={editing}
          allUsers={users ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['users', SPACE_ID] })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

/* ─── Édition / suppression d'un utilisateur (cf. savU / delU desktop) ─── */
function UserEditModal({
  user,
  allUsers,
  onClose,
  onSaved,
}: {
  user: User
  allUsers: User[]
  onClose: () => void
  onSaved: () => void
}) {
  const { user: curUser } = useAuth()
  const { data: loans } = useLoans()
  const [prenom, setPrenom] = useState(user.prenom)
  const [nom, setNom] = useState(user.nom)
  const [abbrev, setAbbrev] = useState(user.abbrev)
  const [role, setRole] = useState<Role>(user.role)
  const [canPropose, setCanPropose] = useState(user.canPropose !== false)
  const [canLoan, setCanLoan] = useState(!!user.canLoan)
  const [tabs, setTabs] = useState<string[]>(user.tabs ?? [])
  const [neverExpires, setNeverExpires] = useState(PERMANENT_ROLES.includes(user.role) || !!user.neverExpires)
  const [expiresAt, setExpiresAt] = useState<string>(user.expiresAt ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const hasAuth = !!user.auth_id

  const isPermanent = PERMANENT_ROLES.includes(role)
  const adminCount = allUsers.filter((u) => u.role === 'admin').length
  const isLastAdmin = user.role === 'admin' && adminCount <= 1
  const isSelf = curUser?.id === user.id

  function toggleTab(key: string) {
    setTabs((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  async function save() {
    const ab = abbrev.trim().toLowerCase()
    if (!prenom.trim() || !nom.trim() || !ab) {
      setErr('Prénom, nom et code sont obligatoires.')
      return
    }
    if (allUsers.some((u) => u.abbrev === ab && u.id !== user.id)) {
      setErr(`Le code « ${ab} » est déjà utilisé par un autre membre.`)
      return
    }
    if (isLastAdmin && role !== 'admin') {
      setErr('Impossible de rétrograder le seul administrateur.')
      return
    }
    setBusy(true)
    setErr('')
    const patch: Record<string, unknown> = {
      prenom: prenom.trim(),
      nom: nom.trim(),
      abbrev: ab,
      role,
      canPropose,
      canLoan,
      tabs: role === 'admin' ? [] : tabs,
      neverExpires: isPermanent || neverExpires,
      expiresAt: isPermanent || neverExpires ? null : expiresAt || null,
      email: email.trim().toLowerCase() || null,
    }
    const { error } = await supabase.from('users').update(patch).eq('id', user.id).eq('space_code', SPACE_ID)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
  }

  async function remove() {
    if (isSelf) {
      setErr('Vous ne pouvez pas supprimer votre propre compte.')
      return
    }
    if (isLastAdmin) {
      setErr('Impossible de supprimer le seul administrateur.')
      return
    }
    const activeLoans = (loans ?? []).filter(
      (l) => l.userId === user.id && (l.status === 'active' || l.status === 'pending' || l.status === 'pending_return'),
    )
    if (activeLoans.length > 0) {
      setErr(
        `Ce membre a ${activeLoans.length} emprunt(s) en cours. Clôturez-les (onglet Emprunts) avant de supprimer le compte.`,
      )
      return
    }
    if (!window.confirm(`Supprimer définitivement « ${user.prenom} ${user.nom} » ?\nCette action est irréversible.`))
      return
    setBusy(true)
    setErr('')
    try {
      // Archive dans deleted_users (cf. delU desktop) puis suppression.
      const archived = {
        space_code: SPACE_ID,
        origId: user.id,
        abbrev: user.abbrev,
        prenom: user.prenom,
        nom: user.nom,
        role: user.role,
        deletedAt: new Date().toLocaleDateString('fr-FR'),
        deletedBy: curUser ? `${curUser.prenom} ${curUser.nom}` : '?',
        snapshot: user,
      }
      const { error: aErr } = await supabase.from('deleted_users').insert(archived)
      if (aErr) throw new Error(aErr.message)
      const { error: dErr } = await supabase.from('users').delete().eq('id', user.id).eq('space_code', SPACE_ID)
      if (dErr) throw new Error(dErr.message)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  // (Ré)envoyer l'invitation : enregistre l'e-mail puis appelle l'Edge Function.
  async function sendInvite() {
    const em = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      setErr('Saisissez un e-mail valide avant d’inviter.')
      return
    }
    setBusy(true)
    setErr('')
    setOkMsg('')
    try {
      const { error } = await supabase.from('users').update({ email: em }).eq('id', user.id).eq('space_code', SPACE_ID)
      if (error) throw new Error(error.message)
      const res = await inviteMember(user.id, em)
      if (!res.ok) {
        setErr('Invitation : ' + res.error)
      } else {
        setOkMsg(
          res.alreadyExisted
            ? '✅ Compte existant relié — e-mail de réinitialisation envoyé.'
            : '✅ Invitation envoyée à ' + em,
        )
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center"
    >
      <div className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between rounded-t-2xl bg-navy px-5 py-4 text-white">
          <div className="font-bold">Modifier le membre</div>
          <button onClick={onClose} className="text-white/80">✕</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <ModalField label="Prénom *" value={prenom} onChange={setPrenom} />
          <ModalField label="Nom *" value={nom} onChange={setNom} />
          <ModalField label="Code de connexion *" value={abbrev} onChange={setAbbrev} />

          <div className="rounded-xl border border-slate-100 p-3">
            <ModalField label="E-mail (connexion)" value={email} onChange={setEmail} />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={`text-xs font-medium ${hasAuth ? 'text-green-600' : 'text-amber-600'}`}>
                {hasAuth ? '● Compte activé' : '○ Pas encore invité'}
              </span>
              <button
                type="button"
                onClick={sendInvite}
                disabled={busy}
                className="rounded-lg bg-comoe/10 px-3 py-1.5 text-xs font-semibold text-comoe disabled:opacity-50"
              >
                {hasAuth ? '✉️ Renvoyer l’invitation' : '✉️ Inviter'}
              </button>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Rôle</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="field-input"
            >
              {EDIT_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <Toggle label="Peut proposer des livres" checked={canPropose} onChange={setCanPropose} />
          <Toggle label="Peut emprunter" checked={canLoan} onChange={setCanLoan} />

          {role !== 'admin' && (
            <div className="rounded-xl border border-slate-100 p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Droits délégués</div>
              <div className="space-y-1.5">
                {TAB_OPTIONS.map((t) => (
                  <label key={t.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={tabs.includes(t.key)}
                      onChange={() => toggleTab(t.key)}
                      className="h-4 w-4 rounded border-slate-300 text-navy focus:ring-navy"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {!isPermanent && (
            <div className="rounded-xl border border-slate-100 p-3">
              <Toggle label="N'expire jamais" checked={neverExpires} onChange={setNeverExpires} />
              {!neverExpires && (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Expire le</span>
                  <input
                    type="date"
                    value={expiresAt ?? ''}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="field-input"
                  />
                </label>
              )}
            </div>
          )}
          {isPermanent && (
            <p className="text-xs text-slate-400">Les rôles admin/résident/commission n'expirent jamais.</p>
          )}

          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
          {okMsg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{okMsg}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={remove}
            disabled={busy || isSelf || isLastAdmin}
            className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 disabled:opacity-40"
          >
            🗑 Supprimer
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-xl bg-comoe py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="field-input" />
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div className="relative">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <div className={`h-6 w-11 rounded-full transition-colors ${checked ? 'bg-navy' : 'bg-slate-200'}`} />
        <div
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </label>
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
    const email = (r.email || '').trim().toLowerCase()
    if (!email) {
      alert(
        `Cette demande n'a pas d'e-mail. L'e-mail est désormais nécessaire pour créer le compte (connexion par e-mail + mot de passe).\n\nLe compte sera créé, mais vous devrez saisir son e-mail dans « Membres » puis cliquer « Inviter ».`,
      )
    }
    if (
      !window.confirm(
        `Créer le compte de ${r.prenom} ${r.nom} ?\n\nRôle : ${ROLE_LABEL[role] ?? role}\nCode : ${abbrev}\n${email ? `Une invitation sera envoyée à ${email} pour définir le mot de passe.` : '⚠️ Sans e-mail, le membre ne pourra pas se connecter tant qu\'il ne sera pas invité.'}`,
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
        email: email || null,
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

      // 4. Inviter le compte d'authentification (email d'invitation → set-password)
      if (email) {
        const res = await inviteMember(newId, email)
        if (res.ok) {
          alert(
            `✅ Compte créé et invitation envoyée !\n\n${r.prenom} ${r.nom}\nCode : ${abbrev}\nE-mail : ${email}\n\nLe membre reçoit un lien pour définir son mot de passe.`,
          )
        } else {
          alert(
            `✅ Compte créé (code : ${abbrev}), mais l'invitation a échoué :\n${res.error}\n\nVous pourrez réessayer via « Inviter » dans la fiche du membre.`,
          )
        }
      } else {
        alert(`✅ Compte créé (code : ${abbrev}).\n\n⚠️ Sans e-mail : saisissez son e-mail dans « Membres » puis cliquez « Inviter ».`)
      }
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
      featuredDays: Math.max(0, Number(effective.featuredDays) || 0),
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

      {/* Catalogue */}
      <div className="rounded-2xl bg-white p-4 shadow-card space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Catalogue</h3>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            ⭐ Durée d'affichage des livres mis en avant (jours)
          </span>
          <input
            type="number"
            min={0}
            value={effective.featuredDays ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, featuredDays: e.target.value === '' ? 0 : Number(e.target.value) }))}
            className="field-input"
            placeholder="0 = illimité"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            Un livre mis en avant reste en tête du catalogue pendant ce nombre de jours après son ajout. 0 (ou vide) = toujours.
          </span>
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
